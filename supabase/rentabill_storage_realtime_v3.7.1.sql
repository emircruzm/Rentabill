-- ============================================================================
-- RENTABILL · STORAGE + REALTIME (v3.7) · ejecutar DESPUES de rentabill_schema_v3.7.sql
-- ----------------------------------------------------------------------------
-- Pegar en Supabase > SQL Editor > Run. Se puede repetir sin problema.
-- Segun el codigo de la app:
--   bucket  product-images
--   rutas   products/<store_id>_<timestamp>.jpg   (foto de producto)
--           stores/qr_<store_id>_<timestamp>.png  (QR de cobro de la tienda)
--   realtime  products, sales, inventory_movements y store_members (filtrados por
--             store_id) y store_invitations (sin filtro; lo limita RLS)
-- ============================================================================

-- ---- 1. Bucket publico de imagenes (5 MB, solo imagenes) -------------------
-- Publico = cualquiera con el enlace ve la imagen (necesario para mostrar fotos
-- y el QR de cobro). Subir, reemplazar y borrar SI esta restringido (abajo).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---- 2. Politicas: cada tienda solo toca SUS archivos ----------------------
-- El id de la tienda se lee del nombre del archivo (uuid de 36 caracteres).
--   products/<store_id>_...   -> ADMIN o REPOSITOR de esa tienda
--   stores/qr_<store_id>_...  -> solo ADMIN de esa tienda
-- Un nombre que no siga esos patrones no coincide con ninguna politica: se rechaza.
DROP POLICY IF EXISTS rb_images_select ON storage.objects;
DROP POLICY IF EXISTS rb_images_insert ON storage.objects;
DROP POLICY IF EXISTS rb_images_update ON storage.objects;
DROP POLICY IF EXISTS rb_images_delete ON storage.objects;

CREATE POLICY rb_images_select ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'product-images' AND (
        public.is_store_member(substring(name FROM '^products/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_')::uuid)
        OR public.is_store_member(substring(name FROM '^stores/qr_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_')::uuid)
    )
);

CREATE POLICY rb_images_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'product-images' AND (
        public.has_store_role(substring(name FROM '^products/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_')::uuid, ARRAY['ADMIN', 'REPOSITOR'])
        OR public.has_store_role(substring(name FROM '^stores/qr_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_')::uuid, ARRAY['ADMIN'])
    )
);

CREATE POLICY rb_images_update ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'product-images' AND (
        public.has_store_role(substring(name FROM '^products/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_')::uuid, ARRAY['ADMIN', 'REPOSITOR'])
        OR public.has_store_role(substring(name FROM '^stores/qr_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_')::uuid, ARRAY['ADMIN'])
    )
)
WITH CHECK (
    bucket_id = 'product-images' AND (
        public.has_store_role(substring(name FROM '^products/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_')::uuid, ARRAY['ADMIN', 'REPOSITOR'])
        OR public.has_store_role(substring(name FROM '^stores/qr_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_')::uuid, ARRAY['ADMIN'])
    )
);

CREATE POLICY rb_images_delete ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'product-images' AND (
        public.has_store_role(substring(name FROM '^products/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_')::uuid, ARRAY['ADMIN', 'REPOSITOR'])
        OR public.has_store_role(substring(name FROM '^stores/qr_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_')::uuid, ARRAY['ADMIN'])
    )
);

-- ---- 3. Realtime: solo las tablas que escucha la app -----------------------
-- REPLICA IDENTITY FULL en products y store_members: sin esto, los eventos DELETE no traen
-- store_id y el filtro store_id=eq.<id> de la app no los entregaria.
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.store_members REPLICA IDENTITY FULL;

DO $rt$
DECLARE
    t TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH t IN ARRAY ARRAY['products', 'sales', 'inventory_movements', 'store_members', 'store_invitations'] LOOP
            IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                           WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            END IF;
        END LOOP;
    END IF;
END
$rt$;
