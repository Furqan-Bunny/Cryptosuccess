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
