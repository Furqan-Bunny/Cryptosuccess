'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { SUBSCRIPTION_PLANS } from '@/types/subscription.types';
import { FaCheck, FaArrowLeft } from 'react-icons/fa';
import toast from 'react-hot-toast';

export default function PricingPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubscribe = async (planId: string) => {
    if (!user) {
      toast.error('Please sign in to subscribe');
      router.push('/login?redirect=/pricing');
      return;
    }

    setIsLoading(true);
    try {
      const { stripeService } = await import('@/services/stripe.service');
      await stripeService.subscribeToPlan(planId, billingInterval);
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Failed to start checkout. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCryptoPay = async () => {
    if (!user) {
      toast.error('Please sign in to subscribe');
      router.push('/login?redirect=/pricing');
      return;
    }
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
          <p className="text-xl text-text-secondary mb-8">
            Choose the plan that fits your trading needs
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center bg-surface rounded-lg p-1 border border-gray-800">
            <button
              onClick={() => setBillingInterval('monthly')}
              className={`px-4 py-2 rounded-md font-medium transition-all ${
                billingInterval === 'monthly'
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval('yearly')}
              className={`px-4 py-2 rounded-md font-medium transition-all ${
                billingInterval === 'yearly'
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              Yearly
              <span className="ml-2 text-success text-sm">Save 20%</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Free Plan */}
          <PricingCard
            plan={SUBSCRIPTION_PLANS.free}
            billingInterval={billingInterval}
            currentPlan={profile?.subscription?.status}
            onSubscribe={handleSubscribe}
            isLoading={isLoading}
          />

          {/* Pro Plan */}
          <PricingCard
            plan={SUBSCRIPTION_PLANS.pro}
            billingInterval={billingInterval}
            currentPlan={profile?.subscription?.status}
            onSubscribe={handleSubscribe}
            onCryptoPay={handleCryptoPay}
            isLoading={isLoading}
            popular
          />

          {/* Premium Plan */}
          <PricingCard
            plan={SUBSCRIPTION_PLANS.premium}
            billingInterval={billingInterval}
            currentPlan={profile?.subscription?.status}
            onSubscribe={handleSubscribe}
            isLoading={isLoading}
          />
        </div>

        {/* FAQ Section */}
        <div className="mt-20 max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-8 text-center">
            Frequently Asked Questions
          </h2>

          <div className="space-y-6">
            <FAQItem
              question="Can I cancel my subscription anytime?"
              answer="Yes, you can cancel your subscription at any time. You'll continue to have access to Pro features until the end of your billing period."
            />
            <FAQItem
              question="What payment methods do you accept?"
              answer="We accept all major credit cards, debit cards, and digital wallets through Stripe, plus cryptocurrency via Coinbase Commerce. Crypto payments grant Pro for a fixed period (monthly or yearly) and do not auto-renew."
            />
            <FAQItem
              question="Is there a free trial?"
              answer="We offer a generous free tier with 5 signals per day. You can upgrade to Pro anytime to unlock unlimited signals and advanced features."
            />
            <FAQItem
              question="Do you offer refunds?"
              answer="We offer a 14-day money-back guarantee. If you're not satisfied with our Pro plan, contact support within 14 days for a full refund."
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function PricingCard({
  plan,
  billingInterval,
  currentPlan,
  onSubscribe,
  onCryptoPay,
  isLoading,
  popular = false,
}: {
  plan: typeof SUBSCRIPTION_PLANS.free;
  billingInterval: 'monthly' | 'yearly';
  currentPlan?: string;
  onSubscribe: (planId: string) => void;
  onCryptoPay?: () => void;
  isLoading: boolean;
  popular?: boolean;
}) {
  const price = plan.price[billingInterval];
  const isCurrentPlan = currentPlan === plan.type;

  return (
    <div className={`card p-8 relative ${popular ? 'border-primary scale-105' : ''}`}>
      {popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="bg-primary text-white text-sm font-semibold px-4 py-1.5 rounded-full">
            Most Popular
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
            ${(price / 12).toFixed(2)}/month
          </p>
        )}
      </div>

      <ul className="space-y-3 mb-8">
        {plan.features.map((feature, index) => (
          <li key={index} className="flex items-start">
            <FaCheck className="text-success mt-0.5 mr-3 flex-shrink-0" size={16} />
            <span className="text-text-secondary">{feature}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => onSubscribe(plan.id)}
        disabled={isLoading || isCurrentPlan}
        className={`w-full py-3 font-semibold rounded-lg transition-all ${
          isCurrentPlan
            ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
            : popular
            ? 'btn-primary'
            : 'btn-secondary'
        }`}
      >
        {isCurrentPlan ? 'Current Plan' : price === 0 ? 'Get Started' : 'Subscribe'}
      </button>

      {onCryptoPay && price > 0 && !isCurrentPlan && (
        <button
          onClick={onCryptoPay}
          disabled={isLoading}
          className="w-full mt-3 py-3 font-semibold rounded-lg btn-ghost border border-gray-700 disabled:opacity-50"
        >
          Pay with crypto
        </button>
      )}
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