import { supabase } from '@/lib/supabase/client';
import { marketService } from './market.service';

export interface StoredSignal {
  id?: string;
  userId: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  reasoning: string;
  createdAt: string | Date;
  evaluatedAt?: string | Date;
  priceAt24h?: number;
  outcome?: 'hit_target' | 'hit_stop' | 'expired_profit' | 'expired_loss' | 'pending';
  profitLossPercent?: number;
}

function mapRow(row: any): StoredSignal {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    action: row.action,
    confidence: Number(row.confidence),
    entryPrice: Number(row.entry_price),
    targetPrice: Number(row.target_price),
    stopLoss: Number(row.stop_loss),
    reasoning: row.reasoning,
    createdAt: row.created_at,
    evaluatedAt: row.evaluated_at ?? undefined,
    priceAt24h: row.price_at_24h != null ? Number(row.price_at_24h) : undefined,
    outcome: row.outcome ?? undefined,
    profitLossPercent: row.profit_loss_percent != null ? Number(row.profit_loss_percent) : undefined,
  };
}

class SignalHistoryService {
  async storeSignal(signal: Omit<StoredSignal, 'id' | 'createdAt' | 'outcome'>): Promise<string> {
    const { data, error } = await supabase
      .from('signals')
      .insert({
        user_id: signal.userId,
        symbol: signal.symbol,
        action: signal.action,
        confidence: signal.confidence,
        entry_price: signal.entryPrice,
        target_price: signal.targetPrice,
        stop_loss: signal.stopLoss,
        reasoning: signal.reasoning,
        outcome: 'pending',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  async getUserSignals(userId: string, maxResults = 20): Promise<StoredSignal[]> {
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(maxResults);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  }

  async evaluateSignal(signalId: string, currentPrice: number): Promise<void> {
    const { data: row } = await supabase.from('signals').select('*').eq('id', signalId).maybeSingle();
    if (!row) return;
    const signal = mapRow(row);

    const rawSpotPercent = ((currentPrice - signal.entryPrice) / signal.entryPrice) * 100;
    // Store the STRATEGY P/L, not the raw spot move: a SELL (short) profits when
    // price falls, so the sign is inverted. This makes profit_loss_percent
    // directionally correct everywhere it's displayed.
    const profitLossPercent = signal.action === 'SELL' ? -rawSpotPercent : rawSpotPercent;

    let outcome: StoredSignal['outcome'];
    if (signal.action === 'BUY') {
      if (currentPrice >= signal.targetPrice) outcome = 'hit_target';
      else if (currentPrice <= signal.stopLoss) outcome = 'hit_stop';
      else outcome = profitLossPercent >= 0 ? 'expired_profit' : 'expired_loss';
    } else if (signal.action === 'SELL') {
      if (currentPrice <= signal.targetPrice) outcome = 'hit_target';
      else if (currentPrice >= signal.stopLoss) outcome = 'hit_stop';
      // profitLossPercent is already direction-adjusted, so the test matches BUY.
      else outcome = profitLossPercent >= 0 ? 'expired_profit' : 'expired_loss';
    } else {
      outcome = 'expired_profit';
    }

    await supabase
      .from('signals')
      .update({
        price_at_24h: currentPrice,
        profit_loss_percent: profitLossPercent,
        outcome,
        evaluated_at: new Date().toISOString(),
      })
      .eq('id', signalId);
  }

  // Evaluate still-pending signals older than 24h (idempotent).
  async evaluatePendingSignals(userId: string): Promise<void> {
    const signals = await this.getUserSignals(userId, 100);
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const pending = signals.filter(s => {
      if (s.outcome && s.outcome !== 'pending') return false;
      const created = new Date(s.createdAt as any).getTime();
      return now - created >= DAY;
    });

    const priceCache = new Map<string, number>();
    for (const s of pending) {
      if (!s.id) continue;
      try {
        let price = priceCache.get(s.symbol);
        if (price === undefined) {
          price = (await marketService.getCurrentPrice(s.symbol)).price;
          priceCache.set(s.symbol, price);
        }
        await this.evaluateSignal(s.id, price);
      } catch (e) {
        console.error('Failed to evaluate signal', s.id, e);
      }
    }
  }

  async getSignalStats(userId: string): Promise<{
    total: number; wins: number; losses: number; pending: number; winRate: number;
  }> {
    const signals = await this.getUserSignals(userId, 100);
    // Only directional calls (BUY/SELL) count toward the track record. HOLD is
    // non-directional and always scores 'expired_profit', so counting it would
    // inflate the win rate. Exclude it from both numerator and denominator.
    const directional = signals.filter(s => s.action !== 'HOLD');
    const evaluated = directional.filter(s => s.outcome && s.outcome !== 'pending');
    const wins = evaluated.filter(s => s.outcome === 'hit_target' || s.outcome === 'expired_profit').length;
    const losses = evaluated.filter(s => s.outcome === 'hit_stop' || s.outcome === 'expired_loss').length;
    return {
      total: directional.length,
      wins,
      losses,
      pending: directional.length - evaluated.length,
      winRate: evaluated.length > 0 ? (wins / evaluated.length) * 100 : 0,
    };
  }
}

export const signalHistoryService = new SignalHistoryService();
