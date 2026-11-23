-- H-07: la lectura de compras, partidas y proveedores se limita a
-- ADMIN y REPOSITOR; simulaciones solo ADMIN. El CAJERO ya no las lee
-- por la API (la pantalla tampoco se las muestra). Solo cambia SELECT.
BEGIN;

DROP POLICY IF EXISTS purchases_select ON public.purchases;
CREATE POLICY purchases_select ON public.purchases FOR SELECT TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN', 'REPOSITOR']));

DROP POLICY IF EXISTS purchase_items_select ON public.purchase_items;
CREATE POLICY purchase_items_select ON public.purchase_items FOR SELECT TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN', 'REPOSITOR']));

DROP POLICY IF EXISTS suppliers_select ON public.suppliers;
CREATE POLICY suppliers_select ON public.suppliers FOR SELECT TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN', 'REPOSITOR']));

DROP POLICY IF EXISTS simulations_select ON public.simulations;
CREATE POLICY simulations_select ON public.simulations FOR SELECT TO authenticated
    USING (public.has_store_role(store_id, ARRAY['ADMIN']));

COMMIT;

-- REVERSA (solo si algo falla; ejecutar aparte):
-- BEGIN;
-- DROP POLICY IF EXISTS purchases_select ON public.purchases;
-- CREATE POLICY purchases_select ON public.purchases FOR SELECT TO authenticated USING (public.is_store_member(store_id));
-- DROP POLICY IF EXISTS purchase_items_select ON public.purchase_items;
-- CREATE POLICY purchase_items_select ON public.purchase_items FOR SELECT TO authenticated USING (public.is_store_member(store_id));
-- DROP POLICY IF EXISTS suppliers_select ON public.suppliers;
-- CREATE POLICY suppliers_select ON public.suppliers FOR SELECT TO authenticated USING (public.is_store_member(store_id));
-- DROP POLICY IF EXISTS simulations_select ON public.simulations;
-- CREATE POLICY simulations_select ON public.simulations FOR SELECT TO authenticated USING (public.is_store_member(store_id));
-- COMMIT;
