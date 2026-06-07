'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMarketData } from '@/hooks/useMarketData';
import { authService } from '@/services/auth.service';
import { marketService } from '@/services/market.service';
import { buildSignalReport, SignalReportData } from '@/services/signal-report.service';
import { getAnalystTake, AnalystTake } from '@/services/ai-analyst.service';
import { signalHistoryService } from '@/services/signal-history.service';
import { COINS, isSupportedCoin, isAiProfiled, getCoinName, getCoinIcon } from '@/lib/coins';
import { FaCrown, FaPlus, FaTimes, FaSearch, FaFlask, FaStar } from 'react-icons/fa';

import SignalReport from '@/components/signals/SignalReport';
import SignalHistory from '@/components/signals/SignalHistory';
import TrackRecord from '@/components/signals/TrackRecord';
import SentimentGauge from '@/components/market/SentimentGauge';

export default function SignalsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [signalLimit, setSignalLimit] = useState<{ allowed: boolean; remaining: number }>({ allowed: true, remaining: 5 });
  const [reports, setReports] = useState<SignalReportData[]>([]);
  const [analyst, setAnalyst] = useState<Record<string, { loading: boolean; take: AnalystTake | null }>>({});
  const [loadingSymbol, setLoadingSymbol] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [aiTrained, setAiTrained] = useState<boolean | null>(null);
  const [training, setTraining] = useState(false);

  const isPro = profile?.subscription?.status === 'pro';
  const maxWatchlist = isPro ? 50 : 5;

  const watchlist = useMemo(
    () => (profile?.preferences?.watchlist || []).filter(isSupportedCoin),
    [profile]
  );

  const { prices } = useMarketData({ symbols: watchlist, enableRealtime: true });

  useEffect(() => {
    if (user) checkSignalLimit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile]);

  // Whether a trained AI model exists (otherwise signals use the technical engine).
  useEffect(() => {
    let mounted = true;
    import('@/services/ai-signals.service')
      .then(m => m.aiSignalsService.hasTrainedModel())
      .then(v => { if (mounted) setAiTrained(v); })
      .catch(() => { if (mounted) setAiTrained(false); });
    return () => { mounted = false; };
  }, []);

  const trainAI = async () => {
    setTraining(true);
    const t = toast.loading('Training AI model in your browser… this can take a minute.');
    try {
      const m = await import('@/services/ai-signals.service');
      await m.aiSignalsService.trainAllModels();
      setAiTrained(true);
      toast.success('AI model trained — new signals will use it.', { id: t });
    } catch (e) {
      console.error('Training failed:', e);
      toast.error('Training failed. Please try again later.', { id: t });
    } finally {
      setTraining(false);
    }
  };

  const checkSignalLimit = async () => {
    if (!user) return;
    try {
      setSignalLimit(await authService.checkSignalLimit(user.uid));
    } catch (e) {
      console.error('Error checking signal limit:', e);
    }
  };

  const generate = async (symbol: string) => {
    if (!isPro && !signalLimit.allowed) {
      toast.error('Daily signal limit reached. Upgrade to Pro for unlimited signals!');
      return;
    }
    setLoadingSymbol(symbol);
    try {
      const report = await buildSignalReport(symbol);

      if (user && !isPro) {
        await authService.incrementSignalUsage(user.uid);
        await checkSignalLimit();
      }

      setReports(prev => [report, ...prev.filter(r => r.signal.symbol !== symbol)]);

      // Fetch the Claude analyst read in the background (automatic per signal).
      setAnalyst(prev => ({ ...prev, [symbol]: { loading: true, take: null } }));
      getAnalystTake(report)
        .then(take => setAnalyst(prev => ({ ...prev, [symbol]: { loading: false, take } })))
        .catch(() => setAnalyst(prev => ({ ...prev, [symbol]: { loading: false, take: null } })));

      if (user) {
        try {
          await signalHistoryService.storeSignal({
            userId: user.uid,
            symbol: report.signal.symbol,
            action: report.signal.action,
            confidence: report.signal.confidence,
            entryPrice: report.signal.price,
            targetPrice: report.signal.targetPrice,
            stopLoss: report.signal.stopLoss,
            reasoning: report.signal.reasoning,
          });
        } catch (e) {
          console.error('Error storing signal:', e);
        }
      }

      toast.success(`${report.signal.action} signal generated for ${symbol}`, {
        icon: report.signal.action === 'BUY' ? '📈' : report.signal.action === 'SELL' ? '📉' : '⏸️',
      });
    } catch (e) {
      console.error('Error generating signal:', e);
      toast.error('Failed to generate signal. Please try again.');
    } finally {
      setLoadingSymbol(null);
    }
  };

  const addCoin = async (symbol: string) => {
    if (watchlist.includes(symbol)) return;
    if (!isPro && watchlist.length >= maxWatchlist) {
      toast.error(`Free plan tracks up to ${maxWatchlist} coins. Upgrade to Pro for more.`);
      return;
    }
    try {
      if (user) {
        await supabase.from('profiles').update({ watchlist: [...watchlist, symbol] }).eq('id', user.uid);
        await refreshProfile();
      }
      toast.success(`${symbol} added to your watchlist`);
      setShowAddModal(false);
      setAddQuery('');
    } catch (e) {
      console.error('Error adding coin:', e);
      toast.error('Failed to add coin');
    }
  };

  const addable = COINS.filter(
    c => !watchlist.includes(c.symbol) &&
      (c.symbol.toLowerCase().includes(addQuery.toLowerCase()) ||
        c.name.toLowerCase().includes(addQuery.toLowerCase()))
  );

  return (
    <>
      {/* Header */}
      <div className="bg-surface border-b border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">AI Trading Signals</h1>
              <p className="text-text-secondary">Detailed, explainable signals for the coins on your watchlist</p>
            </div>
            <div className="flex items-center space-x-6">
              {!isPro && (
                <div className="text-right">
                  <p className="text-sm text-text-secondary mb-1">Signals remaining today</p>
                  <p className="text-2xl font-bold text-primary">{signalLimit.remaining} / 5</p>
                </div>
              )}
              <div className="text-right">
                <p className="text-xs mb-1">
                  {aiTrained === null
                    ? <span className="text-text-secondary">Checking AI…</span>
                    : aiTrained
                      ? <span className="text-green-400">● AI model active</span>
                      : <span className="text-text-secondary">Using technical analysis</span>}
                </p>
                <button
                  onClick={trainAI}
                  disabled={training}
                  className="btn-secondary px-3 py-1 text-sm disabled:opacity-50"
                >
                  {training ? 'Training…' : aiTrained ? 'Retrain AI' : 'Train AI model'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Upgrade banner */}
        {!isPro && signalLimit.remaining <= 2 && (
          <div className="bg-primary/10 border border-primary rounded-lg p-6 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <FaCrown className="text-4xl text-primary" />
              <div>
                <h3 className="text-xl font-semibold text-white mb-1">Running low on signals?</h3>
                <p className="text-text-secondary">Upgrade to Pro for unlimited AI trading signals and a bigger watchlist.</p>
              </div>
            </div>
            <Link href="/pricing" className="btn-primary px-6 py-3">Upgrade to Pro</Link>
          </div>
        )}

        {/* Watchlist + sentiment */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white flex items-center">
                  <FaStar className="mr-2 text-yellow-500" /> Your Watchlist
                </h2>
                <button onClick={() => setShowAddModal(true)} className="btn-secondary px-3 py-1 text-sm flex items-center">
                  <FaPlus className="mr-1" /> Add coins
                </button>
              </div>

              {watchlist.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-text-secondary mb-4">Your watchlist is empty. Add coins to generate signals for them.</p>
                  <button onClick={() => setShowAddModal(true)} className="btn-primary px-4 py-2">Add to Watchlist</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {watchlist.map(symbol => {
                    const price = prices[symbol];
                    const busy = loadingSymbol === symbol;
                    return (
                      <div key={symbol} className="bg-surface border border-gray-800 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <span className="text-2xl">{getCoinIcon(symbol)}</span>
                            <div>
                              <div className="flex items-center space-x-1">
                                <span className="font-semibold text-white">{symbol}</span>
                                {!isAiProfiled(symbol) && <FaFlask className="text-[10px] text-orange-400" title="Experimental" />}
                              </div>
                              <p className="text-xs text-text-secondary">{getCoinName(symbol)}</p>
                            </div>
                          </div>
                          {price && (
                            <div className="text-right">
                              <p className="text-sm font-medium text-white">{marketService.formatPrice(price.price)}</p>
                              <p className={`text-xs ${price.changePercent24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {price.changePercent24h >= 0 ? '+' : ''}{price.changePercent24h.toFixed(2)}%
                              </p>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => generate(symbol)}
                          disabled={busy || (!isPro && !signalLimit.allowed)}
                          className="w-full btn-primary py-2 text-sm disabled:opacity-50"
                        >
                          {busy ? 'Analyzing…' : 'Generate Signal'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <SentimentGauge />
        </div>

        {/* Generated reports */}
        {user && <TrackRecord userId={user.uid} />}

        {reports.length > 0 && (
          <div className="space-y-8">
            <h2 className="text-xl font-semibold text-white">Generated Signals</h2>
            {reports.map(report => (
              <SignalReport
                key={report.signal.symbol}
                report={report}
                loading={loadingSymbol === report.signal.symbol}
                onRegenerate={() => generate(report.signal.symbol)}
                analyst={analyst[report.signal.symbol]?.take ?? null}
                analystLoading={analyst[report.signal.symbol]?.loading ?? false}
              />
            ))}
          </div>
        )}

        {/* History */}
        {user && <SignalHistory userId={user.uid} />}
      </div>

      {/* Add coins modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-surface rounded-lg p-6 max-w-md w-full max-h-[75vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">Add to Watchlist</h3>
              <button onClick={() => setShowAddModal(false)} className="text-text-secondary hover:text-white"><FaTimes /></button>
            </div>
            <div className="relative mb-4">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm" />
              <input
                type="text"
                value={addQuery}
                onChange={e => setAddQuery(e.target.value)}
                placeholder="Search coins…"
                className="w-full pl-9 pr-4 py-2 bg-background border border-gray-700 rounded-lg text-white placeholder-text-secondary focus:border-primary focus:outline-none"
              />
            </div>
            {!isPro && (
              <p className="text-xs text-text-secondary mb-3">{watchlist.length}/{maxWatchlist} coins · Upgrade to Pro for up to 50</p>
            )}
            <div className="space-y-2">
              {addable.length === 0 && <p className="text-text-secondary text-sm text-center py-4">No coins found.</p>}
              {addable.map(c => (
                <button
                  key={c.symbol}
                  onClick={() => addCoin(c.symbol)}
                  className="w-full text-left p-3 bg-background rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-between"
                >
                  <span className="flex items-center space-x-2">
                    <span className="text-xl">{c.icon}</span>
                    <span className="text-white font-medium">{c.symbol}</span>
                    <span className="text-text-secondary text-sm">{c.name}</span>
                  </span>
                  <FaPlus className="text-primary" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
