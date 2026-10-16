import { supabase } from '@/lib/supabase/client';

// Simulated staking. Principal (USD) is locked from the paper cash account;
// rewards accrue lazily (computed on read) from the snapshotted APY. Cash only
// moves inside the stake_position / unstake_position RPCs (migration 0012),
// which use the same simple-interest formula as accruedRewards below.

export interface StakingRate {
  symbol: string;
  apy: number;
  source: 'defillama' | 'estimate';
}

export interface StakingPosition {
  id?: string;
  userId: string;
  symbol: string;
  amountUsd: number;
  apySnapshot: number;
  active: boolean;
  startedAt: string | Date;
  closedAt?: string | Date;
}

function toDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  return new Date(value);
}

/** Lazily-computed accrued reward (USD) for a position up to now. */
export function accruedRewards(pos: StakingPosition): number {
  const start = toDate(pos.startedAt).getTime();
  const end = pos.active ? Date.now() : toDate(pos.closedAt).getTime();
  const days = Math.max(0, (end - start) / (24 * 60 * 60 * 1000));
  return pos.amountUsd * (pos.apySnapshot / 100) * (days / 365);
}

function mapPosition(row: any): StakingPosition {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    amountUsd: Number(row.amount_usd),
    apySnapshot: Number(row.apy_snapshot),
    active: row.active,
    startedAt: row.started_at,
    closedAt: row.closed_at ?? undefined,
  };
}

class StakingService {
  async getRates(): Promise<Record<string, StakingRate>> {
    const { data, error } = await supabase.from('staking_rates').select('*');
    if (error) throw new Error(error.message);
    const map: Record<string, StakingRate> = {};
    (data ?? []).forEach(r => {
      map[r.symbol] = { symbol: r.symbol, apy: Number(r.apy), source: r.source };
    });
    return map;
  }

  /**
   * Stake paper cash via the `stake_position` RPC (migration 0012). The server
   * reads the APY from staking_rates and debits + records the position in one
   * transaction, so the client never chooses the rate or the cash movement.
   */
  async stake(_uid: string, symbol: string, amountUsd: number): Promise<{ success: boolean; error?: string }> {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return { success: false, error: 'Enter a valid amount' };
    try {
      const { error } = await supabase.rpc('stake_position', { p_symbol: symbol.toUpperCase(), p_amount: amountUsd });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error: any) {
      console.error('Error staking:', error);
      return { success: false, error: error?.message || 'Failed to stake' };
    }
  }

  /**
   * Unstake via the `unstake_position` RPC: the server computes principal +
   * rewards from the stored position and credits it in the same transaction as
   * the close, so a double click can never pay twice.
   */
  async unstake(_uid: string, positionId: string): Promise<{ success: boolean; returned?: number; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('unstake_position', { p_id: positionId });
      if (error) return { success: false, error: error.message };
      return { success: true, returned: Number(data) };
    } catch (error: any) {
      console.error('Error unstaking:', error);
      return { success: false, error: error?.message || 'Failed to unstake' };
    }
  }

  async listPositions(uid: string): Promise<StakingPosition[]> {
    const { data, error } = await supabase
      .from('staking_positions')
      .select('*')
      .eq('user_id', uid)
      .order('started_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapPosition);
  }
}

export const stakingService = new StakingService();
