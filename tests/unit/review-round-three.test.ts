// Third review pass: frozen (halted) prices, flat-move scoring, futures limits,
// card vs crypto Pro, the web risk note, the bot's runtime hype guardrail and
// stay-out wording, paused alerts, and the engine's paged scan.
import { freshTickerPrice, MAX_TICKER_AGE_MS } from '@/lib/ticker-freshness';
import { deriveOutcome, isDirectionalWin } from '@/lib/signal-outcome';
import { validateOpenFuturesInput } from '@/lib/paper-input';
import { MIN_MARGIN_USD } from '@/lib/futures';
import { COINS, isSupportedCoin } from '@/lib/coins';
import {
  hasActiveCardSubscription,
  laterIso,
  replacesActiveCryptoPro,
} from '@/lib/subscription-rules';
import { checkoutActivationPatch, proPeriodEnd, subscriptionChange } from '@/lib/stripe-events';
import { buildRiskNote, MAX_RISK_PCT as SHARED_MAX_RISK_PCT } from '@/lib/risk-rules';
import { MAX_RISK_PCT as BOT_MAX_RISK_PCT } from '@/services/bot/prefs';
import {
  BANNED_PHRASES,
  WITHHELD_REASONING,
  alertsUsageMessage,
  containsBannedPhrase,
  formatPushDigest,
  formatSignal,
  sanitizeTake,
  settingsMessage,
} from '@/services/bot/format';
import { DEFAULT_PREFS } from '@/services/bot/prefs';
import type { AnalystTake } from '@/services/analyst.service';

const VERIFY = 'https://app.example.com/verify';
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);

function take(overrides: Partial<AnalystTake> = {}): AnalystTake {
  return {
    overallBias: 'bullish',
    newsSummary: 'ETF inflows continued.',
    shortTerm: {
      verdict: 'BUY', conviction: 'medium', horizon: '2-5 days',
      thesis: 'Price reclaimed the 4h range high with rising momentum.',
      keyDrivers: ['4h breakout', 'RSI turning up'],
      risks: ['1d resistance overhead', 'macro headlines'],
      entryZone: '$2,000–$2,050', target: '$2,200', stop: '$1,940', invalidation: 'close below $1,940',
    },
    longTerm: {
      verdict: 'HOLD', conviction: 'low', horizon: '3-6 months',
      thesis: 'Range-bound until a weekly breakout confirms.',
      keyDrivers: ['weekly range'], risks: ['regulatory'],
      keyLevels: '$1,800 / $2,400', invalidation: 'weekly close below $1,800',
    },
    ...overrides,
  };
}

function hasBanned(text: string): boolean {
  const t = text.toLowerCase();
  return BANNED_PHRASES.some(p => t.includes(p));
}

describe('freshTickerPrice (halted pairs)', () => {
  it('accepts a live ticker', () => {
    expect(freshTickerPrice({ lastPrice: '81406.46', closeTime: NOW - 2_000 }, NOW)).toBe(81406.46);
  });

  it('rejects a frozen ticker from a halted pair (closeTime days old)', () => {
    const tenDays = 10.5 * 24 * 60 * 60 * 1000;
    expect(freshTickerPrice({ lastPrice: '0.3794', closeTime: NOW - tenDays }, NOW)).toBeNull();
    expect(freshTickerPrice({ lastPrice: '1', closeTime: NOW - MAX_TICKER_AGE_MS - 1 }, NOW)).toBeNull();
  });

  it.each([
    [{ lastPrice: '0', closeTime: NOW }],
    [{ lastPrice: 'abc', closeTime: NOW }],
    [{ lastPrice: '5' }],
    [{ lastPrice: '5', closeTime: 'later' }],
    [null],
  ])('rejects %j', row => {
    expect(freshTickerPrice(row as any, NOW)).toBeNull();
  });
});

