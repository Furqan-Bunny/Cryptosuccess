-- Verifiable, tamper-proof track record: daily Merkle roots of finalized signals
-- anchored on-chain. Run in the Supabase SQL editor after 0004.
--
-- Written by the anchoring cron (service-role); read-only to authenticated users
-- so anyone can pull an inclusion proof and verify it against the on-chain root.

-- ─────────────────────────────────────────────────────────── Tables ─────────

-- One row per anchored UTC day.
create table if not exists public.signal_anchors (
  day date primary key,                       -- UTC day of signal finalization
  merkle_root text not null,                   -- 0x… bytes32
  leaf_count int not null,
  network text,                                -- e.g. 'base-sepolia'
  contract_address text,
  tx_hash text,                                -- null until the chain send confirms
  block_number bigint,
  status text not null default 'pending',      -- pending | confirmed | skipped
  created_at timestamptz not null default now()
);

-- One row per signal included in a day's tree. Stores the exact canonical leaf
-- string that was hashed, so the proof API can serve it and the client can
-- re-hash + verify without reconstructing Postgres text formatting.
create table if not exists public.signal_leaves (
  signal_id uuid primary key references public.signals(id) on delete cascade,
  anchor_day date not null references public.signal_anchors(day) on delete cascade,
  leaf_index int not null,
  leaf_hash text not null,                     -- 0x… bytes32
  canonical text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_signal_leaves_day_index
  on public.signal_leaves (anchor_day, leaf_index);

-- ──────────────────────────────────────────────────────────── RLS ───────────

alter table public.signal_anchors enable row level security;
alter table public.signal_leaves  enable row level security;

-- Read-only to signed-in users; no write policy → only the service-role key
-- (the anchoring cron) may write (same pattern as staking_rates in 0001).
create policy "signal_anchors_read" on public.signal_anchors for select to authenticated using (true);
create policy "signal_leaves_read"  on public.signal_leaves  for select to authenticated using (true);

-- ──────────────────────────────────────────── Server-only helper functions ──

-- Finalized signals for a UTC day, with ALL numerics as TEXT (no float
-- round-trip) and timestamps in a fixed ISO form. Deterministic order by id so
-- the leaf indexing is stable across runs. Service-role only.
create or replace function public.finalized_signal_leaves(p_day date)
returns table (
  id uuid, user_id uuid, symbol text, action text,
  confidence text, entry_price text, target_price text, stop_loss text,
  outcome text, profit_loss_percent text, created_at text, evaluated_at text
) language sql stable set search_path = public as $$
  select
    s.id, s.user_id, s.symbol, s.action,
    s.confidence::text, s.entry_price::text, s.target_price::text, s.stop_loss::text,
    s.outcome, s.profit_loss_percent::text,
    to_char(s.created_at  at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    to_char(s.evaluated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  from public.signals s
  where s.outcome is not null and s.outcome <> 'pending'
    and s.evaluated_at is not null
    and (s.evaluated_at at time zone 'utc')::date = p_day
  order by s.id asc;
$$;

-- Past UTC days that have finalized signals but no anchor row yet (backfill-safe).
create or replace function public.unanchored_signal_days()
returns table (day date) language sql stable set search_path = public as $$
  select distinct (s.evaluated_at at time zone 'utc')::date as day
  from public.signals s
  where s.outcome is not null and s.outcome <> 'pending'
    and s.evaluated_at is not null
    and (s.evaluated_at at time zone 'utc')::date < (now() at time zone 'utc')::date
    and not exists (
      select 1 from public.signal_anchors a
      where a.day = (s.evaluated_at at time zone 'utc')::date
    )
  order by day asc;
$$;

revoke all on function public.finalized_signal_leaves(date) from public, anon, authenticated;
revoke all on function public.unanchored_signal_days()      from public, anon, authenticated;
grant execute on function public.finalized_signal_leaves(date) to service_role;
grant execute on function public.unanchored_signal_days()      to service_role;
