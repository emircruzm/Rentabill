import { storesRepository } from '@data/repositories/storesRepository';
import { StoreConfig } from '@shared/types/index';

export async function createStoreUseCase(
  store: { name: string; type: StoreConfig['type']; currency?: string; logoUrl?: string }
): Promise<string | null> {
  if (!store.name || store.name.trim() === '') {
    throw new Error('El nombre del negocio es obligatorio');
  }

  const result = await storesRepository.createStore(
    store.name.trim(),
    store.type,
    store.currency || 'PEN'
  );

  return result?.store_id || result?.id || (typeof result === 'string' ? result : null);
}
