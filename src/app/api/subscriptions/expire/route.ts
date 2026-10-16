import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Downgrades one-off crypto Pro subscriptions whose paid period has ended.
// Crypto payments don't auto-renew and nothing else flips them back to free
// (Stripe has its own webhooks). consume_signal already treats a lapsed crypto
// Pro as free at the moment of use; this cron makes the profile itself honest
// for every other screen. Idempotent — safe to run as often as you like
// (daily is enough; hourly makes the downgrade near-exact).
async function handler(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  try {
    const db = createServiceClient();
    // Migration 0009: SECURITY DEFINER, service_role only.
    const { data, error } = await db.rpc('expire_crypto_subscriptions');
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, expired: Number(data ?? 0) });
  } catch (error) {
    console.error('Subscription expiry error:', error);
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handler(request);
}
export async function POST(request: NextRequest) {
  return handler(request);
}
