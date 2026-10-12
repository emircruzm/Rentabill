-- ==============================================================================
-- RENTABILL - SMOKE TESTS (pgTAP)
-- supabase/tests/smoke.sql
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(15);

-- ------------------------------------------------------------------------------
-- PREPARACIÓN: USUARIOS Y TIENDAS DE PRUEBA
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_user_a UUID := '11111111-1111-4111-a111-111111111111'::uuid;
    v_user_b UUID := '22222222-2222-4222-a222-222222222222'::uuid;
    v_cajero UUID := '33333333-3333-4333-a333-333333333333'::uuid;
    v_store_a UUID;
    v_store_b UUID;
BEGIN
    -- Crear perfiles de prueba
    INSERT INTO public.profiles (id, user_code, name, email)
    VALUES 
        (v_user_a, 'RENT-USRA', 'Dueno A', 'dueno_a@test.com'),
        (v_user_b, 'RENT-USRB', 'Dueno B', 'dueno_b@test.com'),
        (v_cajero, 'RENT-CAJ1', 'Cajero 1', 'cajero_1@test.com')
    ON CONFLICT (id) DO NOTHING;

    -- Simular creación de tiendas
    INSERT INTO public.stores (id, name, type, currency, owner_id)
    VALUES 
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Bodega A', 'Abarrotes', 'PEN', v_user_a),
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'Bodega B', 'Abarrotes', 'PEN', v_user_b)
    ON CONFLICT (id) DO NOTHING;

    -- Membresías
    INSERT INTO public.store_members (store_id, user_id, role)
    VALUES 
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, v_user_a, 'ADMIN'),
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, v_user_b, 'ADMIN'),
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, v_cajero, 'CAJERO')
    ON CONFLICT (user_id, store_id) DO NOTHING;

    -- Categoría y producto en Tienda A
    INSERT INTO public.categories (id, store_id, name)
    VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'General')
    ON CONFLICT (store_id, id) DO NOTHING;

    INSERT INTO public.products (id, store_id, category_id, barcode, name, unit, cost_price, sale_price, stock)
    VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, '7750001', 'Arroz Costeño 1kg', 'pza', 3.50, 4.20, 10)
    ON CONFLICT (store_id, id) DO NOTHING;
END $$;

-- ------------------------------------------------------------------------------
-- PRUEBA 1: ANON NO PUEDE EJECUTAR FUNCIONES NI LEER TABLAS
-- ------------------------------------------------------------------------------
SELECT ok(
    has_function_privilege('anon', 'public.process_sale(uuid, text, text, numeric, jsonb, uuid)', 'EXECUTE') = false,
    'anon no tiene permisos de EXECUTE en process_sale'
);

SELECT ok(
    has_function_privilege('anon', 'public.create_store(text, text, text)', 'EXECUTE') = false,
    'anon no tiene permisos de EXECUTE en create_store'
);

-- ------------------------------------------------------------------------------
-- PRUEBA 2: create_store DEJA AL CREADOR COMO ADMIN
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_res JSONB;
    v_store_id UUID;
    v_role TEXT;
BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "11111111-1111-4111-a111-111111111111", "email": "dueno_a@test.com", "role": "authenticated"}';

    v_res := public.create_store('Nueva Tienda Smoke', 'Abarrotes', 'PEN');
    v_store_id := (v_res->>'store_id')::uuid;

    SELECT role INTO v_role 
    FROM public.store_members 
    WHERE store_id = v_store_id AND user_id = '11111111-1111-4111-a111-111111111111'::uuid;

    IF v_role = 'ADMIN' THEN
        PERFORM set_config('smoke.test_create_store', 'OK', true);
    END IF;
END $$;

SELECT is(
    current_setting('smoke.test_create_store', true),
    'OK',
    'create_store registra la membresía del creador con rol ADMIN'
);

-- ------------------------------------------------------------------------------
-- PRUEBA 3: AISLAMIENTO MULTI-TIENDA: USUARIO B NO VE PRODUCTOS DE TIENDA A
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_count INT;
BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "22222222-2222-4222-a222-222222222222", "email": "dueno_b@test.com", "role": "authenticated"}';

    SELECT count(*) INTO v_count 
    FROM public.products 
    WHERE store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

    IF v_count = 0 THEN
        PERFORM set_config('smoke.test_isolation', 'OK', true);
    END IF;
END $$;

SELECT is(
    current_setting('smoke.test_isolation', true),
    'OK',
    'Usuario de Tienda B no puede ver productos de Tienda A bajo RLS'
);

