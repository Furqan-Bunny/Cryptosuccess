import { db } from './firebase';
import { doc, getDoc, setDoc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';

// A simulated USD cash account that powers the NEW paper-trading features
// (futures margin, staking principal). It is intentionally separate from the
// existing spot portfolio (which derives holdings from the `trades` ledger and
// has no cash concept) to keep the blast radius small.

export const STARTING_BALANCE_USD = 10_000;

export interface PaperAccount {
  userId: string;
  balanceUsd: number;
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

class PaperAccountService {
  private ref(uid: string) {
    return doc(db, 'paper_accounts', uid);
  }

  /** Fetch the account, creating it with the starting balance on first access. */
  async getAccount(uid: string): Promise<PaperAccount> {
    const ref = this.ref(uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const account = { userId: uid, balanceUsd: STARTING_BALANCE_USD };
      await setDoc(ref, { ...account, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return account;
    }
    return { userId: uid, ...(snap.data() as Omit<PaperAccount, 'userId'>) };
  }

  async getBalance(uid: string): Promise<number> {
    return (await this.getAccount(uid)).balanceUsd;
  }

  /**
   * Atomically change the balance. Throws if a deduction would overdraw the
   * account. Returns the new balance.
   */
  async adjustBalance(uid: string, deltaUsd: number): Promise<number> {
    const ref = this.ref(uid);
    return runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      const current = snap.exists()
        ? (snap.data().balanceUsd as number)
        : STARTING_BALANCE_USD;
      const next = current + deltaUsd;
      if (next < 0) {
        throw new Error('Insufficient paper balance');
      }
      if (!snap.exists()) {
        tx.set(ref, {
          userId: uid,
          balanceUsd: next,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.update(ref, { balanceUsd: next, updatedAt: serverTimestamp() });
      }
      return next;
    });
  }

  /** Reset the simulated account back to its starting balance. */
  async reset(uid: string): Promise<void> {
    await setDoc(this.ref(uid), {
      userId: uid,
      balanceUsd: STARTING_BALANCE_USD,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}

export const paperAccountService = new PaperAccountService();
