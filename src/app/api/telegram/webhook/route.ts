import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { secretsMatch } from '@/lib/telegram/api';
import { isAnalystConfigured, isSupabaseConfigured, resolveBaseUrl } from '@/lib/telegram/env';
import { rateLimit } from '@/lib/server/rate-limit';
import { generateAnalystTake } from '@/services/analyst.service';
import { handleIncoming } from '@/services/bot/core';
import { parseTelegramUpdate, telegramAdapter } from '@/services/telegram/adapter';
import { createTelegramStore } from '@/services/telegram/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // signal generation (news + reasoning) needs headroom

// Updates are tiny JSON objects; anything bigger is not a real Telegram message.
const MAX_BODY_BYTES = 64 * 1024;

// Always ACK Telegram with 200 (even on handled errors) so it doesn't retry the
// same update in a storm. Only a bad secret token is rejected outright.
const ack = () => NextResponse.json({ ok: true });

/**
 * Thin Telegram adapter: verify the secret → parse the update → hand it to the
 * channel-agnostic bot core (services/bot/core.ts) → ACK.
 */
export async function POST(request: NextRequest) {
  // 1. Verify the secret token Telegram echoes back (set via setWebhook).
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !process.env.TELEGRAM_BOT_TOKEN) {
    console.warn('Telegram webhook hit but bot not configured');
    return ack();
  }
  if (!secretsMatch(request.headers.get('x-telegram-bot-api-secret-token'), secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // 2. Parse (bounded) and extract the message we act on.
  let update: unknown;
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return ack();
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return ack();
    update = JSON.parse(raw);
  } catch {
    return ack();
  }
  const msg = parseTelegramUpdate(update);
  if (!msg) return ack();

  // 3. Wire the core's dependencies. DB/AI are optional so DB-free commands
  // (/start, /help, /verify, …) keep working before the backend is configured.
  const db = isSupabaseConfigured() ? createServiceClient() : null;
  await handleIncoming(msg, {
    adapter: telegramAdapter,
    store: db ? createTelegramStore(db) : null,
    analyst: db && isAnalystConfigured() ? symbol => generateAnalystTake(symbol, db) : null,
    limiter: rateLimit,
    baseUrl: resolveBaseUrl(request.headers),
  });

  return ack();
}
