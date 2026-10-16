'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { authService, toAppUser } from '@/services/auth.service';
import { User, UserProfile } from '@/types/user.types';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  /** Set when the last profile fetch failed (or the row was missing); cleared on success. */
  profileError: string | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Re-fetch the profile. Resolves to the fresh profile, or null if it failed. */
  refreshProfile: () => Promise<UserProfile | null>;
}

function sameUser(a: User | null, b: User | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.uid === b.uid &&
    a.email === b.email &&
    a.displayName === b.displayName &&
    a.photoURL === b.photoURL &&
    a.emailVerified === b.emailVerified
  );
}

export const PROFILE_NOT_FOUND_MESSAGE = 'Your account profile could not be found.';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Monotonic id for profile fetches: a slower, older response must never
  // overwrite a newer one (or resurrect a profile after sign-out).
  const fetchSeqRef = useRef(0);
  const currentUidRef = useRef<string | null>(null);

  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
    const seq = ++fetchSeqRef.current;
    try {
      const userProfile = await authService.getUserProfile(uid);
      if (seq !== fetchSeqRef.current) return userProfile; // superseded
      setProfile(userProfile);
      setProfileError(userProfile ? null : PROFILE_NOT_FOUND_MESSAGE);
      return userProfile;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      if (seq === fetchSeqRef.current) {
        // Keep any previously loaded profile (a transient refresh failure
        // shouldn't downgrade the UI); just surface the error.
        setProfileError(error instanceof Error ? error.message : 'Failed to load your profile.');
      }
      return null;
    }
  }, []);

  useEffect(() => {
    // onAuthStateChange fires an INITIAL_SESSION event on subscribe, so this
    // also covers the initial load. The callback stays synchronous: awaiting
    // other Supabase calls inside it can deadlock on the client's auth lock,
    // so the profile fetch is deferred to the next tick.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const appUser = session?.user ? toAppUser(session.user) : null;
      // Keep the same object when nothing changed (e.g. hourly TOKEN_REFRESHED)
      // so effects keyed on `user` don't refire across the app.
      setUser(prev => (sameUser(prev, appUser) ? prev : appUser));

      if (!appUser) {
        fetchSeqRef.current += 1; // invalidate any in-flight fetch
        currentUidRef.current = null;
        setProfile(null);
        setProfileError(null);
        setLoading(false);
        return;
      }

      if (currentUidRef.current !== appUser.uid) {
        // Different account: never show the previous user's profile.
        currentUidRef.current = appUser.uid;
        setProfile(null);
        setProfileError(null);
      }

      setTimeout(() => {
        fetchUserProfile(appUser.uid).finally(() => setLoading(false));
      }, 0);
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
    try {
      setLoading(true);
      await authService.signOut();
      fetchSeqRef.current += 1;
      currentUidRef.current = null;
      setUser(null);
      setProfile(null);
      setProfileError(null);
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

  const refreshProfile = useCallback(async (): Promise<UserProfile | null> => {
    const uid = currentUidRef.current;
    if (!uid) return null;
    return fetchUserProfile(uid);
  }, [fetchUserProfile]);

  const value: AuthContextType = {
    user,
    profile,
    profileError,
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
