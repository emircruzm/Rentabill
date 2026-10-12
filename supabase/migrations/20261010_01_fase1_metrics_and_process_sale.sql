BEGIN;

-- 1. Agregar units_sold y sales_count a products si no existen
ALTER TABLE public.products 
    ADD COLUMN IF NOT EXISTS units_sold NUMERIC(12,3) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sales_count INTEGER NOT NULL DEFAULT 0;

-- 2. Migrar datos iniciales de total_sales si existe
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'total_sales'
    ) THEN
        UPDATE public.products 
        SET units_sold = COALESCE(total_sales, 0),
            sales_count = CASE WHEN COALESCE(total_sales, 0) > 0 THEN 1 ELSE 0 END
        WHERE units_sold = 0 AND sales_count = 0;
        
        ALTER TABLE public.products DROP COLUMN total_sales;
    END IF;
END $$;

-- 3. Constraints numéricos
ALTER TABLE public.products 
    DROP CONSTRAINT IF EXISTS products_units_sold_check,
    DROP CONSTRAINT IF EXISTS products_sales_count_check;

ALTER TABLE public.products 
    ADD CONSTRAINT products_units_sold_check CHECK (units_sold >= 0),
    ADD CONSTRAINT products_sales_count_check CHECK (sales_count >= 0);

-- 4. Actualizar vista product_stats con units_sold y sales_count
CREATE OR REPLACE VIEW public.product_stats AS
SELECT 
    p.id,
    p.store_id,
    p.category_id,
    c.name AS category_name,
    p.barcode,
    p.sku,
    p.name,
    p.unit,
    p.cost_price,
    p.sale_price,
    p.stock,
    p.purchased_quantity,
    p.reorder_point,
    p.estimated_speed,
    p.units_sold,
    p.sales_count,
    GREATEST(EXTRACT(day FROM now() - p.created_at)::integer, 0) AS created_days_ago,
    CASE
        WHEN p.sales_count >= 5 OR EXTRACT(day FROM now() - p.created_at) >= 30 THEN 'REAL'::text
        ELSE 'ESTIMADO'::text
    END AS status,
    p.image_url,
    p.archived_at,
    p.created_at,
    p.updated_at
FROM public.products p
LEFT JOIN public.categories c ON c.id = p.category_id;

-- 5. Eliminar sobrecargas viejas de process_sale y register_sale
DROP FUNCTION IF EXISTS public.process_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.process_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb, uuid);
DROP FUNCTION IF EXISTS public.process_sale(uuid, text, text, numeric, jsonb, uuid);
DROP FUNCTION IF EXISTS public.register_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb, uuid);
DROP FUNCTION IF EXISTS public.register_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb);

-- 6. Crear función única process_sale (6 parámetros) con units_sold y sales_count
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
SET search_path TO 'public', 'pg_temp'
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

    SELECT COALESCE(name, 'Cajero') INTO v_cashier_name
    FROM public.profiles
    WHERE id = v_uid;

    IF v_cashier_name IS NULL THEN
        v_cashier_name := 'Cajero';
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

    -- BUCLE 1: Agrupar por producto, validar stock y calcular totales
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

    -- Cálculo de efectivo y vuelto en servidor
    IF p_payment_method = 'efectivo' THEN
        IF p_cash_given IS NULL OR p_cash_given < v_total_amount THEN
            RAISE EXCEPTION 'El efectivo recibido no cubre el total a cobrar' USING ERRCODE = 'P0001';
        END IF;
        v_cash_given   := p_cash_given;
        v_change_given := p_cash_given - v_total_amount;
    ELSE
        v_cash_given   := NULL;
        v_change_given := 0;
    END IF;

    -- Inserción de venta
    INSERT INTO public.sales (
        store_id, register_id, ticket_number, total_quantity, total_amount,
        total_profit, payment_method, cash_given, change_given, cashier_name, user_id
    ) VALUES (
        p_store_id, v_reg_id, p_ticket_number, v_total_qty, v_total_amount,
        v_total_profit, p_payment_method, v_cash_given, v_change_given, v_cashier_name, v_uid
    ) RETURNING id INTO v_sale_id;

    -- BUCLE 2: Insertar items, kardex y actualizar unidades vendidas y conteo de tickets
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
        v_new_units_sold  := v_product.units_sold + v_item.quantity;
        v_new_sales_count := v_product.sales_count + 1;
        v_days_active     := GREATEST(EXTRACT(DAY FROM (now() - v_product.created_at))::INTEGER, 1);
        v_will_be_real    := (v_new_sales_count >= 5 OR v_days_active >= 30);

        IF v_product.status = 'ESTIMADO' AND v_will_be_real THEN
            v_calibrated_items := v_calibrated_items || jsonb_build_object(
                'id', v_product.id,
                'name', v_product.name,
                'newUnitsSold', v_new_units_sold,
                'newSalesCount', v_new_sales_count,
                'newVelocity', ROUND((v_new_units_sold / v_days_active), 2)
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
            v_product.stock, v_new_stock, v_sale_id, v_uid, v_cashier_name,
            'Venta ' || p_ticket_number
        );

        UPDATE public.products
        SET stock = v_new_stock,
            units_sold = v_new_units_sold,
            sales_count = v_new_sales_count,
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

-- 7. Permisos estrictos: solo authenticated
REVOKE EXECUTE ON FUNCTION public.process_sale(uuid, text, text, numeric, jsonb, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.process_sale(uuid, text, text, numeric, jsonb, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
-- ROLLBACK;
