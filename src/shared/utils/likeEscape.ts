/**
 * Utilidades para sanitización y coincidencia exacta en consultas LIKE / ILIKE de PostgREST (H-03).
 */

/**
 * Escapa comodines especiales de PostgREST y SQL LIKE/ILIKE (\, %, _).
 *
 * El orden de reemplazo es estricto: primero se escapa la barra inversa '\'
 * para evitar re-escapar barras generadas posteriormente.
 *
 * NOTA SOBRE EL ASTERISCO (*):
 * PostgREST interpreta '*' como comodín adicional en sus filtros de búsqueda.
 * No se escapa aquí porque PostgREST no provee un mecanismo estándar uniforme
 * de escape de asterisco en URLs. Por ello, para búsquedas EXACTAS se debe
 * recuperar el conjunto de filas candidatas y resolver la coincidencia final
 * en JavaScript usando `pickExactIgnoreCase`.
 */
export function escapeLikePattern(value: string): string {
  if (!value) return '';
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * Selecciona la primera fila cuyo campo coincida exactamente con el objetivo,
 * normalizando ambos lados mediante trim() y toLowerCase().
 *
 * @param rows Lista de filas devueltas por la consulta.
 * @param getValue Función extractora del valor textual de cada fila.
 * @param target Cadena objetivo buscada.
 * @returns La primera fila coincidente o null si no hay coincidencias.
 */
export function pickExactIgnoreCase<T>(
  rows: T[] | null | undefined,
  getValue: (r: T) => string | null | undefined,
  target: string
): T | null {
  if (!rows || rows.length === 0 || target === null || target === undefined) {
    return null;
  }
  const normalizedTarget = target.trim().toLowerCase();
  for (const row of rows) {
    const rawVal = getValue(row);
    if (rawVal !== null && rawVal !== undefined) {
      if (rawVal.trim().toLowerCase() === normalizedTarget) {
        return row;
      }
    }
  }
  return null;
}
