import { purchasesRepository, ProcessPurchaseParams } from '@data/repositories/purchasesRepository';

export async function processPurchaseUseCase(params: ProcessPurchaseParams): Promise<any> {
  if (!params.p_store_id) {
    throw new Error('ID de tienda requerido para registrar compra');
  }
  if (!params.p_items || params.p_items.length === 0) {
    throw new Error('La compra debe contener al menos un producto');
  }
  return await purchasesRepository.processPurchase(params);
}
