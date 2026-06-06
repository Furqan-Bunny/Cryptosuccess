import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { FieldValue } from 'firebase-admin/firestore';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Coins we expose for simulated staking, with the DefiLlama pool-symbol tokens
// to match against and a sensible fallback APY used when no live pool is found.
const STAKEABLE: { symbol: string; match: string[]; fallbackApy: number }[] = [
  { symbol: 'ETH', match: ['STETH', 'WSTETH'], fallbackApy: 3.2 },
  { symbol: 'SOL', match: ['MSOL', 'JITOSOL', 'BSOL'], fallbackApy: 6.5 },
  { symbol: 'BNB', match: ['ANKRBNB', 'SLISBNB', 'BNBX'], fallbackApy: 2.0 },
  { symbol: 'MATIC', match: ['STMATIC', 'MATICX'], fallbackApy: 4.0 },
  { symbol: 'ADA', match: ['ADA'], fallbackApy: 2.8 },
  { symbol: 'DOT', match: ['DOT'], fallbackApy: 11.0 },
  { symbol: 'ATOM', match: ['STATOM', 'ATOM'], fallbackApy: 14.0 },
  { symbol: 'AVAX', match: ['SAVAX'], fallbackApy: 5.0 },
  { symbol: 'NEAR', match: ['NEAR'], fallbackApy: 8.0 },
  { symbol: 'TIA', match: ['STTIA', 'TIA'], fallbackApy: 12.0 },
  { symbol: 'SUI', match: ['SUI'], fallbackApy: 2.5 },
  { symbol: 'APT', match: ['APT'], fallbackApy: 7.0 },
  { symbol: 'INJ', match: ['INJ'], fallbackApy: 10.0 },
  { symbol: 'SEI', match: ['SEI'], fallbackApy: 5.5 },
  { symbol: 'TRX', match: ['TRX'], fallbackApy: 4.0 },
  { symbol: 'ALGO', match: ['ALGO'], fallbackApy: 5.0 },
];

// Refreshes cached staking APYs from DefiLlama's free, no-key /pools endpoint.
async function handler(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminDb();
    let pools: any[] = [];
    try {
      const resp = await axios.get('https://yields.llama.fi/pools', { timeout: 15000 });
      pools = resp.data?.data ?? [];
    } catch (e) {
      console.warn('DefiLlama fetch failed; using fallback APYs:', e);
    }

    let updated = 0;
    for (const coin of STAKEABLE) {
      let apy = coin.fallbackApy;
      let project = 'estimate';

      // Pick the highest-TVL pool whose symbol contains one of the match tokens
      // with a plausible APY (filters out exotic/incentive outliers).
      const candidates = pools
        .filter(p => {
          const sym = (p.symbol || '').toUpperCase();
          return coin.match.some(m => sym.includes(m)) && typeof p.apy === 'number' && p.apy > 0 && p.apy < 60;
        })
        .sort((a, b) => (b.tvlUsd || 0) - (a.tvlUsd || 0));

      if (candidates.length > 0) {
        apy = Math.round(candidates[0].apy * 100) / 100;
        project = candidates[0].project || 'defillama';
      }

      await db.collection('staking_rates').doc(coin.symbol).set({
        symbol: coin.symbol,
        apy,
        project,
        source: project === 'estimate' ? 'estimate' : 'defillama',
        updatedAt: FieldValue.serverTimestamp(),
      });
      updated += 1;
    }

    return NextResponse.json({ ok: true, updated });
  } catch (error) {
    console.error('Staking refresh error:', error);
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handler(request);
}
export async function POST(request: NextRequest) {
  return handler(request);
}
