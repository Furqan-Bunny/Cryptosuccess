export type VolatilityClass = 'low' | 'medium' | 'high' | 'extreme';

export interface CoinProfile {
  symbol: string;
  name: string;
  volatilityClass: VolatilityClass;
  typicalATRPercent: number;
  maxPositionSizePct: number;
  minStopATRMultiple: number;
  maxStopATRMultiple: number;
}

export const COIN_PROFILES: Record<string, CoinProfile> = {
  BTC: {
    symbol: 'BTC', name: 'Bitcoin',
    volatilityClass: 'low',
    typicalATRPercent: 2.5,
    maxPositionSizePct: 30,
    minStopATRMultiple: 1.5,
    maxStopATRMultiple: 2.5,
  },
  ETH: {
    symbol: 'ETH', name: 'Ethereum',
    volatilityClass: 'medium',
    typicalATRPercent: 3.0,
    maxPositionSizePct: 25,
    minStopATRMultiple: 1.5,
    maxStopATRMultiple: 3,
  },
  SOL: {
    symbol: 'SOL', name: 'Solana',
    volatilityClass: 'high',
    typicalATRPercent: 5.0,
    maxPositionSizePct: 15,
    minStopATRMultiple: 2,
    maxStopATRMultiple: 4,
  },
  BNB: {
    symbol: 'BNB', name: 'Binance Coin',
    volatilityClass: 'medium',
    typicalATRPercent: 3.5,
    maxPositionSizePct: 20,
    minStopATRMultiple: 1.5,
    maxStopATRMultiple: 3,
  },
};

export function getCoinProfile(symbol: string): CoinProfile {
  return COIN_PROFILES[symbol] || {
    symbol, name: symbol,
    volatilityClass: 'high' as VolatilityClass,
    typicalATRPercent: 5.0,
    maxPositionSizePct: 10,
    minStopATRMultiple: 2,
    maxStopATRMultiple: 4,
  };
}
