import { supabase } from '@/lib/supabase/client';
import { UserProfile } from '@/types';

// Watchlist size limits per tier.
export const FREE_WATCHLIST_LIMIT = 5;
export const PRO_WATCHLIST_LIMIT = 50;

export function watchlistLimit(isPro: boolean): number {
  return isPro ? PRO_WATCHLIST_LIMIT : FREE_WATCHLIST_LIMIT;
}

// Thrown when a free user tries to grow their watchlist past the tier limit.
// Callers surface `.message` directly to the user.
export class WatchlistLimitError extends Error {
  constructor(public limit: number) {
    super(`Free plan tracks up to ${limit} coins. Upgrade to Pro for more.`);
    this.name = 'WatchlistLimitError';
  }
}

// The top-level `watchlist` column is the single source of truth; mapProfileRow
// surfaces it as profile.preferences.watchlist. ALWAYS mutate against this raw
// stored list — never a display-filtered copy, or coins the UI hid (e.g. ones no
// longer in the coin catalogue) get silently dropped on the next write.
export function storedWatchlist(profile: UserProfile | null): string[] {
  return profile?.preferences?.watchlist ?? [];
}

// Persist the full list. Throws on RLS/network error so callers don't show a
// false success and then silently revert when the profile refreshes.
async function persist(uid: string, list: string[]): Promise<void> {
  const { error } = await supabase.from('profiles').update({ watchlist: list }).eq('id', uid);
  if (error) throw error;
}

// Add a coin to the stored list. No-op (returns the list unchanged) if already
// present; throws WatchlistLimitError if a free user is at the cap.
export async function addToWatchlist(
  uid: string,
  current: string[],
  symbol: string,
  isPro: boolean
): Promise<string[]> {
  if (current.includes(symbol)) return current;
  const limit = watchlistLimit(isPro);
  if (!isPro && current.length >= limit) throw new WatchlistLimitError(limit);
  const next = [...current, symbol];
  await persist(uid, next);
  return next;
}

// Remove a coin from the stored list.
export async function removeFromWatchlist(
  uid: string,
  current: string[],
  symbol: string
): Promise<string[]> {
  const next = current.filter((s) => s !== symbol);
  await persist(uid, next);
  return next;
}
