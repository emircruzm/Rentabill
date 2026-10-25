import { teamRepository } from '@data/repositories/teamRepository';
import { UserRole } from '@shared/types/index';

export async function inviteMemberUseCase(
  storeId: string,
  userCode: string,
  role: UserRole
): Promise<any> {
  if (!storeId || !userCode) {
    throw new Error('ID de tienda y código de usuario requeridos');
  }
  return await teamRepository.inviteByCode(storeId, userCode, role);
}

export async function cancelInvitationUseCase(invitationId: string): Promise<void> {
  if (!invitationId) {
    throw new Error('ID de invitación requerido');
  }
  await teamRepository.cancelInvitation(invitationId);
}
