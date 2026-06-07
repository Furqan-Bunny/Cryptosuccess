'use client';

import Link from 'next/link';
import { FaFlask, FaChartLine, FaSyncAlt } from 'react-icons/fa';
import { SignalReportData } from '@/services/signal-report.service';
import { getCoinIcon, getCoinName } from '@/lib/coins';

import SignalNarrative from './SignalNarrative';
import MtfConfirmation from './MtfConfirmation';
import KeyLevelsPanel from './KeyLevelsPanel';
import RiskManagementPanel from './RiskManagementPanel';
import AnalystTake from './AnalystTake';
import OutlookSummary from '@/components/market/OutlookSummary';
import IndicatorPanel from '@/components/market/IndicatorPanel';
import MarketRegimeBadge from '@/components/market/MarketRegimeBadge';
import type { AnalystTake as AnalystTakeData } from '@/services/ai-analyst.service';

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

export default function SignalReport({
  report,
  loading,
  onRegenerate,
  analyst,
  analystLoading,
}: {
  report: SignalReportData;
  loading: boolean;
  onRegenerate: () => void;
  analyst?: AnalystTakeData | null;
  analystLoading?: boolean;
}) {
  const { signal } = report;
  const showAnalyst = analystLoading || analyst !== undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-3">
            <span className="text-3xl">{getCoinIcon(signal.symbol)}</span>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-white">{signal.symbol}</h2>
                <span className={`px-3 py-0.5 rounded-full text-sm font-semibold ${actionTone(signal.action)}`}>
                  {signal.action}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${signal.engine === 'ai' ? 'text-primary bg-primary/10' : 'text-text-secondary bg-gray-800'}`}>
                  {signal.engine === 'ai' ? 'AI' : 'Technical'}
                </span>
                {report.experimental && signal.engine === 'ai' && (
                  <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-medium text-orange-400 bg-orange-900/20">
                    <FaFlask className="text-[10px]" />
                    <span>Experimental</span>
                  </span>
                )}
              </div>
              <p className="text-text-secondary text-sm">{getCoinName(signal.symbol)}</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href={`/market/${signal.symbol}`}
              className="btn-secondary px-3 py-2 text-sm flex items-center space-x-2"
            >
              <FaChartLine />
              <span>View full chart</span>
            </Link>
            <button
              onClick={onRegenerate}
              disabled={loading}
              className="text-text-secondary hover:text-white p-2"
              title="Regenerate"
            >
              <FaSyncAlt className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Confidence */}
        <div className="mt-4 max-w-md">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-secondary">Confidence</span>
            <span className="text-xs text-white font-medium">{signal.confidence}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div className={`h-2 rounded-full ${confidenceBar(signal.confidence)}`} style={{ width: `${signal.confidence}%` }} />
          </div>
        </div>
      </div>

      {/* AI analyst (Claude) — headline read */}
      {showAnalyst && (
        <AnalystTake take={analyst ?? null} loading={!!analystLoading} />
      )}

      {/* Multi-timeframe confirmation */}
      <MtfConfirmation mtf={report.mtf} horizonLabel={report.horizonLabel} />

      {/* Narrative */}
      <SignalNarrative narrative={report.narrative} />

      {/* Detail grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <KeyLevelsPanel
          signal={signal}
          levels={report.levels}
          riskReward={report.riskReward}
          potentialGainPct={report.potentialGainPct}
          potentialLossPct={report.potentialLossPct}
        />
        <RiskManagementPanel profile={report.profile} signal={signal} potentialLossPct={report.potentialLossPct} />
        <OutlookSummary
          action={signal.action}
          indicators={report.indicators}
          regime={report.regime}
          sentimentValue={report.sentimentValue}
        />
        <IndicatorPanel indicators={report.indicators} currentPrice={signal.price} />
        <MarketRegimeBadge regime={report.regime} />
      </div>
    </div>
  );
}
