'use client';

import { OrderBookData, marketService } from '@/services/market.service';

function rows(levels: Array<[string, string]>, max: number) {
  const parsed = levels.slice(0, max).map(([price, qty]) => ({
    price: parseFloat(price),
    qty: parseFloat(qty),
  }));
  const maxQty = Math.max(...parsed.map(p => p.qty), 0);
  return { parsed, maxQty };
}

export default function OrderBookPanel({ orderBook }: { orderBook: OrderBookData | null }) {
  if (!orderBook) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Order Book</h3>
        <p className="text-text-secondary text-sm">Order book unavailable.</p>
      </div>
    );
  }

  const bids = rows(orderBook.bids, 10);
  const asks = rows(orderBook.asks, 10);

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Order Book</h3>
      <div className="grid grid-cols-2 gap-6">
        {/* Bids */}
        <div>
          <p className="text-xs text-green-400 mb-2 font-medium">Bids</p>
          <div className="space-y-1">
            {bids.parsed.map((b, i) => (
              <div key={i} className="relative flex justify-between text-xs px-1 py-0.5">
                <div
                  className="absolute inset-y-0 right-0 bg-green-900/20 rounded"
                  style={{ width: `${bids.maxQty > 0 ? (b.qty / bids.maxQty) * 100 : 0}%` }}
                />
                <span className="relative text-green-400">{marketService.formatPrice(b.price)}</span>
                <span className="relative text-text-secondary tabular-nums">{b.qty.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Asks */}
        <div>
          <p className="text-xs text-red-400 mb-2 font-medium">Asks</p>
          <div className="space-y-1">
            {asks.parsed.map((a, i) => (
              <div key={i} className="relative flex justify-between text-xs px-1 py-0.5">
                <div
                  className="absolute inset-y-0 left-0 bg-red-900/20 rounded"
                  style={{ width: `${asks.maxQty > 0 ? (a.qty / asks.maxQty) * 100 : 0}%` }}
                />
                <span className="relative text-red-400">{marketService.formatPrice(a.price)}</span>
                <span className="relative text-text-secondary tabular-nums">{a.qty.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
