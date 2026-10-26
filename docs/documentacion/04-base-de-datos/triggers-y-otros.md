# Disparadores (Triggers), Funciones Auxiliares y Storage (PostgreSQL v3.7.0)

Este documento describe la lógica automatizada a nivel de base de datos (`supabase/rentabill_schema_v3.7.sql:441-761`), que incluye triggers de integridad, sincronización de usuarios, políticas de Supabase Storage y configuración de réplica en tiempo real.

---

## 1. Disparadores de Integridad y Automatización (Triggers)

### 1.1. `trg_product_initial_stock` (`public.trg_product_initial_stock`, líneas 731-759)
* **Momento y Evento:** `AFTER INSERT ON public.products FOR EACH ROW`.
* **Propósito:** Garantizar la trazabilidad contable total del inventario.
* **Mecanismo:** Si un producto se crea con `stock > 0`, el trigger inserta automáticamente una fila en `inventory_movements` clasificada como `type = 'AJUSTE'`, con cantidad inicial, saldo anterior en 0, saldo nuevo igual al stock y motivo `'Stock inicial'`. Esto asegura que no exista existencia física en almacén sin respaldo en el kardex.

### 1.2. `trg_normalize_product_codes` (`public.normalize_product_codes`, líneas 467-479)
* **Momento y Evento:** `BEFORE INSERT OR UPDATE OF barcode, sku ON public.products FOR EACH ROW`.
* **Propósito:** Prevenir colisiones de índices únicos por cadenas vacías.
* **Mecanismo:** Convierte cualquier cadena vacía `""` o con solo espacios en `NULL` (`NEW.barcode := NULLIF(trim(NEW.barcode), '')`). Como en SQL los valores `NULL` no colisionan en índices únicos, múltiples productos pueden crearse sin código de barras sin violar la restricción.

### 1.3. `trg_protect_last_admin` (`public.check_last_store_admin`, líneas 620-671)
* **Momento y Evento:** `BEFORE UPDATE OR DELETE ON public.store_members FOR EACH ROW`.
* **Propósito:** Salvaguardar la gobernanza de la tienda.
* **Mecanismo:**
  * Bloquea la degradación o eliminación del usuario propietario (`stores.owner_id`).
  * Bloquea la degradación o eliminación del último `ADMIN` de la sucursal, exigiendo promover a otro administrador antes de renunciar al rol.

### 1.4. `trg_protect_user_code` (`public.protect_user_code`, líneas 600-618)
* **Momento y Evento:** `BEFORE UPDATE ON public.profiles FOR EACH ROW`.
* **Propósito:** Garantizar que el identificador público `user_code` sea estrictamente inmutable tras su asignación inicial.

### 1.5. `on_auth_user_created` (`public.handle_new_user`, líneas 673-728)
* **Momento y Evento:** `AFTER INSERT ON auth.users FOR EACH ROW`.
* **Propósito:** Aprovisionamiento automático del perfil público.
* **Mecanismo:** Al registrarse un usuario en Supabase Auth, genera automáticamente su código único mediante `generate_user_code()` (formato `RENT-XXXX`) e inserta la fila inicial en `public.profiles`.

### 1.6. `trg_sync_profile_email` (`public.sync_profile_email`, líneas 580-598)
* **Momento y Evento:** `AFTER UPDATE OF email ON auth.users FOR EACH ROW`.
* **Propósito:** Mantener sincronizado el correo electrónico del comerciante en `public.profiles`.

### 1.7. `trg_set_updated_at` (`public.set_updated_at`, líneas 448-465)
* **Momento y Evento:** `BEFORE UPDATE` en todas las tablas transaccionales y maestras.
* **Propósito:** Actualiza la marca temporal `updated_at = now()`.

---

## 2. Configuración de Supabase Storage (Bucket de Imágenes)

* **Bucket:** `product-images`.
* **Acceso Público:** `public = true` (permite lectura directa vía URL pública para renderizado rápido en la app móvil).
* **Políticas de Seguridad en Storage (`storage.objects`):**
  * **Lectura (`SELECT`):** Pública para cualquier usuario autenticado o anónimo.
  * **Escritura (`INSERT` / `UPDATE`):** Restringida a usuarios autenticados miembros de la tienda (`is_store_member(store_id)`).
  * **Límite de Tamaño:** Configurado a 5 MB por archivo con tipos MIME permitidos: `image/png`, `image/jpeg`, `image/webp`.

---

## 3. Publicación en Tiempo Real (Supabase Realtime)

Para permitir que terminales de venta concurrentes reflejen cambios instantáneos de existencias y ventas, el esquema añade a la publicación `supabase_realtime`:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_movements;
```
* **Filtrado por Tienda:** El cliente WebSocket suscribe a cada tabla aplicando el filtro `filter: 'store_id=eq.' + storeId`, garantizando que un terminal solo reciba los eventos pertenecientes a su negocio.
