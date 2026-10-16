// Display-side view of the free-tier daily signal allowance and plan status.
//
// The authoritative gate (and the counter mutation) is the `consume_signal`
// Postgres RPC (migrations 0003/0009), called server-side by
// /api/signals/record. These
// helpers only compute what the UI should SHOW, and they mirror that RPC
// exactly so the dashboard, metric strip, settings page and signals page can
// never disagree with the server:
//   - 'pro' is unlimited; every other status (free, cancelled, anything
//     unexpected) is metered. A one-off crypto Pro whose period has ended is
//     metered too, even before the expiry cron flips the row (isEffectivePro).
//   - The counter resets on a UTC calendar-day boundary: if the stored
//     last_reset_date falls on an earlier UTC day than "now", the stored
//     signals_used_today is stale and the user effectively has the full
//     allowance again (the RPC persists the reset on the next consume).

import { isEffectivePro } from '@/lib/subscription-rules';

/** Free-tier signals per UTC day. Must match the `>= 5` cap in consume_signal. */
export const FREE_DAILY_SIGNAL_LIMIT = 5;

/** True only for an active Pro plan. 'cancelled' and unknown values are non-Pro. */
export function isProStatus(status: string | null | undefined): boolean {
  return status === 'pro';
}

export interface ProSubscriptionView {
  status: string | null | undefined;
  planId?: string | null;
  currentPeriodEnd?: Date | string | null;
}

/**
 * True when the subscription currently grants Pro access: status 'pro' and, for
 * a one-off crypto plan, a period end that has not passed yet. Prefer this over
 * isProStatus wherever the plan id / period end are available.
 */
export function isProSubscription(
  sub: ProSubscriptionView | null | undefined,
  now: Date = new Date()
): boolean {
  if (!sub) return false;
  const end = sub.currentPeriodEnd;
  return isEffectivePro(
    {
      status: sub.status,
      planId: sub.planId ?? null,
      currentPeriodEnd: end instanceof Date ? (Number.isNaN(end.getTime()) ? null : end.toISOString()) : end ?? null,
    },
    now.getTime()
  );
}

export interface AllowanceSubscription extends ProSubscriptionView {
  signalsUsedToday?: number | null;
  lastResetDate?: Date | string | number | null;
}

function utcDayIndex(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Signals the user effectively has used today (UTC). Returns 0 when the stored
 * counter belongs to an earlier UTC day. A missing or unparseable reset date is
 * treated as "earlier day" — the same as the RPC, where the column is NOT NULL
 * and any stale value resets.
 */
export function signalsUsedToday(sub: AllowanceSubscription, now: Date = new Date()): number {
  const rawUsed = Number(sub.signalsUsedToday ?? 0);
  const used = Number.isFinite(rawUsed) && rawUsed > 0 ? Math.floor(rawUsed) : 0;

  if (sub.lastResetDate === null || sub.lastResetDate === undefined) return 0;
  const reset = sub.lastResetDate instanceof Date ? sub.lastResetDate : new Date(sub.lastResetDate);
  if (Number.isNaN(reset.getTime())) return 0;

  return utcDayIndex(now) > utcDayIndex(reset) ? 0 : used;
}

/**
 * Remaining free signals for today, or -1 for Pro (unlimited), matching the
 * `remaining` field returned by consume_signal. Never negative for free users.
 */
export function remainingFreeSignals(
  sub: AllowanceSubscription | null | undefined,
  now: Date = new Date()
): number {
  if (!sub) return 0;
  if (isProSubscription(sub, now)) return -1;
  return Math.max(0, FREE_DAILY_SIGNAL_LIMIT - signalsUsedToday(sub, now));
}
