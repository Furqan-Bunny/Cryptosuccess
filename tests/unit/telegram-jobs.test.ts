// Batch selection in the Telegram cron jobs: already-handled or ineligible rows
// must never crowd the work that is actually due out of a run.
import type { SupabaseClient } from '@supabase/supabase-js';
import { runFollowUpJob } from '@/services/telegram/followup-job';
import { runPushJob } from '@/services/telegram/push-job';

type Row = Record<string, unknown>;

/**
 * A tiny in-memory stand-in for the supabase-js query builder: supports the
 * filters these jobs use (eq / in / like-prefix / gte / or / order / range /
 * limit) plus insert, update and delete.
 */
function fakeDb(tables: Record<string, Row[]>) {
  const updates: Array<{ table: string; patch: Row; ids: unknown[] }> = [];

  function builder(table: string) {
    let rows = () => tables[table] ?? [];
    const filters: Array<(r: Row) => boolean> = [];
    const orders: Array<{ col: string; asc: boolean }> = [];
    let range: [number, number] | null = null;
    let limit: number | null = null;
    let op: 'select' | 'update' | 'delete' | 'insert' = 'select';
    let patch: Row = {};
    let inserted: Row | null = null;

    const run = () => {
      if (op === 'insert') {
        const list = (tables[table] ??= []);
        if (table === 'telegram_followups' && list.some(r => r.signal_id === inserted!.signal_id)) {
          return { data: null, error: { message: 'duplicate', code: '23505' } };
        }
        list.push(inserted!);
        return { data: null, error: null };
      }
      let out = rows().filter(r => filters.every(f => f(r)));
      if (op === 'delete') {
        tables[table] = rows().filter(r => !out.includes(r));
        return { data: null, error: null };
      }
      if (op === 'update') {
        out.forEach(r => Object.assign(r, patch));
        updates.push({ table, patch, ids: out.map(r => r.telegram_id ?? r.id) });
        return { data: out, error: null };
      }
      for (const o of [...orders].reverse()) {
        out = [...out].sort((a, b) => {
          const av = a[o.col] as string | null;
          const bv = b[o.col] as string | null;
          if (av === bv) return 0;
          if (av == null) return -1; // nulls first
          if (bv == null) return 1;
          return (av < bv ? -1 : 1) * (o.asc ? 1 : -1);
        });
      }
      if (range) out = out.slice(range[0], range[1] + 1);
      if (limit != null) out = out.slice(0, limit);
      return { data: out, error: null };
    };

    const b: any = {
      select: () => b,
      eq: (col: string, v: unknown) => { filters.push(r => r[col] === v); return b; },
      is: (col: string, v: unknown) => { filters.push(r => r[col] === v); return b; },
      in: (col: string, vs: unknown[]) => { filters.push(r => vs.includes(r[col])); return b; },
      like: (col: string, pattern: string) => {
        const prefix = pattern.replace(/%$/, '');
        filters.push(r => typeof r[col] === 'string' && (r[col] as string).startsWith(prefix));
        return b;
      },
      gte: (col: string, v: string) => { filters.push(r => typeof r[col] === 'string' && (r[col] as string) >= v); return b; },
      or: (expr: string) => {
        // Only the "x.is.null,x.lt.<iso>" form used by the push job.
        const m = /^(\w+)\.is\.null,\1\.lt\.(.+)$/.exec(expr);
        if (!m) throw new Error(`unsupported or(): ${expr}`);
        const [, col, iso] = m;
        filters.push(r => r[col] == null || (r[col] as string) < iso);
        return b;
      },
      order: (col: string, o?: { ascending?: boolean }) => { orders.push({ col, asc: o?.ascending !== false }); return b; },
      range: (from: number, to: number) => { range = [from, to]; return b; },
      limit: (n: number) => { limit = n; return b; },
      insert: (row: Row) => { op = 'insert'; inserted = { ...row }; return b; },
      update: (p: Row) => { op = 'update'; patch = p; return b; },
      delete: () => { op = 'delete'; return b; },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    return b;
  }

  return { db: { from: (t: string) => builder(t) } as unknown as SupabaseClient, tables, updates };
}

const hex = (n: number) => n.toString(16).padStart(12, '0');
const uuid = (n: number) => `00000000-0000-4000-8000-${hex(n)}`;

function signalRow(n: number, userId: string, evaluatedAt: string): Row {
  return {
    id: uuid(n), user_id: userId, symbol: 'BTC', action: 'BUY',
    entry_price: '100', target_price: '110', stop_loss: '95', outcome: 'expired_profit',
    profit_loss_percent: '1.5', price_at_24h: '101.5', reasoning: 'Telegram analyst read (1-3 days): x',
    created_at: '2026-10-14T09:00:00.000Z', evaluated_at: evaluatedAt,
  };
}

describe('runFollowUpJob batch selection', () => {
  it('reaches unsent calls even when more than a batch of newer calls were already followed up', async () => {
    const now = Date.now();
    const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
    const signals: Row[] = [];
    const followups: Row[] = [];
    // 250 recent calls, all already followed up (each user has their own chat).
    for (let i = 0; i < 250; i++) {
      signals.push(signalRow(i, `done-user-${i}`, iso(10 + i)));
      followups.push({ signal_id: uuid(i), telegram_id: 1000 + i });
    }
    // 3 older calls that still need a follow-up.
    for (let i = 0; i < 3; i++) signals.push(signalRow(900 + i, 'u-waiting', iso(600 + i)));

    const { db } = fakeDb({
      signals,
      telegram_followups: followups,
      telegram_users: [{ telegram_id: 4242, user_id: 'u-waiting', updated_at: iso(1) }],
    });
    const send = jest.fn().mockResolvedValue(undefined);
    const res = await runFollowUpJob({ db, send, verifyUrl: 'https://x/verify', deadline: now + 60_000 });

    expect(res.sent).toBe(3);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.every(c => c[0] === '4242')).toBe(true);
  });
});

describe('runPushJob batch selection', () => {
  it('moves ineligible opted-in chats to the back of the queue', async () => {
    const prefs: Row[] = [
      { telegram_id: 1, risk_level: 'medium', coins: ['BTC'], alerts_enabled: true, last_push_at: null }, // not linked
      { telegram_id: 2, risk_level: 'medium', coins: ['BTC'], alerts_enabled: true, last_push_at: null }, // free plan
    ];
    const { db, tables } = fakeDb({
      telegram_prefs: prefs,
      telegram_users: [{ telegram_id: 1, user_id: null }, { telegram_id: 2, user_id: 'free-user' }],
      profiles: [{ id: 'free-user', subscription_status: 'free', plan_id: null, current_period_end: null }],
    });
    const send = jest.fn();
    const res = await runPushJob({
      db, send,
      analyst: jest.fn(),
      spotPrices: jest.fn().mockResolvedValue({}),
      verifyUrl: 'https://x/verify',
      startDeadline: Date.now() + 60_000,
      generateDeadline: Date.now() + 60_000,
    });

    expect(res.eligible).toBe(0);
    expect(send).not.toHaveBeenCalled();
    // Both were deferred (alerts setting kept), so the next run starts elsewhere.
    for (const row of tables.telegram_prefs) {
      expect(row.alerts_enabled).toBe(true);
      expect(typeof row.last_push_at).toBe('string');
    }
  });
});
