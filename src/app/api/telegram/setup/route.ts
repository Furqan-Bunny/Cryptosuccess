import { NextRequest, NextResponse } from 'next/server';
import { secretsMatch, setWebhook, setMyCommands, getWebhookInfo, getMe } from '@/lib/telegram/api';
import { resolveBaseUrl } from '@/lib/telegram/env';
import { reportError } from '@/lib/server/report-error';

// One-shot webhook registration for the DEPLOYED bot. After deploying (with
// TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET set), call it ONCE:
//
//   curl -X POST https://<your-app>/api/telegram/setup \
//     -H "Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>"
//
// It points Telegram at this deployment's /api/telegram/webhook and sets the
// command menu from the shared catalogue (services/bot/commands.ts). Re-run it
// after adding commands.
//
// The secret travels in a header, never the query string (URLs end up in access
// logs and browser history). In production the webhook URL comes ONLY from
// NEXT_PUBLIC_APP_URL — never from request headers — so a forged Host header
// can't point the bot's webhook somewhere else.
export const dynamic = 'force-dynamic';

function isProduction(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

/** Public https base URL for the webhook, or null when it can't be trusted. */
function webhookBaseUrl(request: NextRequest): string | null {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (isProduction()) {
    if (!env) return null;
    try {
      const u = new URL(env);
      if (u.protocol !== 'https:' || /localhost|127\.0\.0\.1/.test(u.hostname)) return null;
      return u.origin;
    } catch {
      return null;
    }
  }
  // Local / preview: allow the request host (e.g. a tunnel) for convenience.
  return resolveBaseUrl(request.headers);
}

function bearer(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

async function handler(request: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) {
    return NextResponse.json(
      { ok: false, error: 'Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in the environment, then redeploy.' },
      { status: 503 },
    );
  }

  // Guard: caller must know the webhook secret (constant-time compare).
  if (!secretsMatch(bearer(request), secret)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized. Send Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>.' },
      { status: 401 },
    );
  }

  const base = webhookBaseUrl(request);
  if (!base) {
    return NextResponse.json(
      { ok: false, error: 'Set NEXT_PUBLIC_APP_URL to the public https URL of this deployment, then redeploy.' },
      { status: 503 },
    );
  }
  const webhookUrl = `${base}/api/telegram/webhook`;

  try {
    await setWebhook(webhookUrl, secret);
    await setMyCommands();
    const info = await getWebhookInfo();
    const me = await getMe();

    return NextResponse.json({
      ok: true,
      message: `Bot is live. Open Telegram and message @${me?.username ?? 'your bot'}, then send /start.`,
      webhookUrl,
      bot: me?.username ? `@${me.username}` : undefined,
      // Diagnostics only — never echo the token or secret.
      webhookInfo: info
        ? { url: info.url, pending_update_count: info.pending_update_count, last_error_message: info.last_error_message }
        : undefined,
    });
  } catch (e) {
    await reportError('telegram.setup', e, { route: '/api/telegram/setup' });
    return NextResponse.json({ ok: false, error: 'Telegram setup failed. Check the server logs.' }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  return handler(request);
}