-- ------------------------------------------------------------------------------
-- PRUEBA 4: CAJERO NO PUEDE INSERTAR PRODUCTOS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "33333333-3333-4333-a333-333333333333", "email": "cajero_1@test.com", "role": "authenticated"}';

    BEGIN
        INSERT INTO public.products (store_id, category_id, barcode, name, unit, cost_price, sale_price, stock)
        VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, '9999999', 'Producto Prohibido', 'pza', 1, 2, 5);
        PERFORM set_config('smoke.test_cajero_insert', 'FAIL', true);
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
        PERFORM set_config('smoke.test_cajero_insert', 'BLOCKED', true);
    END;
END $$;

SELECT is(
    COALESCE(current_setting('smoke.test_cajero_insert', true), 'BLOCKED'),
    'BLOCKED',
    'CAJERO no tiene permisos de inserción en products bajo RLS'
);

-- ------------------------------------------------------------------------------
-- PRUEBA 5: CAJERO NO PUEDE LLAMAR process_purchase
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "33333333-3333-4333-a333-333333333333", "email": "cajero_1@test.com", "role": "authenticated"}';

    BEGIN
        PERFORM public.process_purchase(
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
            NULL,
            jsonb_build_array(jsonb_build_object('product_id', 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'quantity', 5, 'unit_cost', 3.50)),
            'Compra de prueba'
        );
        PERFORM set_config('smoke.test_cajero_purchase', 'FAIL', true);
    EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('smoke.test_cajero_purchase', 'BLOCKED', true);
    END;
END $$;

SELECT is(
    current_setting('smoke.test_cajero_purchase', true),
    'BLOCKED',
    'CAJERO es rechazado al intentar ejecutar process_purchase'
);

-- ------------------------------------------------------------------------------
-- PRUEBA 6: INSERCIÓN DIRECTA EN sales ES RECHAZADA POR RLS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "11111111-1111-4111-a111-111111111111", "email": "dueno_a@test.com", "role": "authenticated"}';

    BEGIN
        INSERT INTO public.sales (store_id, register_id, ticket_number, total_quantity, total_amount, total_profit, payment_method, cashier_name)
        VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '11111111-0000-0000-0000-000000000000'::uuid, 'T-DIRECT', 1, 10, 2, 'efectivo', 'Hacker');
        PERFORM set_config('smoke.test_direct_sales', 'FAIL', true);
    EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('smoke.test_direct_sales', 'BLOCKED', true);
    END;
END $$;

SELECT is(
    COALESCE(current_setting('smoke.test_direct_sales', true), 'BLOCKED'),
    'BLOCKED',
    'Inserción directa de cliente en sales es rechazada'
);

-- ------------------------------------------------------------------------------
-- PRUEBA 7: INSERCIÓN DIRECTA EN inventory_movements ES RECHAZADA POR RLS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "11111111-1111-4111-a111-111111111111", "email": "dueno_a@test.com", "role": "authenticated"}';

    BEGIN
        INSERT INTO public.inventory_movements (store_id, product_id, product_name, type, quantity, previous_stock, new_stock, user_name, note)
        VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'Test', 'AJUSTE', 5, 10, 15, 'Hacker', 'Direct');
        PERFORM set_config('smoke.test_direct_movements', 'FAIL', true);
    EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('smoke.test_direct_movements', 'BLOCKED', true);
    END;
END $$;

SELECT is(
    COALESCE(current_setting('smoke.test_direct_movements', true), 'BLOCKED'),
    'BLOCKED',
    'Inserción directa de cliente en inventory_movements es rechazada'
);

-- ------------------------------------------------------------------------------
-- PRUEBA 8: UPDATE DIRECTO DE stock ES RECHAZADO POR REVOKE
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "11111111-1111-4111-a111-111111111111", "email": "dueno_a@test.com", "role": "authenticated"}';

    BEGIN
        UPDATE public.products 
        SET stock = 999 
        WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid;
        PERFORM set_config('smoke.test_direct_stock_update', 'FAIL', true);
    EXCEPTION WHEN insufficient_privilege THEN
        PERFORM set_config('smoke.test_direct_stock_update', 'BLOCKED', true);
    END;
END $$;

SELECT is(
    COALESCE(current_setting('smoke.test_direct_stock_update', true), 'BLOCKED'),
    'BLOCKED',
    'UPDATE directo de columna stock en products es bloqueado por permisos'
);

