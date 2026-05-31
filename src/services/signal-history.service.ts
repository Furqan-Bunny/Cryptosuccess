import { db } from './firebase';
import {
  collection, doc, addDoc, getDocs, query, where, orderBy, limit,
  Timestamp, updateDoc, serverTimestamp
} from 'firebase/firestore';

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
  createdAt: Timestamp | Date;
  evaluatedAt?: Timestamp | Date;
  priceAt24h?: number;
  outcome?: 'hit_target' | 'hit_stop' | 'expired_profit' | 'expired_loss' | 'pending';
  profitLossPercent?: number;
}

class SignalHistoryService {
  private readonly collectionName = 'signals';

  async storeSignal(signal: Omit<StoredSignal, 'id' | 'createdAt' | 'outcome'>): Promise<string> {
    const docRef = await addDoc(collection(db, this.collectionName), {
      ...signal,
      createdAt: serverTimestamp(),
      outcome: 'pending',
    });
    return docRef.id;
  }

  async getUserSignals(userId: string, maxResults = 20): Promise<StoredSignal[]> {
    const q = query(
      collection(db, this.collectionName),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(maxResults)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as StoredSignal));
  }

  async evaluateSignal(signalId: string, currentPrice: number): Promise<void> {
    const signals = await getDocs(query(
      collection(db, this.collectionName),
      where('__name__', '==', signalId)
    ));
    if (signals.empty) return;

    const signal = signals.docs[0].data() as StoredSignal;
    const priceDiff = currentPrice - signal.entryPrice;
    const profitLossPercent = (priceDiff / signal.entryPrice) * 100;

    let outcome: StoredSignal['outcome'];
    if (signal.action === 'BUY') {
      if (currentPrice >= signal.targetPrice) outcome = 'hit_target';
      else if (currentPrice <= signal.stopLoss) outcome = 'hit_stop';
      else outcome = profitLossPercent >= 0 ? 'expired_profit' : 'expired_loss';
    } else if (signal.action === 'SELL') {
      if (currentPrice <= signal.targetPrice) outcome = 'hit_target';
      else if (currentPrice >= signal.stopLoss) outcome = 'hit_stop';
      else outcome = profitLossPercent <= 0 ? 'expired_profit' : 'expired_loss';
    } else {
      outcome = 'expired_profit';
    }

    await updateDoc(doc(db, this.collectionName, signalId), {
      priceAt24h: currentPrice,
      profitLossPercent,
      outcome,
      evaluatedAt: serverTimestamp(),
    });
  }

  async getSignalStats(userId: string): Promise<{
    total: number; wins: number; losses: number; pending: number; winRate: number;
  }> {
    const signals = await this.getUserSignals(userId, 100);
    const evaluated = signals.filter(s => s.outcome && s.outcome !== 'pending');
    const wins = evaluated.filter(s => s.outcome === 'hit_target' || s.outcome === 'expired_profit').length;
    const losses = evaluated.filter(s => s.outcome === 'hit_stop' || s.outcome === 'expired_loss').length;
    return {
      total: signals.length,
      wins,
      losses,
      pending: signals.length - evaluated.length,
      winRate: evaluated.length > 0 ? (wins / evaluated.length) * 100 : 0,
    };
  }
}

export const signalHistoryService = new SignalHistoryService();
