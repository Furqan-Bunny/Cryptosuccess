# CryptoSuccess

Cryptocurrency trading signals with a published track record, a Telegram coach, and on-chain
anchoring so past calls cannot be edited after the fact.

Live at **[cryptosuccess.vercel.app](https://cryptosuccess.vercel.app)**

## What it does

Most signal services are unfalsifiable. They show the wins, quietly drop the losses, and
nothing stops the record being rewritten later. This is built the other way round.

- **Signals for ETH, SOL and BNB** from TensorFlow.js models over live market data, with a
  rule-based fallback so the product still works when a model is unavailable.
- **An analyst layer** that reads each signal across multiple timeframes alongside live news,
  and states what it is unsure about instead of hiding it.
- **An anchored track record.** Every published call is hashed and written to a smart contract
  before the outcome is known, so the history can be verified rather than trusted.
- **A Telegram coach** that delivers signals and the reasoning behind them.
- **Subscriptions** through Stripe, plus crypto payments through NOWPayments.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router), React 18, TypeScript |
| Data and auth | Supabase (Postgres, Row Level Security, 8 migrations) |
| Signal models | TensorFlow.js |
| Analyst layer | Anthropic API |
| On-chain | Solidity, Foundry, viem + wagmi |
| Payments | Stripe, NOWPayments |
| Bot | Telegram Bot API |
| Market data | Binance, CoinGecko |
| UI | Tailwind CSS, Chart.js, Recharts, Zustand, React Query |
| Tests | Jest, React Testing Library |
| Deploy | Vercel |

## Layout

```
src/
  app/            Next.js routes, including the API handlers
  components/     UI, grouped by feature
  services/       Signals, analyst, market data, Telegram, payments
  lib/            Supabase clients and shared helpers
contracts/        TrackRecordAnchor.sol, Foundry tests, deploy script
supabase/
  migrations/     0001 to 0008, applied in order
scripts/          Model training and backtesting
tests/            Unit tests
docs/             Architecture and deployment notes
```

## Running it

Needs Node 18+ and a Supabase project.

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev
```

Apply the migrations in `supabase/migrations/` in order, or run the combined
`supabase/ALL_MIGRATIONS.sql` against a fresh database.

`.env.local.example` lists every variable the app reads and what each is for. Nothing in it
is a real credential.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run test` | Jest suite |
| `npm run type-check` | TypeScript, no emit |
| `npm run train:models` | Train the signal models |
| `npm run backtest` | Backtest the technical baseline |

`npm run backtest` measures the models on their own, without the analyst layer, so the
baseline stays honest.

## Notes on the design

**The model proposes, the rules dispose.** Anything deciding money or eligibility runs in a
rules engine outside the model. The analyst layer explains and contextualises; it does not
get the final say.

**Silence is the expensive failure.** A wrong signal gets noticed and argued with. A
scheduled job that quietly stops running does not, so those paths report when they did
nothing and why.

**The track record is anchored before the outcome is known.** A hash of each call goes
on-chain at publication time, which is the whole point: a record that can be checked instead
of a screenshot that has to be believed.

## Status

Deployed and running. The Telegram bot is live, the signal models and analyst layer are in
production, and the on-chain anchoring is deployed to testnet.

## License

MIT.
