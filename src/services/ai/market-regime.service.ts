import { TechnicalIndicators } from './indicators';

export type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile';

export interface RegimeAnalysis {
  regime: MarketRegime;
  adx: number;
  atrPercent: number;
  confidence: number;
  description: string;
}

export function detectMarketRegime(
  candles: Array<{ open: number; high: number; low: number; close: number; volume: number }>
): RegimeAnalysis {
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];

  const adx = TechnicalIndicators.calculateADX(highs, lows, closes);
  const atr = TechnicalIndicators.calculateATR(highs, lows, closes);
  const atrPercent = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;

  const ema20 = TechnicalIndicators.calculateEMA(closes, 20);
  const ema50 = TechnicalIndicators.calculateEMA(closes, 50);
  const trendUp = ema20.length > 0 && ema50.length > 0 &&
    ema20[ema20.length - 1] > ema50[ema50.length - 1];

  let regime: MarketRegime;
  let confidence: number;
  let description: string;

  if (adx >= 25) {
    regime = trendUp ? 'trending_up' : 'trending_down';
    confidence = Math.min(90, 50 + adx);
    description = `Strong ${trendUp ? 'upward' : 'downward'} trend (ADX: ${adx.toFixed(1)})`;
  } else if (atrPercent > 4) {
    regime = 'volatile';
    confidence = 60 + Math.min(30, atrPercent * 5);
    description = `High volatility environment (ATR%: ${atrPercent.toFixed(2)}%)`;
  } else {
    regime = 'ranging';
    confidence = 50 + (25 - adx) * 2;
    description = `Range-bound market (ADX: ${adx.toFixed(1)}, ATR%: ${atrPercent.toFixed(2)}%)`;
  }

  return { regime, adx, atrPercent, confidence: Math.min(95, confidence), description };
}
