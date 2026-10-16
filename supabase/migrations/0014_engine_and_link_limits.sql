-- Paper-futures limits, orders guard and one Telegram chat per account.
-- Run in the Supabase SQL editor after 0013, BEFORE deploying the matching code
-- (DELETE /api/telegram/link calls unlink_telegram_account). Idempotent: safe to
-- re-run.
--
-- What it closes:
--   1. Futures: a margin floor and a per-user cap on open positions, so nobody
--      can flood the engine's liquidation scan with dust positions; and a close
--      at a mark already past the liquidation price settles as a liquidation
--      (credit 0) instead of paying out margin + PnL.
--   2. Orders: clients still write their own paper orders, so a trigger caps how
--      many may be pending per user and rejects malformed rows.
--   3. Telegram: one linked chat per account. Redeeming a code moves the link to
--      the new chat (the old one is unlinked and its daily alerts switched off),
--      and the account owner can unlink from the website.

-- ─────────────────────────────────────────── 1. Paper futures ───────────────
-- Same signature and grants as 0012; adds the margin floor (MIN_MARGIN_USD in
-- src/lib/futures.ts) and the open-position cap (MAX_OPEN_POSITIONS). The count
-- runs under the paper_accounts row lock, so two concurrent opens for the same
-- user can't both slip under the cap.
create or replace function public.open_futures_position(
  p_uid uuid, p_symbol text, p_side text, p_leverage numeric, p_entry numeric,
  p_quantity numeric, p_margin numeric, p_liquidation numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  bal numeric;
  open_count int;
  new_id uuid;
begin
  if p_uid is null then raise exception 'Missing user'; end if;
  if p_side not in ('long', 'short') then raise exception 'Invalid side'; end if;
  if p_leverage is null or p_leverage < 1 or p_leverage > 20 then raise exception 'Invalid leverage'; end if;
  if p_margin is null or p_margin < 10 or p_margin > 1000000000 then raise exception 'Invalid margin'; end if;
  if p_entry is null or p_entry <= 0 or p_quantity is null or p_quantity <= 0
     or p_liquidation is null or p_liquidation <= 0 then
    raise exception 'Invalid position numbers';
  end if;

  insert into public.paper_accounts (user_id, balance_usd)
    values (p_uid, 10000)
    on conflict (user_id) do nothing;
  select balance_usd into bal from public.paper_accounts where user_id = p_uid for update;

  select count(*) into open_count
    from public.futures_positions
    where user_id = p_uid and status = 'open';
  if open_count >= 25 then raise exception 'Too many open positions'; end if;

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

-- Liquidation is checked first: if the mark has crossed the position's
-- liquidation price (long: mark <= liq, short: mark >= liq; same rule as
-- isLiquidated in src/lib/futures.ts) the position is settled exactly as the
-- engine would have settled it — the margin is lost, nothing is credited — even
-- if the engine has not reached it yet.
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

  if (pos.side = 'long' and p_mark <= pos.liquidation_price)
     or (pos.side = 'short' and p_mark >= pos.liquidation_price) then
    update public.futures_positions
      set status = 'liquidated', close_price = pos.liquidation_price,
          realized_pnl = -pos.margin_usd, closed_at = now()
      where id = p_id;
    return jsonb_build_object('closed', true, 'liquidated', true,
                              'realized_pnl', -pos.margin_usd, 'credit', 0);
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

  return jsonb_build_object('closed', true, 'liquidated', false, 'realized_pnl', pnl, 'credit', credit);
end;
$$;

revoke all on function public.close_futures_position(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.close_futures_position(uuid, uuid, numeric) to service_role;

-- ─────────────────────────────────────────── 2. Orders guard ────────────────
-- Paper orders are still written by the client (owner policies from 0001). The
-- engine pages through every pending order, but each one is still work on every
-- tick, so a client may hold at most 100 pending orders, and a pending row must
-- be well-formed. The engine and other server code run as service_role and are
-- not limited. SECURITY DEFINER so the count sees every pending row of that user
-- regardless of the caller's policies.
create or replace function public.guard_client_orders()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pending_count int;
begin
  if auth.role() is distinct from 'service_role' and new.status = 'pending' then
    if new.symbol is null or upper(new.symbol) !~ '^[A-Z0-9]{2,12}$' then
      raise exception 'Invalid order symbol';
    end if;
    if new.amount is null or new.amount <= 0 or new.amount > 1000000000000 then
      raise exception 'Invalid order amount';
    end if;
    if tg_op = 'INSERT' or old.status is distinct from 'pending' then
      select count(*) into pending_count
        from public.orders
        where user_id = new.user_id and status = 'pending';
      if pending_count >= 100 then
        raise exception 'Too many open orders';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_client_orders() from public, anon, authenticated;

drop trigger if exists guard_client_orders on public.orders;
create trigger guard_client_orders
  before insert or update on public.orders
  for each row execute function public.guard_client_orders();

-- ─────────────────────────────────── 3. One Telegram chat per account ───────
-- Existing data first: where an account is linked to several chats, keep the
-- most recently active one and unlink the rest (switching their alerts off), so
-- the unique index below can be built.
with ranked as (
  select telegram_id,
         row_number() over (partition by user_id order by updated_at desc, telegram_id desc) as rn
  from public.telegram_users
  where user_id is not null
),
extra as (
  select telegram_id from ranked where rn > 1
),
unlinked as (
  update public.telegram_users tu
    set user_id = null, updated_at = now()
    from extra
    where tu.telegram_id = extra.telegram_id
  returning tu.telegram_id
)
update public.telegram_prefs p
  set alerts_enabled = false, updated_at = now()
  from unlinked
  where p.telegram_id = unlinked.telegram_id;

create unique index if not exists telegram_users_one_chat_per_account
  on public.telegram_users (user_id)
  where user_id is not null;

-- Same signature, result shape and grants as 0007. Linking moves the account to
-- this chat: any other chat linked to the same account is unlinked first (and
-- stops receiving its daily alerts), so one subscription can't be shared out to
-- any number of chats, and a code leaked to someone else is undone by the owner
-- simply linking again.
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

  update public.telegram_prefs
    set alerts_enabled = false, updated_at = now()
    where telegram_id in (
      select telegram_id from public.telegram_users
       where user_id = lc.user_id and telegram_id <> p_telegram_id
    );
  update public.telegram_users
    set user_id = null, updated_at = now()
    where user_id = lc.user_id and telegram_id <> p_telegram_id;

  insert into public.telegram_users (telegram_id, user_id)
    values (p_telegram_id, lc.user_id)
  on conflict (telegram_id) do update
    set user_id = lc.user_id, updated_at = now();

  update public.telegram_link_codes set used_at = now() where code = p_code;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.redeem_telegram_link(bigint, text) from public, anon, authenticated;
grant execute on function public.redeem_telegram_link(bigint, text) to service_role;

-- Self-serve unlink, called by DELETE /api/telegram/link with the user id taken
-- from the caller's verified token. Also drops any unused link code, so a code
-- that was shown but not yet redeemed can't re-link the account afterwards.
-- Returns the number of chats unlinked.
create or replace function public.unlink_telegram_account(p_user_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if p_user_id is null then raise exception 'Missing user'; end if;

  delete from public.telegram_link_codes
    where user_id = p_user_id and used_at is null;

  update public.telegram_prefs
    set alerts_enabled = false, updated_at = now()
    where telegram_id in (select telegram_id from public.telegram_users where user_id = p_user_id);

  update public.telegram_users
    set user_id = null, updated_at = now()
    where user_id = p_user_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.unlink_telegram_account(uuid) from public, anon, authenticated;
grant execute on function public.unlink_telegram_account(uuid) to service_role;

-- ─────────────────────────────────── 4. Halted coins out of staking ─────────
-- MATIC was replaced by POL in the coin catalogue (its Binance pair is halted);
-- the staking cron now refreshes POL, so drop the stale MATIC rate. Open MATIC
-- stakes can still be unstaked (unstake_position never reads staking_rates).
delete from public.staking_rates where symbol = 'MATIC';
