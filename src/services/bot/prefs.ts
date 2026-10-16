// Chat personalization: risk level, followed coins, daily alerts. Pure parsing +
// validation (no I/O) so the rules are unit-tested; the DB enforces the same
// shape with CHECK constraints (migration 0010).
import { isSupportedCoin } from '@/lib/coins';
import type { ChatPrefs, RiskLevel } from './types';

export const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high'];
export const MAX_COINS = 5;
export const DEFAULT_PREFS: ChatPrefs = {
  riskLevel: 'medium',
  coins: ['BTC', 'ETH'],
  alertsEnabled: false,
  lastPushAt: null,
};

/**
 * Per-trade risk budget (% of account lost if the stop is hit) for each level.
 * The honest-coach ceiling is 2% — "high" is NOT allowed to exceed it.
 */
export const RISK_BUDGET: Record<RiskLevel, { minPct: number; maxPct: number }> = {
  low: { minPct: 0.5, maxPct: 1 },
  medium: { minPct: 1, maxPct: 2 },
  high: { minPct: 2, maxPct: 2 },
};

/** Absolute per-trade risk ceiling, whatever the user's setting. */
export const MAX_RISK_PCT = 2;

export function isRiskLevel(v: unknown): v is RiskLevel {
  return typeof v === 'string' && (RISK_LEVELS as string[]).includes(v);
}

/** Risk budget for a level, clamped to the 2% ceiling (defensive against bad data). */
export function riskBudget(level: RiskLevel | null | undefined): { minPct: number; maxPct: number } {
  const b = RISK_BUDGET[isRiskLevel(level) ? level : DEFAULT_PREFS.riskLevel];
  return { minPct: Math.min(b.minPct, MAX_RISK_PCT), maxPct: Math.min(b.maxPct, MAX_RISK_PCT) };
}

/** Human-readable budget, e.g. "0.5–1%" or "2%". */
export function riskBudgetLabel(level: RiskLevel | null | undefined): string {
  const { minPct, maxPct } = riskBudget(level);
  return minPct === maxPct ? `${maxPct}%` : `${minPct}–${maxPct}%`;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** `/risk <level>` argument. Accepts "med" as a short form. */
export function parseRiskArg(arg: string): ParseResult<RiskLevel> {
  const v = arg.trim().toLowerCase();
  if (!v) return { ok: false, error: 'missing' };
  const level = v === 'med' ? 'medium' : v;
  return isRiskLevel(level) ? { ok: true, value: level } : { ok: false, error: 'invalid' };
}

export type CoinsParseError =
  | { kind: 'missing' }
  | { kind: 'unsupported'; symbols: string[] }
  | { kind: 'too_many'; count: number };

/**
 * `/coins BTC ETH SOL` argument (spaces and/or commas). Uppercases, de-dupes,
 * validates every symbol against the coin catalogue and caps the list at 5.
 */
export function parseCoinsArg(arg: string): { ok: true; value: string[] } | { ok: false; error: CoinsParseError } {
  const tokens = arg
    .split(/[\s,]+/)
    .map(t => t.replace(/[^a-z0-9]/gi, '').toUpperCase())
    .filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: { kind: 'missing' } };

  const unique = Array.from(new Set(tokens));
  const unsupported = unique.filter(s => !isSupportedCoin(s));
  if (unsupported.length) {
    // Echo back at most a few, truncated — this text is user input.
    return { ok: false, error: { kind: 'unsupported', symbols: unsupported.slice(0, 5).map(s => s.slice(0, 12)) } };
  }
  if (unique.length > MAX_COINS) return { ok: false, error: { kind: 'too_many', count: unique.length } };
  return { ok: true, value: unique };
}

/** `/alerts on|off` argument. */
export function parseToggleArg(arg: string): ParseResult<boolean> {
  const v = arg.trim().toLowerCase();
  if (!v) return { ok: false, error: 'missing' };
  if (['on', 'yes', 'enable', 'start'].includes(v)) return { ok: true, value: true };
  if (['off', 'no', 'disable', 'stop'].includes(v)) return { ok: true, value: false };
  return { ok: false, error: 'invalid' };
}

/**
 * Normalize a prefs row from the DB (snake_case) into ChatPrefs, falling back
 * to defaults for anything missing or malformed.
 */
export function prefsFromRow(row: {
  risk_level?: unknown;
  coins?: unknown;
  alerts_enabled?: unknown;
  last_push_at?: unknown;
} | null | undefined): ChatPrefs {
  if (!row) return { ...DEFAULT_PREFS, coins: [...DEFAULT_PREFS.coins] };
  const coins = Array.isArray(row.coins)
    ? Array.from(new Set(row.coins.filter((c): c is string => typeof c === 'string' && isSupportedCoin(c)).map(c => c.toUpperCase()))).slice(0, MAX_COINS)
    : [];
  return {
    riskLevel: isRiskLevel(row.risk_level) ? row.risk_level : DEFAULT_PREFS.riskLevel,
    coins: coins.length ? coins : [...DEFAULT_PREFS.coins],
    alertsEnabled: row.alerts_enabled === true,
    lastPushAt: typeof row.last_push_at === 'string' ? row.last_push_at : null,
  };
}
