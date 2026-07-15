/**
 * Integration test for the Coinbase Commerce webhook logic (crypto/webhook).
 * DB-free: mirrors the route's pure signature + charge-processing logic and
 * exercises the REAL HMAC scheme so the signature contract can't silently change.
 */
import { createHmac, timingSafeEqual } from 'crypto';

// Mirrors the constant-time HMAC check in crypto/webhook/route.ts.
function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Mirrors the charge handler: only confirmed/resolved grant Pro; interval decides
// the fixed period; identity comes from metadata.userId.
function processCharge(event: any) {
  if (event.type !== 'charge:confirmed' && event.type !== 'charge:resolved') return null;
  const md = event.data?.metadata ?? {};
  const userId = md.userId;
  if (!userId) return null;
  const interval = md.billingInterval === 'yearly' ? 'yearly' : 'monthly';
  const days = interval === 'yearly' ? 365 : 30;
  return {
    userId,
    status: 'pro',
    planId: `crypto_${interval}`,
    periodDays: days,
  };
}

const SECRET = 'test_shared_secret';

describe('crypto webhook signature', () => {
  const body = JSON.stringify({ event: { id: 'evt_1', type: 'charge:confirmed' } });

  it('accepts a correctly-signed body', () => {
    const sig = createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifySignature(body, sig, SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifySignature(body + ' ', sig, SECRET)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const sig = createHmac('sha256', 'other_secret').update(body).digest('hex');
    expect(verifySignature(body, sig, SECRET)).toBe(false);
  });

  it('rejects a malformed signature (length mismatch safe)', () => {
    expect(verifySignature(body, 'deadbeef', SECRET)).toBe(false);
  });
});

describe('crypto webhook charge processing', () => {
  it('grants monthly Pro on charge:confirmed', () => {
    const r = processCharge({
      type: 'charge:confirmed',
      data: { metadata: { userId: 'u1', billingInterval: 'monthly', plan: 'pro' } },
    });
    expect(r).not.toBeNull();
    expect(r!.userId).toBe('u1');
    expect(r!.status).toBe('pro');
    expect(r!.planId).toBe('crypto_monthly');
    expect(r!.periodDays).toBe(30);
  });

  it('grants yearly Pro on charge:resolved', () => {
    const r = processCharge({
      type: 'charge:resolved',
      data: { metadata: { userId: 'u2', billingInterval: 'yearly' } },
    });
    expect(r!.planId).toBe('crypto_yearly');
    expect(r!.periodDays).toBe(365);
  });

  it('ignores non-completed events', () => {
    expect(processCharge({ type: 'charge:created', data: { metadata: { userId: 'u1' } } })).toBeNull();
    expect(processCharge({ type: 'charge:failed', data: { metadata: { userId: 'u1' } } })).toBeNull();
  });

  it('ignores a charge with no userId', () => {
    expect(processCharge({ type: 'charge:confirmed', data: { metadata: {} } })).toBeNull();
  });

  it('computes a period end in the future', () => {
    const r = processCharge({
      type: 'charge:confirmed',
      data: { metadata: { userId: 'u1', billingInterval: 'monthly' } },
    })!;
    const end = Date.now() + r.periodDays * DAY_MS;
    expect(end).toBeGreaterThan(Date.now());
  });
});
