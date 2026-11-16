import { authRepository } from '@data/repositories/authRepository';
import { UserRole } from '@shared/types/index';
import { isPasswordLongEnough, PASSWORD_TOO_SHORT_MESSAGE, validatePasswordChange } from '@shared/index';

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
  if (!isPasswordLongEnough(newPassword)) {
    throw new Error(PASSWORD_TOO_SHORT_MESSAGE);
  }
  const { data, error } = await authRepository.updatePassword(newPassword);
  if (error) {
    throw error;
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

  const { data, error: updateError } = await authRepository.updatePassword(newPassword.trim());
  if (updateError) {
    throw updateError;
  }

  return { user: data?.user };
}


