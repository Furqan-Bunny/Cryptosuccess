import { NextRequest, NextResponse } from 'next/server';
import { secretsMatch } from '@/lib/telegram/api';

// One-shot, self-service webhook registration for the DEPLOYED bot. After
// deploying to Vercel (with TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET set),
// open this URL ONCE in a browser:
//
//   https://<your-app>.vercel.app/api/telegram/setup?key=<TELEGRAM_WEBHOOK_SECRET>
//
// It points Telegram at THIS deployment's /api/telegram/webhook (URL derived from
// the request, so it's always correct) and sets the command menu. Guarded by the
// webhook secret so randoms can't hijack the bot's webhook.
export const dynamic = 'force-dynamic';

function baseUrl(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && !/localhost/.test(env)) return env.replace(/\/$/, '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  return host ? `${proto}://${host}` : (env || 'http://localhost:3000');
}

const COMMANDS = [
  { command: 'start', description: 'Intro & how the honest coach works' },
  { command: 'signal', description: 'Honest read on a coin, e.g. /signal BTC' },
  { command: 'verify', description: 'Our provable on-chain track record' },
  { command: 'link', description: 'Connect your CryptoSuccess account' },
  { command: 'subscribe', description: 'Go Pro (unlimited signals)' },
  { command: 'help', description: 'All commands' },
];

export async function GET(request: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) {
    return NextResponse.json(
      { ok: false, error: 'Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in the environment, then redeploy.' },
      { status: 503 },
    );
  }

  // Guard: caller must know the webhook secret.
  const key = new URL(request.url).searchParams.get('key');
  if (!secretsMatch(key, secret)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized. Append ?key=<TELEGRAM_WEBHOOK_SECRET> to this URL.' },
      { status: 401 },
    );
  }

  const call = (method: string, body: Record<string, unknown>) =>
    fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());

  const webhookUrl = `${baseUrl(request)}/api/telegram/webhook`;

  try {
    const setWebhook = await call('setWebhook', {
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ['message'],
      drop_pending_updates: true,
    });
    await call('setMyCommands', { commands: COMMANDS });
    const info = await call('getWebhookInfo', {});
    const me = await call('getMe', {});

    return NextResponse.json({
      ok: !!setWebhook.ok,
      message: setWebhook.ok
        ? `✅ Bot is live. Open Telegram and message @${me?.result?.username ?? 'your bot'} — send /start.`
        : '❌ setWebhook failed — see details.',
      webhookUrl,
      bot: me?.result?.username ? `@${me.result.username}` : undefined,
      setWebhook,
      webhookInfo: info?.result,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'setup failed' }, { status: 502 });
  }
}
