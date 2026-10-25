import { authRepository } from '@data/repositories/authRepository';
import { UserRole } from '@shared/types/index';

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

