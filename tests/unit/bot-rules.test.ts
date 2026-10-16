// Pure bot rules: rate-limit primitives, preference parsing, risk-based sizing
// (never above 2%), push eligibility, and the follow-up message's honesty.
import {
  MemoryRateLimiter, allowLinkAttempt, LIMITS, limiterKey,
} from '@/services/bot/rate-limit';
import {
  parseRiskArg, parseCoinsArg, parseToggleArg, prefsFromRow, riskBudget,
  RISK_BUDGET, RISK_LEVELS, MAX_RISK_PCT, DEFAULT_PREFS,
} from '@/services/bot/prefs';
import {
  formatSignal, formatPushDigest, formatFollowUp, sizingLines, BANNED_PHRASES,
  type FollowUpSignal,
} from '@/services/bot/format';
import {
  isPushEligible, pushSkipReason, pushCoinsFor, PUSH_MIN_INTERVAL_MS, MAX_PUSH_COINS,
} from '@/services/bot/push';
import { toFollowUpSignal, pickFollowUpChat, type SignalRow } from '@/services/bot/followups';
import { parseTelegramUpdate } from '@/services/telegram/adapter';
import type { AnalystTake } from '@/services/analyst.service';
import type { RiskLevel } from '@/services/bot/types';

const VERIFY = 'https://app.example.com/verify';

function take(st: Partial<AnalystTake['shortTerm']> = {}): AnalystTake {
  return {
    overallBias: 'neutral',
    newsSummary: '',
    shortTerm: {
      verdict: 'BUY', conviction: 'medium', horizon: '2-5 days', thesis: 'Tactical long.',
      keyDrivers: [], risks: [], entryZone: '$100', target: '$110', stop: '$95', invalidation: 'below $95',
      ...st,
    },
    longTerm: {
      verdict: 'HOLD', conviction: 'low', horizon: 'months', thesis: 'Range.', keyDrivers: [], risks: [],
      keyLevels: '', invalidation: '',
    },
  };
}

/** Every account-risk "N%" in the sizing lines (the stop distance is excluded). */
function sizingPercents(lines: string[]): number[] {
  return lines.flatMap(l =>
    Array.from(l.replace(/~\d+(\.\d+)?% stop/g, '').matchAll(/(\d+(?:\.\d+)?)%/g), m => Number(m[1])));
}

describe('MemoryRateLimiter', () => {
  it('allows up to the limit per fixed window, then resets', () => {
    let t = 0;
    const m = new MemoryRateLimiter(100, () => t);
    expect([1, 2, 3].map(() => m.hit('k', 2, 60))).toEqual([true, true, false]);
    expect(m.hit('other', 2, 60)).toBe(true); // keys are independent
    t = 60_000;
    expect(m.hit('k', 2, 60)).toBe(true);
  });

  it('stays bounded under a flood of distinct keys', () => {
    const m = new MemoryRateLimiter(50, () => 0);
    for (let i = 0; i < 1000; i++) m.hit(`k${i}`, 5, 60);
    expect(m.size).toBeLessThanOrEqual(50);
  });

  it('link attempts need BOTH limiters, and the local one counts even when the shared one fails open', async () => {
    const failOpen = async () => ({ ok: true, remaining: -1, retryAfter: 0 });
    const m = new MemoryRateLimiter();
    const key = limiterKey('telegram', '7');
    const results: boolean[] = [];
    for (let i = 0; i <= LIMITS.link.limit; i++) results.push(await allowLinkAttempt(failOpen, m, key));
    expect(results.slice(0, LIMITS.link.limit).every(Boolean)).toBe(true);
    expect(results[LIMITS.link.limit]).toBe(false);

    const sharedDenies = async () => ({ ok: false, remaining: 0, retryAfter: 10 });
    expect(await allowLinkAttempt(sharedDenies, new MemoryRateLimiter(), key)).toBe(false);
  });

  it('namespaces keys by channel', () => {
    expect(limiterKey('telegram', '1')).not.toBe(limiterKey('whatsapp', '1'));
  });
});

