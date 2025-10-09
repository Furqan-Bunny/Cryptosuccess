import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  FaChartLine,
  FaSignal,
  FaWallet,
  FaExchangeAlt,
  FaChartBar,
  FaBell,
  FaCog,
  FaSignOutAlt,
  FaCrown
} from 'react-icons/fa';

interface NavLinkProps {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  requiresPro?: boolean;
}

function NavLink({ href, icon, children, requiresPro }: NavLinkProps) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const isActive = pathname === href;
  const isPro = profile?.subscription?.status === 'pro';

  if (requiresPro && !isPro) {
    return (
      <Link
        href="/pricing"
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

  // Get page title based on current route
  const getPageTitle = () => {
    switch (pathname) {
      case '/dashboard':
        return 'Dashboard';
      case '/market':
        return 'Market Overview';
      case '/signals':
        return 'AI Trading Signals';
      case '/portfolio':
        return 'Portfolio Tracking';
      case '/trade':
        return 'Trade Execution';
      default:
        return 'CryptoSuccess';
    }
  };

  return (
    <nav className="bg-surface border-b border-gray-800 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Left side - Logo and Title */}
          <div className="flex items-center space-x-4">
            <Link href="/" className="text-2xl font-bold gradient-text">
              CryptoSuccess
            </Link>
            <span className="text-text-secondary hidden md:block">
              {getPageTitle()}
            </span>
          </div>

          {/* Center - Main Navigation */}
          <div className="flex items-center space-x-2">
            <NavLink href="/dashboard" icon={<FaChartBar />}>
              Dashboard
            </NavLink>
            <NavLink href="/market" icon={<FaChartLine />}>
              Market
            </NavLink>
            <NavLink href="/signals" icon={<FaSignal />}>
              Signals
            </NavLink>
            <NavLink href="/portfolio" icon={<FaWallet />} requiresPro>
              Portfolio
            </NavLink>
            <NavLink href="/trade" icon={<FaExchangeAlt />} requiresPro>
              Trade
            </NavLink>
          </div>

          {/* Right side - User Menu */}
          <div className="flex items-center space-x-4">
            {/* Subscription Status */}
            {profile?.subscription?.status === 'free' && (
              <Link
                href="/pricing"
                className="hidden md:flex items-center space-x-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm hover:bg-primary/20 transition-colors"
              >
                <FaCrown />
                <span>Upgrade to Pro</span>
              </Link>
            )}

            {/* Notifications */}
            <button className="text-text-secondary hover:text-white p-2 relative">
              <FaBell size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full"></span>
            </button>

            {/* Settings */}
            <button className="text-text-secondary hover:text-white p-2">
              <FaCog size={20} />
            </button>

            {/* Sign Out */}
            <button
              onClick={signOut}
              className="text-text-secondary hover:text-white p-2 flex items-center space-x-2"
            >
              <FaSignOutAlt size={20} />
              <span className="hidden md:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu - Could be implemented with a hamburger menu */}
    </nav>
  );
}