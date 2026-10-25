# Capa de Aplicación: Casos de Uso del Sistema

Los casos de uso representan las operaciones atómicas del negocio en la capa de aplicación (`src/application/use-cases/`). Su responsabilidad consiste en validar invariantes de dominio antes de tocar la red, orquestar llamadas hacia los repositorios de datos y devolver resultados normalizados a la interfaz de usuario.

---

## 1. Módulo de Ventas (`sales/`)

### `processSaleUseCase` (`src/application/use-cases/sales/processSaleUseCase.ts:1-75`)
* **Propósito:** Validar y procesar la emisión de un ticket de venta en el punto de venta (POS).
* **Parámetros:**
  * `storeId: string`: UUID de la tienda activa.
  * `items: CartItem[]`: Partidas de la venta conteniendo `productId` y `quantity`.
  * `paymentMethod: PaymentMethod`: `'efectivo'`, `'tarjeta'`, `'yape'`, `'plin'`, `'transferencia'`, `'qr'`.
  * `cashGiven: number`: Monto entregado por el cliente si el medio es efectivo.
  * `registerId?: string`: Identificador de la caja registradora activa.
* **Validaciones e Invariantes:**
  * Verifica que `storeId` sea una cadena no vacía.
  * Verifica que `items` contenga al menos una partida y que toda cantidad sea estrictamente mayor a 0 (`quantity > 0`).
  * Si el método es `efectivo`, valida que `cashGiven >= totalAmount` (o permite pago exacto).
* **Repositorio Invocado:** `salesRepository.processSale(params)`.
* **Retorno:** Objeto `ProcessSaleResult` con `saleId`, `ticketNumber`, `totalAmount`, `changeGiven` y lista de productos calibrados a `REAL` si alcanzaron 5 ventas.

---

## 2. Módulo de Inventario (`inventory/`)

### `adjustStockUseCase` (`src/application/use-cases/inventory/adjustStockUseCase.ts:1-55`)
* **Propósito:** Ajustar manualmente las existencias físicas de un producto por mermas, desmedros o ingresos extraordinarios.
* **Parámetros:** `storeId: string`, `productId: string`, `quantityDelta: number`, `note: string`, `userName: string`.
* **Validaciones:** `quantityDelta !== 0` y motivo `note` no vacío (mínimo 3 caracteres para trazabilidad contable).
* **Repositorio Invocado:** `stockRepository.adjustStock` -> RPC `adjust_stock`.

### `registerProductUseCase` (`src/application/use-cases/inventory/registerProductUseCase.ts:1-60`)
* **Propósito:** Dar de alta un nuevo producto en el catálogo de la tienda.
* **Validaciones:**
  * Nombre de producto obligatorio (`trim().length > 0`).
  * Validación económica: `costPrice >= 0`, `salePrice > 0` y regla de coherencia comercial `salePrice > costPrice`.
  * Existencia inicial `stock >= 0`.
* **Repositorio Invocado:** `productsRepository.createProduct`.

### `updateProductUseCase` (`src/application/use-cases/inventory/updateProductUseCase.ts:1-50`)
* **Propósito:** Modificar datos generales, categorías o precios de un producto existente.
* **Repositorio Invocado:** `productsRepository.updateProduct`.

### `deleteProductUseCase` (`src/application/use-cases/inventory/deleteProductUseCase.ts:1-45`)
* **Propósito:** Dar de baja un artículo.
* **Comportamiento:** Si el producto registra ventas o movimientos en kardex, ejecuta un **archivado lógico** asignando la marca temporal `archived_at = now()`, preservando la integridad referencial histórica y liberando el código de barras para ser reutilizado.
* **Repositorio Invocado:** `productsRepository.archiveProduct`.

### `uploadImageUseCase` (`src/application/use-cases/inventory/uploadImageUseCase.ts:1-50`)
* **Propósito:** Subir la fotografía capturada o seleccionada para un producto.
* **Repositorio Invocado:** `storageRepository.uploadProductImage` (Bucket `product-images`).

---

## 3. Módulo de Compras y Abastecimiento (`purchases/`)

### `processPurchaseUseCase` (`src/application/use-cases/purchases/processPurchaseUseCase.ts:1-65`)
* **Propósito:** Registrar el ingreso formal de mercadería adquirida a proveedores.
* **Parámetros:** `storeId`, `supplierId`, `items`, `paymentCondition` (`'contado'` o `'credito'`), `creditDays`, `note`, `simulationIds`.
* **Validaciones:** Condición válida y partidas con costo y cantidad positivos.
* **Repositorio Invocado:** `purchasesRepository.processPurchase` -> RPC `process_purchase`.

### `payPurchaseUseCase` (`src/application/use-cases/purchases/payPurchaseUseCase.ts:1-40`)
* **Propósito:** Liquidar o cancelar una cuenta por pagar generada por una compra a crédito.
* **Repositorio Invocado:** `purchasesRepository.payPurchase` -> RPC `pay_purchase`.

---

## 4. Módulo de Simulaciones de Compras (`simulations/`)

### `createSimulationUseCase` (`src/application/use-cases/simulations/createSimulationUseCase.ts:1-55`)
* **Propósito:** Almacenar una corrida de proyección de compra calculada con `simulationEngine.ts`.
* **Repositorio Invocado:** `simulationsRepository.createSimulation`.

### `confirmSimulationPurchaseUseCase` (`src/application/use-cases/simulations/confirmSimulationPurchaseUseCase.ts:1-50`)
* **Propósito:** Ejecutar la orden de compra aprobada a partir de los datos proyectados en una simulación previa.
* **Repositorio Invocado:** `purchasesRepository.processPurchase`.

---

## 5. Módulo de Sucursales y Tiendas (`stores/`)

### `createStoreUseCase` (`src/application/use-cases/stores/createStoreUseCase.ts:1-45`)
* **Propósito:** Crear una nueva bodega asignando automáticamente al usuario creador como `ADMIN`.
* **Repositorio Invocado:** `storesRepository.createStore` -> RPC `create_store`.

### `switchStoreUseCase` (`src/application/use-cases/stores/switchStoreUseCase.ts:1-40`)
* **Propósito:** Conmutar el contexto activo de tienda del usuario y recargar los datos aislados por RLS.
* **Repositorio Invocado:** `storesRepository.switchStore` -> RPC `switch_store`.

---

## 6. Módulo de Equipo y Colaboradores (`team/`)

### `inviteMemberUseCase` (`src/application/use-cases/team/inviteMemberUseCase.ts:1-45`)
* **Propósito:** Generar invitación de equipo a partir del código de usuario público (`user_code`) destino.
* **Repositorio Invocado:** `teamRepository.inviteByCode` -> RPC `invite_by_code`.

### `respondInvitationUseCase` (`src/application/use-cases/team/respondInvitationUseCase.ts:1-45`)
* **Propósito:** Aceptar un token de invitación y vincularse a la tienda con el rol concedido.
* **Repositorio Invocado:** `teamRepository.acceptInvitation` -> RPC `accept_invitation`.

---

## 7. Módulo de Autenticación (`auth/`)

### `authUseCases` (`src/application/use-cases/auth/authUseCases.ts:1-85`)
* **`loginUseCase`:** Inicio de sesión con correo y contraseña.
* **`registerUseCase`:** Registro de nuevo usuario y creación de perfil en `profiles`.
* **`logoutUseCase`:** Cierre de sesión y limpieza de tokens en `KeyValueStorage`.
* **`resetPasswordUseCase`:** Solicitud de correo de recuperación.
* **Repositorio Invocado:** `authRepository`.
