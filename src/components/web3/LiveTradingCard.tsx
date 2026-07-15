'use client';

import { useState } from 'react';
import { FaBolt } from 'react-icons/fa';
import { isLiveTradingEnabled, activeChain } from '@/lib/web3/config';
import ConnectWallet from './ConnectWallet';
import LiveSwapPanel from './LiveSwapPanel';

// Opt-in live-trading entry point. Renders NOTHING unless the feature is enabled
// (env flag + WalletConnect id), so paper trading is completely unaffected by
// default. Collapsed by default; carries a persistent real-funds/legal warning.
export default function LiveTradingCard() {
  const [open, setOpen] = useState(false);
  if (!isLiveTradingEnabled()) return null;

  return (
    <div className="card p-6 mb-6 border border-yellow-700/40">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center">
            <FaBolt className="mr-2 text-yellow-400" /> Live trading
            <span className="ml-2 text-xs bg-yellow-900/40 text-yellow-300 px-2 py-0.5 rounded">beta</span>
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            Real, non-custodial swaps from your own wallet on {activeChain.name}. You sign every
            transaction — we never hold your keys or funds.
          </p>
        </div>
        <button onClick={() => setOpen(o => !o)} className="btn-ghost text-sm px-3 py-1">
          {open ? 'Hide' : 'Open'}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="p-3 bg-yellow-900/10 border border-yellow-700/40 rounded-lg text-xs text-yellow-200">
            ⚠️ Real funds at risk. Crypto trades are irreversible and can lose money. This is not
            financial advice. Ensure trading is legal in your jurisdiction before using this feature.
          </div>
          <ConnectWallet />
          <LiveSwapPanel />
        </div>
      )}
    </div>
  );
}
