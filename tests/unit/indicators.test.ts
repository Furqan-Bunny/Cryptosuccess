import { TechnicalIndicators } from '../../src/services/ai/indicators';

// Helper to generate synthetic candle data
function generateCandles(count: number, startPrice = 100, trend = 0.001) {
  const candles = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const variation = (Math.random() - 0.5) * 2;
    price = price * (1 + trend + variation * 0.01);
    candles.push({
      open: price * 0.999,
      high: price * 1.005,
      low: price * 0.995,
      close: price,
      volume: 1000 + Math.random() * 5000,
    });
  }
  return candles;
}

describe('TechnicalIndicators', () => {
  describe('calculateRSI', () => {
    it('returns 50 for insufficient data', () => {
      expect(TechnicalIndicators.calculateRSI([1, 2, 3], 14)).toBe(50);
    });

    it('returns a value between 0 and 100', () => {
      const prices = generateCandles(50).map(c => c.close);
      const rsi = TechnicalIndicators.calculateRSI(prices);
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    it('returns 100 when all prices increase', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
      const rsi = TechnicalIndicators.calculateRSI(prices);
      expect(rsi).toBe(100);
    });
  });

  describe('calculateMACD', () => {
    it('returns zeros for insufficient data', () => {
      const result = TechnicalIndicators.calculateMACD([1, 2, 3]);
      expect(result).toEqual({ macd: 0, signal: 0, histogram: 0 });
    });

    it('returns valid MACD values with enough data', () => {
      const prices = generateCandles(50).map(c => c.close);
      const result = TechnicalIndicators.calculateMACD(prices);
      expect(typeof result.macd).toBe('number');
      expect(typeof result.signal).toBe('number');
      expect(typeof result.histogram).toBe('number');
      expect(result.histogram).toBeCloseTo(result.macd - result.signal, 5);
    });
  });

  describe('calculateEMA', () => {
    it('returns empty array for insufficient data', () => {
      expect(TechnicalIndicators.calculateEMA([1, 2], 5)).toEqual([]);
    });

    it('returns correct number of values', () => {
      const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const ema = TechnicalIndicators.calculateEMA(prices, 3);
      expect(ema.length).toBeGreaterThan(0);
      expect(ema.length).toBeLessThanOrEqual(prices.length);
    });
  });

  describe('calculateBollingerBands', () => {
    it('returns upper > middle > lower', () => {
      const prices = generateCandles(30).map(c => c.close);
      const bb = TechnicalIndicators.calculateBollingerBands(prices);
      expect(bb.upper).toBeGreaterThan(bb.middle);
      expect(bb.middle).toBeGreaterThan(bb.lower);
    });

    it('returns same values for insufficient data', () => {
      const bb = TechnicalIndicators.calculateBollingerBands([100]);
      expect(bb.upper).toBe(100);
      expect(bb.middle).toBe(100);
      expect(bb.lower).toBe(100);
    });
  });

  describe('calculateStochastic', () => {
    it('returns values between 0 and 100', () => {
      const candles = generateCandles(30);
      const result = TechnicalIndicators.calculateStochastic(
        candles.map(c => c.high),
        candles.map(c => c.low),
        candles.map(c => c.close)
      );
      expect(result.k).toBeGreaterThanOrEqual(0);
      expect(result.k).toBeLessThanOrEqual(100);
      expect(result.d).toBeGreaterThanOrEqual(0);
      expect(result.d).toBeLessThanOrEqual(100);
    });

    it('returns neutral for insufficient data', () => {
      const result = TechnicalIndicators.calculateStochastic([1], [0], [0.5]);
      expect(result).toEqual({ k: 50, d: 50 });
    });
  });

  describe('calculateATR', () => {
    it('returns 0 for insufficient data', () => {
      expect(TechnicalIndicators.calculateATR([1], [0], [0.5])).toBe(0);
    });

    it('returns positive value with valid data', () => {
      const candles = generateCandles(30);
      const atr = TechnicalIndicators.calculateATR(
        candles.map(c => c.high),
        candles.map(c => c.low),
        candles.map(c => c.close)
      );
      expect(atr).toBeGreaterThan(0);
    });
  });

  describe('calculateADX', () => {
    it('returns 0 for insufficient data', () => {
      expect(TechnicalIndicators.calculateADX([1, 2], [0, 1], [0.5, 1.5])).toBe(0);
    });

    it('returns value between 0 and 100', () => {
      const candles = generateCandles(50);
      const adx = TechnicalIndicators.calculateADX(
        candles.map(c => c.high),
        candles.map(c => c.low),
        candles.map(c => c.close)
      );
      expect(adx).toBeGreaterThanOrEqual(0);
      expect(adx).toBeLessThanOrEqual(100);
    });
  });

  describe('calculateATRPercent', () => {
    it('returns a positive percentage', () => {
      const candles = generateCandles(30);
      const atrPct = TechnicalIndicators.calculateATRPercent(
        candles.map(c => c.high),
        candles.map(c => c.low),
        candles.map(c => c.close)
      );
      expect(atrPct).toBeGreaterThanOrEqual(0);
    });
  });

  describe('prepareNormalizedFeatures', () => {
    it('returns exactly 12 features', () => {
      const candles = generateCandles(60);
      const features = TechnicalIndicators.prepareNormalizedFeatures(candles);
      expect(features).toHaveLength(12);
    });

    it('all values are finite numbers', () => {
      const candles = generateCandles(60);
      const features = TechnicalIndicators.prepareNormalizedFeatures(candles);
      features.forEach((f, i) => {
        expect(isFinite(f)).toBe(true);
      });
    });

    it('most values are roughly in [-1, 1] range', () => {
      const candles = generateCandles(60);
      const features = TechnicalIndicators.prepareNormalizedFeatures(candles);
      features.forEach((f) => {
        expect(f).toBeGreaterThanOrEqual(-2);
        expect(f).toBeLessThanOrEqual(2);
      });
    });
  });

  describe('prepareIndicators', () => {
    it('returns all expected fields', () => {
      const candles = generateCandles(60);
      const indicators = TechnicalIndicators.prepareIndicators(candles);
      expect(indicators).toHaveProperty('rsi');
      expect(indicators).toHaveProperty('macd');
      expect(indicators).toHaveProperty('bollinger');
      expect(indicators).toHaveProperty('ema50');
      expect(indicators).toHaveProperty('ema200');
      expect(indicators).toHaveProperty('stochastic');
      expect(indicators).toHaveProperty('vwap');
      expect(indicators).toHaveProperty('atr');
      expect(indicators).toHaveProperty('adx');
    });
  });
});
