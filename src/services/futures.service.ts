import { supabase } from '@/lib/supabase/client';
import { marketService } from './market.service';
import { paperAccountService } from './paper-account.service';
import {
  FuturesPosition,
  PositionSide,
  buildPosition,
  computePnl,
  MAX_LEVERAGE,
  MIN_LEVERAGE,
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

// Client-side paper futures. Liquidation is enforced server-side by the engine
// on the mark (spot) price.
class FuturesService {
  async openPosition(uid: string, input: OpenPositionInput): Promise<OpenPositionResult> {
    const { symbol, side, leverage, marginUsd } = input;

    if (leverage < MIN_LEVERAGE || leverage > MAX_LEVERAGE) {
      return { success: false, error: `Leverage must be between ${MIN_LEVERAGE}x and ${MAX_LEVERAGE}x` };
    }
    if (!marginUsd || marginUsd <= 0) {
      return { success: false, error: 'Margin must be greater than 0' };
    }

    try {
      const balance = await paperAccountService.getBalance(uid);
      if (marginUsd > balance) {
        return { success: false, error: 'Insufficient paper balance for this margin' };
      }

      const entryPrice = (await marketService.getCurrentPrice(symbol)).price;
      if (!entryPrice || entryPrice <= 0) {
        return { success: false, error: 'Could not fetch entry price' };
      }

      const { quantity, liquidationPrice } = buildPosition(side, entryPrice, leverage, marginUsd);

      // Lock margin first; if this throws (overdraft), no position is created.
      await paperAccountService.adjustBalance(uid, -marginUsd);

      const { data, error } = await supabase
        .from('futures_positions')
        .insert({
          user_id: uid,
          symbol: symbol.toUpperCase(),
          side,
          leverage,
          entry_price: entryPrice,
          quantity,
          margin_usd: marginUsd,
          margin_mode: 'isolated',
          liquidation_price: liquidationPrice,
          status: 'open',
        })
        .select('id')
        .single();
      if (error || !data) {
        // The margin was already debited — give it back so a failed open never
        // silently loses paper cash.
        const reason = error?.message || 'Failed to open position';
        try {
          await paperAccountService.adjustBalance(uid, marginUsd);
        } catch (refundErr) {
          console.error('Margin refund after failed open also failed:', refundErr);
          return { success: false, error: `${reason}. Your margin could not be returned automatically — please contact support.` };
        }
        return { success: false, error: `${reason}. Your margin was returned.` };
      }
      return { success: true, positionId: data.id };
    } catch (error: any) {
      console.error('Error opening futures position:', error);
      return { success: false, error: error?.message || 'Failed to open position' };
    }
  }

  async closePosition(uid: string, positionId: string): Promise<{ success: boolean; realizedPnl?: number; error?: string }> {
    try {
      const { data: row } = await supabase
        .from('futures_positions')
        .select('*')
        .eq('id', positionId)
        .maybeSingle();
      if (!row) return { success: false, error: 'Position not found' };

      const pos = mapPosition(row);
      if (pos.userId !== uid) return { success: false, error: 'Unauthorized' };
      if (pos.status !== 'open') return { success: false, error: `Position already ${pos.status}` };

      const markPrice = (await marketService.getCurrentPrice(pos.symbol)).price;
      if (!markPrice || markPrice <= 0) return { success: false, error: 'Could not fetch mark price' };
      const realizedPnl = computePnl(pos.side, pos.entryPrice, markPrice, pos.quantity);

      // Close FIRST, conditional on the position still being open, and only
      // credit if this call made the transition — so a double click, or the
      // engine liquidating it at the same moment, can never pay out twice.
      const { data: closed, error: closeErr } = await supabase
        .from('futures_positions')
        .update({
          status: 'closed',
          close_price: markPrice,
          realized_pnl: realizedPnl,
          closed_at: new Date().toISOString(),
        })
        .eq('id', positionId)
        .eq('status', 'open')
        .select('id');
      if (closeErr) throw new Error(closeErr.message);
      if (!closed || closed.length !== 1) return { success: false, error: 'Position is no longer open' };

      const credit = Math.max(0, pos.marginUsd + realizedPnl);
      try {
        await paperAccountService.adjustBalance(uid, credit);
      } catch (creditErr) {
        // Re-open so the user can retry instead of losing the payout.
        await supabase
          .from('futures_positions')
          .update({ status: 'open', close_price: null, realized_pnl: null, closed_at: null })
          .eq('id', positionId)
          .eq('status', 'closed');
        throw creditErr;
      }

      return { success: true, realizedPnl };
    } catch (error: any) {
      console.error('Error closing futures position:', error);
      return { success: false, error: error?.message || 'Failed to close position' };
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
