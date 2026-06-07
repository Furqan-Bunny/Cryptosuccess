// Server-side: build a multi-timeframe behavioral picture of a coin (how it's
// acting on 1h / 4h / 1d / 1w charts) for the Claude analyst to reason over.
// Uses only pure, browser-free helpers + a direct fetch to Binance's public
// market-data host, so it is safe to run inside a Next API route on Vercel.
import { TechnicalIndicators } from './ai/indicators';
import { detectMarketRegime } from './ai/market-regime.service';
import { computeKeyLevels } from './ai/levels';

const HOST = 'https://data-api.binance.vision';

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

const TIMEFRAMES = [
  { label: '1h', interval: '1h', limit: 200 },
  { label: '4h', interval: '4h', limit: 180 },
  { label: '1d', interval: '1d', limit: 365 },
  { label: '1w', interval: '1w', limit: 200 },
];

export interface TimeframeSummary {
  price: number;
  trend: 'up' | 'down';
  regime: string;
  adx: number;
  atrPercent: number;
  rsi: number;
  macdHistogram: number;
  positionInRangePct: number; // where price sits between the window low (0) and high (100)
  rocPct: number;             // momentum over the window
  nearestSupport: number | null;
  nearestResistance: number | null;
}

export interface MarketContext {
  symbol: string;
  price: number;
  timeframes: Record<string, TimeframeSummary>;
}

const round = (n: number, d: number) => (Number.isFinite(n) ? Number(n.toFixed(d)) : 0);

async function fetchKlines(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  const url = `${HOST}/api/v3/klines?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`klines ${symbol} ${interval} HTTP ${res.status}`);
  const rows: any[] = await res.json();
  return rows.map(r => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] }));
}

export function summarizeTimeframe(candles: Candle[]): TimeframeSummary {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const price = closes[closes.length - 1];

  const ind: any = TechnicalIndicators.prepareIndicators(candles);
  const regime = detectMarketRegime(candles);
  const levels = computeKeyLevels(candles);

  const hi = Math.max(...highs);
  const lo = Math.min(...lows);
  const positionInRangePct = hi > lo ? ((price - lo) / (hi - lo)) * 100 : 50;

  const period = Math.min(20, closes.length - 1);
  const base = closes[closes.length - 1 - period];
  const rocPct = base > 0 ? ((price - base) / base) * 100 : 0;
  const atrPercent = price > 0 ? (ind.atr / price) * 100 : 0;

  return {
    price: round(price, price < 1 ? 6 : 2),
    trend: ind.ema50 > ind.ema200 ? 'up' : 'down',
    regime: regime.regime,
    adx: round(ind.adx, 1),
    atrPercent: round(atrPercent, 2),
    rsi: round(ind.rsi, 1),
    macdHistogram: round(ind.macd.histogram, 2),
    positionInRangePct: round(positionInRangePct, 0),
    rocPct: round(rocPct, 1),
    nearestSupport: levels.supports[0] ?? null,
    nearestResistance: levels.resistances[0] ?? null,
  };
}

export async function buildMarketContext(symbol: string): Promise<MarketContext> {
  const sym = symbol.toUpperCase();
  const entries = await Promise.all(
    TIMEFRAMES.map(async tf => [tf.label, summarizeTimeframe(await fetchKlines(sym, tf.interval, tf.limit))] as const),
  );
  const timeframes: Record<string, TimeframeSummary> = {};
  for (const [label, s] of entries) timeframes[label] = s;
  return { symbol: sym, price: timeframes['1h']?.price ?? 0, timeframes };
}
