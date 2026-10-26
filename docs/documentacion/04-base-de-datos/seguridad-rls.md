# Seguridad y Row Level Security (RLS) en la Base de Datos

El backend de Rentabill implementa un modelo de aislamiento multi-inquilino (*multi-tenant*) estricto mediante **Row Level Security (RLS)** y **FORCE ROW LEVEL SECURITY** en PostgreSQL 17 (`supabase/rentabill_schema_v3.7.sql:1711-1995 (funciones auxiliares en líneas 766-798)`).

---

## 1. Principios de Seguridad y Aislamiento

### 1.1. Activación de RLS y FORCE
A diferencia de configuraciones convencionales donde RLS solo aplica a roles no privilegiados, Rentabill aplica:
```sql
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;
```
* **`ENABLE ROW LEVEL SECURITY`:** Exige que toda consulta (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) pase obligatoriamente por una política evaluada en tiempo de ejecución.
* **`FORCE ROW LEVEL SECURITY`:** Garantiza que las políticas se apliquen incluso si la consulta es ejecutada por el propietario de la tabla (*table owner*), blindando el aislamiento de datos entre tiendas.

### 1.2. Funciones de Seguridad Auxiliares (`SECURITY DEFINER` con `search_path = ''`)
Para evaluar membresías sin degradar el rendimiento ni provocar recursión infinita en las políticas de `store_members`, el esquema implementa dos funciones de soporte:

1. **`is_store_member(p_store_id UUID)`:**
   ```sql
   CREATE OR REPLACE FUNCTION public.is_store_member(p_store_id UUID)
   RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
       SELECT EXISTS (
           SELECT 1 FROM public.store_members
           WHERE store_id = p_store_id AND user_id = (SELECT auth.uid())
       );
   $$;
   ```
2. **`has_store_role(p_store_id UUID, p_roles TEXT[])`:**
   ```sql
   CREATE OR REPLACE FUNCTION public.has_store_role(p_store_id UUID, p_roles TEXT[])
   RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
       SELECT EXISTS (
           SELECT 1 FROM public.store_members
           WHERE store_id = p_store_id AND user_id = (SELECT auth.uid()) AND role = ANY(p_roles)
       );
   $$;
   ```

### 1.3. ¿Por qué `SECURITY DEFINER` y `SET search_path = ''`?
* **Prevención de Recursión Infinita:** Si una política en `store_members` intentara consultar `store_members` como el usuario invocador, Postgres caería en un bucle recursivo infinito. `SECURITY DEFINER` ejecuta la comprobación con privilegios del sistema, cortando la recursión.
* **Inyección de `search_path` (Hijacking):** Al forzar `search_path = ''`, se bloquea cualquier intento de suplantar tablas del sistema mediante esquemas maliciosos, exigiendo referencias explícitas a `public.store_members`.

---

## 2. Matriz de Políticas RLS por Tabla

| Tabla | Operación | Roles Permitidos | Regla de la Política RLS |
| :--- | :---: | :--- | :--- |
| **`stores`** | `SELECT` | Miembros y Propietario | `public.is_store_member(id) OR owner_id = auth.uid()` |
| **`stores`** | `INSERT` | Autenticados | `auth.role() = 'authenticated'` |
| **`stores`** | `UPDATE` | Propietario / ADMIN | `owner_id = auth.uid() OR public.has_store_role(id, ARRAY['ADMIN'])` |
| **`store_members`** | `SELECT` | Miembros de la Tienda | `public.is_store_member(store_id)` |
| **`store_members`** | `INSERT/UPDATE/DELETE` | ADMIN de la Tienda | `public.has_store_role(store_id, ARRAY['ADMIN'])` (Con trigger `trg_protect_last_admin`) |
| **`profiles`** | `SELECT` | Autenticados | `auth.role() = 'authenticated'` |
| **`profiles`** | `UPDATE` | Propio Usuario | `id = auth.uid()` (Con trigger `trg_protect_user_code` inmutable) |
| **`products`** | `SELECT` | Miembros de la Tienda | `public.is_store_member(store_id)` |
| **`products`** | `INSERT/UPDATE` | `ADMIN`, `REPOSITOR` | `public.has_store_role(store_id, ARRAY['ADMIN', 'REPOSITOR'])` |
| **`products`** | `DELETE` | `ADMIN` | `public.has_store_role(store_id, ARRAY['ADMIN'])` |
| **`sales`** | `SELECT` | Miembros | `ADMIN` ve todas las ventas; `CAJERO` solo sus ventas (`user_id = (SELECT auth.uid())`) |
| **`sales`** | `INSERT` | Vía RPC / Cajero | Delegado de forma atómica a la función RPC `process_sale` |
| **`sale_items`** | `SELECT` | Miembros de la Tienda | `public.is_store_member(store_id)` |
| **`purchases`** | `SELECT` | Miembros de la Tienda | `public.is_store_member(store_id)` |
| **`purchases`** | `INSERT` | `ADMIN`, `REPOSITOR` | `public.has_store_role(store_id, ARRAY['ADMIN', 'REPOSITOR'])` |
| **`purchases`** | `UPDATE` | `ADMIN` | Exclusivo de Administrador (para liquidar deuda) |
| **`inventory_movements`**| `SELECT` | `ADMIN`, `REPOSITOR` | `public.has_store_role(store_id, ARRAY['ADMIN', 'REPOSITOR'])` |
| **`inventory_movements`**| `INSERT` | Triggers / RPC | Inserción automática por triggers de compras/ventas o RPC `adjust_stock` |
| **`simulations`** | `ALL` | `ADMIN` | Exclusivo de Administradores de la tienda |
| **`store_settings`** | `SELECT` | Miembros | `public.is_store_member(store_id)` |
| **`store_settings`** | `UPDATE` | `ADMIN` | `public.has_store_role(store_id, ARRAY['ADMIN'])` |

---

## 3. Disparadores de Seguridad Especiales

* **`trg_protect_last_admin` (`public.check_last_store_admin`):**
  Impide que el Administrador se degrade a sí mismo o se elimine si es el único administrador del negocio, evitando que una tienda quede huérfana de gestión. También bloquea la degradación del propietario registrado en `stores.owner_id`.
* **`trg_protect_user_code` (`public.protect_user_code`):**
  Garantiza que el `user_code` asignado en el alta de usuario sea inmutable de por vida, previniendo suplantación de identidad en transferencias de invitaciones.
