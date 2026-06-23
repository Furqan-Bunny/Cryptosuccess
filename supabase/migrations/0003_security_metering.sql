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
