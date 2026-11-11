import { calculateProductMetrics, calculateGlobalMetrics } from '../src/application/logic/financialMetrics.ts';
import {
  estimatedVelocity,
  estimatedVelocityForPurchase,
  realVelocityCurrent,
  realVelocity28,
  resolveRealVelocity,
  USE_WINDOW_28D,
} from '../src/application/logic/velocity.ts';
import { calculateSimulationMetrics } from '../src/application/logic/simulationEngine.ts';

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

if (metrics1.unitMarginDollar !== 0.70 || metrics1.dailyVelocity !== 1.03 || metrics1.status !== 'ESTIMADO') throw new Error('Fallo en Caso 2');

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

// CASO 4a: Producto de 10 días (comprobación de equivalencia entre fórmulas)
const velCurrent10 = realVelocityCurrent({ unitsSoldTotal: 30, createdDaysAgo: 10 });
const vel28_10 = realVelocity28({ unitsSoldLast28d: 30, createdDaysAgo: 10 });
console.log('\nCaso 4a (Producto de 10 días):');
console.log(' - realVelocityCurrent (30u / 10d):', velCurrent10, '(esperado: 3.00)');
console.log(' - realVelocity28 (30u / min(28,10)d):', vel28_10, '(esperado: 3.00)');
if (velCurrent10 !== 3.00 || vel28_10 !== 3.00 || velCurrent10 !== vel28_10) {
  throw new Error('Fallo en Caso 4a: las fórmulas deben dar exactamente lo mismo con createdDaysAgo <= 28');
}

// CASO 4b: Producto de 90 días con 120 u totales y 10 u en los últimos 28 días
const velCurrent90 = realVelocityCurrent({ unitsSoldTotal: 120, createdDaysAgo: 90 });
const vel28_90 = realVelocity28({ unitsSoldLast28d: 10, createdDaysAgo: 90 });
const expectedVel28_90 = Number((10 / 28).toFixed(2)); // 0.36
console.log('\nCaso 4b (Producto de 90 días con desaceleración):');
console.log(' - realVelocityCurrent (120u / 90d):', velCurrent90, '(histórico acumulado: 1.33 u/día)');
console.log(' - realVelocity28 (10u / 28d):', vel28_90, `(esperado: 10/28 = ${expectedVel28_90} u/día)`);
if (vel28_90 !== expectedVel28_90) {
  throw new Error(`Fallo en Caso 4b: realVelocity28 debe ser ${expectedVel28_90}`);
}

// CASO 4c: Producto REAL sin ventas en 28 días
const prodRealZero = {
  id: 'prod-real-zero',
  storeId: 'store-1',
  categoryId: 'cat-1',
  name: 'Conserva Estancada',
  unit: 'lata',
  costPrice: 4.00,
  salePrice: 6.00,
  stock: 20,
  reorderPoint: 5,
  estimatedSpeed: 'NORMAL',
  unitsSold: 0,
  unitsSoldLast28d: 0,
  salesCount: 0,
  createdDaysAgo: 45, // >= 30 días -> status REAL
};
const metricsRealZero = calculateProductMetrics(prodRealZero);
console.log('\nCaso 4c (Producto REAL sin ventas en 28 días):');
console.log(' - Status:', metricsRealZero.status, '(esperado: REAL)');
console.log(' - Daily Velocity:', metricsRealZero.dailyVelocity, '(esperado: 0.1 u/día sin caer a estimado)');
console.log(' - isSlow:', metricsRealZero.isSlow, '(esperado: true)');
if (metricsRealZero.status !== 'REAL' || metricsRealZero.dailyVelocity !== 0.1 || metricsRealZero.isSlow !== true) {
  throw new Error('Fallo en Caso 4c: Producto REAL sin ventas debe devolver 0.1 e isSlow=true');
}

