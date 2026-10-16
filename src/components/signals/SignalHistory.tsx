'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { signalHistoryService, StoredSignal } from '@/services/signal-history.service';
import { marketService } from '@/services/market.service';
import { FaHistory, FaChartLine, FaLink } from 'react-icons/fa';
import { outcomeBadge, type OutcomeTone } from '@/lib/outcome-badge';

const TONE_STYLE: Record<OutcomeTone, string> = {
  win: 'text-green-400 bg-green-900/20',
  small_win: 'text-green-300 bg-green-900/10',
  loss: 'text-red-400 bg-red-900/20',
  small_loss: 'text-red-300 bg-red-900/10',
  neutral: 'text-gray-300 bg-gray-800',
  pending: 'text-yellow-400 bg-yellow-900/20',
};

export default function SignalHistory({ userId }: { userId: string }) {
  const [signals, setSignals] = useState<StoredSignal[]>([]);
  const [stats, setStats] = useState<{ total: number; wins: number; losses: number; pending: number; winRate: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        // Outcomes are finalized server-side by the hourly evaluation cron; the
        // component only reads (no mutate-on-render).
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
        {signals.map((signal) => {
          const badge = outcomeBadge(signal.action, signal.outcome);
          const isHold = signal.action === 'HOLD';
          const move = signal.profitLossPercent;
          return (
          <div key={signal.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`px-2 py-1 rounded text-sm font-medium ${
                  signal.action === 'BUY' ? 'text-green-400 bg-green-900/20' :
                  signal.action === 'SELL' ? 'text-red-400 bg-red-900/20' :
                  'text-yellow-400 bg-yellow-900/20'
                }`}>
                  {signal.action}
                </span>
                <div className="min-w-0">
                  <span className="text-white font-medium">{signal.symbol}</span>
                  <span className="text-text-secondary text-sm ml-2">
                    @ {marketService.formatPrice(signal.entryPrice)}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                <span className="text-text-secondary text-sm">
                  {signal.confidence.toFixed(0)}%
                </span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${TONE_STYLE[badge.tone]}`}>
                  {badge.label}
                </span>
                {move !== undefined && (
                  <span
                    title={badge.moveCaption === 'P/L' ? 'Profit / loss at the 24h check' : 'Price move at the 24h check (not scored)'}
                    className={`text-sm font-medium ${isHold ? 'text-text-secondary' : move >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {isHold && <span className="text-xs font-normal mr-1">{badge.moveCaption}</span>}
                    {move >= 0 ? '+' : ''}{move.toFixed(2)}%
                  </span>
                )}
                {signal.id && signal.outcome && signal.outcome !== 'pending' && (
                  <Link
                    href={`/verify?signalId=${signal.id}`}
                    title="Verify this signal on-chain"
                    className="text-text-secondary hover:text-primary text-xs flex items-center"
                  >
                    <FaLink className="mr-1" /> Verify
                  </Link>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
