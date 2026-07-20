// On-chain anchoring for the verifiable track record. Follows the same
// fail-safe/degrade-gracefully contract as rate-limit.ts: if the ANCHOR_* env
// vars are unset the feature NO-OPS (isAnchoringEnabled() === false), the cron
// still computes + stores Merkle roots off-chain, and a later configured run
// sends the transaction. Never throws into the caller — send failures return null
// so the day stays 'pending' and is retried.

import {
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  toBytes,
  defineChain,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RPC = process.env.ANCHOR_RPC_URL;
const KEY = process.env.ANCHOR_SIGNER_KEY;
const CONTRACT = process.env.ANCHOR_CONTRACT_ADDRESS;
const CHAIN_ID = process.env.ANCHOR_CHAIN_ID ? Number(process.env.ANCHOR_CHAIN_ID) : undefined;
export const ANCHOR_NETWORK = process.env.ANCHOR_NETWORK ?? 'unknown';

// Minimal ABI: owner-only anchor(day, root) + public roots(dayKey) getter.
export const ANCHOR_ABI = [
  {
    type: 'function',
    name: 'anchor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'dayKey', type: 'bytes32' },
      { name: 'root', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'roots',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const;

export function isAnchoringEnabled(): boolean {
  return !!(RPC && KEY && CONTRACT && CHAIN_ID);
}

export function contractAddress(): string | null {
  return CONTRACT ?? null;
}

// bytes32 key for a 'YYYY-MM-DD' day = keccak256 of its UTF-8 bytes. Identical on
// server (write) and client verifier (read).
export function anchorDayKey(day: string): Hex {
  return keccak256(toBytes(day));
}

function chain() {
  return defineChain({
    id: CHAIN_ID as number,
    name: ANCHOR_NETWORK,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC as string] } },
  });
}

// Submit anchor(dayKey, root) and wait for the receipt. Returns null on any
// failure (logged) so the caller keeps the day pending for the next run.
export async function sendAnchor(
  dayKey: Hex,
  root: Hex
): Promise<{ txHash: Hex; blockNumber: string } | null> {
  if (!isAnchoringEnabled()) return null;
  try {
    const account = privateKeyToAccount(KEY as Hex);
    const c = chain();
    const wallet = createWalletClient({ account, chain: c, transport: http(RPC) });
    const pub = createPublicClient({ chain: c, transport: http(RPC) });
    const hash = await wallet.writeContract({
      address: CONTRACT as Hex,
      abi: ANCHOR_ABI,
      functionName: 'anchor',
      args: [dayKey, root],
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    return { txHash: hash, blockNumber: receipt.blockNumber.toString() };
  } catch (e) {
    console.warn('anchor send failed (day stays pending, will retry):', e);
    return null;
  }
}
