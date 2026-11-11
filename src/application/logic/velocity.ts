import type { SpeedCategory } from '../../shared/types/index.ts';

/**
 * Flag de control para la activación de la ventana móvil de 28 días.
 * Activado en true tras aprobar satisfactoriamente el backtest de no-empeoramiento (paso 4).
 */
export const USE_WINDOW_28D = true;

/**
 * Tasas semanales de rotación según clasificación manual estimada.
 * Reemplaza al anterior ESTIMATED_SPEED_VALUES que no se utilizaba.
 */
export const SPEED_WEEKLY_RATES: Record<SpeedCategory, number> = {
  RAPIDO: 0.30,
  NORMAL: 0.15,
  LENTO: 0.05,
};

/**
 * Velocidad diaria estimada para productos en etapa ESTIMADO.
 * Fórmula: Math.max(stock, 1) * {RAPIDO: 0.30, NORMAL: 0.15, LENTO: 0.05} / 7
 * Conserva el resultado numérico exacto redondeado a 2 decimales.
 */
export function estimatedVelocity(
  stock: number,
  estimatedSpeed?: SpeedCategory | string | null
): number {
  const rate = (estimatedSpeed ? SPEED_WEEKLY_RATES[estimatedSpeed as SpeedCategory] : undefined) ?? 0.15;
  const base = Math.max(stock, 1);
  return Number(((base * rate) / 7).toFixed(2));
}

/**
 * Velocidad estimada para el simulador de compra.
 * Utiliza como base Math.max(stock, quantity, 1) para escalar adecuadamente
 * productos estimados con stock bajo o 0.
 * Cuando stock >= quantity, coincide exactamente con estimatedVelocity.
 */
export function estimatedVelocityForPurchase(
  stock: number,
  quantity: number,
  estimatedSpeed?: SpeedCategory | string | null
): number {
  const rate = (estimatedSpeed ? SPEED_WEEKLY_RATES[estimatedSpeed as SpeedCategory] : undefined) ?? 0.15;
  const base = Math.max(stock, quantity, 1);
  return Number(((base * rate) / 7).toFixed(2));
}

/**
 * Velocidad diaria real acumulada (fórmula actual / histórica de referencia).
 * Fórmula: unitsSoldTotal / Math.max(createdDaysAgo, 1)
 */
export function realVelocityCurrent({
  unitsSoldTotal,
  createdDaysAgo,
}: {
  unitsSoldTotal: number;
  createdDaysAgo: number;
}): number {
  const days = Math.max(createdDaysAgo, 1);
  return Number((unitsSoldTotal / days).toFixed(2));
}

/**
 * Velocidad diaria real calculada sobre ventana móvil de 28 días.
 * Fórmula: unitsSoldLast28d / Math.min(28, Math.max(createdDaysAgo, 1))
 * Si createdDaysAgo <= 28, el denominador coincide con Math.max(createdDaysAgo, 1),
 * produciendo exactamente el mismo resultado que realVelocityCurrent cuando
 * unitsSoldLast28d == unitsSoldTotal.
 */
export function realVelocity28({
  unitsSoldLast28d,
  createdDaysAgo,
}: {
  unitsSoldLast28d: number;
  createdDaysAgo: number;
}): number {
  const denominator = Math.min(28, Math.max(createdDaysAgo, 1));
  return Number((unitsSoldLast28d / denominator).toFixed(2));
}

/**
 * Resuelve la velocidad para un producto en etapa REAL.
 * Si el cálculo da 0 (sin ventas en el periodo analizado), NO cae al estimado:
 * devuelve 0.1 (constante estándar para cálculo de rotación / daysToDeplete)
 * y marca isSlow = true.
 */
export function resolveRealVelocity({
  unitsSoldTotal,
  unitsSoldLast28d,
  createdDaysAgo,
}: {
  unitsSoldTotal: number;
  unitsSoldLast28d?: number | null;
  createdDaysAgo: number;
}): { dailyVelocity: number; isSlow: boolean } {
  const hasWindowData = unitsSoldLast28d !== undefined && unitsSoldLast28d !== null;

  // Si units_sold_28d viene undefined o null (columna ausente en BD),
  // NO lo tratamos como 0: usamos realVelocityCurrent como respaldo.
  const calculated = (USE_WINDOW_28D && hasWindowData)
    ? realVelocity28({
        unitsSoldLast28d,
        createdDaysAgo,
      })
    : realVelocityCurrent({
        unitsSoldTotal,
        createdDaysAgo,
      });

  if (calculated <= 0) {
    return {
      dailyVelocity: 0.1,
      isSlow: true,
    };
  }

  return {
    dailyVelocity: calculated,
    isSlow: calculated < 0.5,
  };
}
