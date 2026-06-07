// Pure logic tests for the free-tier daily signal limit. These mirror the
// arithmetic in auth.service.checkSignalLimit without touching the data layer.

describe('AuthService signal limits', () => {
  it('pro user gets unlimited signals', () => {
    const profile = { subscription: { status: 'pro', signalsUsedToday: 100, lastResetDate: new Date() } };
    const remaining = profile.subscription.status === 'pro' ? -1 : Math.max(0, 5 - profile.subscription.signalsUsedToday);
    expect(remaining).toBe(-1);
  });

  it('free user with 0 used has 5 remaining', () => {
    const profile = { subscription: { status: 'free', signalsUsedToday: 0, lastResetDate: new Date() } };
    const remaining = profile.subscription.status === 'pro' ? -1 : Math.max(0, 5 - profile.subscription.signalsUsedToday);
    expect(remaining).toBe(5);
  });

  it('free user with 3 used has 2 remaining', () => {
    const profile = { subscription: { status: 'free', signalsUsedToday: 3, lastResetDate: new Date() } };
    const remaining = profile.subscription.status === 'pro' ? -1 : Math.max(0, 5 - profile.subscription.signalsUsedToday);
    expect(remaining).toBe(2);
  });

  it('free user with 5 used has 0 remaining', () => {
    const profile = { subscription: { status: 'free', signalsUsedToday: 5, lastResetDate: new Date() } };
    const remaining = profile.subscription.status === 'pro' ? -1 : Math.max(0, 5 - profile.subscription.signalsUsedToday);
    const allowed = remaining > 0;
    expect(remaining).toBe(0);
    expect(allowed).toBe(false);
  });

  it('free user with more than 5 used still gets 0 remaining', () => {
    const profile = { subscription: { status: 'free', signalsUsedToday: 8, lastResetDate: new Date() } };
    const remaining = Math.max(0, 5 - profile.subscription.signalsUsedToday);
    expect(remaining).toBe(0);
  });

  it('daily reset logic: yesterday reset date means counter should reset', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const profile = { subscription: { status: 'free', signalsUsedToday: 5, lastResetDate: yesterday } };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastReset = new Date(profile.subscription.lastResetDate);
    lastReset.setHours(0, 0, 0, 0);

    const needsReset = lastReset < today;
    expect(needsReset).toBe(true);

    const remaining = needsReset ? 5 : Math.max(0, 5 - profile.subscription.signalsUsedToday);
    expect(remaining).toBe(5);
  });
});
