import { supabase } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { User, UserProfile } from '@/types/user.types';

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

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) {
      console.error('[AuthService] getUserProfile error:', error.message);
      return null;
    }
    return data ? mapProfileRow(data) : null;
  }

  private async updateLastLogin(uid: string): Promise<void> {
    await supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', uid);
  }

  async isProUser(uid: string): Promise<boolean> {
    const profile = await this.getUserProfile(uid);
    return profile?.subscription.status === 'pro';
  }

  // Daily signal limit for free users (5/day). Resets lazily at UTC midnight.
  async checkSignalLimit(uid: string): Promise<{ allowed: boolean; remaining: number }> {
    const profile = await this.getUserProfile(uid);
    if (!profile) return { allowed: false, remaining: 0 };
    if (profile.subscription.status === 'pro') return { allowed: true, remaining: -1 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastReset = new Date(profile.subscription.lastResetDate);
    lastReset.setHours(0, 0, 0, 0);

    if (today > lastReset) {
      await supabase
        .from('profiles')
        .update({ signals_used_today: 0, last_reset_date: new Date().toISOString() })
        .eq('id', uid);
      return { allowed: true, remaining: 5 };
    }

    const used = profile.subscription.signalsUsedToday || 0;
    const remaining = Math.max(0, 5 - used);
    return { allowed: remaining > 0, remaining };
  }

  async incrementSignalUsage(uid: string): Promise<void> {
    const profile = await this.getUserProfile(uid);
    if (!profile || profile.subscription.status !== 'free') return;
    await supabase
      .from('profiles')
      .update({
        signals_used_today: (profile.subscription.signalsUsedToday || 0) + 1,
        total_signals_viewed: (profile.metadata.totalSignalsViewed || 0) + 1,
      })
      .eq('id', uid);
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
