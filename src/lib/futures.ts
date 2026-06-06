// Pure paper-futures math + types. No Firebase / network imports so it can be
// used identically on the client (futures.service) and the server (engine).
//
// We model ISOLATED margin only — the simplest, safest mode and the recommended
// default for a simulation. Liquidation/PnL use the current SPOT price as the
// mark price (a documented simplification for a paper product). Funding is NOT
// computed here (it requires the live fapi feed and is handled best-effort
// elsewhere); never derive it additively from the premium index.

import type { Timestamp } from 'firebase/firestore';

export type PositionSide = 'long' | 'short';
export type PositionStatus = 'open' | 'closed' | 'liquidated';

export interface FuturesPosition {
  id?: string;
  userId: string;
  symbol: string;
  side: PositionSide;
  leverage: number;
  entryPrice: number;
  quantity: number; // base-asset units (e.g. BTC)
  marginUsd: number; // collateral locked (isolated)
  marginMode: 'isolated';
  liquidationPrice: number;
  status: PositionStatus;
  openedAt: Timestamp | Date;
  closedAt?: Timestamp | Date;
  closePrice?: number;
  realizedPnl?: number;
  fundingPaid?: number;
}

export const MAX_LEVERAGE = 20;
export const MIN_LEVERAGE = 1;

// Simplified maintenance-margin-rate (MMR) tiers by position notional (USD).
// Real exchanges publish granular brackets via the fapi leverage-brackets API;
// for a paper sim we use a small conservative table so we depend on no live
// derivatives feed. Higher notional -> higher MMR (closer liquidation).
const MMR_TIERS: Array<{ maxNotional: number; mmr: number }> = [
  { maxNotional: 50_000, mmr: 0.004 }, // 0.40%
  { maxNotional: 250_000, mmr: 0.005 }, // 0.50%
  { maxNotional: 1_000_000, mmr: 0.01 }, // 1.00%
  { maxNotional: Infinity, mmr: 0.025 }, // 2.50%
];

export function maintenanceMarginRate(notionalUsd: number): number {
  for (const tier of MMR_TIERS) {
    if (notionalUsd <= tier.maxNotional) return tier.mmr;
  }
  return MMR_TIERS[MMR_TIERS.length - 1].mmr;
}

/**
 * Isolated-margin liquidation price.
 * long  = entry * (1 - 1/leverage + mmr)
 * short = entry * (1 + 1/leverage - mmr)
 * The position is liquidated when the mark price crosses this level (the
 * margin balance can no longer cover the maintenance margin).
 */
export function computeLiquidationPrice(
  side: PositionSide,
  entryPrice: number,
  leverage: number,
  notionalUsd: number
): number {
  const mmr = maintenanceMarginRate(notionalUsd);
  const inv = 1 / leverage;
  if (side === 'long') {
    return entryPrice * (1 - inv + mmr);
  }
  return entryPrice * (1 + inv - mmr);
}

/** Unrealized PnL in USD at a given mark price. */
export function computePnl(
  side: PositionSide,
  entryPrice: number,
  markPrice: number,
  quantity: number
): number {
  return side === 'long'
    ? (markPrice - entryPrice) * quantity
    : (entryPrice - markPrice) * quantity;
}

/** Return on equity (% of locked margin). */
export function computeRoe(pnlUsd: number, marginUsd: number): number {
  return marginUsd > 0 ? (pnlUsd / marginUsd) * 100 : 0;
}

/** Has the mark price reached/passed the liquidation level? */
export function isLiquidated(side: PositionSide, liquidationPrice: number, markPrice: number): boolean {
  return side === 'long' ? markPrice <= liquidationPrice : markPrice >= liquidationPrice;
}

/**
 * Build the derived numbers for a new position from a chosen margin + leverage.
 * quantity = (margin * leverage) / entryPrice.
 */
export function buildPosition(
  side: PositionSide,
  entryPrice: number,
  leverage: number,
  marginUsd: number
): { quantity: number; notionalUsd: number; liquidationPrice: number } {
  const notionalUsd = marginUsd * leverage;
  const quantity = notionalUsd / entryPrice;
  const liquidationPrice = computeLiquidationPrice(side, entryPrice, leverage, notionalUsd);
  return { quantity, notionalUsd, liquidationPrice };
}
