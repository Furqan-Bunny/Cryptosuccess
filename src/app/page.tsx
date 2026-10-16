import Link from 'next/link';
import {
  FaBalanceScale,
  FaCheckCircle,
  FaFingerprint,
  FaHandPaper,
  FaLink,
  FaPaperPlane,
  FaSearch,
  FaShieldAlt,
  FaStopwatch,
} from 'react-icons/fa';
import { SUBSCRIPTION_PLANS } from '@/types/subscription.types';
import { COINS } from '@/lib/coins';
import backtest from '../../public/backtest-results.json';

// Public bot handle (safe to expose). Only used to build a t.me link when it is a
// syntactically valid Telegram username, so a bad env value can never produce an
// odd href.
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
const BOT_URL =
  BOT_USERNAME && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(BOT_USERNAME)
    ? `https://t.me/${BOT_USERNAME}`
    : null;

// Backtest figures are read from the same file the backtest script writes, so the
// landing page can never quote a number the data does not back.
const technical = {
  winRate: backtest.winRate,
  trades: backtest.totalTrades,
  coins: backtest.coins.join(', '),
  targetPct: backtest.targetPct,
  stopPct: backtest.stopPct,
  horizonHours: backtest.horizonHours,
};
const models = backtest.models.byTimeframe;
const modelRates = Object.values(models).map(m => m.winRate);
const modelMin = Math.min(...modelRates);
const modelMax = Math.max(...modelRates);

