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
  deleteDoc,
  limit
} from 'firebase/firestore';
import { marketService } from './market.service';

// Types
export interface PortfolioAsset {
  id?: string;
  symbol: string;
  amount: number;
  averagePrice: number;
  currentPrice?: number;
  currentValue?: number;
  profitLoss?: number;
  profitLossPercentage?: number;
  lastUpdated?: Date;
}

export interface Trade {
  id?: string;
  userId: string;
  symbol: string;
  type: 'buy' | 'sell';
  amount: number;
  price: number;
  totalValue: number;
  fee: number;
  timestamp: Timestamp | Date;
  notes?: string;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalProfitLoss: number;
  totalProfitLossPercentage: number;
  assets: PortfolioAsset[];
  lastUpdated: Date;
}

class PortfolioService {
  // Get user's portfolio
  async getPortfolio(userId: string): Promise<PortfolioSummary> {
    try {
      // Get all trades for the user
      const tradesQuery = query(
        collection(db, 'trades'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc')
      );

      const tradesSnapshot = await getDocs(tradesQuery);
      const trades = tradesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Trade[];

      // Calculate portfolio from trades
      const portfolio = await this.calculatePortfolioFromTrades(trades);

      return portfolio;
    } catch (error) {
      console.error('Error getting portfolio:', error);
      throw new Error('Failed to fetch portfolio');
    }
  }

  // Calculate portfolio from trades
  private async calculatePortfolioFromTrades(trades: Trade[]): Promise<PortfolioSummary> {
    const assetMap = new Map<string, PortfolioAsset>();

    // Process each trade
    for (const trade of trades) {
      const existing = assetMap.get(trade.symbol) || {
        symbol: trade.symbol,
        amount: 0,
        averagePrice: 0,
      };

      if (trade.type === 'buy') {
        // Calculate new average price
        const totalCost = (existing.amount * existing.averagePrice) + trade.totalValue;
        const newAmount = existing.amount + trade.amount;
        existing.averagePrice = totalCost / newAmount;
        existing.amount = newAmount;
      } else if (trade.type === 'sell') {
        // Reduce amount (keep average price)
        existing.amount -= trade.amount;
      }

      // Only include assets with positive amounts
      if (existing.amount > 0) {
        assetMap.set(trade.symbol, existing);
      } else {
        assetMap.delete(trade.symbol);
      }
    }

    // Get current prices and calculate values
    const assets = Array.from(assetMap.values());
    const pricesPromises = assets.map(asset => marketService.getCurrentPrice(asset.symbol));

    try {
      const prices = await Promise.all(pricesPromises);

      // Update assets with current prices
      assets.forEach((asset, index) => {
        const currentPrice = prices[index].price;
        asset.currentPrice = currentPrice;
        asset.currentValue = asset.amount * currentPrice;
        asset.profitLoss = asset.currentValue - (asset.amount * asset.averagePrice);
        asset.profitLossPercentage = ((currentPrice - asset.averagePrice) / asset.averagePrice) * 100;
        asset.lastUpdated = new Date();
      });
    } catch (error) {
      console.error('Error fetching current prices:', error);
    }

    // Calculate totals
    const totalValue = assets.reduce((sum, asset) => sum + (asset.currentValue || 0), 0);
    const totalCost = assets.reduce((sum, asset) => sum + (asset.amount * asset.averagePrice), 0);
    const totalProfitLoss = totalValue - totalCost;
    const totalProfitLossPercentage = totalCost > 0 ? (totalProfitLoss / totalCost) * 100 : 0;

    return {
      totalValue,
      totalCost,
      totalProfitLoss,
      totalProfitLossPercentage,
      assets,
      lastUpdated: new Date(),
    };
  }

  // Record a trade
  async recordTrade(userId: string, trade: Omit<Trade, 'id' | 'userId' | 'timestamp'>): Promise<string> {
    try {
      const tradeData = {
        ...trade,
        userId,
        timestamp: serverTimestamp(),
        totalValue: trade.amount * trade.price,
      };

      const docRef = await addDoc(collection(db, 'trades'), tradeData);

      // Update user's portfolio cache
      await this.updatePortfolioCache(userId);

      return docRef.id;
    } catch (error) {
      console.error('Error recording trade:', error);
      throw new Error('Failed to record trade');
    }
  }

  // Update trade
  async updateTrade(tradeId: string, updates: Partial<Trade>): Promise<void> {
    try {
      const tradeRef = doc(db, 'trades', tradeId);

      // Get the trade to get userId
      const tradeDoc = await getDoc(tradeRef);
      if (!tradeDoc.exists()) {
        throw new Error('Trade not found');
      }

      await updateDoc(tradeRef, {
        ...updates,
        totalValue: updates.amount && updates.price ? updates.amount * updates.price : undefined,
      });

      // Update portfolio cache
      const trade = tradeDoc.data() as Trade;
      await this.updatePortfolioCache(trade.userId);
    } catch (error) {
      console.error('Error updating trade:', error);
      throw new Error('Failed to update trade');
    }
  }

  // Delete trade
  async deleteTrade(tradeId: string, userId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'trades', tradeId));
      await this.updatePortfolioCache(userId);
    } catch (error) {
      console.error('Error deleting trade:', error);
      throw new Error('Failed to delete trade');
    }
  }

  // Get trade history
  async getTradeHistory(userId: string, limitCount: number = 50): Promise<Trade[]> {
    try {
      const tradesQuery = query(
        collection(db, 'trades'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(tradesQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Trade[];
    } catch (error) {
      console.error('Error fetching trade history:', error);
      throw new Error('Failed to fetch trade history');
    }
  }

  // Update portfolio cache in user document
  private async updatePortfolioCache(userId: string): Promise<void> {
    try {
      const portfolio = await this.getPortfolio(userId);

      // Store summary in user document for quick access
      await updateDoc(doc(db, 'users', userId), {
        portfolioSummary: {
          totalValue: portfolio.totalValue,
          totalProfitLoss: portfolio.totalProfitLoss,
          totalProfitLossPercentage: portfolio.totalProfitLossPercentage,
          assetCount: portfolio.assets.length,
          lastUpdated: serverTimestamp(),
        }
      });
    } catch (error) {
      console.error('Error updating portfolio cache:', error);
    }
  }

  // Get portfolio performance over time
  async getPortfolioPerformance(userId: string, days: number = 30): Promise<any[]> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const tradesQuery = query(
        collection(db, 'trades'),
        where('userId', '==', userId),
        where('timestamp', '>=', startDate),
        orderBy('timestamp', 'asc')
      );

      const snapshot = await getDocs(tradesQuery);
      const trades = snapshot.docs.map(doc => doc.data()) as Trade[];

      // Calculate daily portfolio values
      const dailyValues: any[] = [];
      let currentDate = new Date(startDate);
      let portfolio = await this.getPortfolioAtDate(userId, startDate);

      while (currentDate <= endDate) {
        // Apply trades for this day
        const dayTrades = trades.filter(t => {
          const tradeDate = t.timestamp instanceof Timestamp ? t.timestamp.toDate() : t.timestamp;
          return tradeDate.toDateString() === currentDate.toDateString();
        });

        for (const trade of dayTrades) {
          // Update portfolio based on trade
          // Implementation would depend on specific requirements
        }

        dailyValues.push({
          date: new Date(currentDate),
          value: portfolio.totalValue,
          profitLoss: portfolio.totalProfitLoss,
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return dailyValues;
    } catch (error) {
      console.error('Error getting portfolio performance:', error);
      throw new Error('Failed to get portfolio performance');
    }
  }

  // Get portfolio value at specific date
  private async getPortfolioAtDate(userId: string, date: Date): Promise<PortfolioSummary> {
    const tradesQuery = query(
      collection(db, 'trades'),
      where('userId', '==', userId),
      where('timestamp', '<=', date),
      orderBy('timestamp', 'desc')
    );

    const snapshot = await getDocs(tradesQuery);
    const trades = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Trade[];

    return this.calculatePortfolioFromTrades(trades);
  }

  // Calculate portfolio statistics
  async getPortfolioStatistics(userId: string): Promise<any> {
    try {
      const portfolio = await this.getPortfolio(userId);
      const trades = await this.getTradeHistory(userId, 100);

      // Calculate statistics
      const stats = {
        totalAssets: portfolio.assets.length,
        totalValue: portfolio.totalValue,
        totalProfitLoss: portfolio.totalProfitLoss,
        totalProfitLossPercentage: portfolio.totalProfitLossPercentage,
        totalTrades: trades.length,
        winningTrades: 0,
        losingTrades: 0,
        averageTradeSize: 0,
        largestPosition: null as PortfolioAsset | null,
        bestPerformer: null as PortfolioAsset | null,
        worstPerformer: null as PortfolioAsset | null,
      };

      // Find best and worst performers
      if (portfolio.assets.length > 0) {
        stats.largestPosition = portfolio.assets.reduce((prev, current) =>
          (current.currentValue || 0) > (prev.currentValue || 0) ? current : prev
        );

        stats.bestPerformer = portfolio.assets.reduce((prev, current) =>
          (current.profitLossPercentage || 0) > (prev.profitLossPercentage || 0) ? current : prev
        );

        stats.worstPerformer = portfolio.assets.reduce((prev, current) =>
          (current.profitLossPercentage || 0) < (prev.profitLossPercentage || 0) ? current : prev
        );
      }

      // Calculate trade statistics
      if (trades.length > 0) {
        const totalTradeValue = trades.reduce((sum, trade) => sum + trade.totalValue, 0);
        stats.averageTradeSize = totalTradeValue / trades.length;
      }

      return stats;
    } catch (error) {
      console.error('Error calculating portfolio statistics:', error);
      throw new Error('Failed to calculate portfolio statistics');
    }
  }
}

export const portfolioService = new PortfolioService();