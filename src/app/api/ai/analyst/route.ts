import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getUidFromToken, createServiceClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { generateAnalystTake } from '@/services/analyst.service';
import { isSupportedCoin } from '@/lib/coins';
import { isEffectivePro } from '@/lib/subscription-rules';
import { reportError } from '@/lib/server/report-error';

const ROUTE = '/api/ai/analyst';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // web search + multi-step reasoning needs headroom

// A non-Pro analyst call must follow a recorded (credit-spending) signal for the
// same coin within this window.
const RECENT_SIGNAL_WINDOW_MS = 10 * 60 * 1000;

async function getUid(request: NextRequest): Promise<string | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return getUidFromToken(header.slice(7));
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ available: false, reason: 'not_configured' });
  }

  try {
    // Auth gate: only signed-in users can trigger this (stops bots/random POSTs
    // from burning API credit on the public endpoint).
    const uid = await getUid(request);
    if (!uid) return NextResponse.json({ available: false, reason: 'unauthorized' }, { status: 401 });

    // Per-user rate limit — a cost/abuse backstop beyond the daily allowance.
    const rl = await rateLimit('analyst', uid, 10, 60);
    if (!rl.ok) {
      return NextResponse.json(
        { available: false, reason: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      );
    }

    const { symbol } = await request.json().catch(() => ({}));
    if (typeof symbol !== 'string' || !isSupportedCoin(symbol)) {
      return NextResponse.json({ available: false, reason: 'bad_request' }, { status: 400 });
    }

    const sym = symbol.toUpperCase();
    const db = createServiceClient();

    // Access gate. The free-tier credit is spent ONCE, by POST /api/signals/record
    // (the server-authoritative "Generate signal"); this route no longer consumes
    // one itself. Instead a non-Pro user must have recorded a signal for this coin
    // within the last few minutes, so the analyst read is tied to a metered
    // generation and can't be called on its own for free. Pro = unlimited (a
    // lapsed crypto Pro counts as free).
    try {
      const { data: prof, error: profErr } = await db
        .from('profiles')
        .select('subscription_status, plan_id, current_period_end')
        .eq('id', uid)
        .maybeSingle();
      if (profErr) throw profErr;

      const pro = !!prof && isEffectivePro({
        status: prof.subscription_status,
        planId: prof.plan_id,
        currentPeriodEnd: prof.current_period_end,
      });

      if (!pro) {
        const since = new Date(Date.now() - RECENT_SIGNAL_WINDOW_MS).toISOString();
        const { data: recent, error: recentErr } = await db
          .from('signals')
          .select('id')
          .eq('user_id', uid)
          .eq('symbol', sym)
          .gte('created_at', since)
          .limit(1);
        if (recentErr) throw recentErr;
        if (!recent || recent.length === 0) {
          return NextResponse.json({ available: false, reason: 'signal_required' }, { status: 402 });
        }
      }
    } catch (e) {
      // Fail CLOSED: if access can't be verified, don't burn API credit or hand
      // out the premium feature.
      await reportError('analyst.access', e, { route: ROUTE });
      return NextResponse.json({ available: false, reason: 'quota_unavailable' }, { status: 503 });
    }

    // Shared brain: cache-first read + generate. See analyst.service.ts — the
    // same path the Telegram bot uses, so both surfaces reason identically.
    // The take is cached per coin and shared by every user (and recorded by the
    // bot), so nothing from the request body reaches the prompt: the read is
    // built only from server-fetched market data and news.
    const result = await generateAnalystTake(sym, db);
    if (!result) {
      return NextResponse.json({ available: false, reason: 'no_output' }, { status: 502 });
    }

    return NextResponse.json({ available: true, analysis: result.analysis, cached: result.cached });
  } catch (error) {
    await reportError('analyst.generate', error, {
      route: ROUTE,
      ...(error instanceof Anthropic.APIError ? { apiStatus: error.status } : {}),
    });
    return NextResponse.json({ available: false, reason: 'error' }, { status: 502 });
  }
}
