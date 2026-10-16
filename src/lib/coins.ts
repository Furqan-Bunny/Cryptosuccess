// Shared catalogue of the cryptocurrencies the app supports on the market /
// coin-detail screens. Centralises the symbol -> name/icon/supply mapping that
// was previously duplicated across PriceCard, the market page, useMarketData and
// the /api/market routes. This is the single source of truth for the tradable
// universe — add a coin here and it propagates everywhere.
//
// Every symbol must be a Binance USDT pair whose status is TRADING. A halted pair
// (status BREAK — MATIC, MKR and EOS after their token migrations) still answers
// the price endpoints with a frozen price, so it must be replaced, not kept.

export interface CoinMeta {
  symbol: string;
  name: string;
  icon: string;
  // Approximate circulating/max supply, used only for a rough market-cap
  // estimate (price * supply). Omit/0 if unknown — the UI degrades gracefully.
  supply?: number;
}

export const COINS: CoinMeta[] = [
  { symbol: 'BTC', name: 'Bitcoin', icon: '₿', supply: 21000000 },
  { symbol: 'ETH', name: 'Ethereum', icon: '⟠', supply: 120437300 },
  { symbol: 'BNB', name: 'Binance Coin', icon: '⬡', supply: 153856150 },
  { symbol: 'SOL', name: 'Solana', icon: '◎', supply: 442000000 },
  { symbol: 'ADA', name: 'Cardano', icon: '₳', supply: 45000000000 },
  { symbol: 'XRP', name: 'Ripple', icon: '✕', supply: 100000000000 },
  { symbol: 'DOGE', name: 'Dogecoin', icon: '🐕', supply: 141000000000 },
  { symbol: 'DOT', name: 'Polkadot', icon: '●', supply: 1300000000 },
  { symbol: 'POL', name: 'Polygon', icon: '⬡', supply: 10500000000 },
  { symbol: 'SHIB', name: 'Shiba Inu', icon: '🐕', supply: 589735000000000 },
  { symbol: 'TRX', name: 'TRON', icon: '⟁', supply: 87000000000 },
  { symbol: 'AVAX', name: 'Avalanche', icon: '🔺', supply: 440000000 },
  { symbol: 'UNI', name: 'Uniswap', icon: '🦄', supply: 1000000000 },
  { symbol: 'ATOM', name: 'Cosmos', icon: '⚛', supply: 390000000 },
  { symbol: 'LTC', name: 'Litecoin', icon: 'Ł', supply: 84000000 },
  { symbol: 'LINK', name: 'Chainlink', icon: '⬡', supply: 1000000000 },
  { symbol: 'BCH', name: 'Bitcoin Cash', icon: '₿', supply: 21000000 },
  { symbol: 'NEAR', name: 'NEAR Protocol', icon: 'Ⓝ', supply: 1000000000 },
  { symbol: 'ALGO', name: 'Algorand', icon: '◇', supply: 10000000000 },
  { symbol: 'VET', name: 'VeChain', icon: '✓', supply: 86712000000 },
  { symbol: 'APT', name: 'Aptos', icon: '🅰', supply: 600000000 },
  { symbol: 'ARB', name: 'Arbitrum', icon: '◣', supply: 4000000000 },
  { symbol: 'OP', name: 'Optimism', icon: '🔴', supply: 1500000000 },
  { symbol: 'FIL', name: 'Filecoin', icon: '⬢', supply: 600000000 },
  { symbol: 'ICP', name: 'Internet Computer', icon: '∞', supply: 500000000 },
  { symbol: 'IMX', name: 'Immutable', icon: '◈', supply: 1800000000 },
  { symbol: 'INJ', name: 'Injective', icon: '🌀', supply: 100000000 },
  { symbol: 'SUI', name: 'Sui', icon: '💧', supply: 3000000000 },
  { symbol: 'SEI', name: 'Sei', icon: '🌊', supply: 4000000000 },
  { symbol: 'TIA', name: 'Celestia', icon: '✦', supply: 200000000 },
  { symbol: 'HBAR', name: 'Hedera', icon: 'ℏ', supply: 36000000000 },
  { symbol: 'STX', name: 'Stacks', icon: '◳', supply: 1500000000 },
  { symbol: 'GRT', name: 'The Graph', icon: '◉', supply: 9500000000 },
  { symbol: 'AAVE', name: 'Aave', icon: '👻', supply: 15000000 },
  { symbol: 'SKY', name: 'Sky (ex-Maker)', icon: 'Μ', supply: 23460000000 },
  { symbol: 'SAND', name: 'The Sandbox', icon: '🏖', supply: 2400000000 },
  { symbol: 'MANA', name: 'Decentraland', icon: '🌐', supply: 1900000000 },
  { symbol: 'AXS', name: 'Axie Infinity', icon: '🎮', supply: 150000000 },
  { symbol: 'THETA', name: 'Theta Network', icon: 'θ', supply: 1000000000 },
  { symbol: 'EGLD', name: 'MultiversX', icon: '𝓔', supply: 27000000 },
  { symbol: 'FLOW', name: 'Flow', icon: '🌊', supply: 1500000000 },
  { symbol: 'CHZ', name: 'Chiliz', icon: '🌶', supply: 9000000000 },
  { symbol: 'XLM', name: 'Stellar', icon: '✷', supply: 30000000000 },
  { symbol: 'XTZ', name: 'Tezos', icon: 'ꜩ', supply: 1000000000 },
  { symbol: 'ETC', name: 'Ethereum Classic', icon: '⟠', supply: 150000000 },
  { symbol: 'CRV', name: 'Curve DAO', icon: '⟿', supply: 1300000000 },
  { symbol: 'LDO', name: 'Lido DAO', icon: '🧊', supply: 900000000 },
  { symbol: 'GALA', name: 'Gala', icon: '🎲', supply: 38000000000 },
  { symbol: 'PEPE', name: 'Pepe', icon: '🐸', supply: 420690000000000 },
  { symbol: 'RUNE', name: 'THORChain', icon: 'ᚱ', supply: 340000000 },
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

/** App symbol -> Binance USDT spot pair (e.g. BTC -> BTCUSDT). */
export function getBinanceSymbol(symbol: string): string {
  return `${symbol.toUpperCase()}USDT`;
}

/** symbol -> Binance pair map, derived from COINS (for server routes). */
export const SYMBOL_TO_BINANCE: Record<string, string> = COINS.reduce((acc, c) => {
  acc[c.symbol] = getBinanceSymbol(c.symbol);
  return acc;
}, {} as Record<string, string>);

/** symbol -> approximate supply map (for market-cap estimates). */
export const COIN_SUPPLIES: Record<string, number> = COINS.reduce((acc, c) => {
  if (c.supply) acc[c.symbol] = c.supply;
  return acc;
}, {} as Record<string, number>);

// Coins the AI model is explicitly tuned for (see services/ai/coin-profiles.ts).
// Other coins still get a signal, but via a generic fallback profile.
export const AI_PROFILED_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB'];

export function isAiProfiled(symbol: string): boolean {
  return AI_PROFILED_SYMBOLS.includes(symbol.toUpperCase());
}
