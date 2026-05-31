'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMarketData } from '@/hooks/useMarketData';
import { authService } from '@/services/auth.service';
import { marketService, TradeSignal } from '@/services/market.service';
import { FaSignal, FaLock, FaChartLine, FaCrown, FaExclamationTriangle } from 'react-icons/fa';
import Link from 'next/link';
import toast from 'react-hot-toast';
import SignalHistory from '@/components/signals/SignalHistory';
import { signalHistoryService } from '@/services/signal-history.service';

export default function SignalsPage() {
  const { user, profile } = useAuth();
  const [signalLimit, setSignalLimit] = useState<{ allowed: boolean; remaining: number }>({
    allowed: true,
    remaining: 5,
  });
  const [generatedSignals, setGeneratedSignals] = useState<TradeSignal[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('ETH');
  const [loading, setLoading] = useState(false);

  const { prices, candles, fetchCandleData } = useMarketData({
    symbols: ['ETH', 'SOL', 'BNB'],
    enableRealtime: true,
  });

  // Check signal limit on mount and profile change
  useEffect(() => {
    if (user) {
      checkSignalLimit();
    }
  }, [user, profile]);

  const checkSignalLimit = async () => {
    if (!user) return;

    try {
      const limit = await authService.checkSignalLimit(user.uid);
      setSignalLimit(limit);
    } catch (error) {
      console.error('Error checking signal limit:', error);
    }
  };

  const generateSignal = async (symbol: string) => {
    if (!signalLimit.allowed && profile?.subscription?.status === 'free') {
      toast.error('Daily signal limit reached. Upgrade to Pro for unlimited signals!');
      return;
    }

    setLoading(true);
    try {
      // Ensure we have candle data
      if (!candles[symbol]) {
        await fetchCandleData(symbol);
      }

      // Generate the signal
      const signal = await marketService.generateSignal(symbol);

      // Update signal usage for free users
      if (user && profile?.subscription?.status === 'free') {
        await authService.incrementSignalUsage(user.uid);
        await checkSignalLimit(); // Refresh the limit
      }

      // Add to generated signals
      setGeneratedSignals(prev => [signal, ...prev.filter(s => s.symbol !== symbol)]);

      // Store signal in history
      if (user) {
        try {
          await signalHistoryService.storeSignal({
            userId: user.uid,
            symbol: signal.symbol,
            action: signal.action,
            confidence: signal.confidence,
            entryPrice: signal.price,
            targetPrice: signal.targetPrice,
            stopLoss: signal.stopLoss,
            reasoning: signal.reasoning,
          });
        } catch (err) {
          console.error('Error storing signal:', err);
        }
      }

      // Show success toast
      toast.success(`${signal.action} signal generated for ${symbol}`, {
        icon: signal.action === 'BUY' ? '📈' : signal.action === 'SELL' ? '📉' : '⏸️',
      });

    } catch (error) {
      console.error('Error generating signal:', error);
      toast.error('Failed to generate signal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getSignalColor = (action: string) => {
    switch (action) {
      case 'BUY':
        return 'text-green-400 bg-green-900/20';
      case 'SELL':
        return 'text-red-400 bg-red-900/20';
      default:
        return 'text-yellow-400 bg-yellow-900/20';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-400';
    if (confidence >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const isProUser = profile?.subscription?.status === 'pro';

  return (
    <>
      {/* Header */}
      <div className="bg-surface border-b border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                AI Trading Signals
              </h1>
              <p className="text-text-secondary">
                Advanced AI-powered trading recommendations
              </p>
            </div>
            {!isProUser && (
              <div className="text-right">
                <p className="text-sm text-text-secondary mb-1">
                  Signals remaining today
                </p>
                <p className="text-2xl font-bold text-primary">
                  {signalLimit.remaining} / 5
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Pro Upgrade Banner for Free Users */}
        {!isProUser && signalLimit.remaining <= 2 && (
          <div className="bg-primary/10 border border-primary rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <FaCrown className="text-4xl text-primary" />
                <div>
                  <h3 className="text-xl font-semibold text-white mb-1">
                    Running low on signals?
                  </h3>
                  <p className="text-text-secondary">
                    Upgrade to Pro for unlimited AI trading signals and advanced features
                  </p>
                </div>
              </div>
              <Link
                href="/pricing"
                className="btn-primary px-6 py-3"
              >
                Upgrade to Pro
              </Link>
            </div>
          </div>
        )}

        {/* Symbol Selection */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">
            Select Cryptocurrency
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {['ETH', 'SOL', 'BNB'].map((symbol) => {
              const price = prices[symbol];
              const signal = generatedSignals.find(s => s.symbol === symbol);

              return (
                <div
                  key={symbol}
                  className={`card p-6 cursor-pointer transition-all ${
                    selectedSymbol === symbol
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'hover:border-gray-600'
                  }`}
                  onClick={() => setSelectedSymbol(symbol)}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {symbol}
                      </h3>
                      <p className="text-sm text-text-secondary">
                        {symbol === 'ETH' && 'Ethereum'}
                        {symbol === 'SOL' && 'Solana'}
                        {symbol === 'BNB' && 'Binance Coin'}
                      </p>
                    </div>
                    {signal && (
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${getSignalColor(
                          signal.action
                        )}`}
                      >
                        {signal.action}
                      </span>
                    )}
                  </div>

                  {price && (
                    <div>
                      <p className="text-2xl font-bold text-white">
                        {marketService.formatPrice(price.price)}
                      </p>
                      <p
                        className={`text-sm mt-1 ${
                          price.changePercent24h > 0
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}
                      >
                        {price.changePercent24h > 0 ? '+' : ''}
                        {price.changePercent24h.toFixed(2)}% (24h)
                      </p>
                    </div>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      generateSignal(symbol);
                    }}
                    disabled={loading || (!signalLimit.allowed && !isProUser)}
                    className="mt-4 w-full btn-secondary py-2 text-sm"
                  >
                    {loading && selectedSymbol === symbol ? (
                      <span className="flex items-center justify-center">
                        <span className="animate-spin mr-2">⚡</span>
                        Analyzing...
                      </span>
                    ) : (
                      'Generate Signal'
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Generated Signals */}
        {generatedSignals.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-white mb-4">
              Generated Signals
            </h2>
            <div className="space-y-4">
              {generatedSignals.map((signal, index) => (
                <div
                  key={`${signal.symbol}-${index}`}
                  className="card p-6"
                >
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Signal Info */}
                    <div className="md:col-span-2">
                      <div className="flex items-center space-x-4 mb-4">
                        <div className="text-3xl">
                          <FaSignal className={getSignalColor(signal.action).split(' ')[0]} />
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-white">
                            {signal.symbol} - {signal.action} Signal
                          </h3>
                          <p className="text-text-secondary">
                            Generated {new Date(signal.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <p className="text-text-secondary mb-4">
                        {signal.reasoning}
                      </p>
                      <div className="flex items-center space-x-4">
                        <span className="text-sm text-text-secondary">
                          Confidence:
                        </span>
                        <div className="flex-1 bg-gray-800 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              signal.confidence >= 80
                                ? 'bg-green-500'
                                : signal.confidence >= 60
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${signal.confidence}%` }}
                          />
                        </div>
                        <span
                          className={`text-sm font-medium ${getConfidenceColor(
                            signal.confidence
                          )}`}
                        >
                          {signal.confidence}%
                        </span>
                      </div>
                    </div>

                    {/* Price Targets */}
                    <div className="md:col-span-2 grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-text-secondary mb-1">
                          Entry Price
                        </p>
                        <p className="text-lg font-semibold text-white">
                          {marketService.formatPrice(signal.price)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-text-secondary mb-1">
                          Target Price
                        </p>
                        <p className="text-lg font-semibold text-green-400">
                          {marketService.formatPrice(signal.targetPrice)}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {(
                            ((signal.targetPrice - signal.price) / signal.price) *
                            100
                          ).toFixed(2)}
                          %
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-text-secondary mb-1">
                          Stop Loss
                        </p>
                        <p className="text-lg font-semibold text-red-400">
                          {marketService.formatPrice(signal.stopLoss)}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {(
                            ((signal.stopLoss - signal.price) / signal.price) *
                            100
                          ).toFixed(2)}
                          %
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Risk Warning */}
                  <div className="mt-4 pt-4 border-t border-gray-800">
                    <p className="text-xs text-text-secondary flex items-center">
                      <FaExclamationTriangle className="mr-2 text-yellow-500" />
                      This is not financial advice. Always do your own research and manage your risk.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Signals State */}
        {generatedSignals.length === 0 && (
          <div className="card p-12 text-center">
            <FaChartLine className="text-6xl text-primary mb-4 mx-auto" />
            <h3 className="text-xl font-semibold text-white mb-2">
              No signals generated yet
            </h3>
            <p className="text-text-secondary mb-6">
              Select a cryptocurrency above and click "Generate Signal" to get AI-powered trading recommendations
            </p>
            {!isProUser && signalLimit.remaining === 0 && (
              <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mt-4">
                <p className="text-red-400 flex items-center justify-center">
                  <FaLock className="mr-2" />
                  Daily signal limit reached. Upgrade to Pro for unlimited signals.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Signal History */}
        {user && <SignalHistory userId={user.uid} />}

        {/* Features Info */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card p-6 text-center">
            <div className="text-3xl text-primary mb-4">🧠</div>
            <h3 className="text-lg font-semibold text-white mb-2">
              AI-Powered Analysis
            </h3>
            <p className="text-sm text-text-secondary">
              Advanced machine learning algorithms analyze multiple indicators
            </p>
          </div>
          <div className="card p-6 text-center">
            <div className="text-3xl text-primary mb-4">📊</div>
            <h3 className="text-lg font-semibold text-white mb-2">
              Technical Indicators
            </h3>
            <p className="text-sm text-text-secondary">
              RSI, MACD, Moving Averages, Volume Analysis, and more
            </p>
          </div>
          <div className="card p-6 text-center">
            <div className="text-3xl text-primary mb-4">⚡</div>
            <h3 className="text-lg font-semibold text-white mb-2">
              Real-Time Data
            </h3>
            <p className="text-sm text-text-secondary">
              Signals generated using live market data from Binance
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
