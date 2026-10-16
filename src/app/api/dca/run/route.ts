import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchSpotPrices } from '@/lib/server/binance-server';
import { withCronMonitoring } from '@/lib/server/cron-monitor';
import { reportError } from '@/lib/server/report-error';
import { TRADING_FEE_PERCENTAGE } from '@/types/trading.types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
function cadenceMs(cadence: string): number {
  return cadence === 'weekly' ? 7 * DAY_MS : DAY_MS;
}
function toMillis(value: any): number {
  if (!value) return 0;
  return new Date(value).getTime();
}

// Executes due DCA schedules: records a simulated buy into `trades` and advances
// the schedule. A schedule is only advanced once its trade row is written, so a
// failed insert is retried on the next run instead of silently skipping a buy.
async function handler(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  return withCronMonitoring('dca-run', async () => {
    const db = createServiceClient();
    const now = Date.now();

    const { data: rows, error: selectErr } = await db.from('dca_schedules').select('*').eq('active', true);
    if (selectErr) throw new Error(selectErr.message);
    const due = (rows ?? []).filter(s => toMillis(s.next_run_at) <= now);
    if (due.length === 0) return NextResponse.json({ ok: true, executed: 0 });

    const symbols = Array.from(new Set(due.map(s => s.symbol)));
    const prices = await fetchSpotPrices(symbols);

    let executed = 0;
    let failed = 0;
    let firstError: string | null = null;
    for (const sched of due) {
      const price = prices[sched.symbol];
      if (!price || price <= 0) continue;

      const amountUsd = Number(sched.amount_usd);
      const amount = amountUsd / price;
      const fee = amountUsd * TRADING_FEE_PERCENTAGE;

      const { error: tradeErr } = await db.from('trades').insert({
        user_id: sched.user_id,
        symbol: sched.symbol,
        type: 'buy',
        amount,
        price,
        total_value: amountUsd,
        fee,
        notes: `DCA recurring buy (${sched.cadence})`,
      });
      if (tradeErr) {
        // Leave next_run_at untouched so the buy is retried next run.
        failed += 1;
        firstError = firstError ?? tradeErr.message;
        continue;
      }

      const { error: advanceErr } = await db
        .from('dca_schedules')
        .update({
          next_run_at: new Date(now + cadenceMs(sched.cadence)).toISOString(),
          last_run_at: new Date().toISOString(),
        })
        .eq('id', sched.id);
      if (advanceErr) {
        // The buy was recorded but the schedule did not advance — surface it,
        // since the next run would buy again.
        failed += 1;
        firstError = firstError ?? advanceErr.message;
      }
      executed += 1;
    }

    if (failed > 0) {
      await reportError('cron.dca-run.partial', new Error(firstError ?? 'DCA write failed'), {
        route: '/api/dca/run',
        executed,
        failed,
      });
    }

    return NextResponse.json({ ok: true, executed, failed });
  });
}

export async function GET(request: NextRequest) {
  return handler(request);
}
export async function POST(request: NextRequest) {
  return handler(request);
}
