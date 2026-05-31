import { CandleData, TradeSignal } from './market.service';
import { AITrainingService } from './ai/training.service';
import { getCoinProfile } from './ai/coin-profiles';

class AISignalsService {
  private aiTrainingService: AITrainingService;

  constructor() {
    this.aiTrainingService = new AITrainingService();
  }

  async generateAISignal(symbol: string, candles: CandleData[]): Promise<TradeSignal> {
    try {
      const prediction = await this.aiTrainingService.generatePrediction(symbol);
      const currentPrice = candles[candles.length - 1].close;
      const action = prediction.action.toUpperCase() as 'BUY' | 'SELL' | 'HOLD';

      const atr = prediction.indicators.atr || 0;
      const adx = prediction.indicators.adx || 0;
      const rsi = prediction.indicators.rsi || 50;
      const macdHist = prediction.indicators.macd?.histogram || 0;
      const ema50 = prediction.indicators.ema50 || currentPrice;
      const ema200 = prediction.indicators.ema200 || currentPrice;
      const stochK = prediction.indicators.stochastic?.k || 50;
      const profile = getCoinProfile(symbol);

      // --- Confidence adjustments ---
      let adjustedConfidence = Math.min(prediction.confidence, 85); // Hard cap at 85%

      // ADX penalty for weak trends
      if (adx < 20) {
        adjustedConfidence *= (adx / 20);
      }

      // Multi-indicator consensus
      let consensusScore = 0;
      if (action === 'BUY') {
        if (rsi < 70) consensusScore++;
        if (macdHist > 0) consensusScore++;
        if (ema50 > ema200) consensusScore++;
        if (stochK < 80) consensusScore++;
        if (adx > 20) consensusScore++;
      } else if (action === 'SELL') {
        if (rsi > 30) consensusScore++;
        if (macdHist < 0) consensusScore++;
        if (ema50 < ema200) consensusScore++;
        if (stochK > 20) consensusScore++;
        if (adx > 20) consensusScore++;
      }

      if (consensusScore <= 1) adjustedConfidence *= 0.8;
      else if (consensusScore === 2) adjustedConfidence *= 0.9;
      else if (consensusScore >= 4) adjustedConfidence *= 1.05;
      adjustedConfidence = Math.min(Math.max(adjustedConfidence, 5), 85);

      // --- ATR-based stops and targets ---
      let targetPrice: number;
      let stopLoss: number;
      const safeATR = atr > 0 ? atr : currentPrice * (profile.typicalATRPercent / 100);

      switch (action) {
        case 'BUY':
          stopLoss = currentPrice - 2 * safeATR;
          targetPrice = currentPrice + 3 * safeATR; // 1.5:1 reward/risk
          break;
        case 'SELL':
          stopLoss = currentPrice + 2 * safeATR;
          targetPrice = currentPrice - 3 * safeATR;
          break;
        default:
          stopLoss = currentPrice - 1.5 * safeATR;
          targetPrice = currentPrice + 1.5 * safeATR;
      }

      // --- Enhanced reasoning ---
      const rsiStatus = rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral';
      const macdStatus = macdHist > 0 ? 'bullish' : 'bearish';
      const trendStatus = ema50 > ema200 ? 'uptrend' : 'downtrend';
      const atrPercent = currentPrice > 0 ? ((safeATR / currentPrice) * 100).toFixed(2) : '0';

      const reasoning =
        `AI: ${adjustedConfidence.toFixed(1)}% ${action.toLowerCase()} confidence. ` +
        `RSI: ${rsi.toFixed(1)} (${rsiStatus}). MACD: ${macdStatus} (hist: ${macdHist.toFixed(2)}). ` +
        `Trend: ${trendStatus}. ADX: ${adx.toFixed(1)} (${adx >= 25 ? 'strong' : 'weak'} trend). ` +
        `ATR: $${safeATR.toFixed(2)} (${atrPercent}%). ` +
        `Consensus: ${consensusScore}/5 indicators agree. ` +
        `Stop: ${((Math.abs(stopLoss - currentPrice) / currentPrice) * 100).toFixed(1)}%, ` +
        `Target: ${((Math.abs(targetPrice - currentPrice) / currentPrice) * 100).toFixed(1)}%.`;

      return {
        symbol,
        action,
        price: currentPrice,
        targetPrice,
        stopLoss,
        confidence: Math.round(adjustedConfidence * 10) / 10,
        reasoning,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error in AI signal generation:', error);
      throw error;
    }
  }

  async trainModel(symbol: string): Promise<void> {
    await this.aiTrainingService.trainModel(symbol);
  }

  async trainAllModels(): Promise<void> {
    await this.aiTrainingService.trainAllModels(['ETH', 'SOL', 'BNB']);
  }
}

// Lazy initialization
let aiSignalsServiceInstance: AISignalsService | null = null;

function getAISignalsService(): AISignalsService {
  if (typeof window === 'undefined') {
    throw new Error('AISignalsService requires browser environment');
  }
  if (!aiSignalsServiceInstance) {
    aiSignalsServiceInstance = new AISignalsService();
  }
  return aiSignalsServiceInstance;
}

export const aiSignalsService = {
  generateAISignal: async (...args: Parameters<AISignalsService['generateAISignal']>) => {
    return getAISignalsService().generateAISignal(...args);
  },
  trainModel: async (...args: Parameters<AISignalsService['trainModel']>) => {
    return getAISignalsService().trainModel(...args);
  },
  trainAllModels: async (...args: Parameters<AISignalsService['trainAllModels']>) => {
    return getAISignalsService().trainAllModels(...args);
  },
};
