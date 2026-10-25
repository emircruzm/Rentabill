import { supabase } from '@data/supabase/client';
import { PastSimulation } from '@shared/types/index';
import { formatDatePeru } from '@shared/formatters/index';

export const simulationsRepository = {
  async getByStoreId(storeId: string, suppliersMap: Record<string, string>): Promise<PastSimulation[]> {
    const { data, error } = await supabase
      .from('simulations')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((sim: any) => {
      const qty = Number(sim.quantity || sim.simulated_quantity || 0);
      const cost = Number(sim.unit_cost || 0);
      const total = Number((qty * cost).toFixed(2));
      const supplierName = suppliersMap[sim.supplier_id] || sim.details?.supplier_name || 'Distribuidor';

      return {
        id: sim.id,
        date: formatDatePeru(sim.created_at),
        productId: sim.product_id,
        productName: sim.product_name,
        simulatedQuantity: qty,
        unitCost: cost,
        totalCost: total,
        supplierId: sim.supplier_id,
        supplierName,
        paymentCondition: sim.payment_condition,
        creditDays: Number(sim.credit_days || 0),
        projectedDailyProfitGain: Number(sim.projected_daily_profit || 0),
        projectedScoreGain: Number(sim.details?.score_gain || Math.round(Number(sim.projected_daily_profit || 0) * 1.2)),
        projectedDaysToSell: Number(sim.projected_days_to_sell || 1),
        verdict: sim.verdict,
        status: sim.status,
        purchaseDate: sim.applied_at ? formatDatePeru(sim.applied_at) : undefined,
        actualDailyProfitGain: sim.actual_daily_profit != null ? Number(sim.actual_daily_profit) : undefined,
        actualDaysToSell: sim.actual_days_to_sell != null ? Number(sim.actual_days_to_sell) : undefined,
        actualResultNote: sim.notes || undefined,
      };
    });
  },

  async create(storeId: string, sim: Omit<PastSimulation, 'id' | 'date'>): Promise<string> {
    const { data, error } = await supabase
      .from('simulations')
      .insert({
        store_id: storeId,
        product_id: sim.productId,
        product_name: sim.productName,
        quantity: sim.simulatedQuantity,
        unit_cost: sim.unitCost,
        supplier_id: sim.supplierId || null,
        payment_condition: sim.paymentCondition,
        credit_days: sim.creditDays || 0,
        projected_daily_profit: sim.projectedDailyProfitGain,
        projected_days_to_sell: sim.projectedDaysToSell,
        verdict: sim.verdict,
        status: 'PENDIENTE',
        details: {
          supplier_name: sim.supplierName,
          score_gain: sim.projectedScoreGain,
        },
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  },

  async markApplied(simulationId: string): Promise<void> {
    const { error } = await supabase
      .from('simulations')
      .update({
        status: 'REALIZADA',
        applied_at: new Date().toISOString(),
      })
      .eq('id', simulationId);

    if (error) throw error;
  },
};
