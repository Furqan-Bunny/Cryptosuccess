'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from '@/types/subscription.types';
import { FaCheck, FaArrowLeft } from 'react-icons/fa';
import toast from 'react-hot-toast';

type Interval = 'monthly' | 'yearly';

// Single refund window, mirrored in the Terms of Service (section 6). Change both
// together.
const REFUND_DAYS = 14;

// Stripe plan id for the selected interval. The checkout service maps both to the
// Pro price; the interval is passed alongside so yearly checkouts stay yearly.
function proPlanId(interval: Interval): string {
  return interval === 'yearly' ? 'pro_yearly' : 'pro_monthly';
}

// Rounded yearly saving vs. paying monthly, derived from the plan prices so the
// toggle label can never drift from the real numbers.
function yearlySavingPercent(): number {
  const { monthly, yearly } = SUBSCRIPTION_PLANS.pro.price;
  if (monthly <= 0) return 0;
  return Math.round((1 - yearly / (monthly * 12)) * 100);
}

export default function PricingPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [billingInterval, setBillingInterval] = useState<Interval>('monthly');
  const [isLoading, setIsLoading] = useState(false);

  const status = profile?.subscription?.status;
  const isPro = status === 'pro';
  const saving = yearlySavingPercent();

  const requireSignIn = (): boolean => {
    if (user) return true;
    toast.error('Please sign in to subscribe');
    router.push('/login?redirect=/pricing');
    return false;
  };

  const handleSubscribe = async () => {
    if (!requireSignIn()) return;

    setIsLoading(true);
    try {
      const { stripeService } = await import('@/services/stripe.service');
      await stripeService.subscribeToPlan(proPlanId(billingInterval), billingInterval);
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Failed to start checkout. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCryptoPay = async () => {
    if (!requireSignIn()) return;

    setIsLoading(true);
    try {
      const { cryptoPayService } = await import('@/services/crypto-pay.service');
      await cryptoPayService.startCheckout(billingInterval);
    } catch (error) {
      console.error('Crypto checkout error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to start crypto checkout');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="bg-surface border-b border-gray-800">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-2xl font-bold gradient-text">
                CryptoSuccess
              </Link>
            </div>

            <div className="flex items-center space-x-4">
              {user ? (
                <Link
                  href="/dashboard"
                  className="btn-ghost px-4 py-2 text-sm font-medium"
                >
                  <FaArrowLeft className="mr-2" size={16} />
                  Back to Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="btn-ghost px-4 py-2 text-sm font-medium"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/register"
                    className="btn-primary px-4 py-2 text-sm font-medium"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Pricing Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-text-secondary mb-3">
            Start free. Upgrade only if the extra features help you.
          </p>
          <p className="text-sm text-text-secondary mb-8 max-w-2xl mx-auto">
            Pro gives you more signals and the simulated trading tools. It does not make any
            signal more likely to be right.
          </p>

          {/* Billing Toggle */}
          <div
            className="inline-flex items-center bg-surface rounded-lg p-1 border border-gray-800"
            role="group"
            aria-label="Billing interval"
          >
            <button
              type="button"
              onClick={() => setBillingInterval('monthly')}
              aria-pressed={billingInterval === 'monthly'}
              className={`px-4 py-2 rounded-md font-medium transition-all ${
                billingInterval === 'monthly'
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval('yearly')}
              aria-pressed={billingInterval === 'yearly'}
              className={`px-4 py-2 rounded-md font-medium transition-all ${
                billingInterval === 'yearly'
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              Yearly
              {saving > 0 && <span className="ml-2 text-success text-sm">Save {saving}%</span>}
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto items-start">
          {/* Free Plan */}
          <PlanCard plan={SUBSCRIPTION_PLANS.free} billingInterval={billingInterval}>
            {!user ? (
              <Link href="/register" className="btn-secondary w-full py-3 font-semibold">
                Get Started
              </Link>
            ) : isPro ? (
              <p className="text-center text-sm text-text-secondary py-3">
                Included with your Pro plan
              </p>
            ) : (
              <button
                type="button"
                disabled
                className="w-full py-3 font-semibold rounded-lg bg-gray-700 text-gray-400 cursor-not-allowed"
              >
                Current Plan
              </button>
            )}
          </PlanCard>

          {/* Pro Plan */}
          <PlanCard plan={SUBSCRIPTION_PLANS.pro} billingInterval={billingInterval} popular>
            {isPro ? (
              <button
                type="button"
                disabled
                className="w-full py-3 font-semibold rounded-lg bg-gray-700 text-gray-400 cursor-not-allowed"
              >
                Current Plan
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSubscribe}
                  disabled={isLoading}
                  className="btn-primary w-full py-3 font-semibold"
                >
                  {isLoading
                    ? 'Starting checkout...'
                    : `Subscribe ${billingInterval === 'yearly' ? 'yearly' : 'monthly'} with card`}
                </button>
                <button
                  type="button"
                  onClick={handleCryptoPay}
                  disabled={isLoading}
                  className="w-full mt-3 py-3 font-semibold rounded-lg btn-ghost border border-gray-700"
                >
                  Pay with crypto (one-time, {billingInterval === 'yearly' ? '1 year' : '1 month'})
                </button>
                <p className="text-xs text-text-secondary mt-3 text-center">
                  Card subscriptions renew until cancelled. Crypto payments do not renew.
                </p>
              </>
            )}
          </PlanCard>

          {/* Premium Plan: not purchasable yet. The account system only stores
              Free and Pro, so selling Premium would take money for nothing. */}
          <PlanCard plan={SUBSCRIPTION_PLANS.premium} billingInterval={billingInterval} comingSoon>
            <button
              type="button"
              disabled
              className="w-full py-3 font-semibold rounded-lg bg-gray-700 text-gray-400 cursor-not-allowed"
            >
              Coming soon
            </button>
          </PlanCard>
        </div>

        {/* FAQ Section */}
        <div className="mt-20 max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-8 text-center">
            Frequently Asked Questions
          </h2>

          <div className="space-y-6">
            <FAQItem
              question="Can I cancel my subscription anytime?"
              answer="Yes. Card subscriptions can be cancelled at any time from your account settings, and you keep Pro until the end of the period you have already paid for. Crypto payments are one-time and simply end when the paid period is over."
            />
            <FAQItem
              question="What payment methods do you accept?"
              answer="Cards and supported digital wallets through Stripe, plus cryptocurrency through NOWPayments. A crypto payment grants Pro for a fixed period (one month or one year) and does not auto-renew."
            />
            <FAQItem
              question="Is there a free trial?"
              answer="No. Instead there is a Free plan with 5 signals a day that never expires, so you can judge the product and check our track record before paying anything."
            />
            <FAQItem
              question="Do you offer refunds?"
              answer={`Yes. If Pro is not right for you, email support within ${REFUND_DAYS} days of your first payment for a full refund. Renewals are not refunded, but you can cancel before the next renewal at any time. Crypto refunds are paid back in crypto to an address you provide, for the original USD amount.`}
            />
            <FAQItem
              question="Is the trading real money?"
              answer="No. The portfolio, spot, futures, staking and DCA tools are paper trading with simulated funds. Nothing is bought or sold on an exchange for you."
            />
            <FAQItem
              question="Will Pro make me money?"
              answer="We cannot promise that, and nobody honestly can. Pro gives you more signals and more tools, not better odds. Every signal is scored and kept in our public, verifiable track record, wins and losses alike, so you can judge it for yourself."
            />
          </div>

          <p className="text-sm text-text-secondary mt-10 text-center">
            Prices are in USD. See our{' '}
            <Link href="/terms" className="text-primary hover:text-primary-light">Terms of Service</Link>
            {' '}and{' '}
            <Link href="/disclaimer" className="text-primary hover:text-primary-light">Risk Disclaimer</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}

function PlanCard({
  plan,
  billingInterval,
  popular = false,
  comingSoon = false,
  children,
}: {
  plan: SubscriptionPlan;
  billingInterval: Interval;
  popular?: boolean;
  comingSoon?: boolean;
  children: React.ReactNode;
}) {
  const price = plan.price[billingInterval];

  return (
    <div
      className={`card p-8 relative overflow-visible ${popular ? 'border-primary md:scale-105' : ''} ${
        comingSoon ? 'opacity-70' : ''
      }`}
    >
      {popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="bg-primary text-white text-sm font-semibold px-4 py-1.5 rounded-full whitespace-nowrap">
            Most Popular
          </span>
        </div>
      )}
      {comingSoon && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="bg-gray-700 text-white text-sm font-semibold px-4 py-1.5 rounded-full whitespace-nowrap">
            Coming soon
          </span>
        </div>
      )}

      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
        <div className="flex items-baseline justify-center">
          <span className="text-4xl font-bold text-white">${price}</span>
          {price > 0 && (
            <span className="text-text-secondary ml-1">
              /{billingInterval === 'monthly' ? 'month' : 'year'}
            </span>
          )}
        </div>
        {billingInterval === 'yearly' && price > 0 && (
          <p className="text-sm text-success mt-1">
            ${(price / 12).toFixed(2)}/month, billed yearly
          </p>
        )}
        {comingSoon && (
          <p className="text-sm text-text-secondary mt-2">Not available to buy yet</p>
        )}
      </div>

      <ul className="space-y-3 mb-8">
        {plan.features.map(feature => (
          <li key={feature} className="flex items-start">
            <FaCheck className="text-success mt-0.5 mr-3 flex-shrink-0" size={16} />
            <span className="text-text-secondary">{feature}</span>
          </li>
        ))}
      </ul>

      {children}
    </div>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-2">{question}</h3>
      <p className="text-text-secondary">{answer}</p>
    </div>
  );
}
