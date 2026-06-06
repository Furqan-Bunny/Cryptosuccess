import { db } from './firebase';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

// Simulated dollar-cost-averaging schedules. The schedule itself lives in
// `dca_schedules`; execution (recording a simulated buy into `trades`) is done
// server-side by the /api/dca/run cron via the Admin SDK.

export type DcaCadence = 'daily' | 'weekly';

export interface DcaSchedule {
  id?: string;
  userId: string;
  symbol: string;
  amountUsd: number;
  cadence: DcaCadence;
  active: boolean;
  nextRunAt: Timestamp | Date;
  lastRunAt?: Timestamp | Date;
  createdAt: Timestamp | Date;
}

export function cadenceMs(cadence: DcaCadence): number {
  return cadence === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
}

class DcaService {
  async createSchedule(
    userId: string,
    input: { symbol: string; amountUsd: number; cadence: DcaCadence }
  ): Promise<string> {
    const nextRunAt = new Date(Date.now() + cadenceMs(input.cadence));
    const ref = await addDoc(collection(db, 'dca_schedules'), {
      userId,
      symbol: input.symbol.toUpperCase(),
      amountUsd: input.amountUsd,
      cadence: input.cadence,
      active: true,
      nextRunAt,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async listSchedules(userId: string): Promise<DcaSchedule[]> {
    const q = query(
      collection(db, 'dca_schedules'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<DcaSchedule, 'id'>) }));
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await updateDoc(doc(db, 'dca_schedules', id), { active });
  }

  async deleteSchedule(id: string): Promise<void> {
    await deleteDoc(doc(db, 'dca_schedules', id));
  }
}

export const dcaService = new DcaService();
