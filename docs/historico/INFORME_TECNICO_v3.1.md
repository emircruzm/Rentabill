Nota: documento histórico, anterior a la reorganización en capas y a la versión 3.7 de la base de datos. Puede mencionar tablas o estructuras que ya no existen. Referencias vigentes: docs/ARQUITECTURA.md y supabase/rentabill_schema_v3.7.sql.

# INFORME TÉCNICO DE ARQUITECTURA Y DESARROLLO: RENTABILL
**Versión:** 3.1.0  
**Fecha:** Octubre 2026  
**Autor:** Arquitectura de Software Senior & DBA Especialista en PostgreSQL  
**Destinatarios:** Equipo de Ingeniería, Docentes Evaluadores y Nuevos Desarrolladores  
**Tecnologías:** React 19, TypeScript, Vite, Tailwind CSS, Supabase (PostgreSQL 17 + Auth + Storage + Realtime + RPC), Capacitor 8 (Android Nativo)

---

## 1. RESUMEN DEL SISTEMA

**Rentabill** es una plataforma móvil progresiva convertida a Android nativo mediante Capacitor, diseñada específicamente para el microcomercio minorista tradicional peruano (bodegas, minimarkets, ferreterías, boticas y tiendas de abarrotes con productos de código de barras y artículos vendidos al peso).

A diferencia de los terminales punto de venta (POS) convencionales que operan como registradoras pasivas de cobro, Rentabill implementa un motor financiero algorítmico que traduce el inventario físico y las transacciones en mostrador en indicadores de liquidez, rotación y rendimiento del capital de trabajo en tiempo real.

### Principios Fundamentales del Sistema:
1. **Modelo de Rentabilidad Progresiva:** En el alta de un artículo, el margen unitario bruto es conocido con precisión matemática ($P_{\text{venta}} - P_{\text{costo}}$), pero la velocidad de rotación es una incógnita. El sistema resuelve el problema del "arranque en frío" mediante una estimación manual inicial declarada por el comerciante (`estimatedSpeed`: Rápido 30%/semana, Normal 15%/semana, Lento 5%/semana), la cual es sustituida automáticamente por la velocidad real de mostrador en cuanto el producto alcanza **5 ventas registradas o 30 días de antigüedad** (transición a estado `REAL`).
2. **Puntaje de Salud Financiera (0–100):** Un índice heurístico compuesto que pondera en un 60% la calidad de los márgenes diarios y en un 40% la diversificación del capital sin estancamiento, clasificando la solvencia del negocio en un semáforo de tres estados: **Óptimo** ($\ge 80$), **Estable** ($50\text{–}79$) y **Crítico** ($< 50$).
3. **Arquitectura Multi-Tienda con RBAC por Sucursal:** Un único usuario autenticado puede pertenecer a múltiples bodegas simultáneamente con roles diferenciados e independientes (`ADMIN`, `CAJERO`, `REPOSITOR`), alternando de tienda sin cerrar sesión y con recálculo dinámico en caliente de vistas y contextos.
4. **Normalización Relacional Rigurosa (1FN, 2FN, 3FN):** Cajas registradoras aisladas en `cash_registers`, snapshots inmutables de costo y precio en `sale_items`, vista `v_sales_summary` para agregación contable, y transacciones ACID en servidor mediante la función `process_sale()`.
5. **Localización Peruana Integral:** Moneda oficial en Soles (`S/`), formato de moneda `es-PE` con prevención de desbordamientos visuales, soporte para billeteras digitales (Yape, Plin y transferencia bancaria), y validación de números móviles peruanos de 9 dígitos comenzando en 9 (`+51 9XX XXX XXX`).

---

## 2. INVENTARIO DE PANTALLAS Y COMPONENTES

