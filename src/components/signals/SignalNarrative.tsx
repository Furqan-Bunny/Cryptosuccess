'use client';

import { SignalNarrative as Narrative } from '@/services/signal-report.service';
import { FaArrowUp, FaArrowDown, FaShieldAlt } from 'react-icons/fa';

export default function SignalNarrative({ narrative }: { narrative: Narrative }) {
  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-3">Why this signal</h3>
      <p className="text-sm text-text-secondary mb-5">{narrative.summary}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-sm font-medium text-green-400 mb-2 flex items-center">
            <FaArrowUp className="mr-2" /> Bullish factors
          </p>
          {narrative.bullish.length > 0 ? (
            <ul className="space-y-2">
              {narrative.bullish.map((b, i) => (
                <li key={i} className="text-sm text-text-secondary flex">
                  <span className="text-green-400 mr-2">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-secondary">No clear bullish factors right now.</p>
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-red-400 mb-2 flex items-center">
            <FaArrowDown className="mr-2" /> Risks / bearish factors
          </p>
          {narrative.bearish.length > 0 ? (
            <ul className="space-y-2">
              {narrative.bearish.map((b, i) => (
                <li key={i} className="text-sm text-text-secondary flex">
                  <span className="text-red-400 mr-2">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-secondary">No clear bearish factors right now.</p>
          )}
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-gray-800 flex items-start text-sm text-text-secondary">
        <FaShieldAlt className="mr-2 mt-0.5 text-primary flex-shrink-0" />
        <span>{narrative.riskNote}</span>
      </div>
    </div>
  );
}
