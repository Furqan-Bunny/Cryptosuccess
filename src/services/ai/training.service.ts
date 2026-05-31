import { CryptoPredictionModel } from './model';
import { TechnicalIndicators } from './indicators';
import { marketService } from '../market.service';

export class AITrainingService {
  private model: CryptoPredictionModel;

  constructor() {
    this.model = new CryptoPredictionModel();
  }

  // Prepare training data with sliding windows and ATR-based labeling
  async prepareTrainingData(symbol: string, days = 30): Promise<{
    windows: number[][][];
    labels: number[][];
  }> {
    const candles = await marketService.getCandleData(symbol, '1h', days * 24);

    if (candles.length < 100) {
      throw new Error('Insufficient historical data for training');
    }

    const LOOKBACK = 50; // minimum candles needed for indicators
    const TIMESTEPS = CryptoPredictionModel.TIMESTEPS;
    const LOOKAHEAD = 24; // evaluate 24 hours later

    // Step 1: Compute normalized feature vector for every candle position
    const allFeatures: number[][] = [];
    for (let i = LOOKBACK; i < candles.length; i++) {
      const slice = candles.slice(Math.max(0, i - LOOKBACK), i + 1);
      const features = TechnicalIndicators.prepareNormalizedFeatures(slice);
      allFeatures.push(features);
    }

    // Step 2: Create sliding windows of TIMESTEPS and ATR-based labels
    const windows: number[][][] = [];
    const labels: number[][] = [];

    for (let i = TIMESTEPS; i < allFeatures.length - LOOKAHEAD; i++) {
      const window = allFeatures.slice(i - TIMESTEPS, i);

      // Map back to candle index for price comparison
      const candleIdx = i + LOOKBACK;
      const currentPrice = candles[candleIdx].close;
      const futurePrice = candles[candleIdx + LOOKAHEAD].close;
      const priceChange = ((futurePrice - currentPrice) / currentPrice) * 100;

      // ATR-based labeling threshold
      const sliceForATR = candles.slice(Math.max(0, candleIdx - 50), candleIdx + 1);
      const atrPercent = TechnicalIndicators.calculateATRPercent(
        sliceForATR.map(c => c.high),
        sliceForATR.map(c => c.low),
        sliceForATR.map(c => c.close)
      );
      const threshold = Math.max(atrPercent, 1); // minimum 1%

      if (priceChange > threshold) {
        labels.push([1, 0, 0]); // BUY
      } else if (priceChange < -threshold) {
        labels.push([0, 1, 0]); // SELL
      } else {
        labels.push([0, 0, 1]); // HOLD
      }

      windows.push(window);
    }

    return { windows, labels };
  }

  async trainModel(symbol: string): Promise<void> {
    console.log(`Training LSTM model for ${symbol}...`);

    try {
      await this.model.load();
      const { windows, labels } = await this.prepareTrainingData(symbol, 60);

      if (windows.length < 50) {
        throw new Error(`Only ${windows.length} training samples — need at least 50`);
      }

      const result = await this.model.train(windows, labels, {
        epochs: 50,
        earlyStoppingPatience: 5,
        validationSplit: 0.2,
      });

      console.log(`Training complete: loss=${result.finalLoss.toFixed(4)}, acc=${result.finalAccuracy.toFixed(4)}`);
      await this.model.save();
    } catch (error) {
      console.error(`Error training model for ${symbol}:`, error);
      throw error;
    }
  }

  async generatePrediction(symbol: string): Promise<{
    symbol: string;
    action: 'buy' | 'sell' | 'hold';
    confidence: number;
    signals: { buy: number; sell: number; hold: number };
    indicators: any;
    timestamp: Date;
  }> {
    if (typeof window === 'undefined') {
      throw new Error('AI prediction requires browser environment');
    }

    await this.model.load();

    // Get enough candles for indicators (50 lookback) + 24 timestep window
    const candles = await marketService.getCandleData(symbol, '1h', 100);
    const LOOKBACK = 50;
    const TIMESTEPS = CryptoPredictionModel.TIMESTEPS;

    // Build feature vectors for the last TIMESTEPS candle positions
    const featureVectors: number[][] = [];
    for (let i = candles.length - TIMESTEPS; i < candles.length; i++) {
      const slice = candles.slice(Math.max(0, i - LOOKBACK), i + 1);
      featureVectors.push(TechnicalIndicators.prepareNormalizedFeatures(slice));
    }

    const prediction = await this.model.predict(featureVectors);

    // Also return traditional indicators for reasoning
    const indicators = TechnicalIndicators.prepareIndicators(candles.slice(-50));

    return {
      symbol,
      ...prediction,
      indicators,
      timestamp: new Date(),
    };
  }

  async trainAllModels(symbols: string[]): Promise<void> {
    for (const symbol of symbols) {
      try {
        await this.trainModel(symbol);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error(`Failed to train model for ${symbol}:`, error);
      }
    }
  }
}
