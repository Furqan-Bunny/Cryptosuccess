import { NextRequest, NextResponse } from 'next/server';
import { secretsMatch, setWebhook, setMyCommands, getWebhookInfo, getMe } from '@/lib/telegram/api';
import { resolveBaseUrl } from '@/lib/telegram/env';

// One-shot, self-service webhook registration for the DEPLOYED bot. After
// deploying to Vercel (with TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET set),
// open this URL ONCE in a browser:
//
//   https://<your-app>.vercel.app/api/telegram/setup?key=<TELEGRAM_WEBHOOK_SECRET>
//
// It points Telegram at THIS deployment's /api/telegram/webhook (URL derived from
// the request, so it's always correct) and sets the command menu from the shared
// command catalogue (services/bot/commands.ts). Guarded by the webhook secret so
// randoms can't hijack the bot's webhook. Re-run it after adding commands.
export const dynamic = 'force-dynamic';

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

  const webhookUrl = `${resolveBaseUrl(request.headers)}/api/telegram/webhook`;

  try {
    await setWebhook(webhookUrl, secret);
    await setMyCommands();
    const info = await getWebhookInfo();
    const me = await getMe();

    return NextResponse.json({
      ok: true,
      message: `✅ Bot is live. Open Telegram and message @${me?.username ?? 'your bot'} — send /start.`,
      webhookUrl,
      bot: me?.username ? `@${me.username}` : undefined,
      // Diagnostics only — never echo the token or secret.
      webhookInfo: info ? { url: info.url, pending_update_count: info.pending_update_count, last_error_message: info.last_error_message } : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'setup failed' }, { status: 502 });
  }
}
