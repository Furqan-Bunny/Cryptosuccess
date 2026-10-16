import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { mapStripeStatus, stripePeriodEndIso } from '@/lib/subscription-rules';

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-09-30.clover',
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

// metadata.userId is written by our own checkout route (server-derived); fall
// back to the Stripe customer id for subscriptions created outside that flow.
async function resolveUserId(
  db: SupabaseClient,
  metadataUserId: unknown,
  customerId: string | null
): Promise<string | null> {
  const fromMeta = asUuid(metadataUserId);
  if (fromMeta) return fromMeta;
  if (!customerId) return null;
  const { data, error } = await db.from('profiles').select('id').eq('customer_id', customerId).limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.id ?? null;
}

async function updateProfile(db: SupabaseClient, userId: string, patch: Record<string, unknown>) {
  const { error } = await db.from('profiles').update(patch).eq('id', userId);
  // Throw so the idempotency claim is released and Stripe retries the event.
  if (error) throw new Error(`profile update failed: ${error.message}`);
}

// Whether a subscription event may change this profile: the profile must be on
// THIS subscription (or on none). Stops a late event for an old, cancelled
// subscription from downgrading a user who has since re-subscribed or paid with
// crypto.
async function profileTracksSubscription(db: SupabaseClient, userId: string, subscriptionId: string) {
  const { data, error } = await db.from('profiles').select('plan_id').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  return data.plan_id == null || data.plan_id === subscriptionId;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = headers().get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe signature' },
        { status: 400 }
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    const stripe = getStripe();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    const db = createServiceClient();

    // Idempotency: Stripe retries deliveries. Claim this event id; a retry of an
    // already-processed event is a no-op.
    const { error: claimErr } = await db
      .from('processed_stripe_events')
      .insert({ event_id: event.id });
    if (claimErr) {
      if ((claimErr as any).code === '23505') {
        return NextResponse.json({ received: true, duplicate: true });
      }
      // Non-duplicate error (e.g. table not yet created): log and continue
      // best-effort rather than dropping the event.
      console.warn('webhook idempotency claim failed (continuing):', claimErr.message);
    }

    try {
      switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const userId = asUuid(session.metadata?.userId) ?? asUuid(session.client_reference_id);
        if (!userId) {
          console.error('No valid userId in checkout session metadata / client_reference_id');
          break;
        }
        // Card checkouts are paid on completion; a trial needs no payment. Any
        // other state waits for customer.subscription.updated.
        if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
          console.log(`Checkout completed without payment (${session.payment_status}) for user: ${userId}`);
          break;
        }

        const subscriptionId = idOf(session.subscription);
        let periodEnd: string | null = null;
        if (subscriptionId) {
          // In API 2025-09-30.clover the period end lives on the subscription
          // items; fetch the subscription so the profile shows it immediately.
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          if (mapStripeStatus(subscription.status) === 'free') {
            console.log(`Checkout completed but subscription is ${subscription.status} for user: ${userId}`);
            break;
          }
          periodEnd = stripePeriodEndIso(subscription);
        }

        await updateProfile(db, userId, {
          subscription_status: 'pro',
          customer_id: idOf(session.customer),
          plan_id: subscriptionId,
          current_period_end: periodEnd,
          signals_used_today: 0,
          last_reset_date: new Date().toISOString(),
        });
        console.log(`Subscription activated for user: ${userId}`);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = idOf(subscription.customer);
        const userId = await resolveUserId(db, subscription.metadata?.userId, customerId);
        if (!userId) break;

        const status = mapStripeStatus(subscription.status);
        if (status == null) {
          // e.g. `incomplete`: first payment still pending — leave access as is.
          console.log(`Subscription ${subscription.status} for user: ${userId} (no change)`);
          break;
        }
        const periodEnd = stripePeriodEndIso(subscription);

        if (status === 'pro') {
          await updateProfile(db, userId, {
            subscription_status: 'pro',
            plan_id: subscription.id,
            ...(customerId ? { customer_id: customerId } : {}),
            ...(periodEnd ? { current_period_end: periodEnd } : {}),
          });
        } else if (await profileTracksSubscription(db, userId, subscription.id)) {
          await updateProfile(db, userId, {
            subscription_status: 'free',
            plan_id: null,
            current_period_end: periodEnd,
          });
        }
        console.log(`Subscription updated for user: ${userId}, status: ${status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = await resolveUserId(db, subscription.metadata?.userId, idOf(subscription.customer));
        if (!userId) break;

        if (await profileTracksSubscription(db, userId, subscription.id)) {
          await updateProfile(db, userId, { subscription_status: 'free', plan_id: null, current_period_end: null });
          console.log(`Subscription cancelled for user: ${userId}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = idOf(invoice.customer);
        if (!customerId) break;

        const { data } = await db.from('profiles').select('id').eq('customer_id', customerId).limit(1);
        if (data && data.length > 0) {
          // Access stays on during Stripe's retry window (past_due → pro); the
          // subscription.updated / deleted events drive any downgrade.
          console.log(`Payment failed for user: ${data[0].id}, customer: ${customerId}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (handlerErr) {
      // Processing failed — release the idempotency claim so Stripe's retry can
      // re-process this event. Re-throw to return a 500 so Stripe retries.
      await db.from('processed_stripe_events').delete().eq('event_id', event.id);
      throw handlerErr;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
