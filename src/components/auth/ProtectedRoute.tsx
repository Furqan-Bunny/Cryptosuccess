'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, PROFILE_NOT_FOUND_MESSAGE } from '@/hooks/useAuth';
import { isProSubscription } from '@/lib/signal-allowance';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { FaExclamationTriangle } from 'react-icons/fa';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requirePro?: boolean;
  redirectTo?: string;
}

// Only same-origin, path-only redirects are ever passed to the login page so the
// `?redirect=` value can't be abused as an open redirect.
function safeReturnPath(): string {
  const path = window.location.pathname || '/dashboard';
  return path.startsWith('/') && !path.startsWith('//') ? path : '/dashboard';
}

export default function ProtectedRoute({
  children,
  requirePro = false,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  const { user, profile, profileError, loading, refreshProfile, signOut } = useAuth();
  const router = useRouter();

  // When auth has settled but the profile is missing (fetch failed), a Pro user
  // must NOT be bounced to /pricing. Retry once automatically, then show an
  // error state with a manual retry.
  const autoRetriedRef = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const profileUnavailable = !loading && !!user && !profile;

  useEffect(() => {
    if (!requirePro || !profileUnavailable || autoRetriedRef.current) return;
    autoRetriedRef.current = true;
    setRetrying(true);
    refreshProfile().finally(() => setRetrying(false));
  }, [requirePro, profileUnavailable, refreshProfile]);

  useEffect(() => {
    if (loading) return;

    // Not authenticated
    if (!user) {
      router.push(`${redirectTo}?redirect=${encodeURIComponent(safeReturnPath())}`);
      return;
    }

    // Requires Pro: only redirect on a KNOWN non-Pro profile. An unknown
    // (failed-to-load) profile is handled by the error state below.
    if (requirePro && profile && !isProSubscription(profile.subscription)) {
      router.push('/pricing?upgrade=true');
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

  if (requirePro && !profile) {
    if (retrying || !autoRetriedRef.current) {
      return (
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner size="large" />
        </div>
      );
    }

    return (
      <div className="container mx-auto px-4 py-16 max-w-lg">
        <div className="card p-8 text-center" role="alert">
          <FaExclamationTriangle className="text-3xl text-yellow-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">We couldn&apos;t load your account</h2>
          <p className="text-text-secondary text-sm mb-6">
            Your plan details didn&apos;t load, so we can&apos;t open this page yet.
            {profileError === PROFILE_NOT_FOUND_MESSAGE
              ? ' Your account profile appears to be missing. If this keeps happening, please contact support.'
              : ' This is usually a temporary connection problem.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                setRetrying(true);
                refreshProfile().finally(() => setRetrying(false));
              }}
              className="btn-primary px-4 py-2 text-sm"
            >
              Try again
            </button>
            <button onClick={() => signOut().catch(() => {})} className="btn-secondary px-4 py-2 text-sm">
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Requires Pro but the user is known to be non-Pro (redirecting)
  if (requirePro && profile && !isProSubscription(profile.subscription)) {
    return null;
  }

  return <>{children}</>;
}
