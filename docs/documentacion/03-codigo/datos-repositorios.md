# Capa de Datos: Repositorios, Mappers, Cliente Supabase y Realtime

La capa de datos (`src/data/`) centraliza la persistencia y la comunicación con el backend en la nube (Supabase BaaS / PostgreSQL 17). Está compuesta por 11 repositorios atómicos, mappers de conversión snake_case a camelCase, un cliente de Supabase desacoplado, un traductor de errores SQLSTATE y un gestor de canales Realtime.

---

## 1. Los 11 Repositorios Especializados (`src/data/repositories/`)

| Repositorio | Métodos Principales | Tablas o RPCs Involucradas | Retorno y Propósito |
| :--- | :--- | :--- | :--- |
| **`productsRepository`** | `getProducts(storeId)`<br>`createProduct(data)`<br>`updateProduct(id, data)`<br>`archiveProduct(id)` | Tablas: `products`, vista `product_stats` | `Product[]` / `Product`. Administra el catálogo y la consulta de existencias con estadísticas de ventas acumuladas. |
| **`salesRepository`** | `processSale(params)`<br>`getSales(storeId)`<br>`getSaleById(id)` | RPC: `process_sale`<br>Tablas: `sales`, `sale_items` | `ProcessSaleResult`. Ejecuta el cobro transaccional en servidor y recupera tickets de venta. |
| **`purchasesRepository`** | `processPurchase(params)`<br>`payPurchase(storeId, purchaseId)`<br>`getPurchases(storeId)` | RPC: `process_purchase`<br>RPC: `pay_purchase`<br>Tablas: `purchases`, `purchase_items` | Registra compras a proveedores, liquida cuentas por pagar a crédito y lista facturas. |
| **`stockRepository`** | `adjustStock(params)`<br>`getInventoryMovements(storeId)` | RPC: `adjust_stock`<br>Tabla: `inventory_movements` | Ejecuta mermas o ingresos manuales de existencias y provee la auditoría del kardex. |
| **`storesRepository`** | `createStore(name, type)`<br>`switchStore(storeId)`<br>`getUserStores()`<br>`updateStore(id, data)` | RPC: `create_store`<br>RPC: `switch_store`<br>Tablas: `stores`, `store_members` | Crea negocios, conmuta el contexto activo de tienda y recupera sucursales vinculadas. |
| **`teamRepository`** | `getStoreMembers(storeId)`<br>`inviteByCode(storeId, code, role)`<br>`acceptInvitation(token)`<br>`getPendingInvitations()` | RPC: `invite_by_code`<br>RPC: `accept_invitation`<br>Tablas: `store_members`, `store_invitations` | Consulta el equipo, emite invitaciones por código alfanumérico y procesa su aceptación. |
| **`settingsRepository`** | `getStoreSettings(storeId)`<br>`updateStoreSettings(storeId, data)`<br>`getUserPreferences()` | Tablas: `store_settings`, `user_preferences` | Administra la meta diaria de ganancia, días de crédito y preferencias de interfaz. |
| **`suppliersRepository`** | `getSuppliers(storeId)`<br>`createSupplier(data)`<br>`updateSupplier(id, data)` | Tabla: `suppliers` | Directorio de proveedores de mercadería (nombre, contacto, teléfono, RUC). |
| **`simulationsRepository`**| `getSimulations(storeId)`<br>`createSimulation(data)`<br>`deleteSimulation(id)` | Tabla: `simulations` | Historial de proyecciones prospectivas de reabastecimiento calculadas. |
| **`storageRepository`** | `uploadProductImage(storeId, file)` | Supabase Storage: Bucket `product-images` | URL pública de la fotografía subida para asociarla al producto. |
| **`authRepository`** | `signIn(email, pass)`<br>`signUp(email, pass, meta)`<br>`signOut()`<br>`getProfile(userId)` | Supabase Auth (`auth.users`) y Tabla `profiles` | Autenticación, creación de perfil y recuperación de código público `user_code`. |

---

## 2. Mappers de Datos: Equivalencias snake_case <-> camelCase (`src/data/mappers/`)

