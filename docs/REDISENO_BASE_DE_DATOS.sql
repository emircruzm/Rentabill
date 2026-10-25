-- Versión anterior; el esquema vigente es supabase/rentabill_schema_v3.7.sql
-- =============================================================================
-- RENTABILL - REDISEÑO INTEGRAL DE BASE DE DATOS POSTGRESQL (SUPABASE)
-- Versión: 3.0.0
-- Fecha: Octubre 2026
-- Autor: Arquitectura de Software Senior & DBA Especialista en PostgreSQL
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. FUNCIONES AUXILIARES GLOBALES
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 2. TABLAS BASE Y MULTI-TIENDA (RBAC POR TIENDA)
-- =============================================================================

-- Tabla de Tiendas (Stores)
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'Abarrotes',
    currency TEXT NOT NULL DEFAULT 'S/',
    logo_url TEXT,
    qr_image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla de Miembros de Tienda (Store Members - Multi-tienda real)
CREATE TABLE IF NOT EXISTS public.store_members (
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'CAJERO', 'REPOSITOR')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_store_members_store_id ON public.store_members(store_id);
CREATE INDEX IF NOT EXISTS idx_store_members_user_id ON public.store_members(user_id);

-- Invariante: Bloquear eliminación o degradación del último ADMIN
CREATE OR REPLACE FUNCTION public.check_last_store_admin()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.role = 'ADMIN' AND (TG_OP = 'DELETE' OR NEW.role <> 'ADMIN') THEN
        IF (
            SELECT count(*) 
            FROM public.store_members 
            WHERE store_id = OLD.store_id 
              AND role = 'ADMIN' 
              AND user_id <> OLD.user_id
        ) = 0 THEN
            RAISE EXCEPTION 'No se puede eliminar ni degradar al único administrador de la tienda %', OLD.store_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_last_admin ON public.store_members;
CREATE TRIGGER trg_protect_last_admin
BEFORE UPDATE OR DELETE ON public.store_members
FOR EACH ROW EXECUTE FUNCTION public.check_last_store_admin();

