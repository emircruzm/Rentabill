import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { 
  Product, 
  CalculatedProductMetrics, 
  GlobalFinancialMetrics, 
  CartItem, 
  SpeedCategory,
  UserProfile,
  UserRole,
  StoreConfig,
  TeamMember,
  AppSettings,
  SaleRecord,
  SaleItem,
  InventoryMovement,
  Supplier,
  PastSimulation,
  PurchaseRecord,
  TeamInvitation,
  RegisteredDirectoryUser,
  UserStoreMembership
} from '../types';
import { ROLE_INFO } from '../data/mockData';
import { 
  calculateProductMetrics, 
  calculateGlobalMetrics, 
  shouldTransitionToReal 
} from '../utils/calculations';
import { formatDatePeru, formatCurrency } from '../utils/formatters';
import { supabase } from '../lib/supabase';
import { formatAuthError } from '../lib/authHelpers';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

export interface ToastInfo {
  id: number;
  message: string;
  type: 'success' | 'info' | 'calibration' | 'alert';
  subtext?: string;
}

export interface CalibrationEvent {
  product: Product;
  previousSales: number;
  newSales: number;
  newVelocity: number;
  isEmpirical: boolean;
}

export type AuthScreen = 'authenticated' | 'login' | 'register' | 'onboarding' | 'error';
export type StoresLoadingStatus = 'loading' | 'loaded' | 'error';

