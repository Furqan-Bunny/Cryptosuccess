import { TechnicalIndicators } from '../../src/services/ai/indicators';
import { marketService, CandleData } from '../../src/services/market.service';
import { adjustModelConfidence } from '../../src/services/ai-signals.service';

// Signal-generation pipeline tests against the REAL code paths (no TensorFlow:
// the model is loaded lazily and never touched here). Candles come from a
// seeded generator so results are reproducible.

function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateCandles(count: number, opts: { seed?: number; drift?: number } = {}): CandleData[] {
  const rand = seededRandom(opts.seed ?? 42);
  const drift = opts.drift ?? 0;
  const candles: CandleData[] = [];
  let price = 2000; // ETH-like price
  for (let i = 0; i < count; i++) {
    price = Math.max(100, price + drift + (rand() - 0.5) * 40);
    candles.push({
      time: 1_700_000_000_000 + i * 3_600_000,
      open: price - 5,
      high: price + 10,
      low: price - 10,
      close: price,
      volume: 50000 + rand() * 100000,
    });
  }
  return candles;
}

describe('prepareNormalizedFeatures for LSTM', () => {
  it('produces 12 features per step and [24, 12] windows', () => {
    const candles = generateCandles(100);
    const LOOKBACK = 50;
    const TIMESTEPS = 24;

    const allFeatures: number[][] = [];
    for (let i = LOOKBACK; i < candles.length; i++) {
      allFeatures.push(TechnicalIndicators.prepareNormalizedFeatures(candles.slice(Math.max(0, i - LOOKBACK), i + 1)));
    }

    expect(allFeatures.length).toBe(candles.length - LOOKBACK);
    allFeatures.forEach(f => {
      expect(f).toHaveLength(12);
      f.forEach(v => expect(Number.isFinite(v)).toBe(true));
    });

    for (let i = TIMESTEPS; i < allFeatures.length; i++) {
      const w = allFeatures.slice(i - TIMESTEPS, i);
      expect(w).toHaveLength(TIMESTEPS);
      w.forEach(step => expect(step).toHaveLength(12));
    }
  });
});

describe('ATR percent (used for labeling thresholds)', () => {
  it('is positive and finite on a normal series', () => {
    const c = generateCandles(80);
    const atrPct = TechnicalIndicators.calculateATRPercent(
      c.map(x => x.high),
      c.map(x => x.low),
      c.map(x => x.close)
    );
    expect(atrPct).toBeGreaterThan(0);
    expect(Number.isFinite(atrPct)).toBe(true);
  });
});

describe('adjustModelConfidence (real AI confidence adjuster)', () => {
  const strongBuy = { adx: 30, rsi: 55, macd: { histogram: 1 }, ema50: 110, ema200: 100, stochastic: { k: 50 } };

  it('never exceeds 85% even for a 100% raw model output', () => {
    for (const raw of [90, 95, 100, 150]) {
      expect(adjustModelConfidence(raw, 'BUY', strongBuy)).toBeLessThanOrEqual(85);
    }
  });

  it('never drops below the 5% floor', () => {
    expect(adjustModelConfidence(1, 'SELL', { adx: 0 })).toBeGreaterThanOrEqual(5);
  });

  it('penalises weak trends (ADX < 20) proportionally', () => {
    const strong = adjustModelConfidence(80, 'BUY', strongBuy);
    const weak = adjustModelConfidence(80, 'BUY', { ...strongBuy, adx: 10 });
    expect(weak).toBeLessThan(strong);
  });

  it('penalises a signal the indicators disagree with', () => {
    const agrees = adjustModelConfidence(70, 'BUY', strongBuy);
    const disagrees = adjustModelConfidence(70, 'BUY', {
      adx: 30,
      rsi: 80,
      macd: { histogram: -1 },
      ema50: 90,
      ema200: 100,
      stochastic: { k: 90 },
    });
    expect(disagrees).toBeLessThan(agrees);
  });
});

describe('generateRuleBasedSignal (real technical engine)', () => {
  it('BUY: stop below entry, target above, 1.5:1 reward:risk', () => {
    const candles = generateCandles(150, { drift: 3 }); // trending up
    const s = marketService.generateRuleBasedSignal('ETH', candles);
    expect(s.action).toBe('BUY');
    expect(s.stopLoss).toBeLessThan(s.price);
    expect(s.targetPrice).toBeGreaterThan(s.price);
    expect((s.targetPrice - s.price) / (s.price - s.stopLoss)).toBeCloseTo(1.5, 6);
  });

  it('SELL: stop above entry, target below, 1.5:1 reward:risk', () => {
    // A choppy, gently declining market: RSI stays mid-range (not oversold, so
    // no mean-reversion BUY) while EMA20 sits below EMA50.
    const candles: CandleData[] = Array.from({ length: 145 }, (_, i) => {
      const close = 2000 - i + 15 * Math.sin(i / 1.5);
      return { time: i * 3_600_000, open: close + 2, high: close + 10, low: close - 10, close, volume: 80000 };
    });
    const s = marketService.generateRuleBasedSignal('ETH', candles);
    expect(s.action).toBe('SELL');
    expect(s.stopLoss).toBeGreaterThan(s.price);
    expect(s.targetPrice).toBeLessThan(s.price);
    expect((s.price - s.targetPrice) / (s.stopLoss - s.price)).toBeCloseTo(1.5, 6);
  });

  it('caps confidence at 85% and tags the technical engine', () => {
    for (const drift of [-5, -1, 0, 1, 5]) {
      const s = marketService.generateRuleBasedSignal('BTC', generateCandles(150, { drift, seed: 7 }));
      expect(s.confidence).toBeLessThanOrEqual(85);
      expect(s.engine).toBe('technical');
      expect(s.symbol).toBe('BTC');
    }
  });

  it('uses the supplied live price as the entry when given', () => {
    const candles = generateCandles(150, { drift: 3 });
    const s = marketService.generateRuleBasedSignal('ETH', candles, 2500);
    expect(s.price).toBe(2500);
  });
});
