import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { SYMBOL_TO_BINANCE, COIN_SUPPLIES } from '@/lib/coins';
import { rateLimit, clientIp } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

// data-api.binance.vision is Binance's public market-data domain. Unlike
// api.binance.com it is reachable from cloud / US datacenter IPs (e.g. Vercel
// serverless regions), which otherwise receive HTTP 451 (restricted location).
const BINANCE_HOSTS = [
  'https://data-api.binance.vision',
  'https://api.binance.com',
];

async function binanceGet(path: string, params?: Record<string, string | number>) {
  let lastError: unknown;
  for (const host of BINANCE_HOSTS) {
    try {
      return await axios.get(`${host}${path}`, { params, timeout: 10000 });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// Derived from the single coin catalogue (src/lib/coins.ts).
const symbolMap = SYMBOL_TO_BINANCE;
const supplies = COIN_SUPPLIES;

export async function GET(request: NextRequest) {
  const rl = await rateLimit('market_all', clientIp(request.headers), 60, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }
  try {
    // Get all symbols in one request
    const symbols = Object.values(symbolMap);

    // Fetch 24hr ticker data for all symbols
    const response = await binanceGet('/api/v3/ticker/24hr');

    const allTickers = response.data;
    const result: any[] = [];

    // Filter and format the data
    for (const [symbol, binanceSymbol] of Object.entries(symbolMap)) {
      const ticker = allTickers.find((t: any) => t.symbol === binanceSymbol);

      if (ticker) {
        const marketCap = supplies[symbol] ? supplies[symbol] * parseFloat(ticker.lastPrice) : 0;

        result.push({
          symbol,
          price: parseFloat(ticker.lastPrice),
          change24h: parseFloat(ticker.priceChange),
          changePercent24h: parseFloat(ticker.priceChangePercent),
          volume24h: parseFloat(ticker.volume),
          marketCap,
          lastUpdate: new Date(),
        });
      }
    }

    // Sort by market cap
    result.sort((a, b) => b.marketCap - a.marketCap);

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10' },
    });
  } catch (error) {
    console.error('Market API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market data' },
      { status: 500 }
    );
  }
}