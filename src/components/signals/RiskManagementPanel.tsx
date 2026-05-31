'use client';

import { TradeSignal, marketService } from '@/services/market.service';
import { CoinProfile } from '@/services/ai/coin-profiles';

const VOL_TONE: Record<string, string> = {
  low: 'text-green-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
  extreme: 'text-red-400',
};

export default function RiskManagementPanel({
  profile,
  signal,
  potentialLossPct,
}: {
  profile: CoinProfile;
  signal: TradeSignal;
  potentialLossPct: number;
}) {
  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Risk Management</h3>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Volatility</span>
          <span className={`text-sm font-medium capitalize ${VOL_TONE[profile.volatilityClass] ?? 'text-white'}`}>
            {profile.volatilityClass}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Suggested max position</span>
          <span className="text-sm font-medium text-white">{profile.maxPositionSizePct}% of portfolio</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Stop distance</span>
          <span className="text-sm font-medium text-white">{Math.abs(potentialLossPct).toFixed(1)}%</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Stop price</span>
          <span className="text-sm font-medium text-red-400">{marketService.formatPrice(signal.stopLoss)}</span>
        </div>
      </div>

      <p className="text-xs text-text-secondary mt-4 pt-3 border-t border-gray-800">
        Position sizing is a guideline based on this coin&apos;s typical volatility — not financial advice.
        Never risk more than you can afford to lose.
      </p>
    </div>
  );
}
