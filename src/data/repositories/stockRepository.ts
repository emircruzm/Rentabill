import { supabase } from '@data/supabase/client';
import { InventoryMovement } from '@shared/types/index';

export interface AdjustStockParams {
  p_product_id: string;
  p_new_stock: number;
  p_reason?: string;
  p_note?: string;
}

export const stockRepository = {
  async getMovements(storeId: string, limit = 100): Promise<InventoryMovement[]> {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).map((m: any) => ({
      id: m.id,
      timestamp: m.created_at,
      type: m.type,
      productId: m.product_id,
      productName: m.product_name,
      quantity: Number(m.quantity),
      previousStock: Number(m.previous_stock),
      newStock: Number(m.new_stock),
      userName: m.user_name,
      note: m.note,
      supplierName: m.supplier_name,
    }));
  },

  async adjustStock(params: AdjustStockParams): Promise<any> {
    const { data, error } = await supabase.rpc('adjust_stock', params);
    if (error) throw error;
    return data;
  },

  async insertMovement(storeId: string, movement: Record<string, any>): Promise<void> {
    const { error } = await supabase.from('inventory_movements').insert({
      store_id: storeId,
      ...movement,
    });
    if (error) throw error;
  },
};
