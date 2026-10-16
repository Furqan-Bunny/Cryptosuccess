import { marketService, TradeSignal } from './market.service';
import { TechnicalIndicators } from './ai/indicators';
import { detectMarketRegime, RegimeAnalysis } from './ai/market-regime.service';
import { sentimentService } from './sentiment.service';
import { getCoinProfile, CoinProfile } from './ai/coin-profiles';
import { computeKeyLevels, KeyLevels } from './ai/levels';
import { isAiProfiled } from '@/lib/coins';
import { generateHorizonSignal } from './horizon-signal.service';
import { getHorizon, DEFAULT_HORIZON } from '@/lib/horizons';
import type { MtfResult } from './ai/mtf-confirmation';
import type { Indicators } from '@/components/market/IndicatorPanel';
import { levelStats, type PriceLevels } from '@/lib/recorded-levels';
import { buildRiskNote } from '@/lib/risk-rules';

export interface SignalNarrative {
  summary: string;
  bullish: string[];
  bearish: string[];
  riskNote: string;
}

export interface SignalReportData {
  signal: TradeSignal;
  indicators: Indicators;
  regime: RegimeAnalysis;
  sentimentValue: number | null;
  profile: CoinProfile;
  levels: KeyLevels;
  narrative: SignalNarrative;
  experimental: boolean;
  riskReward: number;
  potentialGainPct: number;
  potentialLossPct: number;
  mtf: MtfResult;
  horizonLabel: string;
}

function sentimentLabel(v: number): string {
  if (v <= 24) return 'Extreme Fear';
  if (v <= 44) return 'Fear';
  if (v <= 55) return 'Neutral';
  if (v <= 74) return 'Greed';
  return 'Extreme Greed';
}

function buildNarrative(
  symbol: string,
  signal: TradeSignal,
  ind: Indicators,
  regime: RegimeAnalysis,
  sentimentValue: number | null,
  profile: CoinProfile,
  potentialLossPct: number
): SignalNarrative {
  const bullish: string[] = [];
  const bearish: string[] = [];

  // Trend (EMA50 vs EMA200)
  if (ind.ema50 > ind.ema200) {
    bullish.push('Price is trading above its long-term average (EMA50 > EMA200) — a healthy uptrend structure.');
  } else {
    bearish.push('Price is below its long-term average (EMA50 < EMA200) — the broader trend is down.');
  }

  // RSI
  if (ind.rsi <= 30) {
    bullish.push(`RSI is ${ind.rsi.toFixed(0)} (oversold) — selling may be exhausted and a bounce often follows.`);
  } else if (ind.rsi >= 70) {
    bearish.push(`RSI is ${ind.rsi.toFixed(0)} (overbought) — the move is stretched and prone to a pullback.`);
  }

  // MACD momentum
  if (ind.macd.histogram > 0) {
    bullish.push('MACD histogram is positive — short-term momentum is building to the upside.');
  } else if (ind.macd.histogram < 0) {
    bearish.push('MACD histogram is negative — short-term momentum is to the downside.');
  }

  // Stochastic
  if (ind.stochastic.k <= 20) {
    bullish.push('Stochastic is in oversold territory — a momentum turn upward is possible.');
  } else if (ind.stochastic.k >= 80) {
    bearish.push('Stochastic is in overbought territory — momentum may be topping.');
  }

  // ADX / trend strength
  if (ind.adx >= 25) {
    const line = `Trend strength is high (ADX ${ind.adx.toFixed(0)}) — the current ${regime.regime.replace('_', ' ')} move has conviction.`;
    if (regime.regime === 'trending_up') bullish.push(line);
    else if (regime.regime === 'trending_down') bearish.push(line);
  } else if (ind.adx < 20) {
    bearish.push(`Trend is weak (ADX ${ind.adx.toFixed(0)}) — the market is choppy, so signals are less reliable.`);
  }

  // Sentiment (market-wide, contrarian framing)
  if (sentimentValue !== null) {
    if (sentimentValue <= 24) {
      bullish.push(`Market sentiment is ${sentimentLabel(sentimentValue)} (${sentimentValue}) — contrarian buyers often step in here.`);
    } else if (sentimentValue >= 75) {
      bearish.push(`Market sentiment is ${sentimentLabel(sentimentValue)} (${sentimentValue}) — euphoria can precede a cooldown.`);
    }
  }

  const verb = signal.action === 'BUY' ? 'buy' : signal.action === 'SELL' ? 'sell' : 'hold';
  const summary =
    `${symbol} is showing a ${signal.action} setup with ${signal.confidence}% confidence. ` +
    `${regime.description}. ${bullish.length} factors support a ${verb}, ${bearish.length} urge caution.`;

  // Position size (maxPositionSizePct) and risk (1–2% lost at the stop) are
  // separate numbers; buildRiskNote keeps them apart.
  const riskNote = buildRiskNote({
    symbol,
    volatilityClass: profile.volatilityClass,
    typicalATRPercent: profile.typicalATRPercent,
    maxPositionSizePct: profile.maxPositionSizePct,
    stopLabel: marketService.formatPrice(signal.stopLoss),
    stopDistancePct: potentialLossPct,
  });

  return { summary, bullish, bearish, riskNote };
}

/**
 * Assembles a full, explainable signal report for a coin by composing the
 * existing signal generator, indicator/regime/sentiment services and the
 * key-levels helper. All heavy lifting is reused; this only orchestrates.
 */
export async function buildSignalReport(symbol: string, horizonId: string = DEFAULT_HORIZON): Promise<SignalReportData> {
  const h = getHorizon(horizonId);
  const [horizonSignal, candles] = await Promise.all([
    generateHorizonSignal(symbol, horizonId),
    marketService.getCandleData(symbol, h.entryTF, Math.max(150, h.limit)),
  ]);
  const signal = horizonSignal.signal;

  const indicators = TechnicalIndicators.prepareIndicators(candles) as Indicators;
  const regime = detectMarketRegime(candles);
  const profile = getCoinProfile(symbol);
  const levels = computeKeyLevels(candles);

  let sentimentValue: number | null = null;
  try {
    sentimentValue = (await sentimentService.getFearGreedIndex()).value;
  } catch {
    sentimentValue = null;
  }

  const { riskReward, potentialGainPct, potentialLossPct } = levelStats({
    entryPrice: signal.price,
    targetPrice: signal.targetPrice,
    stopLoss: signal.stopLoss,
  });

  const narrative = buildNarrative(symbol, signal, indicators, regime, sentimentValue, profile, potentialLossPct);

  return {
    signal,
    indicators,
    regime,
    sentimentValue,
    profile,
    levels,
    narrative,
    experimental: !isAiProfiled(symbol),
    riskReward,
    potentialGainPct,
    potentialLossPct,
    mtf: horizonSignal.mtf,
    horizonLabel: horizonSignal.horizonLabel,
  };
}

/**
 * The same report moved onto the levels the server recorded (live-spot entry,
 * target and stop scaled to match), so what the user sees is exactly what gets
 * scored and anchored.
 */
export function withRecordedLevels(report: SignalReportData, levels: PriceLevels): SignalReportData {
  const signal = {
    ...report.signal,
    price: levels.entryPrice,
    targetPrice: levels.targetPrice,
    stopLoss: levels.stopLoss,
  };
  const stats = levelStats(levels);
  return {
    ...report,
    signal,
    ...stats,
    narrative: buildNarrative(
      signal.symbol,
      signal,
      report.indicators,
      report.regime,
      report.sentimentValue,
      report.profile,
      stats.potentialLossPct
    ),
  };
}
