import { teamRepository } from '@data/repositories/teamRepository';
import { UserRole } from '@shared/types/index';

export async function inviteMemberUseCase(
  storeId: string,
  targetUserId: string,
  role: UserRole
): Promise<any> {
  if (!storeId || !targetUserId) {
    throw new Error('ID de tienda y usuario destino requeridos');
  }
  return await teamRepository.inviteByCode(storeId, targetUserId, role);
}

export async function cancelInvitationUseCase(invitationId: string): Promise<void> {
  if (!invitationId) {
    throw new Error('ID de invitación requerido');
  }
  await teamRepository.cancelInvitation(invitationId);
}
