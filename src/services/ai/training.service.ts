import { CryptoPredictionModel } from './model';
import { TechnicalIndicators } from './indicators';
import { marketService, CandleData } from '../market.service';

export class AITrainingService {
  // One model instance per timeframe (1h / 4h / 1d). Lazily created + cached.
  private models = new Map<string, CryptoPredictionModel>();

  private getModel(tf: string): CryptoPredictionModel {
    let m = this.models.get(tf);
    if (!m) {
      m = new CryptoPredictionModel(tf);
      this.models.set(tf, m);
    }
    return m;
  }

  // Prepare 1h training data with sliding windows and ATR-based labeling
  // (used by the in-browser "train your own" flow).
  async prepareTrainingData(symbol: string, days = 30): Promise<{
    windows: number[][][];
    labels: number[][];
  }> {
    const candles = await marketService.getCandleData(symbol, '1h', days * 24);
    if (candles.length < 100) {
      throw new Error('Insufficient historical data for training');
    }

    const LOOKBACK = 50;
    const TIMESTEPS = CryptoPredictionModel.TIMESTEPS;
    const LOOKAHEAD = 24;

    const allFeatures: number[][] = [];
    for (let i = LOOKBACK; i < candles.length; i++) {
      const slice = candles.slice(Math.max(0, i - LOOKBACK), i + 1);
      allFeatures.push(TechnicalIndicators.prepareNormalizedFeatures(slice));
    }

    const windows: number[][][] = [];
    const labels: number[][] = [];
    for (let i = TIMESTEPS; i < allFeatures.length - LOOKAHEAD; i++) {
      const window = allFeatures.slice(i - TIMESTEPS, i);
      const candleIdx = i + LOOKBACK;
      const currentPrice = candles[candleIdx].close;
      const futurePrice = candles[candleIdx + LOOKAHEAD].close;
      const priceChange = ((futurePrice - currentPrice) / currentPrice) * 100;

      const sliceForATR = candles.slice(Math.max(0, candleIdx - 50), candleIdx + 1);
      const atrPercent = TechnicalIndicators.calculateATRPercent(
        sliceForATR.map(c => c.high),
        sliceForATR.map(c => c.low),
        sliceForATR.map(c => c.close)
      );
      const threshold = Math.max(atrPercent, 1);

      if (priceChange > threshold) labels.push([1, 0, 0]);
      else if (priceChange < -threshold) labels.push([0, 1, 0]);
      else labels.push([0, 0, 1]);

      windows.push(window);
    }

    return { windows, labels };
  }

  async trainModel(symbol: string): Promise<void> {
    const model = this.getModel('1h');
    try {
      await model.load();
      const { windows, labels } = await this.prepareTrainingData(symbol, 60);
      if (windows.length < 50) {
        throw new Error(`Only ${windows.length} training samples — need at least 50`);
      }
      const result = await model.train(windows, labels, {
        epochs: 50,
        earlyStoppingPatience: 5,
        validationSplit: 0.2,
      });
      console.log(`Training complete: loss=${result.finalLoss.toFixed(4)}, acc=${result.finalAccuracy.toFixed(4)}`);
      await model.save();
    } catch (error) {
      console.error(`Error training model for ${symbol}:`, error);
      throw error;
    }
  }

  // Run a prediction for a coin on a given timeframe. The generalized model for
  // that timeframe works on ANY coin because features are normalized. Callers
  // may pass candlesOverride to avoid a second fetch.
  async generatePrediction(symbol: string, tf: string = '1h', candlesOverride?: CandleData[]): Promise<{
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

    const model = this.getModel(tf);
    await model.load();
    if (!model.hasTrainedModel()) {
      throw new Error('AI model not trained');
    }

    const LOOKBACK = 50;
    const TIMESTEPS = CryptoPredictionModel.TIMESTEPS;
    const candles = candlesOverride ?? (await marketService.getCandleData(symbol, tf, 150));
    if (candles.length < LOOKBACK + TIMESTEPS) {
      throw new Error('Insufficient candles for prediction');
    }

    const featureVectors: number[][] = [];
    for (let i = candles.length - TIMESTEPS; i < candles.length; i++) {
      const slice = candles.slice(Math.max(0, i - LOOKBACK), i + 1);
      featureVectors.push(TechnicalIndicators.prepareNormalizedFeatures(slice));
    }

    const prediction = await model.predict(featureVectors);
    const indicators = TechnicalIndicators.prepareIndicators(candles.slice(-50));

    return { symbol, ...prediction, indicators, timestamp: new Date() };
  }

  async hasTrainedModel(tf: string = '1h'): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const model = this.getModel(tf);
    await model.load();
    return model.hasTrainedModel();
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
