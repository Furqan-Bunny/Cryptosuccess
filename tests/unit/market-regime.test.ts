import { detectMarketRegime, RegimeAnalysis } from '../../src/services/ai/market-regime.service';

// Seeded (mulberry32) noise so every run sees the same candles — Math.random
// made the regime assertions flaky.
function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateTrendingCandles(count: number, direction: 'up' | 'down', seed = 7) {
  const rand = seededRandom(seed);
  const candles = [];
  let price = 100;
  const step = direction === 'up' ? 1.5 : -1.5;
  for (let i = 0; i < count; i++) {
    price += step + (rand() - 0.5) * 0.3;
    candles.push({
      open: price - 0.5,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1000,
    });
  }
  return candles;
}

function generateRangingCandles(count: number, seed = 11) {
  const rand = seededRandom(seed);
  const candles = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    price = 100 + Math.sin(i * 0.3) * 2 + (rand() - 0.5) * 0.5;
    candles.push({
      open: price - 0.2,
      high: price + 0.5,
      low: price - 0.5,
      close: price,
      volume: 1000,
    });
  }
  return candles;
}

describe('detectMarketRegime', () => {
  it('returns all required fields', () => {
    const candles = generateTrendingCandles(60, 'up');
    const result = detectMarketRegime(candles);
    expect(result).toHaveProperty('regime');
    expect(result).toHaveProperty('adx');
    expect(result).toHaveProperty('atrPercent');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('description');
  });

  it('detects uptrend with trending up data', () => {
    const candles = generateTrendingCandles(60, 'up');
    const result = detectMarketRegime(candles);
    expect(['trending_up', 'volatile']).toContain(result.regime);
  });

  it('detects downtrend with trending down data', () => {
    const candles = generateTrendingCandles(60, 'down');
    const result = detectMarketRegime(candles);
    expect(['trending_down', 'volatile']).toContain(result.regime);
  });

  it('detects ranging with flat data', () => {
    const candles = generateRangingCandles(60);
    const result = detectMarketRegime(candles);
    expect(['ranging', 'volatile']).toContain(result.regime);
  });

  it('confidence is between 0 and 95', () => {
    const candles = generateTrendingCandles(60, 'up');
    const result = detectMarketRegime(candles);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(95);
  });

  it('ADX is non-negative', () => {
    const candles = generateTrendingCandles(60, 'up');
    const result = detectMarketRegime(candles);
    expect(result.adx).toBeGreaterThanOrEqual(0);
  });

  it('ATR percent is non-negative', () => {
    const candles = generateRangingCandles(60);
    const result = detectMarketRegime(candles);
    expect(result.atrPercent).toBeGreaterThanOrEqual(0);
  });
});
