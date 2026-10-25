-- Versión anterior; el esquema vigente es supabase/rentabill_schema_v3.7.sql
BEGIN;

-- 1. Helper functions de membresía y roles (SECURITY DEFINER, search_path = '', STABLE)
CREATE OR REPLACE FUNCTION public.is_store_member(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.store_members 
        WHERE store_id = p_store_id 
          AND user_id = (SELECT auth.uid())
    );
$$;

CREATE OR REPLACE FUNCTION public.has_store_role(p_store_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.store_members 
        WHERE store_id = p_store_id 
          AND user_id = (SELECT auth.uid())
          AND role = ANY(p_roles)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_store_member(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_store_role(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_store_role(UUID, TEXT[]) TO authenticated;

-- 2. ENABLE y FORCE ROW LEVEL SECURITY en TODAS las tablas públicas
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores FORCE ROW LEVEL SECURITY;

ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_members FORCE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories FORCE ROW LEVEL SECURITY;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements FORCE ROW LEVEL SECURITY;

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases FORCE ROW LEVEL SECURITY;

ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.store_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_invitations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings FORCE ROW LEVEL SECURITY;

-- 3. Limpiar políticas existentes para recrearlas limpias
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- 4. Políticas para STORES
CREATE POLICY stores_select ON public.stores FOR SELECT TO authenticated
    USING (public.is_store_member(id) OR owner_id = (SELECT auth.uid()));

CREATE POLICY stores_insert ON public.stores FOR INSERT TO authenticated
    WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY stores_update ON public.stores FOR UPDATE TO authenticated
    USING (public.has_store_role(id, ARRAY['ADMIN']))
    WITH CHECK (public.has_store_role(id, ARRAY['ADMIN']));

CREATE POLICY stores_delete ON public.stores FOR DELETE TO authenticated
    USING (owner_id = (SELECT auth.uid()));

-- 5. Políticas para STORE_MEMBERS
CREATE POLICY members_select ON public.store_members FOR SELECT TO authenticated
    USING (public.is_store_member(store_id) OR user_id = (SELECT auth.uid()));

CREATE POLICY members_insert ON public.store_members FOR INSERT TO authenticated
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN']));

CREATE POLICY members_update ON public.store_members FOR UPDATE TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN']))
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN']));

CREATE POLICY members_delete ON public.store_members FOR DELETE TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN']));

-- 6. Políticas para PROFILES
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
    USING (true); -- Necesario para consultar miembros y nombres de cajeros en el equipo

CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated
    WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));

-- 7. Políticas para CASH_REGISTERS
CREATE POLICY cash_registers_select ON public.cash_registers FOR SELECT TO authenticated
    USING (public.is_store_member(store_id));

CREATE POLICY cash_registers_insert ON public.cash_registers FOR INSERT TO authenticated
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN']));

CREATE POLICY cash_registers_update ON public.cash_registers FOR UPDATE TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN']))
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN']));

CREATE POLICY cash_registers_delete ON public.cash_registers FOR DELETE TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN']));

-- 8. Políticas para CATEGORIES
CREATE POLICY categories_select ON public.categories FOR SELECT TO authenticated
    USING (public.is_store_member(store_id));

CREATE POLICY categories_insert ON public.categories FOR INSERT TO authenticated
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN', 'REPOSITOR']));

CREATE POLICY categories_update ON public.categories FOR UPDATE TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN', 'REPOSITOR']))
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN', 'REPOSITOR']));

CREATE POLICY categories_delete ON public.categories FOR DELETE TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN']));

-- 9. Políticas para SUPPLIERS
CREATE POLICY suppliers_select ON public.suppliers FOR SELECT TO authenticated
    USING (public.is_store_member(store_id));

CREATE POLICY suppliers_insert ON public.suppliers FOR INSERT TO authenticated
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN', 'REPOSITOR']));

CREATE POLICY suppliers_update ON public.suppliers FOR UPDATE TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN', 'REPOSITOR']))
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN', 'REPOSITOR']));

CREATE POLICY suppliers_delete ON public.suppliers FOR DELETE TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN']));

-- 10. Políticas para PRODUCTS
CREATE POLICY products_select ON public.products FOR SELECT TO authenticated
    USING (public.is_store_member(store_id));

CREATE POLICY products_insert ON public.products FOR INSERT TO authenticated
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN', 'REPOSITOR']));

CREATE POLICY products_update ON public.products FOR UPDATE TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN', 'REPOSITOR']))
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN', 'REPOSITOR']));

CREATE POLICY products_delete ON public.products FOR DELETE TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN']));

-- 11. Políticas para SALES (Prohibida inserción directa del cliente, solo process_sale)
CREATE POLICY sales_select ON public.sales FOR SELECT TO authenticated
    USING (public.is_store_member(store_id));

-- NO se crean políticas INSERT ni UPDATE directas para client role authenticated en sales.
-- La inserción la realiza exclusivamente la función process_sale (SECURITY DEFINER).

-- 12. Políticas para SALE_ITEMS
CREATE POLICY sale_items_select ON public.sale_items FOR SELECT TO authenticated
    USING (public.is_store_member(store_id));

-- 13. Políticas para INVENTORY_MOVEMENTS (Prohibida inserción directa del cliente)
CREATE POLICY movements_select ON public.inventory_movements FOR SELECT TO authenticated
    USING (public.is_store_member(store_id));

-- NO se crean políticas INSERT directas para client en inventory_movements.
-- La inserción la realizan las funciones process_sale, process_purchase y adjust_stock (SECURITY DEFINER).

-- 14. Políticas para PURCHASES
CREATE POLICY purchases_select ON public.purchases FOR SELECT TO authenticated
    USING (public.is_store_member(store_id));

-- Inserción directa reservada a process_purchase (SECURITY DEFINER) o ADMIN
CREATE POLICY purchases_insert ON public.purchases FOR INSERT TO authenticated
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN']));

-- 15. Políticas para PURCHASE_ITEMS
CREATE POLICY purchase_items_select ON public.purchase_items FOR SELECT TO authenticated
    USING (public.is_store_member(store_id));

CREATE POLICY purchase_items_insert ON public.purchase_items FOR INSERT TO authenticated
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN']));

-- 16. Políticas para SIMULATIONS
CREATE POLICY simulations_select ON public.simulations FOR SELECT TO authenticated
    USING (public.is_store_member(store_id));

CREATE POLICY simulations_insert ON public.simulations FOR INSERT TO authenticated
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN']));

CREATE POLICY simulations_update ON public.simulations FOR UPDATE TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN']))
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN']));

CREATE POLICY simulations_delete ON public.simulations FOR DELETE TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN']));

-- 17. Políticas para STORE_INVITATIONS
CREATE POLICY invitations_select ON public.store_invitations FOR SELECT TO authenticated
    USING (
        public.has_store_role(store_id, ARRAY['ADMIN']) 
        OR lower(email) = (SELECT lower(email) FROM public.profiles WHERE id = (SELECT auth.uid()))
    );

CREATE POLICY invitations_insert ON public.store_invitations FOR INSERT TO authenticated
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN']));

CREATE POLICY invitations_update ON public.store_invitations FOR UPDATE TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN']))
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN']));

CREATE POLICY invitations_delete ON public.store_invitations FOR DELETE TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN']));

-- 18. Políticas para STORE_SETTINGS
CREATE POLICY store_settings_select ON public.store_settings FOR SELECT TO authenticated
    USING (public.is_store_member(store_id));

CREATE POLICY store_settings_insert ON public.store_settings FOR INSERT TO authenticated
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN']));

CREATE POLICY store_settings_update ON public.store_settings FOR UPDATE TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN']))
    WITH CHECK (public.has_store_role(store_id, ARRAY['ADMIN']));

-- 19. REVOKE de permisos a anon en todo el esquema público
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;

COMMIT;
-- ROLLBACK;