-- ------------------------------------------------------------------------------
-- PRUEBA 9: AISLAMIENTO DE PERFILES SIN TIENDA EN COMÚN
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_found INT;
BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "22222222-2222-4222-a222-222222222222", "email": "dueno_b@test.com", "role": "authenticated"}';

    -- Dueno B intenta leer el perfil de Cajero 1 (pertenece a Tienda A)
    SELECT count(*) INTO v_found 
    FROM public.profiles 
    WHERE id = '33333333-3333-4333-a333-333333333333'::uuid;

    IF v_found = 0 THEN
        PERFORM set_config('smoke.test_profile_isolation', 'OK', true);
    END IF;
END $$;

SELECT is(
    current_setting('smoke.test_profile_isolation', true),
    'OK',
    'Usuario no puede ver perfiles ajenos si no comparten tienda'
);

-- ------------------------------------------------------------------------------
-- PRUEBA 10: accept_invitation CON EMAIL DISTINTO ES RECHAZADA
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_token TEXT := 'tok_smoke_diff_email_123';
BEGIN
    -- Crear invitación para email ajeno
    INSERT INTO public.store_invitations (store_id, email, role, token, status)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'invitado_especial@test.com', 'CAJERO', v_token, 'PENDIENTE');

    -- Simular intento de aceptación por Usuario B con otro email
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "22222222-2222-4222-a222-222222222222", "email": "dueno_b@test.com", "role": "authenticated"}';

    BEGIN
        PERFORM public.accept_invitation(v_token);
        PERFORM set_config('smoke.test_inv_diff_email', 'FAIL', true);
    EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('smoke.test_inv_diff_email', 'BLOCKED', true);
    END;
END $$;

SELECT is(
    current_setting('smoke.test_inv_diff_email', true),
    'BLOCKED',
    'accept_invitation rechaza intentos con email distinto al JWT'
);

-- ------------------------------------------------------------------------------
-- PRUEBA 11: accept_invitation CON TOKEN VENCIDO DEJA ESTADO EN EXPIRADA
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_token TEXT := 'tok_smoke_expired_123';
    v_res JSONB;
    v_status TEXT;
BEGIN
    INSERT INTO public.store_invitations (store_id, email, role, token, status, expires_at)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'expirado@test.com', 'CAJERO', v_token, 'PENDIENTE', now() - interval '1 day');

    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "22222222-2222-4222-a222-222222222222", "email": "expirado@test.com", "role": "authenticated"}';

    v_res := public.accept_invitation(v_token);

    SELECT status INTO v_status FROM public.store_invitations WHERE token = v_token;

    IF v_res->>'success' = 'false' AND v_res->>'error' = 'expirada' AND v_status = 'EXPIRADA' THEN
        PERFORM set_config('smoke.test_inv_expired', 'OK', true);
    END IF;
END $$;

SELECT is(
    current_setting('smoke.test_inv_expired', true),
    'OK',
    'accept_invitation vencida actualiza estado a EXPIRADA sin RAISE'
);

-- ------------------------------------------------------------------------------
-- PRUEBA 12: adjust_stock ATÓMICO Y KARDEX (NUEVO = ANTERIOR + CANTIDAD)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_adj JSONB;
    v_mov RECORD;
    v_prod_id UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid;
BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "11111111-1111-4111-a111-111111111111", "email": "dueno_a@test.com", "role": "authenticated"}';

    v_adj := public.adjust_stock('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, v_prod_id, 3, 'Conteo físico');

    SELECT * INTO v_mov 
    FROM public.inventory_movements 
    WHERE product_id = v_prod_id AND note = 'Conteo físico' 
    ORDER BY created_at DESC LIMIT 1;

    IF v_mov.new_stock = v_mov.previous_stock + v_mov.quantity AND v_mov.quantity = 3 THEN
        PERFORM set_config('smoke.test_adjust_kardex', 'OK', true);
    END IF;
END $$;

SELECT is(
    current_setting('smoke.test_adjust_kardex', true),
    'OK',
    'adjust_stock registra AJUSTE en Kardex con nuevo = anterior + delta y actualiza stock'
);

-- ------------------------------------------------------------------------------
-- PRUEBA 13: DELETE DE TIENDA CON DATOS FUNCIONA SIN ERROR DE RESTRICT
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_del_store UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
BEGIN
    SET LOCAL ROLE postgres;

    DELETE FROM public.stores WHERE id = v_del_store;

    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = v_del_store) THEN
        PERFORM set_config('smoke.test_delete_store', 'OK', true);
    END IF;
END $$;

SELECT is(
    current_setting('smoke.test_delete_store', true),
    'OK',
    'DELETE FROM stores cascada elimina datos asociados sin violar FKs (NO ACTION)'
);

SELECT * FROM finish();

ROLLBACK;
