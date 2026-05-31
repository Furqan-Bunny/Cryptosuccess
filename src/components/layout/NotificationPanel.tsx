'use client';

import { useNotifications } from '@/hooks/useNotifications';
import { FaBell, FaSignal, FaCrown, FaExclamationCircle, FaTimes } from 'react-icons/fa';

function getIcon(type: string) {
  switch (type) {
    case 'signal': return <FaSignal className="text-primary" />;
    case 'subscription': return <FaCrown className="text-yellow-400" />;
    case 'price_alert': return <FaBell className="text-green-400" />;
    default: return <FaExclamationCircle className="text-text-secondary" />;
  }
}

function timeAgo(date: any): string {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();

  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-surface border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-white">
          Notifications {unreadCount > 0 && `(${unreadCount})`}
        </h3>
        <div className="flex items-center space-x-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-primary hover:text-primary-light"
            >
              Mark all read
            </button>
          )}
          <button onClick={onClose} className="text-text-secondary hover:text-white">
            <FaTimes size={14} />
          </button>
        </div>
      </div>

      {/* Notification List */}
      <div className="max-h-80 overflow-y-auto">
        {loading && (
          <div className="p-4 text-center text-text-secondary text-sm">Loading...</div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="p-8 text-center">
            <FaBell className="text-3xl text-gray-600 mx-auto mb-2" />
            <p className="text-text-secondary text-sm">No notifications yet</p>
          </div>
        )}

        {notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => n.id && !n.read && markAsRead(n.id)}
            className={`p-3 border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer ${
              !n.read ? 'border-l-2 border-l-primary bg-primary/5' : ''
            }`}
          >
            <div className="flex items-start space-x-3">
              <div className="mt-0.5">{getIcon(n.type)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{n.title}</p>
                <p className="text-xs text-text-secondary truncate">{n.message}</p>
                <p className="text-xs text-text-secondary mt-1">{timeAgo(n.createdAt)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
