import { authRepository } from '@data/repositories/authRepository';
import { UserRole } from '@shared/types/index';
import { isPasswordValid, PASSWORD_POLICY_MESSAGE, validatePasswordChange } from '@shared/index';

export async function loginUseCase(email: string, password: string) {
  if (!email || !password) {
    throw new Error('Correo y contraseña son requeridos');
  }
  return await authRepository.signInWithPassword(email.trim(), password);
}

export async function registerUseCase(
  name: string,
  email: string,
  password?: string,
  role?: UserRole,
  phone?: string
) {
  if (!email) {
    throw new Error('El correo es requerido');
  }
  if (password && !isPasswordValid(password)) {
    throw new Error(PASSWORD_POLICY_MESSAGE);
  }
  return await authRepository.signUp(
    email.trim(),
    password || '',
    name.trim(),
    role || 'ADMIN',
    phone?.trim()
  );
}

export async function logoutUseCase() {
  return await authRepository.signOut();
}

export async function getSessionUseCase() {
  return await authRepository.getSession();
}

export async function resendConfirmationUseCase(email: string) {
  if (!email) {
    throw new Error('El correo es requerido');
  }
  return await authRepository.resendEmailConfirmation(email.trim());
}

export async function resetPasswordUseCase(email: string) {
  if (!email) {
    throw new Error('El correo es requerido');
  }
  return await authRepository.resetPasswordForEmail(email.trim());
}

export async function applyRecoverySessionUseCase(accessToken: string, refreshToken: string) {
  if (!accessToken || !refreshToken) {
    throw new Error('Tokens de recuperación no válidos');
  }
  const { data, error } = await authRepository.setSessionFromTokens(accessToken, refreshToken);
  if (error) {
    throw error;
  }
  if (!data?.session) {
    throw new Error('No se pudo establecer la sesión de recuperación');
  }
  return data;
}

export async function updatePasswordUseCase(newPassword: string) {
  const cleanPassword = newPassword.trim();
  if (!isPasswordValid(cleanPassword)) {
    throw new Error(PASSWORD_POLICY_MESSAGE);
  }
  // En recuperación NO se envía current_password
  const { data, error } = await authRepository.updatePassword(cleanPassword);
  if (error) {
    throw error;
  }

  // H-13: Cerrar otras sesiones activas de forma segura
  try {
    await authRepository.signOutOthers();
  } catch {
    console.warn('Aviso: No se pudieron cerrar otras sesiones activas');
  }

  return data;
}

export async function changePasswordUseCase(
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<{ user: any }> {
  const validationError = validatePasswordChange(
    currentPassword,
    newPassword.trim(),
    newPassword.trim()
  );
  if (validationError) {
    throw new Error(validationError);
  }

  const { error: signInError } = await authRepository.signInWithPassword(email.trim(), currentPassword);
  if (signInError) {
    const errObj = signInError as any;
    const msg = String(errObj.message || '');
    if (
      errObj.code === 'invalid_credentials' ||
      msg.includes('Invalid login credentials') ||
      msg.includes('invalid_grant')
    ) {
      throw new Error('La contraseña actual es incorrecta.');
    }
    throw signInError;
  }

  // H-11: Se envía current_password en updateUser
  const { data, error: updateError } = await authRepository.updatePassword(newPassword.trim(), currentPassword);
  if (updateError) {
    throw updateError;
  }

  // H-13: Cerrar otras sesiones activas con scope 'others' dentro de try/catch
  try {
    await authRepository.signOutOthers();
  } catch {
    console.warn('Aviso: No se pudieron cerrar otras sesiones activas');
  }

  return { user: data?.user };
}


