'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { isProStatus } from '@/lib/signal-allowance';
import { useNotifications } from '@/hooks/useNotifications';
import NotificationPanel from './NotificationPanel';
import { FaBars, FaBell, FaCrown } from 'react-icons/fa';

function getPageTitle(pathname: string): string {
  if (pathname.startsWith('/market/')) return 'Coin Detail';
  switch (pathname) {
    case '/dashboard': return 'Dashboard';
    case '/market': return 'Market Overview';
    case '/signals': return 'AI Trading Signals';
    case '/brief': return 'Daily Market Brief';
    case '/discover': return 'Discover';
    case '/portfolio': return 'Portfolio';
    case '/trade': return 'Trade Execution';
    case '/futures': return 'Paper Futures';
    case '/staking': return 'Staking';
    case '/dca': return 'Recurring Buys';
    case '/settings': return 'Settings';
    default: return 'CryptoSuccess';
  }
}

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const { user, profile } = useAuth();
  const { unreadCount } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const userInitial =
    user?.displayName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U';

  return (
    <header className="sticky top-0 z-40 h-16 flex items-center justify-between gap-4 px-4 md:px-6 border-b border-gray-800 bg-surface/80 backdrop-blur">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenu}
          className="md:hidden text-text-secondary hover:text-white p-2 -ml-2"
          aria-label="Open menu"
        >
          <FaBars size={20} />
        </button>
        <h1 className="text-lg font-semibold text-white truncate">{getPageTitle(pathname ?? '')}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {profile && !isProStatus(profile.subscription?.status) && (
          <Link
            href="/pricing"
            className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm hover:bg-primary/20 transition-colors"
          >
            <FaCrown className="text-xs" />
            <span>Upgrade</span>
          </Link>
        )}

        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="relative text-text-secondary hover:text-white p-2"
            aria-label="Notifications"
          >
            <FaBell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <NotificationPanel isOpen={notifOpen} onClose={() => setNotifOpen(false)} />
        </div>

        <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm overflow-hidden">
          {user?.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoURL} alt="" className="w-9 h-9 rounded-full object-cover" />
          ) : (
            userInitial
          )}
        </div>
      </div>
    </header>
  );
}