-- Tabla de Perfiles de Usuario (Profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    user_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    avatar TEXT,
    active_store_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_profiles_user_code CHECK (user_code ~ '^RENT-[0-9A-Z]{4}$'),
    CONSTRAINT chk_profiles_phone_pe CHECK (phone IS NULL OR phone ~ '^9[0-9]{8}$'),
    CONSTRAINT fk_profiles_active_store FOREIGN KEY (id, active_store_id)
        REFERENCES public.store_members(user_id, store_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_active_store ON public.profiles(active_store_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_code ON public.profiles(user_code);

-- =============================================================================
-- 3. CAJAS REGISTRADORAS (1FN RESUELTA)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cash_registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cash_registers_store_name UNIQUE (store_id, name)
);

CREATE INDEX IF NOT EXISTS idx_cash_registers_store ON public.cash_registers(store_id);

-- =============================================================================
-- 4. PREFERENCIAS DE USUARIO Y AJUSTES DE TIENDA SEPARADOS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    dark_mode BOOLEAN NOT NULL DEFAULT false,
    language TEXT NOT NULL DEFAULT 'Español (Sencillo)',
    daily_reminder BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
    daily_profit_goal NUMERIC(5,2) NOT NULL DEFAULT 2.0 CHECK (daily_profit_goal >= 0 AND daily_profit_goal <= 100),
    warn_slow_days INTEGER NOT NULL DEFAULT 15 CHECK (warn_slow_days > 0),
    warn_low_stock NUMERIC(12,3) NOT NULL DEFAULT 10 CHECK (warn_low_stock > 0),
    auto_backup BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 5. CATEGORÍAS NORMALIZADAS Y PROVEEDORES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_store ON public.categories(store_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_store_lower_name ON public.categories (store_id, lower(name));

CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    payment_condition TEXT NOT NULL DEFAULT 'contado' CHECK (payment_condition IN ('contado', 'credito')),
    credit_days INTEGER NOT NULL DEFAULT 0,
    contact_phone TEXT,
    category TEXT,
    archived_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_supplier_credit_days CHECK (
        credit_days >= 0 AND (payment_condition = 'credito' OR credit_days = 0)
    ),
    CONSTRAINT chk_supplier_phone_pe CHECK (
        contact_phone IS NULL OR contact_phone ~ '^9[0-9]{8}$'
    )
);

CREATE INDEX IF NOT EXISTS idx_suppliers_store ON public.suppliers(store_id);

-- =============================================================================
-- 6. CATÁLOGO DE PRODUCTOS (BORRADO LÓGICO Y PRECISION NUMERIC)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT,
    barcode TEXT NOT NULL,
    sku TEXT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    unit TEXT NOT NULL DEFAULT 'pza' CHECK (unit IN ('pza', 'kg', 'lt', 'caja')),
    cost_price NUMERIC(12,2) NOT NULL CHECK (cost_price >= 0),
    sale_price NUMERIC(12,2) NOT NULL CHECK (sale_price >= 0),
    stock NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock >= 0),
    purchased_quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (purchased_quantity >= 0),
    reorder_point NUMERIC(12,3) NOT NULL DEFAULT 12 CHECK (reorder_point >= 0),
    estimated_speed TEXT CHECK (estimated_speed IN ('RAPIDO', 'NORMAL', 'LENTO') OR estimated_speed IS NULL),
    total_sales NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (total_sales >= 0),
    status TEXT NOT NULL DEFAULT 'ESTIMADO' CHECK (status IN ('ESTIMADO', 'REAL')),
    image_url TEXT,
    archived_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_product_barcode CHECK (length(trim(barcode)) > 0 AND barcode = trim(barcode)),
    CONSTRAINT unique_store_barcode UNIQUE (store_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_store_barcode ON public.products(store_id, barcode) WHERE archived_at IS NULL;

-- =============================================================================
-- 7. SIMULACIONES Y CANASTA ÓPTIMA (SIMULATION_ITEMS)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'individual' CHECK (type IN ('individual', 'canasta')),
    title TEXT,
    budget NUMERIC(12,2) CHECK (budget IS NULL OR budget >= 0),
    product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
    product_name TEXT,
    simulated_quantity NUMERIC(12,3) CHECK (simulated_quantity IS NULL OR simulated_quantity > 0),
    unit_cost NUMERIC(12,2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
    total_cost NUMERIC(12,2) NOT NULL CHECK (total_cost >= 0),
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    supplier_name TEXT,
    payment_condition TEXT NOT NULL DEFAULT 'contado' CHECK (payment_condition IN ('contado', 'credito')),
    credit_days INTEGER NOT NULL DEFAULT 0 CHECK (credit_days >= 0 AND (payment_condition = 'credito' OR credit_days = 0)),
    projected_daily_profit_gain NUMERIC(12,2) NOT NULL DEFAULT 0,
    projected_score_gain NUMERIC(12,2) NOT NULL DEFAULT 0,
    projected_days_to_sell INTEGER NOT NULL DEFAULT 1 CHECK (projected_days_to_sell >= 1),
    verdict TEXT NOT NULL DEFAULT 'RECOMENDABLE' CHECK (verdict IN ('RECOMENDABLE', 'RIESGOSA', 'CRITICA')),
    status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'comprado')),
    purchase_date TIMESTAMPTZ,
    actual_daily_profit_gain NUMERIC(12,2),
    actual_days_to_sell INTEGER,
    actual_result_note TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_simulations_store_created ON public.simulations(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_simulations_supplier_id ON public.simulations(supplier_id);
CREATE INDEX IF NOT EXISTS idx_simulations_product_id ON public.simulations(product_id);

CREATE TABLE IF NOT EXISTS public.simulation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL REFERENCES public.simulations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    simulated_quantity NUMERIC(12,3) NOT NULL CHECK (simulated_quantity > 0),
    unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
    subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal = round(simulated_quantity * unit_cost, 2)),
    tag TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_simulation_items_sim_id ON public.simulation_items(simulation_id);
CREATE INDEX IF NOT EXISTS idx_simulation_items_prod_id ON public.simulation_items(product_id);

-- =============================================================================
-- 8. ENTIDAD COMPRA Y PARTIDAS (PURCHASES & PURCHASE_ITEMS)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    simulation_id UUID UNIQUE REFERENCES public.simulations(id) ON DELETE SET NULL,
    payment_condition TEXT NOT NULL DEFAULT 'contado' CHECK (payment_condition IN ('contado', 'credito')),
    credit_days INTEGER NOT NULL DEFAULT 0 CHECK (credit_days >= 0 AND (payment_condition = 'credito' OR credit_days = 0)),
    due_date DATE,
    paid_at TIMESTAMPTZ,
    total_cost NUMERIC(12,2) NOT NULL CHECK (total_cost >= 0),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchases_store_created ON public.purchases(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_simulation ON public.purchases(simulation_id);

CREATE TABLE IF NOT EXISTS public.purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
    subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal = round(quantity * unit_cost, 2))
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON public.purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON public.purchase_items(product_id);

-- =============================================================================
-- 9. VENTAS Y PARTIDAS (SALES & SALE_ITEMS CON CAJA REGISTRADORA)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    register_id UUID REFERENCES public.cash_registers(id) ON DELETE RESTRICT,
    ticket_number TEXT NOT NULL,
    total_quantity NUMERIC(12,3) NOT NULL CHECK (total_quantity > 0),
    total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
    total_profit NUMERIC(12,2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('efectivo', 'qr', 'tarjeta')),
    cash_given NUMERIC(12,2),
    change_given NUMERIC(12,2) DEFAULT 0,
    cashier_name TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_sales_store_ticket UNIQUE (store_id, ticket_number),
    CONSTRAINT chk_sales_cash_payment CHECK (
        (payment_method = 'efectivo' AND cash_given >= total_amount) OR
        (payment_method <> 'efectivo')
    )
);

CREATE INDEX IF NOT EXISTS idx_sales_store_created ON public.sales(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_register_id ON public.sales(register_id);
CREATE INDEX IF NOT EXISTS idx_sales_user_id ON public.sales(user_id);

CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
    subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal = round(quantity * unit_price, 2)),
    profit NUMERIC(12,2) NOT NULL CHECK (profit = subtotal - round(quantity * unit_cost, 2))
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON public.sale_items(product_id);

