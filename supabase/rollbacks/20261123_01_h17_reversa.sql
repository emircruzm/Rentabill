-- Reversa de Migración H-17
-- Orden estricto: (a) restaurar las 3 funciones a sus versiones de main,
-- (b) eliminar restricciones CHECK chk_*, (c) eliminar función is_finite_numeric.

BEGIN;

-- (a) Restaurar funciones originales de main
CREATE OR REPLACE FUNCTION public.adjust_stock(
    p_store_id UUID,
    p_product_id UUID,
    p_quantity_delta NUMERIC,
    p_note TEXT,
    p_user_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_member_role TEXT;
    v_product RECORD;
    v_new_stock NUMERIC(12,3);
    v_actor_name TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_member_role
    FROM public.store_members
    WHERE store_id = p_store_id AND user_id = v_uid;

    IF v_member_role IS NULL OR v_member_role NOT IN ('ADMIN', 'REPOSITOR') THEN
        RAISE EXCEPTION 'Solo un Administrador o Repositor puede realizar ajustes de inventario' USING ERRCODE = '42501';
    END IF;

    IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
        RAISE EXCEPTION 'El motivo o nota del ajuste es obligatorio' USING ERRCODE = '22023';
    END IF;

    IF p_quantity_delta IS NULL OR p_quantity_delta = 0 THEN
        RAISE EXCEPTION 'El delta de ajuste no puede ser cero' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(name, 'Usuario') INTO v_actor_name
    FROM public.profiles
    WHERE id = v_uid;

    SELECT * INTO v_product
    FROM public.products
    WHERE store_id = p_store_id AND id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Producto no encontrado en esta tienda' USING ERRCODE = '23503';
    END IF;

    v_new_stock := v_product.stock + p_quantity_delta;
    IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'El ajuste resultaria en un stock negativo (%)', v_new_stock USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.inventory_movements (
        store_id, product_id, product_name, type, quantity,
        previous_stock, new_stock, user_id, user_name, note
    ) VALUES (
        p_store_id, v_product.id, v_product.name, 'AJUSTE', p_quantity_delta,
        v_product.stock, v_new_stock, v_uid, COALESCE(v_actor_name, 'Usuario'), trim(p_note)
    );

    UPDATE public.products
    SET stock = v_new_stock
    WHERE id = v_product.id;

    RETURN jsonb_build_object(
        'success', true,
        'product_id', v_product.id,
        'previous_stock', v_product.stock,
        'new_stock', v_new_stock
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_sale(
    p_store_id uuid,
    p_ticket_number text,
    p_payment_method text,
    p_cash_given numeric,
    p_items jsonb,
    p_register_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_member_role TEXT;
    v_cashier_name TEXT;
    v_reg_id UUID := p_register_id;
    v_sale_id UUID;
    v_item RECORD;
    v_product RECORD;
    v_total_amount NUMERIC(12,2) := 0;
    v_total_profit NUMERIC(12,2) := 0;
    v_total_qty NUMERIC(12,3) := 0;
    v_item_subtotal NUMERIC(12,2);
    v_item_profit NUMERIC(12,2);
    v_new_stock NUMERIC(12,3);
    v_new_units_sold NUMERIC(12,3);
    v_new_sales_count INTEGER;
    v_change_given NUMERIC(12,2) := 0;
    v_cash_given NUMERIC(12,2) := p_cash_given;
    v_ticket_num TEXT := p_ticket_number;
    v_calibrated_items JSONB := '[]'::jsonb;
    v_days_active INTEGER;
    v_becomes_real BOOLEAN;
    v_check_amount NUMERIC(12,2);
    v_check_profit NUMERIC(12,2);
    v_check_qty NUMERIC(12,3);
    v_product_ids UUID[];
    v_local_now TIMESTAMP := now() AT TIME ZONE 'America/Lima';
    v_prefix TEXT;
    v_seq INTEGER;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_member_role
    FROM public.store_members
    WHERE store_id = p_store_id AND user_id = v_uid;

    IF v_member_role IS NULL THEN
        RAISE EXCEPTION 'No perteneces a esta tienda' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(name, 'Cajero') INTO v_cashier_name
    FROM public.profiles
    WHERE id = v_uid;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La venta debe contener al menos un producto' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_items) AS x
        WHERE x->>'productId' IS NULL
           OR x->>'quantity' IS NULL
           OR (x->>'quantity')::NUMERIC <= 0
    ) THEN
        RAISE EXCEPTION 'Cada partida debe tener productId y una cantidad mayor a 0' USING ERRCODE = '22023';
    END IF;

    IF p_payment_method IS NULL OR p_payment_method NOT IN ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia', 'qr') THEN
        RAISE EXCEPTION 'Metodo de pago invalido: %', p_payment_method USING ERRCODE = '22023';
    END IF;

    -- Caja: la indicada, o la primera activa (se autocrea 'Caja 01' si no hay).
    IF v_reg_id IS NULL THEN
        SELECT id INTO v_reg_id
        FROM public.cash_registers
        WHERE store_id = p_store_id AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_reg_id IS NULL THEN
            INSERT INTO public.cash_registers (store_id, name, is_active)
            VALUES (p_store_id, 'Caja 01 - Mostrador', true)
            ON CONFLICT (store_id, name) DO NOTHING;

            SELECT id INTO v_reg_id
            FROM public.cash_registers
            WHERE store_id = p_store_id AND is_active = true
            ORDER BY created_at ASC
            LIMIT 1;
        END IF;
    ELSE
        IF NOT EXISTS (
            SELECT 1 FROM public.cash_registers
            WHERE id = v_reg_id AND store_id = p_store_id AND is_active = true
        ) THEN
            RAISE EXCEPTION 'La caja registradora % no existe o esta inactiva en esta tienda', v_reg_id USING ERRCODE = '23503';
        END IF;
    END IF;

    -- Numero de ticket T-YYMMDD-NNNN con el dia en hora de Lima (UTC-5).
    IF v_ticket_num IS NULL OR trim(v_ticket_num) = '' THEN
        PERFORM pg_advisory_xact_lock(hashtext('ticket_seq_' || p_store_id::text));
        v_prefix := 'T-' || to_char(v_local_now, 'YYMMDD') || '-';
        SELECT COALESCE(MAX(substring(ticket_number FROM '[0-9]+$')::INTEGER), 0) + 1
        INTO v_seq
        FROM public.sales
        WHERE store_id = p_store_id
          AND ticket_number LIKE v_prefix || '%';
        v_ticket_num := v_prefix || lpad(v_seq::TEXT, 4, '0');
    END IF;

    -- Bloqueo ordenado de los productos (evita deadlocks entre ventas concurrentes).
    SELECT array_agg(DISTINCT (x->>'productId')::UUID ORDER BY (x->>'productId')::UUID)
    INTO v_product_ids
    FROM jsonb_array_elements(p_items) AS x;

    PERFORM 1
    FROM public.products
    WHERE store_id = p_store_id AND id = ANY(v_product_ids)
    ORDER BY id
    FOR UPDATE;

    -- Pasada 1: validar y calcular totales con los precios de la BD.
    FOR v_item IN
        SELECT (x->>'productId')::UUID AS product_id,
               SUM((x->>'quantity')::NUMERIC(12,3)) AS quantity
        FROM jsonb_array_elements(p_items) AS x
        GROUP BY (x->>'productId')::UUID
        ORDER BY (x->>'productId')::UUID
    LOOP
        SELECT * INTO v_product
        FROM public.products
        WHERE store_id = p_store_id AND id = v_item.product_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto % no encontrado en esta tienda', v_item.product_id USING ERRCODE = '23503';
        END IF;

        IF v_product.archived_at IS NOT NULL THEN
            RAISE EXCEPTION 'El producto "%" esta archivado y no se puede vender', v_product.name USING ERRCODE = 'P0001';
        END IF;

        IF v_product.stock < v_item.quantity THEN
            RAISE EXCEPTION 'Stock insuficiente para el producto "%" (disponible: %, solicitado: %)',
                v_product.name, v_product.stock, v_item.quantity USING ERRCODE = 'P0001';
        END IF;

        v_item_subtotal := ROUND(v_product.sale_price * v_item.quantity, 2);
        v_item_profit   := v_item_subtotal - ROUND(v_product.cost_price * v_item.quantity, 2);

        v_total_amount := v_total_amount + v_item_subtotal;
        v_total_profit := v_total_profit + v_item_profit;
        v_total_qty    := v_total_qty + v_item.quantity;
    END LOOP;

    IF p_payment_method = 'efectivo' THEN
        IF v_cash_given IS NULL OR v_cash_given < v_total_amount THEN
            RAISE EXCEPTION 'Monto en efectivo insuficiente (recibido: %, total: %)', v_cash_given, v_total_amount USING ERRCODE = '22023';
        END IF;
        v_change_given := v_cash_given - v_total_amount;
    ELSE
        v_cash_given := NULL;
        v_change_given := 0;
    END IF;

    INSERT INTO public.sales (
        store_id, register_id, ticket_number, total_quantity, total_amount,
        total_profit, payment_method, cash_given, change_given, cashier_name, user_id
    ) VALUES (
        p_store_id, v_reg_id, v_ticket_num, v_total_qty, v_total_amount,
        v_total_profit, p_payment_method, v_cash_given, v_change_given, v_cashier_name, v_uid
    ) RETURNING id INTO v_sale_id;

    -- Pasada 2: partidas, kardex y actualizacion de producto.
    FOR v_item IN
        SELECT (x->>'productId')::UUID AS product_id,
               SUM((x->>'quantity')::NUMERIC(12,3)) AS quantity
        FROM jsonb_array_elements(p_items) AS x
        GROUP BY (x->>'productId')::UUID
        ORDER BY (x->>'productId')::UUID
    LOOP
        SELECT * INTO v_product
        FROM public.products
        WHERE store_id = p_store_id AND id = v_item.product_id;

        v_item_subtotal   := ROUND(v_product.sale_price * v_item.quantity, 2);
        v_item_profit     := v_item_subtotal - ROUND(v_product.cost_price * v_item.quantity, 2);
        v_new_stock       := v_product.stock - v_item.quantity;
        v_new_units_sold  := v_product.units_sold + v_item.quantity;
        v_new_sales_count := v_product.sales_count + 1;
        v_days_active     := GREATEST(EXTRACT(DAY FROM (now() - v_product.created_at))::INTEGER, 1);
        -- Calibracion por ventas: esta venta es la que completa el 5to ticket.
        -- (El paso a REAL por antiguedad lo muestra product_stats; no es un evento.)
        v_becomes_real    := (v_product.sales_count < 5 AND v_new_sales_count >= 5);

        IF v_becomes_real THEN
            v_calibrated_items := v_calibrated_items || jsonb_build_object(
                'id', v_product.id,
                'name', v_product.name,
                'newUnitsSold', v_new_units_sold,
                'newSalesCount', v_new_sales_count,
                'newVelocity', ROUND((v_new_units_sold / v_days_active), 2)
            );
        END IF;

        INSERT INTO public.sale_items (
            sale_id, store_id, product_id, product_name, quantity,
            unit_price, unit_cost, subtotal, profit
        ) VALUES (
            v_sale_id, p_store_id, v_product.id, v_product.name, v_item.quantity,
            v_product.sale_price, v_product.cost_price, v_item_subtotal, v_item_profit
        );

        INSERT INTO public.inventory_movements (
            store_id, product_id, product_name, type, quantity,
            previous_stock, new_stock, sale_id, user_id, user_name, note
        ) VALUES (
            p_store_id, v_product.id, v_product.name, 'VENTA', -v_item.quantity,
            v_product.stock, v_new_stock, v_sale_id, v_uid, v_cashier_name,
            'Venta ' || v_ticket_num
        );

        UPDATE public.products
        SET stock = v_new_stock,
            units_sold = v_new_units_sold,
            sales_count = v_new_sales_count
        WHERE id = v_product.id;
    END LOOP;

    -- Verificacion atomica: los totales del ticket deben cuadrar con las partidas.
    SELECT
        COALESCE(SUM(subtotal), 0),
        COALESCE(SUM(profit), 0),
        COALESCE(SUM(quantity), 0)
    INTO v_check_amount, v_check_profit, v_check_qty
    FROM public.sale_items
    WHERE sale_id = v_sale_id;

    IF v_check_amount <> v_total_amount OR v_check_profit <> v_total_profit OR v_check_qty <> v_total_qty THEN
        RAISE EXCEPTION 'Error de integridad: los totales de la venta no coinciden con los items' USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'ticket_number', v_ticket_num,
        'total_amount', v_total_amount,
        'total_profit', v_total_profit,
        'change_given', v_change_given,
        'calibrated_items', v_calibrated_items
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_purchase(
    p_store_id UUID,
    p_supplier_id UUID,
    p_items JSONB,
    p_note TEXT DEFAULT NULL,
    p_payment_condition TEXT DEFAULT NULL,
    p_credit_days INTEGER DEFAULT NULL,
    p_simulation_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_member_role TEXT;
    v_creator_name TEXT;
    v_purchase_id UUID;
    v_due_date DATE;
    v_item RECORD;
    v_product RECORD;
    v_total_amount NUMERIC(12,2) := 0;
    v_new_stock NUMERIC(12,3);
    v_check_total NUMERIC(12,2);
    v_product_ids UUID[];
    v_sup_cond TEXT;
    v_sup_days INTEGER;
    v_cond TEXT;
    v_days INTEGER;
    v_sim_ids UUID[];
    v_bad_sim UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_member_role
    FROM public.store_members
    WHERE store_id = p_store_id AND user_id = v_uid;

    IF v_member_role IS NULL OR v_member_role NOT IN ('ADMIN', 'REPOSITOR') THEN
        RAISE EXCEPTION 'Solo un Administrador o Repositor puede registrar compras de inventario' USING ERRCODE = '42501';
    END IF;

    IF p_simulation_ids IS NOT NULL AND cardinality(p_simulation_ids) > 0 AND v_member_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Solo un Administrador puede aplicar simulaciones a una compra' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(name, 'Administrador') INTO v_creator_name
    FROM public.profiles
    WHERE id = v_uid;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La compra debe contener al menos un producto' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_items) AS x
        WHERE x->>'product_id' IS NULL
           OR x->>'quantity' IS NULL
           OR x->>'unit_cost' IS NULL
           OR (x->>'quantity')::NUMERIC <= 0
           OR (x->>'unit_cost')::NUMERIC < 0
    ) THEN
        RAISE EXCEPTION 'Cada partida requiere product_id, cantidad mayor a 0 y costo unitario no negativo' USING ERRCODE = '22023';
    END IF;

    IF p_supplier_id IS NOT NULL THEN
        SELECT payment_condition, credit_days INTO v_sup_cond, v_sup_days
        FROM public.suppliers
        WHERE store_id = p_store_id AND id = p_supplier_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'El proveedor no existe o no pertenece a esta tienda' USING ERRCODE = '23503';
        END IF;
    END IF;

    -- Condicion de pago efectiva
    v_cond := lower(trim(COALESCE(p_payment_condition, v_sup_cond, 'contado')));
    IF v_cond NOT IN ('contado', 'credito') THEN
        RAISE EXCEPTION 'Condicion de pago invalida: %', v_cond USING ERRCODE = '22023';
    END IF;

    IF v_cond = 'contado' THEN
        IF COALESCE(p_credit_days, 0) <> 0 THEN
            RAISE EXCEPTION 'Una compra al contado no puede tener dias de credito' USING ERRCODE = '22023';
        END IF;
        v_days := 0;
    ELSE
        v_days := COALESCE(p_credit_days, NULLIF(v_sup_days, 0));
        IF v_days IS NULL OR v_days <= 0 THEN
            RAISE EXCEPTION 'Una compra a credito requiere dias de credito mayores a 0' USING ERRCODE = '22023';
        END IF;
    END IF;

    SELECT array_agg(DISTINCT (x->>'product_id')::UUID ORDER BY (x->>'product_id')::UUID)
    INTO v_product_ids
    FROM jsonb_array_elements(p_items) AS x;

    PERFORM 1
    FROM public.products
    WHERE store_id = p_store_id AND id = ANY(v_product_ids)
    ORDER BY id
    FOR UPDATE;

    -- Simulaciones que esta compra materializa (se bloquean tras los productos).
    IF p_simulation_ids IS NOT NULL AND cardinality(p_simulation_ids) > 0 THEN
        SELECT array_agg(DISTINCT sid ORDER BY sid) INTO v_sim_ids
        FROM unnest(p_simulation_ids) AS sid;

        PERFORM 1
        FROM public.simulations
        WHERE store_id = p_store_id AND id = ANY(v_sim_ids)
        ORDER BY id
        FOR UPDATE;

        IF (SELECT count(*) FROM public.simulations
            WHERE store_id = p_store_id AND id = ANY(v_sim_ids)) <> cardinality(v_sim_ids) THEN
            RAISE EXCEPTION 'Alguna simulacion no existe en esta tienda' USING ERRCODE = '23503';
        END IF;

        IF EXISTS (SELECT 1 FROM public.simulations
                   WHERE store_id = p_store_id AND id = ANY(v_sim_ids) AND status <> 'PENDIENTE') THEN
            RAISE EXCEPTION 'Solo se pueden aplicar simulaciones en estado PENDIENTE' USING ERRCODE = 'P0001';
        END IF;

        SELECT id INTO v_bad_sim
        FROM public.simulations
        WHERE store_id = p_store_id AND id = ANY(v_sim_ids)
          AND product_id IS NOT NULL AND NOT (product_id = ANY(v_product_ids))
        LIMIT 1;

        IF v_bad_sim IS NOT NULL THEN
            RAISE EXCEPTION 'La simulacion % es de un producto que no esta en esta compra', v_bad_sim USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Pasada 1: validar y totalizar (misma agrupacion que usaran las partidas).
    FOR v_item IN
        SELECT (x->>'product_id')::UUID AS product_id,
               SUM((x->>'quantity')::NUMERIC(12,3)) AS quantity,
               MIN((x->>'unit_cost')::NUMERIC(12,2)) AS unit_cost,
               COUNT(DISTINCT (x->>'unit_cost')::NUMERIC(12,2)) AS n_costs
        FROM jsonb_array_elements(p_items) AS x
        GROUP BY (x->>'product_id')::UUID
        ORDER BY (x->>'product_id')::UUID
    LOOP
        IF v_item.n_costs > 1 THEN
            RAISE EXCEPTION 'El producto % aparece con costos unitarios distintos en la misma compra', v_item.product_id USING ERRCODE = '22023';
        END IF;

        SELECT * INTO v_product
        FROM public.products
        WHERE store_id = p_store_id AND id = v_item.product_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto % no encontrado en esta tienda', v_item.product_id USING ERRCODE = '23503';
        END IF;

        IF v_product.archived_at IS NOT NULL THEN
            RAISE EXCEPTION 'No se puede registrar compra para el producto archivado "%"', v_product.name USING ERRCODE = 'P0001';
        END IF;

        v_total_amount := v_total_amount + ROUND(v_item.quantity * v_item.unit_cost, 2);
    END LOOP;

    INSERT INTO public.purchases (
        store_id, supplier_id, total, payment_condition, credit_days, paid_at, created_by, note
    ) VALUES (
        p_store_id, p_supplier_id, v_total_amount, v_cond, v_days,
        CASE WHEN v_cond = 'contado' THEN now() ELSE NULL END,
        v_uid, p_note
    )
    RETURNING id, due_date INTO v_purchase_id, v_due_date;

    -- Pasada 2: partidas, kardex y stock / ultimo costo.
    FOR v_item IN
        SELECT (x->>'product_id')::UUID AS product_id,
               SUM((x->>'quantity')::NUMERIC(12,3)) AS quantity,
               MIN((x->>'unit_cost')::NUMERIC(12,2)) AS unit_cost
        FROM jsonb_array_elements(p_items) AS x
        GROUP BY (x->>'product_id')::UUID
        ORDER BY (x->>'product_id')::UUID
    LOOP
        SELECT * INTO v_product
        FROM public.products
        WHERE store_id = p_store_id AND id = v_item.product_id;

        v_new_stock := v_product.stock + v_item.quantity;

        INSERT INTO public.purchase_items (store_id, purchase_id, product_id, quantity, unit_cost)
        VALUES (p_store_id, v_purchase_id, v_product.id, v_item.quantity, v_item.unit_cost);

        INSERT INTO public.inventory_movements (
            store_id, product_id, product_name, type, quantity,
            previous_stock, new_stock, purchase_id, supplier_id,
            user_id, user_name, note
        ) VALUES (
            p_store_id, v_product.id, v_product.name, 'COMPRA', v_item.quantity,
            v_product.stock, v_new_stock, v_purchase_id, p_supplier_id,
            v_uid, v_creator_name, COALESCE(p_note, 'Ingreso por compra')
        );

        -- Regla de negocio: el costo del producto pasa a ser el ULTIMO costo de
        -- compra (no se calcula costo promedio ponderado).
        UPDATE public.products
        SET stock = v_new_stock,
            cost_price = v_item.unit_cost
        WHERE id = v_product.id;
    END LOOP;

    SELECT COALESCE(SUM(subtotal), 0) INTO v_check_total
    FROM public.purchase_items
    WHERE purchase_id = v_purchase_id;

    IF v_check_total <> v_total_amount THEN
        RAISE EXCEPTION 'Error de integridad: el total de la compra (%) no coincide con las partidas (%)', v_total_amount, v_check_total
        USING ERRCODE = 'P0001';
    END IF;

    IF v_sim_ids IS NOT NULL THEN
        UPDATE public.simulations
        SET status = 'APLICADA',
            purchase_id = v_purchase_id
        WHERE store_id = p_store_id AND id = ANY(v_sim_ids);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'purchase_id', v_purchase_id,
        'total', v_total_amount,
        'payment_condition', v_cond,
        'credit_days', v_days,
        'due_date', v_due_date,
        'simulations_applied', COALESCE(cardinality(v_sim_ids), 0)
    );
END;
$function$;

-- (b) Eliminar restricciones CHECK agregadas por H-17
ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS chk_inventory_movements_finite_new_stock;
ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS chk_inventory_movements_finite_previous_stock;
ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS chk_inventory_movements_finite_quantity;

ALTER TABLE public.purchase_items DROP CONSTRAINT IF EXISTS chk_purchase_items_finite_unit_cost;
ALTER TABLE public.purchase_items DROP CONSTRAINT IF EXISTS chk_purchase_items_finite_quantity;

ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS chk_purchases_finite_total;

ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS chk_sale_items_finite_profit;
ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS chk_sale_items_finite_subtotal;
ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS chk_sale_items_finite_unit_cost;
ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS chk_sale_items_finite_unit_price;
ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS chk_sale_items_finite_quantity;

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS chk_sales_finite_change_given;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS chk_sales_finite_cash_given;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS chk_sales_finite_total_profit;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS chk_sales_finite_total_amount;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS chk_sales_finite_total_quantity;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS chk_products_finite_reorder_point;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS chk_products_finite_sale_price;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS chk_products_finite_cost_price;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS chk_products_finite_stock;

-- (c) Eliminar función auxiliar (ahora que ninguna función ni tabla depende de ella)
DROP FUNCTION IF EXISTS public.is_finite_numeric(NUMERIC);

COMMIT;
