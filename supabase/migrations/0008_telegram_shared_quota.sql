-- Telegram: linked chats share the web account's daily signal allowance.
-- Run in the Supabase SQL editor after 0007.
--
-- 0007 metered every chat on its own telegram_users counter, so a linked FREE
-- user got 5 signals on the web AND 5 on Telegram (10/day). A linked chat now
-- delegates to consume_signal (0003) — one UTC-daily 5/day bucket per account,
-- Pro unlimited. Unlinked chats keep their own per-chat 5/day counter.

create or replace function public.consume_telegram_signal(p_telegram_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tu        record;
  gate      jsonb;
  did_reset boolean;
  used      int;
begin
  -- Ensure a row exists, then lock it.
  insert into public.telegram_users (telegram_id) values (p_telegram_id)
    on conflict (telegram_id) do nothing;

  select * into tu from public.telegram_users
    where telegram_id = p_telegram_id
    for update;

  -- Linked → the account's shared allowance (consume_signal handles Pro + UTC reset).
  if tu.user_id is not null then
    gate := public.consume_signal(tu.user_id);
    return gate || jsonb_build_object(
      'linked', true,
      'pro', coalesce((gate->>'remaining')::int, 0) = -1
    );
  end if;

  -- Unlinked → per-chat UTC-daily free allowance (unchanged from 0007).
  did_reset := (tu.last_reset_date at time zone 'utc')::date
               < (now() at time zone 'utc')::date;
  used := case when did_reset then 0 else tu.signals_used_today end;

  if used >= 5 then
    if did_reset then
      update public.telegram_users
        set signals_used_today = 0, last_reset_date = now(), updated_at = now()
        where telegram_id = p_telegram_id;
    end if;
    return jsonb_build_object('allowed', false, 'remaining', 0, 'linked', false, 'pro', false);
  end if;

  update public.telegram_users
    set signals_used_today = used + 1,
        last_reset_date     = case when did_reset then now() else last_reset_date end,
        updated_at          = now()
    where telegram_id = p_telegram_id;

  return jsonb_build_object('allowed', true, 'remaining', 5 - (used + 1), 'linked', false, 'pro', false);
end;
$$;

revoke all on function public.consume_telegram_signal(bigint) from public, anon, authenticated;
grant execute on function public.consume_telegram_signal(bigint) to service_role;
