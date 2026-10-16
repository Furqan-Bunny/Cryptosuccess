-- CryptoSuccess — all migrations 0001→0011 combined. Paste into Supabase SQL Editor and Run.
-- GENERATED from supabase/migrations/*.sql — do not edit by hand; regenerate when a migration is added.


-- ============================================================
-- 0001_init.sql
-- ============================================================
-- CryptoSuccess — initial Supabase schema (Firebase → Supabase migration)
-- Run in the Supabase SQL editor (or `supabase db push`). Idempotent-ish: safe
-- to run once on a fresh project.

-- ───────────────────────────────────────────────────────────── Tables ──────

-- Mirrors the Firebase user profile. PK = auth.users.id.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  photo_url text,
  subscription_status text not null default 'free',  -- free | pro | cancelled
  plan_id text,
  customer_id text,
  current_period_end timestamptz,
  signals_used_today int not null default 0,
  last_reset_date timestamptz not null default now(),
  notifications boolean not null default true,
  timezone text,
  watchlist text[] not null default '{ETH,SOL,BNB}',
  total_signals_viewed int not null default 0,
  portfolio_summary jsonb,
  created_at timestamptz not null default now(),
  last_login timestamptz not null default now()
);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  type text not null,                 -- buy | sell
  amount numeric not null,
  price numeric not null,
  total_value numeric not null,
  fee numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  type text not null,                 -- market | limit | stop-loss | take-profit | trailing-stop
  side text not null,                 -- buy | sell
  amount numeric not null,
  price numeric,
  stop_price numeric,
  trailing_percent numeric,
  high_water_mark numeric,
  status text not null default 'pending',  -- pending | filled | cancelled | expired
  filled_amount numeric,
  filled_price numeric,
  fee numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  expires_at timestamptz
);

create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  action text not null,               -- BUY | SELL | HOLD
  confidence numeric,
  entry_price numeric,
  target_price numeric,
  stop_loss numeric,
  reasoning text,
  outcome text default 'pending',
  profit_loss_percent numeric,
  price_at_24h numeric,
  created_at timestamptz not null default now(),
  evaluated_at timestamptz
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,                 -- signal | price_alert | system | subscription
  title text not null,
  message text not null,
  read boolean not null default false,
  data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.paper_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_usd numeric not null default 10000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dca_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  amount_usd numeric not null,
  cadence text not null,              -- daily | weekly
  active boolean not null default true,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.futures_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  side text not null,                 -- long | short
  leverage numeric not null,
  entry_price numeric not null,
  quantity numeric not null,
  margin_usd numeric not null,
  margin_mode text not null default 'isolated',
  liquidation_price numeric not null,
  status text not null default 'open',     -- open | closed | liquidated
  realized_pnl numeric,
  close_price numeric,
  funding_paid numeric,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.staking_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  amount_usd numeric not null,
  apy_snapshot numeric not null,
  active boolean not null default true,
  started_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.staking_rates (
  symbol text primary key,
  apy numeric not null,
  project text,
  source text,
  updated_at timestamptz not null default now()
);

create table if not exists public.briefs (
  date text primary key,             -- YYYY-MM-DD
  markdown text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.new_listings (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  pair text not null,
  quote_volume numeric,
  detected_at timestamptz not null default now()
);

create table if not exists public.discovery_state (
  id text primary key,               -- e.g. 'known_symbols'
  symbols text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────── Indexes ──────

create index if not exists idx_trades_user_created on public.trades (user_id, created_at desc);
create index if not exists idx_orders_user_created on public.orders (user_id, created_at desc);
create index if not exists idx_orders_status on public.orders (status);
create index if not exists idx_signals_user_created on public.signals (user_id, created_at desc);
create index if not exists idx_signals_symbol_created on public.signals (symbol, created_at desc);
create index if not exists idx_notifications_user_created on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_user_read on public.notifications (user_id, read);
create index if not exists idx_dca_user_created on public.dca_schedules (user_id, created_at desc);
create index if not exists idx_dca_active_next on public.dca_schedules (active, next_run_at);
create index if not exists idx_futures_user_opened on public.futures_positions (user_id, opened_at desc);
create index if not exists idx_futures_status on public.futures_positions (status);
create index if not exists idx_staking_user_started on public.staking_positions (user_id, started_at desc);
create index if not exists idx_new_listings_detected on public.new_listings (detected_at desc);

-- ─────────────────────────────────────────────── Functions & triggers ──────

-- Auto-create a profile row when a new auth user signs up (replaces the
-- Cloud Function onUserCreated + client createUserProfile).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, photo_url, timezone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name',
             new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    'UTC'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Block clients from editing subscription columns directly (only the
-- service-role key, used by the Stripe webhook, may change them).
create or replace function public.protect_subscription_columns()
returns trigger language plpgsql as $$
begin
  if auth.role() is distinct from 'service_role' then
    if new.subscription_status is distinct from old.subscription_status
       or new.plan_id is distinct from old.plan_id
       or new.customer_id is distinct from old.customer_id
       or new.current_period_end is distinct from old.current_period_end then
      raise exception 'Subscription fields are server-managed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_subscription on public.profiles;
create trigger protect_subscription
  before update on public.profiles
  for each row execute function public.protect_subscription_columns();

-- Atomic paper-cash adjustment with overdraft guard (replaces runTransaction).
create or replace function public.adjust_paper_balance(delta numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  new_balance numeric;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  insert into public.paper_accounts (user_id, balance_usd)
    values (uid, 10000)
    on conflict (user_id) do nothing;
  update public.paper_accounts
    set balance_usd = balance_usd + delta, updated_at = now()
    where user_id = uid
    returning balance_usd into new_balance;
  if new_balance < 0 then
    raise exception 'Insufficient paper balance';
  end if;
  return new_balance;
end;
$$;

grant execute on function public.adjust_paper_balance(numeric) to authenticated;

-- ──────────────────────────────────────────────────────────────── RLS ──────

alter table public.profiles            enable row level security;
alter table public.trades              enable row level security;
alter table public.orders              enable row level security;
alter table public.signals             enable row level security;
alter table public.notifications       enable row level security;
alter table public.paper_accounts      enable row level security;
alter table public.dca_schedules       enable row level security;
alter table public.futures_positions   enable row level security;
alter table public.staking_positions   enable row level security;
alter table public.staking_rates       enable row level security;
alter table public.briefs              enable row level security;
alter table public.new_listings        enable row level security;
alter table public.discovery_state     enable row level security;

-- profiles: owner read/update (subscription columns guarded by trigger above)
create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Owner-scoped tables (full CRUD by owner). Service-role bypasses RLS.
do $$
declare t text;
begin
  foreach t in array array['trades','orders','notifications','paper_accounts','dca_schedules','futures_positions','staking_positions']
  loop
    execute format('create policy %I on public.%I for select using (user_id = auth.uid());', t||'_select_own', t);
    execute format('create policy %I on public.%I for insert with check (user_id = auth.uid());', t||'_insert_own', t);
    execute format('create policy %I on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid());', t||'_update_own', t);
    execute format('create policy %I on public.%I for delete using (user_id = auth.uid());', t||'_delete_own', t);
  end loop;
end $$;

-- signals: any authenticated user can read the stream; write only own rows.
create policy "signals_select_all" on public.signals for select to authenticated using (true);
create policy "signals_insert_own" on public.signals for insert with check (user_id = auth.uid());
create policy "signals_update_own" on public.signals for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Server-written, read-only to signed-in users (no client write policy → only
-- the service-role key, which bypasses RLS, can write).
create policy "staking_rates_read" on public.staking_rates for select to authenticated using (true);
create policy "briefs_read"        on public.briefs        for select to authenticated using (true);
create policy "new_listings_read"  on public.new_listings  for select to authenticated using (true);

-- discovery_state: no policies → only the service-role key may touch it.

-- ─────────────────────────────────────────────────────────── Realtime ──────
alter publication supabase_realtime add table public.notifications;


-- ============================================================
-- 0002_analyst_cache.sql
-- ============================================================
-- Cache for the Claude AI analyst take, keyed by coin symbol.
-- The analyst route writes here with the service-role client and reads it back
-- before making any Anthropic calls, so repeated "Generate signal" requests for
-- the same coin (across all users) reuse one paid analysis within a TTL window
-- instead of burning API credit every time.

create table if not exists public.analyst_takes (
  symbol text primary key,
  analysis jsonb not null,
  -- Spot price captured when this take was generated. The route invalidates the
  -- cache early (before the TTL) when the live price has moved sharply since,
  -- so a stale "bullish" read isn't served through a dump.
  price numeric,
  created_at timestamptz not null default now()
);

-- Backfill the column on projects where 0002 was already applied without it.
alter table public.analyst_takes add column if not exists price numeric;

alter table public.analyst_takes enable row level security;

-- Read-only to signed-in users (the route uses service-role which bypasses RLS;
-- this just allows optional direct client reads). No client write policy: only
-- the service-role server client may write the cache.
drop policy if exists "analyst_takes_select_all" on public.analyst_takes;
create policy "analyst_takes_select_all"
  on public.analyst_takes for select
  to authenticated
  using (true);


-- ============================================================
-- 0003_security_metering.sql
-- ============================================================
-- Security & usage-metering hardening.
-- Run in the Supabase SQL editor BEFORE deploying the matching code: the analyst
-- route fails closed (denies free-tier generation) if consume_signal is missing,
-- and the Stripe webhook's idempotency insert needs processed_stripe_events.

-- ─────────────────────────────────── Atomic daily signal limit ──────────────
-- Replaces the old client-side, race-prone, local-midnight counter
-- (auth.service.incrementSignalUsage). Called from /api/ai/analyst via the
-- service-role client, so it takes the uid explicitly (auth.uid() is null there).
-- The row lock makes concurrent generations race-safe; the reset is UTC-correct.
create or replace function public.consume_signal(p_uid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  prof   record;
  did_reset boolean;
  used   int;
begin
  select subscription_status, signals_used_today, last_reset_date,
         total_signals_viewed
    into prof
    from public.profiles
    where id = p_uid
    for update;                       -- row lock → atomic against concurrent calls

  if not found then
    return jsonb_build_object('allowed', false, 'remaining', 0);
  end if;

  -- Pro = unlimited; never increments the counter.
  if prof.subscription_status = 'pro' then
    return jsonb_build_object('allowed', true, 'remaining', -1);
  end if;

  -- UTC calendar-day reset (the old code used local midnight).
  did_reset := (prof.last_reset_date at time zone 'utc')::date
               < (now() at time zone 'utc')::date;
  used := case when did_reset then 0 else prof.signals_used_today end;

  -- Free tier: 5/day. At the cap, persist the reset (if any) but don't grant.
  if used >= 5 then
    if did_reset then
      update public.profiles
        set signals_used_today = 0, last_reset_date = now()
        where id = p_uid;
    end if;
    return jsonb_build_object('allowed', false, 'remaining', 0);
  end if;

  update public.profiles
    set signals_used_today  = used + 1,
        last_reset_date      = case when did_reset then now() else last_reset_date end,
        total_signals_viewed = coalesce(total_signals_viewed, 0) + 1
    where id = p_uid;

  return jsonb_build_object('allowed', true, 'remaining', 5 - (used + 1));
end;
$$;

-- Only the server (service-role) calls this; clients must not self-consume.
revoke all on function public.consume_signal(uuid) from public, anon, authenticated;
grant execute on function public.consume_signal(uuid) to service_role;

-- ─────────────────────────────────── Stripe webhook idempotency ─────────────
-- Stripe retries deliveries; persist processed event ids so a retry is a no-op.
-- RLS on with no policies → only the service-role webhook can touch it
-- (same pattern as discovery_state in 0001).
create table if not exists public.processed_stripe_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

alter table public.processed_stripe_events enable row level security;


-- ============================================================
-- 0004_signal_integrity.sql
-- ============================================================
-- Signal-record immutability (prerequisite for on-chain anchoring).
-- Run in the Supabase SQL editor after 0003.
--
-- Signal evaluation is now server-authoritative: the hourly cron
-- `/api/signals/evaluate` finalizes pending signals with the SERVICE-ROLE client
-- (which bypasses RLS). Clients only INSERT and READ signals — they must never be
-- able to rewrite their own history, or the "tamper-proof track record" we anchor
-- on-chain would be meaningless.
--
-- Mechanism: drop the client UPDATE policy. With RLS enabled and no UPDATE policy,
-- UPDATE is denied for the anon/authenticated roles, while the service-role key
-- (engine + evaluation cron) still updates because it bypasses RLS entirely. This
-- is simpler and stronger than a column-level trigger: signals become effectively
-- insert-only + read for every client. SELECT (signals_select_all) and INSERT
-- (signals_insert_own) policies from 0001 are unchanged.

drop policy if exists "signals_update_own" on public.signals;

-- Defense-in-depth: even if an UPDATE policy is re-added later, block any client
-- (non-service-role) mutation of the scored/leaf columns once a row exists, so an
-- anchored signal can never be altered off the books.
create or replace function public.protect_signal_record()
returns trigger language plpgsql as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Signals are immutable once created (server-managed)';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_signal_record on public.signals;
create trigger protect_signal_record
  before update on public.signals
  for each row execute function public.protect_signal_record();


-- ============================================================
-- 0005_track_record_anchors.sql
-- ============================================================
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


-- ============================================================
-- 0006_crypto_payments.sql
-- ============================================================
-- Crypto payments (NOWPayments) webhook idempotency.
-- Run in the Supabase SQL editor after 0005.
--
-- The crypto payment provider retries webhook (IPN) deliveries; persist processed event ids so a
-- retry is a no-op. RLS on with no policy → only the service-role webhook can
-- touch it (same pattern as processed_stripe_events in 0003).
create table if not exists public.processed_crypto_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

alter table public.processed_crypto_events enable row level security;


-- ============================================================
-- 0007_telegram_users.sql
-- ============================================================
-- Telegram bot: user mapping, account linking, and per-user signal metering.
-- Run in the Supabase SQL editor BEFORE deploying the Telegram webhook code:
-- the webhook fails closed (denies /signal) if consume_telegram_signal is missing.
--
-- Design mirrors 0003 (consume_signal): all functions are SECURITY DEFINER and
-- callable ONLY by the service-role client the bot uses. Tables have RLS enabled
-- with NO policies → only the service-role bypass can read/write them (same
-- pattern as discovery_state in 0001 and processed_stripe_events in 0003).

-- ─────────────────────────────────── Telegram user rows ────────────────────
-- One row per Telegram chat we've seen. `user_id` links to a CryptoSuccess
-- account (null = unlinked). Metering columns give unlinked / free users their
-- own UTC-daily allowance without needing a profiles row.
create table if not exists public.telegram_users (
  telegram_id        bigint primary key,          -- Telegram chat/user id
  user_id            uuid references public.profiles(id) on delete set null,
  username           text,
  signals_used_today int not null default 0,
  last_reset_date    timestamptz not null default now(),
  first_seen         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists telegram_users_user_id_idx on public.telegram_users(user_id);

alter table public.telegram_users enable row level security;

-- ─────────────────────────────────── One-time link codes ───────────────────
-- The web app mints a short-lived code for a signed-in user; the user sends
-- `/link <code>` to the bot to bind their Telegram id to their account.
create table if not exists public.telegram_link_codes (
  code       text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

create index if not exists telegram_link_codes_user_id_idx on public.telegram_link_codes(user_id);

alter table public.telegram_link_codes enable row level security;

-- ─────────────────────────────────── Upsert on first contact ───────────────
-- Called for every inbound update so metering/linking always has a row. Returns
-- the (possibly newly-created) row's user_id link state.
create or replace function public.touch_telegram_user(p_telegram_id bigint, p_username text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.telegram_users (telegram_id, username)
    values (p_telegram_id, p_username)
  on conflict (telegram_id) do update
    set username = coalesce(excluded.username, public.telegram_users.username),
        updated_at = now();
end;
$$;

-- ─────────────────────────────────── Atomic daily signal limit ─────────────
-- Telegram analogue of consume_signal. If the chat is linked to a PRO account →
-- unlimited. Otherwise a UTC-daily free allowance (5/day) tracked on the
-- telegram row. Row lock makes concurrent generations race-safe.
create or replace function public.consume_telegram_signal(p_telegram_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tu        record;
  is_pro    boolean := false;
  did_reset boolean;
  used      int;
begin
  -- Ensure a row exists, then lock it.
  insert into public.telegram_users (telegram_id) values (p_telegram_id)
    on conflict (telegram_id) do nothing;

  select * into tu from public.telegram_users
    where telegram_id = p_telegram_id
    for update;

  -- Linked to a Pro account? unlimited, never increments.
  if tu.user_id is not null then
    select (subscription_status = 'pro') into is_pro
      from public.profiles where id = tu.user_id;
    if is_pro then
      return jsonb_build_object('allowed', true, 'remaining', -1, 'linked', true, 'pro', true);
    end if;
  end if;

  -- UTC calendar-day reset.
  did_reset := (tu.last_reset_date at time zone 'utc')::date
               < (now() at time zone 'utc')::date;
  used := case when did_reset then 0 else tu.signals_used_today end;

  -- Free tier: 5/day. At the cap, persist the reset (if any) but don't grant.
  if used >= 5 then
    if did_reset then
      update public.telegram_users
        set signals_used_today = 0, last_reset_date = now(), updated_at = now()
        where telegram_id = p_telegram_id;
    end if;
    return jsonb_build_object('allowed', false, 'remaining', 0,
                              'linked', tu.user_id is not null, 'pro', false);
  end if;

  update public.telegram_users
    set signals_used_today = used + 1,
        last_reset_date     = case when did_reset then now() else last_reset_date end,
        updated_at          = now()
    where telegram_id = p_telegram_id;

  return jsonb_build_object('allowed', true, 'remaining', 5 - (used + 1),
                            'linked', tu.user_id is not null, 'pro', false);
end;
$$;

-- ─────────────────────────────────── Redeem a link code ────────────────────
-- Binds a Telegram id to the account that minted the code. One-time use.
create or replace function public.redeem_telegram_link(p_telegram_id bigint, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  lc record;
begin
  select * into lc from public.telegram_link_codes
    where code = p_code
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if lc.used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;
  if lc.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  -- Ensure a telegram row exists, then bind it.
  insert into public.telegram_users (telegram_id, user_id)
    values (p_telegram_id, lc.user_id)
  on conflict (telegram_id) do update
    set user_id = lc.user_id, updated_at = now();

  update public.telegram_link_codes set used_at = now() where code = p_code;

  return jsonb_build_object('ok', true);
end;
$$;

-- Only the server (service-role) may call these; clients must not self-serve.
revoke all on function public.touch_telegram_user(bigint, text)      from public, anon, authenticated;
revoke all on function public.consume_telegram_signal(bigint)        from public, anon, authenticated;
revoke all on function public.redeem_telegram_link(bigint, text)     from public, anon, authenticated;
grant execute on function public.touch_telegram_user(bigint, text)   to service_role;
grant execute on function public.consume_telegram_signal(bigint)     to service_role;
grant execute on function public.redeem_telegram_link(bigint, text)  to service_role;


-- ============================================================
-- 0008_telegram_shared_quota.sql
-- ============================================================
-- Telegram: linked chats share the web account's daily signal allowance.
-- Run in the Supabase SQL editor after 0007.
--
-- 0007 metered every chat on its own telegram_users counter, so a linked FREE
-- user got 5 signals on the web AND 5 on Telegram (10/day). A linked chat now
-- delegates to consume_signal (0003) — one UTC-daily 5/day bucket per account,
-- Pro unlimited. Unlinked chats keep their own per-chat 5/day counter.

create or replace function public.consume_telegram_signal(p_telegram_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tu        record;
  gate      jsonb;
  did_reset boolean;
  used      int;
begin
  -- Ensure a row exists, then lock it.
  insert into public.telegram_users (telegram_id) values (p_telegram_id)
    on conflict (telegram_id) do nothing;

  select * into tu from public.telegram_users
    where telegram_id = p_telegram_id
    for update;

  -- Linked → the account's shared allowance (consume_signal handles Pro + UTC reset).
  if tu.user_id is not null then
    gate := public.consume_signal(tu.user_id);
    return gate || jsonb_build_object(
      'linked', true,
      'pro', coalesce((gate->>'remaining')::int, 0) = -1
    );
  end if;

  -- Unlinked → per-chat UTC-daily free allowance (unchanged from 0007).
  did_reset := (tu.last_reset_date at time zone 'utc')::date
               < (now() at time zone 'utc')::date;
  used := case when did_reset then 0 else tu.signals_used_today end;

  if used >= 5 then
    if did_reset then
      update public.telegram_users
        set signals_used_today = 0, last_reset_date = now(), updated_at = now()
        where telegram_id = p_telegram_id;
    end if;
    return jsonb_build_object('allowed', false, 'remaining', 0, 'linked', false, 'pro', false);
  end if;

  update public.telegram_users
    set signals_used_today = used + 1,
        last_reset_date     = case when did_reset then now() else last_reset_date end,
        updated_at          = now()
    where telegram_id = p_telegram_id;

  return jsonb_build_object('allowed', true, 'remaining', 5 - (used + 1), 'linked', false, 'pro', false);
end;
$$;

revoke all on function public.consume_telegram_signal(bigint) from public, anon, authenticated;
grant execute on function public.consume_telegram_signal(bigint) to service_role;


-- ============================================================
-- 0009_security_hardening.sql
-- ============================================================
-- Security + data-integrity hardening.
-- Run in the Supabase SQL editor after 0008, BEFORE deploying the matching code
-- (POST /api/signals/record refunds via refund_signal, /api/subscriptions/expire
-- calls expire_crypto_subscriptions, the paper-account service calls
-- reset_paper_balance). Idempotent: safe to re-run.
--
-- What it closes:
--   1. Track-record forgery: clients could INSERT a signals row with outcome /
--      evaluated_at / profit_loss_percent / created_at already filled in, and the
--      anchoring job would put that fabricated call on-chain. Signals are now
--      written ONLY by the server (/api/signals/record, Telegram bot), which sets
--      timestamps and the entry price itself.
--   2. Refunds: a credit consumed for a signal that then failed to save is given
--      back (refund_signal).
--   3. Crypto Pro never expired: one-off crypto payments set a period end that
--      nothing enforced. consume_signal now treats an expired crypto Pro as free
--      (and downgrades it), and a cron downgrades all of them.
--   4. Paper cash: clients could UPDATE their own paper_accounts row to any
--      balance. Balances now change only through SECURITY DEFINER functions.

-- ───────────────────────────────────── 1. Signals: server-only inserts ──────
-- With RLS enabled and no INSERT policy, anon/authenticated inserts are denied;
-- the service-role key bypasses RLS. (UPDATE was already removed in 0004.)
drop policy if exists "signals_insert_own" on public.signals;

-- Belt and braces: even if an INSERT policy is re-added later, refuse any insert
-- that does not come from the service role.
create or replace function public.protect_signal_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Signals are recorded by the server only';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_signal_insert() from public, anon, authenticated;

drop trigger if exists protect_signal_insert on public.signals;
create trigger protect_signal_insert
  before insert on public.signals
  for each row execute function public.protect_signal_insert();

-- ───────────────────────────── 3. consume_signal: crypto Pro expiry ─────────
-- Same contract as 0003 (allowed / remaining; Pro → remaining -1), plus: a 'pro'
-- on a one-off crypto plan whose current_period_end has passed is downgraded to
-- free in the same transaction and metered as a free user.
create or replace function public.consume_signal(p_uid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  prof      record;
  did_reset boolean;
  used      int;
begin
  select subscription_status, plan_id, current_period_end,
         signals_used_today, last_reset_date, total_signals_viewed
    into prof
    from public.profiles
    where id = p_uid
    for update;                       -- row lock → atomic against concurrent calls

  if not found then
    return jsonb_build_object('allowed', false, 'remaining', 0);
  end if;

  if prof.subscription_status = 'pro' then
    if left(coalesce(prof.plan_id, ''), 7) = 'crypto_'
       and (prof.current_period_end is null or prof.current_period_end < now()) then
      -- Fixed crypto period is over → back to free, then meter below.
      update public.profiles
        set subscription_status = 'free', plan_id = null
        where id = p_uid;
    else
      -- Pro = unlimited; never increments the counter.
      return jsonb_build_object('allowed', true, 'remaining', -1);
    end if;
  end if;

  -- UTC calendar-day reset.
  did_reset := (prof.last_reset_date at time zone 'utc')::date
               < (now() at time zone 'utc')::date;
  used := case when did_reset then 0 else prof.signals_used_today end;

  -- Free tier: 5/day. At the cap, persist the reset (if any) but don't grant.
  if used >= 5 then
    if did_reset then
      update public.profiles
        set signals_used_today = 0, last_reset_date = now()
        where id = p_uid;
    end if;
    return jsonb_build_object('allowed', false, 'remaining', 0);
  end if;

  update public.profiles
    set signals_used_today  = used + 1,
        last_reset_date      = case when did_reset then now() else last_reset_date end,
        total_signals_viewed = coalesce(total_signals_viewed, 0) + 1
    where id = p_uid;

  return jsonb_build_object('allowed', true, 'remaining', 5 - (used + 1));
end;
$$;

revoke all on function public.consume_signal(uuid) from public, anon, authenticated;
grant execute on function public.consume_signal(uuid) to service_role;

-- ─────────────────────────────────────────── 2. refund_signal ───────────────
-- Gives back one credit consumed by consume_signal when the signal could not be
-- saved. Never below 0, only for today's UTC counter (a refund arriving after
-- midnight must not eat into the fresh allowance), no-op for Pro.
create or replace function public.refund_signal(p_uid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  prof record;
begin
  select subscription_status, plan_id, current_period_end,
         signals_used_today, last_reset_date
    into prof
    from public.profiles
    where id = p_uid
    for update;

  if not found then
    return jsonb_build_object('refunded', false, 'remaining', 0);
  end if;

  if prof.subscription_status = 'pro'
     and not (left(coalesce(prof.plan_id, ''), 7) = 'crypto_'
              and (prof.current_period_end is null or prof.current_period_end < now())) then
    return jsonb_build_object('refunded', false, 'remaining', -1);
  end if;

  if (prof.last_reset_date at time zone 'utc')::date <> (now() at time zone 'utc')::date then
    -- Counter belongs to an earlier UTC day: today's allowance is already full.
    return jsonb_build_object('refunded', false, 'remaining', 5);
  end if;

  if prof.signals_used_today <= 0 then
    return jsonb_build_object('refunded', false, 'remaining', 5);
  end if;

  update public.profiles
    set signals_used_today = prof.signals_used_today - 1,
        total_signals_viewed = greatest(coalesce(total_signals_viewed, 0) - 1, 0)
    where id = p_uid;

  return jsonb_build_object('refunded', true,
                            'remaining', greatest(5 - (prof.signals_used_today - 1), 0));
end;
$$;

revoke all on function public.refund_signal(uuid) from public, anon, authenticated;
grant execute on function public.refund_signal(uuid) to service_role;

-- ─────────────────────────────── 3b. Expire lapsed crypto subscriptions ─────
-- Called by the /api/subscriptions/expire cron. Returns how many were downgraded.
create or replace function public.expire_crypto_subscriptions()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  update public.profiles
    set subscription_status = 'free', plan_id = null
    where subscription_status = 'pro'
      and left(coalesce(plan_id, ''), 7) = 'crypto_'
      and (current_period_end is null or current_period_end < now());
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.expire_crypto_subscriptions() from public, anon, authenticated;
grant execute on function public.expire_crypto_subscriptions() to service_role;

-- ─────────────────────────────────────── 4. Paper cash integrity ────────────
-- Clients keep SELECT on their own row; every balance change goes through
-- adjust_paper_balance (0001, overdraft-guarded, creates the row on first use) or
-- reset_paper_balance below.
drop policy if exists "paper_accounts_insert_own" on public.paper_accounts;
drop policy if exists "paper_accounts_update_own" on public.paper_accounts;
drop policy if exists "paper_accounts_delete_own" on public.paper_accounts;

-- Reset the signed-in user's paper cash to the starting balance.
create or replace function public.reset_paper_balance()
returns numeric language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  insert into public.paper_accounts (user_id, balance_usd, updated_at)
    values (uid, 10000, now())
  on conflict (user_id) do update
    set balance_usd = 10000, updated_at = now();
  return 10000;
end;
$$;

revoke all on function public.reset_paper_balance() from public, anon;
grant execute on function public.reset_paper_balance() to authenticated;

-- adjust_paper_balance was granted to authenticated in 0001 but never revoked
-- from PUBLIC/anon (it raises for anon anyway; make the grant explicit).
revoke all on function public.adjust_paper_balance(numeric) from public, anon;
grant execute on function public.adjust_paper_balance(numeric) to authenticated;


-- ============================================================
-- 0010_telegram_phase2.sql
-- ============================================================
-- Telegram bot phase 2: credit refunds, chat personalization, scheduled pushes
-- and accountability follow-ups. Run in the Supabase SQL editor after 0008.
-- Idempotent: safe to re-run.
--
-- Same security model as 0007: every table has RLS enabled with NO client
-- policies (only the service-role bot/cron code can touch them), and every
-- function is SECURITY DEFINER, pinned to search_path = public, and executable
-- by service_role only. Nothing here depends on functions from other new
-- migrations.

-- ─────────────────────────────────── Chat preferences ──────────────────────
create table if not exists public.telegram_prefs (
  telegram_id    bigint primary key references public.telegram_users(telegram_id) on delete cascade,
  risk_level     text not null default 'medium',
  coins          text[] not null default '{BTC,ETH}',
  alerts_enabled boolean not null default false,
  last_push_at   timestamptz,
  updated_at     timestamptz not null default now()
);

-- Constraints are added separately (drop + add) so a re-run converges.
alter table public.telegram_prefs drop constraint if exists telegram_prefs_risk_level_check;
alter table public.telegram_prefs add constraint telegram_prefs_risk_level_check
  check (risk_level in ('low', 'medium', 'high'));

-- 1–5 upper-case ticker symbols. Membership in the app's coin catalogue is
-- validated in code (src/lib/coins.ts is the single source of truth).
alter table public.telegram_prefs drop constraint if exists telegram_prefs_coins_check;
alter table public.telegram_prefs add constraint telegram_prefs_coins_check
  check (
    cardinality(coins) between 1 and 5
    and array_to_string(coins, ',') ~ '^[A-Z0-9]{2,12}(,[A-Z0-9]{2,12}){0,4}$'
  );

-- The push cron scans only chats with alerts on.
create index if not exists telegram_prefs_alerts_idx
  on public.telegram_prefs (last_push_at)
  where alerts_enabled;

alter table public.telegram_prefs enable row level security;

-- ─────────────────────────────────── Follow-up ledger ──────────────────────
-- One row per signal whose outcome message has been sent (or claimed for
-- sending). The primary key makes "send once" race-safe across cron runs.
create table if not exists public.telegram_followups (
  signal_id   uuid primary key references public.signals(id) on delete cascade,
  telegram_id bigint not null references public.telegram_users(telegram_id) on delete cascade,
  sent_at     timestamptz not null default now()
);

create index if not exists telegram_followups_telegram_id_idx on public.telegram_followups (telegram_id);

alter table public.telegram_followups enable row level security;

-- The follow-up cron selects recently finalized Telegram-originated calls; keep
-- that scan cheap without indexing every web signal.
create index if not exists idx_signals_telegram_evaluated
  on public.signals (evaluated_at)
  where reasoning like 'Telegram analyst read%';

-- ─────────────────────────────────── Save preferences ──────────────────────
-- Upserts a chat's preferences; a NULL argument leaves that field unchanged.
-- Ensures the telegram_users row exists first (the FK parent), so it works even
-- for a chat whose first-contact upsert hasn't landed yet.
create or replace function public.save_telegram_prefs(
  p_telegram_id    bigint,
  p_risk_level     text,
  p_coins          text[],
  p_alerts_enabled boolean
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.telegram_users (telegram_id) values (p_telegram_id)
    on conflict (telegram_id) do nothing;

  insert into public.telegram_prefs (telegram_id, risk_level, coins, alerts_enabled, updated_at)
    values (
      p_telegram_id,
      coalesce(p_risk_level, 'medium'),
      coalesce(p_coins, '{BTC,ETH}'::text[]),
      coalesce(p_alerts_enabled, false),
      now()
    )
  on conflict (telegram_id) do update
    set risk_level     = coalesce(p_risk_level, public.telegram_prefs.risk_level),
        coins          = coalesce(p_coins, public.telegram_prefs.coins),
        alerts_enabled = coalesce(p_alerts_enabled, public.telegram_prefs.alerts_enabled),
        updated_at     = now();
end;
$$;

-- ─────────────────────────────────── Refund a signal credit (N14) ──────────
-- Gives back one credit consumed by consume_telegram_signal when the analyst
-- read could not be produced. Mirrors its routing:
--   • linked chat   → the account's shared allowance on profiles (0003/0008);
--                     Pro is unlimited and never incremented, so never refunded.
--   • unlinked chat → the chat's own counter on telegram_users.
-- Only refunds within the same UTC day as the counter (after a day rollover the
-- counter is effectively 0 already) and never below 0. Row locks match the
-- consume functions, so a refund can't race a concurrent consume.
create or replace function public.refund_telegram_signal(p_telegram_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tu    record;
  prof  record;
  today date := (now() at time zone 'utc')::date;
begin
  select * into tu from public.telegram_users
    where telegram_id = p_telegram_id
    for update;

  if not found then
    return jsonb_build_object('refunded', false, 'reason', 'unknown_chat');
  end if;

  if tu.user_id is not null then
    select subscription_status, signals_used_today, last_reset_date
      into prof
      from public.profiles
      where id = tu.user_id
      for update;

    if not found then
      return jsonb_build_object('refunded', false, 'reason', 'no_profile');
    end if;
    if prof.subscription_status = 'pro' then
      return jsonb_build_object('refunded', false, 'reason', 'unlimited');
    end if;
    if (prof.last_reset_date at time zone 'utc')::date <> today or prof.signals_used_today <= 0 then
      return jsonb_build_object('refunded', false, 'reason', 'nothing_to_refund');
    end if;

    update public.profiles
      set signals_used_today   = greatest(signals_used_today - 1, 0),
          total_signals_viewed = greatest(coalesce(total_signals_viewed, 0) - 1, 0)
      where id = tu.user_id;
    return jsonb_build_object('refunded', true, 'linked', true);
  end if;

  if (tu.last_reset_date at time zone 'utc')::date <> today or tu.signals_used_today <= 0 then
    return jsonb_build_object('refunded', false, 'reason', 'nothing_to_refund');
  end if;

  update public.telegram_users
    set signals_used_today = greatest(signals_used_today - 1, 0),
        updated_at         = now()
    where telegram_id = p_telegram_id;
  return jsonb_build_object('refunded', true, 'linked', false);
end;
$$;

-- Defense in depth on top of RLS-without-policies: no direct table grants for
-- client roles either.
revoke all on table public.telegram_prefs     from anon, authenticated;
revoke all on table public.telegram_followups from anon, authenticated;

-- Only the server (service-role) may call these; clients must not self-serve.
revoke all on function public.save_telegram_prefs(bigint, text, text[], boolean) from public, anon, authenticated;
revoke all on function public.refund_telegram_signal(bigint)                     from public, anon, authenticated;
grant execute on function public.save_telegram_prefs(bigint, text, text[], boolean) to service_role;
grant execute on function public.refund_telegram_signal(bigint)                     to service_role;


-- ============================================================
-- 0011_ops_monitoring.sql
-- ============================================================
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

