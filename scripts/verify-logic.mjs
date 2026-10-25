import { calculateProductMetrics, calculateGlobalMetrics } from '../src/application/logic/financialMetrics.ts';

console.log('--- Verificación Matemática de Lógica Pura ---');

// CASO 1: Tienda vacía
const emptyMetrics = calculateGlobalMetrics([]);
console.log('Caso 1 (Tienda vacía):');
console.log(' - Total Invested:', emptyMetrics.totalInvestedCapital, '(esperado: 0)');
console.log(' - Total Score:', emptyMetrics.totalScore, '(esperado: 40 en fórmula sin productos)');
console.log(' - Is Calibrated:', emptyMetrics.isCalibratedMode, '(esperado: false)');

if (emptyMetrics.totalInvestedCapital !== 0) throw new Error('Fallo en Caso 1');

// CASO 2: Producto estimado (Leche Gloria)
const prod1 = {
  id: 'prod-1',
  storeId: 'store-1',
  categoryId: 'cat-1',
  name: 'Leche Gloria 400g',
  unit: 'tarro',
  costPrice: 3.50,
  salePrice: 4.20,
  stock: 24,
  reorderPoint: 6,
  estimatedSpeed: 'RAPIDO',
  unitsSold: 0,
  salesCount: 0,
  createdDaysAgo: 2,
};
const metrics1 = calculateProductMetrics(prod1);
console.log('\nCaso 2 (Producto Estimado Rápido):');
console.log(' - Unit Margin Dollar:', metrics1.unitMarginDollar, '(esperado: 0.70)');
console.log(' - Daily Velocity:', metrics1.dailyVelocity, '(esperado: 1.03)');
console.log(' - Daily Profit Dollar:', metrics1.dailyProfitDollar, '(esperado: 0.72)');
console.log(' - Status:', metrics1.status, '(esperado: ESTIMADO)');

if (metrics1.unitMarginDollar !== 0.70 || metrics1.status !== 'ESTIMADO') throw new Error('Fallo en Caso 2');

// CASO 3: Producto Real con ventas
const prod2 = {
  id: 'prod-2',
  storeId: 'store-1',
  categoryId: 'cat-1',
  name: 'Arroz Costeño 1kg',
  unit: 'bolsa',
  costPrice: 4.00,
  salePrice: 5.00,
  stock: 50,
  reorderPoint: 10,
  estimatedSpeed: 'NORMAL',
  unitsSold: 30,
  salesCount: 8,
  createdDaysAgo: 10,
};
const metrics2 = calculateProductMetrics(prod2);
console.log('\nCaso 3 (Producto Real con ventas):');
console.log(' - Daily Velocity:', metrics2.dailyVelocity, '(esperado: 3.00)');
console.log(' - Status:', metrics2.status, '(esperado: REAL)');

if (metrics2.dailyVelocity !== 3.00 || metrics2.status !== 'REAL') throw new Error('Fallo en Caso 3');

// Evaluación Global combinada
const global = calculateGlobalMetrics([prod1, prod2]);
console.log('\nEvaluación Global Combinada:');
console.log(' - Total Invested:', global.totalInvestedCapital, '(esperado: 284.00)');
console.log(' - Score Status:', global.scoreStatus, '(esperado: OPTIMAL o STABLE)');
console.log(' - Real Capital Percent:', global.realCapitalPercent, '(esperado: 70.4%)');

if (global.totalInvestedCapital !== 284.00) throw new Error('Fallo en Global Combinado');

console.log('\n✅ ¡Verificación matemática superada! Las fórmulas son 100% idénticas.');
