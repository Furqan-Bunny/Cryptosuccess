import {
  mapStripeStatus,
  stripePeriodEndIso,
  computeCryptoPeriodEnd,
  isEffectivePro,
  isExpectedCryptoPayment,
  expectedCryptoPriceUsd,
  resolveStripePriceId,
  isCryptoPlan,
} from '@/lib/subscription-rules';
import { netHolding, hasSufficientHolding } from '@/services/engine/holdings';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);

describe('mapStripeStatus', () => {
  it('grants pro for active, trialing and past_due (grace)', () => {
    expect(mapStripeStatus('active')).toBe('pro');
    expect(mapStripeStatus('trialing')).toBe('pro');
    expect(mapStripeStatus('past_due')).toBe('pro');
  });

  it('downgrades terminal / unpaid states', () => {
    expect(mapStripeStatus('canceled')).toBe('free');
    expect(mapStripeStatus('unpaid')).toBe('free');
    expect(mapStripeStatus('incomplete_expired')).toBe('free');
    expect(mapStripeStatus('paused')).toBe('free');
  });

  it('leaves the profile unchanged for incomplete / unknown', () => {
    expect(mapStripeStatus('incomplete')).toBeNull();
    expect(mapStripeStatus(undefined)).toBeNull();
    expect(mapStripeStatus('something_new')).toBeNull();
  });
});

describe('stripePeriodEndIso', () => {
  it('reads the period end from subscription items', () => {
    const ts = Math.floor(NOW / 1000);
    expect(stripePeriodEndIso({ items: { data: [{ current_period_end: ts }] } })).toBe(new Date(ts * 1000).toISOString());
  });

  it('uses the latest item end', () => {
    expect(
      stripePeriodEndIso({ items: { data: [{ current_period_end: 1000 }, { current_period_end: 2000 }] } })
    ).toBe(new Date(2000 * 1000).toISOString());
  });

  it('never produces an Invalid Date', () => {
    expect(stripePeriodEndIso({})).toBeNull();
    expect(stripePeriodEndIso({ items: null })).toBeNull();
    expect(stripePeriodEndIso({ items: { data: [] } })).toBeNull();
    expect(stripePeriodEndIso({ items: { data: [{ current_period_end: undefined }] } })).toBeNull();
    expect(stripePeriodEndIso({ items: { data: [{ current_period_end: NaN }] } })).toBeNull();
  });
});

describe('computeCryptoPeriodEnd', () => {
  it('starts from now for a free user', () => {
    const end = computeCryptoPeriodEnd({ status: 'free', planId: null, currentPeriodEnd: null }, 'monthly', NOW);
    expect(new Date(end).getTime()).toBe(NOW + 30 * DAY);
  });

  it('extends from a future period end for an existing Pro', () => {
    const current = new Date(NOW + 10 * DAY).toISOString();
    const end = computeCryptoPeriodEnd({ status: 'pro', planId: 'crypto_monthly', currentPeriodEnd: current }, 'yearly', NOW);
    expect(new Date(end).getTime()).toBe(NOW + 10 * DAY + 365 * DAY);
  });

  it('starts from now when the previous period already ended', () => {
    const past = new Date(NOW - 5 * DAY).toISOString();
    const end = computeCryptoPeriodEnd({ status: 'pro', planId: 'crypto_monthly', currentPeriodEnd: past }, 'monthly', NOW);
    expect(new Date(end).getTime()).toBe(NOW + 30 * DAY);
  });

  it('ignores a future end on a non-pro profile and garbage dates', () => {
    const future = new Date(NOW + 10 * DAY).toISOString();
    expect(new Date(computeCryptoPeriodEnd({ status: 'free', planId: null, currentPeriodEnd: future }, 'monthly', NOW)).getTime())
      .toBe(NOW + 30 * DAY);
    expect(new Date(computeCryptoPeriodEnd({ status: 'pro', planId: 'crypto_monthly', currentPeriodEnd: 'nope' }, 'monthly', NOW)).getTime())
      .toBe(NOW + 30 * DAY);
  });
});

