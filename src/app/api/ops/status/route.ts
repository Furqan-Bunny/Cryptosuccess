import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/server/report-error';
import {
  CRON_JOBS,
  CRON_NAMES,
  computeCronHealth,
  summarizeErrorEvents,
  type CronRunRow,
  type ErrorEventRow,
} from '@/lib/server/cron-monitor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const ERROR_SAMPLE_LIMIT = 500; // rows grouped for the by-context breakdown
const RUN_COLUMNS = 'name, started_at, finished_at, ok, error';
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

// Operator view of background-job health: last run + last success per cron,
// staleness against each job's expected cadence, and recent error volume. Makes
// silent scheduler failures visible. CRON_SECRET-gated (same Bearer token as the
// crons) — it exposes internals, so it is never public.
//
//   GET /api/ops/status            → 200 with the report
//   GET /api/ops/status?strict=1   → 503 when any job is stale/failing, so an
//                                    uptime monitor or the scheduler workflow
//                                    can alert on it.
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401, headers: NO_STORE });
  }

  const strictParam = request.nextUrl.searchParams.get('strict');
  if (strictParam !== null && !['0', '1', 'true', 'false'].includes(strictParam)) {
    return NextResponse.json({ ok: false, reason: 'invalid strict parameter' }, { status: 400, headers: NO_STORE });
  }
  const strict = strictParam === '1' || strictParam === 'true';

  try {
    const db = createServiceClient();
    const now = Date.now();
    const since = new Date(now - DAY_MS).toISOString();

    const perJob = await Promise.all(
      CRON_NAMES.map(async name => {
        const [latestRes, successRes] = await Promise.all([
          db.from('cron_runs').select(RUN_COLUMNS).eq('name', name).order('started_at', { ascending: false }).limit(1),
          db
            .from('cron_runs')
            .select(RUN_COLUMNS)
            .eq('name', name)
            .eq('ok', true)
            .order('started_at', { ascending: false })
            .limit(1),
        ]);
        if (latestRes.error) throw new Error(latestRes.error.message);
        if (successRes.error) throw new Error(successRes.error.message);
        return {
          name,
          latest: ((latestRes.data ?? [])[0] as CronRunRow | undefined) ?? null,
          lastSuccess: ((successRes.data ?? [])[0] as CronRunRow | undefined) ?? null,
        };
      }),
    );

    const [earliestRes, errorCountRes, errorRowsRes] = await Promise.all([
      db.from('cron_runs').select('started_at').order('started_at', { ascending: true }).limit(1),
      db.from('error_events').select('id', { count: 'exact', head: true }).gte('created_at', since),
      db
        .from('error_events')
        .select('context, message, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(ERROR_SAMPLE_LIMIT),
    ]);
    if (earliestRes.error) throw new Error(earliestRes.error.message);
    if (errorCountRes.error) throw new Error(errorCountRes.error.message);
    if (errorRowsRes.error) throw new Error(errorRowsRes.error.message);

    const earliest = (earliestRes.data ?? [])[0] as { started_at: string } | undefined;
    const monitoringSinceMs = earliest ? new Date(earliest.started_at).getTime() : null;

    const crons = perJob.map(j =>
      computeCronHealth(j.name, CRON_JOBS[j.name], j.latest, j.lastSuccess, now, monitoringSinceMs),
    );
    const degraded = crons.filter(c => c.degraded).map(c => c.name);

    return NextResponse.json(
      {
        ok: degraded.length === 0,
        ts: new Date(now).toISOString(),
        degraded,
        monitoringSince: earliest?.started_at ?? null,
        crons,
        errors: {
          last24h: errorCountRes.count ?? 0,
          byContext: summarizeErrorEvents((errorRowsRes.data ?? []) as ErrorEventRow[]),
        },
      },
      { status: strict && degraded.length > 0 ? 503 : 200, headers: NO_STORE },
    );
  } catch (error) {
    await reportError('ops.status', error, { route: '/api/ops/status' });
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500, headers: NO_STORE });
  }
}
