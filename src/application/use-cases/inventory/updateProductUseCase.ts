import { productsRepository } from '@data/repositories/productsRepository';
import { Product } from '@shared/types/index';

export async function updateProductUseCase(
  storeId: string,
  productId: string,
  updates: Partial<Omit<Product, 'id' | 'storeId' | 'unitsSold' | 'salesCount' | 'status' | 'createdDaysAgo'>>
): Promise<void> {
  if (!storeId || !productId) {
    throw new Error('ID de tienda y producto requeridos');
  }

  const dbUpdates: Record<string, any> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name.trim();
  if (updates.unit !== undefined) dbUpdates.unit = updates.unit;
  if (updates.costPrice !== undefined) dbUpdates.cost_price = updates.costPrice;
  if (updates.salePrice !== undefined) dbUpdates.sale_price = updates.salePrice;
  if (updates.stock !== undefined) dbUpdates.stock = Number(updates.stock);
  if (updates.reorderPoint !== undefined) dbUpdates.reorder_point = updates.reorderPoint;
  if (updates.estimatedSpeed !== undefined) dbUpdates.estimated_speed = updates.estimatedSpeed;
  if (updates.barcode !== undefined) dbUpdates.barcode = updates.barcode?.trim() || null;
  if (updates.sku !== undefined) dbUpdates.sku = updates.sku?.trim() || null;
  if (updates.imageUrl !== undefined) dbUpdates.image_url = updates.imageUrl;

  if (updates.category) {
    dbUpdates.category_id = await productsRepository.ensureCategory(storeId, updates.category);
  }

  await productsRepository.update(storeId, productId, dbUpdates);
}
