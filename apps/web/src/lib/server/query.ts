import type { SupabaseClient } from '@supabase/supabase-js';

interface OrderOption {
  column: string;
  ascending?: boolean;
}

interface FetchOptions {
  order?: OrderOption;
  pageSize?: number;
  maxRows?: number;
}

/**
 * Lectura paginada sobre PostgREST.
 *
 * PostgREST limita cada respuesta (1,000 filas por defecto), así que
 * los agregados de plataforma necesitan recorrer páginas. `maxRows`
 * acota el trabajo del servidor en tablas que crecen sin límite.
 */
export async function fetchAllRows<T>(
  client: SupabaseClient,
  table: string,
  select: string,
  options: FetchOptions = {}
): Promise<T[]> {
  const pageSize = options.pageSize ?? 1000;
  const maxRows = options.maxRows ?? 20000;
  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize, maxRows) - 1;

    let query = client.from(table).select(select).range(from, to);

    if (options.order) {
      query = query.order(options.order.column, {
        ascending: options.order.ascending ?? false,
      });
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`No se pudo leer ${table}: ${error.message}`);
    }

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  return rows;
}
