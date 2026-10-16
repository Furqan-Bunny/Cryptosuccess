// Input validation for the public /api/market proxy routes. Query params are
// forwarded to Binance / alternative.me, so they are normalised to a strict
// allow-list here rather than passed through verbatim.

import { getBinanceSymbol, SYMBOL_TO_BINANCE } from './coins';

// Binance kline intervals (https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data).
export const KLINE_INTERVALS = [
  '1s', '1m', '3m', '5m', '15m', '30m',
  '1h', '2h', '4h', '6h', '8h', '12h',
  '1d', '3d', '1w', '1M',
] as const;

// Binance /api/v3/depth only accepts these limits.
const DEPTH_LIMITS = [5, 10, 20, 50, 100, 500, 1000];

/**
 * App symbol -> Binance USDT pair, or null if the symbol is malformed. Catalogue
 * coins use the catalogue mapping; other well-formed tickers fall back to
 * `${SYMBOL}USDT` (Binance itself rejects unknown pairs).
 */
export function parseMarketSymbol(raw: string | null | undefined): { symbol: string; pair: string } | null {
  if (!raw) return null;
  const symbol = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,15}$/.test(symbol)) return null;
  return { symbol, pair: SYMBOL_TO_BINANCE[symbol] ?? getBinanceSymbol(symbol) };
}

export function parseKlineInterval(raw: string | null | undefined, fallback = '1h'): string | null {
  if (raw === null || raw === undefined || raw === '') return fallback;
  return (KLINE_INTERVALS as readonly string[]).includes(raw) ? raw : null;
}

/** Integer in [min, max]; missing -> fallback; garbage -> null. */
export function parseBoundedInt(
  raw: string | null | undefined,
  fallback: number,
  min: number,
  max: number
): number | null {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/** Snap a requested order-book depth to the nearest allowed Binance limit (>=). */
export function parseDepthLimit(raw: string | null | undefined, fallback = 20): number | null {
  const n = parseBoundedInt(raw, fallback, 1, 1000);
  if (n === null) return null;
  return DEPTH_LIMITS.find(l => l >= n) ?? 1000;
}
