# Capa de Presentación: Pantallas Principales (Views)

La capa de presentación alberga las 10 pantallas de la aplicación en `src/presentation/pages/`, exportadas a través del barrel `src/presentation/pages/index.ts:1-12`. Cada pantalla interactúa con el estado global mediante el hook `useInventory()` y delega mutaciones a la capa de aplicación.

---

## 1. PulsoView (`src/presentation/pages/PulsoView.tsx:1-410`)

* **Propósito y Contenido:** Tablero de comando financiero para el bodeguero. Muestra:
  * Tacómetro radial del **Puntaje de Salud Financiera** (0 a 100) y etiqueta de semáforo (`OPTIMAL`, `STABLE`, `CRITICAL`) calculada mediante `financialMetrics.ts:calculateHealthScore`.
  * Tarjetas de **Dinero Invertido** (capital total en existencias: $\sum \text{stock} \times \text{costPrice}$) y **Dinero Parado** (capital en mercancía de rotación lenta).
  * Ganancia diaria promedio y meta configurada en la tienda.
  * Porcentaje de calibración de catálogo (% de productos en estado `REAL` vs. `ESTIMADO`).
  * Sección **Radar de Productos**: Top 3 Productos Estrella (`starProducts`) y Top 3 Dinero Parado (`trappedCapitalProducts`).
* **Estado y Casos de Uso:** Consume `useInventory()` (`products`, `metrics`, `currentStore`, `sales`). No dispara mutaciones directas de base de datos; opera como un consumidor puro de métricas.
* **Control por Roles:** Exclusivo para el rol `ADMIN`. Los roles `CAJERO` y `REPOSITOR` no tienen acceso a esta vista ni a la pestaña en el `BottomNavigation` (`src/presentation/components/BottomNavigation.tsx:32-48`).
* **Estados Vacíos y Errores:** Si no existen productos, muestra invitación visual para registrar el primer artículo con el botón "Registrar Producto".

---

## 2. InventarioView (`src/presentation/pages/InventarioView.tsx:1-490`)

* **Propósito y Contenido:** Catálogo general de productos. Muestra:
  * Barra de búsqueda por texto (nombre, código de barras o SKU) y selector de categorías.
  * Filtro por velocidad (`Todos`, `Rápido`, `Normal`, `Lento`) y selector de ordenamiento (Mayor/Menor ganancia diaria, Mayor ganancia por venta).
  * Tarjetas de producto: precio de venta, costo, stock actual, días restantes calculados, badge `REAL` o `ESTIMADO` y barra de progreso de ventas para calibrar (`salesCount / 5`).
* **Estado y Casos de Uso:** Consume `products`, `categories`, `selectedCategory`, `searchQuery`, `role`. Dispara la apertura de `EditProductModal` y `adjustStockUseCase`.
* **Control por Roles:**
  * `ADMIN`: Acceso total (creación, edición, ajuste manual de existencias y archivado).
  * `REPOSITOR`: Acceso a visualización, edición de ficha y ajuste manual de stock.
  * `CAJERO`: Solo lectura informativa (no se renderizan botones de edición ni ajuste manual de stock).
* **Estados Vacíos:** Si no hay coincidencias con la búsqueda o la categoría seleccionada, renderiza mensaje de "No se encontraron productos" con botón para limpiar filtros.

---

## 3. POSView (`src/presentation/pages/POSView.tsx:1-550`)

* **Propósito y Contenido:** Terminal Punto de Venta optimizado para velocidad en mostrador.
  * Buscador rápido y catálogo táctil con escaneo de código de barras mediante cámara (`capacitorBarcodeScanner`).
  * Carrito lateral o flotante con cálculo en tiempo real de subtotales, alerta preventiva de falta de existencias y widget de pesaje (`BulkScaleWidget`) para productos a granel vendidos por kilogramos (`kg`).
  * Panel de cobro: Selector de métodos (`efectivo`, `tarjeta`, `yape`, `plin`, `transferencia`, `qr`).
  * En efectivo: Botón "Exacto" por defecto (vuelto 0), billetes rápidos (S/ 10, 20, 50, 100) y cálculo automático de vuelto en Soles.
* **Estado y Casos de Uso:** Consume `cart`, `addToCart`, `removeFromCart`, `updateCartQuantity`, `clearCart`. Invoca `processSaleUseCase` (`src/application/use-cases/sales/processSaleUseCase.ts:1-75`).
* **Control por Roles:** Permitido para `ADMIN` y `CAJERO`. Denegado para `REPOSITOR`.
* **Estados Vacíos:** Carrito vacío muestra ilustración de bolsa de compras vacía y mensaje para agregar productos escaneando o seleccionando del catálogo.

---

## 4. HistorialView (`src/presentation/pages/HistorialView.tsx:1-480`)

* **Propósito y Contenido:** Centro de auditoría transaccional con 3 pestañas:
  1. **Ventas:** Lista cronológica de tickets emitidos, detalle de partidas, medio de pago, fecha/hora y cajero emisor.
  2. **Compras:** Facturas y compras ingresadas a proveedores, clasificadas en Contado o Crédito, estado de liquidación (`PENDIENTE`, `PAGADA`) y botón para amortizar/pagar deuda mediante `payPurchaseUseCase`.
  3. **Movimientos (Kardex):** Registro inmutable de transacciones de almacén (`inventory_movements`), con tipo (`VENTA`, `COMPRA`, `AJUSTE`), delta de cantidad y motivo (`note`).
