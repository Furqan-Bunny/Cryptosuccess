'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { notificationService, Notification } from '@/services/notification.service';
import { useAuth } from './useAuth';

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

// ONE realtime subscription per signed-in session, shared by every consumer
// (Topbar badge, NotificationPanel, …). Previously each component that called
// the hook opened its own channel and its own initial fetch.
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let active = true;
    const unsubscribe = notificationService.subscribeToNotifications(uid, notifs => {
      if (!active) return;
      setNotifications(notifs);
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid]);

  // Optimistic: flip locally right away; the realtime refetch reconciles. On
  // failure, put the previous state back.
  const markAsRead = useCallback(async (notificationId: string) => {
    let previous: Notification[] = [];
    setNotifications(cur => {
      previous = cur;
      return cur.map(n => (n.id === notificationId ? { ...n, read: true } : n));
    });
    try {
      await notificationService.markAsRead(notificationId);
    } catch (error) {
      console.error('Error marking notification read:', error);
      setNotifications(previous);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!uid) return;
    let previous: Notification[] = [];
    setNotifications(cur => {
      previous = cur;
      return cur.map(n => (n.read ? n : { ...n, read: true }));
    });
    try {
      await notificationService.markAllAsRead(uid);
    } catch (error) {
      console.error('Error marking notifications read:', error);
      setNotifications(previous);
    }
  }, [uid]);

  const value = useMemo<NotificationsContextType>(
    () => ({
      notifications,
      unreadCount: notifications.filter(n => !n.read).length,
      loading,
      markAsRead,
      markAllAsRead,
    }),
    [notifications, loading, markAsRead, markAllAsRead]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextType {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}
