'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { isProSubscription } from '@/lib/signal-allowance';
import {
  FaChartBar,
  FaChartLine,
  FaSignal,
  FaNewspaper,
  FaCompass,
  FaWallet,
  FaExchangeAlt,
  FaBolt,
  FaCoins,
  FaSyncAlt,
  FaCog,
  FaSignOutAlt,
  FaCrown,
} from 'react-icons/fa';
import type { IconType } from 'react-icons';

interface NavItem {
  href: string;
  label: string;
  icon: IconType;
  pro?: boolean;
}

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: FaChartBar },
      { href: '/market', label: 'Market', icon: FaChartLine },
      { href: '/signals', label: 'Signals', icon: FaSignal },
      { href: '/brief', label: 'Brief', icon: FaNewspaper },
      { href: '/discover', label: 'Discover', icon: FaCompass, pro: true },
    ],
  },
  {
    title: 'Trading',
    items: [
      { href: '/portfolio', label: 'Portfolio', icon: FaWallet, pro: true },
      { href: '/trade', label: 'Trade', icon: FaExchangeAlt, pro: true },
      { href: '/futures', label: 'Futures', icon: FaBolt, pro: true },
      { href: '/staking', label: 'Staking', icon: FaCoins, pro: true },
      { href: '/dca', label: 'DCA', icon: FaSyncAlt, pro: true },
    ],
  },
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const isPro = isProSubscription(profile?.subscription);

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const locked = item.pro && !isPro;
    const href = locked ? '/pricing' : item.href;
    const active = pathname === item.href;

    return (
      <Link
        key={item.href}
        href={href}
        onClick={onNavigate}
        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? 'bg-primary/10 text-primary'
            : 'text-text-secondary hover:text-white hover:bg-surface-hover'
        }`}
      >
        {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" />}
        <Icon className="text-base shrink-0" />
        <span className="truncate">{item.label}</span>
        {item.pro && (
          <FaCrown
            className={`ml-auto text-xs ${locked ? 'text-primary' : 'text-yellow-400/70'}`}
            title="Pro feature"
          />
        )}
      </Link>
    );
  };

  return (
    <div className="flex h-full w-64 flex-col bg-surface border-r border-gray-800">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-gray-800 shrink-0">
        <Link href="/dashboard" onClick={onNavigate} className="text-xl font-bold gradient-text">
          CryptoSuccess
        </Link>
      </div>

      {/* Sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {SECTIONS.map(section => (
          <div key={section.title}>
            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary/60">
              {section.title}
            </p>
            <div className="space-y-1">{section.items.map(renderItem)}</div>
          </div>
        ))}
      </nav>

      {/* Bottom block */}
      <div className="border-t border-gray-800 p-3 space-y-1 shrink-0">
        {profile && !isProSubscription(profile.subscription) && (
          <Link
            href="/pricing"
            onClick={onNavigate}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <FaCrown className="text-xs" />
            <span>Upgrade to Pro</span>
          </Link>
        )}
        <Link
          href="/settings"
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            pathname === '/settings'
              ? 'bg-primary/10 text-primary'
              : 'text-text-secondary hover:text-white hover:bg-surface-hover'
          }`}
        >
          <FaCog className="text-base" />
          <span>Settings</span>
        </Link>
        <button
          onClick={() => {
            onNavigate?.();
            signOut();
          }}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-surface-hover transition-colors"
        >
          <FaSignOutAlt className="text-base" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
