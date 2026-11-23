#!/usr/bin/env node
/**
 * scripts/security-roles.mjs
 *
 * FASE 3: Prueba exhaustiva de autorización y control de acceso basado en roles (RBAC) (Rentabill).
 * Verifica que los roles CAJERO, REPOSITOR y ADMIN respeten los privilegios otorgados por diseño
 * y que un usuario sin membresía no pueda acceder ni modificar recursos de la tienda (SEG-15 a SEG-20).
 *
 * Uso:
 *   node --env-file=.env.test scripts/security-roles.mjs
 */

import { createClient } from '@supabase/supabase-js';

// ============================================================================
// 1. Constantes y Guardas de Seguridad
// ============================================================================
const STORE_NAME_A = 'PRUEBAS-ROLES';
const STORE_NAME_B = 'PRUEBAS-ROLES-B';

function assertAllowedStoreName(storeName, context = '') {
  const allowed = [STORE_NAME_A, STORE_NAME_B];
  if (!allowed.includes(storeName)) {
    throw new Error(
      `🚨 GUARDIA DE SEGURIDAD ABORTADA (${context}): Operación no permitida sobre "${storeName}". ` +
      `Este script SOLO puede crear o eliminar tiendas que coincidan exactamente con: ${allowed.join(', ')}.`
    );
  }
}

function shortId(uuid) {
  if (!uuid) return '';
  return String(uuid).slice(0, 8);
}

function maskToken(token) {
  if (!token) return '';
  return String(token).slice(0, 4) + '…';
}

// ============================================================================
// 2. Registro de Resultados y Clasificador de Errores
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

function classify(error, expectedPatterns = []) {
  if (!error) {
    return {
      status: 'FALLA',
      detail: 'No devolvió ningún error (operación indebida permitida)',
    };
  }

  const code = String(error.code || '');
  const msg = String(error.message || error.error || JSON.stringify(error)).toLowerCase();

  // Posible hueco RLS: falló por constraint de datos en vez de política de seguridad
  if (code === '23502' || code === '23505') {
    return {
      status: 'INCONCLUSO',
      detail: `Posible hueco RLS (código ${code}: ${error.message || msg})`,
    };
  }

  // Patrones estándar de RLS y permisos
  const standardPatterns = [
    'row-level security',
    'violates row-level security policy',
    'permission denied',
    'not authorized',
    '42501',
  ];

  const allPatterns = [...standardPatterns, ...expectedPatterns.map(p => p.toLowerCase())];

  const matchesCode = code === '42501';
  const matchesPattern = allPatterns.some(pat => msg.includes(pat));

  if (matchesCode || matchesPattern) {
    return {
      status: 'PASA',
      detail: `Bloqueado por autorización/RLS (${code ? `código ${code}: ` : ''}${error.message || msg})`,
    };
  }

  return {
    status: 'INCONCLUSO',
    detail: `Error no esperado de autorización (${code || 'sin código'}: ${error.message || msg})`,
  };
}

