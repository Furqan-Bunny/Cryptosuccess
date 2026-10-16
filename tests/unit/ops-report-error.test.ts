/**
 * @jest-environment node
 */
// Scrubbing / truncation rules of the server error reporter. These guard the
// promise that no secret, token or PII ever reaches logs, the error_events table
// or an admin alert.

import {
  scrubText,
  truncate,
  sanitizeDetails,
  buildErrorEvent,
  normalizeContext,
  normalizeRoute,
  errorMessage,
  trimStack,
  isSensitiveKey,
  isThrottled,
  alertChatId,
  formatAlert,
  MAX_MESSAGE_LENGTH,
  MAX_STACK_LINES,
  MAX_DETAIL_STRING_LENGTH,
  MAX_CONTEXT_LENGTH,
  ALERT_WINDOW_SECONDS,
} from '@/lib/server/report-error';

const NO_ENV = {} as NodeJS.ProcessEnv;

describe('truncate', () => {
  it('leaves short strings alone', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('cuts long strings to exactly max chars with a marker', () => {
    const out = truncate('x'.repeat(1000), 100);
    expect(out).toHaveLength(100);
    expect(out.endsWith('…[truncated]')).toBe(true);
  });

  it('handles tiny and non-positive limits', () => {
    expect(truncate('abcdef', 3)).toBe('abc');
    expect(truncate('abcdef', 0)).toBe('');
  });
});

describe('scrubText', () => {
  it('redacts the literal values of secret env vars', () => {
    const env = { CRON_SECRET: 'super-secret-cron-value-123', TELEGRAM_BOT_TOKEN: 'short' } as NodeJS.ProcessEnv;
    const out = scrubText('auth failed for super-secret-cron-value-123 (short)', env);
    expect(out).not.toContain('super-secret-cron-value-123');
    // Values under 8 chars are ignored so ordinary words aren't mangled.
    expect(out).toContain('(short)');
  });

  it('redacts bearer tokens and JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const out = scrubText(`Authorization: Bearer abc.def-123 and token ${jwt}`, NO_ENV);
    expect(out).not.toContain('abc.def-123');
    expect(out).not.toContain(jwt);
    expect(out).toContain('[redacted]');
  });

  it('redacts provider keys, bot tokens and private keys', () => {
    const samples = [
      'sk_live_51HabcdefGHIJKLmnop',
      'sk-ant-api03-abcdefghijklmnop',
      'whsec_abcdefghijklmnop',
      '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw',
      '0x' + 'ab'.repeat(32),
    ];
    for (const s of samples) {
      expect(scrubText(`value=${s} end`, NO_ENV)).not.toContain(s);
      expect(scrubText(`failed with ${s} end`, NO_ENV)).not.toContain(s);
    }
  });

  it('redacts a Telegram token inside an API URL', () => {
    const out = scrubText(
      'fetch https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/sendMessage failed',
      NO_ENV,
    );
    expect(out).not.toContain('AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw');
    expect(out).toContain('/sendMessage');
  });

  it('redacts emails and sensitive key=value pairs', () => {
    const out = scrubText('user jane.doe@example.com sent ?api_key=abc123&symbol=BTC password: hunter2', NO_ENV);
    expect(out).not.toContain('jane.doe@example.com');
    expect(out).toContain('[email]');
    expect(out).not.toContain('abc123');
    expect(out).not.toContain('hunter2');
    expect(out).toContain('symbol=BTC'); // non-sensitive context is kept
  });

  it('keeps ordinary diagnostic text intact', () => {
    const msg = 'relation "public.cron_runs" does not exist (code 42P01) for BTC at 2026-10-16';
    expect(scrubText(msg, NO_ENV)).toBe(msg);
  });
});

