import { supabase } from '@data/supabase/client';
import { AppSettings } from '@shared/types/index';

export const settingsRepository = {
  async getSettings(storeId: string, userId?: string): Promise<{ storeSettings: any; userPreferences: any }> {
    const { data: storeSettings } = await supabase
      .from('store_settings')
      .select('*')
      .eq('store_id', storeId)
      .maybeSingle();

    let userPreferences: any = null;
    if (userId) {
      const { data: prefData } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      userPreferences = prefData;
    }

    return { storeSettings, userPreferences };
  },

  async updateStoreSettings(storeId: string, updates: Partial<AppSettings>): Promise<void> {
    const dbUpdates: Record<string, any> = {};
    if (updates.dailyProfitGoal !== undefined) dbUpdates.daily_goal_percent = updates.dailyProfitGoal;
    if (updates.warnSlowDays !== undefined) dbUpdates.warn_slow_days = updates.warnSlowDays;
    if (updates.warnLowStock !== undefined) dbUpdates.warn_low_stock = updates.warnLowStock;
    if (updates.autoBackup !== undefined) dbUpdates.auto_backup = updates.autoBackup;

    if (Object.keys(dbUpdates).length > 0) {
      const { error } = await supabase.from('store_settings').upsert({
        store_id: storeId,
        ...dbUpdates,
      });
      if (error) throw error;
    }
  },

  async updateUserPreferences(userId: string, updates: Partial<AppSettings>): Promise<void> {
    const prefUpdates: Record<string, any> = { user_id: userId };
    if (updates.darkMode !== undefined) prefUpdates.dark_mode = updates.darkMode;
    if (updates.language !== undefined) prefUpdates.language = updates.language;

    if (Object.keys(prefUpdates).length > 1) {
      const { error } = await supabase.from('user_preferences').upsert(prefUpdates);
      if (error) throw error;
    }
  },
};
