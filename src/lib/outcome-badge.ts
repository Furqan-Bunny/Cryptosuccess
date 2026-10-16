// How a recorded signal's outcome is shown in the signal history. Pure, so the
// rules are unit-tested (tests/unit/outcome-badge.test.ts).
//
// HOLD is a stay-out call: deriveOutcome always files it as 'expired_profit',
// and the win rate leaves it out (src/lib/signal-stats.ts). The history must not
// present it as a winning trade either, so it gets a neutral badge and its
// number is labelled as a plain price move, not P/L.

export type OutcomeTone = 'win' | 'small_win' | 'loss' | 'small_loss' | 'neutral' | 'pending';

export interface OutcomeBadge {
  label: string;
  tone: OutcomeTone;
  /** Caption for the percentage next to the badge. */
  moveCaption: 'P/L' | 'price move';
}

export function outcomeBadge(action: string, outcome: string | null | undefined): OutcomeBadge {
  const finalized = !!outcome && outcome !== 'pending';
  if (action === 'HOLD') {
    return finalized
      ? { label: 'Stay-out · not scored', tone: 'neutral', moveCaption: 'price move' }
      : { label: 'Pending', tone: 'pending', moveCaption: 'price move' };
  }
  // Scored on the single price 24h after the call, not the path in between.
  switch (outcome) {
    case 'hit_target': return { label: 'Past Target at 24h', tone: 'win', moveCaption: 'P/L' };
    case 'expired_profit': return { label: 'Profit at 24h', tone: 'small_win', moveCaption: 'P/L' };
    case 'hit_stop': return { label: 'Past Stop at 24h', tone: 'loss', moveCaption: 'P/L' };
    case 'expired_loss': return { label: 'Loss at 24h', tone: 'small_loss', moveCaption: 'P/L' };
    default: return { label: 'Pending', tone: 'pending', moveCaption: 'P/L' };
  }
}
