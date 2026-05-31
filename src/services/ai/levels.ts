import { CandleData } from '../market.service';

export interface KeyLevels {
  supports: number[];     // nearest below current price first
  resistances: number[];  // nearest above current price first
  pivot: number;
}

// Detect swing-based support/resistance levels plus a classic pivot.
// A swing high/low is a candle whose high/low is the most extreme within
// ±window bars. Levels are clustered (near-duplicates merged) and limited to
// the few nearest to the current price.
export function computeKeyLevels(candles: CandleData[], window = 2): KeyLevels {
  if (!candles || candles.length < window * 2 + 1) {
    const price = candles?.[candles.length - 1]?.close ?? 0;
    return { supports: [], resistances: [], pivot: price };
  }

  const currentPrice = candles[candles.length - 1].close;
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = window; i < candles.length - window; i++) {
    const { high, low } = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (candles[j].high >= high) isHigh = false;
      if (candles[j].low <= low) isLow = false;
    }
    if (isHigh) swingHighs.push(high);
    if (isLow) swingLows.push(low);
  }

  // Merge levels within 0.4% of each other.
  const cluster = (vals: number[]): number[] => {
    const sorted = [...vals].sort((a, b) => a - b);
    const out: number[] = [];
    for (const v of sorted) {
      const prev = out[out.length - 1];
      if (prev === undefined || Math.abs(v - prev) / prev > 0.004) out.push(v);
    }
    return out;
  };

  const resistances = cluster(swingHighs.filter(h => h > currentPrice))
    .sort((a, b) => a - b) // nearest above first
    .slice(0, 3);

  const supports = cluster(swingLows.filter(l => l < currentPrice))
    .sort((a, b) => b - a) // nearest below first
    .slice(0, 3);

  const last = candles[candles.length - 1];
  const pivot = (last.high + last.low + last.close) / 3;

  return { supports, resistances, pivot };
}
