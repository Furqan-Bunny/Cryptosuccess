// Locks the Telegram honest-coach guardrails (product principles that must never
// regress): every signal shows a stop-loss + max-loss/sizing, honest confidence,
// a STAY-OUT path on low conviction, the on-chain /verify hook, and NO banned
// hype ("guaranteed", "100x", …). Pure formatter — no network/DB.
import {
  formatSignal, welcomeMessage, helpMessage, verifyMessage,
  parseFirstNumber, parseRangeMid, BANNED_PHRASES,
} from '@/services/telegram/format';
import { splitForTelegram } from '@/lib/telegram/api';
import type { AnalystTake } from '@/services/analyst.service';

const VERIFY = 'https://app.example.com/verify';

function take(overrides: Partial<AnalystTake> = {}): AnalystTake {
  return {
    overallBias: 'bullish',
    newsSummary: 'ETF inflows continued.',
    shortTerm: {
      verdict: 'BUY', conviction: 'medium', horizon: '2-5 days',
      thesis: 'Price reclaimed the 4h range high with rising momentum, but the daily is still mid-range so this is a tactical long, not a trend call.',
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

describe('formatSignal — honest-coach guardrails', () => {
  it('always includes a stop-loss and max-loss/sizing guidance', () => {
    const msg = formatSignal({ symbol: 'ETH', analysis: take(), price: 2010, verifyUrl: VERIFY });
    expect(msg).toMatch(/Stop-loss:/i);
    expect(msg).toMatch(/\$1,940/);
    expect(msg.toLowerCase()).toContain('max loss');
    expect(msg).toMatch(/1[–-]2% of your account/); // risk-first sizing rule
  });

  it('links the on-chain track record (/verify hook)', () => {
    const msg = formatSignal({ symbol: 'ETH', analysis: take(), verifyUrl: VERIFY });
    expect(msg).toContain(VERIFY);
    expect(msg.toLowerCase()).toMatch(/verify|track record/);
  });

  it('shows honest confidence and a STAY-OUT path on HOLD / low conviction', () => {
    const hold = formatSignal({ symbol: 'BTC', analysis: take({
      shortTerm: { ...take().shortTerm, verdict: 'HOLD', conviction: 'low' },
    }), verifyUrl: VERIFY });
    expect(hold.toLowerCase()).toContain('stay-out');
    expect(hold.toLowerCase()).toMatch(/confidence:/);
  });

  it('never emits banned hype phrases', () => {
    const variants = [take(), take({ overallBias: 'bearish' }), take({
      shortTerm: { ...take().shortTerm, verdict: 'SELL', conviction: 'high' },
    })];
    for (const t of variants) {
      const msg = formatSignal({ symbol: 'SOL', analysis: t, verifyUrl: VERIFY }).toLowerCase();
      for (const banned of BANNED_PHRASES) {
        expect(msg).not.toContain(banned.toLowerCase());
      }
    }
  });

  it('surfaces remaining free signals when metered', () => {
    const msg = formatSignal({ symbol: 'ETH', analysis: take(), verifyUrl: VERIFY, remaining: 3 });
    expect(msg).toMatch(/Free signals left today: 3/);
    // Pro / unlimited (-1) should NOT show a counter.
    const pro = formatSignal({ symbol: 'ETH', analysis: take(), verifyUrl: VERIFY, remaining: -1 });
    expect(pro).not.toMatch(/Free signals left today/);
  });

  it('includes the not-financial-advice disclaimer', () => {
    const msg = formatSignal({ symbol: 'ETH', analysis: take(), verifyUrl: VERIFY });
    expect(msg.toLowerCase()).toContain('not financial advice');
  });
});

describe('static messages', () => {
  it('welcome/help/verify carry the honest positioning and no hype', () => {
    for (const msg of [welcomeMessage(VERIFY), helpMessage(), verifyMessage(VERIFY)]) {
      for (const banned of BANNED_PHRASES) {
        expect(msg.toLowerCase()).not.toContain(banned.toLowerCase());
      }
    }
    expect(welcomeMessage(VERIFY)).toContain(VERIFY);
  });
});

describe('price parsing helpers', () => {
  it('parseFirstNumber pulls the first number from messy strings', () => {
    expect(parseFirstNumber('$1,940.50')).toBe(1940.5);
    expect(parseFirstNumber('close below 1940')).toBe(1940);
    expect(parseFirstNumber('n/a')).toBeNull();
    expect(parseFirstNumber(undefined)).toBeNull();
  });

  it('parseRangeMid averages a range', () => {
    expect(parseRangeMid('$2,000–$2,050')).toBe(2025);
    expect(parseRangeMid('2000 to 2100')).toBe(2050);
    expect(parseRangeMid('$2,000')).toBe(2000);
    expect(parseRangeMid('')).toBeNull();
  });
});

describe('splitForTelegram', () => {
  it('keeps short messages intact', () => {
    expect(splitForTelegram('hello')).toEqual(['hello']);
  });
  it('splits messages over 4096 chars into valid chunks', () => {
    const long = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
    const chunks = splitForTelegram(long);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(c => expect(c.length).toBeLessThanOrEqual(4096));
    expect(chunks.join('\n')).toBe(long);
  });
});
