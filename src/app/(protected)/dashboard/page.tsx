'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useMarketData } from '@/hooks/useMarketData';
import { COIN_SYMBOLS, isSupportedCoin } from '@/lib/coins';
import { isProSubscription, remainingFreeSignals } from '@/lib/signal-allowance';
import { portfolioService, PortfolioSummary } from '@/services/portfolio.service';
import { signalHistoryService } from '@/services/signal-history.service';
import { sentimentService } from '@/services/sentiment.service';

import MetricStrip from '@/components/dashboard/MetricStrip';
import LatestBrief from '@/components/dashboard/LatestBrief';
import PortfolioSnapshot from '@/components/dashboard/PortfolioSnapshot';
import MarketMovers from '@/components/dashboard/MarketMovers';
import DashboardWatchlist from '@/components/dashboard/DashboardWatchlist';
import SentimentGauge from '@/components/market/SentimentGauge';
import SignalHistory from '@/components/signals/SignalHistory';

interface SignalStats {
  total: number; wins: number; losses: number; pending: number; winRate: number;
}

export default function DashboardPage() {
  const { user, profile, profileError, refreshProfile } = useAuth();
  const isPro = isProSubscription(profile?.subscription);
  // UTC-day aware (matches consume_signal): a counter from an earlier UTC day
  // shows the full allowance, not yesterday's leftovers.
  const signalsLeft = remainingFreeSignals(profile?.subscription);

  const watchlist = useMemo(
    () => (profile?.preferences?.watchlist || []).filter(isSupportedCoin),
    [profile]
  );

  // Single market-data fetch for the whole dashboard — no WebSockets (realtime
  // off for speed); one /api/market/all on mount + a 60s refresh. Shared with
  // the movers and watchlist widgets via the `prices` prop.
  const { prices } = useMarketData({ symbols: COIN_SYMBOLS, enableRealtime: false });

  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [stats, setStats] = useState<SignalStats | null>(null);
  const [sentiment, setSentiment] = useState<number | null>(null);

  // Independent, lazy fetches so no single one blocks first paint.
  useEffect(() => {
    if (!user) return;
    setPortfolioLoading(true);
    portfolioService.getPortfolio(user.uid)
      .then(setPortfolio).catch(() => setPortfolio(null)).finally(() => setPortfolioLoading(false));
    signalHistoryService.getSignalStats(user.uid).then(setStats).catch(() => {});
    sentimentService.getFearGreedIndex().then(s => setSentiment(s.value)).catch(() => setSentiment(null));
  }, [user]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-3xl font-bold text-white mb-1">
          Welcome back, {user?.displayName || user?.email?.split('@')[0]}!
        </h2>
        {profile ? (
          <p className="text-text-secondary">
            You&apos;re on the {isPro ? 'Pro' : 'Free'} plan.
            {!isPro && (
              <>
                {' '}You have {signalsLeft} {signalsLeft === 1 ? 'signal' : 'signals'} remaining today (resets at 00:00 UTC).{' '}
                <Link href="/pricing" className="text-primary hover:text-primary-light">Upgrade to Pro</Link>
              </>
            )}
          </p>
        ) : (
          <p className="text-text-secondary">
            {profileError ? (
              <>
                We couldn&apos;t load your plan details.{' '}
                <button onClick={() => refreshProfile()} className="text-primary hover:text-primary-light">
                  Try again
                </button>
              </>
            ) : (
              'Loading your plan…'
            )}
          </p>
        )}
      </div>

      <MetricStrip
        profile={profile}
        stats={stats}
        portfolioValue={portfolio ? portfolio.totalValue : null}
        sentimentValue={sentiment}
      />

      <LatestBrief />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PortfolioSnapshot portfolio={portfolio} loading={portfolioLoading} isPro={isPro} />
        </div>
        <SentimentGauge />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MarketMovers prices={prices} />
        <DashboardWatchlist prices={prices} watchlist={watchlist} isPro={isPro} />
      </div>

      {user && <SignalHistory userId={user.uid} />}
    </div>
  );
}
