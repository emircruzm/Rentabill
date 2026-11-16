export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_TOO_SHORT_MESSAGE = 'La contraseña debe tener al menos 8 caracteres.';

/**
 * Valida si una contraseña cumple con la longitud mínima requerida por la política unificada.
 * Rechaza cadenas vacías, nulas o compuestas únicamente por espacios en blanco.
 */
export function isPasswordLongEnough(p: string): boolean {
  if (typeof p !== 'string') return false;
  return p.trim().length >= MIN_PASSWORD_LENGTH;
}
