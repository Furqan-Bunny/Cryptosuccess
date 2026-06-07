// Timestamps come back from Postgres as ISO strings (or Date in memory).
type Timestampish = string | Date;

// Order types supported by the paper-trading engine.
// 'market' / 'limit' / 'stop-loss' are the originals; 'take-profit' and
// 'trailing-stop' are added for the automatic-execution engine.
export type OrderType = 'market' | 'limit' | 'stop-loss' | 'take-profit' | 'trailing-stop';
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'expired';

export interface Order {
  id?: string;
  userId: string;
  symbol: string;
  type: OrderType;
  side: OrderSide;
  amount: number;
  price?: number; // For limit orders
  stopPrice?: number; // For stop-loss / take-profit orders
  trailingPercent?: number; // For trailing-stop orders (e.g. 5 = 5%)
  highWaterMark?: number; // For trailing-stop: best price seen since placement
  status: OrderStatus;
  filledAmount?: number;
  filledPrice?: number;
  fee?: number;
  createdAt: Timestampish;
  updatedAt?: Timestampish;
  expiresAt?: Timestampish;
  notes?: string;
}

export interface ExecutionResult {
  success: boolean;
  orderId?: string;
  filledAmount?: number;
  filledPrice?: number;
  totalCost?: number;
  fee?: number;
  message?: string;
  error?: string;
}

export const TRADING_FEE_PERCENTAGE = 0.001; // 0.1% paper trading fee