Para preservar el estándar idiomático de JavaScript/TypeScript en la aplicación (`camelCase`) y respetar el estándar de base de datos relacional de PostgreSQL (`snake_case`), los mappers ejecutan la traducción bidireccional estricta:

### 2.1. Tabla de Equivalencias de Productos (`productMapper.ts`)
| Campo en Base de Datos (`products` / `product_stats`) | Propiedad en TypeScript (`Product`) | Tipo de Dato |
| :--- | :--- | :---: |
| `id` | `id` | `string` (UUID) |
| `store_id` | `storeId` | `string` (UUID) |
| `category_id` | `categoryId` | `string \| undefined` |
| `cost_price` | `costPrice` | `number` |
| `sale_price` | `salePrice` | `number` |
| `stock` | `stock` | `number` |
| `estimated_speed` | `estimatedSpeed` | `'RAPIDO' \| 'NORMAL' \| 'LENTO'` |
| `units_sold` | `unitsSold` | `number` |
| `sales_count` | `salesCount` | `number` |
| `archived_at` | `archivedAt` | `string \| undefined` |

### 2.2. Tabla de Equivalencias de Ventas (`saleMapper.ts`)
| Campo en Base de Datos (`sales` / `sale_items`) | Propiedad en TypeScript (`Sale` / `SaleItem`) | Tipo de Dato |
| :--- | :--- | :---: |
| `ticket_number` | `ticketNumber` | `string` |
| `total_amount` | `totalAmount` | `number` |
| `payment_method` | `paymentMethod` | `PaymentMethod` |
| `cash_given` | `cashGiven` | `number \| undefined` |
| `change_given` | `changeGiven` | `number \| undefined` |
| `product_id` / `productId` | `productId` | `string` (UUID) |
| `cost_price_at_sale` | `costPriceAtSale` | `number` (Snapshot inmutable) |
| `product_name_snapshot` | `productNameSnapshot` | `string` (Snapshot inmutable) |

---

## 3. Cliente Supabase y Traductor de Errores (`src/data/supabase/`)

### 3.1. Desacoplamiento del Cliente (`client.ts:1-45`)
El cliente Supabase no importa bibliotecas nativas de Capacitor. En su lugar, expone la función inyectora:
```typescript
let storageAdapter: KeyValueStorage | null = null;

export function setSupabaseStorage(adapter: KeyValueStorage) {
  storageAdapter = adapter;
}
```
Al inicializarse, `@supabase/supabase-js` delega la persistencia de tokens de sesión a `storageAdapter`, resolviendo la inyección en el punto de entrada de la aplicación (`src/main.tsx`).

### 3.2. Traductor de Códigos de Error (`errorMapper.ts:1-60`)
Intercepta los errores emitidos por PostgreSQL (SQLSTATE) y los traduce a mensajes legibles en español:
* **`23505` (unique_violation):** *"El registro (código de barras o nombre) ya existe en la tienda"*.
* **`42501` (insufficient_privilege / RLS):** *"No tienes permisos suficientes para realizar esta acción"*.
* **`P0001` (raise_exception en RPC):** Extrae directamente el mensaje de validación de negocio emitido por la función PL/pgSQL (por ejemplo: *"Stock insuficiente para completar la venta"*).
* **`22023` (invalid_parameter_value):** *"Parámetros inválidos en la solicitud"*.

---

## 4. Gestor de Suscripciones en Tiempo Real (`src/data/realtime/storeRealtime.ts:1-90`)

Administra la conexión bidireccional WebSocket con el motor de réplica de Supabase:
* Conecta al canal dinámico `store-changes-${storeId}`.
* Escucha eventos `INSERT`, `UPDATE` y `DELETE` filtrados a nivel de servidor por `store_id = eq.${storeId}` para las tablas críticas (`products`, `sales`, `purchases`, `inventory_movements`).
* Al recibir una notificación en segundo plano, despacha los callbacks correspondientes para actualizar el catálogo o el kardex en memoria de forma inmediata.
