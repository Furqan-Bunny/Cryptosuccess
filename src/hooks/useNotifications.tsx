'use client';

import { useState, useEffect, useCallback } from 'react';
import { notificationService, Notification } from '@/services/notification.service';
import { useAuth } from './useAuth';

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = notificationService.subscribeToNotifications(user.uid, (notifs) => {
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read).length);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const markAsRead = useCallback(async (notificationId: string) => {
    await notificationService.markAsRead(notificationId);
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (user) await notificationService.markAllAsRead(user.uid);
  }, [user]);

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead };
}
