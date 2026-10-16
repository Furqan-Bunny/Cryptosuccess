// Is a Binance 24h ticker row a live price we can trade, record or score on?
// Pure (no I/O) so the rule is unit-tested; used by src/lib/server/binance-server.
//
// A pair whose trading is halted (exchangeInfo status BREAK, e.g. after a token
// migration) still returns a lastPrice from the ticker endpoints, but it is
// frozen: its closeTime stops moving. Recording a call against that price, then
// scoring it 24h later against the same price, would turn every call into a
// zero-move "win" in the anchored record. A live pair's closeTime is the time of
// the latest trade-window update (seconds old even for thin pairs), so anything
// older than this is treated as no price at all.
export const MAX_TICKER_AGE_MS = 15 * 60 * 1000;

export interface TickerRow {
  lastPrice?: unknown;
  closeTime?: unknown;
}

/** The ticker's last price when it is positive and fresh, otherwise null. */
export function freshTickerPrice(row: TickerRow | null | undefined, nowMs: number = Date.now()): number | null {
  if (!row) return null;
  const price = typeof row.lastPrice === 'number' ? row.lastPrice : parseFloat(String(row.lastPrice ?? ''));
  if (!Number.isFinite(price) || price <= 0) return null;
  const closeTime = Number(row.closeTime);
  if (!Number.isFinite(closeTime) || closeTime <= 0) return null;
  if (nowMs - closeTime > MAX_TICKER_AGE_MS) return null;
  return price;
}
