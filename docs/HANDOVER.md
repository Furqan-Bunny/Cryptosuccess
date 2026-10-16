# CryptoSuccess — Project Handover & Roadmap

> **Read this first.** This document explains the product vision, what is already
> built, what remains, and exactly how to continue. It is written so a developer
> new to the project can pick up the next task without extra context.
>
> Last updated: 2026-10. Default branch: `main` (the `supabase-migration` work,
> including the Telegram bot MVP, has been merged into it).
>
> **Live task board:** the full backlog — Epics → Subtasks, priorities, and
> step-by-step details (What to do / Files / Done when / Reference) — lives in
> **ClickUp** (Workspace → Team Space → **CryptoSuccess** list). Read the
> **"START HERE"** task first, then work the **Telegram Bot MVP** epic. This doc is
> the narrative; ClickUp is the actionable checklist.
>
> Older Firebase-era specs (PRD, architecture, epics, implementation guide) live in
> `docs/archive/` for history only. They do not describe the current system.

---

## 1. The Vision (what we are actually building)

An **AI crypto trading-signal bot on Telegram (first) and WhatsApp (later)** — but
**not** another hype "signals" bot. The product is an **"honest AI trading coach."**

### Why this, and why it's different
The signals-bot market is saturated with scams and liars. We **cannot** win on
"better predictions" — nobody can reliably predict crypto (realistically ~50–55%
directional accuracy at best). So our edge is **honesty and protecting users from
losing money**. These principles are non-negotiable and must show up in every
feature:

1. **Provably honest** — our track record is anchored on a public blockchain, so
   we *cannot* secretly delete losing calls. **No competitor can claim this.** It
   is our core trust hook. (Already built — see §3.)
2. **Honest about uncertainty** — the bot says *"stay out / don't trade"* when the
   market is choppy. Most bots never do.
3. **Risk-first** — every call includes position sizing, a stop-loss, and *"here's
   what you could lose."*
4. **Teaches / explains reasoning** — turns gamblers into smarter traders.
5. **Personalized, not broadcast spam** — adapts to the user's risk level and coins.
6. **Accountability** — follows up honestly on how past calls played out.

**The pitch:** *"Finally an honest bot — it won't rek you, and you can verify our
track record on the blockchain."*

> ⚠️ **Guardrail for all contributors:** the entire value collapses if we start
> over-promising. Never ship "guaranteed", "100x", or hidden losses. Honest
> confidence, always-visible risk, and only market the verifiable track record —
> because we can actually back it up.

---

## 2. Architecture at a glance

- **Web app / backend:** Next.js 14 (App Router, TypeScript) + **Supabase**
  (Postgres, Auth, RLS, Realtime). Deployed target: Vercel.
- **Signal "brain" (already exists):** technical indicators, multi-timeframe LSTM
  models + rule-based fallback, a Claude (Anthropic) analyst layer, and
  risk/reasoning reports. See `src/services/ai/*`, `src/lib/horizons.ts`,
  `src/services/horizon-signal.service.ts`, `src/services/signal-report.service.ts`,
  `src/services/market-context.service.ts` (server-safe).
- **Market data:** Binance public API (via `src/lib/server/binance-server.ts`).
- **Payments:** Stripe (cards) + NOWPayments (crypto, built — see §3).
- **Blockchain:** viem + a minimal anchoring contract (Foundry) for the verifiable
  track record. wagmi for optional non-custodial trading (off).
- **The bot (built, MVP):** a Telegram bot (`src/app/api/telegram/*`,
  `src/services/telegram/*`, `src/lib/telegram/api.ts`) that reuses the shared
  analyst (`src/services/analyst.service.ts`) server-side and delivers the
  "honest coach" experience.

---

## 3. ✅ What is COMPLETED

### 3.1 The web app (base product) — DONE
Signal generation, dashboard, market pages, paper-trading suite (spot/futures/
staking/DCA), Stripe subscriptions (Free vs Pro), Fear & Greed sentiment, signal
history + track record UI, tests + CI. This is the foundation the bot reuses.

### 3.2 Phase 0 — Signal immutability (foundation) — DONE, migrations applied
So the track record cannot be secretly edited.
- Server cron `src/app/api/signals/evaluate/route.ts` finalizes signals that are
  at least 24h old (service-role, deterministic scorer `src/lib/signal-outcome.ts`,
  priced at the current Binance spot price when the cron runs).
- Migration `supabase/migrations/0004_signal_integrity.sql` makes the `signals`
  table **insert-only for clients** (only the server can finalize).

