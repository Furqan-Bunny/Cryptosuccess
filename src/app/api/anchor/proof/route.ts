import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { computeMerkleProof, isCompleteLeafSet } from '@/lib/merkle';
import { anchorDayKey } from '@/lib/server/anchor';
import { rateLimit, clientIp } from '@/lib/server/rate-limit';
import { isUuid } from '@/lib/uuid';

export const dynamic = 'force-dynamic';

// PostgREST caps a response at 1000 rows, so a busy day's leaves are read in
// pages; a truncated set would make every proof for that day fail.
const LEAF_PAGE = 1000;

async function loadDayLeaves(
  db: ReturnType<typeof createServiceClient>,
  day: string
): Promise<Array<{ leaf_index: number; leaf_hash: string }> | null> {
  const out: Array<{ leaf_index: number; leaf_hash: string }> = [];
  for (let from = 0; ; from += LEAF_PAGE) {
    const { data, error } = await db
      .from('signal_leaves')
      .select('leaf_index, leaf_hash')
      .eq('anchor_day', day)
      .order('leaf_index', { ascending: true })
      .range(from, from + LEAF_PAGE - 1);
    if (error || !data) return null;
    out.push(...(data as Array<{ leaf_index: number; leaf_hash: string }>));
    if (data.length < LEAF_PAGE) return out;
  }
}

// Public inclusion-proof endpoint: given a signalId, return everything the
// browser needs to verify (trustlessly) that the signal is in that day's anchored
// Merkle tree — the canonical leaf, its hash, the sibling proof, the day key, and
// the stored root/tx. The client re-hashes the canonical string, folds the proof
// to a root, and compares that root to the one read directly from the chain.
export async function GET(request: NextRequest) {
  // Cheap read; light per-IP cap as an abuse backstop (fails open).
  const rl = await rateLimit('anchor-proof', clientIp(request.headers), 60, 60);
  if (!rl.ok) {
    return NextResponse.json({ available: false, reason: 'rate_limited' }, { status: 429 });
  }

  const signalId = request.nextUrl.searchParams.get('signalId');
  // Signal ids are UUIDs; reject anything else before it reaches a query.
  if (!isUuid(signalId)) {
    return NextResponse.json({ available: false, reason: 'bad_request' }, { status: 400 });
  }

  try {
    const db = createServiceClient();

    const { data: leaf, error: leafErr } = await db
      .from('signal_leaves')
      .select('anchor_day, leaf_index, leaf_hash, canonical')
      .eq('signal_id', signalId)
      .maybeSingle();
    if (leafErr) throw leafErr;

    if (!leaf) {
      // Not yet anchored (finalizes 24h+ after creation, anchored next day).
      return NextResponse.json({ available: true, anchored: false, reason: 'not_anchored' });
    }

    const [{ data: anchor }, dayLeaves] = await Promise.all([
      db
        .from('signal_anchors')
        .select('merkle_root, leaf_count, tx_hash, block_number, contract_address, network, status')
        .eq('day', leaf.anchor_day)
        .maybeSingle(),
      loadDayLeaves(db, leaf.anchor_day),
    ]);

    if (!anchor || !dayLeaves) {
      return NextResponse.json({ available: false, reason: 'anchor_missing' }, { status: 500 });
    }

    // The proof is only valid against the FULL tree that was anchored. If any
    // leaf of that day is missing (or out of place) a proof built from what is
    // left would silently fail against the on-chain root, so refuse instead.
    if (!isCompleteLeafSet(dayLeaves, anchor.leaf_count)) {
      console.error(`Anchor proof: leaf set for ${leaf.anchor_day} is incomplete`);
      return NextResponse.json({ available: false, reason: 'tree_incomplete' }, { status: 500 });
    }

    const hashes = dayLeaves.map(l => l.leaf_hash as `0x${string}`);
    const proof = computeMerkleProof(hashes, leaf.leaf_index);

    return NextResponse.json({
      available: true,
      anchored: true,
      signalId,
      day: leaf.anchor_day,
      dayKey: anchorDayKey(leaf.anchor_day),
      leafIndex: leaf.leaf_index,
      leafHash: leaf.leaf_hash,
      canonical: leaf.canonical,
      proof,
      merkleRoot: anchor.merkle_root,
      status: anchor.status,
      txHash: anchor.tx_hash,
      blockNumber: anchor.block_number,
      contractAddress: anchor.contract_address,
      network: anchor.network,
    });
  } catch (error) {
    console.error('Anchor proof error:', error);
    return NextResponse.json({ available: false, reason: 'error' }, { status: 500 });
  }
}
