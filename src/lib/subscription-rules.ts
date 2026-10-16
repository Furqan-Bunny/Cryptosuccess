// Pure subscription rules shared by the Stripe / NOWPayments webhooks, the
// checkout routes, the expiry cron and the analyst gate. No I/O here so every
// rule is unit-tested; the routes only do the database / provider calls.
//
// The profiles table can only store free | pro | cancelled, so "pro" is the
// single paid tier. Crypto payments are one-off (no auto-renew) and are stored as
// plan_id 'crypto_monthly' | 'crypto_yearly' with an explicit current_period_end.

import { SUBSCRIPTION_PLANS, BillingInterval } from '@/types/subscription.types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const CRYPTO_PLAN_PREFIX = 'crypto_';
export const CRYPTO_PERIOD_DAYS: Record<BillingInterval, number> = { monthly: 30, yearly: 365 };

export interface ProfileSubscriptionState {
  status: string | null | undefined;
  planId: string | null | undefined;
  currentPeriodEnd: string | null | undefined;
}

export function isCryptoPlan(planId: string | null | undefined): boolean {
  return typeof planId === 'string' && planId.startsWith(CRYPTO_PLAN_PREFIX);
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Whether the profile currently has Pro access. A crypto Pro whose fixed period
 * has ended is NOT Pro, even before the expiry cron flips the row (mirrors
 * consume_signal in migration 0009). Stripe Pro is driven by Stripe's webhooks,
 * so its period end is not re-checked here (renewals land via webhook).
 */
export function isEffectivePro(state: ProfileSubscriptionState, nowMs: number = Date.now()): boolean {
  if (state.status !== 'pro') return false;
  if (!isCryptoPlan(state.planId)) return true;
  const end = parseTime(state.currentPeriodEnd);
  return end != null && end >= nowMs;
}

/**
 * New period end for a crypto payment. If the user is already Pro with a period
 * end still in the future, the purchase EXTENDS that period (paying early must
 * never forfeit the days already bought); otherwise it starts now.
 */
export function computeCryptoPeriodEnd(
  state: ProfileSubscriptionState,
  interval: BillingInterval,
  nowMs: number = Date.now()
): string {
  const end = parseTime(state.currentPeriodEnd);
  const base = state.status === 'pro' && end != null && end > nowMs ? end : nowMs;
  return new Date(base + CRYPTO_PERIOD_DAYS[interval] * DAY_MS).toISOString();
}

/** Server-side USD price of a crypto Pro purchase. */
export function expectedCryptoPriceUsd(interval: BillingInterval): number {
  return SUBSCRIPTION_PLANS.pro.price[interval];
}

/**
 * Does a (signed) NOWPayments IPN carry the amount/currency we invoiced? Both
 * fields are always present on invoice payments; a missing or different value
 * means the payment is not for the product we are about to grant.
 */
export function isExpectedCryptoPayment(
  priceAmount: unknown,
  priceCurrency: unknown,
  interval: BillingInterval
): boolean {
  if (typeof priceCurrency !== 'string' || priceCurrency.toLowerCase() !== 'usd') return false;
  const amount = typeof priceAmount === 'number' ? priceAmount : Number(priceAmount);
  if (priceAmount == null || priceAmount === '' || !Number.isFinite(amount)) return false;
  return Math.abs(amount - expectedCryptoPriceUsd(interval)) < 0.005;
}

/**
 * Stripe subscription status → our profile status. `null` means "leave the
 * profile unchanged" (e.g. `incomplete`: the first payment is still pending).
 *   active | trialing                    → pro
 *   past_due                             → pro (grace while Stripe retries)
 *   canceled | unpaid | incomplete_expired | paused → free
 */
export function mapStripeStatus(status: string | null | undefined): 'pro' | 'free' | null {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
      return 'pro';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
    case 'paused':
      return 'free';
    default:
      return null;
  }
}

/**
 * Current period end of a Stripe subscription as ISO, or null. Since API version
 * 2025-03-31 (we pin 2025-09-30.clover) the period lives on each subscription
 * ITEM, not the subscription. Guarded so a missing value never becomes
 * `new Date(NaN)`.
 */
export function stripePeriodEndIso(subscription: {
  items?: { data?: Array<{ current_period_end?: number | null }> } | null;
}): string | null {
  const items = subscription.items?.data ?? [];
  const ends = items
    .map(i => i?.current_period_end)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (ends.length === 0) return null;
  // Single-item subscriptions in practice; the latest end is the access horizon.
  return new Date(Math.max(...ends) * 1000).toISOString();
}

export type SellablePlan = 'pro';

/**
 * Resolve the Stripe price id for a plan/interval from SERVER env. Never trust a
 * client-supplied price id. Returns null when the plan is not sellable or the
 * price is not configured.
 */
export function resolveStripePriceId(
  plan: unknown,
  interval: unknown,
  env: Record<string, string | undefined>
): string | null {
  if (plan !== 'pro') return null;
  if (interval === 'monthly') {
    return env.STRIPE_PRO_MONTHLY_PRICE_ID || env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || null;
  }
  if (interval === 'yearly') {
    return env.STRIPE_PRO_YEARLY_PRICE_ID || null;
  }
  return null;
}
