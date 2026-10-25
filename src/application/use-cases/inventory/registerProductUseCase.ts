import { productsRepository } from '@data/repositories/productsRepository';
import { Product } from '@shared/types/index';

export interface RegisterProductInput extends Omit<Product, 'id' | 'unitsSold' | 'salesCount' | 'status' | 'createdDaysAgo' | 'storeId' | 'categoryId'> {
  storeId?: string;
  categoryId?: string;
}

export async function registerProductUseCase(storeId: string, productData: RegisterProductInput): Promise<string> {
  if (!storeId) {
    throw new Error('ID de tienda requerido');
  }
  if (!productData.name || productData.name.trim() === '') {
    throw new Error('El nombre del producto es obligatorio');
  }
  if (productData.salePrice < 0 || productData.costPrice < 0) {
    throw new Error('Los precios no pueden ser negativos');
  }

  let categoryId = productData.categoryId;
  if (!categoryId) {
    categoryId = await productsRepository.ensureCategory(storeId, productData.category || 'General');
  }

  const initialStock = Number(productData.stock) || 0;
  return await productsRepository.create(storeId, categoryId, productData, initialStock);
}
