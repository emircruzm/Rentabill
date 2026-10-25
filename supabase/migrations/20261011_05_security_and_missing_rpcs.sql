-- Versión anterior; el esquema vigente es supabase/rentabill_schema_v3.7.sql
BEGIN;

-- ==============================================================================
-- 1. ALTA DE TIENDA: RPC create_store (A1)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.create_store(
    name TEXT,
    type TEXT DEFAULT 'Abarrotes',
    currency TEXT DEFAULT 'PEN'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_store_id UUID;
    v_currency TEXT := COALESCE(NULLIF(trim(currency), ''), 'PEN');
    v_type TEXT := COALESCE(NULLIF(trim(type), ''), 'Abarrotes');
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    IF name IS NULL OR trim(name) = '' THEN
        RAISE EXCEPTION 'El nombre de la tienda es obligatorio' USING ERRCODE = '22023';
    END IF;

    -- Normalizar moneda a 3 letras mayúsculas si viene con 'S/' o '$'
    IF v_currency = 'S/' OR v_currency = 'PEN' THEN
        v_currency := 'PEN';
    ELSIF v_currency = '$' OR v_currency = 'USD' THEN
        v_currency := 'USD';
    ELSIF length(v_currency) <> 3 THEN
        v_currency := 'PEN';
    END IF;

    -- 1. Insertar la tienda con owner_id = auth.uid()
    INSERT INTO public.stores (
        name, type, currency, owner_id
    ) VALUES (
        trim(name), v_type, v_currency, v_uid
    ) RETURNING id INTO v_store_id;

    -- 2. Insertar membresía ADMIN del dueño
    INSERT INTO public.store_members (
        store_id, user_id, role, joined_at
    ) VALUES (
        v_store_id, v_uid, 'ADMIN', now()
    ) ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'ADMIN';

    -- 3. Insertar configuración por defecto en store_settings
    INSERT INTO public.store_settings (
        store_id, daily_goal, warn_slow_days, warn_low_stock, auto_backup
    ) VALUES (
        v_store_id, 0, 15, 5, true
    ) ON CONFLICT (store_id) DO NOTHING;

    -- 4. Crear caja por defecto 'Caja 01 - Mostrador'
    INSERT INTO public.cash_registers (
        store_id, name, is_active
    ) VALUES (
        v_store_id, 'Caja 01 - Mostrador', true
    ) ON CONFLICT (store_id, name) DO NOTHING;

    -- 5. Crear categoría inicial 'General'
    INSERT INTO public.categories (
        store_id, name
    ) VALUES (
        v_store_id, 'General'
    ) ON CONFLICT (store_id, lower(name)) DO NOTHING;

    -- 6. Actualizar active_store_id del perfil si es nulo
    UPDATE public.profiles
    SET active_store_id = v_store_id
    WHERE id = v_uid AND active_store_id IS NULL;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_store_id,
        'store_id', v_store_id,
        'name', trim(name)
    );
END;
$function$;

-- Quitar stores_insert directo para forzar alta vía create_store (A1)
DROP POLICY IF EXISTS stores_insert ON public.stores;

