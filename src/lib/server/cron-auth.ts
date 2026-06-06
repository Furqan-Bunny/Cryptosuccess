import { NextRequest } from 'next/server';

// Shared authorization for cron / scheduler-triggered routes. Vercel Cron sends
// `Authorization: Bearer <CRON_SECRET>`. External schedulers (cron-job.org,
// QStash, GitHub Actions) can send the same header. When CRON_SECRET is unset
// (local dev), requests are allowed so the endpoints are testable.
export function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}
