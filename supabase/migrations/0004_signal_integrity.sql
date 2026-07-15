-- Signal-record immutability (prerequisite for on-chain anchoring).
-- Run in the Supabase SQL editor after 0003.
--
-- Signal evaluation is now server-authoritative: the hourly cron
-- `/api/signals/evaluate` finalizes pending signals with the SERVICE-ROLE client
-- (which bypasses RLS). Clients only INSERT and READ signals — they must never be
-- able to rewrite their own history, or the "tamper-proof track record" we anchor
-- on-chain would be meaningless.
--
-- Mechanism: drop the client UPDATE policy. With RLS enabled and no UPDATE policy,
-- UPDATE is denied for the anon/authenticated roles, while the service-role key
-- (engine + evaluation cron) still updates because it bypasses RLS entirely. This
-- is simpler and stronger than a column-level trigger: signals become effectively
-- insert-only + read for every client. SELECT (signals_select_all) and INSERT
-- (signals_insert_own) policies from 0001 are unchanged.

drop policy if exists "signals_update_own" on public.signals;

-- Defense-in-depth: even if an UPDATE policy is re-added later, block any client
-- (non-service-role) mutation of the scored/leaf columns once a row exists, so an
-- anchored signal can never be altered off the books.
create or replace function public.protect_signal_record()
returns trigger language plpgsql as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Signals are immutable once created (server-managed)';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_signal_record on public.signals;
create trigger protect_signal_record
  before update on public.signals
  for each row execute function public.protect_signal_record();
