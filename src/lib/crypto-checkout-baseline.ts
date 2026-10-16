// Remembers the Pro period end a user had when they left for a crypto checkout,
// so the success page can tell a NEW confirmed payment apart from Pro that was
// already active (an "Extend with crypto" payment returns to the same page
// while the old period is still running).
//
// Display hint only: it lives in sessionStorage, is never sent to the server and
// grants nothing. Pro itself is only ever granted by the confirmed-payment
// webhook.

const STORAGE_KEY = 'cs.cryptoCheckoutBaseline';
// Older hints are ignored; a crypto invoice expires well within this.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface CryptoCheckoutBaseline {
  /** Pro period end (epoch ms) before this checkout, or null if not Pro. */
  periodEndMs: number | null;
  /** When the checkout was started (epoch ms). */
  startedAt: number;
}

/**
 * Has the payment started at `baseline` shown up on the profile? True only when
 * the user is Pro now AND the period end moved past what it was before (a first
 * purchase moves it from "none" to a date). Without a baseline we can't tell,
 * so the answer is null.
 */
export function cryptoPaymentApplied(
  baseline: CryptoCheckoutBaseline | null,
  isProNow: boolean,
  periodEndNowMs: number | null
): boolean | null {
  if (!baseline) return null;
  if (!isProNow || periodEndNowMs == null) return false;
  if (baseline.periodEndMs == null) return true;
  return periodEndNowMs > baseline.periodEndMs;
}

/** Parse a stored baseline, rejecting anything malformed or stale. */
export function parseCryptoBaseline(raw: string | null, nowMs: number = Date.now()): CryptoCheckoutBaseline | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<CryptoCheckoutBaseline>;
    if (typeof v.startedAt !== 'number' || !Number.isFinite(v.startedAt)) return null;
    if (nowMs - v.startedAt > MAX_AGE_MS || v.startedAt > nowMs + 60_000) return null;
    const end = v.periodEndMs;
    if (end !== null && (typeof end !== 'number' || !Number.isFinite(end))) return null;
    return { periodEndMs: end ?? null, startedAt: v.startedAt };
  } catch {
    return null;
  }
}

export function saveCryptoBaseline(periodEnd: Date | string | null | undefined): void {
  try {
    const t = periodEnd ? new Date(periodEnd).getTime() : NaN;
    const value: CryptoCheckoutBaseline = {
      periodEndMs: Number.isFinite(t) ? t : null,
      startedAt: Date.now(),
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable: the success page falls back to a neutral message */
  }
}

export function loadCryptoBaseline(): CryptoCheckoutBaseline | null {
  try {
    return parseCryptoBaseline(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearCryptoBaseline(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
