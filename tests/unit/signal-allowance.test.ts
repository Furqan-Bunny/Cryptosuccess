import {
  FREE_DAILY_SIGNAL_LIMIT,
  isProStatus,
  remainingFreeSignals,
  signalsUsedToday,
} from '../../src/lib/signal-allowance';

// The display helper must mirror consume_signal (migration 0003): Pro is
// unlimited (-1), everything else is metered 5/day, reset on a UTC calendar day.

describe('isProStatus', () => {
  it('only treats "pro" as Pro', () => {
    expect(isProStatus('pro')).toBe(true);
    expect(isProStatus('free')).toBe(false);
    expect(isProStatus('cancelled')).toBe(false);
    expect(isProStatus('premium')).toBe(false);
    expect(isProStatus(undefined)).toBe(false);
    expect(isProStatus(null)).toBe(false);
  });
});

describe('remainingFreeSignals', () => {
  const now = new Date('2026-06-24T12:00:00Z');

  it('returns -1 (unlimited) for Pro regardless of the counter', () => {
    expect(remainingFreeSignals({ status: 'pro', signalsUsedToday: 100, lastResetDate: now }, now)).toBe(-1);
  });

  it('meters free users within the same UTC day', () => {
    const sameDay = new Date('2026-06-24T01:00:00Z');
    expect(remainingFreeSignals({ status: 'free', signalsUsedToday: 0, lastResetDate: sameDay }, now)).toBe(5);
    expect(remainingFreeSignals({ status: 'free', signalsUsedToday: 3, lastResetDate: sameDay }, now)).toBe(2);
    expect(remainingFreeSignals({ status: 'free', signalsUsedToday: 5, lastResetDate: sameDay }, now)).toBe(0);
  });

  it('never goes negative when the counter exceeds the cap', () => {
    expect(remainingFreeSignals({ status: 'free', signalsUsedToday: 8, lastResetDate: now }, now)).toBe(0);
  });

  it('meters cancelled users like free users (not-Pro is not-Pro)', () => {
    expect(remainingFreeSignals({ status: 'cancelled', signalsUsedToday: 4, lastResetDate: now }, now)).toBe(1);
  });

  it('shows the full allowance when the stored counter is from an earlier UTC day', () => {
    const lastNight = new Date('2026-06-23T23:50:00Z');
    const justAfterMidnight = new Date('2026-06-24T00:30:00Z');
    expect(
      remainingFreeSignals({ status: 'free', signalsUsedToday: 5, lastResetDate: lastNight }, justAfterMidnight)
    ).toBe(FREE_DAILY_SIGNAL_LIMIT);
  });

  it('does not reset at LOCAL midnight, only at the UTC boundary', () => {
    // Same UTC day even though these straddle midnight in many local zones.
    const early = new Date('2026-06-24T00:10:00Z');
    const late = new Date('2026-06-24T23:50:00Z');
    expect(remainingFreeSignals({ status: 'free', signalsUsedToday: 5, lastResetDate: early }, late)).toBe(0);
  });

  it('accepts ISO strings for the reset date', () => {
    expect(
      remainingFreeSignals({ status: 'free', signalsUsedToday: 2, lastResetDate: '2026-06-24T03:00:00Z' }, now)
    ).toBe(3);
  });

  it('treats a missing or invalid reset date as a fresh day', () => {
    expect(remainingFreeSignals({ status: 'free', signalsUsedToday: 5, lastResetDate: null }, now)).toBe(5);
    expect(remainingFreeSignals({ status: 'free', signalsUsedToday: 5, lastResetDate: 'garbage' }, now)).toBe(5);
  });

  it('returns 0 when there is no subscription data at all', () => {
    expect(remainingFreeSignals(null, now)).toBe(0);
    expect(remainingFreeSignals(undefined, now)).toBe(0);
  });
});

describe('signalsUsedToday', () => {
  const now = new Date('2026-06-24T12:00:00Z');

  it('sanitises bad counters', () => {
    expect(signalsUsedToday({ status: 'free', signalsUsedToday: -3, lastResetDate: now }, now)).toBe(0);
    expect(signalsUsedToday({ status: 'free', signalsUsedToday: NaN, lastResetDate: now }, now)).toBe(0);
    expect(signalsUsedToday({ status: 'free', signalsUsedToday: null, lastResetDate: now }, now)).toBe(0);
  });

  it('is 0 after a UTC day rollover', () => {
    expect(
      signalsUsedToday({ status: 'free', signalsUsedToday: 4, lastResetDate: '2026-06-23T10:00:00Z' }, now)
    ).toBe(0);
  });
});
