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
  static calculateVWAP(candles: Array<{ close: number; volume: number }>): number {
    if (candles.length === 0) return 0;

    let totalPriceVolume = 0;
    let totalVolume = 0;

    for (const candle of candles) {
      totalPriceVolume += candle.close * candle.volume;
      totalVolume += candle.volume;
    }

    return totalVolume > 0 ? totalPriceVolume / totalVolume : candles[candles.length - 1].close;
  }

  // Calculate Stochastic Oscillator
  static calculateStochastic(highs: number[], lows: number[], closes: number[], period = 14): {
    k: number;
    d: number;
  } {
    if (highs.length < period || lows.length < period || closes.length < period) {
      return { k: 50, d: 50 }; // Neutral values
    }

    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);
    const currentClose = closes[closes.length - 1];

    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);

    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;

    // Calculate %D (3-period SMA of %K)
    // For simplicity, we'll just use the current K value
    const d = k; // In a full implementation, this would be a 3-period SMA

    return { k, d };
  }

  // Prepare all indicators for AI model
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

    return {
      rsi: this.calculateRSI(closes),
      macd: this.calculateMACD(closes),
      bollinger: this.calculateBollingerBands(closes),
      ema50: this.calculateEMA(closes, 50)[this.calculateEMA(closes, 50).length - 1] || closes[closes.length - 1],
      ema200: this.calculateEMA(closes, 200)[this.calculateEMA(closes, 200).length - 1] || closes[closes.length - 1],
      stochastic: this.calculateStochastic(highs, lows, closes),
      vwap: this.calculateVWAP(candles),
    };
  }
}