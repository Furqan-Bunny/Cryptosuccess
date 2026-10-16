// PostgREST caps every response (tables AND set-returning RPCs) at db-max-rows,
// 1000 on Supabase by default, and truncates silently. Reads that must see every
// row go through readAllPages, which keeps requesting consecutive ranges until a
// short page comes back. The query must have a stable, total order.
export const POSTGREST_PAGE = 1000;

export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize: number = POSTGREST_PAGE,
  maxPages: number = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
  // Refuse to return a set that may be incomplete.
  throw new Error(`readAllPages: more than ${maxPages} pages`);
}
