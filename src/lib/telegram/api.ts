// Minimal Telegram Bot API client (server-only). Uses plain `fetch` — no SDK.
// The bot token is a secret and must never be exposed to the browser.
import { timingSafeEqual } from 'crypto';
import { BOT_COMMANDS } from '@/services/bot/commands';

const API_BASE = 'https://api.telegram.org';

// A 429 asking us to wait longer than this is not retried inline (crons and the
// webhook both run under a tight serverless time budget).
const MAX_INLINE_RETRY_SEC = 5;

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

/**
 * A failed Bot API call. `status` is the HTTP status (403 = the user blocked the
 * bot / never started it, 429 = flood control). The token is never included.
 */
export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly status: number,
    readonly description: string,
    readonly retryAfter: number | null,
  ) {
    super(`Telegram ${method} failed: HTTP ${status} ${description}`);
    this.name = 'TelegramApiError';
  }
}

/** True when the chat can't receive messages any more (blocked / deactivated / kicked). */
export function isChatUnreachable(e: unknown): boolean {
  return e instanceof TelegramApiError && (e.status === 403 || (e.status === 400 && /chat not found/i.test(e.description)));
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callTelegram(method: string, body: Record<string, unknown>, retried = false): Promise<any> {
  const token = getBotToken();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    const status = Number(json?.error_code ?? res.status) || res.status;
    const retryAfter = typeof json?.parameters?.retry_after === 'number' ? json.parameters.retry_after : null;
    // Flood control: honour a short retry_after once, otherwise surface it.
    if (status === 429 && !retried && retryAfter != null && retryAfter <= MAX_INLINE_RETRY_SEC) {
      await sleep(retryAfter * 1000);
      return callTelegram(method, body, true);
    }
    throw new TelegramApiError(method, status, String(json?.description ?? 'unknown error'), retryAfter);
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

/** Register the webhook URL + secret token with Telegram. */
export async function setWebhook(url: string, secretToken: string): Promise<void> {
  await callTelegram('setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  });
}

/** Publish the bot's command menu (the "/" list in Telegram clients). */
export async function setMyCommands(): Promise<void> {
  await callTelegram('setMyCommands', {
    commands: BOT_COMMANDS.map(c => ({ command: c.command, description: c.description })),
  });
}

/** Current webhook registration (for the setup route's diagnostics). */
export async function getWebhookInfo(): Promise<any> {
  return callTelegram('getWebhookInfo', {});
}

/** The bot's own identity (username for the setup confirmation). */
export async function getMe(): Promise<any> {
  return callTelegram('getMe', {});
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
