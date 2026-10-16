import type { Metadata } from 'next';
import Link from 'next/link';
import { CRYPTO_REFUND_TERMS, REFUND_DAYS, SCORING_METHOD, TRACK_RECORD_SCOPE } from '@/lib/legal-copy';

export const metadata: Metadata = {
  title: 'Terms of Service - CryptoSuccess',
  description: 'The terms that apply when you use CryptoSuccess.',
};

// Fixed date of the last substantive change. Update it whenever the terms change;
// it must not be computed at render time.
const LAST_UPDATED = '16 October 2026';


export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-surface border-b border-gray-800">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="text-2xl font-bold gradient-text">
              CryptoSuccess
            </Link>
            <Link href="/" className="text-text-secondary hover:text-white">
              Back to Home
            </Link>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold text-white mb-8">Terms of Service</h1>

        <div className="prose prose-invert max-w-none">
          <p className="text-text-secondary mb-6">Last updated: {LAST_UPDATED}</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">1. Acceptance of Terms</h2>
            <p className="text-text-secondary">
              By accessing or using CryptoSuccess (the website, the web app and the CryptoSuccess
              Telegram bot), you agree to these Terms of Service, our{' '}
              <Link href="/privacy" className="text-primary hover:text-primary-light">Privacy Policy</Link>
              {' '}and our{' '}
              <Link href="/disclaimer" className="text-primary hover:text-primary-light">Risk Disclaimer</Link>.
              If you do not agree, please do not use the service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">2. Service Description</h2>
            <p className="text-text-secondary mb-4">CryptoSuccess provides:</p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>
                Cryptocurrency trading signals and market analysis produced by rule-based
                indicators, machine-learning models and an AI analyst, for information and
                education only
              </li>
              <li>
                Simulated (paper) trading tools, including spot, futures, staking and DCA
                simulations, which use virtual funds only
              </li>
              <li>A Telegram bot that delivers the same kind of analysis</li>
              <li>
                A public track record of scored signals, anchored daily to a blockchain so that
                anyone can verify it has not been altered
              </li>
            </ul>
            <p className="text-text-secondary mt-4">
              CryptoSuccess does not execute real trades, hold your funds, or manage money on your
              behalf.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">3. Not Financial Advice</h2>
            <p className="text-text-secondary mb-4">
              <strong className="text-white">IMPORTANT:</strong> Nothing on CryptoSuccess is
              financial, investment, legal or tax advice. Cryptocurrency trading carries significant
              risk and you may lose some or all of the money you trade.
            </p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>Past performance, including backtests and our track record, does not guarantee future results</li>
              <li>Signals are probabilistic and are often wrong; most individual signals do not win</li>
              <li>You are solely responsible for your own trading decisions</li>
              <li>Never trade money you cannot afford to lose</li>
            </ul>
            <p className="text-text-secondary mt-4">
              Read the full{' '}
              <Link href="/disclaimer" className="text-primary hover:text-primary-light">Risk Disclaimer</Link>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">4. Simulated Trading</h2>
            <p className="text-text-secondary">
              Balances, positions, profits and losses in the paper-trading tools are simulated. They
              have no cash value, cannot be withdrawn, and may differ from what real trading would
              produce because fees, slippage, liquidity and execution delays are modelled only
              approximately or not at all.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">5. Subscriptions and Payments</h2>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>
                <strong className="text-white">Free plan:</strong> available at no cost with a daily
                signal allowance. There is no free trial of Pro.
              </li>
              <li>
                <strong className="text-white">Pro by card (Stripe):</strong> billed in advance either
                monthly or yearly, depending on the option you choose at checkout. The subscription
                renews automatically at the end of each period until you cancel. You can cancel at
                any time from your account settings; Pro stays active until the end of the period
                you have already paid for.
              </li>
              <li>
                <strong className="text-white">Pro by cryptocurrency (NOWPayments):</strong> a
                one-time payment that grants Pro for a fixed period of one month or one year. It
                does not renew automatically. Pro is activated once the payment is confirmed on the
                blockchain, which can take some time depending on the network.
              </li>
              <li>
                Prices are shown in USD. We may change prices for future periods; we will tell you
                before a change applies to your subscription.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">6. Refunds</h2>
            <p className="text-text-secondary">
              If you are not satisfied, you can request a full refund within {REFUND_DAYS} days of
              your first Pro payment by emailing support. Renewal payments are not refunded, but you
              can cancel before the next renewal at any time. {CRYPTO_REFUND_TERMS} This does not
              affect any rights you have under the consumer law of your country.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">7. Accounts and Eligibility</h2>
            <p className="text-text-secondary">You must be at least 18 years old to use the service. You agree to:</p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>Provide accurate account information</li>
              <li>Keep your password and any Telegram link codes secure</li>
              <li>Not share your account with others</li>
              <li>Comply with all laws and regulations that apply to you, including on cryptocurrency</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">8. Acceptable Use</h2>
            <p className="text-text-secondary">You agree not to:</p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>Circumvent usage limits, rate limits or access controls</li>
              <li>Scrape, resell or redistribute signals or analysis as your own product</li>
              <li>Probe, attack or disrupt the service or other users</li>
              <li>Use the service for any unlawful purpose</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">9. The Public Track Record</h2>
            <p className="text-text-secondary">
              {TRACK_RECORD_SCOPE} {SCORING_METHOD} Scoring is automatic and done by our server.
              Each day, finalized results are combined into a Merkle root that is
              written to a public blockchain (currently the Base Sepolia test network). Once
              written, an anchor cannot be changed or removed by anyone, including us. Anchored
              records identify a signal by random IDs, not by your name or email. See the{' '}
              <Link href="/privacy" className="text-primary hover:text-primary-light">Privacy Policy</Link>
              {' '}for details.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">10. Availability</h2>
            <p className="text-text-secondary">
              We work to keep the service running, but it is provided &ldquo;as is&rdquo; and
              &ldquo;as available&rdquo;. We do not guarantee uninterrupted availability, and
              features that depend on third parties (market data providers, payment processors,
              Telegram, blockchain networks) can be delayed or unavailable.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">11. Limitation of Liability</h2>
            <p className="text-text-secondary">
              To the fullest extent permitted by law, CryptoSuccess and its operators are not liable
              for trading losses or any indirect or consequential damages resulting from your use of
              the service or reliance on any signal or analysis. Our total liability for any claim
              is limited to the amount you paid us in the 12 months before the claim.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">12. Termination</h2>
            <p className="text-text-secondary">
              You can stop using the service and ask us to delete your account at any time. We may
              suspend or close accounts that breach these terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">13. Changes to Terms</h2>
            <p className="text-text-secondary">
              We may update these terms. When we make material changes we will update the date
              above and, where appropriate, notify you. Continued use of the service after changes
              take effect means you accept the updated terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">14. Contact</h2>
            <p className="text-text-secondary">
              For questions about these terms, please contact us at{' '}
              <a href="mailto:support@cryptosuccess.com" className="text-primary hover:text-primary-light">
                support@cryptosuccess.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
