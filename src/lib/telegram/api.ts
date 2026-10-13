// Minimal Telegram Bot API client (server-only). Uses plain `fetch` — no SDK.
// The bot token is a secret and must never be exposed to the browser.
import { timingSafeEqual } from 'crypto';

const API_BASE = 'https://api.telegram.org';

/** Constant-time comparison of a caller-supplied secret against the expected one. */
export function secretsMatch(provided: string | null | undefined, expected: string): boolean {
  const a = Buffer.from(provided ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function getBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

/** Is the bot configured enough to talk to Telegram? */
export function isTelegramConfigured(): boolean {
  return !!getBotToken();
}

async function callTelegram(method: string, body: Record<string, unknown>): Promise<any> {
  const token = getBotToken();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(`Telegram ${method} failed: HTTP ${res.status} ${JSON.stringify(json)}`);
  }
  return json.result;
}

/**
 * Send a text message. Defaults to plain text (no parse_mode) so message content
 * never needs Markdown/HTML escaping — the honest-coach formatter emits ready-to-
 * read plain text. Splits messages over Telegram's 4096-char limit.
 */
export async function sendMessage(
  chatId: number | string,
  text: string,
  opts: { disableWebPagePreview?: boolean } = {},
): Promise<void> {
  const chunks = splitForTelegram(text);
  for (const chunk of chunks) {
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: opts.disableWebPagePreview ?? true,
    });
  }
}

/** Register the webhook URL + secret token with Telegram. Used by the setup script. */
export async function setWebhook(url: string, secretToken: string): Promise<void> {
  await callTelegram('setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  });
}

const TELEGRAM_MAX = 4096;

/** Split long text into <=4096-char chunks, preferring to break on newlines. */
export function splitForTelegram(text: string): string[] {
  if (text.length <= TELEGRAM_MAX) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > TELEGRAM_MAX) {
    let cut = remaining.lastIndexOf('\n', TELEGRAM_MAX);
    if (cut <= 0) cut = TELEGRAM_MAX;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n/, '');
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
