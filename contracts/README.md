# TrackRecordAnchor — on-chain track-record anchoring

`TrackRecordAnchor.sol` is an immutable, owner-only registry of daily Merkle roots
for the CryptoSuccess signal track record. It **holds no funds**. Each UTC day can
be anchored exactly once; the root can never be changed, so a published win-rate
cannot be edited after the fact. Anyone can read `roots(dayKey)` to verify an
inclusion proof (see `/verify`).

## How it fits together
1. Hourly cron `/api/signals/evaluate` finalizes signals (server-authoritative,
   immutable — migration `0004`).
2. Daily cron `/api/anchor/run` builds a Merkle tree of each finalized day's
   signals (canonical leaves → `src/lib/merkle.ts`), stores it (migration `0005`),
   and calls `anchor(dayKey, root)`.
3. `/verify` recomputes the leaf hash, folds the proof to a root, and reads
   `roots(dayKey)` **directly from the chain** — trustless, no server involved.

`dayKey = keccak256(utf8("YYYY-MM-DD"))` — identical in `src/lib/server/anchor.ts`
and the verifier.

## Deploy (testnet first)
Install Foundry (https://book.getfoundry.sh), then from the repo root:

```bash
forge install foundry-rs/forge-std   # once
forge test                           # runs contracts/test/TrackRecordAnchor.t.sol
forge script contracts/script/Deploy.s.sol \
  --rpc-url $ANCHOR_RPC_URL --private-key $ANCHOR_SIGNER_KEY --broadcast
```

Then set the `ANCHOR_*` and `NEXT_PUBLIC_ANCHOR_*` env vars (see `.env.local.example`)
to the deployed address. Fund the signer wallet with a little test gas. Flip to a
mainnet L2 only after verifying the full flow on testnet.
