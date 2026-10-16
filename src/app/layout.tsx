import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

// Absolute base for Open Graph URLs. Falls back to localhost when the public app
// URL is unset or malformed so metadata generation never throws.
function siteUrl(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  } catch {
    return new URL('http://localhost:3000');
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: 'CryptoSuccess - Honest crypto signals with a verifiable track record',
  description:
    'Risk-first crypto trade ideas with a stop-loss on every buy or sell call, a coach that says when to stay out, and a scored track record anchored on-chain that anyone can verify. Not financial advice.',
  keywords:
    'cryptocurrency, trading signals, risk management, stop-loss, verifiable track record, on-chain, Telegram bot, paper trading',
  authors: [{ name: 'CryptoSuccess Team' }],
  openGraph: {
    title: 'CryptoSuccess - The honest crypto coach',
    description: 'Risk-first crypto signals with a track record you can verify yourself.',
    siteName: 'CryptoSuccess',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'CryptoSuccess - The honest crypto coach',
    description: 'Risk-first crypto signals with a track record you can verify yourself.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

import Providers from './providers';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-background text-text-primary`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}