export default function HomePage() {
  const year = new Date().getFullYear();
  const proMonthly = SUBSCRIPTION_PLANS.pro.price.monthly;

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-md border-b border-gray-800">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="text-2xl font-bold gradient-text">
              CryptoSuccess
            </Link>

            <div className="hidden md:flex items-center space-x-6 text-sm text-text-secondary">
              <a href="#how-it-works" className="hover:text-white">How it works</a>
              <a href="#track-record" className="hover:text-white">Track record</a>
              <a href="#expectations" className="hover:text-white">Expectations</a>
              <Link href="/pricing" className="hover:text-white">Pricing</Link>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-4">
              <Link href="/login" className="btn-ghost px-3 sm:px-4 py-2 text-sm font-medium">
                Sign in
              </Link>
              <Link href="/register" className="btn-primary px-3 sm:px-4 py-2 text-sm font-medium">
                Get started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto max-w-5xl text-center">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-success bg-success/10 border border-success/20 rounded-full px-4 py-1.5 mb-6">
            <FaShieldAlt aria-hidden="true" />
            The honest crypto coach
          </p>
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Trade ideas with a track record
            <br />
            <span className="gradient-text">you can check yourself</span>
          </h1>
          <p className="text-lg md:text-xl text-text-secondary mb-8 max-w-3xl mx-auto">
            CryptoSuccess gives you risk-managed signals across {COINS.length} coins, says so
            when the market is too messy to trade, and keeps every scored result &mdash; wins
            and losses &mdash; in a record anchored to a public blockchain. No hype. No hidden
            losses.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
            <Link href="/verify" className="btn-primary px-8 py-4 text-lg font-semibold">
              <FaSearch className="mr-2" aria-hidden="true" />
              Verify our track record
            </Link>
            <Link href="/register" className="btn-secondary px-8 py-4 text-lg font-semibold">
              Create a free account
            </Link>
          </div>

          <ul className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-x-8 gap-y-3 text-text-secondary text-sm">
            <li className="flex items-center gap-2">
              <FaCheckCircle className="text-success" aria-hidden="true" />
              Every directional call has a stop-loss
            </li>
            <li className="flex items-center gap-2">
              <FaCheckCircle className="text-success" aria-hidden="true" />
              Losses stay in the record
            </li>
            <li className="flex items-center gap-2">
              <FaCheckCircle className="text-success" aria-hidden="true" />
              Free plan: 5 signals a day, no card needed
            </li>
          </ul>
        </div>
      </section>

      {/* Why we exist */}
      <section id="how-it-works" className="py-20 px-4 bg-surface/50">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-white mb-4">
            Built for people who are tired of signal hype
          </h2>
          <p className="text-center text-text-secondary mb-12 max-w-3xl mx-auto">
            Nobody can reliably predict short-term crypto prices. Most signal services hide
            that by showing the wins and quietly dropping the losses. We would rather tell you
            the truth and help you manage risk.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<FaShieldAlt />}
              title="Risk first"
              description="Every buy or sell call comes with an entry, a target and a stop-loss, plus position-sizing guidance based on how volatile the coin usually is."
            />
            <FeatureCard
              icon={<FaHandPaper />}
              title="Permission to stay out"
              description="When timeframes conflict or the trend is weak, the coach says so and suggests standing aside instead of forcing a trade."
            />
            <FeatureCard
              icon={<FaBalanceScale />}
              title="Reasoning, not just arrows"
              description="Signals come with the reasons behind them and what would prove them wrong, so you learn to judge setups yourself."
            />
            <FeatureCard
              icon={<FaFingerprint />}
              title="A record we cannot rewrite"
              description="Scored results are anchored on-chain every day. Anyone can check that a result was included and has not been edited since."
            />
          </div>
        </div>
      </section>

      {/* Track record */}
      <section id="track-record" className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-white mb-4">
            How the record is kept honest
          </h2>
          <p className="text-center text-text-secondary mb-12 max-w-3xl mx-auto">
            The process is mechanical, so nobody &mdash; including us &mdash; gets to decide
            which results count.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <StepCard
              number="1"
              title="The call is saved"
              description="When a signal is generated it is written to our database with its entry, target and stop. Signals cannot be edited from the app once saved."
            />
            <StepCard
              number="2"
              title="The server scores it after 24h"
              description="Once a signal is 24 hours old, a scheduled server job checks the market price and records the outcome: target hit, stop hit, or expired in profit or loss."
            />
            <StepCard
              number="3"
              title="Results are anchored daily"
              description="Each day's finalized results are hashed into a Merkle tree, and its root is written to a smart contract on the Base Sepolia test network."
            />
            <StepCard
              number="4"
              title="Anyone can verify"
              description="Paste a signal ID on the verify page. Your browser re-hashes the record, checks the inclusion proof and reads the anchored root straight from the chain."
            />
          </div>

          <div className="card p-6 mt-12 max-w-4xl mx-auto">
            <h3 className="text-lg font-semibold text-white mb-3">
              What this proves, and what it does not
            </h3>
            <ul className="space-y-2 text-text-secondary text-sm list-disc pl-5">
              <li>
                It proves that a scored result was included in that day&apos;s anchor and has not
                been changed or removed since. Losing calls are anchored exactly like winning ones.
              </li>
              <li>
                Signals are anchored after they are scored, not at the moment they are published.
                Signals that are still inside their 24-hour window are not anchored yet.
              </li>
              <li>
                Anchoring currently runs on a public test network (Base Sepolia). The verification
                is the same, but a testnet carries less economic weight than a mainnet.
              </li>
              <li>
                It does not make the signals more accurate. It only makes the record honest.
              </li>
            </ul>
            <div className="mt-6">
              <Link href="/verify" className="btn-primary px-6 py-3 font-semibold">
                <FaSearch className="mr-2" aria-hidden="true" />
                Verify a signal
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Telegram */}
      <section id="telegram" className="py-20 px-4 bg-surface/50">
        <div className="container mx-auto max-w-5xl">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                The coach in your Telegram
              </h2>
              <p className="text-text-secondary mb-6">
                Ask the bot for a read on a coin and get the same honest format as the web
                app: direction, conviction, entry, target, stop-loss, what you could lose, and a
                plain &ldquo;stay out&rdquo; when the setup is weak.
              </p>
              <ul className="space-y-3 text-text-secondary mb-8">
                <li className="flex items-start gap-3">
                  <FaPaperPlane className="text-primary mt-1 flex-shrink-0" aria-hidden="true" />
                  <span>
                    <code className="text-white">/signal BTC</code> for a risk-managed read on a
                    supported coin
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <FaLink className="text-primary mt-1 flex-shrink-0" aria-hidden="true" />
                  <span>
                    Link the bot to your account from Settings so web and Telegram share one
                    daily allowance (Pro is unlimited)
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <FaFingerprint className="text-primary mt-1 flex-shrink-0" aria-hidden="true" />
                  <span>
                    Bot calls with usable levels go into the same scored, anchored track record
                  </span>
                </li>
              </ul>
              {BOT_URL ? (
                <a
                  href={BOT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary px-6 py-3 font-semibold"
                >
                  <FaPaperPlane className="mr-2" aria-hidden="true" />
                  Open the bot in Telegram
                </a>
              ) : (
                <Link href="/register" className="btn-secondary px-6 py-3 font-semibold">
                  Create an account to link the bot
                </Link>
              )}
            </div>

            <div className="card p-6 font-mono text-sm text-text-secondary space-y-2" aria-label="Example bot reply layout">
              <p className="text-white">Example reply layout</p>
              <p>Direction: BUY &middot; Conviction: medium</p>
              <p>Entry, target and stop-loss levels</p>
              <p>If the stop is hit: the loss you would take</p>
              <p>Sizing: risk a small, fixed share of your account</p>
              <p>Why: the short reasoning behind the call</p>
              <p className="text-warning">Low conviction? The bot tells you to stay out.</p>
              <p className="text-xs pt-2 border-t border-gray-800">
                Layout only &mdash; not a real signal and not financial advice.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Honest expectations */}
      <section id="expectations" className="py-20 px-4">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-white mb-4">
            Honest expectations
          </h2>
          <p className="text-center text-text-secondary mb-12 max-w-3xl mx-auto">
            Here is what our own backtests show. Most individual signals do not win, which is
            exactly why every plan has to keep losses small.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-3">
                <FaStopwatch className="text-warning" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-white">Rule-based technical engine</h3>
              </div>
              <p className="text-4xl font-bold text-white mb-2">~{Math.round(technical.winRate)}%</p>
              <p className="text-text-secondary text-sm">
                of {technical.trades.toLocaleString('en-US')} backtested trades on {technical.coins}{' '}
                were wins: the {technical.targetPct}% target was hit before the {technical.stopPct}%
                stop, or the trade was in profit after {technical.horizonHours} hours
                (walk-forward, 1h candles).
              </p>
            </div>
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-3">
                <FaStopwatch className="text-warning" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-white">In-browser prediction models</h3>
              </div>
              <p className="text-4xl font-bold text-white mb-2">
                {modelMin}&ndash;{modelMax}%
              </p>
              <p className="text-text-secondary text-sm">
                directional accuracy on time-held-out test data across {backtest.models.coins}{' '}
                coins: 1h {models['1h'].winRate}%, 4h {models['4h'].winRate}%, 1d{' '}
                {models['1d'].winRate}%. Close to a coin flip, which is why risk management
                matters more than any single prediction.
              </p>
            </div>
          </div>

          <p className="text-text-secondary text-sm mt-6 max-w-4xl mx-auto text-center">
            Backtests ignore fees and overlapping trades and are not a forecast. Past performance
            does not predict future results. The live, scored record is the number that matters
            &mdash; and you can check it yourself.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section id="pricing" className="py-20 px-4 bg-surface/50">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-white mb-4">
            Start free, upgrade if it helps
          </h2>
          <p className="text-center text-text-secondary mb-12">
            No trial gimmicks. The free plan stays free.
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            <PlanCard
              title="Free"
              price="$0"
              features={[
                '5 signals a day, shared between web and Telegram',
                'Market overview and daily brief',
                'Watchlist of up to 5 coins',
                'Full access to the public track record',
              ]}
              buttonText="Create a free account"
              buttonHref="/register"
              variant="secondary"
            />
            <PlanCard
              title="Pro"
              price={`$${proMonthly}`}
              priceSuffix="/month"
              features={[
                'Unlimited signals on web and Telegram',
                'Paper-trading suite: spot, futures, staking and DCA (simulated money)',
                'Opportunity scanner',
                'Watchlist of up to 50 coins',
              ]}
              buttonText="See plans and billing"
              buttonHref="/pricing"
              variant="primary"
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Check the record first. Then decide.
          </h2>
          <p className="text-lg text-text-secondary mb-8">
            We would rather earn your trust with evidence than ask for it.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/verify" className="btn-primary px-8 py-4 text-lg font-semibold">
              Verify our track record
            </Link>
            <Link href="/register" className="btn-secondary px-8 py-4 text-lg font-semibold">
              Get started free
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-gray-800">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-2xl font-bold gradient-text mb-4">CryptoSuccess</h3>
              <p className="text-text-secondary">
                Risk-first crypto signals with a track record you can verify.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-text-secondary">
                <li><a href="#how-it-works" className="hover:text-primary">How it works</a></li>
                <li><Link href="/verify" className="hover:text-primary">Verify track record</Link></li>
                <li><Link href="/pricing" className="hover:text-primary">Pricing</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-text-secondary">
                <li><Link href="/terms" className="hover:text-primary">Terms of Service</Link></li>
                <li><Link href="/privacy" className="hover:text-primary">Privacy Policy</Link></li>
                <li><Link href="/disclaimer" className="hover:text-primary">Risk Disclaimer</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-4">Support</h4>
              <ul className="space-y-2 text-text-secondary">
                <li><a href="mailto:support@cryptosuccess.com" className="hover:text-primary">Contact support</a></li>
                <li><a href="#expectations" className="hover:text-primary">Honest expectations</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-800 text-center text-text-secondary text-sm space-y-2">
            <p>
              Not financial advice. Crypto is highly volatile and you can lose money. Paper-trading
              features use simulated funds.{' '}
              <Link href="/disclaimer" className="text-primary hover:text-primary-light">
                Read the full disclaimer
              </Link>
              .
            </p>
            <p>&copy; {year} CryptoSuccess. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="card p-6 hover:border-primary/50 transition-all duration-300">
      <div className="text-primary text-3xl mb-4" aria-hidden="true">{icon}</div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-text-secondary">{description}</p>
    </div>
  );
}

