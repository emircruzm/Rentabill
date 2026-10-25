import { supabase } from '@data/supabase/client';
import { Product } from '@shared/types/index';
import { productMapper } from '@data/mappers/productMapper';

export const productsRepository = {
  async getByStoreId(storeId: string): Promise<Product[]> {
    const { data, error } = await supabase
      .from('product_stats')
      .select('*')
      .eq('store_id', storeId)
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(productMapper.fromRow);
  },

  async ensureCategory(storeId: string, categoryName: string): Promise<string> {
    const trimmed = categoryName.trim() || 'General';
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('store_id', storeId)
      .ilike('name', trimmed)
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: created, error } = await supabase
      .from('categories')
      .insert({ store_id: storeId, name: trimmed })
      .select('id')
      .single();

    if (error) throw error;
    return created.id;
  },

  async create(storeId: string, categoryId: string, productData: Partial<Product>, initialStock: number): Promise<string> {
    const row = productMapper.toInsertRow(storeId, categoryId, productData, initialStock);
    const { data, error } = await supabase
      .from('products')
      .insert(row)
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  },

  async update(storeId: string, productId: string, updates: Record<string, any>): Promise<void> {
    const { error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', productId)
      .eq('store_id', storeId);

    if (error) throw error;
  },

  async archive(storeId: string, productId: string): Promise<void> {
    const { error } = await supabase
      .from('products')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', productId)
      .eq('store_id', storeId);

    if (error) throw error;
  },
};
