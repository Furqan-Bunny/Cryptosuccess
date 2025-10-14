import Link from 'next/link';

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
          <p className="text-text-secondary mb-6">Last updated: {new Date().toLocaleDateString()}</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">1. Acceptance of Terms</h2>
            <p className="text-text-secondary">
              By accessing and using CryptoSuccess, you agree to be bound by these Terms of Service.
              If you do not agree to these terms, please do not use our service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">2. Service Description</h2>
            <p className="text-text-secondary">
              CryptoSuccess provides AI-powered cryptocurrency trading signals for informational purposes only.
              Our signals are not financial advice and should not be considered as such.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">3. Investment Disclaimer</h2>
            <p className="text-text-secondary mb-4">
              <strong className="text-white">IMPORTANT:</strong> Cryptocurrency trading carries significant risk.
              You may lose some or all of your investment.
            </p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>Past performance does not guarantee future results</li>
              <li>Our AI signals are probabilistic and may be incorrect</li>
              <li>Always do your own research before trading</li>
              <li>Never invest more than you can afford to lose</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">4. Subscription Terms</h2>
            <p className="text-text-secondary">
              Subscriptions are billed monthly. You may cancel at any time.
              Refunds are provided on a case-by-case basis within 7 days of purchase.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">5. User Responsibilities</h2>
            <p className="text-text-secondary">You agree to:</p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>Provide accurate account information</li>
              <li>Keep your password secure</li>
              <li>Not share your account with others</li>
              <li>Comply with all applicable laws and regulations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">6. Limitation of Liability</h2>
            <p className="text-text-secondary">
              CryptoSuccess and its operators are not liable for any trading losses or damages
              resulting from the use of our signals. Use our service at your own risk.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">7. Changes to Terms</h2>
            <p className="text-text-secondary">
              We reserve the right to modify these terms at any time. Continued use of the
              service after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">8. Contact</h2>
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
