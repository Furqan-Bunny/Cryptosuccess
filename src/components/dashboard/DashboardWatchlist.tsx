'use client';

import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth } from '@/hooks/useAuth';
import { MarketPrice, marketService } from '@/services/market.service';
import { COINS, getCoinIcon, getCoinName } from '@/lib/coins';
import { FaStar, FaPlus, FaTimes, FaSearch } from 'react-icons/fa';

export default function DashboardWatchlist({
  prices,
  watchlist,
  isPro,
}: {
  prices: Record<string, MarketPrice>;
  watchlist: string[];
  isPro: boolean;
}) {
  const { user, refreshProfile } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');
  const maxWatchlist = isPro ? 50 : 5;

  const update = async (next: string[]) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), { 'preferences.watchlist': next });
    await refreshProfile();
  };

  const addCoin = async (symbol: string) => {
    if (watchlist.includes(symbol)) return;
    if (!isPro && watchlist.length >= maxWatchlist) {
      toast.error(`Free plan tracks up to ${maxWatchlist} coins. Upgrade to Pro for more.`);
      return;
    }
    try {
      await update([...watchlist, symbol]);
      toast.success(`${symbol} added`);
      setShowAdd(false);
      setQuery('');
    } catch {
      toast.error('Failed to add coin');
    }
  };

  const removeCoin = async (symbol: string) => {
    try {
      await update(watchlist.filter(s => s !== symbol));
      toast.success(`${symbol} removed`);
    } catch {
      toast.error('Failed to remove coin');
    }
  };

  const addable = COINS.filter(
    c => !watchlist.includes(c.symbol) &&
      (c.symbol.toLowerCase().includes(query.toLowerCase()) || c.name.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center">
          <FaStar className="mr-2 text-yellow-500" /> Watchlist
        </h3>
        <button onClick={() => setShowAdd(true)} className="btn-secondary px-3 py-1 text-sm flex items-center">
          <FaPlus className="mr-1" /> Add
        </button>
      </div>

      {watchlist.length === 0 ? (
        <p className="text-text-secondary text-sm py-4 text-center">
          No coins yet. Add some to track their prices.
        </p>
      ) : (
        <div className="space-y-1">
          {watchlist.map(symbol => {
            const p = prices[symbol];
            return (
              <div key={symbol} className="flex items-center justify-between py-2 px-2 rounded hover:bg-gray-800/50 group">
                <Link href={`/market/${symbol}`} className="flex items-center space-x-2 min-w-0 flex-1">
                  <span className="text-lg">{getCoinIcon(symbol)}</span>
                  <span className="text-white text-sm font-medium">{symbol}</span>
                  <span className="text-text-secondary text-xs truncate hidden sm:inline">{getCoinName(symbol)}</span>
                </Link>
                <div className="flex items-center space-x-3">
                  {p && (
                    <>
                      <span className="text-white text-sm">{marketService.formatPrice(p.price)}</span>
                      <span className={`text-xs w-16 text-right ${p.changePercent24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {p.changePercent24h >= 0 ? '+' : ''}{p.changePercent24h.toFixed(2)}%
                      </span>
                    </>
                  )}
                  <button
                    onClick={() => removeCoin(symbol)}
                    className="text-text-secondary hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove"
                  >
                    <FaTimes size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isPro && (
        <p className="text-xs text-text-secondary mt-3">{watchlist.length}/{maxWatchlist} coins</p>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-surface rounded-lg p-6 max-w-md w-full max-h-[75vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">Add to Watchlist</h3>
              <button onClick={() => setShowAdd(false)} className="text-text-secondary hover:text-white"><FaTimes /></button>
            </div>
            <div className="relative mb-4">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search coins…"
                className="w-full pl-9 pr-4 py-2 bg-background border border-gray-700 rounded-lg text-white placeholder-text-secondary focus:border-primary focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              {addable.length === 0 && <p className="text-text-secondary text-sm text-center py-4">No coins found.</p>}
              {addable.map(c => (
                <button
                  key={c.symbol}
                  onClick={() => addCoin(c.symbol)}
                  className="w-full text-left p-3 bg-background rounded-lg hover:bg-gray-800 flex items-center justify-between"
                >
                  <span className="flex items-center space-x-2">
                    <span className="text-xl">{c.icon}</span>
                    <span className="text-white font-medium">{c.symbol}</span>
                    <span className="text-text-secondary text-sm">{c.name}</span>
                  </span>
                  <FaPlus className="text-primary" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
