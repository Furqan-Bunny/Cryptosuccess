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
| `src/app/api/telegram/webhook/route.ts` | Thin Telegram adapter: secret-token verify → parse → bot core → ACK 200 |
| `src/services/bot/format.ts` | Honest-coach formatter, plain text and channel-neutral (stop-loss, max-loss/sizing, honest confidence, stay-out path, `/verify` hook; bans "guaranteed/100x") |
| `src/lib/telegram/api.ts` | Telegram Bot API client |
| `src/services/analyst.service.ts` | Shared Claude analyst generation extracted from `/api/ai/analyst` (bot + web reason identically) |
| `src/app/api/telegram/link/route.ts` | Mints an account-link code |
| `src/app/api/telegram/setup/route.ts` | Self-registers the webhook on deploy (see below) |
| `supabase/migrations/0007_telegram_users.sql` | `telegram_users`, link codes, `consume_telegram_signal` (Free 5/day, linked-Pro unlimited), `redeem_telegram_link` |
| `supabase/migrations/0008_telegram_shared_quota.sql` | Linked chats share the account's web allowance (`consume_signal`) instead of a second 5/day bucket |
| `src/services/bot/record.ts` | Turns a linked chat's read into a `signals` row (fresh live entry, parsed + direction-checked levels) so it is scored and anchored like web signals |
| `src/components/settings/TelegramLinkCard.tsx` | Settings → Telegram: mints the one-time `/link` code |
| `.github/workflows/scheduler.yml` | Hourly engine tick + signal evaluation (Hobby crons are daily-only) |
| `scripts/set-telegram-webhook.ts` | Alternative CLI webhook registration |
| `tests/unit/telegram-format.test.ts` | Tests locking the honest-coach guardrails |
| `supabase/ALL_MIGRATIONS.sql` | Convenience: migrations 0001→0012 combined for one paste (generated) |

## To make `/signal` work (for the reviewer deploying to the real project)
1. **Supabase** — create a project; in the SQL Editor run `supabase/ALL_MIGRATIONS.sql`
   (migrations 0001→0012). If some are already applied, run only the missing files from `supabase/migrations/` in numeric order. Copy the Project URL, `anon` key, and `service_role` key.
2. **Anthropic** — create an API key (`sk-ant-…`) with a little billing credit.
3. **Set env vars** (Vercel → Project → Settings → Environment Variables), then redeploy:
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (already set on the demo deploy)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
4. **Register the webhook** on the final domain — run once (the secret goes in a header, never the URL;
   `NEXT_PUBLIC_APP_URL` must be the public https URL in production):
   `curl -X POST https://<your-domain>/api/telegram/setup -H "Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>"`
5. Test in Telegram: `/start`, then `/signal BTC`.

> Note: `vercel.json` crons are set to **daily** for Hobby. `.github/workflows/scheduler.yml`
> calls `/api/engine/tick` + `/api/signals/evaluate` **hourly** (set repo secrets `APP_URL`
> and `CRON_SECRET`). For near-real-time stop-losses, also point cron-job.org (or Vercel Pro)
> at `/api/engine/tick` every 1–2 min with `Authorization: Bearer <CRON_SECRET>`. Model IDs in `analyst.service.ts` were carried over
> from the existing `/api/ai/analyst` route — confirm they match the current
> Anthropic model IDs before go-live.

## Phase 2 — hardening, personalization, push, follow-ups (migration 0010)

### Architecture: channel-agnostic core
| File | Purpose |
|---|---|
| `src/services/bot/core.ts` | `handleIncoming(msg, deps)` — command routing, group policy, rate limits, fail-closed metering, N14 refund, personalization |
| `src/services/bot/types.ts` | `IncomingMessage`, `ChannelAdapter { send(chatId, text) }`, `BotStore` (per-channel persistence), `BotDeps` |
| `src/services/bot/commands.ts` | Command catalogue → `/help`, the Telegram menu (`setMyCommands`) and the group policy |
| `src/services/bot/rate-limit.ts` | Per-chat limits + bounded in-memory fallback limiter for `/link` |
| `src/services/bot/prefs.ts` | `/risk`, `/coins`, `/alerts` parsing + risk budgets (low 0.5–1%, medium 1–2%, high 2% max) |
| `src/services/bot/push.ts`, `followups.ts` | Pure eligibility / validation rules for the two crons |
| `src/services/telegram/adapter.ts` | Telegram update → `IncomingMessage`; Bot API delivery |
| `src/services/telegram/store.ts` | Supabase `BotStore` for Telegram (RPCs from 0007/0008/0010) |
| `src/services/telegram/push-job.ts`, `followup-job.ts` | Cron job bodies |
| `src/app/api/telegram/push`, `.../followups` | Cron routes (`isCronAuthorized`, GET + POST) |

