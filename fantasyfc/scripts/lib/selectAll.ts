// Supabase (PostgREST) returns at most max_rows rows per request: 1,000 here
// and on the hosted project (supabase/config.toml). With ten leagues,
// football_players alone is ~6,700 rows and MLS's squads are ~960, so any
// read that can grow past that must page, or rows are silently dropped.

export const PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Reads every row by fetching `PAGE_SIZE` at a time until a short page.
 * `page(from, to)` must apply `.range(from, to)` to a query with a stable,
 * unique ordering (e.g. `.order("id")`), or rows can repeat or go missing
 * between pages.
 */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load ${label}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
