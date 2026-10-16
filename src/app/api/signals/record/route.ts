import { NextRequest, NextResponse } from 'next/server';
import { getUidFromToken, createServiceClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { fetchSpotPrice } from '@/lib/server/binance-server';
import { validateSignalInput, isEntryNearSpot, rebaseToSpot } from '@/lib/signal-input';
import { reportError } from '@/lib/server/report-error';
import { TELEGRAM_READ_PREFIX } from '@/services/bot/record';

const ROUTE = '/api/signals/record';

export const dynamic = 'force-dynamic';

async function getUid(request: NextRequest): Promise<string | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return getUidFromToken(header.slice(7));
}

// Server-authoritative "Generate signal". This is the ONLY way a web signal
// enters the track record (migration 0009 removed client INSERT on `signals`),
// and it is the one place a free-tier credit is spent:
//   1. validate the call (catalogue symbol, coherent bracket, sane numbers),
//   2. re-price it on live spot — the stored entry is the SERVER's price and the
//      timestamp is the database's, so nothing can be back-filled with hindsight,
//   3. consume_signal (fail closed), insert with the service role,
//   4. refund the credit if the insert fails.
// The analyst route then only checks that a signal was recorded recently.
export async function POST(request: NextRequest) {
  const uid = await getUid(request);
  if (!uid) return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });

  // Per-user abuse backstop (Pro has no daily cap).
  const rl = await rateLimit('signal-record', uid, 10, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, reason: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_body' }, { status: 400 });
  }

  const parsed = validateSignalInput(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, reason: parsed.error }, { status: 400 });
  const input = parsed.value;
  // The Telegram follow-up cron selects bot calls by this reasoning prefix; a web
  // signal must not be able to pass itself off as one.
  if (input.reasoning.toLowerCase().startsWith(TELEGRAM_READ_PREFIX.toLowerCase())) {
    return NextResponse.json({ ok: false, reason: 'invalid_reasoning' }, { status: 400 });
  }

  // Price BEFORE spending a credit, so a market-data outage costs the user nothing.
  let spot: number | null = null;
  try {
    spot = await fetchSpotPrice(input.symbol);
  } catch {
    spot = null;
  }
  if (spot == null || !Number.isFinite(spot) || spot <= 0) {
    return NextResponse.json({ ok: false, reason: 'price_unavailable' }, { status: 503 });
  }
  if (!isEntryNearSpot(input.entryPrice, spot)) {
    return NextResponse.json({ ok: false, reason: 'stale_price' }, { status: 409 });
  }

  const db = createServiceClient();

  // Daily allowance. consume_signal returns remaining -1 for Pro (never
  // increments) and downgrades a lapsed crypto Pro. Fail CLOSED if it can't run.
  let remaining: number;
  try {
    const { data: gate, error: gateErr } = await db.rpc('consume_signal', { p_uid: uid });
    if (gateErr) throw gateErr;
    if (!gate?.allowed) {
      return NextResponse.json({ ok: false, reason: 'limit_reached', remaining: 0 }, { status: 402 });
    }
    remaining = Number(gate.remaining);
    if (!Number.isFinite(remaining)) throw new Error('consume_signal returned no remaining');
  } catch (e) {
    await reportError('signals.record.quota', e, { route: ROUTE });
    return NextResponse.json({ ok: false, reason: 'quota_unavailable' }, { status: 503 });
  }

  const levels = rebaseToSpot(input, spot);

  // created_at / outcome / evaluated_at are never taken from the client:
  // created_at defaults to now() in the database, the evaluation cron scores it.
  const { data: row, error: insertErr } = await db
    .from('signals')
    .insert({
      user_id: uid,
      symbol: input.symbol,
      action: input.action,
      confidence: input.confidence,
      entry_price: levels.entryPrice,
      target_price: levels.targetPrice,
      stop_loss: levels.stopLoss,
      reasoning: input.reasoning,
      outcome: 'pending',
    })
    .select('id')
    .single();

  if (insertErr || !row) {
    await reportError('signals.record.insert', insertErr ?? new Error('insert returned no row'), { route: ROUTE });
    // Give the credit back — the user got nothing for it. Pro (-1) never spent one.
    if (remaining >= 0) {
      try {
        const { data: refund, error: refundErr } = await db.rpc('refund_signal', { p_uid: uid });
        if (refundErr) throw refundErr;
        if (refund && Number.isFinite(Number(refund.remaining))) remaining = Number(refund.remaining);
      } catch (e) {
        await reportError('signals.record.refund', e, { route: ROUTE });
      }
    }
    return NextResponse.json({ ok: false, reason: 'record_failed', remaining }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: row.id,
    remaining,
    entryPrice: levels.entryPrice,
    targetPrice: levels.targetPrice,
    stopLoss: levels.stopLoss,
  });
}
