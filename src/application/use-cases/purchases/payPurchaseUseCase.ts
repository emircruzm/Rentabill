import { purchasesRepository } from '@data/repositories/purchasesRepository';

export async function payPurchaseUseCase(storeId: string, purchaseId: string): Promise<any> {
  if (!storeId || !purchaseId) {
    throw new Error('ID de tienda y compra requeridos');
  }
  return await purchasesRepository.payPurchase(storeId, purchaseId);
}