describe('preference parsing', () => {
  it('parses risk levels', () => {
    expect(parseRiskArg(' LOW ')).toEqual({ ok: true, value: 'low' });
    expect(parseRiskArg('med')).toEqual({ ok: true, value: 'medium' });
    expect(parseRiskArg('extreme').ok).toBe(false);
    expect(parseRiskArg('').ok).toBe(false);
  });

  it('parses, de-dupes and validates coins', () => {
    expect(parseCoinsArg('btc, eth  btc sol')).toEqual({ ok: true, value: ['BTC', 'ETH', 'SOL'] });
    expect(parseCoinsArg('')).toEqual({ ok: false, error: { kind: 'missing' } });
    expect(parseCoinsArg('BTC SCAMCOIN')).toEqual({ ok: false, error: { kind: 'unsupported', symbols: ['SCAMCOIN'] } });
    expect(parseCoinsArg('BTC ETH SOL BNB ADA XRP')).toEqual({ ok: false, error: { kind: 'too_many', count: 6 } });
    expect(parseCoinsArg('BTC ETH SOL BNB ADA').ok).toBe(true);
  });

  it('truncates echoed unsupported symbols', () => {
    const r = parseCoinsArg('A'.repeat(40));
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === 'unsupported') expect(r.error.symbols[0].length).toBeLessThanOrEqual(12);
  });

  it('parses on/off toggles', () => {
    expect(parseToggleArg('ON')).toEqual({ ok: true, value: true });
    expect(parseToggleArg('off')).toEqual({ ok: true, value: false });
    expect(parseToggleArg('maybe').ok).toBe(false);
  });

  it('normalizes DB rows and falls back to defaults on bad data', () => {
    expect(prefsFromRow(null)).toEqual(DEFAULT_PREFS);
    expect(prefsFromRow({ risk_level: 'bogus', coins: ['xxx', 'sol', 7], alerts_enabled: 'yes' })).toEqual({
      riskLevel: 'medium', coins: ['SOL'], alertsEnabled: false, lastPushAt: null,
    });
  });
});

describe('risk-based sizing', () => {
  it('budgets are low 0.5–1%, medium 1–2%, high 2% — never above 2%', () => {
    expect(RISK_BUDGET.low).toEqual({ minPct: 0.5, maxPct: 1 });
    expect(RISK_BUDGET.medium).toEqual({ minPct: 1, maxPct: 2 });
    expect(RISK_BUDGET.high).toEqual({ minPct: 2, maxPct: 2 });
    for (const level of RISK_LEVELS) expect(riskBudget(level).maxPct).toBeLessThanOrEqual(MAX_RISK_PCT);
    expect(riskBudget('nonsense' as RiskLevel)).toEqual(RISK_BUDGET.medium);
  });

  it('no sizing line ever suggests risking more than 2%', () => {
    for (const level of [...RISK_LEVELS, undefined]) {
      const lines = sizingLines(level, 5);
      const pcts = sizingPercents(lines);
      expect(pcts.length).toBeGreaterThan(0);
      for (const p of pcts) expect(p).toBeLessThanOrEqual(2);
    }
  });

  it('formatSignal always shows a stop + max loss for every risk level', () => {
    for (const riskLevel of RISK_LEVELS) {
      const msg = formatSignal({ symbol: 'BTC', analysis: take(), verifyUrl: VERIFY, riskLevel });
      expect(msg).toMatch(/Stop-loss: \$95/);
      expect(msg.toLowerCase()).toContain('max loss');
      expect(msg).toMatch(new RegExp(`costs ≤${riskBudget(riskLevel).maxPct}% of your account`));
    }
    expect(formatSignal({ symbol: 'BTC', analysis: take(), verifyUrl: VERIFY, riskLevel: 'low' })).toMatch(/0\.5–1%/);
    expect(formatSignal({ symbol: 'BTC', analysis: take(), verifyUrl: VERIFY, riskLevel: 'high' })).toMatch(/at most 2%/);
  });
});

