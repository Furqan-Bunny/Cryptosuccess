import { supabase } from '@/lib/supabase/client';

// Simulated USD cash account powering the new paper-trading features (futures
// margin, staking principal). Atomic balance changes go through the
// `adjust_paper_balance` Postgres RPC (replaces Firestore runTransaction).

export const STARTING_BALANCE_USD = 10_000;

export interface PaperAccount {
  userId: string;
  balanceUsd: number;
}

class PaperAccountService {
  /** Fetch the account, creating it with the starting balance on first access. */
  async getAccount(uid: string): Promise<PaperAccount> {
    const { data } = await supabase
      .from('paper_accounts')
      .select('balance_usd')
      .eq('user_id', uid)
      .maybeSingle();

    if (data) return { userId: uid, balanceUsd: Number(data.balance_usd) };

    // Create on first access (ignore duplicate if a race created it).
    await supabase
      .from('paper_accounts')
      .upsert({ user_id: uid, balance_usd: STARTING_BALANCE_USD }, { onConflict: 'user_id', ignoreDuplicates: true });
    return { userId: uid, balanceUsd: STARTING_BALANCE_USD };
  }

  async getBalance(uid: string): Promise<number> {
    return (await this.getAccount(uid)).balanceUsd;
  }

  /**
   * Atomically change the balance via RPC (operates on the authenticated user's
   * account; the `uid` arg is kept for call-site compatibility). Throws on
   * overdraft. Returns the new balance.
   */
  async adjustBalance(_uid: string, deltaUsd: number): Promise<number> {
    const { data, error } = await supabase.rpc('adjust_paper_balance', { delta: deltaUsd });
    if (error) throw new Error(error.message);
    return Number(data);
  }

  async reset(uid: string): Promise<void> {
    await supabase
      .from('paper_accounts')
      .upsert({ user_id: uid, balance_usd: STARTING_BALANCE_USD, updated_at: new Date().toISOString() });
  }
}

export const paperAccountService = new PaperAccountService();
