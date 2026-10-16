import { NextRequest, NextResponse } from 'next/server';
import { getUidFromToken, createServiceClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { fetchSpotPrice } from '@/lib/server/binance-server';
import { reportError } from '@/lib/server/report-error';
import { validateOpenFuturesInput } from '@/lib/paper-input';
import { buildPosition } from '@/lib/futures';
import { isEffectivePro } from '@/lib/subscription-rules';

const ROUTE = '/api/paper/futures/open';

export const dynamic = 'force-dynamic';

async function getUid(request: NextRequest): Promise<string | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return getUidFromToken(header.slice(7));
}

// Open a paper futures position. The entry price is the SERVER's live spot price
// (a client-chosen entry would let anyone mint paper profit), and the margin
// debit + position insert happen atomically in open_futures_position (0012).
export async function POST(request: NextRequest) {
  const uid = await getUid(request);
  if (!uid) return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });

  const rl = await rateLimit('paper-futures-open', uid, 20, 60);
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
  const parsed = validateOpenFuturesInput(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, reason: parsed.error }, { status: 400 });
  const input = parsed.value;

  const db = createServiceClient();

  // Futures are part of the Pro paper-trading suite. Fail closed if the plan
  // can't be read.
  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .select('subscription_status, plan_id, current_period_end')
    .eq('id', uid)
    .maybeSingle();
  if (profileErr) {
    await reportError('paper.futures.open.profile', profileErr, { route: ROUTE });
    return NextResponse.json({ ok: false, reason: 'unavailable' }, { status: 503 });
  }
  const pro =
    !!profile &&
    isEffectivePro({
      status: profile.subscription_status,
      planId: profile.plan_id,
      currentPeriodEnd: profile.current_period_end,
    });
  if (!pro) return NextResponse.json({ ok: false, reason: 'pro_required' }, { status: 403 });

  let entryPrice: number | null = null;
  try {
    entryPrice = await fetchSpotPrice(input.symbol);
  } catch {
    entryPrice = null;
  }
  if (entryPrice == null || !Number.isFinite(entryPrice) || entryPrice <= 0) {
    return NextResponse.json({ ok: false, reason: 'price_unavailable' }, { status: 503 });
  }

  const { quantity, liquidationPrice } = buildPosition(input.side, entryPrice, input.leverage, input.marginUsd);

  const { data: positionId, error } = await db.rpc('open_futures_position', {
    p_uid: uid,
    p_symbol: input.symbol,
    p_side: input.side,
    p_leverage: input.leverage,
    p_entry: entryPrice,
    p_quantity: quantity,
    p_margin: input.marginUsd,
    p_liquidation: liquidationPrice,
  });
  if (error) {
    if (/insufficient paper balance/i.test(error.message)) {
      return NextResponse.json({ ok: false, reason: 'insufficient_balance' }, { status: 409 });
    }
    await reportError('paper.futures.open', error, { route: ROUTE });
    return NextResponse.json({ ok: false, reason: 'open_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, positionId, entryPrice });
}
