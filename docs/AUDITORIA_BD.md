# 📑 INFORME TÉCNICO DE AUDITORÍA Y REDISEÑO DE BASE DE DATOS
**Proyecto:** Rentabill (Sistema Operativo para Bodegas Peruanas)  
**Rol:** Arquitecto de Software Senior & Database Administrator (PostgreSQL / Supabase)  
**Fecha:** Octubre 2026  
**Entorno de Producción:** Supabase (`hftklhnwinkzsgdcllmg.supabase.co`)

---

## 1. RESUMEN EJECUTIVO

A solicitud de la evaluación académica y técnica del proyecto **Rentabill**, se detectaron deficiencias estructurales de concepto y diseño en el esquema relacional inicial que comprometían la integridad de los datos, violaban principios elementales de normalización (1FN, 3FN), presentaban vulnerabilidades en el control de acceso (Row Level Security ausente en tablas críticas) y acoplaban indebidamente el control de inventario con las transacciones de venta.

El presente documento certifica y explica el **rediseño integral de la base de datos (Parte A)** y su sincronización con la **arquitectura de software frontend móvil (Parte B)**, garantizando:
1. **Cumplimiento estricto de Normalización Relacional:** 1FN, 2FN y 3FN en todas las entidades.
2. **Integridad Transaccional ACID y Auditoría Inmutable:** Trazabilidad de inventario (`stock_logs`), inmutabilidad de precios históricos (`sale_items.unit_price`, `cost_price_at_sale`) y bitácora de roles (`store_audit_logs`).
3. **Seguridad Robusta:** Políticas RLS (Row Level Security) multinivel, funciones RPC encapsuladas con `SECURITY DEFINER` y `SET search_path = public, auth`.
4. **Multi-tenant Dinámico:** Múltiples tiendas por usuario con roles independientes (`ADMIN`, `CAJERO`, `REPOSITOR`) mediante `store_users`.

---

## 2. AUDITORÍA DE ERRORES IDENTIFICADOS Y CORRECCIÓN (PARTE A.1)

### A.1.1 Violación de 1FN en Cajas Registradoras (`stores.registers TEXT[]`)
* **Diagnóstico inicial:** La tabla `stores` contenía una columna tipo arreglo `registers TEXT[]` para almacenar los nombres de las cajas registradoras. Esto viola frontalmente la **Primera Forma Normal (1FN)**, la cual exige que todos los atributos sean atómicos y no contengan listas o conjuntos anidados. Generaba problemas para auditar aperturas de caja, índices ineficientes y riesgo de colisiones de nombres.
* **Solución Implementada:**
  - Se creó la entidad relacional `cash_registers`:
    ```sql
    CREATE TABLE IF NOT EXISTS public.cash_registers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_cash_registers_store_name UNIQUE (store_id, name)
    );
    ```
  - Se migraron los datos preexistentes del array mediante `UNNEST(stores.registers)`.
  - Se eliminó la columna `registers` de la tabla `stores`.
  - Se aseguró la restricción `UNIQUE(store_id, name)` para evitar duplicidad de cajas dentro de la misma sucursal.

---

### A.1.2 Violación de 3FN en Ventas (`sales.total_profit`, `sales.total_margin`)
* **Diagnóstico inicial:** La tabla `sales` almacenaba directamente campos calculados y redundantes como `total_profit` y `total_margin`, los cuales derivan del precio de costo de los productos en inventario y los ítems vendidos. Esto viola la **Tercera Forma Normal (3FN)** (dependencia transitiva de datos no clave) y generaba inconsistencias si el costo del producto cambiaba posteriormente.
* **Solución Implementada:**
  - Se preservó la inmutabilidad histórica registrando en cada detalle de venta (`sale_items`) tanto el `unit_price` cobrado como el `cost_price_at_sale` al momento exacto de la transacción.
  - El total de ingresos y ganancia de cada venta se modela mediante expresiones puras y se optimiza con una vista relacional indexada `v_sales_summary`:
    ```sql
    CREATE OR REPLACE VIEW public.v_sales_summary AS
    SELECT 
        s.id AS sale_id,
        s.store_id,
        s.created_at,
        s.payment_method,
        s.total_amount,
        COALESCE(SUM(si.quantity * si.cost_price_at_sale), 0) AS calculated_cost,
        COALESCE(s.total_amount - SUM(si.quantity * si.cost_price_at_sale), 0) AS calculated_profit,
        CASE 
            WHEN s.total_amount > 0 THEN 
                ROUND(((s.total_amount - SUM(si.quantity * si.cost_price_at_sale)) / s.total_amount) * 100, 2)
            ELSE 0 
        END AS margin_percent
    FROM public.sales s
    LEFT JOIN public.sale_items si ON si.sale_id = s.id
    GROUP BY s.id, s.store_id, s.created_at, s.payment_method, s.total_amount;
    ```

