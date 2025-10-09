'use client';

export const dynamic = 'force-dynamic';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { FaChartLine, FaBell, FaCog, FaSignOutAlt, FaSignal, FaStar } from 'react-icons/fa';
import Watchlist from '@/components/watchlist/Watchlist';
import BestCoinOfMonth from '@/components/market/BestCoinOfMonth';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { user, profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="bg-surface border-b border-gray-800">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold gradient-text">CryptoSuccess</h1>
              <span className="text-text-secondary">Dashboard</span>
            </div>

            <div className="flex items-center space-x-4">
              <Link href="/market" className="text-text-secondary hover:text-white p-2 flex items-center space-x-2">
                <FaChartLine size={20} />
                <span>Market</span>
              </Link>
              <Link href="/signals" className="text-text-secondary hover:text-white p-2 flex items-center space-x-2">
                <FaSignal size={20} />
                <span>Signals</span>
              </Link>
              <button className="text-text-secondary hover:text-white p-2">
                <FaBell size={20} />
              </button>
              <button className="text-text-secondary hover:text-white p-2">
                <FaCog size={20} />
              </button>
              <button
                onClick={signOut}
                className="text-text-secondary hover:text-white p-2 flex items-center space-x-2"
              >
                <FaSignOutAlt size={20} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">
            Welcome back, {user?.displayName || user?.email?.split('@')[0]}!
          </h2>
          <p className="text-text-secondary">
            You're on the {profile?.subscription?.status === 'pro' ? 'Pro' : 'Free'} plan.
            {profile?.subscription?.status === 'free' && (
              <>
                {' '}
                You have {5 - (profile?.subscription?.signalsUsedToday || 0)} signals remaining today.{' '}
                <Link href="/pricing" className="text-primary hover:text-primary-light">
                  Upgrade to Pro
                </Link>
              </>
            )}
          </p>
        </div>

        {/* Best Coin of the Month */}
        <div className="mb-8">
          <BestCoinOfMonth />
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard
            title="Total Signals Viewed"
            value={profile?.metadata?.totalSignalsViewed || 0}
            icon={<FaChartLine />}
          />
          <StatCard
            title="Active Since"
            value={new Date(profile?.metadata?.createdAt || Date.now()).toLocaleDateString()}
            icon={<FaChartLine />}
          />
          <StatCard
            title="Subscription"
            value={profile?.subscription?.status === 'pro' ? 'Pro' : 'Free'}
            icon={<FaChartLine />}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Watchlist */}
          <div className="lg:col-span-1">
            <Watchlist />
          </div>

          {/* Quick Actions */}
          <div className="lg:col-span-2">
            <div className="card p-8">
              <h3 className="text-2xl font-semibold text-white mb-6">
                Quick Actions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link
                  href="/market"
                  className="flex items-center space-x-4 p-6 bg-surface rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <FaChartLine className="text-3xl text-primary" />
                  <div>
                    <h4 className="text-lg font-semibold text-white">Market Overview</h4>
                    <p className="text-sm text-text-secondary">View real-time prices</p>
                  </div>
                </Link>

                <Link
                  href="/signals"
                  className="flex items-center space-x-4 p-6 bg-surface rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <FaSignal className="text-3xl text-green-400" />
                  <div>
                    <h4 className="text-lg font-semibold text-white">AI Signals</h4>
                    <p className="text-sm text-text-secondary">Generate trading signals</p>
                  </div>
                </Link>

                <Link
                  href="/pricing"
                  className="flex items-center space-x-4 p-6 bg-surface rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <FaStar className="text-3xl text-yellow-400" />
                  <div>
                    <h4 className="text-lg font-semibold text-white">Upgrade Plan</h4>
                    <p className="text-sm text-text-secondary">Unlock all features</p>
                  </div>
                </Link>

                <Link
                  href="/settings"
                  className="flex items-center space-x-4 p-6 bg-surface rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <FaCog className="text-3xl text-gray-400" />
                  <div>
                    <h4 className="text-lg font-semibold text-white">Settings</h4>
                    <p className="text-sm text-text-secondary">Manage preferences</p>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, icon }: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-primary text-2xl">{icon}</div>
      </div>
      <h3 className="text-text-secondary text-sm mb-1">{title}</h3>
      <p className="text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}