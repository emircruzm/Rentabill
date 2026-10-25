import { stockRepository, AdjustStockParams } from '@data/repositories/stockRepository';

export async function adjustStockUseCase(params: AdjustStockParams): Promise<any> {
  if (!params.p_store_id) {
    throw new Error('ID de tienda requerido');
  }
  if (!params.p_product_id) {
    throw new Error('ID de producto requerido');
  }
  if (params.p_quantity_delta === 0) {
    throw new Error('El ajuste de inventario no puede ser cero');
  }
  if (!params.p_note || !params.p_note.trim()) {
    throw new Error('El motivo o nota del ajuste es obligatorio');
  }
  return await stockRepository.adjustStock(params);
}
