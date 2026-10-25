import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { KeyValueStorage } from '@shared/storage/storage.interface';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan variables VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el archivo .env');
}

let activeStorage: KeyValueStorage = {
  getItem: async (key: string) => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {}
  },
  removeItem: async (key: string) => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {}
  },
};

const storageAdapter = {
  getItem: (key: string) => activeStorage.getItem(key),
  setItem: (key: string, value: string) => activeStorage.setItem(key, value),
  removeItem: (key: string) => activeStorage.removeItem(key),
};

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Permite a la raíz de composición configurar la implementación de almacenamiento de sesión
 * (por ejemplo, el adaptador CapacitorPreferencesStorage de la capa platform).
 */
export function setSupabaseStorage(storage: KeyValueStorage): void {
  activeStorage = storage;
}

export function getSupabase(): SupabaseClient {
  return supabase;
}
