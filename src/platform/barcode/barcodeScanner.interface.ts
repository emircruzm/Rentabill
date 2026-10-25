export interface ScanBarcodeOptions {
  onStatusChange?: (status: string) => void;
}

export interface BarcodeScannerService {
  ensureModule(onStatusChange?: (status: string) => void): Promise<boolean>;
  scanBarcode(options?: ScanBarcodeOptions): Promise<string | null>;
}
