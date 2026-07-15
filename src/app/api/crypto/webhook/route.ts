import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

// Coinbase Commerce webhook. Verifies the HMAC-SHA256 signature of the RAW body,
// is idempotent (Commerce retries), and grants Pro for a fixed period on a
// completed charge. Mirrors the Stripe webhook's idempotency + activation.
export async function POST(request: NextRequest) {
  const secret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const body = await request.text();
  const signature = headers().get('x-cc-webhook-signature') ?? '';

  // Constant-time HMAC compare over the raw body.
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { id?: string; type?: string; data?: { metadata?: Record<string, string> } };
  try {
    event = JSON.parse(body).event;
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const eventId = event?.id ? String(event.id) : '';
  if (!eventId) return NextResponse.json({ error: 'Missing event id' }, { status: 400 });

  const db = createServiceClient();

  // Idempotency: claim the event id; a retry of an already-processed event no-ops.
  const { error: claimErr } = await db.from('processed_crypto_events').insert({ event_id: eventId });
  if (claimErr) {
    if ((claimErr as { code?: string }).code === '23505') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.warn('crypto webhook idempotency claim failed (continuing):', claimErr.message);
  }

  try {
    // charge:confirmed = payment detected & confirmed; charge:resolved = finalized.
    if (event.type === 'charge:confirmed' || event.type === 'charge:resolved') {
      const md = event.data?.metadata ?? {};
      const userId = md.userId;
      const interval = md.billingInterval === 'yearly' ? 'yearly' : 'monthly';

      if (userId) {
        const days = interval === 'yearly' ? 365 : 30;
        await db
          .from('profiles')
          .update({
            subscription_status: 'pro',
            plan_id: `crypto_${interval}`,
            current_period_end: new Date(Date.now() + days * DAY_MS).toISOString(),
            signals_used_today: 0,
            last_reset_date: new Date().toISOString(),
          })
          .eq('id', userId);
        console.log(`Crypto Pro activated for user: ${userId} (${interval})`);
      } else {
        console.error('No userId in crypto charge metadata');
      }
    }
  } catch (handlerErr) {
    // Release the claim so Commerce's retry can re-process; 500 triggers retry.
    await db.from('processed_crypto_events').delete().eq('event_id', eventId);
    console.error('Crypto webhook handler error:', handlerErr);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
