import { supabase } from '@data/supabase/client';
import { Product } from '@shared/types/index';
import { productMapper } from '@data/mappers/productMapper';

export const BULK_CHUNK_SIZE = 100;

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

  async getById(storeId: string, productId: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from('product_stats')
      .select('*')
      .eq('store_id', storeId)
      .eq('id', productId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return productMapper.fromRow(data);
  },

  async getByIds(storeId: string, ids: string[]): Promise<Product[]> {
    if (!ids || ids.length === 0) return [];
    const CHUNK_SIZE = 100;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      chunks.push(ids.slice(i, i + CHUNK_SIZE));
    }

    const chunkResults = await Promise.all(
      chunks.map(async (chunk) => {
        const { data, error } = await supabase
          .from('product_stats')
          .select('*')
          .eq('store_id', storeId)
          .in('id', chunk);

        if (error) throw error;
        return (data || []).map(productMapper.fromRow);
      })
    );

    return chunkResults.flat();
  },

  async createMany(
    storeId: string,
    rows: any[],
    onProgress?: (insertedCount: number, totalCount: number) => void
  ): Promise<{ insertedCount: number; insertedIds: string[]; error?: string }> {
    const insertedIds: string[] = [];
    const total = rows.length;

    for (let i = 0; i < total; i += BULK_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + BULK_CHUNK_SIZE);
      const { data, error } = await supabase
        .from('products')
        .insert(chunk)
        .select('id');

      if (error) {
        return {
          insertedCount: insertedIds.length,
          insertedIds,
          error: error.message || 'Error al insertar lote de productos',
        };
      }

      if (data) {
        for (const item of data) {
          if (item?.id) insertedIds.push(item.id);
        }
      }

      if (onProgress) {
        onProgress(insertedIds.length, total);
      }
    }

    return {
      insertedCount: insertedIds.length,
      insertedIds,
    };
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
