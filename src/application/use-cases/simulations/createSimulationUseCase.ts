import { simulationsRepository } from '@data/repositories/simulationsRepository';
import { PastSimulation } from '@shared/types/index';

export async function createSimulationUseCase(
  storeId: string,
  sim: Omit<PastSimulation, 'id' | 'date'>
): Promise<string> {
  if (!storeId) {
    throw new Error('ID de tienda requerido para registrar simulación');
  }
  return await simulationsRepository.create(storeId, sim);
}
