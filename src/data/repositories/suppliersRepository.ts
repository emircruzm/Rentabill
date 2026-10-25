import { supabase } from '@data/supabase/client';
import { Supplier } from '@shared/types/index';

export const suppliersRepository = {
  async getByStoreId(storeId: string): Promise<Supplier[]> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('store_id', storeId)
      .order('name', { ascending: true });

    if (error) throw error;
    return (data || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      paymentCondition: s.payment_condition,
      creditDays: Number(s.credit_days || 0),
      contactPhone: s.contact_phone,
      category: s.category,
    }));
  },

  async create(storeId: string, supplier: Omit<Supplier, 'id'>): Promise<string> {
    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        store_id: storeId,
        name: supplier.name.trim(),
        payment_condition: supplier.paymentCondition,
        credit_days: supplier.paymentCondition === 'credito' ? supplier.creditDays : 0,
        contact_phone: supplier.contactPhone || null,
        category: supplier.category || 'General',
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  },
};
