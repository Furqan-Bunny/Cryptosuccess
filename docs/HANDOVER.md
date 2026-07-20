# CryptoSuccess — Project Handover & Roadmap

> **Read this first.** This document explains the product vision, what is already
> built, what remains, and exactly how to continue. It is written so a developer
> new to the project can pick up the next task without extra context.
>
> Last updated: 2026-07. Working branch: `supabase-migration`.

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
- **The bot (to build):** a Telegram bot that talks to this backend and delivers
  the "honest coach" experience. This is the missing piece.

---

## 3. ✅ What is COMPLETED

### 3.1 The web app (base product) — DONE
Signal generation, dashboard, market pages, paper-trading suite (spot/futures/
staking/DCA), Stripe subscriptions (Free vs Pro), Fear & Greed sentiment, signal
history + track record UI, tests + CI. This is the foundation the bot reuses.

### 3.2 Phase 0 — Signal immutability (foundation) — DONE, migrations applied
So the track record cannot be secretly edited.
- Hourly server cron `src/app/api/signals/evaluate/route.ts` finalizes signals
  (service-role, deterministic scorer `src/lib/signal-outcome.ts`).
- Migration `supabase/migrations/0004_signal_integrity.sql` makes the `signals`
  table **insert-only for clients** (only the server can finalize).

### 3.3 Phase 1 — Verifiable on-chain track record — **DONE & LIVE ON TESTNET** ✅
This is our trust backbone. **Fully working and verified end-to-end.**
- Daily Merkle root of finalized signals is anchored on-chain; anyone can verify a
  signal's inclusion **trustlessly** at `/verify`.
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

### 3.4 Phase 2 — Crypto payments (NOWPayments) — CODE DONE, NOT ACTIVATED
- `src/app/api/crypto/checkout/route.ts` (creates a NOWPayments invoice) and
  `src/app/api/crypto/webhook/route.ts` (HMAC-SHA512 IPN verification, idempotent
  Pro grant). Migration `0006_crypto_payments.sql`. "Pay with crypto" button on
  `src/app/pricing/page.tsx`.
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

### 3.6 Quality baseline (keep it green)
`npm run type-check` clean · `npm test` (97 tests) green · `npm run build` green ·
`npm run lint` runs (`.eslintrc.json` added). **Do not regress these.**

---

## 4. 🔨 What REMAINS (in priority order)

### 4.1 ⭐ PRIORITY: Telegram bot MVP — NOT STARTED
The actual product users will touch. Reuses the existing signal brain server-side.

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
proves the product. Design the bot logic to be channel-agnostic so WhatsApp reuses
the same signal + formatting layer.

### 4.3 Activate Phase 2 (crypto payments) — when going live
See §3.4 — just needs keys + a public URL + dashboard config.

### 4.4 Schedule the crons in production
`/api/signals/evaluate` (hourly) and `/api/anchor/run` (daily) must run on a
schedule. `vercel.json` has them, but Vercel Hobby crons run daily-only → use
Vercel Pro or an external scheduler (cron-job.org / QStash) hitting the endpoints
with `Authorization: Bearer <CRON_SECRET>`.

### 4.5 Move anchoring to mainnet — when ready
Deploy `TrackRecordAnchor.sol` to a mainnet L2 (e.g. Base), fund the signer, and
update the `ANCHOR_*` / `NEXT_PUBLIC_ANCHOR_*` env vars. Code needs no changes.

---

## 5. Developer setup (for a new dev)

1. `npm install`
2. Copy `.env.local.example` → `.env.local` and fill values (see §6). **Never
   commit `.env.local`** — it holds secrets (it is gitignored).
3. Apply Supabase migrations in order (`supabase/migrations/0001` → `0006`) via the
   Supabase SQL editor.
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
- **Stripe:** publishable/secret/webhook + price ids.
- **Crypto payments (NOWPayments):** `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`,
  `NOWPAYMENTS_API_URL`.
- **On-chain anchoring:** `ANCHOR_RPC_URL`, `ANCHOR_SIGNER_KEY` (server-only),
  `ANCHOR_CONTRACT_ADDRESS`, `ANCHOR_CHAIN_ID`, `ANCHOR_NETWORK` +
  `NEXT_PUBLIC_ANCHOR_*` for the browser verifier.
- **Live trading (off):** `NEXT_PUBLIC_LIVE_TRADING_ENABLED`,
  `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `ZEROX_API_KEY`, …
- **Telegram (to add):** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.

> Secrets that must never be `NEXT_PUBLIC_*` or committed: service-role key,
> `ANCHOR_SIGNER_KEY` (a wallet private key), Stripe secret, NOWPayments keys,
> `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`.

---

## 7. Repo map (key paths)

- `src/services/ai/*`, `src/lib/horizons.ts`, `src/services/*signal*` — signal brain.
- `src/services/market-context.service.ts` — **server-safe** multi-timeframe context
  (use this in the bot).
- `src/app/api/ai/analyst/route.ts` — Claude analyst (server-side signal reasoning).
- `src/app/api/signals/evaluate/route.ts` — server signal finalization (cron).
- `src/app/api/anchor/*`, `src/lib/merkle.ts`, `src/app/verify/page.tsx`,
  `contracts/` — verifiable track record.
- `src/app/api/crypto/*`, `src/services/crypto-pay.service.ts` — NOWPayments.
- `src/components/web3/*`, `src/lib/web3/config.ts` — non-custodial trading (off).
- `supabase/migrations/*` — DB schema (apply in order).
- `docs/HANDOVER.md` — this file.

---

## 8. Suggested first sprint for the team

1. Deploy the app to a public URL (Vercel) so webhooks work.
2. Build the **Telegram bot MVP** (§4.1) — the priority.
3. Wire Free/Pro limits + `/verify` hook into the bot.
4. Schedule the crons (§4.4) so evaluation + anchoring run automatically.
5. Only then: WhatsApp, crypto-payment activation, and (much later, with legal)
   live trading.

Everything in §3 is done and should be treated as stable infrastructure — build the
bot **on top of it**, don't rewrite it.
