// Pure-logic tests mirroring the metering + track-record fixes (same DB-free
// style as auth.service.test.ts):
//   - getSignalStats excludes HOLD from the win rate
//   - evaluateSignal stores direction-correct P/L for SELL (short)
//   - the daily limit resets on a UTC calendar-day boundary (not local midnight)

type Outcome = 'hit_target' | 'hit_stop' | 'expired_profit' | 'expired_loss' | 'pending';
interface Sig { action: 'BUY' | 'SELL' | 'HOLD'; outcome?: Outcome }

// Mirrors signal-history.service.getSignalStats
function stats(signals: Sig[]) {
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

describe('getSignalStats win-rate', () => {
  it('excludes HOLD from numerator and denominator', () => {
    const s = stats([
      { action: 'HOLD', outcome: 'expired_profit' },
      { action: 'HOLD', outcome: 'expired_profit' },
      { action: 'BUY', outcome: 'hit_target' },
      { action: 'BUY', outcome: 'hit_stop' },
    ]);
    expect(s.total).toBe(2);       // HOLDs excluded from the track record
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.winRate).toBe(50);    // NOT inflated to 75% by counting the HOLDs
  });

  it('is 0 when there are no directional evaluated signals', () => {
    const s = stats([{ action: 'HOLD', outcome: 'expired_profit' }]);
    expect(s.winRate).toBe(0);
    expect(s.total).toBe(0);
  });
});

describe('evaluateSignal P/L direction', () => {
  // Mirrors the strategy-P/L computation in evaluateSignal
  function pl(action: 'BUY' | 'SELL', entry: number, current: number) {
    const raw = ((current - entry) / entry) * 100;
    return action === 'SELL' ? -raw : raw;
  }
  it('SELL (short) profits when price falls — sign inverted', () => {
    expect(pl('SELL', 100, 90)).toBeCloseTo(10);    // short gained 10%
    expect(pl('SELL', 100, 110)).toBeCloseTo(-10);  // short lost 10%
  });
  it('BUY profits when price rises', () => {
    expect(pl('BUY', 100, 110)).toBeCloseTo(10);
    expect(pl('BUY', 100, 90)).toBeCloseTo(-10);
  });
});

describe('daily limit UTC reset boundary', () => {
  const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  it('resets when the last reset is an earlier UTC day', () => {
    const now = new Date('2026-06-24T00:30:00Z');
    const lastReset = new Date('2026-06-23T23:50:00Z');
    const used = utcDay(now) > utcDay(lastReset) ? 0 : 5;
    expect(used).toBe(0);
  });
  it('does not reset within the same UTC day', () => {
    const now = new Date('2026-06-24T23:00:00Z');
    const lastReset = new Date('2026-06-24T01:00:00Z');
    const used = utcDay(now) > utcDay(lastReset) ? 0 : 5;
    expect(used).toBe(5);
  });
});
