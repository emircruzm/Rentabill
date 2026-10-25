import { storageRepository } from '@data/repositories/storageRepository';
import { runWrite } from '@application/logic/writeGuard';

export async function uploadImageUseCase(
  bucket: 'product-images' | 'store-logos',
  fileName: string,
  file: Blob,
  notifyToast?: (message: string, subtext?: string) => void
): Promise<string | null> {
  return await runWrite({
    actionDescription: 'Carga de imagen simulada localmente',
    notifyTestMode: notifyToast,
    onSimulate: () => {
      // Retornar URL local en memoria para previsualización sin subir a Storage
      return URL.createObjectURL(file);
    },
    onRealWrite: async () => {
      return await storageRepository.uploadFile(bucket, fileName, file);
    },
  });
}

