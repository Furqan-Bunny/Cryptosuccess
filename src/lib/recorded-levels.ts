// The record route re-prices a web signal on live spot (rebaseToSpot) and the
// track record keeps THOSE levels. These helpers move a displayed signal onto
// the recorded levels, so the card shows exactly what will be scored and
// anchored. Pure (no I/O).

export interface PriceLevels {
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
}

export interface LevelStats {
  riskReward: number;
  potentialGainPct: number;
  potentialLossPct: number;
}

/** Risk/reward and the % distance to target / stop, from the entry. */
export function levelStats(levels: PriceLevels): LevelStats {
  const { entryPrice: entry, targetPrice, stopLoss } = levels;
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(targetPrice - entry);
  return {
    riskReward: risk > 0 ? reward / risk : 0,
    potentialGainPct: entry > 0 ? ((targetPrice - entry) / entry) * 100 : 0,
    potentialLossPct: entry > 0 ? ((stopLoss - entry) / entry) * 100 : 0,
  };
}

/** True when the server returned three usable levels. */
export function isValidLevels(v: unknown): v is PriceLevels {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return [o.entryPrice, o.targetPrice, o.stopLoss].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0);
}
