'use client';

import Navigation from '@/components/layout/Navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <Navigation />
        <main>{children}</main>
      </div>
    </ProtectedRoute>
  );
}
