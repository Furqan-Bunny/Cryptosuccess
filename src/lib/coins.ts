// Shared catalogue of the cryptocurrencies the app supports on the market /
// coin-detail screens. Centralises the symbol -> name/icon mapping that was
// previously duplicated across PriceCard, the market page and useMarketData.

export interface CoinMeta {
  symbol: string;
  name: string;
  icon: string;
}

export const COINS: CoinMeta[] = [
  { symbol: 'BTC', name: 'Bitcoin', icon: '₿' },
  { symbol: 'ETH', name: 'Ethereum', icon: '⟠' },
  { symbol: 'BNB', name: 'Binance Coin', icon: '⬡' },
  { symbol: 'SOL', name: 'Solana', icon: '◎' },
  { symbol: 'ADA', name: 'Cardano', icon: '₳' },
  { symbol: 'XRP', name: 'Ripple', icon: '✕' },
  { symbol: 'DOGE', name: 'Dogecoin', icon: '🐕' },
  { symbol: 'DOT', name: 'Polkadot', icon: '●' },
  { symbol: 'MATIC', name: 'Polygon', icon: '⬡' },
  { symbol: 'SHIB', name: 'Shiba Inu', icon: '🐕' },
  { symbol: 'TRX', name: 'TRON', icon: '⟁' },
  { symbol: 'AVAX', name: 'Avalanche', icon: '🔺' },
  { symbol: 'UNI', name: 'Uniswap', icon: '🦄' },
  { symbol: 'ATOM', name: 'Cosmos', icon: '⚛' },
  { symbol: 'LTC', name: 'Litecoin', icon: 'Ł' },
  { symbol: 'LINK', name: 'Chainlink', icon: '⬡' },
  { symbol: 'BCH', name: 'Bitcoin Cash', icon: '₿' },
  { symbol: 'NEAR', name: 'NEAR Protocol', icon: 'Ⓝ' },
  { symbol: 'ALGO', name: 'Algorand', icon: '◇' },
  { symbol: 'VET', name: 'VeChain', icon: '✓' },
];

export const COIN_SYMBOLS: string[] = COINS.map(c => c.symbol);

const COIN_BY_SYMBOL: Record<string, CoinMeta> = COINS.reduce((acc, c) => {
  acc[c.symbol] = c;
  return acc;
}, {} as Record<string, CoinMeta>);

export function isSupportedCoin(symbol: string): boolean {
  return symbol.toUpperCase() in COIN_BY_SYMBOL;
}

export function getCoinMeta(symbol: string): CoinMeta | undefined {
  return COIN_BY_SYMBOL[symbol.toUpperCase()];
}

export function getCoinName(symbol: string): string {
  return COIN_BY_SYMBOL[symbol.toUpperCase()]?.name ?? symbol;
}

export function getCoinIcon(symbol: string): string {
  return COIN_BY_SYMBOL[symbol.toUpperCase()]?.icon ?? '●';
}

// Coins the AI model is explicitly tuned for (see services/ai/coin-profiles.ts).
// Other coins still get a signal, but via a generic fallback profile.
export const AI_PROFILED_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB'];

export function isAiProfiled(symbol: string): boolean {
  return AI_PROFILED_SYMBOLS.includes(symbol.toUpperCase());
}
