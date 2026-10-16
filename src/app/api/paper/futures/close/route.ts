import { NextRequest, NextResponse } from 'next/server';
import { getUidFromToken, createServiceClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { fetchSpotPrice } from '@/lib/server/binance-server';
import { reportError } from '@/lib/server/report-error';
import { validateCloseFuturesInput } from '@/lib/paper-input';

const ROUTE = '/api/paper/futures/close';

export const dynamic = 'force-dynamic';

async function getUid(request: NextRequest): Promise<string | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return getUidFromToken(header.slice(7));
}

// Close one of the caller's open paper futures positions at the SERVER's live
// mark price. close_futures_position (0012) re-checks ownership and the open
// status under a row lock, computes PnL from the stored row and credits the
// payout in the same transaction, so a double click or a concurrent liquidation
// can never pay twice. Closing is allowed after Pro lapses, so funds never stick.
export async function POST(request: NextRequest) {
  const uid = await getUid(request);
  if (!uid) return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });

  const rl = await rateLimit('paper-futures-close', uid, 30, 60);
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
  const parsed = validateCloseFuturesInput(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, reason: parsed.error }, { status: 400 });

  const db = createServiceClient();

  // Only to learn which coin to price; the RPC re-reads and locks the row.
  const { data: row, error: readErr } = await db
    .from('futures_positions')
    .select('symbol, status')
    .eq('id', parsed.value.positionId)
    .eq('user_id', uid)
    .maybeSingle();
  if (readErr) {
    await reportError('paper.futures.close.read', readErr, { route: ROUTE });
    return NextResponse.json({ ok: false, reason: 'close_failed' }, { status: 500 });
  }
  if (!row) return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 });
  if (row.status !== 'open') {
    return NextResponse.json({ ok: false, reason: 'not_open', status: row.status }, { status: 409 });
  }

  let mark: number | null = null;
  try {
    mark = await fetchSpotPrice(String(row.symbol));
  } catch {
    mark = null;
  }
  if (mark == null || !Number.isFinite(mark) || mark <= 0) {
    return NextResponse.json({ ok: false, reason: 'price_unavailable' }, { status: 503 });
  }

  const { data, error } = await db.rpc('close_futures_position', {
    p_uid: uid,
    p_id: parsed.value.positionId,
    p_mark: mark,
  });
  if (error || !data || typeof data !== 'object') {
    await reportError('paper.futures.close', error ?? new Error('close_futures_position returned no result'), { route: ROUTE });
    return NextResponse.json({ ok: false, reason: 'close_failed' }, { status: 500 });
  }
  if (data.closed !== true) {
    const reason = data.reason === 'not_found' ? 'not_found' : 'not_open';
    return NextResponse.json({ ok: false, reason, status: data.status ?? null }, { status: reason === 'not_found' ? 404 : 409 });
  }

  // `liquidated`: the mark was already past the liquidation price, so the
  // position settled as a liquidation (margin lost) rather than a close.
  return NextResponse.json({
    ok: true,
    realizedPnl: Number(data.realized_pnl),
    closePrice: mark,
    liquidated: data.liquidated === true,
  });
}
