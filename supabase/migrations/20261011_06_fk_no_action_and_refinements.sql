-- Versión anterior; el esquema vigente es supabase/rentabill_schema_v3.7.sql
BEGIN;

-- ==============================================================================
-- 8. FK: CAMBIAR ON DELETE RESTRICT A NO ACTION (C8)
-- Permite que DELETE FROM stores en cascada elimine tablas sin violar RESTRICT
-- ==============================================================================

-- 8.1 fk_products_categories_store
ALTER TABLE public.products
    DROP CONSTRAINT IF EXISTS fk_products_categories_store;
ALTER TABLE public.products
    ADD CONSTRAINT fk_products_categories_store
    FOREIGN KEY (store_id, category_id)
    REFERENCES public.categories(store_id, id)
    ON DELETE NO ACTION;

-- 8.2 fk_purchase_items_products_store
ALTER TABLE public.purchase_items
    DROP CONSTRAINT IF EXISTS fk_purchase_items_products_store;
ALTER TABLE public.purchase_items
    ADD CONSTRAINT fk_purchase_items_products_store
    FOREIGN KEY (store_id, product_id)
    REFERENCES public.products(store_id, id)
    ON DELETE NO ACTION;

-- 8.3 fk_sales_cash_registers_store
ALTER TABLE public.sales
    DROP CONSTRAINT IF EXISTS fk_sales_cash_registers_store;
ALTER TABLE public.sales
    ADD CONSTRAINT fk_sales_cash_registers_store
    FOREIGN KEY (store_id, register_id)
    REFERENCES public.cash_registers(store_id, id)
    ON DELETE NO ACTION;

-- ==============================================================================
-- 9. PRODUCTS: REVOKE UPDATE DE STOCK Y TRIGGER AJUSTE STOCK INICIAL (C9)
-- Quita stock, units_sold, sales_count, status del GRANT a authenticated
-- ==============================================================================
REVOKE UPDATE ON public.products FROM authenticated;
GRANT UPDATE (
    name, barcode, sku, unit, cost_price, sale_price, 
    reorder_point, estimated_speed, image_url, category_id, archived_at
) ON public.products TO authenticated;

-- Trigger SECURITY DEFINER al insertar producto con stock > 0: registra AJUSTE 'Stock inicial'
CREATE OR REPLACE FUNCTION public.trg_product_initial_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_name TEXT;
BEGIN
    IF NEW.stock > 0 THEN
        SELECT COALESCE(name, 'Administrador') INTO v_actor_name
        FROM public.profiles
        WHERE id = auth.uid();

        INSERT INTO public.inventory_movements (
            store_id, product_id, product_name, type, quantity,
            previous_stock, new_stock, user_id, user_name, note
        ) VALUES (
            NEW.store_id, NEW.id, NEW.name, 'AJUSTE', NEW.stock,
            0, NEW.stock, auth.uid(), COALESCE(v_actor_name, 'Sistema'), 'Stock inicial'
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_initial_stock_insert ON public.products;
CREATE TRIGGER trg_product_initial_stock_insert
AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_product_initial_stock();

-- ==============================================================================
-- 10. RENOMBRAR purchases.notas A note Y RECHAZAR PRODUCTOS ARCHIVADOS (C10)
-- ==============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchases' AND column_name = 'notas'
    ) THEN
        ALTER TABLE public.purchases RENAME COLUMN notas TO note;
    END IF;
END $$;

