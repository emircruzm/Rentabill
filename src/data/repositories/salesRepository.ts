import { supabase } from '@data/supabase/client';
import { SaleRecord } from '@shared/types/index';
import { saleMapper } from '@data/mappers/saleMapper';

export interface ProcessSaleParams {
  p_store_id: string;
  p_items: Array<{ product_id: string; quantity: number }>;
  p_payment_method: string;
  p_cash_given?: number | null;
  p_register_id?: string | null;
}

export interface ProcessSaleResult {
  sale_id: string;
  ticket_number: string;
  total_amount: number;
  total_profit: number;
  change_given: number;
  items_processed: number;
}

export const salesRepository = {
  async getByStoreId(storeId: string, limit = 100): Promise<SaleRecord[]> {
    const { data, error } = await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).map(saleMapper.fromRow);
  },

  async processSale(params: ProcessSaleParams): Promise<ProcessSaleResult> {
    const { data, error } = await supabase.rpc('process_sale', params);
    if (error) throw error;
    return data as ProcessSaleResult;
  },
};
