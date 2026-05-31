import { computeKeyLevels } from '../../src/services/ai/levels';

interface C { open: number; high: number; low: number; close: number; volume: number; time: number; }

// Build candles with deliberate swing highs/lows around a rising-then-settling path.
function makeCandles(closes: number[]): C[] {
  return closes.map((close, i) => ({
    time: i * 3600000,
    open: close,
    high: close + 2,
    low: close - 2,
    close,
    volume: 1000,
  }));
}

describe('computeKeyLevels', () => {
  it('returns empty levels for too-few candles', () => {
    const r = computeKeyLevels(makeCandles([100, 101]) as any);
    expect(r.supports).toEqual([]);
    expect(r.resistances).toEqual([]);
    expect(r.pivot).toBeGreaterThan(0);
  });

  it('supports sit below and resistances above the current price', () => {
    // zig-zag so swing points form on both sides of the final price
    const closes = [100, 110, 95, 120, 90, 130, 85, 125, 100, 115, 105];
    const r = computeKeyLevels(makeCandles(closes) as any);
    const price = closes[closes.length - 1];
    r.supports.forEach(s => expect(s).toBeLessThan(price));
    r.resistances.forEach(res => expect(res).toBeGreaterThan(price));
  });

  it('orders supports nearest-first (desc) and resistances nearest-first (asc)', () => {
    const closes = [100, 120, 80, 130, 70, 140, 75, 135, 90, 125, 105];
    const r = computeKeyLevels(makeCandles(closes) as any);
    for (let i = 1; i < r.supports.length; i++) {
      expect(r.supports[i]).toBeLessThan(r.supports[i - 1]);
    }
    for (let i = 1; i < r.resistances.length; i++) {
      expect(r.resistances[i]).toBeGreaterThan(r.resistances[i - 1]);
    }
  });

  it('computes a positive pivot from the last candle', () => {
    const r = computeKeyLevels(makeCandles([100, 101, 102, 103, 104, 105]) as any);
    expect(r.pivot).toBeCloseTo((107 + 103 + 105) / 3, 5); // last close 105 -> high 107, low 103
  });
});
