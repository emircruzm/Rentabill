BEGIN;

-- 1. Backfill y Normalización 3FN: categorías de texto hacia tabla categories
DO $$
DECLARE
    r RECORD;
    v_cat_id UUID;
BEGIN
    -- Asegurar que la categoría 'General' exista para todas las tiendas
    INSERT INTO public.categories (store_id, name)
    SELECT s.id, 'General'
    FROM public.stores s
    ON CONFLICT (store_id, lower(name)) DO NOTHING;

    -- Para cada producto con categoría en texto si la columna 'category' aún existe
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'category'
    ) THEN
        FOR r IN 
            SELECT DISTINCT store_id, TRIM(category) AS cat_name 
            FROM public.products 
            WHERE category IS NOT NULL AND TRIM(category) <> ''
        LOOP
            -- Insertar categoría si no existe
            INSERT INTO public.categories (store_id, name)
            VALUES (r.store_id, r.cat_name)
            ON CONFLICT (store_id, lower(name)) DO NOTHING;

            -- Obtener id de la categoría
            SELECT id INTO v_cat_id
            FROM public.categories
            WHERE store_id = r.store_id AND lower(name) = lower(r.cat_name)
            LIMIT 1;

            -- Asignar category_id a los productos correspondientes
            UPDATE public.products
            SET category_id = v_cat_id
            WHERE store_id = r.store_id AND lower(category) = lower(r.cat_name) AND (category_id IS NULL OR category_id <> v_cat_id);
        END LOOP;
    END IF;

    -- Asignar 'General' a cualquier producto huérfano con category_id NULL
    FOR r IN SELECT id FROM public.stores LOOP
        SELECT id INTO v_cat_id FROM public.categories WHERE store_id = r.id AND lower(name) = 'general' LIMIT 1;
        IF v_cat_id IS NOT NULL THEN
            UPDATE public.products 
            SET category_id = v_cat_id 
            WHERE store_id = r.id AND category_id IS NULL;
        END IF;
    END LOOP;
END $$;

-- 2. FK compuesta en products (store_id, category_id) -> categories (store_id, id)
ALTER TABLE public.products
    DROP CONSTRAINT IF EXISTS fk_products_categories_store,
    DROP CONSTRAINT IF EXISTS products_category_id_fkey;

ALTER TABLE public.products
    ALTER COLUMN category_id SET NOT NULL;

ALTER TABLE public.products
    ADD CONSTRAINT fk_products_categories_store
    FOREIGN KEY (store_id, category_id)
    REFERENCES public.categories(store_id, id)
    ON DELETE RESTRICT;

-- 3. Eliminar columnas category y purchased_quantity de products si existen
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'category'
    ) THEN
        ALTER TABLE public.products DROP COLUMN category;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'purchased_quantity'
    ) THEN
        ALTER TABLE public.products DROP COLUMN purchased_quantity;
    END IF;
END $$;

-- 4. Recrear product_stats sin category ni purchased_quantity
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
LEFT JOIN public.categories c ON c.store_id = p.store_id AND c.id = p.category_id;

ALTER VIEW public.product_stats SET (security_invoker = true);

-- 5. Reemplazar restricciones UNIQUE por índices únicos de expresión lower(name)
-- Categorías
ALTER TABLE public.categories 
    DROP CONSTRAINT IF EXISTS uq_categories_store_lower_name,
    DROP CONSTRAINT IF EXISTS uq_categories_store_name;
DROP INDEX IF EXISTS public.uq_categories_store_lower_name;
CREATE UNIQUE INDEX uq_categories_store_lower_name 
ON public.categories (store_id, lower(name));

-- Proveedores
ALTER TABLE public.suppliers 
    DROP CONSTRAINT IF EXISTS uq_suppliers_store_lower_name,
    DROP CONSTRAINT IF EXISTS uq_suppliers_store_name;
DROP INDEX IF EXISTS public.uq_suppliers_store_lower_name;
CREATE UNIQUE INDEX uq_suppliers_store_lower_name 
ON public.suppliers (store_id, lower(name)) 
WHERE (archived_at IS NULL);

-- Productos
ALTER TABLE public.products 
    DROP CONSTRAINT IF EXISTS uq_products_store_lower_name,
    DROP CONSTRAINT IF EXISTS uq_products_store_name;
DROP INDEX IF EXISTS public.uq_products_store_lower_name;
CREATE UNIQUE INDEX uq_products_store_lower_name 
ON public.products (store_id, lower(name)) 
WHERE (archived_at IS NULL);

-- 6. Validación de teléfono en suppliers (contact_phone)
ALTER TABLE public.suppliers
    DROP CONSTRAINT IF EXISTS chk_suppliers_contact_phone_pe;

ALTER TABLE public.suppliers
    ADD CONSTRAINT chk_suppliers_contact_phone_pe
    CHECK (contact_phone IS NULL OR contact_phone ~ '^9[0-9]{8}$');

-- 7. Redefinición y comentario en método de pago 'qr'
COMMENT ON COLUMN public.sales.payment_method IS 
'Método de cobro: efectivo, tarjeta, yape, plin, transferencia o qr (QR del comercio).';

-- 8. Actualizar permisos de UPDATE en products para authenticated
REVOKE UPDATE ON public.products FROM authenticated;
GRANT UPDATE (
    name, barcode, sku, unit, cost_price, sale_price, stock, 
    reorder_point, estimated_speed, image_url, category_id, archived_at
) ON public.products TO authenticated;

COMMIT;
-- ROLLBACK;