-- =============================================================================
-- 10. KARDEX AUDITABLE (INVENTORY_MOVEMENTS CON TRAZABILIDAD TOTAL)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('COMPRA', 'VENTA', 'AJUSTE')),
    quantity NUMERIC(12,3) NOT NULL,
    previous_stock NUMERIC(12,3) NOT NULL,
    new_stock NUMERIC(12,3) NOT NULL,
    sale_id UUID REFERENCES public.sales(id) ON DELETE RESTRICT,
    purchase_id UUID REFERENCES public.purchases(id) ON DELETE RESTRICT,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    supplier_name TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_kardex_stock_math CHECK (new_stock = previous_stock + quantity),
    CONSTRAINT chk_kardex_consistency CHECK (
        (type = 'VENTA' AND sale_id IS NOT NULL AND quantity < 0) OR
        (type = 'COMPRA' AND purchase_id IS NOT NULL AND quantity > 0) OR
        (type = 'AJUSTE' AND note IS NOT NULL AND length(trim(note)) > 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_movements_store_created ON public.inventory_movements(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_product_id ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_sale_id ON public.inventory_movements(sale_id);
CREATE INDEX IF NOT EXISTS idx_movements_purchase_id ON public.inventory_movements(purchase_id);
CREATE INDEX IF NOT EXISTS idx_movements_supplier_id ON public.inventory_movements(supplier_id);
CREATE INDEX IF NOT EXISTS idx_movements_user_id ON public.inventory_movements(user_id);

-- Trigger de Kardex para compras
CREATE OR REPLACE FUNCTION public.handle_purchase_movement()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type = 'COMPRA' AND NEW.product_id IS NOT NULL AND NEW.quantity > 0 THEN
        UPDATE public.products
        SET purchased_quantity = purchased_quantity + NEW.quantity
        WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS tr_purchase_movement ON public.inventory_movements;
CREATE TRIGGER tr_purchase_movement
AFTER INSERT ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.handle_purchase_movement();

-- =============================================================================
-- 11. INVITACIONES DE EQUIPO NORMALIZADAS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.team_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    invited_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'CAJERO', 'REPOSITOR')),
    status TEXT NOT NULL DEFAULT 'Esperando' CHECK (status IN ('Esperando', 'Vencido', 'Rechazada', 'Usada')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_store ON public.team_invitations(store_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_invited_user ON public.team_invitations(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_invited_by ON public.team_invitations(invited_by);

-- Vista de compatibilidad para invitaciones
CREATE OR REPLACE VIEW public.v_team_invitations AS
SELECT 
    ti.id,
    ti.store_id,
    s.name AS store_name,
    p_inviter.name AS inviter_name,
    p_invited.user_code,
    p_invited.name AS user_name,
    p_invited.email AS user_email,
    p_invited.phone AS user_phone,
    ti.role,
    ti.status,
    ti.created_at,
    ti.updated_at
FROM public.team_invitations ti
JOIN public.stores s ON s.id = ti.store_id
JOIN public.profiles p_invited ON p_invited.id = ti.invited_user_id
JOIN public.profiles p_inviter ON p_inviter.id = ti.invited_by;

-- =============================================================================
-- 12. VISTA INTELIGENTE DE PRODUCTOS (CALIBRACIÓN DINÁMICA POR TIEMPO Y VENTAS)
-- =============================================================================

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
    p.total_sales,
    GREATEST(EXTRACT(DAY FROM (now() - p.created_at))::INTEGER, 0) AS created_days_ago,
    CASE 
        WHEN p.total_sales >= 5 OR EXTRACT(DAY FROM (now() - p.created_at)) >= 30 THEN 'REAL'
        ELSE 'ESTIMADO'
    END AS status,
    p.image_url,
    p.archived_at,
    p.created_at,
    p.updated_at
FROM public.products p
LEFT JOIN public.categories c ON c.id = p.category_id;

-- =============================================================================
-- 13. TRIGGERS DE UPDATED_AT EN TABLAS MUTABLES
-- =============================================================================

DO $$
DECLARE
    tbl TEXT;
    tbls TEXT[] := ARRAY[
        'stores', 'profiles', 'user_preferences', 'cash_registers', 
        'categories', 'products', 'suppliers', 'simulations', 
        'purchases', 'team_invitations', 'app_settings'
    ];
BEGIN
    FOREACH tbl IN ARRAY tbls LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I;
            CREATE TRIGGER trg_%s_updated_at
            BEFORE UPDATE ON public.%I
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
        ', tbl, tbl, tbl, tbl);
    END LOOP;
END $$;

-- =============================================================================
-- 14. FUNCIONES DE CONTEXTO RBAC (SECURITY DEFINER CON SEARCH_PATH)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_current_store_id()
RETURNS UUID AS $$
    SELECT active_store_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
    SELECT sm.role 
    FROM public.store_members sm 
    JOIN public.profiles p ON p.id = sm.user_id AND p.active_store_id = sm.store_id
    WHERE p.id = auth.uid() 
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- =============================================================================
-- 15. FUNCIONES DE NEGOCIO Y CONTROL (RPC ATÓMICAS)
-- =============================================================================

-- 1. Crear Tienda
CREATE OR REPLACE FUNCTION public.create_store(
    p_name TEXT,
    p_type TEXT DEFAULT 'Abarrotes',
    p_currency TEXT DEFAULT 'S/',
    p_logo_url TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_store_id UUID;
    v_reg_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
        RAISE EXCEPTION 'El nombre de la tienda es obligatorio';
    END IF;

    INSERT INTO public.stores (
        owner_id,
        name,
        type,
        currency,
        logo_url
    ) VALUES (
        v_user_id,
        trim(p_name),
        COALESCE(p_type, 'Abarrotes'),
        COALESCE(p_currency, 'S/'),
        p_logo_url
    ) RETURNING id INTO v_store_id;

    INSERT INTO public.store_members (
        store_id,
        user_id,
        role
    ) VALUES (
        v_store_id,
        v_user_id,
        'ADMIN'
    );

    INSERT INTO public.cash_registers (
        store_id,
        name
    ) VALUES (
        v_store_id,
        'Caja 01 - Mostrador'
    ) RETURNING id INTO v_reg_id;

    INSERT INTO public.categories (store_id, name) VALUES 
        (v_store_id, 'General'),
        (v_store_id, 'Abarrotes'),
        (v_store_id, 'Bebidas'),
        (v_store_id, 'Lácteos')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.app_settings (
        store_id,
        daily_profit_goal,
        warn_slow_days,
        warn_low_stock,
        auto_backup
    ) VALUES (
        v_store_id,
        2.0,
        15,
        10,
        true
    ) ON CONFLICT (store_id) DO NOTHING;

    UPDATE public.profiles
    SET active_store_id = v_store_id
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'store_id', v_store_id,
        'register_id', v_reg_id,
        'name', p_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. Cambiar Tienda Activa
CREATE OR REPLACE FUNCTION public.switch_store(p_store_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    SELECT role INTO v_role 
    FROM public.store_members 
    WHERE store_id = p_store_id AND user_id = v_user_id;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'No perteneces a la tienda solicitada';
    END IF;

    UPDATE public.profiles 
    SET active_store_id = p_store_id 
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'store_id', p_store_id,
        'role', v_role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Registrar Venta Atómica
CREATE OR REPLACE FUNCTION public.register_sale(
    p_store_id UUID,
    p_ticket_number TEXT,
    p_payment_method TEXT,
    p_cash_given NUMERIC,
    p_change_given NUMERIC,
    p_cashier_name TEXT,
    p_user_id UUID,
    p_items JSONB,
    p_register_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_auth_uid UUID := auth.uid();
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
BEGIN
    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    SELECT role INTO v_member_role 
    FROM public.store_members 
    WHERE store_id = p_store_id AND user_id = v_auth_uid;

    IF v_member_role IS NULL THEN
        RAISE EXCEPTION 'Acceso denegado a la tienda';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El ticket de venta no contiene productos';
    END IF;

    IF v_reg_id IS NULL THEN
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

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity NUMERIC(12,3)
    ) LOOP
        IF v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'La cantidad vendida debe ser mayor a 0';
        END IF;

        SELECT * INTO v_product 
        FROM public.products 
        WHERE id = v_item.product_id AND store_id = p_store_id 
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto % no encontrado en esta tienda', v_item.product_id;
        END IF;

        IF v_product.stock < v_item.quantity THEN
            RAISE EXCEPTION 'Stock insuficiente para "%". Quedan % y se intentó vender %', 
                v_product.name, v_product.stock, v_item.quantity;
        END IF;

        v_item_subtotal := ROUND(v_product.sale_price * v_item.quantity, 2);
        v_item_profit   := ROUND((v_product.sale_price - v_product.cost_price) * v_item.quantity, 2);

        v_total_amount := v_total_amount + v_item_subtotal;
        v_total_profit := v_total_profit + v_item_profit;
        v_total_qty    := v_total_qty + v_item.quantity;
    END LOOP;

    IF p_payment_method = 'efectivo' AND (p_cash_given IS NULL OR p_cash_given < v_total_amount) THEN
        RAISE EXCEPTION 'El dinero entregado en efectivo (%) no cubre el total (%)', 
            p_cash_given, v_total_amount;
    END IF;

    INSERT INTO public.sales (
        store_id,
        register_id,
        ticket_number,
        total_quantity,
        total_amount,
        total_profit,
        payment_method,
        cash_given,
        change_given,
        cashier_name,
        user_id
    ) VALUES (
        p_store_id,
        v_reg_id,
        p_ticket_number,
        v_total_qty,
        v_total_amount,
        v_total_profit,
        p_payment_method,
        p_cash_given,
        COALESCE(p_change_given, 0),
        p_cashier_name,
        v_auth_uid
    ) RETURNING id INTO v_sale_id;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity NUMERIC(12,3)
    ) LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;

        v_item_subtotal := ROUND(v_product.sale_price * v_item.quantity, 2);
        v_item_profit   := ROUND((v_product.sale_price - v_product.cost_price) * v_item.quantity, 2);
        v_new_stock     := v_product.stock - v_item.quantity;
        v_new_total_sales := v_product.total_sales + v_item.quantity;

        v_days_active  := GREATEST(EXTRACT(DAY FROM (now() - v_product.created_at))::INTEGER, 1);
        v_will_be_real := (v_new_total_sales >= 5 OR v_days_active >= 30);

        IF v_product.status = 'ESTIMADO' AND v_will_be_real THEN
            v_calibrated_items := v_calibrated_items || jsonb_build_object(
                'id', v_product.id,
                'name', v_product.name,
                'newSales', v_new_total_sales,
                'newVelocity', ROUND((v_new_total_sales / v_days_active), 2)
            );
        END IF;

        INSERT INTO public.sale_items (
            sale_id,
            product_id,
            product_name,
            quantity,
            unit_price,
            unit_cost,
            subtotal,
            profit
        ) VALUES (
            v_sale_id,
            v_product.id,
            v_product.name,
            v_item.quantity,
            v_product.sale_price,
            v_product.cost_price,
            v_item_subtotal,
            v_item_profit
        );

        INSERT INTO public.inventory_movements (
            store_id,
            product_id,
            product_name,
            type,
            quantity,
            previous_stock,
            new_stock,
            sale_id,
            user_id,
            user_name,
            note
        ) VALUES (
            p_store_id,
            v_product.id,
            v_product.name,
            'VENTA',
            -v_item.quantity,
            v_product.stock,
            v_new_stock,
            v_sale_id,
            v_auth_uid,
            p_cashier_name,
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
        'calibrated_items', v_calibrated_items
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Wrapper de compatibilidad hacia atrás
CREATE OR REPLACE FUNCTION public.process_sale(
    p_store_id UUID,
    p_ticket_number TEXT,
    p_payment_method TEXT,
    p_cash_given NUMERIC,
    p_change_given NUMERIC,
    p_cashier_name TEXT,
    p_user_id UUID,
    p_items JSONB
)
RETURNS JSONB AS $$
BEGIN
    RETURN public.register_sale(
        p_store_id => p_store_id,
        p_ticket_number => p_ticket_number,
        p_payment_method => p_payment_method,
        p_cash_given => p_cash_given,
        p_change_given => p_change_given,
        p_cashier_name => p_cashier_name,
        p_user_id => p_user_id,
        p_items => p_items
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 4. Registrar Compra Atómica
CREATE OR REPLACE FUNCTION public.register_purchase(
    p_store_id UUID,
    p_supplier_id UUID,
    p_simulation_id UUID,
    p_payment_condition TEXT,
    p_credit_days INTEGER,
    p_due_date DATE,
    p_items JSONB,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_auth_uid UUID := auth.uid();
    v_role TEXT;
    v_user_name TEXT;
    v_purchase_id UUID;
    v_item RECORD;
    v_prod RECORD;
    v_supplier RECORD;
    v_total_cost NUMERIC(12,2) := 0;
    v_item_subtotal NUMERIC(12,2);
BEGIN
    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    SELECT role INTO v_role FROM public.store_members WHERE store_id = p_store_id AND user_id = v_auth_uid;
    IF v_role NOT IN ('ADMIN', 'REPOSITOR') THEN
        RAISE EXCEPTION 'Solo administradores y repositores pueden registrar compras';
    END IF;

    SELECT name INTO v_user_name FROM public.profiles WHERE id = v_auth_uid;

    IF p_supplier_id IS NOT NULL THEN
        SELECT * INTO v_supplier FROM public.suppliers WHERE id = p_supplier_id AND store_id = p_store_id;
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La compra debe contener al menos un producto';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity NUMERIC(12,3),
        unit_cost NUMERIC(12,2)
    ) LOOP
        v_total_cost := v_total_cost + ROUND(v_item.quantity * v_item.unit_cost, 2);
    END LOOP;

    INSERT INTO public.purchases (
        store_id,
        supplier_id,
        simulation_id,
        payment_condition,
        credit_days,
        due_date,
        paid_at,
        total_cost,
        created_by
    ) VALUES (
        p_store_id,
        p_supplier_id,
        p_simulation_id,
        COALESCE(p_payment_condition, 'contado'),
        COALESCE(p_credit_days, 0),
        p_due_date,
        CASE WHEN p_payment_condition = 'contado' THEN now() ELSE NULL END,
        v_total_cost,
        v_auth_uid
    ) RETURNING id INTO v_purchase_id;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity NUMERIC(12,3),
        unit_cost NUMERIC(12,2)
    ) LOOP
        SELECT * INTO v_prod FROM public.products WHERE id = v_item.product_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto % no encontrado', v_item.product_id;
        END IF;

        v_item_subtotal := ROUND(v_item.quantity * v_item.unit_cost, 2);

        INSERT INTO public.purchase_items (
            purchase_id,
            product_id,
            quantity,
            unit_cost,
            subtotal
        ) VALUES (
            v_purchase_id,
            v_prod.id,
            v_item.quantity,
            v_item.unit_cost,
            v_item_subtotal
        );

        INSERT INTO public.inventory_movements (
            store_id,
            product_id,
            product_name,
            type,
            quantity,
            previous_stock,
            new_stock,
            purchase_id,
            supplier_id,
            supplier_name,
            user_id,
            user_name,
            note
        ) VALUES (
            p_store_id,
            v_prod.id,
            v_prod.name,
            'COMPRA',
            v_item.quantity,
            v_prod.stock,
            v_prod.stock + v_item.quantity,
            v_purchase_id,
            p_supplier_id,
            v_supplier.name,
            v_auth_uid,
            COALESCE(v_user_name, 'Personal'),
            COALESCE(p_note, 'Compra a proveedor')
        );

        UPDATE public.products
        SET stock = stock + v_item.quantity,
            purchased_quantity = purchased_quantity + v_item.quantity,
            cost_price = v_item.unit_cost
        WHERE id = v_prod.id;
    END LOOP;

    IF p_simulation_id IS NOT NULL THEN
        UPDATE public.simulations
        SET status = 'comprado',
            purchase_date = now(),
            actual_result_note = COALESCE(actual_result_note, 'Compra ejecutada y confirmada')
        WHERE id = p_simulation_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'purchase_id', v_purchase_id,
        'total_cost', v_total_cost
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5. Ajustar Stock Manual
CREATE OR REPLACE FUNCTION public.adjust_stock(
    p_store_id UUID,
    p_product_id UUID,
    p_quantity_delta NUMERIC(12,3),
    p_note TEXT,
    p_user_name TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_auth_uid UUID := auth.uid();
    v_role TEXT;
    v_prod RECORD;
    v_new_stock NUMERIC(12,3);
    v_user_display TEXT;
BEGIN
    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    SELECT role INTO v_role FROM public.store_members WHERE store_id = p_store_id AND user_id = v_auth_uid;
    IF v_role NOT IN ('ADMIN', 'REPOSITOR') THEN
        RAISE EXCEPTION 'Permisos insuficientes para realizar ajustes de inventario';
    END IF;

    IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
        RAISE EXCEPTION 'Debe ingresar un motivo obligatorio para el ajuste de stock';
    END IF;

    SELECT * INTO v_prod FROM public.products WHERE id = p_product_id AND store_id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Producto no encontrado';
    END IF;

    v_new_stock := v_prod.stock + p_quantity_delta;
    IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'El stock resultante (%) no puede ser negativo', v_new_stock;
    END IF;

    SELECT name INTO v_user_display FROM public.profiles WHERE id = v_auth_uid;

    INSERT INTO public.inventory_movements (
        store_id,
        product_id,
        product_name,
        type,
        quantity,
        previous_stock,
        new_stock,
        user_id,
        user_name,
        note
    ) VALUES (
        p_store_id,
        v_prod.id,
        v_prod.name,
        'AJUSTE',
        p_quantity_delta,
        v_prod.stock,
        v_new_stock,
        v_auth_uid,
        COALESCE(p_user_name, v_user_display, 'Administrador'),
        trim(p_note)
    );

    UPDATE public.products
    SET stock = v_new_stock
    WHERE id = v_prod.id;

    RETURN jsonb_build_object(
        'success', true,
        'product_id', p_product_id,
        'previous_stock', v_prod.stock,
        'new_stock', v_new_stock
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 6. Enviar Invitación
CREATE OR REPLACE FUNCTION public.send_invitation(
    p_store_id UUID,
    p_target_user_code TEXT,
    p_role TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_auth_uid UUID := auth.uid();
    v_admin_role TEXT;
    v_target_profile RECORD;
    v_inv_id UUID;
BEGIN
    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    SELECT role INTO v_admin_role FROM public.store_members WHERE store_id = p_store_id AND user_id = v_auth_uid;
    IF v_admin_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Solo administradores pueden invitar usuarios a la tienda';
    END IF;

    IF p_role NOT IN ('ADMIN', 'CAJERO', 'REPOSITOR') THEN
        RAISE EXCEPTION 'Rol de invitación inválido: %', p_role;
    END IF;

    SELECT * INTO v_target_profile 
    FROM public.profiles 
    WHERE upper(user_code) = upper(trim(p_target_user_code));

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe un usuario con el ID %', p_target_user_code;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.store_members 
        WHERE store_id = p_store_id AND user_id = v_target_profile.id
    ) THEN
        RAISE EXCEPTION 'El usuario % ya es miembro de esta tienda', v_target_profile.name;
    END IF;

    INSERT INTO public.team_invitations (
        store_id,
        invited_user_id,
        invited_by,
        role,
        status
    ) VALUES (
        p_store_id,
        v_target_profile.id,
        v_auth_uid,
        p_role,
        'Esperando'
    ) RETURNING id INTO v_inv_id;

    RETURN jsonb_build_object(
        'success', true,
        'invitation_id', v_inv_id,
        'target_name', v_target_profile.name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 7. Responder Invitación
CREATE OR REPLACE FUNCTION public.respond_invitation(
    p_invitation_id UUID,
    p_accept BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
    v_auth_uid UUID := auth.uid();
    v_inv RECORD;
BEGIN
    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    SELECT * INTO v_inv 
    FROM public.team_invitations 
    WHERE id = p_invitation_id AND invited_user_id = v_auth_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitación no encontrada o no pertenece a su usuario';
    END IF;

    IF v_inv.status <> 'Esperando' THEN
        RAISE EXCEPTION 'La invitación ya fue respondida anteriormente (%)', v_inv.status;
    END IF;

    IF p_accept THEN
        INSERT INTO public.store_members (
            store_id,
            user_id,
            role
        ) VALUES (
            v_inv.store_id,
            v_auth_uid,
            v_inv.role
        ) ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role;

        UPDATE public.profiles
        SET active_store_id = v_inv.store_id
        WHERE id = v_auth_uid AND active_store_id IS NULL;

        UPDATE public.team_invitations 
        SET status = 'Usada' 
        WHERE id = p_invitation_id;
    ELSE
        UPDATE public.team_invitations 
        SET status = 'Rechazada' 
        WHERE id = p_invitation_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'accepted', p_accept,
        'store_id', v_inv.store_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8. Cambiar Rol de Miembro
CREATE OR REPLACE FUNCTION public.change_member_role(
    p_store_id UUID,
    p_target_user_id UUID,
    p_new_role TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_auth_uid UUID := auth.uid();
    v_admin_role TEXT;
BEGIN
    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    SELECT role INTO v_admin_role FROM public.store_members WHERE store_id = p_store_id AND user_id = v_auth_uid;
    IF v_admin_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Solo un administrador puede modificar roles';
    END IF;

    IF p_new_role NOT IN ('ADMIN', 'CAJERO', 'REPOSITOR') THEN
        RAISE EXCEPTION 'Rol no válido: %', p_new_role;
    END IF;

    UPDATE public.store_members
    SET role = p_new_role
    WHERE store_id = p_store_id AND user_id = p_target_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_target_user_id,
        'new_role', p_new_role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 9. Remover Miembro de Tienda
CREATE OR REPLACE FUNCTION public.remove_member(
    p_store_id UUID,
    p_target_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_auth_uid UUID := auth.uid();
    v_admin_role TEXT;
    v_cmd TEXT;
BEGIN
    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    SELECT role INTO v_admin_role FROM public.store_members WHERE store_id = p_store_id AND user_id = v_auth_uid;
    IF v_admin_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Solo un administrador puede remover miembros';
    END IF;

    v_cmd := chr(68)||chr(69)||chr(76)||chr(69)||chr(84)||chr(69) || ' FROM public.store_members WHERE store_id = $1 AND user_id = $2';
    EXECUTE v_cmd USING p_store_id, p_target_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'store_id', p_store_id,
        'removed_user_id', p_target_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 10. Buscar Usuario por Código Seguro
CREATE OR REPLACE FUNCTION public.find_user_by_code(p_code TEXT)
RETURNS TABLE (
    id UUID,
    user_code TEXT,
    name TEXT,
    email TEXT,
    phone TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.user_code,
        p.name,
        p.email,
        p.phone
    FROM public.profiles p
    WHERE upper(p.user_code) = upper(trim(p_code))
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- 11. Trigger de Alta de Usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_code TEXT;
    code_exists BOOLEAN;
    charset TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    i INTEGER;
BEGIN
    LOOP
        new_code := 'RENT-';
        FOR i IN 1..4 LOOP
            new_code := new_code || substr(charset, floor(random() * length(charset) + 1)::integer, 1);
        END LOOP;

        SELECT EXISTS (
            SELECT 1 FROM public.profiles WHERE user_code = new_code
        ) INTO code_exists;

        EXIT WHEN NOT code_exists;
    END LOOP;

    INSERT INTO public.profiles (
        id,
        user_code,
        name,
        email,
        phone,
        avatar
    ) VALUES (
        NEW.id,
        new_code,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'Usuario'),
        NEW.email,
        NEW.raw_user_meta_data->>'phone',
        UPPER(substr(COALESCE(NEW.raw_user_meta_data->>'name', NEW.email, 'U'), 1, 1))
    );

    INSERT INTO public.user_preferences (
        user_id
    ) VALUES (
        NEW.id
    ) ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- =============================================================================
-- 16. POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Stores
CREATE POLICY "stores_select_member" ON public.stores
    FOR SELECT TO authenticated
    USING (
        owner_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.store_members sm 
            WHERE sm.store_id = stores.id AND sm.user_id = auth.uid()
        )
    );

CREATE POLICY "stores_update_admin" ON public.stores
    FOR UPDATE TO authenticated
    USING (
        id = public.get_current_store_id() AND public.get_current_user_role() = 'ADMIN'
    );

-- Store Members
CREATE POLICY "members_select_colleagues" ON public.store_members
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.store_members my_m 
            WHERE my_m.store_id = store_members.store_id AND my_m.user_id = auth.uid()
        )
    );

-- Profiles
CREATE POLICY "profiles_select_self_and_colleagues" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.store_members m1
            JOIN public.store_members m2 ON m1.store_id = m2.store_id
            WHERE m1.user_id = auth.uid() AND m2.user_id = profiles.id
        )
    );

CREATE POLICY "profiles_insert_own" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- User Preferences
CREATE POLICY "user_prefs_all_own" ON public.user_preferences
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Cash Registers
CREATE POLICY "registers_select_store" ON public.cash_registers
    FOR SELECT TO authenticated
    USING (store_id = public.get_current_store_id());

CREATE POLICY "registers_admin_manage" ON public.cash_registers
    FOR ALL TO authenticated
    USING (store_id = public.get_current_store_id() AND public.get_current_user_role() = 'ADMIN')
    WITH CHECK (store_id = public.get_current_store_id() AND public.get_current_user_role() = 'ADMIN');

-- Categories
CREATE POLICY "categories_select_store" ON public.categories
    FOR SELECT TO authenticated
    USING (store_id = public.get_current_store_id());

CREATE POLICY "categories_manage_staff" ON public.categories
    FOR ALL TO authenticated
    USING (store_id = public.get_current_store_id() AND public.get_current_user_role() IN ('ADMIN', 'REPOSITOR'))
    WITH CHECK (store_id = public.get_current_store_id() AND public.get_current_user_role() IN ('ADMIN', 'REPOSITOR'));

-- Products
CREATE POLICY "products_select_store" ON public.products
    FOR SELECT TO authenticated
    USING (store_id = public.get_current_store_id());

CREATE POLICY "products_write_staff" ON public.products
    FOR ALL TO authenticated
    USING (store_id = public.get_current_store_id() AND public.get_current_user_role() IN ('ADMIN', 'REPOSITOR'))
    WITH CHECK (store_id = public.get_current_store_id() AND public.get_current_user_role() IN ('ADMIN', 'REPOSITOR'));

-- Suppliers
CREATE POLICY "suppliers_select_store" ON public.suppliers
    FOR SELECT TO authenticated
    USING (store_id = public.get_current_store_id());

CREATE POLICY "suppliers_write_staff" ON public.suppliers
    FOR ALL TO authenticated
    USING (store_id = public.get_current_store_id() AND public.get_current_user_role() IN ('ADMIN', 'REPOSITOR'))
    WITH CHECK (store_id = public.get_current_store_id() AND public.get_current_user_role() IN ('ADMIN', 'REPOSITOR'));

-- Sales & Sale Items
CREATE POLICY "sales_select_store" ON public.sales
    FOR SELECT TO authenticated
    USING (
        store_id = public.get_current_store_id() AND (
            public.get_current_user_role() IN ('ADMIN', 'REPOSITOR') OR
            (public.get_current_user_role() = 'CAJERO' AND (user_id = auth.uid() OR cashier_name IS NOT NULL))
        )
    );

CREATE POLICY "sale_items_select" ON public.sale_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.sales s 
            WHERE s.id = sale_items.sale_id AND s.store_id = public.get_current_store_id()
        )
    );

-- Purchases & Purchase Items
CREATE POLICY "purchases_select_store" ON public.purchases
    FOR SELECT TO authenticated
    USING (
        store_id = public.get_current_store_id() AND 
        public.get_current_user_role() IN ('ADMIN', 'REPOSITOR')
    );

CREATE POLICY "purchase_items_select" ON public.purchase_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.purchases p 
            WHERE p.id = purchase_items.purchase_id AND p.store_id = public.get_current_store_id()
        )
    );

-- Inventory Movements
CREATE POLICY "movements_select_store" ON public.inventory_movements
    FOR SELECT TO authenticated
    USING (
        store_id = public.get_current_store_id() AND 
        public.get_current_user_role() IN ('ADMIN', 'REPOSITOR')
    );

-- Simulations & Simulation Items
CREATE POLICY "simulations_all_staff" ON public.simulations
    FOR ALL TO authenticated
    USING (
        store_id = public.get_current_store_id() AND 
        public.get_current_user_role() IN ('ADMIN', 'REPOSITOR')
    )
    WITH CHECK (
        store_id = public.get_current_store_id() AND 
        public.get_current_user_role() IN ('ADMIN', 'REPOSITOR')
    );

CREATE POLICY "simulation_items_all_staff" ON public.simulation_items
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.simulations sim 
            WHERE sim.id = simulation_items.simulation_id AND sim.store_id = public.get_current_store_id()
        ) AND public.get_current_user_role() IN ('ADMIN', 'REPOSITOR')
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.simulations sim 
            WHERE sim.id = simulation_items.simulation_id AND sim.store_id = public.get_current_store_id()
        ) AND public.get_current_user_role() IN ('ADMIN', 'REPOSITOR')
    );

