import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import {
  mapStripeStatus,
  replacesActiveCryptoPro,
  stripePeriodEndIso,
  type ProfileSubscriptionState,
} from '@/lib/subscription-rules';
import {
  asUuid,
  checkoutActivationPatch,
  checkoutUserId,
  idOf,
  isCheckoutPaid,
  profileTracksSubscription as tracksSubscription,
  subscriptionChange,
} from '@/lib/stripe-events';
import { reportError } from '@/lib/server/report-error';

const ROUTE = '/api/stripe/webhook';

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-09-30.clover',
  });
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

// The profile's plan as it is now, before a card activation is written.
async function readSubscriptionState(db: SupabaseClient, userId: string): Promise<ProfileSubscriptionState | null> {
  const { data, error } = await db
    .from('profiles')
    .select('subscription_status, plan_id, current_period_end')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { status: data.subscription_status, planId: data.plan_id, currentPeriodEnd: data.current_period_end };
}

// A card subscription is taking over from crypto Pro that still has paid time
// left (a crypto invoice confirmed while a card checkout was open; checkout
// refuses this otherwise). The card plan must win so the user can manage and
// cancel it, but the crypto days were paid for: flag it for a manual refund.
async function reportCryptoOverlap(userId: string, eventId: string, existing: ProfileSubscriptionState | null) {
  if (!replacesActiveCryptoPro(existing)) return;
  await reportError('stripe.webhook', new Error('Card subscription replaced active crypto Pro; refund the unused crypto days'), {
    route: ROUTE,
    eventId,
    userId,
  });
}

// Whether a subscription event may change this profile: the profile must be on
// THIS subscription (or on none). Stops a late event for an old, cancelled
// subscription from downgrading a user who has since re-subscribed or paid with
// crypto.
async function profileTracksSubscription(db: SupabaseClient, userId: string, subscriptionId: string) {
  const { data, error } = await db.from('profiles').select('plan_id').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  return tracksSubscription(data.plan_id, subscriptionId);
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
      await reportError('stripe.webhook', new Error('STRIPE_WEBHOOK_SECRET is not configured'), { route: ROUTE });
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
      // Expected for forged / misrouted calls. Unauthenticated, so it is NOT
      // persisted to error_events (anyone could flood the table): a short console
      // line only, with no request data echoed.
      console.warn(`${ROUTE}: rejected a request with an invalid Stripe signature`);
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
      // Every handler below sets absolute state, so a replay is harmless.
      await reportError('stripe.webhook', claimErr, { route: ROUTE, level: 'warn', stage: 'claim' });
    }

    try {
      switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const userId = checkoutUserId(session);
        if (!userId) {
          await reportError('stripe.webhook', new Error('Checkout session without a valid user id'), {
            route: ROUTE,
            eventId: event.id,
          });
          break;
        }
        // Card checkouts are paid on completion; a trial needs no payment. Any
        // other state waits for customer.subscription.updated.
        if (!isCheckoutPaid(session.payment_status)) {
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

        const existing = await readSubscriptionState(db, userId);
        await updateProfile(
          db,
          userId,
          checkoutActivationPatch({ customerId: idOf(session.customer), subscriptionId, periodEnd, existing })
        );
        await reportCryptoOverlap(userId, event.id, existing);
        console.log(`Subscription activated for user: ${userId}`);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        // Stripe does not guarantee delivery order, and a failed delivery is
        // retried hours later, so the payload's status may be stale (an old
        // "active" arriving after the subscription was deleted would re-grant
        // Pro that nothing ever revokes). Act on the subscription's CURRENT
        // state instead: re-read it from Stripe.
        const eventSubscription = event.data.object as Stripe.Subscription;
        const subscription = await stripe.subscriptions.retrieve(eventSubscription.id);
        const customerId = idOf(subscription.customer);
        const userId = await resolveUserId(db, subscription.metadata?.userId, customerId);
        if (!userId) break;

        const existing = await readSubscriptionState(db, userId);
        const change = subscriptionChange({
          status: subscription.status,
          subscriptionId: subscription.id,
          customerId,
          periodEnd: stripePeriodEndIso(subscription),
          existing,
        });
        if (change.kind === 'none') {
          // e.g. `incomplete`: first payment still pending — leave access as is.
          console.log(`Subscription ${subscription.status} for user: ${userId} (no change)`);
          break;
        }

        if (change.kind === 'pro') {
          await updateProfile(db, userId, change.patch);
          await reportCryptoOverlap(userId, event.id, existing);
        } else if (await profileTracksSubscription(db, userId, subscription.id)) {
          await updateProfile(db, userId, change.patch);
        }
        console.log(`Subscription updated for user: ${userId}, status: ${change.kind}`);
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
    await reportError('stripe.webhook', error, { route: ROUTE });
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
