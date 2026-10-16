'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import SimDisclaimer from '@/components/shared/SimDisclaimer';
import { supabase } from '@/lib/supabase/client';
import { isSupportedCoin } from '@/lib/coins';
import { marketService } from '@/services/market.service';
import { parseDate } from '@/lib/dates';
import { FaCompass, FaExclamationTriangle } from 'react-icons/fa';

interface Listing {
  id: string;
  symbol: string;
  pair: string;
  quoteVolume: number;
  detectedAt?: string;
}

export default function DiscoverPage() {
  return (
    <ProtectedRoute requirePro>
      <DiscoverPageInner />
    </ProtectedRoute>
  );
}

function DiscoverPageInner() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('new_listings')
          .select('*')
          .order('detected_at', { ascending: false })
          .limit(50);
        if (error) throw new Error(error.message);
        setListings(
          (data ?? []).map(r => ({
            id: r.id,
            symbol: r.symbol,
            pair: r.pair,
            quoteVolume: Number(r.quote_volume),
            detectedAt: r.detected_at,
          }))
        );
      } catch (e) {
        console.error('Error loading new listings:', e);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <div className="bg-surface border-b border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
            <FaCompass className="text-primary" /> Discover New Listings
          </h1>
          <p className="text-text-secondary">Recently-detected new USDT trading pairs on Binance.</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start space-x-2 rounded-lg border border-red-700/40 bg-red-900/10 p-3 text-xs text-red-300/90">
          <FaExclamationTriangle className="mt-0.5 flex-shrink-0" />
          <p>
            <span className="font-semibold">High risk.</span> Newly-listed coins are unvetted, often
            thinly traded and highly volatile, and are a common venue for scams and rug pulls. We do
            not generate signals for them. Research thoroughly — this is not a recommendation.
          </p>
        </div>

        <SimDisclaimer />

        {loading ? (
          <p className="text-text-secondary">Loading…</p>
        ) : loadError ? (
          <div className="card p-12 text-center">
            <p className="text-text-secondary">Couldn&apos;t load new listings right now. Please refresh to try again.</p>
          </div>
        ) : listings.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-text-secondary">
              No new listings detected yet. The scanner runs daily and will surface fresh pairs here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map(l => {
              const date = parseDate(l.detectedAt);
              const supported = isSupportedCoin(l.symbol);
              return (
                <div key={l.id} className="card p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-white font-semibold text-lg">{l.symbol}</p>
                      <p className="text-xs text-text-secondary">{l.pair}</p>
                    </div>
                    <span className="px-2 py-1 text-[10px] rounded-full bg-red-900/30 text-red-400 font-semibold">
                      NEW · HIGH RISK
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary">
                    24h volume: {marketService.formatLargeNumber(l.quoteVolume)} USDT
                  </p>
                  {date && <p className="text-xs text-text-secondary mt-1">Detected {date.toLocaleDateString()}</p>}
                  {supported && (
                    <Link href={`/market/${l.symbol}`} className="inline-block mt-3 text-sm text-primary hover:underline">
                      View chart →
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
