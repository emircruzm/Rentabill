-- Versión anterior; el esquema vigente es supabase/rentabill_schema_v3.7.sql
BEGIN;

-- Guarda de orden: verificar que units_sold existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'units_sold'
    ) THEN
        RAISE EXCEPTION 'ERROR DE ORDEN: Debes ejecutar 20261010_01_fase1_metrics_and_process_sale.sql primero.';
    END IF;
END $$;

-- 1. fk_profiles_active_store → ON DELETE SET NULL solo para active_store_id
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS fk_profiles_active_store;
ALTER TABLE public.profiles 
    ADD CONSTRAINT fk_profiles_active_store 
    FOREIGN KEY (id, active_store_id) REFERENCES public.store_members(user_id, store_id) 
    ON DELETE SET NULL (active_store_id);

-- 2. Proteger inmutabilidad de profiles.user_code
CREATE OR REPLACE FUNCTION public.protect_user_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF OLD.user_code IS NOT NULL AND NEW.user_code IS DISTINCT FROM OLD.user_code THEN
        RAISE EXCEPTION 'El código de usuario es inmutable' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_code ON public.profiles;
CREATE TRIGGER trg_protect_user_code
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_user_code();

-- 3. Proteger stores.owner_id contra modificaciones por authenticated
REVOKE UPDATE ON public.stores FROM authenticated;
GRANT UPDATE (name, type, currency, logo_url, qr_image_url) ON public.stores TO authenticated;

-- 4. Ampliar trg_protect_last_admin para proteger al dueño (owner_id)
CREATE OR REPLACE FUNCTION public.check_last_store_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_owner_id UUID;
BEGIN
    -- Si la tienda se está borrando en cascada, permitir la eliminación
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = OLD.store_id) THEN
        RETURN OLD;
    END IF;

    SELECT owner_id INTO v_owner_id FROM public.stores WHERE id = OLD.store_id;

    -- Proteger al dueño de la tienda de ser eliminado o degradado
    IF OLD.user_id = v_owner_id AND (TG_OP = 'DELETE' OR NEW.role <> 'ADMIN') THEN
        RAISE EXCEPTION 'No se puede eliminar ni degradar al propietario del negocio' USING ERRCODE = 'P0001';
    END IF;

    -- Proteger al último administrador
    IF OLD.role = 'ADMIN' AND (TG_OP = 'DELETE' OR NEW.role <> 'ADMIN') THEN
        IF (
            SELECT count(*) 
            FROM public.store_members 
            WHERE store_id = OLD.store_id 
              AND role = 'ADMIN' 
              AND user_id <> OLD.user_id
        ) = 0 THEN
            RAISE EXCEPTION 'No se puede eliminar ni degradar al último administrador de la tienda' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- 5. Restricción de UPDATE de métricas en products para authenticated
REVOKE UPDATE ON public.products FROM authenticated;
GRANT UPDATE (name, barcode, sku, category, unit, cost_price, sale_price, stock, purchased_quantity, reorder_point, estimated_speed, image_url, category_id, archived_at) ON public.products TO authenticated;

-- 6. Limpieza y aislamiento de clean_table_data
CREATE OR REPLACE FUNCTION public.clean_table_data(t_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    RAISE EXCEPTION 'Función deshabilitada por motivos de seguridad' USING ERRCODE = 'P0001';
END;
$$;
REVOKE ALL ON FUNCTION public.clean_table_data(text) FROM PUBLIC, anon, authenticated;

-- 7. Fijar search_path y aislar get_user_by_code
CREATE OR REPLACE FUNCTION public.get_user_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_profile RECORD;
BEGIN
    SELECT user_code, name
    INTO v_profile
    FROM public.profiles
    WHERE upper(user_code) = upper(trim(p_code))
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'userId', v_profile.user_code,
        'name', v_profile.name
    );
END;
$$;

-- 8. Permisos de Funciones Globales y Default Privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

-- Conceder a authenticated solo las que usa el front y RLS
GRANT EXECUTE ON FUNCTION public.get_current_store_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member_of_store(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_sale(uuid, text, text, numeric, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_store(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.switch_store(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_purchase(uuid, uuid, uuid, text, integer, date, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_member_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_invitation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_invitation(uuid, boolean) TO authenticated;

-- 9. Vistas con security_invoker
ALTER VIEW public.product_stats SET (security_invoker = true);

-- v_team_invitations con filtro estricto (para no romper bandeja de invitados)
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
JOIN public.profiles p_inviter ON p_inviter.id = ti.invited_by
WHERE ti.invited_user_id = auth.uid() 
   OR (ti.store_id = public.get_current_store_id() AND public.get_current_user_role() = 'ADMIN');

REVOKE ALL ON public.product_stats FROM anon, PUBLIC;
REVOKE ALL ON public.v_team_invitations FROM anon, PUBLIC;
GRANT SELECT ON public.product_stats TO authenticated;
GRANT SELECT ON public.v_team_invitations TO authenticated;

-- 10. Integridad B5 y B3 (Unique SKU no archivado)
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_store_sku 
ON public.products (store_id, sku) 
WHERE (sku IS NOT NULL AND archived_at IS NULL);

NOTIFY pgrst, 'reload schema';

COMMIT;
-- ROLLBACK;
