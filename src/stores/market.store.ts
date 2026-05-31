import { create } from 'zustand';
import { MarketPrice } from '@/services/market.service';

interface MarketState {
  prices: Record<string, MarketPrice>;
  lastFetchedAt: number;
  loading: boolean;
  error: string | null;

  setPrices: (prices: MarketPrice[]) => void;
  updatePrice: (symbol: string, update: Partial<MarketPrice>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  prices: {},
  lastFetchedAt: 0,
  loading: true,
  error: null,

  setPrices: (prices) => {
    const priceMap: Record<string, MarketPrice> = {};
    prices.forEach(p => { priceMap[p.symbol] = p; });
    set({ prices: priceMap, lastFetchedAt: Date.now(), loading: false, error: null });
  },

  updatePrice: (symbol, partial) => set((state) => ({
    prices: {
      ...state.prices,
      ...(state.prices[symbol] ? { [symbol]: { ...state.prices[symbol], ...partial } } : {}),
    },
  })),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}));
