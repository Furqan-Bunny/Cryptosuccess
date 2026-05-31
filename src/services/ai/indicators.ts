// Technical indicators calculation for AI features
export class TechnicalIndicators {
  // Calculate Relative Strength Index (RSI)
  static calculateRSI(prices: number[], period = 14): number {
    if (prices.length < period + 1) return 50; // Default neutral value

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < prices.length; i++) {
      const difference = prices[i] - prices[i - 1];
      if (difference > 0) {
        gains.push(difference);
        losses.push(0);
      } else {
        gains.push(0);
        losses.push(Math.abs(difference));
      }
    }

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  // Calculate MACD (Moving Average Convergence Divergence)
  static calculateMACD(prices: number[]): {
    macd: number;
    signal: number;
    histogram: number;
  } {
    if (prices.length < 26) {
      return { macd: 0, signal: 0, histogram: 0 };
    }

    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];

    // Calculate signal line (9-day EMA of MACD)
    const macdValues = [];
    for (let i = 0; i < Math.min(ema12.length, ema26.length); i++) {
      macdValues.push(ema12[i] - ema26[i]);
    }

    const signalLine = this.calculateEMA(macdValues, 9);
    const signal = signalLine[signalLine.length - 1];

    return {
      macd: macdLine,
      signal: signal,
      histogram: macdLine - signal,
    };
  }

  // Calculate Exponential Moving Average (EMA)
  static calculateEMA(prices: number[], period: number): number[] {
    if (prices.length < period) return [];

    const multiplier = 2 / (period + 1);
    const ema: number[] = [];

    // Start with SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += prices[i];
    }
    ema[period - 1] = sum / period;

    // Calculate EMA
    for (let i = period; i < prices.length; i++) {
      ema[i] = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
    }

    return ema.filter(val => val !== undefined);
  }

  // Calculate Bollinger Bands
  static calculateBollingerBands(prices: number[], period = 20, stdDev = 2): {
    upper: number;
    middle: number;
    lower: number;
  } {
    if (prices.length < period) {
      const lastPrice = prices[prices.length - 1] || 0;
      return { upper: lastPrice, middle: lastPrice, lower: lastPrice };
    }

    const recentPrices = prices.slice(-period);
    const sma = recentPrices.reduce((a, b) => a + b, 0) / period;

    const variance = recentPrices.reduce((sum, price) => {
      return sum + Math.pow(price - sma, 2);
    }, 0) / period;

    const standardDeviation = Math.sqrt(variance);

    return {
      upper: sma + (standardDeviation * stdDev),
      middle: sma,
      lower: sma - (standardDeviation * stdDev),
    };
  }

  // Calculate Volume Weighted Average Price (VWAP)
  // FIXED: Now uses typical price (high+low+close)/3 instead of just close
  static calculateVWAP(candles: Array<{ high: number; low: number; close: number; volume: number }>): number {
    if (candles.length === 0) return 0;

    let totalPriceVolume = 0;
    let totalVolume = 0;

    for (const candle of candles) {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      totalPriceVolume += typicalPrice * candle.volume;
      totalVolume += candle.volume;
    }

    return totalVolume > 0 ? totalPriceVolume / totalVolume : candles[candles.length - 1].close;
  }

  // Calculate Stochastic Oscillator
  // FIXED: %D is now a proper 3-period SMA of %K (was incorrectly set to equal %K)
  static calculateStochastic(highs: number[], lows: number[], closes: number[], period = 14): {
    k: number;
    d: number;
  } {
    if (highs.length < period || lows.length < period || closes.length < period) {
      return { k: 50, d: 50 }; // Neutral values
    }

    // Calculate %K for the last 3 periods to compute %D
    const kValues: number[] = [];
    const startIdx = Math.max(0, closes.length - 3);

    for (let j = startIdx; j < closes.length; j++) {
      const sliceEnd = j + 1;
      const sliceStart = Math.max(0, sliceEnd - period);
      const recentHighs = highs.slice(sliceStart, sliceEnd);
      const recentLows = lows.slice(sliceStart, sliceEnd);

      const highestHigh = Math.max(...recentHighs);
      const lowestLow = Math.min(...recentLows);

      const range = highestHigh - lowestLow;
      const kVal = range > 0
        ? ((closes[j] - lowestLow) / range) * 100
        : 50;
      kValues.push(kVal);
    }

    const k = kValues[kValues.length - 1];
    // %D is a 3-period SMA of %K
    const d = kValues.reduce((a, b) => a + b, 0) / kValues.length;

    return { k, d };
  }

  // Calculate Average True Range (ATR) - NEW
  static calculateATR(highs: number[], lows: number[], closes: number[], period = 14): number {
    if (highs.length < 2 || lows.length < 2 || closes.length < 2) return 0;

    const trueRanges: number[] = [];
    for (let i = 1; i < highs.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],                    // Current high - current low
        Math.abs(highs[i] - closes[i - 1]),     // Current high - previous close
        Math.abs(lows[i] - closes[i - 1])       // Current low - previous close
      );
      trueRanges.push(tr);
    }

    if (trueRanges.length < period) {
      return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
    }

    // Initial ATR is SMA of first 'period' true ranges
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;

    // Smooth using Wilder's method
    for (let i = period; i < trueRanges.length; i++) {
      atr = ((atr * (period - 1)) + trueRanges[i]) / period;
    }

    return atr;
  }

  // Calculate Average Directional Index (ADX) - NEW
  static calculateADX(highs: number[], lows: number[], closes: number[], period = 14): number {
    if (highs.length < period + 1) return 0;

    const plusDM: number[] = [];
    const minusDM: number[] = [];
    const trueRanges: number[] = [];

    for (let i = 1; i < highs.length; i++) {
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];

      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }

    if (trueRanges.length < period) return 0;

    // Smoothed values using Wilder's smoothing
    let smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothedTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);

    const dxValues: number[] = [];

    for (let i = period; i < trueRanges.length; i++) {
      smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
      smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];
      smoothedTR = smoothedTR - (smoothedTR / period) + trueRanges[i];

      const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
      const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;

      const diSum = plusDI + minusDI;
      const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
      dxValues.push(dx);
    }

    if (dxValues.length < period) {
      return dxValues.length > 0
        ? dxValues.reduce((a, b) => a + b, 0) / dxValues.length
        : 0;
    }

    // ADX is smoothed DX
    let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxValues.length; i++) {
      adx = ((adx * (period - 1)) + dxValues[i]) / period;
    }

    return adx;
  }

  // Calculate ATR as a percentage of current price
  static calculateATRPercent(highs: number[], lows: number[], closes: number[]): number {
    const atr = this.calculateATR(highs, lows, closes);
    const currentClose = closes[closes.length - 1];
    return currentClose > 0 ? (atr / currentClose) * 100 : 0;
  }

  // Prepare 12 normalized features for LSTM model
  // All values roughly in [-1, 1] or [0, 1] range using relative normalization
  static prepareNormalizedFeatures(candles: Array<{
    open: number; high: number; low: number; close: number; volume: number;
  }>): number[] {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);
    const currentClose = closes[closes.length - 1];

    // 1. RSI / 100
    const rsi = this.calculateRSI(closes) / 100;

    // 2-3. MACD histogram and signal normalized by ATR
    const macd = this.calculateMACD(closes);
    const atr = this.calculateATR(highs, lows, closes);
    const safeATR = atr > 0 ? atr : 1;
    const macdHistNorm = Math.max(-1, Math.min(1, macd.histogram / safeATR));
    const macdSignalNorm = Math.max(-1, Math.min(1, macd.signal / safeATR));

    // 4. Bollinger %B: (close - lower) / (upper - lower)
    const bb = this.calculateBollingerBands(closes);
    const bbRange = bb.upper - bb.lower;
    const bollingerPctB = bbRange > 0 ? (currentClose - bb.lower) / bbRange : 0.5;

    // 5-6. Stochastic %K/100, %D/100
    const stoch = this.calculateStochastic(highs, lows, closes);
    const stochK = stoch.k / 100;
    const stochD = stoch.d / 100;

    // 7. Volume ratio vs 20-period MA (capped at 1)
    const recentVolumes = volumes.slice(-20);
    const volMA = recentVolumes.reduce((a, b) => a + b, 0) / (recentVolumes.length || 1);
    const volumeRatio = volMA > 0 ? (volumes[volumes.length - 1] / volMA) : 1;
    const volumeRatioNorm = Math.min(volumeRatio / 3, 1);

    // 8. Price position: (close - EMA50) / ATR, clamped to [-1, 1]
    const ema50arr = this.calculateEMA(closes, 50);
    const ema50 = ema50arr.length > 0 ? ema50arr[ema50arr.length - 1] : currentClose;
    const pricePosition = (currentClose - ema50) / safeATR;
    const pricePositionNorm = Math.max(-1, Math.min(1, pricePosition / 3));

    // 9. EMA trend: (EMA20 - EMA50) / ATR, clamped to [-1, 1]
    const ema20arr = this.calculateEMA(closes, 20);
    const ema20 = ema20arr.length > 0 ? ema20arr[ema20arr.length - 1] : currentClose;
    const emaTrend = (ema20 - ema50) / safeATR;
    const emaTrendNorm = Math.max(-1, Math.min(1, emaTrend / 3));

    // 10. ATR% (ATR/close*100), normalized to ~[0,1]
    const atrPercent = (atr / (currentClose || 1)) * 100;
    const atrPercentNorm = Math.min(atrPercent / 10, 1);

    // 11. ADX / 100
    const adx = this.calculateADX(highs, lows, closes) / 100;

    // 12. Price ROC (12-period rate of change), scaled to [-1, 1]
    const rocPeriod = Math.min(12, closes.length - 1);
    const rocBase = closes[closes.length - 1 - rocPeriod];
    const roc = rocBase > 0 ? (currentClose - rocBase) / rocBase : 0;
    const rocNorm = Math.max(-1, Math.min(1, roc * 10));

    return [
      rsi, macdHistNorm, macdSignalNorm, bollingerPctB,
      stochK, stochD, volumeRatioNorm, pricePositionNorm,
      emaTrendNorm, atrPercentNorm, adx, rocNorm,
    ];
  }

  // Prepare all indicators for AI model
  // FIXED: EMA calculations now gracefully degrade when insufficient data
  static prepareIndicators(candles: Array<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>): any {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    const ema50arr = this.calculateEMA(closes, 50);
    const ema200arr = this.calculateEMA(closes, 200);

    // Gracefully degrade: use EMA100 if not enough data for EMA200
    let ema200: number;
    if (ema200arr.length > 0) {
      ema200 = ema200arr[ema200arr.length - 1];
    } else {
      // Fallback to EMA100, then EMA50
      const ema100arr = this.calculateEMA(closes, 100);
      ema200 = ema100arr.length > 0
        ? ema100arr[ema100arr.length - 1]
        : (ema50arr.length > 0 ? ema50arr[ema50arr.length - 1] : closes[closes.length - 1]);
    }

    return {
      rsi: this.calculateRSI(closes),
      macd: this.calculateMACD(closes),
      bollinger: this.calculateBollingerBands(closes),
      ema50: ema50arr.length > 0 ? ema50arr[ema50arr.length - 1] : closes[closes.length - 1],
      ema200: ema200,
      stochastic: this.calculateStochastic(highs, lows, closes),
      vwap: this.calculateVWAP(candles),
      atr: this.calculateATR(highs, lows, closes),
      adx: this.calculateADX(highs, lows, closes),
    };
  }
}
