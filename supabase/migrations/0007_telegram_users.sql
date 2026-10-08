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