-- ==============================================================================
-- 2. AJUSTE DE accept_invitation (A2)
-- Exige lower(auth.jwt()->>'email') = lower(v_inv.email)
-- Si está vencida, UPDATE a EXPIRADA y RETURN {success:false, error:'expirada'}
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.accept_invitation(
    p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_user_email TEXT;
    v_jwt_email TEXT;
    v_inv RECORD;
    v_store RECORD;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    -- Extraer email desde el JWT de autenticación
    v_jwt_email := lower(auth.jwt() ->> 'email');

    -- Buscar invitación pendiente por token
    SELECT * INTO v_inv
    FROM public.store_invitations
    WHERE token = trim(p_token)
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_encontrada');
    END IF;

    IF v_inv.status <> 'PENDIENTE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_pendiente', 'status', v_inv.status);
    END IF;

    -- Verificar si está expirada por tiempo: persistir actualización sin lanzar excepción
    IF v_inv.expires_at < now() THEN
        UPDATE public.store_invitations 
        SET status = 'EXPIRADA' 
        WHERE id = v_inv.id;

        RETURN jsonb_build_object('success', false, 'error', 'expirada');
    END IF;

    -- Validar coincidencia de email si el JWT contiene email
    IF v_jwt_email IS NOT NULL AND lower(v_inv.email) <> v_jwt_email THEN
        RAISE EXCEPTION 'Esta invitación está dirigida a otro correo electrónico' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_store 
    FROM public.stores 
    WHERE id = v_inv.store_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'tienda_inexistente');
    END IF;

    -- Registrar la membresía
    INSERT INTO public.store_members (
        store_id, user_id, role, joined_at
    ) VALUES (
        v_inv.store_id, v_uid, v_inv.role, now()
    )
    ON CONFLICT (user_id, store_id) 
    DO UPDATE SET role = EXCLUDED.role;

    -- Asignar active_store_id si no tenía una
    UPDATE public.profiles
    SET active_store_id = COALESCE(active_store_id, v_inv.store_id)
    WHERE id = v_uid;

    -- Marcar como ACEPTADA
    UPDATE public.store_invitations
    SET status = 'ACEPTADA',
        accepted_at = now()
    WHERE id = v_inv.id;

    RETURN jsonb_build_object(
        'success', true,
        'store_id', v_inv.store_id,
        'store_name', v_store.name,
        'role', v_inv.role
    );
END;
$function$;

-- ==============================================================================
-- 3. PROFILES: TRIGGER SYNC EMAIL, PERMISOS, POLÍTICAS Y find_profile_by_code (A3)
-- ==============================================================================
-- Sincronización automática de email desde auth.users
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.profiles
    SET email = NEW.email,
        updated_at = now()
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_email ON auth.users;
CREATE TRIGGER trg_sync_profile_email
AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

-- Restringir GRANT UPDATE en profiles exclusivamente a columnas seguras
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (name, phone, avatar, active_store_id) ON public.profiles TO authenticated;

-- Modificar profiles_select: ver el propio perfil o perfiles de miembros en tiendas en común
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
    USING (
        id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 
            FROM public.store_members sm1
            JOIN public.store_members sm2 ON sm1.store_id = sm2.store_id
            WHERE sm1.user_id = (SELECT auth.uid())
              AND sm2.user_id = public.profiles.id
        )
    );

-- RPC find_profile_by_code: devuelve solo id, name, user_code para invitar de forma segura
CREATE OR REPLACE FUNCTION public.find_profile_by_code(user_code TEXT)
RETURNS TABLE (
    id UUID,
    name TEXT,
    user_code TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
    SELECT p.id, p.name, p.user_code
    FROM public.profiles p
    WHERE upper(p.user_code) = upper(trim(user_code))
    LIMIT 1;
$$;

-- Cambiar invitations_select para autorizar por auth.jwt()->>'email'
DROP POLICY IF EXISTS invitations_select ON public.store_invitations;
CREATE POLICY invitations_select ON public.store_invitations FOR SELECT TO authenticated
    USING (
        public.has_store_role(store_id, ARRAY['ADMIN'])
        OR lower(email) = lower(auth.jwt() ->> 'email')
    );

-- ==============================================================================
-- 4. PURCHASES Y PURCHASE_ITEMS: ELIMINAR POLÍTICAS INSERT (A4)
-- Solo la función process_purchase escribe en estas tablas
-- ==============================================================================
DROP POLICY IF EXISTS purchases_insert ON public.purchases;
DROP POLICY IF EXISTS purchase_items_insert ON public.purchase_items;

-- ==============================================================================
-- 5. PRIVILEGIOS ANON Y AUTHENTICATED (A5)
-- ==============================================================================
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;

-- ==============================================================================
-- 6. ALTA DE PERFIL AUTOMÁTICA EN AUTH.USERS (A6)
-- Trigger en auth.users que crea profiles con user_code único 'RENT-XXXX'
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_code TEXT;
    v_exists BOOLEAN;
    v_name TEXT;
BEGIN
    -- Generar código único RENT-XXXX
    LOOP
        v_code := 'RENT-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 4));
        SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_code = v_code) INTO v_exists;
        EXIT WHEN NOT v_exists;
    END LOOP;

    v_name := COALESCE(
        NEW.raw_user_meta_data->>'name',
        NEW.raw_user_meta_data->>'full_name',
        split_part(NEW.email, '@', 1),
        'Usuario'
    );

    INSERT INTO public.profiles (
        id, user_code, name, email, phone, avatar
    ) VALUES (
        NEW.id,
        v_code,
        v_name,
        NEW.email,
        NEW.raw_user_meta_data->>'phone',
        NEW.raw_user_meta_data->>'avatar_url'
    ) ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 7. FUNCIONES B7: adjust_stock Y switch_store
