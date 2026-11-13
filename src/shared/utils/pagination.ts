/**
 * src/shared/utils/pagination.ts
 *
 * Utilidad pura de paginación automática para sobrepasar límites de filas de la API
 * (e.g. max_rows = 1000 en PostgREST / Supabase).
 *
 * Características:
 *  - Caso común de 1 sola página sin overhead adicional.
 *  - Detección dinámica del tamaño de página del servidor.
 *  - Peticiones concurrentes limitadas (hasta 4 en paralelo).
 *  - Deduplicación por id.
 *  - Verificación estricta de cantidad final vs total reportado con un reintento si hay inconsistencia.
 */

export interface PageResult<T> {
  rows: T[];
  count: number | null;
}

export type FetchPageFn<T> = (from: number, to: number) => Promise<PageResult<T>>;

export interface FetchAllPagesOptions {
  maxConcurrency?: number;
  initialPageSize?: number;
  onPageFetched?: () => void;
}

export class InconsistentPaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InconsistentPaginationError';
  }
}

/**
 * Mapeo concurrente con límite de trabajadores en paralelo.
 */
async function mapConcurrent<Item, Res>(
  items: Item[],
  concurrency: number,
  fn: (item: Item, index: number) => Promise<Res>
): Promise<Res[]> {
  if (items.length === 0) return [];
  const results = new Array<Res>(items.length);
  let currentIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Ejecuta una pasada de paginación completa.
 */
async function executeSinglePass<T extends { id: string | number }>(
  fetchPage: FetchPageFn<T>,
  options?: FetchAllPagesOptions
): Promise<T[]> {
  const initialPageSize = options?.initialPageSize ?? 1000;
  const maxConcurrency = options?.maxConcurrency ?? 4;

  // 1. Pedir página 0: rango 0..(initialPageSize - 1)
  const page0 = await fetchPage(0, initialPageSize - 1);
  options?.onPageFetched?.();

  const total = page0.count;
  if (typeof total !== 'number') {
    throw new Error('fetchPage debe devolver la propiedad count como número');
  }

  const rows0 = page0.rows || [];

  // Caso tienda vacía
  if (total === 0) {
    return [];
  }

  // 2. Si rows.length >= total, devolver (caso común: 1 sola petición)
  if (rows0.length >= total) {
    const seen = new Set<string | number>();
    const unique: T[] = [];
    for (const r of rows0) {
      if (r && r.id !== undefined && !seen.has(r.id)) {
        seen.add(r.id);
        unique.push(r);
      }
    }

    if (unique.length !== total) {
      throw new InconsistentPaginationError(
        `Discrepancia en página inicial: count=${total}, únicos=${unique.length}`
      );
    }

    return unique;
  }

  // 3. Tamaño efectivo de página = rows.length de la página 0 (sin asumir tope 1000)
  const effectivePageSize = rows0.length;
  if (effectivePageSize <= 0) {
    throw new InconsistentPaginationError(
      `Página inicial devolvió 0 filas pero count=${total}`
    );
  }

  // Calcular rangos restantes
  const ranges: Array<{ from: number; to: number }> = [];
  for (let from = effectivePageSize; from < total; from += effectivePageSize) {
    const to = from + effectivePageSize - 1;
    ranges.push({ from, to });
  }

  // Pedir en paralelo (hasta maxConcurrency a la vez)
  const otherPages = await mapConcurrent(ranges, maxConcurrency, async (range) => {
    const res = await fetchPage(range.from, range.to);
    options?.onPageFetched?.();
    return res;
  });

  // 4. Unir y eliminar duplicados por id
  const allRows = [...rows0];
  for (const page of otherPages) {
    if (page?.rows) {
      allRows.push(...page.rows);
    }
  }

  const seen = new Set<string | number>();
  const uniqueRows: T[] = [];
  for (const item of allRows) {
    if (item && item.id !== undefined && !seen.has(item.id)) {
      seen.add(item.id);
      uniqueRows.push(item);
    }
  }

  if (uniqueRows.length !== total) {
    throw new InconsistentPaginationError(
      `Inconsistencia en paginación: se esperaban ${total} elementos pero se obtuvieron ${uniqueRows.length}`
    );
  }

  return uniqueRows;
}

/**
 * Carga todas las páginas de una consulta paginada.
 * Si ocurre una inconsistencia en el conteo total, repite la carga completa UNA vez.
 * Si cualquier página falla con error, se propaga inmediatamente.
 */
export async function fetchAllPages<T extends { id: string | number }>(
  fetchPage: FetchPageFn<T>,
  options?: FetchAllPagesOptions
): Promise<T[]> {
  try {
    return await executeSinglePass(fetchPage, options);
  } catch (err) {
    if (err instanceof InconsistentPaginationError) {
      // Repetir la carga completa UNA vez
      return await executeSinglePass(fetchPage, options);
    }
    // Si CUALQUIER página falla o error externo, lanzar
    throw err;
  }
}