describe('isSensitiveKey', () => {
  it('drops credential / PII / transport keys', () => {
    for (const k of ['headers', 'Authorization', 'cookie', 'accessToken', 'apiKey', 'email', 'body', 'ip', 'clientIp', 'client_ip', 'walletAddress', 'password']) {
      expect(isSensitiveKey(k)).toBe(true);
    }
  });

  it('keeps ordinary diagnostic keys', () => {
    for (const k of ['symbol', 'executed', 'skipped', 'description', 'day', 'status', 'durationMs', 'zip']) {
      expect(isSensitiveKey(k)).toBe(false);
    }
  });
});

describe('sanitizeDetails', () => {
  it('drops sensitive keys and control fields, keeps primitives', () => {
    const out = sanitizeDetails(
      {
        route: '/api/x',
        level: 'warn',
        alert: false,
        headers: { authorization: 'Bearer x' },
        body: '{"a":1}',
        email: 'a@b.co',
        symbol: 'BTC',
        count: 3,
        ok: true,
        missing: undefined,
      },
      NO_ENV,
    );
    expect(out).toEqual({ symbol: 'BTC', count: 3, ok: true, missing: null });
  });

  it('truncates long strings and scrubs them', () => {
    const out = sanitizeDetails({ note: 'contact x@y.com ' + 'z'.repeat(1000) }, NO_ENV);
    const note = out.note as string;
    expect(note.length).toBeLessThanOrEqual(MAX_DETAIL_STRING_LENGTH);
    expect(note).not.toContain('x@y.com');
  });

  it('caps nesting depth, array length and key count', () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < 50; i++) many[`k${i}`] = i;
    const out = sanitizeDetails(
      { nested: { deeper: { deepest: 1 } }, list: Array.from({ length: 30 }, (_, i) => i), many },
      NO_ENV,
    );
    expect(out.nested).toEqual({ deeper: '[object]' });
    expect((out.list as unknown[]).length).toBe(10);
    expect(Object.keys(out.many as object).length).toBe(20);
  });

  it('normalizes non-JSON values', () => {
    const out = sanitizeDetails({ big: BigInt(5), nan: NaN, when: new Date('2026-01-01T00:00:00Z'), fn: () => 1 }, NO_ENV);
    expect(out).toEqual({ big: '5', nan: 'NaN', when: '2026-01-01T00:00:00.000Z' });
  });
});

describe('errorMessage', () => {
  it('reads Error, Postgrest-like objects, strings and junk', () => {
    const e = Object.assign(new Error('boom'), { code: 'E1' });
    expect(errorMessage(e)).toEqual({ message: 'boom', code: 'E1' });
    expect(errorMessage({ message: 'pg fail', code: '23505', details: 'x' })).toEqual({ message: 'pg fail', code: '23505' });
    expect(errorMessage('plain')).toEqual({ message: 'plain' });
    expect(errorMessage(42)).toEqual({ message: '42' });
  });
});

describe('trimStack', () => {
  it('keeps only the first frames and scrubs them', () => {
    const e = new Error('x');
    e.stack = ['Error: token=abcdef123456', ...Array.from({ length: 40 }, (_, i) => `    at fn${i} (file.ts:${i})`)].join('\n');
    const stack = trimStack(e, NO_ENV) as string;
    expect(stack.split('\n')).toHaveLength(MAX_STACK_LINES);
    expect(stack).not.toContain('abcdef123456');
  });

  it('is undefined for non-errors', () => {
    expect(trimStack('nope', NO_ENV)).toBeUndefined();
  });
});

describe('normalizeContext / normalizeRoute', () => {
  it('restricts context to a short safe identifier', () => {
    expect(normalizeContext('cron.engine-tick')).toBe('cron.engine-tick');
    expect(normalizeContext('bad context\n<script>')).toBe('bad_context__script_');
    expect(normalizeContext('a'.repeat(200))).toHaveLength(MAX_CONTEXT_LENGTH);
    expect(normalizeContext('')).toBe('unknown');
  });

  it('strips query strings, fragments and origins from routes', () => {
    expect(normalizeRoute('/api/x?token=abc#frag')).toBe('/api/x');
    expect(normalizeRoute('https://app.example.com/api/y?key=1')).toBe('/api/y');
    expect(normalizeRoute(undefined)).toBeUndefined();
    expect(normalizeRoute(42)).toBeUndefined();
  });
});

