import { FaInfoCircle } from 'react-icons/fa';

interface SimDisclaimerProps {
  /** Extra sentence specific to the feature (e.g. liquidation risk). */
  extra?: string;
  className?: string;
}

/**
 * Shared honesty banner for every simulated trading surface. Keeps the
 * "paper trading / not financial advice" message consistent across the app.
 */
export default function SimDisclaimer({ extra, className = '' }: SimDisclaimerProps) {
  return (
    <div
      className={`flex items-start space-x-2 rounded-lg border border-yellow-700/40 bg-yellow-900/10 p-3 text-xs text-yellow-300/90 ${className}`}
    >
      <FaInfoCircle className="mt-0.5 flex-shrink-0" />
      <p>
        <span className="font-semibold">Simulated / paper trading.</span> No real money, no real
        orders, and no funds are held. Prices are real but all positions are virtual. This is
        educational and <span className="font-semibold">not financial advice</span>.
        {extra ? ` ${extra}` : ''}
      </p>
    </div>
  );
}
