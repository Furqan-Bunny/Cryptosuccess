import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { isTelegramConfigured, sendMessage } from '@/lib/telegram/api';
import { isSupabaseConfigured, resolveBaseUrl } from '@/lib/telegram/env';
import { runFollowUpJob } from '@/services/telegram/followup-job';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUDGET_MS = 45_000;
const DELAY_BETWEEN_MESSAGES_MS = 350; // also keeps per-chat bursts gentle

// Accountability follow-ups (cron; suggested cadence: hourly, after
// /api/signals/evaluate). Sends each Telegram call's honest outcome once.
async function handler(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }
  if (!isTelegramConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503 });
  }

  try {
    const result = await runFollowUpJob({
      db: createServiceClient(),
      send: (chatId, text) => sendMessage(chatId, text),
      verifyUrl: `${resolveBaseUrl(request.headers)}/verify`,
      deadline: Date.now() + BUDGET_MS,
      delayMs: DELAY_BETWEEN_MESSAGES_MS,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('telegram follow-up error:', error);
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handler(request);
}
export async function POST(request: NextRequest) {
  return handler(request);
}
