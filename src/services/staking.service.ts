import { db } from './firebase';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { paperAccountService } from './paper-account.service';

// Simulated staking. Principal is denominated in USD and locked from the paper
// cash account; rewards accrue lazily (computed on read) from the snapshotted
// APY. Unstaking returns principal + accrued rewards to the cash account.

export interface StakingRate {
  symbol: string;
  apy: number;
  source: 'defillama' | 'estimate';
}

export interface StakingPosition {
  id?: string;
  userId: string;
  symbol: string;
  amountUsd: number;
  apySnapshot: number;
  active: boolean;
  startedAt: Timestamp | Date;
  closedAt?: Timestamp | Date;
}

function toDate(value: any): Date {
  if (!value) return new Date();
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

/** Lazily-computed accrued reward (USD) for a position up to now. */
export function accruedRewards(pos: StakingPosition): number {
  const start = toDate(pos.startedAt).getTime();
  const end = pos.active ? Date.now() : toDate(pos.closedAt).getTime();
  const days = Math.max(0, (end - start) / (24 * 60 * 60 * 1000));
  return pos.amountUsd * (pos.apySnapshot / 100) * (days / 365);
}

class StakingService {
  async getRates(): Promise<Record<string, StakingRate>> {
    const snap = await getDocs(collection(db, 'staking_rates'));
    const map: Record<string, StakingRate> = {};
    snap.docs.forEach(d => {
      const data = d.data() as any;
      map[d.id] = { symbol: d.id, apy: data.apy, source: data.source };
    });
    return map;
  }

  async stake(uid: string, symbol: string, amountUsd: number, apy: number): Promise<{ success: boolean; error?: string }> {
    if (!amountUsd || amountUsd <= 0) return { success: false, error: 'Enter a valid amount' };
    try {
      const balance = await paperAccountService.getBalance(uid);
      if (amountUsd > balance) return { success: false, error: 'Insufficient paper balance' };

      await paperAccountService.adjustBalance(uid, -amountUsd);
      await addDoc(collection(db, 'staking_positions'), {
        userId: uid,
        symbol: symbol.toUpperCase(),
        amountUsd,
        apySnapshot: apy,
        active: true,
        startedAt: serverTimestamp(),
      });
      return { success: true };
    } catch (error: any) {
      console.error('Error staking:', error);
      return { success: false, error: error?.message || 'Failed to stake' };
    }
  }

  async unstake(uid: string, positionId: string): Promise<{ success: boolean; returned?: number; error?: string }> {
    try {
      const ref = doc(db, 'staking_positions', positionId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return { success: false, error: 'Position not found' };
      const pos = { id: snap.id, ...(snap.data() as Omit<StakingPosition, 'id'>) };
      if (pos.userId !== uid) return { success: false, error: 'Unauthorized' };
      if (!pos.active) return { success: false, error: 'Already unstaked' };

      const rewards = accruedRewards(pos);
      const returned = pos.amountUsd + rewards;
      await paperAccountService.adjustBalance(uid, returned);
      await updateDoc(ref, { active: false, closedAt: serverTimestamp() });
      return { success: true, returned };
    } catch (error: any) {
      console.error('Error unstaking:', error);
      return { success: false, error: error?.message || 'Failed to unstake' };
    }
  }

  async listPositions(uid: string): Promise<StakingPosition[]> {
    const q = query(
      collection(db, 'staking_positions'),
      where('userId', '==', uid),
      orderBy('startedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<StakingPosition, 'id'>) }));
  }
}

export const stakingService = new StakingService();
