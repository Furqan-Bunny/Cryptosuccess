import { supabase } from '@/lib/supabase/client';
import { paperAccountService } from './paper-account.service';

// Simulated staking. Principal (USD) is locked from the paper cash account;
// rewards accrue lazily (computed on read) from the snapshotted APY.

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

  async stake(uid: string, symbol: string, amountUsd: number, apy: number): Promise<{ success: boolean; error?: string }> {
    if (!amountUsd || amountUsd <= 0) return { success: false, error: 'Enter a valid amount' };
    try {
      const balance = await paperAccountService.getBalance(uid);
      if (amountUsd > balance) return { success: false, error: 'Insufficient paper balance' };

      // Debit first (overdraft-guarded); if this throws, nothing is staked.
      await paperAccountService.adjustBalance(uid, -amountUsd);
      const { error } = await supabase.from('staking_positions').insert({
        user_id: uid,
        symbol: symbol.toUpperCase(),
        amount_usd: amountUsd,
        apy_snapshot: apy,
        active: true,
      });
      if (error) {
        // Compensate: the principal was already debited, so return it.
        try {
          await paperAccountService.adjustBalance(uid, amountUsd);
        } catch (refundErr) {
          console.error('Stake refund after failed insert also failed:', refundErr);
          return { success: false, error: `${error.message}. Your funds could not be returned automatically — please contact support.` };
        }
        return { success: false, error: `${error.message}. Your funds were returned.` };
      }
      return { success: true };
    } catch (error: any) {
      console.error('Error staking:', error);
      return { success: false, error: error?.message || 'Failed to stake' };
    }
  }

  async unstake(uid: string, positionId: string): Promise<{ success: boolean; returned?: number; error?: string }> {
    try {
      const { data: row } = await supabase
        .from('staking_positions')
        .select('*')
        .eq('id', positionId)
        .maybeSingle();
      if (!row) return { success: false, error: 'Position not found' };
      const pos = mapPosition(row);
      if (pos.userId !== uid) return { success: false, error: 'Unauthorized' };
      if (!pos.active) return { success: false, error: 'Already unstaked' };

      const closedAt = new Date().toISOString();
      const rewards = accruedRewards({ ...pos, active: false, closedAt });
      const returned = pos.amountUsd + rewards;

      // Deactivate FIRST, conditional on still being active, and only pay out if
      // this call made the transition — a double click can't pay twice.
      const { data: closed, error: closeErr } = await supabase
        .from('staking_positions')
        .update({ active: false, closed_at: closedAt })
        .eq('id', positionId)
        .eq('active', true)
        .select('id');
      if (closeErr) throw new Error(closeErr.message);
      if (!closed || closed.length !== 1) return { success: false, error: 'Already unstaked' };

      try {
        await paperAccountService.adjustBalance(uid, returned);
      } catch (creditErr) {
        // Re-activate so the user can retry instead of losing the principal.
        await supabase
          .from('staking_positions')
          .update({ active: true, closed_at: null })
          .eq('id', positionId)
          .eq('active', false);
        throw creditErr;
      }
      return { success: true, returned };
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
