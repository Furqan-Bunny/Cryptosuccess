# Quick Start - CryptoSuccess

Local setup on Supabase. The app no longer uses Firebase; anything in
`docs/archive/` that mentions Firestore or Cloud Functions is historical.

## 1. Prerequisites

- Node.js 18 or newer
- A Supabase project (the free tier is fine)
- Optional, per feature: a Stripe test account, an Anthropic API key, a Telegram bot
  token from @BotFather, a NOWPayments sandbox account, Foundry (only for the contract)

## 2. Install and configure

```bash
npm install
cp .env.local.example .env.local
```

Open `.env.local` and fill in at least the core values. Every variable is described in
`.env.local.example`.

| Needed for | Variables |
|---|---|
| Anything at all | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` |
| Server routes, quotas, crons | `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` |
| AI analyst and the bot | `ANTHROPIC_API_KEY` |
| Card payments | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` |
| Crypto payments | `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_API_URL` |
| Telegram bot | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` |
| On-chain anchoring | `ANCHOR_*` (server) and `NEXT_PUBLIC_ANCHOR_*` (browser verifier) |

Rules that matter:

- `.env.local` holds secrets and is gitignored. Never commit it and never paste its values
  into issues or chat.
- Never put a secret in a `NEXT_PUBLIC_*` variable; those are shipped to the browser. The
  service-role key, `ANCHOR_SIGNER_KEY`, Stripe secret, NOWPayments keys, `CRON_SECRET` and
  `TELEGRAM_BOT_TOKEN` are server-only.

## 3. Create the database

In the Supabase dashboard open **SQL Editor** and run every file in
`supabase/migrations/` in numeric order (`0001_...`, `0002_...`, and so on). On a fresh
project you can instead run the generated `supabase/ALL_MIGRATIONS.sql` once.

Several server routes fail closed until their migration exists (for example the analyst
quota needs `consume_signal` from `0003`, and the bot needs the Telegram functions from
`0007` and `0008`), so do not skip any.

## 4. Configure Supabase Auth

In **Authentication**:

1. **URL Configuration:** set the Site URL to `http://localhost:3000` and add
   `http://localhost:3000/auth/callback` to the redirect URLs.
2. **Providers:** Email is on by default. To enable Google sign-in, create an OAuth client
   in Google Cloud, then paste its client ID and secret into the Google provider in
   Supabase.
3. If email confirmation is on, new users must click the confirmation link before they can
   sign in.

## 5. Run it

```bash
npm run dev
```

Open http://localhost:3000, register, and you land on the dashboard. A new account is on
the Free plan (5 signals per UTC day).

## 6. Optional features

### Stripe (test mode)

1. Create a recurring Pro price in the Stripe dashboard and put its ID in
   `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID`.
2. Forward webhooks locally with the Stripe CLI:
   `stripe listen --forward-to localhost:3000/api/stripe/webhook`, and copy the signing
   secret it prints into `STRIPE_WEBHOOK_SECRET`.
3. Subscribe from `/pricing` with a Stripe test card. The webhook activates Pro and
   `/subscription/success` confirms it.

### Crypto payments (NOWPayments sandbox)

Set `NOWPAYMENTS_API_URL=https://api-sandbox.nowpayments.io/v1` plus the sandbox keys.
NOWPayments must be able to reach `<NEXT_PUBLIC_APP_URL>/api/crypto/webhook`, so this needs
a public URL (a deployment or a tunnel). Crypto payments are one-time and grant Pro for a
fixed month or year.

### Telegram bot

The bot needs a public HTTPS URL. With the app deployed (or exposed through a tunnel) and
`NEXT_PUBLIC_APP_URL` pointing at it, register the webhook:

```bash
npx tsx scripts/set-telegram-webhook.ts
```

Then message the bot `/start`. Link it to a web account from **Settings** in the app.
`docs/DEPLOY_ENV_CHECKLIST.md` has the production checklist.

### Crons

Scheduled routes are listed in `vercel.json` (signal evaluation, anchoring, the paper
trading engine, DCA, staking refresh, discovery scan and the daily brief). Locally you can
trigger one by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/signals/evaluate
```

In production these routes refuse requests when `CRON_SECRET` is unset.

### On-chain anchoring

Deploy `contracts/TrackRecordAnchor.sol` to a testnet with Foundry (see
`contracts/README.md`), then set the `ANCHOR_*` and `NEXT_PUBLIC_ANCHOR_*` variables. Without
them the anchor cron still builds and stores daily Merkle roots, and `/verify` checks the
off-chain proof but skips the on-chain read.

## 7. Checks before you open a PR

```bash
npm run type-check
npm test
npm run lint
npm run build
```

## Troubleshooting

**`Invalid supabaseUrl` during build or at runtime.** `NEXT_PUBLIC_SUPABASE_URL` is missing
or a placeholder. Set the real project URL and restart the dev server.

**Sign-in redirects fail.** The redirect URL `http://localhost:3000/auth/callback` is not in
Supabase's allowed list.

**"Signal limit reached" or the analyst refuses every request.** The quota functions from
migration `0003` are missing, or `SUPABASE_SERVICE_ROLE_KEY` is not set.

**The bot replies that the backend is still being set up.** Supabase or Anthropic env vars
are missing on that deployment, or migrations `0007` and `0008` were not applied.

**Cron routes return 401.** Send `Authorization: Bearer <CRON_SECRET>` with the exact value
configured on the server.

## Further reading

- [README.md](README.md) - what the product is and how the track record works
- [docs/HANDOVER.md](docs/HANDOVER.md) - status, roadmap and operations
- [docs/DEPLOY_ENV_CHECKLIST.md](docs/DEPLOY_ENV_CHECKLIST.md) - production environment
