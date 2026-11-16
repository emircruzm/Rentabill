import { isPasswordLongEnough, PASSWORD_TOO_SHORT_MESSAGE } from './passwordPolicy.ts';

/**
 * Valida el cambio de contraseña en Ajustes.
 *
 * Reglas en estricto orden de prioridad:
 * 1. current vacío -> "Escribe tu contraseña actual."
 * 2. next vacío -> "Escribe tu nueva contraseña."
 * 3. confirm vacío -> "Confirma tu nueva contraseña."
 * 4. next !== confirm -> "Las contraseñas no coinciden."
 * 5. current === next -> "La nueva contraseña debe ser diferente de la actual."
 * 6. !isPasswordLongEnough(next) -> PASSWORD_TOO_SHORT_MESSAGE
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

  if (!isPasswordLongEnough(cleanNext)) {
    return PASSWORD_TOO_SHORT_MESSAGE;
  }

  return null;
}
