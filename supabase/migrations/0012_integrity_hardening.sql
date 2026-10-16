-- Integrity hardening, round two.
-- Run in the Supabase SQL editor after 0011, BEFORE deploying the matching code
-- (the futures page calls /api/paper/futures/*, the staking page calls
-- stake_position / unstake_position, the paper-account service calls
-- ensure_paper_account). Idempotent: safe to re-run.
--
-- What it closes:
--   1. Free-tier quota bypass: profiles_update_own let a signed-in user write
--      signals_used_today / last_reset_date / total_signals_viewed on their own
--      row, which reset the counter consume_signal meters against. Those columns
--      are now server-managed, and clients can only UPDATE the profile columns
--      the app actually edits.
--   2. Paper cash minting: adjust_paper_balance accepted any delta from any
--      signed-in user, and staking / futures rows (whose amounts drive payouts)
--      were client-editable. Cash now moves only inside purpose-built functions
--      that derive the amount from a row the client cannot touch, and a reset
--      also closes open positions so principal can't be recycled.
--   3. Account deletion vs. the public record: signals cascaded away with the
--      auth user, which removed scored (and anchored) calls from the record and
--      broke inclusion proofs for every other signal anchored that day. Signals
--      now outlive the account with user_id set to NULL; the anchored leaf keeps
--      the old random id, which no longer points at anyone.

-- ─────────────────────────────── 1. Profiles: server-managed columns ────────
-- Same trigger name/function as 0001, now also guarding the quota counters and
-- the identity columns. consume_signal / refund_signal / the webhooks run as
-- service_role and are unaffected.
create or replace function public.protect_subscription_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then
    if new.subscription_status is distinct from old.subscription_status
       or new.plan_id is distinct from old.plan_id
       or new.customer_id is distinct from old.customer_id
       or new.current_period_end is distinct from old.current_period_end then
      raise exception 'Subscription fields are server-managed';
    end if;
    if new.signals_used_today is distinct from old.signals_used_today
       or new.last_reset_date is distinct from old.last_reset_date
       or new.total_signals_viewed is distinct from old.total_signals_viewed then
      raise exception 'Signal allowance fields are server-managed';
    end if;
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at then
      raise exception 'Account identity fields are server-managed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_subscription on public.profiles;
create trigger protect_subscription
  before update on public.profiles
  for each row execute function public.protect_subscription_columns();

-- Belt and braces: column-level privileges. The owner UPDATE policy stays (RLS
-- still limits it to the caller's own row), but only these columns can be named
-- in a client UPDATE. Keep this list in sync with the client writers:
-- auth.service (notifications, last_login), lib/watchlist (watchlist),
-- portfolio.service (portfolio_summary), plus display_name / photo_url /
-- timezone for profile edits.
revoke update on table public.profiles from anon, authenticated;
grant update (display_name, photo_url, notifications, timezone, watchlist, last_login, portfolio_summary)
  on table public.profiles to authenticated;

-- ─────────────────────────────────────── 2. Paper cash integrity ────────────
-- 2a. No more client-chosen deltas.
revoke all on function public.adjust_paper_balance(numeric) from public, anon, authenticated;

-- 2b. Read-or-create the caller's account (replaces the "adjust by 0" trick).
create or replace function public.ensure_paper_account()
returns numeric language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  bal numeric;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  insert into public.paper_accounts (user_id, balance_usd)
    values (uid, 10000)
    on conflict (user_id) do nothing;
  select balance_usd into bal from public.paper_accounts where user_id = uid;
  return bal;
end;
$$;

revoke all on function public.ensure_paper_account() from public, anon;
grant execute on function public.ensure_paper_account() to authenticated;

-- 2c. Staking / futures rows are written only by the functions below (and the
-- engine, as service_role). Clients keep SELECT on their own rows.
drop policy if exists "staking_positions_insert_own" on public.staking_positions;
drop policy if exists "staking_positions_update_own" on public.staking_positions;
drop policy if exists "staking_positions_delete_own" on public.staking_positions;
drop policy if exists "futures_positions_insert_own" on public.futures_positions;
drop policy if exists "futures_positions_update_own" on public.futures_positions;
drop policy if exists "futures_positions_delete_own" on public.futures_positions;

-- 2d. Stake: APY comes from staking_rates (server-written), never the client.
-- Debit + insert in one transaction, overdraft-guarded under a row lock.
create or replace function public.stake_position(p_symbol text, p_amount numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sym text := upper(trim(coalesce(p_symbol, '')));
  rate numeric;
  bal numeric;
  new_id uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 then
    raise exception 'Enter a valid amount';
  end if;

  -- Staking is part of the Pro paper-trading suite. A lapsed one-off crypto Pro
  -- counts as free (same rule as consume_signal). Unstaking stays open to all so
  -- nobody's principal is ever stuck.
  if not exists (
    select 1 from public.profiles
     where id = uid
       and subscription_status = 'pro'
       and not (left(coalesce(plan_id, ''), 7) = 'crypto_'
                and (current_period_end is null or current_period_end < now()))
  ) then
    raise exception 'Staking is a Pro feature';
  end if;

  select apy into rate from public.staking_rates where symbol = sym;
  if rate is null or rate < 0 or rate > 1000 then
    raise exception 'Staking is not available for this coin';
  end if;

  insert into public.paper_accounts (user_id, balance_usd)
    values (uid, 10000)
    on conflict (user_id) do nothing;
  select balance_usd into bal from public.paper_accounts where user_id = uid for update;
  if bal < p_amount then raise exception 'Insufficient paper balance'; end if;

  update public.paper_accounts
    set balance_usd = balance_usd - p_amount, updated_at = now()
    where user_id = uid;

  insert into public.staking_positions (user_id, symbol, amount_usd, apy_snapshot, active)
    values (uid, sym, p_amount, rate, true)
    returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.stake_position(text, numeric) from public, anon;
grant execute on function public.stake_position(text, numeric) to authenticated;

-- 2e. Unstake: principal + simple-interest rewards from the row's own snapshot
-- (same formula as accruedRewards in staking.service). Closes and credits in one
-- transaction, only if this call made the active → closed transition.
create or replace function public.unstake_position(p_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pos record;
  closed_ts timestamptz := now();
  payout numeric;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select * into pos from public.staking_positions
    where id = p_id and user_id = uid
    for update;
  if not found then raise exception 'Position not found'; end if;
  if not pos.active then raise exception 'Already unstaked'; end if;

  payout := pos.amount_usd
          + pos.amount_usd * (pos.apy_snapshot / 100)
            * (greatest(extract(epoch from (closed_ts - pos.started_at)), 0) / 86400.0 / 365.0);

  update public.staking_positions
    set active = false, closed_at = closed_ts
    where id = p_id;

  insert into public.paper_accounts (user_id, balance_usd)
    values (uid, 10000)
    on conflict (user_id) do nothing;
  update public.paper_accounts
    set balance_usd = balance_usd + payout, updated_at = now()
    where user_id = uid;

  return payout;
end;
$$;

revoke all on function public.unstake_position(uuid) from public, anon;
grant execute on function public.unstake_position(uuid) to authenticated;

-- 2f. Futures need a live mark price, which only the server can vouch for, so
-- these are service_role only and called by /api/paper/futures/{open,close}
-- after the route has priced the trade itself and checked the caller's token.
create or replace function public.open_futures_position(
  p_uid uuid, p_symbol text, p_side text, p_leverage numeric, p_entry numeric,
  p_quantity numeric, p_margin numeric, p_liquidation numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  bal numeric;
  new_id uuid;
begin
  if p_uid is null then raise exception 'Missing user'; end if;
  if p_side not in ('long', 'short') then raise exception 'Invalid side'; end if;
  if p_leverage is null or p_leverage < 1 or p_leverage > 20 then raise exception 'Invalid leverage'; end if;
  if p_margin is null or p_margin <= 0 or p_margin > 1000000000 then raise exception 'Invalid margin'; end if;
  if p_entry is null or p_entry <= 0 or p_quantity is null or p_quantity <= 0
     or p_liquidation is null or p_liquidation <= 0 then
    raise exception 'Invalid position numbers';
  end if;

  insert into public.paper_accounts (user_id, balance_usd)
    values (p_uid, 10000)
    on conflict (user_id) do nothing;
  select balance_usd into bal from public.paper_accounts where user_id = p_uid for update;
  if bal < p_margin then raise exception 'Insufficient paper balance'; end if;

  update public.paper_accounts
    set balance_usd = balance_usd - p_margin, updated_at = now()
    where user_id = p_uid;

  insert into public.futures_positions (
    user_id, symbol, side, leverage, entry_price, quantity, margin_usd,
    margin_mode, liquidation_price, status
  ) values (
    p_uid, upper(p_symbol), p_side, p_leverage, p_entry, p_quantity, p_margin,
    'isolated', p_liquidation, 'open'
  ) returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.open_futures_position(uuid, text, text, numeric, numeric, numeric, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.open_futures_position(uuid, text, text, numeric, numeric, numeric, numeric, numeric)
  to service_role;

-- PnL is computed here from the locked row (same formula as computePnl in
-- src/lib/futures.ts); the payout never goes below zero (isolated margin).
create or replace function public.close_futures_position(p_uid uuid, p_id uuid, p_mark numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pos record;
  pnl numeric;
  credit numeric;
begin
  if p_uid is null or p_id is null then raise exception 'Missing arguments'; end if;
  if p_mark is null or p_mark <= 0 then raise exception 'Invalid mark price'; end if;

  select * into pos from public.futures_positions
    where id = p_id and user_id = p_uid
    for update;
  if not found then
    return jsonb_build_object('closed', false, 'reason', 'not_found');
  end if;
  if pos.status <> 'open' then
    return jsonb_build_object('closed', false, 'reason', 'not_open', 'status', pos.status);
  end if;

  pnl := case when pos.side = 'long'
              then (p_mark - pos.entry_price) * pos.quantity
              else (pos.entry_price - p_mark) * pos.quantity end;
  credit := greatest(0, pos.margin_usd + pnl);

  update public.futures_positions
    set status = 'closed', close_price = p_mark, realized_pnl = pnl, closed_at = now()
    where id = p_id;

  insert into public.paper_accounts (user_id, balance_usd)
    values (p_uid, 10000)
    on conflict (user_id) do nothing;
  update public.paper_accounts
    set balance_usd = balance_usd + credit, updated_at = now()
    where user_id = p_uid;

  return jsonb_build_object('closed', true, 'realized_pnl', pnl, 'credit', credit);
end;
$$;

revoke all on function public.close_futures_position(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.close_futures_position(uuid, uuid, numeric) to service_role;

-- 2g. Reset now forfeits open stakes and futures in the same transaction, so
-- "stake everything, reset, unstake" can no longer mint cash.
create or replace function public.reset_paper_balance()
returns numeric language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  update public.staking_positions
    set active = false, closed_at = now()
    where user_id = uid and active;
  update public.futures_positions
    set status = 'closed', closed_at = now(), close_price = null, realized_pnl = null
    where user_id = uid and status = 'open';

  insert into public.paper_accounts (user_id, balance_usd, updated_at)
    values (uid, 10000, now())
  on conflict (user_id) do update
    set balance_usd = 10000, updated_at = now();
  return 10000;
end;
$$;

revoke all on function public.reset_paper_balance() from public, anon;
grant execute on function public.reset_paper_balance() to authenticated;

-- ─────────────────────────────── 3. Signals outlive account deletion ────────
alter table public.signals alter column user_id drop not null;
alter table public.signals drop constraint if exists signals_user_id_fkey;
alter table public.signals
  add constraint signals_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- An anchored leaf must never disappear: refuse to delete a signal that has one.
alter table public.signal_leaves drop constraint if exists signal_leaves_signal_id_fkey;
alter table public.signal_leaves
  add constraint signal_leaves_signal_id_fkey
  foreign key (signal_id) references public.signals(id) on delete restrict;

-- The 0004 immutability trigger blocks every non-service_role UPDATE, which would
-- also block the ON DELETE SET NULL above (account deletion runs as the auth
-- admin role). Allow exactly that one change — user_id to NULL with every other
-- column untouched — and nothing else.
create or replace function public.protect_signal_record()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then
    if old.user_id is not null and new.user_id is null
       and (to_jsonb(new) - 'user_id') = (to_jsonb(old) - 'user_id') then
      return new;
    end if;
    raise exception 'Signals are immutable once created (server-managed)';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_signal_record on public.signals;
create trigger protect_signal_record
  before update on public.signals
  for each row execute function public.protect_signal_record();
