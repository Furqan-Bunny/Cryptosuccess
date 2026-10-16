// Builds the in-app notification a user receives when the evaluation cron
// (/api/signals/evaluate) finalizes one of their signals. Pure so the wording
// is unit-tested and stays honest: losses are reported exactly as plainly as
// wins, with the real strategy P/L, and HOLD is described as what it is (a
// non-directional call that does not count toward the win rate).

import type { SignalAction, SignalOutcome } from './signal-outcome';

export interface ScoredSignal {
  id: string;
  symbol: string;
  action: SignalAction;
  outcome: SignalOutcome;
  /** Direction-adjusted strategy P/L from deriveOutcome (SELL already inverted). */
  profitLossPercent: number;
  entryPrice: number;
  priceAt24h: number;
}

export interface SignalNotificationContent {
  type: 'signal';
  title: string;
  message: string;
  data: { signalId: string };
}

const OUTCOME_LABEL: Record<SignalOutcome, string> = {
  hit_target: 'target reached',
  hit_stop: 'stopped out',
  expired_profit: 'closed in profit',
  expired_loss: 'closed at a loss',
};

/** "+1.2%" / "-2.1%" / "0.0%" with one decimal. */
export function formatSignedPercent(value: number): string {
  if (!Number.isFinite(value)) return '0.0%';
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return '0.0%';
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`;
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  // Keep sub-dollar coins readable (e.g. PEPE, SHIB) without flooding digits.
  const digits = value >= 1 ? 2 : value >= 0.01 ? 4 : 8;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;
}

export function buildSignalScoredNotification(signal: ScoredSignal): SignalNotificationContent {
  const symbol = String(signal.symbol).toUpperCase();
  const pct = formatSignedPercent(signal.profitLossPercent);
  const move = `${formatUsd(signal.entryPrice)} → ${formatUsd(signal.priceAt24h)}`;

  if (signal.action === 'HOLD') {
    return {
      type: 'signal',
      title: `${symbol} HOLD checked after 24h: price ${pct}`,
      message: `Your ${symbol} HOLD call was checked after 24h (${move}). HOLD is non-directional, so it does not count toward your win rate.`,
      data: { signalId: signal.id },
    };
  }

  const label = OUTCOME_LABEL[signal.outcome] ?? 'scored';
  const isLoss = signal.outcome === 'hit_stop' || signal.outcome === 'expired_loss';
  return {
    type: 'signal',
    title: `${symbol} ${signal.action} scored: ${label}, ${pct}`,
    message:
      `Your ${symbol} ${signal.action} signal was scored after 24h (${move}, ${pct}). ` +
      (isLoss
        ? 'Losses are part of the record and count toward your win rate.'
        : 'One result is not a trend; judge the signals by the full track record.'),
    data: { signalId: signal.id },
  };
}
