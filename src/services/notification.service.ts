import { db } from './firebase';
import {
  collection, query, where, orderBy, limit, getDocs, doc,
  addDoc, updateDoc, serverTimestamp, onSnapshot, Unsubscribe
} from 'firebase/firestore';

export type NotificationType = 'signal' | 'price_alert' | 'system' | 'subscription';

export interface Notification {
  id?: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: any;
  data?: Record<string, any>;
}

class NotificationService {
  async getNotifications(userId: string, maxResults = 20): Promise<Notification[]> {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(maxResults)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
  }

  async getUnreadCount(userId: string): Promise<number> {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false)
    );
    const snapshot = await getDocs(q);
    return snapshot.size;
  }

  async markAsRead(notificationId: string): Promise<void> {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  }

  async markAllAsRead(userId: string): Promise<void> {
    const notifications = await this.getNotifications(userId, 50);
    const unread = notifications.filter(n => !n.read);
    await Promise.all(unread.map(n => this.markAsRead(n.id!)));
  }

  async createNotification(notification: Omit<Notification, 'id' | 'createdAt' | 'read'>): Promise<string> {
    const docRef = await addDoc(collection(db, 'notifications'), {
      ...notification,
      read: false,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  }

  subscribeToNotifications(userId: string, callback: (notifications: Notification[]) => void): Unsubscribe {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    return onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
      callback(notifications);
    }, (error) => {
      console.error('Notification listener error:', error);
      callback([]);
    });
  }
}

export const notificationService = new NotificationService();