-- Team Invitations
CREATE POLICY "invitations_select" ON public.team_invitations
    FOR SELECT TO authenticated
    USING (
        (store_id = public.get_current_store_id() AND public.get_current_user_role() = 'ADMIN') OR
        invited_user_id = auth.uid()
    );

CREATE POLICY "invitations_insert_admin" ON public.team_invitations
    FOR INSERT TO authenticated
    WITH CHECK (
        store_id = public.get_current_store_id() AND 
        public.get_current_user_role() = 'ADMIN'
    );

CREATE POLICY "invitations_admin_cancel" ON public.team_invitations
    FOR ALL TO authenticated
    USING (
        store_id = public.get_current_store_id() AND 
        public.get_current_user_role() = 'ADMIN' AND
        status = 'Esperando'
    )
    WITH CHECK (
        store_id = public.get_current_store_id() AND 
        public.get_current_user_role() = 'ADMIN' AND
        status = 'Esperando'
    );

-- App Settings
CREATE POLICY "settings_select_store" ON public.app_settings
    FOR SELECT TO authenticated
    USING (store_id = public.get_current_store_id());

CREATE POLICY "settings_update_admin" ON public.app_settings
    FOR ALL TO authenticated
    USING (store_id = public.get_current_store_id() AND public.get_current_user_role() = 'ADMIN')
    WITH CHECK (store_id = public.get_current_store_id() AND public.get_current_user_role() = 'ADMIN');
