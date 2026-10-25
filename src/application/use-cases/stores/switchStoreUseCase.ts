import { storesRepository } from '@data/repositories/storesRepository';

export async function switchStoreUseCase(storeId: string): Promise<boolean> {
  if (!storeId) {
    throw new Error('ID de tienda requerido para cambiar de tienda');
  }
  await storesRepository.switchStore(storeId);
  return true;
}
