// Public track-record summary served by GET /api/track-record and shown on
// /verify. Pure, so the shaping and the honesty rules are unit-tested:
//   • only aggregate counts and anchor metadata are exposed — no signal ids or
//     user ids (a canonical leaf carries the owner's random id);
//   • the win rate uses the app's rule (BUY/SELL only, HOLD excluded) and is
//     flagged as a small sample until enough calls have been scored.

/** Below this many scored BUY/SELL calls, a win rate says little. */
export const MIN_SAMPLE_FOR_WIN_RATE = 30;
/** How many recent anchored days the summary lists. */
export const RECENT_ANCHOR_DAYS = 14;

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface SummaryRow {
  anchored_days: unknown;
  confirmed_days: unknown;
  anchored_signals: unknown;
  directional: unknown;
  wins: unknown;
  losses: unknown;
  first_day: unknown;
  last_day: unknown;
}

export interface AnchorRow {
  day: unknown;
  leaf_count: unknown;
  status: unknown;
  tx_hash: unknown;
}

export interface AnchoredDay {
  day: string;
  leafCount: number;
  /** True only when the root is confirmed in a recorded transaction. */
  onChain: boolean;
  txHash: string | null;
}

export interface TrackRecordSummary {
  anchoredDays: number;
  confirmedDays: number;
  anchoredSignals: number;
  directional: number;
  wins: number;
  losses: number;
  /** wins / (wins + losses) as a percentage, or null when nothing is scored. */
  winRate: number | null;
  smallSample: boolean;
  firstDay: string | null;
  lastDay: string | null;
  recent: AnchoredDay[];
}

function count(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function day(v: unknown): string | null {
  return typeof v === 'string' && DAY_RE.test(v) ? v : null;
}

export function toTrackRecordSummary(row: SummaryRow | null | undefined, anchors: readonly AnchorRow[]): TrackRecordSummary {
  const wins = count(row?.wins);
  const losses = count(row?.losses);
  const decided = wins + losses;
  const recent: AnchoredDay[] = [];
  for (const a of anchors.slice(0, RECENT_ANCHOR_DAYS)) {
    const d = day(a.day);
    if (!d) continue;
    const txHash = typeof a.tx_hash === 'string' && TX_HASH_RE.test(a.tx_hash) ? a.tx_hash : null;
    recent.push({ day: d, leafCount: count(a.leaf_count), onChain: a.status === 'confirmed' && txHash != null, txHash });
  }
  return {
    anchoredDays: count(row?.anchored_days),
    confirmedDays: count(row?.confirmed_days),
    anchoredSignals: count(row?.anchored_signals),
    directional: count(row?.directional),
    wins,
    losses,
    winRate: decided > 0 ? (wins / decided) * 100 : null,
    smallSample: decided < MIN_SAMPLE_FOR_WIN_RATE,
    firstDay: day(row?.first_day),
    lastDay: day(row?.last_day),
    recent,
  };
}
