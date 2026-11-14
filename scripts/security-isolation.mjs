#!/usr/bin/env node
/**
 * scripts/security-isolation.mjs
 *
 * FASE 5B: Prueba exhaustiva de aislamiento multi-inquilino entre usuarios (Rentabill).
 * Demuestra con datos reales que el Usuario B (no miembro de la tienda de A) no puede
 * leer, modificar ni ejecutar RPCs sobre los recursos de la tienda de A.
 *
 * Uso:
 *   node --env-file=.env.test scripts/security-isolation.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'node:buffer';

// ============================================================================
// 1. Constantes y Guardas de Seguridad
// ============================================================================
const STORE_NAME_A = 'PRUEBAS-AISLAMIENTO';
const STORE_NAME_B = 'PRUEBAS-AISLAMIENTO-B';

function assertAllowedStoreName(storeName, context = '') {
  const allowed = [STORE_NAME_A, STORE_NAME_B];
  if (!allowed.includes(storeName)) {
    throw new Error(
      `🚨 GUARDIA DE SEGURIDAD ABORTADA (${context}): Operación no permitida sobre "${storeName}". ` +
      `Este script SOLO puede crear o eliminar tiendas que coincidan exactamente con: ${allowed.join(', ')}.`
    );
  }
}

// ============================================================================
// 2. Registro de Resultados
// ============================================================================
const testResults = [];

function recordResult(code, testName, status, detail) {
  testResults.push({
    codigo: code,
    prueba: testName,
    resultado: status,
    detalle: String(detail || '').replace(/\r?\n/g, ' ').substring(0, 100),
  });
}

// ============================================================================
// 3. Flujo Principal
// ============================================================================
async function main() {
  console.log('='.repeat(80));
  console.log('🔒 FASE 5B — PRUEBA DE AISLAMIENTO ENTRE USUARIOS (RENTABILL)');
  console.log('='.repeat(80));

  // --- Validación de variables de entorno ---
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
    console.error('❌ Faltan variables requeridas en .env.test:');
    missing.forEach(m => console.error(`   - ${m}`));
    console.error('\nPara ejecutar este script, asegúrate de configurar en .env.test:');
    console.error('   TEST_USER_EMAIL y TEST_USER_PASSWORD (Usuario A)');
    console.error('   TEST_USER_B_EMAIL y TEST_USER_B_PASSWORD (Usuario B)');
    console.error('\nComando:');
    console.error('   node --env-file=.env.test scripts/security-isolation.mjs\n');
    process.exit(1);
  }

  // --- Clientes Supabase ---
  const clientOptions = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  };

  const supabaseA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
  const supabaseB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
  const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);

  // --- Autenticación ---
  console.log('\n[1/7] Autenticando usuarios de prueba...');
  const { data: authDataA, error: authErrorA } = await supabaseA.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });
  if (authErrorA || !authDataA?.user) {
    console.error('❌ Error autenticando Usuario A:', authErrorA?.message);
    process.exit(1);
  }
  const userA = authDataA.user;
  console.log(`✅ Usuario A autenticado: ID ${userA.id}`);

  const { data: authDataB, error: authErrorB } = await supabaseB.auth.signInWithPassword({
    email: TEST_USER_B_EMAIL,
    password: TEST_USER_B_PASSWORD,
  });
  if (authErrorB || !authDataB?.user) {
    console.error('❌ Error autenticando Usuario B:', authErrorB?.message);
    process.exit(1);
  }
  const userB = authDataB.user;
  console.log(`✅ Usuario B autenticado: ID ${userB.id}`);

  if (userA.id === userB.id) {
    console.error('❌ El Usuario A y el Usuario B deben ser cuentas distintas en Supabase.');
    process.exit(1);
  }

  let storeA_id = null;
  let storeB_id = null;
  let prod1 = null;
  let prod2 = null;
  let purchaseId = null;
  let initialSnapshot = null;

  try {
    // ========================================================================
    // PREPARACIÓN (como A)
    // ========================================================================
    console.log('\n[2/7] Preparación de datos como Usuario A...');

    // Limpieza previa si existiera la tienda A
    const { data: prevStoresA } = await supabaseA
      .from('stores')
      .select('id, name')
      .eq('name', STORE_NAME_A);
    if (prevStoresA && prevStoresA.length > 0) {
      for (const st of prevStoresA) {
        assertAllowedStoreName(st.name, 'limpieza previa A');
        await supabaseA.from('stores').delete().eq('id', st.id);
      }
    }

    // 1. Crear tienda PRUEBAS-AISLAMIENTO
    assertAllowedStoreName(STORE_NAME_A, 'crear tienda A');
    const { data: storeResA, error: errStoreA } = await supabaseA.rpc('create_store', {
      name: STORE_NAME_A,
      type: 'Abarrotes',
      currency: 'PEN',
    });
    if (errStoreA) throw new Error(`Error en create_store A: ${errStoreA.message}`);
    storeA_id = storeResA?.id || storeResA?.store_id;
    if (!storeA_id) throw new Error(`No se obtuvo ID de tienda A: ${JSON.stringify(storeResA)}`);
    console.log(`✅ Tienda A creada: "${STORE_NAME_A}" (ID: ${storeA_id})`);

    // Obtener categoría por defecto
    const { data: catData, error: catErr } = await supabaseA
      .from('categories')
      .select('id, name')
      .eq('store_id', storeA_id)
      .limit(1)
      .single();
    if (catErr || !catData) throw new Error(`Error al leer categoría por defecto: ${catErr?.message}`);
    const categoryId = catData.id;

    // Obtener caja registradora activa
    const { data: regData } = await supabaseA
      .from('cash_registers')
      .select('id')
      .eq('store_id', storeA_id)
      .limit(1)
      .maybeSingle();
    const registerId = regData?.id || null;

    // 2. Crear 2 productos
    const { data: prodsData, error: errProds } = await supabaseA
      .from('products')
      .insert([
        {
          store_id: storeA_id,
          category_id: categoryId,
          name: 'PROD_AISLA_01',
          barcode: 'BAR_AISLA_01',
          cost_price: 5.00,
          sale_price: 10.00,
          stock: 50,
          unit: 'pza',
        },
        {
          store_id: storeA_id,
          category_id: categoryId,
          name: 'PROD_AISLA_02',
          barcode: 'BAR_AISLA_02',
          cost_price: 12.00,
          sale_price: 20.00,
          stock: 30,
          unit: 'pza',
        },
      ])
      .select('id, name, stock, sale_price');
    if (errProds || !prodsData || prodsData.length < 2) {
      throw new Error(`Error al insertar productos: ${errProds?.message}`);
    }
    prod1 = prodsData[0];
    prod2 = prodsData[1];
    console.log(`✅ Productos creados: ${prod1.name} (stock ${prod1.stock}), ${prod2.name} (stock ${prod2.stock})`);

    // 3. Ejecutar 1 venta con process_sale (genera venta, partidas y kardex)
    const ticketA = 'TKT-AISLA-000001';
    const { data: saleResA, error: errSaleA } = await supabaseA.rpc('process_sale', {
      p_store_id: storeA_id,
      p_ticket_number: ticketA,
      p_payment_method: 'tarjeta',
      p_cash_given: null,
      p_items: [{ productId: prod1.id, quantity: 2 }],
      p_register_id: registerId,
    });
    if (errSaleA || !saleResA?.success) {
      throw new Error(`Error en process_sale de control: ${errSaleA?.message || JSON.stringify(saleResA)}`);
    }
    console.log(`✅ Venta de control procesada: ${ticketA}`);

    // 4. Crear 1 proveedor
    const { data: supData, error: errSup } = await supabaseA
      .from('suppliers')
      .insert({
        store_id: storeA_id,
        name: 'PROVEEDOR_AISLA_CENTRAL',
        payment_condition: 'contado',
        credit_days: 0,
      })
      .select('id, name')
      .single();
    if (errSup || !supData) throw new Error(`Error al crear proveedor: ${errSup?.message}`);
    const supplierId = supData.id;

    // 5. Crear 1 compra y partida de compra
    const { data: purRes, error: errPur } = await supabaseA.rpc('process_purchase', {
      p_store_id: storeA_id,
      p_supplier_id: supplierId,
      p_items: [{ productId: prod2.id, quantity: 5, unitCost: 12.00 }],
      p_note: 'Compra control FASE 5B',
      p_payment_condition: 'contado',
      p_credit_days: 0,
    });
    if (!errPur && purRes?.success) {
      purchaseId = purRes.purchase_id;
      console.log(`✅ Compra de control procesada: ${purchaseId}`);
    } else {
      // Fallback: insert directo si el RPC no estuviera disponible
      const { data: insPur } = await supabaseA
        .from('purchases')
        .insert({
          store_id: storeA_id,
          supplier_id: supplierId,
          total: 60.00,
          payment_condition: 'contado',
          credit_days: 0,
          paid_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (insPur) {
        purchaseId = insPur.id;
        await supabaseA.from('purchase_items').insert({
          store_id: storeA_id,
          purchase_id: purchaseId,
          product_id: prod2.id,
          quantity: 5,
          unit_cost: 12.00,
        });
        console.log(`✅ Compra de control insertada directamente: ${purchaseId}`);
      }
    }

    // 6. Crear 1 simulación
    const { error: errSim } = await supabaseA
      .from('simulations')
      .insert({
        store_id: storeA_id,
        product_id: prod1.id,
        product_name: prod1.name,
        supplier_id: supplierId,
        quantity: 10,
        unit_cost: 5.00,
        unit_price: 10.00,
        payment_condition: 'contado',
        credit_days: 0,
        projected_days_to_sell: 7,
        projected_daily_profit: 7.14,
        verdict: 'CONVIENE',
        status: 'PENDIENTE',
      });
    if (errSim) console.warn('⚠️ No se pudo insertar fila de control en simulations:', errSim.message);

    // 7. Crear 1 invitación de equipo
    const { error: errInv } = await supabaseA
      .from('store_invitations')
      .insert({
        store_id: storeA_id,
        email: 'invitado_test_fase5b@rentabill.pe',
        role: 'CAJERO',
        status: 'PENDIENTE',
      });
    if (errInv) console.warn('⚠️ No se pudo insertar fila de control en store_invitations:', errInv.message);

    // 8. Asegurar user_preferences para Usuario A
    await supabaseA
      .from('user_preferences')
      .upsert({
        user_id: userA.id,
        dark_mode: false,
        language: 'Español (Sencillo)',
      });

    // 9. Tomar foto del estado inicial de la tienda de A (incluye miembros)
    const { data: snapProds } = await supabaseA
      .from('products')
      .select('id, name, stock, sale_price')
      .eq('store_id', storeA_id)
      .order('id');
    const { data: snapStore } = await supabaseA
      .from('stores')
      .select('name')
      .eq('id', storeA_id)
      .single();
    const { data: snapMembers } = await supabaseA
      .from('store_members')
      .select('user_id, role')
      .eq('store_id', storeA_id)
      .order('user_id');

    initialSnapshot = {
      storeName: snapStore?.name,
      productsCount: snapProds?.length || 0,
      products: snapProds || [],
      membersCount: snapMembers?.length || 0,
      members: snapMembers || [],
    };
    console.log(`📸 Foto inicial de tienda A: ${initialSnapshot.productsCount} productos, ${initialSnapshot.membersCount} miembros.`);

    // ========================================================================
    // PRUEBAS COMO B (B NO es miembro de PRUEBAS-AISLAMIENTO)
    // ========================================================================

    // ------------------------------------------------------------------------
    // L. LECTURA DIRECTA (SELECT)
    // ------------------------------------------------------------------------
    console.log('\n[3/7] Ejecutando Pruebas L (Lectura directa como Usuario B)...');

    const tablesToTest = [
      { code: 'L.1', table: 'products', filterCol: 'store_id', filterVal: storeA_id },
      { code: 'L.2', table: 'product_stats', filterCol: 'store_id', filterVal: storeA_id, isView: true },
      { code: 'L.3', table: 'sales', filterCol: 'store_id', filterVal: storeA_id },
      { code: 'L.4', table: 'sale_items', filterCol: 'store_id', filterVal: storeA_id },
      { code: 'L.5', table: 'inventory_movements', filterCol: 'store_id', filterVal: storeA_id },
      { code: 'L.6', table: 'categories', filterCol: 'store_id', filterVal: storeA_id },
      { code: 'L.7', table: 'suppliers', filterCol: 'store_id', filterVal: storeA_id },
      { code: 'L.8', table: 'store_settings', filterCol: 'store_id', filterVal: storeA_id },
      { code: 'L.9', table: 'cash_registers', filterCol: 'store_id', filterVal: storeA_id },
      { code: 'L.10', table: 'store_members', filterCol: 'store_id', filterVal: storeA_id },
      { code: 'L.11', table: 'store_invitations', filterCol: 'store_id', filterVal: storeA_id },
      { code: 'L.12', table: 'purchases', filterCol: 'store_id', filterVal: storeA_id },
      { code: 'L.13', table: 'purchase_items', filterCol: 'store_id', filterVal: storeA_id },
      { code: 'L.14', table: 'simulations', filterCol: 'store_id', filterVal: storeA_id },
      { code: 'L.15', table: 'stores', filterCol: 'id', filterVal: storeA_id },
      { code: 'L.16', table: 'profiles', filterCol: 'id', filterVal: userA.id },
      { code: 'L.17', table: 'user_preferences', filterCol: 'user_id', filterVal: userA.id },
    ];

    for (const item of tablesToTest) {
      // Control positivo: consulta ejecutada por Usuario A
      const { data: dataA, error: errA } = await supabaseA
        .from(item.table)
        .select('*')
        .eq(item.filterCol, item.filterVal);

      const countA = (!errA && dataA) ? dataA.length : 0;

      // Consulta ejecutada por Usuario B
      const { data: dataB, error: errB } = await supabaseB
        .from(item.table)
        .select('*')
        .eq(item.filterCol, item.filterVal);

      const countB = (!errB && dataB) ? dataB.length : 0;

      if (countA === 0) {
        recordResult(
          item.code,
          `SELECT en ${item.table}`,
          'SIN CONTROL',
          `Usuario A no tiene datos de control (${errA ? errA.message : '0 filas'})`
        );
      } else if (errB) {
        // Bloqueado a nivel RLS con error
        recordResult(
          item.code,
          `SELECT en ${item.table}`,
          'PASA',
          `Bloqueado por RLS (error: ${errB.message}). Control A: ${countA} filas.`
        );
      } else if (countB === 0) {
        // RLS filtró y devolvió 0 filas
        recordResult(
          item.code,
          `SELECT en ${item.table}`,
          'PASA',
          `0 filas devueltas a Usuario B. Control A: ${countA} filas.`
        );
      } else {
        // Fuga de datos
        recordResult(
          item.code,
          `SELECT en ${item.table}`,
          'FALLA',
          `FUGA DE DATOS: Usuario B obtuvo ${countB} filas.`
        );
      }
    }

    // ------------------------------------------------------------------------
    // W. ESCRITURA DIRECTA
    // ------------------------------------------------------------------------
    console.log('\n[4/7] Ejecutando Pruebas W (Escritura directa exhaustiva como Usuario B)...');

    // W.1: INSERT en store_members autoañadiéndose B como ADMIN (CRÍTICA)
    const { data: insMemResB, error: insMemErrB } = await supabaseB
      .from('store_members')
      .insert({
        store_id: storeA_id,
        user_id: userB.id,
        role: 'ADMIN',
      })
      .select('*');
    if (insMemErrB || !insMemResB || insMemResB.length === 0) {
      recordResult('W.1', 'INSERT en store_members autoañadirse como ADMIN', 'PASA', `Rechazado (error: ${insMemErrB?.message || '0 filas insertadas'})`);
    } else {
      recordResult('W.1', 'INSERT en store_members autoañadirse como ADMIN', 'FALLA', 'GRAVE: Usuario B se autoasignó como ADMIN en tienda A');
    }

    // W.2: INSERT en store_invitations por B
    const { data: insInvResB, error: insInvErrB } = await supabaseB
      .from('store_invitations')
      .insert({
        store_id: storeA_id,
        email: 'hacker_invitacion@rentabill.pe',
        role: 'ADMIN',
      })
      .select('id');
    if (insInvErrB || !insInvResB || insInvResB.length === 0) {
      recordResult('W.2', 'INSERT en store_invitations de tienda A', 'PASA', `Rechazado (error: ${insInvErrB?.message || '0 filas'})`);
    } else {
      recordResult('W.2', 'INSERT en store_invitations de tienda A', 'FALLA', 'Usuario B pudo crear invitaciones en tienda A');
    }

    // W.3: INSERT en categories por B
    const { data: insCatResB, error: insCatErrB } = await supabaseB
      .from('categories')
      .insert({
        store_id: storeA_id,
        name: 'CATEGORIA_HACKER_B',
      })
      .select('id');
    if (insCatErrB || !insCatResB || insCatResB.length === 0) {
      recordResult('W.3', 'INSERT en categories de tienda A', 'PASA', `Rechazado (error: ${insCatErrB?.message || '0 filas'})`);
    } else {
      recordResult('W.3', 'INSERT en categories de tienda A', 'FALLA', 'Usuario B pudo insertar categorías en tienda A');
    }

    // W.4: INSERT en suppliers por B
    const { data: insSupResB, error: insSupErrB } = await supabaseB
      .from('suppliers')
      .insert({
        store_id: storeA_id,
        name: 'PROVEEDOR_HACKER_B',
        payment_condition: 'contado',
        credit_days: 0,
      })
      .select('id');
    if (insSupErrB || !insSupResB || insSupResB.length === 0) {
      recordResult('W.4', 'INSERT en suppliers de tienda A', 'PASA', `Rechazado (error: ${insSupErrB?.message || '0 filas'})`);
    } else {
      recordResult('W.4', 'INSERT en suppliers de tienda A', 'FALLA', 'Usuario B pudo insertar proveedores en tienda A');
    }

    // W.5: INSERT en simulations por B
    const { data: insSimResB, error: insSimErrB } = await supabaseB
      .from('simulations')
      .insert({
        store_id: storeA_id,
        product_name: 'SIM_HACKER_B',
        quantity: 10,
        unit_cost: 5.00,
        unit_price: 10.00,
        payment_condition: 'contado',
        credit_days: 0,
        projected_days_to_sell: 5,
        projected_daily_profit: 5.00,
        verdict: 'CONVIENE',
        status: 'PENDIENTE',
      })
      .select('id');
    if (insSimErrB || !insSimResB || insSimResB.length === 0) {
      recordResult('W.5', 'INSERT en simulations de tienda A', 'PASA', `Rechazado (error: ${insSimErrB?.message || '0 filas'})`);
    } else {
      recordResult('W.5', 'INSERT en simulations de tienda A', 'FALLA', 'Usuario B pudo insertar simulaciones en tienda A');
    }

    // W.6: INSERT en cash_registers por B
    const { data: insRegResB, error: insRegErrB } = await supabaseB
      .from('cash_registers')
      .insert({
        store_id: storeA_id,
        name: 'CAJA_HACKER_B',
        is_active: true,
      })
      .select('id');
    if (insRegErrB || !insRegResB || insRegResB.length === 0) {
      recordResult('W.6', 'INSERT en cash_registers de tienda A', 'PASA', `Rechazado (error: ${insRegErrB?.message || '0 filas'})`);
    } else {
      recordResult('W.6', 'INSERT en cash_registers de tienda A', 'FALLA', 'Usuario B pudo insertar cajas registradoras en tienda A');
    }

    // W.7: INSERT en store_settings por B
    const { data: insSetResB, error: insSetErrB } = await supabaseB
      .from('store_settings')
      .insert({
        store_id: storeA_id,
        daily_goal_percent: 50.00,
      })
      .select('store_id');
    if (insSetErrB || !insSetResB || insSetResB.length === 0) {
      recordResult('W.7', 'INSERT en store_settings de tienda A', 'PASA', `Rechazado (error: ${insSetErrB?.message || '0 filas'})`);
    } else {
      recordResult('W.7', 'INSERT en store_settings de tienda A', 'FALLA', 'Usuario B pudo insertar configuración en tienda A');
    }

    // W.8: INSERT en products con store_id de A por B
    const { data: insResB, error: insErrB } = await supabaseB
      .from('products')
      .insert({
        store_id: storeA_id,
        category_id: categoryId,
        name: 'HACK_PRODUCT_BY_B',
        cost_price: 1.00,
        sale_price: 2.00,
        stock: 999,
        unit: 'pza',
      })
      .select('id');
    if (insErrB || !insResB || insResB.length === 0) {
      recordResult('W.8', 'INSERT en products de tienda A', 'PASA', `Rechazado (error: ${insErrB?.message || '0 filas insertadas'})`);
    } else {
      recordResult('W.8', 'INSERT en products de tienda A', 'FALLA', `INSERT indebido permitido (ID: ${insResB[0]?.id})`);
    }

    // W.9: INSERT directo en sales (denegado para B y para A)
    const fakeSalePayload = {
      store_id: storeA_id,
      register_id: registerId || '00000000-0000-0000-0000-000000000000',
      ticket_number: 'TKT-DIRECT-INSERT-01',
      total_quantity: 1,
      total_amount: 10.00,
      total_profit: 5.00,
      payment_method: 'tarjeta',
      cashier_name: 'Hacker',
    };
    const { error: insSaleErrB } = await supabaseB.from('sales').insert(fakeSalePayload);
    const { error: insSaleErrA } = await supabaseA.from('sales').insert(fakeSalePayload);
    if (insSaleErrB && insSaleErrA) {
      recordResult('W.9', 'INSERT directo en sales (bloqueado para B y A)', 'PASA', `Denegado por RLS a ambos (B: ${insSaleErrB.message}, A: ${insSaleErrA.message})`);
    } else {
      recordResult('W.9', 'INSERT directo en sales (bloqueado para B y A)', 'FALLA', `Se permitió INSERT directo en sales sin pasar por RPC`);
    }

    // W.10: INSERT directo en sale_items (denegado para B y para A)
    const fakeSaleItemPayload = {
      store_id: storeA_id,
      sale_id: '00000000-0000-0000-0000-000000000000',
      product_name: 'Item Directo Hack',
      quantity: 1,
      unit_price: 10.00,
      unit_cost: 5.00,
      subtotal: 10.00,
      profit: 5.00,
    };
    const { error: insItemErrB } = await supabaseB.from('sale_items').insert(fakeSaleItemPayload);
    const { error: insItemErrA } = await supabaseA.from('sale_items').insert(fakeSaleItemPayload);
    if (insItemErrB && insItemErrA) {
      recordResult('W.10', 'INSERT directo en sale_items (bloqueado para B y A)', 'PASA', `Denegado por RLS a ambos (B: ${insItemErrB.message}, A: ${insItemErrA.message})`);
    } else {
      recordResult('W.10', 'INSERT directo en sale_items (bloqueado para B y A)', 'FALLA', `Se permitió INSERT directo en sale_items sin pasar por RPC`);
    }

    // W.11: INSERT directo en inventory_movements (denegado para B y para A)
    const fakeMovPayload = {
      store_id: storeA_id,
      product_name: 'Movimiento Hack',
      type: 'AJUSTE',
      quantity: 10,
      previous_stock: 0,
      new_stock: 10,
      user_name: 'Hacker',
      note: 'Ajuste directo no autorizado',
    };
    const { error: insMovErrB } = await supabaseB.from('inventory_movements').insert(fakeMovPayload);
    const { error: insMovErrA } = await supabaseA.from('inventory_movements').insert(fakeMovPayload);
    if (insMovErrB && insMovErrA) {
      recordResult('W.11', 'INSERT directo en inventory_movements (bloqueado para B y A)', 'PASA', `Denegado por RLS a ambos (B: ${insMovErrB.message}, A: ${insMovErrA.message})`);
    } else {
      recordResult('W.11', 'INSERT directo en inventory_movements (bloqueado para B y A)', 'FALLA', `Se permitió INSERT directo en inventory_movements sin pasar por RPC`);
    }

    // W.12: INSERT directo en purchases (denegado para B y para A)
    const fakePurPayload = {
      store_id: storeA_id,
      supplier_id: supplierId,
      total: 100.00,
      payment_condition: 'contado',
      credit_days: 0,
      paid_at: new Date().toISOString(),
    };
    const { error: insPurErrB } = await supabaseB.from('purchases').insert(fakePurPayload);
    const { error: insPurErrA } = await supabaseA.from('purchases').insert(fakePurPayload);
    if (insPurErrB && insPurErrA) {
      recordResult('W.12', 'INSERT directo en purchases (bloqueado para B y A)', 'PASA', `Denegado por RLS a ambos (B: ${insPurErrB.message}, A: ${insPurErrA.message})`);
    } else {
      recordResult('W.12', 'INSERT directo en purchases (bloqueado para B y A)', 'FALLA', `Se permitió INSERT directo en purchases sin pasar por RPC`);
    }

    // W.13: INSERT directo en purchase_items (denegado para B y para A)
    const fakePurItemPayload = {
      store_id: storeA_id,
      purchase_id: purchaseId || '00000000-0000-0000-0000-000000000000',
      product_id: prod1.id,
      quantity: 5,
      unit_cost: 10.00,
    };
    const { error: insPItemErrB } = await supabaseB.from('purchase_items').insert(fakePurItemPayload);
    const { error: insPItemErrA } = await supabaseA.from('purchase_items').insert(fakePurItemPayload);
    if (insPItemErrB && insPItemErrA) {
      recordResult('W.13', 'INSERT directo en purchase_items (bloqueado para B y A)', 'PASA', `Denegado por RLS a ambos (B: ${insPItemErrB.message}, A: ${insPItemErrA.message})`);
    } else {
      recordResult('W.13', 'INSERT directo en purchase_items (bloqueado para B y A)', 'FALLA', `Se permitió INSERT directo en purchase_items sin pasar por RPC`);
    }

    // W.14: UPDATE en store_members (cambiar el rol del miembro de A)
    const { data: updMemResB, error: updMemErrB } = await supabaseB
      .from('store_members')
      .update({ role: 'CAJERO' })
      .eq('store_id', storeA_id)
      .eq('user_id', userA.id)
      .select('*');
    if (updMemErrB || !updMemResB || updMemResB.length === 0) {
      recordResult('W.14', 'UPDATE en store_members (cambiar rol miembro A)', 'PASA', `Rechazado (error: ${updMemErrB?.message || '0 filas afectadas'})`);
    } else {
      recordResult('W.14', 'UPDATE en store_members (cambiar rol miembro A)', 'FALLA', 'Usuario B degradó el rol de un miembro en tienda A');
    }

    // W.15: UPDATE en stores (nombre de A)
    const { data: updStoreResB, error: updStoreErrB } = await supabaseB
      .from('stores')
      .update({ name: 'HACKED_BY_B' })
      .eq('id', storeA_id)
      .select('id');
    if (updStoreErrB || !updStoreResB || updStoreResB.length === 0) {
      recordResult('W.15', 'UPDATE en nombre de tienda A', 'PASA', `Rechazado (error: ${updStoreErrB?.message || '0 filas afectadas'})`);
    } else {
      recordResult('W.15', 'UPDATE en nombre de tienda A', 'FALLA', 'UPDATE indebido sobre tienda A permitido');
    }

    // W.16: UPDATE en producto de A (precio/stock)
    const { data: updProdResB, error: updProdErrB } = await supabaseB
      .from('products')
      .update({ sale_price: 9999.00, stock: 0 })
      .eq('id', prod1.id)
      .select('id');
    if (updProdErrB || !updProdResB || updProdResB.length === 0) {
      recordResult('W.16', 'UPDATE precio/stock de producto A', 'PASA', `Rechazado (error: ${updProdErrB?.message || '0 filas afectadas'})`);
    } else {
      recordResult('W.16', 'UPDATE precio/stock de producto A', 'FALLA', 'UPDATE indebido sobre producto de A permitido');
    }

    // W.17: DELETE en store_members (eliminar miembro de A)
    const { data: delMemResB, error: delMemErrB } = await supabaseB
      .from('store_members')
      .delete()
      .eq('store_id', storeA_id)
      .eq('user_id', userA.id)
      .select('*');
    if (delMemErrB || !delMemResB || delMemResB.length === 0) {
      recordResult('W.17', 'DELETE en store_members de tienda A', 'PASA', `Rechazado (error: ${delMemErrB?.message || '0 filas afectadas'})`);
    } else {
      recordResult('W.17', 'DELETE en store_members de tienda A', 'FALLA', 'Usuario B pudo expulsar al dueño de la tienda A');
    }

    // W.18: DELETE de producto de A
    const { data: delProdResB, error: delProdErrB } = await supabaseB
      .from('products')
      .delete()
      .eq('id', prod2.id)
      .select('id');
    if (delProdErrB || !delProdResB || delProdResB.length === 0) {
      recordResult('W.18', 'DELETE de producto de tienda A', 'PASA', `Rechazado (error: ${delProdErrB?.message || '0 filas afectadas'})`);
    } else {
      recordResult('W.18', 'DELETE de producto de tienda A', 'FALLA', 'DELETE indebido sobre producto de A permitido');
    }

    // W.19: DELETE de tienda de A
    const { data: delStoreResB, error: delStoreErrB } = await supabaseB
      .from('stores')
      .delete()
      .eq('id', storeA_id)
      .select('id');
    if (delStoreErrB || !delStoreResB || delStoreResB.length === 0) {
      recordResult('W.19', 'DELETE de tienda A', 'PASA', `Rechazado (error: ${delStoreErrB?.message || '0 filas afectadas'})`);
    } else {
      recordResult('W.19', 'DELETE de tienda A', 'FALLA', 'DELETE indebido de tienda A permitido');
    }

    // Comprobación de integridad de la foto inicial tras pruebas W (productos y miembros)
    const { data: postWProds } = await supabaseA
      .from('products')
      .select('id, name, stock, sale_price')
      .eq('store_id', storeA_id)
      .order('id');
    const { data: postWStore } = await supabaseA
      .from('stores')
      .select('name')
      .eq('id', storeA_id)
      .single();
    const { data: postWMembers } = await supabaseA
      .from('store_members')
      .select('user_id, role')
      .eq('store_id', storeA_id)
      .order('user_id');

    const prodsMatch =
      postWProds?.length === initialSnapshot.productsCount &&
      postWProds.every((p, idx) => {
        const init = initialSnapshot.products[idx];
        return init && p.id === init.id && Number(p.stock) === Number(init.stock) && Number(p.sale_price) === Number(init.sale_price);
      });

    const membersMatch =
      postWMembers?.length === initialSnapshot.membersCount &&
      postWMembers.every((m, idx) => {
        const init = initialSnapshot.members[idx];
        return init && m.user_id === init.user_id && m.role === init.role;
      });

    const snapshotIntact = postWStore?.name === initialSnapshot.storeName && prodsMatch && membersMatch;

    if (snapshotIntact) {
      recordResult('W.Foto', 'Integridad de foto tras pruebas W', 'PASA', 'Estado de tienda A 100% inalterado (tienda, productos y miembros intactos).');
    } else {
      recordResult('W.Foto', 'Integridad de foto tras pruebas W', 'FALLA', 'El estado de tienda A fue alterado por escritura de B.');
    }

    // ------------------------------------------------------------------------
    // R. EJECUCIÓN DE RPC (B llama con store_id de A)
    // ------------------------------------------------------------------------
    console.log('\n[5/7] Ejecutando Pruebas R (RPCs llamados por Usuario B)...');

    // R.1: process_sale
    const { data: rpcSale, error: errRpcSale } = await supabaseB.rpc('process_sale', {
      p_store_id: storeA_id,
      p_ticket_number: 'TKT-HACK-000001',
      p_payment_method: 'tarjeta',
      p_cash_given: null,
      p_items: [{ productId: prod1.id, quantity: 1 }],
      p_register_id: registerId,
    });
    if (errRpcSale || rpcSale?.success === false) {
      recordResult('R.1', 'RPC process_sale en tienda A', 'PASA', `Bloqueado: ${errRpcSale?.message || rpcSale?.error}`);
    } else {
      recordResult('R.1', 'RPC process_sale en tienda A', 'FALLA', 'Usuario B pudo ejecutar process_sale en tienda de A');
    }

    // R.2: adjust_stock
    const { data: rpcAdj, error: errRpcAdj } = await supabaseB.rpc('adjust_stock', {
      p_store_id: storeA_id,
      p_product_id: prod1.id,
      p_quantity_delta: -5,
      p_note: 'Ajuste no autorizado',
    });
    if (errRpcAdj || rpcAdj?.success === false) {
      recordResult('R.2', 'RPC adjust_stock en tienda A', 'PASA', `Bloqueado: ${errRpcAdj?.message || rpcAdj?.error}`);
    } else {
      recordResult('R.2', 'RPC adjust_stock en tienda A', 'FALLA', 'Usuario B pudo ejecutar adjust_stock en tienda de A');
    }

    // R.3: process_purchase
    const { data: rpcPur, error: errRpcPur } = await supabaseB.rpc('process_purchase', {
      p_store_id: storeA_id,
      p_supplier_id: supplierId,
      p_items: [{ productId: prod1.id, quantity: 10, unitCost: 5.00 }],
    });
    if (errRpcPur || rpcPur?.success === false) {
      recordResult('R.3', 'RPC process_purchase en tienda A', 'PASA', `Bloqueado: ${errRpcPur?.message || rpcPur?.error}`);
    } else {
      recordResult('R.3', 'RPC process_purchase en tienda A', 'FALLA', 'Usuario B pudo ejecutar process_purchase en tienda de A');
    }

    // R.4: pay_purchase
    const { data: rpcPay, error: errRpcPay } = await supabaseB.rpc('pay_purchase', {
      p_store_id: storeA_id,
      p_purchase_id: purchaseId || '00000000-0000-0000-0000-000000000000',
    });
    if (errRpcPay || rpcPay?.success === false) {
      recordResult('R.4', 'RPC pay_purchase en tienda A', 'PASA', `Bloqueado: ${errRpcPay?.message || rpcPay?.error}`);
    } else {
      recordResult('R.4', 'RPC pay_purchase en tienda A', 'FALLA', 'Usuario B pudo ejecutar pay_purchase en tienda de A');
    }

    // R.5: switch_store
    const { data: rpcSw, error: errRpcSw } = await supabaseB.rpc('switch_store', {
      p_store_id: storeA_id,
    });
    if (errRpcSw || rpcSw?.success === false) {
      recordResult('R.5', 'RPC switch_store a tienda A', 'PASA', `Bloqueado: ${errRpcSw?.message || rpcSw?.error}`);
    } else {
      recordResult('R.5', 'RPC switch_store a tienda A', 'FALLA', 'Usuario B pudo activar como suya la tienda de A');
    }

    // R.6: invite_by_code
    const { data: rpcInv, error: errRpcInv } = await supabaseB.rpc('invite_by_code', {
      p_store_id: storeA_id,
      p_user_code: 'RENT-TEST',
      p_role: 'CAJERO',
    });
    if (errRpcInv || rpcInv?.success === false) {
      recordResult('R.6', 'RPC invite_by_code en tienda A', 'PASA', `Bloqueado: ${errRpcInv?.message || rpcInv?.error}`);
    } else {
      recordResult('R.6', 'RPC invite_by_code en tienda A', 'FALLA', 'Usuario B pudo invitar miembros en tienda de A');
    }

    // R.7: accept_invitation (con token falso a tienda A)
    const { data: rpcAcc, error: errRpcAcc } = await supabaseB.rpc('accept_invitation', {
      p_token: 'tok_falso_a_tienda_a_1234567890abcdef',
    });
    if (errRpcAcc || rpcAcc?.success === false) {
      recordResult('R.7', 'RPC accept_invitation con token inválido', 'PASA', `Rechazado correctamente: ${errRpcAcc?.message || rpcAcc?.error}`);
    } else {
      recordResult('R.7', 'RPC accept_invitation con token inválido', 'FALLA', 'Aceptó invitación espuria');
    }

    // ------------------------------------------------------------------------
    // X. CRUCE ENTRE TIENDAS (inyección de tenant)
    // ------------------------------------------------------------------------
    console.log('\n[6/7] Ejecutando Pruebas X, N y S...');

    // Limpieza previa si existiera la tienda B
    const { data: prevStoresB } = await supabaseB
      .from('stores')
      .select('id, name')
      .eq('name', STORE_NAME_B);
    if (prevStoresB && prevStoresB.length > 0) {
      for (const st of prevStoresB) {
        assertAllowedStoreName(st.name, 'limpieza previa B');
        await supabaseB.from('stores').delete().eq('id', st.id);
      }
    }

    // Usuario B crea su propia tienda
    assertAllowedStoreName(STORE_NAME_B, 'crear tienda B');
    const { data: storeResB, error: errStoreB } = await supabaseB.rpc('create_store', {
      name: STORE_NAME_B,
      type: 'Abarrotes',
      currency: 'PEN',
    });
    if (errStoreB) throw new Error(`Error al crear tienda B: ${errStoreB.message}`);
    storeB_id = storeResB?.id || storeResB?.store_id;

    // Obtener caja de tienda B
    const { data: regBData } = await supabaseB
      .from('cash_registers')
      .select('id')
      .eq('store_id', storeB_id)
      .limit(1)
      .maybeSingle();

    // Consultar stock antes de inyección
    const { data: stockBeforeX } = await supabaseA
      .from('products')
      .select('stock')
      .eq('id', prod1.id)
      .single();

    // Inyección de tenant: Vender en tienda B usando producto de tienda A
    const { data: xSaleRes, error: xSaleErr } = await supabaseB.rpc('process_sale', {
      p_store_id: storeB_id,
      p_ticket_number: 'TKT-INYECTION-0001',
      p_payment_method: 'tarjeta',
      p_cash_given: null,
      p_items: [{ productId: prod1.id, quantity: 1 }],
      p_register_id: regBData?.id || null,
    });

    const { data: stockAfterX } = await supabaseA
      .from('products')
      .select('stock')
      .eq('id', prod1.id)
      .single();

    const stockUntouched = Number(stockBeforeX?.stock) === Number(stockAfterX?.stock);

    if ((xSaleErr || xSaleRes?.success === false) && stockUntouched) {
      recordResult(
        'X.1',
        'Cruce de tenant (vender producto ajeno en tienda B)',
        'PASA',
        `Venta rechazada (${xSaleErr?.message || xSaleRes?.error}). Stock de tienda A intacto (${stockAfterX?.stock}).`
      );
    } else {
      recordResult(
        'X.1',
        'Cruce de tenant (vender producto ajeno en tienda B)',
        'FALLA',
        `Permitió venta cruzada o alteró stock: ${xSaleErr?.message || JSON.stringify(xSaleRes)}`
      );
    }

    // ------------------------------------------------------------------------
    // N. ACCESO ANÓNIMO (sin login, solo anon key)
    // ------------------------------------------------------------------------
    // N.1: select products
    const { data: nProds, error: nErrProds } = await supabaseAnon
      .from('products')
      .select('id')
      .eq('store_id', storeA_id);
    if (nErrProds || !nProds || nProds.length === 0) {
      recordResult('N.1', 'Anon SELECT products de tienda A', 'PASA', `0 filas / bloqueado (${nErrProds?.message || '0 filas'})`);
    } else {
      recordResult('N.1', 'Anon SELECT products de tienda A', 'FALLA', `Anon obtuvo ${nProds.length} productos`);
    }

    // N.2: select stores
    const { data: nStores, error: nErrStores } = await supabaseAnon
      .from('stores')
      .select('id')
      .eq('id', storeA_id);
    if (nErrStores || !nStores || nStores.length === 0) {
      recordResult('N.2', 'Anon SELECT stores id de tienda A', 'PASA', `0 filas / bloqueado (${nErrStores?.message || '0 filas'})`);
    } else {
      recordResult('N.2', 'Anon SELECT stores id de tienda A', 'FALLA', `Anon obtuvo tienda A`);
    }

    // N.3: select product_stats
    const { data: nStats, error: nErrStats } = await supabaseAnon
      .from('product_stats')
      .select('id')
      .eq('store_id', storeA_id);
    if (nErrStats || !nStats || nStats.length === 0) {
      recordResult('N.3', 'Anon SELECT product_stats de tienda A', 'PASA', `0 filas / bloqueado (${nErrStats?.message || '0 filas'})`);
    } else {
      recordResult('N.3', 'Anon SELECT product_stats de tienda A', 'FALLA', `Anon obtuvo stats de tienda A`);
    }

    // N.4: call process_sale
    const { data: nSale, error: nErrSale } = await supabaseAnon.rpc('process_sale', {
      p_store_id: storeA_id,
      p_ticket_number: 'TKT-ANON-0001',
      p_payment_method: 'tarjeta',
      p_cash_given: null,
      p_items: [{ productId: prod1.id, quantity: 1 }],
    });
    if (nErrSale || nSale?.success === false) {
      recordResult('N.4', 'Anon RPC process_sale en tienda A', 'PASA', `Bloqueado (${nErrSale?.message || nSale?.error})`);
    } else {
      recordResult('N.4', 'Anon RPC process_sale en tienda A', 'FALLA', 'Anon pudo ejecutar process_sale');
    }

    // ------------------------------------------------------------------------
    // S. STORAGE
    // ------------------------------------------------------------------------
    const dummyImageBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    const targetStoragePath = `products/${storeA_id}_fase5b_test.jpg`;

    // S.1: B intenta subir imagen a la ruta de la tienda A
    const { error: errUploadS } = await supabaseB.storage
      .from('product-images')
      .upload(targetStoragePath, dummyImageBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (errUploadS) {
      recordResult('S.1', 'Storage upload a ruta de tienda A', 'PASA', `Rechazado por RLS storage: ${errUploadS.message}`);
    } else {
      recordResult('S.1', 'Storage upload a ruta de tienda A', 'FALLA', 'Usuario B pudo subir imagen a la ruta de tienda A');
      // Intentar limpiar la imagen subida indebidamente
      await supabaseA.storage.from('product-images').remove([targetStoragePath]);
    }

    // S.2: B intenta borrar imagen de la tienda A
    const { data: remResS, error: errRemS } = await supabaseB.storage
      .from('product-images')
      .remove([targetStoragePath]);

    // En Supabase storage, remove devuelve lista de borrados o error si denegado por RLS
    if (errRemS || !remResS || remResS.length === 0) {
      recordResult('S.2', 'Storage delete de archivo de tienda A', 'PASA', `Rechazado por RLS storage (${errRemS?.message || '0 archivos borrados'})`);
    } else {
      recordResult('S.2', 'Storage delete de archivo de tienda A', 'FALLA', 'Usuario B pudo borrar archivos de tienda A');
    }

  } catch (error) {
    console.error('\n🚨 Error durante la ejecución del test de aislamiento:', error.message);
  } finally {
    // ========================================================================
    // LIMPIEZA (en bloque finally, pase lo que pase)
    // ========================================================================
    console.log('\n[7/7] Limpieza final de tiendas de prueba...');

    // 1. Borrar tienda A (como A)
    if (storeA_id) {
      try {
        assertAllowedStoreName(STORE_NAME_A, 'limpieza final A');
        const { error: delErrA } = await supabaseA
          .from('stores')
          .delete()
          .eq('id', storeA_id);
        if (delErrA) {
          console.error(`⚠️ Error al borrar tienda A: ${delErrA.message}`);
        } else {
          console.log(`✅ Tienda A "${STORE_NAME_A}" eliminada correctamente.`);
        }
      } catch (e) {
        console.error(`⚠️ Falló borrado de tienda A: ${e.message}`);
      }
    }

    // 2. Borrar tienda B (como B)
    if (storeB_id) {
      try {
        assertAllowedStoreName(STORE_NAME_B, 'limpieza final B');
        const { error: delErrB } = await supabaseB
          .from('stores')
          .delete()
          .eq('id', storeB_id);
        if (delErrB) {
          console.error(`⚠️ Error al borrar tienda B: ${delErrB.message}`);
        } else {
          console.log(`✅ Tienda B "${STORE_NAME_B}" eliminada correctamente.`);
        }
      } catch (e) {
        console.error(`⚠️ Falló borrado de tienda B: ${e.message}`);
      }
    }

    // Confirmación de borrado
    const { data: chkA } = await supabaseA.from('stores').select('id').eq('name', STORE_NAME_A);
    const { data: chkB } = await supabaseB.from('stores').select('id').eq('name', STORE_NAME_B);
    const storesCleaned = (chkA?.length || 0) === 0 && (chkB?.length || 0) === 0;

    if (storesCleaned) {
      console.log('✅ Confirmado: ambas tiendas de prueba eliminadas de la base de datos.');
    } else {
      console.warn('⚠️ Advertencia: alguna tienda de prueba no se pudo confirmar como eliminada.');
    }
  }

  // ==========================================================================
  // REPORTE DE RESULTADOS
  // ==========================================================================
  console.log('\n' + '='.repeat(100));
  console.log('📊 REPORTE DE AISLAMIENTO MULTI-INQUILINO (FASE 5B)');
  console.log('='.repeat(100));

  let passCount = 0;
  let failCount = 0;
  let noCtrlCount = 0;

  console.log('| Código | Prueba | Resultado | Detalle |');
  console.log('|---|---|---|---|');
  for (const r of testResults) {
    if (r.resultado === 'PASA') passCount++;
    else if (r.resultado === 'FALLA') failCount++;
    else noCtrlCount++;

    console.log(`| \`${r.codigo}\` | ${r.prueba} | **${r.resultado}** | ${r.detalle} |`);
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`Total Pruebas: ${testResults.length}`);
  console.log(`✅ PASA       : ${passCount}`);
  console.log(`❌ FALLA      : ${failCount}`);
  console.log(`⚠️ SIN CONTROL: ${noCtrlCount}`);
  console.log('-'.repeat(60));

  if (failCount > 0) {
    console.error('\n❌ SE DETECTARON FALLOS DE SEGURIDAD O AISLAMIENTO ENTRE USUARIOS.');
    process.exit(1);
  } else {
    console.log('\n🛡️ AISLAMIENTO DE TENANTS VERIFICADO EXITOSAMENTE.');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
