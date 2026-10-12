import { Product, CalculatedProductMetrics, GlobalFinancialMetrics, SpeedCategory } from '../types';

export const ESTIMATED_SPEED_VALUES: Record<SpeedCategory, number> = {
  RAPIDO: 3.0,
  NORMAL: 1.0,
  LENTO: 0.2,
};

export function shouldTransitionToReal(salesCount: number, createdDaysAgo: number): boolean {
  return salesCount >= 5 || createdDaysAgo >= 30;
}

export function calculateProductMetrics(product: Product): CalculatedProductMetrics {
  const unitMarginDollar = product.salePrice - product.costPrice;
  const unitMarginPercent = product.costPrice > 0 
    ? ((product.salePrice - product.costPrice) / product.costPrice) * 100 
    : 0;

  // Capital invertido = cost_price × stock actual
  const currentStock = Math.max(product.stock, 0);
  const investedCapital = product.costPrice * currentStock;

  // Status check: if product accumulated >= 5 real sales OR >= 30 days have passed, it transitions to REAL
  const effectiveStatus = shouldTransitionToReal(product.salesCount, product.createdDaysAgo) 
    ? 'REAL' 
    : (product.status || 'ESTIMADO');

  const hasManualClassification = Boolean(product.estimatedSpeed);
  let dailyVelocity: number;
  let velocityLabel: string;
  let isSlow = false;

  if (effectiveStatus === 'REAL') {
    // ETAPA REAL (sales_count >= 5 o 30+ días): units_sold / días transcurridos desde created_at
    const days = Math.max(product.createdDaysAgo, 1);
    dailyVelocity = Number((product.unitsSold / days).toFixed(2));
    velocityLabel = `${dailyVelocity} u/día (real)`;
    isSlow = dailyVelocity < 0.5;
  } else if (hasManualClassification && product.estimatedSpeed) {
    // ETAPA ESTIMADA: estimated_speed convertido a % semanal del stock (RAPIDO=30%, NORMAL=15%, LENTO=5%) ÷ 7, usando stock como base
    const weeklyRate = product.estimatedSpeed === 'RAPIDO' ? 0.30 : product.estimatedSpeed === 'NORMAL' ? 0.15 : 0.05;
    const speedBase = Math.max(currentStock, 1);
    dailyVelocity = Number(((speedBase * weeklyRate) / 7).toFixed(2));
    const speedName = product.estimatedSpeed === 'RAPIDO' ? 'Rápido (30%/sem)' : product.estimatedSpeed === 'NORMAL' ? 'Normal (15%/sem)' : 'Lento (5%/sem)';
    velocityLabel = `${speedName} (est.)`;
    isSlow = product.estimatedSpeed === 'LENTO';
  } else {
    // Zero sales and no manual classification declared:
    if (product.salesCount === 0) {
      dailyVelocity = Number(((Math.max(currentStock, 1) * 0.15) / 7).toFixed(2)) || 1.0;
      velocityLabel = 'estimado, sin datos aún';
      isSlow = false;
    } else {
      const days = Math.max(product.createdDaysAgo, 1);
      dailyVelocity = Number((product.unitsSold / days).toFixed(2)) || 1.0;
      velocityLabel = `${dailyVelocity} u/día (en proceso)`;
      isSlow = dailyVelocity < 0.5 && product.createdDaysAgo >= 15;
    }
  }

  const dailyProfitDollar = unitMarginDollar * dailyVelocity;

  // Rentabilidad Diaria % = ((Margen_unitario * V_diaria) / Capital_invertido) * 100
  // Si investedCapital = 0, dailyProfitPercent = 0 (evitar NaN / Infinity)
  let dailyProfitPercent = 0;
  if (investedCapital > 0) {
    dailyProfitPercent = (dailyProfitDollar / investedCapital) * 100;
  }

  const progressToReal = effectiveStatus === 'REAL' 
    ? 100 
    : Math.min(100, Math.round((product.salesCount / 5) * 100));
  const salesUntilReal = effectiveStatus === 'REAL' 
    ? 0 
    : Math.max(0, 5 - product.salesCount);

  return {
    ...product,
    status: effectiveStatus,
    unitMarginDollar: Number(unitMarginDollar.toFixed(2)),
    unitMarginAmount: Number(unitMarginDollar.toFixed(2)),
    unitMarginPercent: Number(unitMarginPercent.toFixed(1)),
    investedCapital: Number(investedCapital.toFixed(2)),
    dailyVelocity: Number(dailyVelocity.toFixed(2)),
    dailyProfitDollar: Number(dailyProfitDollar.toFixed(2)),
    dailyProfitAmount: Number(dailyProfitDollar.toFixed(2)),
    dailyProfitPercent: Number(dailyProfitPercent.toFixed(2)),
    isSlow,
    progressToReal,
    salesUntilReal,
    velocityLabel,
    hasManualClassification,
  };
}

