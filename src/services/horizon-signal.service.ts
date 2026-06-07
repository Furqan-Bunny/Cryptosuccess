import { marketService, TradeSignal } from './market.service';
import { TechnicalIndicators } from './ai/indicators';
import { summarizeTimeframe } from './market-context.service';
import { applyMtfConfirmation, MtfResult } from './ai/mtf-confirmation';
import { aiSignalsService, adjustModelConfidence } from './ai-signals.service';
import { getCoinProfile } from './ai/coin-profiles';
import { getHorizon } from '@/lib/horizons';

export interface HorizonSignal {
  signal: TradeSignal;
  mtf: MtfResult;
  horizonId: string;
  horizonLabel: string;
}

// Generate a signal for a chosen horizon:
//   1) base action+confidence from the timeframe's AI model (any coin) or the
//      rule engine (15m / model unavailable),
//   2) multi-timeframe confirmation against the higher timeframes,
//   3) ATR-based stop/target scaled to the horizon.
export async function generateHorizonSignal(symbol: string, horizonId: string): Promise<HorizonSignal> {
  const h = getHorizon(horizonId);
  const entryCandles = await marketService.getCandleData(symbol, h.entryTF, h.limit);
  if (!entryCandles.length) throw new Error('No candle data');

  const price = entryCandles[entryCandles.length - 1].close;
  const ind: any = TechnicalIndicators.prepareIndicators(entryCandles);
  const profile = getCoinProfile(symbol);
  const atr = ind.atr > 0 ? ind.atr : price * (profile.typicalATRPercent / 100);

  // 1) Base signal
  let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let confidence = 50;
  let engine: 'ai' | 'technical' = 'technical';

  const runRuleBased = () => {
    const s = marketService.generateRuleBasedSignal(symbol, entryCandles, price);
    action = s.action;
    confidence = s.confidence;
    engine = 'technical';
  };

  if (h.engine === 'model' && h.modelTF) {
    try {
      const modelCandles =
        h.modelTF === h.entryTF ? entryCandles : await marketService.getCandleData(symbol, h.modelTF, 150);
      const pred = await aiSignalsService.predict(symbol, h.modelTF, modelCandles);
      action = pred.action.toUpperCase() as 'BUY' | 'SELL' | 'HOLD';
      confidence = adjustModelConfidence(pred.confidence, action, ind);
      engine = 'ai';
    } catch {
      runRuleBased(); // model not available for this TF → graceful fallback
    }
  } else {
    runRuleBased();
  }

  // 2) Multi-timeframe confirmation
  const summaries = await Promise.all(
    h.confirmTFs.map(async tf => ({
      tf,
      summary: summarizeTimeframe(await marketService.getCandleData(symbol, tf, 200)),
    }))
  );
  const mtf = applyMtfConfirmation(action, confidence, summaries, h.biasTF);

  // 3) Stop / target scaled by horizon
  const dir = mtf.action;
  const stopLoss = dir === 'SELL' ? price + h.atr.stop * atr : price - h.atr.stop * atr;
  const targetPrice = dir === 'SELL' ? price - h.atr.target * atr : price + h.atr.target * atr;

  const reasoning =
    `${h.label}: ${engine === 'ai' ? 'AI model' : 'technical engine'} on ${h.entryTF} → ${dir} ` +
    `(${mtf.confidence.toFixed(0)}%). Higher-timeframe confluence ${mtf.confluencePct}% ` +
    `across ${h.confirmTFs.join('/')}. ${mtf.note}`;

  const signal: TradeSignal = {
    symbol,
    action: dir,
    confidence: mtf.confidence,
    price,
    targetPrice,
    stopLoss,
    reasoning,
    timestamp: new Date(),
    engine,
  };

  return { signal, mtf, horizonId: h.id, horizonLabel: h.label };
}
