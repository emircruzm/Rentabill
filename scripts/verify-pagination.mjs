#!/usr/bin/env node
/**
 * scripts/verify-pagination.mjs
 *
 * Verificación exhaustiva de la función pura fetchAllPages y helpers de paginación.
 * Prueba límites de filas, bordes exactos (1000), topes de servidor dinámicos (500),
 * fallos de red en cualquier página, inserciones concurrentes (reintento e inconsistencia),
 * modo de respaldo secuencial ante count ausente, detección de conteos inconsistentes
 * y ordenamiento determinista por created_at descendente con desempate por id.
 */

import {
  fetchAllPages,
  InconsistentPaginationError,
  sortRowsByCreatedAtDesc,
} from '../src/shared/utils/pagination.ts';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FALLÓ: ${message}`);
  }
}

/**
 * Crea un mock del servidor con límite de filas por respuesta, control de fallos y conteo configurable.
 */
function createMockServer({
  count,
  serverMaxRows = 1000,
  failOnCall = null,
  onCall = null,
  countOverride = undefined,
  itemsGenerator = null,
}) {
  const items = itemsGenerator
    ? itemsGenerator(count)
    : Array.from({ length: count }, (_, i) => ({
        id: `prod_${String(i).padStart(6, '0')}`,
        name: `Producto de Prueba ${i + 1}`,
      }));

  const calls = [];

  const fetchPage = async (from, to) => {
    const callIndex = calls.length;
    calls.push({ from, to });

    if (onCall) {
      onCall(from, to, callIndex, items);
    }

    if (failOnCall && failOnCall(from, to, callIndex)) {
      throw new Error(`Fallo simulado en rango [${from}, ${to}] (llamada #${callIndex})`);
    }

    const requested = items.slice(from, to + 1);
    const returned = requested.slice(0, serverMaxRows);

    const resolvedCount = countOverride !== undefined
      ? (typeof countOverride === 'function' ? countOverride(callIndex, returned) : countOverride)
      : items.length;

    return {
      rows: returned,
      count: resolvedCount,
    };
  };

  return { items, calls, fetchPage };
}

