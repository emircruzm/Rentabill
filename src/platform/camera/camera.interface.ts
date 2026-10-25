export interface CapturedPhoto {
  blob: Blob;
  base64String: string;
  format: string;
  fileName: string;
}

export interface CapturePhotoOptions {
  quality?: number;
  prefix?: string;
}

export interface CameraService {
  capturePhoto(options?: CapturePhotoOptions): Promise<CapturedPhoto | null>;
}
