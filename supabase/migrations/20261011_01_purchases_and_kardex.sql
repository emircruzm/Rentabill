BEGIN;

-- 1. Crear tabla purchases con UNIQUE (store_id, id) y FK compuesta hacia suppliers
CREATE TABLE IF NOT EXISTS public.purchases (
    id UUID DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    supplier_id UUID,
    total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notas TEXT,
    CONSTRAINT pk_purchases PRIMARY KEY (id),
    CONSTRAINT uq_purchases_store_id UNIQUE (store_id, id),
    CONSTRAINT fk_purchases_suppliers_store FOREIGN KEY (store_id, supplier_id) 
        REFERENCES public.suppliers(store_id, id) ON DELETE SET NULL (supplier_id)
);

-- Índices de cobertura en purchases
CREATE INDEX IF NOT EXISTS idx_purchases_store_id ON public.purchases(store_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON public.purchases(store_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON public.purchases(store_id, created_at DESC);

-- 2. Crear tabla purchase_items con FK compuestas a purchases y products
CREATE TABLE IF NOT EXISTS public.purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,
    purchase_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
    subtotal NUMERIC(12,2) GENERATED ALWAYS AS (ROUND(quantity * unit_cost, 2)) STORED,
    CONSTRAINT fk_purchase_items_purchases_store FOREIGN KEY (store_id, purchase_id) 
        REFERENCES public.purchases(store_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_purchase_items_products_store FOREIGN KEY (store_id, product_id) 
        REFERENCES public.products(store_id, id) ON DELETE RESTRICT
);

-- Índices de cobertura en purchase_items
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON public.purchase_items(store_id, purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON public.purchase_items(store_id, product_id);

-- 3. Agregar FK compuesta en inventory_movements hacia purchases (store_id, purchase_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_movements_purchases_store' 
          AND table_schema = 'public' 
          AND table_name = 'inventory_movements'
    ) THEN
        ALTER TABLE public.inventory_movements
            ADD CONSTRAINT fk_movements_purchases_store
            FOREIGN KEY (store_id, purchase_id)
            REFERENCES public.purchases(store_id, id)
            ON DELETE SET NULL (purchase_id);
    END IF;
END $$;

-- 4. Asegurar coherencia del CHECK del Kardex (chk_kardex_consistency)
ALTER TABLE public.inventory_movements
    DROP CONSTRAINT IF EXISTS chk_kardex_consistency;

ALTER TABLE public.inventory_movements
    ADD CONSTRAINT chk_kardex_consistency CHECK (
        (type = 'VENTA' AND sale_id IS NOT NULL AND quantity < 0)
        OR
        (type = 'COMPRA' AND purchase_id IS NOT NULL AND quantity > 0)
        OR
        (type = 'AJUSTE' AND note IS NOT NULL AND length(trim(note)) > 0 AND quantity <> 0)
    );

-- 5. Crear la función RPC process_purchase (SECURITY DEFINER, search_path vacío, ADMIN, FOR UPDATE)
CREATE OR REPLACE FUNCTION public.process_purchase(
    p_store_id UUID,
    p_supplier_id UUID,
    p_items JSONB,
    p_notas TEXT DEFAULT NULL
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
    -- Validar autenticación
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    -- Validar rol ADMIN en la tienda
    SELECT role INTO v_member_role
    FROM public.store_members
    WHERE store_id = p_store_id AND user_id = v_uid;

    IF v_member_role IS NULL OR v_member_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Solo un Administrador puede registrar compras de inventario' USING ERRCODE = '42501';
    END IF;

    -- Obtener nombre del creador para el Kardex
    SELECT COALESCE(name, 'Administrador') INTO v_creator_name
    FROM public.profiles
    WHERE id = v_uid;

    -- Validar items recibidos
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La compra debe contener al menos un producto' USING ERRCODE = '22023';
    END IF;

    -- Validar proveedor si se especificó
    IF p_supplier_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.suppliers 
            WHERE store_id = p_store_id AND id = p_supplier_id
        ) THEN
            RAISE EXCEPTION 'El proveedor no existe o no pertenece a esta tienda' USING ERRCODE = '23503';
        END IF;
    END IF;

    -- Extraer IDs de productos y bloquear con FOR UPDATE en orden canónico
    SELECT array_agg(DISTINCT (x->>'product_id')::UUID ORDER BY (x->>'product_id')::UUID)
    INTO v_product_ids
    FROM jsonb_array_elements(p_items) AS x;

    PERFORM 1
    FROM public.products
    WHERE store_id = p_store_id AND id = ANY(v_product_ids)
    ORDER BY id
    FOR UPDATE;

    -- Calcular total general de la compra
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

        v_item_subtotal := ROUND(v_item.quantity * v_item.unit_cost, 2);
        v_total_amount := v_total_amount + v_item_subtotal;
    END LOOP;

    -- Insertar cabecera de la compra
    INSERT INTO public.purchases (
        store_id, supplier_id, total, created_by, notas
    ) VALUES (
        p_store_id, p_supplier_id, v_total_amount, v_uid, p_notas
    ) RETURNING id INTO v_purchase_id;

    -- Insertar items, kardex y actualizar stock de productos
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

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto % no encontrado en esta tienda', v_item.product_id USING ERRCODE = '23503';
        END IF;

        v_new_stock := v_product.stock + v_item.quantity;

        -- Insertar partida de compra
        INSERT INTO public.purchase_items (
            store_id, purchase_id, product_id, quantity, unit_cost
        ) VALUES (
            p_store_id, v_purchase_id, v_product.id, v_item.quantity, v_item.unit_cost
        );

        -- Insertar movimiento en el Kardex
        INSERT INTO public.inventory_movements (
            store_id, product_id, product_name, type, quantity,
            previous_stock, new_stock, purchase_id, supplier_id,
            user_id, user_name, note
        ) VALUES (
            p_store_id, v_product.id, v_product.name, 'COMPRA', v_item.quantity,
            v_product.stock, v_new_stock, v_purchase_id, p_supplier_id,
            v_uid, v_creator_name, COALESCE(p_notas, 'Ingreso por compra')
        );

        -- Actualizar stock del producto (y opcionalmente actualizar cost_price al último costo ingresado)
        UPDATE public.products
        SET stock = v_new_stock,
            cost_price = v_item.unit_cost,
            updated_at = now()
        WHERE id = v_product.id;
    END LOOP;

    -- Verificación de integridad: el total calculado debe coincidir con los items registrados
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

-- Privilegios de ejecución
REVOKE EXECUTE ON FUNCTION public.process_purchase(UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_purchase(UUID, UUID, JSONB, TEXT) TO authenticated;

COMMIT;
-- ROLLBACK;
