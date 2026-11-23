import {
  isPasswordValid,
  validatePassword,
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_TOO_LONG_MESSAGE,
} from './passwordPolicy.ts';

/**
 * Valida el cambio de contraseña en Ajustes.
 *
 * Reglas en estricto orden de prioridad:
 * 1. current vacío -> "Escribe tu contraseña actual."
 * 2. next vacío -> "Escribe tu nueva contraseña."
 * 3. confirm vacío -> "Confirma tu nueva contraseña."
 * 4. next !== confirm -> "Las contraseñas no coinciden."
 * 5. current === next -> "La nueva contraseña debe ser diferente de la actual."
 * 6. !isPasswordValid(next) -> PASSWORD_TOO_LONG_MESSAGE (si falla solo por >72 bytes) | PASSWORD_POLICY_MESSAGE
 * 7. éxito -> null
 */
export function validatePasswordChange(
  current: string,
  next: string,
  confirm: string
): string | null {
  if (!current || !current.trim()) {
    return 'Escribe tu contraseña actual.';
  }

  const cleanNext = (next || '').trim();
  if (!cleanNext) {
    return 'Escribe tu nueva contraseña.';
  }

  const cleanConfirm = (confirm || '').trim();
  if (!cleanConfirm) {
    return 'Confirma tu nueva contraseña.';
  }

  if (cleanNext !== cleanConfirm) {
    return 'Las contraseñas no coinciden.';
  }

  if (cleanNext === current || cleanNext === current.trim()) {
    return 'La nueva contraseña debe ser diferente de la actual.';
  }

  if (!isPasswordValid(cleanNext)) {
    return validatePassword(cleanNext) ?? PASSWORD_POLICY_MESSAGE;
  }

  return null;
}
