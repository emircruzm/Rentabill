# Diccionario de Datos del Esquema Relacional (PostgreSQL v3.7.0)

Este documento detalla la estructura física, columnas, tipos de datos, valores por defecto, restricciones de integridad referencial (`FOREIGN KEY`), restricciones de dominio (`CHECK`), claves únicas e índices de optimización para las **16 tablas** y la **vista `product_stats`** del archivo `supabase/rentabill_schema_v3.7.sql`.

---

## 1. Tablas de Organización, Usuarios y Configuración

### 1.1. Tabla `public.stores`
* **Propósito:** Almacena los comercios o sucursales físicas/virtuales. Actúa como el eje multi-tenant.
* **Columnas:**
  * `id`: `UUID` (PK, Default `gen_random_uuid()`). Identificador único.
  * `name`: `TEXT NOT NULL`. Razón social o nombre comercial.
  * `type`: `TEXT NOT NULL`. Rubro comercial (`'Abarrotes'`, `'Minimarket'`, etc.).
  * `currency`: `TEXT NOT NULL DEFAULT 'PEN'`. Moneda oficial.
  * `owner_id`: `UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT`. Propietario de la tienda.
  * `qr_image_url`: `TEXT`. Enlace a la imagen del código QR de cobro (Yape/Plin).
  * `created_at`: `TIMESTAMPTZ DEFAULT now()`. Fecha de creación.
  * `updated_at`: `TIMESTAMPTZ DEFAULT now()`. Fecha de última modificación.
* **Índices:** `idx_stores_owner_id ON stores(owner_id)`.

### 1.2. Tabla `public.store_members`
* **Propósito:** Resuelve la membresía de usuarios en tiendas con RBAC.
* **Columnas:**
  * `id`: `UUID` (PK, Default `gen_random_uuid()`).
  * `store_id`: `UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE`.
  * `user_id`: `UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`.
  * `role`: `TEXT NOT NULL CHECK (role IN ('ADMIN', 'CAJERO', 'REPOSITOR'))`. Rol asignado.
  * `created_at`: `TIMESTAMPTZ DEFAULT now()`.
  * `updated_at`: `TIMESTAMPTZ DEFAULT now()`.
* **Restricciones e Índices:** `CONSTRAINT uq_store_members_store_user UNIQUE (store_id, user_id)`.

### 1.3. Tabla `public.profiles`
* **Propósito:** Información pública complementaria de la cuenta de usuario.
* **Columnas:**
  * `id`: `UUID` (PK REFERENCES `auth.users(id)` ON DELETE CASCADE).
  * `full_name`: `TEXT`. Nombre completo del comerciante.
  * `phone`: `TEXT CHECK (phone IS NULL OR phone ~ '^9[0-9]{8}$')`. Celular peruano validado.
  * `user_code`: `TEXT NOT NULL UNIQUE CHECK (user_code ~ '^[A-Z0-9]{6}$')`. Código de 6 caracteres para invitaciones.
  * `avatar_url`: `TEXT`. Foto de perfil.
  * `created_at`: `TIMESTAMPTZ DEFAULT now()`.
  * `updated_at`: `TIMESTAMPTZ DEFAULT now()`.
* **Índices:** `idx_profiles_user_code ON profiles(user_code)`.

### 1.4. Tabla `public.user_preferences`
* **Propósito:** Preferencias de interfaz del usuario autenticado.
* **Columnas:** `id` (PK), `user_id` (UUID UNIQUE REFERENCES `auth.users(id)` ON DELETE CASCADE), `theme` (TEXT DEFAULT `'light'`), `notifications_enabled` (BOOLEAN DEFAULT `true`), `created_at`, `updated_at`.

### 1.5. Tabla `public.store_settings`
* **Propósito:** Configuración financiera y operativa de la bodega.
* **Columnas:**
  * `id`: `UUID` (PK).
  * `store_id`: `UUID NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE`.
  * `daily_sales_target`: `NUMERIC(12,3) NOT NULL DEFAULT 500.00 CHECK (daily_sales_target >= 0)`.
  * `max_credit_days`: `INTEGER NOT NULL DEFAULT 30 CHECK (max_credit_days >= 0)`.
  * `created_at`: `TIMESTAMPTZ DEFAULT now()`, `updated_at`: `TIMESTAMPTZ DEFAULT now()`.

### 1.6. Tabla `public.store_invitations`
* **Propósito:** Invitaciones pendientes o procesadas para integrar personal a una tienda.
* **Columnas:** `id` (PK), `store_id` (FK `stores`), `target_user_code` (TEXT NOT NULL), `role` (TEXT CHECK `'ADMIN'`, `'CAJERO'`, `'REPOSITOR'`), `token` (TEXT NOT NULL UNIQUE), `status` (TEXT DEFAULT `'PENDIENTE'` CHECK `'PENDIENTE'`, `'ACEPTADA'`, `'EXPIRADA'`, `'CANCELADA'`), `invited_by` (FK `auth.users`), `expires_at` (TIMESTAMPTZ), `created_at`, `updated_at`.