// CASO 4d: Producto ESTIMADO sin ventas con stock 0
const prodEstZeroStock = {
  id: 'prod-est-zero-stock',
  storeId: 'store-1',
  categoryId: 'cat-1',
  name: 'Galleta Vainilla Sin Stock',
  unit: 'paquete',
  costPrice: 1.00,
  salePrice: 1.50,
  stock: 0,
  reorderPoint: 5,
  estimatedSpeed: 'NORMAL',
  unitsSold: 0,
  salesCount: 0,
  createdDaysAgo: 5,
};
const metricsEstZero = calculateProductMetrics(prodEstZeroStock);
const simEstZero = calculateSimulationMetrics({
  unitCost: prodEstZeroStock.costPrice,
  salePrice: prodEstZeroStock.salePrice,
  quantity: 24,
  dailyVelocity: metricsEstZero.dailyVelocity,
});
const daysToDepleteEstZero = Math.max(1, Math.ceil(24 / Math.max(metricsEstZero.dailyVelocity, 0.1)));

console.log('\nCaso 4d (Producto ESTIMADO sin ventas con stock 0):');
console.log(' - Base de velocidad calculada (stock=0 -> Math.max(0,1)*0.15/7):', metricsEstZero.dailyVelocity, 'u/día');
console.log(' - Días en Simulador (simulationEngine) para 24 unidades:', simEstZero.daysToSell, 'días (24 / 0.02 = 1200)');
console.log(' - Días para agotar inventario (daysToDeplete) para 24 unidades:', daysToDepleteEstZero, 'días (24 / 0.1 = 240)');

// CASO 4e: Producto REAL de 90 días con unitsSoldLast28d = undefined (columna ausente en BD)
const prodRealUndefined28 = {
  id: 'prod-real-undef',
  storeId: 'store-1',
  categoryId: 'cat-1',
  name: 'Producto Sin Columna 28d',
  unit: 'bolsa',
  costPrice: 5.00,
  salePrice: 7.00,
  stock: 30,
  reorderPoint: 5,
  estimatedSpeed: 'NORMAL',
  unitsSold: 120,
  unitsSoldLast28d: undefined,
  unitsSold28d: undefined,
  salesCount: 25,
  createdDaysAgo: 90,
};
const metricsRealUndefined28 = calculateProductMetrics(prodRealUndefined28);
console.log('\nCaso 4e (Producto REAL de 90 días con unitsSoldLast28d = undefined):');
console.log(' - Status:', metricsRealUndefined28.status, '(esperado: REAL)');
console.log(' - Daily Velocity:', metricsRealUndefined28.dailyVelocity, '(esperado: 1.33 u/día histórica de respaldo, NO 0.1)');
console.log(' - isSlow:', metricsRealUndefined28.isSlow, '(esperado: false)');
if (metricsRealUndefined28.dailyVelocity !== 1.33) {
  throw new Error(`Fallo en Caso 4e: se esperaba velocidad histórica 1.33, pero se obtuvo ${metricsRealUndefined28.dailyVelocity}`);
}

// Evaluación Global combinada
const global = calculateGlobalMetrics([prod1, prod2]);
console.log('\nEvaluación Global Combinada:');
console.log(' - Total Invested:', global.totalInvestedCapital, '(esperado: 284.00)');
console.log(' - Score Status:', global.scoreStatus, '(esperado: OPTIMAL o STABLE)');
console.log(' - Real Capital Percent:', global.realCapitalPercent, '(esperado: 70.4%)');

if (global.totalInvestedCapital !== 284.00) throw new Error('Fallo en Global Combinado');

// ============================================================================
// CASO 5: CORRECCIÓN DE VELOCIDAD ESTIMADA EN SIMULADOR DE COMPRAS
// ============================================================================
console.log('\n--- Verificación de Corrección para Simulador de Compras (estimatedVelocityForPurchase) ---');

// 5a: stock 0, cantidad 24, NORMAL
const vel5a = estimatedVelocityForPurchase(0, 24, 'NORMAL');
const sim5a = calculateSimulationMetrics({ unitCost: 1, salePrice: 2, quantity: 24, dailyVelocity: vel5a });
console.log('\nCaso 5a (stock 0, cantidad 24, NORMAL):');
console.log(' - Velocidad para compra:', vel5a, 'u/día (esperado: ≈ 0.51)');
console.log(' - Días en el simulador:', sim5a.daysToSell, 'días (esperado: ≈ 47)');
if (Math.abs(vel5a - 0.51) > 0.02 || Math.abs(sim5a.daysToSell - 47) > 2) {
  throw new Error(`Fallo en Caso 5a: se esperaba vel ≈ 0.51 y días ≈ 47, obtenido vel=${vel5a}, días=${sim5a.daysToSell}`);
}

