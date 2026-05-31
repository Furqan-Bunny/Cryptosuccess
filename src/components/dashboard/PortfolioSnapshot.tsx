'use client';

import Link from 'next/link';
import { PortfolioSummary } from '@/services/portfolio.service';
import { marketService } from '@/services/market.service';
import { FaWallet, FaArrowUp, FaArrowDown } from 'react-icons/fa';

export default function PortfolioSnapshot({
  portfolio,
  loading,
  isPro,
}: {
  portfolio: PortfolioSummary | null;
  loading: boolean;
  isPro: boolean;
}) {
  if (loading) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Portfolio</h3>
        <div className="h-28 bg-gray-800/40 rounded animate-pulse" />
      </div>
    );
  }

  if (!portfolio || portfolio.assets.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
          <FaWallet className="mr-2 text-primary" /> Portfolio
        </h3>
        {isPro ? (
          <>
            <p className="text-text-secondary text-sm mb-4">
              You haven&apos;t recorded any trades yet. Track your holdings to see value and P/L here.
            </p>
            <Link href="/portfolio" className="btn-primary px-4 py-2 text-sm inline-block">Record your first trade</Link>
          </>
        ) : (
          <>
            <p className="text-text-secondary text-sm mb-4">
              Portfolio tracking is a Pro feature. Upgrade to track your holdings and P/L.
            </p>
            <Link href="/pricing" className="btn-primary px-4 py-2 text-sm inline-block">Upgrade to Pro</Link>
          </>
        )}
      </div>
    );
  }

  const up = portfolio.totalProfitLoss >= 0;
  const topHolding = [...portfolio.assets].sort(
    (a, b) => (b.currentValue || 0) - (a.currentValue || 0)
  )[0];

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
        <FaWallet className="mr-2 text-primary" /> Portfolio
      </h3>

      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="text-xs text-text-secondary">Total Value</p>
          <p className="text-2xl font-bold text-white">{marketService.formatPrice(portfolio.totalValue)}</p>
        </div>
        <div className={`text-right ${up ? 'text-green-400' : 'text-red-400'}`}>
          <p className="text-sm font-semibold flex items-center justify-end">
            {up ? <FaArrowUp className="mr-1" /> : <FaArrowDown className="mr-1" />}
            {marketService.formatPrice(Math.abs(portfolio.totalProfitLoss))}
          </p>
          <p className="text-xs">{up ? '+' : ''}{portfolio.totalProfitLossPercentage.toFixed(2)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-800">
        <div>
          <p className="text-xs text-text-secondary">Assets</p>
          <p className="text-white font-medium">{portfolio.assets.length}</p>
        </div>
        <div>
          <p className="text-xs text-text-secondary">Top Holding</p>
          <p className="text-white font-medium">
            {topHolding?.symbol} · {marketService.formatPrice(topHolding?.currentValue || 0)}
          </p>
        </div>
      </div>

      <Link href="/portfolio" className="text-primary hover:text-primary-light text-sm mt-4 inline-block">
        View portfolio →
      </Link>
    </div>
  );
}
