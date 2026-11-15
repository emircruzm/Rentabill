export type RecoveryLinkResult =
  | { kind: 'none' }
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; message: string };

const OTP_EXPIRED_MESSAGE =
  'El enlace venció o ya se usó. Pide uno nuevo desde «¿Olvidaste tu contraseña?».';
const GENERIC_ERROR_MESSAGE =
  'No se pudo validar el enlace. Pide uno nuevo desde «¿Olvidaste tu contraseña?».';

/**
 * Parsea el hash de la URL emitido por Supabase Auth en flujos de recuperación de contraseña.
 * 
 * Reglas de seguridad:
 * - Nunca incluye tokens ni valores sensibles en los mensajes de error.
 * - Rechaza tokens ausentes o en blanco.
 * - Ignora flujos distintos a recovery (ej. type=signup).
 */
export function parseRecoveryHash(hash: string): RecoveryLinkResult {
  if (!hash) {
    return { kind: 'none' };
  }

  const rawHash = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!rawHash) {
    return { kind: 'none' };
  }

  const params = new URLSearchParams(rawHash);

  const errorCode = params.get('error_code');
  const error = params.get('error');

  if (errorCode || error) {
    if (errorCode === 'otp_expired') {
      return { kind: 'error', message: OTP_EXPIRED_MESSAGE };
    }
    return { kind: 'error', message: GENERIC_ERROR_MESSAGE };
  }

  const type = params.get('type');
  if (type === 'recovery') {
    const accessToken = params.get('access_token')?.trim();
    const refreshToken = params.get('refresh_token')?.trim();

    if (accessToken && refreshToken) {
      return {
        kind: 'tokens',
        accessToken,
        refreshToken,
      };
    }

    return { kind: 'error', message: GENERIC_ERROR_MESSAGE };
  }

  return { kind: 'none' };
}
