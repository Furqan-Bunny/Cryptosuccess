'use client';

import { TradeSignal, marketService } from '@/services/market.service';
import { KeyLevels } from '@/services/ai/levels';

export default function KeyLevelsPanel({
  signal,
  levels,
  riskReward,
  potentialGainPct,
  potentialLossPct,
}: {
  signal: TradeSignal;
  levels: KeyLevels;
  riskReward: number;
  potentialGainPct: number;
  potentialLossPct: number;
}) {
  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Key Levels</h3>

      <div className="grid grid-cols-3 gap-3 text-center mb-4">
        <div>
          <p className="text-xs text-text-secondary">Entry</p>
          <p className="text-sm font-semibold text-white">{marketService.formatPrice(signal.price)}</p>
        </div>
        <div>
          <p className="text-xs text-text-secondary">Target</p>
          <p className="text-sm font-semibold text-green-400">{marketService.formatPrice(signal.targetPrice)}</p>
          <p className="text-xs text-green-400">{potentialGainPct >= 0 ? '+' : ''}{potentialGainPct.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-xs text-text-secondary">Stop</p>
          <p className="text-sm font-semibold text-red-400">{marketService.formatPrice(signal.stopLoss)}</p>
          <p className="text-xs text-red-400">{potentialLossPct.toFixed(1)}%</p>
        </div>
      </div>

      <div className="flex items-center justify-between py-2 border-y border-gray-800 mb-4">
        <span className="text-sm text-text-secondary">Risk / Reward</span>
        <span className={`text-sm font-semibold ${riskReward >= 1.5 ? 'text-green-400' : 'text-yellow-400'}`}>
          1 : {riskReward.toFixed(2)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-text-secondary mb-1">Resistance (above)</p>
          {levels.resistances.length > 0 ? (
            levels.resistances.map((r, i) => (
              <p key={i} className="text-sm text-red-300">{marketService.formatPrice(r)}</p>
            ))
          ) : (
            <p className="text-sm text-text-secondary">—</p>
          )}
        </div>
        <div>
          <p className="text-xs text-text-secondary mb-1">Support (below)</p>
          {levels.supports.length > 0 ? (
            levels.supports.map((s, i) => (
              <p key={i} className="text-sm text-green-300">{marketService.formatPrice(s)}</p>
            ))
          ) : (
            <p className="text-sm text-text-secondary">—</p>
          )}
        </div>
      </div>

      <p className="text-xs text-text-secondary mt-4">
        Pivot: {marketService.formatPrice(levels.pivot)}
      </p>
    </div>
  );
}
