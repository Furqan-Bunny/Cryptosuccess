'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { FaArrowLeft, FaArrowUp, FaArrowDown } from 'react-icons/fa';

import { useCoinData } from '@/hooks/useCoinData';
import { marketService, TradeSignal } from '@/services/market.service';
import { TechnicalIndicators } from '@/services/ai/indicators';
import { detectMarketRegime } from '@/services/ai/market-regime.service';
import { sentimentService } from '@/services/sentiment.service';
import { getCoinMeta, isSupportedCoin, isAiProfiled } from '@/lib/coins';

import IndicatorPanel, { Indicators } from '@/components/market/IndicatorPanel';
import MarketRegimeBadge from '@/components/market/MarketRegimeBadge';
import CoinSignalCard from '@/components/market/CoinSignalCard';
import OrderBookPanel from '@/components/market/OrderBookPanel';
import OutlookSummary from '@/components/market/OutlookSummary';
import SentimentGauge from '@/components/market/SentimentGauge';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import type { ChartType } from '@/components/market/CoinChart';

const CoinChart = nextDynamic(() => import('@/components/market/CoinChart'), {
  ssr: false,
  loading: () => <div className="h-[420px] bg-gray-800/40 rounded-lg animate-pulse" />,
});

const TIMEFRAMES = [
  { label: '1D', interval: '15m', limit: 96 },
  { label: '1W', interval: '1h', limit: 168 },
  { label: '1M', interval: '4h', limit: 180 },
  { label: '3M', interval: '1d', limit: 90 },
  { label: '1Y', interval: '1d', limit: 365 },
  { label: 'Max', interval: '1w', limit: 300 },
];

const CHART_TYPES: { label: string; value: ChartType }[] = [
  { label: 'Candles', value: 'candlestick' },
  { label: 'Line', value: 'line' },
  { label: 'Area', value: 'area' },
];

export default function CoinDetailPage({ params }: { params: { symbol: string } }) {
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  if (!isSupportedCoin(symbol)) {
    notFound();
  }

  const meta = getCoinMeta(symbol);
  const experimental = !isAiProfiled(symbol);

  const [tfIndex, setTfIndex] = useState(2); // default 1M
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const tf = TIMEFRAMES[tfIndex];

  const { price, candles, orderBook, loading, error } = useCoinData(symbol, tf.interval, tf.limit);

  const [signal, setSignal] = useState<TradeSignal | null>(null);
  const [signalLoading, setSignalLoading] = useState(false);
  const [sentimentValue, setSentimentValue] = useState<number | null>(null);

  const indicators = useMemo<Indicators | null>(() => {
    if (candles.length === 0) return null;
    return TechnicalIndicators.prepareIndicators(candles) as Indicators;
  }, [candles]);

  const regime = useMemo(() => (candles.length > 0 ? detectMarketRegime(candles) : null), [candles]);

  const generateSignal = async () => {
    setSignalLoading(true);
    try {
      const s = await marketService.generateSignal(symbol);
      setSignal(s);
    } catch {
      // generateSignal already falls back internally; ignore here
    } finally {
      setSignalLoading(false);
    }
  };

  // Auto-generate a signal and load sentiment once per coin.
  useEffect(() => {
    generateSignal();
    sentimentService
      .getFearGreedIndex()
      .then(s => setSentimentValue(s.value))
      .catch(() => setSentimentValue(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const changePositive = (price?.changePercent24h ?? 0) >= 0;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back link */}
      <Link href="/market" className="inline-flex items-center text-text-secondary hover:text-white mb-6 text-sm">
        <FaArrowLeft className="mr-2" /> Back to Market
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center space-x-3">
          <span className="text-4xl">{meta?.icon ?? '●'}</span>
          <div>
            <h1 className="text-2xl font-bold text-white">{symbol}</h1>
            <p className="text-text-secondary text-sm">{meta?.name ?? symbol}</p>
          </div>
        </div>
        {price && (
          <div className="text-right">
            <p className="text-3xl font-bold text-white">{marketService.formatPrice(price.price)}</p>
            <p className={`text-sm flex items-center justify-end ${changePositive ? 'text-green-400' : 'text-red-400'}`}>
              {changePositive ? <FaArrowUp className="mr-1" /> : <FaArrowDown className="mr-1" />}
              {changePositive ? '+' : ''}
              {price.changePercent24h.toFixed(2)}% (24h)
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Chart controls */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex space-x-1 bg-surface rounded-lg p-1 border border-gray-800">
          {CHART_TYPES.map(ct => (
            <button
              key={ct.value}
              onClick={() => setChartType(ct.value)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                chartType === ct.value ? 'bg-primary text-white' : 'text-text-secondary hover:text-white'
              }`}
            >
              {ct.label}
            </button>
          ))}
        </div>
        <div className="flex space-x-1 bg-surface rounded-lg p-1 border border-gray-800">
          {TIMEFRAMES.map((t, i) => (
            <button
              key={t.label}
              onClick={() => setTfIndex(i)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                tfIndex === i ? 'bg-primary text-white' : 'text-text-secondary hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="card p-4 mb-8">
        {loading && candles.length === 0 ? (
          <div className="h-[420px] flex items-center justify-center">
            <LoadingSpinner size="large" />
          </div>
        ) : (
          <CoinChart candles={candles} chartType={chartType} height={420} />
        )}
      </div>

      {/* Analysis grid */}
      {indicators && regime ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <OutlookSummary
            action={signal?.action ?? null}
            indicators={indicators}
            regime={regime}
            sentimentValue={sentimentValue}
          />
          <CoinSignalCard
            signal={signal}
            loading={signalLoading}
            experimental={experimental}
            onGenerate={generateSignal}
          />
          <MarketRegimeBadge regime={regime} />
          <IndicatorPanel indicators={indicators} currentPrice={price?.price ?? indicators.ema50} />
          <SentimentGauge />
          <OrderBookPanel orderBook={orderBook} />
        </div>
      ) : (
        !loading && (
          <div className="card p-12 text-center">
            <p className="text-text-secondary">Not enough data to compute analysis for this coin.</p>
          </div>
        )
      )}
    </div>
  );
}
