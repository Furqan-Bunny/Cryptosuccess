'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  UTCTimestamp,
  IChartApi,
  ISeriesApi,
} from 'lightweight-charts';
import { CandleData } from '@/services/market.service';

export type ChartType = 'candlestick' | 'line' | 'area';

interface CoinChartProps {
  candles: CandleData[];
  chartType: ChartType;
  height?: number;
}

const UP = '#00D964';
const DOWN = '#FF3B30';

function toTime(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

export default function CoinChart({ candles, chartType, height = 420 }: CoinChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick' | 'Line' | 'Area'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Create the chart + series whenever the chart type (or height) changes.
  // Initial data is seeded here; ongoing candle updates are handled below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#A0A3BD',
        fontFamily: 'Inter, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(55, 65, 81, 0.3)' },
        horzLines: { color: 'rgba(55, 65, 81, 0.3)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#374151' },
      timeScale: { borderColor: '#374151', timeVisible: true, secondsVisible: false },
    });

    let mainSeries: ISeriesApi<'Candlestick' | 'Line' | 'Area'>;
    if (chartType === 'candlestick') {
      mainSeries = chart.addCandlestickSeries({
        upColor: UP, downColor: DOWN, borderVisible: false,
        wickUpColor: UP, wickDownColor: DOWN,
      });
    } else if (chartType === 'area') {
      mainSeries = chart.addAreaSeries({
        lineColor: '#0052FF', topColor: 'rgba(0, 82, 255, 0.4)',
        bottomColor: 'rgba(0, 82, 255, 0.02)', lineWidth: 2,
      });
    } else {
      mainSeries = chart.addLineSeries({ color: '#0052FF', lineWidth: 2 });
    }

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    mainSeriesRef.current = mainSeries;
    volumeSeriesRef.current = volumeSeries;

    // Seed initial data (candles read from closure; updates handled in the
    // effect below keyed on `candles`).
    seedData(mainSeries, volumeSeries, candles, chartType);
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType, height]);

  // Push new candle data onto the existing series without rebuilding the chart.
  useEffect(() => {
    const mainSeries = mainSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!mainSeries || !volumeSeries) return;
    seedData(mainSeries, volumeSeries, candles, chartType);
    chartRef.current?.timeScale().fitContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}

function seedData(
  mainSeries: ISeriesApi<'Candlestick' | 'Line' | 'Area'>,
  volumeSeries: ISeriesApi<'Histogram'>,
  candles: CandleData[],
  chartType: ChartType
) {
  if (!candles || candles.length === 0) return;

  if (chartType === 'candlestick') {
    mainSeries.setData(
      candles.map(c => ({
        time: toTime(c.time),
        open: c.open, high: c.high, low: c.low, close: c.close,
      })) as any
    );
  } else {
    mainSeries.setData(
      candles.map(c => ({ time: toTime(c.time), value: c.close })) as any
    );
  }

  volumeSeries.setData(
    candles.map(c => ({
      time: toTime(c.time),
      value: c.volume,
      color: c.close >= c.open ? 'rgba(0, 217, 100, 0.4)' : 'rgba(255, 59, 48, 0.4)',
    })) as any
  );
}
