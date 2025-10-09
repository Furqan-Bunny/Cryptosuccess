import { CryptoPredictionModel } from './model';
import { TechnicalIndicators } from './indicators';
import { marketService } from '../market.service';

export class AITrainingService {
  private model: CryptoPredictionModel;

  constructor() {
    this.model = new CryptoPredictionModel();
  }

  // Fetch and prepare training data
  async prepareTrainingData(symbol: string, days = 30): Promise<{
    features: any[];
    labels: number[][];
  }> {
    // Get historical candles
    const candles = await marketService.getCandleData(symbol, '1h', days * 24);

    if (candles.length < 50) {
      throw new Error('Insufficient historical data for training');
    }

    const features: any[] = [];
    const labels: number[][] = [];

    // Create training samples with look-ahead labels
    for (let i = 50; i < candles.length - 24; i++) {
      const historicalCandles = candles.slice(i - 50, i);
      const currentPrice = candles[i].close;
      const futurePrice = candles[i + 24].close; // 24 hours later

      // Calculate indicators
      const indicators = TechnicalIndicators.prepareIndicators(historicalCandles);

      // Create feature object
      const feature = {
        price: currentPrice,
        volume: candles[i].volume,
        priceChange24h: ((currentPrice - candles[i - 24].close) / candles[i - 24].close) * 100,
        ...indicators,
      };

      features.push(feature);

      // Create labels based on future price movement
      const priceChange = ((futurePrice - currentPrice) / currentPrice) * 100;

      // Label encoding: [buy, sell, hold]
      if (priceChange > 2) {
        labels.push([1, 0, 0]); // Buy signal
      } else if (priceChange < -2) {
        labels.push([0, 1, 0]); // Sell signal
      } else {
        labels.push([0, 0, 1]); // Hold signal
      }
    }

    return { features, labels };
  }

  // Train model for a specific symbol
  async trainModel(symbol: string): Promise<void> {
    console.log(`Training AI model for ${symbol}...`);

    try {
      // Load existing model if available
      await this.model.load();

      // Prepare training data
      const { features, labels } = await this.prepareTrainingData(symbol, 60);

      // Train the model
      await this.model.train(features, labels);

      // Save the trained model
      await this.model.save();

      console.log(`Model training completed for ${symbol}`);
    } catch (error) {
      console.error(`Error training model for ${symbol}:`, error);
      throw error;
    }
  }

  // Generate prediction for current market conditions
  async generatePrediction(symbol: string): Promise<{
    symbol: string;
    action: 'buy' | 'sell' | 'hold';
    confidence: number;
    signals: {
      buy: number;
      sell: number;
      hold: number;
    };
    indicators: any;
    timestamp: Date;
  }> {
    try {
      // Load the model
      await this.model.load();

      // Get recent candles
      const candles = await marketService.getCandleData(symbol, '1h', 100);
      const indicators = TechnicalIndicators.prepareIndicators(candles.slice(-50));

      // Get current price data
      const currentPrice = await marketService.getCurrentPrice(symbol);

      // Prepare current market data
      const marketData = {
        price: currentPrice.price,
        volume: currentPrice.volume24h,
        priceChange24h: currentPrice.changePercent24h,
        ...indicators,
      };

      // Generate prediction
      const prediction = await this.model.predict(marketData);

      return {
        symbol,
        ...prediction,
        indicators,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error(`Error generating prediction for ${symbol}:`, error);
      throw error;
    }
  }

  // Batch train models for multiple symbols
  async trainAllModels(symbols: string[]): Promise<void> {
    for (const symbol of symbols) {
      try {
        await this.trainModel(symbol);
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error(`Failed to train model for ${symbol}:`, error);
      }
    }
  }
}