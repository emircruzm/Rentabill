# Guía de Sustentación Técnica ante el Jurado Evaluador

Este documento constituye la guía de defensa técnica del equipo ante las preguntas probables del docente o jurado calificador. Cada respuesta es concisa, directa y está respaldada por la ruta y línea exacta del código fuente o del esquema donde demostrarlo en vivo.

---

## 1. Preguntas Frecuentes sobre Arquitectura de Software

### P1: ¿Por qué eligieron una arquitectura en capas y no una arquitectura hexagonal pura o microservicios?
* **Respuesta:**
  Para el tamaño y alcance de una solución móvil de microcomercio, microservicios añadiría una complejidad innecesaria de red y despliegue. Se adoptó una **arquitectura en capas: 4 capas más un módulo compartido**, validada por el script `npm run check:layers`, porque desacopla limpiamente la interfaz visual de la infraestructura de datos y hardware nativo, permitiendo sustituir Supabase o Capacitor sin reescribir la lógica financiera.
* **Dónde demostrarlo:**
  * Estructura de carpetas en `src/`.
  * Reglas de validación: `scripts/check-layers.mjs:1-60`.
  * Ejecución en consola: `npm run check:layers`.

### P2: ¿Cómo evitan que la capa de presentación consuma directamente la base de datos?
* **Respuesta:**
  Mediante el analizador estático `check-layers.mjs` que audita en tiempo de compilación que ningún archivo de `src/presentation/` importe desde `src/data/`, `@supabase/*` o `@capacitor/*`. Toda interacción viaja a través de casos de uso (`src/application/use-cases/`) o del hook de estado `useInventory`.
* **Dónde demostrarlo:** `scripts/check-layers.mjs:20-35`.

### P3: ¿Por qué la persistencia de tokens de sesión no se importa directamente en el cliente de Supabase?
* **Respuesta:**
  Si `src/data/supabase/client.ts` importara `@capacitor/preferences`, la capa de datos dependería de una biblioteca nativa de plataforma móvil, violando las reglas de dependencia. Se resolvió mediante inversión de dependencias: se definió la interfaz `KeyValueStorage` en `src/shared/storage/storage.interface.ts` y se inyecta el adaptador nativo en `src/main.tsx` mediante `setSupabaseStorage()`.
* **Dónde demostrarlo:** `src/main.tsx:5-8` y `src/data/supabase/client.ts:8-16`.

---

## 2. Preguntas sobre Base de Datos y Supabase

### P4: Si dos cajeros cobran el último paquete de arroz al mismo tiempo, ¿cómo evitan el stock negativo?
* **Respuesta:**
  El cobro no se realiza mediante peticiones REST separadas desde el teléfono, sino mediante la función RPC transaccional `process_sale` en PostgreSQL. Dentro de la función, la consulta de existencias bloquea la fila mediante `FOR UPDATE` o valida `stock >= quantity`; si no hay stock suficiente, emite un `RAISE EXCEPTION` revirtiendo toda la transacción (*rollback*). Además, la tabla `products` tiene el constraint `CHECK (stock >= 0)`.
* **Dónde demostrarlo:** `supabase/rentabill_schema_v3.7.sql:1260-1320`.

### P5: ¿Cómo evitan que un producto que ya tuvo ventas rompa la integridad referencial al eliminarse?
* **Respuesta:**
  Mediante **archivado lógico** (*soft delete*). La función `deleteProductUseCase` no ejecuta un `DELETE` físico si existen registros contables asociados; en su lugar, asigna la marca temporal `archived_at = now()`. Para que el comerciante pueda reutilizar el código de barras en un producto nuevo, el índice único de código de barras es parcial: `UNIQUE (store_id, barcode) WHERE archived_at IS NULL`.
* **Dónde demostrarlo:** `supabase/rentabill_schema_v3.7.sql:240-250` y `src/application/use-cases/inventory/deleteProductUseCase.ts:15-30`.

### P6: ¿Por qué desnormalizaron `cost_price_at_sale` en `sale_items` en lugar de consultar siempre `products.cost_price`?
* **Respuesta:**
  Para preservar la inmutabilidad histórica del margen. Si en enero se vende un producto que costó S/ 3.00 a un precio de S/ 4.00, y en marzo el proveedor sube el costo a S/ 3.80, consultar `products.cost_price` alteraría retroactivamente la ganancia de enero. Al guardar un snapshot inmutable en `sale_items.cost_price_at_sale`, el balance contable histórico queda congelado.
