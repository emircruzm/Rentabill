#!/usr/bin/env node
/**
 * scripts/perf-bulk-insert.mjs
 *
 * Script de medición de rendimiento (benchmark) para comparar diferentes
 * estrategias de inserción de productos en lote dentro de una tienda de pruebas
 * en Supabase.
 *
 * Ejecución:
 *   node --env-file=.env.test scripts/perf-bulk-insert.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { performance } from 'node:perf_hooks';

// ============================================================================
// 1. Verificación de variables de entorno y conexión
// ============================================================================
const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
} = process.env;

const missingVars = [];
if (!SUPABASE_URL) missingVars.push('SUPABASE_URL');
if (!SUPABASE_ANON_KEY) missingVars.push('SUPABASE_ANON_KEY');
if (!TEST_USER_EMAIL) missingVars.push('TEST_USER_EMAIL');
if (!TEST_USER_PASSWORD) missingVars.push('TEST_USER_PASSWORD');

if (missingVars.length > 0) {
  console.error('❌ Faltan variables de entorno requeridas en .env.test:');
  missingVars.forEach(v => console.error(`   - ${v}`));
  console.error('\nEjecuta el script con:');
  console.error('   node --env-file=.env.test scripts/perf-bulk-insert.mjs\n');
  process.exit(1);
}

let hostName = 'desconocido';
try {
  hostName = new URL(SUPABASE_URL).hostname;
} catch {
  hostName = SUPABASE_URL;
}

const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

console.log('='.repeat(70));
console.log('🚀 BENCHMARK DE INSERCIÓN MASIVA DE PRODUCTOS EN SUPABASE');
console.log('='.repeat(70));
console.log(`🌐 Supabase Host : ${hostName}`);
console.log(`🔑 Modo Auth     : signInWithPassword (rol authenticated, anon key)`);
console.log(`🆔 Run ID        : ${runId}`);
console.log(`⏰ Inicio        : ${new Date().toISOString()}`);
console.log('='.repeat(70));

// Inicializar cliente Supabase solo con anon key (NUNCA service_role)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Guardias de seguridad para tiendas
function assertAllowedStoreName(storeName, context = '') {
  if (!storeName || typeof storeName !== 'string' || !storeName.startsWith('PRUEBAS-')) {
    throw new Error(
      `🚨 GUARDIA DE SEGURIDAD ABORTADA (${context}): Se intentó operar sobre una tienda no permitida: "${storeName}". ` +
      'Solo se permiten tiendas cuyo nombre inicie con "PRUEBAS-".'
    );
  }
}

// Estadísticas numéricas
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

// Generador de carga de productos
function makeProductPayload({ storeId, categoryId, runId, tag, index, stock = 5 }) {
  const indexStr = String(index).padStart(3, '0');
  const name = `PERF_TEST_${runId}_${tag}_P${indexStr}`;
  return {
    store_id: storeId,
    category_id: categoryId,
    barcode: null,
    sku: null,
    name,
    unit: 'pza',
    cost_price: 10.00,
    sale_price: 15.00,
    stock,
    reorder_point: 5,
    estimated_speed: 'NORMAL',
    units_sold: 0,
    sales_count: 0,
    image_url: null,
  };
}

// Seguimiento de tiendas creadas para limpieza
const storesToCleanup = [];

async function createTestStore(storeName) {
  assertAllowedStoreName(storeName, 'create_store');

  const { data, error } = await supabase.rpc('create_store', {
    name: storeName,
    type: 'Abarrotes',
    currency: 'PEN',
  });

  if (error) {
    throw new Error(`Error en create_store ("${storeName}"): ${error.message}`);
  }

  const storeId = data?.store_id || data?.id;
  if (!storeId) {
    throw new Error(`create_store no devolvió ID válido para "${storeName}": ${JSON.stringify(data)}`);
  }

  // Buscar category_id de la categoría "General" generada automáticamente
  const { data: catData, error: catError } = await supabase
    .from('categories')
    .select('id, name')
    .eq('store_id', storeId)
    .limit(1)
    .maybeSingle();

  if (catError || !catData?.id) {
    throw new Error(`No se pudo obtener categoría por defecto para tienda "${storeName}": ${catError?.message}`);
  }

  const storeRecord = { id: storeId, name: storeName, categoryId: catData.id };
  storesToCleanup.push(storeRecord);
  return storeRecord;
}

async function attemptDeleteStore(storeRecord) {
  assertAllowedStoreName(storeRecord.name, 'attemptDeleteStore');
  try {
    const { error } = await supabase
      .from('stores')
      .delete()
      .eq('id', storeRecord.id);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================================
// Flujo Principal
// ============================================================================
async function main() {
  // --------------------------------------------------------------------------
  // Paso 2.a: Iniciar sesión con email y contraseña
  // --------------------------------------------------------------------------
  console.log('\n[Paso 2] Autenticando usuario de pruebas...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });

  if (authError || !authData.user) {
    console.error('❌ Error de autenticación:', authError?.message || 'Usuario no encontrado');
    process.exit(1);
  }
  console.log(`✅ Sesión iniciada: ${authData.user.email} (UID: ${authData.user.id})`);

  // --------------------------------------------------------------------------
  // Paso 3: Prueba de humo (borrado en cascada con stock inicial)
  // --------------------------------------------------------------------------
  console.log('\n[Paso 3] Ejecutando prueba de humo en tienda temporal...');
  const smokeStoreName = `PRUEBAS-PERF-SMOKE-${runId}`;
  const smokeStore = await createTestStore(smokeStoreName);
  console.log(`   Tienda de humo creada: "${smokeStore.name}" (${smokeStore.id})`);

  // Insertar 1 producto con stock 5 (dispara trigger de stock inicial en inventory_movements)
  const smokeProduct = makeProductPayload({
    storeId: smokeStore.id,
    categoryId: smokeStore.categoryId,
    runId,
    tag: 'SMOKE',
    index: 1,
    stock: 5,
  });

  const { error: smokeInsertErr } = await supabase
    .from('products')
    .insert(smokeProduct);

  if (smokeInsertErr) {
    console.error('❌ Falló inserción de producto en prueba de humo:', smokeInsertErr.message);
  } else {
    console.log('   Producto de humo insertado (stock 5 -> trigger inventory_movements activado).');
  }

  // Intentar borrar la tienda de humo
  console.log('   Probando borrado en cascada de la tienda...');
  const smokeDelResult = await attemptDeleteStore(smokeStore);

  if (smokeDelResult.success) {
    console.log('   🟢 Borrado en cascada: FUNCIONÓ.');
  } else {
    console.log(`   🟠 Borrado en cascada: FALLÓ.`);
    console.log(`      Detalle error: ${smokeDelResult.error}`);
    console.log('      (Comportamiento esperado por RLS: tablas hijas como inventory_movements restringen DELETE a authenticated)');
    console.log('   -> Estrategia: el benchmark reutilizará UNA sola tienda para todas las pruebas.');
  }

  // --------------------------------------------------------------------------
  // Creación de la tienda principal del benchmark
  // --------------------------------------------------------------------------
  const benchmarkStoreName = `PRUEBAS-PERF-${runId}`;
  console.log(`\nCreando tienda de benchmark: "${benchmarkStoreName}"...`);
  const benchmarkStore = await createTestStore(benchmarkStoreName);
  console.log(`✅ Tienda creada: "${benchmarkStore.name}" (ID: ${benchmarkStore.id})`);

  // --------------------------------------------------------------------------
  // Paso 4: Latencia base (15 consultas pequeñas seguidas)
  // --------------------------------------------------------------------------
  console.log('\n[Paso 4] Midiendo latencia de red base (15 consultas consecutivas)...');
  const baseLatencies = [];
  for (let i = 1; i <= 15; i++) {
    const t0 = performance.now();
    const { error: pingErr } = await supabase
      .from('categories')
      .select('id')
      .eq('store_id', benchmarkStore.id)
      .limit(1);

    const elapsed = performance.now() - t0;
    if (pingErr) {
      console.warn(`   Consulta ${i} devolvió error:`, pingErr.message);
    }
    baseLatencies.push(elapsed);
  }

  const baseStats = calcStats(baseLatencies);
  console.log('   Resultados de latencia base (ms):');
  console.table([
    {
      Muestras: baseLatencies.length,
      'Mínimo (ms)': baseStats.min.toFixed(2),
      'Mediana (ms)': baseStats.median.toFixed(2),
      'P95 (ms)': baseStats.p95.toFixed(2),
      'Promedio (ms)': baseStats.avg.toFixed(2),
    },
  ]);

  // --------------------------------------------------------------------------
  // Paso 5 & 6: Benchmark de 60 productos & Verificación de integridad
  // --------------------------------------------------------------------------
  // Estrategias a comparar:
  // E1: 60 inserciones secuenciales (1 a 1) [stock 5]
  // E2: 1 inserción masiva de 60 filas [stock 5]
  // E3: 2 inserciones de 30 filas [stock 5]
  // E4: 1 inserción masiva de 60 filas con stock 0 (costo del trigger)
  const strategies = [
    {
      id: 'E1',
      name: 'E1 (60 secuenciales, stock 5)',
      stock: 5,
      execute: async (products) => {
        let reqs = 0;
        for (const p of products) {
          const { error } = await supabase.from('products').insert(p);
          if (error) throw error;
          reqs++;
        }
        return { requestsCount: reqs };
      },
    },
    {
      id: 'E2',
      name: 'E2 (1 lote de 60, stock 5)',
      stock: 5,
      execute: async (products) => {
        const { error } = await supabase.from('products').insert(products);
        if (error) throw error;
        return { requestsCount: 1 };
      },
    },
    {
      id: 'E3',
      name: 'E3 (2 lotes de 30, stock 5)',
      stock: 5,
      execute: async (products) => {
        const batch1 = products.slice(0, 30);
        const batch2 = products.slice(30);

        const { error: err1 } = await supabase.from('products').insert(batch1);
        if (err1) throw err1;

        const { error: err2 } = await supabase.from('products').insert(batch2);
        if (err2) throw err2;

        return { requestsCount: 2 };
      },
    },
    {
      id: 'E4',
      name: 'E4 (1 lote de 60, stock 0)',
      stock: 0,
      execute: async (products) => {
        const { error } = await supabase.from('products').insert(products);
        if (error) throw error;
        return { requestsCount: 1 };
      },
    },
  ];

  console.log('\n[Paso 5 & 6] Iniciando benchmark (60 productos por corrida, 3 iteraciones por estrategia)...');
  const allResults = [];
  const integrityReports = [];

  for (const strat of strategies) {
    console.log(`\n▶ Ejecutando ${strat.name}...`);
    const stratLatencies = [];
    let requestsCount = 0;

    for (let iter = 1; iter <= 3; iter++) {
      const tag = `${strat.id}_IT${iter}`;

      // Generar 60 productos
      const products = Array.from({ length: 60 }, (_, idx) =>
        makeProductPayload({
          storeId: benchmarkStore.id,
          categoryId: benchmarkStore.categoryId,
          runId,
          tag,
          index: idx + 1,
          stock: strat.stock,
        })
      );

      // Medir ejecución
      const t0 = performance.now();
      const execResult = await strat.execute(products);
      const totalElapsed = performance.now() - t0;

      stratLatencies.push(totalElapsed);
      requestsCount = execResult.requestsCount;

      console.log(`   Iteración ${iter}/3: ${totalElapsed.toFixed(2)} ms (${(totalElapsed / 60).toFixed(2)} ms/producto)`);

      // ----------------------------------------------------------------------
      // Paso 6: Verificación de integridad tras cada corrida
      // ----------------------------------------------------------------------
      const { data: insertedProds, error: fetchErr } = await supabase
        .from('products')
        .select('id, name, cost_price, sale_price, stock')
        .eq('store_id', benchmarkStore.id)
        .like('name', `PERF_TEST_${runId}_${tag}_%`);

      let integrityOk = true;
      const issues = [];

      if (fetchErr) {
        integrityOk = false;
        issues.push(`Error consultando productos: ${fetchErr.message}`);
      } else if (!insertedProds || insertedProds.length !== 60) {
        integrityOk = false;
        issues.push(`Esperados 60 productos, encontrados ${insertedProds?.length || 0}`);
      } else {
        // Verificar duplicados
        const namesSet = new Set(insertedProds.map(p => p.name));
        if (namesSet.size !== 60) {
          integrityOk = false;
          issues.push(`Hay nombres duplicados (${namesSet.size} únicos de 60)`);
        }

        // Verificar precios y stock
        for (const p of insertedProds) {
          if (Number(p.cost_price) !== 10 || Number(p.sale_price) !== 15) {
            integrityOk = false;
            issues.push(`Precios incorrectos en producto ${p.name}`);
            break;
          }
          if (Number(p.stock) !== strat.stock) {
            integrityOk = false;
            issues.push(`Stock incorrecto en producto ${p.name} (esperado ${strat.stock}, actual ${p.stock})`);
            break;
          }
        }
      }

      // Verificar movimientos de stock inicial
      const expectedMovements = strat.stock > 0 ? 60 : 0;
      const { data: movements, error: movErr } = await supabase
        .from('inventory_movements')
        .select('id, product_name, note, quantity')
        .eq('store_id', benchmarkStore.id)
        .like('product_name', `PERF_TEST_${runId}_${tag}_%`);

      if (movErr) {
        integrityOk = false;
        issues.push(`Error consultando movimientos: ${movErr.message}`);
      } else if (!movements || movements.length !== expectedMovements) {
        integrityOk = false;
        issues.push(`Esperados ${expectedMovements} movimientos 'Stock inicial', encontrados ${movements?.length || 0}`);
      } else if (strat.stock > 0) {
        const invalidNote = movements.find(m => m.note !== 'Stock inicial' || Number(m.quantity) !== 5);
        if (invalidNote) {
          integrityOk = false;
          issues.push(`Movimiento inválido: note="${invalidNote.note}", quantity=${invalidNote.quantity}`);
        }
      }

      integrityReports.push({
        Estrategia: strat.name,
        Iteración: iter,
        Resultado: integrityOk ? '🟢 OK' : '🔴 FALLA',
        Detalle: issues.length > 0 ? issues.join('; ') : '60 productos y movimientos íntegros',
      });
    }

    const stratStats = calcStats(stratLatencies);
    allResults.push({
      Estrategia: strat.name,
      'Peticiones HTTP': requestsCount,
      'Productos': 60,
      'Mediana Total (ms)': stratStats.median.toFixed(2),
      'Mediana ms/prod': (stratStats.median / 60).toFixed(2),
      'Min (ms)': stratStats.min.toFixed(2),
      'Max (ms)': stratStats.max.toFixed(2),
      'Promedio (ms)': stratStats.avg.toFixed(2),
    });
  }

  // --------------------------------------------------------------------------
  // Tablas de Resultados Finales
  // --------------------------------------------------------------------------
  console.log('\n' + '='.repeat(70));
  console.log('📊 RESULTADOS DEL BENCHMARK (60 PRODUCTOS, 3 ITERACIONES)');
  console.log('='.repeat(70));
  console.table(allResults);

  console.log('\n' + '='.repeat(70));
  console.log('🛡️ RESULTADOS DE VERIFICACIÓN DE INTEGRIDAD');
  console.log('='.repeat(70));
  console.table(integrityReports);

  const triggerOverheadMs =
    Number(allResults.find(r => r.Estrategia.startsWith('E2'))?.['Mediana Total (ms)'] || 0) -
    Number(allResults.find(r => r.Estrategia.startsWith('E4'))?.['Mediana Total (ms)'] || 0);

  console.log('\n💡 OBSERVACIONES CLAVE:');
  console.log(`   - Comparativa E1 (secuencial) vs E2 (1 lote):`);
  const e1Med = Number(allResults.find(r => r.Estrategia.startsWith('E1'))?.['Mediana Total (ms)'] || 1);
  const e2Med = Number(allResults.find(r => r.Estrategia.startsWith('E2'))?.['Mediana Total (ms)'] || 1);
  const speedup = (e1Med / e2Med).toFixed(1);
  console.log(`     Inserción masiva en 1 lote es ~${speedup}x más rápida que 60 llamadas secuenciales.`);
  console.log(`   - Costo estimado del trigger 'Stock inicial' (E2 vs E4):`);
  console.log(`     Sobrecosto del trigger para 60 productos: ~${triggerOverheadMs.toFixed(2)} ms (~${(triggerOverheadMs / 60).toFixed(2)} ms por producto).`);
}

// ============================================================================
// Paso 7: Limpieza final (garantizada en bloque de salida)
// ============================================================================
async function cleanup() {
  console.log('\n[Paso 7] Ejecutando limpieza...');
  for (const store of storesToCleanup) {
    console.log(`   Intentando eliminar tienda "${store.name}" (${store.id})...`);
    const delRes = await attemptDeleteStore(store);
    if (delRes.success) {
      console.log(`   🟢 Tienda "${store.name}" eliminada exitosamente.`);
    } else {
      console.log(`   ⚠️ No se pudo eliminar tienda "${store.name}" por RLS (${delRes.error}).`);
      console.log(`      -> TIENDA DE PRUEBAS REGISTRADA: "${store.name}" (ID: ${store.id})`);
    }
  }
}

// Ejecutar main con manejo de errores y limpieza
main()
  .catch((err) => {
    console.error('\n❌ ERROR FATAL DURANTE LA EJECUCIÓN:');
    console.error(err);
  })
  .finally(async () => {
    await cleanup();
    console.log('\n🏁 Benchmark finalizado.');
  });
