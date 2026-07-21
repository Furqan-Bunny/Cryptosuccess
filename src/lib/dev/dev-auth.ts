// DEV-ONLY login bypass. When NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true', the
// AuthProvider skips Supabase entirely and hands every page a mock signed-in Pro
// user — so you can click through the whole app locally without real auth keys.
//
// ⚠️ This is a LOCAL DEVELOPMENT convenience. It is OFF by default (the flag must
// be explicitly set) and must NEVER be enabled in a real deployment: it hands out
// a Pro session to anyone. The client-side bypass only fakes the UI session — the
// server APIs still enforce real auth/quota — but do not ship with it on.
import type { User, UserProfile } from '@/types/user.types';

export const DEV_AUTH_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true';

export const MOCK_USER: User = {
  uid: 'dev-bypass-user',
  email: 'dev@localhost',
  displayName: 'Dev User',
  photoURL: null,
  emailVerified: true,
};

export const MOCK_PROFILE: UserProfile = {
  uid: MOCK_USER.uid,
  email: MOCK_USER.email!,
  displayName: 'Dev User',
  subscription: {
    status: 'pro',
    planId: 'dev',
    signalsUsedToday: 0,
    lastResetDate: new Date(),
  },
  preferences: {
    notifications: true,
    timezone: 'UTC',
    watchlist: ['BTC', 'ETH', 'SOL'],
    theme: 'system',
  },
  metadata: {
    createdAt: new Date(),
    lastLogin: new Date(),
    totalSignalsViewed: 0,
  },
};
