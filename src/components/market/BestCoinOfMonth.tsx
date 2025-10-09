'use client';

import React, { useState, useEffect } from 'react';
import { FaTrophy, FaChartLine, FaArrowUp, FaCalendarAlt } from 'react-icons/fa';
import { marketService } from '@/services/market.service';
import { useMarketData } from '@/hooks/useMarketData';
import Link from 'next/link';

export default function BestCoinOfMonth() {
  const { prices, loading } = useMarketData();
  const [bestCoin, setBestCoin] = useState<string>('');

  useEffect(() => {
    if (prices && Object.keys(prices).length > 0) {
      // Find the coin with the best 24h performance
      let topCoin = '';
      let topChange = -100;

      Object.entries(prices).forEach(([symbol, coin]) => {
        if (coin.changePercent24h > topChange && coin.volume24h > 10000000) {
          topChange = coin.changePercent24h;
          topCoin = symbol;
        }
      });

      setBestCoin(topCoin);
    }
  }, [prices]);

  if (loading || !bestCoin || !prices[bestCoin]) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="h-48 bg-gray-800 rounded"></div>
      </div>
    );
  }

  const coin = prices[bestCoin];
  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Simple momentum calculation based on 24h change
  const momentum = coin.changePercent24h > 10 ? 'Strong' :
                  coin.changePercent24h > 5 ? 'Moderate' :
                  coin.changePercent24h > 0 ? 'Mild' : 'Weak';

  return (
    <div className="card p-6 bg-gradient-to-br from-primary/10 to-yellow-500/10 border-2 border-primary/50">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white flex items-center">
          <FaTrophy className="text-yellow-500 mr-2" />
          Best Performer Today
        </h2>
        <span className="text-xs text-text-secondary flex items-center">
          <FaCalendarAlt className="mr-1" />
          24h Performance
        </span>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-3xl font-bold text-white">{bestCoin}</h3>
            <p className="text-lg text-text-secondary">
              ${marketService.formatPrice(coin.price)}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center text-2xl font-bold text-green-400">
              <FaArrowUp className="mr-1" />
              {coin.changePercent24h.toFixed(2)}%
            </div>
            <p className="text-sm text-text-secondary">24h Change</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 py-4 border-y border-gray-700">
          <div>
            <p className="text-xs text-text-secondary">24h Volume</p>
            <p className="text-sm font-medium text-white">
              ${marketService.formatLargeNumber(coin.volume24h)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-secondary">Market Cap</p>
            <p className="text-sm font-medium text-white">
              ${marketService.formatLargeNumber(coin.marketCap)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-secondary">Momentum</p>
            <span className={`text-sm font-medium ${
              momentum === 'Strong' ? 'text-green-400' :
              momentum === 'Moderate' ? 'text-yellow-400' :
              'text-red-400'
            }`}>
              {momentum}
            </span>
          </div>
        </div>

        <div className="bg-primary/10 rounded-lg p-3">
          <p className="text-sm text-text-secondary mb-1">Investment Insight</p>
          <p className="text-sm text-white">
            {coin.changePercent24h > 50 ?
              `${bestCoin} has shown exceptional growth today. Consider taking partial profits and monitoring for consolidation.` :
              coin.changePercent24h > 20 ?
              `${bestCoin} is demonstrating strong upward momentum. Good entry points may appear during minor pullbacks.` :
              `${bestCoin} is leading the market with steady gains. Suitable for medium-term investment strategies.`
            }
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <Link
            href={`/signals?symbol=${bestCoin}`}
            className="btn-primary flex-1 flex items-center justify-center"
          >
            <FaChartLine className="mr-2" />
            Get AI Signals
          </Link>
          <Link
            href="/market"
            className="btn-secondary flex-1"
          >
            View All Coins
          </Link>
        </div>

        {/* Top 5 Performers Mini List */}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <p className="text-sm font-medium text-white mb-2">Other Top Performers</p>
          <div className="space-y-1">
            {Object.entries(prices)
              .sort(([, a], [, b]) => b.changePercent24h - a.changePercent24h)
              .slice(1, 6)
              .map(([symbol, data]) => (
                <div key={symbol} className="flex justify-between text-xs">
                  <span className="text-text-secondary">{symbol}</span>
                  <span className={data.changePercent24h > 0 ? 'text-green-400' : 'text-red-400'}>
                    {data.changePercent24h > 0 ? '+' : ''}{data.changePercent24h.toFixed(2)}%
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}