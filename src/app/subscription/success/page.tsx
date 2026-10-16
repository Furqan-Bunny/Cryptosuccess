'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FaCheckCircle, FaClock, FaSpinner } from 'react-icons/fa';
import { useAuth } from '@/hooks/useAuth';
import { authService } from '@/services/auth.service';
import { isProSubscription } from '@/lib/signal-allowance';
import {
  clearCryptoBaseline, cryptoPaymentApplied, loadCryptoBaseline, type CryptoCheckoutBaseline,
} from '@/lib/crypto-checkout-baseline';

// Two checkout flows land here:
//   - Stripe redirects with ?session_id=... once the card payment succeeds. The
//     webhook activates Pro server-side, usually within seconds, so we poll the
//     user's own profile a few times to confirm.
//   - NOWPayments (crypto) redirects with no session_id. Pro is only granted
//     when the payment confirms on-chain (IPN webhook), which can take minutes,
//     so we check once and explain what happens next instead of promising. A
//     crypto Pro paying to EXTEND is already Pro, so "active" is only shown
//     once the period end has moved past the one recorded before checkout.
// The page never trusts the URL to grant anything; it only reads the profile.
type Flow = 'stripe' | 'crypto';
type Phase = 'checking' | 'active' | 'pending' | 'signed_out' | 'error';

const STRIPE_POLL_ATTEMPTS = 8;
const CRYPTO_POLL_ATTEMPTS = 2;
const POLL_INTERVAL_MS = 2500;

const PRO_HIGHLIGHTS = [
  'Unlimited signals on the web and in Telegram',
  'Paper-trading suite: spot, futures, staking and DCA (simulated funds)',
  'Opportunity scanner',
  'Watchlist of up to 50 coins',
];

