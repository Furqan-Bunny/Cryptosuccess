'use client';

import { UserProfile } from '@/types/user.types';
import { marketService } from '@/services/market.service';
import { FREE_DAILY_SIGNAL_LIMIT, isProSubscription, remainingFreeSignals } from '@/lib/signal-allowance';
import { FaSignal, FaTrophy, FaWallet, FaThermometerHalf } from 'react-icons/fa';

interface SignalStats {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
}

function sentimentLabel(v: number): string {
  if (v <= 24) return 'Extreme Fear';
  if (v <= 44) return 'Fear';
  if (v <= 55) return 'Neutral';
  if (v <= 74) return 'Greed';
  return 'Extreme Greed';
}

function Metric({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center space-x-2 mb-1 text-primary">{icon}<span className="text-xs text-text-secondary">{label}</span></div>
      <p className="text-xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-text-secondary mt-0.5">{sub}</p>}
    </div>
  );
}

export default function MetricStrip({
  profile,
  stats,
  portfolioValue,
  sentimentValue,
}: {
  profile: UserProfile | null;
  stats: SignalStats | null;
  portfolioValue: number | null;
  sentimentValue: number | null;
}) {
  const isPro = isProSubscription(profile?.subscription);
  const signalsLeft = profile ? remainingFreeSignals(profile.subscription) : null;
  // A win rate only means something once calls have been scored (24h after
  // they are made); pending calls alone must not read as a 0% record.
  const scored = stats ? stats.wins + stats.losses : 0;
  const winRateSub = !stats || stats.total === 0
    ? 'No signals yet'
    : scored > 0
      ? `${stats.wins}W · ${stats.losses}L`
      : `${stats.pending} pending · scored after 24h`;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Metric
        icon={<FaSignal />}
        label="Signals left today"
        value={isPro ? 'Unlimited' : signalsLeft === null ? '—' : `${signalsLeft} / ${FREE_DAILY_SIGNAL_LIMIT}`}
        sub={isPro ? 'Pro plan' : 'Free plan · resets 00:00 UTC'}
      />
      <Metric
        icon={<FaTrophy />}
        label="Signal win rate"
        value={scored > 0 && stats ? `${stats.winRate.toFixed(0)}%` : '—'}
        sub={winRateSub}
      />
      <Metric
        icon={<FaWallet />}
        label="Portfolio value"
        value={portfolioValue !== null ? marketService.formatPrice(portfolioValue) : '—'}
      />
      <Metric
        icon={<FaThermometerHalf />}
        label="Fear & Greed"
        value={sentimentValue !== null ? String(sentimentValue) : '—'}
        sub={sentimentValue !== null ? sentimentLabel(sentimentValue) : undefined}
      />
    </div>
  );
}
