// Server-only paper-trading execution engine (Firebase Admin SDK).
//
// The client `trade-execution.service.ts` defines order placement but its
// `checkAndExecute*` helpers run under the client SDK and were never wired to a
// trigger. A cron/serverless function cannot reuse them (Firestore rules block
// unauthenticated writes), so this module re-implements execution with the Admin
// SDK, which bypasses rules. It is the single trigger for:
//   - limit / stop-loss / take-profit / trailing-stop order fills
//   - futures position liquidation
//
// IMPORTANT: import only server-safe modules here (no client `firebase`).

import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { fetchSpotPrices } from '@/lib/server/binance-server';
import { TRADING_FEE_PERCENTAGE } from '@/types/trading.types';
import { isLiquidated } from '@/lib/futures';

export interface EngineTickResult {
  ordersScanned: number;
  ordersFilled: number;
  ordersExpired: number;
  positionsScanned: number;
  positionsLiquidated: number;
}

function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Record a filled order's trade into the `trades` ledger (Admin write). */
async function recordTrade(
  db: FirebaseFirestore.Firestore,
  params: { userId: string; symbol: string; side: 'buy' | 'sell'; amount: number; price: number; fee: number; notes: string }
) {
  const { userId, symbol, side, amount, price, fee, notes } = params;
  await db.collection('trades').add({
    userId,
    symbol,
    type: side,
    amount,
    price,
    totalValue: amount * price,
    fee,
    timestamp: FieldValue.serverTimestamp(),
    notes,
  });
}

/**
 * Decide whether a pending order should fill at the observed price, and at what
 * price it would fill. Returns null if it should not fill.
 */
function evaluateOrder(order: any, price: number): { fillPrice: number; updatedHwm?: number } | null {
  switch (order.type) {
    case 'limit': {
      if (order.price == null) return null;
      const hit = (order.side === 'buy' && price <= order.price) || (order.side === 'sell' && price >= order.price);
      return hit ? { fillPrice: order.price } : null;
    }
    case 'stop-loss': {
      if (order.stopPrice == null) return null;
      // Sell-stop protects a long (trigger on drop); buy-stop covers a short (trigger on rise).
      const hit = (order.side === 'sell' && price <= order.stopPrice) || (order.side === 'buy' && price >= order.stopPrice);
      return hit ? { fillPrice: price } : null;
    }
    case 'take-profit': {
      if (order.stopPrice == null) return null;
      // Sell-TP locks gains on a long (trigger on rise); buy-TP on a short (trigger on drop).
      const hit = (order.side === 'sell' && price >= order.stopPrice) || (order.side === 'buy' && price <= order.stopPrice);
      return hit ? { fillPrice: price } : null;
    }
    case 'trailing-stop': {
      const pct = order.trailingPercent;
      if (!pct || pct <= 0) return null;
      const frac = pct / 100;
      if (order.side === 'sell') {
        // Protects a long: ratchet the high-water mark up, trigger on pullback.
        const hwm = Math.max(order.highWaterMark ?? price, price);
        const stop = hwm * (1 - frac);
        if (price <= stop) return { fillPrice: price, updatedHwm: hwm };
        return null; // not triggered; caller ratchets the high-water mark
      } else {
        // Protects a short: ratchet the low-water mark down, trigger on bounce.
        const lwm = Math.min(order.highWaterMark ?? price, price);
        const stop = lwm * (1 + frac);
        if (price >= stop) return { fillPrice: price, updatedHwm: lwm };
        return null;
      }
    }
    default:
      return null; // 'market' orders are filled synchronously at placement, never here.
  }
}

async function processOrders(
  db: FirebaseFirestore.Firestore,
  result: EngineTickResult
) {
  const snap = await db
    .collection('orders')
    .where('status', '==', 'pending')
    .get();

  const orders = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  result.ordersScanned += orders.length;
  if (orders.length === 0) return;

  // Auto-filled at placement; only conditional types reach the engine.
  const conditional = orders.filter(o => o.type !== 'market');
  const symbols = Array.from(new Set(conditional.map(o => o.symbol)));
  const prices = await fetchSpotPrices(symbols);
  const now = Date.now();

  for (const order of conditional) {
    // Expire first.
    const expMs = toMillis(order.expiresAt);
    if (expMs != null && now > expMs) {
      await db.collection('orders').doc(order.id).update({ status: 'expired', updatedAt: FieldValue.serverTimestamp() });
      result.ordersExpired += 1;
      continue;
    }

    const price = prices[order.symbol];
    if (price == null) continue; // price unavailable this tick; try next time

    const decision = evaluateOrder(order, price);

    // Keep the trailing high-water mark moving even when not filling.
    if (!decision && order.type === 'trailing-stop' && order.trailingPercent) {
      const next = order.side === 'sell'
        ? Math.max(order.highWaterMark ?? price, price)
        : Math.min(order.highWaterMark ?? price, price);
      if (next !== order.highWaterMark) {
        await db.collection('orders').doc(order.id).update({ highWaterMark: next, updatedAt: FieldValue.serverTimestamp() });
      }
      continue;
    }

    if (!decision) continue;

    const fee = order.amount * decision.fillPrice * TRADING_FEE_PERCENTAGE;
    await db.collection('orders').doc(order.id).update({
      status: 'filled',
      filledAmount: order.amount,
      filledPrice: decision.fillPrice,
      fee,
      ...(decision.updatedHwm != null ? { highWaterMark: decision.updatedHwm } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await recordTrade(db, {
      userId: order.userId,
      symbol: order.symbol,
      side: order.side,
      amount: order.amount,
      price: decision.fillPrice,
      fee,
      notes: `${order.type} order #${order.id} (auto)`,
    });
    result.ordersFilled += 1;
  }
}

async function processFutures(
  db: FirebaseFirestore.Firestore,
  result: EngineTickResult
) {
  const snap = await db
    .collection('futures_positions')
    .where('status', '==', 'open')
    .get();

  const positions = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  result.positionsScanned += positions.length;
  if (positions.length === 0) return;

  const symbols = Array.from(new Set(positions.map(p => p.symbol)));
  const prices = await fetchSpotPrices(symbols);

  for (const pos of positions) {
    const mark = prices[pos.symbol];
    if (mark == null) continue;
    if (isLiquidated(pos.side, pos.liquidationPrice, mark)) {
      await db.collection('futures_positions').doc(pos.id).update({
        status: 'liquidated',
        closePrice: pos.liquidationPrice,
        closedAt: FieldValue.serverTimestamp(),
        realizedPnl: -pos.marginUsd, // isolated margin is fully lost on liquidation
      });
      result.positionsLiquidated += 1;
    }
  }
}

/** Run one engine pass. Safe to call repeatedly (idempotent per price tick). */
export async function runEngineTick(): Promise<EngineTickResult> {
  const db = getAdminDb();
  const result: EngineTickResult = {
    ordersScanned: 0,
    ordersFilled: 0,
    ordersExpired: 0,
    positionsScanned: 0,
    positionsLiquidated: 0,
  };
  await processOrders(db, result);
  await processFutures(db, result);
  return result;
}
