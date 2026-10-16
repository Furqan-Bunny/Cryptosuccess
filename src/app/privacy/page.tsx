import type { Metadata } from 'next';
import Link from 'next/link';
import { TRACK_RECORD_SCOPE } from '@/lib/legal-copy';

export const metadata: Metadata = {
  title: 'Privacy Policy - CryptoSuccess',
  description: 'What data CryptoSuccess collects, why, and who processes it.',
};

// Fixed date of the last substantive change. Update it whenever the policy
// changes; it must not be computed at render time.
const LAST_UPDATED = '16 October 2026';

export default function PrivacyPage() {
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
        <h1 className="text-4xl font-bold text-white mb-8">Privacy Policy</h1>

        <div className="prose prose-invert max-w-none">
          <p className="text-text-secondary mb-6">Last updated: {LAST_UPDATED}</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">1. Information We Collect</h2>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>
                <strong className="text-white">Account information:</strong> email address, display
                name and, if you sign in with Google, your basic Google profile (name, email,
                picture). Passwords are handled by our authentication provider and stored only as
                salted hashes; we never see them in plain text.
              </li>
              <li>
                <strong className="text-white">Product data:</strong> the signals you generate and
                their scored outcomes, your watchlist and preferences, your daily signal usage, and
                your simulated (paper) trading activity.
              </li>
              <li>
                <strong className="text-white">Subscription data:</strong> your plan, its status and
                period, and the payment provider&apos;s customer or payment reference. We do not
                receive or store card numbers or wallet private keys.
              </li>
              <li>
                <strong className="text-white">Telegram data (only if you use the bot):</strong> your
                Telegram chat ID, your Telegram username if you have one, your bot signal usage
                and, if you link the bot, which CryptoSuccess account it is linked to.
              </li>
              <li>
                <strong className="text-white">Technical data:</strong> your IP address, used to rate
                limit some requests and protect the service from abuse, and standard request logs
                kept by our hosting provider.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">2. How We Use Your Information</h2>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>To provide the service: signals, analysis, the paper-trading tools and the Telegram bot</li>
              <li>To manage your account, plan and daily allowance</li>
              <li>To process payments and activate subscriptions</li>
              <li>To score signals and keep the public track record</li>
              <li>To prevent abuse, secure the service and fix problems</li>
              <li>To send essential service emails, such as account confirmation and password resets</li>
              <li>To comply with legal obligations</li>
            </ul>
            <p className="text-text-secondary mt-4">
              We do not sell your personal information and we do not use it for advertising.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">3. The Public Track Record</h2>
            <p className="text-text-secondary mb-4">
              {TRACK_RECORD_SCOPE} Our server scores each recorded signal once it is at least 24
              hours old. Each day the finalized results are hashed into a Merkle tree and the root of that tree is written
              to a public blockchain (currently the Base Sepolia test network).
            </p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>
                Only the Merkle root goes on-chain. It is a hash and reveals nothing about you on
                its own.
              </li>
              <li>
                Anyone with a signal&apos;s ID can use our verify page to see that signal&apos;s
                anchored record: coin, direction, confidence, price levels, outcome, timestamps,
                the signal ID and your account&apos;s random user ID. It never includes your name,
                email or Telegram details.
              </li>
              <li>
                Scored signals stay in the track record after you delete your account, wins and
                losses alike, so deleting accounts can never be used to hide losing calls. We
                delete your personal data and unlink those signals from you: they keep only the
                random user ID they were recorded with, which then no longer points to any
                account. A blockchain anchor cannot be removed, but the on-chain root contains no
                personal data.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">4. Service Providers</h2>
            <p className="text-text-secondary mb-4">
              We share data only with the providers we need to run the service, and only what each
              one needs:
            </p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li><strong className="text-white">Supabase:</strong> authentication and our Postgres database</li>
              <li><strong className="text-white">Vercel:</strong> hosting and request logs</li>
              <li><strong className="text-white">Google:</strong> sign-in, only if you choose &ldquo;Sign in with Google&rdquo;</li>
              <li><strong className="text-white">Stripe:</strong> card payments and subscription billing</li>
              <li><strong className="text-white">NOWPayments:</strong> cryptocurrency payments</li>
              <li>
                <strong className="text-white">Anthropic:</strong> AI analysis of market data. We send
                coin names, prices and indicators &mdash; no personal data.
              </li>
              <li>
                <strong className="text-white">Telegram:</strong> message delivery, only if you use
                our bot
              </li>
              <li>
                <strong className="text-white">Upstash:</strong> rate limiting, using keys derived
                from your IP address or account ID
              </li>
              <li>
                <strong className="text-white">Binance, CoinGecko, DefiLlama and alternative.me:</strong>{' '}
                public market data. We request prices and statistics from them; no personal data is
                sent.
              </li>
              <li>
                <strong className="text-white">Base Sepolia (public blockchain):</strong> receives the
                daily Merkle root described above
              </li>
            </ul>
            <p className="text-text-secondary mt-4">
              We may also disclose information when the law requires it.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">5. Security</h2>
            <p className="text-text-secondary">
              Connections to the service use HTTPS. Database access is restricted by row-level
              security so that users can only read their own private data, and server-only keys are
              never sent to your browser. No system is perfectly secure, so please use a strong,
              unique password.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">6. Cookies and Local Storage</h2>
            <p className="text-text-secondary">
              We use essential cookies to keep you signed in, and your browser&apos;s local storage
              for a few interface preferences. We do not use advertising or third-party analytics
              cookies. Blocking cookies will prevent you from signing in.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">7. Your Rights</h2>
            <p className="text-text-secondary mb-4">Depending on where you live, you have the right to:</p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>Access the personal data we hold about you</li>
              <li>Ask us to correct or delete it</li>
              <li>Receive a copy of it in a portable format</li>
              <li>Object to or restrict certain processing</li>
              <li>Withdraw consent where processing is based on consent</li>
              <li>Complain to your local data protection authority</li>
            </ul>
            <p className="text-text-secondary mt-4">
              To exercise these rights, contact us at{' '}
              <a href="mailto:privacy@cryptosuccess.com" className="text-primary hover:text-primary-light">
                privacy@cryptosuccess.com
              </a>
              . This includes asking us to unlink the Telegram bot from your account or to delete
              your Telegram data.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">8. Data Retention</h2>
            <p className="text-text-secondary">
              We keep your data while your account is active. When you ask us to delete your
              account we delete your personal data, except records we must keep for legal or
              accounting reasons (for example payment records), which are kept only as long as the
              law requires. Scored signals stay in the public track record without any link to
              you, and on-chain anchors cannot be deleted, as explained in section 3.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">9. Children&apos;s Privacy</h2>
            <p className="text-text-secondary">
              The service is not intended for anyone under 18, and we do not knowingly collect data
              from children.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">10. International Transfers</h2>
            <p className="text-text-secondary">
              Our providers may process data in countries other than yours, including the United
              States. Where required, transfers rely on safeguards such as the providers&apos;
              standard contractual clauses.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">11. Changes to This Policy</h2>
            <p className="text-text-secondary">
              We may update this policy. When we make material changes we will update the date
              above and, where appropriate, notify you by email or in the app.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">12. Contact Us</h2>
            <p className="text-text-secondary">
              For privacy questions, contact us at{' '}
              <a href="mailto:privacy@cryptosuccess.com" className="text-primary hover:text-primary-light">
                privacy@cryptosuccess.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
