import { supabase } from '@data/supabase/client';
import { TeamMember, TeamInvitation, UserRole, RegisteredDirectoryUser } from '@shared/types/index';
import { storeMapper } from '@data/mappers/storeMapper';

export const teamRepository = {
  async getMembersByStoreId(storeId: string): Promise<TeamMember[]> {
    const { data, error } = await supabase
      .from('store_members')
      .select('user_id, role, joined_at, profiles(id, name, email, phone, user_code)')
      .eq('store_id', storeId);

    if (error) throw error;
    return (data || []).map(storeMapper.fromMemberRow);
  },

  async getInvitationsByStoreId(storeId: string): Promise<TeamInvitation[]> {
    const { data, error } = await supabase
      .from('store_invitations')
      .select('*')
      .eq('store_id', storeId)
      .eq('status', 'PENDING');

    if (error) throw error;
    return (data || []).map(storeMapper.fromInvitationRow);
  },

  async inviteByCode(storeId: string, userCode: string, role: UserRole = 'CAJERO'): Promise<any> {
    const { data, error } = await supabase.rpc('invite_by_code', {
      p_store_id: storeId,
      p_user_code: userCode.trim().toUpperCase(),
      p_role: role,
    });
    if (error) throw error;
    return data;
  },

  async cancelInvitation(invitationId: string): Promise<void> {
    const { error } = await supabase
      .from('store_invitations')
      .delete()
      .eq('id', invitationId);

    if (error) throw error;
  },

  async acceptInvitation(token: string): Promise<any> {
    const { data, error } = await supabase.rpc('accept_invitation', {
      p_token: token.trim(),
    });
    if (error) throw error;
    return data;
  },

  async respondInvitation(invitationId: string, action: 'ACCEPT' | 'REJECT'): Promise<any> {
    const { data, error } = await supabase.rpc('respond_invitation', {
      p_invitation_id: invitationId,
      p_action: action,
    });
    if (error) throw error;
    return data;
  },

  async changeMemberRole(storeId: string, targetUserId: string, newRole: UserRole): Promise<void> {
    const { error } = await supabase.rpc('change_member_role', {
      p_store_id: storeId,
      p_target_user_id: targetUserId,
      p_new_role: newRole,
    });
    if (error) throw error;
  },

  async removeMember(storeId: string, targetUserId: string): Promise<void> {
    const { error } = await supabase.rpc('remove_member', {
      p_store_id: storeId,
      p_target_user_id: targetUserId,
    });
    if (error) throw error;
  },

  async findUserById(userId: string): Promise<RegisteredDirectoryUser | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, phone, user_code')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return {
      userId: data.id,
      name: data.name || 'Usuario',
      email: data.email || '',
      phone: data.phone || '',
    };
  },
};
