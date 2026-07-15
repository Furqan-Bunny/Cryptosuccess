import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchSpotPrices } from '@/lib/server/binance-server';
import { deriveOutcome } from '@/lib/signal-outcome';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 500; // bound work per tick

// Server-authoritative signal evaluation. Finalizes still-`pending` signals older
// than 24h using the current spot price and the shared deterministic scorer, then
// writes the outcome with the service-role client (which bypasses the
// `protect_evaluated_signals` immutability trigger from migration 0004). This
// replaces the old client-side evaluate-on-render path so the record can't be
// tampered with — a prerequisite for on-chain anchoring.
async function handler(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  try {
    const db = createServiceClient();
    const cutoff = new Date(Date.now() - DAY_MS).toISOString();

    const { data: rows, error } = await db
      .from('signals')
      .select('id, symbol, action, entry_price, target_price, stop_loss')
      .eq('outcome', 'pending')
      .lte('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return NextResponse.json({ ok: true, evaluated: 0 });

    const prices = await fetchSpotPrices(rows.map(r => r.symbol as string));

    let evaluated = 0;
    for (const row of rows) {
      const price = prices[String(row.symbol).toUpperCase()];
      const entryPrice = Number(row.entry_price);
      // Skip if we couldn't price it, or the row lacks a usable entry — leave it
      // pending so a later tick can retry rather than record a bogus outcome.
      if (!price || price <= 0 || !Number.isFinite(entryPrice) || entryPrice <= 0) continue;

      const { outcome, profitLossPercent } = deriveOutcome(
        {
          action: row.action,
          entryPrice,
          targetPrice: Number(row.target_price),
          stopLoss: Number(row.stop_loss),
        },
        price
      );

      const { error: upErr } = await db
        .from('signals')
        .update({
          price_at_24h: price,
          profit_loss_percent: profitLossPercent,
          outcome,
          evaluated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (!upErr) evaluated += 1;
    }

    return NextResponse.json({ ok: true, evaluated });
  } catch (error) {
    console.error('Signal evaluation error:', error);
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handler(request);
}
export async function POST(request: NextRequest) {
  return handler(request);
}
