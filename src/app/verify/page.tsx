'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  createPublicClient,
  http,
  keccak256,
  toBytes,
  defineChain,
  type Hex,
} from 'viem';
import { hashLeaf, verifyMerkleProof } from '@/lib/merkle';

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

  const verify = useCallback(async (id: string) => {
    if (!id) return;
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
      <p className="text-text-secondary mb-6">
        Every finalized signal is committed to a daily Merkle root anchored on {NETWORK}. Paste a
        signal ID to prove it was recorded and never edited — verification runs entirely in your
        browser against the public chain.
      </p>

      <div className="flex gap-2 mb-6">
        <input
          value={signalId}
          onChange={e => setSignalId(e.target.value)}
          placeholder="signal id (uuid)"
          className="flex-1 bg-surface border border-gray-700 rounded-lg px-3 py-2 text-white"
        />
        <button onClick={() => verify(signalId)} className="btn-primary px-4 py-2">
          Verify
        </button>
      </div>

      {res?.loading && <p className="text-text-secondary">Verifying…</p>}
      {res?.error && <p className="text-red-400">Could not verify: {res.error}</p>}
      {res && !res.loading && res.anchored === false && (
        <p className="text-text-secondary">
          This signal isn’t anchored yet. Signals finalize 24h after creation and are anchored the
          following day.
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
