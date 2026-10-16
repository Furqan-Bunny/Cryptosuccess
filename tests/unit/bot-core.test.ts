// Channel-agnostic bot core: routing, group policy, rate limits, fail-closed
// metering, the N14 refund, and personalization commands — driven through the
// real handleIncoming with a fake channel adapter, store and limiter.
import { handleIncoming, parseCommand } from '@/services/bot/core';
import { LIMITS, MAX_INPUT_CHARS, MemoryRateLimiter } from '@/services/bot/rate-limit';
import { DEFAULT_PREFS } from '@/services/bot/prefs';
import { BOT_COMMANDS } from '@/services/bot/commands';
import { helpMessage } from '@/services/bot/format';
import type {
  BotDeps, BotStore, ChatPrefs, IncomingMessage, QuotaGate, RateLimiter,
} from '@/services/bot/types';
import type { AnalystTake, GenerateResult } from '@/services/analyst.service';

const BASE = 'https://app.example.com';

function take(): AnalystTake {
  return {
    overallBias: 'bullish',
    newsSummary: 'n/a',
    shortTerm: {
      verdict: 'BUY', conviction: 'medium', horizon: '2-5 days',
      thesis: 'Tactical long inside the daily range.',
      keyDrivers: ['4h breakout'], risks: ['1d resistance'],
      entryZone: '$100–$102', target: '$110', stop: '$97', invalidation: 'close below $97',
    },
    longTerm: {
      verdict: 'HOLD', conviction: 'low', horizon: '3-6 months',
      thesis: 'Range-bound.', keyDrivers: [], risks: [], keyLevels: '$90 / $120', invalidation: 'weekly close below $90',
    },
  };
}

/** Counting limiter with the same fixed-window semantics as the Upstash one. */
function countingLimiter(): RateLimiter & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  const fn = (async (name: string, id: string, limit: number) => {
    const k = `${name}|${id}`;
    const c = (counts.get(k) ?? 0) + 1;
    counts.set(k, c);
    return { ok: c <= limit, remaining: Math.max(0, limit - c), retryAfter: 1 };
  }) as RateLimiter & { counts: Map<string, number> };
  fn.counts = counts;
  return fn;
}

interface FakeStore extends BotStore {
  prefs: ChatPrefs;
  account: { linked: boolean; pro: boolean };
  gate: QuotaGate;
  consumeThrows: boolean;
  calls: Record<string, unknown[][]>;
}

function fakeStore(): FakeStore {
  const calls: Record<string, unknown[][]> = {};
  const log = (name: string, args: unknown[]) => { (calls[name] ??= []).push(args); };
  const store: FakeStore = {
    prefs: { ...DEFAULT_PREFS, coins: [...DEFAULT_PREFS.coins] },
    account: { linked: false, pro: false },
    gate: { allowed: true, remaining: 4, linked: false, pro: false },
    consumeThrows: false,
    calls,
    async touch(...a) { log('touch', a); },
    async redeemLink(...a) { log('redeemLink', a); return a[1] === 'GOODCODE' ? { ok: true } : { ok: false, reason: 'invalid' }; },
    async consumeSignal(...a) {
      log('consumeSignal', a);
      if (store.consumeThrows) throw new Error('rpc missing');
      return store.gate;
    },
    async refundSignal(...a) { log('refundSignal', a); },
    async getAccountStatus(...a) { log('getAccountStatus', a); return store.account; },
    async getPrefs(...a) { log('getPrefs', a); return store.prefs; },
    async savePrefs(chatId, patch) { log('savePrefs', [chatId, patch]); store.prefs = { ...store.prefs, ...patch }; },
    async recordSignal(...a) { log('recordSignal', a); return null; },
  };
  return store;
}

function setup(overrides: Partial<BotDeps> = {}) {
  const sent: Array<{ chatId: string; text: string }> = [];
  const store = fakeStore();
  const analyst = jest.fn(async (): Promise<GenerateResult | null> => ({ analysis: take(), cached: true, price: 101 }));
  const limiter = countingLimiter();
  const deps: BotDeps = {
    adapter: { channel: 'telegram', send: async (chatId, text) => { sent.push({ chatId, text }); } },
    store,
    analyst,
    limiter,
    baseUrl: BASE,
    ...overrides,
  };
  const memory = new MemoryRateLimiter();
  const run = (text: string, extra: Partial<IncomingMessage> = {}) =>
    handleIncoming({ channel: 'telegram', chatId: '42', chatKind: 'private', text, username: 'u', ...extra }, deps, memory);
  return { sent, store, analyst, limiter, deps, run, last: () => sent[sent.length - 1]?.text ?? '' };
}

// The core logs handled failures; keep test output readable.
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('parseCommand', () => {
  it('strips the slash, lower-cases and drops an @botname suffix', () => {
    expect(parseCommand('/Signal@MyBot  btc ')).toEqual({ command: 'signal', arg: 'btc', isCommand: true });
    expect(parseCommand('eth')).toEqual({ command: '', arg: 'eth', isCommand: false });
  });
});

