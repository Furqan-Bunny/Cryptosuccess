// Server-side Binance market-data helpers for cron / engine routes.
//
// Client code fetches prices through the /api/market route (relative URL), which
// does not work from a server context. These helpers hit Binance's public
// market-data host directly. data-api.binance.vision is reachable from cloud /
// US-datacenter IPs (Vercel); api.binance.com returns HTTP 451 from there, so it
// is only a last-resort fallback.

import axios from 'axios';
import { freshTickerPrice } from '@/lib/ticker-freshness';

const SPOT_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];
const FUTURES_HOST = 'https://fapi.binance.com';

/** App symbol (e.g. "BTC") -> Binance spot pair (e.g. "BTCUSDT"). */
export function toBinanceSymbol(symbol: string): string {
  return `${symbol.toUpperCase()}USDT`;
}

async function spotGet(path: string, params?: Record<string, string | number>) {
  let lastError: unknown;
  for (const host of SPOT_HOSTS) {
    try {
      return await axios.get(`${host}${path}`, { params, timeout: 8000 });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Batch-fetch current spot prices for a set of app symbols.
 * Returns a map of app symbol -> price (USD). Symbols not on Binance, and pairs
 * whose price is frozen (trading halted, see freshTickerPrice), are left out, so
 * callers treat them as "no price" — nothing is filled, recorded or scored on a
 * stale number.
 */
export async function fetchSpotPrices(symbols: string[]): Promise<Record<string, number>> {
  const unique = Array.from(new Set(symbols.map(s => s.toUpperCase())));
  if (unique.length === 0) return {};

  const pairToSymbol = new Map<string, string>();
  unique.forEach(s => pairToSymbol.set(toBinanceSymbol(s), s));
  const pairs = Array.from(pairToSymbol.keys());

  const result: Record<string, number> = {};
  const take = (row: { symbol?: string; lastPrice?: unknown; closeTime?: unknown } | null | undefined) => {
    const appSymbol = row?.symbol ? pairToSymbol.get(row.symbol) : undefined;
    const price = freshTickerPrice(row);
    if (appSymbol && price != null) result[appSymbol] = price;
  };

  // The 24h ticker (unlike /ticker/price) carries closeTime, which is how a
  // halted pair's frozen price is told apart from a live one.
  try {
    const resp = await spotGet('/api/v3/ticker/24hr', { symbols: JSON.stringify(pairs) });
    for (const row of resp.data as any[]) take(row);
    return result;
  } catch {
    // Fallback: fetch individually, skipping any that fail (e.g. delisted pair).
    await Promise.all(
      pairs.map(async pair => {
        try {
          const resp = await spotGet('/api/v3/ticker/24hr', { symbol: pair });
          take(resp.data);
        } catch {
          /* skip */
        }
      })
    );
    return result;
  }
}

/** A single current spot price for one app symbol, or null. */
export async function fetchSpotPrice(symbol: string): Promise<number | null> {
  const map = await fetchSpotPrices([symbol]);
  return map[symbol.toUpperCase()] ?? null;
}

export interface UsdtTicker {
  symbol: string; // Binance pair, e.g. BTCUSDT
  quoteVolume: number;
  lastPrice: number;
}

/** All actively-trading USDT spot pairs with 24h quote volume (for discovery). */
export async function fetchUsdtTickers(): Promise<UsdtTicker[]> {
  const [infoResp, tickerResp] = await Promise.all([
    spotGet('/api/v3/exchangeInfo'),
    spotGet('/api/v3/ticker/24hr'),
  ]);

  const trading = new Set<string>(
    (infoResp.data.symbols as any[])
      .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
      .map(s => s.symbol)
  );

  return (tickerResp.data as any[])
    .filter(t => trading.has(t.symbol))
    .map(t => ({
      symbol: t.symbol,
      quoteVolume: parseFloat(t.quoteVolume),
      lastPrice: parseFloat(t.lastPrice),
    }));
}

/**
 * Best-effort funding rate for a symbol from the USDⓈ-M futures host.
 * ⚠️ fapi.binance.com may return HTTP 451 from Vercel/US datacenters — callers
 * must treat null as "funding unavailable" and degrade gracefully.
 */
export async function fetchFundingRate(
  symbol: string
): Promise<{ fundingRate: number; markPrice: number; fundingTime: number } | null> {
  try {
    const resp = await axios.get(`${FUTURES_HOST}/fapi/v1/fundingRate`, {
      params: { symbol: toBinanceSymbol(symbol), limit: 1 },
      timeout: 5000,
    });
    const row = resp.data?.[0];
    if (!row) return null;
    return {
      fundingRate: parseFloat(row.fundingRate),
      markPrice: parseFloat(row.markPrice),
      fundingTime: row.fundingTime,
    };
  } catch {
    return null;
  }
}
