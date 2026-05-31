'use client';

import { useEffect, useState } from 'react';
import {
  marketService,
  MarketPrice,
  CandleData,
  OrderBookData,
} from '@/services/market.service';

interface CoinData {
  price: MarketPrice | null;
  candles: CandleData[];
  orderBook: OrderBookData | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches everything the coin detail page needs: current price, candles for the
 * selected timeframe, and the order book. Re-fetches when symbol/interval/limit
 * change. Candle data drives all client-side indicator/regime computation.
 */
export function useCoinData(symbol: string, interval: string, limit: number): CoinData {
  const [data, setData] = useState<CoinData>({
    price: null,
    candles: [],
    orderBook: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;
    setData(prev => ({ ...prev, loading: true, error: null }));

    Promise.all([
      marketService.getCurrentPrice(symbol),
      marketService.getCandleData(symbol, interval, limit),
      marketService.getOrderBook(symbol, 20).catch(() => null),
    ])
      .then(([price, candles, orderBook]) => {
        if (!mounted) return;
        setData({ price, candles, orderBook, loading: false, error: null });
      })
      .catch(() => {
        if (!mounted) return;
        setData(prev => ({ ...prev, loading: false, error: 'Failed to load coin data' }));
      });

    return () => {
      mounted = false;
    };
  }, [symbol, interval, limit]);

  return data;
}
