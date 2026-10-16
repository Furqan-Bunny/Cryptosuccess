'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { authService } from '@/services/auth.service';
import { FREE_DAILY_SIGNAL_LIMIT, isProSubscription, signalsUsedToday } from '@/lib/signal-allowance';
import { formatDate } from '@/lib/dates';
import { FaUser, FaBell, FaCrown, FaCreditCard, FaShieldAlt } from 'react-icons/fa';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { stripeService } from '@/services/stripe.service';
import TelegramLinkCard from '@/components/settings/TelegramLinkCard';
import { isCryptoPlan } from '@/lib/subscription-rules';

export default function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();

  const isPro = isProSubscription(profile?.subscription);
  const customerId = profile?.subscription?.customerId;
  // One-off crypto Pro: no renewal and no Stripe billing account to manage.
  const isCryptoPro = isPro && isCryptoPlan(profile?.subscription?.planId);
  const [billingLoading, setBillingLoading] = useState(false);

  // Optimistic notification toggle: `pendingNotif` overrides the stored value
  // from the click until the reloaded profile agrees with it. A failed write
  // drops the override, which reverts the switch.
  const [pendingNotif, setPendingNotif] = useState<boolean | null>(null);
  const [savingNotif, setSavingNotif] = useState(false);
  const storedNotif = profile?.preferences?.notifications;
  const notificationsOn = pendingNotif ?? storedNotif ?? true;

  useEffect(() => {
    if (pendingNotif !== null && !savingNotif && storedNotif === pendingNotif) setPendingNotif(null);
  }, [pendingNotif, savingNotif, storedNotif]);

  const handleToggleNotifications = async () => {
    if (!user || !profile || savingNotif) return;
    const next = !notificationsOn;
    setPendingNotif(next);
    setSavingNotif(true);
    try {
      await authService.updateNotificationPreference(user.uid, next);
      toast.success(next ? 'Notifications turned on' : 'Notifications turned off');
      await refreshProfile(); // the override clears once this lands
    } catch (e) {
      console.error('Notification preference error:', e);
      setPendingNotif(null);
      toast.error('Could not save your notification setting. Please try again.');
    } finally {
      setSavingNotif(false);
    }
  };

  const handleManageBilling = async () => {
    if (!customerId) {
      toast.error('No billing account yet — it appears after your first payment.');
      return;
    }
    setBillingLoading(true);
    try {
      await stripeService.redirectToCustomerPortal();
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
                  {formatDate(profile?.metadata?.createdAt, 'N/A')}
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
                  <p className="text-white">
                    {profile ? signalsUsedToday(profile.subscription) : 0} / {FREE_DAILY_SIGNAL_LIMIT}
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">Resets daily at 00:00 UTC</p>
                </div>
              </div>
            )}

            {isPro && profile?.subscription?.currentPeriodEnd && (
              <div className="flex items-center justify-between py-3 border-b border-gray-800">
                <div>
                  <p className="text-sm text-text-secondary">
                    {isCryptoPro ? 'Pro access ends' : 'Current period ends'}
                  </p>
                  <p className="text-white">
                    {formatDate(profile.subscription.currentPeriodEnd)}
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {isCryptoPro
                      ? 'Crypto payments do not renew. Extend with another crypto payment before this date to keep Pro.'
                      : 'Card subscriptions renew on this date unless cancelled. Manage or cancel under Manage Billing.'}
                  </p>
                </div>
              </div>
            )}

            <div className="pt-2">
              {isCryptoPro ? (
                <Link href="/pricing" className="btn-secondary px-4 py-2 text-sm inline-flex items-center space-x-2">
                  <FaCrown />
                  <span>Extend with crypto</span>
                </Link>
              ) : isPro ? (
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

        <TelegramLinkCard />

        {/* Notifications Section */}
        <div className="card p-6 mb-6">
          <div className="flex items-center space-x-3 mb-6">
            <FaBell className="text-primary text-xl" />
            <h2 className="text-xl font-semibold text-white">Notifications</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p id="notif-label" className="text-white">In-app Notifications</p>
                <p className="text-sm text-text-secondary">
                  Get notified in the app when your signals are scored after 24h, wins and losses alike
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notificationsOn}
                aria-labelledby="notif-label"
                onClick={handleToggleNotifications}
                disabled={!profile || savingNotif}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 ${
                  notificationsOn ? 'bg-primary' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    notificationsOn ? 'translate-x-[22px]' : 'translate-x-[2px]'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-white flex items-center gap-2">
                  Email Alerts
                  <span className="text-[10px] uppercase tracking-wide bg-gray-800 text-text-secondary px-2 py-0.5 rounded">
                    Coming soon
                  </span>
                </p>
                <p className="text-sm text-text-secondary">Signal alerts by email are not available yet</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={false}
                aria-label="Email alerts (coming soon)"
                disabled
                className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-gray-700 opacity-40 cursor-not-allowed"
              >
                <span className="inline-block h-5 w-5 transform rounded-full bg-white translate-x-[2px]" />
              </button>
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
