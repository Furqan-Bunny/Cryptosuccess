import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Risk Disclaimer - CryptoSuccess',
  description:
    'CryptoSuccess is not financial advice. Crypto is highly volatile, signals are often wrong, and paper-trading features use simulated money.',
};

// Fixed date of the last substantive change. Update it whenever this page
// changes; it must not be computed at render time.
const LAST_UPDATED = '16 October 2026';

export default function DisclaimerPage() {
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
        <h1 className="text-4xl font-bold text-white mb-8">Risk Disclaimer</h1>

        <div className="prose prose-invert max-w-none">
          <p className="text-text-secondary mb-6">Last updated: {LAST_UPDATED}</p>

          <div className="card p-6 mb-8 border-warning/40">
            <p className="text-white font-semibold mb-2">The short version</p>
            <p className="text-text-secondary">
              CryptoSuccess is an educational tool, not a financial adviser. Our signals are often
              wrong, crypto prices can fall sharply and quickly, and you can lose all the money you
              trade. Only you decide what to do with your money.
            </p>
          </div>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">1. Not Financial Advice</h2>
            <p className="text-text-secondary">
              Everything on CryptoSuccess &mdash; signals, analysis, briefs, backtests, the
              Telegram bot and any other content &mdash; is general information for educational
              purposes. It is not financial, investment, legal or tax advice, and it does not take
              your personal circumstances into account. We are not a registered investment adviser
              or broker. Consider getting independent advice before making financial decisions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">2. No Guarantees</h2>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>
                No signal, model or analysis can reliably predict crypto prices. In our own
                backtests, fewer than half of individual signals were wins.
              </li>
              <li>
                Backtest results ignore fees and overlapping trades and are not a forecast. Past
                performance, including our live track record, does not predict future results.
              </li>
              <li>
                Confidence or conviction levels describe how strongly the inputs agree. They are not
                the probability that a trade will be profitable.
              </li>
              <li>
                AI-generated analysis can contain mistakes, including about news and events.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">3. Simulated Trading Uses Paper Money</h2>
            <p className="text-text-secondary">
              The portfolio, spot, futures, staking and DCA features are simulations that use
              virtual funds. Simulated balances and profits are not real, cannot be withdrawn, and
              do not reflect real-world fees, slippage, liquidity, funding costs or execution delays
              accurately. Doing well in a simulation does not mean you will do well with real money.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">4. Cryptocurrency Risks</h2>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>Prices are extremely volatile and can move tens of percent in a day</li>
              <li>Leverage and futures can lose more than your initial margin very quickly</li>
              <li>Stop-loss orders can fill at a worse price than planned during fast moves or gaps</li>
              <li>Exchanges, tokens and protocols can fail, be hacked or be delisted</li>
              <li>Regulation differs by country and can change without notice</li>
              <li>Transactions on a blockchain are usually irreversible</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">5. What the Track Record Does and Does Not Show</h2>
            <p className="text-text-secondary">
              Our track record is anchored on a public blockchain so it cannot be quietly edited.
              That proves an anchored result has not been changed or removed since it was
              anchored; it does not prove that future signals will perform the same way. Anchoring currently runs on the
              Base Sepolia test network. You can check any anchored signal on the{' '}
              <Link href="/verify" className="text-primary hover:text-primary-light">verify page</Link>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">6. Your Responsibility</h2>
            <p className="text-text-secondary">
              You are solely responsible for your trading decisions and their results. Never trade
              money you cannot afford to lose, size every position so that a stop-loss hit is a
              loss you can accept, and check that crypto trading is legal where you live.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">7. More Information</h2>
            <p className="text-text-secondary">
              See our{' '}
              <Link href="/terms" className="text-primary hover:text-primary-light">Terms of Service</Link>
              {' '}and{' '}
              <Link href="/privacy" className="text-primary hover:text-primary-light">Privacy Policy</Link>
              , or contact{' '}
              <a href="mailto:support@cryptosuccess.com" className="text-primary hover:text-primary-light">
                support@cryptosuccess.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
