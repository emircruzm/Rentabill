import { App } from '@capacitor/app';
import { PluginListenerHandle } from '@capacitor/core';
import { AppLifecycleService } from './appLifecycle.interface';

export const capacitorAppLifecycle: AppLifecycleService = {
  async onBackButton(handler: () => void): Promise<() => void> {
    try {
      const listener: PluginListenerHandle = await App.addListener('backButton', () => {
        handler();
      });

      return () => {
        listener.remove().catch(() => {});
      };
    } catch {
      // Entorno web / sin soporte nativo de Capacitor App
      return () => {};
    }
  },
};
