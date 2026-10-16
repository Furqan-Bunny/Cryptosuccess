import { supabase } from '@/lib/supabase/client';
import { computeSignalStats } from '@/lib/signal-stats';

export interface StoredSignal {
  id?: string;
  userId: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  reasoning: string;
  createdAt: string | Date;
  evaluatedAt?: string | Date;
  priceAt24h?: number;
  outcome?: 'hit_target' | 'hit_stop' | 'expired_profit' | 'expired_loss' | 'pending';
  profitLossPercent?: number;
}

function mapRow(row: any): StoredSignal {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    action: row.action,
    confidence: Number(row.confidence),
    entryPrice: Number(row.entry_price),
    targetPrice: Number(row.target_price),
    stopLoss: Number(row.stop_loss),
    reasoning: row.reasoning,
    createdAt: row.created_at,
    evaluatedAt: row.evaluated_at ?? undefined,
    priceAt24h: row.price_at_24h != null ? Number(row.price_at_24h) : undefined,
    outcome: row.outcome ?? undefined,
    profitLossPercent: row.profit_loss_percent != null ? Number(row.profit_loss_percent) : undefined,
  };
}

export interface RecordSignalInput {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  reasoning: string;
  horizon?: string;
}

export interface RecordSignalResult {
  id: string;
  // Free-tier signals left today after this one; -1 = unlimited (Pro).
  remaining: number;
}

/**
 * A failed POST /api/signals/record. `reason` is the server's machine code
 * (limit_reached, stale_price, price_unavailable, quota_unavailable, …);
 * `remaining` is set when the server reported the allowance.
 */
export class SignalRecordError extends Error {
  constructor(
    public readonly reason: string,
    public readonly status: number,
    public readonly remaining?: number
  ) {
    super(reason);
    this.name = 'SignalRecordError';
  }
}

class SignalHistoryService {
  /**
   * Record a generated signal through the server (the only writer of `signals`
   * since migration 0009). The server spends the daily credit, re-prices the
   * entry on live spot and sets the timestamp, so the track record can't be
   * back-filled. Throws SignalRecordError on any non-2xx.
   */
  async storeSignal(signal: RecordSignalInput): Promise<RecordSignalResult> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new SignalRecordError('unauthorized', 401);

    let res: Response;
    try {
      res = await fetch('/api/signals/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          symbol: signal.symbol,
          action: signal.action,
          confidence: signal.confidence,
          entryPrice: signal.entryPrice,
          targetPrice: signal.targetPrice,
          stopLoss: signal.stopLoss,
          reasoning: signal.reasoning,
          horizon: signal.horizon,
        }),
      });
    } catch {
      throw new SignalRecordError('network_error', 0);
    }

    const data = await res.json().catch(() => null);
    const remaining = typeof data?.remaining === 'number' ? data.remaining : undefined;
    if (!res.ok || !data?.ok || typeof data.id !== 'string') {
      throw new SignalRecordError(String(data?.reason ?? 'error'), res.status, remaining);
    }
    return { id: data.id, remaining: remaining ?? -1 };
  }

  async getUserSignals(userId: string, maxResults = 20): Promise<StoredSignal[]> {
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(maxResults);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  }

  // NOTE: signal evaluation is now server-authoritative and immutable. The
  // hourly cron `/api/signals/evaluate` (service-role) finalizes pending signals
  // and the `protect_evaluated_signals` trigger (migration 0004) blocks client
  // edits — so the browser client no longer evaluates. It only reads/displays.

  async getSignalStats(userId: string): Promise<{
    total: number; wins: number; losses: number; pending: number; winRate: number;
  }> {
    const signals = await this.getUserSignals(userId, 100);
    // HOLD is excluded from the win rate (see computeSignalStats).
    return computeSignalStats(signals);
  }
}

export const signalHistoryService = new SignalHistoryService();