describe('coin catalogue', () => {
  it('no longer lists the halted MATIC / MKR / EOS pairs', () => {
    for (const s of ['MATIC', 'MKR', 'EOS']) expect(isSupportedCoin(s)).toBe(false);
    for (const s of ['POL', 'SKY', 'ETC']) expect(isSupportedCoin(s)).toBe(true);
  });

  it('keeps 50 unique symbols that fit the telegram_prefs coins constraint', () => {
    const symbols = COINS.map(c => c.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(symbols).toHaveLength(50);
    for (const s of symbols) expect(s).toMatch(/^[A-Z0-9]{2,12}$/);
  });
});

describe('deriveOutcome — a flat directional call is not a win', () => {
  const buy = { action: 'BUY' as const, entryPrice: 100, targetPrice: 110, stopLoss: 95 };
  const sell = { action: 'SELL' as const, entryPrice: 100, targetPrice: 90, stopLoss: 105 };

  it('scores an exactly-zero move as expired_loss for BUY and SELL', () => {
    expect(deriveOutcome(buy, 100).outcome).toBe('expired_loss');
    expect(deriveOutcome(sell, 100).outcome).toBe('expired_loss');
    expect(isDirectionalWin(0)).toBe(false);
  });

  it('still scores real moves the same way', () => {
    expect(deriveOutcome(buy, 101).outcome).toBe('expired_profit');
    expect(deriveOutcome(sell, 99).outcome).toBe('expired_profit');
    expect(deriveOutcome(buy, 99).outcome).toBe('expired_loss');
  });

  it('leaves HOLD non-directional', () => {
    expect(deriveOutcome({ action: 'HOLD', entryPrice: 100, targetPrice: 100, stopLoss: 100 }, 100).outcome).toBe('expired_profit');
  });
});

describe('futures margin floor', () => {
  const ok = { symbol: 'BTC', side: 'long', leverage: 5, marginUsd: MIN_MARGIN_USD };

  it('accepts the minimum margin', () => {
    expect(validateOpenFuturesInput(ok).ok).toBe(true);
  });

  it('rejects dust positions below it', () => {
    expect(validateOpenFuturesInput({ ...ok, marginUsd: MIN_MARGIN_USD - 0.01 })).toEqual({ ok: false, error: 'invalid_margin' });
    expect(validateOpenFuturesInput({ ...ok, marginUsd: 0.000001 })).toEqual({ ok: false, error: 'invalid_margin' });
  });
});

describe('card vs crypto Pro', () => {
  const future = new Date(NOW + 20 * 86_400_000).toISOString();
  const past = new Date(NOW - 86_400_000).toISOString();
  const stripeEnd = new Date(NOW + 30 * 86_400_000).toISOString();
  const cryptoLong = new Date(NOW + 300 * 86_400_000).toISOString();

  it('recognises a live card subscription', () => {
    expect(hasActiveCardSubscription({ status: 'pro', planId: 'sub_123', currentPeriodEnd: null })).toBe(true);
    expect(hasActiveCardSubscription({ status: 'pro', planId: 'crypto_monthly', currentPeriodEnd: future })).toBe(false);
    expect(hasActiveCardSubscription({ status: 'free', planId: null, currentPeriodEnd: null })).toBe(false);
    expect(hasActiveCardSubscription({ status: 'pro', planId: null, currentPeriodEnd: null })).toBe(false);
  });

  it('only flags crypto Pro that still has paid time', () => {
    expect(replacesActiveCryptoPro({ status: 'pro', planId: 'crypto_yearly', currentPeriodEnd: future }, NOW)).toBe(true);
    expect(replacesActiveCryptoPro({ status: 'pro', planId: 'crypto_yearly', currentPeriodEnd: past }, NOW)).toBe(false);
    expect(replacesActiveCryptoPro({ status: 'pro', planId: 'sub_1', currentPeriodEnd: future }, NOW)).toBe(false);
    expect(replacesActiveCryptoPro(null, NOW)).toBe(false);
  });

  it('laterIso picks the later timestamp and tolerates gaps', () => {
    expect(laterIso(future, stripeEnd)).toBe(stripeEnd);
    expect(laterIso(cryptoLong, stripeEnd)).toBe(cryptoLong);
    expect(laterIso(null, stripeEnd)).toBe(stripeEnd);
    expect(laterIso(future, null)).toBe(future);
    expect(laterIso(null, null)).toBeNull();
  });

  it('never shortens paid crypto time when a card plan takes over', () => {
    const crypto = { status: 'pro', planId: 'crypto_yearly', currentPeriodEnd: cryptoLong };
    const now = new Date(NOW);
    expect(proPeriodEnd(stripeEnd, crypto, now)).toBe(cryptoLong);
    expect(checkoutActivationPatch({ customerId: 'cus_1', subscriptionId: 'sub_1', periodEnd: stripeEnd, existing: crypto, now }))
      .toMatchObject({ plan_id: 'sub_1', current_period_end: cryptoLong });
    const change = subscriptionChange({ status: 'active', subscriptionId: 'sub_1', customerId: 'cus_1', periodEnd: stripeEnd, existing: crypto, now });
    expect(change).toEqual({ kind: 'pro', patch: expect.objectContaining({ plan_id: 'sub_1', current_period_end: cryptoLong }) });
  });

  it('uses the Stripe period end otherwise', () => {
    const now = new Date(NOW);
    expect(proPeriodEnd(stripeEnd, { status: 'pro', planId: 'sub_1', currentPeriodEnd: cryptoLong }, now)).toBe(stripeEnd);
    expect(proPeriodEnd(stripeEnd, { status: 'pro', planId: 'crypto_monthly', currentPeriodEnd: past }, now)).toBe(stripeEnd);
    expect(proPeriodEnd(stripeEnd, null, now)).toBe(stripeEnd);
  });
});

describe('web risk note', () => {
  const base = {
    symbol: 'BTC',
    volatilityClass: 'medium',
    typicalATRPercent: 3,
    maxPositionSizePct: 30,
    stopLabel: '$61,250.00',
    stopDistancePct: -3.4,
  };

  it('keeps position size and risk apart, with the shared 1–2% rule', () => {
    const note = buildRiskNote(base);
    expect(note).not.toMatch(/risk[^.]*30%/i);
    expect(note).toContain('at most ~30% of your portfolio');
    expect(note).toContain(`1–${SHARED_MAX_RISK_PCT}% of your account`);
  });

  it('shows the stop distance as a magnitude', () => {
    expect(buildRiskNote(base)).toContain('(3.4% away)');
    expect(buildRiskNote(base)).not.toContain('-3.4');
  });

  it('uses the same ceiling as the bot', () => {
    expect(BOT_MAX_RISK_PCT).toBe(SHARED_MAX_RISK_PCT);
  });
});

describe('runtime hype guardrail', () => {
  const hype = take({
    shortTerm: {
      ...take().shortTerm,
      thesis: 'Analysts eye a 100x — this is a guaranteed breakout.',
      keyDrivers: ['Guaranteed upside per one fund', '4h breakout'],
      risks: ['None, it is risk-free', 'macro headlines'],
      invalidation: 'cannot lose from here',
    },
    longTerm: { ...take().longTerm, thesis: 'To the moon.' },
  });

  it('detects banned phrases case-insensitively, including curly apostrophes', () => {
    expect(containsBannedPhrase('GUARANTEED gains')).toBe(true);
    expect(containsBannedPhrase('you can’t lose')).toBe(true);
    expect(containsBannedPhrase('a 100× move')).toBe(true);
    expect(containsBannedPhrase('a measured breakout')).toBe(false);
  });

  it('sanitizeTake removes every offending field and names it', () => {
    const { analysis, flagged } = sanitizeTake(hype);
    expect(analysis.shortTerm.thesis).toBe(WITHHELD_REASONING);
    expect(analysis.shortTerm.keyDrivers).toEqual(['4h breakout']);
    expect(analysis.shortTerm.risks).toEqual(['macro headlines']);
    expect(analysis.longTerm.thesis).toBe(WITHHELD_REASONING);
    expect(flagged).toEqual(expect.arrayContaining([
      'shortTerm.thesis', 'shortTerm.keyDrivers', 'shortTerm.risks', 'shortTerm.invalidation', 'longTerm.thesis',
    ]));
  });

  it('formatSignal never sends banned phrases and reports the hit', () => {
    const onBannedPhrase = jest.fn();
    const msg = formatSignal({ symbol: 'ETH', analysis: hype, verifyUrl: VERIFY, onBannedPhrase });
    expect(hasBanned(msg)).toBe(false);
    expect(msg).toContain(WITHHELD_REASONING);
    expect(onBannedPhrase).toHaveBeenCalledWith(expect.arrayContaining(['shortTerm.thesis']));
  });

  it('formatPushDigest never sends banned phrases and reports the hit', () => {
    const onBannedPhrase = jest.fn();
    const msg = formatPushDigest({
      items: [{ symbol: 'ETH', analysis: hype, price: 2010 }, { symbol: 'BTC', analysis: take(), price: 80000 }],
      riskLevel: 'medium',
      verifyUrl: VERIFY,
      onBannedPhrase,
    });
    expect(hasBanned(msg)).toBe(false);
    expect(onBannedPhrase).toHaveBeenCalledTimes(1);
    expect(onBannedPhrase.mock.calls[0][0]).toEqual(expect.arrayContaining(['ETH.shortTerm.thesis']));
  });

  it('does not report a clean read', () => {
    const onBannedPhrase = jest.fn();
    formatSignal({ symbol: 'ETH', analysis: take(), verifyUrl: VERIFY, onBannedPhrase });
    expect(onBannedPhrase).not.toHaveBeenCalled();
  });
});

describe('recorded stay-out calls are not described as scored trades', () => {
  it('a call recorded as HOLD says it is not counted as a win or a loss', () => {
    const msg = formatSignal({ symbol: 'ETH', analysis: take(), verifyUrl: VERIFY, recordedSignalId: 'sig-1', recordedAction: 'HOLD' });
    expect(msg).toMatch(/stay-out \(HOLD\) call/);
    expect(msg).toMatch(/not counted as a win or a loss/);
    expect(msg).not.toMatch(/can't hide it if it loses/);
    expect(msg).toContain(`${VERIFY}?signalId=sig-1`);
  });

  it('a call recorded as BUY keeps the scored-trade promise', () => {
    const msg = formatSignal({ symbol: 'ETH', analysis: take(), verifyUrl: VERIFY, recordedSignalId: 'sig-2', recordedAction: 'BUY' });
    expect(msg).toMatch(/can't hide it if it loses/);
    expect(msg).not.toMatch(/stay-out \(HOLD\) call/);
  });

  it('falls back to the read itself when the recorded action is unknown', () => {
    const lowConviction = take({ shortTerm: { ...take().shortTerm, conviction: 'low' } });
    const msg = formatSignal({ symbol: 'ETH', analysis: lowConviction, verifyUrl: VERIFY, recordedSignalId: 'sig-3' });
    expect(msg).toMatch(/stay-out \(HOLD\) call/);
  });
});

describe('alerts after Pro lapses', () => {
  const prefs = { ...DEFAULT_PREFS, alertsEnabled: true };

  it('settings say alerts are paused for a linked Free account', () => {
    expect(settingsMessage(prefs, { linked: true, pro: false })).toContain('Daily alerts: ON (paused: needs Pro, see /subscribe)');
    expect(settingsMessage(prefs, { linked: true, pro: true })).toMatch(/Daily alerts: ON\n/);
    expect(settingsMessage({ ...prefs, alertsEnabled: false }, { linked: true, pro: false })).toContain('Daily alerts: OFF');
  });

  it('/alerts says paused when asked', () => {
    expect(alertsUsageMessage(true, true)).toContain('ON (paused: needs Pro');
    expect(alertsUsageMessage(true)).toContain('Daily alerts are ON.');
    expect(alertsUsageMessage(false, true)).toContain('Daily alerts are OFF.');
  });
});

// ── engine: paged scan ──────────────────────────────────────────────────────
const mockTables: Record<string, any[]> = { orders: [], futures_positions: [] };
const mockUpdates: Array<{ table: string; id: string; patch: Record<string, unknown> }> = [];

function mockQuery(table: string) {
  const filters: Array<[string, unknown]> = [];
  let patch: Record<string, unknown> | null = null;
  let range: [number, number] | null = null;
  const rows = () => mockTables[table].filter(r => filters.every(([k, v]) => r[k] === v));
  const q: any = {
    select: () => q,
    update: (p: Record<string, unknown>) => { patch = p; return q; },
    insert: () => Promise.resolve({ error: null }),
    eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
    order: () => q,
    range: (from: number, to: number) => { range = [from, to]; return q; },
    then: (resolve: (v: unknown) => void) => {
      if (patch) {
        const hit = rows();
        for (const r of hit) {
          Object.assign(r, patch);
          mockUpdates.push({ table, id: r.id, patch });
        }
        return resolve({ data: hit.map(r => ({ id: r.id })), error: null });
      }
      const all = [...rows()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      // PostgREST caps every response at 1000 rows.
      const page = range ? all.slice(range[0], Math.min(range[1] + 1, range[0] + 1000)) : all.slice(0, 1000);
      return resolve({ data: page, error: null });
    },
  };
  return q;
}

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: (table: string) => mockQuery(table) }),
}));
jest.mock('@/lib/server/binance-server', () => ({
  fetchSpotPrices: async (symbols: string[]) => {
    const out: Record<string, number> = {};
    for (const s of symbols) if (s === 'BTC' || s === 'ETH') out[s] = 100;
    return out;
  },
}));