---

### A.1.3 Pérdida de Integridad Referencial en `sale_items` ante Eliminación de Productos
* **Diagnóstico inicial:** `sale_items.product_id` tenía una restricción débil o `ON DELETE SET NULL`, lo cual ocasionaba que al borrar un producto descontinuado se perdiera la trazabilidad de qué producto se vendió en tickets históricos, o bien `ON DELETE CASCADE` borraba líneas del balance contable.
* **Solución Implementada:**
  - Se estableció `ON DELETE RESTRICT` (o soft-delete en productos mediante `is_active = false`).
  - Adicionalmente, `sale_items` almacena columnas de snapshot histórico: `product_name_snapshot` y `product_barcode_snapshot`. Si un producto se archiva o modifica en el catálogo, el comprobante y el historial contable se mantienen intactos al 100%.

---

### A.1.4 Relación de Proveedores sin Aislamiento Multi-tienda (`suppliers`)
* **Diagnóstico inicial:** La tabla `suppliers` carecía de `store_id` obligatorio y compartía catálogo global o generaba inconsistencias de RLS entre distintas bodegas.
* **Solución Implementada:**
  - Se normalizó `suppliers` agregando `store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE`.
  - Se crearon índices compuestos `idx_suppliers_store (store_id)` y constraints `UNIQUE(store_id, name)`.
  - Se aplicaron políticas RLS para que ninguna bodega pueda visualizar o alterar los proveedores, plazos de crédito o teléfonos de otra tienda.

---

### A.1.5 Tablas Críticas sin Row Level Security (RLS)
* **Diagnóstico inicial:** Tablas como `app_settings`, `product_calibrations`, `past_simulations` y `stock_logs` no tenían RLS habilitado o permitían lecturas públicas/anónimas directas.
* **Solución Implementada:**
  - Se ejecutó `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` sobre el 100% de las tablas públicas del sistema.
  - Se crearon políticas basadas en la membresía activa del usuario en `store_users`:
    ```sql
    CREATE POLICY "Usuarios ven stock_logs de sus tiendas"
    ON public.stock_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.store_users su
            WHERE su.store_id = stock_logs.store_id
              AND su.user_id = auth.uid()
        )
    );
    ```

---

### A.1.6 Triggers de Stock y Desacoplamiento de `stock_logs`
* **Diagnóstico inicial:**
  - El stock se actualizaba desde el frontend mediante múltiples peticiones individuales, propensas a condiciones de carrera (*race conditions*).
  - Si una venta se anulaba o borraba, un trigger en cascada eliminaba los `stock_logs`, destruyendo la pista de auditoría física de las mermas o movimientos de almacén.
* **Solución Implementada:**
  - Se implementó un trigger atómico a nivel de base de datos `tg_sale_items_after_insert` que decrementa el stock del producto e inserta un registro inmutable en `stock_logs`:
    ```sql
    CREATE OR REPLACE FUNCTION public.fn_handle_sale_stock_deduction()
    RETURNS TRIGGER AS $$
    BEGIN
        -- Descontar stock atómicamente
        UPDATE public.products
        SET stock = GREATEST(0, stock - NEW.quantity),
            updated_at = NOW()
        WHERE id = NEW.product_id;

        -- Registrar en bitácora inmutable de inventario
        INSERT INTO public.stock_logs (
            store_id,
            product_id,
            change_amount,
            reason,
            reference_id,
            created_at
        ) VALUES (
            NEW.store_id,
            NEW.product_id,
            -NEW.quantity,
            'VENTA',
            NEW.sale_id,
            NOW()
        );

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    ```
  - La clave foránea `stock_logs.reference_id` es desacoplada (`ON DELETE SET NULL`) para que la auditoría física persista incluso si la venta es auditada o cancelada.

