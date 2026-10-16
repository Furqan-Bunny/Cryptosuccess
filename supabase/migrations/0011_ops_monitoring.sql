-- Ops monitoring: server error log, cron run history and alert throttling.
-- Run in the Supabase SQL editor before (or with) the deploy that ships
-- src/lib/server/report-error.ts + cron-monitor.ts. The app degrades gracefully
-- without it (writes are best effort and only logged on failure), but
-- GET /api/ops/status needs these tables to report anything.
--
-- Same lock-down pattern as 0003/0007: RLS enabled with NO policies, table
-- privileges revoked from anon/authenticated, functions SECURITY DEFINER and
-- executable by service_role only. Only the server's service-role client can
-- read or write any of this. Idempotent: safe to re-run.

-- ─────────────────────────────────── Error events ──────────────────────────
-- Written by reportError(). Messages/details are scrubbed of secrets and PII
-- in the app before insert; the length checks are a backstop.
create table if not exists public.error_events (
  id         uuid primary key default gen_random_uuid(),
  context    text not null check (char_length(context) between 1 and 64),
  message    text not null check (char_length(message) <= 1000),
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists error_events_created_at_idx
  on public.error_events (created_at desc);
create index if not exists error_events_context_created_at_idx
  on public.error_events (context, created_at desc);

alter table public.error_events enable row level security;
revoke all on table public.error_events from anon, authenticated;

-- ─────────────────────────────────── Cron runs ─────────────────────────────
-- One row per cron invocation (withCronMonitoring). finished_at/ok stay null
-- while running; a row that never finishes means the function was killed.
create table if not exists public.cron_runs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 64),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  summary     jsonb not null default '{}'::jsonb,
  error       text check (error is null or char_length(error) <= 1000)
);

create index if not exists cron_runs_name_started_at_idx
  on public.cron_runs (name, started_at desc);
-- Fast "last successful run" lookup per job.
create index if not exists cron_runs_name_ok_started_at_idx
  on public.cron_runs (name, started_at desc) where ok;
create index if not exists cron_runs_started_at_idx
  on public.cron_runs (started_at);

alter table public.cron_runs enable row level security;
revoke all on table public.cron_runs from anon, authenticated;

-- ─────────────────────────────────── Alert throttle ────────────────────────
-- Last admin alert per error context, so a burst of identical failures across
-- many serverless instances produces one Telegram message, not hundreds.
create table if not exists public.alert_throttle (
  context      text primary key check (char_length(context) between 1 and 64),
  last_sent_at timestamptz not null default now()
);

alter table public.alert_throttle enable row level security;
revoke all on table public.alert_throttle from anon, authenticated;

-- Atomically claim the right to alert for `p_context`: true when no alert was
-- sent within the last `p_window_seconds` (and records now() as the send time),
-- false otherwise. The conditional upsert makes concurrent callers race-safe —
-- exactly one of them wins a slot.
create or replace function public.claim_alert_slot(p_context text, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  claimed  text;
  v_window int := greatest(coalesce(p_window_seconds, 600), 60);
begin
  if p_context is null or char_length(p_context) = 0 or char_length(p_context) > 64 then
    return false;
  end if;

  insert into public.alert_throttle as t (context, last_sent_at)
    values (p_context, now())
  on conflict (context) do update
    set last_sent_at = now()
    where t.last_sent_at < now() - make_interval(secs => v_window)
  returning t.context into claimed;

  return claimed is not null;
end;
$$;

-- ─────────────────────────────────── Retention ─────────────────────────────
-- Deletes error events / cron runs older than the retention window (default 30
-- days, clamped to 7..365 so a bad argument can't wipe recent history) and
-- stale throttle rows. Called daily by the /api/ops/prune cron.
create or replace function public.prune_ops_events(p_retention_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_days     int := least(greatest(coalesce(p_retention_days, 30), 7), 365);
  cutoff     timestamptz := now() - make_interval(days => v_days);
  n_errors   int;
  n_runs     int;
  n_throttle int;
begin
  delete from public.error_events where created_at < cutoff;
  get diagnostics n_errors = row_count;

  delete from public.cron_runs where started_at < cutoff;
  get diagnostics n_runs = row_count;

  delete from public.alert_throttle where last_sent_at < now() - interval '1 day';
  get diagnostics n_throttle = row_count;

  return jsonb_build_object(
    'retentionDays', v_days,
    'errorEvents', n_errors,
    'cronRuns', n_runs,
    'alertThrottle', n_throttle
  );
end;
$$;

-- Only the server (service-role) may call these.
revoke all on function public.claim_alert_slot(text, int)  from public, anon, authenticated;
revoke all on function public.prune_ops_events(int)        from public, anon, authenticated;
grant execute on function public.claim_alert_slot(text, int) to service_role;
grant execute on function public.prune_ops_events(int)       to service_role;
