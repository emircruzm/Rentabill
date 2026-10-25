import { StoreConfig, TeamMember, TeamInvitation, UserStoreMembership } from '@shared/types/index';

export const storeMapper = {
  fromStoreRow(row: any): StoreConfig {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      logoUrl: row.logo_url,
      qrImageUrl: row.qr_image_url || undefined,
      currency: row.currency || 'PEN',
      ownerId: row.owner_id,
    };
  },

  fromMemberRow(row: any): TeamMember {
    const prof = row.profiles || {};
    return {
      id: row.user_id,
      name: prof.full_name || 'Miembro',
      role: row.role,
      contact: prof.phone || prof.email || '',
      addedDate: new Date(row.joined_at || Date.now()).toISOString().split('T')[0],
      isOwner: row.role === 'ADMIN',
    };
  },

  fromInvitationRow(row: any): TeamInvitation {
    const prof = row.profiles || {};
    const store = row.stores || {};
    return {
      id: row.id,
      userId: row.user_id || row.target_user_id || '',
      userName: prof.full_name || 'Invitado',
      userEmail: prof.email || '',
      userPhone: prof.phone || '',
      role: row.role,
      status: row.status === 'PENDING' ? 'Esperando' : row.status,
      invitedAt: row.created_at || new Date().toISOString(),
      storeName: store.name || 'Mi Tienda',
      inviterName: row.inviter_name || 'Administrador',
    };
  },

  fromMembershipRow(row: any): UserStoreMembership {
    const s = row.stores || {};
    return {
      storeId: row.store_id,
      storeName: s.name || 'Mi Tienda',
      storeType: s.type || 'Abarrotes',
      role: row.role,
      isOwner: row.role === 'ADMIN',
      isActive: false,
    };
  },
};
