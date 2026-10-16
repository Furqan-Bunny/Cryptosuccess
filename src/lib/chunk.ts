// PostgREST filters travel in the request URL, so an `in (...)` list of a few
// hundred UUIDs produces a request line long enough for the API gateway to
// reject (414 / 400). Every bulk `.in()` lookup is split into chunks of at most
// IN_LIST_CHUNK values (~3.9 KB of encoded UUIDs).
export const IN_LIST_CHUNK = 100;

/** Split `items` into consecutive slices of at most `size` elements. */
export function chunk<T>(items: readonly T[], size: number = IN_LIST_CHUNK): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error(`invalid chunk size: ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
