'use client';

import { RegimeAnalysis } from '@/services/ai/market-regime.service';
import { FaArrowUp, FaArrowDown, FaExchangeAlt, FaBolt } from 'react-icons/fa';

const META: Record<string, { label: string; tone: string; icon: JSX.Element }> = {
  trending_up: { label: 'Trending Up', tone: 'text-green-400 bg-green-900/20 border-green-800', icon: <FaArrowUp /> },
  trending_down: { label: 'Trending Down', tone: 'text-red-400 bg-red-900/20 border-red-800', icon: <FaArrowDown /> },
  ranging: { label: 'Ranging', tone: 'text-yellow-400 bg-yellow-900/20 border-yellow-800', icon: <FaExchangeAlt /> },
  volatile: { label: 'Volatile', tone: 'text-orange-400 bg-orange-900/20 border-orange-800', icon: <FaBolt /> },
};

export default function MarketRegimeBadge({ regime }: { regime: RegimeAnalysis }) {
  const meta = META[regime.regime] ?? META.ranging;

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Market Regime</h3>
      <div className={`flex items-center space-x-3 px-4 py-3 rounded-lg border ${meta.tone}`}>
        <span className="text-2xl">{meta.icon}</span>
        <div>
          <p className="font-semibold">{meta.label}</p>
          <p className="text-xs opacity-80">{regime.confidence.toFixed(0)}% confidence</p>
        </div>
      </div>
      <p className="text-sm text-text-secondary mt-4">{regime.description}</p>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div>
          <p className="text-xs text-text-secondary">ADX</p>
          <p className="text-white font-medium">{regime.adx.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-xs text-text-secondary">Volatility (ATR%)</p>
          <p className="text-white font-medium">{regime.atrPercent.toFixed(2)}%</p>
        </div>
      </div>
    </div>
  );
}