* **Dónde demostrarlo:** `supabase/rentabill_schema_v3.7.sql:350-365`.

---

## 3. Preguntas sobre Seguridad y Acceso

### P7: ¿Por qué la clave `VITE_SUPABASE_ANON_KEY` está en el código del cliente si es una clave de base de datos?
* **Respuesta:**
  Porque la clave anónima de Supabase no es una credencial de administración. Actúa como un identificador de acceso público donde cada consulta es filtrada rigurosamente por el motor de **Row Level Security (RLS)** y `FORCE ROW LEVEL SECURITY`. Sin un JWT válido y membresía en `store_members`, la clave anónima no permite leer ni modificar datos ajenos. La clave de administración `service_role` jamás se incluye en el cliente.
* **Dónde demostrarlo:** `docs/documentacion/07-seguridad.md:40-60` y `.env.example`.

### P8: ¿Cómo funciona el modo prueba de roles y cómo garantizan que no altere la contabilidad real?
* **Respuesta:**
  Está gobernado por un punto único de control en la capa de aplicación: la función guardia `runWrite()` (`src/application/logic/writeGuard.ts`). Cuando `isTestingRole === true`, `runWrite` intercepta la mutación antes de enviar tráfico a Supabase, ejecuta la simulación en memoria de React y notifica *"Modo prueba: nada se guardó"*. Ninguna llamada de red ni sentencia SQL llega a la base de datos.
* **Dónde demostrarlo:** `src/application/logic/writeGuard.ts:1-40`.

---

## 4. Mapa Rápido de Ubicación del Código

| Funcionalidad / Concepto | Archivo y Línea de Referencia |
| :--- | :--- |
| **Cálculo de Margen y Velocidad** | `src/application/logic/financialMetrics.ts:1-120` |
| **Puntaje de Salud Financiera** | `src/application/logic/financialMetrics.ts:180-240` |
| **Motor de Simulación de Compras** | `src/application/logic/simulationEngine.ts:1-90` |
| **Cobro Atómico (processSale)** | `src/application/use-cases/sales/processSaleUseCase.ts:1-75` |
| **Transacción SQL de Venta** | `supabase/rentabill_schema_v3.7.sql:1200-1400` |
| **Políticas de RLS y Aislamiento** | `supabase/rentabill_schema_v3.7.sql:750-1120` |
| **Matriz de Permisos RBAC** | `src/shared/constants/roles.ts:1-50` |
| **Adaptador Nativo de Preferencias**| `src/platform/storage/capacitorPreferencesStorage.ts:1-30` |
| **Escáner de Códigos de Barras** | `src/platform/barcode/capacitorBarcodeScanner.ts:1-60` |
| **Exportación de Reporte CSV** | `src/platform/filesystem/capacitorFilesystem.ts:1-70` |

---

## 5. Declaración Honesta de las 5 Limitaciones Técnicas del Proyecto

Ante el jurado evaluador, el equipo debe exponer con honestidad y madurez técnica las siguientes limitaciones de diseño:

1. **Monolito de Estado en `InventoryContext.tsx`:** Concentra 2,961 líneas y 11 áreas de responsabilidad en un único contexto React. *Mejora futura:* Particionar en 5 contextos de dominio (Auth, Store, POS, Catalog, Realtime).
2. **Dependencia Estricta de Internet (Sin Cola Offline):** No implementa un motor de sincronización local persistente (*offline-first sync queue* con SQLite/WatermelonDB); si se corta la conexión, no se pueden registrar cobros en el servidor.
3. **Procesamiento de Métricas en el Cliente:** Fórmulas de rotación e indicadores financieros se procesan en el hilo principal del navegador en `financialMetrics.ts`. En bodegas con miles de productos puede impactar los FPS en celulares de gama baja.
4. **Reporte Único de Inventario en CSV:** La interfaz actual exporta exclusivamente el consolidado de productos con sus ventas y márgenes acumulados (`productos_YYYY-MM-DD.csv`), sin disponer de una descarga independiente ticket por ticket del histórico transaccional.
5. **Ausencia de Framework de Pruebas Unitarias Automatizadas:** No se cuenta con Jest o Vitest en `package.json`; la calidad se sustenta en el chequeo de tipos de TypeScript (`tsc`), el script de capas `check-layers.mjs` y el verificador matemático `verify-logic.mjs`.
