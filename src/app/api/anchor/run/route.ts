import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { withCronMonitoring } from '@/lib/server/cron-monitor';
import { reportError } from '@/lib/server/report-error';
import { hashLeaf, computeMerkleRoot } from '@/lib/merkle';
import { canonicalizeLeaf, LeafFields } from '@/lib/track-record-leaf';
import {
  isAnchoringEnabled,
  sendAnchor,
  anchorDayKey,
  contractAddress,
  ANCHOR_NETWORK,
} from '@/lib/server/anchor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_DAYS_PER_RUN = 5; // bound work; backfill catches up over subsequent runs

// Signals outlive account deletion with user_id set to NULL (migration 0012).
// The leaf format is frozen with a string userId, so a signal whose account was
// deleted before it was anchored carries this fixed placeholder instead.
const DELETED_ACCOUNT_ID = '00000000-0000-0000-0000-000000000000';

type LeafRow = {
  id: string;
  user_id: string | null;
  symbol: string;
  action: string;
  confidence: string | null;
  entry_price: string | null;
  target_price: string | null;
  stop_loss: string | null;
  outcome: string;
  profit_loss_percent: string | null;
  created_at: string;
  evaluated_at: string | null;
};

function toLeafFields(r: LeafRow): LeafFields {
  return {
    id: r.id,
    userId: r.user_id ?? DELETED_ACCOUNT_ID,
    symbol: r.symbol,
    action: r.action,
    confidence: r.confidence,
    entryPrice: r.entry_price,
    targetPrice: r.target_price,
    stopLoss: r.stop_loss,
    outcome: r.outcome,
    profitLossPercent: r.profit_loss_percent,
    createdAt: r.created_at,
    evaluatedAt: r.evaluated_at,
  };
}

// Build + store a day's Merkle tree (idempotent per day via the unanchored-days
// filter), then submit any still-pending days on-chain when configured.
async function handler(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  return withCronMonitoring('anchor-run', async () => {
    const db = createServiceClient();

    // 1) Compute + store roots for past days that have finalized signals and no
    //    anchor row yet. This happens even when chain config is absent, so the
    //    off-chain root exists and can be submitted later.
    const { data: dayRows, error: daysErr } = await db.rpc('unanchored_signal_days');
    if (daysErr) throw new Error(daysErr.message);
    const days: string[] = (dayRows ?? []).map((d: { day: string }) => d.day).slice(0, MAX_DAYS_PER_RUN);

    let built = 0;
    for (const day of days) {
      const { data: rows, error: leavesErr } = await db.rpc('finalized_signal_leaves', { p_day: day });
      if (leavesErr) throw new Error(leavesErr.message);
      const leaves = (rows ?? []) as LeafRow[];
      if (leaves.length === 0) continue;

      const canon = leaves.map(r => canonicalizeLeaf(toLeafFields(r)));
      const leafHashes = canon.map(hashLeaf);
      const root = computeMerkleRoot(leafHashes);

      const { error: aErr } = await db.from('signal_anchors').insert({
        day,
        merkle_root: root,
        leaf_count: leaves.length,
        network: ANCHOR_NETWORK,
        contract_address: contractAddress(),
        status: 'pending',
      });
      if (aErr) {
        // Unique-violation → another run already built this day; skip it.
        if ((aErr as { code?: string }).code === '23505') continue;
        throw new Error(aErr.message);
      }

      const leafInserts = leaves.map((r, i) => ({
        signal_id: r.id,
        anchor_day: day,
        leaf_index: i,
        leaf_hash: leafHashes[i],
        canonical: canon[i],
      }));
      const { error: lErr } = await db.from('signal_leaves').insert(leafInserts);
      if (lErr) {
        // Roll back the anchor row (FK cascade removes any partial leaves) so the
        // day has no anchor marker and is retried cleanly next run — never a
        // "committed" day with a missing/partial tree.
        await db.from('signal_anchors').delete().eq('day', day);
        throw new Error(lErr.message);
      }
      built += 1;
    }

    // 2) Submit pending days on-chain (if configured). Off-chain-only otherwise.
    let anchored = 0;
    let sendFailures = 0;
    if (isAnchoringEnabled()) {
      const { data: pending, error: pendingErr } = await db
        .from('signal_anchors')
        .select('day, merkle_root')
        .eq('status', 'pending')
        .is('tx_hash', null)
        .order('day', { ascending: true })
        .limit(MAX_DAYS_PER_RUN);
      if (pendingErr) throw new Error(pendingErr.message);

      for (const a of pending ?? []) {
        const res = await sendAnchor(anchorDayKey(a.day), a.merkle_root as `0x${string}`);
        if (!res) {
          // Send failed → stays pending, retried next run. Recorded (no alert per
          // day) so a chain/RPC outage is visible in error_events.
          sendFailures += 1;
          continue;
        }
        const { error: confirmErr } = await db
          .from('signal_anchors')
          .update({ tx_hash: res.txHash, block_number: Number(res.blockNumber), status: 'confirmed' })
          .eq('day', a.day);
        if (confirmErr) {
          // The root IS on-chain but the row still says pending — the next run
          // would re-send it. Alert so the row can be reconciled by hand.
          await reportError('cron.anchor-run.confirm', confirmErr, {
            route: '/api/anchor/run',
            day: a.day,
            blockNumber: res.blockNumber,
          });
          continue;
        }
        anchored += 1;
      }
      if (sendFailures > 0) {
        await reportError('cron.anchor-run.send', new Error(`${sendFailures} anchor transaction(s) failed; days stay pending`), {
          route: '/api/anchor/run',
          level: 'warn',
          alert: false,
          sendFailures,
        });
      }
    }

    return NextResponse.json({ ok: true, built, anchored, sendFailures, chain: isAnchoringEnabled() });
  });
}

export async function GET(request: NextRequest) {
  return handler(request);
}
export async function POST(request: NextRequest) {
  return handler(request);
}