describe('buildErrorEvent', () => {
  const now = new Date('2026-10-16T12:00:00Z');

  it('produces a scrubbed, truncated, single-line-serializable event', () => {
    const env = { SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value-xyz' } as NodeJS.ProcessEnv;
    const err = new Error(`failed with service-role-key-value-xyz for bob@example.com ${'y'.repeat(2000)}`);
    const ev = buildErrorEvent('cron.dca-run', err, { route: '/api/dca/run?x=1', executed: 2, cookie: 'c=1' }, env, now);

    expect(ev.level).toBe('error');
    expect(ev.context).toBe('cron.dca-run');
    expect(ev.route).toBe('/api/dca/run');
    expect(ev.ts).toBe('2026-10-16T12:00:00.000Z');
    expect(ev.message.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    expect(ev.message).not.toContain('service-role-key-value-xyz');
    expect(ev.message).not.toContain('bob@example.com');
    expect(ev.details).toEqual({ executed: 2 });

    const line = JSON.stringify(ev);
    expect(line).not.toContain('\n');
    expect(line).not.toContain('service-role-key-value-xyz');
  });

  it('honours the warn level and records error codes', () => {
    const ev = buildErrorEvent('x', { message: 'dup', code: '23505' }, { level: 'warn' }, NO_ENV, now);
    expect(ev.level).toBe('warn');
    expect(ev.details.code).toBe('23505');
  });

  it('never produces an empty message', () => {
    expect(buildErrorEvent('x', new Error(''), {}, NO_ENV, now).message).toBe('Error');
    expect(buildErrorEvent('x', '', {}, NO_ENV, now).message).toBe('Unknown error');
  });
});

describe('alerting helpers', () => {
  it('throttles within the window only', () => {
    const t0 = 1_000_000;
    expect(isThrottled(undefined, t0)).toBe(false);
    expect(isThrottled(t0, t0 + 1000)).toBe(true);
    expect(isThrottled(t0, t0 + ALERT_WINDOW_SECONDS * 1000 - 1)).toBe(true);
    expect(isThrottled(t0, t0 + ALERT_WINDOW_SECONDS * 1000)).toBe(false);
  });

  it('only enables alerts with a bot token and a well-formed chat id', () => {
    const tok = { TELEGRAM_BOT_TOKEN: 'x' };
    expect(alertChatId({ ...tok, ALERT_TELEGRAM_CHAT_ID: '123456' } as NodeJS.ProcessEnv)).toBe('123456');
    expect(alertChatId({ ...tok, ALERT_TELEGRAM_CHAT_ID: '-100123' } as NodeJS.ProcessEnv)).toBe('-100123');
    expect(alertChatId({ ...tok, ALERT_TELEGRAM_CHAT_ID: '@ops_channel' } as NodeJS.ProcessEnv)).toBe('@ops_channel');
    expect(alertChatId({ ...tok, ALERT_TELEGRAM_CHAT_ID: '12; drop' } as NodeJS.ProcessEnv)).toBeNull();
    expect(alertChatId({ ALERT_TELEGRAM_CHAT_ID: '123456' } as NodeJS.ProcessEnv)).toBeNull();
    expect(alertChatId(tok as NodeJS.ProcessEnv)).toBeNull();
  });

  it('formats alerts without stack or details', () => {
    const e = new Error('kaboom');
    const ev = buildErrorEvent('cron.anchor-run', e, { route: '/api/anchor/run', day: '2026-10-15' }, NO_ENV, new Date(0));
    const text = formatAlert(ev);
    expect(text).toContain('cron.anchor-run');
    expect(text).toContain('kaboom');
    expect(text).toContain('/api/anchor/run');
    expect(ev.stack).toContain('ops-report-error.test'); // the stack exists...
    expect(text).not.toContain('ops-report-error.test'); // ...but is not sent
    expect(text).not.toContain('2026-10-15');
    expect(text.length).toBeLessThanOrEqual(1000);
  });
});
