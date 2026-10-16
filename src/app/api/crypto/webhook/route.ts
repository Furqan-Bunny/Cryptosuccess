import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';
import { computeCryptoPeriodEnd, isExpectedCryptoPayment } from '@/lib/subscription-rules';
import { isCompletedPayment, parseCryptoOrderId, verifyNowpaymentsSignature } from '@/lib/nowpayments';
import { reportError } from '@/lib/server/report-error';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/crypto/webhook';

// NOWPayments IPN. Verifies the signature, is idempotent (multiple IPNs per
// payment), and grants Pro for a fixed period on a completed payment.
export async function POST(request: NextRequest) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) {
    await reportError('crypto.webhook', new Error('NOWPAYMENTS_IPN_SECRET is not configured'), { route: ROUTE });
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
  if (!verifyNowpaymentsSignature(parsed, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Only a completed payment grants access. Non-terminal statuses (waiting,
  // confirming, sending, …) are acknowledged and ignored.
  if (!isCompletedPayment(parsed?.payment_status)) {
    return NextResponse.json({ received: true, ignored: String(parsed?.payment_status ?? '') });
  }

  const paymentId = parsed.payment_id != null ? String(parsed.payment_id) : '';
  if (!paymentId) return NextResponse.json({ error: 'Missing payment id' }, { status: 400 });

  // order_id is `${userId}:${interval}`, set server-side at checkout.
  const order = parseCryptoOrderId(parsed.order_id);
  if (!order) {
    await reportError('crypto.webhook', new Error('IPN with unrecognised order_id'), {
      route: ROUTE,
      paymentId,
    });
    // Acknowledge (a retry can't fix it) but grant nothing.
    return NextResponse.json({ received: true, ignored: 'unknown_order' });
  }
  const { userId, interval } = order;

  // The invoice must be for the product we're about to grant: the signed IPN
  // carries the invoiced price, which must match our server-side price.
  if (!isExpectedCryptoPayment(parsed.price_amount, parsed.price_currency, interval)) {
    await reportError('crypto.webhook', new Error('IPN amount mismatch'), {
      route: ROUTE,
      paymentId,
      interval,
      priceAmount: String(parsed.price_amount),
      priceCurrency: String(parsed.price_currency),
    });
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
    // Fail closed: a crypto grant EXTENDS the period, so processing without the
    // claim could credit the same payment twice. 500 makes NOWPayments retry.
    await reportError('crypto.webhook', claimErr, { route: ROUTE, stage: 'claim' });
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
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
      await reportError('crypto.webhook', new Error('Paid IPN for an unknown user'), {
        route: ROUTE,
        paymentId,
      });
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
    await reportError('crypto.webhook', handlerErr, { route: ROUTE, paymentId });
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
