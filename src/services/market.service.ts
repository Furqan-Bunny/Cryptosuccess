import axios from 'axios';
import CryptoJS from 'crypto-js';

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
  private readonly binanceApiKey = process.env.BINANCE_API_KEY || '';
  private readonly binanceSecretKey = process.env.BINANCE_SECRET_KEY || '';

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

  constructor() {
    // Validate API keys on initialization
    if (!this.binanceApiKey || !this.binanceSecretKey) {
      console.warn('Binance API keys not configured. Some features may be limited.');
    }
  }

  // Generate signature for Binance API requests
  private generateSignature(queryString: string): string {
    return CryptoJS.HmacSHA256(queryString, this.binanceSecretKey).toString();
  }

  // Get headers for authenticated Binance requests
  private getAuthHeaders(): { [key: string]: string } {
    return {
      'X-MBX-APIKEY': this.binanceApiKey,
    };
  }

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

  // Get account balance (requires authentication)
  async getAccountBalance(): Promise<any> {
    try {
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = this.generateSignature(queryString);

      const response = await axios.get(`${this.binanceApiUrl}/account`, {
        params: {
          timestamp,
          signature,
        },
        headers: this.getAuthHeaders(),
      });

      return response.data.balances.filter((balance: any) =>
        parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0
      );
    } catch (error) {
      console.error('Error fetching account balance:', error);
      throw new Error('Failed to fetch account balance');
    }
  }

  // Calculate technical indicators for signal generation
  calculateTechnicalIndicators(candles: CandleData[]): {
    sma20: number;
    sma50: number;
    rsi: number;
    macd: { value: number; signal: number; histogram: number };
  } {
    // Simple Moving Averages
    const closePrices = candles.map(c => c.close);
    const sma20 = this.calculateSMA(closePrices.slice(-20));
    const sma50 = this.calculateSMA(closePrices.slice(-50));

    // RSI
    const rsi = this.calculateRSI(closePrices.slice(-14));

    // MACD
    const macd = this.calculateMACD(closePrices);

    return { sma20, sma50, rsi, macd };
  }

  private calculateSMA(prices: number[]): number {
    return prices.reduce((sum, price) => sum + price, 0) / prices.length;
  }

  private calculateRSI(prices: number[]): number {
    let gains = 0;
    let losses = 0;

    for (let i = 1; i < prices.length; i++) {
      const difference = prices[i] - prices[i - 1];
      if (difference > 0) {
        gains += difference;
      } else {
        losses += Math.abs(difference);
      }
    }

    const avgGain = gains / prices.length;
    const avgLoss = losses / prices.length;
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  private calculateMACD(prices: number[]): { value: number; signal: number; histogram: number } {
    // Simplified MACD calculation
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macdValue = ema12 - ema26;
    const signal = this.calculateEMA([macdValue], 9);
    const histogram = macdValue - signal;

    return { value: macdValue, signal, histogram };
  }

  private calculateEMA(prices: number[], period: number): number {
    const k = 2 / (period + 1);
    let ema = prices[0];

    for (let i = 1; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }

    return ema;
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
        // Dynamic import to avoid issues if AI service is not ready
        const { aiSignalsService } = await import('./ai-signals.service');
        return await aiSignalsService.generateAISignal(symbol, candles);
      } catch (aiError) {
        console.warn('AI signal generation not available, falling back to basic signals');
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