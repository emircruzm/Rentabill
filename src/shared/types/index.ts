export type SpeedCategory = 'RAPIDO' | 'NORMAL' | 'LENTO';
export type ProductStatus = 'ESTIMADO' | 'REAL';
export type ProductUnit = 'pza' | 'kg' | 'lt' | 'caja';

export interface Category {
  id: string;
  storeId: string;
  name: string;
  createdAt?: string;
}

export interface CashRegister {
  id: string;
  storeId: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
}

export interface Product {
  id: string;
  storeId: string;
  categoryId: string;
  categoryName?: string;
  category?: string;
  barcode?: string | null;
  sku?: string | null;
  name: string;
  unit: ProductUnit; // pza, kg, lt, caja
  costPrice: number;
  salePrice: number;
  stock: number;
  purchasedQuantity?: number; // compatibilidad opcional
  reorderPoint?: number; // threshold for alerts
  estimatedSpeed?: SpeedCategory | null;
  unitsSold: number;
  salesCount: number;
  createdDaysAgo: number;
  status: ProductStatus;
  imageUrl?: string;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CalculatedProductMetrics extends Product {
  unitMarginDollar: number;
  unitMarginAmount: number;
  unitMarginPercent: number;
  investedCapital: number;
  dailyVelocity: number; // units per day
  dailyProfitDollar: number; // unitMarginDollar * dailyVelocity
  dailyProfitAmount: number;
  dailyProfitPercent: number; // (dailyProfitDollar / investedCapital) * 100
  isSlow: boolean;
  progressToReal: number; // 0 to 100%
  salesUntilReal: number;
  velocityLabel: string;
  hasManualClassification: boolean;
}

export interface GlobalFinancialMetrics {
  totalInvestedCapital: number;
  totalEstimatedCapital: number;
  totalRealCapital: number;
  realCapitalPercent: number;
  estimatedCapitalPercent: number;
  isCalibratedMode: boolean; // >= 50% real capital
  averageDailyProfitPercent: number; // weighted average
  marginHealthPercent: number; // % of products with dailyProfitPercent >= 1.0%
  productsWithGoodMargin: number;
  slowProductsCount: number;
  slowCapitalAmount: number;
  capitalLockedInSlowPercent: number; // % of total capital in Lento products
  diversificationScore: number; // 100 - capitalLockedInSlowPercent
  totalScore: number; // (marginHealthPercent * 0.6) + (diversificationScore * 0.4)
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

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface CalibrationNotification {
  id: string;
  product: Product;
  previousSales: number;
  newSales: number;
  previousVelocity: number;
  newVelocity: number;
}

export type UserRole = 'ADMIN' | 'CAJERO' | 'REPOSITOR';

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

export interface UserPreferences {
  userId: string;
  darkMode: boolean;
  language: string;
  dailyReminder: boolean;
}

export interface UserProfile {
  id?: string; // auth.users.id UUID
  userId: string; // Alphanumeric unique ID e.g. RENT-4F7K
  name: string;
  emailOrPhone: string;
  role: UserRole;
  storeId?: string; // Active store ID
  activeStoreId?: string;
  avatar?: string;
  phone?: string;
  isGuestInvited?: boolean;
  businessLinked?: boolean;
}

export interface RoleTitleInfo {
  title: string;
  badge: string;
}

export const ROLE_TITLES: Record<UserRole, RoleTitleInfo> = {
  ADMIN: { title: 'Administrador (Dueño)', badge: 'Total' },
  CAJERO: { title: 'Cajero (Mostrador)', badge: 'Cobros' },
  REPOSITOR: { title: 'Repositor (Almacén)', badge: 'Almacén' }
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ADMIN: 'Acceso total a métricas financieras, configuración de negocio y equipo.',
  CAJERO: 'Acceso enfocado exclusivamente a cobrar tickets y consultar precios.',
  REPOSITOR: 'Acceso a gestión de inventario, stock, catálogo y movimientos.'
};

export type InvitationStatus = 'PENDIENTE' | 'ACEPTADA' | 'EXPIRADA' | 'CANCELADA' | 'Esperando' | 'Vencido' | 'Rechazada' | 'Usada';

export interface TeamInvitation {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  role: UserRole;
  status: InvitationStatus;
  invitedAt: string;
  storeName: string;
  inviterName: string;
  invitedUserId?: string;
  invitedBy?: string;
}

export interface RegisteredDirectoryUser {
  userId: string;
  name: string;
  email: string;
  phone: string;
}

export interface StoreConfig {
  id?: string;
  name: string;
  type: 'Abarrotes' | 'Ropa' | 'Farmacia' | 'Ferretería' | 'Otro';
  logoUrl?: string;
  qrImageUrl?: string;
  currency: string;
  ownerId?: string;
  cashRegisters?: CashRegister[];
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
  id: string; // user UUID
  name: string;
  contact: string;
  role: UserRole;
  addedDate: string;
  isOwner?: boolean;
}

export interface AppSettings {
  dailyProfitGoal: number; // in %, mapped to daily_goal_percent
  warnSlowDays: number;
  warnLowStock: number;
  dailyReminder: boolean; // Managed per user in user_preferences
  autoBackup: boolean;
  darkMode: boolean;
  language: string;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  subtotal: number;
  profit: number;
}

export type PaymentMethod = 'efectivo' | 'tarjeta' | 'yape' | 'plin' | 'transferencia' | 'qr';

export interface SaleRecord {
  id: string;
  registerId: string;
  ticketNumber: string;
  timestamp: string; // ISO string
  items: SaleItem[];
  totalQuantity: number;
  totalAmount: number;
  totalProfit: number;
  paymentMethod: PaymentMethod;
  cashGiven?: number;
  changeGiven?: number;
  cashierName: string;
}

export interface PurchaseItem {
  id?: string;
  purchaseId?: string;
  productId: string;
  productName?: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
}

export interface PurchaseRecord {
  id: string;
  storeId: string;
  supplierId?: string;
  supplierName?: string;
  simulationId?: string;
  paymentCondition: 'contado' | 'credito';
  creditDays: number;
  dueDate?: string;
  paidAt?: string | null;
  totalCost: number;
  totalAmount: number;
  items: PurchaseItem[];
  createdBy?: string;
  createdAt: string;
  notes?: string | null;
}

export type MovementType = 'COMPRA' | 'VENTA' | 'AJUSTE';

export interface InventoryMovement {
  id: string;
  timestamp: string; // ISO string
  type: MovementType;
  productId: string;
  productName: string;
  quantity: number; // positive = entrada, negative = salida
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

export interface Supplier {
  id: string;
  name: string;
  paymentCondition: 'contado' | 'credito';
  creditDays?: number; // e.g. 15, 30, 45, 60
  contactPhone?: string;
  rubro?: string;
  category?: string;
  archivedAt?: string | null;
}

export interface SimulationItem {
  id?: string;
  simulationId?: string;
  productId: string;
  productName: string;
  simulatedQuantity: number;
  unitCost: number;
  subtotal: number;
  tag?: string;
}

export type SimulationVerdict = 'CONVIENE' | 'RIESGOSO' | 'NO_CONVIENE';
export type SimulationStatus = 'PENDIENTE' | 'APLICADA' | 'DESCARTADA' | 'comprado';

export interface PastSimulation {
  id: string;
  date: string; // ISO string or human formatted
  productId?: string;
  productName: string;
  simulatedQuantity: number;
  unitCost: number;
  totalCost: number;
  supplierId?: string;
  supplierName?: string;
  paymentCondition: 'contado' | 'credito';
  creditDays?: number;
  projectedDailyProfitGain: number;
  projectedScoreGain: number;
  projectedDaysToSell: number;
  verdict?: SimulationVerdict;
  status: SimulationStatus;
  purchaseId?: string;
  purchaseDate?: string;
  actualDailyProfitGain?: number;
  actualDaysToSell?: number;
  actualResultNote?: string;
  details?: Record<string, any>;
  type?: 'individual' | 'canasta';
  title?: string;
  budget?: number;
  simulationItems?: SimulationItem[];
}
