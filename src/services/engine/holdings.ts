// Pure ledger maths for the paper-trading engine. The trades table is the
// ledger: a symbol's position is (sum of buys) - (sum of sells), exactly how
// portfolio.service derives holdings for the UI. Kept I/O-free so the engine's
// "can this SELL fill?" rule is unit-tested.

export interface LedgerTrade {
  type: string; // buy | sell
  amount: number | string;
}

// Float dust from repeated buys/sells must not block selling the whole position.
export const HOLDING_EPSILON = 1e-9;

/** Net units held from a symbol's trade rows (never negative). */
export function netHolding(trades: LedgerTrade[]): number {
  let net = 0;
  for (const t of trades) {
    const amount = Number(t.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (t.type === 'buy') net += amount;
    else if (t.type === 'sell') net -= amount;
  }
  return Math.max(0, net);
}

/** Whether the ledger holds at least `amount` units to sell. */
export function hasSufficientHolding(trades: LedgerTrade[], amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  return netHolding(trades) + HOLDING_EPSILON >= amount;
}
