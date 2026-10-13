type PageResult<T> = {
  data: T[] | null;
  error: unknown;
};

export async function loadAllPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000
) {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
