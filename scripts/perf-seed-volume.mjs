#!/usr/bin/env node
/**
 * scripts/perf-seed-volume.mjs
 *
 * Script de generación de volumen masivo (1,200 productos y 2,000 ventas)
 * y medición de latencias bajo concurrencia para pruebas de escalabilidad.
 *
 * Uso:
 *   node --env-file=.env.test scripts/perf-seed-volume.mjs
 *   node --env-file=.env.test scripts/perf-seed-volume.mjs --products=1200 --sales=2000 --concurrency=5
 *   node --env-file=.env.test scripts/perf-seed-volume.mjs --cleanup
 */

import { createClient } from '@supabase/supabase-js';
import { performance } from 'node:perf_hooks';
import { Buffer } from 'node:buffer';

// ============================================================================
// 1. Constantes y Guardia de Seguridad
// ============================================================================
const TARGET_STORE_NAME = 'PRUEBAS-VOLUMEN';
let activeStoreId = null; // Para reporte en caso de error fatal

/**
 * Imprime instrucciones de limpieza cuando ocurre un error fatal con tienda ya creada
 */
function printCleanupHelp(storeId) {
  const idToPrint = storeId || activeStoreId;
  if (idToPrint) {
    console.error(`\n📌 Tienda afectada: "${TARGET_STORE_NAME}" (ID: ${idToPrint})`);
    console.error('🧹 Para limpiar la tienda y todos sus datos generados, ejecuta:');
    console.error('   node --env-file=.env.test scripts/perf-seed-volume.mjs --cleanup\n');
  }
}

/**
 * Guardia estricta: todo crear o borrar exige que el nombre sea EXACTAMENTE "PRUEBAS-VOLUMEN"
 */
function assertAllowedStoreName(storeName, context = '') {
  if (storeName !== TARGET_STORE_NAME) {
    throw new Error(
      `🚨 GUARDIA DE SEGURIDAD ABORTADA (${context}): Operación no permitida sobre "${storeName}". ` +
      `Este script SOLO puede crear o eliminar la tienda "${TARGET_STORE_NAME}".`
    );
  }
}

