-- Nota: documento histórico, anterior a la reorganización en capas y a la versión 3.7 de la base de datos. Puede mencionar tablas o estructuras que ya no existen. Referencias vigentes: docs/ARQUITECTURA.md y supabase/rentabill_schema_v3.7.sql.
-- PELIGRO: este script borra datos. NO ejecutar en producción.
﻿TRUNCATE TABLE 
    public.simulation_items,
    public.purchase_items,
    public.sale_items,
    public.inventory_movements,
    public.purchases,
    public.simulations,
    public.sales,
    public.products,
    public.categories,
    public.suppliers,
    public.cash_registers,
    public.app_settings,
    public.team_invitations,
    public.user_preferences,
    public.store_members,
    public.profiles,
    public.stores
RESTART IDENTITY CASCADE;

DELETE FROM auth.users;
