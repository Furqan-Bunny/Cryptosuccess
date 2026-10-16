// Cron run monitoring. Every scheduled route records each run in `cron_runs`
// (migration 0011) so a job that silently stops running — scheduler secrets
// missing, Vercel cron not registered, function timing out — shows up as
// stale/failing on GET /api/ops/status instead of going unnoticed.
//
// Usage (inside the route, AFTER the auth check so unauthenticated callers can
// never write rows):
//
//   if (!isCronAuthorized(request)) return 401;
//   return withCronMonitoring('engine-tick', async () => { ...work...; return NextResponse.json(...) });
//
// The wrapper owns the catch: a thrown error is recorded, reported via
// reportError, and answered with the same `{ ok: false, reason: 'error' }` 500
// the routes have always returned. Monitoring writes are best effort and
// time-boxed — they never fail or block the job itself.

import { createServiceClient } from '@/lib/supabase/server';
import {
  reportError,
  errorMessage,
  scrubText,
  truncate,
  isOpsDbConfigured,
  withTimeout,
} from '@/lib/server/report-error';

export interface CronJobDef {
  /** Route that runs the job. */
  path: string;
  /** How often the job is expected to run, in minutes. */
  cadenceMinutes: number;
  /** Extra slack before a late run counts as stale (scheduler jitter / delays). */
  graceMinutes: number;
  /** Who triggers it — documentation for the ops status payload. */
  scheduledBy: string;
}

// Expected cadence per job. Hourly jobs are driven by .github/workflows/scheduler.yml
// (Vercel Hobby only allows daily crons); daily ones by vercel.json. GitHub
// Actions schedules can be delayed by 10-30+ minutes, hence the grace windows.
export const CRON_JOBS = {
  'engine-tick': {
    path: '/api/engine/tick',
    cadenceMinutes: 60,
    graceMinutes: 45,
    scheduledBy: 'github-actions hourly + vercel daily',
  },
  'signals-evaluate': {
    path: '/api/signals/evaluate',
    cadenceMinutes: 60,
    graceMinutes: 45,
    scheduledBy: 'github-actions hourly + vercel daily',
  },
  'anchor-run': { path: '/api/anchor/run', cadenceMinutes: 1440, graceMinutes: 360, scheduledBy: 'vercel daily' },
  'dca-run': { path: '/api/dca/run', cadenceMinutes: 1440, graceMinutes: 360, scheduledBy: 'vercel daily' },
  'staking-refresh': { path: '/api/staking/refresh', cadenceMinutes: 1440, graceMinutes: 360, scheduledBy: 'vercel daily' },
  'discover-scan': { path: '/api/discover/scan', cadenceMinutes: 1440, graceMinutes: 360, scheduledBy: 'vercel daily' },
  'brief-generate': { path: '/api/brief/generate', cadenceMinutes: 1440, graceMinutes: 360, scheduledBy: 'vercel daily' },
  'ops-prune': { path: '/api/ops/prune', cadenceMinutes: 1440, graceMinutes: 360, scheduledBy: 'vercel daily' },
} as const satisfies Record<string, CronJobDef>;

export type CronName = keyof typeof CRON_JOBS;
export const CRON_NAMES = Object.keys(CRON_JOBS) as CronName[];

/** A run that has not finished after this long was killed (maxDuration <= 300s). */
export const STUCK_AFTER_MINUTES = 15;

const MINUTE_MS = 60 * 1000;

export interface CronRunRow {
  name: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  error: string | null;
}

export type CronHealthStatus = 'ok' | 'stale' | 'failing' | 'never_run';

export interface CronHealth {
  name: string;
  path: string;
  scheduledBy: string;
  cadenceMinutes: number;
  staleAfterMinutes: number;
  status: CronHealthStatus;
  /** True when this job needs attention (drives ?strict=1 → 503). */
  degraded: boolean;
  running: boolean;
  lastRunAt: string | null;
  lastRunOk: boolean | null;
  lastSuccessAt: string | null;
  minutesSinceLastSuccess: number | null;
  lastError: string | null;
}

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Health of one job from its latest run, its latest successful run and the
 * current time. `monitoringSinceMs` (earliest recorded run of ANY job) lets a
 * never-run job count as degraded once monitoring has clearly been live longer
 * than its cadence — so a freshly deployed app isn't flagged, but a job that
 * was never scheduled is.
 */
