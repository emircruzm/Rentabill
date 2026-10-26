# Diccionario de Datos del Esquema Relacional (PostgreSQL v3.7.0)

Este documento detalla la estructura física oficial, columnas, tipos de datos SQL, restricciones de nulidad (`NOT NULL`), valores por defecto (`DEFAULT`), restricciones de dominio (`CHECK`), claves primarias (`PRIMARY KEY`), claves foráneas compuestas (`FOREIGN KEY`), claves únicas e índices para las **16 tablas** y la **vista `product_stats`** del archivo `supabase/rentabill_schema_v3.7.sql`.

---

## 1. Tablas de Organización, Usuarios y Configuración

### 1.1. Tabla `public.stores`
* **Propósito:** Almacena los comercios o sucursales físicas/virtuales. Actúa como el eje multi-tenant de todo el sistema.
* **Columnas:**
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`. Identificador único de la tienda.
  * `owner_id`: `UUID REFERENCES auth.users(id) ON DELETE SET NULL`. Propietario de la tienda.
  * `name`: `TEXT NOT NULL`. Razón social o nombre comercial del negocio.
  * `type`: `TEXT NOT NULL DEFAULT 'Abarrotes' CHECK (type IN ('Abarrotes', 'Ropa', 'Farmacia', 'Ferretería', 'Otro'))`. Rubro comercial.
  * `currency`: `TEXT NOT NULL DEFAULT 'PEN' CHECK (currency ~ '^[A-Z]{3}$')`. Código ISO 4217 de moneda oficial.
  * `logo_url`: `TEXT`. Enlace a la imagen del logotipo de la tienda.
  * `qr_image_url`: `TEXT`. Enlace a la imagen del código QR de cobro (Yape/Plin).
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`. Fecha de creación del registro.
  * `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`. Fecha de última modificación.
* **Índices:** `idx_stores_owner_id ON stores(owner_id)` (línea 446).
* **Fuente:** `rentabill_schema_v3.7.sql:107 a 117`

### 1.2. Tabla `public.store_members`
* **Propósito:** Resuelve la membresía multi-tienda de los usuarios bajo el modelo RBAC.
* **Columnas:**
  * `store_id`: `UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE`. Tienda asociada.
  * `user_id`: `UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`. Usuario colaborador.
  * `role`: `TEXT NOT NULL CHECK (role IN ('ADMIN', 'CAJERO', 'REPOSITOR'))`. Rol asignado en la tienda.
  * `joined_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`. Marca temporal de incorporación.
* **Clave Primaria:** `PRIMARY KEY (user_id, store_id)` *(no existe columna `id` separada ni columnas `created_at`/`updated_at`)*.
* **Índices:** `idx_store_members_store_id ON store_members(store_id)` (línea 444).
* **Fuente:** `rentabill_schema_v3.7.sql:120 a 126`

### 1.3. Tabla `public.profiles`
* **Propósito:** Información de perfil público del usuario complementaria a `auth.users`.
* **Columnas:**
  * `id`: `UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`. ID del usuario.
  * `user_code`: `TEXT NOT NULL UNIQUE`. Código público inmutable de 9 caracteres formateado como `RENT-XXXX` (`CHECK (user_code ~ '^RENT-[0-9A-Z]{4}$')`).
  * `name`: `TEXT NOT NULL`. Nombre del comerciante *(columna `name`, no existe `full_name`)*.
  * `email`: `TEXT`. Correo electrónico sincronizado automáticamente desde `auth.users`.
  * `phone`: `TEXT`. Teléfono celular peruano (`CHECK (phone IS NULL OR phone ~ '^9[0-9]{8}$')`).
  * `avatar`: `TEXT`. URL o identificador del avatar *(columna `avatar`, no existe `avatar_url`)*.
  * `active_store_id`: `UUID`. Tienda activa en sesión (`FOREIGN KEY (id, active_store_id) REFERENCES public.store_members(user_id, store_id) ON DELETE SET NULL`).
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
  * `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
* **Fuente:** `rentabill_schema_v3.7.sql:129 a 144`

### 1.4. Tabla `public.cash_registers`
* **Propósito:** Cajas registradoras físicas o virtuales por sucursal (1FN).
* **Columnas:**
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
  * `store_id`: `UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE`.
  * `name`: `TEXT NOT NULL`. Nombre identificador de la caja (ej. "Caja Principal").
  * `is_active`: `BOOLEAN NOT NULL DEFAULT true`.
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
  * `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
