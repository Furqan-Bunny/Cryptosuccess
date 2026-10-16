// Per-chat rate limits for the bot (abuse + cost protection). The shared limiter
// (Upstash, src/lib/server/rate-limit.ts) works across serverless instances but
// FAILS OPEN when Redis is missing or erroring — fine for cost backstops, not for
// the /link brute-force guard. So /link additionally goes through a tiny
// in-memory fixed-window limiter that is per-instance and best-effort, but can
// never be "switched off" by a Redis outage.
import type { BotChannel, RateLimiter } from './types';

export interface LimitPolicy {
  name: string;
  limit: number;
  windowSec: number;
}

export const LIMITS = {
  /** Every inbound message in a chat. */
  general: { name: 'bot-msg', limit: 20, windowSec: 60 },
  /** /signal (and bare-coin) reads — each may cost an analyst generation. */
  signal: { name: 'bot-signal', limit: 6, windowSec: 10 * 60 },
  /** /link attempts — link codes are 8 chars from a 31-letter alphabet, 15 min TTL. */
  link: { name: 'bot-link', limit: 5, windowSec: 15 * 60 },
} satisfies Record<string, LimitPolicy>;

/** Inputs longer than this are refused before any parsing (no command is this long). */
export const MAX_INPUT_CHARS = 500;

/** Limiter key for a chat — namespaced by channel so ids can't collide across channels. */
export function limiterKey(channel: BotChannel, chatId: string): string {
  return `${channel}:${chatId}`;
}

/** Shared-limiter check. Returns true when the action is allowed. */
export async function allowShared(limiter: RateLimiter, policy: LimitPolicy, key: string): Promise<boolean> {
  const res = await limiter(policy.name, key, policy.limit, policy.windowSec);
  return res.ok;
}

/**
 * One "you're going too fast" notice per window: further over-limit messages in
 * the same window are dropped silently, so a flood can't make the bot flood back.
 */
export async function shouldSendLimitNotice(limiter: RateLimiter, policy: LimitPolicy, key: string): Promise<boolean> {
  const res = await limiter(`${policy.name}-notice`, key, 1, policy.windowSec);
  return res.ok;
}

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window in-memory limiter. Bounded: expired windows are swept when the
 * map grows past `maxKeys`, and if it is still full the oldest keys are evicted,
 * so a flood of distinct ids can't grow memory without bound.
 */
export class MemoryRateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly maxKeys = 5000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Count a hit; returns true when it is within the limit. */
  hit(key: string, limit: number, windowSec: number): boolean {
    const t = this.now();
    let w = this.windows.get(key);
    if (!w || w.resetAt <= t) {
      if (w) this.windows.delete(key); // re-insert so Map order tracks recency
      w = { count: 0, resetAt: t + windowSec * 1000 };
      this.windows.set(key, w);
      this.evictIfFull(t);
    }
    w.count += 1;
    return w.count <= limit;
  }

  get size(): number {
    return this.windows.size;
  }

  private evictIfFull(t: number): void {
    if (this.windows.size <= this.maxKeys) return;
    for (const [k, w] of Array.from(this.windows)) {
      if (w.resetAt <= t) this.windows.delete(k);
    }
    const it = this.windows.keys();
    while (this.windows.size > this.maxKeys) {
      const oldest = it.next();
      if (oldest.done) break;
      this.windows.delete(oldest.value);
    }
  }
}

/** Process-wide fallback limiter for /link (survives across warm invocations). */
export const linkMemoryLimiter = new MemoryRateLimiter();

/**
 * /link decision: BOTH limiters must allow. Both are always counted (no short-
 * circuit), so the in-memory window keeps counting even while Redis allows.
 */
export async function allowLinkAttempt(
  limiter: RateLimiter,
  memory: MemoryRateLimiter,
  key: string,
): Promise<boolean> {
  const local = memory.hit(`${LIMITS.link.name}:${key}`, LIMITS.link.limit, LIMITS.link.windowSec);
  const shared = await allowShared(limiter, LIMITS.link, key);
  return local && shared;
}
