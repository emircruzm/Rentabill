/**
 * Helper to translate Supabase Auth and Database errors into friendly Spanish messages.
 */
export function formatAuthError(error: any): string {
  if (!error) return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
  const msg = typeof error === 'string' ? error : error.message || '';

  if (msg.includes('Invalid login credentials') || msg.includes('invalid_grant')) {
    return 'Correo o contraseña incorrectos. Por favor verifica tus datos.';
  }
  if (msg.includes('Email not confirmed') || msg.includes('email_not_confirmed')) {
    return 'Debes confirmar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada o spam.';
  }
  if (msg.includes('User already registered') || msg.includes('user_already_exists')) {
    return 'Ya existe una cuenta con este correo electrónico. Inicia sesión en su lugar.';
  }
  if (
    msg.includes('Password should be at least') ||
    msg.includes('weak_password') ||
    msg.includes('at least 6 characters')
  ) {
    return 'La contraseña es muy corta. Debe tener al menos 6 caracteres.';
  }
  if (
    msg.includes('invalid email') ||
    msg.includes('Unable to validate email') ||
    msg.includes('valid email')
  ) {
    return 'El formato del correo electrónico no es válido.';
  }
  if (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('network') ||
    msg.includes('fetch')
  ) {
    return 'Error de conexión con el servidor. Verifica tu conexión a internet e inténtalo de nuevo.';
  }
  if (
    msg.includes('over_email_send_rate_limit') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests')
  ) {
    return 'Demasiados intentos seguidos. Por favor espera unos momentos antes de reintentar.';
  }
  if (
    msg.includes('row-level security') ||
    msg.includes('violates row-level security') ||
    msg.includes('42501')
  ) {
    return 'Error de permisos en la base de datos. Verifica que tu sesión siga activa.';
  }

  return msg;
}
