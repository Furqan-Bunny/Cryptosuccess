// Server-side error reporting. One call — reportError(context, error, extra) —
// fans an error out to:
//   1. a structured single-line JSON log (picked up by Vercel log drains),
//   2. the `error_events` table (migration 0011; service role, best effort),
//   3. an optional admin Telegram alert, throttled to 1 per context per 10 min,
//   4. any extra sinks registered with registerErrorSink() (e.g. Sentry later).
//
// Contract: reportError NEVER throws and never blocks for long — every side
// effect is wrapped and time-boxed. Monitoring must not take a route down.
//
// Privacy: everything that leaves this module is scrubbed first. Request
// headers, bodies, tokens, keys, emails and the values of our own secret env
// vars are never emitted; messages and stacks are truncated. Callers should
// still pass only small, non-sensitive `extra` fields (ids, counts, symbols).
//
// Adding Sentry later: install the SDK, then (e.g. in instrumentation.ts, only
// when SENTRY_DSN is set) call
//   registerErrorSink(ev => Sentry.captureMessage(`${ev.context}: ${ev.message}`, { extra: ev.details }))
// The sink receives the already-scrubbed event, so the privacy rules hold.

import { createServiceClient } from '@/lib/supabase/server';
import { sendMessage } from '@/lib/telegram/api';

export type ErrorLevel = 'error' | 'warn';

export interface ReportErrorExtra {
  /** Route path (query string is stripped), e.g. '/api/engine/tick'. */
  route?: string;
  level?: ErrorLevel;
  /** Set false to skip the Telegram alert for this report (still logged + stored). */
  alert?: boolean;
  /** Any other small, non-sensitive diagnostic fields. Sanitized before use. */
  [key: string]: unknown;
}

export interface ErrorEvent {
  level: ErrorLevel;
  context: string;
  message: string;
  stack?: string;
  route?: string;
  ts: string;
  details: Record<string, unknown>;
}

export type ErrorSink = (event: ErrorEvent) => void | Promise<void>;

// ─────────────────────────────────────────────── Limits ─────────────────────
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_STACK_LINES = 8;
export const MAX_STACK_LENGTH = 2000;
export const MAX_DETAIL_STRING_LENGTH = 200;
export const MAX_DETAIL_KEYS = 20;
export const MAX_CONTEXT_LENGTH = 64;
export const ALERT_WINDOW_SECONDS = 10 * 60;
const SIDE_EFFECT_TIMEOUT_MS = 3000;

const REDACTED = '[redacted]';

// Server-side secrets whose literal values must never appear in output, even if
// an upstream library echoes them into an error message (e.g. a URL with a key).
const SECRET_ENV_VARS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'ANTHROPIC_API_KEY',
  'CRON_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'NOWPAYMENTS_API_KEY',
  'NOWPAYMENTS_IPN_SECRET',
  'ANCHOR_SIGNER_KEY',
  'ANCHOR_RPC_URL',
  'ZEROX_API_KEY',
  'UPSTASH_REDIS_REST_TOKEN',
  'BINANCE_API_KEY',
  'BINANCE_SECRET_KEY',
  'COINGECKO_API_KEY',
];

// Pattern-based redaction, applied after the literal secret-value pass. Order
// matters: more specific shapes first.
const SCRUB_PATTERNS: Array<[RegExp, string]> = [
  // Authorization header values: "Bearer xyz", "Basic xyz".
  [/\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/=]+/gi, `$1 ${REDACTED}`],
  // Telegram bot tokens (also as /bot<token>/ in API URLs).
  [/(?<!\d)\d{6,12}:[A-Za-z0-9_-]{30,}/g, REDACTED],
  // JWTs (Supabase access / service-role keys).
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, REDACTED],
  // Provider-prefixed keys: Stripe, Anthropic, webhook secrets, GitHub tokens.
  [/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}/g, REDACTED],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/g, REDACTED],
  [/\bwhsec_[A-Za-z0-9]{8,}/g, REDACTED],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, REDACTED],
  // 32-byte hex values (private keys; also tx hashes / roots — harmless to drop).
  [/\b0x[0-9a-fA-F]{64}\b/g, REDACTED],
  // Email addresses (PII).
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  // key=value / "key": "value" pairs with sensitive names (query strings, JSON).
  [
    /((?:api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|signature|sig|auth|authorization|cookie|session|private[_-]?key|service[_-]?role[_-]?key)["']?\s*[:=]\s*["']?)[^\s"'&,;}]+/gi,
    `$1${REDACTED}`,
  ],
  // Long opaque tokens that slipped through (40+ url-safe chars, mixed case + digits).
  [/\b(?=[A-Za-z0-9_-]{40,}\b)(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[A-Z])[A-Za-z0-9_-]{40,}\b/g, REDACTED],
];

// Detail keys that are dropped outright regardless of value.
const SENSITIVE_KEY_PART =
  /(header|authori[sz]ation|cookie|token|secret|passw|api[_-]?key|apikey|private|signature|credential|e-?mail|phone|body|payload|address|session|jwt)/i;
