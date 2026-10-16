import { supabase } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { User, UserProfile } from '@/types/user.types';
import { isProStatus, remainingFreeSignals } from '@/lib/signal-allowance';

// Re-export the canonical profile type for any legacy importers.
export type { UserProfile } from '@/types/user.types';

/** Map a Supabase auth user to the app's Firebase-shaped `User` so existing
 *  consumers (which read `user.uid`, `user.displayName`, …) keep working. */
export function toAppUser(u: SupabaseUser): User {
  const meta = (u.user_metadata ?? {}) as Record<string, any>;
  return {
    uid: u.id,
    email: u.email ?? null,
    displayName: meta.display_name ?? meta.full_name ?? meta.name ?? null,
    photoURL: meta.avatar_url ?? meta.picture ?? null,
    emailVerified: !!u.email_confirmed_at,
  };
}

function mapProfileRow(row: any): UserProfile {
  return {
    uid: row.id,
    email: row.email,
    displayName: row.display_name ?? undefined,
    photoURL: row.photo_url ?? undefined,
    subscription: {
      status: row.subscription_status,
      planId: row.plan_id ?? undefined,
      customerId: row.customer_id ?? undefined,
      currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end) : undefined,
      signalsUsedToday: row.signals_used_today ?? 0,
      lastResetDate: row.last_reset_date ? new Date(row.last_reset_date) : new Date(0),
    },
    preferences: {
      notifications: row.notifications ?? true,
      timezone: row.timezone ?? 'UTC',
      watchlist: row.watchlist ?? [],
    },
    metadata: {
      createdAt: row.created_at ? new Date(row.created_at) : new Date(),
      lastLogin: row.last_login ? new Date(row.last_login) : new Date(),
      totalSignalsViewed: row.total_signals_viewed ?? 0,
    },
  };
}

class AuthService {
  // Sign up with email + password. The profile row is created automatically by
  // the `handle_new_user` Postgres trigger.
  async signUp(email: string, password: string, displayName?: string): Promise<User | null> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: displayName ? { display_name: displayName } : undefined,
        emailRedirectTo: `${this.appUrl()}/auth/callback`,
      },
    });
    if (error) throw new Error(this.friendly(error.message));
    return data.user ? toAppUser(data.user) : null;
  }

  async signIn(email: string, password: string): Promise<User> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(this.friendly(error.message));
    await this.updateLastLogin(data.user.id);
    return toAppUser(data.user);
  }

  // Google sign-in is a redirect flow; the browser navigates away and returns
  // to /auth/callback, which establishes the session.
  async signInWithGoogle(): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${this.appUrl()}/auth/callback` },
    });
    if (error) throw new Error(this.friendly(error.message));
  }

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(this.friendly(error.message));
  }

  async resetPassword(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${this.appUrl()}/login`,
    });
    if (error) throw new Error(this.friendly(error.message));
  }

  // Returns null only when the row genuinely doesn't exist. A query/network
  // failure THROWS, so callers can tell "no profile" apart from "couldn't load
  // it" (e.g. ProtectedRoute must not treat a failed fetch as "not Pro").
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) throw new Error(error.message || 'Failed to load profile');
    return data ? mapProfileRow(data) : null;
  }

  // In-app notification opt-in (profiles.notifications). Owner RLS permits this
  // column; the subscription-protection trigger only guards billing columns.
  async updateNotificationPreference(uid: string, enabled: boolean): Promise<void> {
    const { error } = await supabase.from('profiles').update({ notifications: enabled }).eq('id', uid);
    if (error) throw new Error(error.message || 'Failed to update notification preference');
  }

  private async updateLastLogin(uid: string): Promise<void> {
    await supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', uid);
  }

  async isProUser(uid: string): Promise<boolean> {
    const profile = await this.getUserProfile(uid);
    return isProStatus(profile?.subscription.status);
  }

  // Read-only, DISPLAY-ONLY view of the free-tier daily signal allowance.
  // The authoritative gate AND the counter mutation live server-side in the
  // `consume_signal` Postgres RPC, called by /api/ai/analyst. This method never
  // writes; it delegates to the shared UTC-correct helper so every screen
  // shows the same number.
  async checkSignalLimit(uid: string): Promise<{ allowed: boolean; remaining: number }> {
    const profile = await this.getUserProfile(uid);
    if (!profile) return { allowed: false, remaining: 0 };
    const remaining = remainingFreeSignals(profile.subscription);
    return { allowed: remaining === -1 || remaining > 0, remaining };
  }

  private appUrl(): string {
    if (typeof window !== 'undefined') return window.location.origin;
    return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  }

  private friendly(message: string): string {
    const m = message.toLowerCase();
    if (m.includes('invalid login')) return 'Invalid email or password.';
    if (m.includes('already registered') || m.includes('already been registered'))
      return 'This email is already registered. Please sign in instead.';
    if (m.includes('password')) return message; // e.g. "Password should be at least 6 characters"
    if (m.includes('email')) return message;
    return message || 'Authentication error.';
  }
}

export const authService = new AuthService();
