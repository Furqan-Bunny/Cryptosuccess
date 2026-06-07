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