---

## 2. Tablas de Catálogo y Logística

### 2.1. Tabla `public.categories`
* **Propósito:** Clasificación de productos por sucursal.
* **Columnas:** `id` (PK), `store_id` (FK `stores`), `name` (TEXT NOT NULL), `created_at`, `updated_at`.
* **Restricción:** `UNIQUE(store_id, name)`.

### 2.2. Tabla `public.suppliers`
* **Propósito:** Directorio de distribuidores mayoristas de la tienda.
* **Columnas:** `id` (PK), `store_id` (FK `stores`), `name` (TEXT NOT NULL), `contact_name` (TEXT), `phone` (TEXT), `ruc` (TEXT), `notes` (TEXT), `created_at`, `updated_at`.

### 2.3. Tabla `public.products`
* **Propósito:** Catálogo maestro y existencias de inventario físico.
* **Columnas:**
  * `id`: `UUID` (PK, Default `gen_random_uuid()`).
  * `store_id`: `UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE`.
  * `category_id`: `UUID REFERENCES public.categories(id) ON DELETE SET NULL`.
  * `barcode`: `TEXT`. Código de barras comercial (EAN-13, UPC, etc.).
  * `sku`: `TEXT`. Código interno de control.
  * `name`: `TEXT NOT NULL`. Descripción o nombre del producto.
  * `unit`: `TEXT NOT NULL DEFAULT 'pza' CHECK (unit IN ('pza', 'kg', 'lt', 'caja'))`.
  * `cost_price`: `NUMERIC(12,3) NOT NULL CHECK (cost_price >= 0)`. Costo de compra en Soles.
  * `sale_price`: `NUMERIC(12,3) NOT NULL CHECK (sale_price >= 0)`. Precio de venta al público en Soles.
  * `stock`: `NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock >= 0)`. Existencias físicas (permite decimales para balanza).
  * `reorder_point`: `NUMERIC(12,3) DEFAULT 5 CHECK (reorder_point >= 0)`. Existencia mínima para reposición.
  * `estimated_speed`: `TEXT NOT NULL DEFAULT 'NORMAL' CHECK (estimated_speed IN ('RAPIDO', 'NORMAL', 'LENTO'))`.
  * `units_sold`: `NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (units_sold >= 0)`. Unidades totales vendidas.
  * `sales_count`: `INTEGER NOT NULL DEFAULT 0 CHECK (sales_count >= 0)`. Número de tickets donde participó.
  * `image_url`: `TEXT`. Fotografía en Supabase Storage.
  * `archived_at`: `TIMESTAMPTZ`. Fecha de archivado lógico (NULL = activo).
  * `created_at`: `TIMESTAMPTZ DEFAULT now()`, `updated_at`: `TIMESTAMPTZ DEFAULT now()`.
* **Índices y Unicidad:**
  * `uq_products_store_barcode`: `CREATE UNIQUE INDEX ... ON products(store_id, barcode) WHERE archived_at IS NULL;` *(Permite reutilizar códigos de barras cuando un producto viejo es archivado)*.
  * `idx_products_store_id`: Búsqueda y partición por tienda.

### 2.4. Tabla `public.inventory_movements` (Kardex)
* **Propósito:** Registro cronológico e inmutable de entradas y salidas de almacén.
* **Columnas:**
  * `id`: `UUID` (PK).
  * `store_id`: `UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE`.
  * `product_id`: `UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT`.
  * `movement_type`: `TEXT NOT NULL CHECK (movement_type IN ('COMPRA', 'VENTA', 'AJUSTE'))`.
  * `quantity_delta`: `NUMERIC(12,3) NOT NULL`. Variación neta ($+$ compra/ajuste positivo, $-$ venta/merma).
  * `stock_before`: `NUMERIC(12,3) NOT NULL CHECK (stock_before >= 0)`. Saldo previo.
  * `stock_after`: `NUMERIC(12,3) NOT NULL CHECK (stock_after >= 0)`. Saldo posterior al movimiento.
  * `note`: `TEXT`. Motivo obligatorio de la transacción o número de documento.
  * `user_name`: `TEXT`. Nombre del operador que ejecutó el movimiento.
  * `reference_id`: `UUID`. Enlace foráneo hacia `sale_id` o `purchase_id`.
  * `created_at`: `TIMESTAMPTZ DEFAULT now()`.
* **Índices:** `idx_inventory_movements_store_product ON inventory_movements(store_id, product_id, created_at DESC)`.

---

## 3. Tablas Transaccionales de Ventas y Compras

### 3.1. Tabla `public.cash_registers`
* **Propósito:** Cajas registradoras por sucursal (1FN).
* **Columnas:** `id` (PK), `store_id` (FK `stores`), `name` (TEXT NOT NULL), `is_active` (BOOLEAN DEFAULT `true`), `created_at`, `updated_at`.
* **Restricción:** `UNIQUE(store_id, name)`.

