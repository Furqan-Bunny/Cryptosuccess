'use client';

import { AnalystTake as Take } from '@/services/ai-analyst.service';
import { FaRobot, FaArrowUp, FaArrowDown, FaCheck, FaTimes } from 'react-icons/fa';

function verdictTone(v: string): string {
  if (v === 'BUY') return 'text-green-400 bg-green-900/20 border-green-800';
  if (v === 'SELL') return 'text-red-400 bg-red-900/20 border-red-800';
  return 'text-yellow-400 bg-yellow-900/20 border-yellow-800';
}

function convictionTone(c: string): string {
  if (c === 'high') return 'text-green-400';
  if (c === 'medium') return 'text-yellow-400';
  return 'text-text-secondary';
}

export default function AnalystTake({
  take,
  loading,
  quantAction,
}: {
  take: Take | null;
  loading: boolean;
  quantAction: string;
}) {
  return (
    <div className="card p-6 border border-primary/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center">
          <FaRobot className="mr-2 text-primary" /> AI Analyst
        </h3>
        <span className="px-2 py-0.5 rounded text-xs font-medium text-primary bg-primary/10">Claude</span>
      </div>

      {loading && (
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-700 rounded w-1/3" />
          <div className="h-12 bg-gray-700 rounded" />
        </div>
      )}

      {!loading && !take && (
        <p className="text-sm text-text-secondary">
          AI analyst unavailable right now — the quantitative analysis below still applies.
        </p>
      )}

      {!loading && take && (
        <div className="space-y-4">
          <div className="flex items-center flex-wrap gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${verdictTone(take.verdict)}`}>
              {take.verdict}
            </span>
            <span className="text-sm">
              Conviction: <span className={`font-medium ${convictionTone(take.conviction)}`}>{take.conviction}</span>
            </span>
            <span className="text-xs flex items-center text-text-secondary">
              {take.agreesWithQuant
                ? <><FaCheck className="text-green-400 mr-1" /> agrees with the {quantAction} signal</>
                : <><FaTimes className="text-red-400 mr-1" /> differs from the {quantAction} signal</>}
            </span>
          </div>

          <p className="text-sm text-text-secondary leading-relaxed">{take.thesis}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-green-400 mb-1 flex items-center"><FaArrowUp className="mr-2" /> For</p>
              {take.bullish.length > 0 ? (
                <ul className="space-y-1">
                  {take.bullish.map((b, i) => (
                    <li key={i} className="text-sm text-text-secondary flex"><span className="text-green-400 mr-2">•</span><span>{b}</span></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-text-secondary">—</p>}
            </div>
            <div>
              <p className="text-sm font-medium text-red-400 mb-1 flex items-center"><FaArrowDown className="mr-2" /> Against</p>
              {take.bearish.length > 0 ? (
                <ul className="space-y-1">
                  {take.bearish.map((b, i) => (
                    <li key={i} className="text-sm text-text-secondary flex"><span className="text-red-400 mr-2">•</span><span>{b}</span></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-text-secondary">—</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-800">
            <div>
              <p className="text-xs text-text-secondary mb-1">Risk</p>
              <p className="text-sm text-white">{take.risk}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">Invalidation</p>
              <p className="text-sm text-white">{take.invalidation}</p>
            </div>
          </div>

          <p className="text-xs text-text-secondary pt-2">
            AI-generated analysis, not financial advice. Even good calls are right ~50–55% of the time — manage risk.
          </p>
        </div>
      )}
    </div>
  );
}
