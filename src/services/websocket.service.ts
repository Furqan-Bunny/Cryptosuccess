'use client';

import { marketService } from './market.service';

export interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
}

export type PriceUpdateCallback = (update: PriceUpdate) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private subscribedSymbols: Set<string> = new Set();
  private callbacks: Map<string, Set<PriceUpdateCallback>> = new Map();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 5000; // 5 seconds

  // Binance WebSocket URL
  private readonly wsUrl = 'wss://stream.binance.com:9443/ws';

  constructor() {
    // Only initialize in browser environment
    if (typeof window !== 'undefined') {
      this.connect();
    }
  }

  private connect() {
    try {
      // Create WebSocket connection
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;

        // Resubscribe to all symbols
        this.subscribedSymbols.forEach(symbol => {
          this.subscribeToSymbol(symbol);
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.attemptReconnect();
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    this.reconnectInterval = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
  }

  private handleMessage(data: any) {
    // Handle different message types from Binance
    if (data.e === 'aggTrade') {
      // Aggregate trade update
      const symbol = this.extractSymbol(data.s);
      const update: PriceUpdate = {
        symbol,
        price: parseFloat(data.p),
        timestamp: data.T,
      };

      this.notifyCallbacks(symbol, update);
    } else if (data.e === '24hrMiniTicker') {
      // 24hr mini ticker update
      const symbol = this.extractSymbol(data.s);
      const update: PriceUpdate = {
        symbol,
        price: parseFloat(data.c), // Close price
        timestamp: data.E, // Event time
      };

      this.notifyCallbacks(symbol, update);
    }
  }

  private extractSymbol(binanceSymbol: string): string {
    // Convert Binance symbol to our format (e.g., ETHUSDT -> ETH)
    const symbolMap: { [key: string]: string } = {
      'ETHUSDT': 'ETH',
      'SOLUSDT': 'SOL',
      'BNBUSDT': 'BNB',
    };

    return symbolMap[binanceSymbol] || binanceSymbol.replace('USDT', '');
  }

  private notifyCallbacks(symbol: string, update: PriceUpdate) {
    const callbacks = this.callbacks.get(symbol);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(update);
        } catch (error) {
          console.error('Error in price update callback:', error);
        }
      });
    }
  }

  // Subscribe to price updates for a symbol
  subscribe(symbol: string, callback: PriceUpdateCallback): () => void {
    // Add callback to the list
    if (!this.callbacks.has(symbol)) {
      this.callbacks.set(symbol, new Set());
    }
    this.callbacks.get(symbol)!.add(callback);

    // Subscribe to the symbol if not already subscribed
    if (!this.subscribedSymbols.has(symbol)) {
      this.subscribedSymbols.add(symbol);
      this.subscribeToSymbol(symbol);
    }

    // Return unsubscribe function
    return () => {
      const callbacks = this.callbacks.get(symbol);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.callbacks.delete(symbol);
          this.subscribedSymbols.delete(symbol);
          this.unsubscribeFromSymbol(symbol);
        }
      }
    };
  }

  private subscribeToSymbol(symbol: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Convert our symbol to Binance format
    const binanceSymbol = this.toBinanceSymbol(symbol);

    // Subscribe to aggregate trade stream
    const subscribeMessage = {
      method: 'SUBSCRIBE',
      params: [
        `${binanceSymbol.toLowerCase()}@aggTrade`,
        `${binanceSymbol.toLowerCase()}@miniTicker`,
      ],
      id: Date.now(),
    };

    this.ws.send(JSON.stringify(subscribeMessage));
  }

  private unsubscribeFromSymbol(symbol: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const binanceSymbol = this.toBinanceSymbol(symbol);

    const unsubscribeMessage = {
      method: 'UNSUBSCRIBE',
      params: [
        `${binanceSymbol.toLowerCase()}@aggTrade`,
        `${binanceSymbol.toLowerCase()}@miniTicker`,
      ],
      id: Date.now(),
    };

    this.ws.send(JSON.stringify(unsubscribeMessage));
  }

  private toBinanceSymbol(symbol: string): string {
    const symbolMap: { [key: string]: string } = {
      'ETH': 'ETHUSDT',
      'SOL': 'SOLUSDT',
      'BNB': 'BNBUSDT',
    };

    return symbolMap[symbol] || `${symbol}USDT`;
  }

  // Disconnect WebSocket
  disconnect() {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscribedSymbols.clear();
    this.callbacks.clear();
  }

  // Get connection status
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Create singleton instance
export const websocketService = new WebSocketService();