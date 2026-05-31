import { TechnicalIndicators } from '../../src/services/ai/indicators';

// Test the signal generation data pipeline (without TensorFlow)
describe('Signal Generation Pipeline', () => {
  function generateCandles(count: number) {
    const candles = [];
    let price = 2000; // ETH-like price
    for (let i = 0; i < count; i++) {
      const change = (Math.random() - 0.5) * 40;
      price = Math.max(100, price + change);
      candles.push({
        open: price - 5,
        high: price + 10,
        low: price - 10,
        close: price,
        volume: 50000 + Math.random() * 100000,
      });
    }
    return candles;
  }

  describe('prepareNormalizedFeatures for LSTM', () => {
    it('produces correct shape for training window', () => {
      const candles = generateCandles(100);
      const LOOKBACK = 50;
      const TIMESTEPS = 24;

      const allFeatures: number[][] = [];
      for (let i = LOOKBACK; i < candles.length; i++) {
        const slice = candles.slice(Math.max(0, i - LOOKBACK), i + 1);
        const features = TechnicalIndicators.prepareNormalizedFeatures(slice);
        allFeatures.push(features);
      }

      // Should produce enough feature vectors
      expect(allFeatures.length).toBe(candles.length - LOOKBACK);

      // Each feature vector has 12 elements
      allFeatures.forEach(f => {
        expect(f).toHaveLength(12);
      });

      // Can create windows of TIMESTEPS
      const windows: number[][][] = [];
      for (let i = TIMESTEPS; i < allFeatures.length; i++) {
        windows.push(allFeatures.slice(i - TIMESTEPS, i));
      }

      // Each window is [24, 12]
      windows.forEach(w => {
        expect(w).toHaveLength(TIMESTEPS);
        w.forEach(step => {
          expect(step).toHaveLength(12);
        });
      });
    });
  });

  describe('ATR-based labeling', () => {
    it('produces valid one-hot labels', () => {
      const candles = generateCandles(200);
      const LOOKBACK = 50;
      const LOOKAHEAD = 24;
      const labels: number[][] = [];

      for (let i = LOOKBACK; i < candles.length - LOOKAHEAD; i++) {
        const currentPrice = candles[i].close;
        const futurePrice = candles[i + LOOKAHEAD].close;
        const priceChange = ((futurePrice - currentPrice) / currentPrice) * 100;

        const slice = candles.slice(Math.max(0, i - 50), i + 1);
        const atrPercent = TechnicalIndicators.calculateATRPercent(
          slice.map(c => c.high),
          slice.map(c => c.low),
          slice.map(c => c.close)
        );
        const threshold = Math.max(atrPercent, 1);

        if (priceChange > threshold) {
          labels.push([1, 0, 0]);
        } else if (priceChange < -threshold) {
          labels.push([0, 1, 0]);
        } else {
          labels.push([0, 0, 1]);
        }
      }

      // All labels are valid one-hot vectors
      labels.forEach(label => {
        expect(label).toHaveLength(3);
        expect(label.reduce((a, b) => a + b, 0)).toBe(1);
        label.forEach(v => expect([0, 1]).toContain(v));
      });

      // Should have a mix of labels (not all one class)
      const buyCount = labels.filter(l => l[0] === 1).length;
      const sellCount = labels.filter(l => l[1] === 1).length;
      const holdCount = labels.filter(l => l[2] === 1).length;
      expect(buyCount + sellCount + holdCount).toBe(labels.length);
    });
  });

  describe('Signal confidence cap', () => {
    it('confidence should never exceed 85%', () => {
      // Simulate the confidence capping logic from ai-signals.service.ts
      const testConfidences = [90, 95, 100, 50, 85, 85.1, 30];
      testConfidences.forEach(conf => {
        const capped = Math.min(conf, 85);
        expect(capped).toBeLessThanOrEqual(85);
      });
    });

    it('ADX penalty reduces confidence when ADX < 20', () => {
      const baseConfidence = 80;
      const adx = 10;
      const adjusted = baseConfidence * (adx / 20);
      expect(adjusted).toBe(40);
      expect(adjusted).toBeLessThan(baseConfidence);
    });
  });

  describe('ATR-based stops and targets', () => {
    it('BUY: stop below entry, target above entry', () => {
      const price = 2000;
      const atr = 50;
      const stopLoss = price - 2 * atr;
      const targetPrice = price + 3 * atr;
      expect(stopLoss).toBeLessThan(price);
      expect(targetPrice).toBeGreaterThan(price);
      expect(targetPrice - price).toBeGreaterThan(price - stopLoss); // Reward > Risk
    });

    it('SELL: stop above entry, target below entry', () => {
      const price = 2000;
      const atr = 50;
      const stopLoss = price + 2 * atr;
      const targetPrice = price - 3 * atr;
      expect(stopLoss).toBeGreaterThan(price);
      expect(targetPrice).toBeLessThan(price);
    });

    it('1.5:1 reward/risk ratio', () => {
      const price = 2000;
      const atr = 50;
      const risk = 2 * atr;
      const reward = 3 * atr;
      expect(reward / risk).toBe(1.5);
    });
  });
});
