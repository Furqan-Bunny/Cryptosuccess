# CryptoSuccess

An honest crypto trading coach: risk-first signals, a Telegram bot, and a scored
track record anchored on-chain so past results cannot be quietly edited.

Live at **[cryptosuccess.vercel.app](https://cryptosuccess.vercel.app)**

## What it does

Most signal services are unfalsifiable. They show the wins, quietly drop the losses, and
nothing stops the record being rewritten later. This is built the other way round.

- **Signals across the 50 coins in `src/lib/coins.ts`.** TensorFlow.js models (1h / 4h / 1d)
  run in the browser over live Binance market data, with a rule-based technical engine as
  the fallback when a model is unavailable. Every buy or sell call has an entry, a target
  and a stop-loss, plus position-sizing guidance.
- **An analyst layer** (Anthropic API, server-side) that reads a coin across several
  timeframes alongside a short live-news summary, gives a short-term and a long-term read,
  and says plainly when the setup is weak and the better move is to stay out.
- **A scored, anchored track record.** Signals are scored by the server and the finalized
  results are anchored on-chain daily, so anyone can check that a result has not been
  changed since. Details below.
- **A Telegram coach** (`/signal`, `/verify`, `/link`, `/risk`, `/coins`, `/alerts`,
  `/settings`, `/subscribe`, `/help`) that uses the same analyst server-side. Calls from a
  linked account (with usable levels) enter the same track record, and users are told how each
  call turned out. Reads in unlinked chats are not recorded.
- **Paper trading** (spot, futures, staking, DCA) with simulated funds only.
- **Subscriptions** through Stripe (monthly or yearly, renewing) and one-time crypto
  payments through NOWPayments (a fixed month or year, not renewing).

## How the track record works

This is the pipeline as it is implemented, not as an aspiration:

1. **A signal is saved** to the `signals` table with its entry, target and stop. Only the
   server writes it (migration `0009`): `POST /api/signals/record` checks the levels,
   re-prices the entry against live spot and uses the server's clock, and nobody can
   update a row (migration `0004`).
2. **The server scores it after 24 hours.** The `/api/signals/evaluate` cron picks up
   pending signals that are at least 24 hours old, prices them with the current Binance spot
   price and records the outcome with the shared deterministic scorer
   (`src/lib/signal-outcome.ts`): target hit, stop hit, or expired in profit or loss.
3. **Finalized results are anchored daily.** The `/api/anchor/run` cron takes each completed
   UTC day of finalized results, serialises every result into a canonical leaf
   (`src/lib/track-record-leaf.ts`), builds a Merkle tree (`src/lib/merkle.ts`) and writes the
   root to `contracts/TrackRecordAnchor.sol`. Each day can be anchored only once.
4. **Anyone can verify** at `/verify`: the browser re-hashes the canonical record, folds the
   inclusion proof up to the root, and reads `roots(dayKey)` directly from the chain.

What this does and does not prove:

- It proves a scored result was included in that day's anchor and has not been changed or
  removed since. Losses are anchored exactly like wins.
- Anchoring happens **after** scoring, not at the moment a signal is published. A signal
  inside its 24-hour window is not anchored yet.
- Anchoring currently runs on **Base Sepolia (testnet)**. Moving to a mainnet L2 is an env
  change only (see `docs/HANDOVER.md`).

## Honest numbers

From `public/backtest-results.json` (written by `npm run backtest` and `npm run train:models`):

- Technical engine, walk-forward on 1h candles for BTC, ETH, SOL and BNB, 5% target / 2%
  stop / 24h horizon: **43.1%** win rate over 3,210 trades.
- Prediction models, directional accuracy on time-held-out data across 20 coins: **41.1%**
  (1h), **43.1%** (4h), **47.2%** (1d).

Backtests ignore fees and overlapping trades. They are a baseline, not a forecast, and they
are the reason the product leads with risk management rather than accuracy claims.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router), React 18, TypeScript (strict) |
| Data and auth | Supabase (Postgres, Auth, Row Level Security) |
| Signal models | TensorFlow.js in the browser, rule-based fallback |
| Analyst layer | Anthropic API, server-side, with a database cache |
| On-chain | Solidity, Foundry, viem |
| Payments | Stripe, NOWPayments |
| Bot | Telegram Bot API |
| Market data | Binance, CoinGecko, DefiLlama (staking APYs), alternative.me (Fear and Greed) |
| Rate limiting | Upstash Redis (REST) |
| UI | Tailwind CSS, Chart.js, Recharts, Zustand, React Query |
| Tests | Jest, React Testing Library |
| Deploy | Vercel (hosting and crons) |

## Layout

```
src/
  app/            Next.js routes, including the API handlers and crons
  components/     UI, grouped by feature
  services/       Signals, analyst, market data, Telegram, payments, paper-trading engine
  lib/            Supabase clients, coin catalogue, Merkle and leaf code, server helpers
contracts/        TrackRecordAnchor.sol, Foundry tests, deploy script
supabase/
  migrations/     Numbered SQL migrations, applied in order
  ALL_MIGRATIONS.sql  Generated concatenation of every migration
scripts/          Model training, backtesting, Telegram webhook helper
tests/            Unit and integration tests
docs/             Handover, deployment notes; docs/archive holds Firebase-era history
```

## Running it

Needs Node 18+ and a Supabase project. See [QUICKSTART.md](QUICKSTART.md) for the full
walkthrough.

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev
```

Apply every file in `supabase/migrations/` in numeric order in the Supabase SQL editor,
or run the generated `supabase/ALL_MIGRATIONS.sql` against a fresh database.

`.env.local.example` lists every variable the app reads and what each is for. Nothing in it
is a real credential. Never commit `.env.local`.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Jest suite |
| `npm run type-check` | TypeScript, no emit |
| `npm run lint` | ESLint (Next.js config) |
| `npm run train:models` | Train the 1h / 4h / 1d models and record held-out accuracy |
| `npm run backtest` | Backtest the technical engine |

`npm run backtest` measures the technical engine on its own, without the analyst layer, so
the baseline stays honest.

## Notes on the design

**The model proposes, the rules dispose.** Anything deciding money or eligibility (quotas,
plan status, scoring) runs in server code and Postgres functions, not in a model. The
analyst layer explains and contextualises; it does not get the final say.

**Fail closed where it matters.** Quota checks, cron authorisation and webhook signatures
deny by default when configuration is missing.

**The record is scored by the server, then anchored.** Clients cannot edit signals, the
server scores them with one deterministic function, and the finalized results are anchored
daily. The anchor makes later edits detectable by anyone, without trusting us.

## Status

- Web app, Supabase backend and Stripe subscriptions: built.
- Telegram bot: built (on-demand `/signal`, account linking, shared daily quota, rate
  limits, risk and coin preferences, daily alerts for Pro, outcome follow-ups).
- Monitoring: scrubbed error log, recorded cron runs, `/api/ops/status` and optional
  Telegram admin alerts.
- On-chain anchoring: built and running on Base Sepolia testnet; mainnet not yet.
- Prediction models run in the browser; the bot and the analyst run server-side.
- Crypto payments through NOWPayments: built, activated per deployment once keys are set.
- Live (non-custodial) trading: built behind a flag and off by default; needs legal review
  before any mainnet use.

See [docs/HANDOVER.md](docs/HANDOVER.md) for the detailed status and roadmap.

## Disclaimer

Nothing here is financial advice. Crypto is highly volatile and signals are often wrong. See
the in-app `/disclaimer` page.

## License

MIT.
