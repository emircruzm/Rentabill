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
    const { data, error } = await supabase.rpc('process_purchase', params);
    if (error) throw error;
    return data;
  },

  async payPurchase(purchaseId: string): Promise<any> {
    const { data, error } = await supabase.rpc('pay_purchase', { p_purchase_id: purchaseId });
    if (error) throw error;
    return data;
  },
};