// "ip" only as a whole word / camelCase segment, so "skipped" or "description" survive.
const IP_KEY = /(^|[_-])ip($|[_-])|^ip[A-Z]|[a-z]Ip($|[A-Z])/;

/** Should a detail key be dropped outright, regardless of its value? */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PART.test(key) || IP_KEY.test(key);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Truncate to `max` characters, marking the cut. */
export function truncate(value: string, max: number): string {
  if (max <= 0) return '';
  if (value.length <= max) return value;
  const marker = '…[truncated]';
  if (max <= marker.length) return value.slice(0, max);
  return value.slice(0, max - marker.length) + marker;
}

/**
 * Redact secrets and PII from free text: literal values of our secret env vars,
 * auth headers, provider keys, JWTs, bot tokens, private keys, emails and
 * sensitive key=value pairs.
 */
export function scrubText(input: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = input;
  for (const name of SECRET_ENV_VARS) {
    const value = env[name];
    // Ignore short / placeholder values so we don't redact ordinary words.
    if (value && value.length >= 8) {
      out = out.replace(new RegExp(escapeRegExp(value), 'g'), REDACTED);
    }
  }
  for (const [pattern, replacement] of SCRUB_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** Restrict a context label to a short, log-safe identifier. */
export function normalizeContext(context: string): string {
  const cleaned = String(context ?? '')
    .replace(/[^A-Za-z0-9_.:/-]/g, '_')
    .slice(0, MAX_CONTEXT_LENGTH);
  return cleaned || 'unknown';
}

/** Path only — query strings and fragments can carry tokens. */
export function normalizeRoute(route: unknown): string | undefined {
  if (typeof route !== 'string' || !route) return undefined;
  let path = route;
  try {
    // Accept full URLs too, keeping only the pathname.
    if (/^https?:\/\//i.test(route)) path = new URL(route).pathname;
  } catch {
    /* fall through with the raw value */
  }
  path = path.split(/[?#]/)[0];
  return truncate(scrubText(path), 120);
}

/**
 * Reduce caller-supplied extra fields to a small, JSON-safe, scrubbed object:
 * sensitive keys dropped, strings scrubbed + truncated, nesting capped at 2,
 * arrays capped at 10 items, at most MAX_DETAIL_KEYS keys per object.
 */
export function sanitizeDetails(
  extra: Record<string, unknown> | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, unknown> {
  const visit = (value: unknown, depth: number): unknown => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'string') return truncate(scrubText(value, env), MAX_DETAIL_STRING_LENGTH);
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (depth >= 2) return '[object]';
    if (Array.isArray(value)) return value.slice(0, 10).map(v => visit(v, depth + 1));
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      let n = 0;
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (n >= MAX_DETAIL_KEYS) break;
        if (isSensitiveKey(k)) continue;
        if (typeof v === 'function' || typeof v === 'symbol') continue;
        out[truncate(k, 40)] = visit(v, depth + 1);
        n += 1;
      }
      return out;
    }
    return null; // functions / symbols
  };

  if (!extra || typeof extra !== 'object') return {};
  const { route: _route, level: _level, alert: _alert, ...rest } = extra;
  return visit(rest, 0) as Record<string, unknown>;
}

/** Message (+ code, if any) from an Error, a Supabase/Postgrest error object, or anything. */
export function errorMessage(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return { message: error.message || error.name, code: typeof code === 'string' ? code : undefined };
  }
  if (typeof error === 'string') return { message: error };
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; code?: unknown };
    if (typeof e.message === 'string') {
      return { message: e.message, code: typeof e.code === 'string' ? e.code : undefined };
    }
  }
  try {
    return { message: String(error) };
  } catch {
    return { message: 'Unknown error' };
  }
}

/** First few stack frames, scrubbed and length-capped. */
export function trimStack(error: unknown, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!(error instanceof Error) || !error.stack) return undefined;
  const lines = error.stack.split('\n').slice(0, MAX_STACK_LINES).map(l => l.trimEnd());
  return truncate(scrubText(lines.join('\n'), env), MAX_STACK_LENGTH);
}

/** Build the scrubbed event that every sink receives. Pure; exported for tests. */
export function buildErrorEvent(
  context: string,
  error: unknown,
  extra: ReportErrorExtra = {},
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): ErrorEvent {
  const { message, code } = errorMessage(error);
  const details = sanitizeDetails(extra, env);
  if (code) details.code = truncate(scrubText(code, env), 40);
  return {
    level: extra.level === 'warn' ? 'warn' : 'error',
    context: normalizeContext(context),
    message: truncate(scrubText(message, env), MAX_MESSAGE_LENGTH) || 'Unknown error',
    stack: trimStack(error, env),
    route: normalizeRoute(extra.route),
    ts: now.toISOString(),
    details,
  };
}

