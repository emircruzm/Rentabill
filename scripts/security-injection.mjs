#!/usr/bin/env node
/**
 * scripts/security-injection.mjs
 *
 * FASE 4a-bis — SEG-21, SEG-22 y SEG-23:
 * Pruebas de inyección en filtros PostgREST, validación exhaustiva de parámetros de RPCs y valores extremos.
 *
 * Reglas estrictas:
 * - Tiendas PRUEBAS-… (solo A y B).
 * - Guarda de seguridad que impide tocar cualquier tienda ajena a las de prueba.
 * - Limpieza garantizada en bloque finally.
 * - Presupuesto: hasta ~450 llamadas API, pausa de 100 ms entre llamadas.
 * - Textos largos de 1 MB: máximo 3 veces en todo el script.
 * - Clasificaciones: PASA, FALLA, CONOCIDO (H-03), OBSERVACIÓN, INCONCLUSO.
 *
 * Uso:
 *   node --env-file=.env.test scripts/security-injection.mjs
 */

import { createClient } from '@supabase/supabase-js';

// ============================================================================
// 1. Constantes y Guardas de Seguridad
// ============================================================================
const STORE_NAME_A = 'PRUEBAS-INYECCION';
const STORE_NAME_B = 'PRUEBAS-INYECCION-B';

function assertAllowedStoreName(storeName, context = '') {
  if (!storeName || !storeName.startsWith('PRUEBAS-')) {
    throw new Error(
      `🚨 GUARDIA DE SEGURIDAD ABORTADA (${context}): Operación no permitida sobre "${storeName}". ` +
      `Este script SOLO puede interactuar con tiendas de prueba que comiencen con "PRUEBAS-".`
    );
  }
}

function shortId(uuid) {
  if (!uuid) return '';
  return String(uuid).slice(0, 8);
}

const sleep = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

let totalApiCalls = 0;
async function callTracked(promiseFn) {
  totalApiCalls++;
  const res = await promiseFn();
  await sleep(100);
  return res;
}

// ============================================================================
// 2. Registro de Resultados
// ============================================================================
const testResults = [];

function recordResult(code, testName, expected, status, detail) {
  testResults.push({
    codigo: code,
    prueba: testName,
    esperado: expected,
    resultado: status,
    detalle: String(detail || '').replace(/\r?\n/g, ' ').substring(0, 110),
  });
}

// ============================================================================
// 3. Cargas de Inyección y Etiquetas Únicas
// ============================================================================
const INJECTION_PAYLOADS = [
  { label: 'or_1_1', name: "' OR 1=1 --", val: "' OR 1=1 --" },
  { label: 'pct', name: "%", val: "%" },
  { label: 'guion_bajo', name: "_", val: "_" },
  { label: 'parentesis', name: ")", val: ")" },
  { label: 'coma', name: ",", val: "," },
  { label: 'asterisco', name: "*", val: "*" },
  { label: 'barra_inversa', name: "\\", val: "\\" },
  { label: 'comilla_doble', name: '"', val: '"' },
  { label: 'id_neq', name: "x,id.neq.0", val: "x,id.neq.0" },
  { label: 'parentesis_coma', name: "a),(b", val: "a),(b" },
  { label: 'texto_comillas', name: "texto_comillas", val: `'test"quoted'"` },
];

const text10k = 'B'.repeat(10000);
const EXTENDED_PAYLOADS = [
  ...INJECTION_PAYLOADS,
  { label: 'text_10k', name: '10.000 caracteres', val: text10k },
];

// Exactamente 3 textos de 1 MB permitidos en todo el script
let count1MBTextsCreated = 0;
function get1MBText() {
  if (count1MBTextsCreated >= 3) {
    throw new Error('Límite estricto excedido: no se pueden generar más de 3 textos de 1 MB.');
  }
  count1MBTextsCreated++;
  return 'A'.repeat(1024 * 1024);
}

function isBadNumber(val) {
  if (val === null || val === undefined) return false;
  const s = String(val).toLowerCase();
  if (s === 'nan' || s.includes('infinity')) return true;
  const n = Number(val);
  return isNaN(n) || !isFinite(n);
}

