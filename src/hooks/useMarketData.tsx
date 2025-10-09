'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { marketService, MarketPrice, CandleData, TradeSignal } from '@/services/market.service';
import { websocketService, PriceUpdate } from '@/services/websocket.service';
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

export function useMarketData(options: UseMarketDataOptions = {}) {
  const {
    symbols = ['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'XRP', 'DOGE', 'DOT', 'MATIC', 'SHIB', 'TRX', 'AVAX', 'UNI', 'ATOM', 'LTC', 'LINK', 'BCH', 'NEAR', 'ALGO', 'VET'],
    enableRealtime = true,
    interval = '1h',
  } = options;

  const [data, setData] = useState<MarketData>({
    prices: {},
    candles: {},
    signals: {},
    loading: true,
    error: null,
  });

  const isFetchingRef = useRef(false);
  const hasInitializedRef = useRef(false);

  // Fetch initial market data
  const fetchMarketData = useCallback(async () => {
    if (isFetchingRef.current) return; // Prevent concurrent fetches

    try {
      isFetchingRef.current = true;
      setData(prev => ({ ...prev, loading: true, error: null }));

      // Fetch prices for all symbols in parallel
      const pricePromises = symbols.map(async (symbol) => {
        try {
          const price = await marketService.getCurrentPrice(symbol);
          return { symbol, price };
        } catch (error) {
          console.error(`Error fetching price for ${symbol}:`, error);
          return { symbol, price: null };
        }
      });

      const priceResults = await Promise.all(pricePromises);

      // Update prices
      const newPrices: { [symbol: string]: MarketPrice } = {};
      priceResults.forEach(({ symbol, price }) => {
        if (price) {
          newPrices[symbol] = price;
        }
      });

      setData(prev => ({
        ...prev,
        prices: newPrices,
        loading: false,
      }));
    } catch (error) {
      console.error('Error fetching market data:', error);
      setData(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to fetch market data',
      }));
      toast.error('Failed to fetch market data');
    } finally {
      isFetchingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Remove symbols dependency to prevent recreation

  // Fetch candle data for a specific symbol
  const fetchCandleData = useCallback(async (symbol: string) => {
    try {
      const candles = await marketService.getCandleData(symbol, interval, 100);
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
      setData(prev => ({
        ...prev,
        signals: {
          ...prev.signals,
          [symbol]: signal,
        },
      }));

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

  // Handle real-time price updates
  const handlePriceUpdate = useCallback((update: PriceUpdate) => {
    setData(prev => {
      const currentPrice = prev.prices[update.symbol];
      if (!currentPrice) return prev;

      return {
        ...prev,
        prices: {
          ...prev.prices,
          [update.symbol]: {
            ...currentPrice,
            price: update.price,
            lastUpdate: new Date(update.timestamp),
          },
        },
      };
    });
  }, []);

  // Initial data fetch
  useEffect(() => {
    if (!hasInitializedRef.current && symbols.length > 0) {
      hasInitializedRef.current = true;
      fetchMarketData();
    }
  }, [fetchMarketData, symbols.length]); // Safe dependencies

  // Subscribe to real-time updates
  useEffect(() => {
    if (!enableRealtime) return;

    const unsubscribes: (() => void)[] = [];

    symbols.forEach(symbol => {
      const unsubscribe = websocketService.subscribe(symbol, handlePriceUpdate);
      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [symbols, enableRealtime, handlePriceUpdate]);

  // Refresh data periodically
  useEffect(() => {
    if (symbols.length === 0) return;

    const refreshInterval = setInterval(() => {
      fetchMarketData();
    }, 60000); // Refresh every minute

    return () => clearInterval(refreshInterval);
  }, [fetchMarketData]); // Depend on fetchMarketData which is now stable

  return {
    ...data,
    refetch: fetchMarketData,
    fetchCandleData,
    generateSignal,
  };
}

// Hook for a single symbol
export function useSymbolData(symbol: string, options: Omit<UseMarketDataOptions, 'symbols'> = {}) {
  const { prices, candles, signals, loading, error, fetchCandleData, generateSignal } = useMarketData({
    ...options,
    symbols: [symbol],
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