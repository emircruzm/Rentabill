import { realVelocityCurrent, realVelocity28 } from '../src/application/logic/velocity.ts';

/**
 * Generador pseudo-aleatorio determinista (Mulberry32) para garantizar reproducibilidad exacta.
 */
function createRng(seed = 123456789) {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simulación de ventas diarias para una tienda minorista representativa durante 180 días (25 semanas).
 * Incluye estacionalidad semanal, derivas de demanda (shifts) y picos promocionales / esporádicos.
 */
function generateSyntheticCatalogAndSales(rng) {
  // Factores de día de semana: Lun-Jue más moderado, Vie-Dom más concurrido en bodegas
  const dayOfWeekMultiplier = [1.1, 0.9, 0.95, 0.95, 1.25, 1.4, 1.3];

  const products = [
    // RÁPIDOS (consumo diario: leche, pan, gaseosas, cerveza, huevos)
    { id: 'rap-1', name: 'Leche Gloria 400g', type: 'RAPIDO', baseDemand: 14, driftAtDay: 60, driftFactor: 0.65 }, // baja demanda por precio
    { id: 'rap-2', name: 'Pan Francés x10', type: 'RAPIDO', baseDemand: 25, driftAtDay: null, driftFactor: 1.0 },
    { id: 'rap-3', name: 'Inca Kola 1.5L', type: 'RAPIDO', baseDemand: 10, driftAtDay: 90, driftFactor: 1.5 },   // sube demanda en verano
    { id: 'rap-4', name: 'Huevos Pardos x kg', type: 'RAPIDO', baseDemand: 18, driftAtDay: 110, driftFactor: 0.8 },
    { id: 'rap-5', name: 'Cerveza Cristal 650ml', type: 'RAPIDO', baseDemand: 12, driftAtDay: 75, driftFactor: 1.4 },

    // NORMALES (abarrotes regulares: arroz, azúcar, aceite, atún, fideos)
    { id: 'nor-1', name: 'Arroz Costeño 1kg', type: 'NORMAL', baseDemand: 3.5, driftAtDay: 80, driftFactor: 0.7 },
    { id: 'nor-2', name: 'Azúcar Rubia 1kg', type: 'NORMAL', baseDemand: 2.8, driftAtDay: null, driftFactor: 1.0 },
    { id: 'nor-3', name: 'Aceite Primor 1L', type: 'NORMAL', baseDemand: 2.2, driftAtDay: 70, driftFactor: 1.4 },
    { id: 'nor-4', name: 'Atún Primor 170g', type: 'NORMAL', baseDemand: 1.8, driftAtDay: 100, driftFactor: 0.5 },
    { id: 'nor-5', name: 'Fideos Don Vittorio', type: 'NORMAL', baseDemand: 3.0, driftAtDay: null, driftFactor: 1.0 },
    { id: 'nor-6', name: 'Galletas Casino 6pk', type: 'NORMAL', baseDemand: 4.0, driftAtDay: 90, driftFactor: 1.3 },

    // LENTOS (baja rotación: pilas, condimentos especiales, útiles, limpieza específica)
    { id: 'len-1', name: 'Pilas Duracell AA x2', type: 'LENTO', baseDemand: 0.35, driftAtDay: 90, driftFactor: 0.2 }, // se estanca
    { id: 'len-2', name: 'Insecticida Sapolio', type: 'LENTO', baseDemand: 0.25, driftAtDay: null, driftFactor: 1.0 },
    { id: 'len-3', name: 'Quitaesmalte 60ml', type: 'LENTO', baseDemand: 0.20, driftAtDay: 60, driftFactor: 1.8 },
    { id: 'len-4', name: 'Foco LED 9W', type: 'LENTO', baseDemand: 0.40, driftAtDay: 100, driftFactor: 0.1 },        // casi cero
    { id: 'len-5', name: 'Pegamento Triz 3g', type: 'LENTO', baseDemand: 0.30, driftAtDay: null, driftFactor: 1.0 },
  ];

  const TOTAL_DAYS = 180;
  // dailySales[productId][dayIndex (0..179)] = unitsSoldOnThatDay
  const dailySales = {};

  for (const prod of products) {
    dailySales[prod.id] = new Array(TOTAL_DAYS).fill(0);

    for (let day = 0; day < TOTAL_DAYS; day++) {
      let currentBase = prod.baseDemand;
      if (prod.driftAtDay !== null && day >= prod.driftAtDay) {
        currentBase *= prod.driftFactor;
      }

      // Estacionalidad de día de semana
      const dow = day % 7;
      const expected = currentBase * dayOfWeekMultiplier[dow];

      // Ruido poisson / aleatorio
      let units = 0;
      if (prod.type === 'LENTO') {
        // En lentos, probabilidad de vender 1 o 2 unidades en el día
        if (rng() < Math.min(expected, 0.9)) {
          units = rng() < 0.2 ? 2 : 1;
        }
      } else {
        // En rápidos y normales, distribución normal aproximada con ruido
        const noise = (rng() + rng() + rng() - 1.5) * (expected * 0.4);
        units = Math.max(0, Math.round(expected + noise));
      }

      // Picos ocasionales (3% de probabilidad de compra mayor o reposición)
      if (rng() < 0.03 && units > 0) {
        units = Math.round(units * (1.8 + rng() * 0.7));
      }

      dailySales[prod.id][day] = units;
    }
  }

  return { products, dailySales, TOTAL_DAYS };
}

/**
 * Ejecuta el backtest comparativo.
 */
function runBacktest() {
  const rng = createRng(42);
  const { products, dailySales, TOTAL_DAYS } = generateSyntheticCatalogAndSales(rng);

  // Semanas de corte para evaluar: desde la semana 5 (día 35, cuando ya son REAL) hasta la semana 24
  // En cada corte T, se predice la demanda acumulada de los días [T .. T+6] (los 7 días siguientes)
  const stats = {
    TOTAL: { n: 0, actualSum: 0, errCurSum: 0, err28Sum: 0, biasCurSum: 0, bias28Sum: 0 },
    RAPIDO: { n: 0, actualSum: 0, errCurSum: 0, err28Sum: 0, biasCurSum: 0, bias28Sum: 0 },
    NORMAL: { n: 0, actualSum: 0, errCurSum: 0, err28Sum: 0, biasCurSum: 0, bias28Sum: 0 },
    LENTO: { n: 0, actualSum: 0, errCurSum: 0, err28Sum: 0, biasCurSum: 0, bias28Sum: 0 },
  };

  const CUTOFF_DAYS = [];
  for (let day = 35; day + 7 <= TOTAL_DAYS; day += 7) {
    CUTOFF_DAYS.push(day);
  }

  for (const prod of products) {
    const salesArr = dailySales[prod.id];

    for (const cutoffDay of CUTOFF_DAYS) {
      // 1. Datos estrictamente históricos (días 0 a cutoffDay - 1)
      const createdDaysAgo = cutoffDay; // días transcurridos desde día 0
      let unitsSoldTotal = 0;
      for (let d = 0; d < cutoffDay; d++) {
        unitsSoldTotal += salesArr[d];
      }

      // Ventana de 28 días estrictamente previa al corte: días [cutoffDay - 28 .. cutoffDay - 1]
      let unitsSoldLast28d = 0;
      const start28 = Math.max(0, cutoffDay - 28);
      for (let d = start28; d < cutoffDay; d++) {
        unitsSoldLast28d += salesArr[d];
      }

      // 2. Predicción para los siguientes 7 días (días cutoffDay .. cutoffDay + 6)
      const vCurrent = realVelocityCurrent({ unitsSoldTotal, createdDaysAgo });
      const v28 = realVelocity28({ unitsSoldLast28d, createdDaysAgo });

      const predCurrent = vCurrent * 7;
      const pred28 = v28 * 7;

      // 3. Demanda real en los siguientes 7 días
      let actual7d = 0;
      for (let d = cutoffDay; d < cutoffDay + 7; d++) {
        actual7d += salesArr[d];
      }

      // Métricas
      const errCur = Math.abs(predCurrent - actual7d);
      const err28 = Math.abs(pred28 - actual7d);
      const biasCur = predCurrent - actual7d;
      const bias28 = pred28 - actual7d;

      // Acumular en TOTAL y por tipo
      const buckets = [stats.TOTAL, stats[prod.type]];
      for (const b of buckets) {
        b.n += 1;
        b.actualSum += actual7d;
        b.errCurSum += errCur;
        b.err28Sum += err28;
        b.biasCurSum += biasCur;
        b.bias28Sum += bias28;
      }
    }
  }

  return stats;
}

// Ejecución
console.log('=== BACKTEST DE VALIDACIÓN DE VELOCIDAD: HISTÓRICA vs VENTANA 28 DÍAS ===\n');

const results = runBacktest();

const categories = ['TOTAL', 'RAPIDO', 'NORMAL', 'LENTO'];
const rows = [];

for (const cat of categories) {
  const d = results[cat];
  const wapeCur = (d.errCurSum / d.actualSum) * 100;
  const wape28 = (d.err28Sum / d.actualSum) * 100;
  const deltaWape = wape28 - wapeCur; // Negativo = mejoró la ventana 28d

  const biasCur = (d.biasCurSum / d.actualSum) * 100;
  const bias28 = (d.bias28Sum / d.actualSum) * 100;

  rows.push({
    categoria: cat,
    n: d.n,
    actualSum: d.actualSum,
    wapeCur: wapeCur.toFixed(2) + '%',
    wape28: wape28.toFixed(2) + '%',
    deltaWape: (deltaWape > 0 ? '+' : '') + deltaWape.toFixed(2) + ' pp',
    biasCur: (biasCur > 0 ? '+' : '') + biasCur.toFixed(2) + '%',
    bias28: (bias28 > 0 ? '+' : '') + bias28.toFixed(2) + '%',
    rawDeltaWape: deltaWape,
  });
}

// Imprimir tabla formateada
console.log('| Categoría | Comparaciones | WAPE Actual | WAPE 28d | Dif. WAPE (28d - Actual) | Sesgo Actual | Sesgo 28d |');
console.log('|-----------|---------------|-------------|----------|--------------------------|--------------|-----------|');
for (const r of rows) {
  console.log(`| ${r.categoria.padEnd(9)} | ${String(r.n).padStart(13)} | ${r.wapeCur.padStart(11)} | ${r.wape28.padStart(8)} | ${r.deltaWape.padStart(24)} | ${r.biasCur.padStart(12)} | ${r.bias28.padStart(9)} |`);
}

// Evaluación de la Regla de Decisión
const totalRow = rows.find(r => r.categoria === 'TOTAL');
const rapidoRow = rows.find(r => r.categoria === 'RAPIDO');
const normalRow = rows.find(r => r.categoria === 'NORMAL');
const lentoRow = rows.find(r => r.categoria === 'LENTO');

const totalBetterOrEqual = totalRow.rawDeltaWape <= 0.0;
const noCategoryWorseThan1pp = [rapidoRow, normalRow, lentoRow].every(r => r.rawDeltaWape <= 1.0);
const sufficientComparisons = totalRow.n >= 30;

console.log('\n--- Evaluación de Reglas de Decisión ---');
console.log(`1. Muestra suficiente (N >= 30): ${sufficientComparisons ? 'SÍ' : 'NO'} (N = ${totalRow.n})`);
console.log(`2. WAPE Total de la ventana 28d <= WAPE Actual: ${totalBetterOrEqual ? 'SÍ' : 'NO'} (${totalRow.wape28} vs ${totalRow.wapeCur})`);
console.log(`3. Ninguna categoría empeora más de 1 pp: ${noCategoryWorseThan1pp ? 'SÍ' : 'NO'} (Rápido: ${rapidoRow.deltaWape}, Normal: ${normalRow.deltaWape}, Lento: ${lentoRow.deltaWape})`);

let shouldActivate = sufficientComparisons && totalBetterOrEqual && noCategoryWorseThan1pp;

console.log(`\nVEREDICTO FINAL: ${shouldActivate ? 'APROBADO PARA ACTIVACIÓN (USE_WINDOW_28D = true)' : 'NO APROBADO (MANTENER USE_WINDOW_28D = false)'}`);
