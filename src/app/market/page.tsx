'use client';

import React, { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import PriceCard from '@/components/market/PriceCard';
import PriceChart from '@/components/market/PriceChart';
import { useMarketData } from '@/hooks/useMarketData';
import { FaChartLine, FaRedo, FaSignal } from 'react-icons/fa';
import { marketService } from '@/services/market.service';
import toast from 'react-hot-toast';

export default function MarketPage() {
  return (
    <ProtectedRoute>
      <MarketContent />
    </ProtectedRoute>
  );
}

function MarketContent() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('ETH');
  const [showChart, setShowChart] = useState(false);

  const {
    prices,
    candles,
    signals,
    loading,
    error,
    refetch,
    fetchCandleData,
    generateSignal,
  } = useMarketData({
    symbols: ['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'XRP', 'DOGE', 'DOT', 'MATIC', 'SHIB', 'TRX', 'AVAX', 'UNI', 'ATOM', 'LTC', 'LINK', 'BCH', 'NEAR', 'ALGO', 'VET'],
    enableRealtime: true,
  });

  // Fetch candle data when symbol is selected
  useEffect(() => {
    if (selectedSymbol && !candles[selectedSymbol]) {
      fetchCandleData(selectedSymbol);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol]); // Only depend on selectedSymbol to avoid infinite loop

  const handleCardClick = (symbol: string) => {
    setSelectedSymbol(symbol);
    setShowChart(true);
    if (!candles[symbol]) {
      fetchCandleData(symbol);
    }
  };

  const handleGenerateSignal = async (symbol: string) => {
    try {
      await generateSignal(symbol);
    } catch (error) {
      // Error already handled in hook
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-surface border-b border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                Market Overview
              </h1>
              <p className="text-text-secondary">
                Real-time cryptocurrency prices and trading signals
              </p>
            </div>
            <button
              onClick={refetch}
              className="btn-secondary flex items-center space-x-2"
              disabled={loading}
            >
              <FaRedo className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Error State */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && Object.keys(prices).length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 mb-8">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="card p-6 animate-pulse">
                <div className="h-32 bg-gray-800 rounded"></div>
              </div>
            ))}
          </div>
        )}

        {/* Price Cards */}
        {!loading || Object.keys(prices).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-8">
            {Object.values(prices)
              .sort((a, b) => {
                // Sort by market cap (price * supply) or price
                const aMarketCap = a.marketCap || a.price;
                const bMarketCap = b.marketCap || b.price;
                return bMarketCap - aMarketCap;
              })
              .map((price) => (
                <div key={price.symbol} className="relative">
                  <PriceCard
                    price={price}
                    onClick={() => handleCardClick(price.symbol)}
                  />
                  <button
                    onClick={() => handleGenerateSignal(price.symbol)}
                    className="absolute top-4 right-4 p-2 bg-primary/20 hover:bg-primary/30 rounded-lg text-primary transition-colors"
                    title="Generate Trading Signal"
                  >
                    <FaSignal />
                  </button>
                </div>
              ))}
          </div>
        ) : null}

        {/* Trading Signals */}
        {Object.keys(signals).length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              Trading Signals
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.values(signals).map((signal) => (
                <div
                  key={signal.symbol}
                  className={`card p-6 border-2 ${
                    signal.action === 'BUY'
                      ? 'border-green-800 bg-green-900/10'
                      : signal.action === 'SELL'
                      ? 'border-red-800 bg-red-900/10'
                      : 'border-gray-700 bg-gray-800/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">
                      {signal.symbol}
                    </h3>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        signal.action === 'BUY'
                          ? 'bg-green-900/50 text-green-400'
                          : signal.action === 'SELL'
                          ? 'bg-red-900/50 text-red-400'
                          : 'bg-gray-800/50 text-gray-400'
                      }`}
                    >
                      {signal.action}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Confidence</span>
                      <span className="text-white font-medium">
                        {signal.confidence}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Current Price</span>
                      <span className="text-white">
                        {marketService.formatPrice(signal.price)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Target Price</span>
                      <span className="text-green-400">
                        {marketService.formatPrice(signal.targetPrice)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Stop Loss</span>
                      <span className="text-red-400">
                        {marketService.formatPrice(signal.stopLoss)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-800">
                    <p className="text-xs text-text-secondary">
                      {signal.reasoning}
                    </p>
                    <p className="text-xs text-text-secondary mt-2">
                      Generated: {new Date(signal.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Price Chart */}
        {showChart && selectedSymbol && candles[selectedSymbol] && (
          <div className="mt-8">
            <PriceChart
              symbol={selectedSymbol}
              candles={candles[selectedSymbol]}
              height={400}
            />
          </div>
        )}

        {/* No Chart Data */}
        {showChart && selectedSymbol && !candles[selectedSymbol] && (
          <div className="card p-8 text-center mt-8">
            <div className="animate-pulse">
              <div className="h-96 bg-gray-800 rounded"></div>
              <p className="text-text-secondary mt-4">
                Loading chart data for {selectedSymbol}...
              </p>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!showChart && (
          <div className="card p-8 text-center">
            <FaChartLine className="text-6xl text-primary mb-4 mx-auto" />
            <h3 className="text-xl font-semibold text-white mb-2">
              Click on a price card to view charts
            </h3>
            <p className="text-text-secondary">
              Select any cryptocurrency above to see detailed price charts and generate AI-powered trading signals
            </p>
          </div>
        )}
      </div>
    </div>
  );
}