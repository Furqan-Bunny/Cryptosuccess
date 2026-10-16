import { supabase } from '@/lib/supabase/client';

export type NotificationType = 'signal' | 'price_alert' | 'system' | 'subscription';

export interface Notification {
  id?: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  /** ISO-8601 timestamp string from Postgres (timestamptz). */
  createdAt: string;
  data?: Record<string, any>;
}

function mapRow(row: any): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    read: row.read,
    createdAt: row.created_at,
    data: row.data ?? undefined,
  };
}

class NotificationService {
  async getNotifications(userId: string, maxResults = 20): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(maxResults);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  }

  async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);
    if (error) return 0;
    return count ?? 0;
  }

  async markAsRead(notificationId: string): Promise<void> {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
    if (error) throw new Error(error.message);
  }

  async markAllAsRead(userId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
    if (error) throw new Error(error.message);
  }

  // Notifications are produced server-side (service role), e.g. by the signal
  // evaluation cron. Clients only read them and flip `read`.

  // Realtime subscription (replaces Firestore onSnapshot). Returns an
  // unsubscribe function. Refetches the list on any change for this user.
  // A unique channel name per call avoids the "cannot add postgres_changes
  // callbacks after subscribe()" error that occurs when a channel name is
  // reused, and the whole thing is guarded so a realtime failure can never
  // crash the app (notifications simply won't be live).
  subscribeToNotifications(userId: string, callback: (notifications: Notification[]) => void): () => void {
    // Refetches can resolve out of order; only deliver the newest one.
    let seq = 0;
    let closed = false;
    const refresh = async () => {
      const mine = ++seq;
      try {
        const list = await this.getNotifications(userId, 20);
        if (!closed && mine === seq) callback(list);
      } catch {
        // Keep whatever is displayed; on the very first load show an empty list.
        if (!closed && mine === 1 && seq === 1) callback([]);
      }
    };
    refresh();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`notifications:${userId}:${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          () => {
            refresh();
          }
        )
        .subscribe();
    } catch (e) {
      console.warn('Realtime notifications unavailable:', e);
    }

    return () => {
      closed = true;
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          /* ignore */
        }
      }
    };
  }
}

export const notificationService = new NotificationService();
