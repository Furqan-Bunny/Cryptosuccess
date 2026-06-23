// Lightweight fixed-window rate limiter backed by the Upstash Redis REST API.
// Uses plain fetch (no SDK dependency) and NO-OPS gracefully when
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are unset — so local/dev and
// any deployment without Redis configured keep working untouched.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfter: number; // seconds until the current window resets
}

const ALLOWED: RateLimitResult = { ok: true, remaining: -1, retryAfter: 0 };

/**
 * Fixed-window limiter: at most `limit` requests per `windowSec` per `id`.
 *
 * Fails OPEN on missing config or any Redis/network error — rate limiting is a
 * cost/abuse backstop, not an auth gate, so it must never take the app down.
 */
export async function rateLimit(
  name: string,
  id: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  if (!REDIS_URL || !REDIS_TOKEN) return ALLOWED;
  try {
    const windowMs = windowSec * 1000;
    // Window-bucketed key: rolls over each window, so a missed EXPIRE can't
    // leak counters across windows.
    const bucket = Math.floor(Date.now() / windowMs);
    const key = `rl:${name}:${id}:${bucket}`;

    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, String(windowSec)],
      ]),
      cache: 'no-store',
    });
    if (!res.ok) return ALLOWED; // fail open

    const data = (await res.json()) as Array<{ result: number }>;
    const count = Number(data?.[0]?.result ?? 0);
    const remaining = Math.max(0, limit - count);
    const retryAfter = Math.max(1, windowSec - Math.floor((Date.now() % windowMs) / 1000));
    return { ok: count <= limit, remaining, retryAfter };
  } catch {
    return ALLOWED; // fail open
  }
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