describe('push eligibility', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  const base = { alertsEnabled: true, linkedUserId: 'u1', subscriptionStatus: 'pro', lastPushAt: null, chatId: '123' };

  it('pushes only opted-in, linked, Pro, private chats', () => {
    expect(isPushEligible(base, now)).toBe(true);
    expect(pushSkipReason({ ...base, alertsEnabled: false }, now)).toBe('alerts_off');
    expect(pushSkipReason({ ...base, linkedUserId: null }, now)).toBe('not_linked');
    expect(pushSkipReason({ ...base, subscriptionStatus: 'free' }, now)).toBe('not_pro');
    expect(pushSkipReason({ ...base, subscriptionStatus: 'cancelled' }, now)).toBe('not_pro');
    expect(pushSkipReason({ ...base, chatId: '-100500' }, now)).toBe('not_private');
  });

  it('at most one push per chat per 20h (bad timestamps fail safe)', () => {
    const recent = new Date(now - PUSH_MIN_INTERVAL_MS + 60_000).toISOString();
    const old = new Date(now - PUSH_MIN_INTERVAL_MS - 1).toISOString();
    expect(pushSkipReason({ ...base, lastPushAt: recent }, now)).toBe('too_soon');
    expect(isPushEligible({ ...base, lastPushAt: old }, now)).toBe(true);
    expect(pushSkipReason({ ...base, lastPushAt: 'garbage' }, now)).toBe('too_soon');
  });

  it('covers at most 3 supported coins', () => {
    expect(pushCoinsFor(['btc', 'ETH', 'BTC', 'FAKE', 'SOL', 'BNB'])).toEqual(['BTC', 'ETH', 'SOL']);
    expect(pushCoinsFor(['BTC', 'ETH', 'SOL', 'BNB', 'ADA'])).toHaveLength(MAX_PUSH_COINS);
  });

  it('the digest is honest: stop shown, stay-out path, not-recorded notice, opt-out, disclaimer', () => {
    const msg = formatPushDigest({
      items: [
        { symbol: 'BTC', analysis: take(), price: 100 },
        { symbol: 'ETH', analysis: take({ verdict: 'HOLD', conviction: 'low' }), price: null },
      ],
      riskLevel: 'high',
      verifyUrl: VERIFY,
    });
    expect(msg).toMatch(/Stop-loss \$95/);
    expect(msg).toMatch(/STAY-OUT/);
    expect(msg).toMatch(/NOT recorded/);
    expect(msg).toContain('/alerts off');
    expect(msg.toLowerCase()).toContain('not financial advice');
    expect(msg).not.toMatch(/anchored on-chain/i);
    for (const b of BANNED_PHRASES) expect(msg.toLowerCase()).not.toContain(b);
  });
});

