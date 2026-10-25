import { salesRepository, ProcessSaleParams, ProcessSaleResult } from '@data/repositories/salesRepository';

export async function processSaleUseCase(params: ProcessSaleParams): Promise<ProcessSaleResult> {
  if (!params.p_store_id) {
    throw new Error('ID de tienda requerido para procesar venta');
  }
  if (!params.p_items || params.p_items.length === 0) {
    throw new Error('La venta debe tener al menos un producto');
  }
  return await salesRepository.processSale(params);
}