* **Restricciones de Unicidad:**
  * `CONSTRAINT uq_cash_registers_store_name UNIQUE (store_id, name)`.
  * `CONSTRAINT uq_cash_registers_store_id UNIQUE (store_id, id)` (habilita FK compuesta desde `sales`).
* **Fuente:** `rentabill_schema_v3.7.sql:147 a 156`

### 1.5. Tabla `public.categories`
* **Propósito:** Clasificación taxonómica de productos por tienda.
* **Columnas:**
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
  * `store_id`: `UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE`.
  * `name`: `TEXT NOT NULL`. Nombre de la categoría.
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
  * `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
* **Restricciones de Unicidad:**
  * `CONSTRAINT uq_categories_store_id UNIQUE (store_id, id)` (habilita FK compuesta desde `products`).
  * `CONSTRAINT uq_categories_store_name UNIQUE (store_id, lower(trim(name)))` (línea 455).
* **Fuente:** `rentabill_schema_v3.7.sql:159 a 166`

### 1.6. Tabla `public.suppliers`
* **Propósito:** Directorio de distribuidores y proveedores comerciales por tienda.
* **Columnas:**
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
  * `store_id`: `UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE`.
  * `name`: `TEXT NOT NULL`. Razón social o nombre del distribuidor.
  * `payment_condition`: `TEXT NOT NULL CHECK (payment_condition IN ('contado', 'credito'))`.
  * `credit_days`: `INTEGER NOT NULL DEFAULT 0 CHECK (credit_days >= 0)`. Días de plazo pactados.
  * `contact_phone`: `TEXT CHECK (contact_phone IS NULL OR contact_phone ~ '^9[0-9]{8}$')`.
  * `rubro`: `TEXT`. Rubro comercial del proveedor.
  * `archived_at`: `TIMESTAMPTZ DEFAULT NULL`. Fecha de archivado lógico.
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
  * `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
* **Restricciones de Unicidad:** `CONSTRAINT uq_suppliers_store_id UNIQUE (store_id, id)`.
* **Nota de Columnas Inexistentes:** *(No existen columnas `contact_name`, `ruc` ni `notes` en el esquema)*.
* **Fuente:** `rentabill_schema_v3.7.sql:169 a 182`

