import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { fetchSpotPrices } from '@/lib/server/binance-server';
import { TRADING_FEE_PERCENTAGE } from '@/types/trading.types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
function cadenceMs(cadence: string): number {
  return cadence === 'weekly' ? 7 * DAY_MS : DAY_MS;
}

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}

// Executes due DCA schedules: records a simulated buy into the `trades` ledger
// (same shape as portfolio.recordTrade) and advances the schedule.
async function handler(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminDb();
    const now = Date.now();

    const snap = await db.collection('dca_schedules').where('active', '==', true).get();
    const due = snap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .filter(s => toMillis(s.nextRunAt) <= now);

    if (due.length === 0) {
      return NextResponse.json({ ok: true, executed: 0 });
    }

    const symbols = Array.from(new Set(due.map(s => s.symbol)));
    const prices = await fetchSpotPrices(symbols);

    let executed = 0;
    for (const sched of due) {
      const price = prices[sched.symbol];
      if (!price || price <= 0) continue; // skip this cycle; retry next run

      const amount = sched.amountUsd / price;
      const fee = sched.amountUsd * TRADING_FEE_PERCENTAGE;

      await db.collection('trades').add({
        userId: sched.userId,
        symbol: sched.symbol,
        type: 'buy',
        amount,
        price,
        totalValue: sched.amountUsd,
        fee,
        timestamp: FieldValue.serverTimestamp(),
        notes: `DCA recurring buy (${sched.cadence})`,
      });

      await db.collection('dca_schedules').doc(sched.id).update({
        nextRunAt: new Date(now + cadenceMs(sched.cadence)),
        lastRunAt: FieldValue.serverTimestamp(),
      });
      executed += 1;
    }

    return NextResponse.json({ ok: true, executed });
  } catch (error) {
    console.error('DCA run error:', error);
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handler(request);
}
export async function POST(request: NextRequest) {
  return handler(request);
}