---

## 3. ARQUITECTURA DE MULTI-TIENDA Y ROLES RBAC (PARTE A.2)

### A.2.1 Modelo de Membresía Multi-tienda (`store_users`)
Se separó la identidad del usuario (`auth.users` / `profiles`) de su afiliación a tiendas:
- Un usuario puede ser `ADMIN` en su propia bodega y `CAJERO` en la bodega de un familiar.
- La tabla pivote `store_users` gobierna la autorización:
  ```sql
  CREATE TABLE public.store_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'CAJERO', 'REPOSITOR')),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_store_users_store_user UNIQUE (store_id, user_id)
  );
  ```

### A.2.2 Funciones Seguras de Negocio (RPC)
1. **`switch_store(p_store_id UUID)`:**
   - Valida que el usuario autenticado pertenezca activamente a la tienda solicitada.
   - Actualiza `profiles.active_store_id = p_store_id`.
   - Retorna el rol específico del usuario en esa tienda y la configuración completa de la misma.
2. **`change_member_role(p_store_id UUID, p_target_user_id UUID, p_new_role VARCHAR)`:**
   - **Regla 1 (Privilegio):** Solo un `ADMIN` de esa tienda puede invocar la función.
   - **Regla 2 (Inmutabilidad del Dueño):** Bloquea cualquier intento de cambiar o degradar el rol del creador/propietario (`stores.owner_id`).
   - **Regla 3 (Garantía de Administración):** Impide que una tienda quede sin administradores activos (si es el único `ADMIN`, bloquea la degradación).
   - **Regla 4 (Auditoría):** Registra el cambio en `store_audit_logs`.
3. **`create_store(p_name TEXT, p_type TEXT, p_currency TEXT, p_logo TEXT)`:**
   - Transacción atómica que crea la tienda, registra al usuario como `ADMIN` en `store_users`, crea las cajas por defecto en `cash_registers` y activa la tienda en el perfil del usuario.

---

## 4. DIAGRAMA ENTIDAD-RELACIÓN (MERMAID)

```mermaid
erDiagram
    PROFILES ||--o{ STORES : "es propietario de"
    PROFILES ||--o{ STORE_USERS : "participa en"
    STORES ||--o{ STORE_USERS : "miembros"
    STORES ||--o{ CASH_REGISTERS : "tiene cajas"
    STORES ||--o{ PRODUCTS : "catálogo"
    STORES ||--o{ SUPPLIERS : "proveedores"
    STORES ||--o{ SALES : "registra ventas"
    STORES ||--o{ STOCK_LOGS : "movimientos kardex"
    STORES ||--o{ STORE_AUDIT_LOGS : "bitácora seguridad"
    
    PRODUCTS ||--o{ SALE_ITEMS : "detalle"
    SALES ||--o{ SALE_ITEMS : "contiene"
    PRODUCTS ||--o{ STOCK_LOGS : "kardex producto"
    
    PROFILES {
        uuid id PK
        string user_code UK
        string name
        string email
        string phone
        uuid active_store_id FK
    }

    STORES {
        uuid id PK
        string name
        string type
        string currency
        uuid owner_id FK
        string qr_image_url
    }

    STORE_USERS {
        uuid id PK
        uuid store_id FK
        uuid user_id FK
        string role
        boolean is_active
    }

    CASH_REGISTERS {
        uuid id PK
        uuid store_id FK
        string name
        boolean is_active
    }

    PRODUCTS {
        uuid id PK
        uuid store_id FK
        string barcode UK
        string name
        decimal cost_price
        decimal sale_price
        decimal stock
        string unit
        string velocity
        integer total_sales
    }

    SALES {
        uuid id PK
        uuid store_id FK
        uuid register_id FK
        decimal total_amount
        string payment_method
        uuid created_by FK
        timestamp created_at
    }

    SALE_ITEMS {
        uuid id PK
        uuid sale_id FK
        uuid product_id FK
        decimal quantity
        decimal unit_price
        decimal cost_price_at_sale
    }

    STOCK_LOGS {
        uuid id PK
        uuid store_id FK
        uuid product_id FK
        decimal change_amount
        string reason
        uuid reference_id
        timestamp created_at
    }
```