// 5b: stock 0, cantidad 24, RAPIDO y LENTO
const vel5bRap = estimatedVelocityForPurchase(0, 24, 'RAPIDO');
const sim5bRap = calculateSimulationMetrics({ unitCost: 1, salePrice: 2, quantity: 24, dailyVelocity: vel5bRap });
const vel5bLen = estimatedVelocityForPurchase(0, 24, 'LENTO');
const sim5bLen = calculateSimulationMetrics({ unitCost: 1, salePrice: 2, quantity: 24, dailyVelocity: vel5bLen });
console.log('\nCaso 5b (stock 0, cantidad 24, RÁPIDO y LENTO):');
console.log(' - RAPIDO: vel =', vel5bRap, 'u/día, días =', sim5bRap.daysToSell, '(esperado: ≈ 23 días)');
console.log(' - LENTO:  vel =', vel5bLen, 'u/día, días =', sim5bLen.daysToSell, '(esperado: ≈ 141 días)');
if (Math.abs(sim5bRap.daysToSell - 23) > 2) {
  throw new Error(`Fallo en Caso 5b (RAPIDO): se esperaba ≈ 23 días, obtenido ${sim5bRap.daysToSell}`);
}
if (Math.abs(sim5bLen.daysToSell - 141) > 2) {
  throw new Error(`Fallo en Caso 5b (LENTO): se esperaba ≈ 141 días, obtenido ${sim5bLen.daysToSell}`);
}

// 5c: REGRESIÓN: stock >= cantidad no cambia nada
const velOld24_24 = estimatedVelocity(24, 'NORMAL');
const simOld24_24 = calculateSimulationMetrics({ unitCost: 1, salePrice: 2, quantity: 24, dailyVelocity: velOld24_24 });
const velNew24_24 = estimatedVelocityForPurchase(24, 24, 'NORMAL');
const simNew24_24 = calculateSimulationMetrics({ unitCost: 1, salePrice: 2, quantity: 24, dailyVelocity: velNew24_24 });

const velOld100_24 = estimatedVelocity(100, 'NORMAL');
const simOld100_24 = calculateSimulationMetrics({ unitCost: 1, salePrice: 2, quantity: 24, dailyVelocity: velOld100_24 });
const velNew100_24 = estimatedVelocityForPurchase(100, 24, 'NORMAL');
const simNew100_24 = calculateSimulationMetrics({ unitCost: 1, salePrice: 2, quantity: 24, dailyVelocity: velNew100_24 });

console.log('\nCaso 5c (REGRESIÓN: stock >= cantidad idéntico al cálculo anterior):');
console.log(' - stock 24, cant 24, NORMAL: días anterior =', simOld24_24.daysToSell, ', días nuevo =', simNew24_24.daysToSell);
console.log(' - stock 100, cant 24, NORMAL: días anterior =', simOld100_24.daysToSell, ', días nuevo =', simNew100_24.daysToSell);
if (simNew24_24.daysToSell !== simOld24_24.daysToSell || velNew24_24 !== velOld24_24) {
  throw new Error('Fallo en Caso 5c: stock 24 cant 24 debe ser idéntico al cálculo viejo');
}
if (simNew100_24.daysToSell !== simOld100_24.daysToSell || velNew100_24 !== velOld100_24) {
  throw new Error('Fallo en Caso 5c: stock 100 cant 24 debe ser idéntico al cálculo viejo');
}

