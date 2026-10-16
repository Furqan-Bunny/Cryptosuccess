import { supabase } from '@/lib/supabase/client';

// Simulated USD cash account powering the new paper-trading features (futures
// margin, staking principal). The client can only READ it: every balance change
// happens server-side inside the purpose-built RPCs from migration 0012
// (stake_position / unstake_position, the /api/paper/futures routes,
// reset_paper_balance), which derive the amount from rows the client can't edit.

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

    // Create on first access (race-safe upsert inside the RPC), returning the
    // starting balance.
    const { data: created, error } = await supabase.rpc('ensure_paper_account');
    if (error) throw new Error(error.message);
    return { userId: uid, balanceUsd: Number(created) };
  }

  async getBalance(uid: string): Promise<number> {
    return (await this.getAccount(uid)).balanceUsd;
  }

  /**
   * Reset the authenticated user's cash to the starting balance via the
   * `reset_paper_balance` RPC (the `uid` arg is kept for call-site
   * compatibility; the server uses auth.uid()). Open stakes and futures are
   * closed without payout in the same transaction.
   */
  async reset(_uid: string): Promise<void> {
    const { error } = await supabase.rpc('reset_paper_balance');
    if (error) throw new Error(error.message);
  }
}

export const paperAccountService = new PaperAccountService();
