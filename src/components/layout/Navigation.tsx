'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import NotificationPanel from './NotificationPanel';
import {
  FaChartLine,
  FaSignal,
  FaWallet,
  FaExchangeAlt,
  FaChartBar,
  FaBell,
  FaCog,
  FaSignOutAlt,
  FaCrown,
  FaBars,
  FaTimes,
  FaUser,
  FaNewspaper,
} from 'react-icons/fa';

interface NavLinkProps {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  requiresPro?: boolean;
  onClick?: () => void;
}

function NavLink({ href, icon, children, requiresPro, onClick }: NavLinkProps) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const isActive = pathname === href;
  const isPro = profile?.subscription?.status === 'pro';

  if (requiresPro && !isPro) {
    return (
      <Link
        href="/pricing"
        onClick={onClick}
        className="flex items-center space-x-2 px-4 py-2 text-text-secondary hover:text-white transition-colors relative"
      >
        {icon}
        <span>{children}</span>
        <FaCrown className="text-xs text-primary absolute -top-1 -right-1" />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-text-secondary hover:text-white hover:bg-gray-800/50'
      }`}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}

export default function Navigation() {
  const { user, profile, signOut } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const { unreadCount } = useNotifications();
  const notifRef = useRef<HTMLDivElement>(null);

  // Close notification panel on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getPageTitle = () => {
    switch (pathname) {
      case '/dashboard': return 'Dashboard';
      case '/market': return 'Market Overview';
      case '/signals': return 'AI Trading Signals';
      case '/portfolio': return 'Portfolio Tracking';
      case '/trade': return 'Trade Execution';
      case '/settings': return 'Settings';
      default: return 'CryptoSuccess';
    }
  };

  const closeMobile = () => setMobileMenuOpen(false);

  const userInitial = user?.displayName?.charAt(0)?.toUpperCase()
    || user?.email?.charAt(0)?.toUpperCase()
    || 'U';

  return (
    <>
      <nav className="bg-surface border-b border-gray-800 sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Left side - Logo and Title */}
            <div className="flex items-center space-x-4">
              <Link href="/dashboard" className="text-2xl font-bold gradient-text">
                CryptoSuccess
              </Link>
              <span className="text-text-secondary hidden md:block">
                {getPageTitle()}
              </span>
            </div>

            {/* Center - Main Navigation (Desktop) */}
            <div className="hidden md:flex items-center space-x-2">
              <NavLink href="/dashboard" icon={<FaChartBar />}>Dashboard</NavLink>
              <NavLink href="/market" icon={<FaChartLine />}>Market</NavLink>
              <NavLink href="/signals" icon={<FaSignal />}>Signals</NavLink>
              <NavLink href="/brief" icon={<FaNewspaper />}>Brief</NavLink>
              <NavLink href="/portfolio" icon={<FaWallet />} requiresPro>Portfolio</NavLink>
              <NavLink href="/trade" icon={<FaExchangeAlt />} requiresPro>Trade</NavLink>
            </div>

            {/* Right side - User Menu (Desktop) */}
            <div className="hidden md:flex items-center space-x-3">
              {profile?.subscription?.status === 'free' && (
                <Link
                  href="/pricing"
                  className="flex items-center space-x-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm hover:bg-primary/20 transition-colors"
                >
                  <FaCrown />
                  <span>Upgrade</span>
                </Link>
              )}

              <Link href="/settings" className="text-text-secondary hover:text-white p-2">
                <FaCog size={20} />
              </Link>

              {/* Notification Bell */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setNotificationOpen(!notificationOpen)}
                  className="text-text-secondary hover:text-white p-2 relative"
                  aria-label="Notifications"
                >
                  <FaBell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                <NotificationPanel isOpen={notificationOpen} onClose={() => setNotificationOpen(false)} />
              </div>

              <button
                onClick={signOut}
                className="text-text-secondary hover:text-white p-2 flex items-center space-x-2"
              >
                <FaSignOutAlt size={20} />
              </button>

              {/* User Avatar */}
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  userInitial
                )}
              </div>
            </div>

            {/* Mobile hamburger button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-text-secondary hover:text-white p-2"
            >
              {mobileMenuOpen ? <FaTimes size={24} /> : <FaBars size={24} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={closeMobile}>
          <div
            className="absolute right-0 top-16 w-72 bg-surface border-l border-gray-800 h-[calc(100vh-4rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* User info */}
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full" />
                  ) : (
                    userInitial
                  )}
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{user?.displayName || user?.email?.split('@')[0]}</p>
                  <p className="text-text-secondary text-xs">
                    {profile?.subscription?.status === 'pro' ? 'Pro Plan' : 'Free Plan'}
                  </p>
                </div>
              </div>
            </div>

            {/* Navigation Links */}
            <div className="p-4 space-y-2">
              <NavLink href="/dashboard" icon={<FaChartBar />} onClick={closeMobile}>Dashboard</NavLink>
              <NavLink href="/market" icon={<FaChartLine />} onClick={closeMobile}>Market</NavLink>
              <NavLink href="/signals" icon={<FaSignal />} onClick={closeMobile}>Signals</NavLink>
              <NavLink href="/brief" icon={<FaNewspaper />} onClick={closeMobile}>Brief</NavLink>
              <NavLink href="/portfolio" icon={<FaWallet />} requiresPro onClick={closeMobile}>Portfolio</NavLink>
              <NavLink href="/trade" icon={<FaExchangeAlt />} requiresPro onClick={closeMobile}>Trade</NavLink>
            </div>

            <div className="border-t border-gray-800 p-4 space-y-2">
              <NavLink href="/settings" icon={<FaCog />} onClick={closeMobile}>Settings</NavLink>
              <button
                onClick={() => { closeMobile(); setNotificationOpen(true); }}
                className="flex items-center space-x-2 px-4 py-2 text-text-secondary hover:text-white w-full"
              >
                <FaBell />
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </button>
              {profile?.subscription?.status === 'free' && (
                <Link
                  href="/pricing"
                  onClick={closeMobile}
                  className="flex items-center space-x-2 px-4 py-2 bg-primary/10 text-primary rounded-lg"
                >
                  <FaCrown />
                  <span>Upgrade to Pro</span>
                </Link>
              )}
              <button
                onClick={() => { closeMobile(); signOut(); }}
                className="flex items-center space-x-2 px-4 py-2 text-red-400 hover:text-red-300 w-full"
              >
                <FaSignOutAlt />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
