import { teamRepository } from '@data/repositories/teamRepository';

export async function acceptInvitationUseCase(invitationId: string): Promise<any> {
  if (!invitationId) {
    throw new Error('ID de invitación requerido');
  }
  return await teamRepository.acceptInvitation(invitationId);
}

export async function respondInvitationUseCase(
  invitationId: string,
  action: 'ACCEPT' | 'REJECT'
): Promise<any> {
  if (!invitationId) {
    throw new Error('ID de invitación requerido');
  }
  return await teamRepository.respondInvitation(invitationId, action);
}
