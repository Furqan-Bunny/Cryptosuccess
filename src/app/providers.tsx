'use client';

import { ReactNode } from 'react';
import { AuthProvider } from '@/hooks/useAuth';
import { Toaster } from 'react-hot-toast';
import Web3Provider from '@/components/web3/Web3Provider';

interface ProvidersProps {
  children: ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      <Web3Provider>{children}</Web3Provider>
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