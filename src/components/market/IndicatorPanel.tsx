'use client';

import { marketService } from '@/services/market.service';

export interface Indicators {
  rsi: number;
  macd: { macd: number; signal: number; histogram: number };
  bollinger: { upper: number; middle: number; lower: number };
  ema50: number;
  ema200: number;
  stochastic: { k: number; d: number };
  vwap: number;
  atr: number;
  adx: number;
}

type Tone = 'bullish' | 'bearish' | 'neutral';

function toneClass(tone: Tone): string {
  if (tone === 'bullish') return 'text-green-400 bg-green-900/20';
  if (tone === 'bearish') return 'text-red-400 bg-red-900/20';
  return 'text-yellow-400 bg-yellow-900/20';
}

function Row({ label, value, badge, tone }: { label: string; value: string; badge: string; tone: Tone }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-800/60 last:border-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <div className="flex items-center space-x-3">
        <span className="text-sm text-white font-medium tabular-nums">{value}</span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${toneClass(tone)}`}>{badge}</span>
      </div>
    </div>
  );
}

export default function IndicatorPanel({
  indicators,
  currentPrice,
}: {
  indicators: Indicators;
  currentPrice: number;
}) {
  const { rsi, macd, bollinger, ema50, ema200, stochastic, atr, adx } = indicators;

  // RSI
  const rsiTone: Tone = rsi >= 70 ? 'bearish' : rsi <= 30 ? 'bullish' : 'neutral';
  const rsiBadge = rsi >= 70 ? 'Overbought' : rsi <= 30 ? 'Oversold' : 'Neutral';

  // MACD histogram
  const macdTone: Tone = macd.histogram > 0 ? 'bullish' : macd.histogram < 0 ? 'bearish' : 'neutral';
  const macdBadge = macd.histogram > 0 ? 'Bullish' : macd.histogram < 0 ? 'Bearish' : 'Flat';

  // Trend (EMA50 vs EMA200)
  const trendTone: Tone = ema50 > ema200 ? 'bullish' : 'bearish';
  const trendBadge = ema50 > ema200 ? 'Uptrend' : 'Downtrend';

  // Stochastic %K
  const stochTone: Tone = stochastic.k >= 80 ? 'bearish' : stochastic.k <= 20 ? 'bullish' : 'neutral';
  const stochBadge = stochastic.k >= 80 ? 'Overbought' : stochastic.k <= 20 ? 'Oversold' : 'Neutral';

  // ADX trend strength
  const adxTone: Tone = adx >= 25 ? 'bullish' : 'neutral';
  const adxBadge = adx >= 25 ? 'Strong' : adx >= 20 ? 'Moderate' : 'Weak';

  // Bollinger position
  const bbRange = bollinger.upper - bollinger.lower;
  const bbPct = bbRange > 0 ? ((currentPrice - bollinger.lower) / bbRange) * 100 : 50;
  const bbTone: Tone = bbPct >= 80 ? 'bearish' : bbPct <= 20 ? 'bullish' : 'neutral';
  const bbBadge = bbPct >= 80 ? 'Near upper' : bbPct <= 20 ? 'Near lower' : 'Mid-band';

  // ATR volatility (as % of price)
  const atrPct = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;
  const atrTone: Tone = atrPct >= 5 ? 'bearish' : 'neutral';
  const atrBadge = atrPct >= 5 ? 'High vol' : atrPct >= 2 ? 'Moderate' : 'Low vol';

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Technical Indicators</h3>
      <div className="space-y-0">
        <Row label="RSI (14)" value={rsi.toFixed(1)} badge={rsiBadge} tone={rsiTone} />
        <Row label="MACD histogram" value={macd.histogram.toFixed(2)} badge={macdBadge} tone={macdTone} />
        <Row label="Trend (EMA50/200)" value={`${marketService.formatPrice(ema50)}`} badge={trendBadge} tone={trendTone} />
        <Row label="Stochastic %K" value={stochastic.k.toFixed(1)} badge={stochBadge} tone={stochTone} />
        <Row label="ADX" value={adx.toFixed(1)} badge={adxBadge} tone={adxTone} />
        <Row label="Bollinger position" value={`${bbPct.toFixed(0)}%`} badge={bbBadge} tone={bbTone} />
        <Row label="ATR" value={`${atrPct.toFixed(2)}%`} badge={atrBadge} tone={atrTone} />
      </div>
    </div>
  );
}
