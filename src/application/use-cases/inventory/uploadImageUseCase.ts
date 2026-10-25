import { storageRepository } from '@data/repositories/storageRepository';

export async function uploadImageUseCase(
  bucket: 'product-images' | 'store-logos',
  fileName: string,
  file: Blob
): Promise<string | null> {
  return await storageRepository.uploadFile(bucket, fileName, file);
}
