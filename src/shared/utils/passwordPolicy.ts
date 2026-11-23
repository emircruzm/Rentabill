export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_BYTES = 72;
export const PASSWORD_POLICY_MESSAGE =
  'La contraseña debe tener al menos 10 caracteres e incluir al menos una letra y un número.';
export const PASSWORD_TOO_LONG_MESSAGE =
  'La contraseña es demasiado larga. Usa un máximo de 72 caracteres.';
export const PASSWORD_TOO_SHORT_MESSAGE = PASSWORD_POLICY_MESSAGE;

/**
 * Calcula la longitud en bytes (UTF-8) de una contraseña.
 */
export function getPasswordByteLength(password: string): number {
  if (typeof password !== 'string') return 0;
  if (typeof Buffer !== 'undefined') {
    return Buffer.byteLength(password, 'utf8');
  }
  return new TextEncoder().encode(password).length;
}

/**
 * Valida si una contraseña cumple con la política unificada de seguridad (H-15):
 * - Mínimo 10 caracteres (sin contar espacios iniciales/finales vacíos)
 * - Al menos una letra (soporta mayúsculas, minúsculas y caracteres unicode como ñ/tildes)
 * - Al menos un dígito numérico (0-9)
 * - Máximo 72 bytes (límite de hashing bcrypt)
 * - Rechaza cadenas vacías, nulas o con solo espacios.
 */
export function isPasswordValid(password: string): boolean {
  if (typeof password !== 'string') return false;

  const trimmed = password.trim();
  if (trimmed.length < MIN_PASSWORD_LENGTH) return false;

  // Límite de 72 bytes para compatibilidad con bcrypt
  if (getPasswordByteLength(password) > MAX_PASSWORD_BYTES) return false;

  // Al menos una letra (alfabetos latinos, acentuados, ñ, etc.)
  const hasLetter = /\p{L}/u.test(password);

  // Al menos un dígito numérico
  const hasDigit = /\d/.test(password);

  return hasLetter && hasDigit;
}

/**
 * Alias de compatibilidad para mantener sincronizadas las firmas previas.
 */
export function isPasswordLongEnough(p: string): boolean {
  return isPasswordValid(p);
}

/**
 * Retorna null si la contraseña es válida, o el mensaje de error correspondiente:
 * - 'Escribe una contraseña.' si está vacía.
 * - PASSWORD_TOO_LONG_MESSAGE si falla solo por exceder los 72 bytes.
 * - PASSWORD_POLICY_MESSAGE en los demás casos.
 */
export function validatePassword(password: string): string | null {
  if (!password || !password.trim()) {
    return 'Escribe una contraseña.';
  }
  if (isPasswordValid(password)) {
    return null;
  }

  const exceedsBytes = getPasswordByteLength(password) > MAX_PASSWORD_BYTES;
  const hasMinLength = password.trim().length >= MIN_PASSWORD_LENGTH;
  const hasLetter = /\p{L}/u.test(password);
  const hasDigit = /\d/.test(password);

  if (exceedsBytes && hasMinLength && hasLetter && hasDigit) {
    return PASSWORD_TOO_LONG_MESSAGE;
  }

  return PASSWORD_POLICY_MESSAGE;
}
