# Evolución del Esquema Relacional: de v3.0 a v3.7

Este documento sintetiza la evolución técnica del modelo de datos de Rentabill, documentando los problemas arquitectónicos detectados en versiones preliminares y cómo fueron subsanados en la versión definitiva `supabase/rentabill_schema_v3.7.sql`.

---

## 1. Cronología de Versiones del Esquema

### 1.1. Esquema v3.0.0 (`docs/historico/REDISENO_BASE_DE_DATOS.sql`)
* **Contexto:** Primer intento formal de rediseño relacional en 3FN para dotar al sistema de soporte multi-tienda y cajas registradoras.
* **Deficiencias Detectadas:**
  * Tablas nombradas con convenciones mixtas (`store_users` en lugar de `store_members`, `app_settings` en lugar de `store_settings`, `stock_logs` en lugar de `inventory_movements`).
  * Ausencia de snapshots inmutables en `sale_items`, lo que provocaba que al editar el precio de costo de un producto en el catálogo se alterase retrospectivamente el margen histórico de ventas pasadas.
  * Sin funciones RPC para cobro: las ventas se registraban desde el cliente mediante múltiples sentencias secuenciales sin transacción ACID.

### 1.2. Esquema v3.3.0 (`supabase/schema_completo.sql`)
* **Avances:**
  * Estandarización de tablas del dominio: `store_members`, `inventory_movements`, `store_invitations`, `store_settings`.
  * Incorporación de las primeras funciones RPC (`process_sale`, `adjust_stock`).
* **Deficiencias Detectadas:**
  * **Recursión Infinita en RLS:** Las políticas de seguridad sobre `store_members` consultaban la misma tabla `store_members` sin privilegios `SECURITY DEFINER`, provocando desbordamientos de pila (*stack depth limit exceeded*) al iniciar sesión.
  * **Firmas de RPC Inestables:** `process_sale` requería hasta 9 parámetros no uniformes (`p_expected_total`, `p_cash_register_id`), dificultando la integración con el cliente móvil.

### 1.3. Migraciones Intermedias (`supabase/migrations/`)
* Colección de 12 migraciones (fases 01 a 06 más hotfixes) que corrigieron de forma incremental:
  * Agregado de columnas acumuladoras de rotación (`units_sold`, `sales_count`).
  * Índices únicos parciales sobre códigos de barra (`WHERE archived_at IS NULL`).
  * Hotfix de recursión en RLS mediante funciones auxiliares.

---

## 2. Consolidación Definitiva en la Versión 3.7.0 (`supabase/rentabill_schema_v3.7.sql`)

La versión 3.7.0 unifica y estabiliza el modelo completo de datos:

1. **Alineación Estricta de Contratos RPC:**
   * La función `process_sale` estandariza su firma a 6 parámetros limpios y valida estrictamente que cada partida del JSON contenga las claves exactas `productId` y `quantity > 0`.
   * Devuelve la lista `calibrated_items` para notificar al comerciante en tiempo real cuando un artículo alcanza 5 ventas y transiciona a velocidad `REAL`.
2. **Kardex 100% Trazable:**
   * Mediante el trigger `trg_product_initial_stock`, todo producto creado con stock inicial genera de inmediato su asiento en `inventory_movements`, eliminando discrepancias contables.
3. **Manejo Seguro de Códigos de Barras Vacíos:**
   * El trigger `trg_normalize_product_codes` convierte cadenas vacías en `NULL`, impidiendo que dos productos sin código de barras colisionen en el índice único.
4. **Blindaje de Gobernanza:**
   * El trigger `check_last_store_admin` prohíbe explícitamente degradar o eliminar al propietario de la bodega o al último Administrador del equipo.
5. **Mitigación de Recursión y Securización de RLS:**
   * Implementación de `is_store_member` y `has_store_role` con `SECURITY DEFINER` y `SET search_path = ''`, garantizando rendimiento constante sin riesgo de inyecciones de esquema.
