// Turns a Telegram analyst read into a `signals` row so bot calls enter the same
// server-scored, on-chain-anchored track record as web signals. Pure (no I/O) so
// the validation rules are unit-testable.
import type { AnalystTake } from '@/services/analyst.service';
import { parseFirstNumber } from './format';

// The analyst reports conviction as a word; the track record stores a number.
// Deliberately modest values — conviction is not a probability of being right.
const CONVICTION_CONFIDENCE: Record<string, number> = { low: 40, medium: 55, high: 70 };

export interface SignalRecord {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  reasoning: string;
}

/**
 * Build the row for a short-term read, using a FRESH live price as the entry (a
 * cached take's price can be hours old). Returns null when the levels can't be
 * parsed or contradict the direction — such a call is not recorded, and the bot
 * says so instead of claiming it is verifiable.
 */
export function buildSignalRecord(analysis: AnalystTake, livePrice: number): SignalRecord | null {
  if (!Number.isFinite(livePrice) || livePrice <= 0) return null;
  const st = analysis.shortTerm;
  const confidence = CONVICTION_CONFIDENCE[st.conviction] ?? 40;
  const reasoning = `Telegram analyst read (${st.horizon}): ${st.thesis}`.slice(0, 1000);

  if (st.verdict === 'HOLD') {
    // Non-directional: scored as neutral and excluded from the win rate.
    return { action: 'HOLD', confidence, entryPrice: livePrice, targetPrice: livePrice, stopLoss: livePrice, reasoning };
  }

  const target = parseFirstNumber(st.target);
  const stop = parseFirstNumber(st.stop);
  if (target == null || stop == null || target <= 0 || stop <= 0) return null;

  const coherent = st.verdict === 'BUY'
    ? target > livePrice && stop < livePrice
    : target < livePrice && stop > livePrice;
  if (!coherent) return null;

  return { action: st.verdict, confidence, entryPrice: livePrice, targetPrice: target, stopLoss: stop, reasoning };
}
