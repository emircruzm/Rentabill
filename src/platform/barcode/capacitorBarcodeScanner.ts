import { 
  BarcodeScanner, 
  BarcodeFormat, 
  GoogleBarcodeScannerModuleInstallState 
} from '@capacitor-mlkit/barcode-scanning';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { ScanBarcodeOptions } from './barcodeScanner.interface';

// In-memory cache so we only check/install once per session
let isModuleInstalledCached = false;
let isScanInProgress = false;

/**
 * Ensures Google Barcode Scanner Module is installed on Android.
 * If not, it requests installation and waits for completion.
 */
export async function ensureGoogleBarcodeScannerModule(
  onStatusChange?: (status: string) => void
): Promise<boolean> {
  // Only Android uses the Google Barcode Scanner Play Services module
  if (Capacitor.getPlatform() !== 'android') {
    return true;
  }

  if (isModuleInstalledCached) {
    return true;
  }

  try {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (available) {
      isModuleInstalledCached = true;
      return true;
    }

    onStatusChange?.('Preparando el escáner por primera vez... Descargando módulo de Google Play');

    return new Promise<boolean>(async (resolve, reject) => {
      let listener: PluginListenerHandle | null = null;
      let timeoutId: any = null;

      const cleanup = async () => {
        if (listener) {
          await listener.remove().catch(() => {});
          listener = null;
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      // Set a 60-second timeout in case of network stall
      timeoutId = setTimeout(async () => {
        await cleanup();
        reject(new Error('La descarga del módulo de escáner tardó demasiado. Verifica tu conexión a internet.'));
      }, 60000);

      try {
        listener = await BarcodeScanner.addListener(
          'googleBarcodeScannerModuleInstallProgress',
          async (event) => {
            if (event.state === GoogleBarcodeScannerModuleInstallState.DOWNLOADING) {
              const progress = event.progress !== undefined ? ` (${event.progress}%)` : '';
              onStatusChange?.(`Descargando módulo de escáner${progress}...`);
            } else if (event.state === GoogleBarcodeScannerModuleInstallState.INSTALLING) {
              onStatusChange?.('Instalando módulo de escáner...');
            } else if (event.state === GoogleBarcodeScannerModuleInstallState.COMPLETED) {
              await cleanup();
              isModuleInstalledCached = true;
              onStatusChange?.('¡Escáner listo!');
              resolve(true);
            } else if (
              event.state === GoogleBarcodeScannerModuleInstallState.FAILED ||
              event.state === GoogleBarcodeScannerModuleInstallState.CANCELED
            ) {
              await cleanup();
              reject(new Error('No se pudo descargar el módulo de Google Play Services. Revisa tu conexión a internet o actualiza Google Play.'));
            }
          }
        );

        await BarcodeScanner.installGoogleBarcodeScannerModule();
      } catch (err: any) {
        await cleanup();
        reject(err);
      }
    });
  } catch (err: any) {
    console.error('Error al verificar/instalar Google Barcode Scanner Module:', err);
    throw new Error(err.message || 'Error con el módulo de escáner de Google');
  }
}

/**
 * Executes a barcode scan safely with full permission checks,
 * module installation, and fallback for web/desktop.
 */
export async function executeBarcodeScan(options?: ScanBarcodeOptions): Promise<string | null> {
  if (isScanInProgress) {
    console.warn('Ya hay un escaneo en curso');
    return null;
  }

  isScanInProgress = true;

  try {
    const isSupported = await BarcodeScanner.isSupported().catch(() => ({ supported: false }));

    if (!isSupported.supported) {
      // Web / Desktop fallback
      const manualCode = window.prompt('Ingresa o escanea el código de barras:');
      return manualCode ? manualCode.trim() : null;
    }

    // 1. Ensure Google Play module is installed (Android)
    if (Capacitor.getPlatform() === 'android') {
      await ensureGoogleBarcodeScannerModule(options?.onStatusChange);
    }

    // 2. Check & Request Permissions
    const permCheck = await BarcodeScanner.checkPermissions().catch(() => ({ camera: 'prompt' as const }));
    if (permCheck.camera !== 'granted' && permCheck.camera !== 'limited') {
      const permReq = await BarcodeScanner.requestPermissions().catch(() => ({ camera: 'denied' as const }));
      if (permReq.camera !== 'granted' && permReq.camera !== 'limited') {
        throw new Error('Se requiere permiso de cámara para utilizar el escáner.');
      }
    }

    // 3. Perform Scan
    const result = await BarcodeScanner.scan({
      formats: [
        BarcodeFormat.Ean13,
        BarcodeFormat.Ean8,
        BarcodeFormat.UpcA,
        BarcodeFormat.UpcE,
        BarcodeFormat.Code128,
        BarcodeFormat.Code39,
        BarcodeFormat.QrCode,
      ],
    });

    if (result.barcodes && result.barcodes.length > 0) {
      return result.barcodes[0].rawValue || result.barcodes[0].displayValue || null;
    }

    return null;
  } catch (err: any) {
    // If the user cancelled the scan (e.g. back button on Android), don't throw an error
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('canceled') || msg.includes('cancelled') || msg.includes('closed')) {
      return null;
    }
    throw err;
  } finally {
    isScanInProgress = false;
  }
}
