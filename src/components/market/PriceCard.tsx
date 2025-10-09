'use client';

import React from 'react';
import { MarketPrice } from '@/services/market.service';
import { marketService } from '@/services/market.service';
import { FaArrowUp, FaArrowDown } from 'react-icons/fa';

interface PriceCardProps {
  price: MarketPrice;
  onClick?: () => void;
}

export default function PriceCard({ price, onClick }: PriceCardProps) {
  const isPositive = price.changePercent24h > 0;

  // Get symbol icon
  const getSymbolIcon = (symbol: string) => {
    const icons: { [key: string]: string } = {
      ETH: '⟠',
      SOL: '◎',
      BNB: '⬡',
    };
    return icons[symbol] || '₿';
  };

  return (
    <div
      className="card p-6 hover:shadow-lg transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <span className="text-3xl">{getSymbolIcon(price.symbol)}</span>
          <div>
            <h3 className="text-lg font-semibold text-white">{price.symbol}</h3>
            <p className="text-sm text-text-secondary">
              {price.symbol === 'ETH' && 'Ethereum'}
              {price.symbol === 'SOL' && 'Solana'}
              {price.symbol === 'BNB' && 'Binance Coin'}
            </p>
          </div>
        </div>
        <div
          className={`flex items-center space-x-1 px-2 py-1 rounded ${
            isPositive
              ? 'bg-green-900/20 text-green-400'
              : 'bg-red-900/20 text-red-400'
          }`}
        >
          {isPositive ? (
            <FaArrowUp className="text-xs" />
          ) : (
            <FaArrowDown className="text-xs" />
          )}
          <span className="text-sm font-medium">
            {Math.abs(price.changePercent24h).toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-2xl font-bold text-white">
          {marketService.formatPrice(price.price)}
        </p>
        <p className="text-sm text-text-secondary mt-1">
          24h Change:{' '}
          <span
            className={isPositive ? 'text-green-400' : 'text-red-400'}
          >
            {isPositive ? '+' : ''}
            {marketService.formatPrice(price.change24h)}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-text-secondary">24h Volume</p>
          <p className="text-white font-medium">
            ${marketService.formatLargeNumber(price.volume24h)}
          </p>
        </div>
        <div>
          <p className="text-text-secondary">Market Cap</p>
          <p className="text-white font-medium">
            ${marketService.formatLargeNumber(price.marketCap)}
          </p>
        </div>
      </div>

      {price.lastUpdate && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <p className="text-xs text-text-secondary text-center">
            Last updated: {new Date(price.lastUpdate).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}