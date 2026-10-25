/**
 * Abstracción de almacenamiento clave-valor asíncrono para desacoplar
 * el almacenamiento de sesión de Supabase Auth de implementaciones nativas (Capacitor Preferences).
 */
export interface KeyValueStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}
