'use client';

import { useState, useEffect } from 'react';
import { signalHistoryService, StoredSignal } from '@/services/signal-history.service';
import { marketService } from '@/services/market.service';
import { FaHistory, FaChartLine } from 'react-icons/fa';

function getOutcomeStyle(outcome?: string) {
  switch (outcome) {
    case 'hit_target': return 'text-green-400 bg-green-900/20';
    case 'expired_profit': return 'text-green-300 bg-green-900/10';
    case 'hit_stop': return 'text-red-400 bg-red-900/20';
    case 'expired_loss': return 'text-red-300 bg-red-900/10';
    default: return 'text-yellow-400 bg-yellow-900/20';
  }
}

function getOutcomeLabel(outcome?: string) {
  switch (outcome) {
    case 'hit_target': return 'Target Hit';
    case 'expired_profit': return 'Profit';
    case 'hit_stop': return 'Stopped Out';
    case 'expired_loss': return 'Loss';
    default: return 'Pending';
  }
}

export default function SignalHistory({ userId }: { userId: string }) {
  const [signals, setSignals] = useState<StoredSignal[]>([]);
  const [stats, setStats] = useState<{ total: number; wins: number; losses: number; pending: number; winRate: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [sigs, st] = await Promise.all([
          signalHistoryService.getUserSignals(userId, 20),
          signalHistoryService.getSignalStats(userId),
        ]);
        if (mounted) { setSignals(sigs); setStats(st); }
      } catch (err) {
        console.error('Error loading signal history:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [userId]);

  if (loading) {
    return (
      <div className="card p-6 mt-8">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-700 rounded w-1/3" />
          <div className="h-20 bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  if (signals.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center space-x-3 mb-4">
        <FaHistory className="text-primary text-xl" />
        <h2 className="text-xl font-semibold text-white">Signal History</h2>
      </div>

      {/* Stats Summary */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-white">{stats.total}</p>
            <p className="text-xs text-text-secondary">Total Signals</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{stats.wins}</p>
            <p className="text-xs text-text-secondary">Wins</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-red-400">{stats.losses}</p>
            <p className="text-xs text-text-secondary">Losses</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-primary">{stats.winRate.toFixed(1)}%</p>
            <p className="text-xs text-text-secondary">Win Rate</p>
          </div>
        </div>
      )}

      {/* Signal List */}
      <div className="space-y-3">
        {signals.map((signal) => (
          <div key={signal.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className={`px-2 py-1 rounded text-sm font-medium ${
                  signal.action === 'BUY' ? 'text-green-400 bg-green-900/20' :
                  signal.action === 'SELL' ? 'text-red-400 bg-red-900/20' :
                  'text-yellow-400 bg-yellow-900/20'
                }`}>
                  {signal.action}
                </span>
                <div>
                  <span className="text-white font-medium">{signal.symbol}</span>
                  <span className="text-text-secondary text-sm ml-2">
                    @ {marketService.formatPrice(signal.entryPrice)}
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-text-secondary text-sm">
                  {signal.confidence.toFixed(0)}%
                </span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${getOutcomeStyle(signal.outcome)}`}>
                  {getOutcomeLabel(signal.outcome)}
                </span>
                {signal.profitLossPercent !== undefined && (
                  <span className={`text-sm font-medium ${signal.profitLossPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {signal.profitLossPercent >= 0 ? '+' : ''}{signal.profitLossPercent.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
