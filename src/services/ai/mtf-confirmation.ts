// Pure multi-timeframe confirmation. Given an entry-timeframe signal and the
// trend on higher (confirmation) timeframes, it boosts/cuts confidence and —
// per the "don't trade against the higher timeframe" rule — downgrades a signal
// to HOLD when a strong higher-timeframe trend opposes it.

import type { TimeframeSummary } from '../market-context.service';

export type SignalAction = 'BUY' | 'SELL' | 'HOLD';

export interface MtfTrendEntry {
  tf: string;
  trend: 'up' | 'down';
  regime: string;
  adx: number;
  agrees: boolean | null; // null when the entry signal is HOLD (no direction)
}

export interface MtfResult {
  action: SignalAction;
  confidence: number;
  confluencePct: number; // % of confirm timeframes that agree with the direction
  breakdown: MtfTrendEntry[];
  note: string;
}

export function applyMtfConfirmation(
  action: SignalAction,
  confidence: number,
  summaries: { tf: string; summary: TimeframeSummary }[],
  biasTF?: string
): MtfResult {
  const breakdown: MtfTrendEntry[] = summaries.map(({ tf, summary }) => {
    let agrees: boolean | null = null;
    if (action === 'BUY') agrees = summary.trend === 'up';
    else if (action === 'SELL') agrees = summary.trend === 'down';
    return { tf, trend: summary.trend, regime: summary.regime, adx: summary.adx, agrees };
  });

  if (action === 'HOLD') {
    return { action, confidence, confluencePct: 0, breakdown, note: 'No directional bias to confirm.' };
  }

  const directional = breakdown.filter(b => b.agrees !== null);
  const agreeCount = directional.filter(b => b.agrees).length;
  const total = directional.length || 1;
  const confluencePct = Math.round((agreeCount / total) * 100);

  // Dominant higher timeframe: the explicit bias TF (long horizons) else the highest confirm TF.
  const dominant = (biasTF && breakdown.find(b => b.tf === biasTF)) || breakdown[breakdown.length - 1];
  const dominantOpposes = !!dominant && dominant.agrees === false && dominant.adx >= 25;

  let resultAction: SignalAction = action;
  let adjusted = confidence;
  let note: string;

  if (dominantOpposes) {
    // Strong higher-timeframe trend against the signal → stand aside.
    resultAction = 'HOLD';
    adjusted = Math.min(confidence, 35);
    note = `Higher timeframe (${dominant.tf}) is in a strong opposing trend — downgraded to HOLD.`;
  } else if (confluencePct >= 100) {
    adjusted = confidence * 1.1;
    note = 'All higher timeframes confirm the direction.';
  } else if (confluencePct >= 50) {
    note = 'Partially confirmed by higher timeframes.';
  } else {
    adjusted = confidence * 0.8;
    note = 'Higher timeframes largely disagree — confidence reduced.';
  }

  adjusted = Math.min(Math.max(adjusted, 5), 85);
  return {
    action: resultAction,
    confidence: Math.round(adjusted * 10) / 10,
    confluencePct,
    breakdown,
    note,
  };
}
