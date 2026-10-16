'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { portfolioService, PortfolioSummary, Trade, PortfolioAsset } from '@/services/portfolio.service';
import { marketService } from '@/services/market.service';
import { COINS, isSupportedCoin } from '@/lib/coins';
import { formatDate } from '@/lib/dates';
import {
  FaWallet,
  FaChartLine,
  FaHistory,
  FaPlus,
  FaMinus,
  FaArrowUp,
  FaArrowDown,
  FaEdit,
  FaTrash
} from 'react-icons/fa';
import toast from 'react-hot-toast';

export default function PortfolioPage() {
  return (
    <ProtectedRoute requirePro>
      <PortfolioPageInner />
    </ProtectedRoute>
  );
}

function PortfolioPageInner() {
  const { user } = useAuth();
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);

  // Trade form state
  const [tradeForm, setTradeForm] = useState({
    symbol: 'ETH',
    type: 'buy' as 'buy' | 'sell',
    amount: '',
    price: '',
    fee: '0',
    notes: ''
  });

  useEffect(() => {
    if (user) {
      loadPortfolio();
      loadTrades();
    }
  }, [user]);

  const loadPortfolio = async () => {
    if (!user) return;

    try {
      const data = await portfolioService.getPortfolio(user.uid);
      setPortfolio(data);
    } catch (error) {
      console.error('Error loading portfolio:', error);
      toast.error('Failed to load portfolio');
    }
  };

  const loadTrades = async () => {
    if (!user) return;

    try {
      const data = await portfolioService.getTradeHistory(user.uid);
      setTrades(data);
    } catch (error) {
      console.error('Error loading trades:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitTrade = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    const amount = parseFloat(tradeForm.amount);
    const price = parseFloat(tradeForm.price);
    const fee = parseFloat(tradeForm.fee || '0');
    const keepsLegacySymbol = !!selectedTrade && selectedTrade.symbol === tradeForm.symbol;
    if (!isSupportedCoin(tradeForm.symbol) && !keepsLegacySymbol) {
      toast.error('Pick an asset from the list');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(price) || price <= 0) {
      toast.error('Amount and price must be greater than zero');
      return;
    }
    if (!Number.isFinite(fee) || fee < 0) {
      toast.error('Fee cannot be negative');
      return;
    }

    try {

      const tradeData = {
        symbol: tradeForm.symbol,
        type: tradeForm.type,
        amount,
        price,
        fee,
        totalValue: amount * price + fee,
        notes: tradeForm.notes
      };

      if (selectedTrade?.id) {
        // Update existing trade
        await portfolioService.updateTrade(selectedTrade.id, tradeData);
        toast.success('Trade updated successfully');
      } else {
        // Add new trade
        await portfolioService.recordTrade(user.uid, tradeData);
        toast.success('Trade recorded successfully');
      }

      // Reset form and reload data
      setTradeForm({
        symbol: 'ETH',
        type: 'buy',
        amount: '',
        price: '',
        fee: '0',
        notes: ''
      });
      setShowAddTrade(false);
      setSelectedTrade(null);

      await Promise.all([loadPortfolio(), loadTrades()]);
    } catch (error) {
      console.error('Error recording trade:', error);
      toast.error('Failed to record trade');
    }
  };

  const handleDeleteTrade = async (trade: Trade) => {
    if (!user || !trade.id) return;

    if (window.confirm('Are you sure you want to delete this trade?')) {
      try {
        await portfolioService.deleteTrade(trade.id, user.uid);
        toast.success('Trade deleted successfully');
        await Promise.all([loadPortfolio(), loadTrades()]);
      } catch (error) {
        console.error('Error deleting trade:', error);
        toast.error('Failed to delete trade');
      }
    }
  };

  const handleEditTrade = (trade: Trade) => {
    setSelectedTrade(trade);
    setTradeForm({
      symbol: trade.symbol,
      type: trade.type,
      amount: trade.amount.toString(),
      price: trade.price.toString(),
      fee: trade.fee.toString(),
      notes: trade.notes || ''
    });
    setShowAddTrade(true);
  };

  const getAssetAllocation = () => {
    if (!portfolio) return [];

    return portfolio.assets.map(asset => ({
      name: asset.symbol,
      value: asset.currentValue || 0,
      percentage: ((asset.currentValue || 0) / portfolio.totalValue) * 100
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin text-4xl text-primary">⚡</div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="bg-surface border-b border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Portfolio</h1>
              <p className="text-text-secondary">
                Track your crypto investments and performance
              </p>
            </div>
            <button
              onClick={() => setShowAddTrade(!showAddTrade)}
              className="btn-primary flex items-center space-x-2"
            >
              <FaPlus />
              <span>Record Trade</span>
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Portfolio Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-text-secondary">Total Value</h3>
              <FaWallet className="text-primary" />
            </div>
            <p className="text-2xl font-bold text-white">
              {portfolio ? marketService.formatPrice(portfolio.totalValue) : '$0.00'}
            </p>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-text-secondary">Total Cost</h3>
              <FaChartLine className="text-blue-400" />
            </div>
            <p className="text-2xl font-bold text-white">
              {portfolio ? marketService.formatPrice(portfolio.totalCost) : '$0.00'}
            </p>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-text-secondary">Profit/Loss</h3>
              {portfolio && portfolio.totalProfitLoss >= 0 ? (
                <FaArrowUp className="text-green-400" />
              ) : (
                <FaArrowDown className="text-red-400" />
              )}
            </div>
            <p
              className={`text-2xl font-bold ${
                portfolio && portfolio.totalProfitLoss >= 0
                  ? 'text-green-400'
                  : 'text-red-400'
              }`}
            >
              {portfolio ? marketService.formatPrice(portfolio.totalProfitLoss) : '$0.00'}
            </p>
            <p
              className={`text-sm mt-1 ${
                portfolio && portfolio.totalProfitLoss >= 0
                  ? 'text-green-400'
                  : 'text-red-400'
              }`}
            >
              {portfolio ? `${portfolio.totalProfitLossPercentage.toFixed(2)}%` : '0.00%'}
            </p>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-text-secondary">Assets</h3>
              <FaWallet className="text-purple-400" />
            </div>
            <p className="text-2xl font-bold text-white">
              {portfolio ? portfolio.assets.length : 0}
            </p>
          </div>
        </div>

        {/* Add/Edit Trade Form */}
        {showAddTrade && (
          <div className="card p-6 mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">
              {selectedTrade ? 'Edit Trade' : 'Record New Trade'}
            </h2>
            <form onSubmit={handleSubmitTrade}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Asset
                  </label>
                  <select
                    value={tradeForm.symbol}
                    onChange={(e) =>
                      setTradeForm({ ...tradeForm, symbol: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                  >
                    {COINS.map(c => (
                      <option key={c.symbol} value={c.symbol}>
                        {c.name} ({c.symbol})
                      </option>
                    ))}
                    {/* Keep a legacy, non-catalogue symbol selectable when editing an old trade. */}
                    {!isSupportedCoin(tradeForm.symbol) && (
                      <option value={tradeForm.symbol}>{tradeForm.symbol}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Type
                  </label>
                  <select
                    value={tradeForm.type}
                    onChange={(e) =>
                      setTradeForm({
                        ...tradeForm,
                        type: e.target.value as 'buy' | 'sell'
                      })
                    }
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                  >
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Amount
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={tradeForm.amount}
                    onChange={(e) =>
                      setTradeForm({ ...tradeForm, amount: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                    placeholder="0.00"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Price per unit ($)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={tradeForm.price}
                    onChange={(e) =>
                      setTradeForm({ ...tradeForm, price: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                    placeholder="0.00"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Fee ($)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={tradeForm.fee}
                    onChange={(e) =>
                      setTradeForm({ ...tradeForm, fee: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Notes (optional)
                  </label>
                  <input
                    type="text"
                    value={tradeForm.notes}
                    onChange={(e) =>
                      setTradeForm({ ...tradeForm, notes: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                    placeholder="Optional notes"
                  />
                </div>
              </div>

              {/* Total Value Display */}
              {tradeForm.amount && tradeForm.price && (
                <div className="mt-6 p-4 bg-gray-800/50 rounded-lg">
                  <p className="text-sm text-text-secondary">Total Value</p>
                  <p className="text-xl font-bold text-white">
                    {marketService.formatPrice(
                      parseFloat(tradeForm.amount) * parseFloat(tradeForm.price) +
                        parseFloat(tradeForm.fee || '0')
                    )}
                  </p>
                </div>
              )}

              <div className="flex justify-end space-x-4 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddTrade(false);
                    setSelectedTrade(null);
                    setTradeForm({
                      symbol: 'ETH',
                      type: 'buy',
                      amount: '',
                      price: '',
                      fee: '0',
                      notes: ''
                    });
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {selectedTrade ? 'Update Trade' : 'Record Trade'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Portfolio Holdings */}
        {portfolio && portfolio.assets.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">Holdings</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-gray-800">
                    <th className="pb-4 text-sm font-medium text-text-secondary">Asset</th>
                    <th className="pb-4 text-sm font-medium text-text-secondary">Amount</th>
                    <th className="pb-4 text-sm font-medium text-text-secondary">Avg Price</th>
                    <th className="pb-4 text-sm font-medium text-text-secondary">Current Price</th>
                    <th className="pb-4 text-sm font-medium text-text-secondary">Value</th>
                    <th className="pb-4 text-sm font-medium text-text-secondary">P/L</th>
                    <th className="pb-4 text-sm font-medium text-text-secondary">Allocation</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.assets.map((asset) => {
                    const allocation = ((asset.currentValue || 0) / portfolio.totalValue) * 100;
                    return (
                      <tr key={asset.symbol} className="border-b border-gray-800/50">
                        <td className="py-4">
                          <div className="font-medium text-white">{asset.symbol}</div>
                        </td>
                        <td className="py-4 text-white">
                          {asset.amount.toFixed(6)}
                        </td>
                        <td className="py-4 text-white">
                          {marketService.formatPrice(asset.averagePrice)}
                        </td>
                        <td className="py-4 text-white">
                          {marketService.formatPrice(asset.currentPrice || 0)}
                        </td>
                        <td className="py-4 text-white font-medium">
                          {marketService.formatPrice(asset.currentValue || 0)}
                        </td>
                        <td className="py-4">
                          <div
                            className={
                              (asset.profitLoss || 0) >= 0
                                ? 'text-green-400'
                                : 'text-red-400'
                            }
                          >
                            <p className="font-medium">
                              {(asset.profitLoss || 0) >= 0 ? '+' : ''}
                              {marketService.formatPrice(asset.profitLoss || 0)}
                            </p>
                            <p className="text-sm">
                              {(asset.profitLossPercentage || 0) >= 0 ? '+' : ''}
                              {(asset.profitLossPercentage || 0).toFixed(2)}%
                            </p>
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="flex items-center space-x-2">
                            <div className="w-20 bg-gray-800 rounded-full h-2">
                              <div
                                className="bg-primary h-2 rounded-full"
                                style={{ width: `${allocation}%` }}
                              />
                            </div>
                            <span className="text-sm text-text-secondary">
                              {allocation.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Trade History */}
        <div>
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
            <FaHistory className="mr-2" />
            Trade History
          </h2>
          {trades.length > 0 ? (
            <div className="space-y-4">
              {trades.map((trade) => (
                <div key={trade.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          trade.type === 'buy'
                            ? 'bg-green-900/20 text-green-400'
                            : 'bg-red-900/20 text-red-400'
                        }`}
                      >
                        {trade.type === 'buy' ? <FaPlus /> : <FaMinus />}
                      </div>
                      <div>
                        <p className="text-white font-medium">
                          {trade.type === 'buy' ? 'Bought' : 'Sold'} {trade.amount}{' '}
                          {trade.symbol}
                        </p>
                        <p className="text-sm text-text-secondary">
                          at {marketService.formatPrice(trade.price)} per unit •{' '}
                          {formatDate(trade.timestamp)}
                        </p>
                        {trade.notes && (
                          <p className="text-sm text-text-secondary mt-1">
                            Note: {trade.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-white font-medium">
                          {marketService.formatPrice(trade.totalValue)}
                        </p>
                        {trade.fee > 0 && (
                          <p className="text-sm text-text-secondary">
                            Fee: {marketService.formatPrice(trade.fee)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEditTrade(trade)}
                          className="p-2 text-gray-400 hover:text-white transition-colors"
                        >
                          <FaEdit />
                        </button>
                        <button
                          onClick={() => handleDeleteTrade(trade)}
                          className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-12 text-center">
              <FaHistory className="text-4xl text-gray-600 mb-4 mx-auto" />
              <p className="text-text-secondary">No trades recorded yet</p>
              <p className="text-sm text-text-secondary mt-2">
                Start by recording your first trade
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}