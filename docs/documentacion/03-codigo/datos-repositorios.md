# Capa de Datos: Repositorios, Mappers, Cliente Supabase y Realtime

La capa de datos (`src/data/`) centraliza la persistencia y la comunicación con el backend en la nube (Supabase BaaS / PostgreSQL (Supabase)). Está compuesta por 11 repositorios atómicos, mappers de conversión snake_case a camelCase, un cliente de Supabase desacoplado, un traductor de errores SQLSTATE y un gestor de canales Realtime.

---

## 1. Los 11 Repositorios Especializados (`src/data/repositories/`)

| Repositorio | Métodos Principales | Tablas o RPCs Involucradas | Retorno y Propósito |
| :--- | :--- | :--- | :--- |
| **`productsRepository`** | `getByStoreId(storeId)`<br>`ensureCategory(storeId, name)`<br>`create(storeId, categoryId, data, initialStock)`<br>`update(storeId, productId, updates)`<br>`archive(storeId, productId)` | Tablas: `products`, `categories`, vista `product_stats` | Administra el catálogo y consulta de existencias con estadísticas calculadas. |
| **`salesRepository`** | `getByStoreId(storeId, limit)`<br>`processSale(params)` | RPC: `process_sale`<br>Tablas: `sales`, `sale_items` | Ejecuta cobro transaccional en servidor y recupera tickets de venta emitidos. |
| **`purchasesRepository`** | `getByStoreId(storeId)`<br>`processPurchase(params)`<br>`payPurchase(storeId, purchaseId)` | RPC: `process_purchase`<br>RPC: `pay_purchase`<br>Tablas: `purchases`, `purchase_items` | Registra compras a proveedores y liquida compras a crédito. |
| **`stockRepository`** | `getMovements(storeId, limit)`<br>`adjustStock(params)`<br>`insertMovement(storeId, movement)` | RPC: `adjust_stock`<br>Tabla: `inventory_movements` | Ejecuta mermas o ajustes manuales y audita movimientos de kardex. |
| **`storesRepository`** | `getStoreById(storeId)`<br>`updateStore(storeId, updates)`<br>`createStore(name, type, currency)`<br>`switchStore(storeId)`<br>`getUserStores(userId)` | RPC: `create_store`<br>RPC: `switch_store`<br>Tablas: `stores`, `store_members` | Administra negocios y membresías del usuario. |
| **`teamRepository`** | `getMembersByStoreId(storeId)`<br>`getInvitationsByStoreId(storeId)`<br>`inviteByCode(storeId, userCode, role)`<br>`cancelInvitation(id)`<br>`acceptInvitation(token)`<br>`respondInvitation(id, action)`<br>`changeMemberRole(storeId, userId, role)`<br>`removeMember(storeId, userId)`<br>`findUserById(userId)` | RPC: `invite_by_code`<br>RPC: `accept_invitation`<br>Tablas: `store_members`, `store_invitations`, `profiles` | Administra colaboradores, invitaciones por código y roles del equipo. |
| **`settingsRepository`** | `getSettings(storeId, userId)`<br>`updateStoreSettings(storeId, updates)`<br>`updateUserPreferences(userId, updates)` | Tablas: `store_settings`, `user_preferences` | Configuración de meta diaria porcentual y preferencias de usuario. |
| **`suppliersRepository`** | `getByStoreId(storeId)`<br>`create(storeId, supplier)` | Tabla: `suppliers` | Directorio de proveedores de mercadería. |
| **`simulationsRepository`**| `getByStoreId(storeId, suppliersMap)`<br>`create(storeId, sim)`<br>`markApplied(simulationId)` | Tabla: `simulations` | Registro y seguimiento de proyecciones prospectivas de compra. |
| **`storageRepository`** | `uploadFile(bucket, path, file)` | Supabase Storage: Buckets `product-images`, `store-logos` | Sube archivos de imagen y retorna su URL pública accesible. |
| **`authRepository`** | `signInWithPassword(email, pass)`<br>`signUp(email, pass, name, role, phone)`<br>`signOut()`<br>`getSession()`<br>`getUser()`<br>`getProfile(userId)`<br>`updateProfile(userId, updates)` | Supabase Auth (`auth.users`) y Tabla `profiles` | Autenticación, sesión y perfil de comerciante. |

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
| `unit_cost` | `unitCost` | `number` (Snapshot de costo unitario) |
| `product_name` | `productName` | `string` (Snapshot de nombre del producto) |
| `unit_price` | `unitPrice` | `number` (Precio de venta unitario) |
| `profit` | `profit` | `number` (Ganancia unitaria calculada) |

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

## 4. Gestor de Suscripciones en Tiempo Real (`src/data/realtime/storeRealtime.ts:1-62`)

Administra la conexión bidireccional WebSocket con el motor de réplica de Supabase:
* Conecta al canal dinámico `store-changes-${storeId}`.
* Escucha eventos `INSERT`, `UPDATE` y `DELETE` filtrados a nivel de servidor por `store_id = eq.${storeId}` para las tablas críticas (`products`, `sales`, `purchases`, `inventory_movements`).
* Al recibir una notificación en segundo plano, despacha los callbacks correspondientes para actualizar el catálogo o el kardex en memoria de forma inmediata.
