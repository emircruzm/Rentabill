import { supabase } from '@data/supabase/client';
import { StoreConfig, UserStoreMembership } from '@shared/types/index';
import { storeMapper } from '@data/mappers/storeMapper';

export const storesRepository = {
  async getStoreById(storeId: string): Promise<StoreConfig | null> {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return storeMapper.fromStoreRow(data);
  },

  async updateStore(storeId: string, updates: Partial<StoreConfig>): Promise<void> {
    const dbUpdates: Record<string, any> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.type !== undefined) dbUpdates.type = updates.type;
    if (updates.logoUrl !== undefined) dbUpdates.logo_url = updates.logoUrl;
    if (updates.qrImageUrl !== undefined) dbUpdates.qr_image_url = updates.qrImageUrl;

    const { error } = await supabase
      .from('stores')
      .update(dbUpdates)
      .eq('id', storeId);

    if (error) throw error;
  },

  async createStore(name: string, type: string, currency = 'PEN'): Promise<any> {
    const { data, error } = await supabase.rpc('create_store', {
      name: name.trim(),
      type: type.trim(),
      currency: currency.trim(),
    });
    if (error) throw error;
    return data;
  },

  async switchStore(storeId: string): Promise<any> {
    const { data, error } = await supabase.rpc('switch_store', {
      p_store_id: storeId,
    });
    if (error) throw error;
    return data;
  },

  async getUserStores(userId: string): Promise<UserStoreMembership[]> {
    const { data, error } = await supabase
      .from('store_members')
      .select('store_id, role, joined_at, stores(id, name, type, logo_url)')
      .eq('user_id', userId);

    if (error) throw error;
    return (data || []).map(storeMapper.fromMembershipRow);
  },
};
