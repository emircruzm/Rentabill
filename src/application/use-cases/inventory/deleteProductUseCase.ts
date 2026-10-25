import { productsRepository } from '@data/repositories/productsRepository';

export async function deleteProductUseCase(storeId: string, productId: string): Promise<void> {
  if (!storeId || !productId) {
    throw new Error('ID de tienda y producto requeridos');
  }
  // Soft delete / archive
  await productsRepository.archive(storeId, productId);
}