* **Estado y Casos de Uso:** Consume `sales`, `purchases`, `inventoryMovements`. Invoca `payPurchaseUseCase` y `adjustStockUseCase`.
* **Control por Roles:**
  * `ADMIN`: Visualiza todas las ventas, todas las compras, el kardex y puede liquidar deudas de compra.
  * `CAJERO`: Solo visualiza sus propias ventas emitidas (`created_by === user.id`). Pestañas de compras y kardex ocultas.
  * `REPOSITOR`: Visualiza compras y kardex para auditoría de almacén. No puede pagar compras pendientes ni ver márgenes confidenciales de ventas.
* **Estados Vacíos:** Mensaje ilustrado independiente por pestaña cuando no hay registros en el período seleccionado.

---

## 5. RestockSimulatorView (`src/presentation/pages/RestockSimulatorView.tsx:1-510`)

* **Propósito y Contenido:** Herramienta interactiva para proyectar compras antes de gastar capital.
  * Permite seleccionar productos del catálogo, ingresar cantidad a comprar y costo unitario negociado.
  * Procesa mediante `simulationEngine.ts:calculateSimulation`: capital a invertir, ganancia neta estimada, margen proyectado, días de recuperación de inversión y veredicto inteligente (`CONVENIENTE`, `REGULAR`, `NO_CONVENIENTE`).
  * Botón para confirmar y convertir la simulación en una compra real de mercadería.
* **Estado y Casos de Uso:** Consume catálogo y proveedores. Invoca `createSimulationUseCase` y `confirmSimulationPurchaseUseCase`.
* **Control por Roles:** Exclusivo de `ADMIN`. Bloqueado para `CAJERO` y `REPOSITOR`.
* **Estados Vacíos:** Lista de simulación en blanco con selector desplegable de artículos y sugerencias de compra para productos con stock bajo.

---

## 6. ProductRegisterView (`src/presentation/pages/ProductRegisterView.tsx:1-430`)

* **Propósito y Contenido:** Formulario de alta para nuevos artículos:
  * Botón de escaneo con cámara nativa (`capacitorBarcodeScanner`) que autocompleta el código de barras.
  * Botón de captura de foto (`capacitorCamera`) y selector de imágenes para subir al bucket `product-images` de Supabase Storage.
  * Nombre, categoría relacional, unidad de medida (`pza`, `kg`, `lt`, `caja`), precio de costo, precio de venta, existencia inicial y velocidad estimada inicial (`RAPIDO`, `NORMAL`, `LENTO`).
* **Estado y Casos de Uso:** Invoca `registerProductUseCase` y `uploadImageUseCase`.
* **Control por Roles:** Permitido para `ADMIN` y `REPOSITOR`. Denegado para `CAJERO`.
* **Estados de Error:** Validación reactiva de campos obligatorios, prevención de costo mayor o igual al precio de venta, y alerta si el código de barras ya existe en la tienda activa.

---

## 7. AjustesView (`src/presentation/pages/AjustesView.tsx:1-580`)

* **Propósito y Contenido:** Panel administrativo de la tienda:
  * Perfil del usuario autenticado (código público de 6 caracteres `user_code`, correo, teléfono).
  * Datos del negocio (nombre, rubro, imagen de código QR de cobro para Yape/Plin).
  * Lista de colaboradores del equipo con roles activos (`ADMIN`, `CAJERO`, `REPOSITOR`).
  * Generación de invitaciones mediante código de usuario.
  * Botón "Descargar reporte de productos y ventas" en CSV (`useInventory.downloadProductsReport`).
  * Panel "Modo de Prueba de Roles" para previsualizar la interfaz como Cajero o Repositor sin persistir cambios.
* **Estado y Casos de Uso:** Invoca `inviteMemberUseCase`, `respondInvitationUseCase`, `capacitorFilesystem` y gestión de sesión con `authUseCases`.
* **Control por Roles:** Las secciones de equipo, descarga CSV y prueba de roles son exclusivas de `ADMIN`.

---

## 8. AuthView (`src/presentation/pages/AuthView.tsx:1-320`)

* **Propósito y Contenido:** Control de acceso al sistema con 3 modos:
  1. *Iniciar Sesión:* Correo electrónico y contraseña.
  2. *Crear Cuenta:* Nombre, correo, contraseña y confirmación.
  3. *Recuperar Contraseña:* Envío de enlace de restablecimiento al correo electrónico.
* **Estado y Casos de Uso:** Invoca `authUseCases.ts:loginUseCase`, `registerUseCase`, `resetPasswordUseCase`.
* **Estados de Error:** Mapeo de errores de autenticación formateados en español mediante `authErrorFormatter.ts`.

---

## 9. OnboardingView (`src/presentation/pages/OnboardingView.tsx:1-240`)

* **Propósito y Contenido:** Pantalla inicial obligatoria cuando un usuario registrado carece de tiendas asociadas.
  * Solicita el nombre comercial de la primera bodega, rubro comercial y moneda (`PEN`).
  * Permite ingresar un código de invitación recibido de otro comerciante para unirse a un negocio existente.
* **Estado y Casos de Uso:** Invoca `createStoreUseCase` o `respondInvitationUseCase`.

---

## 10. ConnectionErrorView (`src/presentation/pages/ConnectionErrorView.tsx:1-110`)

* **Propósito y Contenido:** Pantalla de contingencia visual cuando falla la conexión con Supabase o el dispositivo se encuentra sin red.
  * Muestra ilustración de desconexión y mensaje descriptivo amigable.
  * Botón interactivo "Reintentar conexión" que ejecuta una prueba de ping y recarga el contexto global.