export function calculateGlobalMetrics(products: Product[]): GlobalFinancialMetrics {
  const calculated = products.map(calculateProductMetrics);

  const totalProductsCount = calculated.length;
  let totalInvestedCapital = 0;
  let totalEstimatedCapital = 0;
  let totalRealCapital = 0;
  let realProductsCount = 0;
  let estimatedProductsCount = 0;
  let totalDailyProfitDollar = 0;
  let slowCapitalAmount = 0;
  let productsWithGoodMargin = 0;

  for (const item of calculated) {
    totalInvestedCapital += item.investedCapital;
    totalDailyProfitDollar += item.dailyProfitDollar;

    if (item.status === 'REAL') {
      totalRealCapital += item.investedCapital;
      realProductsCount += 1;
    } else {
      totalEstimatedCapital += item.investedCapital;
      estimatedProductsCount += 1;
    }

    if (item.isSlow) {
      slowCapitalAmount += item.investedCapital;
    }

    if (item.dailyProfitPercent >= 1.0) {
      productsWithGoodMargin += 1;
    }
  }

  const realCapitalPercent = totalInvestedCapital > 0 
    ? (totalRealCapital / totalInvestedCapital) * 100 
    : 0;
  const estimatedCapitalPercent = totalInvestedCapital > 0 
    ? (totalEstimatedCapital / totalInvestedCapital) * 100 
    : 0;

  // Calibrated mode if >= 50% of capital uses REAL data
  const isCalibratedMode = realCapitalPercent >= 50;

  // Weighted average daily profit % = total daily profit / total invested capital * 100
  const averageDailyProfitPercent = totalInvestedCapital > 0
    ? (totalDailyProfitDollar / totalInvestedCapital) * 100
    : 0;

  // Component 1: Margin health (60% weight) -> % of products with Rentabilidad Diaria >= 1.0%
  const marginHealthPercent = totalProductsCount > 0 
    ? (productsWithGoodMargin / totalProductsCount) * 100 
    : 0;

  // Component 2: Capital diversification (40% weight) -> 100 - (% of total capital in Lento products)
  const capitalLockedInSlowPercent = totalInvestedCapital > 0
    ? (slowCapitalAmount / totalInvestedCapital) * 100
    : 0;
  const diversificationScore = Math.max(0, 100 - capitalLockedInSlowPercent);

  // Total Score: (Salud_márgenes * 0.6) + (Diversificación * 0.4)
  const rawTotalScore = (marginHealthPercent * 0.6) + (diversificationScore * 0.4);
  const totalScore = Math.min(100, Math.max(0, Math.round(rawTotalScore)));

  // Score semaphore status
  let scoreStatus: 'CRITICAL' | 'STABLE' | 'OPTIMAL' = 'CRITICAL';
  let scoreColor = '#EF4444'; // Red
  let scoreStatusLabel = 'Crítico';

  if (totalScore >= 80) {
    scoreStatus = 'OPTIMAL';
    scoreColor = '#10B981'; // Green
    scoreStatusLabel = 'Óptimo';
  } else if (totalScore >= 50) {
    scoreStatus = 'STABLE';
    scoreColor = '#F59E0B'; // Yellow
    scoreStatusLabel = 'Estable';
  }

  // Top 3 Star products (Highest daily profit %)
  const starProducts = [...calculated]
    .sort((a, b) => b.dailyProfitPercent - a.dailyProfitPercent)
    .slice(0, 3);

  // Trapped capital products (Lowest daily profit % and confirmed slow/lento)
  const trappedCapitalProducts = [...calculated]
    .filter(p => p.isSlow)
    .sort((a, b) => a.dailyProfitPercent - b.dailyProfitPercent)
    .slice(0, 3);

  return {
    totalInvestedCapital: Number(totalInvestedCapital.toFixed(2)),
    totalEstimatedCapital: Number(totalEstimatedCapital.toFixed(2)),
    totalRealCapital: Number(totalRealCapital.toFixed(2)),
    realCapitalPercent: Number(realCapitalPercent.toFixed(1)),
    estimatedCapitalPercent: Number(estimatedCapitalPercent.toFixed(1)),
    isCalibratedMode,
    averageDailyProfitPercent: Number(averageDailyProfitPercent.toFixed(2)),
    marginHealthPercent: Number(marginHealthPercent.toFixed(1)),
    productsWithGoodMargin,
    slowProductsCount: calculated.filter(p => p.isSlow).length,
    slowCapitalAmount: Number(slowCapitalAmount.toFixed(2)),
    capitalLockedInSlowPercent: Number(capitalLockedInSlowPercent.toFixed(1)),
    diversificationScore: Number(diversificationScore.toFixed(1)),
    totalScore,
    scoreStatus,
    scoreColor,
    scoreStatusLabel,
    starProducts,
    trappedCapitalProducts,
    totalTrappedCapital: Number(slowCapitalAmount.toFixed(2)),
    totalProductsCount,
    realProductsCount,
    estimatedProductsCount,
  };
}