export function computeCronHealth(
  name: string,
  def: CronJobDef,
  latest: CronRunRow | null,
  lastSuccess: CronRunRow | null,
  nowMs: number,
  monitoringSinceMs: number | null = null,
): CronHealth {
  const staleAfterMinutes = def.cadenceMinutes + def.graceMinutes;
  const staleAfterMs = staleAfterMinutes * MINUTE_MS;

  const base = {
    name,
    path: def.path,
    scheduledBy: def.scheduledBy,
    cadenceMinutes: def.cadenceMinutes,
    staleAfterMinutes,
  };

  const latestStart = toMs(latest?.started_at);
  if (!latest || latestStart === null) {
    const overdue = monitoringSinceMs !== null && nowMs - monitoringSinceMs > staleAfterMs;
    return {
      ...base,
      status: 'never_run',
      degraded: overdue,
      running: false,
      lastRunAt: null,
      lastRunOk: null,
      lastSuccessAt: null,
      minutesSinceLastSuccess: null,
      lastError: null,
    };
  }

  const unfinished = !latest.finished_at;
  const stuck = unfinished && nowMs - latestStart > STUCK_AFTER_MINUTES * MINUTE_MS;
  const running = unfinished && !stuck;
  const lastFailed = stuck || (!unfinished && latest.ok === false);

  const successStart = toMs(lastSuccess?.started_at);
  const sinceSuccessMs = successStart === null ? null : Math.max(0, nowMs - successStart);
  const stale = sinceSuccessMs === null || sinceSuccessMs > staleAfterMs;

  const status: CronHealthStatus = lastFailed ? 'failing' : stale ? 'stale' : 'ok';
  const lastError = stuck
    ? `did not finish within ${STUCK_AFTER_MINUTES} min (killed or timed out)`
    : latest.ok === false
      ? latest.error
      : null;

  return {
    ...base,
    status,
    degraded: status !== 'ok',
    running,
    lastRunAt: latest.started_at,
    lastRunOk: unfinished ? (stuck ? false : null) : latest.ok,
    lastSuccessAt: lastSuccess?.started_at ?? null,
    minutesSinceLastSuccess: sinceSuccessMs === null ? null : Math.floor(sinceSuccessMs / MINUTE_MS),
    lastError,
  };
}

export interface ErrorEventRow {
  context: string;
  message: string;
  created_at: string;
}

export interface ErrorContextSummary {
  context: string;
  count: number;
  lastAt: string;
  lastMessage: string;
}

/**
 * Group recent error events by context, busiest first (ties: most recent
 * first). Rows are expected newest-first, as the status route queries them.
 */
export function summarizeErrorEvents(rows: ErrorEventRow[], limit = 20): ErrorContextSummary[] {
  const byContext = new Map<string, ErrorContextSummary>();
  for (const row of rows) {
    const existing = byContext.get(row.context);
    if (existing) {
      existing.count += 1;
      if ((toMs(row.created_at) ?? 0) > (toMs(existing.lastAt) ?? 0)) {
        existing.lastAt = row.created_at;
        existing.lastMessage = truncate(row.message, 200);
      }
    } else {
      byContext.set(row.context, {
        context: row.context,
        count: 1,
        lastAt: row.created_at,
        lastMessage: truncate(row.message, 200),
      });
    }
  }
  return Array.from(byContext.values())
    .sort((a, b) => b.count - a.count || (toMs(b.lastAt) ?? 0) - (toMs(a.lastAt) ?? 0))
    .slice(0, Math.max(0, limit));
}

