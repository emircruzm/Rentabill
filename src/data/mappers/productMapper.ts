import { Product } from '@shared/types/index';

export const productMapper = {
  fromRow(row: any): Product {
    const catName = row.category_name || (row.category || 'General');
    return {
      id: row.id,
      storeId: row.store_id,
      categoryId: row.category_id || '',
      categoryName: catName,
      category: catName,
      barcode: row.barcode,
      name: row.name,
      unit: row.unit || 'pza',
      costPrice: Number(row.cost_price),
      salePrice: Number(row.sale_price),
      stock: Number(row.stock),
      reorderPoint: Number(row.reorder_point || 12),
      estimatedSpeed: row.estimated_speed,
      unitsSold: Number(row.units_sold || 0),
      salesCount: Number(row.sales_count || 0),
      createdDaysAgo: Number(row.created_days_ago || 0),
      status: row.status,
      imageUrl: row.image_url,
      sku: row.sku,
      createdAt: row.created_at,
    };
  },

  toInsertRow(storeId: string, categoryId: string, product: Partial<Product>, initialStock: number) {
    return {
      store_id: storeId,
      category_id: categoryId,
      barcode: product.barcode?.trim() || null,
      sku: product.sku?.trim() || null,
      name: product.name?.trim() || '',
      unit: product.unit || 'pza',
      cost_price: product.costPrice,
      sale_price: product.salePrice,
      stock: initialStock,
      reorder_point: product.reorderPoint || 0,
      estimated_speed: product.estimatedSpeed || null,
      units_sold: 0,
      sales_count: 0,
      image_url: product.imageUrl || null,
    };
  },
};
