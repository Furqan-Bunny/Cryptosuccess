import { db } from './firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  addDoc,
  updateDoc,
  limit
} from 'firebase/firestore';
import { marketService } from './market.service';
import { portfolioService } from './portfolio.service';

// Types
export interface Order {
  id?: string;
  userId: string;
  symbol: string;
  type: 'market' | 'limit' | 'stop-loss';
  side: 'buy' | 'sell';
  amount: number;
  price?: number; // For limit and stop-loss orders
  stopPrice?: number; // For stop-loss orders
  status: 'pending' | 'filled' | 'cancelled' | 'expired';
  filledAmount?: number;
  filledPrice?: number;
  fee?: number;
  createdAt: Timestamp | Date;
  updatedAt?: Timestamp | Date;
  expiresAt?: Timestamp | Date;
  notes?: string;
}

export interface ExecutionResult {
  success: boolean;
  orderId?: string;
  filledAmount?: number;
  filledPrice?: number;
  totalCost?: number;
  fee?: number;
  message?: string;
  error?: string;
}

class TradeExecutionService {
  private readonly FEE_PERCENTAGE = 0.001; // 0.1% trading fee

  // Place a new order
  async placeOrder(userId: string, order: Omit<Order, 'id' | 'userId' | 'status' | 'createdAt'>): Promise<ExecutionResult> {
    try {
      // Validate order
      const validation = this.validateOrder(order);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }

      // Check user's balance for sell orders
      if (order.side === 'sell') {
        const hasBalance = await this.checkBalance(userId, order.symbol, order.amount);
        if (!hasBalance) {
          return {
            success: false,
            error: 'Insufficient balance'
          };
        }
      }

      // Create order document
      const orderData: Omit<Order, 'id'> = {
        ...order,
        userId,
        status: 'pending',
        createdAt: serverTimestamp() as Timestamp,
      };

      // Add expiration for limit and stop-loss orders (24 hours)
      if (order.type !== 'market') {
        const expirationDate = new Date();
        expirationDate.setHours(expirationDate.getHours() + 24);
        orderData.expiresAt = expirationDate;
      }

      const docRef = await addDoc(collection(db, 'orders'), orderData);

      // Execute market orders immediately
      if (order.type === 'market') {
        return await this.executeMarketOrder(docRef.id, orderData);
      }

      // For limit and stop-loss orders, they will be executed when conditions are met
      return {
        success: true,
        orderId: docRef.id,
        message: `${order.type} order placed successfully`
      };
    } catch (error) {
      console.error('Error placing order:', error);
      return {
        success: false,
        error: 'Failed to place order'
      };
    }
  }

  // Execute a market order immediately
  private async executeMarketOrder(orderId: string, order: Omit<Order, 'id'>): Promise<ExecutionResult> {
    try {
      // Get current market price
      const marketPrice = await marketService.getCurrentPrice(order.symbol);
      const executionPrice = marketPrice.price;

      // Calculate total cost and fee
      const subtotal = order.amount * executionPrice;
      const fee = subtotal * this.FEE_PERCENTAGE;
      const totalCost = order.side === 'buy' ? subtotal + fee : subtotal - fee;

      // Update order as filled
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'filled',
        filledAmount: order.amount,
        filledPrice: executionPrice,
        fee: fee,
        updatedAt: serverTimestamp()
      });

      // Record the trade in portfolio
      await portfolioService.recordTrade(order.userId, {
        symbol: order.symbol,
        type: order.side,
        amount: order.amount,
        price: executionPrice,
        fee: fee,
        notes: `Market order #${orderId}`
      });

      return {
        success: true,
        orderId,
        filledAmount: order.amount,
        filledPrice: executionPrice,
        totalCost,
        fee,
        message: `Market ${order.side} order executed at ${marketService.formatPrice(executionPrice)}`
      };
    } catch (error) {
      console.error('Error executing market order:', error);

      // Update order as failed
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      });

      return {
        success: false,
        orderId,
        error: 'Failed to execute market order'
      };
    }
  }

  // Check and execute pending limit orders
  async checkAndExecuteLimitOrders(): Promise<void> {
    try {
      // Get all pending limit orders
      const ordersQuery = query(
        collection(db, 'orders'),
        where('status', '==', 'pending'),
        where('type', '==', 'limit')
      );

      const snapshot = await getDocs(ordersQuery);
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];

      // Check each order
      for (const order of orders) {
        await this.checkLimitOrder(order);
      }
    } catch (error) {
      console.error('Error checking limit orders:', error);
    }
  }

  // Check if a limit order should be executed
  private async checkLimitOrder(order: Order): Promise<void> {
    if (!order.id || !order.price) return;

    try {
      // Check if order has expired
      if (order.expiresAt) {
        const expiryDate = order.expiresAt instanceof Timestamp ? order.expiresAt.toDate() : order.expiresAt;
        if (new Date() > expiryDate) {
          await updateDoc(doc(db, 'orders', order.id), {
            status: 'expired',
            updatedAt: serverTimestamp()
          });
          return;
        }
      }

      // Get current market price
      const marketPrice = await marketService.getCurrentPrice(order.symbol);
      const currentPrice = marketPrice.price;

      // Check if limit order should be executed
      const shouldExecute =
        (order.side === 'buy' && currentPrice <= order.price) ||
        (order.side === 'sell' && currentPrice >= order.price);

      if (shouldExecute) {
        // Execute at limit price (in real trading, this would be at market price)
        const executionPrice = order.price;
        const subtotal = order.amount * executionPrice;
        const fee = subtotal * this.FEE_PERCENTAGE;

        // Update order as filled
        await updateDoc(doc(db, 'orders', order.id), {
          status: 'filled',
          filledAmount: order.amount,
          filledPrice: executionPrice,
          fee: fee,
          updatedAt: serverTimestamp()
        });

        // Record the trade
        await portfolioService.recordTrade(order.userId, {
          symbol: order.symbol,
          type: order.side,
          amount: order.amount,
          price: executionPrice,
          fee: fee,
          notes: `Limit order #${order.id}`
        });
      }
    } catch (error) {
      console.error('Error checking limit order:', error);
    }
  }

  // Check and execute stop-loss orders
  async checkAndExecuteStopLossOrders(): Promise<void> {
    try {
      const ordersQuery = query(
        collection(db, 'orders'),
        where('status', '==', 'pending'),
        where('type', '==', 'stop-loss')
      );

      const snapshot = await getDocs(ordersQuery);
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];

      for (const order of orders) {
        await this.checkStopLossOrder(order);
      }
    } catch (error) {
      console.error('Error checking stop-loss orders:', error);
    }
  }

  // Check if a stop-loss order should be executed
  private async checkStopLossOrder(order: Order): Promise<void> {
    if (!order.id || !order.stopPrice) return;

    try {
      const marketPrice = await marketService.getCurrentPrice(order.symbol);
      const currentPrice = marketPrice.price;

      // Check if stop-loss should be triggered
      const shouldTrigger =
        (order.side === 'sell' && currentPrice <= order.stopPrice) ||
        (order.side === 'buy' && currentPrice >= order.stopPrice);

      if (shouldTrigger) {
        // Execute at market price
        const subtotal = order.amount * currentPrice;
        const fee = subtotal * this.FEE_PERCENTAGE;

        await updateDoc(doc(db, 'orders', order.id), {
          status: 'filled',
          filledAmount: order.amount,
          filledPrice: currentPrice,
          fee: fee,
          updatedAt: serverTimestamp()
        });

        await portfolioService.recordTrade(order.userId, {
          symbol: order.symbol,
          type: order.side,
          amount: order.amount,
          price: currentPrice,
          fee: fee,
          notes: `Stop-loss order #${order.id}`
        });
      }
    } catch (error) {
      console.error('Error checking stop-loss order:', error);
    }
  }

  // Cancel an order
  async cancelOrder(orderId: string, userId: string): Promise<ExecutionResult> {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const orderDoc = await getDoc(orderRef);

      if (!orderDoc.exists()) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      const order = orderDoc.data() as Order;

      // Verify ownership
      if (order.userId !== userId) {
        return {
          success: false,
          error: 'Unauthorized'
        };
      }

      // Check if order can be cancelled
      if (order.status !== 'pending') {
        return {
          success: false,
          error: `Order is already ${order.status}`
        };
      }

      // Cancel the order
      await updateDoc(orderRef, {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      });

      return {
        success: true,
        orderId,
        message: 'Order cancelled successfully'
      };
    } catch (error) {
      console.error('Error cancelling order:', error);
      return {
        success: false,
        error: 'Failed to cancel order'
      };
    }
  }

  // Get user's orders
  async getUserOrders(userId: string, statusFilter?: Order['status'], limitCount: number = 50): Promise<Order[]> {
    try {
      let ordersQuery = query(
        collection(db, 'orders'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );

      if (statusFilter) {
        ordersQuery = query(
          collection(db, 'orders'),
          where('userId', '==', userId),
          where('status', '==', statusFilter),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
      }

      const snapshot = await getDocs(ordersQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
    } catch (error) {
      console.error('Error fetching user orders:', error);
      throw new Error('Failed to fetch orders');
    }
  }

  // Validate order
  private validateOrder(order: Partial<Order>): { valid: boolean; error?: string } {
    if (!order.symbol || !order.type || !order.side || !order.amount) {
      return { valid: false, error: 'Missing required fields' };
    }

    if (order.amount <= 0) {
      return { valid: false, error: 'Amount must be greater than 0' };
    }

    if (order.type === 'limit' && !order.price) {
      return { valid: false, error: 'Limit orders require a price' };
    }

    if (order.type === 'stop-loss' && !order.stopPrice) {
      return { valid: false, error: 'Stop-loss orders require a stop price' };
    }

    return { valid: true };
  }

  // Check if user has sufficient balance
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

  // Simulate order execution for demo purposes
  async simulateOrderExecution(order: Omit<Order, 'id' | 'userId' | 'status' | 'createdAt'>, userId: string): Promise<ExecutionResult> {
    // This is a simulation that doesn't actually execute trades
    // It's for demo/testing purposes

    const marketPrice = await marketService.getCurrentPrice(order.symbol);
    const executionPrice = order.type === 'market' ? marketPrice.price : order.price || marketPrice.price;

    const subtotal = order.amount * executionPrice;
    const fee = subtotal * this.FEE_PERCENTAGE;
    const totalCost = order.side === 'buy' ? subtotal + fee : subtotal - fee;

    return {
      success: true,
      orderId: 'simulation-' + Date.now(),
      filledAmount: order.amount,
      filledPrice: executionPrice,
      totalCost,
      fee,
      message: `Simulated ${order.type} ${order.side} order`
    };
  }
}

export const tradeExecutionService = new TradeExecutionService();