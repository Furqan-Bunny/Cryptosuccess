'use client';

import { Indicators } from './IndicatorPanel';
import { RegimeAnalysis } from '@/services/ai/market-regime.service';
import { FaArrowUp, FaArrowDown, FaMinus } from 'react-icons/fa';

type Dir = 'bullish' | 'bearish' | 'neutral';

interface Factor {
  label: string;
  dir: Dir;
  detail: string;
}

function dirIcon(dir: Dir) {
  if (dir === 'bullish') return <FaArrowUp className="text-green-400" />;
  if (dir === 'bearish') return <FaArrowDown className="text-red-400" />;
  return <FaMinus className="text-yellow-400" />;
}

export default function OutlookSummary({
  action,
  indicators,
  regime,
  sentimentValue,
}: {
  action: 'BUY' | 'SELL' | 'HOLD' | null;
  indicators: Indicators;
  regime: RegimeAnalysis;
  sentimentValue: number | null;
}) {
  const factors: Factor[] = [];

  if (action) {
    factors.push({
      label: 'AI signal',
      dir: action === 'BUY' ? 'bullish' : action === 'SELL' ? 'bearish' : 'neutral',
      detail: `Model leans ${action}`,
    });
  }

  factors.push({
    label: 'Trend (EMA50/200)',
    dir: indicators.ema50 > indicators.ema200 ? 'bullish' : 'bearish',
    detail: indicators.ema50 > indicators.ema200 ? 'Price structure is rising' : 'Price structure is falling',
  });

  factors.push({
    label: 'Momentum (MACD)',
    dir: indicators.macd.histogram > 0 ? 'bullish' : indicators.macd.histogram < 0 ? 'bearish' : 'neutral',
    detail: indicators.macd.histogram > 0 ? 'Positive histogram' : 'Negative histogram',
  });

  factors.push({
    label: 'RSI',
    dir: indicators.rsi <= 30 ? 'bullish' : indicators.rsi >= 70 ? 'bearish' : 'neutral',
    detail: `RSI ${indicators.rsi.toFixed(0)}`,
  });

  factors.push({
    label: 'Regime',
    dir: regime.regime === 'trending_up' ? 'bullish' : regime.regime === 'trending_down' ? 'bearish' : 'neutral',
    detail: regime.description,
  });

  if (sentimentValue !== null) {
    factors.push({
      label: 'Market sentiment',
      dir: sentimentValue > 55 ? 'bullish' : sentimentValue < 45 ? 'bearish' : 'neutral',
      detail: `Fear & Greed ${sentimentValue}`,
    });
  }

  const score = factors.reduce((s, f) => s + (f.dir === 'bullish' ? 1 : f.dir === 'bearish' ? -1 : 0), 0);
  const verdict: Dir = score >= 2 ? 'bullish' : score <= -2 ? 'bearish' : 'neutral';
  const verdictLabel = verdict === 'bullish' ? 'Bullish' : verdict === 'bearish' ? 'Bearish' : 'Neutral';
  const verdictTone =
    verdict === 'bullish'
      ? 'text-green-400 bg-green-900/20 border-green-800'
      : verdict === 'bearish'
      ? 'text-red-400 bg-red-900/20 border-red-800'
      : 'text-yellow-400 bg-yellow-900/20 border-yellow-800';

  const bullish = factors.filter(f => f.dir === 'bullish').length;
  const bearish = factors.filter(f => f.dir === 'bearish').length;

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Outlook</h3>

      <div className={`flex items-center justify-between px-4 py-3 rounded-lg border mb-4 ${verdictTone}`}>
        <div className="flex items-center space-x-2">
          {dirIcon(verdict)}
          <span className="font-semibold text-lg">{verdictLabel}</span>
        </div>
        <span className="text-xs opacity-80">{bullish} bullish · {bearish} bearish</span>
      </div>

      <div className="space-y-2">
        {factors.map((f, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <span className="w-4 text-center">{dirIcon(f.dir)}</span>
              <span className="text-white">{f.label}</span>
            </div>
            <span className="text-text-secondary text-xs truncate max-w-[55%] text-right">{f.detail}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-text-secondary mt-4 pt-3 border-t border-gray-800">
        A simple confluence of signals — not financial advice.
      </p>
    </div>
  );
}
