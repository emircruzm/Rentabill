import { supabase } from '@data/supabase/client';
import { PurchaseRecord } from '@shared/types/index';
import { purchaseMapper } from '@data/mappers/purchaseMapper';

export interface ProcessPurchaseParams {
  p_store_id: string;
  p_items: Array<{ product_id: string; quantity: number; unit_cost: number }>;
  p_payment_condition: 'contado' | 'credito';
  p_credit_days?: number;
  p_supplier_id?: string | null;
  p_notes?: string | null;
  p_note?: string | null;
  p_simulation_ids?: string[] | null;
}

export const purchasesRepository = {
  async getByStoreId(storeId: string): Promise<PurchaseRecord[]> {
    const { data, error } = await supabase
      .from('purchases')
      .select('*, purchase_items(*), suppliers(name)')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(purchaseMapper.fromRow);
  },

  async processPurchase(params: ProcessPurchaseParams): Promise<any> {
    const payload = {
      p_store_id: params.p_store_id,
      p_supplier_id: params.p_supplier_id || null,
      p_items: (params.p_items || []).map(i => ({
        product_id: i.product_id,
        quantity: Number(i.quantity),
        unit_cost: Number(i.unit_cost),
      })),
      p_note: params.p_note || params.p_notes || null,
      p_payment_condition: params.p_payment_condition || null,
      p_credit_days: params.p_credit_days != null ? Number(params.p_credit_days) : null,
      p_simulation_ids: params.p_simulation_ids || null,
    };
    const { data, error } = await supabase.rpc('process_purchase', payload);
    if (error) throw error;
    return data;
  },

  async payPurchase(storeId: string, purchaseId: string): Promise<any> {
    const { data, error } = await supabase.rpc('pay_purchase', {
      p_store_id: storeId,
      p_purchase_id: purchaseId,
    });
    if (error) throw error;
    return data;
  },
};
