'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requirePro?: boolean;
  redirectTo?: string;
}

export default function ProtectedRoute({
  children,
  requirePro = false,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      // Not authenticated
      if (!user) {
        router.push(`${redirectTo}?redirect=${window.location.pathname}`);
        return;
      }

      // Requires pro subscription
      if (requirePro && profile?.subscription.status !== 'pro') {
        router.push('/pricing?upgrade=true');
        return;
      }
    }
  }, [user, profile, loading, requirePro, redirectTo, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return null;
  }

  // Requires pro but user is not pro
  if (requirePro && profile?.subscription.status !== 'pro') {
    return null;
  }

  return <>{children}</>;
}