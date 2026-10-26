# Visión General del Proyecto Rentabill

## 1. Definición y Propósito del Sistema

**Rentabill** es una solución tecnológica diseñada para resolver el problema de la gestión financiera e inventarios en el microcomercio minorista tradicional del Perú (bodegas, minimarkets y tiendas de abarrotes de barrio).

En la operación diaria de una bodega típica, el comerciante suele disponer de un capital de trabajo limitado, donde una porción significativa del dinero permanece inmovilizada en mercadería de baja rotación ("dinero parado"). Los sistemas de punto de venta (POS) convencionales actúan como registradoras mecánicas de cobro sin ofrecer visibilidad sobre el rendimiento del capital invertido. 

Rentabill transforma las ventas de mostrador y las existencias físicas en indicadores inmediatos de liquidez, rotación y salud financiera, combinando un terminal de venta ágil (con soporte para efectivo con vuelto y billeteras digitales como Yape y Plin) con un motor algorítmico de simulación de compras que previene la compra improductiva de mercadería.

---

## 2. Usuarios y Roles del Sistema

El sistema implementa un modelo de control de acceso basado en roles por sucursal (RBAC multi-tienda), definido en `src/shared/constants/roles.ts:1-35` y tipado en `src/shared/types/index.ts:18`:

| Rol | Identificador en Código y BD | Descripción y Responsabilidades Principales |
| :--- | :---: | :--- |
| **Administrador** | `ADMIN` | Propietario o administrador general de la tienda. Posee control absoluto sobre finanzas (Pulso), catálogo, ajuste de stock, compras, cobro en POS, historial global, configuración de tienda e invitación de personal. |
| **Cajero** | `CAJERO` | Colaborador en mostrador. Su acceso está restringido estrictamente a la venta y cobro en el POS (`POSView`), y a la visualización de su propio historial de ventas emitidas. No visualiza el margen financiero ni altera costos ni existencias. |
| **Repositor** | `REPOSITOR` | Encargado de almacén y reposición de mercadería. Tiene acceso a la gestión de productos, categorías, proveedores, ajuste manual de existencias y registro de compras ingresadas. No tiene acceso al módulo de cobro en POS ni puede emitir pagos de deudas a proveedores. |

---

## 3. Módulos y Pantallas del Sistema

La interfaz de usuario está compuesta por 10 pantallas principales organizadas en `src/presentation/pages/index.ts:1-11`:

1. **Pulso (`PulsoView.tsx`):** Tablero de control financiero. Visualiza el Puntaje de Salud Financiera (0 a 100), dinero invertido en existencias, dinero parado en productos sin rotación, margen proyectado y productos estrella vs. productos críticos.
2. **Inventario (`InventarioView.tsx`):** Catálogo de productos con búsqueda en tiempo real, filtros por categoría y velocidad, visualización de días de stock restante, margen unitario y acceso al ajuste manual de stock.
3. **Vender / POS (`POSView.tsx`):** Terminal punto de venta optimizado para mostrador rápido, escaneo de códigos de barra, selección de artículos al peso (`kg`), carrito y cobro multi-método (Efectivo con billetes rápidos S/ 10, 20, 50 o "Exacto", Yape, Plin, Tarjeta, Transferencia, QR).
4. **Historial (`HistorialView.tsx`):** Bitácora transaccional dividida en 4 pestañas: Ventas, Movimientos (Kardex), Simulaciones y Compras. Permite pagar compras pendientes a crédito.
5. **Simulador de Compras (`RestockSimulatorView.tsx`):** Herramienta prospectiva que calcula el retorno proyectado de inversión, días de recuperación de capital y veredicto de conveniencia antes de realizar un pedido a proveedores.
6. **Registro de Producto (`ProductRegisterView.tsx`):** Formulario de alta de productos con lectura de código de barras mediante cámara, carga de imagen, asignación de costos, precios y velocidad estimada inicial.
7. **Ajustes (`AjustesView.tsx`):** Panel de configuración de usuario, cambio de nombre de negocio, visualización de miembros del equipo, generación de invitaciones por código, enlace de QR de pago y descarga del reporte CSV de inventario.
8. **Autenticación (`AuthView.tsx`):** Pantalla de inicio de sesión, registro de nuevos comerciantes y formulario de restablecimiento de contraseña vía correo electrónico.
9. **Onboarding (`OnboardingView.tsx`):** Asistente paso a paso de bienvenida para nuevos usuarios donde registran su primera tienda y su código de usuario público (formato `RENT-XXXX`, 9 caracteres alfanuméricos).
10. **Error de Conexión (`ConnectionErrorView.tsx`):** Vista de bloqueo visual ante fallas de red o indisponibilidad de Supabase, con botón de reintento automático.

---

## 4. Alcance Tecnológico y Plataformas de Despliegue

El sistema opera bajo un esquema híbrido:
* **Aplicación Móvil Android:** Compilada de forma nativa mediante Capacitor (`android/app/build.gradle:10-11`, `versionCode 4`), accediendo a hardware como la cámara (Google ML Kit para escaneo de códigos de barras) y el sistema de archivos nativo de Android.
* **Progressive Web App (PWA):** Empaquetada mediante Vite (`vite.config.ts`), desplegable en cualquier navegador web moderno de escritorio o móvil con capacidades de diseño responsivo mediante Tailwind CSS v4.

---

## 5. Tecnologías y Versiones Verificadas

Todas las dependencias y versiones han sido leídas y contrastadas directamente contra `package.json:14-45`:

| Tecnología | Versión | Rol en el Proyecto |
| :--- | :---: | :--- |
| **React** | `19.0.1` | Librería principal de renderizado declarativo de UI |
| **TypeScript** | `7.0.2` | Tipado estático y chequeo en tiempo de compilación |
| **Vite** | `8.3.0` | Bundler y servidor de desarrollo ultra-rápido |
| **Tailwind CSS** | `4.3.3` | Motor de estilos utilitarios mediante `@tailwindcss/vite` |
| **Capacitor Core / CLI / Android** | `8.5.2` | Entorno de ejecución y puente nativo hacia Android SDK |
| **Supabase JS Client** | `2.117.1` | Cliente BaaS para PostgreSQL, Auth, Realtime y Storage |
| **Lucide React** | `0.546.0` | Set unificado de iconografía vectorizada SVG |
| **Motion** | `12.23.24` | Librería de animaciones fluidas de interfaz |

### Plugins Nativos de Capacitor Verificados
* `@capacitor-mlkit/barcode-scanning` (`8.2.1`): Escáner de códigos de barra mediante Google Play Services ML Kit.
* `@capacitor/camera` (`8.2.4`): Captura fotográfica para productos.
* `@capacitor/filesystem` (`8.1.5`): Escritura del reporte CSV en la carpeta nativa de Documentos del teléfono.
* `@capacitor/preferences` (`8.0.1`): Almacenamiento clave-valor de tokens de sesión y preferencias del usuario.
* `@capacitor/app` (`8.1.2`): Interceptación del botón atrás físico de Android para navegación limpia sin salir de la app.

---

## 6. Matriz de Trazabilidad de Extremo a Extremo

La siguiente matriz documenta la trazabilidad completa desde la interfaz de usuario hasta la capa de persistencia en la base de datos para todas las operaciones del sistema:

| Funcionalidad del Negocio | Pantalla / Modal (UI) | Caso de Uso (`src/application/`) | Repositorio (`src/data/`) | Tabla / RPC en BD |
| :--- | :--- | :--- | :--- | :--- |
| **Diagnóstico Financiero** | `PulsoView.tsx` | `financialMetrics.ts:calculateGlobalMetrics` | `productsRepository.getByStoreId` | `products`, `product_stats` |
| **Consulta de Catálogo** | `InventarioView.tsx` | N/A (Consumo reactivo de estado) | `productsRepository.getProducts` | `products`, `product_stats` |
| **Ajuste Manual de Stock** | `InventarioView.tsx`, `HistorialView.tsx` | `adjustStockUseCase.ts` | `stockRepository.adjustStock` | RPC `adjust_stock` |
| **Registro de Producto** | `ProductRegisterView.tsx` | `registerProductUseCase.ts` | `productsRepository.create` | `products` |
| **Edición de Producto** | `EditProductModal.tsx` | `updateProductUseCase.ts` | `productsRepository.updateProduct` | `products` |
| **Archivado / Baja Producto**| `EditProductModal.tsx` | `deleteProductUseCase.ts` | `productsRepository.archive` | `products` (`archived_at`) |
| **Subida de Imagen Producto**| `ProductRegisterView.tsx` | `uploadImageUseCase.ts` | `storageRepository.uploadProductImage` | Storage Bucket `product-images` |
| **Cobro y Venta en POS** | `POSView.tsx` | `processSaleUseCase.ts` | `salesRepository.processSale` | RPC `process_sale` |
| **Auditoría de Ventas** | `HistorialView.tsx` | N/A (Consumo reactivo de estado) | `salesRepository.getSales` | `sales`, `sale_items` |
| **Kardex de Movimientos** | `HistorialView.tsx` | N/A (Consumo reactivo de estado) | `stockRepository.getInventoryMovements` | `inventory_movements` |
| **Registro de Compras** | `RestockSimulatorView.tsx` | `processPurchaseUseCase.ts` | `purchasesRepository.processPurchase` | RPC `process_purchase` |
| **Pago de Deuda Compra** | `HistorialView.tsx` | `payPurchaseUseCase.ts` | `purchasesRepository.payPurchase` | RPC `pay_purchase` |
| **Creación de Simulación** | `RestockSimulatorView.tsx` | `createSimulationUseCase.ts` | `simulationsRepository.createSimulation` | `simulations` |
| **Confirmar Compra Simulada**| `RestockSimulatorView.tsx` | `confirmSimulationPurchaseUseCase.ts` | `purchasesRepository.processPurchase` | RPC `process_purchase` |
| **Creación de Tienda** | `StoreSelectorModal.tsx` | `createStoreUseCase.ts` | `storesRepository.createStore` | RPC `create_store` |
| **Cambio de Tienda Activa**| `StoreSelectorModal.tsx` | `switchStoreUseCase.ts` | `storesRepository.switchStore` | RPC `switch_store` |
| **Invitación de Miembro** | `AjustesView.tsx` | `inviteMemberUseCase.ts` | `teamRepository.inviteByCode` | RPC `invite_by_code` |
| **Aceptar Invitación** | `AjustesView.tsx` | `respondInvitationUseCase.ts` | `teamRepository.acceptInvitation` | RPC `accept_invitation` |
| **Inicio de Sesión** | `AuthView.tsx` | `authUseCases.ts:loginUseCase` | `authRepository.signIn` | Supabase Auth (`auth.users`) |
| **Registro de Usuario** | `AuthView.tsx` | `authUseCases.ts:registerUseCase`| `authRepository.signUp` | Supabase Auth (`profiles`) |
| **Exportación CSV** | `AjustesView.tsx` | `useInventory.downloadSalesExcel` | `capacitorFilesystem.writeFile` | Archivo nativo CSV (UTF-8 BOM) |