async function runTests() {
  console.log('--- Verificación de Paginación Pura: fetchAllPages ---\n');

  // ==========================================================================
  // Suite 1: Casos estándar con tope de 1000 filas (servidor Supabase real)
  // ==========================================================================
  console.log('1. Casos estándar con límite de 1000 filas por petición:');

  const testCounts = [0, 1, 999, 1000, 1001, 2500, 5000];

  for (const count of testCounts) {
    const server = createMockServer({ count, serverMaxRows: 1000 });
    let pageEvents = 0;

    const result = await fetchAllPages(server.fetchPage, {
      onPageFetched: () => { pageEvents++; },
    });

    assert(
      result.length === count,
      `${count} productos: debe devolver exactamente ${count} filas (obtenidas: ${result.length})`
    );

    const uniqueIds = new Set(result.map(r => r.id));
    assert(
      uniqueIds.size === count,
      `${count} productos: cero duplicados (únicos: ${uniqueIds.size})`
    );

    if (count <= 1000) {
      assert(
        server.calls.length === 1,
        `${count} productos (<= 1000): debe resolver en exactamente 1 sola petición HTTP (llamadas: ${server.calls.length})`
      );
    } else {
      const expectedPages = Math.ceil(count / 1000);
      assert(
        server.calls.length === expectedPages,
        `${count} productos: debe paginar en ${expectedPages} peticiones (llamadas: ${server.calls.length})`
      );
    }

    assert(
      pageEvents === server.calls.length,
      `${count} productos: onPageFetched se ejecutó tantas veces como peticiones (${pageEvents})`
    );
  }

  // ==========================================================================
  // Suite 2: Tope de servidor dinámico (menor a 1000, ej. 500 filas)
  // ==========================================================================
  console.log('\n2. Servidor con tope menor a 1000 (ej. 500 filas por petición):');

  const countsWith500 = [0, 500, 501, 1200, 2500];

  for (const count of countsWith500) {
    const server = createMockServer({ count, serverMaxRows: 500 });
    const result = await fetchAllPages(server.fetchPage);

    assert(
      result.length === count,
      `Tope 500 (${count} productos): devuelve exactamente ${count} filas (obtenidas: ${result.length})`
    );

    const uniqueIds = new Set(result.map(r => r.id));
    assert(
      uniqueIds.size === count,
      `Tope 500 (${count} productos): cero duplicados`
    );

    if (count <= 500) {
      assert(
        server.calls.length === 1,
        `Tope 500 (${count} productos): 1 sola petición inicial`
      );
    } else {
      const expectedPages = Math.ceil(count / 500);
      assert(
        server.calls.length === expectedPages,
        `Tope 500 (${count} productos): ${expectedPages} peticiones efectivas`
      );
    }
  }

  // ==========================================================================
  // Suite 3: Manejo de errores de red en cualquier página (debe lanzar)
  // ==========================================================================
  console.log('\n3. Fallo en peticiones individuales:');

  // 3a. Falla página 0
  {
    const server = createMockServer({
      count: 2000,
      failOnCall: (_, __, idx) => idx === 0,
    });

    let threw = false;
    try {
      await fetchAllPages(server.fetchPage);
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('Fallo simulado'),
        `Fallo en página 0: lanza el error exacto recibido (${err.message})`
      );
    }
    assert(threw, 'Fallo en página 0: no silencia el error');
  }

  // 3b. Falla página secundaria (página 2)
  {
    const server = createMockServer({
      count: 2500,
      failOnCall: (from) => from >= 1000, // falla segunda página
    });

    let threw = false;
    try {
      await fetchAllPages(server.fetchPage);
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('Fallo simulado'),
        `Fallo en página secundaria: lanza el error exacto recibido (${err.message})`
      );
    }
    assert(threw, 'Fallo en página secundaria: no silencia el error ni devuelve parcial');
  }

  // ==========================================================================
  // Suite 4: Inserciones concurrentes (inconsistencia y reintento)
  // ==========================================================================
  console.log('\n4. Inserción simulada entre peticiones (inconsistencia y reintento):');

  // 4a. Inserción transitoria: falla en pasada 1, se estabiliza y tiene éxito en el reintento
  {
    let pass1Injected = false;
    let callNum = 0;

    const server = createMockServer({
      count: 1500,
      serverMaxRows: 1000,
      onCall: (from, to, _, items) => {
        callNum++;
        // En la llamada 1 (segunda página de la pasada 1), simular inserción entre peticiones
        if (callNum === 2 && !pass1Injected) {
          pass1Injected = true;
          // Inyectar producto que altera el conteo
          items.push({ id: 'prod_INJECTED_001', name: 'Producto insertado en caliente' });
        }
      },
    });

    const result = await fetchAllPages(server.fetchPage);
    assert(
      result.length === 1501,
      `Inserción concurrente transitoria: reintenta y devuelve los 1501 productos completos (obtenidos: ${result.length})`
    );
    assert(
      server.calls.length > 2,
      `Inserción concurrente transitoria: se comprobó que repitió la carga completa (llamadas totales: ${server.calls.length})`
    );
  }

  // 4b. Inserción o inconsistencia persistente: falla tras el reintento y lanza Error (nunca devuelve parcial)
  {
    let callCounter = 0;
    const server = createMockServer({
      count: 1500,
      serverMaxRows: 1000,
      onCall: (_, __, ___, items) => {
        callCounter++;
        // En cada llamada añade un item, provocando discrepancia permanente
        items.push({ id: `prod_INJECTED_PERSISTENT_${callCounter}`, name: 'Desfase permanente' });
      },
    });

    let threw = false;
    try {
      await fetchAllPages(server.fetchPage);
    } catch (err) {
      threw = true;
      assert(
        err instanceof InconsistentPaginationError || err.message.includes('Inconsistencia'),
        `Inconsistencia persistente: lanza Error descriptivo (${err.message})`
      );
    }
    assert(threw, 'Inconsistencia persistente: aborta y nunca devuelve una lista parcial');
  }

  // ==========================================================================
  // Suite 5: Respaldo secuencial ante count ausente (null / no numérico)
  // ==========================================================================
  console.log('\n5. Modo de respaldo secuencial cuando count es ausente (null):');

  const missingCountTests = [1000, 1001, 2500];

  for (const count of missingCountTests) {
    let missingCountEvents = 0;
    const server = createMockServer({
      count,
      serverMaxRows: 1000,
      countOverride: null,
    });

    const result = await fetchAllPages(server.fetchPage, {
      onMissingCount: () => {
        missingCountEvents++;
      },
    });

    assert(
      result.length === count,
      `Count ausente (${count} productos): devuelve exactamente ${count} filas (obtenidas: ${result.length})`
    );

    const uniqueIds = new Set(result.map(r => r.id));
    assert(
      uniqueIds.size === count,
      `Count ausente (${count} productos): cero duplicados (únicos: ${uniqueIds.size})`
    );

    assert(
      missingCountEvents === 1,
      `Count ausente (${count} productos): onMissingCount se activó exactamente 1 vez (eventos: ${missingCountEvents})`
    );

    const expectedCalls = count === 1000 ? 2 : Math.ceil(count / 1000);
    assert(
      server.calls.length === expectedCalls,
      `Count ausente (${count} productos): completó en ${expectedCalls} peticiones secuenciales (llamadas: ${server.calls.length})`
    );
  }

  // ==========================================================================
  // Suite 6: Detección y rechazo de conteos inconsistentes
  // ==========================================================================
  console.log('\n6. Detección y rechazo de conteos inconsistentes:');

  // 6a. count === 0 con filas (> 0)
  {
    const server = createMockServer({
      count: 10,
      serverMaxRows: 1000,
      countOverride: 0,
    });

    let threw = false;
    try {
      await fetchAllPages(server.fetchPage);
    } catch (err) {
      threw = true;
      assert(
        err instanceof InconsistentPaginationError || err.message.includes('Inconsistencia'),
        `count=0 con filas (>0): lanza InconsistentPaginationError (${err.message})`
      );
    }
    assert(threw, 'count=0 con filas (>0): no silencia la discrepancia y lanza Error');
  }

  // 6b. rows.length > count (ej. 50 filas devueltas pero count=20)
  {
    const server = createMockServer({
      count: 50,
      serverMaxRows: 1000,
      countOverride: 20,
    });

    let threw = false;
    try {
      await fetchAllPages(server.fetchPage);
    } catch (err) {
      threw = true;
      assert(
        err instanceof InconsistentPaginationError || err.message.includes('Inconsistencia'),
        `rows.length > count: lanza InconsistentPaginationError (${err.message})`
      );
    }
    assert(threw, 'rows.length > count: no silencia la discrepancia y lanza Error');
  }

  // ==========================================================================
  // Suite 7: Conservación del orden por created_at descendente (desempate por id)
  // ==========================================================================
  console.log('\n7. Conservación del orden por created_at descendente (desempate por id):');

  {
    const unorderedRows = [
      { id: 'prod_B', name: 'Intermedio', created_at: '2026-05-10T12:00:00Z' },
      { id: 'prod_A', name: 'Más Antiguo', created_at: '2026-01-01T08:00:00Z' },
      { id: 'prod_D_2', name: 'Empate Id 2', created_at: '2026-10-15T15:00:00Z' },
      { id: 'prod_D_1', name: 'Empate Id 1', created_at: '2026-10-15T15:00:00Z' },
      { id: 'prod_C', name: 'Más Reciente', created_at: '2026-11-01T10:00:00Z' },
    ];

    const sorted = sortRowsByCreatedAtDesc([...unorderedRows]);

    assert(
      sorted[0].id === 'prod_C',
      'El producto con fecha más reciente queda primero (prod_C: 2026-11-01)'
    );
    assert(
      sorted[1].id === 'prod_D_2' && sorted[2].id === 'prod_D_1',
      'En caso de empate en fecha (2026-10-15), desempata por id descendente (prod_D_2 antes de prod_D_1)'
    );
    assert(
      sorted[3].id === 'prod_B',
      'El producto intermedio queda en su posición correcta (prod_B: 2026-05-10)'
    );
    assert(
      sorted[4].id === 'prod_A',
      'El producto más antiguo queda al final (prod_A: 2026-01-01)'
    );

    // Integración completa: simular que el servidor entrega filas ordenadas por id (estabilidad de paginación)
    // y al ordenar el resultado final se recupera el orden por fecha
    const serverRows = [
      { id: 'p01', name: 'P1', created_at: '2026-01-01T00:00:00Z' },
      { id: 'p02', name: 'P2', created_at: '2026-03-01T00:00:00Z' },
      { id: 'p03', name: 'P3', created_at: '2026-02-01T00:00:00Z' },
    ];
    const server = {
      fetchPage: async () => ({ rows: serverRows, count: serverRows.length }),
    };
    const paginated = await fetchAllPages(server.fetchPage);
    const finalSorted = sortRowsByCreatedAtDesc(paginated);

    assert(
      finalSorted.map(p => p.id).join(',') === 'p02,p03,p01',
      'Integración paginación + ordenamiento: resultado final preserva orden created_at descendente (p02, p03, p01)'
    );
  }

  // ==========================================================================
  // Resumen Final
  // ==========================================================================
  console.log('\n' + '='.repeat(55));
  if (failedTests === 0) {
    console.log(`✅ ¡Todas las ${passedTests} de ${totalTests} pruebas de paginación pasaron exitosamente!`);
  } else {
    console.error(`❌ FALLARON ${failedTests} de ${totalTests} pruebas.`);
    process.exit(1);
  }
  console.log('='.repeat(55));
}

runTests().catch(err => {
  console.error('Error no controlado en verify-pagination:', err);
  process.exit(1);
});
