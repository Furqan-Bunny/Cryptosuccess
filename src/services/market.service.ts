import axios from 'axios';
import { TechnicalIndicators } from './ai/indicators';

// Types
export interface MarketPrice {
  symbol: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  marketCap: number;
  lastUpdate: Date;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FundingRateData {
  symbol: string;
  fundingRate: number;
  fundingTime: number;
  markPrice: number;
}

export interface OrderBookData {
  bids: Array<[string, string]>; // [price, quantity]
  asks: Array<[string, string]>; // [price, quantity]
  lastUpdateId: number;
}

export interface TradeSignal {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0-100
  price: number;
  targetPrice: number;
  stopLoss: number;
  reasoning: string;
  timestamp: Date;
}

class MarketService {
  private readonly binanceApiUrl = 'https://api.binance.com/api/v3';
  private readonly coingeckoApiUrl = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';

  // Symbol mappings
  private readonly symbolMap: { [key: string]: string } = {
    'ETH': 'ETHUSDT',
    'SOL': 'SOLUSDT',
    'BNB': 'BNBUSDT',
  };

  private readonly coingeckoIds: { [key: string]: string } = {
    'ETH': 'ethereum',
    'SOL': 'solana',
    'BNB': 'binancecoin',
  };

  // Get current price for a symbol from Binance
  async getCurrentPrice(symbol: string): Promise<MarketPrice> {
    try {
      // Use our API route to avoid CORS issues
      const response = await axios.get('/api/market', {
        params: {
          symbol,
          action: 'price',
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching market price:', error);
      throw new Error('Failed to fetch market price');
    }
  }

  // Get multiple prices at once
  async getMultiplePrices(symbols: string[]): Promise<MarketPrice[]> {
    const promises = symbols.map(symbol => this.getCurrentPrice(symbol));
    return Promise.all(promises);
  }

  // Get all market prices at once (more efficient)
  async getAllPrices(): Promise<MarketPrice[]> {
    try {
      const response = await axios.get('/api/market/all');
      return response.data;
    } catch (error) {
      console.error('Error fetching all market prices:', error);
      throw new Error('Failed to fetch market prices');
    }
  }

  // Get historical candlestick data
  async getCandleData(
    symbol: string,
    interval: string = '1h',
    limit: number = 100
  ): Promise<CandleData[]> {
    try {
      // Use our API route to avoid CORS issues
      const response = await axios.get('/api/market', {
        params: {
          symbol,
          action: 'candles',
          interval,
          limit,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching candle data:', error);
      throw new Error('Failed to fetch candle data');
    }
  }

  // Get order book depth
  async getOrderBook(symbol: string, limit: number = 20): Promise<OrderBookData> {
    try {
      // Use our API route to avoid CORS issues
      const response = await axios.get('/api/market', {
        params: {
          symbol,
          action: 'orderbook',
          limit,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching order book:', error);
      throw new Error('Failed to fetch order book');
    }
  }

  // Get funding rate for a futures symbol
  async getFundingRate(symbol: string): Promise<FundingRateData | null> {
    try {
      const response = await axios.get('/api/market', {
        params: { symbol, action: 'funding' },
      });
      const data = response.data;
      if (!data) return null;
      return {
        symbol,
        fundingRate: parseFloat(data.fundingRate),
        fundingTime: data.fundingTime,
        markPrice: parseFloat(data.markPrice),
      };
    } catch (error) {
      console.error('Error fetching funding rate:', error);
      return null;
    }
  }

  // Calculate technical indicators for signal generation
  // Uses the shared TechnicalIndicators class for consistent, correct calculations
  calculateTechnicalIndicators(candles: CandleData[]): {
    sma20: number;
    sma50: number;
    rsi: number;
    macd: { value: number; signal: number; histogram: number };
  } {
    const closePrices = candles.map(c => c.close);

    // Use proper EMA calculations from TechnicalIndicators
    const ema20arr = TechnicalIndicators.calculateEMA(closePrices, 20);
    const ema50arr = TechnicalIndicators.calculateEMA(closePrices, 50);
    const sma20 = ema20arr.length > 0 ? ema20arr[ema20arr.length - 1] : closePrices[closePrices.length - 1];
    const sma50 = ema50arr.length > 0 ? ema50arr[ema50arr.length - 1] : closePrices[closePrices.length - 1];

    const rsi = TechnicalIndicators.calculateRSI(closePrices);
    const macdResult = TechnicalIndicators.calculateMACD(closePrices);

    return {
      sma20,
      sma50,
      rsi,
      macd: { value: macdResult.macd, signal: macdResult.signal, histogram: macdResult.histogram },
    };
  }

  // Generate basic trading signal (enhanced with AI when available)
  async generateSignal(symbol: string): Promise<TradeSignal> {
    try {
      // Get current price and historical data
      const [currentPrice, candles] = await Promise.all([
        this.getCurrentPrice(symbol),
        this.getCandleData(symbol, '1h', 100),
      ]);

      // Try to use AI signal generation if available
      try {
        // Only attempt AI in browser environment
        if (typeof window !== 'undefined') {
          // Dynamic import to avoid issues if AI service is not ready
          const { aiSignalsService } = await import('./ai-signals.service');
          return await aiSignalsService.generateAISignal(symbol, candles);
        }
      } catch (aiError) {
        console.warn('AI signal generation not available, falling back to basic signals:', aiError);
      }

      // Fallback to basic signal logic
      const indicators = this.calculateTechnicalIndicators(candles);

      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let confidence = 50;
      let reasoning = '';

      // RSI-based signals
      if (indicators.rsi < 30) {
        action = 'BUY';
        confidence = 70;
        reasoning = 'RSI indicates oversold conditions';
      } else if (indicators.rsi > 70) {
        action = 'SELL';
        confidence = 70;
        reasoning = 'RSI indicates overbought conditions';
      }

      // Moving average crossover
      if (indicators.sma20 > indicators.sma50 && action === 'HOLD') {
        action = 'BUY';
        confidence = 60;
        reasoning = 'Bullish moving average crossover';
      } else if (indicators.sma20 < indicators.sma50 && action === 'HOLD') {
        action = 'SELL';
        confidence = 60;
        reasoning = 'Bearish moving average crossover';
      }

      // MACD signal
      if (indicators.macd.histogram > 0 && action === 'BUY') {
        confidence += 10;
        reasoning += '. MACD confirms bullish momentum';
      } else if (indicators.macd.histogram < 0 && action === 'SELL') {
        confidence += 10;
        reasoning += '. MACD confirms bearish momentum';
      }

      // Calculate target and stop loss
      const targetMultiplier = action === 'BUY' ? 1.05 : 0.95;
      const stopLossMultiplier = action === 'BUY' ? 0.98 : 1.02;

      return {
        symbol,
        action,
        confidence: Math.min(confidence, 90), // Cap at 90% for basic signals
        price: currentPrice.price,
        targetPrice: currentPrice.price * targetMultiplier,
        stopLoss: currentPrice.price * stopLossMultiplier,
        reasoning,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error generating signal:', error);
      throw new Error('Failed to generate trading signal');
    }
  }

  // Format price for display
  formatPrice(price: number, decimals: number = 2): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(price);
  }

  // Format large numbers
  formatLargeNumber(num: number): string {
    if (num >= 1e9) {
      return `${(num / 1e9).toFixed(2)}B`;
    } else if (num >= 1e6) {
      return `${(num / 1e6).toFixed(2)}M`;
    } else if (num >= 1e3) {
      return `${(num / 1e3).toFixed(2)}K`;
    }
    return num.toFixed(2);
  }

  // Get market data (alias for getCurrentPrice)
  async getMarketData(symbol: string): Promise<MarketPrice> {
    return this.getCurrentPrice(symbol);
  }
}

export const marketService = new MarketService();