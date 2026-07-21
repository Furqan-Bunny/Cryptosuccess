-- CryptoSuccess — all migrations 0001→0007 combined. Paste into Supabase SQL Editor and Run.


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
-- Crypto payments (Coinbase Commerce) webhook idempotency.
-- Run in the Supabase SQL editor after 0005.
--
-- Coinbase Commerce retries webhook deliveries; persist processed event ids so a
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

