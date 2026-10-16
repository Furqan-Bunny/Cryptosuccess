// Deterministic signal-outcome scoring, shared by the client display service
// (signal-history.service) and the server-side evaluation cron
// (api/signals/evaluate) so there is ONE implementation and no drift. The
// server path is authoritative — its result is what gets anchored on-chain.

export type SignalAction = 'BUY' | 'SELL' | 'HOLD';
export type SignalOutcome = 'hit_target' | 'hit_stop' | 'expired_profit' | 'expired_loss';

export interface OutcomeInput {
  action: SignalAction;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
}

export interface OutcomeResult {
  outcome: SignalOutcome;
  // STRATEGY P/L (not raw spot move): a SELL (short) profits when price falls,
  // so the sign is inverted. This makes the value directionally correct
  // everywhere it's displayed.
  profitLossPercent: number;
}

// A directional call only counts as a win when price actually moved its way. A
// flat result (exactly 0%) is not a win: real fees make it a small loss, and a
// zero move is also what a frozen / halted price produces, which must never
// inflate the record. Only BUY/SELL scoring changes; already-scored rows (and
// their anchored leaves) are never re-scored.
export function isDirectionalWin(profitLossPercent: number): boolean {
  return profitLossPercent > 0;
}

// Pure: same (signal, currentPrice) always yields the same outcome + P/L.
// Mirrors the original inline logic in signal-history.service.evaluateSignal.
export function deriveOutcome(signal: OutcomeInput, currentPrice: number): OutcomeResult {
  const rawSpotPercent = ((currentPrice - signal.entryPrice) / signal.entryPrice) * 100;
  const profitLossPercent = signal.action === 'SELL' ? -rawSpotPercent : rawSpotPercent;

  let outcome: SignalOutcome;
  if (signal.action === 'BUY') {
    if (currentPrice >= signal.targetPrice) outcome = 'hit_target';
    else if (currentPrice <= signal.stopLoss) outcome = 'hit_stop';
    else outcome = isDirectionalWin(profitLossPercent) ? 'expired_profit' : 'expired_loss';
  } else if (signal.action === 'SELL') {
    if (currentPrice <= signal.targetPrice) outcome = 'hit_target';
    else if (currentPrice >= signal.stopLoss) outcome = 'hit_stop';
    // profitLossPercent is already direction-adjusted, so the test matches BUY.
    else outcome = isDirectionalWin(profitLossPercent) ? 'expired_profit' : 'expired_loss';
  } else {
    // HOLD is non-directional; always scores as a (neutral) profit and is
    // excluded from the win-rate elsewhere.
    outcome = 'expired_profit';
  }

  return { outcome, profitLossPercent };
}
