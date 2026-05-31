'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PriceCard from '@/components/market/PriceCard';
import { useMarketData } from '@/hooks/useMarketData';
import { FaRedo, FaSearch } from 'react-icons/fa';
import { getCoinName } from '@/lib/coins';
import { MarketPrice } from '@/services/market.service';

type SortKey = 'marketCap' | 'price' | 'changePercent24h' | 'volume24h';
type SortDir = 'desc' | 'asc';
type Filter = 'all' | 'gainers' | 'losers';

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Market Cap', value: 'marketCap' },
  { label: 'Price', value: 'price' },
  { label: '24h Change', value: 'changePercent24h' },
  { label: '24h Volume', value: 'volume24h' },
];

export default function MarketPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('marketCap');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filter, setFilter] = useState<Filter>('all');

  const { prices, loading, error, refetch } = useMarketData({
    symbols: ['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'XRP', 'DOGE', 'DOT', 'MATIC', 'SHIB', 'TRX', 'AVAX', 'UNI', 'ATOM', 'LTC', 'LINK', 'BCH', 'NEAR', 'ALGO', 'VET'],
    enableRealtime: true,
  });

  const visible = useMemo(() => {
    let list = Object.values(prices) as MarketPrice[];

    // Search by symbol or name
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        p => p.symbol.toLowerCase().includes(q) || getCoinName(p.symbol).toLowerCase().includes(q)
      );
    }

    // Quick filters
    if (filter === 'gainers') list = list.filter(p => p.changePercent24h > 0);
    else if (filter === 'losers') list = list.filter(p => p.changePercent24h < 0);

    // Sort
    list = [...list].sort((a, b) => {
      const diff = (a[sortKey] || 0) - (b[sortKey] || 0);
      return sortDir === 'desc' ? -diff : diff;
    });

    return list;
  }, [prices, search, filter, sortKey, sortDir]);

  return (
    <>
      {/* Header */}
      <div className="bg-surface border-b border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Market Overview</h1>
              <p className="text-text-secondary">Real-time prices — click any coin for charts & analysis</p>
            </div>
            <button onClick={refetch} className="btn-secondary flex items-center space-x-2" disabled={loading}>
              <FaRedo className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
          {/* Search */}
          <div className="relative flex-1">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or symbol…"
              className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-text-secondary focus:border-primary focus:outline-none"
            />
          </div>

          {/* Filter */}
          <div className="flex space-x-1 bg-surface rounded-lg p-1 border border-gray-800">
            {(['all', 'gainers', 'losers'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-md text-sm font-medium capitalize transition-colors ${
                  filter === f ? 'bg-primary text-white' : 'text-text-secondary hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center space-x-2">
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-primary focus:outline-none"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm hover:border-primary"
              title="Toggle sort direction"
            >
              {sortDir === 'desc' ? '↓ High→Low' : '↑ Low→High'}
            </button>
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && Object.keys(prices).length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="card p-6 animate-pulse">
                <div className="h-32 bg-gray-800 rounded"></div>
              </div>
            ))}
          </div>
        )}

        {/* Grid */}
        {(!loading || Object.keys(prices).length > 0) && (
          <>
            {visible.length === 0 ? (
              <div className="card p-12 text-center">
                <p className="text-text-secondary">No coins match your filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {visible.map(price => (
                  <PriceCard
                    key={price.symbol}
                    price={price}
                    onClick={() => router.push(`/market/${price.symbol}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
