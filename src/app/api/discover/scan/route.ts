import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { fetchUsdtTickers } from '@/lib/server/binance-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SNAPSHOT_DOC = 'discovery_state/known_symbols';

// Detects newly-listed USDT pairs by diffing Binance's current symbol set
// against a stored snapshot. New symbols are written to `new_listings` with a
// high-risk flag. The first run just seeds the snapshot (no flood of "new").
async function handler(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminDb();

    const tickers = await fetchUsdtTickers();
    // Base asset (strip trailing USDT) -> quote volume.
    const current = new Map<string, number>();
    for (const t of tickers) {
      const base = t.symbol.replace(/USDT$/, '');
      if (base) current.set(base, t.quoteVolume);
    }
    const currentSymbols = Array.from(current.keys());

    const snapRef = db.doc(SNAPSHOT_DOC);
    const snap = await snapRef.get();
    const known: string[] = snap.exists ? (snap.data()?.symbols ?? []) : [];

    let added = 0;
    if (snap.exists && known.length > 0) {
      const knownSet = new Set(known);
      const fresh = currentSymbols.filter(s => !knownSet.has(s));
      for (const symbol of fresh) {
        await db.collection('new_listings').add({
          symbol,
          pair: `${symbol}USDT`,
          quoteVolume: current.get(symbol) ?? 0,
          detectedAt: FieldValue.serverTimestamp(),
        });
        added += 1;
      }
    }

    await snapRef.set({ symbols: currentSymbols, updatedAt: FieldValue.serverTimestamp() });

    return NextResponse.json({ ok: true, total: currentSymbols.length, added, seeded: !snap.exists });
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
