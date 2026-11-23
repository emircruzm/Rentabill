import { supabase } from '@data/supabase/client';
import { UserProfile, UserRole } from '@shared/types/index';

export const authRepository = {
  async signInWithPassword(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  },

  async signUp(email: string, password: string, fullName: string, role: UserRole, phone?: string) {
    return supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          phone: phone || null,
        },
      },
    });
  },

  async signOut() {
    return supabase.auth.signOut();
  },

  async signOutOthers() {
    return supabase.auth.signOut({ scope: 'others' });
  },

  async updatePassword(newPassword: string, currentPassword?: string) {
    const attributes: { password: string; current_password?: string } = {
      password: newPassword,
    };
    if (currentPassword) {
      attributes.current_password = currentPassword;
    }
    return supabase.auth.updateUser(attributes);
  },

  async setSessionFromTokens(accessToken: string, refreshToken: string) {
    return supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  },

  async getSession() {
    return supabase.auth.getSession();
  },

  async getLocalUserId(): Promise<string | undefined> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.user?.id;
    } catch {
      return undefined;
    }
  },

  async getUser() {
    return supabase.auth.getUser();
  },

  onAuthStateChange(callback: (event: any, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback);
  },

  async resendEmailConfirmation(email: string) {
    return supabase.auth.resend({
      type: 'signup',
      email,
    });
  },

  async resetPasswordForEmail(email: string) {
    return supabase.auth.resetPasswordForEmail(email);
  },

  async getProfile(userId: string) {
    return supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
  },

  async updateProfile(userId: string, updates: Partial<UserProfile>) {
    const dbUpdates: Record<string, any> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.avatar !== undefined) dbUpdates.avatar = updates.avatar;

    return supabase.from('profiles').update(dbUpdates).eq('id', userId);
  },
};
