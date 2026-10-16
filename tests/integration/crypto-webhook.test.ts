/**
 * NOWPayments IPN webhook (crypto/webhook) — the pure pieces the route uses:
 * the REAL HMAC-SHA512 sorted-JSON signature scheme, the payment-status gate,
 * order_id parsing, the invoiced-amount check and the period extension.
 */
import {
  isCompletedPayment,
  parseCryptoOrderId,
  signNowpaymentsPayload,
  sortObject,
  verifyNowpaymentsSignature,
} from '../../src/lib/nowpayments';
import { computeCryptoPeriodEnd, isExpectedCryptoPayment } from '../../src/lib/subscription-rules';

const SECRET = 'test_ipn_secret';
const UID = 'd63b521b-22c9-41f0-88d4-acaf9f209434';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('NOWPayments IPN signature', () => {
  const body = { payment_id: 123, payment_status: 'finished', order_id: `${UID}:monthly`, price_amount: 19 };

  it('accepts a correctly-signed body regardless of key order', () => {
    const sig = signNowpaymentsPayload(body, SECRET);
    const reordered = { order_id: `${UID}:monthly`, price_amount: 19, payment_status: 'finished', payment_id: 123 };
    expect(verifyNowpaymentsSignature(reordered, sig, SECRET)).toBe(true);
  });

  it('sorts nested objects recursively', () => {
    expect(JSON.stringify(sortObject({ b: { d: 1, c: [{ f: 1, e: 2 }] }, a: 0 }))).toBe(
      '{"a":0,"b":{"c":[{"e":2,"f":1}],"d":1}}'
    );
  });

  it('rejects a tampered body', () => {
    const sig = signNowpaymentsPayload(body, SECRET);
    expect(verifyNowpaymentsSignature({ ...body, order_id: `${UID}:yearly` }, sig, SECRET)).toBe(false);
  });

  it('rejects a wrong secret, an empty signature and an empty secret', () => {
    expect(verifyNowpaymentsSignature(body, signNowpaymentsPayload(body, 'other'), SECRET)).toBe(false);
    expect(verifyNowpaymentsSignature(body, '', SECRET)).toBe(false);
    expect(verifyNowpaymentsSignature(body, signNowpaymentsPayload(body, SECRET), '')).toBe(false);
  });
});

describe('NOWPayments payment processing', () => {
  it('only finished / confirmed payments are completed', () => {
    expect(isCompletedPayment('finished')).toBe(true);
    expect(isCompletedPayment('confirmed')).toBe(true);
    for (const s of ['waiting', 'confirming', 'sending', 'partially_paid', 'failed', 'expired', undefined, 1]) {
      expect(isCompletedPayment(s)).toBe(false);
    }
  });

  it('parses a uuid:interval order id', () => {
    expect(parseCryptoOrderId(`${UID}:yearly`)).toEqual({ userId: UID, interval: 'yearly' });
    expect(parseCryptoOrderId(`${UID}:monthly`)).toEqual({ userId: UID, interval: 'monthly' });
  });

  it('rejects malformed order ids', () => {
    for (const o of ['', 'u1:monthly', `${UID}:weekly`, UID, ':monthly', `${UID}:monthly:x`, null, 42]) {
      expect(parseCryptoOrderId(o)).toBeNull();
    }
  });

  it('only accepts the invoiced USD amount for the interval', () => {
    expect(isExpectedCryptoPayment(19, 'usd', 'monthly')).toBe(true);
    expect(isExpectedCryptoPayment('182', 'USD', 'yearly')).toBe(true);
    expect(isExpectedCryptoPayment(19, 'usd', 'yearly')).toBe(false);
    expect(isExpectedCryptoPayment(1, 'usd', 'monthly')).toBe(false);
    expect(isExpectedCryptoPayment(19, 'eur', 'monthly')).toBe(false);
    expect(isExpectedCryptoPayment(undefined, 'usd', 'monthly')).toBe(false);
  });

  it('starts a new period from now and extends an active one', () => {
    const now = Date.UTC(2026, 0, 1);
    const fresh = computeCryptoPeriodEnd({ status: 'free', planId: null, currentPeriodEnd: null }, 'monthly', now);
    expect(new Date(fresh).getTime()).toBe(now + 30 * DAY_MS);

    const end = new Date(now + 10 * DAY_MS).toISOString();
    const extended = computeCryptoPeriodEnd(
      { status: 'pro', planId: 'crypto_monthly', currentPeriodEnd: end },
      'yearly',
      now
    );
    expect(new Date(extended).getTime()).toBe(now + 10 * DAY_MS + 365 * DAY_MS);
  });
});
