'use client';

import React, { useEffect, useRef } from 'react';
import { CandleData } from '@/services/market.service';
import { marketService } from '@/services/market.service';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface PriceChartProps {
  symbol: string;
  candles: CandleData[];
  height?: number;
}

export default function PriceChart({ symbol, candles, height = 400 }: PriceChartProps) {
  const chartRef = useRef<ChartJS<'line'>>(null);

  // Prepare chart data
  const chartData = {
    labels: candles.map(candle =>
      new Date(candle.time).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    ),
    datasets: [
      {
        label: `${symbol} Price`,
        data: candles.map(candle => candle.close),
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: `${symbol}/USDT Price Chart`,
        color: '#fff',
        font: {
          size: 16,
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: '#1F2937',
        titleColor: '#fff',
        bodyColor: '#9CA3AF',
        borderColor: '#374151',
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        callbacks: {
          label: (context) => {
            return `Price: ${marketService.formatPrice(context.parsed.y)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: '#374151',
        },
        border: {
          display: false,
        },
        ticks: {
          color: '#9CA3AF',
          maxTicksLimit: 8,
        },
      },
      y: {
        position: 'right' as const,
        grid: {
          color: '#374151',
        },
        border: {
          display: false,
        },
        ticks: {
          color: '#9CA3AF',
          callback: (value) => {
            return marketService.formatPrice(value as number);
          },
        },
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
  };

  // Calculate price statistics
  const prices = candles.map(c => c.close);
  const highestPrice = Math.max(...prices);
  const lowestPrice = Math.min(...prices);
  const currentPrice = prices[prices.length - 1] || 0;
  const firstPrice = prices[0] || 0;
  const priceChange = currentPrice - firstPrice;
  const priceChangePercent = (priceChange / firstPrice) * 100;

  return (
    <div className="card p-6">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-semibold text-white">Price Chart</h3>
          <div className="text-sm text-text-secondary">
            Last {candles.length} candles
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-text-secondary">Current</p>
            <p className="text-white font-medium">
              {marketService.formatPrice(currentPrice)}
            </p>
          </div>
          <div>
            <p className="text-text-secondary">24h High</p>
            <p className="text-white font-medium">
              {marketService.formatPrice(highestPrice)}
            </p>
          </div>
          <div>
            <p className="text-text-secondary">24h Low</p>
            <p className="text-white font-medium">
              {marketService.formatPrice(lowestPrice)}
            </p>
          </div>
          <div>
            <p className="text-text-secondary">Change</p>
            <p
              className={`font-medium ${
                priceChange >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {priceChange >= 0 ? '+' : ''}
              {priceChangePercent.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>

      <div style={{ height }}>
        <Line ref={chartRef} options={options} data={chartData} />
      </div>
    </div>
  );
}