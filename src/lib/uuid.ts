// Canonical UUID shape check (any version). Used to reject malformed ids before
// they reach a query or a message — Postgres would otherwise raise on a uuid
// column, and untrusted strings should never be echoed back.
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
