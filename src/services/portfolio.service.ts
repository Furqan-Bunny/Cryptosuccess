import { supabase } from '@/lib/supabase/client';
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
  timestamp: string | Date;
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

function mapTrade(row: any): Trade {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    type: row.type,
    amount: Number(row.amount),
    price: Number(row.price),
    totalValue: Number(row.total_value),
    fee: Number(row.fee),
    timestamp: row.created_at,
    notes: row.notes ?? undefined,
  };
}

class PortfolioService {
  async getPortfolio(userId: string): Promise<PortfolioSummary> {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return this.calculatePortfolioFromTrades((data ?? []).map(mapTrade));
  }

  private async calculatePortfolioFromTrades(trades: Trade[]): Promise<PortfolioSummary> {
    const assetMap = new Map<string, PortfolioAsset>();

    // Process oldest → newest for correct average-cost maths.
    const ordered = [...trades].reverse();
    for (const trade of ordered) {
      const existing = assetMap.get(trade.symbol) || { symbol: trade.symbol, amount: 0, averagePrice: 0 };
      if (trade.type === 'buy') {
        const totalCost = existing.amount * existing.averagePrice + trade.totalValue;
        const newAmount = existing.amount + trade.amount;
        existing.averagePrice = newAmount > 0 ? totalCost / newAmount : 0;
        existing.amount = newAmount;
      } else {
        existing.amount -= trade.amount;
      }
      if (existing.amount > 0.0000001) assetMap.set(trade.symbol, existing);
      else assetMap.delete(trade.symbol);
    }

    const assets = Array.from(assetMap.values());
    try {
      const prices = await Promise.all(assets.map(a => marketService.getCurrentPrice(a.symbol)));
      assets.forEach((asset, i) => {
        const currentPrice = prices[i].price;
        asset.currentPrice = currentPrice;
        asset.currentValue = asset.amount * currentPrice;
        asset.profitLoss = asset.currentValue - asset.amount * asset.averagePrice;
        asset.profitLossPercentage = asset.averagePrice > 0 ? ((currentPrice - asset.averagePrice) / asset.averagePrice) * 100 : 0;
        asset.lastUpdated = new Date();
      });
    } catch (error) {
      console.error('Error fetching current prices:', error);
    }

    const totalValue = assets.reduce((s, a) => s + (a.currentValue || 0), 0);
    const totalCost = assets.reduce((s, a) => s + a.amount * a.averagePrice, 0);
    const totalProfitLoss = totalValue - totalCost;
    return {
      totalValue,
      totalCost,
      totalProfitLoss,
      totalProfitLossPercentage: totalCost > 0 ? (totalProfitLoss / totalCost) * 100 : 0,
      assets,
      lastUpdated: new Date(),
    };
  }

  async recordTrade(userId: string, trade: Omit<Trade, 'id' | 'userId' | 'timestamp'>): Promise<string> {
    const { data, error } = await supabase
      .from('trades')
      .insert({
        user_id: userId,
        symbol: trade.symbol,
        type: trade.type,
        amount: trade.amount,
        price: trade.price,
        total_value: trade.amount * trade.price,
        fee: trade.fee,
        notes: trade.notes ?? null,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    await this.updatePortfolioCache(userId);
    return data.id;
  }

  async updateTrade(tradeId: string, updates: Partial<Trade>): Promise<void> {
    const patch: Record<string, any> = {};
    if (updates.symbol !== undefined) patch.symbol = updates.symbol;
    if (updates.type !== undefined) patch.type = updates.type;
    if (updates.amount !== undefined) patch.amount = updates.amount;
    if (updates.price !== undefined) patch.price = updates.price;
    if (updates.fee !== undefined) patch.fee = updates.fee;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.amount !== undefined && updates.price !== undefined) {
      patch.total_value = updates.amount * updates.price;
    }
    const { data, error } = await supabase.from('trades').update(patch).eq('id', tradeId).select('user_id').single();
    if (error) throw new Error(error.message);
    if (data?.user_id) await this.updatePortfolioCache(data.user_id);
  }

  async deleteTrade(tradeId: string, userId: string): Promise<void> {
    const { error } = await supabase.from('trades').delete().eq('id', tradeId);
    if (error) throw new Error(error.message);
    await this.updatePortfolioCache(userId);
  }

  async getTradeHistory(userId: string, limitCount = 50): Promise<Trade[]> {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limitCount);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapTrade);
  }

  private async updatePortfolioCache(userId: string): Promise<void> {
    try {
      const portfolio = await this.getPortfolio(userId);
      await supabase
        .from('profiles')
        .update({
          portfolio_summary: {
            totalValue: portfolio.totalValue,
            totalProfitLoss: portfolio.totalProfitLoss,
            totalProfitLossPercentage: portfolio.totalProfitLossPercentage,
            assetCount: portfolio.assets.length,
            lastUpdated: new Date().toISOString(),
          },
        })
        .eq('id', userId);
    } catch (error) {
      console.error('Error updating portfolio cache:', error);
    }
  }

  async getPortfolioStatistics(userId: string): Promise<any> {
    const portfolio = await this.getPortfolio(userId);
    const trades = await this.getTradeHistory(userId, 100);
    const stats = {
      totalAssets: portfolio.assets.length,
      totalValue: portfolio.totalValue,
      totalProfitLoss: portfolio.totalProfitLoss,
      totalProfitLossPercentage: portfolio.totalProfitLossPercentage,
      totalTrades: trades.length,
      averageTradeSize: 0,
      largestPosition: null as PortfolioAsset | null,
      bestPerformer: null as PortfolioAsset | null,
      worstPerformer: null as PortfolioAsset | null,
    };
    if (portfolio.assets.length > 0) {
      stats.largestPosition = portfolio.assets.reduce((p, c) => ((c.currentValue || 0) > (p.currentValue || 0) ? c : p));
      stats.bestPerformer = portfolio.assets.reduce((p, c) => ((c.profitLossPercentage || 0) > (p.profitLossPercentage || 0) ? c : p));
      stats.worstPerformer = portfolio.assets.reduce((p, c) => ((c.profitLossPercentage || 0) < (p.profitLossPercentage || 0) ? c : p));
    }
    if (trades.length > 0) {
      stats.averageTradeSize = trades.reduce((s, t) => s + t.totalValue, 0) / trades.length;
    }
    return stats;
  }
}

export const portfolioService = new PortfolioService();