### 3.3 Phase 1 — Verifiable on-chain track record — **DONE & LIVE ON TESTNET** ✅
This is our trust backbone. **Fully working and verified end-to-end.**
- Daily Merkle root of finalized signals is anchored on-chain; anyone can verify a
  signal's inclusion **trustlessly** at `/verify`.
- **Be precise in all copy:** signals are anchored *after* they are scored (each
  completed UTC day of finalized results is anchored by the next anchor run), not
  at publication time. Signals still inside their 24h window are not anchored.
- Key code: `src/lib/merkle.ts`, `src/lib/track-record-leaf.ts`,
  `src/lib/server/anchor.ts`, `src/app/api/anchor/run/route.ts`,
  `src/app/api/anchor/proof/route.ts`, `src/app/verify/page.tsx`.
- Contract: `contracts/TrackRecordAnchor.sol` (+ Foundry tests/deploy).
- Migration `0005_track_record_anchors.sql`.
- **Live deployment (Base Sepolia testnet):**
  - Contract: `0xFfe6D3eDc3B4f24C871D60C19e422e6f3851BE1a`
  - Chain: Base Sepolia (id `84532`), explorer https://sepolia.basescan.org
  - Verified: an anchored signal's on-chain root matched the computed root
    (`roots(dayKey)` == Merkle root; anchoring tx succeeded).
- **Remaining for production:** move to a mainnet L2 when ready (env change only),
  and run the anchor cron on a schedule (Vercel cron or external scheduler).

### 3.4 Phase 2 — Crypto payments (NOWPayments) — CODE DONE, ACTIVATED PER DEPLOYMENT
- `src/app/api/crypto/checkout/route.ts` (creates a NOWPayments invoice) and
  `src/app/api/crypto/webhook/route.ts` (HMAC-SHA512 IPN verification, idempotent
  Pro grant). Migration `0006_crypto_payments.sql`. "Pay with crypto" button on
  `src/app/pricing/page.tsx`. NOWPayments redirects to `/subscription/success`
  without a session id; that page explains that Pro activates once the payment
  confirms on-chain and re-checks the profile. Crypto Pro is one-time and does not
  renew.
- **To activate:** create a NOWPayments account, add a payout wallet, set
  `NOWPAYMENTS_API_KEY` + `NOWPAYMENTS_IPN_SECRET`, set a **public**
  `NEXT_PUBLIC_APP_URL` (for the IPN callback), and set the IPN URL in the
  NOWPayments dashboard. A sandbox exists for testing without real money.

### 3.5 Phase 3 — Non-custodial on-chain trading — BUILT, OFF BY DEFAULT
- wagmi/viem wallet connect + 0x swap proxy; `src/components/web3/*`,
  `src/app/api/trade/quote/route.ts`, `src/lib/web3/config.ts`.
- **Disabled** unless `NEXT_PUBLIC_LIVE_TRADING_ENABLED=true` + a WalletConnect id.
- **HARD GATE:** real trade execution can require licensing/KYC/geo limits — needs
  a **legal review** before any mainnet enablement. Treat as a distant future item.

### 3.6 Telegram bot — MVP + phase 2 DONE
- Webhook `src/app/api/telegram/webhook/route.ts` verifies
  `X-Telegram-Bot-Api-Secret-Token` (constant-time), caps the body size and hands
  the message to the channel-agnostic core `src/services/bot/core.ts`
  (`handleIncoming`). A future WhatsApp adapter only supplies a sender + store.
- Commands: `/start`, `/help`, `/signal <COIN>`, `/verify`, `/subscribe`,
  `/link <code>`, `/risk`, `/coins`, `/alerts`, `/settings`. In group chats only
  `/start`, `/help`, `/verify` and `/subscribe` answer.
- `/signal` uses the shared server-side analyst and formats an honest-coach reply
  (`src/services/bot/format.ts`: stop-loss, max loss / sizing by risk level,
  conviction, explicit "stay out" on HOLD or low conviction; banned hype phrases
  are locked by tests). A failed read refunds the credit (`refund_telegram_signal`).
- Bot calls with parseable, direction-consistent levels are written to `signals`
  (`src/services/bot/record.ts`) so they enter the same scored, anchored record.
- Per-chat rate limits (20 msgs/min, 6 `/signal` per 10 min, 5 `/link` per 15 min).
- Daily alerts for linked Pro chats (`/api/telegram/push`) and outcome follow-ups
  for scored calls (`/api/telegram/followups`).