### 1.7. Tabla `public.products`
* **Propósito:** Catálogo maestro y existencias de inventario físico en la tienda.
* **Columnas:**
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
  * `store_id`: `UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE`.
  * `category_id`: `UUID NOT NULL`. Categoría asociada (`FOREIGN KEY (store_id, category_id) REFERENCES public.categories(store_id, id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED`).
  * `barcode`: `TEXT`. Código de barras comercial (NULL si el artículo no posee código físico).
  * `sku`: `TEXT`. Código interno de control.
  * `name`: `TEXT NOT NULL`. Nombre o descripción del producto.
  * `unit`: `TEXT NOT NULL DEFAULT 'pza' CHECK (unit IN ('pza', 'kg', 'lt', 'caja'))`. Unidad de medida.
  * `cost_price`: `NUMERIC(12,2) NOT NULL CHECK (cost_price >= 0)`. Precio de compra en Soles.
  * `sale_price`: `NUMERIC(12,2) NOT NULL CHECK (sale_price >= 0)`. Precio de venta al público en Soles.
  * `stock`: `NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock >= 0)`. Existencia física (permite 3 decimales para balanza).
  * `reorder_point`: `NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (reorder_point >= 0)`. Umbral mínimo para reposición.
  * `estimated_speed`: `TEXT CHECK (estimated_speed IN ('RAPIDO', 'NORMAL', 'LENTO') OR estimated_speed IS NULL)`. Velocidad estimada inicial.
  * `units_sold`: `NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (units_sold >= 0)`. Unidades totales acumuladas vendidas.
  * `sales_count`: `INTEGER NOT NULL DEFAULT 0 CHECK (sales_count >= 0)`. Número de tickets donde participó.
  * `image_url`: `TEXT`. URL de la fotografía en Supabase Storage.
  * `archived_at`: `TIMESTAMPTZ DEFAULT NULL`. Marca de archivado lógico (NULL = activo).
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
  * `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
* **Restricciones e Índices:**
  * `CONSTRAINT uq_products_store_id UNIQUE (store_id, id)`.
  * `uq_products_store_barcode`: `CREATE UNIQUE INDEX uq_products_store_barcode ON public.products (store_id, barcode) WHERE (archived_at IS NULL AND barcode IS NOT NULL);` (línea 459).
  * `CONSTRAINT chk_products_barcode_not_blank CHECK (barcode IS NULL OR length(trim(barcode)) > 0)`.
  * `CONSTRAINT chk_products_sku_not_blank CHECK (sku IS NULL OR length(trim(sku)) > 0)`.
* **Nota de Diseño:** `products` NO tiene columna `status` (`ESTIMADO`/`REAL`). Este estado dinámico se calcula al vuelo en la vista `product_stats`.
* **Fuente:** `rentabill_schema_v3.7.sql:185 a 209`

### 1.8. Tabla `public.purchases`
* **Propósito:** Registro de compras de mercadería a crédito o al contado ingresadas a almacén.
* **Columnas:**
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
  * `store_id`: `UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE`.
  * `supplier_id`: `UUID`. Proveedor de la compra (`FOREIGN KEY (store_id, supplier_id) REFERENCES public.suppliers(store_id, id) ON DELETE SET NULL (supplier_id)`).
  * `total`: `NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0)`. Importe total de la compra *(columna `total`, no existe `total_amount`)*.
  * `payment_condition`: `TEXT NOT NULL DEFAULT 'contado' CHECK (payment_condition IN ('contado', 'credito'))`.
  * `credit_days`: `INTEGER NOT NULL DEFAULT 0 CHECK (credit_days >= 0)`. Días de crédito pactados.
  * `due_date`: `DATE GENERATED ALWAYS AS (((created_at AT TIME ZONE 'America/Lima')::date + credit_days)) STORED`. Fecha límite de pago generada automáticamente en zona horaria de Lima.
  * `paid_at`: `TIMESTAMPTZ`. Fecha y hora de liquidación del pago *(no existe columna `status`; la deuda está cancelada si `paid_at IS NOT NULL`)*.
  * `created_by`: `UUID REFERENCES auth.users(id) ON DELETE SET NULL`. Usuario que registró la compra en el sistema.
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
  * `note`: `TEXT`. Nota u observación del documento *(columna `note`, no existe `notes`)*.
* **Restricciones:**
  * `CONSTRAINT uq_purchases_store_id UNIQUE (store_id, id)`.
  * `CONSTRAINT chk_purchases_credit_days CHECK ((payment_condition = 'contado' AND credit_days = 0) OR (payment_condition = 'credito' AND credit_days > 0))`.
  * `CONSTRAINT chk_purchases_paid CHECK ((payment_condition = 'contado' AND paid_at IS NOT NULL) OR payment_condition = 'credito')`.
  * `CONSTRAINT chk_purchases_paid_after_created CHECK (paid_at IS NULL OR paid_at >= created_at)`.
* **Nota de Columnas Inexistentes:** *(No existen columnas `purchase_number` ni `simulation_ids` en la tabla física)*.
* **Fuente:** `rentabill_schema_v3.7.sql:219 a 247`

### 1.9. Tabla `public.purchase_items`
* **Propósito:** Partidas o renglones individuales de la orden de compra.
* **Columnas:**
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
  * `store_id`: `UUID NOT NULL`. Identificador de tienda para aislamiento multi-tenant en FKs compuestas.
  * `purchase_id`: `UUID NOT NULL`.
  * `product_id`: `UUID NOT NULL`.
  * `quantity`: `NUMERIC(12,3) NOT NULL CHECK (quantity > 0)`. Cantidad ingresada.
  * `unit_cost`: `NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0)`. Costo unitario pactado de compra.
  * `subtotal`: `NUMERIC(12,2) GENERATED ALWAYS AS (ROUND(quantity * unit_cost, 2)) STORED`. Subtotal calculado por PostgreSQL.
* **Claves Foráneas Compuestas:**
  * `CONSTRAINT fk_purchase_items_purchases_store FOREIGN KEY (store_id, purchase_id) REFERENCES public.purchases(store_id, id) ON DELETE CASCADE`.
  * `CONSTRAINT fk_purchase_items_products_store FOREIGN KEY (store_id, product_id) REFERENCES public.products(store_id, id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED`.
* **Fuente:** `rentabill_schema_v3.7.sql:250 a 262`

---

## 2. Tablas Transaccionales de Ventas y Almacén

### 2.1. Tabla `public.sales`
* **Propósito:** Cabecera de la transacción de venta emitida en el terminal POS.
* **Columnas:**
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
  * `store_id`: `UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE`.
  * `register_id`: `UUID NOT NULL`. Caja registradora emisora (`FOREIGN KEY (store_id, register_id) REFERENCES public.cash_registers(store_id, id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED`).
  * `ticket_number`: `TEXT NOT NULL`. Folio secuencial formateado.
  * `total_quantity`: `NUMERIC(12,3) NOT NULL CHECK (total_quantity > 0)`. Cantidad total de artículos vendidos.
  * `total_amount`: `NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0)`. Monto total cobrado en Soles.
  * `total_profit`: `NUMERIC(12,2) NOT NULL`. Ganancia neta total del ticket.
  * `payment_method`: `TEXT NOT NULL`. Medio de cobro (`'efectivo'`, `'tarjeta'`, `'yape'`, `'plin'`, `'transferencia'`, `'qr'`).
  * `cash_given`: `NUMERIC(12,2)`. Efectivo entregado por el comprador.
  * `change_given`: `NUMERIC(12,2) DEFAULT 0`. Vuelto entregado al cliente.
  * `cashier_name`: `TEXT NOT NULL`. Nombre visible del cajero responsable.
  * `user_id`: `UUID REFERENCES auth.users(id) ON DELETE SET NULL`. ID del usuario autenticado que emitió el cobro *(columna `user_id`, no existe `created_by`)*.
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
* **Restricciones de Unicidad y Dominio:**
  * `CONSTRAINT uq_sales_store_ticket UNIQUE (store_id, ticket_number)`.
  * `CONSTRAINT uq_sales_store_id UNIQUE (store_id, id)`.
  * `CONSTRAINT chk_sales_payment_exact CHECK ((payment_method = 'efectivo' AND cash_given IS NOT NULL AND cash_given >= total_amount AND change_given = cash_given - total_amount) OR (payment_method IN ('tarjeta', 'yape', 'plin', 'transferencia', 'qr') AND cash_given IS NULL AND change_given = 0))`.
* **Fuente:** `rentabill_schema_v3.7.sql:265 a 288`

### 2.2. Tabla `public.sale_items`
* **Propósito:** Detalle de partidas vendidas con desnormalización inmutable para balance histórico.
* **Columnas:**
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
  * `store_id`: `UUID NOT NULL`. Identificador de tienda para integridad en FKs compuestas.
  * `sale_id`: `UUID NOT NULL`.
  * `product_id`: `UUID`. Producto asociado (SET NULL al archivar/borrar).
  * `product_name`: `TEXT NOT NULL`. Snapshot del nombre al vender *(columna `product_name`, no existe `product_name_snapshot`)*.
  * `quantity`: `NUMERIC(12,3) NOT NULL CHECK (quantity > 0)`. Cantidad vendida.
  * `unit_price`: `NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0)`. Precio unitario pactado al cobrar.
  * `unit_cost`: `NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0)`. Snapshot del costo unitario de compra *(columna `unit_cost`, no existe `cost_price_at_sale`)*.
  * `subtotal`: `NUMERIC(12,2) NOT NULL CHECK (subtotal = round(quantity * unit_price, 2))`.
  * `profit`: `NUMERIC(12,2) NOT NULL CHECK (profit = subtotal - round(quantity * unit_cost, 2))`.
* **Claves Foráneas Compuestas:**
  * `CONSTRAINT fk_sale_items_sales_store FOREIGN KEY (store_id, sale_id) REFERENCES public.sales(store_id, id) ON DELETE CASCADE`.
  * `CONSTRAINT fk_sale_items_products_store FOREIGN KEY (store_id, product_id) REFERENCES public.products(store_id, id) ON DELETE SET NULL (product_id)`.
* **Fuente:** `rentabill_schema_v3.7.sql:294 a 309`

### 2.3. Tabla `public.inventory_movements` (Kardex)
* **Propósito:** Bitácora inmutable de auditoría de entradas, salidas y ajustes de existencias.
* **Columnas:**
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
  * `store_id`: `UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE`.
  * `product_id`: `UUID`. Producto afectado.
  * `product_name`: `TEXT NOT NULL`. Nombre histórico del producto.
  * `type`: `TEXT NOT NULL CHECK (type IN ('COMPRA', 'VENTA', 'AJUSTE'))`. Tipo de movimiento *(columna `type`, no existe `movement_type`)*.
  * `quantity`: `NUMERIC(12,3) NOT NULL`. Variación neta: negativo para ventas, positivo para compras/ajustes *(columna `quantity`, no existe `quantity_delta`)*.
  * `previous_stock`: `NUMERIC(12,3) NOT NULL`. Saldo de existencias anterior *(columna `previous_stock`, no existe `stock_before`)*.
  * `new_stock`: `NUMERIC(12,3) NOT NULL`. Saldo de existencias posterior *(columna `new_stock`, no existe `stock_after`)*.
  * `sale_id`: `UUID`. Venta que generó la salida (en tipo `VENTA`).
  * `purchase_id`: `UUID`. Compra que generó la entrada (en tipo `COMPRA`).
  * `supplier_id`: `UUID`. Proveedor de la compra asociada.
  * `user_id`: `UUID REFERENCES auth.users(id) ON DELETE SET NULL`. ID del operador.
  * `user_name`: `TEXT NOT NULL`. Nombre del usuario responsable.
  * `note`: `TEXT`. Motivo de la transacción (obligatorio en tipo `AJUSTE`).
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
* **Restricciones de Integridad Contable:**
  * `CONSTRAINT chk_kardex_stock_math CHECK (new_stock = previous_stock + quantity)`.
  * `CONSTRAINT chk_kardex_consistency CHECK ((type = 'VENTA' AND sale_id IS NOT NULL AND quantity < 0) OR (type = 'COMPRA' AND purchase_id IS NOT NULL AND quantity > 0) OR (type = 'AJUSTE' AND note IS NOT NULL AND length(trim(note)) > 0 AND quantity <> 0))`.
* **Claves Foráneas Compuestas:**
  * `CONSTRAINT fk_movements_products_store FOREIGN KEY (store_id, product_id) REFERENCES public.products(store_id, id) ON DELETE SET NULL (product_id)`.
  * `CONSTRAINT fk_movements_sales_store FOREIGN KEY (store_id, sale_id) REFERENCES public.sales(store_id, id) ON DELETE CASCADE`.
  * `CONSTRAINT fk_movements_purchases_store FOREIGN KEY (store_id, purchase_id) REFERENCES public.purchases(store_id, id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED`.
  * `CONSTRAINT fk_movements_suppliers_store FOREIGN KEY (store_id, supplier_id) REFERENCES public.suppliers(store_id, id) ON DELETE SET NULL (supplier_id)`.
* **Fuente:** `rentabill_schema_v3.7.sql:312 a 346`

---

## 3. Tablas de Simulaciones, Invitaciones y Ajustes

### 3.1. Tabla `public.simulations`
* **Propósito:** Registro prospectivo de simulaciones de compras ("qué pasaría si compro X") y comparación con resultados reales posteriores.
* **Columnas:**
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
  * `store_id`: `UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE`.
  * `created_by`: `UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL`.
  * `product_id`: `UUID`. Producto analizado (NULL si es un artículo nuevo no registrado en catálogo).
  * `product_name`: `TEXT NOT NULL`. Snapshot del nombre.
  * `supplier_id`: `UUID`.
  * `quantity`: `NUMERIC(12,3) NOT NULL CHECK (quantity > 0)`. Cantidad simulada a comprar.
  * `unit_cost`: `NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0)`. Costo unitario negociado.
  * `unit_price`: `NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0)`. Precio de venta proyectado.
  * `payment_condition`: `TEXT NOT NULL CHECK (payment_condition IN ('contado', 'credito'))`.
  * `credit_days`: `INTEGER NOT NULL DEFAULT 0 CHECK (credit_days >= 0)`.
  * `projected_days_to_sell`: `NUMERIC(8,2) NOT NULL CHECK (projected_days_to_sell > 0)`. Días estimados para vender todo el lote.
  * `projected_daily_profit`: `NUMERIC(12,2) NOT NULL`. Ganancia diaria proyectada en Soles.
  * `verdict`: `TEXT NOT NULL CHECK (verdict IN ('CONVIENE', 'RIESGOSO', 'NO_CONVIENE'))`. Dictamen algorítmico del simulador.
  * `status`: `TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'APLICADA', 'DESCARTADA'))`.
  * `purchase_id`: `UUID`. Compra real que materializó la simulación (solo si `status = 'APLICADA'`).
  * `actual_days_to_sell`: `NUMERIC(8,2) CHECK (actual_days_to_sell > 0)`. Días reales medidos tras la compra.
  * `actual_daily_profit`: `NUMERIC(12,2)`. Ganancia diaria real alcanzada.
  * `actual_measured_at`: `TIMESTAMPTZ`. Fecha de medición real.
  * `details`: `JSONB NOT NULL DEFAULT '{}'::jsonb`. Desglose extra no estructurado (ej. `score_gain`).
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
  * `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
