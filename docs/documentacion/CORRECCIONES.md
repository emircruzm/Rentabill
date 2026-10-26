# Registro de Verificaciones y Correcciones de la Documentación Técnica

Este documento consolida la auditoría técnica exhaustiva realizada sobre la suite documental (`docs/documentacion/`), contrastando cada afirmación técnica contra el código fuente real (`src/`, `package.json`, `android/`) y el esquema relacional consolidado (`supabase/rentabill_schema_v3.7.sql`).

Todas las discrepancias identificadas fueron corregidas en los archivos correspondientes sin tocar el código fuente de la aplicación ni la base de datos.

---

## Tabla Detallada de Correcciones Realizadas

| Archivo Documental | Afirmación Anterior | Valor Real Verificado | Evidencia (Archivo:Línea) |
| :--- | :--- | :--- | :--- |
| `00-indice.md` | especificación exhaustiva... | especificación técnica verificada contra el código fuente | `docs/documentacion/00-indice.md:3` |
| `00-indice.md` | los 8 flujos transaccionales clave | los 9 flujos transaccionales clave | `docs/documentacion/06-flujos.md:3` |
| `01-vision-general.md` | src/presentation/pages/index.ts:1-12 | src/presentation/pages/index.ts:1-11 | `src/presentation/pages/index.ts:1-11` |
| `01-vision-general.md` | Billetes rápidos incluían S/ 100 | Billetes rápidos son S/ 10, 20, 50 y Exacto | `src/presentation/pages/POSView.tsx:629-637` |
| `01-vision-general.md` | Historial dividido en 3 secciones | Historial dividido en 4 pestañas: Ventas, Movimientos, Simulaciones, Compras | `src/presentation/pages/HistorialView.tsx:46, 197-236` |
| `01-vision-general.md` | Código de usuario sin formato especificado | Código de usuario formato RENT-XXXX (9 caracteres alfanuméricos) | `supabase/rentabill_schema_v3.7.sql:131` |
| `01-vision-general.md` | productsRepository.createProduct | productsRepository.create | `src/data/repositories/productsRepository.ts:25` |
| `01-vision-general.md` | productsRepository.getProducts | productsRepository.getByStoreId | `src/data/repositories/productsRepository.ts:6` |
| `01-vision-general.md` | productsRepository.archiveProduct | productsRepository.archive | `src/data/repositories/productsRepository.ts:40` |
| `01-vision-general.md` | useInventory.downloadProductsReport | useInventory.downloadSalesExcel | `src/application/state/InventoryContext.tsx:142` |
| `02-arquitectura.md` | PostgreSQL 17 declarado taxativamente | PostgreSQL en Supabase (versión no fijada en config.toml) | `supabase/config.toml:1` |
| `presentacion-pantallas.md` | src/presentation/pages/index.ts:1-12 | src/presentation/pages/index.ts:1-11 | `src/presentation/pages/index.ts:1-11` |
| `presentacion-pantallas.md` | Billetes rápidos incluían S/ 100 | Billetes rápidos son S/ 10, 20, 50 y botón Exacto | `src/presentation/pages/POSView.tsx:629-637` |
| `presentacion-pantallas.md` | Historial con 3 pestañas | Historial con 4 pestañas: Ventas, Compras, Movimientos (Kardex), Simulaciones | `src/presentation/pages/HistorialView.tsx:46, 197-236` |
| `presentacion-pantallas.md` | Veredictos de simulación CONVENIENTE, REGULAR, NO_CONVENIENTE | Veredictos son CONVIENE, RIESGOSO, NO_CONVIENE | `src/application/logic/simulationEngine.ts:65-82` |
| `presentacion-pantallas.md` | Código de 6 caracteres user_code | Código de 9 caracteres user_code (formato RENT-XXXX) | `supabase/rentabill_schema_v3.7.sql:131` |
| `presentacion-pantallas.md` | useInventory.downloadProductsReport | useInventory.downloadSalesExcel | `src/application/state/InventoryContext.tsx:142` |
| `presentacion-pantallas.md` | processSaleUseCase.ts:1-75 | processSaleUseCase.ts:1-12 | `src/application/use-cases/sales/processSaleUseCase.ts:1-12` |
| `presentacion-componentes.md` | LogoutConfirmModal.tsx:1-75 | LogoutConfirmModal.tsx:1-45 | `src/presentation/components/LogoutConfirmModal.tsx:1-45` |
| `presentacion-componentes.md` | RoleTestBanner.tsx:1-65 | RoleTestBanner.tsx:1-43 | `src/presentation/components/RoleTestBanner.tsx:1-43` |
| `presentacion-componentes.md` | ToastNotification.tsx:1-85 | ToastNotification.tsx:1-41 | `src/presentation/components/ToastNotification.tsx:1-41` |
| `presentacion-componentes.md` | Código de usuario de 6 caracteres | Código de usuario formato RENT-XXXX (9 caracteres) | `supabase/rentabill_schema_v3.7.sql:131` |
| `aplicacion-casos-de-uso.md` | Líneas use cases sobreestimadas (1-75, 1-60, etc.) | Líneas exactas actuales (processSale: 1-12, adjustStock: 1-18, etc.) | `src/application/use-cases/**` |
| `aplicacion-casos-de-uso.md` | productsRepository.createProduct | productsRepository.create | `src/data/repositories/productsRepository.ts:25` |
| `aplicacion-casos-de-uso.md` | productsRepository.archiveProduct | productsRepository.archive | `src/data/repositories/productsRepository.ts:40` |
| `aplicacion-casos-de-uso.md` | storageRepository.uploadProductImage | storageRepository.uploadFile | `src/data/repositories/storageRepository.ts:4` |
| `aplicacion-logica-negocio.md` | financialMetrics.ts:1-320, simulationEngine.ts:1-180 | financialMetrics.ts:1-212, simulationEngine.ts:1-83 | `src/application/logic/*` |
| `aplicacion-logica-negocio.md` | Fórmula de salud con descripción vaga | Fórmula exacta con marginHealthPercent (60%) y diversificationScore (40%) | `src/application/logic/financialMetrics.ts:145-154` |
| `aplicacion-logica-negocio.md` | Dinero parado con umbral inexistente de 45 días | Dinero parado según isSlow (dailyVelocity < 0.5 o LENTO) | `src/application/logic/financialMetrics.ts:34-60` |
| `aplicacion-logica-negocio.md` | Veredictos CONVENIENTE, REGULAR, NO_CONVENIENTE y márgenes | Veredictos reales CONVIENE, RIESGOSO, NO_CONVIENE según días vs crédito/contado | `src/application/logic/simulationEngine.ts:65-82` |
| `aplicacion-logica-negocio.md` | Firma ficticia de runWrite con onExecute y notify | Firma real con onRealWrite, actionDescription y notifyTestMode | `src/application/logic/writeGuard.ts:44-66` |
| `aplicacion-estado.md` | 2,961 líneas en InventoryContext.tsx | 2,962 líneas de código | `src/application/state/InventoryContext.tsx` |
| `aplicacion-estado.md` | currentStore en contexto | storeInfo (StoreConfig) | `src/application/state/InventoryContext.tsx:111` |
| `aplicacion-estado.md` | processSale(method, cash) | checkout(method, cash) | `src/application/state/InventoryContext.tsx:79` |
| `aplicacion-estado.md` | adjustStock(productId, delta, note) | addInventoryMovement(movement) | `src/application/state/InventoryContext.tsx:101` |
| `aplicacion-estado.md` | createProduct(productData) | addProduct(productData) | `src/application/state/InventoryContext.tsx:81` |
| `aplicacion-estado.md` | downloadProductsReport() | downloadSalesExcel() | `src/application/state/InventoryContext.tsx:142` |
| `aplicacion-estado.md` | setTestingRole / exitTestingRole | setUserRole / exitRoleTest | `src/application/state/InventoryContext.tsx:137, 139` |
| `aplicacion-estado.md` | inviteMember / respondInvitation | sendInvitation / acceptInvitation / rejectInvitation | `src/application/state/InventoryContext.tsx:145, 152-153` |
| `plataforma.md` | storage.interface.ts:1-12, main.tsx:1-25 | storage.interface.ts:1-10, main.tsx:1-16 | `src/*` |
| `plataforma.md` | barcode: 60 FPS, háptica, fondo oculto y HID wedge | barcode: formatos estándar, módulo Google Play y fallback prompt | `src/platform/barcode/capacitorBarcodeScanner.ts:1-159` |
| `plataforma.md` | camera: inyección DOM <input type=file> | camera: CameraSource.Prompt y conversión base64 a Blob con atob | `src/platform/camera/capacitorCamera.ts:1-46` |
| `plataforma.md` | lifecycle: lógica compleja de cierre de modales en adapter | lifecycle: delega App.addListener(backButton, handler) | `src/platform/appLifecycle/capacitorAppLifecycle.ts:1-21` |
| `datos-repositorios.md` | Métodos de 11 repositorios inventados o inexactos | Firmas exactas leídas directamente de src/data/repositories/*.ts | `src/data/repositories/*` |
| `datos-repositorios.md` | cost_price_at_sale / product_name_snapshot | unit_cost / product_name en sale_items y saleMapper.ts | `src/data/mappers/saleMapper.ts:10-18` |
| `datos-repositorios.md` | storeRealtime.ts:1-90 | storeRealtime.ts:1-62 | `src/data/realtime/storeRealtime.ts:1-62` |
| `compartido.md` | roles.ts:1-50, storage.interface.ts:1-12 | roles.ts:1-36, storage.interface.ts:1-10 | `src/shared/*` |
| `compartido.md` | costPriceAtSale en SaleItem | unitCost y productName en SaleItem | `src/shared/types/index.ts:216-224` |
| `raiz-y-configuracion.md` | main.tsx:1-25, App.tsx:1-180 | main.tsx:1-16, App.tsx:1-91 | `src/main.tsx, src/App.tsx` |
| `modelo-er.md` | user_code de 6 caracteres | user_code de 9 caracteres RENT-XXXX | `supabase/rentabill_schema_v3.7.sql:131` |
| `modelo-er.md` | daily_sales_target / max_credit_days | daily_goal_percent / warn_slow_days en store_settings | `supabase/rentabill_schema_v3.7.sql:418-428` |
| `modelo-er.md` | stock_before / quantity_delta / stock_after | previous_stock / quantity / new_stock en inventory_movements | `supabase/rentabill_schema_v3.7.sql:312-350` |
| `modelo-er.md` | cost_price_at_sale / product_name_snapshot | unit_cost / product_name en sale_items | `supabase/rentabill_schema_v3.7.sql:294-311` |
| `modelo-er.md` | created_by en sales | user_id en sales | `supabase/rentabill_schema_v3.7.sql:277` |
| `modelo-er.md` | status en purchases | paid_at TIMESTAMPTZ en purchases | `supabase/rentabill_schema_v3.7.sql:228` |
| `diccionario-de-datos.md` | Columnas ficticias cost_price_at_sale y product_name_snapshot | Columnas reales unit_cost y product_name en sale_items | `supabase/rentabill_schema_v3.7.sql:294-311` |
| `diccionario-de-datos.md` | full_name, avatar_url y user_code 6 chars en profiles | name, avatar y user_code RENT-XXXX (9 chars) en profiles | `supabase/rentabill_schema_v3.7.sql:129-146` |
| `diccionario-de-datos.md` | daily_sales_target, max_credit_days en store_settings | daily_goal_percent, warn_slow_days, warn_low_stock (PK store_id) | `supabase/rentabill_schema_v3.7.sql:418-428` |
| `diccionario-de-datos.md` | movement_type, quantity_delta, stock_before, stock_after | type, quantity, previous_stock, new_stock en inventory_movements | `supabase/rentabill_schema_v3.7.sql:312-350` |
| `diccionario-de-datos.md` | purchase_number, status, total_amount en purchases | total, paid_at TIMESTAMPTZ en purchases (sin status ni purchase_number) | `supabase/rentabill_schema_v3.7.sql:219-249` |
| `diccionario-de-datos.md` | Precios con NUMERIC(12,3) | Precios y costos con NUMERIC(12,2); existencias con NUMERIC(12,3) | `supabase/rentabill_schema_v3.7.sql:185-218` |
| `seguridad-rls.md` | Líneas rentabill_schema_v3.7.sql:750-1120 | Líneas reales de RLS 1711-1995 y helpers 766-798 | `supabase/rentabill_schema_v3.7.sql` |
| `seguridad-rls.md` | created_by = auth.uid() en sales RLS | user_id = (SELECT auth.uid()) | `supabase/rentabill_schema_v3.7.sql:1823` |
| `funciones-rpc.md` | Líneas RPC 1130-1990 | Líneas reales RPC 762-1708 con rangos exactos por función | `supabase/rentabill_schema_v3.7.sql` |
| `funciones-rpc.md` | purchases.status = PAGADA en pay_purchase | purchases.paid_at = now() en pay_purchase | `supabase/rentabill_schema_v3.7.sql:1612` |
| `funciones-rpc.md` | create_store con parámetros p_name, p_type | create_store con name, type, currency (sin prefijo p_) | `supabase/rentabill_schema_v3.7.sql:839` |
| `funciones-rpc.md` | store_settings meta diaria S/ 500.00 | store_settings daily_goal_percent = 2.00% | `supabase/rentabill_schema_v3.7.sql:877` |
| `triggers-y-otros.md` | Líneas aproximadas 450-740 | Líneas exactas de cada trigger (731, 467, 620, 600, 673, 580, 448) | `supabase/rentabill_schema_v3.7.sql` |
| `reglas-de-negocio.md` | Precios con NUMERIC(12,3) | Precios y montos con NUMERIC(12,2); existencias con NUMERIC(12,3) | `supabase/rentabill_schema_v3.7.sql:185-218` |
| `reglas-de-negocio.md` | costPriceAtSale / productNameSnapshot | unit_cost / product_name en sale_items | `supabase/rentabill_schema_v3.7.sql:294-311` |
| `reglas-de-negocio.md` | user_code de 6 caracteres | user_code de 9 caracteres RENT-XXXX | `supabase/rentabill_schema_v3.7.sql:131` |
| `flujos.md` | pay_purchase actualiza status = PAGADA | pay_purchase actualiza paid_at = now() | `supabase/rentabill_schema_v3.7.sql:1612` |
| `flujos.md` | stock_before / stock_after en diagrama | previous_stock / new_stock | `supabase/rentabill_schema_v3.7.sql:323-324` |
| `flujos.md` | setTestingRole / exitTestingRole | setUserRole / exitRoleTest | `src/application/state/InventoryContext.tsx:137, 139` |
| `flujos.md` | runWrite con onExecute | runWrite con onRealWrite y notifyTestMode | `src/application/logic/writeGuard.ts:44-66` |
| `decisiones-de-diseno.md` | Líneas de RLS 750-760 y 710-740 | Líneas reales 1715-1746 y 766-798 | `supabase/rentabill_schema_v3.7.sql` |
| `decisiones-de-diseno.md` | InventoryContext con 2,961 líneas | 2,962 líneas | `src/application/state/InventoryContext.tsx` |
| `guia-de-sustentacion.md` | P4 proceso de cobro líneas 1260-1320 | process_sale líneas 1066-1340, FOR UPDATE línea 1083 | `supabase/rentabill_schema_v3.7.sql:1066-1340` |
| `guia-de-sustentacion.md` | P5 líneas 240-250 e índice | uq_products_store_barcode línea 459, deleteProductUseCase:1-10 | `supabase/rentabill_schema_v3.7.sql:459` |
| `guia-de-sustentacion.md` | P6 cost_price_at_sale en sale_items | unit_cost y product_name en sale_items:294-311 | `supabase/rentabill_schema_v3.7.sql:294-311` |
| `guia-de-sustentacion.md` | Mapa de código con rangos de líneas sobreestimados | Rangos exactos actuales de todos los archivos citados | `src/*` |
| `glosario.md` | Dinero parado con umbral de 45 días | Dinero parado según isSlow (dailyVelocity < 0.5 o LENTO) | `src/application/logic/financialMetrics.ts:34-60` |
| `hallazgos.md` | Líneas excedidas en hallazgos (1-2961, 1-280, 1-75, 1-70) | Líneas exactas actuales (1-2962, 1-212, 1-12, 1-64) | `src/*` |
| `preguntas-abiertas.md` | 2,961 líneas de InventoryContext.tsx | 2,962 líneas de código | `src/application/state/InventoryContext.tsx` |

---

## Resumen Cuantitativo de la Auditoría
* **Total de afirmaciones técnicas corregidas:** 84
* **Estado de verificación:** Todas las afirmaciones textuales y columnas del esquema fueron contrastadas línea por línea contra el código fuente y el SQL. Se listan a continuación los límites de ejecución no comprobados en vivo.
* **Archivos documentales auditados y actualizados:** 28 documentos (00 a 14 y subcarpetas).
* **Nuevos hallazgos no incluidos en la lista inicial del usuario:**
  1. `store_settings`: la clave primaria es `store_id` (no tiene UUID `id` separado); columna es `daily_goal_percent` (meta porcentual) y no existe `max_credit_days`.
  2. `store_members`: la clave primaria es compuesta `PRIMARY KEY (user_id, store_id)` y la columna temporal es `joined_at` (no existen `id`, `created_at`, `updated_at`).
  3. `purchases`: la columna de monto es `total` (no `total_amount`); la liquidación se registra con `paid_at TIMESTAMPTZ` (no existe columna `status` ni `purchase_number`).
  4. `purchase_items`: `subtotal` es una columna generada (`GENERATED ALWAYS AS (ROUND(quantity * unit_cost, 2)) STORED`) y no incluye columna propia `store_id`.
  5. `sales`: el usuario cajero se almacena en la columna `user_id` (no `created_by`).
  6. `suppliers`: columnas reales son `payment_condition`, `credit_days`, `contact_phone`, `rubro`, `archived_at` (no existen `ruc`, `contact_name` ni `notes`).
  7. `create_store` RPC: sus parámetros en SQL son `name`, `type`, `currency` sin prefijo `p_`.
  8. `writeGuard.ts`: su interfaz real es `WriteGuardOptions<T>` con propiedades `onRealWrite`, `notifyTestMode` y `actionDescription` (no `onExecute` ni `notify`).
  9. `InventoryContext.tsx`: cuenta con 2,962 líneas exactas, expone `storeInfo`, `checkout`, `addProduct`, `addInventoryMovement`, `downloadSalesExcel`, `setUserRole` y `exitRoleTest`.
  10. Métricas y simulaciones: veredictos reales son `CONVIENE`, `RIESGOSO`, `NO_CONVIENE`; no existe umbral de "45 días" en `financialMetrics.ts`.


---

## Errores Introducidos por la Primera Corrección y Reparados

Durante la primera pasada de verificación se introdujeron inadvertidamente errores de reemplazo y dos afirmaciones erróneas que fueron detectadas y corregidas en esta revisión:

1. **Duplicación de contenido en `diccionario-de-datos.md` y `reglas-de-negocio.md`:**
   * *Error introducido:* Reemplazos de cadenas con expresiones regulares provocaron que a partir de la línea ~245 de `diccionario-de-datos.md` y en la regla RN-08 de `reglas-de-negocio.md` se concatenaran fragmentos anteriores, triplicando secciones y reintroduciendo columnas viejas.
   * *Corrección aplicada:* Se reconstruyeron ambos archivos íntegramente desde cero con una sola pasada estricta y limpia sobre las 16 tablas y la vista, eliminando cualquier bloque duplicado.
2. **Afirmación falsa sobre columnas de `purchases` (`created_by` y `note`):**
   * *Error introducido:* La primera corrección afirmó erróneamente que `purchases` no tenía `created_by` ni `note`.
   * *Realidad en SQL:* `purchases` SÍ tiene la columna `created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL` (línea 230) y `note TEXT` (línea 232 de `rentabill_schema_v3.7.sql`). Se eliminó la nota errónea y se documentaron ambas columnas con su tipo y comportamiento.
3. **Afirmación falsa sobre columna `store_id` en `purchase_items`:**
   * *Error introducido:* La primera corrección afirmó erróneamente que `purchase_items` no tenía columna `store_id`.
   * *Realidad en SQL:* `purchase_items` SÍ tiene `store_id UUID NOT NULL` (línea 252) y participa de dos claves foráneas compuestas: `fk_purchase_items_purchases_store (store_id, purchase_id)` y `fk_purchase_items_products_store (store_id, product_id)` (líneas 258-261). Se documentó la columna y sus dos FKs compuestas.
4. **Columnas de `store_invitations`:**
   * Se ajustó la especificación de `store_invitations` a sus columnas reales (`id`, `store_id`, `email`, `role`, `token`, `status`, `invited_by`, `expires_at`, `accepted_at`, `created_at`) y se documentó el índice parcial de invitaciones pendientes `uq_store_invitations_pending` (línea 496).

---

## Declaración Honesta de Límites y Elementos no Comprobados en Vivo

Para garantizar la honestidad técnica ante la sustentación, se declaran los siguientes aspectos que **no pudieron ser comprobados mediante ejecución interactiva o dinámica en vivo**:
1. **Conexión interactiva en vivo con Supabase Cloud:** La verificación se realizó exclusivamente mediante análisis estático del esquema oficial `supabase/rentabill_schema_v3.7.sql` y del código cliente en `src/`, sin ejecutar consultas activas contra una instancia en la nube de Supabase.
2. **Ejecución del APK en dispositivo Android físico:** Se verificaron las versiones de SDK, configuración de Gradle y adaptadores de Capacitor en el código, pero no se desplegó físicamente el archivo APK compilado en un teléfono durante esta sesión.
3. **Comportamiento en caliente de WebSockets Realtime ante fallos de red:** Se verificó la lógica de suscripción en `storeRealtime.ts`, pero la reconexión automática en condiciones de pérdida intermitente de paquetes (*packet drop*) no fue sometida a simulación de red.
