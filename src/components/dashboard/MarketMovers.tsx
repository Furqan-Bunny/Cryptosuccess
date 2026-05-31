'use client';

import Link from 'next/link';
import { MarketPrice, marketService } from '@/services/market.service';
import { getCoinIcon } from '@/lib/coins';

function MoverRow({ p }: { p: MarketPrice }) {
  const up = p.changePercent24h >= 0;
  return (
    <Link
      href={`/market/${p.symbol}`}
      className="flex items-center justify-between py-2 px-2 rounded hover:bg-gray-800/50 transition-colors"
    >
      <span className="flex items-center space-x-2 min-w-0">
        <span className="text-lg">{getCoinIcon(p.symbol)}</span>
        <span className="text-white text-sm font-medium">{p.symbol}</span>
        <span className="text-text-secondary text-xs truncate">{marketService.formatPrice(p.price)}</span>
      </span>
      <span className={`text-sm font-medium ${up ? 'text-green-400' : 'text-red-400'}`}>
        {up ? '+' : ''}{p.changePercent24h.toFixed(2)}%
      </span>
    </Link>
  );
}

export default function MarketMovers({ prices }: { prices: Record<string, MarketPrice> }) {
  const list = Object.values(prices);

  if (list.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Market Movers</h3>
        <div className="h-40 bg-gray-800/40 rounded animate-pulse" />
      </div>
    );
  }

  const gainers = [...list].sort((a, b) => b.changePercent24h - a.changePercent24h).slice(0, 5);
  const losers = [...list].sort((a, b) => a.changePercent24h - b.changePercent24h).slice(0, 5);

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Market Movers (24h)</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <p className="text-green-400 text-sm font-medium mb-1">Top Gainers</p>
          {gainers.map(p => <MoverRow key={p.symbol} p={p} />)}
        </div>
        <div>
          <p className="text-red-400 text-sm font-medium mb-1">Top Losers</p>
          {losers.map(p => <MoverRow key={p.symbol} p={p} />)}
        </div>
      </div>
    </div>
  );
}
