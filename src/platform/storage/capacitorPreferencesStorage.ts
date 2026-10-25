import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { KeyValueStorage } from '@shared/storage/storage.interface';

/**
 * Adaptador de almacenamiento que utiliza @capacitor/preferences en plataformas nativas
 * y localStorage como fallback en navegadores web.
 */
export const capacitorPreferencesStorage: KeyValueStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Capacitor.isNativePlatform()) {
        const { value } = await Preferences.get({ key });
        return value;
      }
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Preferences.set({ key, value });
      } else {
        localStorage.setItem(key, value);
      }
    } catch {
      // Ignorar errores de cuota o permisos en almacenamiento
    }
  },

  removeItem: async (key: string): Promise<void> => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Preferences.remove({ key });
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // Ignorar errores
    }
  },
};
