import { CoinSymbol } from './signal.types';

export interface MarketData {
  coin: CoinSymbol;
  price: number;
  volume24h: number;
  change24h: number;
  changePercentage24h: number;
  high24h: number;
  low24h: number;
  marketCap: number;
  timestamp: Date;
}

export interface PriceHistory {
  coin: CoinSymbol;
  prices: PricePoint[];
  timeframe: '1h' | '4h' | '1d' | '1w' | '1m';
}

export interface PricePoint {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Coin names/icons/supplies live in the catalogue: see CoinMeta, getCoinName()
// and getCoinIcon() in src/lib/coins.ts.
