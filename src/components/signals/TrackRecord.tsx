'use client';

import { useEffect, useState } from 'react';
import { signalHistoryService } from '@/services/signal-history.service';

interface BacktestResults {
  winRate: number;
  totalTrades: number;
  horizonHours: number;
  byAction: { BUY: { trades: number; winRate: number }; SELL: { trades: number; winRate: number } };
  note: string;
}

interface LiveStats {
  total: number; wins: number; losses: number; pending: number; winRate: number;
}

export default function TrackRecord({ userId }: { userId: string }) {
  const [bt, setBt] = useState<BacktestResults | null>(null);
  const [live, setLive] = useState<LiveStats | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch('/backtest-results.json')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (mounted) setBt(d); })
      .catch(() => { if (mounted) setBt(null); });
    signalHistoryService.getSignalStats(userId)
      .then(s => { if (mounted) setLive(s); })
      .catch(() => {});
    return () => { mounted = false; };
  }, [userId]);

  const liveEvaluated = live ? live.wins + live.losses : 0;

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Track Record</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Backtest */}
        <div>
          <p className="text-xs text-text-secondary mb-1">Strategy backtest (technical engine)</p>
          {bt ? (
            <>
              <p className="text-3xl font-bold text-white">{bt.winRate.toFixed(1)}%</p>
              <p className="text-xs text-text-secondary mt-1">
                win rate over {bt.totalTrades.toLocaleString()} historical {bt.horizonHours}h trades
              </p>
            </>
          ) : (
            <p className="text-text-secondary text-sm">Run <code>npm run backtest</code> to populate.</p>
          )}
        </div>

        {/* Live */}
        <div>
          <p className="text-xs text-text-secondary mb-1">Your generated signals (live)</p>
          {live && liveEvaluated > 0 ? (
            <>
              <p className="text-3xl font-bold text-primary">{live.winRate.toFixed(1)}%</p>
              <p className="text-xs text-text-secondary mt-1">
                {live.wins}W · {live.losses}L · {live.pending} pending
              </p>
            </>
          ) : (
            <p className="text-text-secondary text-sm">
              No evaluated signals yet — outcomes are scored 24h after a signal is generated.
            </p>
          )}
        </div>
      </div>
      <p className="text-xs text-text-secondary mt-4 pt-3 border-t border-gray-800">
        Backtest excludes fees and overlapping trades. Past performance does not predict future results — not financial advice.
      </p>
    </div>
  );
}
