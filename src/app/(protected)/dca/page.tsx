'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import SimDisclaimer from '@/components/shared/SimDisclaimer';
import { dcaService, DcaSchedule, DcaCadence } from '@/services/dca.service';
import { marketService } from '@/services/market.service';
import { COIN_SYMBOLS } from '@/lib/coins';
import { FaSyncAlt, FaPlay, FaPause, FaTrash, FaChartLine } from 'react-icons/fa';
import toast from 'react-hot-toast';

export default function DcaPage() {
  return (
    <ProtectedRoute requirePro>
      <DcaPageInner />
    </ProtectedRoute>
  );
}

function tsToDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function DcaPageInner() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<DcaSchedule[]>([]);
  const [symbol, setSymbol] = useState('BTC');
  const [amountUsd, setAmountUsd] = useState('50');
  const [cadence, setCadence] = useState<DcaCadence>('weekly');
  const [submitting, setSubmitting] = useState(false);

  const loadSchedules = async () => {
    if (!user) return;
    try {
      setSchedules(await dcaService.listSchedules(user.uid));
    } catch (e) {
      console.error('Error loading DCA schedules:', e);
    }
  };

  useEffect(() => {
    if (user) loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const usd = parseFloat(amountUsd);
    if (!usd || usd <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setSubmitting(true);
    try {
      await dcaService.createSchedule(user.uid, { symbol, amountUsd: usd, cadence });
      toast.success('Recurring buy created');
      setAmountUsd('50');
      await loadSchedules();
    } catch (e) {
      console.error(e);
      toast.error('Failed to create schedule');
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (s: DcaSchedule) => {
    if (!s.id) return;
    await dcaService.setActive(s.id, !s.active);
    await loadSchedules();
  };

  const remove = async (s: DcaSchedule) => {
    if (!s.id) return;
    await dcaService.deleteSchedule(s.id);
    toast.success('Schedule deleted');
    await loadSchedules();
  };

  return (
    <>
      <div className="bg-surface border-b border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
            <FaSyncAlt className="text-primary" /> Recurring Buys (DCA)
          </h1>
          <p className="text-text-secondary">
            Schedule simulated dollar-cost-averaging buys at a fixed interval.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-8">
        <SimDisclaimer extra="DCA buys are recorded into your simulated portfolio at the live price when each interval runs." />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Create form */}
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-white mb-4">New Recurring Buy</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-2">Asset</label>
                <select
                  value={symbol}
                  onChange={e => setSymbol(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                >
                  {COIN_SYMBOLS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-2">Amount (USD per buy)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={amountUsd}
                  onChange={e => setAmountUsd(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-2">Frequency</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['daily', 'weekly'] as DcaCadence[]).map(c => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setCadence(c)}
                      className={`py-3 rounded-lg font-medium capitalize transition-colors ${
                        cadence === c ? 'bg-primary text-white' : 'bg-gray-800 text-text-secondary hover:text-white'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-lg font-semibold bg-primary hover:bg-primary/80 text-white disabled:opacity-50"
              >
                {submitting ? 'Creating…' : 'Create Schedule'}
              </button>
            </form>
          </div>

          {/* Schedules list */}
          <div className="card p-6 lg:col-span-2">
            <h2 className="text-xl font-semibold text-white mb-4">Active Schedules</h2>
            {schedules.length === 0 ? (
              <p className="text-text-secondary">No recurring buys yet.</p>
            ) : (
              <div className="space-y-3">
                {schedules.map(s => {
                  const next = tsToDate(s.nextRunAt);
                  return (
                    <div key={s.id} className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                      <div>
                        <p className="text-white font-medium">
                          {marketService.formatPrice(s.amountUsd)} of {s.symbol}{' '}
                          <span className="text-text-secondary text-sm capitalize">· {s.cadence}</span>
                        </p>
                        <p className="text-xs text-text-secondary">
                          {s.active
                            ? `Next: ${next ? next.toLocaleString() : '—'}`
                            : 'Paused'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggle(s)}
                          className="text-text-secondary hover:text-white"
                          title={s.active ? 'Pause' : 'Resume'}
                        >
                          {s.active ? <FaPause /> : <FaPlay />}
                        </button>
                        <button onClick={() => remove(s)} className="text-red-400 hover:text-red-300" title="Delete">
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DcaBacktest />
      </div>
    </>
  );
}

// Client-side DCA-vs-lump-sum backtest over historical daily candles.
function DcaBacktest() {
  const [symbol, setSymbol] = useState('BTC');
  const [perBuy, setPerBuy] = useState('50');
  const [days, setDays] = useState('180');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | {
    invested: number;
    dcaValue: number;
    lumpValue: number;
    buys: number;
  }>(null);

  const run = async () => {
    const amount = parseFloat(perBuy);
    const period = parseInt(days, 10);
    if (!amount || !period) return;
    setLoading(true);
    setResult(null);
    try {
      const candles = await marketService.getCandleData(symbol, '1d', Math.min(period, 1000));
      if (candles.length < 2) {
        toast.error('Not enough history');
        return;
      }
      const currentPrice = candles[candles.length - 1].close;
      // Weekly DCA: buy every 7th daily candle.
      let invested = 0;
      let units = 0;
      let buys = 0;
      for (let i = 0; i < candles.length; i += 7) {
        invested += amount;
        units += amount / candles[i].close;
        buys += 1;
      }
      const dcaValue = units * currentPrice;
      // Lump sum: invest the same total at the start.
      const lumpUnits = invested / candles[0].close;
      const lumpValue = lumpUnits * currentPrice;
      setResult({ invested, dcaValue, lumpValue, buys });
    } catch (e) {
      console.error(e);
      toast.error('Backtest failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6">
      <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
        <FaChartLine className="text-primary" /> DCA vs Lump-Sum Backtest
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
        <select
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          className="px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
        >
          {COIN_SYMBOLS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          type="number"
          value={perBuy}
          onChange={e => setPerBuy(e.target.value)}
          placeholder="$ per weekly buy"
          className="px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
        />
        <input
          type="number"
          value={days}
          onChange={e => setDays(e.target.value)}
          placeholder="days"
          className="px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
        />
        <button
          onClick={run}
          disabled={loading}
          className="py-3 rounded-lg font-semibold bg-primary hover:bg-primary/80 text-white disabled:opacity-50"
        >
          {loading ? 'Running…' : 'Run'}
        </button>
      </div>
      {result && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Invested" value={marketService.formatPrice(result.invested)} sub={`${result.buys} buys`} />
          <Stat
            label="DCA value"
            value={marketService.formatPrice(result.dcaValue)}
            sub={`${(((result.dcaValue - result.invested) / result.invested) * 100).toFixed(1)}%`}
            positive={result.dcaValue >= result.invested}
          />
          <Stat
            label="Lump-sum value"
            value={marketService.formatPrice(result.lumpValue)}
            sub={`${(((result.lumpValue - result.invested) / result.invested) * 100).toFixed(1)}%`}
            positive={result.lumpValue >= result.invested}
          />
          <Stat
            label="DCA vs Lump"
            value={result.dcaValue >= result.lumpValue ? 'DCA won' : 'Lump won'}
          />
        </div>
      )}
      <p className="text-xs text-text-secondary mt-3">
        Past performance does not predict future results. Backtest uses weekly buys on daily closes.
      </p>
    </div>
  );
}

function Stat({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <div className="p-4 bg-gray-800/50 rounded-lg">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
      {sub && <p className={`text-xs ${positive === undefined ? 'text-text-secondary' : positive ? 'text-green-400' : 'text-red-400'}`}>{sub}</p>}
    </div>
  );
}
