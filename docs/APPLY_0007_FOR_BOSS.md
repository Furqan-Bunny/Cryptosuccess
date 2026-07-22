# Action needed: apply migration 0007 (unlocks Telegram `/signal` + `/link`)

**Who:** whoever has Supabase dashboard access to project `nypfozskratyufcqeivo`.
**Time:** ~1 minute. **Risk:** none — it only *adds* new tables/functions, touches no existing data, and is safe to run more than once.

## Why
The Telegram coach bot is live (`@cryptosuccess_coach_bot`). Commands `/start /help /verify /subscribe` already work. `/signal` and `/link` are the only ones failing, because they need two new tables + three functions that don't exist in the DB yet. Migrations 0001→0006 are already applied; **0007 is the only one missing.**

## How (Supabase SQL Editor)
1. Open the Supabase dashboard → project **CryptoSuccess** (`nypfozskratyufcqeivo`).
2. Left sidebar → **SQL Editor** → **New query**.
3. Paste everything in the code block below → click **Run**.
4. The final `SELECT` should return one row reading **`0007 applied OK`** with counts `2` tables and `3` functions. That's the success confirmation.

```sql
-- ============ CryptoSuccess migration 0007: Telegram users/linking/metering ============
-- Idempotent. Safe to run multiple times. Adds only new objects.

create table if not exists public.telegram_users (
  telegram_id        bigint primary key,
  user_id            uuid references public.profiles(id) on delete set null,
  username           text,
  signals_used_today int not null default 0,
  last_reset_date    timestamptz not null default now(),
  first_seen         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists telegram_users_user_id_idx on public.telegram_users(user_id);
alter table public.telegram_users enable row level security;

create table if not exists public.telegram_link_codes (
  code       text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
create index if not exists telegram_link_codes_user_id_idx on public.telegram_link_codes(user_id);
alter table public.telegram_link_codes enable row level security;

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

create or replace function public.consume_telegram_signal(p_telegram_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tu        record;
  is_pro    boolean := false;
  did_reset boolean;
  used      int;
begin
  insert into public.telegram_users (telegram_id) values (p_telegram_id)
    on conflict (telegram_id) do nothing;

  select * into tu from public.telegram_users
    where telegram_id = p_telegram_id
    for update;

  if tu.user_id is not null then
    select (subscription_status = 'pro') into is_pro
      from public.profiles where id = tu.user_id;
    if is_pro then
      return jsonb_build_object('allowed', true, 'remaining', -1, 'linked', true, 'pro', true);
    end if;
  end if;

  did_reset := (tu.last_reset_date at time zone 'utc')::date
               < (now() at time zone 'utc')::date;
  used := case when did_reset then 0 else tu.signals_used_today end;

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

  insert into public.telegram_users (telegram_id, user_id)
    values (p_telegram_id, lc.user_id)
  on conflict (telegram_id) do update
    set user_id = lc.user_id, updated_at = now();

  update public.telegram_link_codes set used_at = now() where code = p_code;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.touch_telegram_user(bigint, text)      from public, anon, authenticated;
revoke all on function public.consume_telegram_signal(bigint)        from public, anon, authenticated;
revoke all on function public.redeem_telegram_link(bigint, text)     from public, anon, authenticated;
grant execute on function public.touch_telegram_user(bigint, text)   to service_role;
grant execute on function public.consume_telegram_signal(bigint)     to service_role;
grant execute on function public.redeem_telegram_link(bigint, text)  to service_role;

-- ---- success check (should return: 0007 applied OK | 2 | 3) ----
select '0007 applied OK' as status,
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name in ('telegram_users','telegram_link_codes')) as tables_created,
  (select count(*) from information_schema.routines
     where routine_schema='public'
       and routine_name in ('touch_telegram_user','consume_telegram_signal','redeem_telegram_link')) as functions_created;
```

## After it runs
Nothing else needed on the DB side. `/signal` and `/link` start working immediately — no redeploy required (the code is already live). To confirm, message the bot `/signal BTC`.
