import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getUidFromToken, createServiceClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { generateAnalystTake } from '@/services/analyst.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // web search + multi-step reasoning needs headroom

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

    // Per-user rate limit — a cost/abuse backstop beyond the daily counter.
    const rl = await rateLimit('analyst', uid, 10, 60);
    if (!rl.ok) {
      return NextResponse.json(
        { available: false, reason: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      );
    }

    const { symbol, signal } = await request.json();
    if (!symbol) return NextResponse.json({ available: false, reason: 'bad_request' }, { status: 400 });

    const sym = String(symbol).toUpperCase();
    const db = createServiceClient();

    // Daily free-tier limit — enforced server-side and atomically here (the old
    // counter lived in the browser and was bypassable). Pro = unlimited. A
    // generation spends a credit even on a cache hit: the user still generated a
    // signal. consume_signal also resets the counter at UTC midnight.
    let remaining: number | undefined;
    try {
      const { data: prof } = await db
        .from('profiles')
        .select('subscription_status')
        .eq('id', uid)
        .maybeSingle();
      if (prof?.subscription_status === 'pro') {
        remaining = -1; // unlimited
      } else {
        const { data: gate, error: gateErr } = await db.rpc('consume_signal', { p_uid: uid });
        if (gateErr) throw gateErr;
        if (!gate?.allowed) {
          return NextResponse.json(
            { available: false, reason: 'limit_reached', remaining: 0 },
            { status: 402 }
          );
        }
        remaining = gate.remaining;
      }
    } catch (e) {
      // Fail CLOSED: if the quota can't be verified, don't burn API credit or
      // hand out the premium feature. (Migration 0003 must be applied first.)
      console.error('signal quota check failed (denying):', e);
      return NextResponse.json({ available: false, reason: 'quota_unavailable' }, { status: 503 });
    }

    // Shared brain: cache-first read + generate. See analyst.service.ts — the
    // same path the Telegram bot uses, so both surfaces reason identically.
    const result = await generateAnalystTake(sym, db, signal);
    if (!result) {
      return NextResponse.json({ available: false, reason: 'no_output' }, { status: 502 });
    }

    return NextResponse.json({ available: true, analysis: result.analysis, cached: result.cached, remaining });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(`AI analyst API error ${error.status}:`, error.message);
    } else {
      console.error('AI analyst error:', error);
    }
    return NextResponse.json({ available: false, reason: 'error' }, { status: 502 });
  }
}