describe('runEngineTick — paged scan', () => {
  beforeEach(() => {
    mockUpdates.length = 0;
    mockTables.orders = [];
    mockTables.futures_positions = [];
  });

  it('reaches positions past the first 1000 rows', async () => {
    const { runEngineTick } = await import('@/services/engine/order-engine');
    // 1200 safe dust positions first, then one long that is past liquidation.
    for (let i = 0; i < 1200; i++) {
      mockTables.futures_positions.push({ id: `a-${String(i).padStart(5, '0')}`, status: 'open', symbol: 'BTC', side: 'long', liquidation_price: 50, margin_usd: 10 });
    }
    mockTables.futures_positions.push({ id: 'z-victim', status: 'open', symbol: 'ETH', side: 'long', liquidation_price: 120, margin_usd: 500 });

    const result = await runEngineTick();
    expect(result.positionsScanned).toBe(1201);
    expect(result.positionsLiquidated).toBe(1);
    expect(mockTables.futures_positions.find(p => p.id === 'z-victim')?.status).toBe('liquidated');
  });

  it('reaches pending orders past the first 1000 rows and cancels unsupported symbols', async () => {
    const { runEngineTick } = await import('@/services/engine/order-engine');
    for (let i = 0; i < 1100; i++) {
      mockTables.orders.push({ id: `a-${String(i).padStart(5, '0')}`, user_id: 'u1', status: 'pending', symbol: 'BTC', type: 'limit', side: 'buy', amount: 1, price: 0.00000001 });
    }
    mockTables.orders.push({ id: 'y-junk', user_id: 'u1', status: 'pending', symbol: 'NOTACOIN', type: 'limit', side: 'buy', amount: 1, price: 1 });
    mockTables.orders.push({ id: 'z-fill', user_id: 'u2', status: 'pending', symbol: 'ETH', type: 'limit', side: 'buy', amount: 1, price: 150 });

    const result = await runEngineTick();
    expect(result.ordersScanned).toBe(1102);
    expect(result.ordersFilled).toBe(1);
    expect(result.ordersCancelled).toBe(1);
    expect(mockTables.orders.find(o => o.id === 'z-fill')?.status).toBe('filled');
    expect(mockTables.orders.find(o => o.id === 'y-junk')?.status).toBe('cancelled');
  });
});
