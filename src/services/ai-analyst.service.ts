import { SignalReportData } from './signal-report.service';
import { supabase } from '@/lib/supabase/client';

export interface HorizonRead {
  verdict: 'BUY' | 'SELL' | 'HOLD';
  conviction: 'low' | 'medium' | 'high';
  horizon: string;
  thesis: string;
  keyDrivers: string[];
  risks: string[];
  invalidation: string;
  // short-term carries entry/target/stop; long-term carries keyLevels
  entryZone?: string;
  target?: string;
  stop?: string;
  keyLevels?: string;
}

export interface AnalystTake {
  overallBias: 'bullish' | 'bearish' | 'neutral';
  newsSummary: string;
  shortTerm: HorizonRead;
  longTerm: HorizonRead;
}

/**
 * Ask the Claude analyst layer for a multi-timeframe, news-aware read with both
 * short-term and long-term verdicts. The route does the heavy lifting (fetching
 * multi-timeframe data + web research) server-side, so we send a slim payload.
 * Returns null when the layer is unavailable (no key / error) so the UI falls
 * back to the quantitative report alone.
 */
export async function getAnalystTake(report: SignalReportData): Promise<AnalystTake | null> {
  try {
    // The analyst route is auth-gated — send the signed-in user's access token.
    // If there's no session, skip the call entirely (no API cost).
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? null;
    if (!token) return null;

    const { signal } = report;
    const res = await fetch('/api/ai/analyst', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        symbol: signal.symbol,
        signal: {
          action: signal.action,
          confidence: signal.confidence,
          price: signal.price,
          target: signal.targetPrice,
          stop: signal.stopLoss,
          engine: signal.engine ?? 'technical',
        },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.available || !data?.analysis) return null;
    return data.analysis as AnalystTake;
  } catch {
    return null;
  }
}
