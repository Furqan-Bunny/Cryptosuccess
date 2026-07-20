// Canonical serialization of a finalized signal into a Merkle leaf string.
//
// This is the frozen contract that BOTH the server anchor job and the trustless
// client verifier use, so a leaf hashes identically on either side. Determinism
// rules (do not change without bumping LEAF_VERSION):
//   - Fixed key order (object literal insertion order → JSON.stringify order).
//   - Numerics are passed as their Postgres `numeric` TEXT form (queried via
//     `::text`) — never JS floats — so there is no IEEE-754 round-trip drift.
//   - Nulls are explicit; timestamps are the raw ISO-8601 strings from Postgres.

export const LEAF_VERSION = 1;

export interface LeafFields {
  id: string;
  userId: string;
  symbol: string;
  action: string;
  confidence: string | null;
  entryPrice: string | null;
  targetPrice: string | null;
  stopLoss: string | null;
  outcome: string;
  profitLossPercent: string | null;
  createdAt: string;
  evaluatedAt: string | null;
}

// Deterministic, whitespace-free JSON with a fixed field order.
export function canonicalizeLeaf(f: LeafFields): string {
  return JSON.stringify({
    v: LEAF_VERSION,
    id: f.id,
    userId: f.userId,
    symbol: f.symbol,
    action: f.action,
    confidence: f.confidence ?? null,
    entryPrice: f.entryPrice ?? null,
    targetPrice: f.targetPrice ?? null,
    stopLoss: f.stopLoss ?? null,
    outcome: f.outcome,
    profitLossPercent: f.profitLossPercent ?? null,
    createdAt: f.createdAt,
    evaluatedAt: f.evaluatedAt ?? null,
  });
}