function formatDate(d: Date | undefined): string | null {
  if (!d || Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function SuccessInner() {
  const searchParams = useSearchParams();
  const { user, loading: authLoading, refreshProfile } = useAuth();
  const flow: Flow = searchParams?.get('session_id') ? 'stripe' : 'crypto';

  const [phase, setPhase] = useState<Phase>('checking');
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  // Crypto only: Pro was already active but this payment hasn't landed yet
  // (pending), or we can't tell whether it has (no checkout record in this tab).
  const [activeUntil, setActiveUntil] = useState<string | null>(null);
  const [extensionUnknown, setExtensionUnknown] = useState(false);
  const baselineRef = useRef<CryptoCheckoutBaseline | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0); // bump to re-run the check
  const refreshRef = useRef(refreshProfile);
  refreshRef.current = refreshProfile;

  const uid = user?.uid;

  useEffect(() => {
    if (authLoading) return;
    if (!uid) {
      setPhase('signed_out');
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const maxAttempts = flow === 'stripe' ? STRIPE_POLL_ATTEMPTS : CRYPTO_POLL_ATTEMPTS;
    setPhase('checking');

    if (flow === 'crypto' && baselineRef.current === undefined) baselineRef.current = loadCryptoBaseline();

    const check = async (n: number) => {
      try {
        const profile = await authService.getUserProfile(uid);
        if (cancelled) return;
        if (profile && isProSubscription(profile.subscription)) {
          const endDate = profile.subscription.currentPeriodEnd;
          const endMs = endDate ? new Date(endDate).getTime() : NaN;
          const applied =
            flow === 'crypto'
              ? cryptoPaymentApplied(baselineRef.current ?? null, true, Number.isFinite(endMs) ? endMs : null)
              : true;
          if (applied !== false) {
            setPeriodEnd(formatDate(endDate));
            setExtensionUnknown(applied === null);
            setPhase('active');
            if (flow === 'crypto' && applied) clearCryptoBaseline();
            // Keep the rest of the app (sidebar, gates) in sync with the new plan.
            refreshRef.current().catch(() => undefined);
            return;
          }
          // Already Pro, but this crypto payment hasn't confirmed yet.
          setActiveUntil(formatDate(endDate));
        }
      } catch {
        if (cancelled) return;
        if (n + 1 >= maxAttempts) {
          setPhase('error');
          return;
        }
      }
      if (n + 1 >= maxAttempts) {
        setPhase('pending');
        return;
      }
      timer = setTimeout(() => check(n + 1), POLL_INTERVAL_MS);
    };

    check(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [authLoading, uid, flow, attempt]);

  const checkAgain = useCallback(() => setAttempt(a => a + 1), []);

  if (phase === 'checking') {
    return (
      <Shell>
        <div className="card p-8 text-center">
          <FaSpinner className="animate-spin text-5xl text-primary mb-4 mx-auto" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-white mb-2">Checking your subscription&hellip;</h1>
          <p className="text-text-secondary">
            {flow === 'stripe'
              ? 'Thanks for your payment. We are confirming that Pro is active on your account.'
              : 'Looking up your account status.'}
          </p>
        </div>
      </Shell>
    );
  }

  if (phase === 'signed_out') {
    return (
      <Shell>
        <div className="card p-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Sign in to see your plan</h1>
          <p className="text-text-secondary mb-6">
            Your payment is linked to the account you were signed in with. Sign in to that account
            to check that Pro is active.
          </p>
          <Link href="/login?redirect=/dashboard" className="btn-primary px-8 py-3">
            Sign in
          </Link>
        </div>
      </Shell>
    );
  }

  if (phase === 'active') {
    return (
      <Shell>
        <div className="card p-8 text-center">
          <FaCheckCircle className="text-6xl text-success mb-6 mx-auto" aria-hidden="true" />
          <h1 className="text-3xl font-bold text-white mb-4">Pro is active</h1>
          <p className="text-lg text-text-secondary mb-2">
            Thanks for supporting CryptoSuccess. Your account now has Pro features.
          </p>
          {periodEnd && (
            <p className="text-sm text-text-secondary mb-6">
              Current period ends on {periodEnd}
              {flow === 'crypto' ? ' (crypto payments do not renew automatically).' : '.'}
            </p>
          )}
          {extensionUnknown && (
            <p className="text-sm text-text-secondary mb-6">
              If you just paid to extend Pro, the extra time is added once the payment confirms
              on the blockchain. Check the date above again in Settings later.
            </p>
          )}

          <div className="bg-gray-800/50 rounded-lg p-6 my-8">
            <h2 className="text-xl font-semibold text-white mb-4">What Pro includes</h2>
            <ul className="space-y-2 text-left max-w-md mx-auto">
              {PRO_HIGHLIGHTS.map(item => (
                <li key={item} className="flex items-start text-white">
                  <FaCheckCircle className="text-success mr-3 mt-1 flex-shrink-0" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-xs text-text-secondary mt-4">
              Pro gives you more signals and tools, not better odds. Keep using a stop-loss.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signals" className="btn-primary px-8 py-3">
              Get a signal
            </Link>
            <Link href="/settings" className="btn-secondary px-8 py-3">
              Link Telegram
            </Link>
          </div>

          <p className="text-sm text-text-secondary mt-8">
            {flow === 'stripe'
              ? 'You can manage or cancel your subscription at any time from Settings.'
              : 'You can see your current plan in Settings.'}
          </p>
        </div>
        <HelpLinks />
      </Shell>
    );
  }

  // pending / error
  const isCrypto = flow === 'crypto';
  return (
    <Shell>
      <div className="card p-8 text-center">
        <FaClock className="text-5xl text-warning mb-6 mx-auto" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-white mb-4">
          {phase === 'error'
            ? 'We could not check your account right now'
            : isCrypto
              ? 'Waiting for your crypto payment to confirm'
              : 'Your payment is being processed'}
        </h1>

        {phase === 'error' ? (
          <p className="text-text-secondary mb-6">
            This is a connection problem on our side, not a problem with your payment. Please try
            again in a moment.
          </p>
        ) : isCrypto ? (
          <div className="text-text-secondary mb-6 space-y-3">
            {activeUntil ? (
              <p>
                Your current Pro access runs until {activeUntil}. The extra time from this payment
                is added to the end of it as soon as the payment is confirmed on the blockchain.
                Depending on the coin and network this can take from a few minutes to around an hour.
              </p>
            ) : (
              <p>
                Pro is activated automatically as soon as the payment is confirmed on the blockchain.
                Depending on the coin and network this can take from a few minutes to around an hour.
              </p>
            )}
            <p>
              You can safely close this page. If you sent less than the invoice amount, or the
              payment has not confirmed after a few hours, contact support with your invoice
              details.
            </p>
          </div>
        ) : (
          <div className="text-text-secondary mb-6 space-y-3">
            <p>
              Stripe has sent you back to us, but Pro has not shown up on your account yet.
              Activation normally takes less than a minute.
            </p>
            <p>
              You will not be charged again by checking. If Pro is still not active after an hour,
              contact support and we will sort it out.
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button type="button" onClick={checkAgain} className="btn-primary px-8 py-3">
            Check again
          </button>
          <Link href="/dashboard" className="btn-secondary px-8 py-3">
            Go to dashboard
          </Link>
        </div>
      </div>
      <HelpLinks />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">{children}</div>
      </div>
    </div>
  );
}

function HelpLinks() {
  return (
    <div className="mt-8 text-center">
      <h2 className="text-lg font-semibold text-white mb-4">Need help?</h2>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <a href="mailto:support@cryptosuccess.com" className="text-primary hover:text-primary-light">
          Contact support
        </a>
        <span className="text-gray-600 hidden sm:inline">&bull;</span>
        <Link href="/pricing" className="text-primary hover:text-primary-light">
          Plans and refund policy
        </Link>
        <span className="text-gray-600 hidden sm:inline">&bull;</span>
        <Link href="/verify" className="text-primary hover:text-primary-light">
          Verify our track record
        </Link>
      </div>
    </div>
  );
}

export default function SubscriptionSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <FaSpinner className="animate-spin text-5xl text-primary" aria-hidden="true" />
        </div>
      }
    >
      <SuccessInner />
    </Suspense>
  );
}
