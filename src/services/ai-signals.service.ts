import { CandleData, TradeSignal } from './market.service';
import { AITrainingService } from './ai/training.service';

class AISignalsService {
  private aiTrainingService: AITrainingService;

  constructor() {
    this.aiTrainingService = new AITrainingService();
  }

  async generateAISignal(symbol: string, candles: CandleData[]): Promise<TradeSignal> {
    try {
      // Generate AI prediction
      const prediction = await this.aiTrainingService.generatePrediction(symbol);

      const currentPrice = candles[candles.length - 1].close;

      let targetPrice: number;
      let stopLoss: number;
      let reasoning: string;

      // Convert AI prediction to trading signal
      const action = prediction.action.toUpperCase() as 'BUY' | 'SELL' | 'HOLD';

      // Build comprehensive reasoning
      const rsiStatus = prediction.indicators.rsi > 70 ? 'overbought' :
                       prediction.indicators.rsi < 30 ? 'oversold' : 'neutral';

      const macdStatus = prediction.indicators.macd.histogram > 0 ? 'bullish' : 'bearish';

      const trendStatus = prediction.indicators.ema50 > prediction.indicators.ema200 ?
                         'uptrend (EMA50 > EMA200)' : 'downtrend (EMA50 < EMA200)';

      switch (action) {
        case 'BUY':
          // Dynamic target based on confidence and volatility
          const buyMultiplier = 1 + (0.02 + (prediction.confidence / 100) * 0.08); // 2-10%
          targetPrice = currentPrice * buyMultiplier;
          stopLoss = currentPrice * 0.97; // 3% stop loss

          reasoning = `AI model shows ${prediction.confidence.toFixed(1)}% buy confidence. ` +
                     `RSI at ${prediction.indicators.rsi?.toFixed(1)} (${rsiStatus}), ` +
                     `MACD ${macdStatus}, ` +
                     `${trendStatus}. ` +
                     `Volume analysis suggests accumulation phase.`;
          break;

        case 'SELL':
          // Dynamic target based on confidence
          const sellMultiplier = 1 - (0.02 + (prediction.confidence / 100) * 0.08); // 2-10%
          targetPrice = currentPrice * sellMultiplier;
          stopLoss = currentPrice * 1.03; // 3% stop loss

          reasoning = `AI model shows ${prediction.confidence.toFixed(1)}% sell confidence. ` +
                     `RSI at ${prediction.indicators.rsi?.toFixed(1)} (${rsiStatus}), ` +
                     `MACD ${macdStatus}, ` +
                     `${trendStatus}. ` +
                     `Price near Bollinger upper band at ${prediction.indicators.bollinger.upper.toFixed(2)}.`;
          break;

        default: // HOLD
          targetPrice = currentPrice * 1.02; // 2% upside
          stopLoss = currentPrice * 0.98; // 2% downside

          reasoning = `AI model suggests holding with ${prediction.confidence.toFixed(1)}% confidence. ` +
                     `RSI at ${prediction.indicators.rsi?.toFixed(1)} (${rsiStatus}), ` +
                     `MACD ${macdStatus}. ` +
                     `Market showing consolidation between ${prediction.indicators.bollinger.lower.toFixed(2)} ` +
                     `and ${prediction.indicators.bollinger.upper.toFixed(2)}.`;
      }

      // Add risk assessment
      const volatility = this.calculateVolatility(candles.slice(-20));
      if (volatility > 0.05) {
        reasoning += ' High volatility detected - consider smaller position size.';
      }

      return {
        symbol,
        action,
        price: currentPrice,
        targetPrice,
        stopLoss,
        confidence: prediction.confidence,
        reasoning,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error in AI signal generation:', error);
      throw error;
    }
  }

  private calculateVolatility(candles: CandleData[]): number {
    const returns = [];
    for (let i = 1; i < candles.length; i++) {
      returns.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
    }

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;

    return Math.sqrt(variance);
  }

  // Train the AI model with historical data
  async trainModel(symbol: string): Promise<void> {
    await this.aiTrainingService.trainModel(symbol);
  }

  // Batch train for all supported symbols
  async trainAllModels(): Promise<void> {
    const symbols = ['ETH', 'SOL', 'BNB'];
    await this.aiTrainingService.trainAllModels(symbols);
  }
}

// Lazy initialization - only create instance when first accessed
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

// Export a getter function instead of the instance
export const aiSignalsService = {
  generateAISignal: async (...args: Parameters<AISignalsService['generateAISignal']>) => {
    const instance = getAISignalsService();
    return instance.generateAISignal(...args);
  },
  trainModel: async (...args: Parameters<AISignalsService['trainModel']>) => {
    const instance = getAISignalsService();
    return instance.trainModel(...args);
  },
  trainAllModels: async (...args: Parameters<AISignalsService['trainAllModels']>) => {
    const instance = getAISignalsService();
    return instance.trainAllModels(...args);
  }
};