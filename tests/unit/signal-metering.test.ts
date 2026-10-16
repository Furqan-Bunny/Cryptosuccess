// Tests for the metering + track-record fixes:
//   - getSignalStats excludes HOLD from the win rate (computeSignalStats)
//   - the shared scorer stores direction-correct P/L for SELL (short)
//   - the daily limit resets on a UTC calendar-day boundary (not local midnight)
import { deriveOutcome } from '../../src/lib/signal-outcome';
import { remainingFreeSignals } from '../../src/lib/signal-allowance';
import { computeSignalStats as stats } from '../../src/lib/signal-stats';

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

describe('scored P/L direction (deriveOutcome)', () => {
  const pl = (action: 'BUY' | 'SELL', entry: number, current: number) =>
    deriveOutcome({ action, entryPrice: entry, targetPrice: action === 'BUY' ? 1e9 : 0, stopLoss: action === 'BUY' ? 0 : 1e9 }, current)
      .profitLossPercent;

  it('SELL (short) profits when price falls — sign inverted', () => {
    expect(pl('SELL', 100, 90)).toBeCloseTo(10);    // short gained 10%
    expect(pl('SELL', 100, 110)).toBeCloseTo(-10);  // short lost 10%
  });
  it('BUY profits when price rises', () => {
    expect(pl('BUY', 100, 110)).toBeCloseTo(10);
    expect(pl('BUY', 100, 90)).toBeCloseTo(-10);
  });
});

describe('daily limit UTC reset boundary (remainingFreeSignals)', () => {
  it('resets when the last reset is an earlier UTC day', () => {
    const now = new Date('2026-06-24T00:30:00Z');
    const lastResetDate = new Date('2026-06-23T23:50:00Z');
    expect(remainingFreeSignals({ status: 'free', signalsUsedToday: 5, lastResetDate }, now)).toBe(5);
  });
  it('does not reset within the same UTC day', () => {
    const now = new Date('2026-06-24T23:00:00Z');
    const lastResetDate = new Date('2026-06-24T01:00:00Z');
    expect(remainingFreeSignals({ status: 'free', signalsUsedToday: 5, lastResetDate }, now)).toBe(0);
  });
});