interface InventoryContextType {
  products: Product[];
  calculatedProducts: CalculatedProductMetrics[];
  metrics: GlobalFinancialMetrics;
  activeTab: 'pulso' | 'inventario' | 'vender' | 'historial' | 'simulador' | 'nuevo-producto' | 'ajustes';
  setActiveTab: (tab: 'pulso' | 'inventario' | 'vender' | 'historial' | 'simulador' | 'nuevo-producto' | 'ajustes') => void;
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, delta: number) => void;
  setCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  checkout: (paymentMethod: 'efectivo' | 'qr' | 'tarjeta', cashGiven?: number) => Promise<{ success: boolean; change: number }>;
  registerSaleSingle: (productId: string) => Promise<void>;
  addProduct: (product: Omit<Product, 'id' | 'unitsSold' | 'salesCount' | 'status' | 'createdDaysAgo' | 'storeId' | 'categoryId'> & { storeId?: string; categoryId?: string }) => Promise<boolean>;
  updateProduct: (productId: string, updates: Partial<Omit<Product, 'id' | 'storeId' | 'unitsSold' | 'salesCount' | 'status' | 'createdDaysAgo'>>) => Promise<boolean>;
  deleteProduct: (productId: string) => Promise<boolean>;
  calibrationEvent: CalibrationEvent | null;
  dismissCalibrationModal: () => void;
  toast: ToastInfo | null;
  showToast: (message: string, type?: ToastInfo['type'], subtext?: string) => void;
  resetDemoData: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedFilter: 'all' | 'real' | 'estimated';
  setSelectedFilter: (filter: 'all' | 'real' | 'estimated') => void;
  currentSort: string;
  setCurrentSort: (sort: string) => void;
  // Historial & Suppliers
  sales: SaleRecord[];
  inventoryMovements: InventoryMovement[];
  suppliers: Supplier[];
  pastSimulations: PastSimulation[];
  purchases: PurchaseRecord[];
  addInventoryMovement: (movement: Omit<InventoryMovement, 'id' | 'timestamp'>) => Promise<void>;
  addSupplier: (supplier: Omit<Supplier, 'id'>) => Promise<void>;
  addPastSimulation: (sim: Omit<PastSimulation, 'id' | 'date'>) => Promise<void>;
  confirmPastSimulationPurchase: (simulationId: string) => Promise<void>;
  payPurchase: (purchaseId: string) => Promise<void>;
  getRealProductVelocity: (productId: string) => { dailyVelocity: number; daysToDeplete: (qty: number) => number; totalUnitsSold: number; isReal: boolean };
  // Auth & Store State
  authScreen: AuthScreen;
  setAuthScreen: (screen: AuthScreen) => void;
  user: UserProfile;
  storeInfo: StoreConfig;
  teamMembers: TeamMember[];
  settings: AppSettings;
  showProfileModal: boolean;
  setShowProfileModal: (show: boolean) => void;
  showLogoutModal: boolean;
  setShowLogoutModal: (show: boolean) => void;
  showInviteModal: boolean;
  setShowInviteModal: (show: boolean) => void;
  showHelpModal: boolean;
  setShowHelpModal: (show: boolean) => void;
  login: (email?: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  registerUser: (
    name: string, 
    email: string, 
    password?: string, 
    role?: UserRole, 
    phone?: string
  ) => Promise<{ success: boolean; requiresEmailConfirmation?: boolean; error?: string }>;
  completeOnboarding: (store: { name: string; type: StoreConfig['type']; logoUrl?: string; currency: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (profile: Partial<UserProfile>) => Promise<void>;
  updateStoreInfo: (info: Partial<StoreConfig>) => Promise<void>;
  addTeamMember: (member: Omit<TeamMember, 'id' | 'addedDate'>) => void;
  updateTeamMemberRole: (id: string, role: UserRole) => Promise<void>;
  removeTeamMember: (id: string) => Promise<void>;
  setUserRole: (role: UserRole) => void;
  isTestingRole: boolean;
  exitRoleTest: () => void;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  switchActiveRegister: (register: string) => Promise<void>;
  downloadSalesExcel: () => Promise<void> | void;
  // Team Invitations & User ID Module
  invitations: TeamInvitation[];
  sendInvitation: (userId: string, role: UserRole) => Promise<{ success: boolean; error?: string }>;
  cancelInvitation: (invitationId: string) => Promise<void>;
  copyInvitation: (invitationId: string) => void;
  incomingInvitation: TeamInvitation | null;
  setIncomingInvitation: (invitation: TeamInvitation | null) => void;
  showInvitationConfirmModal: boolean;
  setShowInvitationConfirmModal: (show: boolean) => void;
  acceptInvitation: (invitationId: string) => Promise<void>;
  rejectInvitation: (invitationId: string) => Promise<void>;
  skipOnboardingForInvitation: () => void;
  findUserByUserId: (userId: string) => Promise<RegisteredDirectoryUser | null>;
  copyUserId: (id?: string) => void;
  // Multi-Store Management (Parte B1)
  userStores: UserStoreMembership[];
  storesLoadingStatus: StoresLoadingStatus;
  storesError: string | null;
  loadUserStores: () => Promise<void>;
  retryLoadStores: () => Promise<void>;
  retrySession: () => Promise<void>;
  switchStore: (storeId: string) => Promise<boolean>;
  createAdditionalStore: (store: { name: string; type: StoreConfig['type']; currency?: string; logoUrl?: string }) => Promise<string | null>;
  showStoreSelectorModal: boolean;
  setShowStoreSelectorModal: (show: boolean) => void;
  // Onboarding mode & navigation
  onboardingMode: 'initial' | 'add_store';
  setOnboardingMode: (mode: 'initial' | 'add_store') => void;
  openAddStoreOnboarding: () => void;
  cancelAddStoreOnboarding: () => void;
  // Async states
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
}

const DEFAULT_USER: UserProfile = {
  userId: '',
  name: 'Usuario',
  emailOrPhone: '',
  role: 'ADMIN',
  avatar: 'U',
};

const DEFAULT_STORE: StoreConfig = {
  name: 'Mi Negocio',
  type: 'Abarrotes',
  currency: 'PEN',
};

const DEFAULT_SETTINGS: AppSettings = {
  dailyProfitGoal: 2.0,
  warnSlowDays: 15,
  warnLowStock: 10,
  dailyReminder: true,
  autoBackup: true,
  darkMode: false,
  language: 'Español (Sencillo)',
};

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTabState] = useState<'pulso' | 'inventario' | 'vender' | 'historial' | 'simulador' | 'nuevo-producto' | 'ajustes'>('pulso');
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  
  const [user, setUser] = useState<UserProfile>(DEFAULT_USER);
  const [storeInfo, setStoreInfo] = useState<StoreConfig>(DEFAULT_STORE);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isTestingRole, setIsTestingRole] = useState<boolean>(false);

  const activeUserRef = useRef<string | null>(null);
  const authScreenRef = useRef<AuthScreen>('login');
  const isCheckingOutRef = useRef<boolean>(false);

  useEffect(() => {
    activeUserRef.current = user.id || null;
  }, [user.id]);

  useEffect(() => {
    authScreenRef.current = authScreen;
  }, [authScreen]);

  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [incomingInvitation, setIncomingInvitation] = useState<TeamInvitation | null>(null);
  const [showInvitationConfirmModal, setShowInvitationConfirmModal] = useState(false);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Cart starts completely empty
  const [cart, setCart] = useState<CartItem[]>([]);
  const [calibrationEvent, setCalibrationEvent] = useState<CalibrationEvent | null>(null);
  const [toast, setToast] = useState<ToastInfo | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'real' | 'estimated'>('all');
  const [currentSort, setCurrentSort] = useState('rentabilidad_desc');

  // Historial & Suppliers
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pastSimulations, setPastSimulations] = useState<PastSimulation[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);

  // Multi-Store States (Parte B1)
  const [userStores, setUserStores] = useState<UserStoreMembership[]>([]);
  const [storesLoadingStatus, setStoresLoadingStatus] = useState<StoresLoadingStatus>('loading');
  const [storesError, setStoresError] = useState<string | null>(null);
  const [showStoreSelectorModal, setShowStoreSelectorModal] = useState<boolean>(false);
  const [onboardingMode, setOnboardingMode] = useState<'initial' | 'add_store'>('initial');
  const activeStoreRequestIdRef = useRef<string>('');
  const realtimeChannelRef = useRef<any>(null);

  const openAddStoreOnboarding = useCallback(() => {
    setOnboardingMode('add_store');
    setShowStoreSelectorModal(false);
    setShowProfileModal(false);
    setAuthScreen('onboarding');
  }, []);

  const cancelAddStoreOnboarding = useCallback(() => {
    setOnboardingMode('initial');
    setAuthScreen('authenticated');
  }, []);

  const showToast = useCallback((message: string, type: ToastInfo['type'] = 'success', subtext?: string) => {
    const id = Date.now();
    setToast({ id, message, type, subtext });
    setTimeout(() => {
      setToast(current => (current?.id === id ? null : current));
    }, 4500);
  }, []);

  // Fetch full store data from Supabase
  const loadStoreData = useCallback(async (storeId: string) => {
    const reqId = `${storeId}_${Date.now()}`;
    activeStoreRequestIdRef.current = reqId;

    // Purge old store states immediately
    setProducts([]);
    setCart([]);
    setSales([]);
    setInventoryMovements([]);
    setPastSimulations([]);
    setSuppliers([]);
    setTeamMembers([]);
    setInvitations([]);

    try {
      setError(null);

      // 1. Fetch Store and Cash Registers
      const { data: storeData, error: storeErr } = await supabase
        .from('stores')
        .select('*')
        .eq('id', storeId)
        .single();
      
      if (storeErr) throw storeErr;
      if (activeStoreRequestIdRef.current !== reqId) return;

      let loadedRegisters = ['Caja 01 - Mostrador'];
      try {
        const { data: regData } = await supabase
          .from('cash_registers')
          .select('name')
          .eq('store_id', storeId)
          .order('name');
        if (regData && regData.length > 0) {
          loadedRegisters = regData.map(r => r.name);
        }
      } catch (err) {
        console.warn('Fallback a caja por defecto:', err);
      }

      if (storeData) {
        setStoreInfo({
          id: storeData.id,
          name: storeData.name,
          type: storeData.type,
          logoUrl: storeData.logo_url,
          qrImageUrl: storeData.qr_image_url || undefined,
          currency: storeData.currency || 'PEN',
          ownerId: storeData.owner_id,
        });
      }

      // 2. Fetch Products from product_stats view (Fuente de verdad del status ESTIMADO/REAL)
      const { data: prodsData, error: prodsErr } = await supabase
        .from('product_stats')
        .select('*')
        .eq('store_id', storeId)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      
      if (prodsErr) throw prodsErr;

      const loadedProducts: Product[] = (prodsData || []).map(row => {
        const catName = row.category_name || (row.category || 'General');
        return {
          id: row.id,
          storeId: row.store_id,
          categoryId: row.category_id || '',
          categoryName: catName,
          category: catName,
          barcode: row.barcode,
          name: row.name,
          unit: row.unit || 'pza',
          costPrice: Number(row.cost_price),
          salePrice: Number(row.sale_price),
          stock: Number(row.stock),
          reorderPoint: Number(row.reorder_point || 12),
          estimatedSpeed: row.estimated_speed,
          unitsSold: Number(row.units_sold || 0),
          salesCount: Number(row.sales_count || 0),
          createdDaysAgo: Number(row.created_days_ago || 0),
          status: row.status,
          imageUrl: row.image_url,
          sku: row.sku,
          createdAt: row.created_at,
        };
      });
      setProducts(loadedProducts);

      // 3. Fetch Suppliers
      const { data: supsData, error: supsErr } = await supabase
        .from('suppliers')
        .select('*')
        .eq('store_id', storeId)
        .order('name', { ascending: true });
      
      if (supsErr) throw supsErr;
      setSuppliers((supsData || []).map(s => ({
        id: s.id,
        name: s.name,
        paymentCondition: s.payment_condition,
        creditDays: Number(s.credit_days || 0),
        contactPhone: s.contact_phone,
        category: s.category,
      })));

      // 4. Fetch Sales with Sale Items
      const { data: salesData, error: salesErr } = await supabase
        .from('sales')
        .select('*, sale_items(*)')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (salesErr) throw salesErr;
      setSales((salesData || []).map(s => ({
        id: s.id,
        registerId: s.register_id || '',
        ticketNumber: s.ticket_number,
        timestamp: s.created_at,
        items: (s.sale_items || []).map((si: any) => ({
          productId: si.product_id,
          productName: si.product_name,
          quantity: Number(si.quantity),
          unitPrice: Number(si.unit_price),
          unitCost: Number(si.unit_cost),
          subtotal: Number(si.subtotal),
          profit: Number(si.profit),
        })),
        totalQuantity: Number(s.total_quantity),
        totalAmount: Number(s.total_amount),
        totalProfit: Number(s.total_profit),
        paymentMethod: s.payment_method,
        cashGiven: s.cash_given ? Number(s.cash_given) : undefined,
        changeGiven: s.change_given ? Number(s.change_given) : 0,
        cashierName: s.cashier_name,
      })));

      // 5. Fetch Inventory Movements (Kardex)
      const { data: movsData, error: movsErr } = await supabase
        .from('inventory_movements')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (movsErr) throw movsErr;
      setInventoryMovements((movsData || []).map(m => ({
        id: m.id,
        timestamp: m.created_at,
        type: m.type,
        productId: m.product_id,
        productName: m.product_name,
        quantity: Number(m.quantity),
        previousStock: Number(m.previous_stock),
        newStock: Number(m.new_stock),
        userName: m.user_name,
        note: m.note,
        supplierName: m.supplier_name,
      })));

      // 6. Fetch Simulations
      const { data: simsData, error: simsErr } = await supabase
        .from('simulations')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });
      
      if (simsErr) throw simsErr;
      setPastSimulations((simsData || []).map(sim => {
        const qty = Number(sim.quantity || sim.simulated_quantity || 0);
        const cost = Number(sim.unit_cost || 0);
        const total = Number((qty * cost).toFixed(2));
        const sup = suppliers.find(s => s.id === sim.supplier_id);
        return {
          id: sim.id,
          date: formatDatePeru(sim.created_at),
          productId: sim.product_id,
          productName: sim.product_name,
          simulatedQuantity: qty,
          unitCost: cost,
          totalCost: total,
          supplierId: sim.supplier_id,
          supplierName: sup ? sup.name : (sim.details?.supplier_name || 'Distribuidor'),
          paymentCondition: sim.payment_condition,
          creditDays: Number(sim.credit_days || 0),
          projectedDailyProfitGain: Number(sim.projected_daily_profit || 0),
          projectedScoreGain: Number(sim.details?.score_gain || Math.round(Number(sim.projected_daily_profit || 0) * 1.2)),
          projectedDaysToSell: Number(sim.projected_days_to_sell || 1),
          verdict: sim.verdict,
          status: sim.status,
          purchaseDate: sim.applied_at ? formatDatePeru(sim.applied_at) : undefined,
          actualDailyProfitGain: sim.actual_daily_profit != null ? Number(sim.actual_daily_profit) : undefined,
          actualDaysToSell: sim.actual_days_to_sell != null ? Number(sim.actual_days_to_sell) : undefined,
          actualResultNote: sim.notes || undefined,
        };
      }));

      // 6b. Fetch Purchases from purchases (v3.7)
      try {
        const { data: purData, error: purErr } = await supabase
          .from('purchases')
          .select('*, purchase_items(*), suppliers(name)')
          .eq('store_id', storeId)
          .order('created_at', { ascending: false });

        if (!purErr && purData) {
          setPurchases(purData.map((p: any) => ({
            id: p.id,
            storeId: p.store_id,
            supplierId: p.supplier_id,
            supplierName: p.suppliers?.name || 'Proveedor',
            paymentCondition: p.payment_condition,
            creditDays: Number(p.credit_days || 0),
            dueDate: p.due_date,
            paidAt: p.paid_at,
            totalCost: Number(p.total_amount || 0),
            totalAmount: Number(p.total_amount || 0),
            createdAt: p.created_at,
            notes: p.notes,
            items: (p.purchase_items || []).map((it: any) => ({
              id: it.id,
              purchaseId: it.purchase_id,
              productId: it.product_id,
              productName: it.product_name,
              quantity: Number(it.quantity || 0),
              unitCost: Number(it.unit_cost || 0),
              subtotal: Number(it.subtotal || 0),
            })),
          })));
        }
      } catch (err) {
        console.warn('Error al cargar compras:', err);
      }

      // 7. Fetch Team Members via store_members
      try {
        const { data: membersData, error: membersErr } = await supabase
          .from('store_members')
          .select('user_id, role, created_at, profiles(id, name, email, phone, user_code)')
          .eq('store_id', storeId);
        
        if (!membersErr && membersData) {
          setTeamMembers(membersData.map((m: any) => ({
            id: m.user_id,
            name: m.profiles?.name || 'Miembro',
            contact: m.profiles?.email || m.profiles?.phone || m.profiles?.user_code || m.user_id,
            role: m.role,
            addedDate: formatDatePeru(m.created_at),
            isOwner: m.user_id === storeData?.owner_id,
          })));
        }
      } catch (err) {
        console.warn('Error al cargar store_members:', err);
      }

      // 8. Fetch Invitations from store_invitations (v3.7)
      try {
        const { data: invsData, error: invsErr } = await supabase
          .from('store_invitations')
          .select('*')
          .eq('store_id', storeId)
          .order('created_at', { ascending: false });
        
        if (!invsErr && invsData) {
          setInvitations(invsData.map(i => ({
            id: i.token || i.id,
            userId: i.email,
            userName: i.email.split('@')[0],
            userEmail: i.email,
            userPhone: '',
            role: i.role,
            status: i.status,
            invitedAt: formatDatePeru(i.created_at),
            storeName: storeData?.name || 'Mi Tienda',
            inviterName: 'Administrador',
          })));
        }
      } catch (err) {
        console.warn('Error al cargar invitaciones:', err);
      }

      // 9. Fetch Store Settings and User Preferences (v3.7)
      const { data: settData } = await supabase
        .from('store_settings')
        .select('*')
        .eq('store_id', storeId)
        .maybeSingle();
      
      let userPref = { darkMode: false, language: 'Español (Sencillo)', dailyReminder: false };
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          const { data: prefData } = await supabase
            .from('user_preferences')
            .select('*')
            .eq('user_id', currentUser.id)
            .maybeSingle();
          if (prefData) {
            userPref = {
              darkMode: Boolean(prefData.dark_mode),
              language: prefData.language || 'Español (Sencillo)',
              dailyReminder: false,
            };
          }
        }
      } catch {
        // fallback
      }

      setSettings({
        dailyProfitGoal: Number(settData?.daily_goal_percent ?? 2.0),
        warnSlowDays: Number(settData?.warn_slow_days ?? 15),
        warnLowStock: Number(settData?.warn_low_stock ?? 5),
        dailyReminder: userPref.dailyReminder,
        autoBackup: Boolean(settData?.auto_backup ?? true),
        darkMode: userPref.darkMode,
        language: userPref.language,
      });

      // Reabrir canal Realtime con el nuevo store_id
      try {
        if (realtimeChannelRef.current) {
          supabase.removeChannel(realtimeChannelRef.current);
          realtimeChannelRef.current = null;
        }

        const channel = supabase
          .channel(`store_realtime_${storeId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'products', filter: `store_id=eq.${storeId}` },
            async () => {
              if (activeStoreRequestIdRef.current === reqId) {
                const { data: pData } = await supabase
                  .from('product_stats')
                  .select('*')
                  .eq('store_id', storeId)
                  .is('archived_at', null)
                  .order('created_at', { ascending: false });
                if (pData && activeStoreRequestIdRef.current === reqId) {
                  setProducts(pData.map(row => {
                    const catName = row.category_name || (row.category || 'General');
                    return {
                      id: row.id,
                      storeId: row.store_id,
                      categoryId: row.category_id || '',
                      categoryName: catName,
                      category: catName,
                      barcode: row.barcode,
                      name: row.name,
                      unit: row.unit || 'pza',
                      costPrice: Number(row.cost_price),
                      salePrice: Number(row.sale_price),
                      stock: Number(row.stock),
                      reorderPoint: Number(row.reorder_point || 12),
                      estimatedSpeed: row.estimated_speed,
                      unitsSold: Number(row.units_sold || 0),
                      salesCount: Number(row.sales_count || 0),
                      createdDaysAgo: Number(row.created_days_ago || 0),
                      status: row.status,
                      imageUrl: row.image_url,
                      sku: row.sku,
                      createdAt: row.created_at,
                    };
                  }));
                }
              }
            }
          )
          .subscribe();
        realtimeChannelRef.current = channel;
      } catch (rtErr) {
        console.warn('Realtime subscription error:', rtErr);
      }

    } catch (err: any) {
      console.error('Error cargando datos de la tienda:', err);
      setError(err.message || 'Error de conexión con la base de datos');
      showToast('Error de conexión con la base de datos', 'alert', err.message);
    }
  }, [showToast]);

  // Cargar lista de tiendas del usuario (Parte B1)
  const loadUserStores = useCallback(async () => {
    setStoresLoadingStatus('loading');
    setStoresError(null);
    try {
      const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      if (!authUser) {
        setStoresLoadingStatus('loaded');
        return;
      }

      const { data: members, error } = await supabase
        .from('store_members')
        .select('store_id, role, stores(id, name, type, owner_id)')
        .eq('user_id', authUser.id);

      if (error) throw error;

      if (members) {
        const mapped: UserStoreMembership[] = members
          .filter((m: any) => m.stores)
          .map((m: any) => ({
            storeId: m.store_id,
            storeName: m.stores.name,
            storeType: m.stores.type || 'Abarrotes',
            role: m.role as UserRole,
            isOwner: m.stores.owner_id === authUser.id,
            isActive: m.store_id === user.storeId,
          }));
        setUserStores(mapped);
      }
      setStoresLoadingStatus('loaded');
    } catch (err: any) {
      console.error('Error cargando tiendas del usuario:', err);
      setStoresError(err.message || 'Error de conexión al cargar tiendas');
      setStoresLoadingStatus('error');
      throw err;
    }
  }, [user.storeId]);

  // Cambiar de tienda activa (Parte B1)
  const switchStore = useCallback(async (targetStoreId: string): Promise<boolean> => {
    if (!targetStoreId || targetStoreId === user.storeId) return true;

    try {
      setLoading(true);

      // 1. Limpiar completamente los estados de la tienda previa
      setProducts([]);
      setCart([]);
      setSales([]);
      setInventoryMovements([]);
      setPastSimulations([]);
      setSuppliers([]);
      setTeamMembers([]);
      setInvitations([]);
      setCalibrationEvent(null);

      // 2. Invocar RPC switch_store
      const { error: rpcErr } = await supabase.rpc('switch_store', {
        p_store_id: targetStoreId
      });

      if (rpcErr) {
        console.warn('RPC switch_store fallback:', rpcErr);
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          await supabase.from('profiles').update({
            active_store_id: targetStoreId
          }).eq('id', authUser.id);
        }
      }

      // 3. Determinar rol en la nueva tienda
      let newRole: UserRole = 'ADMIN';
      const membership = userStores.find(s => s.storeId === targetStoreId);
      if (membership) {
        newRole = membership.role;
      } else {
        const { data: memRec } = await supabase
          .from('store_members')
          .select('role')
          .eq('store_id', targetStoreId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (memRec?.role) newRole = memRec.role as UserRole;
      }

      // 4. Actualizar usuario en memoria
      setUser(prev => ({
        ...prev,
        storeId: targetStoreId,
        role: newRole,
      }));

      // 5. Cargar todos los datos de la nueva tienda
      await loadStoreData(targetStoreId);

      // 6. Recalcular RBAC y visibilidad de pantallas
      if (newRole === 'CAJERO') {
        setActiveTabState('vender');
      } else if (newRole === 'REPOSITOR') {
        setActiveTabState('inventario');
      } else {
        setActiveTabState('pulso');
      }

      // 7. Refrescar lista de tiendas del usuario
      await loadUserStores();

      showToast('Tienda activa actualizada', 'success', 'Cargados los datos del negocio.');
      return true;
    } catch (err: any) {
      console.error('Error al cambiar de tienda:', err);
      showToast('Error al cambiar de tienda', 'alert', err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [user.storeId, user.id, userStores, loadStoreData, loadUserStores, showToast]);

  // Crear tienda adicional sin cerrar sesión (Parte B1)
  const createAdditionalStore = useCallback(async (newStore: { name: string; type: StoreConfig['type']; currency?: string; logoUrl?: string }): Promise<string | null> => {
    try {
      setLoading(true);

      const { data: rpcData, error: rpcErr } = await supabase.rpc('create_store', {
        name: newStore.name.trim(),
        type: newStore.type,
        currency: newStore.currency || 'PEN',
      });

      if (rpcErr) throw rpcErr;

      const createdStoreId: string = typeof rpcData === 'string' ? rpcData : (rpcData?.store_id || rpcData?.id);
      if (!createdStoreId) {
        throw new Error('No se recibió el identificador de la nueva tienda.');
      }

      // Recargar lista y confirmar que la nueva tienda está presente
      await loadUserStores();

      // Cambiar a la nueva tienda y recargar todos los datos
      await switchStore(createdStoreId);

      setOnboardingMode('initial');
      setAuthScreen('authenticated');
      setActiveTabState('pulso');
      showToast(`¡Tienda "${newStore.name}" creada!`, 'success', 'Comenzaste con perfil de Administrador');
      return createdStoreId;
    } catch (err: any) {
      console.error('Error creando tienda adicional:', err);
      showToast('Error al crear tienda', 'alert', err.message || 'No se pudo crear la tienda en Supabase');
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadUserStores, switchStore, showToast]);

  // Initial session check & onAuthStateChange listener
  useEffect(() => {
    let isMounted = true;

    async function handleSessionUser(sessionUser: any, isInitialLogin = false) {
      try {
        if (isInitialLogin) {
          setLoading(true);
        }
        setError(null);

        // Instant user info from session metadata so user name never stays 'Cargando...'
        const metaName = sessionUser.user_metadata?.name || sessionUser.email?.split('@')[0] || 'Usuario';
        const metaPhone = sessionUser.user_metadata?.phone || '';
        const metaRole: UserRole = (sessionUser.user_metadata?.role as UserRole) || 'ADMIN';

        if (isMounted) {
          setUser(prev => ({
            ...prev,
            id: sessionUser.id,
            name: (prev.name && prev.name !== 'Cargando...') ? prev.name : metaName,
            emailOrPhone: sessionUser.email || prev.emailOrPhone,
            avatar: ((prev.name && prev.name !== 'Cargando...') ? prev.name[0] : metaName[0] || 'U').toUpperCase(),
            phone: prev.phone || metaPhone,
            role: prev.role || metaRole,
          }));
          activeUserRef.current = sessionUser.id;
        }

        // Fetch user profile from Supabase with retry (for new signups trigger execution)
        let profile: any = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          const { data: p } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', sessionUser.id)
            .maybeSingle();

          if (p) {
            profile = p;
            break;
          }
          await new Promise(res => setTimeout(res, 300));
        }

        // Fallback upsert if trigger was delayed
        if (!profile) {
          try {
            const fallbackCode = 'RENT-' + Math.random().toString(36).substring(2, 6).toUpperCase();
            const { data: createdProf } = await supabase
              .from('profiles')
              .upsert({
                id: sessionUser.id,
                user_code: fallbackCode,
                name: metaName,
                email: sessionUser.email,
                phone: metaPhone || null,
                avatar: metaName[0]?.toUpperCase() || 'U',
              })
              .select()
              .maybeSingle();
            if (createdProf) {
              profile = createdProf;
            }
          } catch (upsertErr) {
            console.warn('Error en upsert profile fallback:', upsertErr);
          }
        }

        if (!isMounted) return;

        // Consultar membresías de tiendas del usuario (con JOIN a stores)
        const { data: memberRecs, error: membersErr } = await supabase
          .from('store_members')
          .select('store_id, role, stores(id, name, type, owner_id)')
          .eq('user_id', sessionUser.id);

        if (membersErr) {
          console.error('Error cargando membresías:', membersErr);
          if (isMounted) {
            setStoresLoadingStatus('error');
            setStoresError(membersErr.message || 'Error de conexión con tus tiendas');
            setAuthScreen('error');
            authScreenRef.current = 'error';
            setLoading(false);
          }
          return;
        }

        if (!isMounted) return;

        // Mapear tiendas encontradas
        const mappedStores: UserStoreMembership[] = (memberRecs || [])
          .filter((m: any) => m.stores)
          .map((m: any) => ({
            storeId: m.store_id,
            storeName: m.stores.name,
            storeType: m.stores.type || 'Abarrotes',
            role: m.role as UserRole,
            isOwner: m.stores.owner_id === sessionUser.id,
            isActive: false,
          }));

        // b) Si no tiene tiendas (consulta terminó SIN error y devolvió 0 filas)
        if (mappedStores.length === 0) {
          setUserStores([]);
          setStoresLoadingStatus('loaded');
          setUser({
            id: sessionUser.id,
            userId: profile?.user_code || sessionUser.id.slice(0, 6).toUpperCase(),
            name: profile?.name || metaName,
            emailOrPhone: profile?.email || sessionUser.email || '',
            role: metaRole,
            storeId: '',
            avatar: profile?.avatar || metaName[0].toUpperCase(),
            phone: profile?.phone || metaPhone,
          });
          activeUserRef.current = sessionUser.id;

          // Solo mandar a onboarding si tiene sesión válida y realmente 0 tiendas
          setOnboardingMode('initial');
          setAuthScreen('onboarding');
          authScreenRef.current = 'onboarding';
          setLoading(false);
          return;
        }

        // c) Si el usuario tiene tiendas:
        // Tienda activa = profiles.active_store_id si sigue siendo válida; si no, la primera
        let targetStoreId = '';
        const activeMatches = profile?.active_store_id && mappedStores.some(m => m.storeId === profile.active_store_id);
        if (activeMatches) {
          targetStoreId = profile.active_store_id;
        } else {
          targetStoreId = mappedStores[0].storeId;
          // Actualizar en base de datos mediante switch_store o profiles
          try {
            await supabase.rpc('switch_store', { p_store_id: targetStoreId });
          } catch {
            await supabase.from('profiles').update({ active_store_id: targetStoreId }).eq('id', sessionUser.id);
          }
        }

        mappedStores.forEach(m => {
          m.isActive = m.storeId === targetStoreId;
        });
        setUserStores(mappedStores);
        setStoresLoadingStatus('loaded');

        const activeMembership = mappedStores.find(m => m.storeId === targetStoreId);
        const userRole: UserRole = activeMembership?.role || 'ADMIN';

        setUser({
          id: sessionUser.id,
          userId: profile?.user_code || sessionUser.id.slice(0, 6).toUpperCase(),
          name: profile?.name || metaName,
          emailOrPhone: profile?.email || sessionUser.email || '',
          role: userRole,
          storeId: targetStoreId,
          avatar: profile?.avatar || (profile?.name ? profile.name[0].toUpperCase() : metaName[0].toUpperCase()),
          phone: profile?.phone || metaPhone,
        });
        activeUserRef.current = sessionUser.id;

        // Check if there are incoming invitations for this user email (v3.7)
        const userEmail = profile?.email || sessionUser.email;
        if (userEmail) {
          try {
            const { data: incInv } = await supabase
              .from('store_invitations')
              .select('id, token, store_id, email, role, status, created_at, stores(name)')
              .ilike('email', userEmail)
              .eq('status', 'PENDIENTE')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (incInv) {
              const storeObj: any = incInv.stores;
              const storeName = storeObj?.name || 'Una tienda';
              setIncomingInvitation({
                id: incInv.token || incInv.id,
                userId: profile?.user_code || userEmail,
                userName: profile?.name || userEmail.split('@')[0],
                userEmail: incInv.email,
                userPhone: profile?.phone || '',
                role: incInv.role,
                status: incInv.status,
                invitedAt: 'Hoy',
                storeName: storeName,
                inviterName: 'Administrador',
              });
              if (!targetStoreId) {
                setShowInvitationConfirmModal(true);
              }
            }
          } catch (invErr) {
            console.warn('Error resolviendo invitaciones:', invErr);
          }
        }

        // Cargar datos de la tienda activa
        await loadStoreData(targetStoreId);

        if (userRole === 'CAJERO') setActiveTabState('vender');
        else if (userRole === 'REPOSITOR') setActiveTabState('inventario');
        else setActiveTabState('pulso');

        // Entrar directo a la app autenticada
        setAuthScreen('authenticated');
        authScreenRef.current = 'authenticated';

      } catch (err: any) {
        console.error('Error procesando sesión de usuario:', err);
        if (isMounted) {
          setStoresError(err.message || 'Error de conexión');
          setAuthScreen('error');
          authScreenRef.current = 'error';
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    // Listen to Auth State Changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // ONLY reset on explicit logout event
      if (event === 'SIGNED_OUT') {
        if (isMounted) {
          activeUserRef.current = null;
          authScreenRef.current = 'login';
          setUser(DEFAULT_USER);
          setStoreInfo(DEFAULT_STORE);
          setProducts([]);
          setCart([]);
          setSales([]);
          setInventoryMovements([]);
          setSuppliers([]);
          setPastSimulations([]);
          setTeamMembers([]);
          setUserStores([]);
          setStoresLoadingStatus('loading');
          setAuthScreen('login');
          setLoading(false);
        }
        return;
      }

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        if (!session?.user) {
          if (isMounted) {
            setAuthScreen('login');
            authScreenRef.current = 'login';
            setLoading(false);
          }
          return;
        }

        // Ignorar SIGNED_IN repetidos del mismo user id si ya está autenticado en la app
        if (activeUserRef.current === session.user.id && authScreenRef.current === 'authenticated') {
          return;
        }

        // Diferir con setTimeout(..., 0) para quitar el await a Supabase dentro del callback
        setTimeout(() => {
          if (!isMounted) return;
          handleSessionUser(session.user, true);
        }, 0);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadStoreData]);

  const checkIncomingInvitations = useCallback(async (targetEmail?: string) => {
    const emailToSearch = targetEmail || user.emailOrPhone;
    if (!emailToSearch || !emailToSearch.includes('@')) return;

    try {
      const { data: incInv, error } = await supabase
        .from('store_invitations')
        .select('id, token, store_id, email, role, status, created_at, stores(name)')
        .ilike('email', emailToSearch)
        .eq('status', 'PENDIENTE')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && incInv) {
        const storeObj: any = incInv.stores;
        const storeName = storeObj?.name || 'Una tienda';

        setIncomingInvitation({
          id: incInv.token || incInv.id,
          userId: user.userId || emailToSearch,
          userName: user.name || emailToSearch.split('@')[0],
          userEmail: incInv.email,
          userPhone: user.phone || '',
          role: incInv.role,
          status: incInv.status,
          invitedAt: 'Hoy',
          storeName: storeName,
          inviterName: 'Administrador',
        });
      } else if (!error && !incInv) {
        setIncomingInvitation(null);
      }
    } catch (e) {
      console.warn('Error verificando invitaciones entrantes:', e);
    }
  }, [user.emailOrPhone, user.userId, user.name, user.phone]);

  // Real-time and periodic polling for incoming team invitations (v3.7)
  useEffect(() => {
    if (!user.emailOrPhone || !user.emailOrPhone.includes('@')) return;

    // Check immediately
    checkIncomingInvitations(user.emailOrPhone);

    // Listen to changes in store_invitations for this user email
    const channel = supabase
      .channel(`invitations_${user.userId || 'user'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'store_invitations',
        },
        () => {
          checkIncomingInvitations(user.emailOrPhone);
          if (user.storeId) {
            loadStoreData(user.storeId);
          }
        }
      )
      .subscribe();

    // 10-second polling fallback
    const interval = setInterval(() => {
      checkIncomingInvitations(user.userId);
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [user.userId, user.storeId, checkIncomingInvitations, loadStoreData]);

  const refreshData = useCallback(async () => {
    setLoading(true);
    if (user.storeId) {
      await loadStoreData(user.storeId);
    }
    if (user.userId) {
      await checkIncomingInvitations(user.userId);
    }
    setLoading(false);
  }, [user.storeId, user.userId, loadStoreData, checkIncomingInvitations]);

  // Recalculate metrics on every products update
  const calculatedProducts = useMemo(() => {
    return products.map(calculateProductMetrics);
  }, [products]);

  const metrics = useMemo(() => {
    return calculateGlobalMetrics(products);
  }, [products]);

  // Navigation with Role Enforcement
  const setActiveTab = useCallback((tab: 'pulso' | 'inventario' | 'vender' | 'historial' | 'simulador' | 'nuevo-producto' | 'ajustes') => {
    if (user.role === 'CAJERO' && tab !== 'vender') {
      showToast(
        "Acceso limitado a Vender", 
        "alert", 
        "El rol de Cajero solo puede registrar ventas para proteger los datos de tu negocio."
      );
      setActiveTabState('vender');
      return;
    }

    if (user.role === 'REPOSITOR' && tab !== 'inventario' && tab !== 'nuevo-producto' && tab !== 'historial') {
      showToast(
        "Acceso limitado a Inventario e Historial", 
        "alert", 
        "El rol de Repositor solo puede gestionar catálogo y revisar movimientos de stock."
      );
      setActiveTabState('inventario');
      return;
    }

    setActiveTabState(tab);
  }, [user.role, showToast]);

  const dismissCalibrationModal = useCallback(() => {
    setCalibrationEvent(null);
  }, []);

  const addToCart = useCallback((product: Product, quantity = 1) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
    showToast(`"${product.name}" agregado al ticket`, 'info');
  }, [showToast]);

  const removeFromCart = useCallback((productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  }, []);

  const updateCartQuantity = useCallback((productId: string, delta: number) => {
    setCart(prev => {
      return prev
        .map(item => {
          if (item.product.id === productId) {
            const newQty = Number((item.quantity + delta).toFixed(3));
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);
    });
  }, []);

  const setCartQuantity = useCallback((productId: string, quantity: number) => {
    setCart(prev => {
      return prev
        .map(item => {
          if (item.product.id === productId) {
            const cleanQty = Math.max(0, Number(Number(quantity).toFixed(3)));
            return cleanQty > 0 ? { ...item, quantity: cleanQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  // Atomic Checkout using Postgres RPC function
  const checkout = useCallback(async (paymentMethod: 'efectivo' | 'qr' | 'tarjeta', cashGiven?: number) => {
    if (isCheckingOutRef.current) {
      console.warn('Checkout ya en curso, ignorando llamada duplicada');
      return { success: false, change: 0 };
    }

    if (cart.length === 0) {
      showToast('El ticket no contiene productos para cobrar', 'alert');
      return { success: false, change: 0 };
    }
    if (!user.storeId) {
      showToast('No se encontró tienda vinculada', 'alert');
      return { success: false, change: 0 };
    }

    isCheckingOutRef.current = true;
    const total = cart.reduce((sum, item) => sum + (item.product.salePrice * item.quantity), 0);
    const change = cashGiven ? Math.max(0, cashGiven - total) : 0;

    // Fetch latest sales count for store to prevent ticket collisions
    let ticketSeq = sales.length + 1;
    try {
      const { count } = await supabase
        .from('sales')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', user.storeId);
      if (typeof count === 'number') {
        ticketSeq = count + 1;
      }
    } catch {
      // fallback to in-memory sales.length + 1
    }
    const ticketNumber = `TKT-${String(100 + ticketSeq).padStart(5, '0')}`;

    const itemsPayload = cart.map(c => ({
      product_id: c.product.id,
      quantity: c.quantity,
    }));

    const executeProcessSale = async (tkt: string | null = null) => {
      return await supabase.rpc('process_sale', {
        p_store_id: user.storeId,
        p_ticket_number: tkt,
        p_payment_method: paymentMethod,
        p_cash_given: paymentMethod === 'efectivo' ? (cashGiven || total) : null,
        p_items: itemsPayload,
        p_register_id: null,
      });
    };

    try {
      setLoading(true);
      let rpcRes = await executeProcessSale(null);

      // Si es error 23505 (ticket duplicado), regenerar número y reintentar UNA sola vez
      if (rpcRes.error && (rpcRes.error.code === '23505' || rpcRes.error.message?.includes('sales_ticket_number_unique') || rpcRes.error.message?.includes('23505') || rpcRes.error.message?.includes('uq_sales_store_ticket'))) {
        const retryTicket = `TKT-${Date.now().toString().slice(-6)}`;
        rpcRes = await executeProcessSale(retryTicket);
      }

      if (rpcRes.error) throw rpcRes.error;
      const data = rpcRes.data;

      // Check if any product calibrated to REAL
      if (data?.calibrated_items && data.calibrated_items.length > 0) {
        const cal = data.calibrated_items[0];
        const fullProd = products.find(p => p.id === cal.id);
        if (fullProd) {
          setCalibrationEvent({
            product: { ...fullProd, unitsSold: cal.newUnitsSold || cal.newSales, salesCount: cal.newSalesCount || 5, status: 'REAL' },
            previousSales: fullProd.unitsSold,
            newSales: cal.newUnitsSold || cal.newSales,
            newVelocity: cal.newVelocity,
            isEmpirical: true,
          });
        }
      }

      // Reload fresh store data from Supabase
      await loadStoreData(user.storeId);
      setCart([]);

      showToast(`Cobro exitoso por S/ ${total.toFixed(2)}`, 'success', `Vuelto: S/ ${change.toFixed(2)} (${paymentMethod})`);
      return { success: true, change };
    } catch (err: any) {
      console.error('Error procesando cobro:', err);
      // Mapeo estricto de errores
      if (err?.code === 'P0001' && err?.message) {
        showToast('Atención', 'alert', err.message);
      } else {
        showToast('Error al cobrar', 'alert', 'No pudimos registrar la venta. Intenta de nuevo');
      }
      return { success: false, change: 0 };
    } finally {
      isCheckingOutRef.current = false;
      setLoading(false);
    }
  }, [cart, user.storeId, user.name, user.id, sales.length, products, loadStoreData, showToast]);

  // Single Quick Sale
  const registerSaleSingle = useCallback(async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    if (product.stock <= 0) {
      showToast(`Sin stock disponible de ${product.name}`, 'alert');
      return;
    }
    if (!user.storeId) return;

    const ticketNumber = `TKT-${String(100 + sales.length + 1).padStart(5, '0')}`;
    try {
      setLoading(true);
      const { data, error: rpcErr } = await supabase.rpc('process_sale', {
        p_store_id: user.storeId,
        p_ticket_number: ticketNumber,
        p_payment_method: 'efectivo',
        p_cash_given: product.salePrice,
        p_items: [{ product_id: product.id, quantity: 1 }],
      });

      if (rpcErr) throw rpcErr;
      await loadStoreData(user.storeId);
      showToast(`Venta rápida: 1 und. de ${product.name}`, 'success');
    } catch (err: any) {
      console.error('Error registrando venta rápida:', err);
      showToast('Error al registrar venta', 'alert', err.message);
    } finally {
      setLoading(false);
    }
  }, [products, user.storeId, user.name, user.id, sales.length, loadStoreData, showToast]);

  // Add Product to Supabase
  const addProduct = useCallback(async (productData: Omit<Product, 'id' | 'unitsSold' | 'salesCount' | 'status' | 'createdDaysAgo' | 'storeId' | 'categoryId'> & { storeId?: string; categoryId?: string }): Promise<boolean> => {
    if (!user.storeId) {
      showToast('No se encontró una tienda asignada', 'alert');
      return false;
    }

    try {
      setLoading(true);
      const initialStock = Number(productData.stock) || 0;

      // Buscar category_id de la tienda
      let targetCategoryId = productData.categoryId;
      if (!targetCategoryId) {
        const { data: catData } = await supabase.from('categories').select('id, name').eq('store_id', user.storeId);
        const cat = catData?.find((c: any) => c.name.toLowerCase() === (productData.category || 'General').toLowerCase());
        if (cat) targetCategoryId = cat.id;
        else if (catData && catData.length > 0) targetCategoryId = catData[0].id;
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('products')
        .insert({
          store_id: user.storeId,
          category_id: targetCategoryId,
          barcode: productData.barcode?.trim() || null,
          sku: productData.sku?.trim() || null,
          name: productData.name.trim(),
          unit: productData.unit || 'pza',
          cost_price: productData.costPrice,
          sale_price: productData.salePrice,
          stock: initialStock,
          reorder_point: productData.reorderPoint || 0,
          estimated_speed: productData.estimatedSpeed || null,
          units_sold: 0,
          sales_count: 0,
          image_url: productData.imageUrl || null,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      await loadStoreData(user.storeId);
      showToast("Producto guardado con ganancia estimada", 'success', "Se confirmará automáticamente al acumular 5 ventas");
      setActiveTab('inventario');
      return true;
    } catch (err: any) {
      console.error('Error guardando producto:', err);
      showToast('Error al registrar producto', 'alert', err.message || 'Verifica los datos e intenta nuevamente.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [user.storeId, user.name, loadStoreData, showToast, setActiveTab]);

  // Update existing Product in Supabase
  const updateProduct = useCallback(async (
    productId: string, 
    updates: Partial<Omit<Product, 'id' | 'storeId' | 'unitsSold' | 'salesCount' | 'status' | 'createdDaysAgo'>>
  ): Promise<boolean> => {
    if (!user.storeId) {
      showToast('No se encontró una tienda asignada', 'alert');
      return false;
    }

    const currentProd = products.find(p => p.id === productId);
    if (!currentProd) {
      showToast('Producto no encontrado', 'alert');
      return false;
    }

    try {
      setLoading(true);
      const prevStock = currentProd.stock;
      // Si el stock cambió, ejecutar RPC adjust_stock (B7 / C9)
      if (updates.stock !== undefined && Number(updates.stock) !== prevStock) {
        const diff = Number((Number(updates.stock) - prevStock).toFixed(3));
        if (diff !== 0) {
          const { error: adjErr } = await supabase.rpc('adjust_stock', {
            p_store_id: user.storeId,
            p_product_id: productId,
            p_quantity_delta: diff,
            p_note: 'Ajuste manual desde edición de producto',
            p_user_name: user.name || 'Administrador',
          });
          if (adjErr) throw adjErr;
        }
      }

      const dbUpdates: any = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name.trim();
      if (updates.barcode !== undefined) dbUpdates.barcode = updates.barcode ? updates.barcode.trim() || null : null;
      if (updates.sku !== undefined) dbUpdates.sku = updates.sku ? updates.sku.trim() || null : null;
      if (updates.categoryId !== undefined) {
        dbUpdates.category_id = updates.categoryId;
      } else if (updates.category !== undefined) {
        const { data: catData } = await supabase.from('categories').select('id, name').eq('store_id', user.storeId);
        const cat = catData?.find((c: any) => c.name.toLowerCase() === updates.category!.toLowerCase());
        if (cat) dbUpdates.category_id = cat.id;
      }
      if (updates.unit !== undefined) dbUpdates.unit = updates.unit;
      if (updates.costPrice !== undefined) dbUpdates.cost_price = Number(updates.costPrice);
      if (updates.salePrice !== undefined) dbUpdates.sale_price = Number(updates.salePrice);
      if (updates.reorderPoint !== undefined) dbUpdates.reorder_point = Number(updates.reorderPoint);
      if (updates.estimatedSpeed !== undefined) dbUpdates.estimated_speed = updates.estimatedSpeed;
      if (updates.imageUrl !== undefined) dbUpdates.image_url = updates.imageUrl || null;

      if (Object.keys(dbUpdates).length > 0) {
        const { error: updateErr } = await supabase
          .from('products')
          .update(dbUpdates)
          .eq('id', productId)
          .eq('store_id', user.storeId);

        if (updateErr) throw updateErr;
      }

      await loadStoreData(user.storeId);
      showToast('Producto actualizado correctamente', 'success');
      return true;
    } catch (err: any) {
      console.error('Error actualizando producto:', err);
      showToast('Error al actualizar producto', 'alert', err.message || 'No se pudieron guardar los cambios');
      return false;
    } finally {
      setLoading(false);
    }
  }, [user.storeId, user.name, products, loadStoreData, showToast]);

  // Delete product from Supabase (Soft delete / Archivar)
  const deleteProduct = useCallback(async (productId: string): Promise<boolean> => {
    if (!user.storeId) return false;
    try {
      setLoading(true);
      const { error: delErr } = await supabase
        .from('products')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', productId)
        .eq('store_id', user.storeId);

      if (delErr) throw delErr;
      await loadStoreData(user.storeId);
      showToast('Producto archivado del inventario', 'info');
      return true;
    } catch (err: any) {
      console.error('Error archivando producto:', err);
      showToast('Error al archivar producto', 'alert', err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [user.storeId, loadStoreData, showToast]);

  // Inventory adjustment / movement
  const addInventoryMovement = useCallback(async (movementData: Omit<InventoryMovement, 'id' | 'timestamp'>) => {
    if (!user.storeId) return;

    try {
      setLoading(true);
      if (movementData.type === 'AJUSTE') {
        const { error: rpcErr } = await supabase.rpc('adjust_stock', {
          p_store_id: user.storeId,
          p_product_id: movementData.productId,
          p_quantity_delta: movementData.quantity,
          p_note: movementData.note || 'Ajuste manual de inventario',
          p_user_name: user.name || movementData.userName,
        });

        if (rpcErr) {
          console.error('Error en RPC adjust_stock:', rpcErr);
          throw rpcErr;
        }
      } else {
        // Inserción directa de otros movimientos
        const { error: movErr } = await supabase.from('inventory_movements').insert({
          store_id: user.storeId,
          product_id: movementData.productId,
          product_name: movementData.productName,
          type: movementData.type,
          quantity: movementData.quantity,
          previous_stock: movementData.previousStock,
          new_stock: movementData.newStock,
          user_id: user.id || null,
          user_name: user.name || movementData.userName,
          note: movementData.note,
          supplier_name: movementData.supplierName,
        });
        if (movErr) throw movErr;

        await supabase
          .from('products')
          .update({ stock: movementData.newStock })
          .eq('id', movementData.productId);
      }

      await loadStoreData(user.storeId);
      showToast(
        movementData.quantity >= 0 ? "Entrada registrada" : "Salida registrada",
        'success',
        `${movementData.productName}: ${movementData.quantity > 0 ? '+' : ''}${movementData.quantity} unids.`
      );
    } catch (err: any) {
      console.error('Error registrando movimiento:', err);
      showToast('Error al registrar movimiento', 'alert', err.message);
    } finally {
      setLoading(false);
    }
  }, [user.storeId, user.name, user.id, loadStoreData, showToast]);

  // Add Supplier
  const addSupplier = useCallback(async (supplierData: Omit<Supplier, 'id'>) => {
    if (!user.storeId) return;

    try {
      setLoading(true);
      const { error: supErr } = await supabase.from('suppliers').insert({
        store_id: user.storeId,
        name: supplierData.name,
        payment_condition: supplierData.paymentCondition,
        credit_days: supplierData.creditDays || 0,
        contact_phone: supplierData.contactPhone,
        category: supplierData.category,
      });

      if (supErr) throw supErr;
      await loadStoreData(user.storeId);
      showToast('Proveedor guardado en base de datos', 'success', `${supplierData.name}`);
    } catch (err: any) {
      console.error('Error guardando proveedor:', err);
      showToast('Error al guardar proveedor', 'alert', err.message);
    } finally {
      setLoading(false);
    }
  }, [user.storeId, loadStoreData, showToast]);

  // Add Simulation (v3.7)
  const addPastSimulation = useCallback(async (simData: Omit<PastSimulation, 'id' | 'date'>) => {
    if (!user.storeId) return;

    try {
      setLoading(true);
      const targetProd = products.find(p => p.id === simData.productId);
      const unitSalePrice = targetProd ? targetProd.salePrice : Number((simData.unitCost * 1.3).toFixed(2));

      const { error: simErr } = await supabase.from('simulations').insert({
        store_id: user.storeId,
        product_id: simData.productId || null,
        product_name: simData.productName,
        supplier_id: simData.supplierId || null,
        quantity: simData.simulatedQuantity,
        unit_cost: simData.unitCost,
        unit_price: unitSalePrice,
        payment_condition: simData.paymentCondition,
        credit_days: simData.paymentCondition === 'credito' ? (simData.creditDays || 0) : 0,
        projected_days_to_sell: Math.max(0.1, Number(simData.projectedDaysToSell)),
        projected_daily_profit: Number(simData.projectedDailyProfitGain),
        verdict: simData.verdict || 'CONVIENE',
        details: {
          supplier_name: simData.supplierName,
          score_gain: simData.projectedScoreGain,
          total_cost: simData.totalCost,
        },
      });

      if (simErr) throw simErr;
      await loadStoreData(user.storeId);
      showToast("Simulación guardada en tu Historial", 'success', "Podrás comparar lo proyectado contra los resultados reales.");
    } catch (err: any) {
      console.error('Error guardando simulación:', err);
      showToast('Error al guardar simulación', 'alert', err.message);
    } finally {
      setLoading(false);
    }
  }, [user.storeId, products, loadStoreData, showToast]);

  // Confirm Purchase from Simulator via process_purchase (v3.7)
  const confirmPastSimulationPurchase = useCallback(async (simulationId: string) => {
    if (!user.storeId) return;
    const sim = pastSimulations.find(s => s.id === simulationId);
    if (!sim) return;

    try {
      setLoading(true);

      const itemsPayload = [{
        product_id: sim.productId,
        quantity: sim.simulatedQuantity,
        unit_cost: sim.unitCost
      }];

      const { data: purchData, error: rpcErr } = await supabase.rpc('process_purchase', {
        p_store_id: user.storeId,
        p_supplier_id: sim.supplierId || null,
        p_items: itemsPayload,
        p_note: `Compra ejecutada desde Simulador (${sim.paymentCondition})`,
        p_payment_condition: sim.paymentCondition,
        p_credit_days: sim.paymentCondition === 'credito' ? (sim.creditDays || 0) : 0,
        p_simulation_ids: [simulationId],
      });

      if (rpcErr) throw rpcErr;

      await loadStoreData(user.storeId);
      showToast("¡Compra registrada en inventario!", 'success', `Se sumaron ${sim.simulatedQuantity} unidades de ${sim.productName}`);
    } catch (err: any) {
      console.error('Error confirmando compra:', err);
      showToast('Error al registrar compra', 'alert', err.message);
    } finally {
      setLoading(false);
    }
  }, [user.storeId, pastSimulations, loadStoreData, showToast]);

  // Pay Purchase via pay_purchase RPC (v3.7)
  const payPurchase = useCallback(async (purchaseId: string) => {
    if (!user.storeId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('pay_purchase', {
        p_store_id: user.storeId,
        p_purchase_id: purchaseId,
      });

      if (error) throw error;
      if (data && data.success === false && data.error === 'ya_pagada') {
        showToast('Esta compra ya estaba marcada como pagada', 'info');
        return;
      }

      await loadStoreData(user.storeId);
      showToast('Pago registrado correctamente', 'success');
    } catch (err: any) {
      console.error('Error pagando compra:', err);
      showToast('Error al registrar pago', 'alert', err.message);
    } finally {
      setLoading(false);
    }
  }, [user.storeId, loadStoreData, showToast]);

  const getRealProductVelocity = useCallback((productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) {
      return { dailyVelocity: 1, daysToDeplete: (qty: number) => Math.ceil(qty / 1), totalUnitsSold: 0, isReal: false };
    }

    const soldInSales = sales.reduce((sum, sale) => {
      const item = sale.items.find(i => i.productId === productId);
      return sum + (item ? item.quantity : 0);
    }, 0);

    const totalRealUnitsSold = Math.max(product.unitsSold, soldInSales);
    const daysActive = Math.max(product.createdDaysAgo, 1);

    const empiricalVelocity = totalRealUnitsSold > 0 
      ? Number((totalRealUnitsSold / daysActive).toFixed(2)) 
      : 0;

    const baseQty = Math.max(product.stock, 1);
    const fallbackRate = product.estimatedSpeed === 'RAPIDO' ? 0.30 : product.estimatedSpeed === 'NORMAL' ? 0.15 : 0.05;
    const fallbackVelocity = Number(((baseQty * fallbackRate) / 7).toFixed(2)) || 1.0;
    const finalDailyVelocity = empiricalVelocity > 0 ? empiricalVelocity : fallbackVelocity;

    return {
      dailyVelocity: finalDailyVelocity,
      daysToDeplete: (qty: number) => Math.max(1, Math.ceil(qty / Math.max(finalDailyVelocity, 0.1))),
      totalUnitsSold: totalRealUnitsSold,
      isReal: product.status === 'REAL' || totalRealUnitsSold >= 5,
    };
  }, [products, sales]);

  // Auth: Login with Supabase
  const login = useCallback(async (email?: string, password?: string): Promise<{ success: boolean; error?: string }> => {
    if (!email || !password) {
      const msg = 'Por favor escribe tu correo y contraseña';
      showToast(msg, 'alert');
      return { success: false, error: msg };
    }

    try {
      setLoading(true);
      setError(null);
      const cleanEmail = email.trim();
      const cleanPassword = password.trim();

      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (authErr) throw authErr;
      if (!data.session || !data.user) {
        throw new Error('No se pudo establecer la sesión con el servidor.');
      }

      const metaName = data.user.user_metadata?.name || cleanEmail.split('@')[0] || 'Usuario';
      const metaPhone = data.user.user_metadata?.phone || '';
      const metaRole: UserRole = (data.user.user_metadata?.role as UserRole) || 'ADMIN';

      // Fetch user profile from Supabase with retry
      let profile: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: p } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle();
        if (p) {
          profile = p;
          break;
        }
        await new Promise(res => setTimeout(res, 300));
      }

      if (!profile) {
        try {
          const fallbackCode = 'RENT-' + Math.random().toString(36).substring(2, 6).toUpperCase();
          const { data: createdProf } = await supabase
            .from('profiles')
            .upsert({
              id: data.user.id,
              user_code: fallbackCode,
              name: metaName,
              email: cleanEmail,
              phone: metaPhone || null,
              avatar: metaName[0]?.toUpperCase() || 'U',
            })
            .select()
            .maybeSingle();
          if (createdProf) profile = createdProf;
        } catch (e) {
          console.warn('Fallback perfil en login:', e);
        }
      }

      // Consultar membresías de tiendas del usuario (con JOIN a stores)
      const { data: memberRecs, error: membersErr } = await supabase
        .from('store_members')
        .select('store_id, role, stores(id, name, type, owner_id)')
        .eq('user_id', data.user.id);

      if (membersErr) {
        throw membersErr;
      }

      const mappedStores: UserStoreMembership[] = (memberRecs || [])
        .filter((m: any) => m.stores)
        .map((m: any) => ({
          storeId: m.store_id,
          storeName: m.stores.name,
          storeType: m.stores.type || 'Abarrotes',
          role: m.role as UserRole,
          isOwner: m.stores.owner_id === data.user.id,
          isActive: false,
        }));

      if (mappedStores.length === 0) {
        setUserStores([]);
        setStoresLoadingStatus('loaded');
        setUser({
          id: data.user.id,
          userId: profile?.user_code || data.user.id.slice(0, 6).toUpperCase(),
          name: profile?.name || metaName,
          emailOrPhone: profile?.email || cleanEmail,
          role: metaRole,
          storeId: '',
          avatar: profile?.avatar || metaName[0].toUpperCase(),
          phone: profile?.phone || metaPhone,
        });
        activeUserRef.current = data.user.id;
        setOnboardingMode('initial');
        setAuthScreen('onboarding');
        authScreenRef.current = 'onboarding';
        return { success: true };
      }

      let activeStoreId = '';
      if (profile?.active_store_id && mappedStores.some(m => m.storeId === profile.active_store_id)) {
        activeStoreId = profile.active_store_id;
      } else {
        activeStoreId = mappedStores[0].storeId;
        const { error: switchErr } = await supabase.rpc('switch_store', { p_store_id: activeStoreId });
        if (switchErr) {
          await supabase.from('profiles').update({ active_store_id: activeStoreId }).eq('id', data.user.id);
        }
      }

      mappedStores.forEach(m => { m.isActive = m.storeId === activeStoreId; });
      setUserStores(mappedStores);
      setStoresLoadingStatus('loaded');

      const activeMem = mappedStores.find(m => m.storeId === activeStoreId);
      const userRole: UserRole = activeMem?.role || 'ADMIN';

      const userProfile: UserProfile = {
        id: data.user.id,
        userId: profile?.user_code || data.user.id.slice(0, 6).toUpperCase(),
        name: profile?.name || metaName,
        emailOrPhone: profile?.email || cleanEmail,
        role: userRole,
        storeId: activeStoreId,
        avatar: profile?.avatar || (profile?.name ? profile.name[0].toUpperCase() : metaName[0].toUpperCase()),
        phone: profile?.phone || metaPhone,
      };
      setUser(userProfile);
      activeUserRef.current = data.user.id;

      await loadStoreData(activeStoreId);

      if (userRole === 'CAJERO') setActiveTabState('vender');
      else if (userRole === 'REPOSITOR') setActiveTabState('inventario');
      else setActiveTabState('pulso');

      setAuthScreen('authenticated');
      authScreenRef.current = 'authenticated';
      showToast(`¡Bienvenido ${profile?.name || metaName}!`, 'success', 'Sesión iniciada con éxito');
      return { success: true };
    } catch (err: any) {
      console.error('Error al iniciar sesión:', err);
      const formatted = formatAuthError(err);
      showToast('Error al iniciar sesión', 'alert', formatted);
      return { success: false, error: formatted };
    } finally {
      setLoading(false);
    }
  }, [loadStoreData, loadUserStores, showToast]);

  // Auth: Register with Supabase
  const registerUser = useCallback(async (
    name: string, 
    email: string, 
    password = 'password123',
    role: UserRole = 'ADMIN',
    phone?: string
  ): Promise<{ success: boolean; requiresEmailConfirmation?: boolean; error?: string }> => {
    if (!email || !name || !password) {
      const msg = 'Por favor completa todos los campos requeridos';
      showToast(msg, 'alert');
      return { success: false, error: msg };
    }

    try {
      setLoading(true);
      setError(null);
      const cleanName = name.trim();
      const cleanEmail = email.trim();
      const cleanPhone = phone?.trim() || null;

      const { data, error: regErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password.trim(),
        options: {
          data: {
            name: cleanName,
            role: role || 'ADMIN',
            phone: cleanPhone,
          }
        }
      });

      if (regErr) throw regErr;
      if (!data.user) throw new Error('No se pudo crear el usuario.');

      // Inmediatamente fijar datos en memoria para que NUNCA aparezca "Cargando..."
      const immediateUser: UserProfile = {
        id: data.user.id,
        userId: data.user.id.slice(0, 6).toUpperCase(),
        name: cleanName,
        emailOrPhone: cleanEmail,
        role: role || 'ADMIN',
        avatar: cleanName[0]?.toUpperCase() || 'U',
        phone: cleanPhone || '',
      };
      setUser(immediateUser);
      activeUserRef.current = data.user.id;

      // Check if email confirmation is required (session is null)
      if (!data.session) {
        return { 
          success: true, 
          requiresEmailConfirmation: true 
        };
      }

      // Fetch or fallback profile from Supabase
      let fetchedProfile: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: p } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle();
        if (p) {
          fetchedProfile = p;
          break;
        }
        await new Promise(res => setTimeout(res, 300));
      }

      if (!fetchedProfile) {
        try {
          const fallbackCode = 'RENT-' + Math.random().toString(36).substring(2, 6).toUpperCase();
          const { data: createdProf } = await supabase
            .from('profiles')
            .upsert({
              id: data.user.id,
              user_code: fallbackCode,
              name: cleanName,
              email: cleanEmail,
              phone: cleanPhone,
              avatar: cleanName[0]?.toUpperCase() || 'U',
            })
            .select()
            .maybeSingle();
          if (createdProf) fetchedProfile = createdProf;
        } catch (e) {
          console.warn('Fallback perfil en register:', e);
        }
      }

      if (fetchedProfile) {
        setUser(prev => ({
          ...prev,
          id: fetchedProfile.id,
          userId: fetchedProfile.user_code || prev.userId,
          name: fetchedProfile.name || cleanName,
          emailOrPhone: fetchedProfile.email || cleanEmail,
          role: fetchedProfile.role || role || 'ADMIN',
          avatar: fetchedProfile.avatar || cleanName[0]?.toUpperCase() || 'U',
          phone: fetchedProfile.phone || cleanPhone || '',
          storeId: fetchedProfile.active_store_id || fetchedProfile.store_id || undefined,
        }));
      }

      setOnboardingMode('initial');
      setAuthScreen('onboarding');
      authScreenRef.current = 'onboarding';
      showToast('¡Cuenta creada exitosamente!', 'success', 'Ahora personaliza tu tienda');
      return { success: true };
    } catch (err: any) {
      console.error('Error en registro:', err);
      const formatted = formatAuthError(err);
      showToast('Error al registrar usuario', 'alert', formatted);
      return { success: false, error: formatted };
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Complete Store Onboarding
  const completeOnboarding = useCallback(async (newStore: { name: string; type: StoreConfig['type']; logoUrl?: string; currency: string }) => {
    try {
      setLoading(true);
      setError(null);

      // Si estamos en modo de agregar tienda desde perfil, delegar a createAdditionalStore
      if (onboardingMode === 'add_store') {
        const addedId = await createAdditionalStore(newStore);
        if (addedId) {
          setOnboardingMode('initial');
          setAuthScreen('authenticated');
        }
        return;
      }

      // Verify active session exists
      const { data: { session }, error: sessErr } = await supabase.auth.getSession();
      let activeUserId = session?.user?.id;

      if (!activeUserId) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        activeUserId = authUser?.id;
      }

      if (!activeUserId) {
        throw new Error('No hay una sesión activa. Por favor inicia sesión nuevamente.');
      }

      // 1. Create store via RPC create_store (A1)
      const { data, error: rpcErr } = await supabase.rpc('create_store', {
        name: newStore.name.trim(),
        type: newStore.type,
        currency: newStore.currency || 'PEN',
      });

      if (rpcErr) throw rpcErr;

      const createdStoreId: string = typeof data === 'string' ? data : (data?.store_id || data?.id);
      if (!createdStoreId) {
        throw new Error('No se recibió el identificador de la tienda creada.');
      }

      // Limpiar contextos para la tienda inicial
      setProducts([]);
      setCart([]);
      setSales([]);
      setInventoryMovements([]);
      setPastSimulations([]);
      setSuppliers([]);
      setTeamMembers([]);
      setInvitations([]);

      setUser(prev => ({ ...prev, storeId: createdStoreId!, role: 'ADMIN' }));
      setStoreInfo({
        id: createdStoreId!,
        name: newStore.name.trim(),
        type: newStore.type,
        logoUrl: newStore.logoUrl,
        currency: newStore.currency || 'PEN',
      });

      await loadStoreData(createdStoreId!);
      await loadUserStores();

      setOnboardingMode('initial');
      setAuthScreen('authenticated');
      setActiveTabState('pulso');
      showToast('¡Tu tienda está lista!', 'success', 'Bienvenido a Rentabill. Tu negocio empieza hoy.');
    } catch (err: any) {
      console.error('Error completando onboarding:', err);
      const formatted = formatAuthError(err);
      showToast('Error al guardar tienda', 'alert', formatted);
    } finally {
      setLoading(false);
    }
  }, [onboardingMode, createAdditionalStore, loadStoreData, loadUserStores, showToast]);

  const logout = useCallback(async () => {
    setShowLogoutModal(false);
    await supabase.auth.signOut();
    setAuthScreen('login');
    showToast('Sesión cerrada', 'info', 'Vuelve pronto');
  }, [showToast]);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const dbUpdates: any = {};
      if (updates.name) dbUpdates.name = updates.name;
      if (updates.emailOrPhone) dbUpdates.email = updates.emailOrPhone;
      if (updates.phone) dbUpdates.phone = updates.phone;
      if (updates.avatar) dbUpdates.avatar = updates.avatar;

      const { error: err } = await supabase.from('profiles').update(dbUpdates).eq('id', authUser.id);
      if (err) throw err;

      setUser(prev => ({ ...prev, ...updates }));
      showToast('Perfil actualizado correctamente', 'success');
    } catch (err: any) {
      console.error('Error actualizando perfil:', err);
      showToast('Error al actualizar perfil', 'alert', err.message);
    }
  }, [showToast]);

  const updateStoreInfo = useCallback(async (updates: Partial<StoreConfig>) => {
    if (!user.storeId) return;

    try {
      const dbUpdates: any = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.type !== undefined) dbUpdates.type = updates.type;
      if (updates.logoUrl !== undefined) dbUpdates.logo_url = updates.logoUrl || null;
      if (updates.qrImageUrl !== undefined) dbUpdates.qr_image_url = updates.qrImageUrl || null;
      if (updates.currency !== undefined) dbUpdates.currency = updates.currency;

      const { error: err } = await supabase.from('stores').update(dbUpdates).eq('id', user.storeId);
      if (err) throw err;

      setStoreInfo(prev => ({ ...prev, ...updates }));
      showToast('Datos del negocio guardados en Supabase', 'success');
    } catch (err: any) {
      console.error('Error actualizando tienda:', err);
      showToast('Error al actualizar datos del negocio', 'alert', err.message);
    }
  }, [user.storeId, showToast]);

  const addTeamMember = useCallback((memberData: Omit<TeamMember, 'id' | 'addedDate'>) => {
    // Team invitations are managed via sendInvitation
    showToast(`Usa el botón de invitar por código ID`, 'info');
  }, [showToast]);

  const updateTeamMemberRole = useCallback(async (memberId: string, role: UserRole) => {
    if (!user.storeId) return;

    // Regla: El dueño (owner_id) no puede ser degradado
    const targetMember = teamMembers.find(m => m.id === memberId);
    if ((targetMember?.isOwner || (storeInfo.ownerId && memberId === storeInfo.ownerId)) && role !== 'ADMIN') {
      showToast('Operación no permitida', 'alert', 'El dueño del negocio no puede ser degradado de su rol de Administrador.');
      return;
    }

    // Regla: No se puede dejar la tienda sin ADMIN
    if (targetMember?.role === 'ADMIN' && role !== 'ADMIN') {
      const remainingAdmins = teamMembers.filter(m => m.role === 'ADMIN' && m.id !== memberId).length;
      if (remainingAdmins === 0) {
        showToast(
          'No puedes dejar la tienda sin Administrador',
          'alert',
          'Este miembro es el único Administrador de la tienda. Asigna a otro Administrador primero.'
        );
        return;
      }
    }

    try {
      setLoading(true);
      const { error: rpcErr } = await supabase.rpc('change_member_role', {
        p_target_user_id: memberId,
        p_new_role: role
      });

      if (rpcErr) {
        console.warn('RPC change_member_role fallback:', rpcErr);
        const { error: err } = await supabase
          .from('store_members')
          .update({ role })
          .eq('store_id', user.storeId)
          .eq('user_id', memberId);
        if (err) throw err;
      }

      setTeamMembers(prev => prev.map(m => m.id === memberId ? { ...m, role } : m));

      // Si el miembro editado es el usuario actual, actualizar rol en caliente
      if (memberId === user.id) {
        setUser(prev => ({ ...prev, role }));
        if (role === 'CAJERO') setActiveTabState('vender');
        else if (role === 'REPOSITOR') setActiveTabState('inventario');
      }

      showToast(`Rol actualizado a ${ROLE_INFO[role]?.name || role}`, 'success', `${targetMember?.name || 'Miembro'}`);
    } catch (err: any) {
      showToast('Error actualizando rol', 'alert', err.message);
    } finally {
      setLoading(false);
    }
  }, [user.storeId, user.id, teamMembers, storeInfo.ownerId, showToast]);

  const removeTeamMember = useCallback(async (memberId: string) => {
    if (!user.storeId) return;

    // Regla: El dueño (owner_id) no puede ser removido
    const targetMember = teamMembers.find(m => m.id === memberId);
    if (targetMember?.isOwner || (storeInfo.ownerId && memberId === storeInfo.ownerId)) {
      showToast('Operación no permitida', 'alert', 'El dueño del negocio no puede ser removido de la tienda.');
      return;
    }

    // Regla: No se puede dejar la tienda sin ADMIN
    if (targetMember?.role === 'ADMIN') {
      const remainingAdmins = teamMembers.filter(m => m.role === 'ADMIN' && m.id !== memberId).length;
      if (remainingAdmins === 0) {
        showToast(
          'No puedes dejar la tienda sin Administrador',
          'alert',
          'No puedes remover al único Administrador de la tienda.'
        );
        return;
      }
    }

    try {
      setLoading(true);
      const { error: rpcErr } = await supabase.rpc('remove_member', {
        p_target_user_id: memberId
      });

      if (rpcErr) {
        console.warn('RPC remove_member fallback:', rpcErr);
        const { error: err } = await supabase
          .from('store_members')
          .delete()
          .eq('store_id', user.storeId)
          .eq('user_id', memberId);
        if (err) throw err;
      }

      setTeamMembers(prev => prev.filter(m => m.id !== memberId));
      if (user.storeId) {
        await loadStoreData(user.storeId);
      }
      showToast('Acceso revocado', 'info', `${targetMember?.name || 'El empleado'} ya no tiene acceso al negocio.`);
    } catch (err: any) {
      console.error('Error revocando acceso:', err);
      showToast('Error revocando acceso', 'alert', err.message);
    } finally {
      setLoading(false);
    }
  }, [user.storeId, teamMembers, storeInfo.ownerId, loadStoreData, showToast]);

  const setUserRole = useCallback((newRole: UserRole) => {
    setUser(prev => ({ ...prev, role: newRole }));
    if (newRole !== 'ADMIN') {
      setIsTestingRole(true);
    } else {
      setIsTestingRole(false);
    }
    if (newRole === 'CAJERO') {
      setActiveTabState('vender');
    } else if (newRole === 'REPOSITOR') {
      setActiveTabState('inventario');
    } else {
      setActiveTabState('ajustes');
    }
  }, []);

  const exitRoleTest = useCallback(() => {
    setIsTestingRole(false);
    setUser(prev => ({ ...prev, role: 'ADMIN' }));
    setActiveTabState('ajustes');
    showToast('Prueba finalizada', 'success', 'Regresaste a tu perfil de Administrador');
  }, [showToast]);

  const updateSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
    if (!user.storeId) return;

    try {
      const dbStoreUpdates: any = {};
      if (newSettings.dailyProfitGoal !== undefined) dbStoreUpdates.daily_goal_percent = newSettings.dailyProfitGoal;
      if (newSettings.warnSlowDays !== undefined) dbStoreUpdates.warn_slow_days = newSettings.warnSlowDays;
      if (newSettings.warnLowStock !== undefined) dbStoreUpdates.warn_low_stock = newSettings.warnLowStock;
      if (newSettings.autoBackup !== undefined) dbStoreUpdates.auto_backup = newSettings.autoBackup;

      if (Object.keys(dbStoreUpdates).length > 0) {
        await supabase.from('store_settings').upsert({
          store_id: user.storeId,
          ...dbStoreUpdates,
        });
      }

      // Desacoplar user_preferences (por usuario): dark_mode, language
      if (user.id && (newSettings.darkMode !== undefined || newSettings.language !== undefined)) {
        const prefUpdates: any = { user_id: user.id };
        if (newSettings.darkMode !== undefined) prefUpdates.dark_mode = newSettings.darkMode;
        if (newSettings.language !== undefined) prefUpdates.language = newSettings.language;
        await supabase.from('user_preferences').upsert(prefUpdates);
      }

      setSettings(prev => ({ ...prev, ...newSettings }));
      showToast('Preferencias actualizadas', 'success');
    } catch (err: any) {
      showToast('Error guardando preferencias', 'alert', err.message);
    }
  }, [user.storeId, user.id, showToast]);

  const switchActiveRegister = useCallback(async (register: string) => {
    try {
      showToast(`Caja activa: ${register}`, 'info');
    } catch (err: any) {
      showToast('Error cambiando caja', 'alert', err.message);
    }
  }, [showToast]);

  const downloadSalesExcel = useCallback(async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const fileName = `productos_${todayStr}.csv`;

    const headers = [
      'Producto',
      'Código de Barras',
      'Categoría',
      'Precio Compra (S/)',
      'Precio Venta (S/)',
      'Ganancia por Unidad (S/)',
      'Margen (%)',
      'Stock Actual',
      'Unidades Vendidas',
      'Conteo Tickets',
      'Estado Dato'
    ];

    const rows = products.map(p => {
      const margin = p.salePrice - p.costPrice;
      const marginPct = p.costPrice > 0 ? ((margin / p.costPrice) * 100).toFixed(1) : '0.0';
      return [
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${(p.barcode || '').replace(/"/g, '""')}"`,
        `"${(p.categoryName || p.category || 'General').replace(/"/g, '""')}"`,
        p.costPrice.toFixed(2),
        p.salePrice.toFixed(2),
        margin.toFixed(2),
        `"${marginPct}%"`,
        p.stock,
        p.unitsSold,
        p.salesCount,
        p.status === 'REAL' ? 'Real (Confirmado)' : 'Estimado'
      ];
    });

    const csvBody = [headers.join(','), ...rows.map(e => e.join(','))].join('\r\n');
    const fullCsv = '\uFEFF' + csvBody;

    // Camino 1: Si corre nativamente en dispositivo Android (APK)
    if (Capacitor.isNativePlatform()) {
      try {
        const relativePath = `Rentabill/${fileName}`;
        await Filesystem.writeFile({
          path: relativePath,
          data: fullCsv,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true,
        });

        showToast(
          'Reporte guardado con éxito',
          'success',
          `Reporte guardado en Documentos/Rentabill/${fileName}`
        );
        return;
      } catch (nativeErr: any) {
        console.error('Error guardando reporte con Filesystem en Android:', nativeErr);
      }
    }

    // Camino 2: Navegador Web / PWA
    try {
      const blob = new Blob([fullCsv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      showToast(
        'Descarga completada',
        'success',
        `Archivo ${fileName} descargado con éxito.`
      );
    } catch (err: any) {
      showToast('Error al descargar reporte', 'alert', err.message);
    }
  }, [products, showToast]);

  const copyUserId = useCallback((idToCopy?: string) => {
    const id = idToCopy || user.userId;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(id).catch(() => {});
    }
    showToast('¡ID copiado al portapapeles!', 'success', `Tu ID ${id} está listo para ser compartido.`);
  }, [user.userId, showToast]);

  // Real Database Query for Registered User by user_code
  const findUserByUserId = useCallback(async (targetId: string): Promise<RegisteredDirectoryUser | null> => {
    if (!targetId || targetId.trim().length < 3) return null;
    const clean = targetId.trim().toUpperCase();

    try {
      // Direct profiles select fallback
      const { data, error } = await supabase
        .from('profiles')
        .select('user_code, name, email, phone')
        .eq('user_code', clean)
        .maybeSingle();

      if (error || !data) return null;

      return {
        userId: data.user_code,
        name: data.name,
        email: data.email || '',
        phone: data.phone || '',
      };
    } catch {
      return null;
    }
  }, []);

  // Send Invitation via Supabase RPC invite_by_code (v3.7)
  const sendInvitation = useCallback(async (targetCode: string, assignedRole: UserRole): Promise<{ success: boolean; error?: string }> => {
    if (!user.storeId) {
      showToast('No hay tienda activa para invitar', 'alert');
      return { success: false, error: 'Sin tienda' };
    }

    try {
      const cleanCode = targetCode.trim().toUpperCase();
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('invite_by_code', {
        p_store_id: user.storeId,
        p_user_code: cleanCode,
        p_role: assignedRole,
      });

      if (rpcErr) throw rpcErr;

      if (rpcRes && rpcRes.success === false) {
        if (rpcRes.error === 'ya_es_miembro') {
          showToast('El usuario ya es miembro de esta tienda', 'alert');
          return { success: false, error: 'ya_es_miembro' };
        }
        if (rpcRes.error === 'invitacion_pendiente') {
          showToast('Ya existe una invitación pendiente para este usuario', 'alert');
          return { success: false, error: 'invitacion_pendiente' };
        }
        showToast(`No se pudo invitar: ${rpcRes.error}`, 'alert');
        return { success: false, error: rpcRes.error };
      }

      setShowInviteModal(false);
      await loadStoreData(user.storeId);
      const targetName = rpcRes?.invited_name || cleanCode;
      showToast(`¡Invitaste a ${targetName}!`, 'success', `Rol asignado: ${ROLE_INFO[assignedRole].name}`);
      return { success: true };
    } catch (err: any) {
      console.error('Error enviando invitación:', err);
      showToast('Error al enviar invitación', 'alert', err.message);
      return { success: false, error: err.message };
    }
  }, [user.storeId, loadStoreData, showToast]);

  const cancelInvitation = useCallback(async (invitationId: string) => {
    try {
      await supabase.from('store_invitations').delete().eq('id', invitationId);
      setInvitations(prev => prev.filter(inv => inv.id !== invitationId));
      setIncomingInvitation(prev => (prev?.id === invitationId ? null : prev));
      showToast('Invitación cancelada', 'info');
    } catch (err: any) {
      showToast('Error al cancelar invitación', 'alert', err.message);
    }
  }, [showToast]);

  const copyInvitation = useCallback((invitationId: string) => {
    const inv = invitations.find(i => i.id === invitationId);
    if (!inv) return;
    const roleTitle = ROLE_INFO[inv.role].name;
    const message = `¡Hola ${inv.userName}! Te invito a unirte a "${inv.storeName}" como ${roleTitle}. Ingresa a Rentabill con tu ID: ${inv.userId} para aceptar tu invitación.`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(message).catch(() => {});
    }
    showToast('Enlace e invitación copiados', 'success', 'Listo para enviar por mensaje.');
  }, [invitations, showToast]);

  const acceptInvitation = useCallback(async (invitationIdOrToken: string) => {
    try {
      setLoading(true);

      // 1. Intentar RPC accept_invitation con token
      const { data: accRes, error: accErr } = await supabase.rpc('accept_invitation', {
        p_token: invitationIdOrToken,
      });

      if (!accErr && accRes) {
        if (accRes.success === false && accRes.error === 'expirada') {
          showToast('Invitación expirada', 'alert', 'La invitación ha vencido y ya no puede ser aceptada.');
          setIncomingInvitation(null);
          setShowInvitationConfirmModal(false);
          return;
        }
        if (accRes.success && accRes.store_id) {
          await switchStore(accRes.store_id);
          setIncomingInvitation(null);
          setShowInvitationConfirmModal(false);
          showToast('¡Invitación aceptada con éxito!', 'success', 'Te has unido al equipo del negocio.');
          return;
        }
      }

      // 2. Fallback a respond_invitation si es ID
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('respond_invitation', {
        p_invitation_id: invitationIdOrToken,
        p_accept: true
      });

      if (rpcErr) throw rpcErr;

      const targetStoreId = rpcRes?.store_id;
      if (targetStoreId) {
        await switchStore(targetStoreId);
      }

      setIncomingInvitation(null);
      setShowInvitationConfirmModal(false);
      showToast('¡Invitación aceptada con éxito!', 'success', 'Te has unido al equipo del negocio.');
    } catch (err: any) {
      showToast('Error aceptando invitación', 'alert', err.message);
    } finally {
      setLoading(false);
    }
  }, [switchStore, showToast]);

  const rejectInvitation = useCallback(async (invitationId: string) => {
    try {
      const { error: rpcErr } = await supabase.rpc('respond_invitation', {
        p_invitation_id: invitationId,
        p_accept: false
      });

      if (rpcErr) throw rpcErr;

      setIncomingInvitation(null);
      setShowInvitationConfirmModal(false);
      showToast('Invitación rechazada', 'info');
    } catch (err: any) {
      showToast('Error al rechazar invitación', 'alert', err.message);
    }
  }, [showToast]);

  const skipOnboardingForInvitation = useCallback(() => {
    setAuthScreen('authenticated');
    setActiveTabState('pulso');
    setShowProfileModal(true);
    showToast(
      '¡Listo! Copia tu ID para ser invitado',
      'success',
      `Tu ID es ${user.userId}. Compártelo con el dueño de la tienda para que te invite.`
    );
  }, [user.userId, showToast]);

  const retryLoadStores = useCallback(async () => {
    try {
      await loadUserStores();
    } catch (e) {
      console.warn('Reintento de tiendas falló:', e);
    }
  }, [loadUserStores]);

  const retrySession = useCallback(async () => {
    try {
      setLoading(true);
      setStoresLoadingStatus('loading');
      setStoresError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setTimeout(async () => {
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          if (currentUser) {
            // Recargar datos directamente
            const { data: memberRecs, error: membersErr } = await supabase
              .from('store_members')
              .select('store_id, role, stores(id, name, type, owner_id)')
              .eq('user_id', currentUser.id);

            if (membersErr) {
              setStoresLoadingStatus('error');
              setStoresError(membersErr.message);
              setAuthScreen('error');
              setLoading(false);
              return;
            }

            if (!memberRecs || memberRecs.length === 0) {
              setOnboardingMode('initial');
              setAuthScreen('onboarding');
              setLoading(false);
              return;
            }

            const mapped: UserStoreMembership[] = memberRecs.filter((m: any) => m.stores).map((m: any) => ({
              storeId: m.store_id,
              storeName: m.stores.name,
              storeType: m.stores.type || 'Abarrotes',
              role: m.role as UserRole,
              isOwner: m.stores.owner_id === currentUser.id,
              isActive: false,
            }));

            const { data: profile } = await supabase.from('profiles').select('active_store_id').eq('id', currentUser.id).maybeSingle();
            let targetId = mapped[0].storeId;
            if (profile?.active_store_id && mapped.some(m => m.storeId === profile.active_store_id)) {
              targetId = profile.active_store_id;
            }
            mapped.forEach(m => { m.isActive = m.storeId === targetId; });
            setUserStores(mapped);
            setStoresLoadingStatus('loaded');
            await loadStoreData(targetId);
            setAuthScreen('authenticated');
            setLoading(false);
          }
        }, 0);
      } else {
        setAuthScreen('login');
        setLoading(false);
      }
    } catch (err: any) {
      setStoresError(err.message || 'Error de conexión');
      setAuthScreen('error');
      setLoading(false);
    }
  }, [loadStoreData]);

  const resetDemoData = useCallback(() => {
    showToast("La aplicación ahora usa datos reales desde Supabase.", 'info');
  }, [showToast]);

  return (
    <InventoryContext.Provider
      value={{
        products,
        calculatedProducts,
        metrics,
        activeTab,
        setActiveTab,
        cart,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        setCartQuantity,
        clearCart,
        checkout,
        registerSaleSingle,
        addProduct,
        updateProduct,
        deleteProduct,
        calibrationEvent,
        dismissCalibrationModal,
        toast,
        showToast,
        resetDemoData,
        searchQuery,
        setSearchQuery,
        selectedFilter,
        setSelectedFilter,
        currentSort,
        setCurrentSort,
        sales,
        inventoryMovements,
        suppliers,
        pastSimulations,
        purchases,
        addInventoryMovement,
        addSupplier,
        addPastSimulation,
        confirmPastSimulationPurchase,
        payPurchase,
        getRealProductVelocity,
        authScreen,
        setAuthScreen,
        user,
        storeInfo,
        teamMembers,
        settings,
        showProfileModal,
        setShowProfileModal,
        showLogoutModal,
        setShowLogoutModal,
        showInviteModal,
        setShowInviteModal,
        showHelpModal,
        setShowHelpModal,
        login,
        registerUser,
        completeOnboarding,
        logout,
        updateProfile,
        updateStoreInfo,
        addTeamMember,
        updateTeamMemberRole,
        removeTeamMember,
        setUserRole,
        isTestingRole,
        exitRoleTest,
        updateSettings,
        switchActiveRegister,
        downloadSalesExcel,
        invitations,
        sendInvitation,
        cancelInvitation,
        copyInvitation,
        incomingInvitation,
        setIncomingInvitation,
        showInvitationConfirmModal,
        setShowInvitationConfirmModal,
        acceptInvitation,
        rejectInvitation,
        skipOnboardingForInvitation,
        findUserByUserId,
        copyUserId,
        // Multi-Store Management (Parte B1)
        userStores,
        storesLoadingStatus,
        storesError,
        loadUserStores,
        retryLoadStores,
        retrySession,
        switchStore,
        createAdditionalStore,
        showStoreSelectorModal,
        setShowStoreSelectorModal,
        // Onboarding mode & navigation
        onboardingMode,
        setOnboardingMode,
        openAddStoreOnboarding,
        cancelAddStoreOnboarding,
        loading,
        error,
        refreshData,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
};
