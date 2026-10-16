/**
 * Stripe webhook (stripe/webhook) — the pure event → profile mapping the route
 * applies after verifying the signature. Imports the real helpers.
 */
import {
  checkoutActivationPatch,
  checkoutUserId,
  idOf,
  isCheckoutPaid,
  profileTracksSubscription,
  subscriptionChange,
} from '../../src/lib/stripe-events';
import { stripePeriodEndIso } from '../../src/lib/subscription-rules';

const UID = 'd63b521b-22c9-41f0-88d4-acaf9f209434';

describe('checkout.session.completed', () => {
  it('takes the user from metadata, then client_reference_id', () => {
    expect(checkoutUserId({ metadata: { userId: UID } })).toBe(UID);
    expect(checkoutUserId({ metadata: {}, client_reference_id: UID })).toBe(UID);
  });

  it('ignores ids that are not UUIDs', () => {
    expect(checkoutUserId({ metadata: { userId: 'user123' } })).toBeNull();
    expect(checkoutUserId({ metadata: {}, client_reference_id: 'x or 1=1' })).toBeNull();
    expect(checkoutUserId({})).toBeNull();
  });

  it('only paid or no-payment-required checkouts activate', () => {
    expect(isCheckoutPaid('paid')).toBe(true);
    expect(isCheckoutPaid('no_payment_required')).toBe(true);
    expect(isCheckoutPaid('unpaid')).toBe(false);
    expect(isCheckoutPaid(null)).toBe(false);
  });

  it('activates Pro with the subscription id, customer and period end', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(
      checkoutActivationPatch({
        customerId: 'cus_abc',
        subscriptionId: 'sub_xyz',
        periodEnd: '2026-02-01T00:00:00.000Z',
        now,
      })
    ).toEqual({
      subscription_status: 'pro',
      customer_id: 'cus_abc',
      plan_id: 'sub_xyz',
      current_period_end: '2026-02-01T00:00:00.000Z',
      signals_used_today: 0,
      last_reset_date: now.toISOString(),
    });
  });

  it('reads expanded or plain references', () => {
    expect(idOf('cus_1')).toBe('cus_1');
    expect(idOf({ id: 'cus_2' })).toBe('cus_2');
    expect(idOf(null)).toBeNull();
  });
});

describe('customer.subscription.created / updated', () => {
  const base = { subscriptionId: 'sub_1', customerId: 'cus_1', periodEnd: '2026-02-01T00:00:00.000Z' };

  it('active, trialing and past_due keep the user on Pro', () => {
    for (const status of ['active', 'trialing', 'past_due']) {
      expect(subscriptionChange({ ...base, status })).toEqual({
        kind: 'pro',
        patch: {
          subscription_status: 'pro',
          plan_id: 'sub_1',
          customer_id: 'cus_1',
          current_period_end: base.periodEnd,
        },
      });
    }
  });

  it('does not wipe a known period end when Stripe omits it', () => {
    const change = subscriptionChange({ ...base, status: 'active', periodEnd: null, customerId: null });
    expect(change).toEqual({ kind: 'pro', patch: { subscription_status: 'pro', plan_id: 'sub_1' } });
  });

  it('canceled / unpaid downgrade to free', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete_expired', 'paused']) {
      expect(subscriptionChange({ ...base, status })).toEqual({
        kind: 'free',
        patch: { subscription_status: 'free', plan_id: null, current_period_end: base.periodEnd },
      });
    }
  });

  it('incomplete and unknown statuses change nothing', () => {
    expect(subscriptionChange({ ...base, status: 'incomplete' })).toEqual({ kind: 'none' });
    expect(subscriptionChange({ ...base, status: undefined })).toEqual({ kind: 'none' });
  });

  it('a late event for an old subscription cannot downgrade a newer plan', () => {
    expect(profileTracksSubscription('sub_1', 'sub_1')).toBe(true);
    expect(profileTracksSubscription(null, 'sub_1')).toBe(true);
    expect(profileTracksSubscription('sub_2', 'sub_1')).toBe(false);
    expect(profileTracksSubscription('crypto_monthly', 'sub_1')).toBe(false);
  });

  it('period end comes from the subscription items', () => {
    expect(stripePeriodEndIso({ items: { data: [{ current_period_end: 1767225600 }] } })).toBe(
      '2026-01-01T00:00:00.000Z'
    );
    expect(stripePeriodEndIso({ items: { data: [] } })).toBeNull();
  });
});
