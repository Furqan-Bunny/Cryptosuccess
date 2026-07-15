'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';

// Minimal wallet connect/disconnect. Renders the configured connectors (injected
// + WalletConnect). The app only ever reads the address and asks the wallet to
// sign — it never has custody.
export default function ConnectWallet() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-text-secondary">
          {address.slice(0, 6)}…{address.slice(-4)}
          {chain ? ` · ${chain.name}` : ''}
        </span>
        <button onClick={() => disconnect()} className="btn-ghost text-sm px-3 py-1">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {connectors.map(c => (
        <button
          key={c.uid}
          onClick={() => connect({ connector: c })}
          disabled={isPending}
          className="btn-secondary text-sm px-3 py-1 disabled:opacity-50"
        >
          Connect {c.name}
        </button>
      ))}
    </div>
  );
}
