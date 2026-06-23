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
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';

async function binanceGet(path: string, params?: Record<string, string | number>) {
  let lastError: unknown;
  for (const host of BINANCE_HOSTS) {
    try {
      return await axios.get(`${host}${path}`, { params, timeout: 8000 });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// Derived from the single coin catalogue (src/lib/coins.ts). Any symbol not in
// the map falls back to `${symbol}USDT` at the call sites below.
const symbolMap = SYMBOL_TO_BINANCE;

export async function GET(request: NextRequest) {
  // Per-IP backstop on the public market proxy (no-ops if Upstash isn't set).
  const rl = await rateLimit('market', clientIp(request.headers), 120, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    const action = searchParams.get('action');

    if (!symbol || !action) {
      return NextResponse.json(
        { error: 'Missing symbol or action parameter' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'price': {
        const binanceSymbol = symbolMap[symbol] || `${symbol}USDT`;

        // Get price from Binance
        let priceResponse;
        try {
          priceResponse = await binanceGet('/api/v3/ticker/24hr', { symbol: binanceSymbol });
        } catch (error: any) {
          console.error('Binance API error:', error.message);
          return NextResponse.json(
            { error: `Failed to fetch price for ${symbol}` },
            { status: 503 }
          );
        }

        const data = priceResponse.data;

        // Calculate market cap estimate based on known supplies (from coins.ts)
        let marketCap = 0;
        if (COIN_SUPPLIES[symbol]) {
          marketCap = COIN_SUPPLIES[symbol] * parseFloat(data.lastPrice);
        }

        return NextResponse.json({
          symbol,
          price: parseFloat(data.lastPrice),
          change24h: parseFloat(data.priceChange),
          changePercent24h: parseFloat(data.priceChangePercent),
          volume24h: parseFloat(data.volume),
          marketCap,
          lastUpdate: new Date(),
        }, {
          headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10' },
        });
      }

      case 'candles': {
        const binanceSymbol = symbolMap[symbol] || `${symbol}USDT`;
        const interval = searchParams.get('interval') || '1h';
        const limit = searchParams.get('limit') || '100';

        let response;
        try {
          response = await binanceGet('/api/v3/klines', {
            symbol: binanceSymbol,
            interval,
            limit,
          });
        } catch (error: any) {
          console.error('Binance klines API error:', error.message);
          return NextResponse.json(
            { error: `Failed to fetch candles for ${symbol}` },
            { status: 503 }
          );
        }

        const candles = response.data.map((candle: any[]) => ({
          time: candle[0],
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5]),
        }));

        return NextResponse.json(candles, {
          headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
        });
      }

      case 'funding': {
        const binanceSymbol = symbolMap[symbol] || `${symbol}USDT`;
        try {
          const response = await axios.get('https://fapi.binance.com/fapi/v1/fundingRate', {
            params: { symbol: binanceSymbol, limit: 1 },
            timeout: 5000,
          });
          return NextResponse.json(response.data[0] || null);
        } catch (error: any) {
          console.error('Binance funding rate API error:', error.message);
          return NextResponse.json(
            { error: `Failed to fetch funding rate for ${symbol}` },
            { status: 503 }
          );
        }
      }

      case 'orderbook': {
        const binanceSymbol = symbolMap[symbol] || `${symbol}USDT`;
        const limit = searchParams.get('limit') || '20';

        let response;
        try {
          response = await binanceGet('/api/v3/depth', {
            symbol: binanceSymbol,
            limit,
          });
        } catch (error: any) {
          console.error('Binance depth API error:', error.message);
          return NextResponse.json(
            { error: `Failed to fetch orderbook for ${symbol}` },
            { status: 503 }
          );
        }

        return NextResponse.json(response.data);
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Market API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market data' },
      { status: 500 }
    );
  }
}