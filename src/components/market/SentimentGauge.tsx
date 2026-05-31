'use client';

import { useState, useEffect } from 'react';
import { sentimentService, SentimentData } from '@/services/sentiment.service';

function getColor(value: number): string {
  if (value <= 24) return '#FF3B30';
  if (value <= 44) return '#FF8C00';
  if (value <= 55) return '#FFD700';
  if (value <= 74) return '#90EE90';
  return '#00D964';
}

function getLabel(value: number): string {
  if (value <= 24) return 'Extreme Fear';
  if (value <= 44) return 'Fear';
  if (value <= 55) return 'Neutral';
  if (value <= 74) return 'Greed';
  return 'Extreme Greed';
}

export default function SentimentGauge({ className }: { className?: string }) {
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    sentimentService.getFearGreedIndex()
      .then(data => { if (mounted) { setSentiment(data); setLoading(false); } })
      .catch(() => { if (mounted) { setError(true); setLoading(false); } });
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className={`card p-6 ${className || ''}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-700 rounded w-1/2" />
          <div className="h-32 bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  if (error || !sentiment) {
    return (
      <div className={`card p-6 ${className || ''}`}>
        <h3 className="text-lg font-semibold text-white mb-2">Fear & Greed Index</h3>
        <p className="text-text-secondary text-sm">Unable to load sentiment data</p>
      </div>
    );
  }

  const color = getColor(sentiment.value);
  const label = getLabel(sentiment.value);
  const rotation = (sentiment.value / 100) * 180 - 90; // -90 to 90 degrees

  return (
    <div className={`card p-6 ${className || ''}`}>
      <h3 className="text-lg font-semibold text-white mb-4">Fear & Greed Index</h3>

      {/* Gauge */}
      <div className="flex flex-col items-center">
        <div className="relative w-48 h-24 overflow-hidden">
          {/* Background arc */}
          <div className="absolute inset-0 rounded-t-full border-[12px] border-gray-700 border-b-0" />

          {/* Colored arc segments */}
          <svg viewBox="0 0 200 100" className="absolute inset-0 w-full h-full">
            <defs>
              <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#FF3B30" />
                <stop offset="25%" stopColor="#FF8C00" />
                <stop offset="50%" stopColor="#FFD700" />
                <stop offset="75%" stopColor="#90EE90" />
                <stop offset="100%" stopColor="#00D964" />
              </linearGradient>
            </defs>
            <path
              d="M 12 100 A 88 88 0 0 1 188 100"
              fill="none"
              stroke="url(#gaugeGradient)"
              strokeWidth="12"
              strokeLinecap="round"
            />
          </svg>

          {/* Needle */}
          <div
            className="absolute bottom-0 left-1/2 w-1 h-20 bg-white rounded-full origin-bottom transition-transform duration-1000"
            style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
          />
          <div className="absolute bottom-0 left-1/2 w-3 h-3 bg-white rounded-full -translate-x-1/2 translate-y-1/2" />
        </div>

        {/* Value display */}
        <div className="text-center mt-4">
          <span className="text-4xl font-bold" style={{ color }}>{sentiment.value}</span>
          <p className="text-lg font-medium mt-1" style={{ color }}>{label}</p>
          <p className="text-text-secondary text-xs mt-1">
            {sentiment.classification}
          </p>
        </div>

        {/* Scale labels */}
        <div className="flex justify-between w-full mt-4 text-xs text-text-secondary">
          <span>Extreme Fear</span>
          <span>Neutral</span>
          <span>Extreme Greed</span>
        </div>
      </div>
    </div>
  );
}
