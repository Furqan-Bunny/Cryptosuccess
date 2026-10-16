'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import SimDisclaimer from '@/components/shared/SimDisclaimer';
import { stakingService, StakingPosition, StakingRate, accruedRewards } from '@/services/staking.service';
import { paperAccountService } from '@/services/paper-account.service';
import { marketService } from '@/services/market.service';
import { getCoinName } from '@/lib/coins';
import { FaCoins } from 'react-icons/fa';
import toast from 'react-hot-toast';

export default function StakingPage() {
  return (
    <ProtectedRoute requirePro>
      <StakingPageInner />
    </ProtectedRoute>
  );
}

function StakingPageInner() {
  const { user } = useAuth();
  const [rates, setRates] = useState<Record<string, StakingRate>>({});
  const [positions, setPositions] = useState<StakingPosition[]>([]);
  const [balance, setBalance] = useState(0);
  const [symbol, setSymbol] = useState('');
  const [amountUsd, setAmountUsd] = useState('500');
  const [submitting, setSubmitting] = useState(false);
  const [, setTick] = useState(0);

  const load = async () => {
    if (!user) return;
    try {
      const [r, pos, bal] = await Promise.all([
        stakingService.getRates(),
        stakingService.listPositions(user.uid),
        paperAccountService.getBalance(user.uid),
      ]);
      setRates(r);
      setPositions(pos);
      setBalance(bal);
      if (!symbol && Object.keys(r).length > 0) setSymbol(Object.keys(r)[0]);
    } catch (e) {
      console.error('Error loading staking data:', e);
    }
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Re-render every 30s so accrued rewards tick up live.
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const rateList = Object.values(rates).sort((a, b) => b.apy - a.apy);
  const selectedApy = rates[symbol]?.apy ?? 0;

  const handleStake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !symbol) return;
    const usd = parseFloat(amountUsd);
    if (!usd || usd <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setSubmitting(true);
    try {
      const res = await stakingService.stake(user.uid, symbol, usd);
      if (res.success) {
        toast.success(`Staked ${marketService.formatPrice(usd)} of ${symbol}`);
        setAmountUsd('500');
        await load();
      } else {
        toast.error(res.error || 'Failed to stake');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnstake = async (id?: string) => {
    if (!user || !id) return;
    const res = await stakingService.unstake(user.uid, id);
    if (res.success) {
      toast.success(`Unstaked · returned ${marketService.formatPrice(res.returned || 0)}`);
      await load();
    } else {
      toast.error(res.error || 'Failed to unstake');
    }
  };

  const active = positions.filter(p => p.active);

  return (
    <>
      <div className="bg-surface border-b border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
            <FaCoins className="text-primary" /> Staking
          </h1>
          <p className="text-text-secondary">Earn simulated staking rewards on your paper balance.</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-8">
        <SimDisclaimer extra="APYs are real reference rates (via DefiLlama) but rewards here are simulated estimates, not an actual yield product. APY is variable and not guaranteed." />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Stake form */}
          <div className="card p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-white">Stake</h2>
              <span className="text-sm text-text-secondary">Balance: {marketService.formatPrice(balance)}</span>
            </div>

            {rateList.length === 0 ? (
              <p className="text-text-secondary text-sm">
                Staking rates aren&apos;t available yet. They are refreshed daily — check back soon.
              </p>
            ) : (
              <form onSubmit={handleStake} className="space-y-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-2">Asset</label>
                  <select
                    value={symbol}
                    onChange={e => setSymbol(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                  >
                    {rateList.map(r => (
                      <option key={r.symbol} value={r.symbol}>
                        {getCoinName(r.symbol)} ({r.symbol}) — {r.apy.toFixed(2)}% APY
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-2">Amount (USD)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={amountUsd}
                    onChange={e => setAmountUsd(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">APY</span>
                    <span className="text-green-400 font-semibold">{selectedApy.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Est. yearly reward</span>
                    <span className="text-white">
                      {marketService.formatPrice((parseFloat(amountUsd) || 0) * (selectedApy / 100))}
                    </span>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-lg font-semibold bg-primary hover:bg-primary/80 text-white disabled:opacity-50"
                >
                  {submitting ? 'Staking…' : 'Stake'}
                </button>
              </form>
            )}
          </div>

          {/* Active stakes */}
          <div className="card p-6 lg:col-span-2">
            <h2 className="text-xl font-semibold text-white mb-4">Your Stakes</h2>
            {active.length === 0 ? (
              <p className="text-text-secondary">No active stakes.</p>
            ) : (
              <div className="space-y-3">
                {active.map(pos => {
                  const rewards = accruedRewards(pos);
                  return (
                    <div key={pos.id} className="flex justify-between items-center p-4 bg-gray-800/50 rounded-lg">
                      <div>
                        <p className="text-white font-medium">
                          {marketService.formatPrice(pos.amountUsd)} {pos.symbol}{' '}
                          <span className="text-green-400 text-sm">{pos.apySnapshot.toFixed(2)}% APY</span>
                        </p>
                        <p className="text-xs text-text-secondary">
                          Accrued: <span className="text-green-400">+{marketService.formatPrice(rewards)}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => handleUnstake(pos.id)}
                        className="px-3 py-1 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
                      >
                        Unstake
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
