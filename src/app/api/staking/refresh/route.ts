import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { withCronMonitoring } from '@/lib/server/cron-monitor';
import { reportError } from '@/lib/server/report-error';

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

  return withCronMonitoring('staking-refresh', async () => {
    const db = createServiceClient();
    let pools: any[] = [];
    try {
      const resp = await axios.get('https://yields.llama.fi/pools', { timeout: 15000 });
      pools = resp.data?.data ?? [];
    } catch (e) {
      // Degrades to fallback APYs; logged as a warning (no alert).
      await reportError('cron.staking-refresh.defillama', e, {
        route: '/api/staking/refresh',
        level: 'warn',
        alert: false,
      });
    }

    const upserts = STAKEABLE.map(coin => {
      let apy = coin.fallbackApy;
      let project = 'estimate';
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
      return {
        symbol: coin.symbol,
        apy,
        project,
        source: project === 'estimate' ? 'estimate' : 'defillama',
        updated_at: new Date().toISOString(),
      };
    });

    const { error } = await db.from('staking_rates').upsert(upserts, { onConflict: 'symbol' });
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, updated: upserts.length });
  });
}

export async function GET(request: NextRequest) {
  return handler(request);
}
export async function POST(request: NextRequest) {
  return handler(request);
}