- Account linking via one-time codes from Settings (`/api/telegram/link`,
  `TelegramLinkCard`). Migrations `0007`, `0008` (linked chats share the web
  account's 5/day quota) and `0010` (prefs, follow-up ledger, refunds).
- Webhook registration: `scripts/set-telegram-webhook.ts` or
  `POST /api/telegram/setup` with `Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>`.
  Production checklist: `docs/DEPLOY_ENV_CHECKLIST.md`.

### 3.7 Public pages and positioning — DONE
Landing page leads with the honest-coach story and a "Verify our track record" CTA;
`/pricing`, `/terms`, `/privacy` and the new `/disclaimer` are consistent (one
14-day refund policy, NOWPayments not Coinbase, Premium shown as "Coming soon",
real processors listed). Backtest numbers quoted publicly come only from
`public/backtest-results.json`, with caveats.

### 3.8 Security and integrity hardening (sprint 2026-10) — DONE
- **Migration `0009`**: signals are inserted by the server only
  (`POST /api/signals/record` re-prices the entry against live spot, uses server
  timestamps and refunds the credit if the save fails); lapsed one-off crypto Pro
  is metered as free (`consume_signal`) and downgraded by
  `/api/subscriptions/expire`; paper cash changes only through
  `adjust_paper_balance` / `reset_paper_balance`.
- Stripe: price chosen on the server from plan + interval
  (`STRIPE_PRO_MONTHLY_PRICE_ID` / `STRIPE_PRO_YEARLY_PRICE_ID`), same-origin return
  URLs, period end read from subscription items, `past_due` keeps Pro during
  retries. NOWPayments: invoiced amount must match, repeat payments extend the
  current period. Open redirects in login / auth callback closed.
- **Migration `0011`** + `src/lib/server/report-error.ts` /
  `src/lib/server/cron-monitor.ts`: scrubbed error log (`error_events`), every cron
  run recorded (`cron_runs`), optional Telegram admin alerts, `GET /api/health`
  and `GET /api/ops/status` (see §4.4).
- **Migration `0012`** (run it BEFORE deploying the matching code):
  - Free-tier quota columns on `profiles` (`signals_used_today`,
    `last_reset_date`, `total_signals_viewed`, plus `email` / `created_at`) are
    server-managed: the guard trigger rejects client changes and clients may only
    UPDATE `display_name, photo_url, notifications, timezone, watchlist,
    last_login, portfolio_summary`. A new client-editable profile column must be
    added to that GRANT.
  - Paper cash: `adjust_paper_balance` is no longer callable by clients. Staking
    goes through `stake_position` / `unstake_position` (APY read from
    `staking_rates`), futures through `POST /api/paper/futures/open|close`
    (server-priced, `open_futures_position` / `close_futures_position`, service
    role only). Staking / futures rows are read-only to clients;
    `reset_paper_balance` also closes open stakes and futures.
  - Account deletion keeps scored signals (`user_id` set to NULL) so losing calls
    can't disappear and inclusion proofs keep working; anchored leaves can't be
    deleted. `/api/anchor/proof` refuses to build a proof from an incomplete day.

### 3.9 Quality baseline (keep it green)
`npm run type-check` clean · `npm test` green (300+ tests) · `npm run build`
green · `npm run lint` clean with zero warnings (`react/no-unescaped-entities`
is an error). **Do not regress these.**

---

## 4. 🔨 What REMAINS (in priority order)

### 4.1 Telegram bot — DONE (original build plan kept for reference)
The on-demand bot, scheduled push and follow-ups are built (see §3.6). The plan
below is the original brief, kept for reference.

**Build steps:**
1. **Create the bot:** talk to `@BotFather` on Telegram → get a bot token → set
   `TELEGRAM_BOT_TOKEN` (server env). Also generate a `TELEGRAM_WEBHOOK_SECRET`.
2. **Webhook route:** `src/app/api/telegram/webhook/route.ts` — receives Telegram
   updates (POST). Verify the `X-Telegram-Bot-Api-Secret-Token` header against
   `TELEGRAM_WEBHOOK_SECRET`. Parse the message/command and reply via the Telegram
   `sendMessage` API.
3. **Commands (MVP):**
   - `/start` — welcome + the honest-coach framing + risk disclaimer.
   - `/signal <COIN>` — generate an honest signal and send it (see below).
   - `/verify` — link to the on-chain track record (`/verify` page) — our hook.
   - `/help`, `/subscribe` (link to pricing).
4. **Signal generation (server-side):** the browser-only TF.js models can't run in
   the bot. Use the **server-safe** path: `buildMarketContext(symbol)` +
   the Claude analyst logic (see `src/app/api/ai/analyst/route.ts`) and/or the
   rule-based engine. Format the reply as an **honest coach**: action, confidence
   (honest), entry, target, **stop-loss**, **position size / max loss**, short
   reasoning, and a "stay out if choppy" path.
5. **Link Telegram users ↔ accounts:** new migration `0007_telegram_users.sql`
   (`telegram_id` ↔ Supabase `user_id`, plus a linking flow). Enforce Free vs Pro
   limits by reusing the `consume_signal` RPC (migration `0003`).
6. **Register the webhook:** call Telegram `setWebhook` with the public URL
   (`<app>/api/telegram/webhook`) + secret token. Needs a **public URL** (Vercel
   deploy or an ngrok tunnel for local dev).
7. **(Next) Scheduled push:** a cron that sends signals/updates to subscribed users
   (respecting "don't spam / personalize"). Build after the on-demand flow works.

**Definition of done (MVP):** a user can `/start`, run `/signal BTC`, and receive
an honest, risk-managed signal; `/verify` links to the provable track record;
Free/Pro limits enforced; `tsc`/tests/build green.

### 4.2 WhatsApp bot — NOT STARTED (future)
Needs the **official WhatsApp Business API** (via Meta or Twilio): business
verification, template approval, and per-message cost. Do this **after** Telegram
proves the product. The bot core is already channel-agnostic
(`src/services/bot/*`): WhatsApp needs only a `ChannelAdapter` and a `BotStore`.

### 4.3 Activate Phase 2 (crypto payments) — when going live
See §3.4 — just needs keys + a public URL + dashboard config.

### 4.4 Crons and monitoring
Every scheduled route authorizes with `isCronAuthorized`
(`src/lib/server/cron-auth.ts`: constant-time compare of
`Authorization: Bearer <CRON_SECRET>`, fails closed in production when the secret
is unset). Daily schedule in `vercel.json` (UTC):

| Route | Schedule | Job |
|---|---|---|
| `/api/anchor/run` | 01:30 daily | Build + anchor Merkle roots for completed days |
| `/api/subscriptions/expire` | 03:00 daily | Downgrade lapsed one-off crypto Pro |
| `/api/ops/prune` | 03:15 daily | 30-day retention for `error_events` / `cron_runs` |
| `/api/signals/evaluate` | 04:00 daily (+ hourly via GitHub) | Score signals that are at least 24h old |
| `/api/telegram/followups` | 04:15 daily (+ hourly via GitHub) | Tell Telegram users how scored calls ended |
| `/api/engine/tick` | 05:00 daily (+ hourly via GitHub) | Paper-trading order engine (limits, stops) |
| `/api/discover/scan` | 06:00 daily | Opportunity scanner |
| `/api/staking/refresh` | 07:00 daily | Refresh simulated staking APYs (DefiLlama) |
| `/api/brief/generate` | 08:00 daily | Daily market brief |
| `/api/dca/run` | 09:00 daily | Paper DCA plans |
| `/api/telegram/push` | 13:00 daily | Daily alerts for linked Pro chats |

Vercel Hobby only allows daily crons, so `.github/workflows/scheduler.yml` also
calls `/api/engine/tick`, `/api/signals/evaluate` and `/api/telegram/followups`
every hour (repo secrets `APP_URL` and `CRON_SECRET`). For near-real-time
stop-losses point an external scheduler at `/api/engine/tick` every 1-2 minutes.

Monitoring: every cron is wrapped in `withCronMonitoring`, which records the run
in `cron_runs` and reports failures through `reportError` (one scrubbed JSON log
line, a row in `error_events`, and an optional Telegram alert to
`ALERT_TELEGRAM_CHAT_ID`, throttled to one per error type per 10 minutes).
`GET /api/ops/status` (Bearer `CRON_SECRET`) shows each job's last run, last
success and staleness; `?strict=1` answers 503 when anything needs attention and
the hourly scheduler's health job turns red. Jobs whose feature is not configured
(no Telegram bot, no Anthropic key) are shown as disabled, not degraded.
`GET /api/health` is a public liveness probe. A new cron must be added to
`CRON_JOBS` in `src/lib/server/cron-monitor.ts` and to `vercel.json` (a unit test
checks they match).

### 4.5 Move anchoring to mainnet — when ready
Deploy `TrackRecordAnchor.sol` to a mainnet L2 (e.g. Base), fund the signer, and
update the `ANCHOR_*` / `NEXT_PUBLIC_ANCHOR_*` env vars. Code needs no changes.

---

## 5. Developer setup (for a new dev)

1. `npm install`
2. Copy `.env.local.example` → `.env.local` and fill values (see §6). **Never
   commit `.env.local`** — it holds secrets (it is gitignored).
3. Apply **every** Supabase migration in `supabase/migrations/` in numeric order
   via the Supabase SQL editor (or run the generated `supabase/ALL_MIGRATIONS.sql`
   on a fresh project). Server routes fail closed if their migration is missing.
   Full local walkthrough: `QUICKSTART.md`.
4. `npm run dev` (app), `npm test`, `npm run type-check`, `npm run lint`.
5. Smart contract (only if touching anchoring): install Foundry, then
   `forge install foundry-rs/forge-std` and `forge test`. See `contracts/README.md`.

**Golden rule:** keep `type-check`, `test`, and `build` green on every PR.

---

## 6. Environment variables (reference)

All documented in `.env.local.example`. Groups:
- **Core:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (server-only), `CRON_SECRET`, `ANTHROPIC_API_KEY`,
  `NEXT_PUBLIC_APP_URL`.
- **Stripe:** publishable/secret/webhook + `STRIPE_PRO_MONTHLY_PRICE_ID`,
  `STRIPE_PRO_YEARLY_PRICE_ID` (server-only; yearly checkout is refused until set).
- **Crypto payments (NOWPayments):** `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`,
  `NOWPAYMENTS_API_URL`.
- **On-chain anchoring:** `ANCHOR_RPC_URL`, `ANCHOR_SIGNER_KEY` (server-only),
  `ANCHOR_CONTRACT_ADDRESS`, `ANCHOR_CHAIN_ID`, `ANCHOR_NETWORK` +
  `NEXT_PUBLIC_ANCHOR_*` for the browser verifier.
- **Live trading (off):** `NEXT_PUBLIC_LIVE_TRADING_ENABLED`,
  `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `ZEROX_API_KEY`, …
- **Telegram:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (server-only),
  `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (public bot handle for links).
- **Ops:** `ALERT_TELEGRAM_CHAT_ID` (optional admin alerts),
  `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (rate limits shared across
  instances; without them limits are not enforced).

> Secrets that must never be `NEXT_PUBLIC_*` or committed: service-role key,
> `ANCHOR_SIGNER_KEY` (a wallet private key), Stripe secret, NOWPayments keys,
> `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`.

---

## 7. Repo map (key paths)

- `src/services/ai/*`, `src/lib/horizons.ts`, `src/services/*signal*` — signal brain.
- `src/services/market-context.service.ts` — **server-safe** multi-timeframe context
  (use this in the bot).
- `src/services/analyst.service.ts` — shared analyst (the web route
  `src/app/api/ai/analyst/route.ts` and the Telegram bot both use it).
- `src/services/bot/*` — channel-agnostic bot core; `src/app/api/telegram/*`,
  `src/services/telegram/*`, `src/lib/telegram/*` — the Telegram channel.
- `src/lib/server/report-error.ts`, `src/lib/server/cron-monitor.ts`,
  `src/app/api/ops/*`, `src/app/api/health` — error reporting and cron health.
- `src/app/api/signals/evaluate/route.ts` — server signal finalization (cron).
- `src/app/api/anchor/*`, `src/lib/merkle.ts`, `src/app/verify/page.tsx`,
  `contracts/` — verifiable track record.
- `src/app/api/crypto/*`, `src/services/crypto-pay.service.ts` — NOWPayments.
- `src/components/web3/*`, `src/lib/web3/config.ts` — non-custodial trading (off).
- `supabase/migrations/*` — DB schema (apply in order).
- `docs/HANDOVER.md` — this file.

---

## 8. Suggested next sprint for the team

1. Make sure production env vars and all migrations are in place
   (`docs/DEPLOY_ENV_CHECKLIST.md`) and the bot webhook is registered.
2. Confirm the crons (§4.4) are firing and the track record grows daily.
3. Scheduled, personalised bot push (§4.1 step 7), respecting "don't spam".
4. Then: WhatsApp, mainnet anchoring, and (much later, with legal) live trading.

Everything in §3 is done and should be treated as stable infrastructure — build the
bot **on top of it**, don't rewrite it.
