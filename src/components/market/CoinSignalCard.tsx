'use client';

import { TradeSignal, marketService } from '@/services/market.service';
import { FaSignal, FaExclamationTriangle, FaFlask } from 'react-icons/fa';

function actionTone(action: string): string {
  if (action === 'BUY') return 'text-green-400 bg-green-900/20';
  if (action === 'SELL') return 'text-red-400 bg-red-900/20';
  return 'text-yellow-400 bg-yellow-900/20';
}

function confidenceBar(confidence: number): string {
  if (confidence >= 80) return 'bg-green-500';
  if (confidence >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function CoinSignalCard({
  signal,
  loading,
  experimental,
  onGenerate,
}: {
  signal: TradeSignal | null;
  loading: boolean;
  experimental: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center">
          <FaSignal className="mr-2 text-primary" />
          AI Signal
        </h3>
        <div className="flex items-center space-x-2">
          {signal && (
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${signal.engine === 'ai' ? 'text-primary bg-primary/10' : 'text-text-secondary bg-gray-800'}`}>
              {signal.engine === 'ai' ? 'AI' : 'Technical'}
            </span>
          )}
          {experimental && signal?.engine === 'ai' && (
            <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-medium text-orange-400 bg-orange-900/20">
              <FaFlask className="text-[10px]" />
              <span>Experimental</span>
            </span>
          )}
        </div>
      </div>

      {!signal && (
        <div className="text-center py-6">
          <p className="text-text-secondary mb-4 text-sm">
            Generate an AI-powered read on this coin&apos;s next move.
          </p>
          <button onClick={onGenerate} disabled={loading} className="btn-primary px-6 py-2 text-sm">
            {loading ? 'Analyzing…' : 'Generate Signal'}
          </button>
        </div>
      )}

      {signal && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${actionTone(signal.action)}`}>
              {signal.action}
            </span>
            <button onClick={onGenerate} disabled={loading} className="text-xs text-primary hover:text-primary-light">
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-text-secondary">Confidence</span>
              <span className="text-xs text-white font-medium">{signal.confidence}%</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div className={`h-2 rounded-full ${confidenceBar(signal.confidence)}`} style={{ width: `${signal.confidence}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-text-secondary">Entry</p>
              <p className="text-sm font-semibold text-white">{marketService.formatPrice(signal.price)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Target</p>
              <p className="text-sm font-semibold text-green-400">{marketService.formatPrice(signal.targetPrice)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Stop</p>
              <p className="text-sm font-semibold text-red-400">{marketService.formatPrice(signal.stopLoss)}</p>
            </div>
          </div>

          <p className="text-xs text-text-secondary leading-relaxed">{signal.reasoning}</p>

          <div className="pt-3 border-t border-gray-800">
            <p className="text-xs text-text-secondary flex items-start">
              <FaExclamationTriangle className="mr-2 mt-0.5 text-yellow-500 flex-shrink-0" />
              Not financial advice. Always do your own research and manage risk.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
