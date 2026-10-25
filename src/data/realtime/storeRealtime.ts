import { supabase } from '@data/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface StoreRealtimeCallbacks {
  onProductsChange?: () => void;
  onSalesChange?: () => void;
  onMovementsChange?: () => void;
  onMembersChange?: () => void;
  onAnyChange?: () => void;
}

/**
 * Suscribe a los eventos en tiempo real de una tienda específica en Supabase.
 * Devuelve una función para cancelar la suscripción de forma segura.
 */
export function subscribeToStoreRealtime(
  storeId: string,
  callbacks: StoreRealtimeCallbacks
): () => void {
  if (!storeId) return () => {};

  const channel: RealtimeChannel = supabase
    .channel(`store-${storeId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products', filter: `store_id=eq.${storeId}` },
      () => {
        callbacks.onProductsChange?.();
        callbacks.onAnyChange?.();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sales', filter: `store_id=eq.${storeId}` },
      () => {
        callbacks.onSalesChange?.();
        callbacks.onAnyChange?.();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'inventory_movements', filter: `store_id=eq.${storeId}` },
      () => {
        callbacks.onMovementsChange?.();
        callbacks.onAnyChange?.();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'store_members', filter: `store_id=eq.${storeId}` },
      () => {
        callbacks.onMembersChange?.();
        callbacks.onAnyChange?.();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel).catch(() => {});
  };
}
