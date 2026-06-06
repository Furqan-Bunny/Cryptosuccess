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
} from 'firebase/firestore';
import { marketService } from './market.service';
import { paperAccountService } from './paper-account.service';
import {
  FuturesPosition,
  PositionSide,
  buildPosition,
  computePnl,
  MAX_LEVERAGE,
  MIN_LEVERAGE,
} from '@/lib/futures';

export interface OpenPositionInput {
  symbol: string;
  side: PositionSide;
  leverage: number;
  marginUsd: number;
}

export interface OpenPositionResult {
  success: boolean;
  positionId?: string;
  error?: string;
}

// Client-side paper-futures: opens/closes positions and moves margin in/out of
// the simulated cash account. Liquidation is enforced server-side by the engine
// (services/engine/order-engine.ts) on the mark (spot) price.
class FuturesService {
  async openPosition(uid: string, input: OpenPositionInput): Promise<OpenPositionResult> {
    const { symbol, side, leverage, marginUsd } = input;

    if (leverage < MIN_LEVERAGE || leverage > MAX_LEVERAGE) {
      return { success: false, error: `Leverage must be between ${MIN_LEVERAGE}x and ${MAX_LEVERAGE}x` };
    }
    if (!marginUsd || marginUsd <= 0) {
      return { success: false, error: 'Margin must be greater than 0' };
    }

    try {
      const balance = await paperAccountService.getBalance(uid);
      if (marginUsd > balance) {
        return { success: false, error: 'Insufficient paper balance for this margin' };
      }

      const entryPrice = (await marketService.getCurrentPrice(symbol)).price;
      if (!entryPrice || entryPrice <= 0) {
        return { success: false, error: 'Could not fetch entry price' };
      }

      const { quantity, liquidationPrice } = buildPosition(side, entryPrice, leverage, marginUsd);

      // Lock the margin first; if this throws, no position is created.
      await paperAccountService.adjustBalance(uid, -marginUsd);

      const positionData: Omit<FuturesPosition, 'id'> = {
        userId: uid,
        symbol: symbol.toUpperCase(),
        side,
        leverage,
        entryPrice,
        quantity,
        marginUsd,
        marginMode: 'isolated',
        liquidationPrice,
        status: 'open',
        openedAt: serverTimestamp() as any,
      };

      const ref = await addDoc(collection(db, 'futures_positions'), positionData);
      return { success: true, positionId: ref.id };
    } catch (error: any) {
      console.error('Error opening futures position:', error);
      return { success: false, error: error?.message || 'Failed to open position' };
    }
  }

  async closePosition(uid: string, positionId: string): Promise<{ success: boolean; realizedPnl?: number; error?: string }> {
    try {
      const ref = doc(db, 'futures_positions', positionId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return { success: false, error: 'Position not found' };

      const pos = snap.data() as FuturesPosition;
      if (pos.userId !== uid) return { success: false, error: 'Unauthorized' };
      if (pos.status !== 'open') return { success: false, error: `Position already ${pos.status}` };

      const markPrice = (await marketService.getCurrentPrice(pos.symbol)).price;
      const realizedPnl = computePnl(pos.side, pos.entryPrice, markPrice, pos.quantity);

      // Return margin + PnL to the cash account (never less than 0 — a deeper
      // loss would already have triggered liquidation).
      const credit = Math.max(0, pos.marginUsd + realizedPnl);
      await paperAccountService.adjustBalance(uid, credit);

      await updateDoc(ref, {
        status: 'closed',
        closePrice: markPrice,
        realizedPnl,
        closedAt: serverTimestamp(),
      });

      return { success: true, realizedPnl };
    } catch (error: any) {
      console.error('Error closing futures position:', error);
      return { success: false, error: error?.message || 'Failed to close position' };
    }
  }

  async listPositions(uid: string): Promise<FuturesPosition[]> {
    const q = query(
      collection(db, 'futures_positions'),
      where('userId', '==', uid),
      orderBy('openedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<FuturesPosition, 'id'>) }));
  }
}

export const futuresService = new FuturesService();
