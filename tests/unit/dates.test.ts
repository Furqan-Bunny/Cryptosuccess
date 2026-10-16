import { formatDate, parseDate, timeAgo } from '../../src/lib/dates';

describe('parseDate', () => {
  it('parses ISO strings from Postgres timestamptz', () => {
    const d = parseDate('2026-06-24T10:15:00+00:00');
    expect(d).toBeInstanceOf(Date);
    expect(d!.toISOString()).toBe('2026-06-24T10:15:00.000Z');
  });

  it('passes Date instances through and accepts epoch millis', () => {
    const now = new Date();
    expect(parseDate(now)).toBe(now);
    expect(parseDate(0)!.getTime()).toBe(0);
  });

  it('returns null for missing, invalid or unsupported values', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate('not a date')).toBeNull();
    // A Firestore-style Timestamp object is no longer a supported shape.
    expect(parseDate({ toDate: () => new Date() })).toBeNull();
  });
});

describe('formatDate', () => {
  it('formats the REAL date, not today', () => {
    const iso = '2020-02-03T12:00:00Z';
    expect(formatDate(iso)).toBe(new Date(iso).toLocaleDateString());
    expect(formatDate(iso)).not.toBe(new Date().toLocaleDateString());
  });

  it('uses the fallback for unparseable input', () => {
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('nope', 'N/A')).toBe('N/A');
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-06-24T12:00:00Z');

  it('buckets elapsed time', () => {
    expect(timeAgo('2026-06-24T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-06-24T11:55:00Z', now)).toBe('5m ago');
    expect(timeAgo('2026-06-24T09:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2026-06-22T12:00:00Z', now)).toBe('2d ago');
  });

  it('clamps future timestamps and ignores bad input', () => {
    expect(timeAgo('2026-06-24T12:05:00Z', now)).toBe('just now');
    expect(timeAgo(null, now)).toBe('');
  });
});
