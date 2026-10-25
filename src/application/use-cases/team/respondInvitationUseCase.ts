import { teamRepository } from '@data/repositories/teamRepository';

export async function acceptInvitationUseCase(token: string): Promise<any> {
  if (!token) {
    throw new Error('Token de invitación requerido');
  }
  return await teamRepository.acceptInvitation(token);
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
