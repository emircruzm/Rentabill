# Disparadores (Triggers), Funciones Auxiliares y Storage (PostgreSQL v3.7.0)

Este documento describe la lógica automatizada a nivel de base de datos (`supabase/rentabill_schema_v3.7.sql:441-761`), que incluye triggers de integridad y sincronización de usuarios. Asimismo, documenta la configuración complementaria de Supabase Storage y réplica en tiempo real, las cuales se configuran con el script `supabase/rentabill_storage_realtime_v3.7.1.sql` (no forman parte del script principal).

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

Supabase Storage se configura con `supabase/rentabill_storage_realtime_v3.7.1.sql` (no con el script principal del esquema):

* **Bucket:** `product-images`.
* **Acceso Público:** `public = true` (permite lectura directa vía URL pública para renderizado rápido en la app móvil).
* **Límite de Tamaño:** Configurado a 5 MB por archivo.
* **Tipos MIME Permitidos:** `image/jpeg`, `image/png`, `image/webp`.
* **Políticas de Seguridad en Storage (`storage.objects`):** Implementadas mediante 4 políticas bajo el prefijo `rb_images_*`:
  * Políticas de control de acceso para selección (`SELECT`), inserción (`INSERT`), actualización (`UPDATE`) y borrado (`DELETE`).

---

## 3. Publicación en Tiempo Real (Supabase Realtime)

La publicación en tiempo real de Supabase se configura con `supabase/rentabill_storage_realtime_v3.7.1.sql` (no con el script principal del esquema).

### Canales y Tablas que Escucha la Aplicación Móvil

La aplicación cliente escucha activamente los cambios en la base de datos a través de dos canales WebSocket:

1. **Canal de Tienda (`store-<id>`):**
   * **Implementación:** `src/data/realtime/storeRealtime.ts:1-61` (`subscribeToStoreRealtime`).
   * **Canal:** `store-${storeId}`.
   * **Filtro:** `store_id=eq.${storeId}` aplicado en el servidor a cada suscripción `postgres_changes`.
   * **Tablas escuchadas (evento `*`):**
     * `products`: cambios en existencias, precios y catálogo de la tienda.
     * `sales`: nuevas ventas registradas desde cualquier terminal.
     * `inventory_movements`: nuevos movimientos de kardex y ajustes de inventario.
     * `store_members`: asignación, actualización o baja de miembros y roles del equipo.
   * **Exclusión explícita:** **NO incluye `purchases`** (la aplicación móvil no escucha la tabla de compras en tiempo real).

2. **Canal de Usuario e Invitaciones (`invitations_<userId>`):**
   * **Implementación:** `src/application/state/InventoryContext.tsx:961-977`.
   * **Canal:** `invitations_${user.userId || 'user'}`.
   * **Tabla escuchada (evento `*`):** `store_invitations`.
   * **Sin filtro en el payload:** No se define parámetro `filter:` en la llamada de `postgres_changes`; el aislamiento y seguridad se delegan a las políticas RLS de PostgreSQL para el usuario autenticado.
