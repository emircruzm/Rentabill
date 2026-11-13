#!/usr/bin/env node
/**
 * scripts/perf-concurrency.mjs
 *
 * Pruebas de concurrencia y contención sobre la base de datos Supabase:
 *  - Escenario A: Producto caliente (contención con C = 5, 10, 25, 50)
 *  - Escenario B: Sobreventa (3 rondas de race condition con warmup y Promise.all)
 *  - Escenario C: Orden cruzado (3 rondas de prevención de deadlocks con warmup)
 *
 * Uso:
 *   node --env-file=.env.test scripts/perf-concurrency.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { performance } from 'node:perf_hooks';

// ============================================================================
// 1. Constantes y Guardia de Seguridad
// ============================================================================
const TARGET_STORE_NAME = 'PRUEBAS-VOLUMEN';

function assertAllowedStoreName(storeName, context = '') {
  if (storeName !== TARGET_STORE_NAME) {
    throw new Error(
      `🚨 GUARDIA DE SEGURIDAD ABORTADA (${context}): Se intentó operar sobre una tienda no permitida: "${storeName}". ` +
      `Este script SOLO puede interactuar con la tienda "${TARGET_STORE_NAME}".`
    );
  }
}

function getLocalIsoString() {
  const d = new Date();
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' + pad(d.getMonth() + 1) +
    '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) +
    ':' + pad(d.getMinutes()) +
    ':' + pad(d.getSeconds()) +
    '.' + String(d.getMilliseconds()).padStart(3, '0') +
    sign + pad(offset / 60) + ':' + pad(offset % 60)
  );
}

// ============================================================================
// 2. Funciones Estadísticas
// ============================================================================
function calcStats(numbers) {
  if (!numbers || numbers.length === 0) {
    return { min: 0, max: 0, p50: 0, p95: 0, avg: 0 };
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = sorted.reduce((sum, n) => sum + n, 0) / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const p50 = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = sorted[p95Index];
  return { min, max, p50, p95, avg };
}

// ============================================================================
// 3. Pool de Concurrencia
// ============================================================================
async function runWorkerPool(tasks, concurrency, workerFn) {
  let currentIndex = 0;
  const results = new Array(tasks.length);
  let aborted = false;
  let abortError = null;

  async function worker() {
    while (currentIndex < tasks.length && !aborted) {
      const idx = currentIndex++;
      const task = tasks[idx];
      try {
        const res = await workerFn(task, idx);
        results[idx] = res;
        if (res && res.shouldAbort) {
          aborted = true;
          abortError = new Error(res.abortReason || 'Aborted');
        }
      } catch (err) {
        results[idx] = { success: false, error: err.message };
      }
    }
  }

  const workerCount = Math.min(concurrency, tasks.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  if (aborted && abortError) {
    throw abortError;
  }

  return results;
}

// ============================================================================
// 4. Calentamiento de Conexiones HTTP / Sockets
// ============================================================================
async function warmupConnections(supabase, storeId, count) {
  const warmupPromises = Array.from({ length: count }, () =>
    supabase.from('stores').select('id').eq('id', storeId).limit(1)
  );
  await Promise.all(warmupPromises);
}

// ============================================================================
// 5. Creación Segura de Producto de Prueba
// ============================================================================
async function createTestProduct(supabase, { storeId, categoryId, name, initialStock }) {
  const barcode = `BAR_${name}`;
  const sku = `SKU_${name}`;

  const { data, error } = await supabase
    .from('products')
    .insert({
      store_id: storeId,
      category_id: categoryId,
      name,
      barcode,
      sku,
      unit: 'pza',
      cost_price: 10.00,
      sale_price: 15.00,
      stock: initialStock,
      reorder_point: 5,
      estimated_speed: 'NORMAL',
      units_sold: 0,
      sales_count: 0,
    })
    .select('id, name, stock, units_sold')
    .single();

  if (error || !data) {
    throw new Error(`Error al crear producto de prueba "${name}": ${error?.message}`);
  }

  return data;
}

// ============================================================================
// 6. Flujo Principal
// ============================================================================
async function main() {
  const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  console.log('='.repeat(75));
  console.log('⚡ PRUEBAS DE CONCURRENCIA Y RESILIENCIA MULTI-CLIENTE — RENTABILL');
  console.log('='.repeat(75));
  console.log(`🆔 Run ID         : ${runId}`);
  console.log(`🎯 Tienda Objetivo: "${TARGET_STORE_NAME}"`);
  console.log(`⏰ Inicio Sesión  : ${getLocalIsoString()}`);
  console.log('='.repeat(75));

  // --------------------------------------------------------------------------
  // Variables de Entorno y Autenticación
  // --------------------------------------------------------------------------
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
  const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL / VITE_SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY');
  if (!TEST_USER_EMAIL) missing.push('TEST_USER_EMAIL');
  if (!TEST_USER_PASSWORD) missing.push('TEST_USER_PASSWORD');

  if (missing.length > 0) {
    console.error('❌ Faltan variables de entorno requeridas en .env.test:');
    missing.forEach(m => console.error(`   - ${m}`));
    console.error('\nEjecuta con:');
    console.error('   node --env-file=.env.test scripts/perf-concurrency.mjs\n');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  console.log('\n[Paso 1] Autenticando usuario de pruebas (solo anon key)...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });

  if (authError || !authData.user) {
    console.error('❌ Error de autenticación:', authError?.message || 'Usuario no autenticado');
    process.exit(1);
  }
  console.log(`✅ Sesión iniciada: ${authData.user.email} (UID: ${authData.user.id})`);

  // --------------------------------------------------------------------------
  // Buscar Tienda "PRUEBAS-VOLUMEN" (NO CREA NI BORRA TIENDAS)
  // --------------------------------------------------------------------------
  console.log(`\n[Paso 2] Localizando tienda "${TARGET_STORE_NAME}"...`);
  const { data: storesFound, error: storeSearchError } = await supabase
    .from('stores')
    .select('id, name')
    .eq('name', TARGET_STORE_NAME);

  if (storeSearchError) {
    console.error('❌ Error al buscar tienda:', storeSearchError.message);
    process.exit(1);
  }

  if (!storesFound || storesFound.length === 0) {
    console.error(`\n❌ No se encontró la tienda "${TARGET_STORE_NAME}".`);
    console.error('Este script requiere que la tienda exista previamente con su volumen.');
    console.error('Ejecuta primero:');
    console.error('   node --env-file=.env.test scripts/perf-seed-volume.mjs\n');
    process.exit(1);
  }

  if (storesFound.length > 1) {
    console.error(`\n❌ Se encontraron ${storesFound.length} tiendas con el nombre "${TARGET_STORE_NAME}".`);
    console.error('Por seguridad, limpia las tiendas duplicadas antes de continuar.');
    process.exit(1);
  }

  const targetStore = storesFound[0];
  assertAllowedStoreName(targetStore.name, 'store_validation');
  const storeId = targetStore.id;
  console.log(`✅ Tienda localizada: "${targetStore.name}" (ID: ${storeId})`);

  // Obtener categoría
  const { data: catData, error: catError } = await supabase
    .from('categories')
    .select('id, name')
    .eq('store_id', storeId)
    .limit(1)
    .maybeSingle();

  if (catError || !catData?.id) {
    console.error('❌ No se encontró categoría en la tienda:', catError?.message);
    process.exit(1);
  }
  const categoryId = catData.id;
  console.log(`📁 Categoría vinculada: "${catData.name}" (${categoryId})`);

  // --------------------------------------------------------------------------
  // Venta de Humo Inicial
  // --------------------------------------------------------------------------
  console.log('\n[Paso 3] Ejecutando VENTA DE HUMO inicial...');
  const smokeProdName = `PERF_CONC_SMOKE_${runId}`;
  const smokeProd = await createTestProduct(supabase, {
    storeId,
    categoryId,
    name: smokeProdName,
    initialStock: 10,
  });

  const smokeTicket = `TKT-CONC-${runId}-SMOKE`;
  const { data: smokeData, error: smokeError } = await supabase.rpc('process_sale', {
    p_store_id: storeId,
    p_ticket_number: smokeTicket,
    p_payment_method: 'tarjeta',
    p_cash_given: null,
    p_items: [{ productId: smokeProd.id, quantity: 1 }],
    p_register_id: null,
  });

  if (smokeError || !smokeData?.success) {
    console.error('❌ Error en venta de humo:');
    console.error('   RPC Error :', smokeError?.message || smokeError);
    console.error('   Respuesta :', smokeData);
    process.exit(1);
  }
  console.log(`✅ Venta de humo exitosa (Ticket: ${smokeData.ticket_number || smokeTicket}, ID: ${smokeData.sale_id})`);

  // Estructura para resumen final
  const summaryResults = [];

  // ==========================================================================
  // ESCENARIO A: PRODUCTO CALIENTE
  // ==========================================================================
  console.log('\n' + '='.repeat(75));
  console.log('🔥 ESCENARIO A: PRODUCTO CALIENTE (Alta contención en 1 fila)');
  console.log('='.repeat(75));
  const timeAStart = getLocalIsoString();
  console.log(`⏰ Inicio Escenario A: ${timeAStart}`);

  const hotProdInitialStock = 5000;
  const hotProdName = `PERF_CONC_HOT_${runId}`;
  const hotProd = await createTestProduct(supabase, {
    storeId,
    categoryId,
    name: hotProdName,
    initialStock: hotProdInitialStock,
  });
  console.log(`📦 Producto caliente creado: "${hotProd.name}" (${hotProd.id}) con stock inicial: ${hotProdInitialStock}`);

  const concurrencyLevels = [5, 10, 25, 50];
  const salesPerLevel = 200;
  let hotCumulativeSuccesses = 0;
  let hotScenarioPassed = true;
  let hotFailureDetail = null;

  let consecutiveNonStockErrors = 0;

  for (const C of concurrencyLevels) {
    console.log(`\n--- Concurrencia C = ${C} (${salesPerLevel} ventas de 1 unidad) ---`);
    const tasks = Array.from({ length: salesPerLevel }, (_, i) => i + 1);
    const latencies = [];
    const errorCounts = new Map();
    let levelSuccess = 0;
    let levelFail = 0;

    const tStart = performance.now();

    try {
      await runWorkerPool(tasks, C, async (taskNum) => {
        const ticket = `TKT-CONC-${runId}-HOT-C${C}-${String(taskNum).padStart(4, '0')}`;
        const t0 = performance.now();

        const { data: saleData, error: saleError } = await supabase.rpc('process_sale', {
          p_store_id: storeId,
          p_ticket_number: ticket,
          p_payment_method: 'tarjeta',
          p_cash_given: null,
          p_items: [{ productId: hotProd.id, quantity: 1 }],
          p_register_id: null,
        });
        const dur = performance.now() - t0;
        latencies.push(dur);

        const isSuccess = !saleError && saleData?.success === true;

        if (isSuccess) {
          levelSuccess++;
          consecutiveNonStockErrors = 0;
          return { success: true, duration: dur };
        }

        levelFail++;
        const errMsg = saleError?.message || JSON.stringify(saleData) || 'Error desconocido';
        errorCounts.set(errMsg, (errorCounts.get(errMsg) || 0) + 1);

        // Clasificación estricta: SOLO por mensaje 'Stock insuficiente'
        const isStockError = Boolean(errMsg && errMsg.includes('Stock insuficiente'));
        if (!isStockError) {
          consecutiveNonStockErrors++;
          if (consecutiveNonStockErrors >= 20) {
            return {
              success: false,
              duration: dur,
              shouldAbort: true,
              abortReason: `Se alcanzaron 20 fallos consecutivos no relacionados a stock (último: ${errMsg})`,
            };
          }
        } else {
          consecutiveNonStockErrors = 0;
        }

        return { success: false, duration: dur, error: errMsg };
      });
    } catch (abortErr) {
      console.error(`\n❌ ABORTADO EN ESCENARIO A (C=${C}): ${abortErr.message}`);
      hotScenarioPassed = false;
      hotFailureDetail = abortErr.message;
      break;
    }

    const tTotalSec = (performance.now() - tStart) / 1000;
    const stats = calcStats(latencies);
    hotCumulativeSuccesses += levelSuccess;

    console.log(`   Éxitos: ${levelSuccess} | Fallos: ${levelFail}`);
    if (errorCounts.size > 0) {
      console.log('   Desglose de fallos:');
      for (const [msg, cnt] of errorCounts.entries()) {
        console.log(`     - [${cnt}x]: ${msg}`);
      }
    }
    console.log(`   Latencias : p50 = ${stats.p50.toFixed(1)} ms | p95 = ${stats.p95.toFixed(1)} ms | Máx = ${stats.max.toFixed(1)} ms`);
    console.log(`   Rendimiento: ${(levelSuccess / tTotalSec).toFixed(1)} ventas/seg | Tiempo: ${tTotalSec.toFixed(2)} s`);

    // Verificación 1: Que éxitos + fallos == 200 (sin respuestas perdidas)
    const totalResponses = levelSuccess + levelFail;
    if (totalResponses !== salesPerLevel) {
      const lostMsg = `Respuestas perdidas en C=${C}: se esperaban ${salesPerLevel} respuestas pero se obtuvieron ${totalResponses}`;
      console.error(`   ❌ ${lostMsg}`);
      hotScenarioPassed = false;
      hotFailureDetail = lostMsg;
    } else {
      console.log(`   ✅ Verificación de respuestas en C=${C}: ${totalResponses}/${salesPerLevel} respuestas recibidas (sin pérdidas).`);
    }

    // Verificación 2: Integridad de stock y units_sold en BD
    const { data: checkProd, error: checkErr } = await supabase
      .from('products')
      .select('stock, units_sold')
      .eq('id', hotProd.id)
      .single();

    if (checkErr || !checkProd) {
      console.error(`   ❌ Error al verificar producto caliente: ${checkErr?.message}`);
      hotScenarioPassed = false;
      hotFailureDetail = `Error al consultar producto: ${checkErr?.message}`;
    } else {
      const expectedStock = hotProdInitialStock - hotCumulativeSuccesses;
      const expectedSold = hotCumulativeSuccesses;
      const actualStock = Number(checkProd.stock);
      const actualSold = Number(checkProd.units_sold);

      const stockMatches = Math.abs(expectedStock - actualStock) < 0.001;
      const soldMatches = Math.abs(expectedSold - actualSold) < 0.001;

      if (stockMatches && soldMatches) {
        console.log(`   ✅ Verificación C=${C}: stock (${actualStock}) y units_sold (${actualSold}) coinciden con éxitos acumulados (${hotCumulativeSuccesses}).`);
      } else {
        const diffMsg = `Discrepancia en C=${C}: Stock BD=${actualStock} (Esp: ${expectedStock}), Sold BD=${actualSold} (Esp: ${expectedSold})`;
        console.error(`   ❌ ${diffMsg}`);
        hotScenarioPassed = false;
        hotFailureDetail = diffMsg;
      }
    }
  }

  const timeAEnd = getLocalIsoString();
  console.log(`⏰ Fin Escenario A: ${timeAEnd}`);

  summaryResults.push({
    escenario: 'A) Producto caliente (C = 5, 10, 25, 50)',
    estado: hotScenarioPassed ? 'PASA' : 'FALLA',
    detalle: hotScenarioPassed
      ? `${hotCumulativeSuccesses} ventas procesadas con consistencia exacta de stock.`
      : hotFailureDetail,
  });

  // ==========================================================================
  // ESCENARIO B: SOBREVENTA (3 RONDAS CON WARMUP Y PROMISE.ALL)
  // ==========================================================================
  console.log('\n' + '='.repeat(75));
  console.log('⚡ ESCENARIO B: SOBREVENTA (3 RONDAS DE 40 VENTAS SIMULTÁNEAS CON WARMUP)');
  console.log('='.repeat(75));
  const timeBStart = getLocalIsoString();
  console.log(`⏰ Inicio Escenario B: ${timeBStart}`);

  const overInitialStock = 10;
  const overSalesPerRound = 40;
  const overRoundsCount = 3;
  let totalOverSuccess = 0;
  let totalOverAttempted = overSalesPerRound * overRoundsCount; // 120
  let scenarioBPassed = true;
  const failureReasonsB = [];

  for (let round = 1; round <= overRoundsCount; round++) {
    console.log(`\n--- [Ronda ${round}/${overRoundsCount}] Creando producto nuevo para sobreventa ---`);
    const overProdName = `PERF_CONC_OVER_R${round}_${runId}`;
    const overProd = await createTestProduct(supabase, {
      storeId,
      categoryId,
      name: overProdName,
      initialStock: overInitialStock,
    });
    console.log(`📦 Producto Ronda ${round}: "${overProd.name}" (${overProd.id}) con stock inicial: ${overInitialStock}`);

    // Calentamiento previo de conexiones (warmup)
    console.log(`🔥 Calentando ${overSalesPerRound} conexiones antes de la ráfaga simultánea...`);
    await warmupConnections(supabase, storeId, overSalesPerRound);

    console.log(`🚀 Disparando RÁFAGA de ${overSalesPerRound} ventas simultáneas con Promise.all...`);
    const tStartRound = performance.now();

    const overPromises = Array.from({ length: overSalesPerRound }, async (_, idx) => {
      const ticket = `TKT-CONC-${runId}-OVER-R${round}-${String(idx + 1).padStart(3, '0')}`;
      const t0 = performance.now();
      const { data: saleData, error: saleError } = await supabase.rpc('process_sale', {
        p_store_id: storeId,
        p_ticket_number: ticket,
        p_payment_method: 'tarjeta',
        p_cash_given: null,
        p_items: [{ productId: overProd.id, quantity: 1 }],
        p_register_id: null,
      });
      const dur = performance.now() - t0;
      return {
        idx: idx + 1,
        ticket,
        success: !saleError && saleData?.success === true,
        error: saleError?.message || (saleData?.success ? null : JSON.stringify(saleData)),
        errorCode: saleError?.code || null,
        duration: dur,
      };
    });

    const roundResults = await Promise.all(overPromises);
    const tRoundSec = (performance.now() - tStartRound) / 1000;

    let roundSuccess = 0;
    let roundStockFailures = 0;
    const roundSevereErrors = [];
    const roundOtherErrors = [];
    const roundLatencies = [];

    for (const r of roundResults) {
      roundLatencies.push(r.duration);
      if (r.success) {
        roundSuccess++;
      } else {
        // Clasificación estricta: SOLO por mensaje 'Stock insuficiente'
        const isStockError = Boolean(r.error && r.error.includes('Stock insuficiente'));
        if (isStockError) {
          roundStockFailures++;
        } else {
          const isDeadlock = r.errorCode === '40P01' || (r.error && r.error.includes('deadlock'));
          const isSerialization = r.errorCode === '40001';
          if (isDeadlock || isSerialization) {
            roundSevereErrors.push(`[GRAVE] Intento #${r.idx} código ${r.errorCode}: ${r.error}`);
          } else {
            roundOtherErrors.push(`Intento #${r.idx}: ${r.error} (código: ${r.errorCode})`);
          }
        }
      }
    }

    totalOverSuccess += roundSuccess;
    const statsRound = calcStats(roundLatencies);

    // Consultar producto para verificar stock final = 0
    const { data: overCheckProd } = await supabase
      .from('products')
      .select('stock, units_sold')
      .eq('id', overProd.id)
      .single();

    const finalOverStock = Number(overCheckProd?.stock);
    const finalOverSold = Number(overCheckProd?.units_sold);

    console.log(`📊 Métricas Ronda ${round}:`);
    console.log(`   Éxitos             : ${roundSuccess} (Esperados: 10)`);
    console.log(`   Rechazos stock     : ${roundStockFailures} (Esperados: 30)`);
    console.log(`   Errores graves     : ${roundSevereErrors.length}`);
    console.log(`   Otros errores      : ${roundOtherErrors.length}`);
    console.log(`   Stock final en BD  : ${finalOverStock} (Esperado: 0)`);
    console.log(`   Units sold en BD   : ${finalOverSold} (Esperado: 10)`);
    console.log(`   Latencias          : p50 = ${statsRound.p50.toFixed(1)} ms | p95 = ${statsRound.p95.toFixed(1)} ms | Máx = ${statsRound.max.toFixed(1)} ms`);
    console.log(`   Tiempo total ronda : ${tRoundSec.toFixed(2)} s`);

    if (roundSevereErrors.length > 0) {
      console.error('   🚨 Errores graves en ronda:');
      roundSevereErrors.forEach(e => console.error(`      - ${e}`));
    }
    if (roundOtherErrors.length > 0) {
      console.error('   ⚠️ Otros errores en ronda:');
      roundOtherErrors.forEach(e => console.error(`      - ${e}`));
    }

    // Evaluación de la ronda
    let roundPassed = true;
    if (roundSuccess !== 10) {
      roundPassed = false;
      failureReasonsB.push(`Ronda ${round}: Éxitos fueron ${roundSuccess} en vez de 10.`);
    }
    if (roundStockFailures !== 30) {
      roundPassed = false;
      failureReasonsB.push(`Ronda ${round}: Rechazos por stock fueron ${roundStockFailures} en vez de 30.`);
    }
    if (finalOverStock !== 0) {
      roundPassed = false;
      failureReasonsB.push(`Ronda ${round}: Stock final fue ${finalOverStock} en vez de 0.`);
    }
    if (roundSevereErrors.length > 0) {
      roundPassed = false;
      failureReasonsB.push(`Ronda ${round}: Hubo ${roundSevereErrors.length} errores graves.`);
    }

    if (roundPassed) {
      console.log(`   ✅ Ronda ${round} PASÓ.`);
    } else {
      console.log(`   ❌ Ronda ${round} FALLÓ.`);
      scenarioBPassed = false;
    }
  }

  const timeBEnd = getLocalIsoString();
  console.log(`⏰ Fin Escenario B: ${timeBEnd}`);

  summaryResults.push({
    escenario: 'B) Sobreventa (3 rondas, race condition)',
    estado: scenarioBPassed ? 'PASA' : 'FALLA',
    detalle: scenarioBPassed
      ? `3 rondas superadas. Intentos: ${totalOverAttempted}, Éxitos: ${totalOverSuccess} (exactamente 10/40 por ronda, stock final 0).`
      : `Fallaron rondas. Intentos: ${totalOverAttempted}, Éxitos: ${totalOverSuccess}. Motivo: ${failureReasonsB.join(' ')}`,
  });

  // ==========================================================================
  // ESCENARIO C: ORDEN CRUZADO (3 RONDAS CON WARMUP Y PROMISE.ALL)
  // ==========================================================================
  console.log('\n' + '='.repeat(75));
  console.log('🔀 ESCENARIO C: ORDEN CRUZADO (3 RONDAS DE 40 VENTAS [X,Y] Y [Y,X] CON WARMUP)');
  console.log('='.repeat(75));
  const timeCStart = getLocalIsoString();
  console.log(`⏰ Inicio Escenario C: ${timeCStart}`);

  const crossInitialStock = 1000;
  const crossSalesPerRound = 40;
  const crossRoundsCount = 3;
  let totalCrossSuccess = 0;
  let totalCrossAttempted = crossSalesPerRound * crossRoundsCount; // 120
  let scenarioCPassed = true;
  const failureReasonsC = [];

  for (let round = 1; round <= crossRoundsCount; round++) {
    console.log(`\n--- [Ronda ${round}/${crossRoundsCount}] Creando productos X e Y para orden cruzado ---`);
    const prodXName = `PERF_CONC_CROSS_X_R${round}_${runId}`;
    const prodYName = `PERF_CONC_CROSS_Y_R${round}_${runId}`;

    const prodX = await createTestProduct(supabase, {
      storeId,
      categoryId,
      name: prodXName,
      initialStock: crossInitialStock,
    });
    const prodY = await createTestProduct(supabase, {
      storeId,
      categoryId,
      name: prodYName,
      initialStock: crossInitialStock,
    });

    console.log(`📦 Producto X Ronda ${round}: "${prodX.name}" (${prodX.id}) con stock: ${crossInitialStock}`);
    console.log(`📦 Producto Y Ronda ${round}: "${prodY.name}" (${prodY.id}) con stock: ${crossInitialStock}`);

    // 20 ventas con [X, Y] y 20 ventas con [Y, X]
    const crossTasks = [];
    for (let i = 1; i <= 20; i++) {
      crossTasks.push({
        id: i,
        ticket: `TKT-CONC-${runId}-CROSS-R${round}-XY-${String(i).padStart(3, '0')}`,
        items: [
          { productId: prodX.id, quantity: 1 },
          { productId: prodY.id, quantity: 1 },
        ],
        orderDesc: '[X, Y]',
      });
    }
    for (let i = 1; i <= 20; i++) {
      crossTasks.push({
        id: i + 20,
        ticket: `TKT-CONC-${runId}-CROSS-R${round}-YX-${String(i).padStart(3, '0')}`,
        items: [
          { productId: prodY.id, quantity: 1 },
          { productId: prodX.id, quantity: 1 },
        ],
        orderDesc: '[Y, X]',
      });
    }

    // Calentamiento previo de conexiones (warmup)
    console.log(`🔥 Calentando ${crossSalesPerRound} conexiones antes de la ráfaga cruzada...`);
    await warmupConnections(supabase, storeId, crossSalesPerRound);

    console.log(`🚀 Disparando RÁFAGA cruzada de 40 ventas (20 [X,Y] + 20 [Y,X]) con Promise.all...`);
    const tStartRoundC = performance.now();

    const roundResultsC = await Promise.all(
      crossTasks.map(async (task) => {
        const t0 = performance.now();
        const { data: saleData, error: saleError } = await supabase.rpc('process_sale', {
          p_store_id: storeId,
          p_ticket_number: task.ticket,
          p_payment_method: 'tarjeta',
          p_cash_given: null,
          p_items: task.items,
          p_register_id: null,
        });
        const dur = performance.now() - t0;
        return {
          ...task,
          success: !saleError && saleData?.success === true,
          error: saleError?.message || (saleData?.success ? null : JSON.stringify(saleData)),
          errorCode: saleError?.code || null,
          duration: dur,
        };
      })
    );
    const tRoundSecC = (performance.now() - tStartRoundC) / 1000;

    let roundSuccessC = 0;
    let roundDeadlocksC = 0;
    const roundStockErrorsC = [];
    const roundOtherErrorsC = [];
    const roundLatenciesC = [];

    for (const r of roundResultsC) {
      roundLatenciesC.push(r.duration);
      if (r.success) {
        roundSuccessC++;
      } else {
        const isDeadlock = r.errorCode === '40P01' || (r.error && r.error.includes('deadlock'));
        const isStockError = Boolean(r.error && r.error.includes('Stock insuficiente'));

        if (isDeadlock) {
          roundDeadlocksC++;
        } else if (isStockError) {
          roundStockErrorsC.push(r.error);
        } else {
          roundOtherErrorsC.push(`Venta ${r.orderDesc} (${r.ticket}): ${r.error} (código: ${r.errorCode})`);
        }
      }
    }

    totalCrossSuccess += roundSuccessC;
    const statsRoundC = calcStats(roundLatenciesC);

    // Verificar stock final de X e Y
    const { data: checkX } = await supabase
      .from('products')
      .select('stock, units_sold')
      .eq('id', prodX.id)
      .single();
    const { data: checkY } = await supabase
      .from('products')
      .select('stock, units_sold')
      .eq('id', prodY.id)
      .single();

    const finalStockX = Number(checkX?.stock);
    const finalStockY = Number(checkY?.stock);
    const expectedCrossStock = crossInitialStock - 40; // 960

    console.log(`📊 Métricas Ronda ${round}:`);
    console.log(`   Éxitos             : ${roundSuccessC} (Esperados: 40)`);
    console.log(`   Deadlocks (40P01)  : ${roundDeadlocksC} (Esperados: 0)`);
    console.log(`   Rechazos stock     : ${roundStockErrorsC.length} (Esperados: 0)`);
    console.log(`   Otros errores      : ${roundOtherErrorsC.length}`);
    console.log(`   Stock final Prod X : ${finalStockX} (Esperado: ${expectedCrossStock})`);
    console.log(`   Stock final Prod Y : ${finalStockY} (Esperado: ${expectedCrossStock})`);
    console.log(`   Latencias          : p50 = ${statsRoundC.p50.toFixed(1)} ms | p95 = ${statsRoundC.p95.toFixed(1)} ms | Máx = ${statsRoundC.max.toFixed(1)} ms`);
    console.log(`   Tiempo total ronda : ${tRoundSecC.toFixed(2)} s`);

    if (roundDeadlocksC > 0) {
      console.error(`   🚨 Se detectaron ${roundDeadlocksC} deadlocks en Ronda ${round}.`);
    }
    if (roundOtherErrorsC.length > 0) {
      console.error('   ⚠️ Otros errores en Ronda:');
      roundOtherErrorsC.forEach(e => console.error(`      - ${e}`));
    }

    // Evaluación de la ronda
    let roundPassedC = true;
    if (roundSuccessC !== 40) {
      roundPassedC = false;
      failureReasonsC.push(`Ronda ${round}: Éxitos fueron ${roundSuccessC} en vez de 40.`);
    }
    if (roundDeadlocksC !== 0) {
      roundPassedC = false;
      failureReasonsC.push(`Ronda ${round}: Hubo ${roundDeadlocksC} deadlocks.`);
    }
    if (finalStockX !== expectedCrossStock || finalStockY !== expectedCrossStock) {
      roundPassedC = false;
      failureReasonsC.push(`Ronda ${round}: Stock final incorrecto (X=${finalStockX}, Y=${finalStockY}, esperado=${expectedCrossStock}).`);
    }

    if (roundPassedC) {
      console.log(`   ✅ Ronda ${round} PASÓ.`);
    } else {
      console.log(`   ❌ Ronda ${round} FALLÓ.`);
      scenarioCPassed = false;
    }
  }

  const timeCEnd = getLocalIsoString();
  console.log(`⏰ Fin Escenario C: ${timeCEnd}`);

  summaryResults.push({
    escenario: 'C) Orden cruzado (3 rondas, anti-deadlock)',
    estado: scenarioCPassed ? 'PASA' : 'FALLA',
    detalle: scenarioCPassed
      ? `3 rondas superadas. Intentos: ${totalCrossAttempted}, Éxitos: ${totalCrossSuccess} (40/40 por ronda, 0 deadlocks, FOR UPDATE validado).`
      : `Fallaron rondas. Intentos: ${totalCrossAttempted}, Éxitos: ${totalCrossSuccess}. Motivo: ${failureReasonsC.join(' ')}`,
  });

  // ==========================================================================
  // TABLA RESUMEN FINAL
  // ==========================================================================
  console.log('\n' + '='.repeat(75));
  console.log('🏁 RESUMEN GENERAL DE PRUEBAS DE CONCURRENCIA');
  console.log('='.repeat(75));
  console.log(
    '   Escenario'.padEnd(46) +
    'Estado'.padEnd(12) +
    'Detalle'
  );
  console.log('   ' + '-'.repeat(72));

  let allPassed = true;
  for (const s of summaryResults) {
    const estadoFormatted =
      s.estado === 'PASA' ? `\x1b[32m${s.estado.padEnd(8)}\x1b[0m` : `\x1b[31m${s.estado.padEnd(8)}\x1b[0m`;
    console.log(`   ${s.escenario.padEnd(42)} ${estadoFormatted}   ${s.detalle}`);
    if (s.estado !== 'PASA') allPassed = false;
  }
  console.log('   ' + '-'.repeat(72));

  if (allPassed) {
    console.log('\n🎉 TODOS LOS ESCENARIOS DE CONCURRENCIA COMPLETARON EXITOSAMENTE (PASA).');
  } else {
    console.log('\n⚠️ SE DETECTARON FALLOS EN LAS PRUEBAS DE CONCURRENCIA.');
  }

  console.log('\n📌 Recordatorio: Todos los productos y ventas generados residen en:');
  console.log(`   "${TARGET_STORE_NAME}" (ID: ${storeId})`);
  console.log('🧹 Para eliminarlos junto a toda la tienda de pruebas, ejecuta:');
  console.log('   node --env-file=.env.test scripts/perf-seed-volume.mjs --cleanup\n');
  console.log('='.repeat(75));
}

main().catch(err => {
  console.error('\n💥 Error no controlado en la ejecución de concurrencia:');
  console.error(err?.message || err);
  process.exit(1);
});
