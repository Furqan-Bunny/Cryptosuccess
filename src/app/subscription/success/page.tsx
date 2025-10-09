'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { FaCheckCircle, FaSpinner } from 'react-icons/fa';
import { stripeService } from '@/services/stripe.service';
import Link from 'next/link';

export default function SubscriptionSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!searchParams) {
      setError('Invalid session');
      setLoading(false);
      return;
    }

    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      setError('Invalid session');
      setLoading(false);
      return;
    }

    // Handle the successful payment
    handlePaymentSuccess(sessionId);
  }, [searchParams]);

  const handlePaymentSuccess = async (sessionId: string) => {
    try {
      await stripeService.handlePaymentSuccess(sessionId);

      // Wait a moment to show success
      setTimeout(() => {
        setLoading(false);
      }, 2000);
    } catch (error) {
      console.error('Error processing payment:', error);
      setError('Failed to process payment confirmation');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <FaSpinner className="animate-spin text-5xl text-primary mb-4 mx-auto" />
          <h1 className="text-2xl font-bold text-white mb-2">Processing your subscription...</h1>
          <p className="text-text-secondary">Please wait while we activate your Pro features</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-text-secondary mb-6">{error}</p>
          <Link href="/dashboard" className="btn-primary">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">
          <div className="card p-8 text-center">
            <FaCheckCircle className="text-6xl text-success mb-6 mx-auto" />

            <h1 className="text-3xl font-bold text-white mb-4">
              Welcome to CryptoSuccess Pro! 🎉
            </h1>

            <p className="text-lg text-text-secondary mb-8">
              Your subscription has been activated successfully. You now have access to all Pro features.
            </p>

            <div className="bg-gray-800/50 rounded-lg p-6 mb-8">
              <h2 className="text-xl font-semibold text-white mb-4">
                What's included in your Pro subscription:
              </h2>
              <ul className="space-y-2 text-left max-w-sm mx-auto">
                <li className="flex items-center text-white">
                  <FaCheckCircle className="text-success mr-3" />
                  Unlimited AI trading signals
                </li>
                <li className="flex items-center text-white">
                  <FaCheckCircle className="text-success mr-3" />
                  Advanced technical analysis
                </li>
                <li className="flex items-center text-white">
                  <FaCheckCircle className="text-success mr-3" />
                  Real-time price alerts
                </li>
                <li className="flex items-center text-white">
                  <FaCheckCircle className="text-success mr-3" />
                  Portfolio tracking
                </li>
                <li className="flex items-center text-white">
                  <FaCheckCircle className="text-success mr-3" />
                  Trade execution simulation
                </li>
                <li className="flex items-center text-white">
                  <FaCheckCircle className="text-success mr-3" />
                  Priority support
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signals" className="btn-primary px-8">
                Generate AI Signals
              </Link>
              <Link href="/portfolio" className="btn-secondary px-8">
                Track Portfolio
              </Link>
            </div>

            <p className="text-sm text-text-secondary mt-8">
              You can manage your subscription anytime from your dashboard settings.
            </p>
          </div>

          <div className="mt-8 text-center">
            <h3 className="text-lg font-semibold text-white mb-4">
              Need help getting started?
            </h3>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/docs"
                className="text-primary hover:text-primary-light"
              >
                Read Documentation
              </a>
              <span className="text-gray-600 hidden sm:inline">•</span>
              <a
                href="/support"
                className="text-primary hover:text-primary-light"
              >
                Contact Support
              </a>
              <span className="text-gray-600 hidden sm:inline">•</span>
              <a
                href="/community"
                className="text-primary hover:text-primary-light"
              >
                Join Community
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}