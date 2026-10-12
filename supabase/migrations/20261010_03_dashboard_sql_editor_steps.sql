BEGIN;

-- 1. Eliminar columna total_sales de products de forma definitiva
ALTER TABLE public.products DROP COLUMN IF EXISTS total_sales CASCADE;

-- 2. Eliminar firmas obsoletas de process_sale y register_sale
DROP FUNCTION IF EXISTS public.register_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb, uuid);
DROP FUNCTION IF EXISTS public.register_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.process_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.process_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb, uuid);

-- 3. Corregir constraint fk_profiles_active_store (ON DELETE SET NULL especificando columna activa)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS fk_profiles_active_store;
ALTER TABLE public.profiles 
    ADD CONSTRAINT fk_profiles_active_store 
    FOREIGN KEY (id, active_store_id) REFERENCES public.store_members(user_id, store_id) 
    ON DELETE SET NULL (active_store_id);

-- 4. Notificar a PostgREST para refrescar el esquema de la API
NOTIFY pgrst, 'reload schema';

COMMIT;
-- ROLLBACK;