* **Restricciones:**
  * `CONSTRAINT uq_simulations_store_id UNIQUE (store_id, id)`.
  * `CONSTRAINT chk_simulations_credit_days CHECK ((payment_condition = 'contado' AND credit_days = 0) OR (payment_condition = 'credito' AND credit_days > 0))`.
  * `CONSTRAINT chk_simulations_applied CHECK ((status = 'APLICADA') = (purchase_id IS NOT NULL))`.
  * `CONSTRAINT chk_simulations_actual CHECK ((actual_days_to_sell IS NULL AND actual_daily_profit IS NULL AND actual_measured_at IS NULL) OR (status = 'APLICADA' AND actual_days_to_sell IS NOT NULL AND actual_daily_profit IS NOT NULL AND actual_measured_at IS NOT NULL))`.
* **Fuente:** `rentabill_schema_v3.7.sql:351 a 398`

### 3.2. Tabla `public.store_invitations`
* **Propósito:** Invitaciones emitidas para incorporar colaboradores a una tienda comercial.
* **Columnas:**
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
  * `store_id`: `UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE`.
  * `email`: `TEXT NOT NULL`. Correo electrónico del usuario invitado *(no existe columna `target_user_code`)*.
  * `role`: `TEXT NOT NULL CHECK (role IN ('ADMIN', 'CAJERO', 'REPOSITOR'))`. Rol asignado al ingresar.
  * `token`: `TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`. Token aleatorio seguro de 48 caracteres hexadecimales.
  * `status`: `TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'ACEPTADA', 'EXPIRADA', 'CANCELADA'))`.
  * `invited_by`: `UUID REFERENCES auth.users(id) ON DELETE SET NULL`. Administrador que emitió la invitación.
  * `expires_at`: `TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')`. Vencimiento a 7 días.
  * `accepted_at`: `TIMESTAMPTZ`. Fecha de aceptación de la invitación.
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
* **Restricciones e Índices:**
  * `CONSTRAINT uq_store_invitations_token UNIQUE (token)`.
  * `CONSTRAINT uq_store_invitations_store_id UNIQUE (store_id, id)`.
  * `uq_store_invitations_pending`: `CREATE UNIQUE INDEX uq_store_invitations_pending ON public.store_invitations (store_id, lower(email)) WHERE (status = 'PENDIENTE');` (línea 496).
  * `idx_store_invitations_email`: `CREATE INDEX idx_store_invitations_email ON public.store_invitations(lower(email));` (línea 499).
