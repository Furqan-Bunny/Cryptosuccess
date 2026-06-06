'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import SimDisclaimer from '@/components/shared/SimDisclaimer';
import { useMarketData } from '@/hooks/useMarketData';
import { futuresService } from '@/services/futures.service';
import { paperAccountService } from '@/services/paper-account.service';
import { marketService } from '@/services/market.service';
import { COIN_SYMBOLS, getCoinName } from '@/lib/coins';
import {
  FuturesPosition,
  PositionSide,
  buildPosition,
  computePnl,
  computeRoe,
  MAX_LEVERAGE,
  MIN_LEVERAGE,
} from '@/lib/futures';
import { FaBolt } from 'react-icons/fa';
import toast from 'react-hot-toast';

export default function FuturesPage() {
  return (
    <ProtectedRoute requirePro>
      <FuturesPageInner />
    </ProtectedRoute>
  );
}

function FuturesPageInner() {
  const { user } = useAuth();
  const { prices } = useMarketData({ symbols: COIN_SYMBOLS, enableRealtime: true });

  const [symbol, setSymbol] = useState('BTC');
  const [side, setSide] = useState<PositionSide>('long');
  const [leverage, setLeverage] = useState(10);
  const [marginUsd, setMarginUsd] = useState('100');
  const [positions, setPositions] = useState<FuturesPosition[]>([]);
  const [balance, setBalance] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!user) return;
    try {
      const [pos, bal] = await Promise.all([
        futuresService.listPositions(user.uid),
        paperAccountService.getBalance(user.uid),
      ]);
      setPositions(pos);
      setBalance(bal);
    } catch (e) {
      console.error('Error loading futures data:', e);
    }
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const entryPrice = prices[symbol]?.price ?? 0;
  const margin = parseFloat(marginUsd) || 0;

  const preview = useMemo(() => {
    if (!entryPrice || !margin) return null;
    return buildPosition(side, entryPrice, leverage, margin);
  }, [entryPrice, margin, leverage, side]);

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (margin <= 0) {
      toast.error('Enter a valid margin');
      return;
    }
    setSubmitting(true);
    try {
      const res = await futuresService.openPosition(user.uid, { symbol, side, leverage, marginUsd: margin });
      if (res.success) {
        toast.success(`${side === 'long' ? 'Long' : 'Short'} ${symbol} opened`);
        setMarginUsd('100');
        await load();
      } else {
        toast.error(res.error || 'Failed to open position');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async (id?: string) => {
    if (!user || !id) return;
    const res = await futuresService.closePosition(user.uid, id);
    if (res.success) {
      toast.success(`Closed · PnL ${marketService.formatPrice(res.realizedPnl || 0)}`);
      await load();
    } else {
      toast.error(res.error || 'Failed to close');
    }
  };

  const openPositions = positions.filter(p => p.status === 'open');
  const closedPositions = positions.filter(p => p.status !== 'open');

  return (
    <>
      <div className="bg-surface border-b border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
            <FaBolt className="text-primary" /> Paper Futures
          </h1>
          <p className="text-text-secondary">Simulated perpetual futures with leverage. Real prices, virtual margin.</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-8">
        <SimDisclaimer extra="Leverage amplifies both gains and losses; positions are liquidated when the mark price reaches the liquidation level, and the margin is lost. High risk." />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Open position form */}
          <div className="card p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-white">Open Position</h2>
              <span className="text-sm text-text-secondary">Balance: {marketService.formatPrice(balance)}</span>
            </div>

            <form onSubmit={handleOpen} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSide('long')}
                  className={`py-3 rounded-lg font-semibold ${side === 'long' ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-400'}`}
                >
                  Long
                </button>
                <button
                  type="button"
                  onClick={() => setSide('short')}
                  className={`py-3 rounded-lg font-semibold ${side === 'short' ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400'}`}
                >
                  Short
                </button>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-2">Asset</label>
                <select
                  value={symbol}
                  onChange={e => setSymbol(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                >
                  {COIN_SYMBOLS.map(s => (
                    <option key={s} value={s}>{getCoinName(s)} ({s})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-2">
                  Leverage <span className="float-right text-primary font-bold">{leverage}x</span>
                </label>
                <input
                  type="range"
                  min={MIN_LEVERAGE}
                  max={MAX_LEVERAGE}
                  value={leverage}
                  onChange={e => setLeverage(parseInt(e.target.value, 10))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-text-secondary">
                  <span>{MIN_LEVERAGE}x</span>
                  <span>{MAX_LEVERAGE}x</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-2">Margin (USD)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={marginUsd}
                  onChange={e => setMarginUsd(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                />
              </div>

              {/* Preview */}
              <div className="bg-gray-800/50 rounded-lg p-4 text-sm space-y-1">
                <Row label="Entry price" value={entryPrice ? marketService.formatPrice(entryPrice) : '—'} />
                <Row label="Position size" value={preview ? marketService.formatPrice(preview.notionalUsd) : '—'} />
                <Row
                  label="Est. liquidation"
                  value={preview ? marketService.formatPrice(preview.liquidationPrice) : '—'}
                  danger
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !entryPrice}
                className={`w-full py-3 rounded-lg font-semibold text-white disabled:opacity-50 ${side === 'long' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}`}
              >
                {submitting ? 'Opening…' : `Open ${side} ${leverage}x`}
              </button>
            </form>
          </div>

          {/* Open positions */}
          <div className="card p-6 lg:col-span-2">
            <h2 className="text-xl font-semibold text-white mb-4">Open Positions</h2>
            {openPositions.length === 0 ? (
              <p className="text-text-secondary">No open positions.</p>
            ) : (
              <div className="space-y-3">
                {openPositions.map(pos => {
                  const mark = prices[pos.symbol]?.price ?? pos.entryPrice;
                  const pnl = computePnl(pos.side, pos.entryPrice, mark, pos.quantity);
                  const roe = computeRoe(pnl, pos.marginUsd);
                  const positive = pnl >= 0;
                  return (
                    <div key={pos.id} className="p-4 bg-gray-800/50 rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-white font-medium">
                            {pos.symbol}{' '}
                            <span className={pos.side === 'long' ? 'text-green-400' : 'text-red-400'}>
                              {pos.side.toUpperCase()} {pos.leverage}x
                            </span>
                          </p>
                          <p className="text-xs text-text-secondary">
                            Margin {marketService.formatPrice(pos.marginUsd)} · Size {marketService.formatPrice(pos.quantity * pos.entryPrice)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleClose(pos.id)}
                          className="px-3 py-1 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
                        >
                          Close
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <Row label="Entry" value={marketService.formatPrice(pos.entryPrice)} />
                        <Row label="Mark" value={marketService.formatPrice(mark)} />
                        <Row label="Liq." value={marketService.formatPrice(pos.liquidationPrice)} danger />
                        <div>
                          <p className="text-text-secondary">uPnL</p>
                          <p className={positive ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                            {positive ? '+' : ''}{marketService.formatPrice(pnl)} ({roe.toFixed(1)}%)
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {closedPositions.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-text-secondary mb-2">History</h3>
                <div className="space-y-2">
                  {closedPositions.slice(0, 15).map(pos => (
                    <div key={pos.id} className="flex justify-between items-center text-sm p-3 bg-gray-800/30 rounded-lg">
                      <span className="text-white">
                        {pos.symbol} {pos.side} {pos.leverage}x{' '}
                        {pos.status === 'liquidated' && <span className="text-red-400">· liquidated</span>}
                      </span>
                      <span className={(pos.realizedPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {(pos.realizedPnl ?? 0) >= 0 ? '+' : ''}{marketService.formatPrice(pos.realizedPnl ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex justify-between sm:block">
      <p className="text-text-secondary">{label}</p>
      <p className={danger ? 'text-red-400 font-medium' : 'text-white font-medium'}>{value}</p>
    </div>
  );
}
