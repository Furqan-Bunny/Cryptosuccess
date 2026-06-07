import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchUsdtTickers } from '@/lib/server/binance-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Detects newly-listed USDT pairs by diffing Binance's current symbol set
// against a stored snapshot. First run seeds the snapshot (no flood of "new").
async function handler(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  try {
    const db = createServiceClient();

    const tickers = await fetchUsdtTickers();
    const current = new Map<string, number>();
    for (const t of tickers) {
      const base = t.symbol.replace(/USDT$/, '');
      if (base) current.set(base, t.quoteVolume);
    }
    const currentSymbols = Array.from(current.keys());

    const { data: snap } = await db
      .from('discovery_state')
      .select('symbols')
      .eq('id', 'known_symbols')
      .maybeSingle();
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
        await db.from('new_listings').insert(rows);
        added = rows.length;
      }
    }

    await db
      .from('discovery_state')
      .upsert({ id: 'known_symbols', symbols: currentSymbols, updated_at: new Date().toISOString() }, { onConflict: 'id' });

    return NextResponse.json({ ok: true, total: currentSymbols.length, added, seeded });
  } catch (error) {
    console.error('Discover scan error:', error);
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handler(request);
}
export async function POST(request: NextRequest) {
  return handler(request);
}
