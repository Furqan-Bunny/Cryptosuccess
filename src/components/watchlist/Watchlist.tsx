'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMarketData } from '@/hooks/useMarketData';
import { marketService } from '@/services/market.service';
import { authService } from '@/services/auth.service';
import { FaPlus, FaTimes, FaStar, FaChartLine } from 'react-icons/fa';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import toast from 'react-hot-toast';
import Link from 'next/link';

// Available cryptocurrencies
const AVAILABLE_CRYPTOS = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'BNB', name: 'Binance Coin' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'ADA', name: 'Cardano' },
  { symbol: 'XRP', name: 'Ripple' },
  { symbol: 'DOGE', name: 'Dogecoin' },
  { symbol: 'DOT', name: 'Polkadot' },
  { symbol: 'MATIC', name: 'Polygon' },
  { symbol: 'SHIB', name: 'Shiba Inu' },
  { symbol: 'TRX', name: 'TRON' },
  { symbol: 'AVAX', name: 'Avalanche' },
  { symbol: 'UNI', name: 'Uniswap' },
  { symbol: 'ATOM', name: 'Cosmos' },
  { symbol: 'LTC', name: 'Litecoin' },
  { symbol: 'LINK', name: 'Chainlink' },
  { symbol: 'BCH', name: 'Bitcoin Cash' },
  { symbol: 'NEAR', name: 'NEAR Protocol' },
  { symbol: 'ALGO', name: 'Algorand' },
  { symbol: 'VET', name: 'VeChain' },
];

interface WatchlistProps {
  onSelectSymbol?: (symbol: string) => void;
}

export default function Watchlist({ onSelectSymbol }: WatchlistProps) {
  const { user, profile, refreshProfile } = useAuth();
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const { prices } = useMarketData({
    symbols: watchlist,
    enableRealtime: true,
  });

  // Load watchlist from user profile
  useEffect(() => {
    if (profile?.preferences?.watchlist) {
      setWatchlist(profile.preferences.watchlist);
    }
  }, [profile]);

  const isProUser = profile?.subscription?.status === 'pro';
  const maxWatchlistSize = isProUser ? 50 : 5;

  const addToWatchlist = async (symbol: string) => {
    if (watchlist.includes(symbol)) {
      toast.error(`${symbol} is already in your watchlist`);
      return;
    }

    if (!isProUser && watchlist.length >= maxWatchlistSize) {
      toast.error(`Free users can only watch up to ${maxWatchlistSize} cryptocurrencies. Upgrade to Pro for unlimited watchlist.`);
      return;
    }

    setLoading(true);
    try {
      const newWatchlist = [...watchlist, symbol];

      if (user) {
        await updateDoc(doc(db, 'users', user.uid), {
          'preferences.watchlist': newWatchlist,
        });
        await refreshProfile();
      }

      setWatchlist(newWatchlist);
      toast.success(`${symbol} added to watchlist`);
      setShowAddModal(false);
    } catch (error) {
      console.error('Error adding to watchlist:', error);
      toast.error('Failed to update watchlist');
    } finally {
      setLoading(false);
    }
  };

  const removeFromWatchlist = async (symbol: string) => {
    setLoading(true);
    try {
      const newWatchlist = watchlist.filter((s) => s !== symbol);

      if (user) {
        await updateDoc(doc(db, 'users', user.uid), {
          'preferences.watchlist': newWatchlist,
        });
        await refreshProfile();
      }

      setWatchlist(newWatchlist);
      toast.success(`${symbol} removed from watchlist`);
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      toast.error('Failed to update watchlist');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white flex items-center">
          <FaStar className="mr-2 text-yellow-500" />
          My Watchlist
        </h2>
        <button
          onClick={() => setShowAddModal(true)}
          disabled={!isProUser && watchlist.length >= maxWatchlistSize}
          className="btn-secondary px-3 py-1 text-sm"
        >
          <FaPlus className="mr-1" />
          Add
        </button>
      </div>

      {watchlist.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-text-secondary mb-4">
            Your watchlist is empty. Add cryptocurrencies to track their prices and receive signals.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary px-4 py-2"
          >
            Add to Watchlist
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {watchlist.map((symbol) => {
            const price = prices[symbol];
            return (
              <div
                key={symbol}
                className="flex items-center justify-between p-4 bg-surface rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
                onClick={() => onSelectSymbol?.(symbol)}
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <span className="text-lg font-semibold text-white">
                      {symbol}
                    </span>
                    {price && (
                      <>
                        <span className="text-white">
                          {marketService.formatPrice(price.price)}
                        </span>
                        <span
                          className={`text-sm ${
                            price.changePercent24h > 0
                              ? 'text-green-400'
                              : 'text-red-400'
                          }`}
                        >
                          {price.changePercent24h > 0 ? '+' : ''}
                          {price.changePercent24h.toFixed(2)}%
                        </span>
                      </>
                    )}
                  </div>
                  {price && (
                    <div className="text-xs text-text-secondary mt-1">
                      Vol: ${marketService.formatLargeNumber(price.volume24h)}
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <Link
                    href={`/market/${symbol}`}
                    className="text-primary hover:text-primary-light p-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <FaChartLine />
                  </Link>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromWatchlist(symbol);
                    }}
                    className="text-text-secondary hover:text-red-400 p-2"
                    disabled={loading}
                  >
                    <FaTimes />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isProUser && (
        <div className="mt-4 p-3 bg-primary/10 rounded-lg text-center">
          <p className="text-sm text-text-secondary mb-2">
            {watchlist.length}/{maxWatchlistSize} cryptocurrencies
          </p>
          <Link
            href="/pricing"
            className="text-primary hover:text-primary-light text-sm font-medium"
          >
            Upgrade to Pro for unlimited watchlist
          </Link>
        </div>
      )}

      {/* Add to Watchlist Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-surface rounded-lg p-6 max-w-md w-full max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">
                Add to Watchlist
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-text-secondary hover:text-white"
              >
                <FaTimes />
              </button>
            </div>

            <div className="space-y-2">
              {AVAILABLE_CRYPTOS.filter(
                (crypto) => !watchlist.includes(crypto.symbol)
              ).map((crypto) => (
                <button
                  key={crypto.symbol}
                  onClick={() => addToWatchlist(crypto.symbol)}
                  disabled={loading}
                  className="w-full text-left p-3 bg-background rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-white font-medium">
                        {crypto.symbol}
                      </span>
                      <span className="text-text-secondary ml-2">
                        {crypto.name}
                      </span>
                    </div>
                    <FaPlus className="text-primary" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}