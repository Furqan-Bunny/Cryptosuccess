/**
 * Register (or refresh) the Telegram webhook so Telegram delivers updates to our
 * app, and publish the command menu. Run AFTER deploying to a public URL (or exposing localhost via a tunnel).
 *
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... NEXT_PUBLIC_APP_URL=https://your-app \
 *     npx tsx scripts/set-telegram-webhook.ts
 *
 * The webhook URL is <NEXT_PUBLIC_APP_URL>/api/telegram/webhook and Telegram will
 * echo TELEGRAM_WEBHOOK_SECRET back in the x-telegram-bot-api-secret-token header,
 * which the route verifies.
 */
import { setWebhook, setMyCommands } from '../src/lib/telegram/api';

async function main() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  if (!secret) throw new Error('TELEGRAM_WEBHOOK_SECRET is not set');
  if (!appUrl || !/^https?:\/\//.test(appUrl)) {
    throw new Error('NEXT_PUBLIC_APP_URL must be a public http(s) URL Telegram can reach');
  }

  const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/telegram/webhook`;
  await setWebhook(webhookUrl, secret);
  await setMyCommands();
  console.log(`✅ Telegram webhook set → ${webhookUrl} (command menu updated)`);
}

main().catch(err => {
  console.error('❌ Failed to set webhook:', err.message ?? err);
  process.exit(1);
});