-- Actualizar función process_purchase con p_note y rechazo de productos archivados
CREATE OR REPLACE FUNCTION public.process_purchase(
    p_store_id UUID,
    p_supplier_id UUID,
    p_items JSONB,
    p_note TEXT DEFAULT NULL
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
    v_item RECORD;
    v_product RECORD;
    v_total_amount NUMERIC(12,2) := 0;
    v_item_subtotal NUMERIC(12,2);
    v_new_stock NUMERIC(12,3);
    v_check_total NUMERIC(12,2);
    v_product_ids UUID[];
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_member_role
    FROM public.store_members
    WHERE store_id = p_store_id AND user_id = v_uid;

    IF v_member_role IS NULL OR v_member_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Solo un Administrador puede registrar compras de inventario' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(name, 'Administrador') INTO v_creator_name
    FROM public.profiles
    WHERE id = v_uid;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La compra debe contener al menos un producto' USING ERRCODE = '22023';
    END IF;

    IF p_supplier_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.suppliers 
            WHERE store_id = p_store_id AND id = p_supplier_id
        ) THEN
            RAISE EXCEPTION 'El proveedor no existe o no pertenece a esta tienda' USING ERRCODE = '23503';
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

    FOR v_item IN
        SELECT 
            (x->>'product_id')::UUID AS product_id,
            (x->>'quantity')::NUMERIC(12,3) AS quantity,
            (x->>'unit_cost')::NUMERIC(12,2) AS unit_cost
        FROM jsonb_array_elements(p_items) AS x
    LOOP
        IF v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'La cantidad debe ser mayor a 0' USING ERRCODE = '22023';
        END IF;
        IF v_item.unit_cost < 0 THEN
            RAISE EXCEPTION 'El costo unitario no puede ser negativo' USING ERRCODE = '22023';
        END IF;

        -- Verificar que el producto exista y NO esté archivado
        SELECT * INTO v_product
        FROM public.products
        WHERE store_id = p_store_id AND id = v_item.product_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto % no encontrado en esta tienda', v_item.product_id USING ERRCODE = '23503';
        END IF;

        IF v_product.archived_at IS NOT NULL THEN
            RAISE EXCEPTION 'No se puede registrar compra para el producto archivado "%"', v_product.name USING ERRCODE = 'P0001';
        END IF;

        v_item_subtotal := ROUND(v_item.quantity * v_item.unit_cost, 2);
        v_total_amount := v_total_amount + v_item_subtotal;
    END LOOP;

    INSERT INTO public.purchases (
        store_id, supplier_id, total, created_by, note
    ) VALUES (
        p_store_id, p_supplier_id, v_total_amount, v_uid, p_note
    ) RETURNING id INTO v_purchase_id;

    FOR v_item IN
        SELECT 
            (x->>'product_id')::UUID AS product_id,
            SUM((x->>'quantity')::NUMERIC(12,3)) AS quantity,
            (x->>'unit_cost')::NUMERIC(12,2) AS unit_cost
        FROM jsonb_array_elements(p_items) AS x
        GROUP BY (x->>'product_id')::UUID, (x->>'unit_cost')::NUMERIC(12,2)
        ORDER BY (x->>'product_id')::UUID
    LOOP
        SELECT * INTO v_product
        FROM public.products
        WHERE store_id = p_store_id AND id = v_item.product_id;

        v_new_stock := v_product.stock + v_item.quantity;

        INSERT INTO public.purchase_items (
            store_id, purchase_id, product_id, quantity, unit_cost
        ) VALUES (
            p_store_id, v_purchase_id, v_product.id, v_item.quantity, v_item.unit_cost
        );

        INSERT INTO public.inventory_movements (
            store_id, product_id, product_name, type, quantity,
            previous_stock, new_stock, purchase_id, supplier_id,
            user_id, user_name, note
        ) VALUES (
            p_store_id, v_product.id, v_product.name, 'COMPRA', v_item.quantity,
            v_product.stock, v_new_stock, v_purchase_id, p_supplier_id,
            v_uid, v_creator_name, COALESCE(p_note, 'Ingreso por compra')
        );

        UPDATE public.products
        SET stock = v_new_stock,
            cost_price = v_item.unit_cost,
            updated_at = now()
        WHERE id = v_product.id;
    END LOOP;

    SELECT COALESCE(SUM(subtotal), 0) INTO v_check_total
    FROM public.purchase_items
    WHERE purchase_id = v_purchase_id;

    IF v_check_total <> v_total_amount THEN
        RAISE EXCEPTION 'Error de integridad: el total de la compra (%) no coincide con las partidas (%)', v_total_amount, v_check_total
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'purchase_id', v_purchase_id,
        'total', v_total_amount
    );
END;
$function$;

-- ==============================================================================
-- 11. RENOMBRAR suppliers.category A rubro (C11)
-- ==============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'category'
    ) THEN
        ALTER TABLE public.suppliers RENAME COLUMN category TO rubro;
    END IF;
END $$;

-- ==============================================================================
-- 12. REDEFINIR COMENTARIO EN payment_method = 'qr' (C12)
-- QR del comercio (stores.qr_image_url)
-- ==============================================================================
COMMENT ON COLUMN public.sales.payment_method IS 
'Método de cobro: efectivo, tarjeta, yape, plin, transferencia o qr (QR del comercio basado en stores.qr_image_url).';

-- Re-conceder permisos en process_purchase con nueva firma
REVOKE EXECUTE ON FUNCTION public.process_purchase(UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_purchase(UUID, UUID, JSONB, TEXT) TO authenticated;

COMMIT;
-- ROLLBACK;