### 3.2. Tabla `public.sales`
* **Propósito:** Cabecera de la transacción de cobro emitida en el mostrador.
* **Columnas:**
  * `id`: `UUID` (PK).
  * `store_id`: `UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE`.
  * `register_id`: `UUID REFERENCES public.cash_registers(id) ON DELETE SET NULL`.
  * `ticket_number`: `TEXT NOT NULL`. Folio secuencial formateado (ej. `TKT-00101`).
  * `total_amount`: `NUMERIC(12,3) NOT NULL CHECK (total_amount >= 0)`. Total en Soles.
  * `payment_method`: `TEXT NOT NULL CHECK (payment_method IN ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia', 'qr'))`.
  * `cash_given`: `NUMERIC(12,3)`. Efectivo entregado por el comprador.
  * `change_given`: `NUMERIC(12,3)`. Vuelto devuelto al cliente.
  * `created_by`: `UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT`. Cajero emisor.
  * `created_at`: `TIMESTAMPTZ DEFAULT now()`.
* **Restricción:** `UNIQUE(store_id, ticket_number)`.

### 3.3. Tabla `public.sale_items`
* **Propósito:** Desglose de partidas del ticket de venta.
* **Columnas:**
  * `id`: `UUID` (PK).
  * `sale_id`: `UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE`.
  * `store_id`: `UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE`.
  * `product_id`: `UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT`.
  * `quantity`: `NUMERIC(12,3) NOT NULL CHECK (quantity > 0)`. Cantidad vendida.
  * `unit_price`: `NUMERIC(12,3) NOT NULL CHECK (unit_price >= 0)`. Precio pactado al cobrar.
  * `cost_price_at_sale`: `NUMERIC(12,3) NOT NULL`. **Snapshot inmutable** del costo unitario.
  * `product_name_snapshot`: `TEXT NOT NULL`. **Snapshot inmutable** del nombre del artículo.
  * `subtotal`: `NUMERIC(12,3) NOT NULL CHECK (subtotal >= 0)`. Cantidad $\times$ precio unitario.
  * `created_at`: `TIMESTAMPTZ DEFAULT now()`.

### 3.4. Tabla `public.purchases`
* **Propósito:** Registro de compras de mercadería a crédito o al contado.
* **Columnas:** `id` (PK), `store_id` (FK `stores`), `supplier_id` (FK `suppliers`), `purchase_number` (TEXT), `payment_condition` (TEXT CHECK `'contado'`, `'credito'`), `credit_days` (INTEGER DEFAULT `0`), `due_date` (DATE), `status` (TEXT CHECK `'PENDIENTE'`, `'PAGADA'`), `total_amount` (NUMERIC(12,3)), `note` (TEXT), `simulation_ids` (UUID[]), `created_by` (FK `auth.users`), `created_at`, `updated_at`.

### 3.5. Tabla `public.purchase_items`
* **Propósito:** Partidas de la orden de compra ingresada.
* **Columnas:** `id` (PK), `store_id` (FK `stores`), `purchase_id` (FK `purchases`), `product_id` (FK `products`), `quantity` (NUMERIC(12,3) CHECK `> 0`), `unit_cost` (NUMERIC(12,3) CHECK `>= 0`), `subtotal` (NUMERIC(12,3)), `created_at`.

### 3.6. Tabla `public.simulations`
* **Propósito:** Registros prospectivos de compras evaluadas por el simulador.
* **Columnas:** `id` (PK), `store_id` (FK `stores`), `name` (TEXT), `target_budget` (NUMERIC(12,3)), `estimated_profit` (NUMERIC(12,3)), `roi_percentage` (NUMERIC(5,2)), `status` (TEXT DEFAULT `'COMPLETADA'`), `items` (JSONB), `created_by` (FK `auth.users`), `created_at`.

---

## 4. Vista de Agregación: `public.product_stats`

* **Definición SQL:**
```sql
CREATE VIEW public.product_stats AS
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
    p.reorder_point,
    p.estimated_speed,
    p.units_sold,
    p.sales_count,
    GREATEST(EXTRACT(day FROM now() - p.created_at)::integer, 0) AS created_days_ago,
    CASE
        WHEN p.sales_count >= 5 OR EXTRACT(day FROM now() - p.created_at) >= 30 THEN 'REAL'::text
        ELSE 'ESTIMADO'::text
    END AS status,
    p.image_url,
    p.archived_at,
    p.created_at,
    p.updated_at
FROM public.products p
LEFT JOIN public.categories c ON c.store_id = p.store_id AND c.id = p.category_id;
```
* **Regla de Transición `ESTIMADO` -> `REAL`:** La columna derivada `status` evalúa si el producto ha alcanzado madurez estadística (al menos 5 ventas registradas o 30 días de vida en catálogo). Al cumplirse la condición, el motor financiero sustituye la estimación inicial por la velocidad de rotación real.
