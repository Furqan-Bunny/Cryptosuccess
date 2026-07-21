import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendMessage } from '@/lib/telegram/api';
import { generateAnalystTake } from '@/services/analyst.service';
import { isSupportedCoin } from '@/lib/coins';
import {
  formatSignal, welcomeMessage, helpMessage, verifyMessage, subscribeMessage,
  linkSuccessMessage, linkHelpMessage, linkFailedMessage, limitReachedMessage,
  unsupportedCoinMessage, usageMessage, errorMessage,
} from '@/services/telegram/format';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // signal generation (news + reasoning) needs headroom

// Public base URL for links in messages (/verify, /pricing). Prefer an explicit
// NEXT_PUBLIC_APP_URL, but fall back to the deployment host from the request so
// it "just works" on Vercel without any env config.
function baseUrl(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && !/localhost/.test(env)) return env.replace(/\/$/, '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  return host ? `${proto}://${host}` : (env || 'http://localhost:3000');
}

// Is Supabase pointed at a real project (not a placeholder / example value)?
// When it isn't, DB calls would hang trying to reach a bogus host and stall the
// whole webhook response (Telegram then times out at ~60s and retries). So we
// skip all DB work in that state and DB-free commands (/start, /help, …) still work.
function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return (
    /^https:\/\/.+\.supabase\.co/.test(url) &&
    !/your-project|placeholder/.test(url) &&
    key.length > 20 &&
    !/your_|placeholder/.test(key)
  );
}

// Always ACK Telegram with 200 (even on handled errors) so it doesn't retry the
// same update in a storm. Only a bad secret token is rejected outright.
const ack = () => NextResponse.json({ ok: true });

export async function POST(request: NextRequest) {
  // 1. Verify the secret token Telegram echoes back (set via setWebhook).
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !process.env.TELEGRAM_BOT_TOKEN) {
    console.warn('Telegram webhook hit but bot not configured');
    return ack();
  }
  if (request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: any;
  try {
    update = await request.json();
  } catch {
    return ack();
  }

  const message = update?.message;
  const chatId: number | undefined = message?.chat?.id;
  const text: string = (message?.text ?? '').trim();
  const username: string | null = message?.from?.username ?? null;
  if (!chatId || !text) return ack();

  const dbReady = isSupabaseConfigured();
  const db = dbReady ? createServiceClient() : null;

  // Record the contact (best-effort — fire-and-forget so it NEVER delays the
  // reply, and only when the DB is actually reachable).
  if (db) {
    void (async () => {
      try {
        const { error } = await db.rpc('touch_telegram_user', { p_telegram_id: chatId, p_username: username });
        if (error) console.warn('touch_telegram_user failed (non-fatal):', error);
      } catch (e) {
        console.warn('touch_telegram_user failed (non-fatal):', e);
      }
    })();
  }

  const base = baseUrl(request);
  try {
    await route(text, chatId, db, base);
  } catch (e) {
    console.error('telegram handler error:', e);
    try { await sendMessage(chatId, errorMessage()); } catch {}
  }
  return ack();
}

type Db = ReturnType<typeof createServiceClient> | null;

const NOT_CONFIGURED = "⚙️ This feature isn't live yet — the signal backend (database + AI) is still being set up. Try /verify or /start for now.";

async function route(text: string, chatId: number, db: Db, base: string): Promise<void> {
  const [rawCmd, ...rest] = text.split(/\s+/);
  const cmd = rawCmd.toLowerCase().replace(/@.*$/, ''); // strip @botname suffix in groups
  const arg = rest.join(' ').trim();

  switch (cmd) {
    case '/start':
      return sendMessage(chatId, welcomeMessage(`${base}/verify`));
    case '/help':
      return sendMessage(chatId, helpMessage());
    case '/verify':
      return sendMessage(chatId, verifyMessage(`${base}/verify`));
    case '/subscribe':
      return sendMessage(chatId, subscribeMessage(`${base}/pricing`));
    case '/link':
      return handleLink(chatId, arg, db, base);
    case '/signal':
      return handleSignal(chatId, arg, db, base);
    default:
      if (cmd.startsWith('/')) return sendMessage(chatId, helpMessage());
      // Bare text with no command: treat a single token as a coin symbol.
      if (/^[a-z0-9]{2,6}$/i.test(text)) return handleSignal(chatId, text, db, base);
      return sendMessage(chatId, helpMessage());
  }
}

async function handleLink(chatId: number, arg: string, db: Db, base: string): Promise<void> {
  if (!db) return sendMessage(chatId, NOT_CONFIGURED);
  const code = arg.trim();
  if (!code) return sendMessage(chatId, linkHelpMessage(base));
  try {
    const { data, error } = await db.rpc('redeem_telegram_link', { p_telegram_id: chatId, p_code: code });
    if (error) throw error;
    if (data?.ok) return sendMessage(chatId, linkSuccessMessage());
    return sendMessage(chatId, linkFailedMessage(data?.reason ?? 'invalid'));
  } catch (e) {
    console.error('redeem_telegram_link failed:', e);
    return sendMessage(chatId, errorMessage());
  }
}

async function handleSignal(chatId: number, arg: string, db: Db, base: string): Promise<void> {
  const symbol = arg.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!symbol) return sendMessage(chatId, usageMessage());
  if (!isSupportedCoin(symbol)) return sendMessage(chatId, unsupportedCoinMessage(symbol));

  // Backend not ready (no DB to meter against, or no AI key to reason with).
  const aiReady = !!process.env.ANTHROPIC_API_KEY && !/your_key_here|sk-ant-your/.test(process.env.ANTHROPIC_API_KEY);
  if (!db || !aiReady) {
    return sendMessage(chatId, NOT_CONFIGURED);
  }

  // Enforce Free/Pro limits (fail CLOSED — never hand out a signal we can't meter).
  let remaining = -1;
  try {
    const { data: gate, error } = await db.rpc('consume_telegram_signal', { p_telegram_id: chatId });
    if (error) throw error;
    if (!gate?.allowed) return sendMessage(chatId, limitReachedMessage(`${base}/pricing`));
    remaining = typeof gate.remaining === 'number' ? gate.remaining : -1;
  } catch (e) {
    console.error('consume_telegram_signal failed (denying):', e);
    return sendMessage(chatId, errorMessage());
  }

  // Perceived latency: acknowledge before the (up-to-tens-of-seconds) generation.
  try { await sendMessage(chatId, `🧠 Reading ${symbol} across timeframes + latest news… one moment.`); } catch {}

  const result = await generateAnalystTake(symbol, db);
  if (!result) return sendMessage(chatId, errorMessage());

  return sendMessage(chatId, formatSignal({
    symbol,
    analysis: result.analysis,
    price: result.price,
    verifyUrl: `${base}/verify`,
    remaining,
  }));
}
