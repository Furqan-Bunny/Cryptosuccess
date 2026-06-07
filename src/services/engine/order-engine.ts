// Server-only paper-trading execution engine (Supabase service-role client,
// which BYPASSES RLS). Single trigger for:
//   - limit / stop-loss / take-profit / trailing-stop order fills
//   - futures position liquidation
// Import only server-safe modules here.

import { createServiceClient } from '@/lib/supabase/server';
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
  if (value instanceof Date) return value.getTime();
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

// Normalize a Postgres order row (snake_case) to the camelCase shape the
// trigger logic uses.
function mapOrder(row: any) {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    symbol: row.symbol as string,
    type: row.type as string,
    side: row.side as 'buy' | 'sell',
    amount: Number(row.amount),
    price: row.price != null ? Number(row.price) : undefined,
    stopPrice: row.stop_price != null ? Number(row.stop_price) : undefined,
    trailingPercent: row.trailing_percent != null ? Number(row.trailing_percent) : undefined,
    highWaterMark: row.high_water_mark != null ? Number(row.high_water_mark) : undefined,
    expiresAt: row.expires_at ?? null,
  };
}

function evaluateOrder(order: any, price: number): { fillPrice: number; updatedHwm?: number } | null {
  switch (order.type) {
    case 'limit': {
      if (order.price == null) return null;
      const hit = (order.side === 'buy' && price <= order.price) || (order.side === 'sell' && price >= order.price);
      return hit ? { fillPrice: order.price } : null;
    }
    case 'stop-loss': {
      if (order.stopPrice == null) return null;
      const hit = (order.side === 'sell' && price <= order.stopPrice) || (order.side === 'buy' && price >= order.stopPrice);
      return hit ? { fillPrice: price } : null;
    }
    case 'take-profit': {
      if (order.stopPrice == null) return null;
      const hit = (order.side === 'sell' && price >= order.stopPrice) || (order.side === 'buy' && price <= order.stopPrice);
      return hit ? { fillPrice: price } : null;
    }
    case 'trailing-stop': {
      const pct = order.trailingPercent;
      if (!pct || pct <= 0) return null;
      const frac = pct / 100;
      if (order.side === 'sell') {
        const hwm = Math.max(order.highWaterMark ?? price, price);
        const stop = hwm * (1 - frac);
        if (price <= stop) return { fillPrice: price, updatedHwm: hwm };
        return null;
      } else {
        const lwm = Math.min(order.highWaterMark ?? price, price);
        const stop = lwm * (1 + frac);
        if (price >= stop) return { fillPrice: price, updatedHwm: lwm };
        return null;
      }
    }
    default:
      return null;
  }
}

async function processOrders(db: ReturnType<typeof createServiceClient>, result: EngineTickResult) {
  const { data: rows } = await db.from('orders').select('*').eq('status', 'pending');
  const orders = (rows ?? []).map(mapOrder);
  result.ordersScanned += orders.length;
  if (orders.length === 0) return;

  const conditional = orders.filter(o => o.type !== 'market');
  const symbols = Array.from(new Set(conditional.map(o => o.symbol)));
  const prices = await fetchSpotPrices(symbols);
  const now = Date.now();

  for (const order of conditional) {
    const expMs = toMillis(order.expiresAt);
    if (expMs != null && now > expMs) {
      await db.from('orders').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', order.id);
      result.ordersExpired += 1;
      continue;
    }

    const price = prices[order.symbol];
    if (price == null) continue;

    const decision = evaluateOrder(order, price);

    // Ratchet trailing high-water mark even when not filling.
    if (!decision && order.type === 'trailing-stop' && order.trailingPercent) {
      const next = order.side === 'sell'
        ? Math.max(order.highWaterMark ?? price, price)
        : Math.min(order.highWaterMark ?? price, price);
      if (next !== order.highWaterMark) {
        await db.from('orders').update({ high_water_mark: next, updated_at: new Date().toISOString() }).eq('id', order.id);
      }
      continue;
    }

    if (!decision) continue;

    const fee = order.amount * decision.fillPrice * TRADING_FEE_PERCENTAGE;
    await db
      .from('orders')
      .update({
        status: 'filled',
        filled_amount: order.amount,
        filled_price: decision.fillPrice,
        fee,
        ...(decision.updatedHwm != null ? { high_water_mark: decision.updatedHwm } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    await db.from('trades').insert({
      user_id: order.userId,
      symbol: order.symbol,
      type: order.side,
      amount: order.amount,
      price: decision.fillPrice,
      total_value: order.amount * decision.fillPrice,
      fee,
      notes: `${order.type} order #${order.id} (auto)`,
    });
    result.ordersFilled += 1;
  }
}

async function processFutures(db: ReturnType<typeof createServiceClient>, result: EngineTickResult) {
  const { data: rows } = await db.from('futures_positions').select('*').eq('status', 'open');
  const positions = rows ?? [];
  result.positionsScanned += positions.length;
  if (positions.length === 0) return;

  const symbols = Array.from(new Set(positions.map((p: any) => p.symbol)));
  const prices = await fetchSpotPrices(symbols);

  for (const pos of positions as any[]) {
    const mark = prices[pos.symbol];
    if (mark == null) continue;
    if (isLiquidated(pos.side, Number(pos.liquidation_price), mark)) {
      await db
        .from('futures_positions')
        .update({
          status: 'liquidated',
          close_price: Number(pos.liquidation_price),
          closed_at: new Date().toISOString(),
          realized_pnl: -Number(pos.margin_usd),
        })
        .eq('id', pos.id);
      result.positionsLiquidated += 1;
    }
  }
}

/** Run one engine pass. Idempotent per price tick. */
export async function runEngineTick(): Promise<EngineTickResult> {
  const db = createServiceClient();
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
