// Validation for client-submitted signals (POST /api/signals/record).
//
// The track record is anchored on-chain, so a signal row must describe a call
// made at the moment it was recorded — never one back-filled with hindsight.
// The route therefore only trusts the client for the *shape* of the call
// (symbol, direction, confidence, bracket); time and entry price are set by the
// server. Pure (no I/O) so every rule here is unit-tested.

import { isSupportedCoin } from '@/lib/coins';
import { HORIZONS } from '@/lib/horizons';

export type SignalAction = 'BUY' | 'SELL' | 'HOLD';

export interface SignalInput {
  symbol: string;
  action: SignalAction;
  confidence: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  reasoning: string;
  horizon: string | null;
}

export type SignalInputResult =
  | { ok: true; value: SignalInput }
  | { ok: false; error: string };

export const MAX_REASONING_LENGTH = 1000;
// The client's entry (last candle close) may lag the live spot slightly; beyond
// this the call is stale or fabricated.
export const MAX_ENTRY_DEVIATION = 0.015;
// Sanity bound on the bracket: target / stop further than 10x the entry are
// nonsense levels, not a trading call.
export const MAX_LEVEL_RATIO = 10;

const ACTIONS: ReadonlySet<string> = new Set(['BUY', 'SELL', 'HOLD']);
const HORIZON_IDS: ReadonlySet<string> = new Set(HORIZONS.map(h => h.id));

// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f]/g;

function isPositiveFinite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * Direction coherence of a bracket around `entry`:
 *   BUY  → target > entry > stop
 *   SELL → target < entry < stop
 *   HOLD → stop <= entry <= target (the web engine emits a neutral bracket; the
 *          Telegram bot emits target == stop == entry). HOLD is non-directional
 *          and excluded from the win rate either way.
 */
export function isCoherentBracket(action: SignalAction, entry: number, target: number, stop: number): boolean {
  if (action === 'BUY') return target > entry && entry > stop;
  if (action === 'SELL') return target < entry && entry < stop;
  return stop <= entry && entry <= target;
}

export function validateSignalInput(body: unknown): SignalInputResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_body' };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.symbol !== 'string' || b.symbol.length === 0 || b.symbol.length > 15) {
    return { ok: false, error: 'invalid_symbol' };
  }
  const symbol = b.symbol.trim().toUpperCase();
  if (!isSupportedCoin(symbol)) return { ok: false, error: 'invalid_symbol' };

  if (typeof b.action !== 'string' || !ACTIONS.has(b.action)) {
    return { ok: false, error: 'invalid_action' };
  }
  const action = b.action as SignalAction;

  const confidence = b.confidence;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
    return { ok: false, error: 'invalid_confidence' };
  }

  const { entryPrice, targetPrice, stopLoss } = b;
  if (!isPositiveFinite(entryPrice) || !isPositiveFinite(targetPrice) || !isPositiveFinite(stopLoss)) {
    return { ok: false, error: 'invalid_price' };
  }
  if (targetPrice > entryPrice * MAX_LEVEL_RATIO || stopLoss > entryPrice * MAX_LEVEL_RATIO) {
    return { ok: false, error: 'invalid_price' };
  }
  if (!isCoherentBracket(action, entryPrice, targetPrice, stopLoss)) {
    return { ok: false, error: 'incoherent_levels' };
  }

  if (b.reasoning != null && typeof b.reasoning !== 'string') {
    return { ok: false, error: 'invalid_reasoning' };
  }
  const reasoning = String(b.reasoning ?? '').replace(CONTROL_EXCEPT_NEWLINE, '').trim();
  if (reasoning.length > MAX_REASONING_LENGTH) return { ok: false, error: 'invalid_reasoning' };

  let horizon: string | null = null;
  if (b.horizon != null) {
    if (typeof b.horizon !== 'string' || !HORIZON_IDS.has(b.horizon)) {
      return { ok: false, error: 'invalid_horizon' };
    }
    horizon = b.horizon;
  }

  return {
    ok: true,
    value: { symbol, action, confidence, entryPrice, targetPrice, stopLoss, reasoning, horizon },
  };
}

export interface AnalystQuantSignal {
  action: SignalAction;
  confidence: number;
  price: number;
  target: number;
  stop: number;
  engine: 'ai' | 'technical';
}

/**
 * Reduce the client's optional quant signal for the analyst prompt to a strict,
 * numbers-only shape (or undefined). The analyst take is cached per coin and
 * served to EVERY user and the Telegram bot, so free-form client data must never
 * reach the prompt — it would let one user steer everyone's read.
 */
export function sanitizeAnalystSignal(raw: unknown): AnalystQuantSignal | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const s = raw as Record<string, unknown>;
  if (typeof s.action !== 'string' || !ACTIONS.has(s.action)) return undefined;
  const { confidence, price, target, stop } = s;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
    return undefined;
  }
  if (!isPositiveFinite(price) || !isPositiveFinite(target) || !isPositiveFinite(stop)) return undefined;
  return {
    action: s.action as SignalAction,
    confidence,
    price,
    target,
    stop,
    engine: s.engine === 'ai' ? 'ai' : 'technical',
  };
}

/** True when the client's entry is within MAX_ENTRY_DEVIATION of live spot. */
export function isEntryNearSpot(clientEntry: number, spot: number): boolean {
  if (!isPositiveFinite(clientEntry) || !isPositiveFinite(spot)) return false;
  return Math.abs(clientEntry - spot) / spot <= MAX_ENTRY_DEVIATION;
}

/**
 * Re-anchor a validated bracket on the server's spot price. Target and stop keep
 * their percentage distance from entry, so a bracket that was coherent around
 * the client's (slightly lagging) entry stays coherent around spot.
 */
export function rebaseToSpot(
  input: Pick<SignalInput, 'entryPrice' | 'targetPrice' | 'stopLoss'>,
  spot: number
): { entryPrice: number; targetPrice: number; stopLoss: number } {
  const ratio = spot / input.entryPrice;
  // A level equal to entry (flat HOLD) maps to spot exactly — multiplying by the
  // ratio could land an ulp away and break the target == entry == stop shape.
  const rebase = (level: number) => (level === input.entryPrice ? spot : level * ratio);
  return {
    entryPrice: spot,
    targetPrice: rebase(input.targetPrice),
    stopLoss: rebase(input.stopLoss),
  };
}
