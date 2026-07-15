// Web3 config for the OPT-IN, non-custodial live-trading feature. The app never
// holds keys or funds — the user signs in their own wallet and swaps route through
// the 0x aggregator. Everything here is inert unless explicitly enabled:
//   NEXT_PUBLIC_LIVE_TRADING_ENABLED=true  AND a WalletConnect project id is set.
// Default chain is a TESTNET (Base Sepolia) — flip to a mainnet only after a legal
// review (trade execution can require licensing/KYC/geo limits).

import { createConfig, http } from 'wagmi';
import { base, baseSepolia, mainnet, arbitrum, optimism, polygon } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_LIVE_TRADING_CHAIN_ID ?? '84532');
const RPC_URL = process.env.NEXT_PUBLIC_LIVE_TRADING_RPC_URL;

// All chains the wallet may use; the "active" one below is just the default the
// UI points at (users can switch). Registering all keeps wagmi's transport map
// well-typed and lets the panel support switching.
const CHAINS = [base, baseSepolia, mainnet, arbitrum, optimism, polygon] as const;

export const activeChain = CHAINS.find(c => c.id === CHAIN_ID) ?? baseSepolia;

// Live trading is on ONLY when explicitly flagged AND WalletConnect is configured.
export function isLiveTradingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_LIVE_TRADING_ENABLED === 'true' && !!PROJECT_ID;
}

// Custom RPC (if provided) applies to the configured active chain; others use the
// chain's default public RPC.
function transportFor(id: number) {
  return id === CHAIN_ID && RPC_URL ? http(RPC_URL) : http();
}

export function createWagmiConfig() {
  const connectors = PROJECT_ID
    ? [injected(), walletConnect({ projectId: PROJECT_ID })]
    : [injected()];

  return createConfig({
    chains: CHAINS,
    connectors,
    transports: {
      [base.id]: transportFor(base.id),
      [baseSepolia.id]: transportFor(baseSepolia.id),
      [mainnet.id]: transportFor(mainnet.id),
      [arbitrum.id]: transportFor(arbitrum.id),
      [optimism.id]: transportFor(optimism.id),
      [polygon.id]: transportFor(polygon.id),
    },
  });
}