-- ==============================================================================
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

    -- Validar rol ADMIN o REPOSITOR
    SELECT role INTO v_member_role
    FROM public.store_members
    WHERE store_id = p_store_id AND user_id = v_uid;

    IF v_member_role IS NULL OR v_member_role NOT IN ('ADMIN', 'REPOSITOR') THEN
        RAISE EXCEPTION 'Solo un Administrador o Repositor puede realizar ajustes de inventario' USING ERRCODE = '42501';
    END IF;

    -- Nota obligatoria
    IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
        RAISE EXCEPTION 'El motivo o nota del ajuste es obligatorio' USING ERRCODE = '22023';
    END IF;

    IF p_quantity_delta IS NULL OR p_quantity_delta = 0 THEN
        RAISE EXCEPTION 'El delta de ajuste no puede ser cero' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(p_user_name, name, 'Usuario') INTO v_actor_name
    FROM public.profiles
    WHERE id = v_uid;

    -- Bloquear producto FOR UPDATE
    SELECT * INTO v_product
    FROM public.products
    WHERE store_id = p_store_id AND id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Producto no encontrado en esta tienda' USING ERRCODE = '23503';
    END IF;

    v_new_stock := v_product.stock + p_quantity_delta;
    IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'El ajuste resultaría en un stock negativo (%)', v_new_stock USING ERRCODE = '23514';
    END IF;

    -- Insertar movimiento AJUSTE en Kardex
    INSERT INTO public.inventory_movements (
        store_id, product_id, product_name, type, quantity,
        previous_stock, new_stock, user_id, user_name, note
    ) VALUES (
        p_store_id, v_product.id, v_product.name, 'AJUSTE', p_quantity_delta,
        v_product.stock, v_new_stock, v_uid, v_actor_name, trim(p_note)
    );

    -- Actualizar stock en products
    UPDATE public.products
    SET stock = v_new_stock,
        updated_at = now()
    WHERE id = v_product.id;

    RETURN jsonb_build_object(
        'success', true,
        'product_id', v_product.id,
        'previous_stock', v_product.stock,
        'new_stock', v_new_stock
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.switch_store(
    p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_role TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_role
    FROM public.store_members
    WHERE store_id = p_store_id AND user_id = v_uid;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'No eres miembro de esta tienda' USING ERRCODE = '42501';
    END IF;

    UPDATE public.profiles
    SET active_store_id = p_store_id,
        updated_at = now()
    WHERE id = v_uid;

    RETURN jsonb_build_object(
        'success', true,
        'store_id', p_store_id,
        'role', v_role
    );
END;
$function$;

-- Concesión de ejecución a authenticated
GRANT EXECUTE ON FUNCTION public.create_store(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_profile_by_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.switch_store(UUID) TO authenticated;

COMMIT;
-- ROLLBACK;