A WhatsApp channel needs only: a webhook route that verifies its signature and builds an
`IncomingMessage` (`channel: 'whatsapp'`), a `ChannelAdapter`, and a `BotStore` over its own
tables. Routing, limits, quotas and every honesty guardrail are shared.

### Rate limiting + abuse
- Per chat (Upstash, `src/lib/server/rate-limit.ts`): **20 messages/min** general (one "slow down"
  notice per window, then silence so a flood can't make the bot flood back), **/signal 6 per
  10 min** (checked before a credit is consumed), **/link 5 per 15 min** (counted before the code
  is looked up).
- Upstash fails open, so `/link` also passes a bounded **in-memory per-instance limiter** (both must allow).
- Inputs over 500 chars are refused before parsing; webhook bodies over 64 KB are dropped.
- **Group chats:** quota, account link and preferences are keyed by chat id, so in a group every
  member would share one allowance and a `/link` code would be visible to all. Groups get only
  `/start`, `/help`, `/verify`, `/subscribe`; private-only commands reply "message me directly";
  chatter and unknown commands are ignored; no `telegram_users` row is created for a group.

### N14 — credit refund
If the analyst read fails (throws or returns null) after `consume_telegram_signal` granted a
credit, the bot calls `refund_telegram_signal` (unlinked → `telegram_users`, linked → the
account's `profiles` counter; never for Pro, never below 0, same UTC day only) and tells the user
it didn't count.

### Personalization
`/risk low|medium|high`, `/coins BTC ETH SOL` (validated against `src/lib/coins.ts`, max 5),
`/settings`. Stored in `telegram_prefs` via `save_telegram_prefs`. The sizing line on every read
follows the risk level and is **never above 2%**; the stop-loss and max loss always show.

### Daily alerts (`/alerts on|off`, cron `/api/telegram/push`, suggested **daily**)
Only for chats **linked to a Pro account** (free/unlinked users get an explanation). At most one
push per chat per 20h (compare-and-set claim on `last_push_at`, so overlapping runs can't
double-send), up to 3 of the chat's coins, cache-first generation memoized per run, sequential
sends with a small delay, stops early inside the 60s budget. A chat that blocked the bot gets
alerts switched off. Pushes are **not** recorded as signals — the digest says so and points to
`/signal` for a recorded call; it always shows stops, the stay-out path, `/alerts off` and the disclaimer.

### Accountability follow-ups (cron `/api/telegram/followups`, suggested **hourly**, after `/api/signals/evaluate`)
For calls recorded from Telegram (`reasoning` starts with `Telegram analyst read`) that were
finalized in the last 72h, sends the outcome once — wins and losses alike, with the price move,
the call's P/L and `/verify?signalId=…`. Sent to the account's most recently active linked
private chat; max 3 per chat per run. `telegram_followups` (PK `signal_id`) is claimed before
sending, released on a transient failure. Rows are validated (UUID, supported symbol, action,
finite numbers) before any field is echoed, since clients can insert their own signals.

### Go-live for phase 2
1. Run `supabase/migrations/0010_telegram_phase2.sql` in the Supabase SQL editor (after 0008).
2. Schedule `GET /api/telegram/push` daily and `GET /api/telegram/followups` hourly with
   `Authorization: Bearer <CRON_SECRET>` (Vercel Hobby crons are daily-only → use the GitHub
   scheduler or cron-job.org for the hourly one).
3. Re-run `POST /api/telegram/setup` (with `Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>`) once so the command menu shows
   the new commands. Optional but recommended: `UPSTASH_REDIS_REST_URL` / `_TOKEN` for
   cross-instance rate limits.

## Product principles enforced (never break)
Provably honest — only calls actually written to `signals` (linked chats with parseable,
direction-consistent levels) claim on-chain recording; every other reply says plainly that it
is NOT recorded, honest about uncertainty
(explicit "stay out" on low conviction), risk-first (stop-loss + max loss on every
call), teaches, personalized, never "guaranteed/100x". These are locked by
`tests/unit/telegram-format.test.ts`, `tests/unit/bot-core.test.ts` and `tests/unit/bot-rules.test.ts`.