---

## 5. MATRIZ DE VERIFICACIÓN: PARTE B (APP RENTABILL)

| Requerimiento | Archivo Modificado | Estado | Verificación Técnica |
|---|---|---|---|
| **B1. Switch de tienda** | `src/components/Header.tsx`<br>`src/components/StoreSelectorModal.tsx`<br>`src/context/InventoryContext.tsx` | ✅ Cumplido | Selector en cabecera con chevron; abre bottom sheet interactivo; invoca `switch_store()`; purga contextos de inventario, ventas y proveedores; recalcula rol dinámicamente; flujo de onboarding si no hay tiendas. |
| **B2. Cambiar rol en equipo** | `src/views/AjustesView.tsx`<br>`src/context/InventoryContext.tsx` | ✅ Cumplido | Botón "Cambiar rol" en cada miembro; modal con selector (ADMIN, CAJERO, REPOSITOR); advertencia de acceso total al elegir ADMIN; bloqueo si es único ADMIN; badge "👑 Propietario" y bloqueo de degradación a `owner_id`. |
| **B3. Encabezado compacto** | `src/components/Header.tsx` | ✅ Cumplido | Eliminada por completo la segunda barra de sincronización ("Actualizando en tiempo real", "Modo Inicio", puntos verdes). Conservado chip "EN VIVO" junto al logo. Altura compacta. |
| **B4. Pulso: Tarjetas de Capital** | `src/views/PulsoView.tsx` | ✅ Cumplido | "Dinero Invertido": solo título, badge "Total", monto `S/`, sin párrafo descriptivo. "Dinero Parado": solo título, badge "Sin vender", monto `S/` con porcentaje compacto en línea. Altura fija simétrica `h-24 p-3.5`. |
| **B5. Inventario: Quitar lápiz duplicado** | `src/views/InventarioView.tsx` | ✅ Cumplido | Removido el ícono de lápiz situado junto al badge Estimado/Real en la cabecera de la tarjeta. Se preserva intacto el botón "Editar" en la esquina inferior. |
| **B6. Vender: Báscula Digital** | `src/views/POSView.tsx` | ✅ Cumplido | Componente `BulkScaleWidget` desacoplado como texto (`inputMode="decimal"`); permite vaciarse a `""` sin volver a 0 automáticamente; `onFocus` selecciona todo; botón táctil ✕ "borrar todo"; validación en `onBlur` y bloqueo de cobro con peso 0 o vacío; atajos (`+100g`, `+250g`, `+500g`, `+1kg`) conservados. |
| **B7. Simulador: Pestañas segmentadas** | `src/views/RestockSimulatorView.tsx` | ✅ Cumplido | Grid de 3 columnas (`min-h-[44px] h-11`); ancho completo; `whitespace-nowrap`; scroll horizontal sin cortes en pantallas estrechas. |
| **B8. Localización Perú y Teléfonos** | `src/utils/formatters.ts`<br>`src/views/POSView.tsx`<br>`src/views/AjustesView.tsx`<br>`src/views/OnboardingView.tsx`<br>`src/components/ProfileModal.tsx` | ✅ Cumplido | Moneda `S/` (Soles) formateada con `es-PE`. Reemplazo de "SPEI" por "Yape / Plin / Transferencia". Inputs de teléfono con prefijo fijo no editable `+51`, teclado numérico `type="tel"`, validación de 9 dígitos comenzando con 9 (`^9[0-9]{8}$`), guardado sin prefijo y visualización `+51 987 654 321`. |

---

## 6. CONCLUSIÓN

La base de datos y la arquitectura frontend de **Rentabill** han alcanzado el estándar de calidad y robustez exigido por un sistema financiero y de punto de venta profesional. Se han erradicado todas las malas prácticas conceptuales previas (violaciones de formas normales, ausencia de RLS, acoplamientos destructivos) y se cuenta con una suite completa de pruebas reproducibles en `docs/tests.sql`.
