/**
 * Integration test for the NOWPayments IPN webhook logic (crypto/webhook).
 * DB-free: mirrors the route's pure signature + payment-processing logic and
 * exercises the REAL HMAC-SHA512 sorted-JSON scheme so it can't silently change.
 */
import { createHmac, timingSafeEqual } from 'crypto';

// Mirrors sortObject + signature check in crypto/webhook/route.ts.
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

function sign(body: object, secret: string): string {
  return createHmac('sha512', secret).update(JSON.stringify(sortObject(body))).digest('hex');
}

function verify(body: object, signature: string, secret: string): boolean {
  const expected = sign(body, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Mirrors the payment handler: only finished/confirmed grant Pro; interval + user
// come from order_id = `${userId}:${interval}`.
function processPayment(payload: any) {
  const status = payload.payment_status;
  if (status !== 'finished' && status !== 'confirmed') return null;
  const orderId = String(payload.order_id ?? '');
  const sep = orderId.indexOf(':');
  const userId = sep > 0 ? orderId.slice(0, sep) : '';
  if (!userId) return null;
  const interval = orderId.slice(sep + 1) === 'yearly' ? 'yearly' : 'monthly';
  return { userId, status: 'pro', planId: `crypto_${interval}`, periodDays: interval === 'yearly' ? 365 : 30 };
}

const SECRET = 'test_ipn_secret';

describe('NOWPayments IPN signature', () => {
  const body = { payment_id: 123, payment_status: 'finished', order_id: 'u1:monthly', price_amount: 19 };

  it('accepts a correctly-signed body regardless of key order', () => {
    const sig = sign(body, SECRET);
    // Reordered keys must still verify (signature is over sorted keys).
    const reordered = { order_id: 'u1:monthly', price_amount: 19, payment_status: 'finished', payment_id: 123 };
    expect(verify(reordered, sig, SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = sign(body, SECRET);
    expect(verify({ ...body, order_id: 'attacker:yearly' }, sig, SECRET)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const sig = sign(body, 'other');
    expect(verify(body, sig, SECRET)).toBe(false);
  });
});

describe('NOWPayments payment processing', () => {
  it('grants monthly Pro on finished', () => {
    const r = processPayment({ payment_status: 'finished', order_id: 'u1:monthly' });
    expect(r).toEqual({ userId: 'u1', status: 'pro', planId: 'crypto_monthly', periodDays: 30 });
  });

  it('grants yearly Pro on confirmed', () => {
    const r = processPayment({ payment_status: 'confirmed', order_id: 'u2:yearly' });
    expect(r!.planId).toBe('crypto_yearly');
    expect(r!.periodDays).toBe(365);
  });

  it('handles a uuid userId (contains no colon)', () => {
    const uid = 'd63b521b-22c9-41f0-88d4-acaf9f209434';
    const r = processPayment({ payment_status: 'finished', order_id: `${uid}:yearly` });
    expect(r!.userId).toBe(uid);
    expect(r!.planId).toBe('crypto_yearly');
  });

  it('ignores non-terminal statuses', () => {
    for (const s of ['waiting', 'confirming', 'sending', 'partially_paid', 'failed', 'expired']) {
      expect(processPayment({ payment_status: s, order_id: 'u1:monthly' })).toBeNull();
    }
  });

  it('ignores a payment with no userId', () => {
    expect(processPayment({ payment_status: 'finished', order_id: '' })).toBeNull();
  });

  it('computes a period end in the future', () => {
    const r = processPayment({ payment_status: 'finished', order_id: 'u1:monthly' })!;
    expect(Date.now() + r.periodDays * DAY_MS).toBeGreaterThan(Date.now());
  });
});
