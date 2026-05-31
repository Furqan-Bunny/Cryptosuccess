import { detectMarketRegime, RegimeAnalysis } from '../../src/services/ai/market-regime.service';

function generateTrendingCandles(count: number, direction: 'up' | 'down') {
  const candles = [];
  let price = 100;
  const step = direction === 'up' ? 1.5 : -1.5;
  for (let i = 0; i < count; i++) {
    price += step + (Math.random() - 0.5) * 0.3;
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

function generateRangingCandles(count: number) {
  const candles = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    price = 100 + Math.sin(i * 0.3) * 2 + (Math.random() - 0.5) * 0.5;
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
