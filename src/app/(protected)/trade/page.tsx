'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMarketData } from '@/hooks/useMarketData';
import { tradeExecutionService, Order, ExecutionResult } from '@/services/trade-execution.service';
import { portfolioService, PortfolioSummary } from '@/services/portfolio.service';
import { marketService } from '@/services/market.service';
import {
  FaExchangeAlt,
  FaShoppingCart,
  FaTag,
  FaShieldAlt,
  FaClock,
  FaCheckCircle,
  FaTimesCircle,
  FaInfoCircle,
  FaHistory
} from 'react-icons/fa';
import toast from 'react-hot-toast';

export default function TradePage() {
  const { user } = useAuth();
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop-loss'>('market');
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [selectedSymbol, setSelectedSymbol] = useState('ETH');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [activeTab, setActiveTab] = useState<'place-order' | 'open-orders' | 'order-history'>('place-order');

  const { prices } = useMarketData({
    symbols: ['ETH', 'SOL', 'BNB'],
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
      const orderData = {
        symbol: selectedSymbol,
        type: orderType,
        side: orderSide,
        amount: parseFloat(amount),
        price: orderType === 'limit' ? parseFloat(price) : undefined,
        stopPrice: orderType === 'stop-loss' ? parseFloat(stopPrice) : undefined,
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
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <button
                    onClick={() => setOrderType('market')}
                    className={`p-4 rounded-lg border transition-all ${
                      orderType === 'market'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-700 text-text-secondary hover:border-gray-600'
                    }`}
                  >
                    <FaShoppingCart className="text-2xl mb-2 mx-auto" />
                    <p className="font-medium">Market</p>
                    <p className="text-xs mt-1">Instant execution</p>
                  </button>
                  <button
                    onClick={() => setOrderType('limit')}
                    className={`p-4 rounded-lg border transition-all ${
                      orderType === 'limit'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-700 text-text-secondary hover:border-gray-600'
                    }`}
                  >
                    <FaTag className="text-2xl mb-2 mx-auto" />
                    <p className="font-medium">Limit</p>
                    <p className="text-xs mt-1">Set your price</p>
                  </button>
                  <button
                    onClick={() => setOrderType('stop-loss')}
                    className={`p-4 rounded-lg border transition-all ${
                      orderType === 'stop-loss'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-700 text-text-secondary hover:border-gray-600'
                    }`}
                  >
                    <FaShieldAlt className="text-2xl mb-2 mx-auto" />
                    <p className="font-medium">Stop Loss</p>
                    <p className="text-xs mt-1">Risk protection</p>
                  </button>
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
                      <option value="ETH">Ethereum (ETH)</option>
                      <option value="SOL">Solana (SOL)</option>
                      <option value="BNB">Binance Coin (BNB)</option>
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

                  {/* Stop Price Input (for stop-loss orders) */}
                  {orderType === 'stop-loss' && (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Stop Price ($)
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
                    Stop-loss orders help limit losses by automatically selling when price drops to your
                    stop price. Essential for risk management.
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
                              ` • ${new Date(
                                order.createdAt instanceof Date
                                  ? order.createdAt
                                  : order.createdAt.toDate()
                              ).toLocaleDateString()}`}
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