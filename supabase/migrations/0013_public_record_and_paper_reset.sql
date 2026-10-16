-- Public track-record summary + one-time paper-money reset.
-- Run in the Supabase SQL editor after 0012, BEFORE deploying the matching code
-- (the /verify page reads /api/track-record, which calls track_record_summary).
-- Idempotent: safe to re-run; the reset in part 2 runs at most once per database.

-- ─────────────────────────────── 1. Public track-record summary ─────────────
-- Aggregate counts over the signals that are in an anchored daily tree, so a
-- logged-out visitor can see the live record (and how many days are confirmed
-- on-chain) without any per-signal or per-user data leaving the database.
-- Win/loss follow the app's rule (src/lib/signal-stats.ts): only BUY/SELL count;
-- HOLD is non-directional and excluded. Signals are immutable once scored
-- (0004), so the outcome joined here is the one that was hashed into the leaf.
create or replace function public.track_record_summary()
returns table (
  anchored_days bigint,
  confirmed_days bigint,
  anchored_signals bigint,
  directional bigint,
  wins bigint,
  losses bigint,
  first_day date,
  last_day date
) language sql stable security definer set search_path = public as $$
  with leaves as (
    select s.action, s.outcome, l.anchor_day
    from public.signal_leaves l
    join public.signals s on s.id = l.signal_id
  )
  select
    (select count(*) from public.signal_anchors),
    (select count(*) from public.signal_anchors where status = 'confirmed' and tx_hash is not null),
    count(*),
    count(*) filter (where action in ('BUY', 'SELL')),
    count(*) filter (where action in ('BUY', 'SELL') and outcome in ('hit_target', 'expired_profit')),
    count(*) filter (where action in ('BUY', 'SELL') and outcome in ('hit_stop', 'expired_loss')),
    min(anchor_day),
    max(anchor_day)
  from leaves;
$$;

revoke all on function public.track_record_summary() from public, anon, authenticated;
grant execute on function public.track_record_summary() to service_role;

-- ─────────────────────────────── 2. One-time paper-money reset ──────────────
-- Before 0012, clients could INSERT/UPDATE their own paper_accounts,
-- staking_positions and futures_positions rows directly. 0012 closed that, but
-- rows written before it are still trusted by unstake_position /
-- close_futures_position (which pay out from the row's own numbers), and forged
-- balances survive. Legacy rows can't be told apart from honest ones, so every
-- paper account is put back to the starting 10,000 USD and every open stake /
-- future is closed without payout — the same thing reset_paper_balance does for
-- one user. This is paper money only; signals and the track record are untouched.
-- Each affected user gets an in-app notification explaining the reset, and the
-- futures history shows a voided position as "Voided (paper reset)".
--
-- Guarded by a marker row so re-running this file (or ALL_MIGRATIONS.sql) never
-- wipes balances earned after the first run.
create table if not exists public.data_fixes (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table public.data_fixes enable row level security;
-- No policies: server-side bookkeeping only.

do $$
begin
  if not exists (select 1 from public.data_fixes where name = '0013_paper_reset') then
    -- Tell every affected user first (balance not already at the start value,
    -- or an open stake / future that is about to be voided), so nobody finds a
    -- changed balance or a voided position without an explanation. Inserted
    -- directly (not via profiles.notifications): this is an account notice, not
    -- a marketing or signal message.
    insert into public.notifications (user_id, type, title, message, read, data)
    select affected.user_id, 'system', 'Paper account reset',
           'We reset all paper balances to $10,000 and closed open simulated stakes and futures '
           || 'without payout after a data-integrity fix. Real money and your signal track record '
           || 'are not affected.',
           false, jsonb_build_object('reason', '0013_paper_reset')
    from (
      select user_id from public.paper_accounts where balance_usd <> 10000
      union
      select user_id from public.staking_positions where active
      union
      select user_id from public.futures_positions where status = 'open'
    ) affected
    where exists (select 1 from auth.users u where u.id = affected.user_id);

    update public.staking_positions
      set active = false, closed_at = now()
      where active;
    update public.futures_positions
      set status = 'closed', closed_at = now(), close_price = null, realized_pnl = null
      where status = 'open';
    update public.paper_accounts
      set balance_usd = 10000, updated_at = now();
    insert into public.data_fixes (name) values ('0013_paper_reset');
  end if;
end;
$$;
