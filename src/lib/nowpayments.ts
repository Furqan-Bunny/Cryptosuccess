// Pure pieces of the NOWPayments IPN webhook (/api/crypto/webhook): signature
// verification and order parsing. No I/O so they are unit-tested directly.
import { createHmac, timingSafeEqual } from 'crypto';
import type { BillingInterval } from '@/types/subscription.types';
import { isUuid } from '@/lib/uuid';

// NOWPayments signs the IPN as HMAC-SHA512 of the JSON body with its keys sorted
// (recursively), hex-encoded, in the `x-nowpayments-sig` header. Reproduce exactly.
export function sortObject(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObject);
  if (obj && typeof obj === 'object') {
    const src = obj as Record<string, unknown>;
    return Object.keys(src)
      .sort()
      .reduce((acc: Record<string, unknown>, key) => {
        acc[key] = sortObject(src[key]);
        return acc;
      }, {});
  }
  return obj;
}

export function signNowpaymentsPayload(payload: unknown, secret: string): string {
  return createHmac('sha512', secret).update(JSON.stringify(sortObject(payload))).digest('hex');
}

/** Constant-time check of the `x-nowpayments-sig` header against the payload. */
export function verifyNowpaymentsSignature(payload: unknown, signature: string, secret: string): boolean {
  if (!secret || !signature) return false;
  const a = Buffer.from(signature);
  const b = Buffer.from(signNowpaymentsPayload(payload, secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Only a completed payment grants access; everything else is acknowledged. */
export function isCompletedPayment(status: unknown): boolean {
  return status === 'finished' || status === 'confirmed';
}

/**
 * order_id is `${userId}:${interval}`, set server-side at checkout. Returns null
 * for anything that is not exactly a UUID plus monthly | yearly.
 */
export function parseCryptoOrderId(orderId: unknown): { userId: string; interval: BillingInterval } | null {
  const raw = typeof orderId === 'string' ? orderId : '';
  const sep = raw.indexOf(':');
  if (sep <= 0) return null;
  const userId = raw.slice(0, sep);
  const interval = raw.slice(sep + 1);
  if (!isUuid(userId)) return null;
  if (interval !== 'monthly' && interval !== 'yearly') return null;
  return { userId, interval };
}
