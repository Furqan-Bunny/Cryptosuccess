'use client';

import { getBinanceSymbol } from '@/lib/coins';

export interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
}

export type PriceUpdateCallback = (update: PriceUpdate) => void;

// Live prices from Binance's public combined-stream socket (24h mini ticker,
// ~1 update/s per symbol). Symbols are mapped through the coin catalogue
// (src/lib/coins.ts), so every catalogue coin streams.
//
// Binance closes a connection that sends more than 5 control messages per
// second, so subscription changes are coalesced: `subscribe`/`unsubscribe`
// only edit the wanted set, and a debounced reconcile sends at most one
// SUBSCRIBE and one UNSUBSCRIBE frame for the whole diff.
class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private callbacks: Map<string, Set<PriceUpdateCallback>> = new Map();
  // Streams the CURRENT socket is actually subscribed to (reset per connection).
  private liveSymbols: Set<string> = new Set();
  private reconnectAttempts = 0;
  private requestId = 1;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 5000; // 5 seconds
  private readonly syncDelay = 250; // coalesce subscription changes (<= 4 frames/s)

  // Binance WebSocket URL
  private readonly wsUrl = 'wss://stream.binance.com:9443/ws';

  private connect() {
    if (typeof window === 'undefined' || this.ws) return;
    try {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      this.liveSymbols.clear();

      ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.reconcile();
      };

      ws.onmessage = (event) => {
        try {
          this.handleMessage(JSON.parse(event.data));
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.liveSymbols.clear();
        // Only reconnect while someone is still listening.
        if (this.callbacks.size > 0) this.attemptReconnect();
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      this.ws = null;
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
  }

  private handleMessage(data: any) {
    if (data && data.e === '24hrMiniTicker' && typeof data.s === 'string') {
      const symbol = this.fromBinanceSymbol(data.s);
      this.notifyCallbacks(symbol, {
        symbol,
        price: parseFloat(data.c), // close (last) price
        timestamp: Number(data.E) || Date.now(), // event time
      });
    }
  }

  // BTCUSDT -> BTC (inverse of getBinanceSymbol)
  private fromBinanceSymbol(binanceSymbol: string): string {
    return binanceSymbol.endsWith('USDT') ? binanceSymbol.slice(0, -4) : binanceSymbol;
  }

  private streamName(symbol: string): string {
    return `${getBinanceSymbol(symbol).toLowerCase()}@miniTicker`;
  }

  private notifyCallbacks(symbol: string, update: PriceUpdate) {
    const callbacks = this.callbacks.get(symbol);
    if (!callbacks) return;
    callbacks.forEach(callback => {
      try {
        callback(update);
      } catch (error) {
        console.error('Error in price update callback:', error);
      }
    });
  }

  private scheduleSync() {
    if (this.syncTimer) return;
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.reconcile();
    }, this.syncDelay);
  }

  // Bring the socket's subscriptions in line with the wanted set.
  private reconcile() {
    if (this.callbacks.size === 0) {
      // Nobody listening: drop the connection entirely.
      if (this.ws) {
        const ws = this.ws;
        this.ws = null;
        this.liveSymbols.clear();
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
      return;
    }

    if (!this.ws) {
      this.connect();
      return; // onopen reconciles
    }
    if (this.ws.readyState !== WebSocket.OPEN) return; // onopen reconciles

    const wanted = Array.from(this.callbacks.keys());
    const toAdd = wanted.filter(s => !this.liveSymbols.has(s));
    const toRemove = Array.from(this.liveSymbols).filter(s => !this.callbacks.has(s));

    if (toAdd.length > 0) {
      this.send('SUBSCRIBE', toAdd.map(s => this.streamName(s)));
      toAdd.forEach(s => this.liveSymbols.add(s));
    }
    if (toRemove.length > 0) {
      this.send('UNSUBSCRIBE', toRemove.map(s => this.streamName(s)));
      toRemove.forEach(s => this.liveSymbols.delete(s));
    }
  }

  private send(method: 'SUBSCRIBE' | 'UNSUBSCRIBE', params: string[]) {
    try {
      this.ws?.send(JSON.stringify({ method, params, id: this.requestId++ }));
    } catch (error) {
      console.error(`WebSocket ${method} failed:`, error);
    }
  }

  // Subscribe to price updates for a symbol. Returns an unsubscribe function.
  subscribe(symbol: string, callback: PriceUpdateCallback): () => void {
    const key = symbol.toUpperCase();
    if (!this.callbacks.has(key)) {
      this.callbacks.set(key, new Set());
    }
    this.callbacks.get(key)!.add(callback);
    // A fresh subscriber gets a fresh set of reconnect attempts.
    if (!this.ws && !this.reconnectTimer) this.reconnectAttempts = 0;
    this.scheduleSync();

    return () => {
      const callbacks = this.callbacks.get(key);
      if (!callbacks) return;
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.callbacks.delete(key);
        this.scheduleSync();
      }
    };
  }

  // Disconnect WebSocket
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    this.callbacks.clear();
    this.liveSymbols.clear();

    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.close();
    }
  }

  // Get connection status
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Create singleton instance (connects lazily on the first subscription)
export const websocketService = new WebSocketService();
