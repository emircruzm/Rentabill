#!/usr/bin/env node
/**
 * scripts/verify-pagination.mjs
 *
 * Verificación exhaustiva de la función pura fetchAllPages.
 * Prueba límites de filas, bordes exactos (1000), topes de servidor dinámicos (500),
 * fallos de red en cualquier página e inserciones concurrentes (reintento e inconsistencia).
 */

import { fetchAllPages, InconsistentPaginationError } from '../src/shared/utils/pagination.ts';

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
 * Crea un mock del servidor con límite de filas por respuesta y control de fallos.
 */
function createMockServer({
  count,
  serverMaxRows = 1000,
  failOnCall = null,
  onCall = null,
}) {
  const items = Array.from({ length: count }, (_, i) => ({
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

    return {
      rows: returned,
      count: items.length,
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