### 2.1 Componente Header y Selector Multi-Tienda (Navegación Global)
* **Archivos:** [`src/components/Header.tsx`](file:///e:/Visitante/Downloads/Tarea-main/Tarea-main/src/components/Header.tsx), [`src/components/StoreSelectorModal.tsx`](file:///e:/Visitante/Downloads/Tarea-main/Tarea-main/src/components/StoreSelectorModal.tsx)
* **Función del componente:** `Header: React.FC`, `StoreSelectorModal: React.FC`
* **Elementos Visibles e Interacciones:**
  * **Cabecera Compacta:** Altura uniforme optimizada para pantallas táctiles de gama baja. Mantiene el logo corporativo con badge dinámico `EN VIVO` (o `OFFLINE`), eliminando barras secundarias redundantes para maximizar el área visible.
  * **Nombre de Tienda Activa:** Subtítulo interactivo bajo el rótulo "Rentabill" que muestra el nombre de la tienda activa acompañado de un glifo chevron (`ChevronDown`). Al pulsarlo despliega el bottom sheet `StoreSelectorModal`.
  * **Bottom Sheet "Mis Tiendas" (`createPortal`):** Renderizado en la raíz del documento (`document.body`) mediante `createPortal` con `z-index: 999`, evitando que quede atrapado bajo elementos con `position: sticky` o barras inferiores. Incluye:
    * Lista de tiendas vinculadas a la cuenta con indicador de rol (`Dueño (Admin)`, `Administrador`, `Cajero`, `Repositor`), rubro comercial y check verde en la tienda `Activa`.
    * Cierre táctil al presionar el backdrop oscurecido, al deslizar o mediante el botón físico/virtual **Atrás de Android** gestionado con `@capacitor/app` (`App.addListener('backButton')`).
    * Botón final limpio **"Agregar tienda"** (sin duplicación de signos `+`).
* **Lógica de Negocio y Transición:**
  * Al seleccionar una tienda distinta, se ejecuta `switchStore(storeId)` que invoca la función RPC remota `switch_store(p_store_id)` en Supabase.
  * **Purga y Recarga de Contexto:** Reinicia reactivamente los estados de `InventoryContext` (catálogo, tickets, kardex, proveedores, simulaciones y miembros) vinculados al nuevo `store_id`.

---

### 2.2 Vista Pulso (Dashboard Financiero)
* **Archivo:** [`src/views/PulsoView.tsx`](file:///e:/Visitante/Downloads/Tarea-main/Tarea-main/src/views/PulsoView.tsx)
* **Función del componente:** `PulsoView: React.FC`
* **Elementos Visibles:**
  * Tacómetro radial SVG (`gauge`) con el Puntaje de Salud (0–100) y semáforo visual (`OPTIMAL`, `STABLE`, `CRITICAL`).
  * Indicador de Modo Semilla vs. Modo Calibrado (% de capital basado en datos reales vs. estimados).
  * Contador acumulado de tickets de venta emitidos.
  * **Tarjetas de Capital Disociado (Diseño Compacto Simétrico):**
    * **Dinero Invertido:** Título superior, badge azul "Total", monto monetario en Soles (`S/`) con formato `es-PE` y altura fija (`h-24 p-3.5`).
    * **Dinero Parado:** Título superior, badge ámbar "Sin vender", monto en Soles (`S/`) y porcentaje relativo inmovilizado.
  * Ganancia Diaria Promedio de la bodega comparada contra la meta diaria configurada (por defecto 2.0% al día).
  * Factores de Rendimiento: Barra de "Ganancia por Venta" (60% del peso) y Barra de "Velocidad y Variedad" (40% del peso).
  * Radar de Productos: Top 3 Productos Estrella (`starProducts`) y Top 3 Dinero Parado (`trappedCapitalProducts`).
  * Banner "Consejo de Caja" con proyección de liquidez recuperable (12% del dinero parado).
* **Fórmulas Matemáticas:**
  * Offset perimetral del tacómetro: $\text{offset} = 2\pi r \times (1 - \frac{\text{totalScore}}{100})$ con radio $r=70$.
  * Umbral de calibración: Opera en Modo Calibrado cuando $\text{realCapitalPercent} \ge 50\%$.
  * Dinero Invertido: $\sum (\text{costPrice} \times \text{basePurchasedQuantity})$.
  * Dinero Parado: $\sum \text{investedCapital}$ de todos los artículos con rotación lenta (`isSlow = true`).

---

### 2.3 Vista Inventario (Gestión de Catálogo y Stock)
* **Archivo:** [`src/views/InventarioView.tsx`](file:///e:/Visitante/Downloads/Tarea-main/Tarea-main/src/views/InventarioView.tsx)
* **Función del componente:** `InventarioView: React.FC`
* **Elementos Visibles:**
  * Banner superior de "Confiabilidad de tus Datos" con barra apilada de capital real vs. estimado.
  * Filtros de segmento: "Todos", "Solo Reales" y "Aún estimando".
  * Buscador predictivo insensible a mayúsculas sobre nombre, código de barras, SKU y categoría.
  * Selector desplegable de ordenamiento: Mayor Ganancia Diaria, Menor Ganancia Diaria, Mayor Margen, Más Vendidos, Mayor Stock.
  * **Tarjetas de Producto:**
    * Badge de estado (`Real` / `Estimado`).
    * Velocidad de rotación ($u/\text{día}$), stock con unidad física (`pza`, `kg`, `lt`, `caja`), y barra de avance a calibración (`progressToReal` %).
    * Acciones: Botón "Editar" (`EditProductModal`) y botón rápido `+` para añadir al POS.
* **Lógica de Negocio:**
  * Progreso a calibración real: $\min(100, \text{round}((\text{totalSales} / 5) \times 100))$.
  * Ordenamiento por rentabilidad: $b.\text{dailyProfitPercent} - a.\text{dailyProfitPercent}$.

---

### 2.4 Vista Registro de Producto (`ProductRegisterView`)
* **Archivo:** [`src/views/ProductRegisterView.tsx`](file:///e:/Visitante/Downloads/Tarea-main/Tarea-main/src/views/ProductRegisterView.tsx)
* **Función del componente:** `ProductRegisterView: React.FC`
* **Elementos Visibles e Interacciones:**
  * Escáner de código de barras vía ML Kit (`@capacitor-mlkit/barcode-scanning`) o autogeneración con prefijo peruano `775`.
  * Captura y compresión de fotos de producto con `@capacitor/camera` y subida a Supabase Storage (`product-images`).
  * **Entradas Numéricas Transparentes y Robustas:**
    * Costo, precio de venta y existencias inician como cadenas vacías `""` con placeholder `"0"` / `"0.00"` atenuado, evitando la necesidad de borrar un cero inicial en pantalla táctil.
    * Evento `onFocus`: Selección automática de todo el texto (`e.target.select()`).
    * Símbolo monetario localizado: `S/` en todos los campos de precio.
  * **Soporte Avanzado para Venta al Peso (`unit === 'kg'`):**
    * Campo principal: *"Cantidad que tienes ahora (kg)"*. Sincroniza automáticamente el lote comprado.
    * Bloque colapsable: *"¿Compraste más de lo que tienes ahora?"* para ingresar el lote global adquirido (ej. saco de 50 kg cuando solo hay 15 kg en anaquel) para el cálculo exacto del capital invertido.
  * **Validación en Línea con Borde Rojo:**
    * Chequeo previo al guardado; si un campo requerido queda vacío, se destaca con borde rojo y el rótulo *"Falta completar este valor"*.
    * Se permite explícitamente el registro de stock `0` si el usuario lo ingresa de forma expresa.

---

### 2.5 Vista Vender (Terminal Punto de Venta - POS y Báscula Digital)
* **Archivo:** [`src/views/POSView.tsx`](file:///e:/Visitante/Downloads/Tarea-main/Tarea-main/src/views/POSView.tsx)
* **Función del componente:** `POSView: React.FC`, `BulkScaleWidget: React.FC`
* **Elementos Visibles e Interacciones:**
  * Buscador rápido y escáner de códigos de barras.
  * **Báscula Digital (`BulkScaleWidget`):**
    * Diseñada para artículos vendidos al peso (`unit === 'kg'`).
    * El campo de peso inicia vacío con placeholder `"0"`.
    * Atajos táctiles de pesaje (`+100g`, `+250g`, `+500g`, `+1kg`) que suman sobre lo ingresado (asumiendo 0 si está vacío).
    * Botón `✕` para borrado completo inmediato.
    * Si la línea está vacía o en 0: borde ámbar, aviso *"Falta ingresar el peso"* y subtotal `"S/ 0.00"` atenuado sin parpadeos.
  * **Control de Stock en Tiempo Real por Línea de Carrito:**
    * Si la cantidad ingresada excede el stock disponible, la línea despliega una alerta ámbar: `"Solo hay N [kg/pzas] de [Producto] en stock"` con el botón táctil **"Usar máximo (N)"** para corregirlo con un clic.
  * **Presentación Financiera sin Truncamiento:**
    * Eliminación estricta de `truncate` y `text-ellipsis` en "Total a Cobrar" y "Vuelto en Vivo".
    * Tipografía fluida y adaptativa (`text-3xl` / `text-2xl` / `text-xl`), `tabular-nums` y `whitespace-nowrap`, garantizando visibilidad completa para importes de hasta `S/ 99,999.99`.
  * **Botón Principal de Cobro Inteligente:**
    * Se deshabilita y adopta estilo atenuado si el carrito está vacío, si una báscula no tiene peso asignado, o si alguna línea excede el stock físico.
    * Muestra un indicador contextual inferior: *"Completa el peso de: [Producto]"* o *"Ajusta la cantidad de [Producto] para continuar"*.
  * **Mapeo de Errores y Resiliencia en Red:**
    * Excepciones de negocio (`error.code === 'P0001'`): Muestra el mensaje en español emitido por PostgreSQL.
    * Concurrencia de ticket duplicado (`23505`): El cliente regenera el ticket con sufijo temporal y reintenta la venta de forma transparente una vez.
    * Otros errores técnicos: Mensaje amigable `"No pudimos registrar la venta. Intenta de nuevo"` (detalle técnico solo a `console.error`).

---

### 2.6 Vista Historial (Ventas, Kardex y Auditoría)
* **Archivo:** [`src/views/HistorialView.tsx`](file:///e:/Visitante/Downloads/Tarea-main/Tarea-main/src/views/HistorialView.tsx)
* **Función del componente:** `HistorialView: React.FC`
* **Elementos Visibles:**
  * Selector segmentado de 3 secciones: **Ventas**, **Movimientos (Kardex)** y **Simulaciones Pasadas**.
  * **Ventas:** Facturación en Soles `S/`, ganancia bruta agregada, desglose de comprobantes y filtros cronológicos.
  * **Kardex:** Auditoría física sin textos promocionales o explicativos invasivos, detallando origen (`VENTA`, `COMPRA`, `AJUSTE`), delta de inventario, stock resultante, cajero responsable y nota de movimiento.
  * **Simulaciones:** Registro histórico de comparaciones ex-post de rotación.

---

### 2.7 Vista Simulador de Compra y Canasta Óptima
* **Archivo:** [`src/views/RestockSimulatorView.tsx`](file:///e:/Visitante/Downloads/Tarea-main/Tarea-main/src/views/RestockSimulatorView.tsx)
* **Función del componente:** `RestockSimulatorView: React.FC`
* **Elementos Visibles:**
  * **Pestañas Superiores Rediseñadas:** Grid de 3 columnas (`grid grid-cols-3 min-h-[48px]`), sin desbordamientos de texto ni solapamientos en pantallas móviles reducidas, con etiquetas concisas: **Simular**, **Canasta**, **Proveedores**.
  * **Simulador:** Evaluación del riesgo de iliquidez comparando los días estimados de venta del lote ($D_{\text{venta}} = \frac{Q}{V_d}$) contra el plazo concedido por el proveedor ($D_{\text{credito}}$).
  * **Selector de Proveedores:** Incluye placeholder inicial *"Selecciona un proveedor"* y estandarización a Soles `S/` en costos de reposición.
  * **Canasta Óptima:** Distribución presupuestaria (82% a productos de alta rotación y 18% colchón de seguridad).
  * **Directorio de Proveedores:** Tarjetas de proveedores con días de crédito y teléfono peruano formateado.

---

### 2.8 Vista Ajustes y Seguridad de Equipo
* **Archivo:** [`src/views/AjustesView.tsx`](file:///e:/Visitante/Downloads/Tarea-main/Tarea-main/src/views/AjustesView.tsx)
* **Función del componente:** `AjustesView: React.FC`
* **Elementos Visibles e Interacciones:**
  * Configuración del negocio (nombre, giro comercial, logo, QR de cobro de Yape/Plin).
  * Gestión de equipo: Listado de colaboradores, asignación de roles (`ADMIN`, `CAJERO`, `REPOSITOR`) con alerta al designar administradores.
  * Protección reforzada: Imposibilidad de degradar al propietario del negocio (`owner_id`) o al último administrador registrado.

---

## 3. MODELO DE DATOS TYPESCRIPT ACTUALIZADO

Definiciones de tipos en [`src/types.ts`](file:///e:/Visitante/Downloads/Tarea-main/Tarea-main/src/types.ts):

```typescript
export type SpeedCategory = 'RAPIDO' | 'NORMAL' | 'LENTO';
export type ProductStatus = 'ESTIMADO' | 'REAL';
export type ProductUnit = 'pza' | 'kg' | 'lt' | 'caja';
export type UserRole = 'ADMIN' | 'CAJERO' | 'REPOSITOR';
export type InvitationStatus = 'Esperando' | 'Vencido' | 'Rechazada' | 'Usada';
export type MovementType = 'COMPRA' | 'VENTA' | 'AJUSTE';

// 1. Cajas Registradoras (1FN)
export interface CashRegister {
  id: string;
  storeId: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
}

// 2. Categorías por Tienda
export interface Category {
  id: string;
  storeId: string;
  name: string;
  createdAt?: string;
}

// 3. Catálogo de Productos
export interface Product {
  id: string;
  storeId?: string;
  categoryId?: string;
  barcode: string;
  name: string;
  category: string;
  unit?: ProductUnit | string; // pza, kg, lt, caja
  costPrice: number;
  salePrice: number;
  stock: number;
  purchasedQuantity?: number;
  reorderPoint?: number;
  estimatedSpeed?: SpeedCategory | null;
  totalSales: number;
  createdDaysAgo: number;
  status: ProductStatus;
  imageUrl?: string;
  sku?: string;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// 4. Métricas Financieras Calculadas
export interface CalculatedProductMetrics extends Product {
  unitMarginDollar: number;
  unitMarginPercent: number;
  investedCapital: number;
  dailyVelocity: number;
  dailyProfitDollar: number;
  dailyProfitPercent: number;
  isSlow: boolean;
  progressToReal: number;
  salesUntilReal: number;
  velocityLabel: string;
  hasManualClassification: boolean;
}

// 5. Métricas Globales del Negocio
export interface GlobalFinancialMetrics {
  totalInvestedCapital: number;
  totalEstimatedCapital: number;
  totalRealCapital: number;
  realCapitalPercent: number;
  estimatedCapitalPercent: number;
  isCalibratedMode: boolean;
  averageDailyProfitPercent: number;
  marginHealthPercent: number;
  productsWithGoodMargin: number;
  slowProductsCount: number;
  slowCapitalAmount: number;
  capitalLockedInSlowPercent: number;
  diversificationScore: number;
  totalScore: number;
  scoreStatus: 'CRITICAL' | 'STABLE' | 'OPTIMAL';
  scoreColor: string;
  scoreStatusLabel: string;
  starProducts: CalculatedProductMetrics[];
  trappedCapitalProducts: CalculatedProductMetrics[];
  totalTrappedCapital: number;
  totalProductsCount: number;
  realProductsCount: number;
  estimatedProductsCount: number;
}

// 6. Membresía y Usuarios
export interface StoreMember {
  storeId: string;
  userId: string;
  role: UserRole;
  joinedAt: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  userCode?: string;
}

export interface UserStoreMembership {
  storeId: string;
  storeName: string;
  storeType: string;
  role: UserRole;
  isOwner: boolean;
  isActive: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  contact: string;
  role: UserRole;
  addedDate: string;
  isOwner?: boolean;
}

// 7. Configuración de Tienda
export interface StoreConfig {
  id?: string;
  name: string;
  type: 'Abarrotes' | 'Ropa' | 'Farmacia' | 'Ferretería' | 'Otro';
  logoUrl?: string;
  qrImageUrl?: string;
  currency: string;
  activeRegister: string;
  registers: string[];
  ownerId?: string;
  cashRegisters?: CashRegister[];
}

export interface UserPreferences {
  userId: string;
  darkMode: boolean;
  language: string;
  dailyReminder: boolean;
}

// 8. Ventas, Partidas y Kardex
export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  subtotal: number;
  profit: number;
}

export interface SaleRecord {
  id: string;
  registerId?: string;
  ticketNumber: string;
  timestamp: string;
  items: SaleItem[];
  totalQuantity: number;
  totalAmount: number;
  totalProfit: number;
  paymentMethod: 'efectivo' | 'qr' | 'tarjeta';
  cashGiven?: number;
  changeGiven?: number;
  cashierName: string;
}

export interface InventoryMovement {
  id: string;
  timestamp: string;
  type: MovementType;
  productId: string;
  productName: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  userName: string;
  note?: string;
  supplierName?: string;
  supplierId?: string;
  saleId?: string;
  purchaseId?: string;
  userId?: string;
}

// 9. Proveedores y Compras
export interface Supplier {
  id: string;
  name: string;
  paymentCondition: 'contado' | 'credito';
  creditDays?: number;
  contactPhone?: string;
  category?: string;
  archivedAt?: string | null;
}
```

---

## 4. ARQUITECTURA DE BASE DE DATOS POSTGRESQL (SUPABASE v3.1)

El esquema opera sobre PostgreSQL 17 en Supabase (`hftklhnwinkzsgdcllmg`), con aislamiento de tiendas y control estricto de accesos:

```
                  ┌──────────────────────┐
                  │      auth.users      │
                  └──────────┬───────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   ┌─────────────────┐               ┌─────────────────┐
   │     stores      │◄──────────────┤  store_members  │
   └────────┬────────┘               └─────────────────┘
            │
            ├───────────────┬───────────────┬────────────────┐
            ▼               ▼               ▼                ▼
   ┌────────────────┐ ┌───────────┐ ┌───────────────┐ ┌───────────────┐
   │ cash_registers │ │categories │ │   products    │ │   suppliers   │
   └────────┬───────┘ └───────────┘ └───────┬───────┘ └───────────────┘
            │                               │
            ▼                               │
   ┌────────────────┐                       │
   │     sales      │◄──────────────────────┤
   └────────┬───────┘                       │
            │                               │
            ▼                               ▼
   ┌────────────────┐             ┌───────────────────┐
   │   sale_items   │             │inventory_movements│
   └────────────────┘             └───────────────────┘
```

### 4.1 Tablas Principales

```sql
-- 1. Tiendas / Sucursales
CREATE TABLE public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'Abarrotes',
    currency TEXT NOT NULL DEFAULT 'S/',
    logo_url TEXT,
    qr_image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Membresías Multi-Tienda
CREATE TABLE public.store_members (
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'CAJERO', 'REPOSITOR')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, store_id)
);

-- 3. Perfiles de Usuario
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    user_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    avatar TEXT,
    active_store_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_profiles_user_code CHECK (user_code ~ '^RENT-[0-9A-Z]{4}$'),
    CONSTRAINT chk_profiles_phone_pe CHECK (phone IS NULL OR phone ~ '^9[0-9]{8}$')
);

-- 4. Cajas Registradoras (1FN)
CREATE TABLE public.cash_registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cash_registers_store_name UNIQUE (store_id, name)
);

-- 5. Catálogo de Productos
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT,
    barcode TEXT NOT NULL,
    sku TEXT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    unit TEXT NOT NULL DEFAULT 'pza' CHECK (unit IN ('pza', 'kg', 'lt', 'caja')),
    cost_price NUMERIC(12,2) NOT NULL CHECK (cost_price >= 0),
    sale_price NUMERIC(12,2) NOT NULL CHECK (sale_price >= 0),
    stock NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock >= 0),
    purchased_quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (purchased_quantity >= 0),
    reorder_point NUMERIC(12,3) NOT NULL DEFAULT 12 CHECK (reorder_point >= 0),
    estimated_speed TEXT CHECK (estimated_speed IN ('RAPIDO', 'NORMAL', 'LENTO') OR estimated_speed IS NULL),
    total_sales NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (total_sales >= 0),
    status TEXT NOT NULL DEFAULT 'ESTIMADO' CHECK (status IN ('ESTIMADO', 'REAL')),
    image_url TEXT,
    archived_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_store_barcode UNIQUE (store_id, barcode)
);

-- 6. Tickets de Venta
CREATE TABLE public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    register_id UUID REFERENCES public.cash_registers(id) ON DELETE RESTRICT,
    ticket_number TEXT NOT NULL,
    total_quantity NUMERIC(12,3) NOT NULL CHECK (total_quantity > 0),
    total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
    total_profit NUMERIC(12,2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('efectivo', 'qr', 'tarjeta')),
    cash_given NUMERIC(12,2),
    change_given NUMERIC(12,2) DEFAULT 0,
    cashier_name TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_sales_store_ticket UNIQUE (store_id, ticket_number)
);

-- 7. Partidas de Venta (Inmutables)
CREATE TABLE public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
    subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal = round(quantity * unit_price, 2)),
    profit NUMERIC(12,2) NOT NULL CHECK (profit = subtotal - round(quantity * unit_cost, 2))
);

-- 8. Kardex de Movimientos
CREATE TABLE public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('COMPRA', 'VENTA', 'AJUSTE')),
    quantity NUMERIC(12,3) NOT NULL,
    previous_stock NUMERIC(12,3) NOT NULL,
    new_stock NUMERIC(12,3) NOT NULL,
    sale_id UUID REFERENCES public.sales(id) ON DELETE RESTRICT,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_kardex_stock_math CHECK (new_stock = previous_stock + quantity)
);
```

---

### 4.2 Función RPC Transaccional: `public.process_sale` (9 Parámetros)

Esta función encapsula la lógica de cobro atómica en base de datos, garantizando consistencia ACID, bloqueo de filas contra condiciones de carrera, validación de stock y recálculo de vuelto en servidor:

```sql
CREATE OR REPLACE FUNCTION public.process_sale(
    p_store_id uuid,
    p_ticket_number text,
    p_payment_method text,
    p_cash_given numeric,
    p_change_given numeric,
    p_cashier_name text,
    p_user_id uuid,
    p_items jsonb,
    p_register_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_member_role TEXT;
    v_reg_id UUID := p_register_id;
    v_sale_id UUID;
    v_item RECORD;
    v_product RECORD;
    v_total_amount NUMERIC(12,2) := 0;
    v_total_profit NUMERIC(12,2) := 0;
    v_total_qty NUMERIC(12,3) := 0;
    v_item_subtotal NUMERIC(12,2);
    v_item_profit NUMERIC(12,2);
    v_new_stock NUMERIC(12,3);
    v_new_total_sales NUMERIC(12,3);
    v_will_be_real BOOLEAN;
    v_days_active INTEGER;
    v_calibrated_items JSONB := '[]'::jsonb;
    v_cash_given NUMERIC(12,2);
    v_change_given NUMERIC(12,2);
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = 'P0001';
    END IF;

    SELECT role INTO v_member_role
    FROM public.store_members
    WHERE store_id = p_store_id AND user_id = v_uid;

    IF v_member_role IS NULL THEN
        RAISE EXCEPTION 'Acceso denegado a la tienda' USING ERRCODE = 'P0001';
    END IF;

    IF p_payment_method IS NULL OR p_payment_method NOT IN ('efectivo', 'qr', 'tarjeta') THEN
        RAISE EXCEPTION 'Método de pago no válido' USING ERRCODE = 'P0001';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El ticket de venta no contiene productos' USING ERRCODE = 'P0001';
    END IF;

    -- Validar o asignar caja registradora activa
    IF v_reg_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.cash_registers
            WHERE id = v_reg_id AND store_id = p_store_id AND is_active = true
        ) THEN
            RAISE EXCEPTION 'La caja seleccionada no pertenece a esta tienda' USING ERRCODE = 'P0001';
        END IF;
    ELSE
        SELECT id INTO v_reg_id
        FROM public.cash_registers
        WHERE store_id = p_store_id AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_reg_id IS NULL THEN
            INSERT INTO public.cash_registers (store_id, name)
            VALUES (p_store_id, 'Caja 01 - Mostrador')
            RETURNING id INTO v_reg_id;
        END IF;
    END IF;

    -- BUCLE 1: Agrupar por producto, validar stock y calcular totales
    FOR v_item IN
        SELECT product_id, SUM(quantity) AS quantity
        FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC(12,3))
        GROUP BY product_id
        ORDER BY product_id
    LOOP
        IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'La cantidad vendida debe ser mayor a 0' USING ERRCODE = 'P0001';
        END IF;

        SELECT * INTO v_product
        FROM public.products
        WHERE id = v_item.product_id
          AND store_id = p_store_id
          AND archived_at IS NULL
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no disponible en esta tienda' USING ERRCODE = 'P0001';
        END IF;

        IF v_product.stock < v_item.quantity THEN
            RAISE EXCEPTION 'Stock insuficiente de "%": solo hay % % disponibles',
                v_product.name, trim_scale(v_product.stock), v_product.unit
                USING ERRCODE = 'P0001';
        END IF;

        v_item_subtotal := ROUND(v_product.sale_price * v_item.quantity, 2);
        v_item_profit   := v_item_subtotal - ROUND(v_product.cost_price * v_item.quantity, 2);

        v_total_amount := v_total_amount + v_item_subtotal;
        v_total_profit := v_total_profit + v_item_profit;
        v_total_qty    := v_total_qty + v_item.quantity;
    END LOOP;

    -- Cálculo de efectivo y vuelto en servidor
    IF p_payment_method = 'efectivo' THEN
        IF p_cash_given IS NULL OR p_cash_given < v_total_amount THEN
            RAISE EXCEPTION 'El efectivo recibido no cubre el total a cobrar' USING ERRCODE = 'P0001';
        END IF;
        v_cash_given   := p_cash_given;
        v_change_given := p_cash_given - v_total_amount;
    ELSE
        v_cash_given   := v_total_amount;
        v_change_given := 0;
    END IF;

    -- Inserción de venta
    INSERT INTO public.sales (
        store_id, register_id, ticket_number, total_quantity, total_amount,
        total_profit, payment_method, cash_given, change_given, cashier_name, user_id
    ) VALUES (
        p_store_id, v_reg_id, p_ticket_number, v_total_qty, v_total_amount,
        v_total_profit, p_payment_method, v_cash_given, v_change_given, p_cashier_name, v_uid
    ) RETURNING id INTO v_sale_id;

    -- BUCLE 2: Insertar items, kardex y descontar existencias
    FOR v_item IN
        SELECT product_id, SUM(quantity) AS quantity
        FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC(12,3))
        GROUP BY product_id
        ORDER BY product_id
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;

        v_item_subtotal   := ROUND(v_product.sale_price * v_item.quantity, 2);
        v_item_profit     := v_item_subtotal - ROUND(v_product.cost_price * v_item.quantity, 2);
        v_new_stock       := v_product.stock - v_item.quantity;
        v_new_total_sales := v_product.total_sales + v_item.quantity;
        v_days_active     := GREATEST(EXTRACT(DAY FROM (now() - v_product.created_at))::INTEGER, 1);
        v_will_be_real    := (v_new_total_sales >= 5 OR v_days_active >= 30);

        IF v_product.status = 'ESTIMADO' AND v_will_be_real THEN
            v_calibrated_items := v_calibrated_items || jsonb_build_object(
                'id', v_product.id,
                'name', v_product.name,
                'newSales', v_new_total_sales,
                'newVelocity', ROUND((v_new_total_sales / v_days_active), 2)
            );
        END IF;

        INSERT INTO public.sale_items (
            sale_id, product_id, product_name, quantity,
            unit_price, unit_cost, subtotal, profit
        ) VALUES (
            v_sale_id, v_product.id, v_product.name, v_item.quantity,
            v_product.sale_price, v_product.cost_price, v_item_subtotal, v_item_profit
        );

        INSERT INTO public.inventory_movements (
            store_id, product_id, product_name, type, quantity,
            previous_stock, new_stock, sale_id, user_id, user_name, note
        ) VALUES (
            p_store_id, v_product.id, v_product.name, 'VENTA', -v_item.quantity,
            v_product.stock, v_new_stock, v_sale_id, v_uid, p_cashier_name,
            'Venta ' || p_ticket_number
        );

        UPDATE public.products
        SET stock = v_new_stock,
            total_sales = v_new_total_sales,
            status = CASE WHEN v_will_be_real THEN 'REAL' ELSE status END
        WHERE id = v_product.id;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'ticket_number', p_ticket_number,
        'total_amount', v_total_amount,
        'total_profit', v_total_profit,
        'change_given', v_change_given,
        'calibrated_items', v_calibrated_items
    );
END;
$function$;

-- Seguridad y Permisos
REVOKE EXECUTE ON FUNCTION public.process_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.process_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb, uuid) TO authenticated;
```

---

## 5. LÓGICA DE NEGOCIO CRÍTICA Y FÓRMULAS MATEMÁTICAS

### 5.1 Calibración Empírica a Datos Reales
* **Regla de Guarda:**
  $$\text{Transición a REAL} \iff (\text{totalSales} \ge 5) \lor (\text{createdDaysAgo} \ge 30)$$
* **Velocidad Diaria ($V_d$):**
  * **Etapa REAL:** $V_d = \frac{\text{totalSales}}{\max(\text{createdDaysAgo}, 1)}$
  * **Etapa ESTIMADA:** $V_d = \frac{\text{basePurchasedQuantity} \times \text{weeklyRate}}{7}$
    * Rápido: $30\%/\text{sem}$; Normal: $15\%/\text{sem}$; Lento: $5\%/\text{sem}$.
* **Margen Unitario ($M_u$) y Rentabilidad Diaria ($R_d\%$):**
  $$M_u = P_{\text{venta}} - P_{\text{costo}}$$
  $$\text{Ganancia Diaria} = M_u \times V_d$$
  $$R_d\% = \left( \frac{\text{Ganancia Diaria}}{\text{Capital Invertido}} \right) \times 100$$

---

### 5.2 Algoritmo del Puntaje de Salud Financiera (0–100)
1. **Calidad de Margen Diario (60%):**
   $$\text{marginHealth} = \left( \frac{\text{Productos con } R_d\% \ge 1.0\%}{\text{Total de Productos}} \right) \times 100$$
2. **Diversificación sin Capital Parado (40%):**
   $$\text{lockedCapital\%} = \left( \frac{\sum \text{Capital en Productos Lentos}}{\sum \text{Capital Invertido Total}} \right) \times 100$$
   $$\text{diversificationScore} = \max(0, 100 - \text{lockedCapital\%})$$
3. **Puntaje Total Combinado:**
   $$\text{Score} = \text{round}(\text{marginHealth} \times 0.60 + \text{diversificationScore} \times 0.40)$$
   * $\ge 80$: **Óptimo** (Verde)
   * $50\text{–}79$: **Estable** (Ámbar)
   * $< 50$: **Crítico** (Rojo)

---

### 5.3 Simulador de Riesgo de Abastecimiento
* Días requeridos para liquidar la compra: $D_{\text{venta}} = \frac{Q}{V_d}$
* Comparación con la condición de compra:
  * **Contado:** Alerta si $D_{\text{venta}} > 30\text{ días}$.
  * **Crédito:** Si $D_{\text{venta}} > D_{\text{credito}}$, alerta de **Riesgo Crítico de Iliquidez** (el vencimiento de pago ocurre antes de haber vendido el stock).

---

## 6. ESTADO DE AUDITORÍA Y MEJORAS DE PRODUCCIÓN

| Ítem Auditado | Severidad Original | Estado Actual | Resolución y Verificación Técnica |
|---|---|---|---|
| **Firma y Desacople de `process_sale`** | CRÍTICA | ✅ RESUELTO | Función unificada a 9 parámetros (incluye `p_register_id`), validación de caja, vuelto en servidor, y revocación de permisos a `anon` y `PUBLIC`. |
| **Mapeo de Errores de Cobro** | ALTA | ✅ RESUELTO | Excepciones `P0001` expuestas limpiamente al usuario; error `23505` regenera ticket y reintenta; errores opacos muestran mensaje amigable. |
| **Advertencias de Stock en POS** | ALTA | ✅ RESUELTO | Alerta ámbar en línea si cantidad > stock con botón "Usar máximo (N)". Botón de cobro deshabilitado si hay líneas inválidas. |
| **Formato de Moneda y Cortes Visuales** | MEDIA | ✅ RESUELTO | Retiro total de `truncate` en importes; layout limpio en columna y fuente responsiva en Soles hasta `S/ 99,999.99`. |
| **Selector de Tiendas Atrapado** | ALTA | ✅ RESUELTO | `createPortal` en `document.body` (`z-index: 999`), soporte para botón Atrás de Android (`@capacitor/app`), y eliminación de `+` duplicado. |
| **Pestañas de Simulador Solapadas** | MEDIA | ✅ RESUELTO | Grid de 3 columnas de 48px de alto táctil, etiquetas concisas ("Simular", "Canasta", "Proveedores") y reemplazo de `$` por `S/`. |
| **Entradas Numéricas por Kilo** | MEDIA | ✅ RESUELTO | Campos inician vacíos con placeholder `"0"` atenuado, autoselección al enfocar, bloque colapsable para lote comprado y validación en línea. |
| **Báscula Digital POS (`BulkScaleWidget`)** | MEDIA | ✅ RESUELTO | Campo inicia vacío, atajos suman sobre lo escrito, resalte ámbar si falta peso y bloqueo del botón Cobrar indicando producto faltante. |
| **Compilación y Empaquetado APK** | ALTA | ✅ RESUELTO | Configuración de Java 21 en Gradle para compatibilidad total con Capacitor 8; APK generado y verificado en `outputs/apk/debug`. |

---

## 7. GUÍA DE INSTALACIÓN Y COMPILACIÓN PARA DESARROLLADORES

### Requisitos Previos:
* Node.js v20+ y npm.
* JDK 21 configurado en variables de entorno (`JAVA_HOME = C:\Users\<usuario>\.jdks\jbr-21.0.11`).
* Android SDK Platform 34+ y herramientas de compilación.

### Comandos de Construcción:
```bash
# 1. Instalar dependencias web
npm install --legacy-peer-deps

# 2. Compilar aplicación web
npm run build

# 3. Sincronizar assets y plugins nativos con Capacitor
npx cap sync android

# 4. Compilar APK Debug para Android
cd android
./gradlew assembleDebug
```
El archivo ejecutable se genera en:
`android/app/build/outputs/apk/debug/app-debug.apk`
