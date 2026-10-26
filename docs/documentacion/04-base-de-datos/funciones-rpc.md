# Catálogo de Funciones RPC en el Servidor (PostgreSQL v3.7.0)

Las funciones de Procedimiento Remoto (RPC) encapsulan transacciones ACID complejas en el servidor de base de datos (`supabase/rentabill_schema_v3.7.sql:762-1708`). Esto asegura que operaciones críticas (como el cobro con descuento de stock y kardex) se ejecuten atómicamente, sin riesgo de estados intermedios ni dependencias del cliente móvil.

---

## 1. `process_sale` (`supabase/rentabill_schema_v3.7.sql:1066-1340`)

* **Propósito:** Registrar un ticket de venta, descontar existencias físicas, auditar kardex, acumular estadísticas de rotación y evaluar calibración de velocidad.
* **Firma y Parámetros:**
  * `p_store_id: UUID`: Tienda activa.
  * `p_items: JSONB`: Array estricto de partidas con formato `[{"productId": "uuid", "quantity": 1.500}]`.
  * `p_payment_method: TEXT`: `'efectivo'`, `'tarjeta'`, `'yape'`, `'plin'`, `'transferencia'`, `'qr'` (en minúsculas).
  * `p_cash_given: NUMERIC DEFAULT NULL`: Monto entregado por el comprador.
  * `p_ticket_number: TEXT DEFAULT NULL`: Número de ticket formateado o autogenerado.
  * `p_register_id: UUID DEFAULT NULL`: Caja registradora activa.
* **Validaciones de Negocio:**
  * Valida que el invocador sea `ADMIN` o `CAJERO` en `p_store_id`.
  * Cada elemento de `p_items` debe contener la clave exacta `productId` y `quantity > 0` (Error `22023`).
  * Comprueba que cada producto tenga stock suficiente: `stock >= quantity` (Error `P0001: Stock insuficiente`).
  * Si el método es `efectivo`, valida que `p_cash_given >= total_amount`.
* **Tablas que Modifica:** Inserta en `sales`, `sale_items`, `inventory_movements` (como `VENTA`); descuenta `stock` e incrementa `units_sold` y `sales_count` en `products`.
* **Retorno:**
  ```json
  {
    "sale_id": "8f8b...e9b",
    "ticket_number": "TKT-00101",
    "total_amount": 16.80,
    "change_given": 3.20,
    "calibrated_items": ["prod-uuid-1"]
  }
  ```

---

## 2. `process_purchase` (`supabase/rentabill_schema_v3.7.sql:1341-1582`)

* **Propósito:** Registrar compras de mercadería a proveedores y aumentar existencias en inventario.
* **Parámetros:**
  * `p_store_id: UUID`, `p_supplier_id: UUID` (opcional), `p_items: JSONB` (`[{"product_id", "quantity", "unit_cost"}]`), `p_payment_condition: TEXT` (`'contado'` o `'credito'`), `p_credit_days: INTEGER`, `p_note: TEXT`, `p_simulation_ids: UUID[]`.
* **Validaciones:** Requiere rol `ADMIN` o `REPOSITOR`. Partidas con costo y cantidad estrictamente positivos.
* **Tablas que Modifica:** `purchases`, `purchase_items`, `products` (incrementa stock) e `inventory_movements` (como `COMPRA`).

---

## 3. `pay_purchase` (`supabase/rentabill_schema_v3.7.sql:1583-1639`)

* **Propósito:** Cambiar el estado de una compra a crédito de `PENDIENTE` a `PAGADA`.
* **Parámetros:** `p_store_id: UUID`, `p_purchase_id: UUID`.
* **Validaciones:** Exclusivo de `ADMIN`. La compra debe existir y encontrarse en estado `PENDIENTE`.
* **Tablas que Modifica:** Actualiza `purchases.paid_at = now()` y `purchases.updated_at = now()` (no existe columna `status`).

---

## 4. `adjust_stock` (`supabase/rentabill_schema_v3.7.sql:987-1065`)

* **Propósito:** Corregir existencias por mermas, desmedros o hallazgos físicos.
* **Parámetros:** `p_store_id: UUID`, `p_product_id: UUID`, `p_quantity_delta: NUMERIC`, `p_note: TEXT`, `p_user_name: TEXT`.
* **Validaciones:**
  * Rol `ADMIN` o `REPOSITOR`.
  * `p_quantity_delta <> 0` y motivo obligatorio `length(trim(p_note)) >= 3`.
  * Comprueba que el stock resultante no sea negativo (`stock + p_quantity_delta >= 0`).
* **Tablas que Modifica:** Actualiza `products.stock` e inserta en `inventory_movements` (como `AJUSTE`).

---

## 5. `create_store` (`supabase/rentabill_schema_v3.7.sql:839-907`)

* **Propósito:** Crear una nueva bodega y aprovisionar sus datos base en una sola transacción.
* **Parámetros:** `name: TEXT`, `type: TEXT`, `currency: TEXT DEFAULT 'PEN'` (parámetros sin prefijo `p_`).
* **Comportamiento:**
  * Inserta en `stores` asociando `owner_id = auth.uid()`.
  * Inserta en `store_members` vinculando al creador con rol `ADMIN`.
  * Inserta la primera caja registradora en `cash_registers` nombrada `'Caja Principal'`.
  * Inserta la configuración inicial en `store_settings` con meta porcentual de 2.00% (`daily_goal_percent = 2.00`).

---

## 6. `switch_store` (`supabase/rentabill_schema_v3.7.sql:800-838`)

* **Propósito:** Validar que el usuario pertenezca a la tienda solicitada antes de alternar de sucursal.
* **Parámetros:** `p_store_id: UUID`.
* **Validaciones:** Verifica membresía activa mediante `is_store_member(p_store_id)`.
* **Retorno:** Metadatos de la tienda, nombre y rol asignado.

---

## 7. `invite_by_code` (`supabase/rentabill_schema_v3.7.sql:1640-1708`)

* **Propósito:** Generar invitación formal de vinculación a la tienda.
* **Parámetros:** `p_store_id: UUID`, `p_user_code: TEXT` (formato `RENT-XXXX`, 9 caracteres en mayúsculas), `p_role: TEXT` (`'ADMIN'`, `'CAJERO'`, `'REPOSITOR'`).
* **Validaciones:**
  * Requiere rol `ADMIN` en la tienda.
  * Valida que el `user_code` exista en `profiles`.
  * Valida que el colaborador no sea ya miembro activo de la tienda.
* **Tablas que Modifica:** Inserta en `store_invitations` con token único y expiración a 7 días.

---

## 8. `accept_invitation` (`supabase/rentabill_schema_v3.7.sql:908-986`)

* **Propósito:** Consolidar la incorporación de un colaborador a una tienda.
* **Parámetros:** `p_token: TEXT`.
* **Validaciones:**
  * Token vigente en estado `PENDIENTE` y no expirado (`expires_at > now()`).
  * Valida que el usuario autenticado que responde sea el destinatario del `user_code`.
* **Tablas que Modifica:** Actualiza `store_invitations.status = 'ACEPTADA'` e inserta al usuario en `store_members` con el rol acordado.
