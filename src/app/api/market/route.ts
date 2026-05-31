import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

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

const symbolMap: { [key: string]: string } = {
  'ETH': 'ETHUSDT',
  'SOL': 'SOLUSDT',
  'BNB': 'BNBUSDT',
  'BTC': 'BTCUSDT',
  'ADA': 'ADAUSDT',
  'DOGE': 'DOGEUSDT',
  'DOT': 'DOTUSDT',
  'MATIC': 'MATICUSDT',
  'SHIB': 'SHIBUSDT',
  'TRX': 'TRXUSDT',
  'AVAX': 'AVAXUSDT',
  'UNI': 'UNIUSDT',
  'ATOM': 'ATOMUSDT',
  'LTC': 'LTCUSDT',
  'LINK': 'LINKUSDT',
  'XRP': 'XRPUSDT',
  'BCH': 'BCHUSDT',
  'NEAR': 'NEARUSDT',
  'ALGO': 'ALGOUSDT',
  'VET': 'VETUSDT',
};

const coingeckoIds: { [key: string]: string } = {
  'ETH': 'ethereum',
  'SOL': 'solana',
  'BNB': 'binancecoin',
  'BTC': 'bitcoin',
  'ADA': 'cardano',
  'DOGE': 'dogecoin',
  'DOT': 'polkadot',
  'MATIC': 'matic-network',
  'SHIB': 'shiba-inu',
  'TRX': 'tron',
  'AVAX': 'avalanche-2',
  'UNI': 'uniswap',
  'ATOM': 'cosmos',
  'LTC': 'litecoin',
  'LINK': 'chainlink',
  'XRP': 'ripple',
  'BCH': 'bitcoin-cash',
  'NEAR': 'near',
  'ALGO': 'algorand',
  'VET': 'vechain',
};

export async function GET(request: NextRequest) {
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

        // Calculate market cap estimate based on known supplies
        let marketCap = 0;
        const supplies: { [key: string]: number } = {
          'ETH': 120437300, // Approximate ETH supply
          'SOL': 442000000, // Approximate SOL supply
          'BNB': 153856150, // Approximate BNB supply
          'BTC': 21000000, // BTC max supply
          'ADA': 45000000000, // ADA max supply
          'DOGE': 141000000000, // DOGE current supply
          'DOT': 1300000000, // DOT supply
          'MATIC': 10000000000, // MATIC max supply
          'SHIB': 589735000000000, // SHIB supply
          'TRX': 87000000000, // TRX supply
          'AVAX': 440000000, // AVAX supply
          'UNI': 1000000000, // UNI max supply
          'ATOM': 390000000, // ATOM supply
          'LTC': 84000000, // LTC max supply
          'LINK': 1000000000, // LINK max supply
          'XRP': 100000000000, // XRP max supply
          'BCH': 21000000, // BCH max supply
          'NEAR': 1000000000, // NEAR max supply
          'ALGO': 10000000000, // ALGO max supply
          'VET': 86712000000, // VET supply
        };

        if (supplies[symbol]) {
          marketCap = supplies[symbol] * parseFloat(data.lastPrice);
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