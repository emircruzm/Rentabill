import React, { useState, useMemo } from 'react';
import { 
  History, 
  ShoppingBag, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ArrowUpDown, 
  Search, 
  Calendar, 
  Filter, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  DollarSign, 
  TrendingUp, 
  Layers, 
  ChevronRight, 
  X, 
  Plus, 
  FileText, 
  Check, 
  User, 
  Truck,
  Sparkles
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { SaleRecord, InventoryMovement, PastSimulation, MovementType } from '../types';

export const HistorialView: React.FC = () => {
  const { 
    sales, 
    inventoryMovements, 
    pastSimulations, 
    products, 
    addInventoryMovement, 
    confirmPastSimulationPurchase, 
    setActiveTab, 
    user 
  } = useInventory();

  const [activeSection, setActiveSection] = useState<'ventas' | 'movimientos' | 'simulaciones'>('ventas');

  // Sales filters
  const [salesDateFilter, setSalesDateFilter] = useState<'hoy' | 'semana' | 'mes' | 'todas'>('todas');
  const [salesSearch, setSalesSearch] = useState('');
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<SaleRecord | null>(null);

  // Movements filters
  const [movementTypeFilter, setMovementTypeFilter] = useState<'TODOS' | 'COMPRA' | 'VENTA' | 'AJUSTE'>('TODOS');
  const [movementSearch, setMovementSearch] = useState('');
  const [showAddAdjustmentModal, setShowAddAdjustmentModal] = useState(false);

  // Adjustment Modal Form State
  const [adjProductId, setAdjProductId] = useState(products[0]?.id || '');
  const [adjType, setAdjType] = useState<'merma' | 'conteo_mas' | 'conteo_menos'>('merma');
  const [adjQuantity, setAdjQuantity] = useState(1);
  const [adjNote, setAdjNote] = useState('');

  // -----------------------------
  // Filtered Sales Calculation
  // -----------------------------
  const filteredSales = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return sales.filter(sale => {
      const saleTime = new Date(sale.timestamp).getTime();

      // Date filtering
      if (salesDateFilter === 'hoy' && saleTime < startOfToday) return false;
      if (salesDateFilter === 'semana' && saleTime < startOfWeek) return false;
      if (salesDateFilter === 'mes' && saleTime < startOfMonth) return false;

      // Search filtering
      if (salesSearch.trim()) {
        const query = salesSearch.toLowerCase().trim();
        const matchesTicket = sale.ticketNumber.toLowerCase().includes(query);
        const matchesProduct = sale.items.some(item => item.productName.toLowerCase().includes(query));
        const matchesCashier = sale.cashierName.toLowerCase().includes(query);
        if (!matchesTicket && !matchesProduct && !matchesCashier) return false;
      }

      return true;
    });
  }, [sales, salesDateFilter, salesSearch]);

  const salesTotals = useMemo(() => {
    const totalAmount = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
    const totalProfit = filteredSales.reduce((sum, s) => sum + s.totalProfit, 0);
    const marginPercent = totalAmount > 0 ? (totalProfit / totalAmount) * 100 : 0;
    return {
      totalAmount,
      totalProfit,
      marginPercent,
      count: filteredSales.length,
    };
  }, [filteredSales]);

  // -----------------------------
  // Filtered Movements Calculation
  // -----------------------------
  const filteredMovements = useMemo(() => {
    return inventoryMovements.filter(m => {
      if (movementTypeFilter !== 'TODOS' && m.type !== movementTypeFilter) {
        return false;
      }
      if (movementSearch.trim()) {
        const query = movementSearch.toLowerCase().trim();
        const matchesProduct = m.productName.toLowerCase().includes(query);
        const matchesUser = m.userName.toLowerCase().includes(query);
        const matchesNote = m.note?.toLowerCase().includes(query) || false;
        const matchesSupplier = m.supplierName?.toLowerCase().includes(query) || false;
        if (!matchesProduct && !matchesUser && !matchesNote && !matchesSupplier) return false;
      }
      return true;
    });
  }, [inventoryMovements, movementTypeFilter, movementSearch]);

  // Helper date formatter
  const formatDateTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      const timeStr = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      
      if (isToday) {
        return `Hoy, ${timeStr}`;
      }
      const dayMonth = date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
      return `${dayMonth}, ${timeStr}`;
    } catch {
      return isoString;
    }
  };

  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    const product = products.find(p => p.id === adjProductId);
    if (!product) return;

    let qtyDelta = 0;
    let defaultReason = '';
    if (adjType === 'merma') {
      qtyDelta = -Math.abs(adjQuantity);
      defaultReason = 'Pérdida / merma por daño o caducidad';
    } else if (adjType === 'conteo_menos') {
      qtyDelta = -Math.abs(adjQuantity);
      defaultReason = 'Ajuste de conteo físico (faltante)';
    } else {
      qtyDelta = Math.abs(adjQuantity);
      defaultReason = 'Ajuste de conteo físico (sobrante)';
    }

    addInventoryMovement({
      type: 'AJUSTE',
      productId: product.id,
      productName: product.name,
      quantity: qtyDelta,
      previousStock: product.stock,
      newStock: Math.max(0, product.stock + qtyDelta),
      userName: user.name || 'Administrador (Tú)',
      note: adjNote.trim() || defaultReason,
    });

    setShowAddAdjustmentModal(false);
    setAdjQuantity(1);
    setAdjNote('');
  };

  return (
    <div className="pb-28 px-4 pt-3 max-w-md mx-auto space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2 tracking-tight">
            <History className="w-5 h-5 text-emerald-800" />
            <span>Historial del Negocio</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Registro real de ventas, movimientos y proyecciones
          </p>
        </div>
      </div>

      {/* 3-Section Segmented Controls */}
      <div className="bg-slate-200/80 p-1 rounded-2xl flex items-center gap-1 shadow-inner">
        <button
          onClick={() => setActiveSection('ventas')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSection === 'ventas'
              ? 'bg-white text-emerald-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Ventas</span>
        </button>

        <button
          onClick={() => setActiveSection('movimientos')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSection === 'movimientos'
              ? 'bg-white text-emerald-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span>Movimientos</span>
        </button>

        <button
          onClick={() => setActiveSection('simulaciones')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSection === 'simulaciones'
              ? 'bg-white text-emerald-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Simulaciones</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* SUB-SECCIÓN 1: VENTAS A CLIENTES                         */}
      {/* ======================================================== */}
      {activeSection === 'ventas' && (
        <div className="space-y-3.5">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 block">Total Vendido</span>
              <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                ${salesTotals.totalAmount.toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                {salesTotals.count} {salesTotals.count === 1 ? 'ticket' : 'tickets'} registrados
              </span>
            </div>

            <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-100 shadow-xs">
              <span className="text-[11px] font-semibold text-emerald-800 block">Ganancia Neta Real</span>
              <div className="text-lg font-black text-emerald-700 font-mono mt-0.5">
                +${salesTotals.totalProfit.toFixed(2)}
              </div>
              <span className="text-[10px] font-bold text-emerald-800 mt-1 block">
                Margen promedio {salesTotals.marginPercent.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Filters Bar: Search & Date Chips */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={salesSearch}
                onChange={e => setSalesSearch(e.target.value)}
                placeholder="Buscar por ticket, producto o cajero..."
                className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
              />
              {salesSearch && (
                <button 
                  onClick={() => setSalesSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {(['todas', 'hoy', 'semana', 'mes'] as const).map(filterKey => {
                const labels: Record<string, string> = {
                  todas: 'Todas las fechas',
                  hoy: 'Hoy',
                  semana: 'Esta semana',
                  mes: 'Este mes',
                };
                return (
                  <button
                    key={filterKey}
                    onClick={() => setSalesDateFilter(filterKey)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                      salesDateFilter === filterKey
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                    }`}
                  >
                    {labels[filterKey]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sales List */}
          <div className="space-y-2">
            {filteredSales.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-3xl border border-dashed border-slate-200 p-6 space-y-2">
                <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto" />
                <h3 className="text-sm font-bold text-slate-700">No se encontraron ventas</h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Prueba cambiando el rango de fechas o el término de búsqueda.
                </p>
              </div>
            ) : (
              filteredSales.map(sale => (
                <div
                  key={sale.id}
                  onClick={() => setSelectedSaleDetail(sale)}
                  className="bg-white p-3.5 rounded-2xl border border-slate-100 hover:border-emerald-200 hover:shadow-xs transition-all cursor-pointer active:scale-[0.99] space-y-2"
                >
                  {/* Top row: Ticket, Date, Payment */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                        {sale.ticketNumber}
                      </span>
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDateTime(sale.timestamp)}
                      </span>
                    </div>

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                      sale.paymentMethod === 'efectivo'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : sale.paymentMethod === 'qr'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-purple-50 text-purple-700 border border-purple-200'
                    }`}>
                      {sale.paymentMethod}
                    </span>
                  </div>

                  {/* Middle row: Items preview */}
                  <div className="text-xs text-slate-700">
                    <p className="truncate font-medium">
                      {sale.items.map(item => `${item.quantity}x ${item.productName}`).join(' • ')}
                    </p>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Atendido por {sale.cashierName}
                    </span>
                  </div>

                  {/* Bottom row: Total and Profit */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-50">
                    <div className="text-xs text-slate-500">
                      Total venta:{' '}
                      <span className="font-mono font-black text-slate-900">
                        ${sale.totalAmount.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-[10px] text-slate-400 font-medium">Ganancia:</span>
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">
                        +${sale.totalProfit.toFixed(2)}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-SECCIÓN 2: MOVIMIENTOS DE INVENTARIO                 */}
      {/* ======================================================== */}
      {activeSection === 'movimientos' && (
        <div className="space-y-3.5">

          {/* Action Bar: Search, Type Filters & Add Adjustment Button */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={movementSearch}
                  onChange={e => setMovementSearch(e.target.value)}
                  placeholder="Buscar movimiento por producto o persona..."
                  className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                />
                {movementSearch && (
                  <button 
                    onClick={() => setMovementSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowAddAdjustmentModal(true)}
                className="py-2 px-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center gap-1 shadow-xs shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajuste</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {(['TODOS', 'COMPRA', 'VENTA', 'AJUSTE'] as const).map(typeKey => {
                const labels: Record<string, string> = {
                  TODOS: 'Todos',
                  COMPRA: 'Entradas (Compras)',
                  VENTA: 'Salidas (Ventas)',
                  AJUSTE: 'Ajustes Manuales',
                };
                return (
                  <button
                    key={typeKey}
                    onClick={() => setMovementTypeFilter(typeKey)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                      movementTypeFilter === typeKey
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                    }`}
                  >
                    {labels[typeKey]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Movements Timeline */}
          <div className="space-y-2">
            {filteredMovements.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-3xl border border-dashed border-slate-200 p-6 space-y-2">
                <ArrowUpDown className="w-8 h-8 text-slate-300 mx-auto" />
                <h3 className="text-sm font-bold text-slate-700">Sin movimientos que coincidan</h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Prueba cambiando los filtros de tipo o término de búsqueda.
                </p>
              </div>
            ) : (
              filteredMovements.map(mov => {
                const isIncoming = mov.quantity > 0;
                return (
                  <div
                    key={mov.id}
                    className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs space-y-2"
                  >
                    {/* Header: Type Badge, Quantity delta, Date */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black tracking-wide flex items-center gap-1 ${
                          mov.type === 'COMPRA'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : mov.type === 'VENTA'
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {mov.type === 'COMPRA' && <ArrowDownLeft className="w-3 h-3" />}
                          {mov.type === 'VENTA' && <ArrowUpRight className="w-3 h-3" />}
                          {mov.type === 'AJUSTE' && <ArrowUpDown className="w-3 h-3" />}
                          {mov.type === 'COMPRA' ? 'COMPRA' : mov.type === 'VENTA' ? 'VENTA' : 'AJUSTE MANUAL'}
                        </span>

                        <span className="text-[11px] text-slate-400">
                          {formatDateTime(mov.timestamp)}
                        </span>
                      </div>

                      {/* Green for in, Red for out */}
                      <span className={`font-mono text-xs font-black px-2 py-0.5 rounded-full ${
                        isIncoming 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {isIncoming ? `+${mov.quantity}` : `${mov.quantity}`} unids
                      </span>
                    </div>

                    {/* Product Name and Stock Transition */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">
                          {mov.productName}
                        </h4>
                        {mov.supplierName && (
                          <span className="text-[10px] text-emerald-800 font-medium flex items-center gap-1 mt-0.5">
                            <Truck className="w-2.5 h-2.5" />
                            Proveedor: {mov.supplierName}
                          </span>
                        )}
                        {mov.note && (
                          <p className="text-[11px] text-slate-500 mt-0.5 italic">
                            "{mov.note}"
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 block font-medium">Cantidad</span>
                        <span className="text-xs font-mono font-bold text-slate-700">
                          {mov.previousStock} → <strong className="text-slate-900 font-black">{mov.newStock}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Footer: User responsible */}
                    <div className="text-[10px] text-slate-400 flex items-center gap-1 pt-1 border-t border-slate-50">
                      <User className="w-2.5 h-2.5 text-slate-400" />
                      <span>Registrado por: <strong className="text-slate-600 font-semibold">{mov.userName}</strong></span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-SECCIÓN 3: SIMULACIONES PASADAS                      */}
      {/* ======================================================== */}
      {activeSection === 'simulaciones' && (
        <div className="space-y-3.5">
          {/* Header Explanation: Lo que dijimos vs Lo que pasó */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="text-xs leading-relaxed">
              <span className="font-bold text-emerald-900 block">Lo que proyectamos vs. La vida real</span>
              <p className="text-emerald-800 mt-0.5">
                Aquí guardamos tus simulaciones de compra. Si hiciste la compra, revisamos tus ventas reales para comprobar si ganaste lo que proyectamos.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-700">
              {pastSimulations.length} Simulaciones registradas
            </span>
            <button
              onClick={() => setActiveTab('simulador')}
              className="text-xs font-bold text-emerald-800 hover:text-emerald-900 flex items-center gap-1"
            >
              <span>+ Nueva Simulación</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Past Simulations List */}
          <div className="space-y-3">
            {pastSimulations.map(sim => {
              const isBought = sim.status === 'comprado';

              return (
                <div 
                  key={sim.id}
                  className="bg-white p-4 rounded-3xl border border-slate-100 shadow-xs space-y-3.5"
                >
                  {/* Top Bar: Date, Simulated Product, Quantity */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                          {sim.date}
                        </span>
                        {isBought ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Compra confirmada
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            No comprada / En espera
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-black text-slate-900 mt-1">
                        Simulaste {sim.simulatedQuantity} unids de {sim.productName}
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Inversión requerida: <strong className="text-slate-800 font-mono font-bold">${sim.totalCost.toFixed(2)}</strong> (${sim.unitCost.toFixed(2)} c/u)
                      </p>
                      {sim.supplierName && (
                        <p className="text-[10px] text-slate-600 mt-0.5 flex items-center gap-1">
                          <Truck className="w-2.5 h-2.5 text-slate-400" />
                          Proveedor: <strong>{sim.supplierName}</strong> ({sim.paymentCondition === 'credito' ? `Crédito ${sim.creditDays} días` : 'Pago de contado'})
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Comparison Box: Lo que dijimos vs Lo que pasó */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                    {/* Projection Card */}
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Lo que dijimos que pasaría
                      </span>
                      <div className="text-xs text-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Ganarías al día:</span>
                          <strong className="text-emerald-700 font-mono font-bold">
                            +${sim.projectedDailyProfitGain.toFixed(2)}/día
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Tiempo de venta:</span>
                          <span className="font-semibold text-slate-700 font-mono">
                            ~{sim.projectedDaysToSell} días
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Puntaje salud:</span>
                          <span className="font-semibold text-emerald-700">
                            +{sim.projectedScoreGain} pts
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actual Result Card */}
                    <div className={`p-3 rounded-2xl border space-y-1.5 ${
                      isBought 
                        ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950' 
                        : 'bg-amber-50/50 border-amber-200 text-amber-950'
                    }`}>
                      <span className={`text-[10px] font-bold uppercase tracking-wider block ${
                        isBought ? 'text-emerald-800' : 'text-amber-800'
                      }`}>
                        Lo que pasó de verdad
                      </span>
                      {isBought ? (
                        <div className="text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">Ganancia real:</span>
                            <strong className="text-emerald-700 font-mono font-bold">
                              +${(sim.actualDailyProfitGain || sim.projectedDailyProfitGain).toFixed(2)}/día
                            </strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">Se agotó en:</span>
                            <span className="font-semibold text-slate-800 font-mono">
                              {sim.actualDaysToSell || sim.projectedDaysToSell} días
                            </span>
                          </div>
                          <p className="text-[10px] text-emerald-900 mt-1 leading-snug font-medium">
                            {sim.actualResultNote || "La decisión fue acertada y generó la ganancia prevista."}
                          </p>
                        </div>
                      ) : (
                        <div className="text-xs space-y-2">
                          <span className="text-[11px] text-amber-900 font-medium block">
                            Resultado: Pendiente
                          </span>
                          <p className="text-[10px] text-amber-800 leading-snug">
                            {sim.actualResultNote || "No registraste la compra de esta mercancía. Tu dinero no se movió."}
                          </p>
                          <button
                            onClick={() => confirmPastSimulationPurchase(sim.id)}
                            className="w-full py-1.5 px-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-[11px] font-bold transition-all shadow-xs flex items-center justify-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            <span>Comprar y sumar al inventario</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: DETALLE COMPLETO DE VENTA                         */}
      {/* ======================================================== */}
      {selectedSaleDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                  {selectedSaleDetail.ticketNumber}
                </span>
                <span className="text-xs text-slate-400 ml-2">
                  {formatDateTime(selectedSaleDetail.timestamp)}
                </span>
              </div>
              <button 
                onClick={() => setSelectedSaleDetail(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cashier & Payment Info */}
            <div className="bg-slate-50 p-3 rounded-2xl flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">Atendido por</span>
                <span className="font-bold text-slate-800">{selectedSaleDetail.cashierName}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-medium">Método de pago</span>
                <span className="font-bold text-slate-800 capitalize">{selectedSaleDetail.paymentMethod}</span>
              </div>
            </div>

            {/* Products Table */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-800 block">Productos en el ticket</span>
              <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                {selectedSaleDetail.items.map((item, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 truncate">
                        {item.quantity}x {item.productName}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Precio: ${item.unitPrice.toFixed(2)} • Costo: ${item.unitCost.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-slate-900">
                        ${item.subtotal.toFixed(2)}
                      </div>
                      <div className="text-[10px] font-bold font-mono text-emerald-700">
                        +${item.profit.toFixed(2)} ganancia
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cash & Change breakdown if available */}
            {selectedSaleDetail.cashGiven !== undefined && selectedSaleDetail.changeGiven !== undefined && (
              <div className="bg-slate-50 p-3 rounded-2xl text-xs space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Efectivo entregado por cliente:</span>
                  <span className="font-mono font-bold">${selectedSaleDetail.cashGiven.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Cambio devuelto:</span>
                  <span className="font-mono font-bold text-emerald-700">${selectedSaleDetail.changeGiven.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Grand Totals */}
            <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-100 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-emerald-900 font-bold">Total cobrado:</span>
                <span className="font-mono font-black text-slate-900 text-base">
                  ${selectedSaleDetail.totalAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-200/60">
                <span className="text-emerald-800 font-semibold">Ganancia neta total:</span>
                <span className="font-mono font-black text-emerald-700 text-sm">
                  +${selectedSaleDetail.totalProfit.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedSaleDetail(null)}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-2xl transition-colors"
            >
              Cerrar Detalle
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: REGISTRAR AJUSTE MANUAL DE INVENTARIO             */}
      {/* ======================================================== */}
      {showAddAdjustmentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                  <ArrowUpDown className="w-4 h-4 text-emerald-800" />
                  <span>Registrar Ajuste de Inventario</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Corrige mermas, pérdidas o errores de conteo físico
                </p>
              </div>
              <button 
                onClick={() => setShowAddAdjustmentModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="space-y-3.5">
              {/* Product selector */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Producto a ajustar</label>
                <select
                  value={adjProductId}
                  onChange={e => setAdjProductId(e.target.value)}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Cantidad actual: {p.stock})
                    </option>
                  ))}
                </select>
              </div>

              {/* Adjustment Reason Type */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Tipo de ajuste</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAdjType('merma')}
                    className={`p-2 rounded-xl text-center text-[11px] font-bold border transition-all ${
                      adjType === 'merma'
                        ? 'bg-rose-50 border-rose-300 text-rose-800 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Merma / Daño
                    <span className="block text-[9px] font-normal opacity-80">(Resta cantidad)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdjType('conteo_menos')}
                    className={`p-2 rounded-xl text-center text-[11px] font-bold border transition-all ${
                      adjType === 'conteo_menos'
                        ? 'bg-amber-50 border-amber-300 text-amber-800 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Faltante
                    <span className="block text-[9px] font-normal opacity-80">(Resta cantidad)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdjType('conteo_mas')}
                    className={`p-2 rounded-xl text-center text-[11px] font-bold border transition-all ${
                      adjType === 'conteo_mas'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Sobrante
                    <span className="block text-[9px] font-normal opacity-80">(Suma cantidad)</span>
                  </button>
                </div>
              </div>

              {/* Quantity */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Cantidad de unidades</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={adjQuantity}
                    onChange={e => setAdjQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              {/* Note / Motivo */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Nota explicativa (opcional)</label>
                <input
                  type="text"
                  value={adjNote}
                  onChange={e => setAdjNote(e.target.value)}
                  placeholder="Ej: Empaque roto en pasillo, conteo físico mensual..."
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddAdjustmentModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold shadow-xs transition-colors"
                >
                  Guardar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
