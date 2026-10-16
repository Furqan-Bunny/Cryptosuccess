'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { marketService, MarketPrice, CandleData, TradeSignal } from '@/services/market.service';
import { websocketService, PriceUpdate } from '@/services/websocket.service';
import { useMarketStore } from '@/stores/market.store';
import { COIN_SYMBOLS } from '@/lib/coins';
import toast from 'react-hot-toast';

interface UseMarketDataOptions {
  symbols?: string[];
  enableRealtime?: boolean;
  interval?: string;
}

interface MarketData {
  prices: { [symbol: string]: MarketPrice };
  candles: { [symbol: string]: CandleData[] };
  signals: { [symbol: string]: TradeSignal };
  loading: boolean;
  error: string | null;
}

const REFRESH_MS = 60_000;
// Live ticks are buffered and applied at most this often, so 50 streaming
// coins cause one re-render per second instead of one per tick.
const TICK_FLUSH_MS = 1_000;

function pickPrices(all: Record<string, MarketPrice>, symbols: string[]): Record<string, MarketPrice> {
  const out: Record<string, MarketPrice> = {};
  for (const s of symbols) {
    if (all[s]) out[s] = all[s];
  }
  return out;
}

export function useMarketData(options: UseMarketDataOptions = {}) {
  const {
    symbols = COIN_SYMBOLS,
    enableRealtime = true,
    interval = '1h',
  } = options;

  // Callers often pass a fresh array each render; key everything off the
  // CONTENT so a new-but-equal array never triggers refetches/resubscribes.
  const symbolsKey = useMemo(
    () => Array.from(new Set(symbols.map(s => s.toUpperCase()))).sort().join(','),
    [symbols]
  );
  const symbolList = useMemo(() => (symbolsKey ? symbolsKey.split(',') : []), [symbolsKey]);
  const hasSymbols = symbolList.length > 0;

  const [data, setData] = useState<MarketData>({
    prices: {},
    candles: {},
    signals: {},
    loading: hasSymbols,
    error: null,
  });

  // Latest symbols, readable from stable callbacks (fixes the stale-closure bug
  // where the first render's symbols were used forever).
  const symbolsRef = useRef<string[]>(symbolList);
  // Every price we know about (full /api/market/all payload + live ticks), so a
  // symbols change can be re-filtered locally without another network call.
  const allPricesRef = useRef<Record<string, MarketPrice>>({});
  const isFetchingRef = useRef(false);
  const hasFetchedRef = useRef(false);
  const mountedRef = useRef(true);
  const pendingTicksRef = useRef<Map<string, PriceUpdate>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const pendingTicks = pendingTicksRef.current; // same Map for the hook's lifetime
    return () => {
      mountedRef.current = false;
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
      pendingTicks.clear();
    };
  }, []);

  // Fetch all market prices — single batch call instead of N individual calls.
  // Stable identity; reads the current symbols through the ref.
  const fetchMarketData = useCallback(async () => {
    if (isFetchingRef.current) return;

    try {
      isFetchingRef.current = true;
      setData(prev => ({ ...prev, loading: true, error: null }));

      const allPrices = await marketService.getAllPrices();
      if (!mountedRef.current) return;

      const map: Record<string, MarketPrice> = {};
      allPrices.forEach(p => {
        map[p.symbol] = p;
      });
      allPricesRef.current = map;
      hasFetchedRef.current = true;

      // Sync to the shared store without subscribing this component to it.
      useMarketStore.getState().setPrices(allPrices);

      setData(prev => ({
        ...prev,
        prices: pickPrices(map, symbolsRef.current),
        loading: false,
      }));
    } catch (error) {
      console.error('Error fetching market data:', error);
      if (!mountedRef.current) return;
      setData(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to fetch market data',
      }));
      toast.error('Failed to fetch market data', { id: 'market-data-error' });
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  // Symbols changed: re-filter from what we already have (no refetch storm),
  // and only hit the network for the very first load.
  useEffect(() => {
    symbolsRef.current = symbolList;
    if (!hasSymbols) {
      setData(prev => ({ ...prev, prices: {}, loading: false }));
      return;
    }
    if (hasFetchedRef.current) {
      setData(prev => ({ ...prev, prices: pickPrices(allPricesRef.current, symbolList) }));
    } else {
      fetchMarketData();
    }
  }, [symbolList, hasSymbols, fetchMarketData]);

  // Fetch candle data for a specific symbol
  const fetchCandleData = useCallback(async (symbol: string) => {
    try {
      const candles = await marketService.getCandleData(symbol, interval, 100);
      if (!mountedRef.current) return;
      setData(prev => ({
        ...prev,
        candles: {
          ...prev.candles,
          [symbol]: candles,
        },
      }));
    } catch (error) {
      console.error(`Error fetching candle data for ${symbol}:`, error);
    }
  }, [interval]);

  // Generate trading signal for a symbol
  const generateSignal = useCallback(async (symbol: string) => {
    try {
      const signal = await marketService.generateSignal(symbol);
      if (mountedRef.current) {
        setData(prev => ({
          ...prev,
          signals: {
            ...prev.signals,
            [symbol]: signal,
          },
        }));
      }

      // Show notification for high-confidence signals
      if (signal.confidence >= 70) {
        toast.success(
          `${signal.action} Signal: ${symbol} at ${marketService.formatPrice(signal.price)} (${signal.confidence}% confidence)`,
          {
            duration: 5000,
            icon: signal.action === 'BUY' ? '📈' : signal.action === 'SELL' ? '📉' : '⏸️',
          }
        );
      }

      return signal;
    } catch (error) {
      console.error(`Error generating signal for ${symbol}:`, error);
      toast.error(`Failed to generate signal for ${symbol}`);
      throw error;
    }
  }, []);

  // Apply buffered live ticks in one state update.
  const flushTicks = useCallback(() => {
    flushTimerRef.current = null;
    const ticks = pendingTicksRef.current;
    if (ticks.size === 0 || !mountedRef.current) return;
    const batch = Array.from(ticks.values());
    ticks.clear();

    const store = useMarketStore.getState();
    for (const t of batch) {
      const known = allPricesRef.current[t.symbol];
      if (!known) continue;
      const patch = { price: t.price, lastUpdate: new Date(t.timestamp) };
      allPricesRef.current[t.symbol] = { ...known, ...patch };
      store.updatePrice(t.symbol, patch);
    }

    setData(prev => {
      let changed = false;
      const next = { ...prev.prices };
      for (const t of batch) {
        const current = next[t.symbol];
        if (!current) continue;
        next[t.symbol] = { ...current, price: t.price, lastUpdate: new Date(t.timestamp) };
        changed = true;
      }
      return changed ? { ...prev, prices: next } : prev;
    });
  }, []);

  const handlePriceUpdate = useCallback((update: PriceUpdate) => {
    if (!Number.isFinite(update.price) || update.price <= 0) return;
    pendingTicksRef.current.set(update.symbol, update); // keep only the latest per symbol
    if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(flushTicks, TICK_FLUSH_MS);
    }
  }, [flushTicks]);

  // Subscribe to real-time updates (re-runs only when the symbol SET changes)
  useEffect(() => {
    if (!enableRealtime || !hasSymbols) return;

    const unsubscribes = symbolList.map(symbol => websocketService.subscribe(symbol, handlePriceUpdate));

    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [symbolList, hasSymbols, enableRealtime, handlePriceUpdate]);

  // Refresh periodically (skipped while the tab is hidden)
  useEffect(() => {
    if (!hasSymbols) return;

    const refreshInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchMarketData();
    }, REFRESH_MS);

    return () => clearInterval(refreshInterval);
  }, [hasSymbols, fetchMarketData]);

  return {
    ...data,
    refetch: fetchMarketData,
    fetchCandleData,
    generateSignal,
  };
}

// Hook for a single symbol
export function useSymbolData(symbol: string, options: Omit<UseMarketDataOptions, 'symbols'> = {}) {
  const symbols = useMemo(() => [symbol], [symbol]);
  const { prices, candles, signals, loading, error, fetchCandleData, generateSignal } = useMarketData({
    ...options,
    symbols,
  });

  return {
    price: prices[symbol],
    candles: candles[symbol] || [],
    signal: signals[symbol],
    loading,
    error,
    fetchCandleData: () => fetchCandleData(symbol),
    generateSignal: () => generateSignal(symbol),
  };
}
