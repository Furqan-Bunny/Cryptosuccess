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

export interface CoinInfo {
  symbol: CoinSymbol;
  name: string;
  logo: string;
  description?: string;
  website?: string;
  marketRank?: number;
}

export const COIN_INFO: Record<CoinSymbol, CoinInfo> = {
  ETH: {
    symbol: 'ETH',
    name: 'Ethereum',
    logo: '/coins/eth.svg',
    description: 'Decentralized smart contract platform',
    website: 'https://ethereum.org',
  },
  SOL: {
    symbol: 'SOL',
    name: 'Solana',
    logo: '/coins/sol.svg',
    description: 'High-performance blockchain platform',
    website: 'https://solana.com',
  },
  BNB: {
    symbol: 'BNB',
    name: 'Binance Coin',
    logo: '/coins/bnb.svg',
    description: 'Native token of Binance ecosystem',
    website: 'https://www.binance.com',
  },
};