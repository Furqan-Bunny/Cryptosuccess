import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CryptoSuccess - AI-Powered Crypto Trading Signals',
  description: 'Get AI-generated cryptocurrency trading signals for ETH, SOL, and BNB. Make data-driven trading decisions with our advanced machine learning algorithms.',
  keywords: 'cryptocurrency, trading signals, AI, machine learning, Bitcoin, Ethereum, Solana, Binance',
  authors: [{ name: 'CryptoSuccess Team' }],
  openGraph: {
    title: 'CryptoSuccess - AI Trading Signals',
    description: 'Professional cryptocurrency trading signals powered by AI',
    url: 'https://cryptosuccess.com',
    siteName: 'CryptoSuccess',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CryptoSuccess - AI Trading Platform',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CryptoSuccess - AI Trading Signals',
    description: 'Professional cryptocurrency trading signals powered by AI',
    images: ['/twitter-image.png'],
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
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
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