describe('isEffectivePro', () => {
  it('treats an expired crypto Pro as free', () => {
    expect(isEffectivePro({ status: 'pro', planId: 'crypto_monthly', currentPeriodEnd: new Date(NOW - 1).toISOString() }, NOW)).toBe(false);
    expect(isEffectivePro({ status: 'pro', planId: 'crypto_yearly', currentPeriodEnd: null }, NOW)).toBe(false);
  });

  it('keeps an unexpired crypto Pro and any Stripe Pro', () => {
    expect(isEffectivePro({ status: 'pro', planId: 'crypto_monthly', currentPeriodEnd: new Date(NOW + DAY).toISOString() }, NOW)).toBe(true);
    expect(isEffectivePro({ status: 'pro', planId: 'sub_123', currentPeriodEnd: null }, NOW)).toBe(true);
  });

  it('is false for non-pro statuses', () => {
    expect(isEffectivePro({ status: 'free', planId: null, currentPeriodEnd: null }, NOW)).toBe(false);
    expect(isEffectivePro({ status: 'cancelled', planId: 'sub_1', currentPeriodEnd: null }, NOW)).toBe(false);
  });

  it('recognises crypto plans by prefix', () => {
    expect(isCryptoPlan('crypto_monthly')).toBe(true);
    expect(isCryptoPlan('sub_crypto_x')).toBe(false);
    expect(isCryptoPlan(null)).toBe(false);
  });
});

describe('isExpectedCryptoPayment', () => {
  it('accepts the invoiced USD price for the interval', () => {
    expect(isExpectedCryptoPayment(expectedCryptoPriceUsd('monthly'), 'usd', 'monthly')).toBe(true);
    expect(isExpectedCryptoPayment(String(expectedCryptoPriceUsd('yearly')), 'USD', 'yearly')).toBe(true);
  });

  it('rejects other amounts, currencies or missing fields', () => {
    expect(isExpectedCryptoPayment(expectedCryptoPriceUsd('monthly'), 'usd', 'yearly')).toBe(false);
    expect(isExpectedCryptoPayment(1, 'usd', 'monthly')).toBe(false);
    expect(isExpectedCryptoPayment(expectedCryptoPriceUsd('monthly'), 'eur', 'monthly')).toBe(false);
    expect(isExpectedCryptoPayment(undefined, 'usd', 'monthly')).toBe(false);
    expect(isExpectedCryptoPayment('', 'usd', 'monthly')).toBe(false);
    expect(isExpectedCryptoPayment(expectedCryptoPriceUsd('monthly'), undefined, 'monthly')).toBe(false);
  });
});

describe('resolveStripePriceId', () => {
  const env = {
    STRIPE_PRO_MONTHLY_PRICE_ID: 'price_m',
    STRIPE_PRO_YEARLY_PRICE_ID: 'price_y',
    NEXT_PUBLIC_STRIPE_PRO_PRICE_ID: 'price_legacy',
  };

  it('derives the price from plan + interval', () => {
    expect(resolveStripePriceId('pro', 'monthly', env)).toBe('price_m');
    expect(resolveStripePriceId('pro', 'yearly', env)).toBe('price_y');
  });

  it('falls back to the legacy public id for monthly only', () => {
    expect(resolveStripePriceId('pro', 'monthly', { NEXT_PUBLIC_STRIPE_PRO_PRICE_ID: 'price_legacy' })).toBe('price_legacy');
    expect(resolveStripePriceId('pro', 'yearly', { NEXT_PUBLIC_STRIPE_PRO_PRICE_ID: 'price_legacy' })).toBeNull();
  });

  it('refuses unsellable plans and bad intervals', () => {
    expect(resolveStripePriceId('premium', 'monthly', env)).toBeNull();
    expect(resolveStripePriceId('enterprise', 'yearly', env)).toBeNull();
    expect(resolveStripePriceId('pro', 'weekly', env)).toBeNull();
    expect(resolveStripePriceId('pro', undefined, env)).toBeNull();
  });
});

describe('engine holdings', () => {
  it('nets buys minus sells', () => {
    expect(netHolding([
      { type: 'buy', amount: 2 },
      { type: 'sell', amount: '0.5' },
      { type: 'buy', amount: 1 },
    ])).toBeCloseTo(2.5);
  });

  it('never goes negative and ignores junk rows', () => {
    expect(netHolding([{ type: 'sell', amount: 3 }, { type: 'buy', amount: 'x' }, { type: 'gift', amount: 5 }])).toBe(0);
  });

  it('allows selling the whole position despite float dust', () => {
    const ledger = [{ type: 'buy', amount: 0.1 }, { type: 'buy', amount: 0.2 }];
    expect(hasSufficientHolding(ledger, 0.3)).toBe(true);
  });

  it('refuses a sell larger than the position (second leg of an OCO pair)', () => {
    const ledger = [{ type: 'buy', amount: 1 }, { type: 'sell', amount: 1 }];
    expect(hasSufficientHolding(ledger, 1)).toBe(false);
    expect(hasSufficientHolding([{ type: 'buy', amount: 1 }], 0)).toBe(false);
  });
});
