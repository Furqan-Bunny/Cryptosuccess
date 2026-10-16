// Date parsing for values read from Supabase. Postgres timestamptz columns come
// back as ISO-8601 strings (not Firestore Timestamps), and some in-memory
// objects already hold Date instances, so accept both (plus epoch millis).

/** Parse a Date | ISO string | epoch-ms value. Returns null when absent or invalid. */
export function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  let d: Date;
  if (value instanceof Date) d = value;
  else if (typeof value === 'string' || typeof value === 'number') d = new Date(value);
  else return null;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Locale date string for a timestamp, or `fallback` when it can't be parsed. */
export function formatDate(value: unknown, fallback = '—'): string {
  const d = parseDate(value);
  return d ? d.toLocaleDateString() : fallback;
}

/** Compact relative time ("just now", "5m ago", "3h ago", "2d ago"). */
export function timeAgo(value: unknown, now: number = Date.now()): string {
  const d = parseDate(value);
  if (!d) return '';
  const seconds = Math.max(0, Math.floor((now - d.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
