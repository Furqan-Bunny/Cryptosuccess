'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { authService, toAppUser } from '@/services/auth.service';
import { User, UserProfile } from '@/types/user.types';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { DEV_AUTH_BYPASS, MOCK_USER, MOCK_PROFILE } from '@/lib/dev/dev-auth';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUserProfile = useCallback(async (uid: string) => {
    try {
      const userProfile = await authService.getUserProfile(uid);
      setProfile(userProfile);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  }, []);

  useEffect(() => {
    // DEV-ONLY: skip Supabase and hand every page a mock Pro session. Gated by
    // NEXT_PUBLIC_DEV_AUTH_BYPASS — see src/lib/dev/dev-auth.ts.
    if (DEV_AUTH_BYPASS) {
      console.warn('[dev-auth] Login bypass is ON — using a mock Pro user. Do NOT enable in production.');
      setUser(MOCK_USER);
      setProfile(MOCK_PROFILE);
      setLoading(false);
      return;
    }

    // onAuthStateChange fires an INITIAL_SESSION event on subscribe, so this
    // also covers the initial load.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const appUser = session?.user ? toAppUser(session.user) : null;
      setUser(appUser);
      if (appUser) {
        await fetchUserProfile(appUser.uid);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchUserProfile]);

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      setLoading(true);
      const newUser = await authService.signUp(email, password, displayName);
      if (newUser) {
        await fetchUserProfile(newUser.uid);
        toast.success('Account created successfully!');
        router.push('/dashboard');
      } else {
        // Email confirmation is enabled on the Supabase project.
        toast.success('Account created! Check your email to confirm, then sign in.');
        router.push('/login');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create account');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      const currentUser = await authService.signIn(email, password);
      await fetchUserProfile(currentUser.uid);
      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to sign in');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    try {
      // Redirects to Google and returns to /auth/callback; the listener above
      // picks up the new session afterwards.
      await authService.signInWithGoogle();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to sign in with Google');
      throw error;
    }
  };

  const signOut = async () => {
    // In bypass mode there's no real session to end — just go home.
    if (DEV_AUTH_BYPASS) {
      toast.success('Signed out (dev bypass)');
      router.push('/');
      return;
    }
    try {
      setLoading(true);
      await authService.signOut();
      setUser(null);
      setProfile(null);
      toast.success('Signed out successfully');
      router.push('/');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to sign out');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      setLoading(true);
      await authService.resetPassword(email);
      toast.success('Password reset email sent! Check your inbox.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send reset email');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchUserProfile(user.uid);
    }
  };

  const value: AuthContextType = {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
