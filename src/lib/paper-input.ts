// Validation for paper-futures requests (POST /api/paper/futures/open|close).
//
// Paper cash only moves inside SECURITY DEFINER functions (migration 0012); the
// futures routes price the trade on the server and pass these validated values
// in. Pure (no I/O) so every rule here is unit-tested.

import { isSupportedCoin } from '@/lib/coins';
import { MAX_LEVERAGE, MIN_LEVERAGE, type PositionSide } from '@/lib/futures';
import { isUuid } from '@/lib/uuid';

// Sanity ceiling on a single margin amount. Far above any real paper balance;
// it only keeps absurd numbers out of numeric math. Mirrored in the SQL checks.
export const MAX_PAPER_AMOUNT_USD = 1_000_000_000;

export interface OpenFuturesInput {
  symbol: string;
  side: PositionSide;
  leverage: number;
  marginUsd: number;
}

export type PaperInputResult<T> = { ok: true; value: T } | { ok: false; error: string };

function asObject(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

export function validateOpenFuturesInput(body: unknown): PaperInputResult<OpenFuturesInput> {
  const b = asObject(body);
  if (!b) return { ok: false, error: 'invalid_body' };

  if (typeof b.symbol !== 'string' || b.symbol.length === 0 || b.symbol.length > 15) {
    return { ok: false, error: 'invalid_symbol' };
  }
  const symbol = b.symbol.trim().toUpperCase();
  if (!isSupportedCoin(symbol)) return { ok: false, error: 'invalid_symbol' };

  if (b.side !== 'long' && b.side !== 'short') return { ok: false, error: 'invalid_side' };

  const { leverage, marginUsd } = b;
  if (typeof leverage !== 'number' || !Number.isFinite(leverage) || leverage < MIN_LEVERAGE || leverage > MAX_LEVERAGE) {
    return { ok: false, error: 'invalid_leverage' };
  }
  if (typeof marginUsd !== 'number' || !Number.isFinite(marginUsd) || marginUsd <= 0 || marginUsd > MAX_PAPER_AMOUNT_USD) {
    return { ok: false, error: 'invalid_margin' };
  }

  return { ok: true, value: { symbol, side: b.side, leverage, marginUsd } };
}

export function validateCloseFuturesInput(body: unknown): PaperInputResult<{ positionId: string }> {
  const b = asObject(body);
  if (!b) return { ok: false, error: 'invalid_body' };
  if (!isUuid(b.positionId)) return { ok: false, error: 'invalid_position' };
  return { ok: true, value: { positionId: b.positionId } };
}
