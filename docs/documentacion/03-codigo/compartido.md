# Módulo Compartido: Tipos, Roles, Formateadores y Contratos

El módulo transversal compartido (`src/shared/`) contiene definiciones e interfaces utilizadas por todas las capas del sistema. Cumple con la regla estricta de no importar ningún módulo interno de la aplicación, previniendo acoplamientos circulares.

---

## 1. Tipos de Dominio del Sistema (`src/shared/types/index.ts:1-210`)

Define las interfaces TypeScript que modelan las entidades centrales del negocio:

### 1.1. Tipos Primitivos y Enums del Dominio
```typescript
export type SpeedCategory = 'RAPIDO' | 'NORMAL' | 'LENTO';
export type ProductStatus = 'ESTIMADO' | 'REAL';
export type ProductUnit = 'pza' | 'kg' | 'lt' | 'caja';
export type UserRole = 'ADMIN' | 'CAJERO' | 'REPOSITOR';
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'yape' | 'plin' | 'transferencia' | 'qr';
export type MovementType = 'COMPRA' | 'VENTA' | 'AJUSTE';
export type PurchaseStatus = 'PENDIENTE' | 'PAGADA';
export type PaymentCondition = 'contado' | 'credito';
```

### 1.2. Entidades Principales
* **`Product`:** Identificador, `storeId`, `name`, `barcode`, `costPrice`, `salePrice`, `stock`, `unit`, `estimatedSpeed`, `unitsSold`, `salesCount`, `archivedAt`, `imageUrl`.
* **`Sale` & `SaleItem`:** Datos del ticket de venta, método de pago, monto total, desglose de partidas y snapshots inmutables del costo unitario (`unitCost`), precio unitario (`unitPrice`) y nombre (`productName`).
* **`Purchase` & `PurchaseItem`:** Cabecera y partidas de compra de mercadería a proveedores con condición de pago y días de crédito.
* **`InventoryMovement`:** Registro de kardex de existencias (saldo anterior, cantidad modificada, saldo nuevo, motivo y usuario responsable).
* **`Store`:** Sucursal con propietario (`ownerId`), nombre, rubro comercial, moneda oficial (`PEN`) y QR de cobro.
* **`StoreMember`:** Vinculación de un usuario a una tienda con un rol asignado.
* **`StoreInvitation`:** Invitación pendiente con token único y código de usuario destino.

---

## 2. Catálogo de Roles y Matriz de Permisos (`src/shared/constants/roles.ts:1-36`)

Define el catálogo de permisos funcionales y las políticas de acceso para cada rol:

```typescript
export const ROLES = {
  ADMIN: 'ADMIN',
  CAJERO: 'CAJERO',
  REPOSITOR: 'REPOSITOR',
} as const;

export const ROLE_PERMISSIONS = {
  ADMIN: {
    canViewPulse: true,
    canManageProducts: true,
    canAdjustStock: true,
    canOperatePOS: true,
    canViewFullHistory: true,
    canRegisterPurchases: true,
    canPayPurchases: true,
    canSimulatePurchases: true,
    canManageTeam: true,
    canManageSettings: true,
  },
  CAJERO: {
    canViewPulse: false,
    canManageProducts: false,
    canAdjustStock: false,
    canOperatePOS: true,
    canViewFullHistory: false, // Solo sus propias ventas
    canRegisterPurchases: false,
    canPayPurchases: false,
    canSimulatePurchases: false,
    canManageTeam: false,
    canManageSettings: false,
  },
  REPOSITOR: {
    canViewPulse: false,
    canManageProducts: true,
    canAdjustStock: true,
    canOperatePOS: false,
    canViewFullHistory: true, // Kardex y compras
    canRegisterPurchases: true,
    canPayPurchases: false,
    canSimulatePurchases: false,
    canManageTeam: false,
    canManageSettings: false,
  },
} as const;
```

---

## 3. Formateadores y Utilitarios de Localización (`src/shared/formatters/`)

### 3.1. Formateador de Moneda Peruana (PEN)
Aplica la configuración estándar de localización para Soles peruanos:
```typescript
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount); // Genera: S/ 1,250.50
}
```

### 3.2. Formateador de Errores de Autenticación (`authErrorFormatter.ts`)
Traduce códigos de error de Supabase Auth (`invalid_grant`, `email_not_confirmed`, `user_already_exists`) a explicaciones claras en español orientadas al comerciante.

---

## 4. Contratos de Almacenamiento Agnóstico (`src/shared/storage/storage.interface.ts:1-10`)

Define el contrato `KeyValueStorage`:
* Permite que la capa de datos almacene tokens de sesión sin acoplarse a bibliotecas específicas del navegador (`localStorage`) o del sistema móvil nativo (`@capacitor/preferences`).
* Facilita la inyección de dependencias y pruebas de infraestructura.