* **Nota de Columnas Inexistentes:** *(No existe columna `target_user_code` ni `updated_at`)*.
* **Fuente:** `rentabill_schema_v3.7.sql:401 a 415`

### 3.3. Tabla `public.store_settings`
* **Propósito:** Parámetros operativos y metas financieras configuradas para la tienda.
* **Columnas:**
  * `store_id`: `UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE`. Relación 1:1 directa gobernada por la PK *(no existe columna `id` separada)*.
  * `daily_goal_percent`: `NUMERIC(5,2) NOT NULL DEFAULT 2.00 CHECK (daily_goal_percent >= 0 AND daily_goal_percent <= 100)`. Meta de ganancia diaria expresada como porcentaje del capital invertido (2.00 = 2.00% diario).
  * `warn_slow_days`: `INTEGER NOT NULL DEFAULT 15 CHECK (warn_slow_days >= 0)`. Días sin rotación para disparar alerta de producto lento.
  * `warn_low_stock`: `INTEGER NOT NULL DEFAULT 5 CHECK (warn_low_stock >= 0)`. Existencia mínima para alerta visual de reposición.
  * `auto_backup`: `BOOLEAN NOT NULL DEFAULT true`.
  * `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
* **Nota de Columnas Inexistentes:** *(No existen columnas `id`, `daily_sales_target` ni `max_credit_days`)*.
* **Fuente:** `rentabill_schema_v3.7.sql:418 a 426`

### 3.4. Tabla `public.user_preferences`
* **Propósito:** Opciones de personalización de la interfaz por usuario autenticado.
* **Columnas:**
  * `user_id`: `UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`. Relación 1:1 con la cuenta *(no existe columna `id` separada)*.
  * `dark_mode`: `BOOLEAN NOT NULL DEFAULT false`.
  * `language`: `TEXT NOT NULL DEFAULT 'Español (Sencillo)'`.
  * `daily_reminder`: `BOOLEAN NOT NULL DEFAULT true`.
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
  * `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
* **Fuente:** `rentabill_schema_v3.7.sql:429 a 436`

---

## 4. Vista de Estadísticas: `public.product_stats`

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
* **Regla de Transición `ESTIMADO` -> `REAL`:** La columna calculada `status` evalúa dinámicamente si el producto acumula al menos 5 ventas registradas (`sales_count >= 5`) o al menos 30 días en catálogo. Si se cumple cualquiera de las dos condiciones, transiciona automáticamente a `REAL`.
* **Fuente:** `rentabill_schema_v3.7.sql:502 a 526`
