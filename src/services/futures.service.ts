import { supabase } from '@/lib/supabase/client';
import {
  FuturesPosition,
  PositionSide,
  MAX_LEVERAGE,
  MIN_LEVERAGE,
  MIN_MARGIN_USD,
  MAX_OPEN_POSITIONS,
} from '@/lib/futures';

export interface OpenPositionInput {
  symbol: string;
  side: PositionSide;
  leverage: number;
  marginUsd: number;
}

export interface OpenPositionResult {
  success: boolean;
  positionId?: string;
  error?: string;
}

function mapPosition(row: any): FuturesPosition {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    side: row.side,
    leverage: Number(row.leverage),
    entryPrice: Number(row.entry_price),
    quantity: Number(row.quantity),
    marginUsd: Number(row.margin_usd),
    marginMode: row.margin_mode,
    liquidationPrice: Number(row.liquidation_price),
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? undefined,
    closePrice: row.close_price != null ? Number(row.close_price) : undefined,
    realizedPnl: row.realized_pnl != null ? Number(row.realized_pnl) : undefined,
    fundingPaid: row.funding_paid != null ? Number(row.funding_paid) : undefined,
  };
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

const OPEN_ERRORS: Record<string, string> = {
  insufficient_balance: 'Insufficient paper balance for this margin',
  price_unavailable: 'Could not fetch the entry price. Please try again.',
  pro_required: 'Futures are part of Pro.',
  invalid_leverage: `Leverage must be between ${MIN_LEVERAGE}x and ${MAX_LEVERAGE}x`,
  invalid_margin: `Margin must be at least $${MIN_MARGIN_USD}`,
  too_many_positions: `You can hold at most ${MAX_OPEN_POSITIONS} open positions. Close one first.`,
  invalid_symbol: 'This coin is not supported',
  rate_limited: 'Too many requests. Please wait a moment.',
  unauthorized: 'Your session has expired. Please sign in again.',
};

const CLOSE_ERRORS: Record<string, string> = {
  not_found: 'Position not found',
  not_open: 'Position is no longer open',
  price_unavailable: 'Could not fetch the mark price. Please try again.',
  rate_limited: 'Too many requests. Please wait a moment.',
  unauthorized: 'Your session has expired. Please sign in again.',
};

// Paper futures. Opening and closing go through the server
// (/api/paper/futures/*), which prices the trade on live spot and moves the
// paper cash atomically with the position row (migration 0012); the client never
// supplies a price or a cash amount it could inflate. Liquidation is enforced
// server-side by the engine on the mark (spot) price.
class FuturesService {
  async openPosition(_uid: string, input: OpenPositionInput): Promise<OpenPositionResult> {
    const { symbol, side, leverage, marginUsd } = input;

    if (leverage < MIN_LEVERAGE || leverage > MAX_LEVERAGE) {
      return { success: false, error: `Leverage must be between ${MIN_LEVERAGE}x and ${MAX_LEVERAGE}x` };
    }
    if (!Number.isFinite(marginUsd) || marginUsd < MIN_MARGIN_USD) {
      return { success: false, error: OPEN_ERRORS.invalid_margin };
    }

    try {
      const headers = await authHeaders();
      if (!headers) return { success: false, error: OPEN_ERRORS.unauthorized };
      const res = await fetch('/api/paper/futures/open', {
        method: 'POST',
        headers,
        body: JSON.stringify({ symbol: symbol.toUpperCase(), side, leverage, marginUsd }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || typeof data.positionId !== 'string') {
        const reason = String(data?.reason ?? '');
        return { success: false, error: OPEN_ERRORS[reason] ?? 'Failed to open position' };
      }
      return { success: true, positionId: data.positionId };
    } catch (error: any) {
      console.error('Error opening futures position:', error);
      return { success: false, error: 'Failed to open position' };
    }
  }

  async closePosition(_uid: string, positionId: string): Promise<{ success: boolean; realizedPnl?: number; liquidated?: boolean; error?: string }> {
    try {
      const headers = await authHeaders();
      if (!headers) return { success: false, error: CLOSE_ERRORS.unauthorized };
      const res = await fetch('/api/paper/futures/close', {
        method: 'POST',
        headers,
        body: JSON.stringify({ positionId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const reason = String(data?.reason ?? '');
        return { success: false, error: CLOSE_ERRORS[reason] ?? 'Failed to close position' };
      }
      const realizedPnl = Number(data.realizedPnl);
      return { success: true, realizedPnl: Number.isFinite(realizedPnl) ? realizedPnl : 0, liquidated: data.liquidated === true };
    } catch (error: any) {
      console.error('Error closing futures position:', error);
      return { success: false, error: 'Failed to close position' };
    }
  }

  async listPositions(uid: string): Promise<FuturesPosition[]> {
    const { data, error } = await supabase
      .from('futures_positions')
      .select('*')
      .eq('user_id', uid)
      .order('opened_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapPosition);
  }
}

export const futuresService = new FuturesService();
