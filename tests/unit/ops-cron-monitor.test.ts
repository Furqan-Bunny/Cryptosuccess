/**
 * @jest-environment node
 */
// Cron staleness / failure classification behind GET /api/ops/status, plus the
// helpers that build run summaries and the error breakdown.

import {
  CRON_JOBS,
  CRON_NAMES,
  STUCK_AFTER_MINUTES,
  computeCronHealth,
  summarizeResponseBody,
  summarizeErrorEvents,
  type CronJobDef,
  type CronRunRow,
} from '@/lib/server/cron-monitor';

const MIN = 60 * 1000;
const NOW = Date.parse('2026-10-16T12:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const hourly: CronJobDef = { path: '/api/x', cadenceMinutes: 60, graceMinutes: 30, scheduledBy: 'test' };
const daily: CronJobDef = { path: '/api/y', cadenceMinutes: 1440, graceMinutes: 360, scheduledBy: 'test' };

function run(minsAgo: number, ok: boolean | null, finished = true, error: string | null = null): CronRunRow {
  return {
    name: 'job',
    started_at: iso(minsAgo * MIN),
    finished_at: finished ? iso(minsAgo * MIN - 1000) : null,
    ok,
    error,
  };
}

describe('computeCronHealth', () => {
  it('is ok when the last run succeeded within cadence + grace', () => {
    const r = run(30, true);
    const h = computeCronHealth('job', hourly, r, r, NOW);
    expect(h.status).toBe('ok');
    expect(h.degraded).toBe(false);
    expect(h.staleAfterMinutes).toBe(90);
    expect(h.minutesSinceLastSuccess).toBe(30);
    expect(h.lastRunOk).toBe(true);
  });

  it('is stale once the last success is older than cadence + grace', () => {
    const r = run(91, true);
    const h = computeCronHealth('job', hourly, r, r, NOW);
    expect(h.status).toBe('stale');
    expect(h.degraded).toBe(true);
  });

  it('treats the boundary (exactly cadence + grace) as still ok', () => {
    const r = run(90, true);
    expect(computeCronHealth('job', hourly, r, r, NOW).status).toBe('ok');
  });

  it('uses the per-job cadence (daily jobs tolerate a 25h gap)', () => {
    const r = run(25 * 60, true);
    expect(computeCronHealth('job', daily, r, r, NOW).status).toBe('ok');
    const old = run(31 * 60, true);
    expect(computeCronHealth('job', daily, old, old, NOW).status).toBe('stale');
  });

  it('is failing when the latest run failed, even with a recent success', () => {
    const latest = run(5, false, true, 'HTTP 500 (error)');
    const success = run(20, true);
    const h = computeCronHealth('job', hourly, latest, success, NOW);
    expect(h.status).toBe('failing');
    expect(h.degraded).toBe(true);
    expect(h.lastError).toBe('HTTP 500 (error)');
    expect(h.lastRunOk).toBe(false);
  });

  it('is failing when runs exist but none ever succeeded', () => {
    const latest = run(5, false);
    expect(computeCronHealth('job', hourly, latest, null, NOW).status).toBe('failing');
  });

  it('reports an in-flight run as running without degrading', () => {
    const latest = run(1, null, false);
    const success = run(61, true);
    const h = computeCronHealth('job', hourly, latest, success, NOW);
    expect(h.running).toBe(true);
    expect(h.status).toBe('ok');
    expect(h.lastRunOk).toBeNull();
  });

  it('flags a run that never finished (killed / timed out) as failing', () => {
    const latest = run(STUCK_AFTER_MINUTES + 1, null, false);
    const success = run(70, true);
    const h = computeCronHealth('job', hourly, latest, success, NOW);
    expect(h.running).toBe(false);
    expect(h.status).toBe('failing');
    expect(h.lastRunOk).toBe(false);
    expect(h.lastError).toMatch(/did not finish/);
  });

  it('does not degrade a never-run job right after monitoring starts', () => {
    const h = computeCronHealth('job', daily, null, null, NOW, NOW - 60 * MIN);
    expect(h.status).toBe('never_run');
    expect(h.degraded).toBe(false);
  });

  it('degrades a never-run job once monitoring has been live past its cadence', () => {
    const h = computeCronHealth('job', hourly, null, null, NOW, NOW - 120 * MIN);
    expect(h.status).toBe('never_run');
    expect(h.degraded).toBe(true);
  });

  it('does not degrade a never-run job when nothing has been monitored yet', () => {
    expect(computeCronHealth('job', hourly, null, null, NOW, null).degraded).toBe(false);
  });

  it('ignores an unparseable timestamp rather than throwing', () => {
    const bad: CronRunRow = { name: 'job', started_at: 'not-a-date', finished_at: null, ok: null, error: null };
    expect(computeCronHealth('job', hourly, bad, null, NOW).status).toBe('never_run');
  });
});

describe('CRON_JOBS registry', () => {
  it('covers every scheduled route with a sane cadence', () => {
    for (const name of CRON_NAMES) {
      const def = CRON_JOBS[name];
      expect(def.path).toMatch(/^\/api\//);
      expect(def.cadenceMinutes).toBeGreaterThan(0);
      expect(def.graceMinutes).toBeGreaterThan(0);
    }
    const paths = CRON_NAMES.map(n => CRON_JOBS[n].path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual(
      expect.arrayContaining(['/api/engine/tick', '/api/dca/run', '/api/staking/refresh', '/api/discover/scan', '/api/anchor/run']),
    );
  });

  it('keeps names short enough for the cron_runs check constraint', () => {
    for (const name of CRON_NAMES) expect(name.length).toBeLessThanOrEqual(64);
  });
});

describe('summarizeResponseBody', () => {
  it('keeps top-level primitives and drops ok, objects and arrays', () => {
    expect(
      summarizeResponseBody({ ok: true, executed: 3, chain: false, reason: 'error', nested: { a: 1 }, list: [1] }),
    ).toEqual({ executed: 3, chain: false, reason: 'error' });
  });

  it('scrubs and truncates strings, drops non-finite numbers', () => {
    const out = summarizeResponseBody({ note: 'mail ann@example.com ' + 'q'.repeat(200), inf: Infinity });
    expect(out.note).not.toContain('ann@example.com');
    expect((out.note as string).length).toBeLessThanOrEqual(64);
    expect(out).not.toHaveProperty('inf');
  });

  it('caps the number of keys and tolerates non-objects', () => {
    const body: Record<string, number> = {};
    for (let i = 0; i < 40; i++) body[`k${i}`] = i;
    expect(Object.keys(summarizeResponseBody(body))).toHaveLength(20);
    expect(summarizeResponseBody(null)).toEqual({});
    expect(summarizeResponseBody('text')).toEqual({});
    expect(summarizeResponseBody([1, 2])).toEqual({});
  });
});

describe('summarizeErrorEvents', () => {
  it('groups by context, busiest first, keeping the latest message', () => {
    const rows = [
      { context: 'cron.dca-run', message: 'newest dca', created_at: iso(1 * MIN) },
      { context: 'ops.status', message: 'status broke', created_at: iso(2 * MIN) },
      { context: 'cron.dca-run', message: 'older dca', created_at: iso(5 * MIN) },
    ];
    const out = summarizeErrorEvents(rows);
    expect(out).toEqual([
      { context: 'cron.dca-run', count: 2, lastAt: iso(1 * MIN), lastMessage: 'newest dca' },
      { context: 'ops.status', count: 1, lastAt: iso(2 * MIN), lastMessage: 'status broke' },
    ]);
  });

  it('breaks count ties by recency and respects the limit', () => {
    const rows = [
      { context: 'a', message: 'm', created_at: iso(10 * MIN) },
      { context: 'b', message: 'm', created_at: iso(1 * MIN) },
      { context: 'c', message: 'm', created_at: iso(5 * MIN) },
    ];
    expect(summarizeErrorEvents(rows).map(r => r.context)).toEqual(['b', 'c', 'a']);
    expect(summarizeErrorEvents(rows, 1)).toHaveLength(1);
    expect(summarizeErrorEvents([])).toEqual([]);
  });
});