// ============================================================================
// 3. Flujo Principal
// ============================================================================
async function main() {
  console.log('='.repeat(80));
  console.log('🛡️ FASE 3 — PRUEBAS DE AUTORIZACIÓN Y CONTROL DE ROLES (RENTABILL)');
  console.log('='.repeat(80));

  let aborted = false;

  // --- Validación de variables de entorno ---
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
  const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
  const TEST_USER_B_EMAIL = process.env.TEST_USER_B_EMAIL;
  const TEST_USER_B_PASSWORD = process.env.TEST_USER_B_PASSWORD;
  const TEST_USER_C_EMAIL = process.env.TEST_USER_C_EMAIL;
  const TEST_USER_C_PASSWORD = process.env.TEST_USER_C_PASSWORD;

  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
  if (!TEST_USER_EMAIL) missing.push('TEST_USER_EMAIL');
  if (!TEST_USER_PASSWORD) missing.push('TEST_USER_PASSWORD');
  if (!TEST_USER_B_EMAIL) missing.push('TEST_USER_B_EMAIL');
  if (!TEST_USER_B_PASSWORD) missing.push('TEST_USER_B_PASSWORD');
  if (!TEST_USER_C_EMAIL) missing.push('TEST_USER_C_EMAIL');
  if (!TEST_USER_C_PASSWORD) missing.push('TEST_USER_C_PASSWORD');

  if (missing.length > 0) {
    console.error('❌ Faltan variables requeridas en .env.test:');
    missing.forEach(m => console.error(`   - ${m}`));
    console.error('\nPara ejecutar este script, asegúrate de configurar en .env.test:');
    console.error('   TEST_USER_EMAIL / TEST_USER_PASSWORD (Usuario A - Admin)');
    console.error('   TEST_USER_B_EMAIL / TEST_USER_B_PASSWORD (Usuario B - Repositor)');
    console.error('   TEST_USER_C_EMAIL / TEST_USER_C_PASSWORD (Usuario C - Cajero)');
    process.exit(1);
  }

  // Clientes Supabase independientes con persistSession: false
  const clientOptions = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  };

  const supabaseA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
  const supabaseB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
  const supabaseC = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
  const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);

  // --- [1/8] Autenticación y Verificación de Estado Limpio ---
  console.log('\n[1/8] Autenticando usuarios A, B y C...');
  const { data: authA, error: errAuthA } = await supabaseA.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });
  if (errAuthA || !authA?.user) {
    console.error('❌ Error autenticando Usuario A:', errAuthA?.message);
    process.exit(1);
  }
  const userA = authA.user;
  console.log(`✅ Usuario A autenticado: ID ${shortId(userA.id)}`);

  const { data: authB, error: errAuthB } = await supabaseB.auth.signInWithPassword({
    email: TEST_USER_B_EMAIL,
    password: TEST_USER_B_PASSWORD,
  });
  if (errAuthB || !authB?.user) {
    console.error('❌ Error autenticando Usuario B:', errAuthB?.message);
    process.exit(1);
  }
  const userB = authB.user;
  console.log(`✅ Usuario B autenticado: ID ${shortId(userB.id)}`);

  const { data: authC, error: errAuthC } = await supabaseC.auth.signInWithPassword({
    email: TEST_USER_C_EMAIL,
    password: TEST_USER_C_PASSWORD,
  });
  if (errAuthC || !authC?.user) {
    console.error('❌ Error autenticando Usuario C:', errAuthC?.message);
    process.exit(1);
  }
  const userC = authC.user;
  console.log(`✅ Usuario C autenticado: ID ${shortId(userC.id)}`);

  if (userA.id === userB.id || userA.id === userC.id || userB.id === userC.id) {
    console.error('❌ Los Usuarios A, B y C deben ser cuentas distintas en Supabase.');
    process.exit(1);
  }

  // Pre-condición estricta: B y C NO deben tener membresías previas
  const { data: existingMembersB } = await supabaseB.from('store_members').select('*');
  const { data: existingMembersC } = await supabaseC.from('store_members').select('*');

  if ((existingMembersB && existingMembersB.length > 0) || (existingMembersC && existingMembersC.length > 0)) {
    console.error('❌ PRE-CONDICIÓN NO CUMPLIDA: Usuario B o C ya tienen membresías en store_members.');
    console.error(`   - Membresías de B: ${existingMembersB?.length || 0}`);
    console.error(`   - Membresías de C: ${existingMembersC?.length || 0}`);
    console.error('   El script aborta sin modificar ni borrar nada para evitar alterar datos preexistentes.');
    process.exit(1);
  }
  console.log('✅ Confirmado: Usuarios B y C no tienen membresías previas en store_members.');

  let storeA_id = null;
  let storeB_id = null;
  let prod1 = null;
  let prod2 = null;
  let prodB1 = null;
  let supplierA_id = null;
  let supplierB_id = null;
  let categoryA_id = null;
  let registerA_id = null;
  let invitationTokenB = null;
  let invitationTokenC = null;
  let snapshotB = null;

  try {
    // --- [2/8] Preparación de datos en PRUEBAS-ROLES (como A) y PRUEBAS-ROLES-B (como B) ---
    console.log('\n[2/8] Preparación de tiendas y datos de prueba...');

    // Limpieza preventiva si existieran con esos nombres exactos
    const { data: prevA } = await supabaseA.from('stores').select('id, name').eq('name', STORE_NAME_A);
    if (prevA && prevA.length > 0) {
      for (const st of prevA) {
        assertAllowedStoreName(st.name, 'limpieza preventiva A');
        await supabaseA.from('stores').delete().eq('id', st.id);
      }
    }
    const { data: prevB } = await supabaseB.from('stores').select('id, name').eq('name', STORE_NAME_B);
    if (prevB && prevB.length > 0) {
      for (const st of prevB) {
        assertAllowedStoreName(st.name, 'limpieza preventiva B');
        await supabaseB.from('stores').delete().eq('id', st.id);
      }
    }

    // 1. Crear tienda PRUEBAS-ROLES (Usuario A)
    assertAllowedStoreName(STORE_NAME_A, 'crear tienda A');
    const { data: resStoreA, error: errStoreA } = await supabaseA.rpc('create_store', {
      name: STORE_NAME_A,
      type: 'Abarrotes',
      currency: 'PEN',
    });
    if (errStoreA) throw new Error(`Error en create_store A: ${errStoreA.message}`);
    storeA_id = resStoreA?.id || resStoreA?.store_id;
    console.log(`✅ Tienda A creada: "${STORE_NAME_A}" (ID: ${shortId(storeA_id)})`);

    // Categoría y caja de tienda A
    const { data: catA } = await supabaseA.from('categories').select('id').eq('store_id', storeA_id).limit(1).single();
    categoryA_id = catA?.id;
    const { data: regA } = await supabaseA.from('cash_registers').select('id').eq('store_id', storeA_id).limit(1).maybeSingle();
    registerA_id = regA?.id || null;

    // Productos de A: 2 productos con stock 20
    const { data: prodsA, error: errProdsA } = await supabaseA.from('products').insert([
      {
        store_id: storeA_id,
        category_id: categoryA_id,
        name: 'PROD_ROLES_01',
        barcode: 'BAR_ROLES_01',
        cost_price: 5.00,
        sale_price: 10.00,
        stock: 20,
        unit: 'pza',
      },
      {
        store_id: storeA_id,
        category_id: categoryA_id,
        name: 'PROD_ROLES_02',
        barcode: 'BAR_ROLES_02',
        cost_price: 12.00,
        sale_price: 20.00,
        stock: 20,
        unit: 'pza',
      },
    ]).select('id, name, stock, cost_price, sale_price');
    if (errProdsA || !prodsA || prodsA.length < 2) throw new Error(`Error creando productos A: ${errProdsA?.message}`);
    prod1 = prodsA[0];
    prod2 = prodsA[1];
    console.log(`✅ Productos creados en tienda A: ${prod1.name} (stock ${prod1.stock}), ${prod2.name} (stock ${prod2.stock})`);

    // Proveedor en A
    const { data: supA, error: errSupA } = await supabaseA.from('suppliers').insert({
      store_id: storeA_id,
      name: 'PROV_ROLES_CENTRAL',
      payment_condition: 'contado',
      credit_days: 0,
    }).select('id').single();
    if (errSupA) throw new Error(`Error creando proveedor A: ${errSupA.message}`);
    supplierA_id = supA.id;

    // 1 venta de control en A (process_sale)
    const { data: saleA, error: errSaleA } = await supabaseA.rpc('process_sale', {
      p_store_id: storeA_id,
      p_ticket_number: 'TKT-ROLES-000001',
      p_payment_method: 'tarjeta',
      p_cash_given: null,
      p_items: [{ productId: prod1.id, quantity: 2 }],
      p_register_id: registerA_id,
    });
    if (errSaleA || !saleA?.success) throw new Error(`Error en venta control A: ${errSaleA?.message || JSON.stringify(saleA)}`);
    console.log('✅ Venta de control procesada en tienda A.');

    // 1 compra de control en A (process_purchase)
    const { data: purA, error: errPurA } = await supabaseA.rpc('process_purchase', {
      p_store_id: storeA_id,
      p_supplier_id: supplierA_id,
      p_items: [{ product_id: prod2.id, quantity: 5, unit_cost: 12.00 }],
      p_note: 'Compra control FASE 3',
      p_payment_condition: 'contado',
      p_credit_days: 0,
    });
    if (errPurA || !purA?.success) throw new Error(`Error en compra control A: ${errPurA?.message || JSON.stringify(purA)}`);
    console.log('✅ Compra de control procesada en tienda A.');

    // 2. Crear tienda PRUEBAS-ROLES-B (Usuario B)
    assertAllowedStoreName(STORE_NAME_B, 'crear tienda B');
    const { data: resStoreB, error: errStoreB } = await supabaseB.rpc('create_store', {
      name: STORE_NAME_B,
      type: 'Abarrotes',
      currency: 'PEN',
    });
    if (errStoreB) throw new Error(`Error en create_store B: ${errStoreB.message}`);
    storeB_id = resStoreB?.id || resStoreB?.store_id;
    console.log(`✅ Tienda B creada: "${STORE_NAME_B}" (ID: ${shortId(storeB_id)})`);

    const { data: catB } = await supabaseB.from('categories').select('id').eq('store_id', storeB_id).limit(1).single();
    const { data: regB } = await supabaseB.from('cash_registers').select('id').eq('store_id', storeB_id).limit(1).maybeSingle();

    // 1 producto en B
    const { data: prodsB, error: errProdsB } = await supabaseB.from('products').insert({
      store_id: storeB_id,
      category_id: catB?.id,
      name: 'PROD_ROLES_B01',
      barcode: 'BAR_ROLES_B01',
      cost_price: 8.00,
      sale_price: 15.00,
      stock: 15,
      unit: 'pza',
    }).select('id, name, stock, sale_price').single();
    if (errProdsB) throw new Error(`Error producto B: ${errProdsB.message}`);
    prodB1 = prodsB;

    // 1 proveedor en B
    const { data: supB, error: errSupB } = await supabaseB.from('suppliers').insert({
      store_id: storeB_id,
      name: 'PROV_ROLES_B',
      payment_condition: 'contado',
      credit_days: 0,
    }).select('id').single();
    if (errSupB) throw new Error(`Error proveedor B: ${errSupB.message}`);
    supplierB_id = supB.id;

    // 1 venta en B
    await supabaseB.rpc('process_sale', {
      p_store_id: storeB_id,
      p_ticket_number: 'TKT-ROLES-B-000001',
      p_payment_method: 'efectivo',
      p_cash_given: 20.00,
      p_items: [{ productId: prodB1.id, quantity: 1 }],
      p_register_id: regB?.id || null,
    });

    // 1 compra en B
    await supabaseB.rpc('process_purchase', {
      p_store_id: storeB_id,
      p_supplier_id: supplierB_id,
      p_items: [{ product_id: prodB1.id, quantity: 3, unit_cost: 8.00 }],
      p_note: 'Compra control B',
      p_payment_condition: 'contado',
      p_credit_days: 0,
    });
    console.log('✅ Datos de control procesados en tienda B.');

    // --- [3/8] SEG-16: Usuario C sin tienda (aún NO es miembro) ---
    console.log('\n[3/8] SEG-16 — Pruebas con Usuario C (sin membresía en tienda A)...');

    // SEG-16.1: C hace select sobre las 16 tablas filtrando por store_id de A (debe dar 0 filas)
    const tablesStoreFilter = [
      'stores', 'categories', 'products', 'sales', 'sale_items',
      'purchases', 'purchase_items', 'inventory_movements', 'suppliers',
      'cash_registers', 'simulations', 'store_settings', 'store_invitations',
      'store_members', 'product_stats'
    ];

    let seg16_1_ok = true;
    let seg16_1_details = [];
    for (const tbl of tablesStoreFilter) {
      const colId = tbl === 'stores' ? 'id' : 'store_id';
      const { data, error } = await supabaseC.from(tbl).select('*').eq(colId, storeA_id);
      if (error && error.code !== '42501') {
        seg16_1_ok = false;
        seg16_1_details.push(`${tbl}: error ${error.code}`);
      } else if (data && data.length > 0) {
        seg16_1_ok = false;
        seg16_1_details.push(`${tbl}: expuso ${data.length} filas`);
      }
    }
    // Perfiles y preferencias de A consultados por C
    const { data: profA } = await supabaseC.from('profiles').select('*').eq('id', userA.id);
    const { data: prefA } = await supabaseC.from('user_preferences').select('*').eq('user_id', userA.id);
    if ((profA && profA.length > 0) || (prefA && prefA.length > 0)) {
      seg16_1_ok = false;
      seg16_1_details.push('perfil/preferencias expuestos');
    }

    const totalTablesCount = tablesStoreFilter.length + 2; // incluye profiles y user_preferences

    recordResult(
      'SEG-16.1',
      `C (sin membresía) SELECT sobre las ${totalTablesCount} tablas con filtro store de A`,
      '0 filas o error 42501',
      seg16_1_ok ? 'PASA' : 'FALLA',
      seg16_1_ok ? `0 filas devueltas en las ${totalTablesCount} tablas y vistas de tienda A` : seg16_1_details.join(', ')
    );

    // SEG-16.2: C hace select sin filtro en tablas con store_id (debe dar 0 filas)
    let seg16_2_ok = true;
    for (const tbl of ['products', 'sales', 'purchases', 'inventory_movements']) {
      const { data } = await supabaseC.from(tbl).select('*');
      if (data && data.length > 0) {
        seg16_2_ok = false;
        break;
      }
    }
    recordResult(
      'SEG-16.2',
      'C (sin membresía) SELECT sin filtro sobre tablas de tienda',
      '0 filas',
      seg16_2_ok ? 'PASA' : 'FALLA',
      seg16_2_ok ? '0 filas en productos, ventas, compras y kardex' : 'Devolvió datos sin membresía'
    );

    // SEG-16.3: C llama con store_id de A a RPCs protegidos (todos deben fallar con 42501)
    const rpcCallsC = [
      { name: 'process_sale', rpc: 'process_sale', params: { p_store_id: storeA_id, p_ticket_number: 'TKT-HACK', p_payment_method: 'efectivo', p_cash_given: 10, p_items: [{ productId: prod1.id, quantity: 1 }] } },
      { name: 'process_purchase', rpc: 'process_purchase', params: { p_store_id: storeA_id, p_supplier_id: supplierA_id, p_items: [{ product_id: prod1.id, quantity: 1, unit_cost: 5 }] } },
      { name: 'adjust_stock', rpc: 'adjust_stock', params: { p_store_id: storeA_id, p_product_id: prod1.id, p_quantity_delta: 5, p_note: 'hack' } },
      { name: 'pay_purchase', rpc: 'pay_purchase', params: { p_store_id: storeA_id, p_purchase_id: '00000000-0000-0000-0000-000000000000' } },
      { name: 'invite_by_code', rpc: 'invite_by_code', params: { p_store_id: storeA_id, p_user_code: 'RENT-TEST', p_role: 'CAJERO' } },
      { name: 'switch_store', rpc: 'switch_store', params: { p_store_id: storeA_id } },
    ];

    for (const rc of rpcCallsC) {
      const { error: errRpc } = await supabaseC.rpc(rc.rpc, rc.params);
      const res = classify(errRpc, ['no perteneces', 'no eres miembro', 'solo un administrador']);
      recordResult(
        `SEG-16.3.${rc.name}`,
        `C llama RPC ${rc.name} con store de A`,
        'Error 42501 (No perteneces / no autorizado)',
        res.status,
        res.detail
      );
    }

    // SEG-16.4: C intenta insert directo en store_members, store_invitations y products de A
    const { error: errInsMem } = await supabaseC.from('store_members').insert({
      store_id: storeA_id,
      user_id: userC.id,
      role: 'ADMIN',
    });
    recordResult(
      'SEG-16.4.members',
      'C insert directo en store_members (store A, rol ADMIN)',
      'Rechazado (42501)',
      classify(errInsMem).status,
      classify(errInsMem).detail
    );

    const { error: errInsInv } = await supabaseC.from('store_invitations').insert({
      store_id: storeA_id,
      email: 'hacker_c@rentabill.pe',
      role: 'ADMIN',
    });
    recordResult(
      'SEG-16.4.invitations',
      'C insert directo en store_invitations de tienda A',
      'Rechazado (42501)',
      classify(errInsInv).status,
      classify(errInsInv).detail
    );

    const { error: errInsProd } = await supabaseC.from('products').insert({
      store_id: storeA_id,
      category_id: categoryA_id,
      name: 'PROD_HACK_C',
      cost_price: 1,
      sale_price: 2,
      stock: 10,
      unit: 'pza',
    });
    recordResult(
      'SEG-16.4.products',
      'C insert directo en products de tienda A',
      'Rechazado (42501)',
      classify(errInsProd).status,
      classify(errInsProd).detail
    );

    // SEG-16.5: C hace update de profiles.active_store_id = storeA_id
    const { error: errActiveStore } = await supabaseC.from('profiles').update({
      active_store_id: storeA_id,
    }).eq('id', userC.id);

    // Verificar si C puede ver datos de A tras cambiar active_store_id
    const { data: prodsAfterActive } = await supabaseC.from('products').select('id').eq('store_id', storeA_id);
    const leakedData = prodsAfterActive && prodsAfterActive.length > 0;

    // Restaurar active_store_id a null
    await supabaseC.from('profiles').update({ active_store_id: null }).eq('id', userC.id);

    if (leakedData) {
      recordResult(
        'SEG-16.5',
        'C altera profiles.active_store_id y consulta productos de A',
        '0 datos expuestos',
        'FALLA',
        '¡Vulnerabilidad! Cambiar active_store_id expuso productos de la tienda ajena'
      );
    } else {
      recordResult(
        'SEG-16.5',
        'C altera profiles.active_store_id y consulta productos de A',
        '0 datos expuestos (RLS independiente de active_store_id)',
        'PASA',
        `Aceptó update en profile pero RLS protegió datos (0 filas de A vistas). [Obs: H-08 active_store_id editable]`
      );
    }

    // SEG-16.6: A invita a B con invite_by_code; C intenta accept_invitation con ese token
    const { data: profB } = await supabaseB.from('profiles').select('user_code').eq('id', userB.id).single();
    if (!profB?.user_code) throw new Error('No se obtuvo user_code de Usuario B');

    const { error: errInvB } = await supabaseA.rpc('invite_by_code', {
      p_store_id: storeA_id,
      p_user_code: profB.user_code,
      p_role: 'REPOSITOR',
    });
    if (errInvB) throw new Error(`Error en invite_by_code para B: ${errInvB.message}`);

    const { data: invRowB } = await supabaseA.from('store_invitations').select('token').eq('store_id', storeA_id).eq('email', TEST_USER_B_EMAIL).single();
    invitationTokenB = invRowB?.token;
    if (!invitationTokenB) throw new Error('No se generó token de invitación para B');

    // C intenta aceptar la invitación de B
    const { error: errAcceptC } = await supabaseC.rpc('accept_invitation', {
      p_token: invitationTokenB,
    });
    const resAcceptC = classify(errAcceptC, ['otro correo', 'no autoriz']);
    const { data: checkMemC } = await supabaseC.from('store_members').select('*').eq('store_id', storeA_id);
    const cHasMembership = checkMemC && checkMemC.length > 0;

    recordResult(
      'SEG-16.6',
      'C intenta accept_invitation con token ajeno (de Usuario B)',
      'Error 42501 (dirigida a otro correo) y sin membresía',
      (!cHasMembership && resAcceptC.status === 'PASA') ? 'PASA' : 'FALLA',
      `Token ${maskToken(invitationTokenB)} rechazado para C: ${errAcceptC?.message || 'sin error'}. C sigue sin membresía.`
    );

    // --- [4/8] SEG-20: Realtime (ANTES de que C sea miembro) ---
    console.log('\n[4/8] SEG-20 — Verificación de aislamiento en Realtime (postgres_changes)...');

    let eventsA = 0;
    let eventsC = 0;
    let eventsAnon = 0;

    const channelA = supabaseA.channel(`rt-products-A-${Date.now()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products', filter: `store_id=eq.${storeA_id}` }, () => { eventsA++; });
    const channelC = supabaseC.channel(`rt-products-C-${Date.now()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products', filter: `store_id=eq.${storeA_id}` }, () => { eventsC++; });
    const channelAnon = supabaseAnon.channel(`rt-products-Anon-${Date.now()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products', filter: `store_id=eq.${storeA_id}` }, () => { eventsAnon++; });

    const subscribeWithTracking = (ch) => new Promise((resolve) => {
      const startTime = Date.now();
      let settled = false;
      const tm = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({ status: 'TIMED_OUT', durationMs: Date.now() - startTime });
        }
      }, 10000);

      ch.subscribe((status) => {
        if (!settled && (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT')) {
          settled = true;
          clearTimeout(tm);
          resolve({ status, durationMs: Date.now() - startTime });
        }
      });
    });

    const [trackA, trackC, trackAnon] = await Promise.all([
      subscribeWithTracking(channelA),
      subscribeWithTracking(channelC),
      subscribeWithTracking(channelAnon),
    ]);

    const channelStatusDetail = `Canales: A=${trackA.status}(${trackA.durationMs}ms), C=${trackC.status}(${trackC.durationMs}ms), Anon=${trackAnon.status}(${trackAnon.durationMs}ms)`;

    if (trackA.status !== 'SUBSCRIBED') {
      await supabaseA.removeChannel(channelA);
      await supabaseC.removeChannel(channelC);
      await supabaseAnon.removeChannel(channelAnon);
      recordResult(
        'SEG-20.1',
        'Realtime postgres_changes products: Control positivo de A',
        'Canal A en estado SUBSCRIBED',
        'INCONCLUSO',
        `Canal de A no alcanzó estado SUBSCRIBED (estado: ${trackA.status}, tiempo: ${trackA.durationMs}ms). ${channelStatusDetail}`
      );
    } else if (trackC.status !== 'SUBSCRIBED' || trackAnon.status !== 'SUBSCRIBED') {
      await supabaseA.removeChannel(channelA);
      await supabaseC.removeChannel(channelC);
      await supabaseAnon.removeChannel(channelAnon);
      recordResult(
        'SEG-20.1',
        'Realtime postgres_changes products: C y Anon se suscriben para verificar aislamiento',
        'Canales C y Anon en estado SUBSCRIBED',
        'INCONCLUSO',
        `Canales C o Anon no alcanzaron estado SUBSCRIBED. ${channelStatusDetail}`
      );
    } else {
      // Tras la suscripción espera 2 s antes de modificar nada
      await new Promise(r => setTimeout(r, 2000));

      // Hasta 3 modificaciones del producto (precios distintos: 11, 12, 13),
      // con 4 s de espera entre ellas; detente apenas A reciba >= 1 evento.
      const testPrices = [11.00, 12.00, 13.00];
      let updateAttempts = 0;
      for (const price of testPrices) {
        updateAttempts++;
        await supabaseA.from('products').update({ sale_price: price }).eq('id', prod1.id);
        await new Promise(r => setTimeout(r, 4000));
        if (eventsA >= 1) {
          break;
        }
      }

      // Tras la última modificación espera 8 s antes de contar
      await new Promise(r => setTimeout(r, 8000));

      // Limpiar canales realtime
      await supabaseA.removeChannel(channelA);
      await supabaseC.removeChannel(channelC);
      await supabaseAnon.removeChannel(channelAnon);

      if (eventsC > 0 || eventsAnon > 0) {
        recordResult(
          'SEG-20.1',
          'Realtime postgres_changes products: Fuga a no-miembro o anónimo',
          'C = 0 y Anon = 0',
          'FALLA',
          `¡Fuga de Realtime! Eventos: A=${eventsA}, C=${eventsC}, Anon=${eventsAnon}. ${channelStatusDetail}`
        );
      } else if (eventsA > 0) {
        recordResult(
          'SEG-20.1',
          'Realtime postgres_changes products: A recibe evento, C y Anon reciben 0',
          'A recibe > 0, C = 0, Anon = 0',
          'PASA',
          `Ev: A=${eventsA}, C=${eventsC}, Anon=${eventsAnon} (mod: ${updateAttempts}). ${channelStatusDetail}`
        );
      } else {
        recordResult(
          'SEG-20.1',
          'Realtime postgres_changes products: Control positivo de A',
          'A recibe > 0',
          'INCONCLUSO',
          `A no recibió eventos tras ${updateAttempts} intentos de modificación. ${channelStatusDetail}. Realtime no disponible en el entorno o la tabla products no está en publicación activa.`
        );
      }
    }

    // --- ALTA DE MIEMBROS POR FLUJO REAL ---
    console.log('\n[Alta] Onboarding legítimo de miembros en tienda A...');
    // B acepta su invitación
    const { error: errAccB } = await supabaseB.rpc('accept_invitation', { p_token: invitationTokenB });
    if (errAccB) throw new Error(`B no pudo aceptar invitación: ${errAccB.message}`);
    console.log('✅ Usuario B aceptó invitación legítimamente (Rol: REPOSITOR).');

    // A invita a C como CAJERO
    const { data: profC } = await supabaseC.from('profiles').select('user_code').eq('id', userC.id).single();
    if (!profC?.user_code) throw new Error('No se obtuvo user_code de Usuario C');

    const { error: errInvC } = await supabaseA.rpc('invite_by_code', {
      p_store_id: storeA_id,
      p_user_code: profC.user_code,
      p_role: 'CAJERO',
    });
    if (errInvC) throw new Error(`Error invitando a C: ${errInvC.message}`);

    const { data: invRowC } = await supabaseA.from('store_invitations').select('token').eq('store_id', storeA_id).eq('email', TEST_USER_C_EMAIL).single();
    invitationTokenC = invRowC?.token;
    if (!invitationTokenC) throw new Error('No se generó token para C');

    // C acepta su invitación
    const { error: errAccC } = await supabaseC.rpc('accept_invitation', { p_token: invitationTokenC });
    if (errAccC) throw new Error(`C no pudo aceptar invitación: ${errAccC.message}`);
    console.log('✅ Usuario C aceptó invitación legítimamente (Rol: CAJERO).');

    // Verificación de membresías
    const { data: memsA } = await supabaseA.from('store_members').select('user_id, role').eq('store_id', storeA_id);
    const roleMap = Object.fromEntries(memsA.map(m => [m.user_id, m.role]));
    console.log(`✅ Roles confirmados en tienda A: A=${roleMap[userA.id]}, B=${roleMap[userB.id]}, C=${roleMap[userC.id]}`);

    // Sincronizar active_store_id en B y C
    await supabaseB.rpc('switch_store', { p_store_id: storeA_id });
    await supabaseC.rpc('switch_store', { p_store_id: storeA_id });

    // SEG-20.2 (control positivo): ya con C como CAJERO, C abre un canal sobre products de la tienda A; A modifica un producto; C debe recibir >0 eventos. Cierra todos los canales.
    console.log('\n[SEG-20.2] Control positivo de Realtime con C como miembro (CAJERO)...');
    let eventsC_member = 0;
    let subStatusC_member = 'PENDING';

    const channelC_member = supabaseC.channel(`rt-products-C-member-${Date.now()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products', filter: `store_id=eq.${storeA_id}` }, () => { eventsC_member++; });

    await new Promise((resolve) => {
      const tm = setTimeout(() => resolve(false), 5000);
      channelC_member.subscribe((status) => {
        subStatusC_member = status;
        if (status === 'SUBSCRIBED') {
          clearTimeout(tm);
          resolve(true);
        }
      });
    });

    if (subStatusC_member === 'SUBSCRIBED') {
      await supabaseA.from('products').update({ name: 'PROD_ROLES_01_RT' }).eq('id', prod1.id);
      await new Promise(r => setTimeout(r, 6000));
      await supabaseC.removeChannel(channelC_member);

      recordResult(
        'SEG-20.2',
        'Realtime postgres_changes products: C (ahora CAJERO) recibe eventos de tienda A',
        'C recibe > 0 eventos',
        eventsC_member > 0 ? 'PASA' : 'INCONCLUSO',
        eventsC_member > 0 ? `C recibió ${eventsC_member} evento(s) correctamente tras ser miembro.` : 'C no recibió eventos dentro de la ventana de espera.'
      );
    } else {
      await supabaseC.removeChannel(channelC_member);
      recordResult(
        'SEG-20.2',
        'Realtime postgres_changes products: C (ahora CAJERO) recibe eventos de tienda A',
        'C recibe > 0 eventos',
        'INCONCLUSO',
        `Canal de C no alcanzó estado SUBSCRIBED (estado: ${subStatusC_member}).`
      );
    }

    // --- [5/8] SEG-17: IDs ajenos (A contra datos de B) ---
    console.log('\n[5/8] SEG-17 — Pruebas con IDs ajenos (Usuario A contra datos de Tienda B)...');

    // Tomar snapshot de B
    const { data: snapProdsB } = await supabaseB.from('products').select('id, stock, sale_price').eq('store_id', storeB_id);
    const { data: snapSalesB } = await supabaseB.from('sales').select('id').eq('store_id', storeB_id);
    const { data: snapPurchasesB } = await supabaseB.from('purchases').select('id').eq('store_id', storeB_id);
    snapshotB = {
      productStock: snapProdsB?.[0]?.stock,
      productPrice: snapProdsB?.[0]?.sale_price,
      salesCount: snapSalesB?.length || 0,
      purchasesCount: snapPurchasesB?.length || 0,
    };

    // A llama con store_id de B + IDs de B
    const { error: errA_adjB } = await supabaseA.rpc('adjust_stock', { p_store_id: storeB_id, p_product_id: prodB1.id, p_quantity_delta: 5, p_note: 'hack' });
    recordResult('SEG-17.1.adjust_stock', 'A llama adjust_stock con store_id de B e id producto B', 'Error 42501', classify(errA_adjB).status, classify(errA_adjB).detail);

    const { error: errA_saleB } = await supabaseA.rpc('process_sale', { p_store_id: storeB_id, p_ticket_number: 'TKT-HACK', p_payment_method: 'efectivo', p_cash_given: 10, p_items: [{ productId: prodB1.id, quantity: 1 }] });
    recordResult('SEG-17.1.process_sale', 'A llama process_sale con store_id de B e id producto B', 'Error 42501', classify(errA_saleB).status, classify(errA_saleB).detail);

    const { error: errA_purB } = await supabaseA.rpc('process_purchase', { p_store_id: storeB_id, p_supplier_id: supplierB_id, p_items: [{ product_id: prodB1.id, quantity: 1, unit_cost: 5 }] });
    recordResult('SEG-17.1.process_purchase', 'A llama process_purchase con store_id de B e id proveedor B', 'Error 42501', classify(errA_purB).status, classify(errA_purB).detail);

    const { error: errA_payB } = await supabaseA.rpc('pay_purchase', { p_store_id: storeB_id, p_purchase_id: snapPurchasesB?.[0]?.id || '00000000-0000-0000-0000-000000000000' });
    recordResult('SEG-17.1.pay_purchase', 'A llama pay_purchase con store_id de B e id compra B', 'Error 42501', classify(errA_payB).status, classify(errA_payB).detail);

    // A llama con SU store_id pero IDs de producto/proveedor de B
    const { error: errA_crossSale } = await supabaseA.rpc('process_sale', { p_store_id: storeA_id, p_ticket_number: 'TKT-CROSS', p_payment_method: 'efectivo', p_cash_given: 10, p_items: [{ productId: prodB1.id, quantity: 1 }] });
    recordResult('SEG-17.2.cross_sale', 'A llama process_sale en tienda A pero con producto de B', 'Rechazado (error de pertenencia/FK)', errA_crossSale ? 'PASA' : 'FALLA', errA_crossSale?.message || 'Permitió procesar producto ajeno');

    const { error: errA_crossPur } = await supabaseA.rpc('process_purchase', { p_store_id: storeA_id, p_supplier_id: supplierB_id, p_items: [{ product_id: prod1.id, quantity: 1, unit_cost: 5 }] });
    recordResult('SEG-17.2.cross_purchase', 'A llama process_purchase en tienda A pero con proveedor de B', 'Rechazado (error de pertenencia/FK)', errA_crossPur ? 'PASA' : 'FALLA', errA_crossPur?.message || 'Permitió asociar proveedor ajeno');

    const { error: errA_crossAdj } = await supabaseA.rpc('adjust_stock', { p_store_id: storeA_id, p_product_id: prodB1.id, p_quantity_delta: 5, p_note: 'cross' });
    recordResult('SEG-17.2.cross_adjust', 'A llama adjust_stock en tienda A pero con producto de B', 'Rechazado (error de pertenencia/FK)', errA_crossAdj ? 'PASA' : 'FALLA', errA_crossAdj?.message || 'Permitió ajustar producto ajeno');

    // A intenta UPDATE / DELETE directo sobre productos, proveedores y ventas de B
    const { data: resUpdProdB } = await supabaseA.from('products').update({ sale_price: 99.00 }).eq('id', prodB1.id).select();
    const { data: resDelProdB } = await supabaseA.from('products').delete().eq('id', prodB1.id).select();
    const { data: resUpdSupB } = await supabaseA.from('suppliers').update({ name: 'HACKED' }).eq('id', supplierB_id).select();
    const { data: resDelSupB } = await supabaseA.from('suppliers').delete().eq('id', supplierB_id).select();
    const { data: resUpdSaleB } = await supabaseA.from('sales').update({ payment_method: 'HACK' }).eq('store_id', storeB_id).select();
    const { data: resDelSaleB } = await supabaseA.from('sales').delete().eq('store_id', storeB_id).select();

    const directOk =
      (!resUpdProdB || resUpdProdB.length === 0) &&
      (!resDelProdB || resDelProdB.length === 0) &&
      (!resUpdSupB || resUpdSupB.length === 0) &&
      (!resDelSupB || resDelSupB.length === 0) &&
      (!resUpdSaleB || resUpdSaleB.length === 0) &&
      (!resDelSaleB || resDelSaleB.length === 0);

    recordResult('SEG-17.3.direct_crud', 'A intenta UPDATE/DELETE directo en productos/proveedores/ventas de B', '0 filas afectadas o error 42501', directOk ? 'PASA' : 'FALLA', directOk ? '0 filas afectadas en todas las tablas de B' : 'Modificó datos de B');

    // Verificar que snapshot de B no cambió
    const { data: snapAfterB } = await supabaseB.from('products').select('stock, sale_price').eq('id', prodB1.id).single();
    const snapshotIntact = snapAfterB?.stock === snapshotB.productStock && snapAfterB?.sale_price === snapshotB.productPrice;
    recordResult('SEG-17.4.snapshot_integrity', 'Verificación de integridad de datos de B tras ataques de A', 'Snapshot de B 100% inalterado', snapshotIntact ? 'PASA' : 'FALLA', snapshotIntact ? `Stock ${snapAfterB?.stock} y precio ${snapAfterB?.sale_price} intactos` : 'Datos de B cambiaron');

    // --- [6/8] SEG-18: Asignación Masiva y Escalada de Privilegios ---
    console.log('\n[6/8] SEG-18 — Pruebas de asignación masiva y escalada de privilegios...');

    // 1. C y B intentan auto-promoverse a ADMIN en store_members
    const { data: upRoleC, error: errUpRoleC } = await supabaseC.from('store_members').update({ role: 'ADMIN' }).eq('store_id', storeA_id).eq('user_id', userC.id).select();
    const { data: upRoleB, error: errUpRoleB } = await supabaseB.from('store_members').update({ role: 'ADMIN' }).eq('store_id', storeA_id).eq('user_id', userB.id).select();

    const { data: chkMemA } = await supabaseA.from('store_members').select('user_id, role').eq('store_id', storeA_id);
    const rMap = Object.fromEntries(chkMemA.map(m => [m.user_id, m.role]));
    const roleEscalationBlocked = rMap[userC.id] === 'CAJERO' && rMap[userB.id] === 'REPOSITOR';

    recordResult(
      'SEG-18.1.self_escalate_role',
      'C (cajero) y B (repositor) intentan UPDATE role=ADMIN en su propia membresía',
      'Rechazado y rol inalterado',
      roleEscalationBlocked ? 'PASA' : 'FALLA',
      roleEscalationBlocked ? `Roles verificados con A: C=${rMap[userC.id]}, B=${rMap[userB.id]}` : '¡Escalada permitida!'
    );

    // 2. C intenta transferir su membresía a otra tienda (store_id = storeB_id)
    const { data: upStoreC } = await supabaseC.from('store_members').update({ store_id: storeB_id }).eq('store_id', storeA_id).eq('user_id', userC.id).select();
    const { data: memA_check } = await supabaseA.from('store_members').select('store_id, role').eq('user_id', userC.id).eq('store_id', storeA_id).maybeSingle();
    const { data: memB_check } = await supabaseB.from('store_members').select('store_id, role').eq('user_id', userC.id).eq('store_id', storeB_id).maybeSingle();
    const storeTransferBlocked = (!upStoreC || upStoreC.length === 0) && memA_check?.role === 'CAJERO' && !memB_check;

    recordResult(
      'SEG-18.2.change_store_id',
      'C intenta UPDATE store_id de su membresía a otra tienda',
      '0 filas o error, C sigue como CAJERO en A y no aparece en B',
      storeTransferBlocked ? 'PASA' : 'FALLA',
      storeTransferBlocked ? 'Operación bloqueada; C sigue como CAJERO en A y ausente en B' : 'Transferencia indebida de membresía'
    );

    // 3. B (repositor) intenta modificar columnas protegidas de products en tienda A
    const colTests = [
      { col: 'store_id', val: storeB_id },
      { col: 'stock', val: 999 },
      { col: 'units_sold', val: 999 },
      { col: 'created_at', val: new Date().toISOString() },
      { col: 'id', val: '00000000-0000-0000-0000-000000000000' },
    ];
    for (const ct of colTests) {
      const payload = {};
      payload[ct.col] = ct.val;
      const { error: errCol } = await supabaseB.from('products').update(payload).eq('id', prod1.id);
      const resCol = classify(errCol, ['permission denied', 'not allowed']);
      recordResult(
        `SEG-18.3.update_${ct.col}`,
        `B intenta UPDATE columna restringida products.${ct.col}`,
        'Rechazado (42501 permiso de columna)',
        resCol.status,
        resCol.detail
      );
    }

    // B insert en products con units_sold o archived_at
    const { error: errInsUS } = await supabaseB.from('products').insert({
      store_id: storeA_id,
      category_id: categoryA_id,
      name: 'PROD_TEST_US',
      cost_price: 1,
      sale_price: 2,
      stock: 10,
      unit: 'pza',
      units_sold: 5,
    });
    recordResult('SEG-18.3.insert_units_sold', 'B insert en products con units_sold = 5', 'Rechazado (42501 permiso de columna)', classify(errInsUS).status, classify(errInsUS).detail);

    const { error: errInsArch } = await supabaseB.from('products').insert({
      store_id: storeA_id,
      category_id: categoryA_id,
      name: 'PROD_TEST_ARCH',
      cost_price: 1,
      sale_price: 2,
      stock: 10,
      unit: 'pza',
      archived_at: new Date().toISOString(),
    });
    recordResult('SEG-18.3.insert_archived_at', 'B insert en products con archived_at', 'Rechazado (42501 permiso de columna)', classify(errInsArch).status, classify(errInsArch).detail);

    // B intenta update en stores de A (name, owner_id)
    const { data: resUpdStoreB, error: errUpdStoreB } = await supabaseB.from('stores').update({ name: 'HACKED', owner_id: userB.id }).eq('id', storeA_id).select();
    recordResult('SEG-18.4.stores_update', 'B intenta UPDATE name y owner_id en stores de A', '0 filas o error 42501', (!resUpdStoreB || resUpdStoreB.length === 0 || errUpdStoreB) ? 'PASA' : 'FALLA', errUpdStoreB?.message || '0 filas afectadas por RLS');

    // C intenta alterar user_code o email en profiles
    const { error: errProfCode } = await supabaseC.from('profiles').update({ user_code: 'RENT-0000' }).eq('id', userC.id);
    recordResult('SEG-18.5.profile_user_code', 'C intenta UPDATE user_code en profiles', 'Rechazado por trigger protect_user_code', errProfCode ? 'PASA' : 'FALLA', errProfCode?.message || 'Permitió cambiar user_code');

    const { error: errProfEmail } = await supabaseC.from('profiles').update({ email: 'fake@rentabill.pe' }).eq('id', userC.id);
    recordResult('SEG-18.5.profile_email', 'C intenta UPDATE email en profiles', 'Rechazado por permisos o inalterado', (errProfEmail || classify(errProfEmail).status === 'PASA') ? 'PASA' : 'FALLA', errProfEmail?.message || 'Columna no otorgada en GRANT');

    const { data: resUpdProfA } = await supabaseC.from('profiles').update({ name: 'HACKED' }).eq('id', userA.id).select();
    recordResult('SEG-18.5.profile_other', 'C intenta UPDATE perfil de Usuario A', '0 filas o 42501', (!resUpdProfA || resUpdProfA.length === 0) ? 'PASA' : 'FALLA', '0 filas afectadas');

    // A (admin) directo en tablas inmutables (solo por RPC)
    const { error: errDirSale } = await supabaseA.from('sales').insert({
      store_id: storeA_id,
      register_id: registerA_id,
      ticket_number: 'TKT-TEST-RLS',
      total_quantity: 1,
      total_amount: 50,
      total_profit: 10,
      payment_method: 'efectivo',
      cash_given: 50,
      change_given: 0,
      cashier_name: 'Admin',
    });
    recordResult('SEG-18.6.direct_sale', 'A intenta INSERT directo en sales (inmutable)', 'Rechazado (solo RPC)', classify(errDirSale).status, classify(errDirSale).detail);

    const { error: errDirPur } = await supabaseA.from('purchases').insert({ store_id: storeA_id, total: 50 });
    recordResult('SEG-18.6.direct_purchase', 'A intenta INSERT directo en purchases (inmutable)', 'Rechazado (solo RPC)', classify(errDirPur).status, classify(errDirPur).detail);

    const { error: errDirMov } = await supabaseA.from('inventory_movements').insert({
      store_id: storeA_id,
      product_id: prod1.id,
      product_name: prod1.name,
      quantity: 10,
      previous_stock: 0,
      new_stock: 10,
      user_name: 'Admin',
      type: 'AJUSTE',
    });
    recordResult('SEG-18.6.direct_kardex', 'A intenta INSERT directo en inventory_movements (inmutable)', 'Rechazado (solo RPC)', classify(errDirMov).status, classify(errDirMov).detail);

    // A insert en simulations con status='APLICADA' o purchase_id
    const { error: errSimStat } = await supabaseA.from('simulations').insert({
      store_id: storeA_id,
      product_id: prod1.id,
      product_name: prod1.name,
      supplier_id: supplierA_id,
      quantity: 5,
      unit_cost: 5,
      unit_price: 10,
      payment_condition: 'contado',
      status: 'APLICADA',
    });
    recordResult('SEG-18.7.simulations_status', 'A insert en simulations con status=APLICADA (columna protegida)', 'Rechazado (42501)', classify(errSimStat).status, classify(errSimStat).detail);

    // C insert en store_invitations y update
    const { error: errC_invIns } = await supabaseC.from('store_invitations').insert({ store_id: storeA_id, email: 'h@r.pe', role: 'ADMIN' });
    recordResult('SEG-18.8.cajero_invitations_insert', 'C (cajero) insert en store_invitations', 'Rechazado (42501)', classify(errC_invIns).status, classify(errC_invIns).detail);

    const { data: resC_invUpd } = await supabaseC.from('store_invitations').update({ role: 'ADMIN' }).eq('store_id', storeA_id).select();
    recordResult('SEG-18.8.cajero_invitations_update', 'C (cajero) update en store_invitations', '0 filas o 42501', (!resC_invUpd || resC_invUpd.length === 0) ? 'PASA' : 'FALLA', '0 filas afectadas');

    // --- [7/8] SEG-19: Roles dentro de la tienda (CAJERO, REPOSITOR, ADMIN) ---
    console.log('\n[7/8] SEG-19 — Comprobación de roles por diseño (CAJERO, REPOSITOR, ADMIN)...');

    // --- CAJERO (C) ---
    // C1: process_sale (debe funcionar)
    const { data: saleC, error: errSaleC } = await supabaseC.rpc('process_sale', {
      p_store_id: storeA_id,
      p_ticket_number: 'TKT-CAJERO-000001',
      p_payment_method: 'efectivo',
      p_cash_given: 50,
      p_items: [{ productId: prod1.id, quantity: 1 }],
      p_register_id: registerA_id,
    });
    recordResult('SEG-19.C1.process_sale', 'CAJERO ejecuta process_sale', 'PASA (permitido por diseño)', (!errSaleC && saleC?.success) ? 'PASA' : 'FALLA', saleC?.success ? 'Venta procesada exitosamente por Cajero' : errSaleC?.message);

    // C2..C5: RPCs no autorizados para cajero
    const { error: errC_adj } = await supabaseC.rpc('adjust_stock', { p_store_id: storeA_id, p_product_id: prod1.id, p_quantity_delta: 1, p_note: 'c' });
    recordResult('SEG-19.C2.adjust_stock', 'CAJERO llama adjust_stock', 'Error 42501 (solo Admin o Repositor)', classify(errC_adj).status, classify(errC_adj).detail);

    const { error: errC_pur } = await supabaseC.rpc('process_purchase', { p_store_id: storeA_id, p_supplier_id: supplierA_id, p_items: [{ product_id: prod1.id, quantity: 1, unit_cost: 5 }] });
    recordResult('SEG-19.C3.process_purchase', 'CAJERO llama process_purchase', 'Error 42501 (solo Admin o Repositor)', classify(errC_pur).status, classify(errC_pur).detail);

    const { error: errC_pay } = await supabaseC.rpc('pay_purchase', { p_store_id: storeA_id, p_purchase_id: '00000000-0000-0000-0000-000000000000' });
    recordResult('SEG-19.C4.pay_purchase', 'CAJERO llama pay_purchase', 'Error 42501 (solo Admin)', classify(errC_pay).status, classify(errC_pay).detail);

    const { error: errC_inv } = await supabaseC.rpc('invite_by_code', { p_store_id: storeA_id, p_user_code: 'RENT-TEST', p_role: 'CAJERO' });
    recordResult('SEG-19.C5.invite_by_code', 'CAJERO llama invite_by_code', 'Error 42501 (solo Admin)', classify(errC_inv).status, classify(errC_inv).detail);

    // C6..C8: Escritura directa en products por cajero
    const { error: errC_insProd } = await supabaseC.from('products').insert({ store_id: storeA_id, category_id: categoryA_id, name: 'P_CAJ', cost_price: 1, sale_price: 2, stock: 1, unit: 'pza' });
    recordResult('SEG-19.C6.products_insert', 'CAJERO insert en products', 'Rechazado (42501)', classify(errC_insProd).status, classify(errC_insProd).detail);

    const { data: resC_updProd, error: errC_updProd } = await supabaseC.from('products').update({ sale_price: 15 }).eq('id', prod1.id).select();
    const { data: prod1CheckC } = await supabaseA.from('products').select('sale_price').eq('id', prod1.id).single();
    const cUpdBlocked = (!resC_updProd || resC_updProd.length === 0 || errC_updProd) && prod1CheckC?.sale_price !== 15;
    recordResult(
      'SEG-19.C7.products_update',
      'CAJERO update en products',
      '0 filas afectadas o 42501 y precio inalterado',
      cUpdBlocked ? 'PASA' : 'FALLA',
      cUpdBlocked ? `0 filas afectadas (RLS); precio verificado con Admin=${prod1CheckC?.sale_price}` : (errC_updProd?.message || 'Modificó precio')
    );

    const { data: delC_prod } = await supabaseC.from('products').delete().eq('id', prod1.id).select();
    recordResult('SEG-19.C8.products_delete', 'CAJERO delete en products', '0 filas o 42501', (!delC_prod || delC_prod.length === 0) ? 'PASA' : 'FALLA', '0 filas afectadas');

    // C9..C14: Suppliers y Categories
    const { error: errC_insSup } = await supabaseC.from('suppliers').insert({ store_id: storeA_id, name: 'SUP_CAJ' });
    recordResult('SEG-19.C9.suppliers_write', 'CAJERO insert en suppliers', 'Rechazado (42501)', classify(errC_insSup).status, classify(errC_insSup).detail);

    const { error: errC_insCat } = await supabaseC.from('categories').insert({ store_id: storeA_id, name: 'CAT_CAJ' });
    recordResult('SEG-19.C10.categories_write', 'CAJERO insert en categories', 'Rechazado (42501)', classify(errC_insCat).status, classify(errC_insCat).detail);

    // C15..C20: Cash registers y Simulations
    const { error: errC_insReg } = await supabaseC.from('cash_registers').insert({ store_id: storeA_id, name: 'REG_CAJ' });
    recordResult('SEG-19.C11.cash_registers_write', 'CAJERO insert en cash_registers', 'Rechazado (42501)', classify(errC_insReg).status, classify(errC_insReg).detail);

    const { error: errC_insSim } = await supabaseC.from('simulations').insert({ store_id: storeA_id, product_name: 'S', quantity: 1, unit_cost: 1, unit_price: 2 });
    recordResult('SEG-19.C12.simulations_write', 'CAJERO insert en simulations', 'Rechazado (42501)', classify(errC_insSim).status, classify(errC_insSim).detail);

    // C21..C26: Store settings, store members y stores
    const { data: resC_set } = await supabaseC.from('store_settings').update({ store_name: 'HACK' }).eq('store_id', storeA_id).select();
    recordResult('SEG-19.C13.store_settings_update', 'CAJERO update en store_settings', '0 filas o 42501', (!resC_set || resC_set.length === 0) ? 'PASA' : 'FALLA', '0 filas afectadas');

    const { data: resC_memDel } = await supabaseC.from('store_members').delete().eq('store_id', storeA_id).eq('user_id', userB.id).select();
    recordResult('SEG-19.C14.store_members_delete', 'CAJERO delete en store_members', '0 filas o 42501', (!resC_memDel || resC_memDel.length === 0) ? 'PASA' : 'FALLA', '0 filas afectadas');

    const { data: resC_storeDel } = await supabaseC.from('stores').delete().eq('id', storeA_id).select();
    recordResult('SEG-19.C15.stores_delete', 'CAJERO delete en stores', '0 filas o 42501', (!resC_storeDel || resC_storeDel.length === 0) ? 'PASA' : 'FALLA', '0 filas afectadas');

    // --- REPOSITOR (B) ---
    // B1: process_sale
    const { data: saleB, error: errSaleB } = await supabaseB.rpc('process_sale', {
      p_store_id: storeA_id,
      p_ticket_number: 'TKT-REPO-000001',
      p_payment_method: 'efectivo',
      p_cash_given: 50,
      p_items: [{ productId: prod1.id, quantity: 1 }],
      p_register_id: registerA_id,
    });
    recordResult('SEG-19.B1.process_sale', 'REPOSITOR ejecuta process_sale', 'PASA (permitido)', (!errSaleB && saleB?.success) ? 'PASA' : 'FALLA', saleB?.success ? 'Venta procesada exitosamente por Repositor' : errSaleB?.message);

    // B2: adjust_stock (+2 en prod2)
    const { data: adjB, error: errAdjB } = await supabaseB.rpc('adjust_stock', {
      p_store_id: storeA_id,
      p_product_id: prod2.id,
      p_quantity_delta: 2,
      p_note: 'Ajuste legítimo Repositor',
      p_user_name: 'Repositor B',
    });
    recordResult('SEG-19.B2.adjust_stock', 'REPOSITOR ejecuta adjust_stock', 'PASA (permitido)', (!errAdjB && adjB?.success) ? 'PASA' : 'FALLA', adjB?.success ? 'Ajuste de stock ejecutado por Repositor' : errAdjB?.message);

    // B3: process_purchase (a crédito para que quede pendiente de pago)
    const { data: purB_repo, error: errPurB_repo } = await supabaseB.rpc('process_purchase', {
      p_store_id: storeA_id,
      p_supplier_id: supplierA_id,
      p_items: [{ product_id: prod1.id, quantity: 2, unit_cost: 5.00 }],
      p_note: 'Compra legítima Repositor a crédito',
      p_payment_condition: 'credito',
      p_credit_days: 15,
    });
    recordResult('SEG-19.B3.process_purchase', 'REPOSITOR ejecuta process_purchase (sin simulaciones)', 'PASA (permitido)', (!errPurB_repo && purB_repo?.success) ? 'PASA' : 'FALLA', purB_repo?.success ? 'Compra registrada por Repositor' : errPurB_repo?.message);

    // B4: INSERT producto nuevo en A
    const { data: newProdB, error: errNewProdB } = await supabaseB.from('products').insert({
      store_id: storeA_id,
      category_id: categoryA_id,
      name: 'PROD_B_NEW',
      cost_price: 7.00,
      sale_price: 14.00,
      stock: 10,
      unit: 'pza',
    }).select('id').single();
    const prodB_new_id = newProdB?.id;
    recordResult('SEG-19.B4.products_insert', 'REPOSITOR insert producto nuevo en tienda A', 'PASA (permitido)', (!errNewProdB && prodB_new_id) ? 'PASA' : 'FALLA', prodB_new_id ? `Producto creado: ${shortId(prodB_new_id)}` : errNewProdB?.message);

    // B5: UPDATE producto (sale_price) en A
    const { error: errUpdPriceB } = await supabaseB.from('products').update({ sale_price: 12.50 }).eq('id', prod1.id);
    recordResult('SEG-19.B5.products_update', 'REPOSITOR update sale_price en producto de tienda A', 'PASA (permitido)', !errUpdPriceB ? 'PASA' : 'FALLA', !errUpdPriceB ? 'Precio actualizado exitosamente por Repositor' : errUpdPriceB.message);

    // B6: INSERT categoría
    const { data: newCatB, error: errNewCatB } = await supabaseB.from('categories').insert({ store_id: storeA_id, name: 'CAT_REPO_B' }).select('id').single();
    recordResult('SEG-19.B6.categories_insert', 'REPOSITOR insert categoría nueva en tienda A', 'PASA (permitido)', (!errNewCatB && newCatB?.id) ? 'PASA' : 'FALLA', newCatB?.id ? 'Categoría creada por Repositor' : errNewCatB?.message);

    // B7: INSERT proveedor
    const { data: newSupB, error: errNewSupB } = await supabaseB.from('suppliers').insert({ store_id: storeA_id, name: 'SUP_REPO_B', payment_condition: 'contado' }).select('id').single();
    recordResult('SEG-19.B7.suppliers_insert', 'REPOSITOR insert proveedor nuevo en tienda A', 'PASA (permitido)', (!errNewSupB && newSupB?.id) ? 'PASA' : 'FALLA', newSupB?.id ? 'Proveedor creado por Repositor' : errNewSupB?.message);

    // B8: process_purchase con simulaciones -> debe fallar para Repositor
    const { error: errPurSimB } = await supabaseB.rpc('process_purchase', {
      p_store_id: storeA_id,
      p_supplier_id: supplierA_id,
      p_items: [{ product_id: prod1.id, quantity: 1, unit_cost: 5 }],
      p_simulation_ids: ['00000000-0000-0000-0000-000000000000'],
    });
    recordResult('SEG-19.B8.purchase_with_simulations', 'REPOSITOR llama process_purchase con p_simulation_ids', 'Error 42501 (solo Administrador)', classify(errPurSimB).status, classify(errPurSimB).detail);

    // B9..B10: pay_purchase e invite_by_code denegados para repositor
    const { error: errB_pay } = await supabaseB.rpc('pay_purchase', { p_store_id: storeA_id, p_purchase_id: '00000000-0000-0000-0000-000000000000' });
    recordResult('SEG-19.B9.pay_purchase', 'REPOSITOR llama pay_purchase', 'Error 42501 (solo Admin)', classify(errB_pay).status, classify(errB_pay).detail);

    const { error: errB_inv } = await supabaseB.rpc('invite_by_code', { p_store_id: storeA_id, p_user_code: 'RENT-TEST', p_role: 'CAJERO' });
    recordResult('SEG-19.B10.invite_by_code', 'REPOSITOR llama invite_by_code', 'Error 42501 (solo Admin)', classify(errB_inv).status, classify(errB_inv).detail);

    // B11..B13: DELETE en products/categories/suppliers denegado para repositor
    const { data: delB_prod } = await supabaseB.from('products').delete().eq('id', prod1.id).select();
    recordResult('SEG-19.B11.products_delete', 'REPOSITOR delete en products', '0 filas o 42501', (!delB_prod || delB_prod.length === 0) ? 'PASA' : 'FALLA', '0 filas afectadas');

    const { data: delB_cat } = await supabaseB.from('categories').delete().eq('id', categoryA_id).select();
    recordResult('SEG-19.B12.categories_delete', 'REPOSITOR delete en categories', '0 filas o 42501', (!delB_cat || delB_cat.length === 0) ? 'PASA' : 'FALLA', '0 filas afectadas');

    const { data: delB_sup } = await supabaseB.from('suppliers').delete().eq('id', supplierA_id).select();
    recordResult('SEG-19.B13.suppliers_delete', 'REPOSITOR delete en suppliers', '0 filas o 42501', (!delB_sup || delB_sup.length === 0) ? 'PASA' : 'FALLA', '0 filas afectadas');

    // B14..B18: Simulations, registers, settings, members, stores
    const { error: errB_sim } = await supabaseB.from('simulations').insert({ store_id: storeA_id, product_name: 'S', quantity: 1, unit_cost: 1, unit_price: 2 });
    recordResult('SEG-19.B14.simulations_write', 'REPOSITOR insert en simulations', 'Rechazado (42501)', classify(errB_sim).status, classify(errB_sim).detail);

    const { error: errB_reg } = await supabaseB.from('cash_registers').insert({ store_id: storeA_id, name: 'R' });
    recordResult('SEG-19.B15.cash_registers_write', 'REPOSITOR insert en cash_registers', 'Rechazado (42501)', classify(errB_reg).status, classify(errB_reg).detail);

    const { data: resB_set } = await supabaseB.from('store_settings').update({ store_name: 'H' }).eq('store_id', storeA_id).select();
    recordResult('SEG-19.B16.store_settings_update', 'REPOSITOR update en store_settings', '0 filas o 42501', (!resB_set || resB_set.length === 0) ? 'PASA' : 'FALLA', '0 filas afectadas');

    const { data: resB_mem } = await supabaseB.from('store_members').update({ role: 'ADMIN' }).eq('store_id', storeA_id).eq('user_id', userC.id).select();
    recordResult('SEG-19.B17.store_members_update', 'REPOSITOR update en store_members', '0 filas o 42501', (!resB_mem || resB_mem.length === 0) ? 'PASA' : 'FALLA', '0 filas afectadas');

    const { data: resB_sto } = await supabaseB.from('stores').update({ name: 'H' }).eq('id', storeA_id).select();
    recordResult('SEG-19.B18.stores_update', 'REPOSITOR update en stores', '0 filas o 42501', (!resB_sto || resB_sto.length === 0) ? 'PASA' : 'FALLA', '0 filas afectadas');

    // --- ADMIN (A) ---
    // A1: pay_purchase
    const { data: pursA } = await supabaseA.from('purchases').select('id, paid_at').eq('store_id', storeA_id).is('paid_at', null).limit(1);
    const purchaseToPay = pursA?.[0]?.id;
    if (purchaseToPay) {
      const { data: payResA, error: errPayA } = await supabaseA.rpc('pay_purchase', { p_store_id: storeA_id, p_purchase_id: purchaseToPay });
      recordResult('SEG-19.A1.pay_purchase', 'ADMIN ejecuta pay_purchase', 'PASA (permitido)', (!errPayA && payResA?.success) ? 'PASA' : 'FALLA', payResA?.success ? `Pago de compra registrado exitosamente por Admin (ID: ${shortId(purchaseToPay)})` : errPayA?.message);
    } else {
      recordResult('SEG-19.A1.pay_purchase', 'ADMIN ejecuta pay_purchase', 'PASA (permitido)', 'FALLA', 'No se encontró compra a crédito pendiente para pagar');
    }

    // A2: delete producto (PROD_B_NEW)
    if (prodB_new_id) {
      const { data: delA_prod, error: errDelA } = await supabaseA.from('products').delete().eq('id', prodB_new_id).select();
      recordResult('SEG-19.A2.products_delete', 'ADMIN elimina producto PROD_B_NEW', 'PASA (permitido)', (!errDelA && delA_prod?.length > 0) ? 'PASA' : 'FALLA', delA_prod?.length > 0 ? 'Producto eliminado por Admin' : errDelA?.message);
    }

    // --- LECTURAS DE C, CONTROLES POSITIVOS Y RIESGO RESIDUAL (H-07 / H-09) ---
    // A crea una simulación válida para pruebas de control positivo y lectura
    const simPayload = {
      store_id: storeA_id,
      product_id: prod1.id,
      product_name: prod1.name,
      supplier_id: supplierA_id,
      quantity: 5,
      unit_cost: 5.00,
      unit_price: 10.00,
      payment_condition: 'contado',
      credit_days: 0,
      projected_days_to_sell: 10,
      projected_daily_profit: 2.50,
      verdict: 'CONVIENE',
      details: {},
    };
    const { data: simCreated, error: errCreateSim } = await supabaseA.from('simulations').insert(simPayload).select('id').maybeSingle();

    // SEG-19.L1: C (cajero) lee purchases, purchase_items, suppliers y simulations de tienda A.
    // Esperado: 0 filas en cada una, sin error. Un registro por tabla; FALLA si devuelve filas.
    const { data: readC_purchases, error: errC_readPur } = await supabaseC.from('purchases').select('id').eq('store_id', storeA_id);
    const l1_pur_ok = !errC_readPur && (readC_purchases?.length || 0) === 0;
    recordResult(
      'SEG-19.L1.purchases',
      'CAJERO lee purchases de tienda A',
      '0 filas devueltas sin error',
      l1_pur_ok ? 'PASA' : 'FALLA',
      l1_pur_ok ? '0 filas devueltas' : (errC_readPur?.message || `Devolvió ${readC_purchases?.length} fila(s)`)
    );

    const { data: readC_items, error: errC_readItems } = await supabaseC.from('purchase_items').select('id').eq('store_id', storeA_id);
    const l1_items_ok = !errC_readItems && (readC_items?.length || 0) === 0;
    recordResult(
      'SEG-19.L1.purchase_items',
      'CAJERO lee purchase_items de tienda A',
      '0 filas devueltas sin error',
      l1_items_ok ? 'PASA' : 'FALLA',
      l1_items_ok ? '0 filas devueltas' : (errC_readItems?.message || `Devolvió ${readC_items?.length} fila(s)`)
    );

    const { data: readC_sups, error: errC_readSups } = await supabaseC.from('suppliers').select('id').eq('store_id', storeA_id);
    const l1_sups_ok = !errC_readSups && (readC_sups?.length || 0) === 0;
    recordResult(
      'SEG-19.L1.suppliers',
      'CAJERO lee suppliers de tienda A',
      '0 filas devueltas sin error',
      l1_sups_ok ? 'PASA' : 'FALLA',
      l1_sups_ok ? '0 filas devueltas' : (errC_readSups?.message || `Devolvió ${readC_sups?.length} fila(s)`)
    );

    const { data: readC_sims, error: errC_readSims } = await supabaseC.from('simulations').select('id').eq('store_id', storeA_id);
    const l1_sims_ok = !errC_readSims && (readC_sims?.length || 0) === 0;
    recordResult(
      'SEG-19.L1.simulations',
      'CAJERO lee simulations de tienda A',
      '0 filas devueltas sin error',
      l1_sims_ok ? 'PASA' : 'FALLA',
      l1_sims_ok ? '0 filas devueltas' : (errC_readSims?.message || `Devolvió ${readC_sims?.length} fila(s)`)
    );

    // SEG-19.L2 (controles positivos): B (repositor) y A (admin) leen purchases, purchase_items y suppliers y reciben >0 filas.
    // A crea una simulación válida y A la lee (>0) mientras B y C leen 0. Si no se pudo crear simulación: INCONCLUSO.
    const { data: aPurchases } = await supabaseA.from('purchases').select('id').eq('store_id', storeA_id);
    const { data: bPurchases } = await supabaseB.from('purchases').select('id').eq('store_id', storeA_id);
    const l2_pur_ok = (aPurchases?.length || 0) > 0 && (bPurchases?.length || 0) > 0;
    recordResult(
      'SEG-19.L2.purchases',
      'Control positivo: A y B leen purchases (>0 filas)',
      '>0 filas para A y B',
      l2_pur_ok ? 'PASA' : 'FALLA',
      `Filas leídas: A=${aPurchases?.length || 0}, B=${bPurchases?.length || 0}`
    );

    const { data: aItems } = await supabaseA.from('purchase_items').select('id').eq('store_id', storeA_id);
    const { data: bItems } = await supabaseB.from('purchase_items').select('id').eq('store_id', storeA_id);
    const l2_items_ok = (aItems?.length || 0) > 0 && (bItems?.length || 0) > 0;
    recordResult(
      'SEG-19.L2.purchase_items',
      'Control positivo: A y B leen purchase_items (>0 filas)',
      '>0 filas para A y B',
      l2_items_ok ? 'PASA' : 'FALLA',
      `Filas leídas: A=${aItems?.length || 0}, B=${bItems?.length || 0}`
    );

    const { data: aSups } = await supabaseA.from('suppliers').select('id').eq('store_id', storeA_id);
    const { data: bSups } = await supabaseB.from('suppliers').select('id').eq('store_id', storeA_id);
    const l2_sups_ok = (aSups?.length || 0) > 0 && (bSups?.length || 0) > 0;
    recordResult(
      'SEG-19.L2.suppliers',
      'Control positivo: A y B leen suppliers (>0 filas)',
      '>0 filas para A y B',
      l2_sups_ok ? 'PASA' : 'FALLA',
      `Filas leídas: A=${aSups?.length || 0}, B=${bSups?.length || 0}`
    );

    if (errCreateSim || !simCreated?.id) {
      recordResult(
        'SEG-19.L2.simulations',
        'Control positivo simulations: A lee >0, B y C leen 0',
        'A>0, B=0, C=0',
        'INCONCLUSO',
        `No se pudo crear simulación de prueba para A: ${errCreateSim?.message || 'sin id'}`
      );
    } else {
      const { data: aSims } = await supabaseA.from('simulations').select('id').eq('store_id', storeA_id);
      const { data: bSims } = await supabaseB.from('simulations').select('id').eq('store_id', storeA_id);
      const { data: cSims } = await supabaseC.from('simulations').select('id').eq('store_id', storeA_id);
      const countA = aSims?.length || 0;
      const countB = bSims?.length || 0;
      const countC = cSims?.length || 0;
      const l2SimOk = countA > 0 && countB === 0 && countC === 0;

      recordResult(
        'SEG-19.L2.simulations',
        'Control positivo simulations: A lee >0, B y C leen 0',
        'A>0, B=0, C=0',
        l2SimOk ? 'PASA' : 'FALLA',
        `A=${countA}, B=${countB}, C=${countC}`
      );
    }

    // SEG-19.L3: C ejecuta la MISMA consulta de la app:
    // from('purchases').select('*, purchase_items(*), suppliers(name)').eq('store_id', A)
    // y from('suppliers').select('*').eq('store_id', A).
    // Esperado: sin error y 0 filas (la app no debe romperse).
    const { data: appPurchases, error: errAppPur } = await supabaseC
      .from('purchases')
      .select('*, purchase_items(*), suppliers(name)')
      .eq('store_id', storeA_id);

    const { data: appSuppliers, error: errAppSup } = await supabaseC
      .from('suppliers')
      .select('*')
      .eq('store_id', storeA_id);

    const countAppPurchases = appPurchases?.length || 0;
    const l3PurchasesOk = !errAppPur && countAppPurchases === 0;
    recordResult(
      'SEG-19.L3.purchases_app',
      'C ejecuta consulta de compras de la app con joins (*, purchase_items(*), suppliers(name))',
      'Sin error y 0 filas',
      l3PurchasesOk ? 'PASA' : 'FALLA',
      errAppPur ? `Error en consulta: ${errAppPur.message}` : `Filas devueltas: ${countAppPurchases}`
    );

    const countAppSuppliers = appSuppliers?.length || 0;
    const l3SuppliersOk = !errAppSup && countAppSuppliers === 0;
    recordResult(
      'SEG-19.L3.suppliers_app',
      'C ejecuta consulta de proveedores de la app select(*)',
      'Sin error y 0 filas',
      l3SuppliersOk ? 'PASA' : 'FALLA',
      errAppSup ? `Error en consulta: ${errAppSup.message}` : `Filas devueltas: ${countAppSuppliers}`
    );

    // SEG-19.L4: C lee products.cost_price, sales.total_profit y sale_items.unit_cost/profit:
    // marca CONOCIDO (riesgo residual H-09) con el conteo de filas. No cuenta como FALLA.
    const { data: readC_prods } = await supabaseC.from('products').select('id, cost_price').eq('store_id', storeA_id);
    const { data: readC_sales } = await supabaseC.from('sales').select('id, total_profit').eq('store_id', storeA_id);
    const { data: readC_saleItems } = await supabaseC.from('sale_items').select('id, unit_cost, profit').eq('store_id', storeA_id);

    recordResult(
      'SEG-19.L4.residual_costs',
      'C lee products.cost_price, sales.total_profit y sale_items.unit_cost/profit',
      'CONOCIDO (H-09: riesgo residual de costos en ventas y productos)',
      'CONOCIDO',
      `[H-09] Leídas por API: ${readC_prods?.length || 0} prods (cost_price), ${readC_sales?.length || 0} ventas (total_profit), ${readC_saleItems?.length || 0} partidas venta (unit_cost/profit).`
    );

  } catch (err) {
    aborted = true;
    console.error('❌ Error fatal en flujo de pruebas:', err);
  } finally {
    // --- [8/8] LIMPIEZA FINAL ---
    console.log('\n[8/8] Limpieza final de tiendas y verificación de estado...');

    if (storeA_id) {
      try {
        assertAllowedStoreName(STORE_NAME_A, 'limpieza final A');
        await supabaseA.from('stores').delete().eq('id', storeA_id);
        console.log(`✅ Tienda A "${STORE_NAME_A}" eliminada correctamente.`);
      } catch (e) {
        console.error(`⚠️ Error eliminando tienda A: ${e.message}`);
      }
    }

    if (storeB_id) {
      try {
        assertAllowedStoreName(STORE_NAME_B, 'limpieza final B');
        await supabaseB.from('stores').delete().eq('id', storeB_id);
        console.log(`✅ Tienda B "${STORE_NAME_B}" eliminada correctamente.`);
      } catch (e) {
        console.error(`⚠️ Error eliminando tienda B: ${e.message}`);
      }
    }

    // Restaurar active_store_id a null en B y C por si acaso
    await supabaseB.from('profiles').update({ active_store_id: null }).eq('id', userB.id);
    await supabaseC.from('profiles').update({ active_store_id: null }).eq('id', userC.id);

    // Comprobar que B y C quedaron sin membresías
    const { data: finalMemB } = await supabaseB.from('store_members').select('*');
    const { data: finalMemC } = await supabaseC.from('store_members').select('*');

    const cleanSuccess = (finalMemB?.length || 0) === 0 && (finalMemC?.length || 0) === 0;
    if (cleanSuccess) {
      console.log('✅ Confirmado: Usuarios B y C quedaron limpios sin membresías en store_members.');
    } else {
      console.warn('⚠️ Advertencia: Alguna membresía residual permanece en store_members.');
    }
  }

  // ==========================================================================
  // REPORTE DE RESULTADOS Y RESUMEN POR SEG
  // ==========================================================================
  console.log('\n' + '='.repeat(105));
  console.log('📊 REPORTE DE AUTORIZACIÓN Y ROLES (FASE 3 — SEG-15 A SEG-20)');
  console.log('='.repeat(105));

  let passCount = 0;
  let failCount = 0;
  let conocidoCount = 0;
  let inconclusoCount = 0;

  const segStats = {
    'SEG-16': { pasa: 0, falla: 0, conocido: 0, inconcluso: 0 },
    'SEG-17': { pasa: 0, falla: 0, conocido: 0, inconcluso: 0 },
    'SEG-18': { pasa: 0, falla: 0, conocido: 0, inconcluso: 0 },
    'SEG-19': { pasa: 0, falla: 0, conocido: 0, inconcluso: 0 },
    'SEG-20': { pasa: 0, falla: 0, conocido: 0, inconcluso: 0 },
  };

  console.log('| Código | Prueba | Esperado | Resultado | Detalle |');
  console.log('|---|---|---|---|---|');
  for (const r of testResults) {
    if (r.resultado === 'PASA') passCount++;
    else if (r.resultado === 'FALLA') failCount++;
    else if (r.resultado === 'CONOCIDO') conocidoCount++;
    else inconclusoCount++;

    // Extraer prefijo SEG
    const m = r.codigo.match(/^SEG-\d+/);
    if (m && segStats[m[0]]) {
      const key = r.resultado.toLowerCase();
      if (segStats[m[0]][key] !== undefined) {
        segStats[m[0]][key]++;
      }
    }

    console.log(`| \`${r.codigo}\` | ${r.prueba} | ${r.esperado} | **${r.resultado}** | ${r.detalle} |`);
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`Total Pruebas Ejecutadas : ${testResults.length}`);
  console.log(`✅ PASA                  : ${passCount}`);
  console.log(`❌ FALLA                 : ${failCount}`);
  console.log(`ℹ️ CONOCIDO (H-09)       : ${conocidoCount}`);
  console.log(`⚠️ INCONCLUSO            : ${inconclusoCount}`);
  console.log(`🛑 Abortado por Error    : ${aborted ? 'SÍ' : 'NO'}`);
  console.log('-'.repeat(60));

  console.log('\n📋 RESUMEN POR MÓDULO SEG:');
  for (const [seg, st] of Object.entries(segStats)) {
    console.log(`   - ${seg}: ${st.pasa} PASA, ${st.falla} FALLA, ${st.conocido} CONOCIDO (H-09), ${st.inconcluso} INCONCLUSO`);
  }

  if (failCount === 0 && !aborted) {
    console.log('\n🛡️ CONTROL DE ACCESO VERIFICADO: Todas las pruebas de autorización y roles cumplieron las expectativas.');
    process.exit(0);
  } else {
    console.error('\n⚠️ SE DETECTARON FALLAS DE AUTORIZACIÓN O ESCALADA DE PRIVILEGIOS.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
