import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { CapturedPhoto, CapturePhotoOptions } from './camera.interface';

export const capacitorCamera = {
  async capturePhoto(options?: CapturePhotoOptions): Promise<CapturedPhoto | null> {
    try {
      const photo = await Camera.getPhoto({
        quality: options?.quality || 80,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
      });

      if (!photo.base64String) {
        return null;
      }

      const format = photo.format || 'jpeg';
      const prefix = options?.prefix || 'photo';
      const fileName = `${prefix}_${Date.now()}.${format}`;

      const byteCharacters = atob(photo.base64String);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: `image/${format}` });

      return {
        blob,
        base64String: photo.base64String,
        format,
        fileName,
      };
    } catch (err: any) {
      // User cancelled or camera unavailable
      if (err?.message?.includes('cancelled') || err?.message?.includes('canceled') || err?.message?.includes('User cancelled')) {
        return null;
      }
      console.error('Error al capturar foto con la cámara:', err);
      throw err;
    }
  },
};
