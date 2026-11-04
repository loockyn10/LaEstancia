/**
 * PostgREST limita cada respuesta a `max_rows` (1000 por defecto en Supabase). Una consulta sin paginar
 * sobre un catálogo más grande se trunca en silencio, así que toda lectura "completa" pasa por acá.
 *
 * La consulta debe tener un orden estable y único (por ejemplo `.order("id")`) para no repetir ni
 * perder filas entre páginas.
 */
export const SUPABASE_PAGE_SIZE = 1000;

type PageResult<Row, Failure> = { data: Row[] | null; error: Failure | null };

export async function fetchAllRows<Row, Failure = unknown>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<Row, Failure>>,
  pageSize = SUPABASE_PAGE_SIZE,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
