import { SignalReportData } from './signal-report.service';
import { getCoinName } from '@/lib/coins';

export interface AnalystTake {
  verdict: 'BUY' | 'SELL' | 'HOLD';
  conviction: 'low' | 'medium' | 'high';
  agreesWithQuant: boolean;
  thesis: string;
  bullish: string[];
  bearish: string[];
  risk: string;
  invalidation: string;
}

// Build a compact, number-light summary of the report for the Claude analyst.
// (No raw candles — just the derived signals an analyst reasons over.)
function toPayload(report: SignalReportData) {
  const { signal, indicators, regime, sentimentValue, profile, levels } = report;
  const atrPercent = signal.price > 0 ? (indicators.atr / signal.price) * 100 : 0;
  return {
    symbol: signal.symbol,
    name: getCoinName(signal.symbol),
    price: signal.price,
    quant: { action: signal.action, confidence: signal.confidence, engine: signal.engine ?? 'technical' },
    indicators: {
      rsi: Number(indicators.rsi.toFixed(1)),
      macdHistogram: Number(indicators.macd.histogram.toFixed(2)),
      emaTrend: indicators.ema50 > indicators.ema200 ? 'up' : 'down',
      adx: Number(indicators.adx.toFixed(1)),
      stochasticK: Number(indicators.stochastic.k.toFixed(1)),
      atrPercent: Number(atrPercent.toFixed(2)),
    },
    regime: regime.regime,
    regimeDescription: regime.description,
    sentiment: sentimentValue,
    keyLevels: {
      supports: levels.supports,
      resistances: levels.resistances,
      pivot: levels.pivot,
    },
    plan: {
      entry: signal.price,
      target: signal.targetPrice,
      stop: signal.stopLoss,
      riskReward: Number(report.riskReward.toFixed(2)),
      potentialGainPct: Number(report.potentialGainPct.toFixed(1)),
      potentialLossPct: Number(report.potentialLossPct.toFixed(1)),
    },
    risk: { volatilityClass: profile.volatilityClass, maxPositionPct: profile.maxPositionSizePct },
  };
}

/**
 * Ask the Claude analyst layer for a structured read on a signal report.
 * Returns null when the layer is unavailable (no API key, error) so the UI
 * can fall back to the quantitative report alone.
 */
export async function getAnalystTake(report: SignalReportData): Promise<AnalystTake | null> {
  try {
    const res = await fetch('/api/ai/analyst', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toPayload(report)),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.available || !data?.analysis) return null;
    return data.analysis as AnalystTake;
  } catch {
    return null;
  }
}