describe('accountability follow-up', () => {
  const sig = (o: Partial<FollowUpSignal> = {}): FollowUpSignal => ({
    id: '0b6a8f3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', symbol: 'BTC', action: 'BUY',
    entryPrice: 100, targetPrice: 110, stopLoss: 95, outcome: 'hit_stop',
    profitLossPercent: -5.2, priceAt24h: 94.8, createdAt: '2026-10-14T09:00:00Z',
    ...o,
  });

  it('reports a loss plainly, with the % move and the verify link', () => {
    const msg = formatFollowUp(sig(), VERIFY);
    expect(msg).toMatch(/LOSS/);
    expect(msg).toContain('-5.20%');
    expect(msg).toContain(`${VERIFY}?signalId=${sig().id}`);
    expect(msg).toMatch(/got this one wrong/);
  });

  it('reports wins without hype', () => {
    const msg = formatFollowUp(sig({ outcome: 'hit_target', profitLossPercent: 10.1, priceAt24h: 110.1 }), VERIFY);
    expect(msg).toMatch(/WIN/);
    expect(msg).toContain('+10.10%');
    expect(msg).toMatch(/says little about the next call/);
  });

  it('never uses banned phrases or overclaims anchoring, for any outcome', () => {
    for (const outcome of ['hit_target', 'hit_stop', 'expired_profit', 'expired_loss'] as const) {
      for (const action of ['BUY', 'SELL', 'HOLD'] as const) {
        const msg = formatFollowUp(sig({ outcome, action }), VERIFY).toLowerCase();
        for (const b of BANNED_PHRASES) expect(msg).not.toContain(b);
        expect(msg).toContain('not financial advice');
        expect(msg).toMatch(/once anchored/); // anchoring is daily — never claimed as already done
      }
    }
  });

  const row = (o: Partial<SignalRow> = {}): SignalRow => ({
    id: '0b6a8f3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', user_id: 'u1', symbol: 'BTC', action: 'BUY',
    entry_price: '100', target_price: '110', stop_loss: '95', outcome: 'hit_stop',
    profit_loss_percent: '-5.2', price_at_24h: '94.8', reasoning: 'Telegram analyst read (2-5 days): x',
    created_at: '2026-10-14T09:00:00Z', evaluated_at: '2026-10-15T10:00:00Z',
    ...o,
  });

  it('only follows up finalized, Telegram-originated, well-formed calls', () => {
    expect(toFollowUpSignal(row())).toMatchObject({ symbol: 'BTC', entryPrice: 100, profitLossPercent: -5.2 });
    expect(toFollowUpSignal(row({ outcome: 'pending' }))).toBeNull();
    expect(toFollowUpSignal(row({ reasoning: 'Web analyst read' }))).toBeNull();
    expect(toFollowUpSignal(row({ symbol: 'Click http://evil.example' }))).toBeNull();
    expect(toFollowUpSignal(row({ action: 'YOLO' }))).toBeNull();
    expect(toFollowUpSignal(row({ entry_price: '0' }))).toBeNull();
    expect(toFollowUpSignal(row({ id: 'not-a-uuid' }))).toBeNull();
    expect(toFollowUpSignal(row({ evaluated_at: null }))).toBeNull();
  });

  it('sends to the most recently active linked private chat', () => {
    const map = pickFollowUpChat([
      { telegram_id: 111, user_id: 'u1', updated_at: '2026-10-01T00:00:00Z' },
      { telegram_id: 222, user_id: 'u1', updated_at: '2026-10-10T00:00:00Z' },
      { telegram_id: -100999, user_id: 'u1', updated_at: '2026-10-15T00:00:00Z' },
      { telegram_id: 333, user_id: null, updated_at: '2026-10-15T00:00:00Z' },
    ]);
    expect(map.get('u1')).toBe('222');
    expect(map.size).toBe(1);
  });
});

describe('parseTelegramUpdate', () => {
  const upd = (message: Record<string, unknown>) => ({ update_id: 1, message });

  it('maps private and group chats', () => {
    expect(parseTelegramUpdate(upd({ chat: { id: 5, type: 'private' }, from: { username: 'al' }, text: ' /start ' })))
      .toEqual({ channel: 'telegram', chatId: '5', chatKind: 'private', text: '/start', username: 'al' });
    expect(parseTelegramUpdate(upd({ chat: { id: -100, type: 'supergroup' }, text: '/help' }))?.chatKind).toBe('group');
    expect(parseTelegramUpdate(upd({ chat: { id: 9 }, text: '/help' }))?.chatKind).toBe('group'); // unknown type → restrictive
  });

  it('ignores non-text, bot senders and malformed ids', () => {
    expect(parseTelegramUpdate(upd({ chat: { id: 5, type: 'private' }, sticker: {} }))).toBeNull();
    expect(parseTelegramUpdate(upd({ chat: { id: 5, type: 'private' }, from: { is_bot: true }, text: 'hi' }))).toBeNull();
    expect(parseTelegramUpdate(upd({ chat: { id: '5', type: 'private' }, text: 'hi' }))).toBeNull();
    expect(parseTelegramUpdate({ edited_message: { chat: { id: 5 }, text: 'x' } })).toBeNull();
    expect(parseTelegramUpdate(null)).toBeNull();
  });
});
