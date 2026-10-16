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

    // Create on first access. Clients can no longer write paper_accounts
    // directly (migration 0009); a zero adjustment creates the row with the
    // starting balance (race-safe upsert inside the RPC) and returns it.
    const balanceUsd = await this.adjustBalance(uid, 0);
    return { userId: uid, balanceUsd };
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

  /**
   * Reset the authenticated user's cash to the starting balance via the
   * `reset_paper_balance` RPC (the `uid` arg is kept for call-site
   * compatibility; the server uses auth.uid()).
   */
  async reset(_uid: string): Promise<void> {
    const { error } = await supabase.rpc('reset_paper_balance');
    if (error) throw new Error(error.message);
  }
}

export const paperAccountService = new PaperAccountService();
