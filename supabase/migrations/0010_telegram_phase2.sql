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
