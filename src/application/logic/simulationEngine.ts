/**
 * Motor de lógica pura para el cálculo de simulaciones de compra y reabastecimiento.
 * Sin React, sin Supabase, sin Capacitor.
 */

export interface SimulationInput {
  unitCost: number;
  salePrice: number;
  quantity: number;
  dailyVelocity: number;
}

export interface SimulationResult {
  totalCost: number;
  totalRevenue: number;
  totalProfit: number;
  marginPercent: number;
  daysToSell: number;
  dailyProfitGain: number;
  scoreGain: number;
  isValid: boolean;
}

export function calculateSimulationMetrics(input: SimulationInput): SimulationResult {
  const { unitCost, salePrice, quantity, dailyVelocity } = input;
  const isFormValid = quantity > 0 && unitCost > 0;

  if (!isFormValid) {
    return {
      totalCost: 0,
      totalRevenue: 0,
      totalProfit: 0,
      marginPercent: 0,
      daysToSell: 0,
      dailyProfitGain: 0,
      scoreGain: 0,
      isValid: false,
    };
  }

  const totalCost = Number((quantity * unitCost).toFixed(2));
  const totalRevenue = Number((quantity * salePrice).toFixed(2));
  const totalProfit = Number((totalRevenue - totalCost).toFixed(2));
  const marginPercent = totalCost > 0 ? Number(((totalProfit / totalCost) * 100).toFixed(1)) : 0;

  const effectiveVelocity = dailyVelocity > 0 ? dailyVelocity : 0.5;
  const rawDays = quantity / effectiveVelocity;
  const isValidDays = !isNaN(rawDays) && isFinite(rawDays) && rawDays > 0;
  const daysToSell = isValidDays ? Math.max(1, Math.round(rawDays)) : 0;
  const dailyProfitGain = isValidDays ? Number((totalProfit / Math.max(1, daysToSell)).toFixed(2)) : 0;
  const scoreGain = Math.min(15, Math.max(1, Math.round(dailyProfitGain * 1.5)));

  return {
    totalCost,
    totalRevenue,
    totalProfit,
    marginPercent,
    daysToSell,
    dailyProfitGain,
    scoreGain,
    isValid: true,
  };
}

export function computeSimulationVerdict(
  daysToSell: number,
  paymentCondition: 'contado' | 'credito',
  creditDays: number,
  isValid: boolean
): 'CONVIENE' | 'RIESGOSO' | 'NO_CONVIENE' {
  if (!isValid || daysToSell <= 0) return 'RIESGOSO';

  if (paymentCondition === 'credito') {
    if (daysToSell <= creditDays) return 'CONVIENE';
    if (daysToSell <= creditDays + 15) return 'RIESGOSO';
    return 'NO_CONVIENE';
  } else {
    if (daysToSell <= 15) return 'CONVIENE';
    if (daysToSell <= 30) return 'RIESGOSO';
    return 'NO_CONVIENE';
  }
}
