'use client';

import { useMemo, useState } from 'react';
import {
  useAccount,
  useSendTransaction,
  useWriteContract,
  usePublicClient,
  useSwitchChain,
} from 'wagmi';
import { parseUnits, formatUnits, erc20Abi, type Hex } from 'viem';
import toast from 'react-hot-toast';
import { activeChain } from '@/lib/web3/config';

// 0x uses this sentinel address for the chain's native token (ETH).
const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

interface Token { symbol: string; address: string; decimals: number }

// Curated token lists per chain. More can be added; unknown chains show a notice.
const TOKENS: Record<number, Token[]> = {
  8453: [
    { symbol: 'ETH', address: NATIVE, decimals: 18 },
    { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  ],
  1: [
    { symbol: 'ETH', address: NATIVE, decimals: 18 },
    { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  ],
  84532: [{ symbol: 'ETH', address: NATIVE, decimals: 18 }],
};

type Status = 'idle' | 'quoting' | 'quoted' | 'approving' | 'swapping' | 'done' | 'error';

interface Quote {
  buyAmount: string;
  transaction: { to: Hex; data: Hex; value?: string };
  issues?: { allowance?: { spender: Hex } | null };
}

// Tokens for the configured chain (fixed per build, so computed once).
const CHAIN_TOKENS: Token[] = TOKENS[activeChain.id] ?? [];

export default function LiveSwapPanel() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const { switchChain } = useSwitchChain();

  const tokens = CHAIN_TOKENS;
  const [sellSym, setSellSym] = useState(tokens[0]?.symbol ?? 'ETH');
  const [buySym, setBuySym] = useState(tokens[1]?.symbol ?? tokens[0]?.symbol ?? 'ETH');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  const sell = useMemo(() => tokens.find(t => t.symbol === sellSym), [tokens, sellSym]);
  const buy = useMemo(() => tokens.find(t => t.symbol === buySym), [tokens, buySym]);
  const wrongChain = isConnected && chainId !== activeChain.id;

  async function authToken(): Promise<string | null> {
    const { supabase } = await import('@/lib/supabase/client');
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function getQuote() {
    if (!address || !sell || !buy || !amount) return;
    if (sell.symbol === buy.symbol) { toast.error('Pick two different tokens'); return; }
    setStatus('quoting');
    setMessage('');
    setQuote(null);
    try {
      const sellAmount = parseUnits(amount, sell.decimals).toString();
      const token = await authToken();
      if (!token) throw new Error('Not signed in');
      const params = new URLSearchParams({
        chainId: String(activeChain.id),
        sellToken: sell.address,
        buyToken: buy.address,
        sellAmount,
        taker: address,
      });
      const resp = await fetch(`/api/trade/quote?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok || !data.available) {
        throw new Error(data.reason === 'not_configured' ? 'Live trading is not enabled' : 'Quote failed');
      }
      setQuote(data.quote as Quote);
      setStatus('quoted');
    } catch (e) {
      setStatus('error');
      setMessage(e instanceof Error ? e.message : 'Quote failed');
    }
  }

  async function executeSwap() {
    if (!quote || !sell || !address || !publicClient) return;
    try {
      const sellAmount = parseUnits(amount, sell.decimals);

      // ERC-20 allowance (native ETH has none → issues.allowance is null).
      const spender = quote.issues?.allowance?.spender;
      if (spender) {
        setStatus('approving');
        setMessage('Approve the token in your wallet…');
        const approveHash = await writeContractAsync({
          address: sell.address as Hex,
          abi: erc20Abi,
          functionName: 'approve',
          args: [spender, sellAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setStatus('swapping');
      setMessage('Confirm the swap in your wallet…');
      const hash = await sendTransactionAsync({
        to: quote.transaction.to,
        data: quote.transaction.data,
        value: BigInt(quote.transaction.value ?? '0'),
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        setStatus('done');
        setMessage(`Swap confirmed (${hash.slice(0, 10)}…)`);
        toast.success('Swap confirmed');
      } else {
        setStatus('error');
        setMessage('Swap transaction reverted');
      }
    } catch (e) {
      setStatus('error');
      setMessage(e instanceof Error ? e.message : 'Swap failed');
    }
  }

  if (tokens.length < 2) {
    return (
      <p className="text-sm text-text-secondary">
        Live swaps aren’t configured for {activeChain.name} yet (need at least two supported tokens).
      </p>
    );
  }

  const buyPreview = quote && buy ? formatUnits(BigInt(quote.buyAmount), buy.decimals) : null;
  const busy = status === 'quoting' || status === 'approving' || status === 'swapping';

  return (
    <div className="space-y-4">
      {!isConnected && <p className="text-sm text-text-secondary">Connect a wallet to trade.</p>}

      {wrongChain && (
        <button onClick={() => switchChain({ chainId: activeChain.id })} className="btn-secondary text-sm px-3 py-2">
          Switch to {activeChain.name}
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-text-secondary">You pay</label>
          <div className="flex gap-2 mt-1">
            <input
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
              className="flex-1 bg-surface border border-gray-700 rounded-lg px-3 py-2 text-white"
            />
            <select value={sellSym} onChange={e => setSellSym(e.target.value)} className="bg-surface border border-gray-700 rounded-lg px-2 text-white">
              {tokens.map(t => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-text-secondary">You receive (est.)</label>
          <div className="flex gap-2 mt-1">
            <div className="flex-1 bg-background border border-gray-800 rounded-lg px-3 py-2 text-white truncate">
              {buyPreview ?? '—'}
            </div>
            <select value={buySym} onChange={e => setBuySym(e.target.value)} className="bg-surface border border-gray-700 rounded-lg px-2 text-white">
              {tokens.map(t => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={getQuote}
          disabled={!isConnected || wrongChain || busy || !amount}
          className="btn-secondary px-4 py-2 disabled:opacity-50"
        >
          {status === 'quoting' ? 'Getting quote…' : 'Get quote'}
        </button>
        <button
          onClick={executeSwap}
          disabled={!quote || busy || wrongChain}
          className="btn-primary px-4 py-2 disabled:opacity-50"
        >
          {status === 'approving' ? 'Approving…' : status === 'swapping' ? 'Swapping…' : 'Swap'}
        </button>
      </div>

      {message && (
        <p className={`text-sm ${status === 'error' ? 'text-red-400' : status === 'done' ? 'text-green-400' : 'text-text-secondary'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
