'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  createPublicClient,
  http,
  keccak256,
  toBytes,
  defineChain,
  type Hex,
} from 'viem';
import { hashLeaf, verifyMerkleProof } from '@/lib/merkle';
import { UUID_RE } from '@/lib/uuid';

// Public client-side config (safe to expose). When unset, on-chain verification
// is skipped and only the off-chain proof (leaf → root) is checked.
const RPC = process.env.NEXT_PUBLIC_ANCHOR_RPC_URL;
const CHAIN_ID = process.env.NEXT_PUBLIC_ANCHOR_CHAIN_ID
  ? Number(process.env.NEXT_PUBLIC_ANCHOR_CHAIN_ID)
  : undefined;
const CONTRACT = process.env.NEXT_PUBLIC_ANCHOR_CONTRACT_ADDRESS;
const EXPLORER = process.env.NEXT_PUBLIC_ANCHOR_EXPLORER_URL;
const NETWORK = process.env.NEXT_PUBLIC_ANCHOR_NETWORK ?? 'testnet';

const ROOTS_ABI = [
  {
    type: 'function',
    name: 'roots',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const;

type Check = 'pending' | 'pass' | 'fail' | 'skip';

// Signal IDs are UUIDs. Checked client-side only to give a helpful message before
// making a request; it is not part of the verification itself.

// Plain-language versions of the proof endpoint's failure reasons.
const REASON_TEXT: Record<string, string> = {
  invalid_id: 'That does not look like a signal ID. Signal IDs look like 3f1c2a9e-1b2c-4d5e-8f90-123456789abc.',
  bad_request: 'Please enter a signal ID.',
  rate_limited: 'Too many checks in a short time. Please wait a minute and try again.',
  anchor_missing: 'This signal has a recorded leaf but its daily anchor could not be loaded. Please try again later.',
  error: 'Something went wrong while fetching the proof. Please try again.',
};

function reasonText(reason: string): string {
  return REASON_TEXT[reason] ?? REASON_TEXT.error;
}

interface Result {
  loading: boolean;
  error?: string;
  anchored?: boolean;
  canonical?: string;
  day?: string;
  txHash?: string | null;
  leafMatch?: Check; // keccak(canonical) === stored leafHash
  proofMatch?: Check; // proof folds to stored root
  chainMatch?: Check; // on-chain roots(dayKey) === stored root
}

function badge(c: Check | undefined) {
  if (c === 'pass') return <span className="text-green-400">✓ verified</span>;
  if (c === 'fail') return <span className="text-red-400">✗ failed</span>;
  if (c === 'skip') return <span className="text-text-secondary">— skipped</span>;
  return <span className="text-text-secondary">…</span>;
}

function VerifyInner() {
  const params = useSearchParams();
  const [signalId, setSignalId] = useState(params?.get('signalId') ?? '');
  const [res, setRes] = useState<Result | null>(null);

  const verify = useCallback(async (rawId: string) => {
    const id = rawId.trim();
    if (!id) return;
    if (!UUID_RE.test(id)) {
      setRes({ loading: false, error: 'invalid_id' });
      return;
    }
    setRes({ loading: true });
    try {
      const resp = await fetch(`/api/anchor/proof?signalId=${encodeURIComponent(id)}`);
      const data = await resp.json();
      if (!data.available) {
        setRes({ loading: false, error: data.reason ?? 'unavailable' });
        return;
      }
      if (!data.anchored) {
        setRes({ loading: false, anchored: false });
        return;
      }

      // 1) Leaf integrity: re-hash the canonical string, compare to stored hash.
      const recomputed = hashLeaf(data.canonical);
      const leafMatch: Check =
        recomputed.toLowerCase() === String(data.leafHash).toLowerCase() ? 'pass' : 'fail';

      // 2) Inclusion: fold the proof from the leaf up to the stored root.
      const proofMatch: Check = verifyMerkleProof(
        recomputed,
        data.proof as Hex[],
        data.merkleRoot as Hex
      )
        ? 'pass'
        : 'fail';

      // 3) On-chain: read roots(dayKey) directly from the chain and compare. This
      //    is the trustless step — it does not rely on our server.
      let chainMatch: Check = 'skip';
      if (RPC && CHAIN_ID && CONTRACT) {
        try {
          const dayKey = keccak256(toBytes(data.day)); // recompute, don't trust server
          const pub = createPublicClient({
            chain: defineChain({
              id: CHAIN_ID,
              name: NETWORK,
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: { default: { http: [RPC] } },
            }),
            transport: http(RPC),
          });
          const onchain = (await pub.readContract({
            address: CONTRACT as Hex,
            abi: ROOTS_ABI,
            functionName: 'roots',
            args: [dayKey],
          })) as Hex;
          chainMatch =
            onchain.toLowerCase() === String(data.merkleRoot).toLowerCase() ? 'pass' : 'fail';
        } catch {
          chainMatch = 'skip'; // RPC unreachable — off-chain proof still stands
        }
      }

      setRes({
        loading: false,
        anchored: true,
        canonical: data.canonical,
        day: data.day,
        txHash: data.txHash,
        leafMatch,
        proofMatch,
        chainMatch,
      });
    } catch {
      setRes({ loading: false, error: 'error' });
    }
  }, []);

  useEffect(() => {
    const id = params?.get('signalId');
    if (id) verify(id);
  }, [params, verify]);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold text-white mb-2">Verify a signal on-chain</h1>
      <p className="text-text-secondary mb-4">
        Once a signal is at least 24 hours old our server scores it against a single price check
        (moves before that check are not counted). Each day&apos;s scored
        results are hashed into a Merkle tree and its root is written to a smart contract on{' '}
        {NETWORK}. Paste a signal ID to check that its scored result was included and has not been
        edited since. The hashing and proof checks run in your browser, and the final step reads
        the root straight from the public chain, so you do not have to take our word for it.
      </p>
      <p className="text-text-secondary text-sm mb-6">
        Signed in? Use the verify link next to any finalized signal in your signal history. Losing
        signals are anchored exactly like winning ones.{' '}
        <Link href="/#track-record" className="text-primary hover:text-primary-light">
          How the record works
        </Link>
      </p>

      <form
        className="flex gap-2 mb-6"
        onSubmit={e => {
          e.preventDefault();
          verify(signalId);
        }}
      >
        <label htmlFor="signal-id" className="sr-only">Signal ID</label>
        <input
          id="signal-id"
          value={signalId}
          onChange={e => setSignalId(e.target.value)}
          placeholder="Signal ID, e.g. 3f1c2a9e-1b2c-4d5e-8f90-123456789abc"
          autoComplete="off"
          spellCheck={false}
          maxLength={64}
          className="flex-1 min-w-0 bg-surface border border-gray-700 rounded-lg px-3 py-2 text-white"
        />
        <button
          type="submit"
          disabled={!signalId.trim() || res?.loading}
          className="btn-primary px-4 py-2"
        >
          Verify
        </button>
      </form>

      {res?.loading && <p className="text-text-secondary">Verifying…</p>}
      {res?.error && <p className="text-red-400">Could not verify: {reasonText(res.error)}</p>}
      {res && !res.loading && res.anchored === false && (
        <p className="text-text-secondary">
          This signal isn&apos;t anchored yet. Signals are scored once they are 24 hours old, and
          each day&apos;s scored results are anchored after that day ends (UTC). Check back
          tomorrow. If the ID is wrong, no signal will ever show up here.
        </p>
      )}

      {res && !res.loading && res.anchored && (
        <div className="card p-6 space-y-3">
          <div className="flex justify-between">
            <span className="text-text-secondary">Leaf integrity (hash matches)</span>
            {badge(res.leafMatch)}
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Merkle inclusion (proof → root)</span>
            {badge(res.proofMatch)}
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">On-chain root ({NETWORK})</span>
            {badge(res.chainMatch)}
          </div>
          {res.chainMatch === 'fail' && !res.txHash && (
            <p className="text-xs text-text-secondary">
              No anchoring transaction has been recorded for this day yet, so its root is not on
              the chain yet. The off-chain inclusion proof above still holds; check back after the
              next daily anchor run.
            </p>
          )}
          {res.chainMatch === 'skip' && (
            <p className="text-xs text-text-secondary">
              On-chain read skipped (public RPC not configured or unreachable). The off-chain
              inclusion proof above still holds.
            </p>
          )}
          {res.txHash && EXPLORER && (
            <a
              href={`${EXPLORER}/tx/${res.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-light text-sm"
            >
              View anchoring transaction ↗
            </a>
          )}
          <div>
            <p className="text-xs text-text-secondary mb-1">Anchored record ({res.day}):</p>
            <pre className="text-xs bg-background rounded-lg p-3 overflow-x-auto text-text-secondary">
              {res.canonical}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="p-6 text-text-secondary">Loading…</div>}>
      <VerifyInner />
    </Suspense>
  );
}
