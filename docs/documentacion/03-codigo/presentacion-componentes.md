# Capa de Presentación: Componentes y Modales

Los 14 componentes y modales auxiliares de la interfaz residen en `src/presentation/components/` y están exportados en `src/presentation/components/index.ts:1-15`. Estos componentes están desacoplados de llamadas directas a la base de datos y reciben sus dependencias vía *props* o consumen el contexto `useInventory`.

---

## 1. Catálogo Exhaustivo de Componentes

### 1.1. BottomNavigation (`src/presentation/components/BottomNavigation.tsx:1-120`)
* **Propósito:** Barra de navegación inferior persistente optimizada para dispositivos móviles con botones táctiles grandes.
* **Props:** `activeTab: string`, `onTabChange: (tab: string) => void`, `role?: UserRole`.
* **Consumidores:** `src/App.tsx`.
* **Lógica por Rol:** Filtra las pestañas visibles según la matriz RBAC (`roles.ts`):
  * `ADMIN`: Muestra Pulso, Inventario, POS, Historial, Ajustes.
  * `CAJERO`: Muestra exclusivamente POS e Historial.
  * `REPOSITOR`: Muestra Inventario e Historial.

### 1.2. CalibrationModal (`src/presentation/components/CalibrationModal.tsx:1-95`)
* **Propósito:** Modal de felicitación y confirmación cuando uno o más artículos alcanzan 5 ventas y transicionan automáticamente de velocidad `ESTIMADO` a `REAL`.
* **Props:** `calibratedProducts: Product[]`, `isOpen: boolean`, `onClose: () => void`.
* **Consumidores:** `src/App.tsx` (activado reactivamente tras el retorno de `checkout`).

### 1.3. EditProductModal (`src/presentation/components/EditProductModal.tsx:1-380`)
* **Propósito:** Formulario modal para actualizar precios, costos, código de barras, fotos y existencias de un producto, así como ejecutar su archivado lógico.
* **Props:** `product: Product | null`, `isOpen: boolean`, `onClose: () => void`, `categories: Category[]`.
* **Consumidores:** `InventarioView.tsx`.
* **Casos de Uso Invocados:** `updateProductUseCase`, `deleteProductUseCase`, `uploadImageUseCase`.

### 1.4. Header (`src/presentation/components/Header.tsx:1-140`)
* **Propósito:** Cabecera superior compacta con el logotipo de Rentabill, indicador de conectividad (`EN VIVO` / `OFFLINE`), selector de tienda activa con flecha desplegable y acceso al perfil de usuario.
* **Props:** `storeName: string`, `onOpenStoreSelector: () => void`, `onOpenProfile: () => void`, `isOnline: boolean`.
* **Consumidores:** `src/App.tsx`.

### 1.5. HelpTutorialModal (`src/presentation/components/HelpTutorialModal.tsx:1-150`)
* **Propósito:** Modal educativo con carrusel interactivo que explica los conceptos clave de Rentabill: Puntaje de Salud, Dinero Invertido, Dinero Parado y transición de velocidades.
* **Props:** `isOpen: boolean`, `onClose: () => void`.
* **Consumidores:** `PulsoView.tsx`, `AjustesView.tsx`.

### 1.6. InvitationConfirmModal (`src/presentation/components/InvitationConfirmModal.tsx:1-110`)
* **Propósito:** Modal interactivo para aceptar o declinar una invitación recibida de un negocio para unirse a su equipo de trabajo.
* **Props:** `invitation: StoreInvitation | null`, `isOpen: boolean`, `onAccept: () => void`, `onReject: () => void`.
* **Consumidores:** `AjustesView.tsx`, `OnboardingView.tsx`.

### 1.7. InviteTeamModal (`src/presentation/components/InviteTeamModal.tsx:1-160`)
* **Propósito:** Formulario para que un Administrador vincule un colaborador ingresando su código público de usuario (formato `RENT-XXXX`, 9 caracteres alfanuméricos) y seleccionando su rol asignado (`CAJERO`, `REPOSITOR`, `ADMIN`).
* **Props:** `isOpen: boolean`, `onClose: () => void`, `onInvite: (userCode: string, role: UserRole) => Promise<void>`.
* **Consumidores:** `AjustesView.tsx`.
* **Casos de Uso Invocados:** `inviteMemberUseCase`.

### 1.8. LogoutConfirmModal (`src/presentation/components/LogoutConfirmModal.tsx:1-45`)
* **Propósito:** Diálogo de confirmación para prevenir cierres involuntarios de sesión de usuario en el mostrador.
* **Props:** `isOpen: boolean`, `onClose: () => void`, `onConfirm: () => void`.
* **Consumidores:** `AjustesView.tsx`, `Header.tsx`.

### 1.9. NotificationDropdown (`src/presentation/components/NotificationDropdown.tsx:1-90`)
* **Propósito:** Menú desplegable vinculado al ícono de campana en cabecera para mostrar alertas de existencias críticas e invitaciones pendientes.
* **Props:** `notifications: AppNotification[]`, `onSelect: (item: AppNotification) => void`.
* **Consumidores:** `Header.tsx`.

### 1.10. ProfileModal (`src/presentation/components/ProfileModal.tsx:1-130`)
* **Propósito:** Ficha de identidad del usuario actual donde visualiza su nombre, correo, rol actual y su código único público para recibir invitaciones.
* **Props:** `isOpen: boolean`, `onClose: () => void`, `user: ProfileUser | null`.
* **Consumidores:** `Header.tsx`.

### 1.11. RoleTestBanner (`src/presentation/components/RoleTestBanner.tsx:1-43`)
* **Propósito:** Banner de advertencia visual ubicado en el tope superior de la pantalla cuando el Administrador activa el modo de prueba de roles (`isTestingRole === true`).
* **Mensaje:** `"MODO PRUEBA: los cambios NO se guardan"`.
* **Props:** `role: UserRole`, `onExitTest: () => void`.
* **Consumidores:** `src/App.tsx`.
* **Comportamiento:** Solo se renderiza a Administradores que hayan activado explícitamente la simulación. Nunca es visible para usuarios reales con rol Cajero o Repositor autenticados normalmente.

### 1.12. StoreSelectorModal (`src/presentation/components/StoreSelectorModal.tsx:1-210`)
* **Propósito:** Ventana emergente tipo *bottom sheet* que lista todas las tiendas a las que pertenece el usuario, permite alternar la sucursal activa o crear una nueva tienda comercial.
* **Props:** `isOpen: boolean`, `onClose: () => void`, `stores: Store[]`, `currentStoreId: string`, `onSelectStore: (id: string) => void`, `onCreateStore: (data: NewStoreData) => void`.
* **Consumidores:** `src/App.tsx`.

### 1.13. ToastNotification (`src/presentation/components/ToastNotification.tsx:1-41`)
* **Propósito:** Componente de notificaciones flotantes temporizadas para retroalimentación instantánea ante operaciones exitosas, advertencias o aviso del modo prueba ("Modo prueba: nada se guardó").
* **Props:** `toasts: ToastItem[]`, `onDismiss: (id: string) => void`.
* **Consumidores:** `src/App.tsx`.

### 1.14. UnlinkedInviteCard (`src/presentation/components/UnlinkedInviteCard.tsx:1-80`)
* **Propósito:** Tarjeta informativa visible en la pantalla principal cuando el usuario tiene invitaciones de equipo pendientes por responder.
* **Props:** `invitationCount: number`, `onOpenInvitations: () => void`.
* **Consumidores:** `PulsoView.tsx`, `AjustesView.tsx`.
