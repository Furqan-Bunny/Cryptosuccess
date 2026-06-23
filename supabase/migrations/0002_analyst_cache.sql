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
