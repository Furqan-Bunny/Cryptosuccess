'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import SimDisclaimer from '@/components/shared/SimDisclaimer';
import LiveTradingCard from '@/components/web3/LiveTradingCard';
import { useMarketData } from '@/hooks/useMarketData';
import { tradeExecutionService, Order } from '@/services/trade-execution.service';
import type { OrderType } from '@/types/trading.types';
import { portfolioService, PortfolioSummary } from '@/services/portfolio.service';
import { marketService } from '@/services/market.service';
import { COIN_SYMBOLS, getCoinName } from '@/lib/coins';
import {
  FaExchangeAlt,
  FaShoppingCart,
  FaTag,
  FaShieldAlt,
  FaBullseye,
  FaChartLine,
  FaClock,
  FaCheckCircle,
  FaTimesCircle,
  FaInfoCircle,
  FaHistory
} from 'react-icons/fa';
import toast from 'react-hot-toast';

export default function TradePage() {
  return (
    <ProtectedRoute requirePro>
      <TradePageInner />
    </ProtectedRoute>
  );
}

function TradePageInner() {
  const { user } = useAuth();
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [selectedSymbol, setSelectedSymbol] = useState('ETH');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [trailingPercent, setTrailingPercent] = useState('5');
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [activeTab, setActiveTab] = useState<'place-order' | 'open-orders' | 'order-history'>('place-order');

  const { prices } = useMarketData({
    symbols: COIN_SYMBOLS,
    enableRealtime: true
  });

  useEffect(() => {
    if (user) {
      loadPortfolio();
      loadOrders();
    }
  }, [user]);

  const loadPortfolio = async () => {
    if (!user) return;
    try {
      const data = await portfolioService.getPortfolio(user.uid);
      setPortfolio(data);
    } catch (error) {
      console.error('Error loading portfolio:', error);
    }
  };

  const loadOrders = async () => {
    if (!user) return;
    try {
      const data = await tradeExecutionService.getUserOrders(user.uid);
      setOrders(data);
    } catch (error) {
      console.error('Error loading orders:', error);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !amount) return;

    setIsPlacingOrder(true);

    try {
      const usesStopPrice = orderType === 'stop-loss' || orderType === 'take-profit';
      const orderData = {
        symbol: selectedSymbol,
        type: orderType,
        side: orderSide,
        amount: parseFloat(amount),
        price: orderType === 'limit' ? parseFloat(price) : undefined,
        stopPrice: usesStopPrice ? parseFloat(stopPrice) : undefined,
        trailingPercent: orderType === 'trailing-stop' ? parseFloat(trailingPercent) : undefined,
      };

      const result = await tradeExecutionService.placeOrder(user.uid, orderData);

      if (result.success) {
        toast.success(result.message || 'Order placed successfully');

        // Reset form
        setAmount('');
        setPrice('');
        setStopPrice('');

        // Reload data
        await Promise.all([loadPortfolio(), loadOrders()]);

        // Switch to open orders tab if not a market order
        if (orderType !== 'market') {
          setActiveTab('open-orders');
        }
      } else {
        toast.error(result.error || 'Failed to place order');
      }
    } catch (error) {
      console.error('Error placing order:', error);
      toast.error('Failed to place order');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!user) return;

    try {
      const result = await tradeExecutionService.cancelOrder(orderId, user.uid);

      if (result.success) {
        toast.success('Order cancelled');
        await loadOrders();
      } else {
        toast.error(result.error || 'Failed to cancel order');
      }
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error('Failed to cancel order');
    }
  };

  const getMaxAmount = () => {
    if (!portfolio || orderSide === 'buy') return null;

    const asset = portfolio.assets.find(a => a.symbol === selectedSymbol);
    return asset?.amount || 0;
  };

  const calculateTotal = () => {
    if (!amount) return 0;

    const currentPrice = prices[selectedSymbol]?.price || 0;
    const orderPrice = orderType === 'market' ? currentPrice : parseFloat(price) || 0;

    return parseFloat(amount) * orderPrice;
  };

  const openOrders = orders.filter(o => o.status === 'pending');
  const orderHistory = orders.filter(o => o.status !== 'pending');

  return (
    <>
      {/* Header */}
      <div className="bg-surface border-b border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-white mb-2">Trade Execution</h1>
          <p className="text-text-secondary">
            Place and manage your cryptocurrency orders
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <SimDisclaimer className="mb-6" extra="Conditional orders (stop-loss, take-profit, trailing-stop) are filled automatically by a background engine that runs about once a minute." />

        {/* Opt-in real trading (renders only when enabled). Separate from paper. */}
        <LiveTradingCard />

        {/* Tabs */}
        <div className="flex space-x-6 mb-8 border-b border-gray-800">
          <button
            onClick={() => setActiveTab('place-order')}
            className={`pb-4 px-2 font-medium transition-colors ${
              activeTab === 'place-order'
                ? 'text-primary border-b-2 border-primary'
                : 'text-text-secondary hover:text-white'
            }`}
          >
            Place Order
          </button>
          <button
            onClick={() => setActiveTab('open-orders')}
            className={`pb-4 px-2 font-medium transition-colors relative ${
              activeTab === 'open-orders'
                ? 'text-primary border-b-2 border-primary'
                : 'text-text-secondary hover:text-white'
            }`}
          >
            Open Orders
            {openOrders.length > 0 && (
              <span className="ml-2 px-2 py-1 text-xs bg-primary/20 text-primary rounded-full">
                {openOrders.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('order-history')}
            className={`pb-4 px-2 font-medium transition-colors ${
              activeTab === 'order-history'
                ? 'text-primary border-b-2 border-primary'
                : 'text-text-secondary hover:text-white'
            }`}
          >
            Order History
          </button>
        </div>

        {/* Place Order Tab */}
        {activeTab === 'place-order' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Order Form */}
            <div className="lg:col-span-2">
              <div className="card p-6">
                <h2 className="text-xl font-semibold text-white mb-6">Place New Order</h2>

                {/* Order Type Selection */}
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
                  {([
                    { type: 'market' as OrderType, icon: <FaShoppingCart className="text-xl mb-2 mx-auto" />, label: 'Market', sub: 'Instant' },
                    { type: 'limit' as OrderType, icon: <FaTag className="text-xl mb-2 mx-auto" />, label: 'Limit', sub: 'Set price' },
                    { type: 'stop-loss' as OrderType, icon: <FaShieldAlt className="text-xl mb-2 mx-auto" />, label: 'Stop Loss', sub: 'Cap losses' },
                    { type: 'take-profit' as OrderType, icon: <FaBullseye className="text-xl mb-2 mx-auto" />, label: 'Take Profit', sub: 'Lock gains' },
                    { type: 'trailing-stop' as OrderType, icon: <FaChartLine className="text-xl mb-2 mx-auto" />, label: 'Trailing', sub: 'Ride trend' },
                  ]).map(o => (
                    <button
                      type="button"
                      key={o.type}
                      onClick={() => setOrderType(o.type)}
                      className={`p-3 rounded-lg border transition-all text-center ${
                        orderType === o.type
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-gray-700 text-text-secondary hover:border-gray-600'
                      }`}
                    >
                      {o.icon}
                      <p className="font-medium text-sm">{o.label}</p>
                      <p className="text-[10px] mt-1">{o.sub}</p>
                    </button>
                  ))}
                </div>

                <form onSubmit={handlePlaceOrder}>
                  {/* Buy/Sell Toggle */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <button
                      type="button"
                      onClick={() => setOrderSide('buy')}
                      className={`p-4 rounded-lg font-semibold transition-all ${
                        orderSide === 'buy'
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      Buy
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderSide('sell')}
                      className={`p-4 rounded-lg font-semibold transition-all ${
                        orderSide === 'sell'
                          ? 'bg-red-500 text-white'
                          : 'bg-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      Sell
                    </button>
                  </div>

                  {/* Asset Selection */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Select Asset
                    </label>
                    <select
                      value={selectedSymbol}
                      onChange={(e) => setSelectedSymbol(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                    >
                      {COIN_SYMBOLS.map((s) => (
                        <option key={s} value={s}>
                          {getCoinName(s)} ({s})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Amount Input */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Amount
                      {orderSide === 'sell' && getMaxAmount() !== null && (
                        <span className="float-right">
                          Max: {getMaxAmount()?.toFixed(6)} {selectedSymbol}
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                      placeholder="0.00"
                      required
                    />
                    {orderSide === 'sell' && getMaxAmount() !== null && (
                      <button
                        type="button"
                        onClick={() => setAmount(getMaxAmount()?.toString() || '')}
                        className="mt-2 text-sm text-primary hover:text-primary-light"
                      >
                        Use max amount
                      </button>
                    )}
                  </div>

                  {/* Price Input (for limit orders) */}
                  {orderType === 'limit' && (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Limit Price ($)
                        <span className="float-right">
                          Current: {marketService.formatPrice(prices[selectedSymbol]?.price || 0)}
                        </span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                        placeholder="0.00"
                        required
                      />
                    </div>
                  )}

                  {/* Trigger Price Input (for stop-loss / take-profit orders) */}
                  {(orderType === 'stop-loss' || orderType === 'take-profit') && (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        {orderType === 'stop-loss' ? 'Stop Price ($)' : 'Take-Profit Price ($)'}
                        <span className="float-right">
                          Current: {marketService.formatPrice(prices[selectedSymbol]?.price || 0)}
                        </span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={stopPrice}
                        onChange={(e) => setStopPrice(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                        placeholder="0.00"
                        required
                      />
                    </div>
                  )}

                  {/* Trailing percent (for trailing-stop orders) */}
                  {orderType === 'trailing-stop' && (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Trailing Distance (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={trailingPercent}
                        onChange={(e) => setTrailingPercent(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none"
                        placeholder="5"
                        required
                      />
                      <p className="text-xs text-text-secondary mt-2">
                        The stop trails the best price by this percent and triggers on a pullback.
                      </p>
                    </div>
                  )}

                  {/* Order Summary */}
                  <div className="bg-gray-800/50 rounded-lg p-4 mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-text-secondary">Estimated Total</span>
                      <span className="text-xl font-bold text-white">
                        {marketService.formatPrice(calculateTotal())}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-text-secondary">Fee (0.1%)</span>
                      <span className="text-text-secondary">
                        {marketService.formatPrice(calculateTotal() * 0.001)}
                      </span>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isPlacingOrder}
                    className={`w-full py-4 rounded-lg font-semibold transition-all ${
                      orderSide === 'buy'
                        ? 'bg-green-500 hover:bg-green-600 text-white'
                        : 'bg-red-500 hover:bg-red-600 text-white'
                    } ${isPlacingOrder ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isPlacingOrder ? 'Placing Order...' : `Place ${orderSide} Order`}
                  </button>
                </form>
              </div>

              {/* Order Type Information */}
              <div className="card p-6 mt-6">
                <div className="flex items-center space-x-2 mb-3">
                  <FaInfoCircle className="text-primary" />
                  <h3 className="text-lg font-semibold text-white">About {orderType} Orders</h3>
                </div>
                {orderType === 'market' && (
                  <p className="text-text-secondary">
                    Market orders execute immediately at the current market price. Best for quick trades
                    when you want to buy or sell right away.
                  </p>
                )}
                {orderType === 'limit' && (
                  <p className="text-text-secondary">
                    Limit orders execute only when the market reaches your specified price. Buy limits
                    execute when price drops to your target, sell limits when price rises.
                  </p>
                )}
                {orderType === 'stop-loss' && (
                  <p className="text-text-secondary">
                    Stop-loss orders limit losses by automatically selling when price drops to your
                    stop price. The engine checks open orders every minute and fills them automatically.
                  </p>
                )}
                {orderType === 'take-profit' && (
                  <p className="text-text-secondary">
                    Take-profit orders lock in gains by automatically selling when price rises to your
                    target. The engine monitors and fills them for you.
                  </p>
                )}
                {orderType === 'trailing-stop' && (
                  <p className="text-text-secondary">
                    Trailing stops follow the price at a fixed percentage distance, ratcheting up as it
                    rises and triggering on a pullback — letting winners run while protecting profit.
                  </p>
                )}
              </div>
            </div>

            {/* Market Info Sidebar */}
            <div className="space-y-6">
              {/* Current Prices */}
              <div className="card p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Market Prices</h3>
                <div className="space-y-4">
                  {['ETH', 'SOL', 'BNB'].map((symbol) => {
                    const priceData = prices[symbol];
                    return (
                      <div
                        key={symbol}
                        className={`p-3 rounded-lg cursor-pointer transition-all ${
                          selectedSymbol === symbol
                            ? 'bg-primary/10 border border-primary'
                            : 'bg-gray-800/50 border border-gray-800 hover:border-gray-700'
                        }`}
                        onClick={() => setSelectedSymbol(symbol)}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-white">{symbol}</span>
                          <span className="text-white">
                            {priceData ? marketService.formatPrice(priceData.price) : '$0.00'}
                          </span>
                        </div>
                        {priceData && (
                          <div className="mt-1">
                            <span
                              className={`text-sm ${
                                priceData.changePercent24h > 0
                                  ? 'text-green-400'
                                  : 'text-red-400'
                              }`}
                            >
                              {priceData.changePercent24h > 0 ? '+' : ''}
                              {priceData.changePercent24h.toFixed(2)}%
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Portfolio Balance */}
              {portfolio && (
                <div className="card p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Your Holdings</h3>
                  <div className="space-y-3">
                    {portfolio.assets.length > 0 ? (
                      portfolio.assets.map((asset) => (
                        <div key={asset.symbol} className="flex justify-between items-center">
                          <span className="text-text-secondary">{asset.symbol}</span>
                          <div className="text-right">
                            <p className="text-white">{asset.amount.toFixed(6)}</p>
                            <p className="text-sm text-text-secondary">
                              {marketService.formatPrice(asset.currentValue || 0)}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-text-secondary">No holdings yet</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Open Orders Tab */}
        {activeTab === 'open-orders' && (
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-white mb-6">Open Orders</h2>
            {openOrders.length > 0 ? (
              <div className="space-y-4">
                {openOrders.map((order) => (
                  <div
                    key={order.id}
                    className="p-4 bg-gray-800/50 rounded-lg flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-4">
                        <div
                          className={`w-12 h-12 rounded-full flex items-center justify-center ${
                            order.side === 'buy'
                              ? 'bg-green-900/20 text-green-400'
                              : 'bg-red-900/20 text-red-400'
                          }`}
                        >
                          <FaExchangeAlt />
                        </div>
                        <div>
                          <p className="text-white font-medium">
                            {order.type} {order.side} {order.amount} {order.symbol}
                          </p>
                          <p className="text-sm text-text-secondary">
                            {order.type === 'limit' && `Limit: ${marketService.formatPrice(order.price || 0)}`}
                            {order.type === 'stop-loss' && `Stop: ${marketService.formatPrice(order.stopPrice || 0)}`}
                            {order.type === 'take-profit' && `Target: ${marketService.formatPrice(order.stopPrice || 0)}`}
                            {order.type === 'trailing-stop' && `Trailing ${order.trailingPercent || 0}%`}
                            {order.type === 'market' && 'Market price'}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="px-3 py-1 bg-yellow-900/20 text-yellow-400 rounded-full text-sm">
                        <FaClock className="inline mr-1" />
                        Pending
                      </span>
                      <button
                        onClick={() => order.id && handleCancelOrder(order.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FaClock className="text-4xl text-gray-600 mb-4 mx-auto" />
                <p className="text-text-secondary">No open orders</p>
              </div>
            )}
          </div>
        )}

        {/* Order History Tab */}
        {activeTab === 'order-history' && (
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-white mb-6">Order History</h2>
            {orderHistory.length > 0 ? (
              <div className="space-y-4">
                {orderHistory.map((order) => (
                  <div
                    key={order.id}
                    className="p-4 bg-gray-800/50 rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div
                          className={`w-12 h-12 rounded-full flex items-center justify-center ${
                            order.side === 'buy'
                              ? 'bg-green-900/20 text-green-400'
                              : 'bg-red-900/20 text-red-400'
                          }`}
                        >
                          <FaExchangeAlt />
                        </div>
                        <div>
                          <p className="text-white font-medium">
                            {order.type} {order.side} {order.amount} {order.symbol}
                          </p>
                          <p className="text-sm text-text-secondary">
                            {order.status === 'filled' &&
                              `Filled at ${marketService.formatPrice(order.filledPrice || 0)}`}
                            {order.createdAt &&
                              ` • ${new Date(order.createdAt).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        {order.status === 'filled' && (
                          <>
                            <div className="text-right">
                              <p className="text-white font-medium">
                                {marketService.formatPrice(
                                  (order.filledAmount || 0) * (order.filledPrice || 0)
                                )}
                              </p>
                              {order.fee && (
                                <p className="text-xs text-text-secondary">
                                  Fee: {marketService.formatPrice(order.fee)}
                                </p>
                              )}
                            </div>
                            <span className="px-3 py-1 bg-green-900/20 text-green-400 rounded-full text-sm">
                              <FaCheckCircle className="inline mr-1" />
                              Filled
                            </span>
                          </>
                        )}
                        {order.status === 'cancelled' && (
                          <span className="px-3 py-1 bg-red-900/20 text-red-400 rounded-full text-sm">
                            <FaTimesCircle className="inline mr-1" />
                            Cancelled
                          </span>
                        )}
                        {order.status === 'expired' && (
                          <span className="px-3 py-1 bg-gray-900/20 text-gray-400 rounded-full text-sm">
                            <FaClock className="inline mr-1" />
                            Expired
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FaHistory className="text-4xl text-gray-600 mb-4 mx-auto" />
                <p className="text-text-secondary">No order history</p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}