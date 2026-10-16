// The per-trade risk rule shared by the website and the bot, so the two can
// never drift: risk (what you lose if the stop is hit) is at most 1–2% of the
// account. Position SIZE is a different number — a coin profile's
// maxPositionSizePct caps how much of the portfolio sits in one position, and
// must never be presented as the amount to risk. Pure (no I/O) and unit-tested.

/** Usual per-trade risk floor, % of the account. */
export const MIN_RISK_PCT = 1;
/** Absolute per-trade risk ceiling, % of the account, whatever the setting. */
export const MAX_RISK_PCT = 2;

export interface RiskNoteInput {
  symbol: string;
  volatilityClass: string;
  typicalATRPercent: number;
  maxPositionSizePct: number;
  /** Stop-loss already formatted for display, e.g. "$61,250.00". */
  stopLabel: string;
  /** Distance from entry to stop in %, either sign (shown as a magnitude). */
  stopDistancePct: number;
}

/** The risk paragraph of a web signal report. */
export function buildRiskNote(input: RiskNoteInput): string {
  const dist = Math.abs(input.stopDistancePct);
  const distLabel = Number.isFinite(dist) ? `${dist.toFixed(1)}% away` : 'see the levels above';
  return (
    `${input.symbol} carries ${input.volatilityClass} volatility (ATR ≈ ${input.typicalATRPercent}% of price). ` +
    `Keep this position to at most ~${input.maxPositionSizePct}% of your portfolio, and size it so that ` +
    `hitting the stop at ${input.stopLabel} (${distLabel}) costs no more than ` +
    `${MIN_RISK_PCT}–${MAX_RISK_PCT}% of your account.`
  );
}
