import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { computeCryptoPeriodEnd, isExpectedCryptoPayment } from '@/lib/subscription-rules';
import type { BillingInterval } from '@/types/subscription.types';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// NOWPayments signs the IPN as HMAC-SHA512 of the JSON body with its keys sorted
// (recursively), hex-encoded, in the `x-nowpayments-sig` header. Reproduce exactly.
function sortObject(obj: any): any {
  if (Array.isArray(obj)) return obj.map(sortObject);
  if (obj && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce((acc: Record<string, any>, key) => {
        acc[key] = sortObject(obj[key]);
        return acc;
      }, {});
  }
  return obj;
}

// NOWPayments IPN. Verifies the signature, is idempotent (multiple IPNs per
// payment), and grants Pro for a fixed period on a completed payment.
export async function POST(request: NextRequest) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'IPN secret not configured' }, { status: 500 });
  }

  const body = await request.text();
  const signature = headers().get('x-nowpayments-sig') ?? '';

  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Constant-time compare of HMAC-SHA512 over the sorted-key JSON.
  const expected = createHmac('sha512', secret).update(JSON.stringify(sortObject(parsed))).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const status = parsed.payment_status as string;
  // Only a completed payment grants access. Non-terminal statuses (waiting,
  // confirming, sending, …) are acknowledged and ignored.
  if (status !== 'finished' && status !== 'confirmed') {
    return NextResponse.json({ received: true, ignored: status });
  }

  const paymentId = parsed.payment_id != null ? String(parsed.payment_id) : '';
  if (!paymentId) return NextResponse.json({ error: 'Missing payment id' }, { status: 400 });

  // order_id is `${userId}:${interval}`, set server-side at checkout.
  const orderId = String(parsed.order_id ?? '');
  const sep = orderId.indexOf(':');
  const userId = sep > 0 ? orderId.slice(0, sep) : '';
  const intervalRaw = sep > 0 ? orderId.slice(sep + 1) : '';
  if (!UUID_RE.test(userId) || (intervalRaw !== 'monthly' && intervalRaw !== 'yearly')) {
    console.error('Crypto IPN with unrecognised order_id:', orderId);
    // Acknowledge (a retry can't fix it) but grant nothing.
    return NextResponse.json({ received: true, ignored: 'unknown_order' });
  }
  const interval: BillingInterval = intervalRaw;

  // The invoice must be for the product we're about to grant: the signed IPN
  // carries the invoiced price, which must match our server-side price.
  if (!isExpectedCryptoPayment(parsed.price_amount, parsed.price_currency, interval)) {
    console.error(
      `Crypto IPN amount mismatch for payment ${paymentId}: ${String(parsed.price_amount)} ${String(parsed.price_currency)} (${interval})`
    );
    return NextResponse.json({ received: true, ignored: 'amount_mismatch' });
  }

  const db = createServiceClient();

  // Idempotency: a payment can send both `confirmed` and `finished` IPNs (and
  // retries). Claim the payment id so Pro is granted exactly once.
  const { error: claimErr } = await db.from('processed_crypto_events').insert({ event_id: paymentId });
  if (claimErr) {
    if ((claimErr as { code?: string }).code === '23505') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.warn('crypto webhook idempotency claim failed (continuing):', claimErr.message);
  }

  try {
    const { data: profile, error: readErr } = await db
      .from('profiles')
      .select('subscription_status, plan_id, current_period_end')
      .eq('id', userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!profile) {
      // Paid, but the account is gone — keep the claim (a retry can't help) and
      // leave a trail for a manual refund.
      console.error(`Crypto payment ${paymentId} for unknown user: ${userId}`);
      return NextResponse.json({ received: true, ignored: 'unknown_user' });
    }

    // Already Pro with time left → extend from the current end, not from now.
    const periodEnd = computeCryptoPeriodEnd(
      {
        status: profile.subscription_status,
        planId: profile.plan_id,
        currentPeriodEnd: profile.current_period_end,
      },
      interval
    );

    const { error: updErr } = await db
      .from('profiles')
      .update({
        subscription_status: 'pro',
        plan_id: `crypto_${interval}`,
        current_period_end: periodEnd,
        signals_used_today: 0,
        last_reset_date: new Date().toISOString(),
      })
      .eq('id', userId);
    if (updErr) throw new Error(updErr.message);
    console.log(`Crypto Pro activated for user: ${userId} (${interval}) until ${periodEnd}`);
  } catch (handlerErr) {
    // Release the claim so a retry can re-process; 500 triggers NOWPayments retry.
    await db.from('processed_crypto_events').delete().eq('event_id', paymentId);
    console.error('Crypto webhook handler error:', handlerErr);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
