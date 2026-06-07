import { supabase } from '@/lib/supabase/client';
import { marketService } from './market.service';
import { portfolioService } from './portfolio.service';
import { Order, ExecutionResult, TRADING_FEE_PERCENTAGE } from '@/types/trading.types';

// Re-export so existing imports (`from '@/services/trade-execution.service'`) keep working.
export type { Order, ExecutionResult };

function mapOrder(row: any): Order {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    type: row.type,
    side: row.side,
    amount: Number(row.amount),
    price: row.price != null ? Number(row.price) : undefined,
    stopPrice: row.stop_price != null ? Number(row.stop_price) : undefined,
    trailingPercent: row.trailing_percent != null ? Number(row.trailing_percent) : undefined,
    highWaterMark: row.high_water_mark != null ? Number(row.high_water_mark) : undefined,
    status: row.status,
    filledAmount: row.filled_amount != null ? Number(row.filled_amount) : undefined,
    filledPrice: row.filled_price != null ? Number(row.filled_price) : undefined,
    fee: row.fee != null ? Number(row.fee) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    notes: row.notes ?? undefined,
  };
}

class TradeExecutionService {
  private readonly FEE_PERCENTAGE = TRADING_FEE_PERCENTAGE;

  async placeOrder(userId: string, order: Omit<Order, 'id' | 'userId' | 'status' | 'createdAt'>): Promise<ExecutionResult> {
    try {
      const validation = this.validateOrder(order);
      if (!validation.valid) return { success: false, error: validation.error };

      if (order.side === 'sell') {
        const hasBalance = await this.checkBalance(userId, order.symbol, order.amount);
        if (!hasBalance) return { success: false, error: 'Insufficient balance' };
      }

      // Limit orders expire after 24h; protective orders persist until filled/cancelled.
      let expiresAt: string | null = null;
      if (order.type === 'limit') {
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }

      // Seed trailing-stop high-water mark with the current price.
      let highWaterMark: number | null = null;
      if (order.type === 'trailing-stop') {
        try {
          highWaterMark = (await marketService.getCurrentPrice(order.symbol)).price;
        } catch {
          /* engine will initialise from first observed price */
        }
      }

      const { data, error } = await supabase
        .from('orders')
        .insert({
          user_id: userId,
          symbol: order.symbol,
          type: order.type,
          side: order.side,
          amount: order.amount,
          price: order.price ?? null,
          stop_price: order.stopPrice ?? null,
          trailing_percent: order.trailingPercent ?? null,
          high_water_mark: highWaterMark,
          status: 'pending',
          expires_at: expiresAt,
          notes: order.notes ?? null,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);

      if (order.type === 'market') {
        return await this.executeMarketOrder(data.id, {
          userId,
          symbol: order.symbol,
          side: order.side,
          amount: order.amount,
        });
      }

      return { success: true, orderId: data.id, message: `${order.type} order placed successfully` };
    } catch (error: any) {
      console.error('Error placing order:', error);
      return { success: false, error: error?.message || 'Failed to place order' };
    }
  }

  private async executeMarketOrder(
    orderId: string,
    order: { userId: string; symbol: string; side: 'buy' | 'sell'; amount: number }
  ): Promise<ExecutionResult> {
    try {
      const executionPrice = (await marketService.getCurrentPrice(order.symbol)).price;
      const subtotal = order.amount * executionPrice;
      const fee = subtotal * this.FEE_PERCENTAGE;
      const totalCost = order.side === 'buy' ? subtotal + fee : subtotal - fee;

      await supabase
        .from('orders')
        .update({ status: 'filled', filled_amount: order.amount, filled_price: executionPrice, fee, updated_at: new Date().toISOString() })
        .eq('id', orderId);

      await portfolioService.recordTrade(order.userId, {
        symbol: order.symbol,
        type: order.side,
        amount: order.amount,
        price: executionPrice,
        fee,
        totalValue: totalCost,
        notes: `Market order #${orderId}`,
      });

      return {
        success: true,
        orderId,
        filledAmount: order.amount,
        filledPrice: executionPrice,
        totalCost,
        fee,
        message: `Market ${order.side} order executed at ${marketService.formatPrice(executionPrice)}`,
      };
    } catch (error: any) {
      console.error('Error executing market order:', error);
      await supabase.from('orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', orderId);
      return { success: false, orderId, error: 'Failed to execute market order' };
    }
  }

  async cancelOrder(orderId: string, userId: string): Promise<ExecutionResult> {
    try {
      const { data: row } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
      if (!row) return { success: false, error: 'Order not found' };
      if (row.user_id !== userId) return { success: false, error: 'Unauthorized' };
      if (row.status !== 'pending') return { success: false, error: `Order is already ${row.status}` };

      await supabase.from('orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', orderId);
      return { success: true, orderId, message: 'Order cancelled successfully' };
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      return { success: false, error: 'Failed to cancel order' };
    }
  }

  async getUserOrders(userId: string, statusFilter?: Order['status'], limitCount = 50): Promise<Order[]> {
    let q = supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limitCount);
    if (statusFilter) q = q.eq('status', statusFilter);
    const { data, error } = await q;
    if (error) throw new Error('Failed to fetch orders');
    return (data ?? []).map(mapOrder);
  }

  private validateOrder(order: Partial<Order>): { valid: boolean; error?: string } {
    if (!order.symbol || !order.type || !order.side || !order.amount) {
      return { valid: false, error: 'Missing required fields' };
    }
    if (order.amount <= 0) return { valid: false, error: 'Amount must be greater than 0' };
    if (order.type === 'limit' && !order.price) return { valid: false, error: 'Limit orders require a price' };
    if ((order.type === 'stop-loss' || order.type === 'take-profit') && !order.stopPrice) {
      return { valid: false, error: `${order.type} orders require a trigger price` };
    }
    if (order.type === 'trailing-stop' && (!order.trailingPercent || order.trailingPercent <= 0)) {
      return { valid: false, error: 'Trailing-stop orders require a trailing percent' };
    }
    return { valid: true };
  }

  private async checkBalance(userId: string, symbol: string, amount: number): Promise<boolean> {
    try {
      const portfolio = await portfolioService.getPortfolio(userId);
      const asset = portfolio.assets.find(a => a.symbol === symbol);
      return asset ? asset.amount >= amount : false;
    } catch (error) {
      console.error('Error checking balance:', error);
      return false;
    }
  }
}

export const tradeExecutionService = new TradeExecutionService();
