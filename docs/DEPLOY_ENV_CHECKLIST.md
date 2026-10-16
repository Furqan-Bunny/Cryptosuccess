# Deploy checklist — make the Telegram bot work on Vercel

This is the exact set of things that must be true for `@cryptosuccess_coach_bot`
(`/signal`, `/link`, `/verify`, `/start`, `/help`, `/subscribe`) to work on a
Vercel deployment. Written after debugging a live outage where the bot replied
*"This feature isn't live yet — the signal backend (database + AI) is still being
set up."*

## Root cause of that outage (so it doesn't repeat)

Two independent problems, both now understood:

1. **Database:** migration `0007` (Telegram tables + functions) was missing.
   → **FIXED 2026-08-03** — `telegram_users` + `telegram_link_codes` and the 3
   functions now exist in Supabase project `nypfozskratyufcqeivo`. See
   `docs/APPLY_0007_FOR_BOSS.md`. Nothing more to do here.

2. **Env vars:** the Vercel project's `NEXT_PUBLIC_SUPABASE_URL` (and the other
   Supabase/Anthropic keys) held **invalid placeholder values**. Symptoms:
   - The build **fails** at page prerender with
     `Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.`
   - Even if an old build stays live, the bot code sees no reachable DB/AI and
     falls back to the "still being set up" message
     (`notConfiguredMessage()` in `src/services/bot/format.ts`).

   **Lesson:** the app cannot build or run without valid Supabase env values.
   Set them correctly *before* deploying.

## Required env vars (set in Vercel → Project → Settings → Environment Variables → Production)

The Telegram signal path (`webhook/route.ts`, `analyst.service.ts`) needs all of:

| Variable | Used for | Must be |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | build + runtime DB | real `https://<ref>.supabase.co` (NOT a placeholder) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | build (client pages) | real anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | runtime metering/linking | real service-role key |
| `ANTHROPIC_API_KEY` | AI analyst | real `sk-ant-…` key |
| `TELEGRAM_BOT_TOKEN` | send replies | BotFather token |
| `TELEGRAM_WEBHOOK_SECRET` | verify webhook + `/api/telegram/setup` | any strong secret |

Optional: `NEXT_PUBLIC_APP_URL` (public https URL). If unset, the code derives
the base URL from the request host, so it still works.

The real values are the boss-provided keys already in the local `.env.local`
(do NOT rotate them). They are intentionally **not** committed to git.

> Tip: after setting/adding env vars in Vercel, you must **redeploy** — Vercel
> only injects env vars into deployments created *after* the var is saved.

## Deploy steps (owner's Vercel, from GitHub)

1. Set all six env vars above for **Production** (correct values, no placeholders).
2. Deploy the `main` branch (Git integration, or `vercel deploy --prod`).
3. Wait for the build to reach **Ready**.
4. Register the Telegram webhook once:
   `curl -X POST https://<your-app>/api/telegram/setup -H "Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>"`
   (`NEXT_PUBLIC_APP_URL` must be the public https URL in production).
5. Test in Telegram: `/start`, then `/signal BTC`. A coached signal (not the
   "still being set up" message) means everything is wired correctly.

## Sanity checks

- Build log shows no `Invalid supabaseUrl` error → env vars are valid.
- `/signal BTC` returns a signal → DB migration 0007 + service-role key + AI key
  are all good.
- `/link` returns a code → `redeem_telegram_link`/`telegram_link_codes` present.
