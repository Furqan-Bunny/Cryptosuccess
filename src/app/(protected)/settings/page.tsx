'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { FaUser, FaBell, FaCrown, FaCreditCard, FaShieldAlt } from 'react-icons/fa';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { stripeService } from '@/services/stripe.service';

export default function SettingsPage() {
  const { user, profile } = useAuth();

  const isPro = profile?.subscription?.status === 'pro';
  const customerId = profile?.subscription?.customerId;
  const [billingLoading, setBillingLoading] = useState(false);

  const handleManageBilling = async () => {
    if (!customerId) {
      toast.error('No billing account yet — it appears after your first payment.');
      return;
    }
    setBillingLoading(true);
    try {
      await stripeService.redirectToCustomerPortal(customerId);
    } catch (e) {
      console.error('Billing portal error:', e);
      toast.error('Could not open the billing portal. Please try again.');
      setBillingLoading(false);
    }
  };

  return (
    <>
      <div className="bg-surface border-b border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
          <p className="text-text-secondary">Manage your account and preferences</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Profile Section */}
        <div className="card p-6 mb-6">
          <div className="flex items-center space-x-3 mb-6">
            <FaUser className="text-primary text-xl" />
            <h2 className="text-xl font-semibold text-white">Profile</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-sm text-text-secondary">Display Name</p>
                <p className="text-white">{user?.displayName || 'Not set'}</p>
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-sm text-text-secondary">Email</p>
                <p className="text-white">{user?.email}</p>
              </div>
              {user?.emailVerified && (
                <span className="text-xs bg-green-900/20 text-green-400 px-2 py-1 rounded">Verified</span>
              )}
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-text-secondary">Member Since</p>
                <p className="text-white">
                  {profile?.metadata?.createdAt
                    ? new Date(profile.metadata.createdAt).toLocaleDateString()
                    : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Subscription Section */}
        <div className="card p-6 mb-6">
          <div className="flex items-center space-x-3 mb-6">
            <FaCrown className={`text-xl ${isPro ? 'text-yellow-400' : 'text-text-secondary'}`} />
            <h2 className="text-xl font-semibold text-white">Subscription</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-sm text-text-secondary">Current Plan</p>
                <p className="text-white font-medium">
                  {isPro ? 'Pro Plan' : 'Free Plan'}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                isPro ? 'bg-yellow-900/20 text-yellow-400' : 'bg-gray-800 text-text-secondary'
              }`}>
                {isPro ? 'Active' : 'Free'}
              </span>
            </div>

            {!isPro && (
              <div className="flex items-center justify-between py-3 border-b border-gray-800">
                <div>
                  <p className="text-sm text-text-secondary">Signals Used Today</p>
                  <p className="text-white">{profile?.subscription?.signalsUsedToday || 0} / 5</p>
                </div>
              </div>
            )}

            {isPro && profile?.subscription?.currentPeriodEnd && (
              <div className="flex items-center justify-between py-3 border-b border-gray-800">
                <div>
                  <p className="text-sm text-text-secondary">Next Billing Date</p>
                  <p className="text-white">
                    {new Date(profile.subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                </div>
              </div>
            )}

            <div className="pt-2">
              {isPro ? (
                <button
                  onClick={handleManageBilling}
                  disabled={billingLoading}
                  className="btn-secondary px-4 py-2 text-sm flex items-center space-x-2 disabled:opacity-50"
                >
                  <FaCreditCard />
                  <span>{billingLoading ? 'Opening…' : 'Manage Billing'}</span>
                </button>
              ) : (
                <Link href="/pricing" className="btn-primary px-4 py-2 text-sm inline-flex items-center space-x-2">
                  <FaCrown />
                  <span>Upgrade to Pro</span>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Notifications Section */}
        <div className="card p-6 mb-6">
          <div className="flex items-center space-x-3 mb-6">
            <FaBell className="text-primary text-xl" />
            <h2 className="text-xl font-semibold text-white">Notifications</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-white">Push Notifications</p>
                <p className="text-sm text-text-secondary">Get notified about new signals</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={profile?.preferences?.notifications ?? true}
                  className="sr-only peer"
                  readOnly
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-white">Email Alerts</p>
                <p className="text-sm text-text-secondary">Receive signal alerts via email</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={false} className="sr-only peer" readOnly />
                <div className="w-11 h-6 bg-gray-700 peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="card p-6">
          <div className="flex items-center space-x-3 mb-6">
            <FaShieldAlt className="text-primary text-xl" />
            <h2 className="text-xl font-semibold text-white">Security</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-white">Timezone</p>
                <p className="text-sm text-text-secondary">{profile?.preferences?.timezone || 'Not set'}</p>
              </div>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-white">Watchlist</p>
                <p className="text-sm text-text-secondary">
                  {profile?.preferences?.watchlist?.length || 0} coins tracked
                </p>
              </div>
              <Link href="/dashboard" className="text-primary text-sm hover:text-primary-light">
                Manage
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
