/**
 * src/application/logic/bulkErrorMessages.ts
 *
 * Función pura para traducir errores de inserción masiva a mensajes amables para el usuario.
 */

export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }

  if (!error) return false;

  const msg = typeof error === 'string'
    ? error
    : (error as any).message || String(error);

  const lowerMsg = msg.toLowerCase();
  return (
    lowerMsg.includes('failed to fetch') ||
    lowerMsg.includes('load failed') ||
    lowerMsg.includes('networkerror') ||
    lowerMsg.includes('network error')
  );
}

export function isDuplicateKeyError(error: unknown): boolean {
  if (!error) return false;

  const code = (error as any).code || '';
  const msg = typeof error === 'string'
    ? error
    : (error as any).message || String(error);

  const lowerMsg = msg.toLowerCase();
  return (
    code === '23505' ||
    lowerMsg.includes('23505') ||
    lowerMsg.includes('duplicate key') ||
    lowerMsg.includes('uq_products_')
  );
}

export function friendlyBulkError(
  error: unknown,
  insertedCount: number,
  totalCount: number
): string {
  if (isNetworkError(error)) {
    if (insertedCount === 0) {
      return 'No hay conexión con el servidor. No se guardó ningún producto. Revisa tu internet y vuelve a intentarlo.';
    }
    return `Se perdió la conexión. Se guardaron ${insertedCount} de ${totalCount} productos. Vuelve a pegar el archivo: los ya guardados aparecerán como existentes y solo se enviarán los pendientes.`;
  }

  if (isDuplicateKeyError(error)) {
    return 'Algunos productos ya existen (nombre, código de barras o SKU repetido). Recarga la página para ver los que ya se guardaron.';
  }

  const rawMessage = typeof error === 'string'
    ? error
    : (error as any)?.message || String(error || 'Error desconocido');

  return `No se pudo guardar: ${rawMessage}`;
}
