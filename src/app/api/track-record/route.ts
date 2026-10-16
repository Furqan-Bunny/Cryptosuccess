import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { rateLimit, clientIp } from '@/lib/server/rate-limit';
import { reportError } from '@/lib/server/report-error';
import { toTrackRecordSummary, RECENT_ANCHOR_DAYS, type TrackRecordSummary } from '@/lib/track-record-summary';

export const dynamic = 'force-dynamic';

// The summary changes at most once a day (when the anchor cron runs), so one
// computation per instance per few minutes is plenty; the CDN caches it too.
const MEMO_MS = 5 * 60 * 1000;
let memo: { at: number; value: TrackRecordSummary } | null = null;

// Public, logged-out view of the live record: aggregate counts over every
// anchored signal plus the most recent anchored days. No signal ids or user ids
// are returned (see src/lib/track-record-summary.ts).
export async function GET(request: NextRequest) {
  // Cheap, cached read; light per-IP cap as an abuse backstop (fails open).
  const rl = await rateLimit('track-record', clientIp(request.headers), 60, 60);
  if (!rl.ok) {
    return NextResponse.json({ available: false, reason: 'rate_limited' }, { status: 429 });
  }

  const headers = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' };
  if (memo && Date.now() - memo.at < MEMO_MS) {
    return NextResponse.json({ available: true, summary: memo.value }, { headers });
  }

  try {
    const db = createServiceClient();
    const [{ data: rows, error: sErr }, { data: anchors, error: aErr }] = await Promise.all([
      db.rpc('track_record_summary'),
      db
        .from('signal_anchors')
        .select('day, leaf_count, status, tx_hash')
        .order('day', { ascending: false })
        .limit(RECENT_ANCHOR_DAYS),
    ]);
    if (sErr) throw sErr;
    if (aErr) throw aErr;

    const row = Array.isArray(rows) ? rows[0] : rows;
    const value = toTrackRecordSummary(row ?? null, anchors ?? []);
    memo = { at: Date.now(), value };
    return NextResponse.json({ available: true, summary: value }, { headers });
  } catch (e) {
    await reportError('track-record.summary', e, { route: '/api/track-record' });
    return NextResponse.json({ available: false, reason: 'error' }, { status: 503 });
  }
}
