'use client';

import { ReactNode, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createWagmiConfig, isLiveTradingEnabled } from '@/lib/web3/config';

// Wraps the app in wagmi + react-query ONLY when live trading is enabled. When
// off (the default), it renders children untouched — zero effect on the existing
// paper-trading app, and no WalletConnect init.
export default function Web3Provider({ children }: { children: ReactNode }) {
  const [config] = useState(() => (isLiveTradingEnabled() ? createWagmiConfig() : null));
  const [queryClient] = useState(() => new QueryClient());

  if (!config) return <>{children}</>;

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
