# Telegram Bot MVP — Handover for Review & Go-Live

Implements the **Telegram Bot MVP** (docs/HANDOVER.md §4.1) — the "honest AI trading
coach." Built on top of the existing signal engine (§3), nothing in §3 was rewritten.

## Status
- ✅ Code complete · `type-check` clean · **108 tests** pass (was 97) · `build` green.
- ✅ Deployed to a **demo** Vercel (developer's personal Hobby account) to prove it runs:
  bot **@cryptosuccess_coach_bot**, app https://cryptosuccess-azure.vercel.app
- ✅ **Working live:** `/start`, `/help`, `/verify`, `/subscribe`.
- ⚠️ **Not yet functional:** `/signal` and `/link` — they need real Supabase + an
  Anthropic key (see "To make /signal work" below). Until then `/signal` replies with
  a graceful "not live yet" message.

## What was added (all reused the existing brain — no duplication)
| File | Purpose |
|---|---|
| `src/app/api/telegram/webhook/route.ts` | Webhook; secret-token verified; command router; base URL derived from request |
| `src/services/telegram/format.ts` | Honest-coach formatter (stop-loss, max-loss/sizing, honest confidence, stay-out path, `/verify` hook; bans "guaranteed/100x") |
| `src/lib/telegram/api.ts` | Telegram Bot API client |
| `src/services/analyst.service.ts` | Shared Claude analyst generation extracted from `/api/ai/analyst` (bot + web reason identically) |
| `src/app/api/telegram/link/route.ts` | Mints an account-link code |
| `src/app/api/telegram/setup/route.ts` | Self-registers the webhook on deploy (see below) |
| `supabase/migrations/0007_telegram_users.sql` | `telegram_users`, link codes, `consume_telegram_signal` (Free 5/day, linked-Pro unlimited), `redeem_telegram_link` |
| `scripts/set-telegram-webhook.ts` | Alternative CLI webhook registration |
| `tests/unit/telegram-format.test.ts` | 11 tests locking the honest-coach guardrails |
| `supabase/ALL_MIGRATIONS.sql` | Convenience: migrations 0001→0007 combined for one paste |

## To make `/signal` work (for the reviewer deploying to the real project)
1. **Supabase** — create a project; in the SQL Editor run `supabase/ALL_MIGRATIONS.sql`
   (migrations 0001→0007). Copy the Project URL, `anon` key, and `service_role` key.
2. **Anthropic** — create an API key (`sk-ant-…`) with a little billing credit.
3. **Set env vars** (Vercel → Project → Settings → Environment Variables), then redeploy:
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (already set on the demo deploy)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
4. **Register the webhook** on the final domain — open once in a browser:
   `https://<your-domain>/api/telegram/setup?key=<TELEGRAM_WEBHOOK_SECRET>`
5. Test in Telegram: `/start`, then `/signal BTC`.

> Note: `vercel.json` crons are set to **daily** for Hobby. For responsive auto
> stop-loss, restore frequent schedules on Vercel Pro or an external scheduler
> (see docs/HANDOVER.md §4.4). Model IDs in `analyst.service.ts` were carried over
> from the existing `/api/ai/analyst` route — confirm they match the current
> Anthropic model IDs before go-live.

## Product principles enforced (never break)
Provably honest (on-chain `/verify` hook on every signal), honest about uncertainty
(explicit "stay out" on low conviction), risk-first (stop-loss + max loss on every
call), teaches, personalized, never "guaranteed/100x". These are locked by
`tests/unit/telegram-format.test.ts`.
