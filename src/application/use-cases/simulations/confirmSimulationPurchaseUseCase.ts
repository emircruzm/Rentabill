import { purchasesRepository } from '@data/repositories/purchasesRepository';
import { PastSimulation } from '@shared/types/index';

export async function confirmSimulationPurchaseUseCase(
  storeId: string,
  simulation: PastSimulation
): Promise<any> {
  if (!storeId) {
    throw new Error('ID de tienda requerido');
  }
  if (!simulation.productId) {
    throw new Error('La simulación no tiene un producto asociado');
  }

  const itemsPayload = [{
    product_id: simulation.productId,
    quantity: simulation.simulatedQuantity,
    unit_cost: simulation.unitCost,
  }];

  return await purchasesRepository.processPurchase({
    p_store_id: storeId,
    p_supplier_id: simulation.supplierId || null,
    p_items: itemsPayload,
    p_note: `Compra ejecutada desde Simulador (${simulation.paymentCondition})`,
    p_payment_condition: simulation.paymentCondition,
    p_credit_days: simulation.paymentCondition === 'credito' ? (simulation.creditDays || 0) : 0,
    p_simulation_ids: [simulation.id],
  });
}
