import { stockRepository, AdjustStockParams } from '@data/repositories/stockRepository';

export async function adjustStockUseCase(params: AdjustStockParams): Promise<any> {
  if (!params.p_product_id) {
    throw new Error('ID de producto requerido');
  }
  if (params.p_new_stock < 0) {
    throw new Error('El stock no puede ser negativo');
  }
  return await stockRepository.adjustStock(params);
}
