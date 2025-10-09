import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const BINANCE_API_URL = 'https://api.binance.com/api/v3';

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

const supplies: { [key: string]: number } = {
  'ETH': 120437300,
  'SOL': 442000000,
  'BNB': 153856150,
  'BTC': 21000000,
  'ADA': 45000000000,
  'DOGE': 141000000000,
  'DOT': 1300000000,
  'MATIC': 10000000000,
  'SHIB': 589735000000000,
  'TRX': 87000000000,
  'AVAX': 440000000,
  'UNI': 1000000000,
  'ATOM': 390000000,
  'LTC': 84000000,
  'LINK': 1000000000,
  'XRP': 100000000000,
  'BCH': 21000000,
  'NEAR': 1000000000,
  'ALGO': 10000000000,
  'VET': 86712000000,
};

export async function GET(request: NextRequest) {
  try {
    // Get all symbols in one request
    const symbols = Object.values(symbolMap);

    // Fetch 24hr ticker data for all symbols
    const response = await axios.get(`${BINANCE_API_URL}/ticker/24hr`, {
      timeout: 10000,
    });

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

    return NextResponse.json(result);
  } catch (error) {
    console.error('Market API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market data' },
      { status: 500 }
    );
  }
}