/**
 * Compact run summary from a route's JSON response: top-level primitives only
 * (counts, flags, short strings), scrubbed, at most 20 keys. `ok` is stored in
 * its own column so it is omitted here.
 */
export function summarizeResponseBody(body: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return out;
  let n = 0;
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (key === 'ok') continue;
    if (n >= 20) break;
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string') out[key] = truncate(scrubText(value), 64);
    else continue;
    n += 1;
  }
  return out;
}

function warn(message: string) {
  console.warn(JSON.stringify({ level: 'warn', context: 'cron-monitor', message: truncate(scrubText(message), 200) }));
}

async function startRun(name: CronName, startedAt: Date): Promise<string | null> {
  if (!isOpsDbConfigured()) return null;
  try {
    const { data, error } = await withTimeout(
      createServiceClient()
        .from('cron_runs')
        .insert({ name, started_at: startedAt.toISOString() })
        .select('id')
        .single(),
    );
    if (error) {
      warn(`cron_runs start insert failed: ${error.message}`);
      return null;
    }
    return (data as { id: string } | null)?.id ?? null;
  } catch (e) {
    warn(`cron_runs start insert failed: ${errorMessage(e).message}`);
    return null;
  }
}

async function finishRun(
  runId: string | null,
  row: {
    name: CronName;
    started_at: string;
    finished_at: string;
    ok: boolean;
    summary: Record<string, unknown>;
    error: string | null;
  },
): Promise<void> {
  if (!isOpsDbConfigured()) return;
  try {
    const db = createServiceClient();
    // If the start insert failed (e.g. a transient blip) write the whole row now.
    const { error } = runId
      ? await withTimeout(
          db
            .from('cron_runs')
            .update({ finished_at: row.finished_at, ok: row.ok, summary: row.summary, error: row.error })
            .eq('id', runId),
        )
      : await withTimeout(db.from('cron_runs').insert(row));
    if (error) warn(`cron_runs finish write failed: ${error.message}`);
  } catch (e) {
    warn(`cron_runs finish write failed: ${errorMessage(e).message}`);
  }
}

function errorResponse(): Response {
  // Identical to the routes' historical 500 body.
  return new Response(JSON.stringify({ ok: false, reason: 'error' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Run a cron job body with run recording + failure reporting. Call only after
 * the route's own auth check. A run fails when the body throws, answers with
 * HTTP >= 400, or answers `{ ok: false }`.
 */
export async function withCronMonitoring<R extends Response>(
  name: CronName,
  handler: () => Promise<R>,
): Promise<R | Response> {
  const def = CRON_JOBS[name];
  const startedAt = new Date();
  const runId = await startRun(name, startedAt);

  let response: R | Response;
  let thrown: unknown = null;
  let didThrow = false;
  try {
    response = await handler();
  } catch (e) {
    didThrow = true;
    thrown = e;
    response = errorResponse();
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  let body: unknown = null;
  if (!didThrow) {
    try {
      body = await response.clone().json();
    } catch {
      body = null; // non-JSON response — judged on status alone
    }
  }

  const bodyOk = !(body && typeof body === 'object' && (body as { ok?: unknown }).ok === false);
  const ok = !didThrow && response.status < 400 && bodyOk;
  const summary: Record<string, unknown> = {
    ...summarizeResponseBody(body),
    status: response.status,
    durationMs,
  };

  let errorText: string | null = null;
  if (!ok) {
    errorText = didThrow
      ? truncate(scrubText(errorMessage(thrown).message), 500)
      : `HTTP ${response.status}${typeof summary.reason === 'string' ? ` (${summary.reason})` : ''}`;
  }

  const tasks: Promise<unknown>[] = [
    finishRun(runId, {
      name,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      ok,
      summary,
      error: errorText,
    }),
  ];
  if (!ok) {
    tasks.push(
      reportError(`cron.${name}`, didThrow ? thrown : new Error(`${name} failed: ${errorText}`), {
        route: def.path,
        durationMs,
        status: response.status,
      }),
    );
  }
  await Promise.allSettled(tasks);

  return response;
}
