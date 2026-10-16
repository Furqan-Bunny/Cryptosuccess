// Pure pieces of the Stripe webhook (/api/stripe/webhook): who an event belongs
// to and what it does to the profile row. No I/O here so the mapping is unit-
// tested against the real code; the route only verifies, reads and writes.
import { laterIso, mapStripeStatus, replacesActiveCryptoPro, type ProfileSubscriptionState } from '@/lib/subscription-rules';
import { isUuid } from '@/lib/uuid';

export function asUuid(value: unknown): string | null {
  return isUuid(value) ? value : null;
}

/** Stripe expands some references to objects; both forms carry the id. */
export function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

/**
 * The account a Checkout Session pays for. metadata.userId and
 * client_reference_id are both written by our own checkout route from the
 * verified session; anything that is not a UUID is ignored.
 */
export function checkoutUserId(session: {
  metadata?: Record<string, string> | null;
  client_reference_id?: string | null;
}): string | null {
  return asUuid(session.metadata?.userId) ?? asUuid(session.client_reference_id);
}

/** Card checkouts are paid on completion; a trial needs no payment. */
export function isCheckoutPaid(paymentStatus: string | null | undefined): boolean {
  return paymentStatus === 'paid' || paymentStatus === 'no_payment_required';
}

export type SubscriptionChange =
  | { kind: 'none' }
  | { kind: 'pro'; patch: Record<string, unknown> }
  | { kind: 'free'; patch: Record<string, unknown> };

/**
 * Profile change for customer.subscription.created / .updated.
 *   active | trialing | past_due → Pro on this subscription (period end kept
 *     when Stripe omits it)
 *   canceled | unpaid | …        → Free (the route applies it only when the
 *     profile still tracks THIS subscription)
 *   incomplete / unknown         → no change
 * `existing` is the profile as it is now: if it still holds paid-up crypto Pro,
 * its period end is never shortened (see proPeriodEnd).
 */
export function subscriptionChange(input: {
  status: string | null | undefined;
  subscriptionId: string;
  customerId: string | null;
  periodEnd: string | null;
  existing?: ProfileSubscriptionState | null;
  now?: Date;
}): SubscriptionChange {
  const mapped = mapStripeStatus(input.status);
  if (mapped == null) return { kind: 'none' };
  if (mapped === 'pro') {
    const periodEnd = proPeriodEnd(input.periodEnd, input.existing, input.now);
    return {
      kind: 'pro',
      patch: {
        subscription_status: 'pro',
        plan_id: input.subscriptionId,
        ...(input.customerId ? { customer_id: input.customerId } : {}),
        ...(periodEnd ? { current_period_end: periodEnd } : {}),
      },
    };
  }
  return {
    kind: 'free',
    patch: { subscription_status: 'free', plan_id: null, current_period_end: input.periodEnd },
  };
}

/**
 * Period end to store when a card subscription becomes the profile's plan. The
 * card plan takes over plan_id (so the user can manage / cancel it), but if the
 * profile still holds crypto Pro time that was paid for, the later end is kept
 * rather than cutting that time short.
 */
export function proPeriodEnd(
  stripePeriodEnd: string | null,
  existing: ProfileSubscriptionState | null | undefined,
  now: Date = new Date()
): string | null {
  if (!replacesActiveCryptoPro(existing, now.getTime())) return stripePeriodEnd;
  return laterIso(existing?.currentPeriodEnd, stripePeriodEnd);
}

/** Profile patch for a completed, paid Pro checkout. */
export function checkoutActivationPatch(input: {
  customerId: string | null;
  subscriptionId: string | null;
  periodEnd: string | null;
  existing?: ProfileSubscriptionState | null;
  now?: Date;
}): Record<string, unknown> {
  return {
    subscription_status: 'pro',
    customer_id: input.customerId,
    plan_id: input.subscriptionId,
    current_period_end: proPeriodEnd(input.periodEnd, input.existing, input.now),
    signals_used_today: 0,
    last_reset_date: (input.now ?? new Date()).toISOString(),
  };
}

/**
 * Whether a downgrading subscription event may touch this profile: only when
 * the profile is on THIS subscription (or on none). A late event for an old
 * subscription must not downgrade a user who re-subscribed or paid with crypto.
 */
export function profileTracksSubscription(profilePlanId: string | null | undefined, subscriptionId: string): boolean {
  return profilePlanId == null || profilePlanId === subscriptionId;
}