// ============================================================================
// 2. Procesamiento de Argumentos CLI
// ============================================================================
function parseArgs(args) {
  const options = {
    products: 1200,
    sales: 2000,
    concurrency: 5,
    cleanup: false,
  };

  for (const arg of args) {
    if (arg === '--cleanup') {
      options.cleanup = true;
    } else if (arg.startsWith('--products=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val) && val > 0) options.products = val;
    } else if (arg.startsWith('--sales=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val) && val >= 0) options.sales = val;
    } else if (arg.startsWith('--concurrency=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val) && val > 0) options.concurrency = val;
    }
  }

  return options;
}

// ============================================================================
// 3. Funciones Estadísticas
// ============================================================================
function calcStats(numbers) {
  if (!numbers || numbers.length === 0) {
    return { min: 0, max: 0, median: 0, p95: 0, avg: 0 };
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = sorted.reduce((sum, n) => sum + n, 0) / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = sorted[p95Index];
  return { min, max, median, p95, avg };
}

// ============================================================================
// 4. Pool de Concurrencia con Detección de Fallos Consecutivos
// ============================================================================
async function runWorkerPool(tasks, concurrency, workerFn) {
  let currentIndex = 0;
  const results = new Array(tasks.length);
  let consecutiveFailures = 0;
  let aborted = false;
  let abortError = null;

  async function worker() {
    while (currentIndex < tasks.length && !aborted) {
      const idx = currentIndex++;
      const task = tasks[idx];

      const res = await workerFn(task, idx);
      results[idx] = res;

      if (!res.success) {
        consecutiveFailures++;
        if (consecutiveFailures >= 10 && !aborted) {
          aborted = true;
          abortError = new Error(`Se alcanzaron 10 fallos consecutivos en ventas (último error: ${res.error})`);
        }
      } else {
        consecutiveFailures = 0;
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
// 5. Paginación de Productos para Verificación Completa
// ============================================================================
async function fetchAllProducts(supabase, storeId) {
  const allProducts = [];
  const pageSize = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('products')
      .select('id, name, stock, units_sold, sales_count')
      .eq('store_id', storeId)
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Error al paginar productos (rango ${from}-${to}): ${error.message}`);
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allProducts.push(...data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
      }
    }
  }

  return allProducts;
}

// ============================================================================
// 6. Flujo Principal
// ============================================================================
async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log('='.repeat(70));
  console.log('⚡ SCRIPT DE PRUEBAS DE VOLUMEN Y ESCALABILIDAD — RENTABILL');
  console.log('='.repeat(70));
  console.log(`🎯 Tienda Destino : "${TARGET_STORE_NAME}"`);
  console.log(`📦 Productos      : ${options.products}`);
  console.log(`🧾 Ventas         : ${options.sales}`);
  console.log(`🔄 Concurrencia   : ${options.concurrency}`);
  console.log(`🧹 Modo Cleanup   : ${options.cleanup ? 'SÍ (borrar y salir)' : 'NO'}`);
  console.log('='.repeat(70));

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
    console.error('   node --env-file=.env.test scripts/perf-seed-volume.mjs [opciones]\n');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  console.log('\n[Paso 1] Autenticando usuario de pruebas...');
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
  // Verificar existencia de la tienda "PRUEBAS-VOLUMEN"
  // --------------------------------------------------------------------------
  console.log(`\n[Paso 2] Comprobando existencia de la tienda "${TARGET_STORE_NAME}"...`);
  const { data: existingStore, error: searchError } = await supabase
    .from('stores')
    .select('id, name')
    .eq('name', TARGET_STORE_NAME)
    .maybeSingle();

  if (searchError) {
    console.error('❌ Error al consultar tiendas:', searchError.message);
    process.exit(1);
  }

  // Si se solicitó --cleanup
  if (options.cleanup) {
    if (!existingStore) {
      console.log(`ℹ️ La tienda "${TARGET_STORE_NAME}" no existe. Nada que limpiar.`);
      process.exit(0);
    }

    assertAllowedStoreName(existingStore.name, 'cleanup');
    console.log(`🧹 Eliminando tienda "${existingStore.name}" (ID: ${existingStore.id})...`);
    const { error: delError } = await supabase
      .from('stores')
      .delete()
      .eq('id', existingStore.id);

    if (delError) {
      console.error(`❌ Error al eliminar la tienda: ${delError.message}`);
      process.exit(1);
    }

    console.log(`✅ Tienda "${TARGET_STORE_NAME}" eliminada correctamente en cascada.`);
    process.exit(0);
  }

  // Si ya existe y NO es cleanup: ABORTAR
  if (existingStore) {
    console.error(`\n❌ LA TIENDA "${TARGET_STORE_NAME}" YA EXISTE (ID: ${existingStore.id}).`);
    console.error('Para evitar sobreescritura accidental o mezcla de métricas, debes limpiarla primero ejecutando:');
    console.error('   node --env-file=.env.test scripts/perf-seed-volume.mjs --cleanup\n');
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Crear tienda nueva "PRUEBAS-VOLUMEN"
  // --------------------------------------------------------------------------
  console.log(`\n[Paso 3] Creando tienda "${TARGET_STORE_NAME}"...`);
  assertAllowedStoreName(TARGET_STORE_NAME, 'create_store');

  // stores.type CHECK: ('Abarrotes', 'Ropa', 'Farmacia', 'Ferretería', 'Otro')
  const { data: createData, error: createError } = await supabase.rpc('create_store', {
    name: TARGET_STORE_NAME,
    type: 'Abarrotes',
    currency: 'PEN',
  });

  if (createError) {
    console.error(`❌ Error en create_store: ${createError.message}`);
    process.exit(1);
  }

  const storeId = createData?.id || createData?.store_id;
  if (!storeId) {
    console.error('❌ create_store no devolvió un ID válido:', createData);
    process.exit(1);
  }
  activeStoreId = storeId;
  console.log(`✅ Tienda creada con éxito: "${TARGET_STORE_NAME}" (ID: ${storeId})`);

  // Obtener categoría "General" generada automáticamente por create_store
  const { data: catData, error: catError } = await supabase
    .from('categories')
    .select('id, name')
    .eq('store_id', storeId)
    .limit(1)
    .maybeSingle();

  if (catError || !catData?.id) {
    console.error('❌ Error al obtener categoría por defecto:', catError?.message);
    printCleanupHelp(storeId);
    process.exit(1);
  }
  const categoryId = catData.id;
  console.log(`📁 Categoría por defecto: "${catData.name}" (${categoryId})`);

  // Verificar caja registradora activa creada automáticamente (o null si no hay)
  const { data: registerData } = await supabase
    .from('cash_registers')
    .select('id, name, is_active')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  // Si no se encuentra caja activa, se usa null; process_sale la autocrea automáticamente
  const registerId = registerData?.id || null;
  if (registerId) {
    console.log(`💳 Caja registradora activa detectada: "${registerData.name}" (${registerId})`);
  } else {
    console.log('💳 No se detectó caja activa previa: se usará p_register_id = null (process_sale la creará automáticamente)');
  }

  // --------------------------------------------------------------------------
  // Crear productos en lotes de 100
  // --------------------------------------------------------------------------
  console.log(`\n[Paso 4] Generando e insertando ${options.products} productos en lotes de 100...`);
  const chunkSize = 100;
  const totalChunks = Math.ceil(options.products / chunkSize);
  const insertedProducts = []; // Para registrar { id, name, initialStock }
  const insertedProductsMap = new Map(); // id => { id, name, initialStock }
  const productInsertTimes = [];

  for (let c = 0; c < totalChunks; c++) {
    const startIdx = c * chunkSize + 1;
    const endIdx = Math.min((c + 1) * chunkSize, options.products);
    const chunk = [];

    for (let i = startIdx; i <= endIdx; i++) {
      const pad = String(i).padStart(4, '0');
      const name = `PERF_VOL_${pad}`;
      const barcode = `BAR_VOL_${pad}`;
      const sku = `SKU_VOL_${pad}`;
      const cost = Number((1.00 + Math.random() * 49.00).toFixed(2)); // Costo 1.00 a 50.00
      const margin = 0.20 + Math.random() * 0.60; // Margen 20% a 80%
      const price = Number((cost * (1 + margin)).toFixed(2));
      const initialStock = Math.floor(500 + Math.random() * 1500); // Stock 500 a 2000

      // unit CHECK: ('pza', 'kg', 'lt', 'caja')
      chunk.push({
        store_id: storeId,
        category_id: categoryId,
        name,
        barcode,
        sku,
        unit: 'pza',
        cost_price: cost,
        sale_price: price,
        stock: initialStock,
        reorder_point: 10,
        estimated_speed: 'NORMAL',
        units_sold: 0,
        sales_count: 0,
        image_url: null,
      });
    }

    const t0 = performance.now();
    const { data: insData, error: insError } = await supabase
      .from('products')
      .insert(chunk)
      .select('id, name, stock');
    const dur = performance.now() - t0;
    productInsertTimes.push(dur);

    if (insError) {
      console.error(`❌ Error al insertar lote ${c + 1}/${totalChunks}: ${insError.message}`);
      printCleanupHelp(storeId);
      process.exit(1);
    }

    insData.forEach(p => {
      const record = {
        id: p.id,
        name: p.name,
        initialStock: Number(p.stock),
      };
      insertedProducts.push(record);
      insertedProductsMap.set(p.id, record);
    });

    console.log(`   Lote ${c + 1}/${totalChunks} (${insData.length} productos): ${dur.toFixed(1)} ms`);
  }

  const prodStats = calcStats(productInsertTimes);
  console.log(`✅ ${insertedProducts.length} productos insertados en total.`);
  console.log(`   Latencia lotes: Mediana=${prodStats.median.toFixed(1)} ms, P95=${prodStats.p95.toFixed(1)} ms`);

  // Registro en memoria de unidades vendidas por producto (solo ventas exitosas)
  const scriptSoldByProductId = new Map();

  function recordSaleSuccess(items) {
    for (const item of items) {
      const current = scriptSoldByProductId.get(item.productId) || 0;
      scriptSoldByProductId.set(item.productId, current + item.quantity);
    }
  }

  // --------------------------------------------------------------------------
  // Venta de Humo
  // --------------------------------------------------------------------------
  console.log('\n[Paso 5] Ejecutando VENTA DE HUMO previa...');
  const smokeProd = insertedProducts[0];
  const smokeItems = [{ productId: smokeProd.id, quantity: 1 }];
  const smokeTicket = `TKT-SMOKE-${Date.now().toString(36).toUpperCase()}`;

  const { data: smokeData, error: smokeError } = await supabase.rpc('process_sale', {
    p_store_id: storeId,
    p_ticket_number: smokeTicket,
    p_payment_method: 'tarjeta',
    p_cash_given: null,
    p_items: smokeItems,
    p_register_id: registerId,
  });

  if (smokeError || !smokeData?.success) {
    console.error('❌ FALLÓ LA VENTA DE HUMO:');
    console.error('   Error Supabase RPC:', smokeError?.message || smokeError);
    console.error('   Respuesta recibida:', smokeData);
    printCleanupHelp(storeId);
    process.exit(1);
  }

  recordSaleSuccess(smokeItems);
  console.log(`✅ Venta de humo exitosa (Ticket: ${smokeData.ticket_number || smokeTicket}, ID: ${smokeData.sale_id}).`);

  // --------------------------------------------------------------------------
  // Generar Ventas Concurrentes con process_sale
  // --------------------------------------------------------------------------
  console.log(`\n[Paso 6] Generando ${options.sales} ventas con concurrencia ${options.concurrency}...`);
  const salesTasks = Array.from({ length: options.sales }, (_, i) => i + 1);
  const saleLatencies = [];
  let successSales = 1; // Incluyendo la venta de humo
  let failedSales = 0;
  let completedCount = 0;
  const progressStep = Math.max(1, Math.floor(options.sales / 10));

  const tSalesStart = performance.now();

  try {
    await runWorkerPool(salesTasks, options.concurrency, async (saleIndex) => {
      // Seleccionar entre 1 y 4 productos aleatorios distintos
      const itemCount = Math.min(insertedProducts.length, Math.floor(1 + Math.random() * 4));
      const chosenIndices = new Set();
      while (chosenIndices.size < itemCount) {
        chosenIndices.add(Math.floor(Math.random() * insertedProducts.length));
      }

      const items = Array.from(chosenIndices).map(idx => {
        const prod = insertedProducts[idx];
        const qty = Math.floor(1 + Math.random() * 3); // 1 a 3 unidades
        return {
          productId: prod.id,
          quantity: qty,
        };
      });

      const ticketNumber = `TKT-VOL-${String(saleIndex).padStart(6, '0')}`;

      const t0 = performance.now();
      const { data: saleData, error: saleError } = await supabase.rpc('process_sale', {
        p_store_id: storeId,
        p_ticket_number: ticketNumber,
        p_payment_method: 'tarjeta',
        p_cash_given: null,
        p_items: items,
        p_register_id: registerId,
      });
      const dur = performance.now() - t0;

      saleLatencies.push(dur);
      completedCount++;

      const isSuccess = !saleError && saleData?.success === true;

      if (!isSuccess) {
        failedSales++;
        const errMsg = saleError?.message || JSON.stringify(saleData);
        if (failedSales <= 5) {
          console.error(`   ⚠️ Venta #${saleIndex} falló:`, errMsg);
        }
        return { success: false, error: errMsg, duration: dur };
      }

      successSales++;
      recordSaleSuccess(items);

      if (completedCount % progressStep === 0 || completedCount === options.sales) {
        const percent = ((completedCount / options.sales) * 100).toFixed(0);
        const intermediateStats = calcStats(saleLatencies);
        console.log(
          `   Progreso: ${completedCount}/${options.sales} (${percent}%) | ` +
          `Éxito: ${successSales} | Fallos: ${failedSales} | ` +
          `Mediana: ${intermediateStats.median.toFixed(1)} ms | P95: ${intermediateStats.p95.toFixed(1)} ms`
        );
      }

      return { success: true, duration: dur };
    });
  } catch (poolErr) {
    console.error(`\n❌ ERROR EN EL PROCESAMIENTO DE VENTAS: ${poolErr.message}`);
    printCleanupHelp(storeId);
    process.exit(1);
  }

  const totalSalesTime = performance.now() - tSalesStart;
  const overallSaleStats = calcStats(saleLatencies);

  console.log(`\n📊 RESULTADOS DE PROCESAMIENTO DE VENTAS:`);
  console.log(`   Total Ventas Solicitadas: ${options.sales} (+ 1 humo)`);
  console.log(`   Ventas Exitosas Totales  : ${successSales}`);
  console.log(`   Ventas Fallidas          : ${failedSales}`);
  console.log(`   Tiempo Lote Ventas       : ${(totalSalesTime / 1000).toFixed(2)} s`);
  console.log(`   Rendimiento Efectivo     : ${(successSales / (totalSalesTime / 1000)).toFixed(1)} ventas/seg`);
  console.log(`   Latencia Mínima          : ${overallSaleStats.min.toFixed(1)} ms`);
  console.log(`   Latencia Mediana         : ${overallSaleStats.median.toFixed(1)} ms`);
  console.log(`   Latencia P95             : ${overallSaleStats.p95.toFixed(1)} ms`);
  console.log(`   Latencia Máxima          : ${overallSaleStats.max.toFixed(1)} ms`);

  // --------------------------------------------------------------------------
  // Verificación Independiente Completa (Paginada)
  // --------------------------------------------------------------------------
  console.log(`\n[Paso 7] Verificación independiente completa (paginada con .range)...`);

  // Conteo total de ventas en BD
  const { count: dbSalesCount, error: countSaleError } = await supabase
    .from('sales')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', storeId);

  if (countSaleError) {
    console.error('❌ Error al contar ventas en BD:', countSaleError.message);
  } else {
    console.log(`   Total ventas registradas en BD: ${dbSalesCount} (Esperadas: ${successSales})`);
  }

  // Traer TODOS los productos de la tienda con paginación
  let allDbProducts = [];
  try {
    allDbProducts = await fetchAllProducts(supabase, storeId);
    console.log(`   Total productos recuperados de BD: ${allDbProducts.length} (Esperados: ${options.products})`);
  } catch (fetchErr) {
    console.error('❌ Error al recuperar todos los productos:', fetchErr.message);
    printCleanupHelp(storeId);
    process.exit(1);
  }

  let matches = 0;
  let discrepancies = 0;
  const topDiscrepancies = [];

  for (const dbP of allDbProducts) {
    const memP = insertedProductsMap.get(dbP.id);
    if (!memP) {
      discrepancies++;
      if (topDiscrepancies.length < 10) {
        topDiscrepancies.push({
          name: dbP.name,
          reason: 'No encontrado en memoria local del script',
        });
      }
      continue;
    }

    const scriptSold = scriptSoldByProductId.get(dbP.id) || 0;
    const expectedStock = memP.initialStock - scriptSold;
    const actualStock = Number(dbP.stock);
    const actualUnitsSold = Number(dbP.units_sold);

    const stockMatches = Math.abs(expectedStock - actualStock) < 0.001;
    const unitsSoldMatches = Math.abs(scriptSold - actualUnitsSold) < 0.001;

    if (stockMatches && unitsSoldMatches) {
      matches++;
    } else {
      discrepancies++;
      if (topDiscrepancies.length < 10) {
        topDiscrepancies.push({
          name: dbP.name,
          initialStock: memP.initialStock,
          scriptSold,
          actualUnitsSold,
          expectedStock,
          actualStock,
        });
      }
    }
  }

  console.log('\n📊 RESULTADO DE LA VERIFICACIÓN DE INTEGRIDAD:');
  console.log(`   Coincidencias : ${matches} / ${allDbProducts.length} productos (${((matches / allDbProducts.length) * 100).toFixed(1)}%)`);
  console.log(`   Discrepancias : ${discrepancies} / ${allDbProducts.length} productos`);

  if (discrepancies > 0) {
    console.log('\n⚠️ Primeras 10 discrepancias encontradas:');
    console.log('   ' + '-'.repeat(90));
    console.log(
      '   Producto'.padEnd(18) +
      'Stock Ini'.padEnd(12) +
      'Vendido Script'.padEnd(17) +
      'Units Sold BD'.padEnd(16) +
      'Stock Esperado'.padEnd(16) +
      'Stock Real BD'
    );
    console.log('   ' + '-'.repeat(90));
    topDiscrepancies.forEach(d => {
      console.log(
        '   ' +
        d.name.padEnd(15) +
        String(d.initialStock).padEnd(12) +
        String(d.scriptSold).padEnd(17) +
        String(d.actualUnitsSold).padEnd(16) +
        String(d.expectedStock).padEnd(16) +
        String(d.actualStock)
      );
    });
    console.log('   ' + '-'.repeat(90));
  } else {
    console.log('   🎉 Integridad 100% verificada: stock y units_sold coinciden exactamente.');
  }

  // --------------------------------------------------------------------------
  // Benchmarks de Medición (5 repeticiones por consulta)
  // --------------------------------------------------------------------------
  console.log(`\n[Paso 8] Ejecutando Benchmarks de Medición (5 repeticiones por consulta)...`);

  const runBenchmark = async (name, queryFn) => {
    const times = [];
    let payloadSizeKb = 0;
    let rowCount = 0;

    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const res = await queryFn();
      const dur = performance.now() - t0;
      times.push(dur);

      if (i === 0) {
        if (res.data) {
          rowCount = Array.isArray(res.data) ? res.data.length : 1;
          payloadSizeKb = Buffer.byteLength(JSON.stringify(res.data)) / 1024;
        } else {
          rowCount = 0;
          payloadSizeKb = 0;
        }
      }
    }

    const stats = calcStats(times);
    return {
      name,
      medianMs: stats.median,
      p95Ms: stats.p95,
      sizeKb: payloadSizeKb,
      rowCount,
    };
  };

  // (a) product_stats completo de la tienda SIN PAGINAR (igual que la app)
  const benchA = await runBenchmark(
    'product_stats (completo sin paginar)',
    () => supabase.from('product_stats').select('*').eq('store_id', storeId)
  );

  // Verificación de truncamiento por max_rows de la API
  console.log(`\n   🔍 Verificación de filas en (a) product_stats:`);
  console.log(`      Filas devueltas : ${benchA.rowCount}`);
  console.log(`      Filas esperadas : ${options.products}`);
  if (benchA.rowCount < options.products) {
    console.log(`\x1b[31m      ⚠️ TRUNCADO: la API devolvió ${benchA.rowCount} de ${options.products}\x1b[0m`);
    console.log(`      (Causa: max_rows = 1000 en la configuración PostgREST de Supabase)`);
  } else {
    console.log(`      ✅ Sin truncamiento detectado.`);
  }

  // (b) inventory_movements con límite 100
  const benchB = await runBenchmark(
    'inventory_movements (limit 100)',
    () => supabase
      .from('inventory_movements')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(100)
  );

  // (c) Ventas con la consulta exacta de la app (limit 100)
  const benchC = await runBenchmark(
    'sales + sale_items (app query, limit 100)',
    () => supabase
      .from('sales')
      .select('*, sale_items(*)')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(100)
  );

  // (d) Conteo exacto de ventas
  const benchD = await runBenchmark(
    'sales (count exact head)',
    () => supabase
      .from('sales')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
  );

  console.log('\n📊 RESULTADOS DE BENCHMARKS (5 repeticiones):');
  console.log('   ' + '-'.repeat(80));
  console.log(
    '   Consulta'.padEnd(45) +
    'Mediana (ms)'.padEnd(16) +
    'Filas'.padEnd(10) +
    'Tamaño'
  );
  console.log('   ' + '-'.repeat(80));
  [benchA, benchB, benchC, benchD].forEach(b => {
    console.log(
      '   ' +
      b.name.padEnd(42) +
      b.medianMs.toFixed(1).padEnd(16) +
      String(b.rowCount).padEnd(10) +
      `~${b.sizeKb.toFixed(1)} kB`
    );
  });
  console.log('   ' + '-'.repeat(80));

  // --------------------------------------------------------------------------
  // Cierre y Conservación de la Tienda
  // --------------------------------------------------------------------------
  console.log('\n' + '='.repeat(70));
  console.log('🏁 PRUEBA DE VOLUMEN FINALIZADA CON ÉXITO');
  console.log('='.repeat(70));
  console.log(`📌 Tienda conservada para auditoría y pruebas:`);
  console.log(`   Nombre: "${TARGET_STORE_NAME}"`);
  console.log(`   ID    : ${storeId}`);
  console.log('\n🧹 Para eliminar la tienda de pruebas y todos sus datos generados, ejecuta:');
  console.log('   node --env-file=.env.test scripts/perf-seed-volume.mjs --cleanup\n');
  console.log('='.repeat(70));
}

main().catch(err => {
  console.error('\n💥 Error no controlado en la ejecución del benchmark:');
  console.error(err?.message || err);
  printCleanupHelp();
  process.exit(1);
});
