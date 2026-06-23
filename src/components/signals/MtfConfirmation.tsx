'use client';

import { FaArrowUp, FaArrowDown, FaCheck, FaTimes, FaLayerGroup } from 'react-icons/fa';
import type { MtfResult } from '@/services/ai/mtf-confirmation';

export default function MtfConfirmation({ mtf, horizonLabel }: { mtf: MtfResult; horizonLabel?: string }) {
  if (!mtf || mtf.breakdown.length === 0) return null;

  const meter =
    mtf.confluencePct >= 66 ? 'bg-green-500' : mtf.confluencePct >= 33 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <FaLayerGroup className="text-primary" /> Multi-timeframe confirmation
        </h3>
        {horizonLabel && <span className="text-xs text-text-secondary">{horizonLabel}</span>}
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-text-secondary">Higher-timeframe confluence</span>
          <span className="text-white">{mtf.confluencePct}%</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2">
          <div className={`h-2 rounded-full ${meter}`} style={{ width: `${mtf.confluencePct}%` }} />
        </div>
      </div>

      <div className="space-y-2">
        {mtf.breakdown.map(b => (
          <div key={b.tf} className="flex items-center justify-between text-sm">
            <span className="text-text-secondary w-10">{b.tf}</span>
            <span className={`flex items-center gap-1 ${b.trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
              {b.trend === 'up' ? <FaArrowUp className="text-xs" /> : <FaArrowDown className="text-xs" />}
              <span className="capitalize">{b.trend}trend</span>
              <span className="text-text-secondary text-xs">· ADX {b.adx.toFixed(0)}</span>
            </span>
            {b.agrees === null ? (
              <span className="text-text-secondary text-xs">—</span>
            ) : b.agrees ? (
              <FaCheck className="text-green-400" title="Confirms the signal" />
            ) : (
              <FaTimes className="text-red-400" title="Conflicts with the signal" />
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-text-secondary mt-3">{mtf.note}</p>
    </div>
  );
}
