// Exercises the REAL AuthService (profile mapping, error propagation and the
// display-only daily allowance) against a stubbed Supabase client, instead of
// re-implementing the arithmetic in the test.

type QueryResult = { data: any; error: { message: string } | null };

let nextResult: QueryResult = { data: null, error: null };
let nextUpdateError: { message: string } | null = null;
const updateCalls: Array<{ table: string; patch: any; eq: [string, any] }> = [];

jest.mock('../../src/lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => nextResult,
        }),
      }),
      update: (patch: any) => ({
        eq: async (col: string, val: any) => {
          updateCalls.push({ table, patch, eq: [col, val] });
          return { error: nextUpdateError };
        },
      }),
    }),
  },
}));

import { authService } from '../../src/services/auth.service';

function profileRow(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    email: 'a@example.com',
    subscription_status: 'free',
    signals_used_today: 0,
    last_reset_date: new Date().toISOString(),
    notifications: true,
    watchlist: ['ETH'],
    created_at: '2026-01-01T00:00:00Z',
    last_login: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  nextResult = { data: null, error: null };
  nextUpdateError = null;
  updateCalls.length = 0;
});

describe('AuthService.getUserProfile', () => {
  it('maps snake_case columns to the camelCase profile', async () => {
    nextResult = { data: profileRow({ signals_used_today: 2, notifications: false }), error: null };
    const p = await authService.getUserProfile('user-1');
    expect(p).not.toBeNull();
    expect(p!.uid).toBe('user-1');
    expect(p!.subscription.status).toBe('free');
    expect(p!.subscription.signalsUsedToday).toBe(2);
    expect(p!.subscription.lastResetDate).toBeInstanceOf(Date);
    expect(p!.preferences.notifications).toBe(false);
  });

  it('returns null when the row does not exist', async () => {
    nextResult = { data: null, error: null };
    await expect(authService.getUserProfile('missing')).resolves.toBeNull();
  });

  it('throws (instead of silently returning null) when the query fails', async () => {
    nextResult = { data: null, error: { message: 'network down' } };
    await expect(authService.getUserProfile('user-1')).rejects.toThrow('network down');
  });
});

describe('AuthService.checkSignalLimit', () => {
  it('Pro users are unlimited', async () => {
    nextResult = { data: profileRow({ subscription_status: 'pro', signals_used_today: 100 }), error: null };
    await expect(authService.checkSignalLimit('user-1')).resolves.toEqual({ allowed: true, remaining: -1 });
  });

  it('free user with 3 used today has 2 left', async () => {
    nextResult = { data: profileRow({ signals_used_today: 3 }), error: null };
    await expect(authService.checkSignalLimit('user-1')).resolves.toEqual({ allowed: true, remaining: 2 });
  });

  it('free user at the cap is blocked', async () => {
    nextResult = { data: profileRow({ signals_used_today: 5 }), error: null };
    await expect(authService.checkSignalLimit('user-1')).resolves.toEqual({ allowed: false, remaining: 0 });
  });

  it('cancelled users are metered like free users', async () => {
    nextResult = { data: profileRow({ subscription_status: 'cancelled', signals_used_today: 5 }), error: null };
    await expect(authService.checkSignalLimit('user-1')).resolves.toEqual({ allowed: false, remaining: 0 });
  });

  it('a counter from an earlier UTC day shows the full allowance', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    nextResult = { data: profileRow({ signals_used_today: 5, last_reset_date: twoDaysAgo }), error: null };
    await expect(authService.checkSignalLimit('user-1')).resolves.toEqual({ allowed: true, remaining: 5 });
  });

  it('no profile row means not allowed', async () => {
    nextResult = { data: null, error: null };
    await expect(authService.checkSignalLimit('user-1')).resolves.toEqual({ allowed: false, remaining: 0 });
  });
});

describe('AuthService.updateNotificationPreference', () => {
  it('writes only the notifications column for the given user', async () => {
    await authService.updateNotificationPreference('user-1', false);
    expect(updateCalls).toEqual([{ table: 'profiles', patch: { notifications: false }, eq: ['id', 'user-1'] }]);
  });

  it('surfaces write errors so the UI can revert', async () => {
    nextUpdateError = { message: 'denied' };
    await expect(authService.updateNotificationPreference('user-1', true)).rejects.toThrow('denied');
  });
});
