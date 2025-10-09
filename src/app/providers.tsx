'use client';

import { ReactNode } from 'react';
import { AuthProvider } from '@/hooks/useAuth';
import { Toaster } from 'react-hot-toast';

interface ProvidersProps {
  children: ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1A1B1F',
            color: '#FFFFFF',
            border: '1px solid #374151',
            borderRadius: '0.5rem',
          },
          success: {
            iconTheme: {
              primary: '#00D964',
              secondary: '#FFFFFF',
            },
          },
          error: {
            iconTheme: {
              primary: '#FF3B30',
              secondary: '#FFFFFF',
            },
          },
        }}
      />
    </AuthProvider>
  );
}