describe('handleIncoming — routing', () => {
  it('answers the static commands', async () => {
    const t = setup();
    await t.run('/start');
    expect(t.last()).toContain(`${BASE}/verify`);
    await t.run('/subscribe');
    expect(t.last()).toContain(`${BASE}/pricing`);
    await t.run('/nonsense');
    expect(t.last()).toBe(helpMessage());
  });

  it('runs /signal end to end with the chat risk level in the sizing line', async () => {
    const t = setup();
    t.store.prefs = { ...t.store.prefs, riskLevel: 'low' };
    await t.run('/signal btc');
    expect(t.analyst).toHaveBeenCalledWith('BTC');
    expect(t.store.calls.consumeSignal).toHaveLength(1);
    const reply = t.last();
    expect(reply).toMatch(/Stop-loss/);
    expect(reply).toMatch(/0\.5–1% of your account/);
    expect(reply).toMatch(/Free signals left today: 4/);
  });

  it('treats a bare coin symbol in a private chat as /signal', async () => {
    const t = setup();
    await t.run('eth');
    expect(t.analyst).toHaveBeenCalledWith('ETH');
  });

  it('rejects unsupported coins without consuming a credit', async () => {
    const t = setup();
    await t.run('/signal NOTACOIN');
    expect(t.last()).toMatch(/don't cover/);
    expect(t.store.calls.consumeSignal).toBeUndefined();
  });

  it('degrades gracefully without a DB / AI backend', async () => {
    const t = setup({ store: null, analyst: null });
    await t.run('/signal BTC');
    expect(t.last()).toMatch(/isn't live yet/);
    await t.run('/risk low');
    expect(t.last()).toMatch(/isn't live yet/);
    await t.run('/help');
    expect(t.last()).toBe(helpMessage());
  });
});

describe('handleIncoming — metering + N14 refund', () => {
  it('fails CLOSED when the quota RPC errors (no generation)', async () => {
    const t = setup();
    t.store.consumeThrows = true;
    await t.run('/signal BTC');
    expect(t.analyst).not.toHaveBeenCalled();
    expect(t.last()).toMatch(/went wrong/);
  });

  it('does not generate when the daily limit is reached', async () => {
    const t = setup();
    t.store.gate = { allowed: false, remaining: 0, linked: false, pro: false };
    await t.run('/signal BTC');
    expect(t.analyst).not.toHaveBeenCalled();
    expect(t.last()).toMatch(/5 free signals/);
  });

  it('refunds the credit when generation returns null', async () => {
    const t = setup();
    t.analyst.mockResolvedValueOnce(null);
    await t.run('/signal BTC');
    expect(t.store.calls.refundSignal).toEqual([['42']]);
    expect(t.last()).toMatch(/didn't count against your daily signals/);
  });

  it('refunds the credit when generation throws', async () => {
    const t = setup();
    t.analyst.mockRejectedValueOnce(new Error('anthropic down'));
    await t.run('/signal BTC');
    expect(t.store.calls.refundSignal).toHaveLength(1);
  });

  it('never refunds an unlimited (Pro) chat — nothing was consumed', async () => {
    const t = setup();
    t.store.gate = { allowed: true, remaining: -1, linked: true, pro: true };
    t.analyst.mockResolvedValueOnce(null);
    await t.run('/signal BTC');
    expect(t.store.calls.refundSignal).toBeUndefined();
  });
});

describe('handleIncoming — rate limits', () => {
  it('limits /signal per chat and replies without generating', async () => {
    const t = setup();
    for (let i = 0; i < LIMITS.signal.limit; i++) await t.run('/signal BTC');
    expect(t.analyst).toHaveBeenCalledTimes(LIMITS.signal.limit);
    await t.run('/signal BTC');
    expect(t.analyst).toHaveBeenCalledTimes(LIMITS.signal.limit);
    expect(t.last()).toMatch(/wait a few minutes/);
  });

  it('applies the general flood limit with a single notice per window', async () => {
    const t = setup();
    for (let i = 0; i < LIMITS.general.limit; i++) await t.run('/help');
    const before = t.sent.length;
    await t.run('/help');
    await t.run('/help');
    await t.run('/help');
    const extra = t.sent.slice(before).map(s => s.text);
    expect(extra).toHaveLength(1);
    expect(extra[0]).toMatch(/faster than I can coach/);
  });

  it('limits /link attempts and counts them before the code is checked', async () => {
    const t = setup();
    for (let i = 0; i < LIMITS.link.limit; i++) await t.run('/link WRONG123');
    expect(t.store.calls.redeemLink).toHaveLength(LIMITS.link.limit);
    await t.run('/link GOODCODE');
    expect(t.store.calls.redeemLink).toHaveLength(LIMITS.link.limit);
    expect(t.last()).toMatch(/Too many \/link attempts/);
  });

  it('still limits /link when the shared limiter fails open', async () => {
    const t = setup({ limiter: async () => ({ ok: true, remaining: -1, retryAfter: 0 }) });
    for (let i = 0; i < LIMITS.link.limit; i++) await t.run('/link WRONG123');
    await t.run('/link GOODCODE');
    expect(t.store.calls.redeemLink).toHaveLength(LIMITS.link.limit);
    expect(t.last()).toMatch(/Too many \/link attempts/);
  });

  it('refuses oversized input before parsing it', async () => {
    const t = setup();
    await t.run(`/signal ${'B'.repeat(MAX_INPUT_CHARS)}`);
    expect(t.store.calls.consumeSignal).toBeUndefined();
    expect(t.last()).toMatch(/too long/);
  });

  it('upper-cases link codes and rejects malformed ones without a DB call', async () => {
    const t = setup();
    await t.run('/link goodcode');
    expect(t.store.calls.redeemLink).toEqual([['42', 'GOODCODE']]);
    expect(t.last()).toMatch(/Account linked/);
    await t.run('/link bad!code');
    expect(t.store.calls.redeemLink).toHaveLength(1);
    expect(t.last()).toMatch(/not valid/);
  });
});

describe('handleIncoming — group chats', () => {
  const group = { chatKind: 'group' as const, chatId: '-100123' };

  it('ignores chatter and unknown commands', async () => {
    const t = setup();
    await t.run('btc to the moon', group);
    await t.run('/whatever', group);
    expect(t.sent).toHaveLength(0);
  });

  it('answers informational commands', async () => {
    const t = setup();
    await t.run('/verify@SomeBot', group);
    expect(t.last()).toContain(`${BASE}/verify`);
  });

  it('refuses private-only commands without touching quota or link codes', async () => {
    const t = setup();
    for (const cmd of ['/signal BTC', '/link ABCDEFGH', '/risk high', '/coins SOL', '/alerts on', '/settings']) {
      await t.run(cmd, group);
      expect(t.last()).toMatch(/private chat/);
    }
    expect(t.store.calls.consumeSignal).toBeUndefined();
    expect(t.store.calls.redeemLink).toBeUndefined();
    expect(t.store.calls.savePrefs).toBeUndefined();
    expect(t.store.calls.touch).toBeUndefined();
  });
});

describe('handleIncoming — personalization', () => {
  it('/risk saves a valid level and shows usage otherwise', async () => {
    const t = setup();
    await t.run('/risk HIGH');
    expect(t.store.prefs.riskLevel).toBe('high');
    expect(t.last()).toMatch(/2%/);
    await t.run('/risk yolo');
    expect(t.store.calls.savePrefs).toHaveLength(1);
    expect(t.last()).toMatch(/\/risk low/);
  });

  it('/coins validates against the catalogue and caps at 5', async () => {
    const t = setup();
    await t.run('/coins btc, sol eth');
    expect(t.store.prefs.coins).toEqual(['BTC', 'SOL', 'ETH']);
    await t.run('/coins BTC FAKECOIN');
    expect(t.last()).toMatch(/FAKECOIN/);
    await t.run('/coins BTC ETH SOL BNB ADA XRP');
    expect(t.last()).toMatch(/at most 5/);
    expect(t.store.prefs.coins).toEqual(['BTC', 'SOL', 'ETH']);
  });

  it('/alerts on requires a linked Pro account', async () => {
    const t = setup();
    await t.run('/alerts on');
    expect(t.last()).toMatch(/linked CryptoSuccess account/);
    t.store.account = { linked: true, pro: false };
    await t.run('/alerts on');
    expect(t.last()).toMatch(/part of Pro/);
    expect(t.store.prefs.alertsEnabled).toBe(false);
    t.store.account = { linked: true, pro: true };
    await t.run('/alerts on');
    expect(t.store.prefs.alertsEnabled).toBe(true);
    expect(t.last()).toMatch(/\/alerts off/);
  });

  it('/alerts off always works', async () => {
    const t = setup();
    t.store.prefs = { ...t.store.prefs, alertsEnabled: true };
    await t.run('/alerts off');
    expect(t.store.prefs.alertsEnabled).toBe(false);
  });

  it('/settings shows the current preferences', async () => {
    const t = setup();
    await t.run('/settings');
    expect(t.last()).toMatch(/Risk level: medium/);
    expect(t.last()).toMatch(/BTC, ETH/);
    expect(t.last()).toMatch(/not linked/);
  });
});

describe('command catalogue', () => {
  it('every menu command is documented in /help', () => {
    for (const c of BOT_COMMANDS) expect(helpMessage()).toContain(`/${c.command}`);
  });
  it('menu descriptions fit Telegram limits', () => {
    for (const c of BOT_COMMANDS) {
      expect(c.command).toMatch(/^[a-z0-9_]{1,32}$/);
      expect(c.description.length).toBeLessThanOrEqual(256);
    }
  });
});
