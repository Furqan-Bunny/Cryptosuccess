export type SignalAction = 'BUY' | 'SELL' | 'HOLD';
export type CoinSymbol = 'ETH' | 'SOL' | 'BNB';

export interface Signal {
  id: string;
  coin: CoinSymbol;
  action: SignalAction;
  confidence: number; // 0-100
  price: number;
  indicators: TechnicalIndicators;
  metadata: SignalMetadata;
  performance?: SignalPerformance;
}

export interface TechnicalIndicators {
  rsi: number;
  macd: {
    value: number;
    signal: number;
    histogram: number;
  };
  ma20: number;
  ma50: number;
  bollingerBands?: {
    upper: number;
    middle: number;
    lower: number;
  };
  volume?: number;
}

export interface SignalMetadata {
  generatedAt: Date;
  expiresAt: Date;
  modelVersion: string;
  timeframe: '1h' | '4h' | '1d';
}

export interface SignalPerformance {
  views: number;
  outcome?: 'success' | 'failure' | 'pending';
  profitPercentage?: number;
  evaluatedAt?: Date;
}

export interface SignalFilters {
  coin?: CoinSymbol;
  action?: SignalAction;
  minConfidence?: number;
  timeframe?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}