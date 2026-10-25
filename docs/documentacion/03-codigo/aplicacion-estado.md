# Capa de Aplicación: Gestión del Estado Global (`InventoryContext.tsx`)

El estado global de la aplicación está centralizado en `src/application/state/InventoryContext.tsx`, el cual provee el contexto de React `InventoryProvider` y el hook consumidor `useInventory()`.

---

## 1. Análisis Técnico y Diagnóstico de Responsabilidades

> [!NOTE] Diagnóstico de Tamaño y Alcance
> El archivo `InventoryContext.tsx` contiene **2,961 líneas de código**. Actúa como el centro neurálgico de la reactividad del cliente, integrando 11 áreas de responsabilidad que en futuras iteraciones arquitectónicas deberían modularizarse en contextos particionados por dominio.

### Las 11 Responsabilidades Concentradas:
1. **Sesión y Autenticación:** Estado del usuario autenticado, perfil, inicialización y eventos `SIGNED_IN` / `SIGNED_OUT`.
2. **Contexto Multi-tienda:** Tienda activa (`currentStore`), lista de tiendas asociadas y cambio de contexto mediante `switchStore`.
3. **Gestión de Roles y Modo Prueba:** Rol efectivo del usuario, bandera `isTestingRole`, activación y desactivación de la previsualización.
4. **Catálogo de Productos y Categorías:** Carga del catálogo, filtros en memoria por texto/categoría y normalización de existencias.
5. **Terminal POS y Carrito:** Partidas del carrito, cantidades, widget de balanza a granel y regla de pago exacto por defecto en efectivo.
6. **Historial de Ventas:** Colección de tickets emitidos, detalle de partidas y cálculo de ventas del día.
7. **Compras y Cuentas por Pagar:** Registro de compras de mercadería a crédito/contado y liquidación de facturas con proveedores.
8. **Kardex de Inventario:** Histórico cronológico de movimientos de existencias (`inventory_movements`).
9. **Simulaciones de Reposición:** Guardado y consulta de proyecciones de compras previas.
10. **Equipo y Membresías:** Directorio de colaboradores de la tienda activa y gestión de invitaciones por código.
11. **Suscripciones en Tiempo Real y UI:** Gestión de canales WebSocket con Supabase Realtime, banderas de carga (`loading`) y apertura de modales.

---

## 2. Estado Reactivo Centralizado

El contexto administra las siguientes variables de estado principales:

| Variable de Estado | Tipo TypeScript | Propósito en la Aplicación |
| :--- | :--- | :--- |
| `user` | `ProfileUser \| null` | Usuario autenticado con perfil y código público (`user_code`) |
| `currentStore` | `Store \| null` | Sucursal actualmente seleccionada |
| `userStores` | `Store[]` | Todas las tiendas donde el usuario tiene membresía |
| `role` | `UserRole` | Rol activo (`'ADMIN'`, `'CAJERO'`, `'REPOSITOR'`) |
| `isTestingRole` | `boolean` | Bandera del modo simulación de roles en memoria |
| `products` | `Product[]` | Catálogo de productos de la tienda activa |
| `categories` | `Category[]` | Categorías de artículos disponibles |
| `cart` | `CartItem[]` | Artículos seleccionados en el punto de venta (POS) |
| `sales` | `Sale[]` | Histórico de ventas de la sucursal |
| `purchases` | `Purchase[]` | Facturas de compra a proveedores |
| `inventoryMovements`| `InventoryMovement[]`| Kardex inmutable de movimientos de almacén |
| `simulations` | `Simulation[]` | Proyecciones de compra registradas |
| `teamMembers` | `StoreMember[]` | Colaboradores vinculados a la tienda |
| `metrics` | `FinancialMetrics` | Métricas financieras globales derivadas en tiempo real |

---

## 3. Funciones Expuestas por `useInventory()`

El hook expone una interfaz completa de operaciones que encapsulan la invocación a casos de uso y la sincronización del estado:

### Operaciones de Venta y POS
* **`addToCart(product, quantity?)`:** Agrega una partida al carrito o incrementa su cantidad. Respeta stock disponible.
* **`removeFromCart(productId)`:** Elimina un ítem del carrito.
* **`updateCartQuantity(productId, quantity)`:** Modifica la cantidad de una partida (permite decimales para productos por kg).
* **`clearCart()`:** Restablece el carrito a vacío.
* **`processSale(paymentMethod, cashGiven)`:** Invoca `processSaleUseCase` protegido por `runWrite`. Emite ticket, descuenta stock, actualiza kardex y recalcula métricas.
* **Lógica de Pago "Exacto":** El contexto garantiza que al entrar al POS, al modificar el carrito o al completar una venta, el pago en efectivo se fija en el total exacto (vuelto S/ 0.00).

### Operaciones de Inventario
* **`adjustStock(productId, delta, note)`:** Invoca `adjustStockUseCase` con `runWrite`. Actualiza existencias y registra en kardex.
* **`createProduct(productData)`:** Invoca `registerProductUseCase`.
* **`updateProduct(productData)`:** Invoca `updateProductUseCase`.
* **`deleteProduct(productId)`:** Invoca `deleteProductUseCase` (archivado lógico).
* **`downloadProductsReport()`:** Genera y descarga el archivo CSV con UTF-8 BOM mediante `capacitorFilesystem`.

### Operaciones de Tienda y Equipo
* **`switchStore(storeId)`:** Invoca `switchStoreUseCase`. Desuscribe los canales en tiempo real de la tienda anterior, actualiza la sesión, descarga los datos de la nueva tienda y resetea el modo prueba.
* **`createStore(name, type)`:** Invoca `createStoreUseCase` y asocia al usuario como Administrador.
* **`inviteMember(userCode, role)`:** Invoca `inviteMemberUseCase`.
* **`respondInvitation(token, accept)`:** Invoca `respondInvitationUseCase`.

### Modo de Prueba de Roles
* **`setTestingRole(targetRole)`:** Activa la simulación asignando `isTestingRole = true` y ajustando la visibilidad de la interfaz.
* **`exitTestingRole()`:** Restablece de inmediato el rol real `ADMIN` y desactiva la bandera de simulación.

---

## 4. Suscripciones en Tiempo Real (Supabase Realtime)

El contexto ejecuta el hook de suscripción `subscribeToStoreRealtime(storeId, callbacks)` implementado en `src/data/realtime/storeRealtime.ts`:
* Escucha cambios en las tablas `products`, `sales`, `purchases` e `inventory_movements`.
* Al producirse una venta o un ingreso de mercadería en otro terminal, el WebSocket notifica al cliente, actualizando automáticamente el inventario local y recalculando el Puntaje de Salud sin requerir recarga de página.
