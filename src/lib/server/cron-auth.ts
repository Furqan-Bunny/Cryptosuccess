import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';

// Shared authorization for cron / scheduler-triggered routes. Vercel Cron sends
// `Authorization: Bearer <CRON_SECRET>`. External schedulers (cron-job.org,
// QStash, GitHub Actions) can send the same header.
//
// Fails CLOSED in production: if CRON_SECRET is unset on a deployed env, deny.
// (Previously this returned true when unset, which left the engine / dca /
// discover / staking / brief endpoints open to the internet.) Only non-production
// is allowed open, so the endpoints stay testable in local dev.
export function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';

  const header = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // Constant-time comparison. timingSafeEqual throws on unequal lengths, so gate
  // on length first (length is not secret).
  return a.length === b.length && timingSafeEqual(a, b);
}
