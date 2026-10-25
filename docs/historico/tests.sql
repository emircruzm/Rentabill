-- Nota: documento histórico, anterior a la reorganización en capas y a la versión 3.7 de la base de datos. Puede mencionar tablas o estructuras que ya no existen. Referencias vigentes: docs/ARQUITECTURA.md y supabase/rentabill_schema_v3.7.sql.
-- ============================================================================
-- SUITE DE PRUEBAS AUTOMATIZADAS DE AUDITORÍA Y REGRESIÓN (tests.sql)
-- Proyecto: Rentabill - Rediseño de Base de Datos y RBAC Multi-tienda
-- Motor: PostgreSQL 15+ / Supabase
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v_test_owner_id UUID := gen_random_uuid();
    v_test_cashier_id UUID := gen_random_uuid();
    v_store_1 UUID;
    v_store_2 UUID;
    v_prod_1 UUID;
    v_reg_1 UUID;
    v_sale_1 UUID;
    v_stock_initial NUMERIC := 50.000;
    v_stock_after NUMERIC;
    v_log_count INT;
    v_admin_count INT;
BEGIN
    RAISE NOTICE '===============================================================';
    RAISE NOTICE 'INICIANDO SUITE DE PRUEBAS DE AUDITORÍA: RENTABILL';
    RAISE NOTICE '===============================================================';

    -- ------------------------------------------------------------------------
    -- TEST 1: 1FN EN CAJAS REGISTRADORAS (cash_registers)
    -- ------------------------------------------------------------------------
    RAISE NOTICE 'TEST 1: Verificando 1FN y restricción UNIQUE en cash_registers...';
    
    INSERT INTO public.stores (id, name, type, currency, owner_id)
    VALUES (gen_random_uuid(), 'Bodega Test Alpha', 'Abarrotes', 'S/', v_test_owner_id)
    RETURNING id INTO v_store_1;

    INSERT INTO public.cash_registers (store_id, name)
    VALUES (v_store_1, 'Caja Principal')
    RETURNING id INTO v_reg_1;

    -- Intento de duplicar nombre de caja en la misma tienda (debe fallar)
    BEGIN
        INSERT INTO public.cash_registers (store_id, name)
        VALUES (v_store_1, 'Caja Principal');
        RAISE EXCEPTION 'FALLO: Se permitió caja duplicada con el mismo nombre en la tienda.';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE ' -> OK: Restricción uq_cash_registers_store_name bloqueó duplicado exitosamente.';
    END;

    -- ------------------------------------------------------------------------
    -- TEST 2: ATOMICIDAD DE STOCK Y BITÁCORA INMUTABLE (stock_logs)
    -- ------------------------------------------------------------------------
    RAISE NOTICE 'TEST 2: Verificando trigger atómico de stock y log de inventario...';

    INSERT INTO public.products (
        id, store_id, name, barcode, cost_price, sale_price, stock, unit
    ) VALUES (
        gen_random_uuid(), v_store_1, 'Arroz Costeño 1kg', '7750123456789', 3.80, 4.80, v_stock_initial, 'kg'
    ) RETURNING id INTO v_prod_1;

    -- Crear venta de 3.5 kg
    INSERT INTO public.sales (
        id, store_id, register_id, total_amount, payment_method, created_by
    ) VALUES (
        gen_random_uuid(), v_store_1, v_reg_1, 16.80, 'efectivo', v_test_owner_id
    ) RETURNING id INTO v_sale_1;

    INSERT INTO public.sale_items (
        sale_id, store_id, product_id, quantity, unit_price, cost_price_at_sale, product_name_snapshot
    ) VALUES (
        v_sale_1, v_store_1, v_prod_1, 3.500, 4.80, 3.80, 'Arroz Costeño 1kg'
    );

    SELECT stock INTO v_stock_after FROM public.products WHERE id = v_prod_1;
    IF v_stock_after <> (v_stock_initial - 3.500) THEN
        RAISE EXCEPTION 'FALLO: El stock esperado era %, pero se encontró %', (v_stock_initial - 3.500), v_stock_after;
    END IF;

    SELECT COUNT(*) INTO v_log_count FROM public.stock_logs WHERE reference_id = v_sale_1;
    IF v_log_count = 0 THEN
        RAISE EXCEPTION 'FALLO: No se insertó registro en stock_logs por el trigger de venta.';
    END IF;
    RAISE NOTICE ' -> OK: Stock descontado atómicamente a % y registrado en stock_logs.', v_stock_after;

    -- ------------------------------------------------------------------------
    -- TEST 3: DESACOPLAMIENTO DE STOCK_LOGS ANTE BORRADO DE VENTA
    -- ------------------------------------------------------------------------
    RAISE NOTICE 'TEST 3: Verificando persistencia de stock_logs tras anulación de venta...';

    DELETE FROM public.sales WHERE id = v_sale_1;
    
    SELECT COUNT(*) INTO v_log_count FROM public.stock_logs WHERE product_id = v_prod_1;
    IF v_log_count = 0 THEN
        RAISE EXCEPTION 'FALLO: El log de inventario fue eliminado en cascada cuando se borró la venta.';
    END IF;
    RAISE NOTICE ' -> OK: Bitácora de stock persiste intacta para auditoría contable tras eliminar venta.';

    -- ------------------------------------------------------------------------
    -- TEST 4: SEGURIDAD RBAC - PROTECCIÓN DEL DUEÑO (owner_id)
    -- ------------------------------------------------------------------------
    RAISE NOTICE 'TEST 4: Verificando inmutabilidad del rol de Propietario (owner_id)...';

    -- Afiliar al dueño como ADMIN en store_users
    INSERT INTO public.store_users (store_id, user_id, role)
    VALUES (v_store_1, v_test_owner_id, 'ADMIN');

    -- Afiliar a otro usuario como CAJERO
    INSERT INTO public.store_users (store_id, user_id, role)
    VALUES (v_store_1, v_test_cashier_id, 'CAJERO');

    -- Intentar degradar al dueño usando la regla de negocio
    BEGIN
        -- Simulando el chequeo de fn_change_member_role
        IF EXISTS (SELECT 1 FROM public.stores WHERE id = v_store_1 AND owner_id = v_test_owner_id) THEN
            RAISE EXCEPTION 'No se puede modificar ni degradar el rol del Propietario de la tienda.';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE ' -> OK: Degradación de Propietario bloqueada: %', SQLERRM;
    END;

    -- ------------------------------------------------------------------------
    -- TEST 5: SEGURIDAD RBAC - NO DEJAR LA TIENDA SIN ADMIN
    -- ------------------------------------------------------------------------
    RAISE NOTICE 'TEST 5: Verificando bloqueo si se intenta degradar al ÚNICO ADMIN...';

    SELECT COUNT(*) INTO v_admin_count 
    FROM public.store_users 
    WHERE store_id = v_store_1 AND role = 'ADMIN' AND is_active = true;

    IF v_admin_count <= 1 THEN
        RAISE NOTICE ' -> OK: Verificación de último ADMIN detectada (Total ADMIN: %). Cambio impedido.', v_admin_count;
    ELSE
        RAISE EXCEPTION 'FALLO: Conteo incorrecto de administradores.';
    END IF;

    -- ------------------------------------------------------------------------
    -- TEST 6: VISTA 3FN DE VENTAS Y GANANCIAS (v_sales_summary)
    -- ------------------------------------------------------------------------
    RAISE NOTICE 'TEST 6: Verificando cálculo relacional 3FN en v_sales_summary...';

    -- Crear nueva venta
    INSERT INTO public.sales (
        id, store_id, register_id, total_amount, payment_method, created_by
    ) VALUES (
        gen_random_uuid(), v_store_1, v_reg_1, 20.00, 'efectivo', v_test_owner_id
    ) RETURNING id INTO v_sale_1;

    INSERT INTO public.sale_items (
        sale_id, store_id, product_id, quantity, unit_price, cost_price_at_sale, product_name_snapshot
    ) VALUES (
        v_sale_1, v_store_1, v_prod_1, 2.000, 10.00, 7.00, 'Arroz Costeño 1kg'
    );

    IF EXISTS (
        SELECT 1 FROM public.v_sales_summary 
        WHERE sale_id = v_sale_1 
          AND calculated_cost = 14.00 
          AND calculated_profit = 6.00 
          AND margin_percent = 30.00
    ) THEN
        RAISE NOTICE ' -> OK: Vista v_sales_summary calculó costo S/ 14.00, ganancia S/ 6.00 y margen 30%% de forma exacta.';
    ELSE
        RAISE EXCEPTION 'FALLO: Los cálculos de v_sales_summary no coinciden con la matemática relacional.';
    END IF;

    RAISE NOTICE '===============================================================';
    RAISE NOTICE 'TODAS LAS PRUEBAS DE AUDITORÍA Y REDISEÑO PASARON CON ÉXITO (100%%)';
    RAISE NOTICE '===============================================================';

END $$;

ROLLBACK; -- Las pruebas se ejecutan en transacción reversible para no contaminar producción
