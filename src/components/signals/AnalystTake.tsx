'use client';

import { AnalystTake as Take, HorizonRead } from '@/services/ai-analyst.service';
import { FaRobot, FaArrowUp, FaArrowDown, FaMinus } from 'react-icons/fa';

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

function biasIcon(b: string) {
  if (b === 'bullish') return <FaArrowUp className="text-green-400" />;
  if (b === 'bearish') return <FaArrowDown className="text-red-400" />;
  return <FaMinus className="text-yellow-400" />;
}

function HorizonCard({ title, read }: { title: string; read: HorizonRead }) {
  return (
    <div className="bg-surface border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-text-secondary">{read.horizon}</p>
        </div>
        <div className="text-right">
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${verdictTone(read.verdict)}`}>{read.verdict}</span>
          <p className={`text-xs mt-1 ${convictionTone(read.conviction)}`}>{read.conviction} conviction</p>
        </div>
      </div>

      <p className="text-sm text-text-secondary leading-relaxed mb-3">{read.thesis}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-xs text-green-400 mb-1">Drivers</p>
          {read.keyDrivers.length ? (
            <ul className="space-y-0.5">{read.keyDrivers.map((d, i) => <li key={i} className="text-xs text-text-secondary">• {d}</li>)}</ul>
          ) : <p className="text-xs text-text-secondary">—</p>}
        </div>
        <div>
          <p className="text-xs text-red-400 mb-1">Risks</p>
          {read.risks.length ? (
            <ul className="space-y-0.5">{read.risks.map((d, i) => <li key={i} className="text-xs text-text-secondary">• {d}</li>)}</ul>
          ) : <p className="text-xs text-text-secondary">—</p>}
        </div>
      </div>

      <div className="text-xs text-text-secondary space-y-0.5 pt-2 border-t border-gray-800">
        {read.entryZone && <p><span className="text-white">Entry:</span> {read.entryZone}</p>}
        {read.target && <p><span className="text-white">Target:</span> {read.target}</p>}
        {read.stop && <p><span className="text-white">Stop:</span> {read.stop}</p>}
        {read.keyLevels && <p><span className="text-white">Key levels:</span> {read.keyLevels}</p>}
        <p><span className="text-white">Invalidation:</span> {read.invalidation}</p>
      </div>
    </div>
  );
}

export default function AnalystTake({ take, loading }: { take: Take | null; loading: boolean }) {
  return (
    <div className="card p-6 border border-primary/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center">
          <FaRobot className="mr-2 text-primary" /> AI Analyst
        </h3>
        <span className="px-2 py-0.5 rounded text-xs font-medium text-primary bg-primary/10">Claude · multi-timeframe + live news</span>
      </div>

      {loading && (
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-700 rounded w-1/3" />
          <div className="h-24 bg-gray-700 rounded" />
        </div>
      )}

      {!loading && !take && (
        <p className="text-sm text-text-secondary">
          AI analyst unavailable right now — the quantitative analysis below still applies.
        </p>
      )}

      {!loading && take && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-text-secondary">Overall bias:</span>
            <span className="flex items-center space-x-1 font-semibold text-white">
              {biasIcon(take.overallBias)}<span className="capitalize">{take.overallBias}</span>
            </span>
          </div>

          {take.newsSummary && (
            <div>
              <p className="text-xs text-text-secondary mb-1">What&apos;s going on (live)</p>
              <p className="text-sm text-text-secondary leading-relaxed">{take.newsSummary}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <HorizonCard title="Short term" read={take.shortTerm} />
            <HorizonCard title="Long term" read={take.longTerm} />
          </div>

          <p className="text-xs text-text-secondary pt-2 border-t border-gray-800">
            AI-generated analysis across timeframes + live news — not financial advice. Even good calls are right ~50–55% of the time; manage risk.
          </p>
        </div>
      )}
    </div>
  );
}
