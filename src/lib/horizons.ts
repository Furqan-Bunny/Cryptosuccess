// Trading horizons the user can pick. Each maps to an ENTRY timeframe (where the
// signal is computed), the higher CONFIRM timeframes used for multi-timeframe
// confirmation, the engine to use (rule-based vs the AI model for a timeframe),
// and ATR multiples for stop/target (wider for longer horizons).

export type HorizonId = '15m' | '1h' | '4h' | '1d' | '1mo' | '1y';

export interface Horizon {
  id: HorizonId;
  label: string;
  short: string;
  entryTF: string;        // timeframe the entry signal is computed on
  confirmTFs: string[];   // higher timeframes used for confirmation (low → high)
  engine: 'rule' | 'model';
  modelTF?: string;       // which trained model to use (for engine: 'model')
  limit: number;          // candles to fetch on the entry TF
  atr: { stop: number; target: number };
  biasTF?: string;        // the dominant higher TF for long horizons
  note?: string;          // honesty / context note shown in the UI
}

export const HORIZONS: Horizon[] = [
  {
    id: '15m', label: 'Scalp · 15m', short: '15m',
    entryTF: '15m', confirmTFs: ['1h', '4h'], engine: 'rule',
    limit: 200, atr: { stop: 1.5, target: 2.5 },
    note: 'Very short timeframe — signals are noisy and close to random. Treat as low-confidence.',
  },
  {
    id: '1h', label: 'Intraday · 1h', short: '1h',
    entryTF: '1h', confirmTFs: ['4h', '1d'], engine: 'model', modelTF: '1h',
    limit: 200, atr: { stop: 2, target: 3 },
  },
  {
    id: '4h', label: 'Short swing · 4h', short: '4h',
    entryTF: '4h', confirmTFs: ['1d', '1w'], engine: 'model', modelTF: '4h',
    limit: 200, atr: { stop: 2, target: 3.5 },
  },
  {
    id: '1d', label: 'Swing · 1d', short: '1d',
    entryTF: '1d', confirmTFs: ['1w', '1M'], engine: 'model', modelTF: '1d',
    limit: 320, atr: { stop: 2.5, target: 4 },
  },
  {
    id: '1mo', label: 'Position · ~1 month', short: '1mo',
    entryTF: '1d', confirmTFs: ['1w', '1M'], engine: 'model', modelTF: '1d',
    limit: 320, atr: { stop: 3, target: 6 }, biasTF: '1w',
    note: 'Multi-week hold — the weekly trend drives the read; the daily model times entries.',
  },
  {
    id: '1y', label: 'Long-term · ~1 year', short: '1y',
    entryTF: '1w', confirmTFs: ['1M'], engine: 'model', modelTF: '1d',
    limit: 250, atr: { stop: 4, target: 10 }, biasTF: '1M',
    note: 'Position view — driven by the weekly/monthly trend, not a short-term forecast.',
  },
];

export const DEFAULT_HORIZON: HorizonId = '1h';

const BY_ID: Record<string, Horizon> = HORIZONS.reduce((acc, h) => {
  acc[h.id] = h;
  return acc;
}, {} as Record<string, Horizon>);

export function getHorizon(id: string): Horizon {
  return BY_ID[id] ?? BY_ID[DEFAULT_HORIZON];
}

// Floor for a level below the entry, as a fraction of the entry price. On long
// horizons a volatile coin's ATR can be a large share of its price, so
// "price - k * ATR" can reach zero or below — an impossible level that the
// record route rightly rejects. Capping the distance at 95% keeps every level a
// real, positive price without changing the indicator maths.
export const MIN_LEVEL_FRACTION = 0.05;

/**
 * Stop / target for a horizon signal from ATR multiples, with any level that
 * would sit below the entry kept at or above MIN_LEVEL_FRACTION of the price.
 * BUY / HOLD: stop below, target above. SELL: stop above, target below.
 */
export function horizonLevels(
  action: 'BUY' | 'SELL' | 'HOLD',
  price: number,
  atr: number,
  multiples: { stop: number; target: number }
): { stopLoss: number; targetPrice: number } {
  const floor = price * MIN_LEVEL_FRACTION;
  if (action === 'SELL') {
    return {
      stopLoss: price + multiples.stop * atr,
      targetPrice: Math.max(price - multiples.target * atr, floor),
    };
  }
  return {
    stopLoss: Math.max(price - multiples.stop * atr, floor),
    targetPrice: price + multiples.target * atr,
  };
}
