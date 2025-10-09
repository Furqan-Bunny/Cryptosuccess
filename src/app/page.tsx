import Link from 'next/link';
import { FaBolt, FaChartLine, FaShieldAlt, FaRocket } from 'react-icons/fa';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-md border-b border-gray-800">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold gradient-text">CryptoSuccess</h1>
            </div>

            <div className="flex items-center space-x-4">
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
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6">
              AI-Powered Crypto
              <br />
              <span className="gradient-text">Trading Signals</span>
            </h1>
            <p className="text-xl text-text-secondary mb-8 max-w-3xl mx-auto">
              Make confident trading decisions with our advanced machine learning algorithms.
              Get real-time buy, sell, and hold signals for ETH, SOL, and BNB.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Link
                href="/register"
                className="btn-primary px-8 py-4 text-lg font-semibold"
              >
                Start Free Trial
              </Link>
              <Link
                href="#how-it-works"
                className="btn-secondary px-8 py-4 text-lg font-semibold"
              >
                Learn More
              </Link>
            </div>

            <div className="flex items-center justify-center space-x-8 text-text-secondary">
              <div className="flex items-center space-x-2">
                <FaShieldAlt className="text-success" />
                <span>Bank-level Security</span>
              </div>
              <div className="flex items-center space-x-2">
                <FaBolt className="text-warning" />
                <span>Real-time Signals</span>
              </div>
              <div className="flex items-center space-x-2">
                <FaChartLine className="text-primary" />
                <span>65%+ Accuracy</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 px-4 bg-surface/50">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-4xl font-bold text-center text-white mb-12">
            Why Choose CryptoSuccess?
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<FaBolt />}
              title="AI-Powered Analysis"
              description="Advanced machine learning algorithms analyze market data 24/7"
            />
            <FeatureCard
              icon={<FaChartLine />}
              title="Real-Time Signals"
              description="Get instant buy, sell, and hold recommendations"
            />
            <FeatureCard
              icon={<FaShieldAlt />}
              title="Secure & Reliable"
              description="Bank-level security with 99.9% uptime guarantee"
            />
            <FeatureCard
              icon={<FaRocket />}
              title="Easy to Use"
              description="Simple interface designed for traders of all levels"
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-4xl font-bold text-center text-white mb-12">
            How It Works
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              number="1"
              title="Sign Up"
              description="Create your free account and connect to our platform"
            />
            <StepCard
              number="2"
              title="Receive Signals"
              description="Get AI-generated trading signals updated every 5 minutes"
            />
            <StepCard
              number="3"
              title="Trade Confidently"
              description="Make informed decisions based on data-driven insights"
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 bg-surface/50">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-4xl font-bold text-center text-white mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-center text-text-secondary mb-12">
            Start free, upgrade when you're ready
          </p>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <PricingCard
              title="Free"
              price="$0"
              features={[
                '5 signals per day',
                'Basic technical indicators',
                'ETH, SOL, BNB support',
                'Email support',
              ]}
              buttonText="Start Free"
              buttonHref="/register"
              variant="secondary"
            />
            <PricingCard
              title="Pro"
              price="$29"
              features={[
                'Unlimited signals',
                'Advanced indicators',
                'All cryptocurrencies',
                'Real-time notifications',
                'Priority support',
                'Export data',
              ]}
              buttonText="Go Pro"
              buttonHref="/register"
              variant="primary"
              popular
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            Ready to Start Trading Smarter?
          </h2>
          <p className="text-xl text-text-secondary mb-8">
            Join thousands of traders using AI to make better decisions
          </p>
          <Link
            href="/register"
            className="btn-primary px-8 py-4 text-lg font-semibold inline-flex items-center"
          >
            <FaRocket className="mr-2" />
            Get Started Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-gray-800">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-2xl font-bold gradient-text mb-4">CryptoSuccess</h3>
              <p className="text-text-secondary">
                AI-powered cryptocurrency trading signals for smarter decisions.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-text-secondary">
                <li><Link href="#features" className="hover:text-primary">Features</Link></li>
                <li><Link href="#pricing" className="hover:text-primary">Pricing</Link></li>
                <li><Link href="#how-it-works" className="hover:text-primary">How it Works</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-text-secondary">
                <li><Link href="/terms" className="hover:text-primary">Terms of Service</Link></li>
                <li><Link href="/privacy" className="hover:text-primary">Privacy Policy</Link></li>
                <li><Link href="/disclaimer" className="hover:text-primary">Disclaimer</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-4">Support</h4>
              <ul className="space-y-2 text-text-secondary">
                <li><a href="mailto:support@cryptosuccess.com" className="hover:text-primary">Contact</a></li>
                <li><Link href="/faq" className="hover:text-primary">FAQ</Link></li>
                <li><Link href="/docs" className="hover:text-primary">Documentation</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-800 text-center text-text-secondary">
            <p>&copy; 2024 CryptoSuccess. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Component definitions
function FeatureCard({ icon, title, description }: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="card p-6 hover:border-primary/50 transition-all duration-300">
      <div className="text-primary text-3xl mb-4">{icon}</div>
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
      <div className="w-16 h-16 bg-primary/10 border-2 border-primary rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-2xl font-bold text-primary">{number}</span>
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-text-secondary">{description}</p>
    </div>
  );
}

function PricingCard({
  title,
  price,
  features,
  buttonText,
  buttonHref,
  variant,
  popular = false,
}: {
  title: string;
  price: string;
  features: string[];
  buttonText: string;
  buttonHref: string;
  variant: 'primary' | 'secondary';
  popular?: boolean;
}) {
  return (
    <div className={`card p-8 relative ${popular ? 'border-primary' : ''}`}>
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-primary text-white text-sm font-semibold px-3 py-1 rounded-full">
            Most Popular
          </span>
        </div>
      )}

      <h3 className="text-2xl font-bold text-white mb-2">{title}</h3>
      <div className="mb-6">
        <span className="text-4xl font-bold text-white">{price}</span>
        {price !== '$0' && <span className="text-text-secondary">/month</span>}
      </div>

      <ul className="space-y-3 mb-8">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start">
            <svg
              className="w-5 h-5 text-success mt-0.5 mr-2 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-text-secondary">{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        href={buttonHref}
        className={`w-full ${variant === 'primary' ? 'btn-primary' : 'btn-secondary'} py-3 font-semibold block text-center`}
      >
        {buttonText}
      </Link>
    </div>
  );
}