function StepCard({ number, title, description }: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-14 h-14 bg-primary/10 border-2 border-primary rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-xl font-bold text-primary">{number}</span>
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-text-secondary text-sm">{description}</p>
    </div>
  );
}

function PlanCard({
  title,
  price,
  priceSuffix,
  features,
  buttonText,
  buttonHref,
  variant,
}: {
  title: string;
  price: string;
  priceSuffix?: string;
  features: string[];
  buttonText: string;
  buttonHref: string;
  variant: 'primary' | 'secondary';
}) {
  return (
    <div className={`card p-8 flex flex-col ${variant === 'primary' ? 'border-primary' : ''}`}>
      <h3 className="text-2xl font-bold text-white mb-2">{title}</h3>
      <div className="mb-6">
        <span className="text-4xl font-bold text-white">{price}</span>
        {priceSuffix && <span className="text-text-secondary">{priceSuffix}</span>}
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {features.map(feature => (
          <li key={feature} className="flex items-start">
            <FaCheckCircle className="text-success mt-1 mr-2 flex-shrink-0" aria-hidden="true" />
            <span className="text-text-secondary">{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        href={buttonHref}
        className={`w-full ${variant === 'primary' ? 'btn-primary' : 'btn-secondary'} py-3 font-semibold text-center`}
      >
        {buttonText}
      </Link>
    </div>
  );
}
