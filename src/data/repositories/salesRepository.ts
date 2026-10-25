import { supabase } from '@data/supabase/client';
import { SaleRecord } from '@shared/types/index';
import { saleMapper } from '@data/mappers/saleMapper';

export interface ProcessSaleItem {
  productId?: string;
  product_id?: string;
  quantity: number;
}

export interface ProcessSaleParams {
  p_store_id: string;
  p_ticket_number?: string | null;
  p_payment_method: 'efectivo' | 'tarjeta' | 'yape' | 'plin' | 'transferencia' | 'qr' | string;
  p_cash_given?: number | null;
  p_items: ProcessSaleItem[];
  p_register_id?: string | null;
}

export interface ProcessSaleResult {
  sale_id: string;
  ticket_number: string;
  total_amount: number;
  total_profit: number;
  change_given: number;
  items_processed: number;
  calibrated_items?: Array<{
    id: string;
    newSales: number;
    newUnitsSold?: number;
    newSalesCount?: number;
    newVelocity: number;
  }>;
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
    const formattedItems = (params.p_items || []).map(item => {
      const pId = item.productId || item.product_id;
      if (!pId) {
        throw new Error('Cada partida debe tener productId');
      }
      const qty = Number(item.quantity);
      if (isNaN(qty) || qty <= 0) {
        throw new Error('Cada partida debe tener una cantidad mayor a 0');
      }
      return {
        productId: pId,
        quantity: qty,
      };
    });

    const cleanMethod = (params.p_payment_method || 'efectivo').toLowerCase().trim();
    const cleanCashGiven = cleanMethod === 'efectivo' && params.p_cash_given != null
      ? Number(params.p_cash_given)
      : null;

    const rpcPayload: Record<string, any> = {
      p_store_id: params.p_store_id,
      p_ticket_number: params.p_ticket_number || null,
      p_payment_method: cleanMethod,
      p_cash_given: cleanCashGiven,
      p_items: formattedItems,
      p_register_id: params.p_register_id || null,
    };

    const { data, error } = await supabase.rpc('process_sale', rpcPayload);
    if (error) throw error;
    return data as ProcessSaleResult;
  },
};
