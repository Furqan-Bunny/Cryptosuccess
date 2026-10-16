// Track-record summary for a list of recorded signals. Pure, so the win-rate
// rule is tested directly (tests/unit/signal-metering.test.ts).
//
// Only directional calls (BUY/SELL) count toward the track record. HOLD is
// non-directional and always scores 'expired_profit', so counting it would
// inflate the win rate. It is excluded from both numerator and denominator.

export interface StatsSignal {
  action: string;
  outcome?: string | null;
}

export interface SignalStats {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
}

export function computeSignalStats(signals: readonly StatsSignal[]): SignalStats {
  const directional = signals.filter(s => s.action !== 'HOLD');
  const evaluated = directional.filter(s => s.outcome && s.outcome !== 'pending');
  const wins = evaluated.filter(s => s.outcome === 'hit_target' || s.outcome === 'expired_profit').length;
  const losses = evaluated.filter(s => s.outcome === 'hit_stop' || s.outcome === 'expired_loss').length;
  return {
    total: directional.length,
    wins,
    losses,
    pending: directional.length - evaluated.length,
    winRate: evaluated.length > 0 ? (wins / evaluated.length) * 100 : 0,
  };
}
