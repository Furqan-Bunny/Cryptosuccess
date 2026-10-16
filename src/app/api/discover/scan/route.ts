import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchUsdtTickers } from '@/lib/server/binance-server';
import { withCronMonitoring } from '@/lib/server/cron-monitor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Detects newly-listed USDT pairs by diffing Binance's current symbol set
// against a stored snapshot. First run seeds the snapshot (no flood of "new").
async function handler(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  return withCronMonitoring('discover-scan', async () => {
    const db = createServiceClient();

    const tickers = await fetchUsdtTickers();
    const current = new Map<string, number>();
    for (const t of tickers) {
      const base = t.symbol.replace(/USDT$/, '');
      if (base) current.set(base, t.quoteVolume);
    }
    const currentSymbols = Array.from(current.keys());

    const { data: snap, error: snapErr } = await db
      .from('discovery_state')
      .select('symbols')
      .eq('id', 'known_symbols')
      .maybeSingle();
    // A failed read must not be mistaken for "first run" (which would re-seed
    // and drop this window's new listings).
    if (snapErr) throw new Error(snapErr.message);
    const known: string[] = snap?.symbols ?? [];

    let added = 0;
    const seeded = !snap;
    if (!seeded && known.length > 0) {
      const knownSet = new Set(known);
      const fresh = currentSymbols.filter(s => !knownSet.has(s));
      if (fresh.length > 0) {
        const rows = fresh.map(symbol => ({
          symbol,
          pair: `${symbol}USDT`,
          quote_volume: current.get(symbol) ?? 0,
        }));
        const { error: insertErr } = await db.from('new_listings').insert(rows);
        // Don't advance the snapshot past listings we failed to record.
        if (insertErr) throw new Error(insertErr.message);
        added = rows.length;
      }
    }

    const { error: upsertErr } = await db
      .from('discovery_state')
      .upsert({ id: 'known_symbols', symbols: currentSymbols, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (upsertErr) throw new Error(upsertErr.message);

    return NextResponse.json({ ok: true, total: currentSymbols.length, added, seeded });
  });
}

export async function GET(request: NextRequest) {
  return handler(request);
}
export async function POST(request: NextRequest) {
  return handler(request);
}