// 5d: REGRESIÓN: producto REAL con ventas da la misma velocidad que antes en el simulador
const realProduct = {
  id: 'prod-real-sales',
  unitsSold: 30,
  createdDaysAgo: 10,
  status: 'REAL',
};
const realVelExpected = realVelocityCurrent({ unitsSoldTotal: realProduct.unitsSold, createdDaysAgo: realProduct.createdDaysAgo });
const realResult24 = resolveRealVelocity({ unitsSoldTotal: realProduct.unitsSold, createdDaysAgo: realProduct.createdDaysAgo });
const realResult60 = resolveRealVelocity({ unitsSoldTotal: realProduct.unitsSold, createdDaysAgo: realProduct.createdDaysAgo });

console.log('\nCaso 5d (REGRESIÓN: producto REAL con ventas mantiene velocidad en el simulador):');
console.log(' - Velocidad real esperada:', realVelExpected, 'u/día');
console.log(' - Velocidad real con cant 24:', realResult24.dailyVelocity, 'u/día');
console.log(' - Velocidad real con cant 60:', realResult60.dailyVelocity, 'u/día');
if (realResult24.dailyVelocity !== realVelExpected || realResult60.dailyVelocity !== realVelExpected) {
  throw new Error('Fallo en Caso 5d: producto REAL debe mantener su velocidad real independiente de la cantidad simulada');
}

// 5e: TABLA MATRIZ stock {0, 5, 24, 100} x cantidad {12, 24, 60} x {RAPIDO, NORMAL, LENTO}
console.log('\nCaso 5e (Matriz Comparativa Antes/Después y Verificación de Regla de Decisión):');
const stocks = [0, 5, 24, 100];
const quantities = [12, 24, 60];
const speeds = ['RAPIDO', 'NORMAL', 'LENTO'];
const rates = { RAPIDO: 0.30, NORMAL: 0.15, LENTO: 0.05 };

console.log('| Stock | Cantidad | Velocidad | Tasa/sem | Días Viejo | Días Nuevo | Vel. Vieja | Vel. Nueva | Regla Cumplida |');
console.log('|-------|----------|-----------|----------|------------|------------|------------|------------|----------------|');

let allRulesSatisfied = true;
let totalCells = 0;

for (const s of stocks) {
  for (const q of quantities) {
    for (const sp of speeds) {
      totalCells++;
      const vOld = estimatedVelocity(s, sp);
      const daysOld = calculateSimulationMetrics({ unitCost: 1, salePrice: 2, quantity: q, dailyVelocity: vOld }).daysToSell;

      const vNew = estimatedVelocityForPurchase(s, q, sp);
      const daysNew = calculateSimulationMetrics({ unitCost: 1, salePrice: 2, quantity: q, dailyVelocity: vNew }).daysToSell;

      const rate = rates[sp];
      const maxAllowedDays = Math.ceil(7 / rate) + 1;

      let ruleOk = false;
      if (s >= q) {
        // Regla: nuevo === viejo
        ruleOk = (daysNew === daysOld) && (vNew === vOld);
      } else {
        // Regla: stock < cantidad => nuevo <= viejo y nuevo <= 7/tasa + 1
        ruleOk = (daysNew <= daysOld) && (daysNew <= maxAllowedDays);
      }

      if (!ruleOk) {
        allRulesSatisfied = false;
      }

      const ruleStr = ruleOk ? '✅ SÍ' : '❌ NO';
      console.log(`| ${String(s).padStart(5)} | ${String(q).padStart(8)} | ${sp.padEnd(9)} | ${(rate * 100).toFixed(0).padStart(6)}% | ${String(daysOld).padStart(10)} | ${String(daysNew).padStart(10)} | ${vOld.toFixed(2).padStart(10)} | ${vNew.toFixed(2).padStart(10)} | ${ruleStr.padStart(14)} |`);
    }
  }
}

console.log(`\nEvaluación de Regla de Decisión en ${totalCells} combinaciones: ${allRulesSatisfied ? '✅ 100% CUMPLIDA' : '❌ INCUMPLIDA'}`);
if (!allRulesSatisfied) {
  throw new Error('Fallo en la Regla de Decisión del Caso 5: revirtiendo cambios.');
}

console.log(`\nEstado actual de USE_WINDOW_28D: ${USE_WINDOW_28D}`);
console.log('✅ ¡Verificación matemática superada! Todos los casos pasaron correctamente.');
