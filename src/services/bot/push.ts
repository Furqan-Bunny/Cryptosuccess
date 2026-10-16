// Scheduled push ("daily alerts") rules. Pure (no I/O) so eligibility — the part
// that controls cost and spam — is unit-tested. The cron job that applies them
// lives with the channel (services/telegram/push-job.ts).
import { isSupportedCoin } from '@/lib/coins';

/** Minimum gap between two pushes to the same chat. */
export const PUSH_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20h
/** Coins per push (cost + message length cap). */
export const MAX_PUSH_COINS = 3;

export interface PushCandidate {
  alertsEnabled: boolean;
  /** Linked CryptoSuccess account id, or null when the chat isn't linked. */
  linkedUserId: string | null;
  /** Effective plan of the linked account: 'pro' only while Pro access is current. */
  subscriptionStatus: string | null;
  lastPushAt: string | null;
  /** Channel chat id. Telegram group chats have negative ids and never get pushes. */
  chatId: string;
}

export type PushSkipReason = 'alerts_off' | 'not_linked' | 'not_pro' | 'too_soon' | 'not_private';

/** Why a chat should NOT be pushed right now, or null when it is eligible. */
export function pushSkipReason(c: PushCandidate, now: number): PushSkipReason | null {
  if (!c.alertsEnabled) return 'alerts_off';
  if (!/^\d+$/.test(c.chatId)) return 'not_private';
  if (!c.linkedUserId) return 'not_linked';
  if (c.subscriptionStatus !== 'pro') return 'not_pro';
  if (c.lastPushAt) {
    const last = Date.parse(c.lastPushAt);
    // An unparseable timestamp is treated as "just pushed" (fail safe: no spam).
    if (!Number.isFinite(last) || now - last < PUSH_MIN_INTERVAL_MS) return 'too_soon';
  }
  return null;
}

export function isPushEligible(c: PushCandidate, now: number): boolean {
  return pushSkipReason(c, now) === null;
}

/** The coins a push covers: supported, de-duplicated, at most MAX_PUSH_COINS. */
export function pushCoinsFor(coins: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of coins) {
    const s = String(raw).toUpperCase();
    if (isSupportedCoin(s) && !out.includes(s)) out.push(s);
    if (out.length >= MAX_PUSH_COINS) break;
  }
  return out;
}

/** ISO cutoff: a chat whose last push is before this may be pushed again. */
export function pushCutoffIso(now: number): string {
  return new Date(now - PUSH_MIN_INTERVAL_MS).toISOString();
}
