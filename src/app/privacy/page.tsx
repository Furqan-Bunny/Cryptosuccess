import Link from 'next/link';

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
          <p className="text-text-secondary mb-6">Last updated: {new Date().toLocaleDateString()}</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">1. Information We Collect</h2>
            <p className="text-text-secondary mb-4">We collect the following types of information:</p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li><strong className="text-white">Account Information:</strong> Email, password (encrypted), display name</li>
              <li><strong className="text-white">Usage Data:</strong> Signals viewed, pages visited, session duration</li>
              <li><strong className="text-white">Device Information:</strong> Browser type, IP address, operating system</li>
              <li><strong className="text-white">Payment Information:</strong> Processed securely by Stripe (we don't store card details)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">2. How We Use Your Information</h2>
            <p className="text-text-secondary mb-4">We use your information to:</p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>Provide and improve our AI trading signals service</li>
              <li>Manage your account and subscription</li>
              <li>Send important service updates and notifications</li>
              <li>Analyze usage patterns to enhance user experience</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">3. Data Storage and Security</h2>
            <p className="text-text-secondary mb-4">
              Your data is stored securely using Firebase (Google Cloud Platform) with:
            </p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>End-to-end encryption for sensitive data</li>
              <li>Secure HTTPS connections</li>
              <li>Regular security audits and updates</li>
              <li>Access controls and authentication</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">4. Third-Party Services</h2>
            <p className="text-text-secondary mb-4">We use the following third-party services:</p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li><strong className="text-white">Firebase (Google):</strong> Authentication and database</li>
              <li><strong className="text-white">Stripe:</strong> Payment processing</li>
              <li><strong className="text-white">Binance API:</strong> Market data (no personal data shared)</li>
              <li><strong className="text-white">CoinGecko API:</strong> Price data (no personal data shared)</li>
              <li><strong className="text-white">Vercel:</strong> Hosting and analytics</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">5. Cookies and Tracking</h2>
            <p className="text-text-secondary">
              We use essential cookies for authentication and session management.
              We also use analytics cookies to understand how users interact with our platform.
              You can disable cookies in your browser settings, but this may affect functionality.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">6. Data Sharing</h2>
            <p className="text-text-secondary mb-4">
              We do not sell your personal information. We may share data with:
            </p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>Service providers (Firebase, Stripe) to operate our platform</li>
              <li>Law enforcement when legally required</li>
              <li>Business partners with your explicit consent</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">7. Your Rights</h2>
            <p className="text-text-secondary mb-4">You have the right to:</p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>Access your personal data</li>
              <li>Request data correction or deletion</li>
              <li>Export your data</li>
              <li>Withdraw consent for data processing</li>
              <li>Object to automated decision-making</li>
            </ul>
            <p className="text-text-secondary mt-4">
              To exercise these rights, contact us at{' '}
              <a href="mailto:privacy@cryptosuccess.com" className="text-primary hover:text-primary-light">
                privacy@cryptosuccess.com
              </a>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">8. Data Retention</h2>
            <p className="text-text-secondary">
              We retain your data for as long as your account is active.
              After account deletion, we keep minimal data for 90 days for legal compliance,
              then permanently delete all personal information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">9. Children's Privacy</h2>
            <p className="text-text-secondary">
              Our service is not intended for users under 18 years of age.
              We do not knowingly collect data from children.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">10. International Users</h2>
            <p className="text-text-secondary">
              Your data may be transferred and processed in countries outside your residence.
              We ensure appropriate safeguards are in place for international data transfers.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">11. Changes to This Policy</h2>
            <p className="text-text-secondary">
              We may update this privacy policy periodically. We'll notify you of significant
              changes via email or in-app notification.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">12. Contact Us</h2>
            <p className="text-text-secondary">
              For privacy concerns or questions, contact us at:{' '}
              <a href="mailto:privacy@cryptosuccess.com" className="text-primary hover:text-primary-light">
                privacy@cryptosuccess.com
              </a>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">13. GDPR Compliance</h2>
            <p className="text-text-secondary">
              For EU users, we comply with GDPR requirements. You have additional rights
              including data portability and the right to lodge a complaint with supervisory authorities.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