/** Plain-text admin alert (no stack, no details — those stay in the DB/logs). */
export function formatAlert(event: ErrorEvent): string {
  const lines = [
    `CryptoSuccess ${event.level.toUpperCase()}: ${event.context}`,
    event.message,
  ];
  if (event.route) lines.push(`route: ${event.route}`);
  lines.push(`at: ${event.ts}`);
  lines.push(`(further alerts for this context are muted for ${ALERT_WINDOW_SECONDS / 60} min)`);
  return truncate(lines.join('\n'), 1000);
}

// ─────────────────────────────────────────────── Side effects ───────────────

const sinks: ErrorSink[] = [];

/** Register an additional destination (e.g. Sentry). Receives scrubbed events. */
export function registerErrorSink(sink: ErrorSink): void {
  if (!sinks.includes(sink)) sinks.push(sink);
}

/** Reject if `promise` hasn't settled within `ms` (the underlying work is not cancelled). */
export function withTimeout<T>(promise: PromiseLike<T>, ms = SIDE_EFFECT_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    Promise.resolve(promise).then(
      v => {
        clearTimeout(timer);
        resolve(v);
      },
      e => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** True when the service-role client points at a real project. */
export function isOpsDbConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Validated admin chat id (numeric id, or @channel), or null when alerts are off. */
export function alertChatId(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env.ALERT_TELEGRAM_CHAT_ID ?? '').trim();
  if (!raw || !env.TELEGRAM_BOT_TOKEN) return null;
  if (/^-?\d{1,20}$/.test(raw) || /^@[A-Za-z0-9_]{5,32}$/.test(raw)) return raw;
  return null;
}

// Per-instance throttle. Always consulted first (cheap, and the fallback when
// the DB throttle is unavailable); the DB claim makes it global across lambdas.
const localAlertLog = new Map<string, number>();

/** Pure throttle decision for the in-memory layer. Exported for tests. */
export function isThrottled(lastSentMs: number | undefined, nowMs: number, windowSec = ALERT_WINDOW_SECONDS): boolean {
  return lastSentMs !== undefined && nowMs - lastSentMs < windowSec * 1000;
}

async function claimAlertSlot(context: string): Promise<boolean> {
  const now = Date.now();
  if (isThrottled(localAlertLog.get(context), now)) return false;
  localAlertLog.set(context, now);
  if (localAlertLog.size > 500) {
    // Bound memory on long-lived instances.
    localAlertLog.forEach((ts, key) => {
      if (!isThrottled(ts, now)) localAlertLog.delete(key);
    });
  }

  if (!isOpsDbConfigured()) return true;
  try {
    const { data, error } = await withTimeout(
      createServiceClient().rpc('claim_alert_slot', {
        p_context: context,
        p_window_seconds: ALERT_WINDOW_SECONDS,
      }),
    );
    if (error) return true; // DB throttle unavailable → in-memory decision stands
    return data === true;
  } catch {
    return true;
  }
}

async function persist(event: ErrorEvent): Promise<void> {
  if (!isOpsDbConfigured()) return;
  try {
    const { error } = await withTimeout(
      createServiceClient()
        .from('error_events')
        .insert({
          context: event.context,
          message: event.message,
          details: { ...event.details, level: event.level, route: event.route ?? null, stack: event.stack ?? null },
        }),
    );
    if (error) console.warn(JSON.stringify({ level: 'warn', context: 'report-error.persist', message: truncate(scrubText(error.message), 200) }));
  } catch (e) {
    console.warn(JSON.stringify({ level: 'warn', context: 'report-error.persist', message: truncate(scrubText(errorMessage(e).message), 200) }));
  }
}

async function alert(event: ErrorEvent): Promise<void> {
  const chatId = alertChatId();
  if (!chatId) return;
  try {
    if (!(await claimAlertSlot(event.context))) return;
    await withTimeout(sendMessage(chatId, formatAlert(event)));
  } catch (e) {
    // Never echo the Telegram error verbatim: scrub it like everything else.
    console.warn(JSON.stringify({ level: 'warn', context: 'report-error.alert', message: truncate(scrubText(errorMessage(e).message), 200) }));
  }
}

/**
 * Report a server-side error. Safe to call from any route / cron / service;
 * never throws. Await it before returning a response so the serverless runtime
 * doesn't freeze the side effects mid-flight (they are time-boxed to ~3s).
 */
export async function reportError(context: string, error: unknown, extra: ReportErrorExtra = {}): Promise<void> {
  let event: ErrorEvent;
  try {
    event = buildErrorEvent(context, error, extra);
  } catch {
    event = {
      level: 'error',
      context: normalizeContext(context),
      message: 'Unserializable error',
      ts: new Date().toISOString(),
      details: {},
    };
  }

  try {
    const line = JSON.stringify(event);
    if (event.level === 'warn') console.warn(line);
    else console.error(line);
  } catch {
    /* logging must never throw */
  }

  const tasks: Promise<unknown>[] = [persist(event)];
  if (extra.alert !== false && event.level === 'error') tasks.push(alert(event));
  for (const sink of sinks) {
    tasks.push(
      withTimeout(Promise.resolve().then(() => sink(event))).catch(() => undefined),
    );
  }
  await Promise.allSettled(tasks);
}
