BEGIN;

DROP FUNCTION IF EXISTS public.process_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.process_sale(
    p_store_id uuid,
    p_ticket_number text,
    p_payment_method text,
    p_cash_given numeric,
    p_change_given numeric,
    p_cashier_name text,
    p_user_id uuid,
    p_items jsonb,
    p_register_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_member_role TEXT;
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
    v_new_total_sales NUMERIC(12,3);
    v_will_be_real BOOLEAN;
    v_days_active INTEGER;
    v_calibrated_items JSONB := '[]'::jsonb;
    v_cash_given NUMERIC(12,2);
    v_change_given NUMERIC(12,2);
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = 'P0001';
    END IF;

    SELECT role INTO v_member_role
    FROM public.store_members
    WHERE store_id = p_store_id AND user_id = v_uid;

    IF v_member_role IS NULL THEN
        RAISE EXCEPTION 'Acceso denegado a la tienda' USING ERRCODE = 'P0001';
    END IF;

    IF p_payment_method IS NULL OR p_payment_method NOT IN ('efectivo', 'qr', 'tarjeta') THEN
        RAISE EXCEPTION 'Método de pago no válido' USING ERRCODE = 'P0001';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El ticket de venta no contiene productos' USING ERRCODE = 'P0001';
    END IF;

    IF v_reg_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.cash_registers
            WHERE id = v_reg_id AND store_id = p_store_id AND is_active = true
        ) THEN
            RAISE EXCEPTION 'La caja seleccionada no pertenece a esta tienda' USING ERRCODE = 'P0001';
        END IF;
    ELSE
        SELECT id INTO v_reg_id
        FROM public.cash_registers
        WHERE store_id = p_store_id AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_reg_id IS NULL THEN
            INSERT INTO public.cash_registers (store_id, name)
            VALUES (p_store_id, 'Caja 01 - Mostrador')
            RETURNING id INTO v_reg_id;
        END IF;
    END IF;

    FOR v_item IN
        SELECT product_id, SUM(quantity) AS quantity
        FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC(12,3))
        GROUP BY product_id
        ORDER BY product_id
    LOOP
        IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'La cantidad vendida debe ser mayor a 0' USING ERRCODE = 'P0001';
        END IF;

        SELECT * INTO v_product
        FROM public.products
        WHERE id = v_item.product_id
          AND store_id = p_store_id
          AND archived_at IS NULL
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no disponible en esta tienda' USING ERRCODE = 'P0001';
        END IF;

        IF v_product.stock < v_item.quantity THEN
            RAISE EXCEPTION 'Stock insuficiente de "%": solo hay % % disponibles',
                v_product.name, trim_scale(v_product.stock), v_product.unit
                USING ERRCODE = 'P0001';
        END IF;

        v_item_subtotal := ROUND(v_product.sale_price * v_item.quantity, 2);
        v_item_profit   := v_item_subtotal - ROUND(v_product.cost_price * v_item.quantity, 2);

        v_total_amount := v_total_amount + v_item_subtotal;
        v_total_profit := v_total_profit + v_item_profit;
        v_total_qty    := v_total_qty + v_item.quantity;
    END LOOP;

    IF p_payment_method = 'efectivo' THEN
        IF p_cash_given IS NULL OR p_cash_given < v_total_amount THEN
            RAISE EXCEPTION 'El efectivo recibido no cubre el total a cobrar' USING ERRCODE = 'P0001';
        END IF;
        v_cash_given   := p_cash_given;
        v_change_given := p_cash_given - v_total_amount;
    ELSE
        v_cash_given   := v_total_amount;
        v_change_given := 0;
    END IF;

    INSERT INTO public.sales (
        store_id, register_id, ticket_number, total_quantity, total_amount,
        total_profit, payment_method, cash_given, change_given, cashier_name, user_id
    ) VALUES (
        p_store_id, v_reg_id, p_ticket_number, v_total_qty, v_total_amount,
        v_total_profit, p_payment_method, v_cash_given, v_change_given, p_cashier_name, v_uid
    ) RETURNING id INTO v_sale_id;

    FOR v_item IN
        SELECT product_id, SUM(quantity) AS quantity
        FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC(12,3))
        GROUP BY product_id
        ORDER BY product_id
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;

        v_item_subtotal   := ROUND(v_product.sale_price * v_item.quantity, 2);
        v_item_profit     := v_item_subtotal - ROUND(v_product.cost_price * v_item.quantity, 2);
        v_new_stock       := v_product.stock - v_item.quantity;
        v_new_total_sales := v_product.total_sales + v_item.quantity;
        v_days_active     := GREATEST(EXTRACT(DAY FROM (now() - v_product.created_at))::INTEGER, 1);
        v_will_be_real    := (v_new_total_sales >= 5 OR v_days_active >= 30);

        IF v_product.status = 'ESTIMADO' AND v_will_be_real THEN
            v_calibrated_items := v_calibrated_items || jsonb_build_object(
                'id', v_product.id,
                'name', v_product.name,
                'newSales', v_new_total_sales,
                'newVelocity', ROUND((v_new_total_sales / v_days_active), 2)
            );
        END IF;

        INSERT INTO public.sale_items (
            sale_id, product_id, product_name, quantity,
            unit_price, unit_cost, subtotal, profit
        ) VALUES (
            v_sale_id, v_product.id, v_product.name, v_item.quantity,
            v_product.sale_price, v_product.cost_price, v_item_subtotal, v_item_profit
        );

        INSERT INTO public.inventory_movements (
            store_id, product_id, product_name, type, quantity,
            previous_stock, new_stock, sale_id, user_id, user_name, note
        ) VALUES (
            p_store_id, v_product.id, v_product.name, 'VENTA', -v_item.quantity,
            v_product.stock, v_new_stock, v_sale_id, v_uid, p_cashier_name,
            'Venta ' || p_ticket_number
        );

        UPDATE public.products
        SET stock = v_new_stock,
            total_sales = v_new_total_sales,
            status = CASE WHEN v_will_be_real THEN 'REAL' ELSE status END
        WHERE id = v_product.id;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'ticket_number', p_ticket_number,
        'total_amount', v_total_amount,
        'total_profit', v_total_profit,
        'change_given', v_change_given,
        'calibrated_items', v_calibrated_items
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.process_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.process_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb, uuid) TO authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'register_sale'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
