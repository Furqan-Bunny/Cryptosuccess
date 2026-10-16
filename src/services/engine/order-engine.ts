// Server-only paper-trading execution engine (Supabase service-role client,
// which BYPASSES RLS). Single trigger for:
//   - limit / stop-loss / take-profit / trailing-stop order fills
//   - futures position liquidation
// Import only server-safe modules here.

import { createServiceClient } from '@/lib/supabase/server';
import { fetchSpotPrices } from '@/lib/server/binance-server';
import { TRADING_FEE_PERCENTAGE } from '@/types/trading.types';
import { isLiquidated } from '@/lib/futures';
import { hasSufficientHolding, LedgerTrade } from './holdings';

export interface EngineTickResult {
  ordersScanned: number;
  ordersFilled: number;
  ordersExpired: number;
  ordersCancelled: number;
  positionsScanned: number;
  positionsLiquidated: number;
}

type Db = ReturnType<typeof createServiceClient>;

const LEDGER_PAGE = 1000; // PostgREST's default max rows per request

// Every trade row for one user + symbol, paged so a long history is never
// silently truncated at the API row cap.
async function fetchLedger(db: Db, userId: string, symbol: string): Promise<LedgerTrade[]> {
  const rows: LedgerTrade[] = [];
  for (let from = 0; ; from += LEDGER_PAGE) {
    const { data, error } = await db
      .from('trades')
      .select('type, amount')
      .eq('user_id', userId)
      .eq('symbol', symbol)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + LEDGER_PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < LEDGER_PAGE) return rows;
  }
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
    notes: (row.notes as string | null) ?? null,
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

// Every status change below is CONDITIONAL on the row still being in the state
// we read (`.eq('status', 'pending')` + `.select()`), and side effects (the trade
// insert) only happen when exactly one row actually transitioned. Two
// overlapping ticks — or a user cancelling mid-tick — can therefore never fill an
// order twice or fill a cancelled one.
async function transitionPendingOrder(db: Db, orderId: string, patch: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await db
    .from('orders')
    .update(patch)
    .eq('id', orderId)
    .eq('status', 'pending')
    .select('id');
  if (error) {
    console.error(`engine: order ${orderId} update failed:`, error.message);
    return false;
  }
  return (data ?? []).length === 1;
}

function appendNote(existing: string | null, note: string): string {
  return existing ? `${existing} | ${note}` : note;
}

async function processOrders(db: Db, result: EngineTickResult) {
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
      if (await transitionPendingOrder(db, order.id, { status: 'expired', updated_at: new Date().toISOString() })) {
        result.ordersExpired += 1;
      }
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
        await db
          .from('orders')
          .update({ high_water_mark: next, updated_at: new Date().toISOString() })
          .eq('id', order.id)
          .eq('status', 'pending');
      }
      continue;
    }

    if (!decision) continue;

    // A SELL may only fill against units the user still holds. Re-read the
    // ledger now (not at order time): an earlier fill this tick — e.g. the other
    // leg of a stop-loss / take-profit pair — may already have sold them.
    if (order.side === 'sell') {
      let ledger: LedgerTrade[];
      try {
        ledger = await fetchLedger(db, order.userId, order.symbol);
      } catch (e) {
        console.error(`engine: ledger read failed for order ${order.id} (retry next tick):`, e);
        continue;
      }
      if (!hasSufficientHolding(ledger, order.amount)) {
        const cancelled = await transitionPendingOrder(db, order.id, {
          status: 'cancelled',
          notes: appendNote(order.notes, 'Cancelled by engine: insufficient holdings to sell'),
          updated_at: new Date().toISOString(),
        });
        if (cancelled) result.ordersCancelled += 1;
        continue;
      }
    }

    const fee = order.amount * decision.fillPrice * TRADING_FEE_PERCENTAGE;
    const filled = await transitionPendingOrder(db, order.id, {
      status: 'filled',
      filled_amount: order.amount,
      filled_price: decision.fillPrice,
      fee,
      ...(decision.updatedHwm != null ? { high_water_mark: decision.updatedHwm } : {}),
      updated_at: new Date().toISOString(),
    });
    // Someone else (another tick, or the user cancelling) got there first.
    if (!filled) continue;

    const { error: tradeErr } = await db.from('trades').insert({
      user_id: order.userId,
      symbol: order.symbol,
      type: order.side,
      amount: order.amount,
      price: decision.fillPrice,
      total_value: order.amount * decision.fillPrice,
      fee,
      notes: `${order.type} order #${order.id} (auto)`,
    });
    if (tradeErr) {
      // Keep order and ledger consistent: put the order back to pending so the
      // next tick retries, rather than leaving a "filled" order with no trade.
      console.error(`engine: trade insert failed for order ${order.id} (reverting):`, tradeErr.message);
      await db
        .from('orders')
        .update({ status: 'pending', filled_amount: null, filled_price: null, fee: null, updated_at: new Date().toISOString() })
        .eq('id', order.id)
        .eq('status', 'filled');
      continue;
    }
    result.ordersFilled += 1;
  }
}

async function processFutures(db: Db, result: EngineTickResult) {
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
      // Conditional on still being open: a position the user closed (and was
      // credited for) a moment ago must not also be marked liquidated.
      const { data: liquidated, error } = await db
        .from('futures_positions')
        .update({
          status: 'liquidated',
          close_price: Number(pos.liquidation_price),
          closed_at: new Date().toISOString(),
          realized_pnl: -Number(pos.margin_usd),
        })
        .eq('id', pos.id)
        .eq('status', 'open')
        .select('id');
      if (error) {
        console.error(`engine: liquidation of ${pos.id} failed:`, error.message);
        continue;
      }
      if ((liquidated ?? []).length === 1) result.positionsLiquidated += 1;
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
    ordersCancelled: 0,
    positionsScanned: 0,
    positionsLiquidated: 0,
  };
  await processOrders(db, result);
  await processFutures(db, result);
  return result;
}
