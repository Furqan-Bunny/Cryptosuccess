import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchSpotPrices } from '@/lib/server/binance-server';
import { deriveOutcome, SignalAction } from '@/lib/signal-outcome';
import { buildSignalScoredNotification, ScoredSignal } from '@/lib/signal-notification';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 500; // bound work per tick
const NOTIFY_CHUNK = 100; // keeps the `in (...)` uuid list well under URL length limits

type ScoredRow = ScoredSignal & { userId: string };

// Best-effort: tell each user their signal was scored (wins AND losses) via an
// in-app notification, respecting the profiles.notifications opt-out. Batched
// (one profile lookup + one insert per chunk). Any failure is logged and
// swallowed — a notification problem must never fail or retry the evaluation,
// which has already been committed.
async function notifyScoredSignals(db: ReturnType<typeof createServiceClient>, scored: ScoredRow[]) {
  for (let i = 0; i < scored.length; i += NOTIFY_CHUNK) {
    const chunk = scored.slice(i, i + NOTIFY_CHUNK);
    try {
      const userIds = Array.from(new Set(chunk.map(s => s.userId)));
      const { data: optedIn, error: profErr } = await db
        .from('profiles')
        .select('id')
        .in('id', userIds)
        .eq('notifications', true);
      if (profErr) throw new Error(profErr.message);

      const allowed = new Set((optedIn ?? []).map(p => p.id as string));
      const rows = chunk
        .filter(s => allowed.has(s.userId))
        .map(s => {
          const n = buildSignalScoredNotification(s);
          return { user_id: s.userId, type: n.type, title: n.title, message: n.message, data: n.data, read: false };
        });
      if (rows.length === 0) continue;

      const { error: insErr } = await db.from('notifications').insert(rows);
      if (insErr) throw new Error(insErr.message);
    } catch (error) {
      console.error('Signal notification error (evaluation unaffected):', error);
    }
  }
}

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
      .select('id, user_id, symbol, action, entry_price, target_price, stop_loss')
      .eq('outcome', 'pending')
      .lte('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return NextResponse.json({ ok: true, evaluated: 0 });

    const prices = await fetchSpotPrices(rows.map(r => r.symbol as string));

    let evaluated = 0;
    const scored: ScoredRow[] = [];
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

      // Conditional on still being pending, so an overlapping tick can't score
      // (or notify) the same signal twice; `select` tells us if we won the race.
      const { data: updated, error: upErr } = await db
        .from('signals')
        .update({
          price_at_24h: price,
          profit_loss_percent: profitLossPercent,
          outcome,
          evaluated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('outcome', 'pending')
        .select('id');
      if (upErr || !updated || updated.length === 0) continue;

      evaluated += 1;
      if (row.user_id) {
        scored.push({
          id: String(row.id),
          userId: String(row.user_id),
          symbol: String(row.symbol),
          action: row.action as SignalAction,
          outcome,
          profitLossPercent,
          entryPrice,
          priceAt24h: price,
        });
      }
    }

    await notifyScoredSignals(db, scored);

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
