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
