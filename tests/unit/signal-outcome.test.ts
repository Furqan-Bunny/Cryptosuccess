import { deriveOutcome } from '../../src/lib/signal-outcome';

// deriveOutcome is the single shared scorer used by the client display service
// and the authoritative server evaluation cron. These lock its behavior so the
// two can never drift, and so anchored outcomes are reproducible.

describe('deriveOutcome — BUY', () => {
  const buy = { action: 'BUY' as const, entryPrice: 100, targetPrice: 110, stopLoss: 95 };

  it('hit_target when price reaches the target', () => {
    expect(deriveOutcome(buy, 110).outcome).toBe('hit_target');
    expect(deriveOutcome(buy, 115).outcome).toBe('hit_target');
  });
  it('hit_stop when price reaches the stop', () => {
    expect(deriveOutcome(buy, 95).outcome).toBe('hit_stop');
    expect(deriveOutcome(buy, 90).outcome).toBe('hit_stop');
  });
  it('expired_profit / expired_loss between stop and target', () => {
    expect(deriveOutcome(buy, 105).outcome).toBe('expired_profit'); // up but not target
    expect(deriveOutcome(buy, 98).outcome).toBe('expired_loss');    // down but not stop
  });
  it('P/L follows spot for a long', () => {
    expect(deriveOutcome(buy, 110).profitLossPercent).toBeCloseTo(10);
    expect(deriveOutcome(buy, 98).profitLossPercent).toBeCloseTo(-2);
  });
});

describe('deriveOutcome — SELL (short)', () => {
  const sell = { action: 'SELL' as const, entryPrice: 100, targetPrice: 90, stopLoss: 105 };

  it('hit_target when price falls to the target', () => {
    expect(deriveOutcome(sell, 90).outcome).toBe('hit_target');
    expect(deriveOutcome(sell, 85).outcome).toBe('hit_target');
  });
  it('hit_stop when price rises to the stop', () => {
    expect(deriveOutcome(sell, 105).outcome).toBe('hit_stop');
    expect(deriveOutcome(sell, 110).outcome).toBe('hit_stop');
  });
  it('expired_profit / expired_loss between target and stop', () => {
    expect(deriveOutcome(sell, 96).outcome).toBe('expired_profit'); // price fell → short wins
    expect(deriveOutcome(sell, 102).outcome).toBe('expired_loss');  // price rose → short loses
  });
  it('P/L sign is inverted for a short', () => {
    expect(deriveOutcome(sell, 90).profitLossPercent).toBeCloseTo(10);  // fell 10% → +10
    expect(deriveOutcome(sell, 110).profitLossPercent).toBeCloseTo(-10); // rose 10% → -10
  });
});

describe('deriveOutcome — HOLD', () => {
  it('always scores expired_profit (non-directional)', () => {
    const hold = { action: 'HOLD' as const, entryPrice: 100, targetPrice: 100, stopLoss: 100 };
    expect(deriveOutcome(hold, 80).outcome).toBe('expired_profit');
    expect(deriveOutcome(hold, 120).outcome).toBe('expired_profit');
  });
});

describe('deriveOutcome — determinism', () => {
  it('same input yields identical result (safe to hash)', () => {
    const s = { action: 'BUY' as const, entryPrice: 42123.55, targetPrice: 44000, stopLoss: 41000 };
    expect(deriveOutcome(s, 43210.99)).toEqual(deriveOutcome(s, 43210.99));
  });
});
