import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

export interface SaveCsvResult {
  success: boolean;
  isNative: boolean;
  filePath?: string;
  error?: string;
}

export const capacitorFilesystem = {
  async saveCsvFile(fileName: string, content: string, subfolder = 'Rentabill'): Promise<SaveCsvResult> {
    const fullCsv = '\uFEFF' + content;

    // Camino 1: Si corre nativamente en dispositivo Android (APK)
    if (Capacitor.isNativePlatform()) {
      try {
        const relativePath = subfolder ? `${subfolder}/${fileName}` : fileName;
        await Filesystem.writeFile({
          path: relativePath,
          data: fullCsv,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true,
        });

        return {
          success: true,
          isNative: true,
          filePath: `Documentos/${relativePath}`,
        };
      } catch (nativeErr: any) {
        console.error('Error guardando reporte con Filesystem en Android:', nativeErr);
        // Fallback to browser method if native write fails
      }
    }

    // Camino 2: Navegador Web / PWA
    try {
      const blob = new Blob([fullCsv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return {
        success: true,
        isNative: false,
      };
    } catch (webErr: any) {
      console.error('Error descargando archivo en web:', webErr);
      return {
        success: false,
        isNative: false,
        error: webErr.message || 'Error al descargar archivo',
      };
    }
  },
};