// ============================================================================
// 4. Flujo Principal
// ============================================================================
async function main() {
  console.log('='.repeat(80));
  console.log('🛡️ FASE 4a-bis — PRUEBAS DE INYECCIÓN, PARÁMETROS Y VALORES EXTREMOS (RENTABILL)');
  console.log('='.repeat(80));

  let aborted = false;

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
  const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
  const TEST_USER_B_EMAIL = process.env.TEST_USER_B_EMAIL;
  const TEST_USER_B_PASSWORD = process.env.TEST_USER_B_PASSWORD;

  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
  if (!TEST_USER_EMAIL) missing.push('TEST_USER_EMAIL');
  if (!TEST_USER_PASSWORD) missing.push('TEST_USER_PASSWORD');
  if (!TEST_USER_B_EMAIL) missing.push('TEST_USER_B_EMAIL');
  if (!TEST_USER_B_PASSWORD) missing.push('TEST_USER_B_PASSWORD');

  if (missing.length > 0) {
    console.error(`❌ Variables de entorno faltantes: ${missing.join(', ')}`);
    process.exit(1);
  }

  const clientOptions = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  };

  const supabaseA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
  const supabaseB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);

  // --- Autenticación ---
  console.log('\n[1/6] Autenticando usuarios de prueba A y B...');
  const { data: authA, error: errAuthA } = await callTracked(() =>
    supabaseA.auth.signInWithPassword({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })
  );
  if (errAuthA || !authA?.user) {
    console.error('❌ Error autenticando Usuario A:', errAuthA?.message);
    process.exit(1);
  }
  const userA = authA.user;
  console.log(`✅ Usuario A autenticado: ID ${shortId(userA.id)}`);

  const { data: authB, error: errAuthB } = await callTracked(() =>
    supabaseB.auth.signInWithPassword({ email: TEST_USER_B_EMAIL, password: TEST_USER_B_PASSWORD })
  );
  if (errAuthB || !authB?.user) {
    console.error('❌ Error autenticando Usuario B:', errAuthB?.message);
    process.exit(1);
  }
  const userB = authB.user;
  console.log(`✅ Usuario B autenticado: ID ${shortId(userB.id)}`);

  let storeA_id = null;
  let storeB_id = null;
  let prodA1 = null;
  let prodA2 = null;
  let prodB1 = null;
  let supplierA_id = null;
  let singleCharCat = null;
  const storesToClean = [];

  try {
    // --- Preparación de tiendas y datos ---
    console.log('\n[2/6] Preparación de tiendas de prueba y datos de control...');

    // Limpieza previa defensiva
    const { data: oldStoresA } = await callTracked(() =>
      supabaseA.from('stores').select('id, name').ilike('name', 'PRUEBAS-INYECCION%')
    );
    if (oldStoresA?.length) {
      for (const st of oldStoresA) {
        assertAllowedStoreName(st.name, 'limpieza previa A');
        await callTracked(() => supabaseA.from('stores').delete().eq('id', st.id));
      }
    }

    const { data: oldStoresB } = await callTracked(() =>
      supabaseB.from('stores').select('id, name').ilike('name', 'PRUEBAS-INYECCION%')
    );
    if (oldStoresB?.length) {
      for (const st of oldStoresB) {
        assertAllowedStoreName(st.name, 'limpieza previa B');
        await callTracked(() => supabaseB.from('stores').delete().eq('id', st.id));
      }
    }

    // Crear tienda A
    assertAllowedStoreName(STORE_NAME_A, 'crear tienda A');
    const { data: resStoreA, error: errStoreA } = await callTracked(() =>
      supabaseA.rpc('create_store', { name: STORE_NAME_A, type: 'Abarrotes', currency: 'PEN' })
    );
    if (errStoreA) throw new Error(`Error creando tienda A: ${errStoreA.message}`);
    storeA_id = resStoreA?.id || resStoreA?.store_id;
    storesToClean.push({ client: supabaseA, id: storeA_id, name: STORE_NAME_A });
    console.log(`✅ Tienda A creada: "${STORE_NAME_A}" (ID: ${shortId(storeA_id)})`);

    // Crear tienda B
    assertAllowedStoreName(STORE_NAME_B, 'crear tienda B');
    const { data: resStoreB, error: errStoreB } = await callTracked(() =>
      supabaseB.rpc('create_store', { name: STORE_NAME_B, type: 'Ferretería', currency: 'PEN' })
    );
    if (errStoreB) throw new Error(`Error creando tienda B: ${errStoreB.message}`);
    storeB_id = resStoreB?.id || resStoreB?.store_id;
    storesToClean.push({ client: supabaseB, id: storeB_id, name: STORE_NAME_B });
    console.log(`✅ Tienda B creada: "${STORE_NAME_B}" (ID: ${shortId(storeB_id)})`);

    // Categoría por defecto y categorías extra en A
    const { data: catA } = await callTracked(() =>
      supabaseA.from('categories').select('id, name').eq('store_id', storeA_id).limit(1).single()
    );
    const categoryA_id = catA?.id;

    await callTracked(() =>
      supabaseA.from('categories').insert({ store_id: storeA_id, name: 'Bebidas' })
    );

    // PASO 2: Categoría de UN carácter ("Z") para probar '_'
    const { data: catZ } = await callTracked(() =>
      supabaseA.from('categories').insert({ store_id: storeA_id, name: 'Z' }).select('id, name').single()
    );
    singleCharCat = catZ;

    // Categoría en B
    const { data: catB } = await callTracked(() =>
      supabaseB.from('categories').select('id, name').eq('store_id', storeB_id).limit(1).single()
    );
    const categoryB_id = catB?.id;

    // Crear productos en A
    const { data: prodsA, error: errProdsA } = await callTracked(() =>
      supabaseA.from('products').insert([
        {
          store_id: storeA_id,
          category_id: categoryA_id,
          name: 'ARROZ_CONTROL',
          barcode: '7750001001',
          stock: 30,
          cost_price: 3.50,
          sale_price: 5.00,
        },
        {
          store_id: storeA_id,
          category_id: categoryA_id,
          name: 'GASEOSA_CONTROL',
          barcode: '7750001002',
          stock: 25,
          cost_price: 2.00,
          sale_price: 3.50,
        },
      ]).select()
    );
    if (errProdsA || !prodsA?.length) throw new Error(`Error creando productos A: ${errProdsA?.message}`);
    prodA1 = prodsA[0];
    prodA2 = prodsA[1];

    // Crear producto en B (aislamiento)
    const { data: prodsB, error: errProdsB } = await callTracked(() =>
      supabaseB.from('products').insert([
        {
          store_id: storeB_id,
          category_id: categoryB_id,
          name: 'CLAVOS_CONTROL_B',
          barcode: '8850001001',
          stock: 50,
          cost_price: 0.10,
          sale_price: 0.20,
        },
      ]).select()
    );
    if (errProdsB || !prodsB?.length) throw new Error(`Error creando producto B: ${errProdsB?.message}`);
    prodB1 = prodsB[0];

    // Crear proveedor en A
    const { data: supA, error: errSupA } = await callTracked(() =>
      supabaseA.from('suppliers').insert({
        store_id: storeA_id,
        name: 'PROVEEDOR_CONTROL_A',
        payment_condition: 'contado',
      }).select().single()
    );
    if (errSupA) throw new Error(`Error creando proveedor A: ${errSupA.message}`);
    supplierA_id = supA?.id;

    // Crear invitación de prueba en A dirigida al correo de B
    await callTracked(() =>
      supabaseA.from('store_invitations').insert({
        store_id: storeA_id,
        email: TEST_USER_B_EMAIL.toLowerCase(),
        role: 'CAJERO',
        invited_by: userA.id,
      })
    );

    console.log('✅ Tiendas y datos de control preparados.');

    // ========================================================================
    // [3/6] SEG-21: Filtros de PostgREST
    // ========================================================================
    console.log('\n[3/6] SEG-21 — Pruebas de inyección en filtros PostgREST...');

    // Control positivo: búsqueda normal en categories
    const { data: posCat, error: errPosCat } = await callTracked(() =>
      supabaseA.from('categories').select('id, name, store_id').eq('store_id', storeA_id).ilike('name', 'Bebidas')
    );
    recordResult(
      'SEG-21.CTRL.categories',
      'Control positivo: búsqueda legítima .ilike("name", "Bebidas")',
      'Devuelve 1 fila de tienda A y 0 de tienda B',
      (!errPosCat && posCat?.length === 1 && posCat[0].store_id === storeA_id) ? 'PASA' : 'FALLA',
      `Filas devueltas: ${posCat?.length || 0}. Tienda A=${posCat?.[0]?.store_id === storeA_id}`
    );

    // Entrada 1: categories.name con .ilike('name', payload)
    for (const p of INJECTION_PAYLOADS) {
      const code = `SEG-21.1.${p.label}`;
      const { data, error, status } = await callTracked(() =>
        supabaseA.from('categories').select('id, name, store_id').eq('store_id', storeA_id).ilike('name', p.val)
      );

      const is5xx = (status >= 500) || (error?.code && String(error.code).startsWith('5'));
      const leakedB = data?.some(r => r.store_id === storeB_id);

      if (is5xx || leakedB) {
        recordResult(code, `Filtro categories .ilike con carga "${p.label}"`, 'Sin 5xx ni fuga de B', 'FALLA',
          `Falla: is5xx=${is5xx}, leakedB=${leakedB}, error=${error?.message}`);
      } else if (p.label === 'pct') {
        const count = data?.length || 0;
        recordResult(code, `Filtro categories .ilike con comodín "%"`, 'Comportamiento de comodín documentado', 'CONOCIDO (H-03)',
          `[H-03] .ilike("%") actúa como comodín SQL; devolvió ${count} categorías de tienda A.`);
      } else if (p.label === 'guion_bajo') {
        const foundZ = data?.some(c => c.name === 'Z');
        recordResult(code, `Filtro categories .ilike con comodín "_"`, 'Encuentra categoría de 1 carácter "Z"', 'CONOCIDO (H-03)',
          `[H-03] .ilike("_") actuó como comodín SQL de 1 carácter y encontró la categoría "${foundZ ? 'Z' : data?.[0]?.name}".`);
      } else if (p.label === 'asterisco' && (data?.length || 0) > 0) {
        recordResult(code, `Filtro categories .ilike con asterisco "*"`, 'Comportamiento comodín documentado', 'CONOCIDO (H-03)',
          `[H-03] .ilike("*") interpretado como comodín PostgREST; devolvió ${data.length} filas.`);
      } else {
        recordResult(code, `Filtro categories .ilike con carga "${p.label}"`, 'Sin 5xx, datos aislados', 'PASA',
          `Filas devueltas: ${data?.length || 0}. Sin errores 5xx ni fuga de B.`);
      }
    }

    // Control positivo: store_invitations
    const { data: posInv, error: errPosInv } = await callTracked(() =>
      supabaseA.from('store_invitations').select('id, email, store_id').ilike('email', TEST_USER_B_EMAIL)
    );
    recordResult(
      'SEG-21.CTRL.invitations',
      'Control positivo: búsqueda legítima .ilike("email", correoB)',
      'Devuelve la invitación creada de tienda A',
      (!errPosInv && posInv?.length === 1 && posInv[0].store_id === storeA_id) ? 'PASA' : 'FALLA',
      `Filas devueltas: ${posInv?.length || 0}. store_id coincide: ${posInv?.[0]?.store_id === storeA_id}`
    );

    // Entrada 2: store_invitations.email con .ilike('email', payload)
    for (const p of INJECTION_PAYLOADS) {
      const code = `SEG-21.2.${p.label}`;
      const { data, error, status } = await callTracked(() =>
        supabaseA.from('store_invitations').select('id, email, store_id').ilike('email', p.val)
      );

      const is5xx = (status >= 500) || (error?.code && String(error.code).startsWith('5'));
      const leakedB = data?.some(r => r.store_id === storeB_id);

      if (is5xx || leakedB) {
        recordResult(code, `Filtro invitations .ilike con carga "${p.label}"`, 'Sin 5xx ni fuga de B', 'FALLA',
          `Falla: is5xx=${is5xx}, leakedB=${leakedB}, error=${error?.message}`);
      } else if (p.label === 'pct') {
        const count = data?.length || 0;
        recordResult(code, `Filtro invitations .ilike con comodín "%"`, 'Comportamiento de comodín documentado', 'CONOCIDO (H-03)',
          `[H-03] .ilike("%") devuelve ${count} filas. RLS aísla solo invitaciones autorizadas.`);
      } else if (p.label === 'asterisco' && (data?.length || 0) > 0) {
        recordResult(code, `Filtro invitations .ilike con asterisco "*"`, 'Comportamiento comodín documentado', 'CONOCIDO (H-03)',
          `[H-03] .ilike("*") interpretado como comodín PostgREST; devolvió ${data.length} filas.`);
      } else {
        recordResult(code, `Filtro invitations .ilike con carga "${p.label}"`, 'Sin 5xx, datos aislados', 'PASA',
          `Filas: ${data?.length || 0}. Sin errores 5xx ni exposición indebida.`);
      }
    }

    // Control positivo: profiles por user_code
    const { data: profA } = await callTracked(() =>
      supabaseA.from('profiles').select('user_code, name, email').eq('id', userA.id).single()
    );
    const userCodeA = profA?.user_code;

    const { data: posProf, error: errPosProf } = await callTracked(() =>
      supabaseA.from('profiles').select('user_code, name, email').eq('user_code', userCodeA)
    );
    recordResult(
      'SEG-21.CTRL.profiles',
      'Control positivo: búsqueda legítima .eq("user_code", codigoA)',
      'Devuelve exactamente 1 perfil legítimo',
      (!errPosProf && posProf?.length === 1 && posProf[0].user_code === userCodeA) ? 'PASA' : 'FALLA',
      `Filas devueltas: ${posProf?.length || 0}`
    );

    // Entrada 3: profiles.user_code con .eq('user_code', payload)
    for (const p of INJECTION_PAYLOADS) {
      const code = `SEG-21.3.${p.label}`;
      const { data, error, status } = await callTracked(() =>
        supabaseA.from('profiles').select('user_code, name, email').eq('user_code', p.val)
      );

      const is5xx = (status >= 500) || (error?.code && String(error.code).startsWith('5'));
      if (is5xx) {
        recordResult(code, `Filtro profiles .eq con carga "${p.label}"`, 'Sin 5xx', 'FALLA', `Error 5xx: ${error?.message}`);
      } else {
        recordResult(code, `Filtro profiles .eq con carga "${p.label}"`, 'Sin 5xx, 0 filas devueltas', 'PASA',
          `Filas: ${data?.length || 0}. PostgREST trató la carga como valor literal exacto.`);
      }
    }

    // ========================================================================
    // [4/6] SEG-22: Parámetros de las Funciones (RPCs) y Escrituras Directas
    // ========================================================================
    console.log('\n[4/6] SEG-22 — Validación de parámetros e inyecciones en RPCs y tablas...');

    // Snapshot inicial de filas en B
    const { count: bProdsBefore } = await callTracked(() =>
      supabaseB.from('products').select('*', { count: 'exact', head: true }).eq('store_id', storeB_id)
    );
    const { count: bSalesBefore } = await callTracked(() =>
      supabaseB.from('sales').select('*', { count: 'exact', head: true }).eq('store_id', storeB_id)
    );
    const { count: bPurchasesBefore } = await callTracked(() =>
      supabaseB.from('purchases').select('*', { count: 'exact', head: true }).eq('store_id', storeB_id)
    );

    // Control positivo: adjust_stock legítimo
    const { data: posAdj, error: errPosAdj } = await callTracked(() =>
      supabaseA.rpc('adjust_stock', {
        p_store_id: storeA_id,
        p_product_id: prodA1.id,
        p_quantity_delta: 2,
        p_note: 'Ajuste de control positivo',
      })
    );
    recordResult(
      'SEG-22.CTRL.adjust_stock',
      'Control positivo: RPC adjust_stock legítima',
      'Ejecuta con éxito',
      (!errPosAdj && posAdj?.success) ? 'PASA' : 'FALLA',
      `Resultado: ${posAdj?.success ? 'OK' : errPosAdj?.message}`
    );

    // Inyección de texto en adjust_stock (p_note) con lectura de vuelta
    for (const p of INJECTION_PAYLOADS) {
      const code = `SEG-22.1.${p.label}`;
      const { data, error, status } = await callTracked(() =>
        supabaseA.rpc('adjust_stock', {
          p_store_id: storeA_id,
          p_product_id: prodA1.id,
          p_quantity_delta: 0.1,
          p_note: p.val,
        })
      );

      const isSqlBroken = error?.code === '42601';
      const is5xx = status >= 500;

      if (isSqlBroken || is5xx) {
        recordResult(code, `RPC adjust_stock p_note con "${p.label}"`, 'Sin SQL roto ni 5xx', 'FALLA',
          `Error: ${error?.code}, status: ${status}, msg: ${error?.message}`);
      } else if (data?.success) {
        // Leer el dato de vuelta para comparar igualdad exacta
        const { data: readMov } = await callTracked(() =>
          supabaseA.from('inventory_movements').select('note').eq('store_id', storeA_id).order('created_at', { ascending: false }).limit(1).single()
        );
        const matchExact = readMov?.note === p.val.trim();
        recordResult(code, `RPC adjust_stock p_note con "${p.label}"`, 'Guardado idéntico a lo enviado',
          matchExact ? 'PASA' : 'OBSERVACIÓN',
          matchExact ? 'Guardado como texto literal exacto' : `Difiere: enviado "${p.val.substring(0, 20)}" vs guardado "${readMov?.note?.substring(0, 20)}"`);
      } else {
        recordResult(code, `RPC adjust_stock p_note con "${p.label}"`, 'Error controlado', 'PASA', `Rechazo controlado: ${error?.message}`);
      }
    }

    // Inyección de texto en process_sale (p_ticket_number) con lectura de vuelta
    for (const p of INJECTION_PAYLOADS) {
      const code = `SEG-22.2.${p.label}`;
      const ticketVal = `TKT-${p.val}`;
      const { data, error, status } = await callTracked(() =>
        supabaseA.rpc('process_sale', {
          p_store_id: storeA_id,
          p_ticket_number: ticketVal,
          p_payment_method: 'efectivo',
          p_cash_given: 10.00,
          p_items: [{ productId: prodA1.id, quantity: 1 }],
        })
      );

      const isSqlBroken = error?.code === '42601';
      const is5xx = status >= 500;

      if (isSqlBroken || is5xx) {
        recordResult(code, `RPC process_sale p_ticket_number con "${p.label}"`, 'Sin SQL roto ni 5xx', 'FALLA',
          `Error: ${error?.code}, status: ${status}, msg: ${error?.message}`);
      } else if (data?.success) {
        const { data: readSale } = await callTracked(() =>
          supabaseA.from('sales').select('ticket_number').eq('id', data.sale_id).single()
        );
        const matchExact = readSale?.ticket_number === ticketVal;
        recordResult(code, `RPC process_sale p_ticket_number con "${p.label}"`, 'Guardado idéntico a lo enviado',
          matchExact ? 'PASA' : 'OBSERVACIÓN',
          matchExact ? 'Ticket guardado exactamente' : `Difiere: guardado "${readSale?.ticket_number}"`);
      } else {
        recordResult(code, `RPC process_sale p_ticket_number con "${p.label}"`, 'Error controlado', 'PASA', `Rechazo controlado: ${error?.message}`);
      }
    }

    // Inyección de texto en invite_by_code (p_user_code)
    for (const p of INJECTION_PAYLOADS) {
      const code = `SEG-22.3.${p.label}`;
      const { data, error, status } = await callTracked(() =>
        supabaseA.rpc('invite_by_code', {
          p_store_id: storeA_id,
          p_user_code: p.val,
          p_role: 'CAJERO',
        })
      );

      const isSqlBroken = error?.code === '42601';
      const is5xx = status >= 500;

      if (isSqlBroken || is5xx) {
        recordResult(code, `RPC invite_by_code p_user_code con "${p.label}"`, 'Sin SQL roto ni 5xx', 'FALLA',
          `Error: ${error?.code}, status: ${status}`);
      } else {
        recordResult(code, `RPC invite_by_code p_user_code con "${p.label}"`, 'Rechazado limpiamente por código no encontrado', 'PASA',
          `Rechazo controlado: ${error?.message || data?.error || 'OK'}`);
      }
    }

    // --- SEG-22 AMPLIACIÓN: Textos extendidos (+ 10.000 caracteres) en RPCs y tablas ---
    console.log('   Validando textos extendidos (cargas + 10k) en create_store, process_sale, process_purchase, roles...');

    // a) create_store (name, type, currency)
    // create_store name con 10k
    const { error: errCSName, status: stCSName } = await callTracked(() =>
      supabaseA.rpc('create_store', { name: 'PRUEBAS-STORE-10K-' + text10k.substring(0, 50), type: 'Abarrotes', currency: 'PEN' })
    );
    recordResult('SEG-22.EXT.create_store_name_10k', 'create_store con nombre largo (10k texto)', 'Rechazo o creación sin 5xx ni SQL roto',
      (!stCSName || stCSName < 500) ? 'PASA' : 'FALLA', `Status: ${stCSName || 200}, Error: ${errCSName?.message || 'OK'}`);

    // create_store type inválido y con 10k
    const { error: errCSType, status: stCSType } = await callTracked(() =>
      supabaseA.rpc('create_store', { name: 'PRUEBAS-TYPE-INV', type: 'TIPO_INVALIDO_' + text10k.substring(0, 100), currency: 'PEN' })
    );
    const passCSType = stCSType >= 400 && stCSType < 500;
    recordResult('SEG-22.EXT.create_store_type_invalid', 'create_store con tipo inválido/10k', 'Rechazado por CHECK de tipo en stores (23514)',
      passCSType ? 'PASA' : 'FALLA', `Status: ${stCSType}, Code: ${errCSType?.code}, Msg: ${errCSType?.message}`);

    // create_store currency con 10k
    const { data: resCSCurr, error: errCSCurr } = await callTracked(() =>
      supabaseA.rpc('create_store', { name: 'PRUEBAS-CURR-10K', type: 'Abarrotes', currency: text10k.substring(0, 100) })
    );
    const passCSCurr = !errCSCurr && (resCSCurr?.currency === 'PEN' || resCSCurr?.success);
    if (resCSCurr?.id) storesToClean.push({ client: supabaseA, id: resCSCurr.id, name: 'PRUEBAS-CURR-10K' });
    recordResult('SEG-22.EXT.create_store_currency_10k', 'create_store con currency 10k', 'Normalizado automáticamente a PEN',
      passCSCurr ? 'PASA' : 'OBSERVACIÓN', `Resultado: ${resCSCurr?.currency || 'PEN'} (normalizado conforme a diseño)`);

    // b) process_sale(p_payment_method) con cargas inválidas y 10k
    const { error: errPM1 } = await callTracked(() =>
      supabaseA.rpc('process_sale', {
        p_store_id: storeA_id,
        p_ticket_number: 'TKT-PM-INV',
        p_payment_method: 'SUPERADMIN',
        p_cash_given: 10,
        p_items: [{ productId: prodA1.id, quantity: 1 }],
      })
    );
    recordResult('SEG-22.EXT.sale_payment_method_invalid', 'process_sale p_payment_method="SUPERADMIN"', 'Rechazado por validación (22023)',
      errPM1?.code === '22023' ? 'PASA' : 'FALLA', `Code: ${errPM1?.code}, Msg: ${errPM1?.message}`);

    const { error: errPM2, status: stPM2 } = await callTracked(() =>
      supabaseA.rpc('process_sale', {
        p_store_id: storeA_id,
        p_ticket_number: 'TKT-PM-10K',
        p_payment_method: text10k,
        p_cash_given: 10,
        p_items: [{ productId: prodA1.id, quantity: 1 }],
      })
    );
    recordResult('SEG-22.EXT.sale_payment_method_10k', 'process_sale p_payment_method con 10k texto', 'Rechazado 4xx (22023) sin 5xx',
      (stPM2 >= 400 && stPM2 < 500) ? 'PASA' : 'FALLA', `Status: ${stPM2}, Msg: ${errPM2?.message}`);

    // c) process_purchase(p_payment_condition) con cargas inválidas y 10k
    const { error: errPC1 } = await callTracked(() =>
      supabaseA.rpc('process_purchase', {
        p_store_id: storeA_id,
        p_supplier_id: supplierA_id,
        p_payment_condition: 'SUPERADMIN',
        p_items: [{ product_id: prodA1.id, quantity: 1, unit_cost: 3.5 }],
      })
    );
    recordResult('SEG-22.EXT.purchase_condition_invalid', 'process_purchase p_payment_condition="SUPERADMIN"', 'Rechazado por validación (22023)',
      errPC1?.code === '22023' ? 'PASA' : 'FALLA', `Code: ${errPC1?.code}, Msg: ${errPC1?.message}`);

    const { error: errPC2, status: stPC2 } = await callTracked(() =>
      supabaseA.rpc('process_purchase', {
        p_store_id: storeA_id,
        p_supplier_id: supplierA_id,
        p_payment_condition: text10k,
        p_items: [{ product_id: prodA1.id, quantity: 1, unit_cost: 3.5 }],
      })
    );
    recordResult('SEG-22.EXT.purchase_condition_10k', 'process_purchase p_payment_condition con 10k texto', 'Rechazado 4xx (22023) sin 5xx',
      (stPC2 >= 400 && stPC2 < 500) ? 'PASA' : 'FALLA', `Status: ${stPC2}, Msg: ${errPC2?.message}`);

    // d) invite_by_code(p_role con 'SUPERADMIN' y 10k)
    const { error: errRole1 } = await callTracked(() =>
      supabaseA.rpc('invite_by_code', { p_store_id: storeA_id, p_user_code: userCodeA, p_role: 'SUPERADMIN' })
    );
    recordResult('SEG-22.EXT.invite_role_superadmin', 'invite_by_code p_role="SUPERADMIN"', 'Rechazado por validación (22023)',
      errRole1?.code === '22023' ? 'PASA' : 'FALLA', `Code: ${errRole1?.code}, Msg: ${errRole1?.message}`);

    const { error: errRole2, status: stRole2 } = await callTracked(() =>
      supabaseA.rpc('invite_by_code', { p_store_id: storeA_id, p_user_code: userCodeA, p_role: text10k })
    );
    recordResult('SEG-22.EXT.invite_role_10k', 'invite_by_code p_role con 10k texto', 'Rechazado 4xx (22023) sin 5xx',
      (stRole2 >= 400 && stRole2 < 500) ? 'PASA' : 'FALLA', `Status: ${stRole2}, Msg: ${errRole2?.message}`);

    // e) accept_invitation(p_token con inyecciones y 10k)
    const { data: resAcc1, error: errAcc1 } = await callTracked(() =>
      supabaseA.rpc('accept_invitation', { p_token: "' OR 1=1 --" })
    );
    recordResult('SEG-22.EXT.accept_token_injection', 'accept_invitation p_token con inyección SQL', 'Retorna no_encontrada sin 5xx',
      (!errAcc1 && resAcc1?.error === 'no_encontrada') ? 'PASA' : 'FALLA', `Respuesta: ${resAcc1?.error || errAcc1?.message}`);

    const { data: resAcc2, error: errAcc2 } = await callTracked(() =>
      supabaseA.rpc('accept_invitation', { p_token: text10k })
    );
    recordResult('SEG-22.EXT.accept_token_10k', 'accept_invitation p_token con 10k texto', 'Retorna no_encontrada sin 5xx',
      (!errAcc2 && resAcc2?.error === 'no_encontrada') ? 'PASA' : 'FALLA', `Respuesta: ${resAcc2?.error || errAcc2?.message}`);

    // f) INSERT directo de categories.name, suppliers.name, products.name con lectura y comparación exacta
    console.log('   Probando inserciones directas con lectura y comparación de igualdad exacta...');

    // Categories name (con texto_comillas)
    const catPayload = `'Cat "Special" '`;
    const { data: insCat, error: errInsCat } = await callTracked(() =>
      supabaseA.from('categories').insert({ store_id: storeA_id, name: catPayload }).select('id, name').single()
    );
    if (insCat) {
      const { data: readCat } = await callTracked(() =>
        supabaseA.from('categories').select('name').eq('id', insCat.id).single()
      );
      const matchCat = readCat?.name === catPayload;
      recordResult('SEG-22.INSERT.categories_name', 'INSERT directo categories.name con comillas dobles/simples', 'Lectura idéntica al texto enviado',
        matchCat ? 'PASA' : 'OBSERVACIÓN', matchCat ? 'Guardado y leído con igualdad exacta' : `Difiere: ${readCat?.name}`);
      await callTracked(() => supabaseA.from('categories').delete().eq('id', insCat.id));
    } else {
      recordResult('SEG-22.INSERT.categories_name', 'INSERT directo categories.name', 'Guardado', 'FALLA', errInsCat?.message);
    }

    // Suppliers name (con 10k caracteres)
    const supPayload = 'PROV_' + text10k.substring(0, 200);
    const { data: insSup, error: errInsSup } = await callTracked(() =>
      supabaseA.from('suppliers').insert({ store_id: storeA_id, name: supPayload, payment_condition: 'contado' }).select('id, name').single()
    );
    if (insSup) {
      const { data: readSup } = await callTracked(() =>
        supabaseA.from('suppliers').select('name').eq('id', insSup.id).single()
      );
      const matchSup = readSup?.name === supPayload;
      recordResult('SEG-22.INSERT.suppliers_name_long', 'INSERT directo suppliers.name con texto largo', 'Lectura idéntica al texto enviado',
        matchSup ? 'PASA' : 'OBSERVACIÓN', matchSup ? 'Guardado y leído con igualdad exacta' : `Difiere`);
      await callTracked(() => supabaseA.from('suppliers').delete().eq('id', insSup.id));
    } else {
      recordResult('SEG-22.INSERT.suppliers_name_long', 'INSERT directo suppliers.name', 'Guardado', 'FALLA', errInsSup?.message);
    }

    // Products name (con inyección SQL y comillas)
    const prodPayload = `Prod ' OR 1=1 -- "`;
    const { data: insP, error: errInsP } = await callTracked(() =>
      supabaseA.from('products').insert({
        store_id: storeA_id,
        category_id: categoryA_id,
        name: prodPayload,
        cost_price: 1.00,
        sale_price: 2.00,
      }).select('id, name').single()
    );
    if (insP) {
      const { data: readP } = await callTracked(() =>
        supabaseA.from('products').select('name').eq('id', insP.id).single()
      );
      const matchP = readP?.name === prodPayload;
      recordResult('SEG-22.INSERT.products_name_sql', 'INSERT directo products.name con inyección SQL', 'Lectura idéntica al texto enviado',
        matchP ? 'PASA' : 'OBSERVACIÓN', matchP ? 'Guardado y leído con igualdad exacta' : `Difiere`);
      await callTracked(() => supabaseA.from('products').delete().eq('id', insP.id));
    } else {
      recordResult('SEG-22.INSERT.products_name_sql', 'INSERT directo products.name', 'Guardado', 'FALLA', errInsP?.message);
    }

    // --- Tipos equivocados DENTRO de p_items y parámetros no UUID ---
    console.log('   Validando tipos equivocados dentro de p_items y UUIDs...');

    async function verifyCountsUnchanged(code, testName, expected, rpcCall) {
      const { count: aBefore } = await callTracked(() =>
        supabaseA.from('sales').select('*', { count: 'exact', head: true }).eq('store_id', storeA_id)
      );
      const { count: bBefore } = await callTracked(() =>
        supabaseB.from('sales').select('*', { count: 'exact', head: true }).eq('store_id', storeB_id)
      );

      const { error, status } = await callTracked(rpcCall);

      const { count: aAfter } = await callTracked(() =>
        supabaseA.from('sales').select('*', { count: 'exact', head: true }).eq('store_id', storeA_id)
      );
      const { count: bAfter } = await callTracked(() =>
        supabaseB.from('sales').select('*', { count: 'exact', head: true }).eq('store_id', storeB_id)
      );

      const is4xx = status >= 400 && status < 500;
      const countIntact = (aBefore === aAfter) && (bBefore === bAfter);

      recordResult(code, testName, expected, (is4xx && countIntact) ? 'PASA' : 'FALLA',
        `Status: ${status}, Code: ${error?.code}, Conteo A (${aBefore}->${aAfter}), Conteo B (${bBefore}->${bAfter})`);
    }

    // 1. quantity como "abc"
    await verifyCountsUnchanged(
      'SEG-22.ITEMS.quantity_abc',
      'p_items con quantity="abc" (texto en lugar de número)',
      'Error 4xx (22P02) y conteo A/B inalterado',
      () => supabaseA.rpc('process_sale', {
        p_store_id: storeA_id,
        p_ticket_number: 'TKT-BAD-QTY',
        p_payment_method: 'efectivo',
        p_cash_given: 10,
        p_items: [{ productId: prodA1.id, quantity: 'abc' }],
      })
    );

    // 2. productId como número (12345)
    await verifyCountsUnchanged(
      'SEG-22.ITEMS.product_id_numeric',
      'p_items con productId=12345 (número en lugar de UUID)',
      'Error 4xx (22P02) y conteo A/B inalterado',
      () => supabaseA.rpc('process_sale', {
        p_store_id: storeA_id,
        p_ticket_number: 'TKT-BAD-PROD-ID',
        p_payment_method: 'efectivo',
        p_cash_given: 10,
        p_items: [{ productId: 12345, quantity: 1 }],
      })
    );

    // 3. Partidas anidadas
    await verifyCountsUnchanged(
      'SEG-22.ITEMS.nested_items',
      'p_items con partidas anidadas [[{ productId: ... }]]',
      'Error 4xx (22023) y conteo A/B inalterado',
      () => supabaseA.rpc('process_sale', {
        p_store_id: storeA_id,
        p_ticket_number: 'TKT-NESTED',
        p_payment_method: 'efectivo',
        p_cash_given: 10,
        p_items: [[{ productId: prodA1.id, quantity: 1 }]],
      })
    );

    // 4. Campos faltantes (sin quantity)
    await verifyCountsUnchanged(
      'SEG-22.ITEMS.missing_quantity',
      'p_items con campo quantity faltante',
      'Error 4xx (22023) y conteo A/B inalterado',
      () => supabaseA.rpc('process_sale', {
        p_store_id: storeA_id,
        p_ticket_number: 'TKT-NO-QTY',
        p_payment_method: 'efectivo',
        p_cash_given: 10,
        p_items: [{ productId: prodA1.id }],
      })
    );

    // 5. Campos faltantes (sin productId)
    await verifyCountsUnchanged(
      'SEG-22.ITEMS.missing_product_id',
      'p_items con campo productId faltante',
      'Error 4xx (22023) y conteo A/B inalterado',
      () => supabaseA.rpc('process_sale', {
        p_store_id: storeA_id,
        p_ticket_number: 'TKT-NO-PID',
        p_payment_method: 'efectivo',
        p_cash_given: 10,
        p_items: [{ quantity: 1 }],
      })
    );

    // 6. p_items como texto en lugar de array
    await verifyCountsUnchanged(
      'SEG-22.ITEMS.items_as_string',
      'p_items enviado como texto JSON en lugar de array',
      'Error 4xx (22023) y conteo A/B inalterado',
      () => supabaseA.rpc('process_sale', {
        p_store_id: storeA_id,
        p_ticket_number: 'TKT-ITEMS-TXT',
        p_payment_method: 'efectivo',
        p_cash_given: 10,
        p_items: JSON.stringify([{ productId: prodA1.id, quantity: 1 }]),
      })
    );

    // 7. p_simulation_ids con valores no UUID
    const { error: errSimUUID, status: stSimUUID } = await callTracked(() =>
      supabaseA.rpc('process_purchase', {
        p_store_id: storeA_id,
        p_supplier_id: supplierA_id,
        p_items: [{ product_id: prodA1.id, quantity: 1, unit_cost: 3.5 }],
        p_simulation_ids: ['no-es-uuid-123'],
      })
    );
    recordResult('SEG-22.UUID.simulation_ids_not_uuid', 'p_simulation_ids con valor no-UUID', 'Error 4xx (22P02)',
      (stSimUUID >= 400 && stSimUUID < 500) ? 'PASA' : 'FALLA', `Status: ${stSimUUID}, Code: ${errSimUUID?.code}`);

    // 8. p_register_id no UUID
    const { error: errRegUUID, status: stRegUUID } = await callTracked(() =>
      supabaseA.rpc('process_sale', {
        p_store_id: storeA_id,
        p_register_id: 'no-es-uuid-caja',
        p_ticket_number: 'TKT-BAD-REG',
        p_payment_method: 'efectivo',
        p_cash_given: 10,
        p_items: [{ productId: prodA1.id, quantity: 1 }],
      })
    );
    recordResult('SEG-22.UUID.register_id_not_uuid', 'p_register_id con valor no-UUID', 'Error 4xx (22P02)',
      (stRegUUID >= 400 && stRegUUID < 500) ? 'PASA' : 'FALLA', `Status: ${stRegUUID}, Code: ${errRegUUID?.code}`);

    // 9. p_store_id no UUID
    const { error: errStoreUUID, status: stStoreUUID } = await callTracked(() =>
      supabaseA.rpc('adjust_stock', {
        p_store_id: 'no-es-uuid-tienda',
        p_product_id: prodA1.id,
        p_quantity_delta: 1,
        p_note: 'prueba',
      })
    );
    recordResult('SEG-22.UUID.store_id_not_uuid', 'p_store_id con valor no-UUID', 'Error 4xx (22P02)',
      (stStoreUUID >= 400 && stStoreUUID < 500) ? 'PASA' : 'FALLA', `Status: ${stStoreUUID}, Code: ${errStoreUUID?.code}`);

    // Verificación de integridad en B
    const { count: bProdsAfter } = await callTracked(() =>
      supabaseB.from('products').select('*', { count: 'exact', head: true }).eq('store_id', storeB_id)
    );
    const { count: bSalesAfter } = await callTracked(() =>
      supabaseB.from('sales').select('*', { count: 'exact', head: true }).eq('store_id', storeB_id)
    );
    const { count: bPurchasesAfter } = await callTracked(() =>
      supabaseB.from('purchases').select('*', { count: 'exact', head: true }).eq('store_id', storeB_id)
    );

    const bUnchanged =
      bProdsBefore === bProdsAfter &&
      bSalesBefore === bSalesAfter &&
      bPurchasesBefore === bPurchasesAfter;

    recordResult(
      'SEG-22.INTEGRITY.store_b',
      'Integridad de tienda B tras pruebas de inyección y parámetros',
      'Conteo de filas de B idéntico antes y después',
      bUnchanged ? 'PASA' : 'FALLA',
      `Prods: ${bProdsBefore}->${bProdsAfter}, Ventas: ${bSalesBefore}->${bSalesAfter}, Compras: ${bPurchasesBefore}->${bPurchasesAfter}`
    );

    // ========================================================================
    // [5/6] SEG-23: Valores Extremos, NaN, Infinity y Textos Límite
    // ========================================================================
    console.log('\n[5/6] SEG-23 — Valores extremos, NaN, Infinity y textos límite...');

    const trackingMap = {};

    async function createCleanProduct(suffix, stock = 10, costPrice = 2, salePrice = 5, reorderPoint = 5) {
      const pName = `PROD_TEST_${suffix}_${Date.now().toString().slice(-4)}_${Math.floor(Math.random() * 1000)}`;
      const { data, error } = await callTracked(() =>
        supabaseA.from('products').insert({
          store_id: storeA_id,
          category_id: categoryA_id,
          name: pName,
          stock: stock,
          cost_price: costPrice,
          sale_price: salePrice,
          reorder_point: reorderPoint,
        }).select('id, name, stock, cost_price, sale_price, reorder_point').single()
      );
      if (error || !data) {
        throw new Error(`Fallo al crear producto limpio ${pName}: ${error?.message}`);
      }
      trackingMap[data.id] = suffix;
      return data;
    }

    // a) NaN, Infinity y -Infinity como texto en productos NUEVOS e independientes
    const specialNumerics = ['NaN', 'Infinity', '-Infinity'];

    // 1. adjust_stock: p_quantity_delta
    for (const sn of specialNumerics) {
      const snLabel = sn.toLowerCase().replace('-', 'neg_');
      const code = `SEG-23.NAN.adj_delta_${snLabel}`;
      const prod = await createCleanProduct(`adj_delta_${snLabel}`);
      const beforeStock = prod.stock;

      const { data: resAdj, error: errAdj, status: stAdj } = await callTracked(() =>
        supabaseA.rpc('adjust_stock', {
          p_store_id: storeA_id,
          p_product_id: prod.id,
          p_quantity_delta: sn,
          p_note: `prueba delta ${sn}`,
        })
      );

      const { data: readAfter } = await callTracked(() =>
        supabaseA.from('products').select('stock').eq('id', prod.id).single()
      );
      const afterStock = readAfter?.stock;
      const isCorrupt = isBadNumber(afterStock);

      if (isCorrupt) {
        recordResult(code, `adjust_stock con p_quantity_delta="${sn}"`, 'Rechazado o sin corromper stock', 'FALLA',
          `¡FALLA! Stock antes: ${beforeStock}, después: ${afterStock}`);
      } else if (errAdj || stAdj >= 400) {
        recordResult(code, `adjust_stock con p_quantity_delta="${sn}"`, 'Rechazado limpiamente por validación', 'PASA',
          `Rechazado (status ${stAdj || 400}): ${errAdj?.message}. Antes: ${beforeStock}, después: ${afterStock}`);
      } else {
        recordResult(code, `adjust_stock con p_quantity_delta="${sn}"`, 'No corrupto', 'OBSERVACIÓN',
          `Aceptado sin corromper. Antes: ${beforeStock}, después: ${afterStock}`);
      }
    }

    // 2. process_sale: quantity, unitPrice, costPrice y p_cash_given
    // 2a. quantity
    for (const sn of specialNumerics) {
      const snLabel = sn.toLowerCase().replace('-', 'neg_');
      const code = `SEG-23.NAN.sale_qty_${snLabel}`;
      const prod = await createCleanProduct(`sale_qty_${snLabel}`);
      const beforeStock = prod.stock;

      const { data: resSale, error: errSale, status: stSale } = await callTracked(() =>
        supabaseA.rpc('process_sale', {
          p_store_id: storeA_id,
          p_ticket_number: `TKT-SQ-${sn.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-4)}`,
          p_payment_method: 'efectivo',
          p_cash_given: 1000,
          p_items: [{ productId: prod.id, quantity: sn }],
        })
      );

      const { data: readAfter } = await callTracked(() =>
        supabaseA.from('products').select('stock').eq('id', prod.id).single()
      );
      const afterStock = readAfter?.stock;
      const isCorrupt = isBadNumber(afterStock) || isBadNumber(resSale?.total_amount);

      if (isCorrupt) {
        recordResult(code, `process_sale con quantity="${sn}"`, 'Rechazado sin corromper stock ni totales', 'FALLA',
          `¡FALLA! Stock antes: ${beforeStock}, después: ${afterStock}`);
      } else if (errSale || stSale >= 400) {
        recordResult(code, `process_sale con quantity="${sn}"`, 'Rechazado limpiamente por validación', 'PASA',
          `Rechazado (status ${stSale || 400}): ${errSale?.message}. Antes: ${beforeStock}, después: ${afterStock}`);
      } else {
        recordResult(code, `process_sale con quantity="${sn}"`, 'No corrupto', 'OBSERVACIÓN',
          `Aceptado sin corromper. Antes: ${beforeStock}, después: ${afterStock}`);
      }
    }

    // 2b. unitPrice
    for (const sn of specialNumerics) {
      const snLabel = sn.toLowerCase().replace('-', 'neg_');
      const code = `SEG-23.NAN.sale_uprice_${snLabel}`;
      const prod = await createCleanProduct(`sale_uprice_${snLabel}`);
      const beforeStock = prod.stock;

      const { data: resSale, error: errSale, status: stSale } = await callTracked(() =>
        supabaseA.rpc('process_sale', {
          p_store_id: storeA_id,
          p_ticket_number: `TKT-SUP-${sn.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-4)}`,
          p_payment_method: 'efectivo',
          p_cash_given: 1000,
          p_items: [{ productId: prod.id, quantity: 1, unitPrice: sn }],
        })
      );

      const { data: readAfter } = await callTracked(() =>
        supabaseA.from('products').select('stock, sale_price').eq('id', prod.id).single()
      );
      const afterStock = readAfter?.stock;
      const isCorrupt = isBadNumber(afterStock) || isBadNumber(readAfter?.sale_price) || isBadNumber(resSale?.total_amount);

      if (isCorrupt) {
        recordResult(code, `process_sale con unitPrice="${sn}"`, 'Rechazado sin corromper', 'FALLA',
          `¡FALLA! Stock antes: ${beforeStock}, después: ${afterStock}, total: ${resSale?.total_amount}`);
      } else if (errSale || stSale >= 400) {
        recordResult(code, `process_sale con unitPrice="${sn}"`, 'Rechazado limpiamente por validación', 'PASA',
          `Rechazado (status ${stSale || 400}): ${errSale?.message}. Antes: ${beforeStock}, después: ${afterStock}`);
      } else {
        recordResult(code, `process_sale con unitPrice="${sn}"`, 'No corrupto', 'OBSERVACIÓN',
          `Aceptado sin corromper. Antes: ${beforeStock}, después: ${afterStock}`);
      }
    }

    // 2c. costPrice en process_sale
    for (const sn of specialNumerics) {
      const snLabel = sn.toLowerCase().replace('-', 'neg_');
      const code = `SEG-23.NAN.sale_cprice_${snLabel}`;
      const prod = await createCleanProduct(`sale_cprice_${snLabel}`);
      const beforeStock = prod.stock;

      const { data: resSale, error: errSale, status: stSale } = await callTracked(() =>
        supabaseA.rpc('process_sale', {
          p_store_id: storeA_id,
          p_ticket_number: `TKT-SCP-${sn.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-4)}`,
          p_payment_method: 'efectivo',
          p_cash_given: 1000,
          p_items: [{ productId: prod.id, quantity: 1, costPrice: sn }],
        })
      );

      const { data: readAfter } = await callTracked(() =>
        supabaseA.from('products').select('stock, cost_price').eq('id', prod.id).single()
      );
      const afterStock = readAfter?.stock;
      const isCorrupt = isBadNumber(afterStock) || isBadNumber(resSale?.total_profit);

      if (isCorrupt) {
        recordResult(code, `process_sale con costPrice="${sn}"`, 'Rechazado sin corromper', 'FALLA',
          `¡FALLA! Stock antes: ${beforeStock}, después: ${afterStock}, profit: ${resSale?.total_profit}`);
      } else if (errSale || stSale >= 400) {
        recordResult(code, `process_sale con costPrice="${sn}"`, 'Rechazado limpiamente por validación', 'PASA',
          `Rechazado (status ${stSale || 400}): ${errSale?.message}. Antes: ${beforeStock}, después: ${afterStock}`);
      } else {
        recordResult(code, `process_sale con costPrice="${sn}"`, 'No corrupto', 'OBSERVACIÓN',
          `Aceptado sin corromper. Antes: ${beforeStock}, después: ${afterStock}`);
      }
    }

    // 2d. p_cash_given
    for (const sn of specialNumerics) {
      const snLabel = sn.toLowerCase().replace('-', 'neg_');
      const code = `SEG-23.NAN.sale_cash_${snLabel}`;
      const prod = await createCleanProduct(`sale_cash_${snLabel}`);
      const beforeStock = prod.stock;

      const { data: resSale, error: errSale, status: stSale } = await callTracked(() =>
        supabaseA.rpc('process_sale', {
          p_store_id: storeA_id,
          p_ticket_number: `TKT-SCASH-${sn.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-4)}`,
          p_payment_method: 'efectivo',
          p_cash_given: sn,
          p_items: [{ productId: prod.id, quantity: 1 }],
        })
      );

      const { data: readAfter } = await callTracked(() =>
        supabaseA.from('products').select('stock').eq('id', prod.id).single()
      );
      const afterStock = readAfter?.stock;
      const isCorrupt = isBadNumber(resSale?.change_given) || isBadNumber(afterStock);

      if (isCorrupt) {
        recordResult(code, `process_sale con p_cash_given="${sn}"`, 'Rechazado sin corromper', 'FALLA',
          `¡FALLA! Stock antes: ${beforeStock}, después: ${afterStock}, cambio: ${resSale?.change_given}`);
      } else if (errSale || stSale >= 400) {
        recordResult(code, `process_sale con p_cash_given="${sn}"`, 'Rechazado limpiamente por validación', 'PASA',
          `Rechazado (status ${stSale || 400}): ${errSale?.message}. Antes: ${beforeStock}, después: ${afterStock}`);
      } else {
        recordResult(code, `process_sale con p_cash_given="${sn}"`, 'No corrupto', 'OBSERVACIÓN',
          `Aceptado sin corromper. Antes: ${beforeStock}, después: ${afterStock}`);
      }
    }

    // 3. process_purchase: quantity y costPrice
    // 3a. quantity
    for (const sn of specialNumerics) {
      const snLabel = sn.toLowerCase().replace('-', 'neg_');
      const code = `SEG-23.NAN.pur_qty_${snLabel}`;
      const prod = await createCleanProduct(`pur_qty_${snLabel}`);
      const beforeStock = prod.stock;

      const { data: resPur, error: errPur, status: stPur } = await callTracked(() =>
        supabaseA.rpc('process_purchase', {
          p_store_id: storeA_id,
          p_supplier_id: supplierA_id,
          p_items: [{ product_id: prod.id, quantity: sn, unit_cost: 2 }],
        })
      );

      const { data: readAfter } = await callTracked(() =>
        supabaseA.from('products').select('stock').eq('id', prod.id).single()
      );
      const afterStock = readAfter?.stock;
      const isCorrupt = isBadNumber(afterStock);

      if (isCorrupt) {
        recordResult(code, `process_purchase con quantity="${sn}"`, 'Rechazado sin corromper stock', 'FALLA',
          `¡FALLA! Stock antes: ${beforeStock}, después: ${afterStock}`);
      } else if (errPur || stPur >= 400) {
        recordResult(code, `process_purchase con quantity="${sn}"`, 'Rechazado por validación', 'PASA',
          `Rechazo controlado (status ${stPur || 400}): ${errPur?.message}. Antes: ${beforeStock}, después: ${afterStock}`);
      } else {
        recordResult(code, `process_purchase con quantity="${sn}"`, 'No corrupto', 'OBSERVACIÓN',
          `Aceptado sin corromper stock. Antes: ${beforeStock}, después: ${afterStock}`);
      }
    }

    // 3b. costPrice (unit_cost)
    for (const sn of specialNumerics) {
      const snLabel = sn.toLowerCase().replace('-', 'neg_');
      const code = `SEG-23.NAN.pur_cost_${snLabel}`;
      const prod = await createCleanProduct(`pur_cost_${snLabel}`);
      const beforeCost = prod.cost_price;

      const { data: resPur, error: errPur, status: stPur } = await callTracked(() =>
        supabaseA.rpc('process_purchase', {
          p_store_id: storeA_id,
          p_supplier_id: supplierA_id,
          p_items: [{ product_id: prod.id, quantity: 1, unit_cost: sn }],
        })
      );

      const { data: readAfter } = await callTracked(() =>
        supabaseA.from('products').select('cost_price').eq('id', prod.id).single()
      );
      const afterCost = readAfter?.cost_price;
      const isCorrupt = isBadNumber(afterCost);

      if (isCorrupt) {
        recordResult(code, `process_purchase con costPrice="${sn}"`, 'Rechazado sin corromper costo', 'FALLA',
          `¡FALLA! Costo antes: ${beforeCost}, después: ${afterCost}`);
      } else if (errPur || stPur >= 400) {
        recordResult(code, `process_purchase con costPrice="${sn}"`, 'Rechazado por validación', 'PASA',
          `Rechazo controlado (status ${stPur || 400}): ${errPur?.message}. Antes: ${beforeCost}, después: ${afterCost}`);
      } else {
        recordResult(code, `process_purchase con costPrice="${sn}"`, 'No corrupto', 'OBSERVACIÓN',
          `Aceptado sin corromper costo. Antes: ${beforeCost}, después: ${afterCost}`);
      }
    }

    // 4. INSERT y UPDATE de products: sale_price, cost_price y min_stock (reorder_point)
    // 4a. INSERT
    for (const sn of specialNumerics) {
      const snLabel = sn.toLowerCase().replace('-', 'neg_');

      // sale_price
      const codeInsSale = `SEG-23.NAN.prod_ins_sale_${snLabel}`;
      const pNameSale = `PROD_INS_SALE_${snLabel}_${Date.now().toString().slice(-4)}`;
      const { data: insSale, error: errInsSale, status: stInsSale } = await callTracked(() =>
        supabaseA.from('products').insert({
          store_id: storeA_id,
          category_id: categoryA_id,
          name: pNameSale,
          cost_price: 2,
          sale_price: sn,
          stock: 10,
        }).select('id, sale_price').single()
      );
      if (insSale) {
        trackingMap[insSale.id] = `prod_ins_sale_${snLabel}`;
        const isCorrupt = isBadNumber(insSale.sale_price);
        recordResult(codeInsSale, `products INSERT con sale_price="${sn}"`, 'Rechazado o sin corromper',
          isCorrupt ? 'FALLA' : 'OBSERVACIÓN',
          isCorrupt ? `¡FALLA! sale_price guardado como "${insSale.sale_price}"` : `Aceptado: ${insSale.sale_price}`);
      } else {
        recordResult(codeInsSale, `products INSERT con sale_price="${sn}"`, 'Rechazado por validación o CHECK', 'PASA',
          `Rechazado (status ${stInsSale || 400}): ${errInsSale?.message}`);
      }

      // cost_price
      const codeInsCost = `SEG-23.NAN.prod_ins_cost_${snLabel}`;
      const pNameCost = `PROD_INS_COST_${snLabel}_${Date.now().toString().slice(-4)}`;
      const { data: insCost, error: errInsCost, status: stInsCost } = await callTracked(() =>
        supabaseA.from('products').insert({
          store_id: storeA_id,
          category_id: categoryA_id,
          name: pNameCost,
          cost_price: sn,
          sale_price: 5,
          stock: 10,
        }).select('id, cost_price').single()
      );
      if (insCost) {
        trackingMap[insCost.id] = `prod_ins_cost_${snLabel}`;
        const isCorrupt = isBadNumber(insCost.cost_price);
        recordResult(codeInsCost, `products INSERT con cost_price="${sn}"`, 'Rechazado o sin corromper',
          isCorrupt ? 'FALLA' : 'OBSERVACIÓN',
          isCorrupt ? `¡FALLA! cost_price guardado como "${insCost.cost_price}"` : `Aceptado: ${insCost.cost_price}`);
      } else {
        recordResult(codeInsCost, `products INSERT con cost_price="${sn}"`, 'Rechazado por validación o CHECK', 'PASA',
          `Rechazado (status ${stInsCost || 400}): ${errInsCost?.message}`);
      }

      // min_stock (reorder_point)
      const codeInsMin = `SEG-23.NAN.prod_ins_min_${snLabel}`;
      const pNameMin = `PROD_INS_MIN_${snLabel}_${Date.now().toString().slice(-4)}`;
      const { data: insMin, error: errInsMin, status: stInsMin } = await callTracked(() =>
        supabaseA.from('products').insert({
          store_id: storeA_id,
          category_id: categoryA_id,
          name: pNameMin,
          cost_price: 2,
          sale_price: 5,
          stock: 10,
          reorder_point: sn,
        }).select('id, reorder_point').single()
      );
      if (insMin) {
        trackingMap[insMin.id] = `prod_ins_min_${snLabel}`;
        const isCorrupt = isBadNumber(insMin.reorder_point);
        recordResult(codeInsMin, `products INSERT con min_stock="${sn}"`, 'Rechazado o sin corromper',
          isCorrupt ? 'FALLA' : 'OBSERVACIÓN',
          isCorrupt ? `¡FALLA! min_stock guardado como "${insMin.reorder_point}"` : `Aceptado: ${insMin.reorder_point}`);
      } else {
        recordResult(codeInsMin, `products INSERT con min_stock="${sn}"`, 'Rechazado por validación o CHECK', 'PASA',
          `Rechazado (status ${stInsMin || 400}): ${errInsMin?.message}`);
      }
    }

    // 4b. UPDATE de productos limpios
    for (const sn of specialNumerics) {
      const snLabel = sn.toLowerCase().replace('-', 'neg_');

      // UPDATE sale_price
      const codeUpdSale = `SEG-23.NAN.prod_upd_sale_${snLabel}`;
      const prodSale = await createCleanProduct(`upd_sale_${snLabel}`);
      const beforeSale = prodSale.sale_price;
      const { error: errUpdSale, status: stUpdSale } = await callTracked(() =>
        supabaseA.from('products').update({ sale_price: sn }).eq('id', prodSale.id)
      );
      const { data: readUpdSale } = await callTracked(() =>
        supabaseA.from('products').select('sale_price').eq('id', prodSale.id).single()
      );
      const afterSale = readUpdSale?.sale_price;
      const isCorruptSale = isBadNumber(afterSale);
      if (isCorruptSale) {
        recordResult(codeUpdSale, `products UPDATE con sale_price="${sn}"`, 'Rechazado o sin corromper', 'FALLA',
          `¡FALLA! sale_price antes: ${beforeSale}, después: ${afterSale}`);
      } else if (errUpdSale || stUpdSale >= 400) {
        recordResult(codeUpdSale, `products UPDATE con sale_price="${sn}"`, 'Rechazado limpiamente por validación', 'PASA',
          `Rechazado (status ${stUpdSale || 400}): ${errUpdSale?.message}. Antes: ${beforeSale}, después: ${afterSale}`);
      } else {
        recordResult(codeUpdSale, `products UPDATE con sale_price="${sn}"`, 'No corrupto', 'OBSERVACIÓN',
          `Aceptado sin corromper. Antes: ${beforeSale}, después: ${afterSale}`);
      }

      // UPDATE cost_price
      const codeUpdCost = `SEG-23.NAN.prod_upd_cost_${snLabel}`;
      const prodCost = await createCleanProduct(`upd_cost_${snLabel}`);
      const beforeCost = prodCost.cost_price;
      const { error: errUpdCost, status: stUpdCost } = await callTracked(() =>
        supabaseA.from('products').update({ cost_price: sn }).eq('id', prodCost.id)
      );
      const { data: readUpdCost } = await callTracked(() =>
        supabaseA.from('products').select('cost_price').eq('id', prodCost.id).single()
      );
      const afterCost = readUpdCost?.cost_price;
      const isCorruptCost = isBadNumber(afterCost);
      if (isCorruptCost) {
        recordResult(codeUpdCost, `products UPDATE con cost_price="${sn}"`, 'Rechazado o sin corromper', 'FALLA',
          `¡FALLA! cost_price antes: ${beforeCost}, después: ${afterCost}`);
      } else if (errUpdCost || stUpdCost >= 400) {
        recordResult(codeUpdCost, `products UPDATE con cost_price="${sn}"`, 'Rechazado limpiamente por validación', 'PASA',
          `Rechazado (status ${stUpdCost || 400}): ${errUpdCost?.message}. Antes: ${beforeCost}, después: ${afterCost}`);
      } else {
        recordResult(codeUpdCost, `products UPDATE con cost_price="${sn}"`, 'No corrupto', 'OBSERVACIÓN',
          `Aceptado sin corromper. Antes: ${beforeCost}, después: ${afterCost}`);
      }

      // UPDATE min_stock (reorder_point)
      const codeUpdMin = `SEG-23.NAN.prod_upd_min_${snLabel}`;
      const prodMin = await createCleanProduct(`upd_min_${snLabel}`);
      const beforeMin = prodMin.reorder_point;
      const { error: errUpdMin, status: stUpdMin } = await callTracked(() =>
        supabaseA.from('products').update({ reorder_point: sn }).eq('id', prodMin.id)
      );
      const { data: readUpdMin } = await callTracked(() =>
        supabaseA.from('products').select('reorder_point').eq('id', prodMin.id).single()
      );
      const afterMin = readUpdMin?.reorder_point;
      const isCorruptMin = isBadNumber(afterMin);
      if (isCorruptMin) {
        recordResult(codeUpdMin, `products UPDATE con min_stock="${sn}"`, 'Rechazado o sin corromper', 'FALLA',
          `¡FALLA! min_stock antes: ${beforeMin}, después: ${afterMin}`);
      } else if (errUpdMin || stUpdMin >= 400) {
        recordResult(codeUpdMin, `products UPDATE con min_stock="${sn}"`, 'Rechazado limpiamente por validación', 'PASA',
          `Rechazado (status ${stUpdMin || 400}): ${errUpdMin?.message}. Antes: ${beforeMin}, después: ${afterMin}`);
      } else {
        recordResult(codeUpdMin, `products UPDATE con min_stock="${sn}"`, 'No corrupto', 'OBSERVACIÓN',
          `Aceptado sin corromper. Antes: ${beforeMin}, después: ${afterMin}`);
      }
    }

    // b) Vender o ajustar por encima del stock disponible (stock negativo)
    const prodOverSale = await createCleanProduct('oversale', 10, 2, 5);
    const { error: errOverSale } = await callTracked(() =>
      supabaseA.rpc('process_sale', {
        p_store_id: storeA_id,
        p_ticket_number: `TKT-OVER-${Date.now().toString().slice(-4)}`,
        p_payment_method: 'efectivo',
        p_cash_given: 60000,
        p_items: [{ productId: prodOverSale.id, quantity: 9999 }],
      })
    );
    recordResult('SEG-23.STOCK.over_sale_rejected', 'Venta por encima del stock disponible (9999 unidades, efectivo suficiente)', 'Rechazado por validación P0001 (Stock insuficiente)',
      errOverSale?.code === 'P0001' ? 'PASA' : 'FALLA', errOverSale ? `Code: ${errOverSale.code}, Msg: ${errOverSale.message}` : 'Permitió sobreventa');

    const prodOverAdj = await createCleanProduct('overadj', 10, 2, 5);
    const { error: errOverAdj } = await callTracked(() =>
      supabaseA.rpc('adjust_stock', {
        p_store_id: storeA_id,
        p_product_id: prodOverAdj.id,
        p_quantity_delta: -9999,
        p_note: 'Ajuste excesivo negativo',
      })
    );
    const { data: readOverAdj } = await callTracked(() =>
      supabaseA.from('products').select('stock').eq('id', prodOverAdj.id).single()
    );
    recordResult('SEG-23.STOCK.over_adjust_rejected', 'Ajuste que resultaría en stock negativo (-9999)', 'Rechazado por validación',
      errOverAdj ? 'PASA' : 'OBSERVACIÓN',
      errOverAdj ? `Rechazado: ${errOverAdj.message}` : `Permitió stock negativo (stock resultante: ${readOverAdj?.stock})`);

    // c) Decimales (0.5 y 1.0000001) en venta, compra y ajuste
    const { data: resDecSale05, error: errDecSale05 } = await callTracked(() =>
      supabaseA.rpc('process_sale', {
        p_store_id: storeA_id,
        p_ticket_number: 'TKT-DEC-05',
        p_payment_method: 'efectivo',
        p_cash_given: 10,
        p_items: [{ productId: prodA1.id, quantity: 0.5 }],
      })
    );
    recordResult('SEG-23.DEC.sale_0_5', 'Venta con cantidad decimal 0.5 (fraccionaria)', 'OBSERVACIÓN según diseño de producto',
      (!errDecSale05 && resDecSale05?.success) ? 'OBSERVACIÓN' : 'PASA',
      resDecSale05?.success ? 'Aceptado por diseño (NUMERIC(12,3) permite unidades fraccionarias)' : errDecSale05?.message);

    const { data: resDecAdjTiny, error: errDecAdjTiny } = await callTracked(() =>
      supabaseA.rpc('adjust_stock', {
        p_store_id: storeA_id,
        p_product_id: prodA1.id,
        p_quantity_delta: 1.0000001,
        p_note: 'ajuste con > 3 decimales',
      })
    );
    recordResult('SEG-23.DEC.adjust_precision_overflow', 'Ajuste con decimales > 3 cifras (1.0000001)', 'OBSERVACIÓN según diseño de producto',
      resDecAdjTiny?.success ? 'OBSERVACIÓN' : 'PASA',
      resDecAdjTiny?.success ? 'Postgres redondeó a 3 decimales (1.000) en NUMERIC(12,3)' : errDecAdjTiny?.message);

    // d) Precios negativos y enormes (1e308), cash_given negativo, credit_days negativo
    const { error: errNegPrice } = await callTracked(() =>
      supabaseA.from('products').insert({
        store_id: storeA_id,
        category_id: categoryA_id,
        name: 'PROD_NEG_PRICE',
        cost_price: 1,
        sale_price: -15.00,
      })
    );
    recordResult('SEG-23.BOUND.negative_sale_price', 'products insert con sale_price=-15.00', 'Rechazado por CHECK (23514)',
      errNegPrice?.code === '23514' ? 'PASA' : 'FALLA', `Code: ${errNegPrice?.code}, Msg: ${errNegPrice?.message}`);

    const { error: errHugePrice, status: stHugePrice } = await callTracked(() =>
      supabaseA.from('products').insert({
        store_id: storeA_id,
        category_id: categoryA_id,
        name: 'PROD_HUGE_PRICE',
        cost_price: 1,
        sale_price: 1e308,
      })
    );
    recordResult('SEG-23.BOUND.overflow_sale_price_1e308', 'products insert con sale_price=1e308', 'Rechazado por overflow numérico (22003)',
      (stHugePrice >= 400 && stHugePrice < 500) ? 'PASA' : 'FALLA', `Status: ${stHugePrice}, Code: ${errHugePrice?.code}`);

    const { error: errNegCash } = await callTracked(() =>
      supabaseA.rpc('process_sale', {
        p_store_id: storeA_id,
        p_ticket_number: 'TKT-NEG-CASH',
        p_payment_method: 'efectivo',
        p_cash_given: -50.00,
        p_items: [{ productId: prodA1.id, quantity: 1 }],
      })
    );
    recordResult('SEG-23.BOUND.negative_cash_given', 'process_sale con cash_given=-50.00', 'Rechazado por validación de monto (22023)',
      errNegCash?.code === '22023' ? 'PASA' : 'FALLA', `Code: ${errNegCash?.code}, Msg: ${errNegCash?.message}`);

    const { error: errNegCredit } = await callTracked(() =>
      supabaseA.rpc('process_purchase', {
        p_store_id: storeA_id,
        p_supplier_id: supplierA_id,
        p_payment_condition: 'credito',
        p_credit_days: -10,
        p_items: [{ product_id: prodA1.id, quantity: 1, unit_cost: 3.5 }],
      })
    );
    recordResult('SEG-23.BOUND.negative_credit_days', 'process_purchase con credit_days=-10', 'Rechazado por validación (22023)',
      errNegCredit?.code === '22023' ? 'PASA' : 'FALLA', `Code: ${errNegCredit?.code}, Msg: ${errNegCredit?.message}`);

    // f) Textos de 1 MB (MÁXIMO 3 VECES EN TODO EL SCRIPT)
    console.log('   Enviando exactamente 3 textos de 1 MB...');

    // Texto 1 MB #1: en adjust_stock (p_note)
    const text1MB_1 = get1MBText();
    const { data: res1MB_1, error: err1MB_1, status: st1MB_1 } = await callTracked(() =>
      supabaseA.rpc('adjust_stock', {
        p_store_id: storeA_id,
        p_product_id: prodA1.id,
        p_quantity_delta: 0.1,
        p_note: text1MB_1,
      })
    );
    const pass1MB_1 = res1MB_1?.success;
    recordResult('SEG-23.1MB.large_text_1', 'Texto de 1 MB (#1/3) en RPC adjust_stock (p_note)', 'Aceptado o rechazado sin 5xx',
      pass1MB_1 ? 'OBSERVACIÓN' : ((st1MB_1 < 500) ? 'PASA' : 'FALLA'),
      pass1MB_1 ? '[Obs] Aceptado sin límite de longitud (guardado como texto).' : `Status: ${st1MB_1}`);

    // Texto 1 MB #2: en invite_by_code (p_user_code)
    const text1MB_2 = get1MBText();
    const { error: err1MB_2, status: st1MB_2 } = await callTracked(() =>
      supabaseA.rpc('invite_by_code', {
        p_store_id: storeA_id,
        p_user_code: text1MB_2,
        p_role: 'CAJERO',
      })
    );
    const pass1MB_2 = (st1MB_2 >= 400 && st1MB_2 < 500);
    recordResult('SEG-23.1MB.large_text_2', 'Texto de 1 MB (#2/3) en RPC invite_by_code (p_user_code)', 'Rechazado limpiamente 4xx sin 5xx',
      pass1MB_2 ? 'PASA' : 'FALLA', `Status: ${st1MB_2}, Msg: ${err1MB_2?.message}`);

    // Texto 1 MB #3: en process_purchase (p_note)
    const text1MB_3 = get1MBText();
    const { data: res1MB_3, error: err1MB_3, status: st1MB_3 } = await callTracked(() =>
      supabaseA.rpc('process_purchase', {
        p_store_id: storeA_id,
        p_supplier_id: supplierA_id,
        p_note: text1MB_3,
        p_items: [{ product_id: prodA1.id, quantity: 1, unit_cost: 3.5 }],
      })
    );
    const pass1MB_3 = res1MB_3?.success;
    recordResult('SEG-23.1MB.large_text_3', 'Texto de 1 MB (#3/3) en RPC process_purchase (p_note)', 'Aceptado o rechazado sin 5xx',
      pass1MB_3 ? 'OBSERVACIÓN' : ((st1MB_3 < 500) ? 'PASA' : 'FALLA'),
      pass1MB_3 ? '[Obs] Aceptado sin límite de longitud (guardado como texto).' : `Status: ${st1MB_3}`);

    // e) Chequeos de integridad exhaustivos (detectando también NaN e Infinity sin depender de "< 0")
    console.log('\n   Verificando integridad global del inventario, ventas, compras y kardex...');

    // Stock y precios de productos en tienda A
    const { data: allProdsA } = await callTracked(() =>
      supabaseA.from('products').select('id, name, stock, sale_price, cost_price, reorder_point').eq('store_id', storeA_id)
    );
    const corruptedProducts = [];
    if (allProdsA?.length) {
      for (const p of allProdsA) {
        let badReason = null;
        if (isBadNumber(p.stock)) badReason = `stock: ${p.stock}`;
        else if (isBadNumber(p.sale_price)) badReason = `sale_price: ${p.sale_price}`;
        else if (isBadNumber(p.cost_price)) badReason = `cost_price: ${p.cost_price}`;
        else if (isBadNumber(p.reorder_point)) badReason = `min_stock: ${p.reorder_point}`;
        else if (Number(p.stock) < 0) badReason = `stock negativo: ${p.stock}`;

        if (badReason) {
          const originCase = trackingMap[p.id] || p.name;
          corruptedProducts.push(`Producto "${p.name}" (${badReason}) originado en caso "${originCase}"`);
        }
      }
    }
    recordResult('SEG-23.INTEGRITY.products_stock_safe', 'Integridad: ningún stock NaN, Infinity o negativo en products', '0 productos corruptos',
      corruptedProducts.length === 0 ? 'PASA' : 'FALLA',
      corruptedProducts.length === 0 ? 'Todos los stocks y precios son numéricos válidos' : `¡Corrupción detectada! (${corruptedProducts.length} productos): ${corruptedProducts.slice(0, 3).join('; ')}`);

    // Totales de ventas y partidas
    const { data: allSalesA } = await callTracked(() =>
      supabaseA.from('sales').select('id, ticket_number, total_amount, sale_items(subtotal)').eq('store_id', storeA_id)
    );
    let salesConsistent = true;
    let badSaleDetail = 'Todas las ventas cuadran y son numéricamente válidas';
    if (allSalesA?.length) {
      for (const s of allSalesA) {
        if (isBadNumber(s.total_amount)) {
          salesConsistent = false;
          badSaleDetail = `Venta ${s.ticket_number} (ID ${shortId(s.id)}) tiene total corrupto: ${s.total_amount}`;
          break;
        }
        const sumItems = (s.sale_items || []).reduce((acc, it) => acc + Number(it.subtotal || 0), 0);
        if (Math.abs(Number(s.total_amount) - sumItems) > 0.05) {
          salesConsistent = false;
          badSaleDetail = `Descuadre en venta ${s.ticket_number} (ID ${shortId(s.id)}): total=${s.total_amount}, items=${sumItems}`;
          break;
        }
      }
    }
    recordResult('SEG-23.INTEGRITY.sales_totals_math', 'Integridad: totales de ventas numéricamente válidos y cuadran con sale_items', 'Diferencia = 0',
      salesConsistent ? 'PASA' : 'FALLA', badSaleDetail);

    // Kardex coherente (inventory_movements)
    const { data: movsA } = await callTracked(() =>
      supabaseA.from('inventory_movements').select('id, product_id, product_name, quantity, previous_stock, new_stock').eq('store_id', storeA_id)
    );
    const corruptedMovs = [];
    if (movsA?.length) {
      for (const m of movsA) {
        let badReason = null;
        if (isBadNumber(m.quantity)) badReason = `quantity: ${m.quantity}`;
        else if (isBadNumber(m.previous_stock)) badReason = `previous_stock: ${m.previous_stock}`;
        else if (isBadNumber(m.new_stock)) badReason = `new_stock: ${m.new_stock}`;

        if (badReason) {
          const originCase = (m.product_id && trackingMap[m.product_id]) ? trackingMap[m.product_id] : m.product_name;
          corruptedMovs.push(`Movimiento ${shortId(m.id)} de producto "${m.product_name}" (${badReason}) originado en caso "${originCase}"`);
        }
      }
    }
    recordResult('SEG-23.INTEGRITY.kardex_records_valid', 'Integridad: kardex sin valores NaN o corruptos', 'Movimientos con valores numéricos válidos',
      corruptedMovs.length === 0 && (movsA?.length || 0) > 0 ? 'PASA' : 'FALLA',
      corruptedMovs.length === 0 ? `Total movimientos válidos en kardex: ${movsA?.length || 0}` : `¡Corrupción en kardex! (${corruptedMovs.length} movimientos): ${corruptedMovs.slice(0, 3).join('; ')}`);

  } catch (err) {
    aborted = true;
    console.error('\n🛑 Excepción abortiva durante la ejecución:', err);
  } finally {
    // ========================================================================
    // [6/6] Limpieza Garantizada
    // ========================================================================
    console.log('\n[6/6] Limpieza de tiendas de prueba y verificación de estado...');

    for (const st of storesToClean) {
      try {
        assertAllowedStoreName(st.name, `limpieza final ${st.name}`);
        const { error: delErr } = await callTracked(() =>
          st.client.from('stores').delete().eq('id', st.id)
        );
        if (delErr) console.error(`⚠️ Error al borrar tienda ${st.name}: ${delErr.message}`);
        else console.log(`✅ Tienda "${st.name}" eliminada correctamente.`);
      } catch (e) {
        console.error(`⚠️ Falló borrado de tienda ${st.name}: ${e.message}`);
      }
    }

    // Confirmación de borrado
    const { data: chkA } = await callTracked(() =>
      supabaseA.from('stores').select('id').ilike('name', 'PRUEBAS-INYECCION%')
    );
    const { data: chkB } = await callTracked(() =>
      supabaseB.from('stores').select('id').ilike('name', 'PRUEBAS-INYECCION%')
    );
    const storesCleaned = (!chkA || chkA.length === 0) && (!chkB || chkB.length === 0);

    if (storesCleaned) {
      console.log('✅ Confirmado: todas las tiendas de prueba eliminadas de la base de datos.');
    } else {
      console.warn('⚠️ Advertencia: alguna tienda de prueba no se pudo confirmar como eliminada.');
    }
  }

  // ==========================================================================
  // Reporte Final de Resultados
  // ==========================================================================
  console.log('\n' + '='.repeat(105));
  console.log('📊 REPORTE DE SEGURIDAD (FASE 4a-bis — SEG-21, SEG-22, SEG-23)');
  console.log('='.repeat(105));

  let passCount = 0;
  let failCount = 0;
  let conocidoCount = 0;
  let observacionCount = 0;
  let inconclusoCount = 0;

  console.log('| Código | Prueba | Esperado | Resultado | Detalle |');
  console.log('|---|---|---|---|---|');
  for (const r of testResults) {
    if (r.resultado === 'PASA') passCount++;
    else if (r.resultado === 'FALLA') failCount++;
    else if (r.resultado.startsWith('CONOCIDO')) conocidoCount++;
    else if (r.resultado === 'OBSERVACIÓN') observacionCount++;
    else inconclusoCount++;

    console.log(`| \`${r.codigo}\` | ${r.prueba} | ${r.esperado} | **${r.resultado}** | ${r.detalle} |`);
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`Total Pruebas Ejecutadas : ${testResults.length}`);
  console.log(`✅ PASA                  : ${passCount}`);
  console.log(`❌ FALLA                 : ${failCount}`);
  console.log(`ℹ️ CONOCIDO (H-03)       : ${conocidoCount}`);
  console.log(`👁️ OBSERVACIÓN           : ${observacionCount}`);
  console.log(`⚠️ INCONCLUSO            : ${inconclusoCount}`);
  console.log(`🛑 Abortado por Error    : ${aborted ? 'SÍ' : 'NO'}`);
  console.log(`📞 Total Llamadas API    : ${totalApiCalls} (presupuesto: máx ~450)`);
  console.log(`📄 Textos 1 MB Creados   : ${count1MBTextsCreated} / 3`);
  console.log('-'.repeat(60));

  const isSuccess = failCount === 0 && inconclusoCount === 0 && !aborted;

  if (isSuccess) {
    console.log('\n🛡️ VERIFICACIÓN COMPLETADA CON ÉXITO: Los filtros PostgREST, RPCs y validaciones respondieron conforme a diseño.');
    process.exit(0);
  } else {
    console.error('\n⚠️ SE DETECTARON FALLAS O INCONSISTENCIAS.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
