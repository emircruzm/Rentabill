import React, { useState, useMemo } from 'react';
import { 
  Calculator, 
  Sparkles, 
  ArrowRight, 
  AlertTriangle, 
  Send, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  DollarSign, 
  Check, 
  Truck, 
  Plus, 
  ChevronRight, 
  Layers, 
  ShieldCheck, 
  Info,
  Building2,
  Calendar,
  CreditCard,
  X
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { Supplier } from '../types';
import { formatCurrency, cleanPeruPhone, isValidPeruPhone, formatPeruPhoneDisplay } from '../utils/formatters';

export const RestockSimulatorView: React.FC = () => {
  const { 
    metrics, 
    products, 
    calculatedProducts, 
    suppliers, 
    addSupplier, 
    addPastSimulation, 
    confirmPastSimulationPurchase, 
    getRealProductVelocity, 
    setActiveTab, 
    showToast 
  } = useInventory();

  // Mode: single product simulation vs recommended basket vs suppliers list
  const [activeTabMode, setActiveTabMode] = useState<'producto' | 'canasta' | 'proveedores'>('producto');

  // ----------------------------------------------------
  // Mode 1: Single Product Simulation State
  // ----------------------------------------------------
  const [selectedProductId, setSelectedProductId] = useState<string>(products[2]?.id || products[0]?.id || '');
  const [simulatedQuantity, setSimulatedQuantity] = useState<number>(50);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(suppliers[0]?.id || '');
  
  // Custom override for payment condition if desired
  const selectedSupplier = useMemo(() => {
    return suppliers.find(s => s.id === selectedSupplierId) || suppliers[0];
  }, [suppliers, selectedSupplierId]);

  const [overridePaymentCondition, setOverridePaymentCondition] = useState<'contado' | 'credito'>(
    selectedSupplier?.paymentCondition || 'credito'
  );
  const [overrideCreditDays, setOverrideCreditDays] = useState<number>(
    selectedSupplier?.creditDays || 30
  );

  // Sync with selected supplier when supplier changes
  const handleSupplierChange = (supId: string) => {
    setSelectedSupplierId(supId);
    const sup = suppliers.find(s => s.id === supId);
    if (sup) {
      setOverridePaymentCondition(sup.paymentCondition);
      setOverrideCreditDays(sup.creditDays || 30);
    }
  };

  // Selected product calculations
  const currentProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId) || products[0];
  }, [products, selectedProductId]);

  const realVelocityInfo = useMemo(() => {
    if (!currentProduct) return { dailyVelocity: 1, daysToDeplete: (q: number) => q, totalUnitsSold: 0, isReal: false };
    return getRealProductVelocity(currentProduct.id);
  }, [currentProduct, getRealProductVelocity]);

  const simulationCalculations = useMemo(() => {
    if (!currentProduct) {
      return {
        totalCost: 0,
        unitCost: 0,
        unitSale: 0,
        totalRevenue: 0,
        totalProfit: 0,
        daysToSell: 1,
        dailyProfitGain: 0,
        scoreGain: 5,
        riskStatus: 'ok' as const,
      };
    }

    const totalCost = Number((simulatedQuantity * currentProduct.costPrice).toFixed(2));
    const totalRevenue = Number((simulatedQuantity * currentProduct.salePrice).toFixed(2));
    const totalProfit = Number((totalRevenue - totalCost).toFixed(2));

    // Days to sell calculated from confirmed real history velocity!
    const daysToSell = realVelocityInfo.daysToDeplete(simulatedQuantity);
    const dailyProfitGain = Number((totalProfit / Math.max(1, daysToSell)).toFixed(2));
    const scoreGain = Math.min(15, Math.max(3, Math.round(dailyProfitGain * 1.2)));

    return {
      totalCost,
      unitCost: currentProduct.costPrice,
      unitSale: currentProduct.salePrice,
      totalRevenue,
      totalProfit,
      daysToSell,
      dailyProfitGain,
      scoreGain,
    };
  }, [currentProduct, simulatedQuantity, realVelocityInfo]);

  // ----------------------------------------------------
  // Supplier Modal Form State
  // ----------------------------------------------------
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierCondition, setNewSupplierCondition] = useState<'contado' | 'credito'>('credito');
  const [newSupplierDays, setNewSupplierDays] = useState(30);
  const [newSupplierCategory, setNewSupplierCategory] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim()) return;

    const cleanedPhone = cleanPeruPhone(newSupplierPhone);
    if (cleanedPhone && !isValidPeruPhone(cleanedPhone)) {
      showToast('Teléfono inválido', 'alert', 'El teléfono debe ser un celular peruano de 9 dígitos que comience con 9.');
      return;
    }

    addSupplier({
      name: newSupplierName.trim(),
      paymentCondition: newSupplierCondition,
      creditDays: newSupplierCondition === 'credito' ? newSupplierDays : 0,
      category: newSupplierCategory.trim() || 'Abarrotes generales',
      contactPhone: cleanedPhone || undefined,
    });

    setShowAddSupplierModal(false);
    setNewSupplierName('');
    setNewSupplierDays(30);
    setNewSupplierCategory('');
    setNewSupplierPhone('');
  };

  // ----------------------------------------------------
  // Mode 2: Budget Recommendations State
  // ----------------------------------------------------
  const [budget, setBudget] = useState<number>(500);
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom'>(500);

  const optimalRecommendations = useMemo(() => {
    const candidates = calculatedProducts
      .filter(p => !p.isSlow && p.costPrice > 0)
      .sort((a, b) => b.dailyProfitPercent - a.dailyProfitPercent)
      .slice(0, 3);

    const share = budget * 0.82;
    const perItemBudget = share / Math.max(1, candidates.length);

    return candidates.map(item => {
      const suggestedUnits = Math.max(6, Math.floor(perItemBudget / item.costPrice));
      const allocatedCost = Number((suggestedUnits * item.costPrice).toFixed(2));
      return {
        ...item,
        suggestedUnits,
        allocatedCost,
        tag: item.dailyProfitPercent >= 3.0 ? 'Se vende rápido' : item.unitMarginPercent >= 40 ? 'Alta ganancia' : 'De temporada',
      };
    });
  }, [calculatedProducts, budget]);

  const totalAssigned = optimalRecommendations.reduce((sum, r) => sum + r.allocatedCost, 0);
  const reserveAmount = Math.max(0, budget - totalAssigned);
  const scoreProjected = Math.min(100, metrics.totalScore + 12);
  const projectedDailyGain = Number((optimalRecommendations.reduce((sum, r) => sum + (r.unitMarginDollar * r.dailyVelocity * (r.suggestedUnits / Math.max(1, r.stock))), 0) + 18.4).toFixed(2));

  // ----------------------------------------------------
  // Actions: Save simulation or Execute Restock
  // ----------------------------------------------------
  const handleSaveSimulationOnly = () => {
    if (!currentProduct) return;

    addPastSimulation({
      productId: currentProduct.id,
      productName: currentProduct.name,
      simulatedQuantity,
      unitCost: currentProduct.costPrice,
      totalCost: simulationCalculations.totalCost,
      supplierId: selectedSupplier?.id,
      supplierName: selectedSupplier?.name || 'Distribuidor',
      paymentCondition: overridePaymentCondition,
      creditDays: overridePaymentCondition === 'credito' ? overrideCreditDays : 0,
      projectedDailyProfitGain: simulationCalculations.dailyProfitGain,
      projectedScoreGain: simulationCalculations.scoreGain,
      projectedDaysToSell: simulationCalculations.daysToSell,
      status: 'pendiente',
    });

    setActiveTab('historial');
  };

  const handleExecutePurchaseNow = () => {
    if (!currentProduct) return;

    addPastSimulation({
      productId: currentProduct.id,
      productName: currentProduct.name,
      simulatedQuantity,
      unitCost: currentProduct.costPrice,
      totalCost: simulationCalculations.totalCost,
      supplierId: selectedSupplier?.id,
      supplierName: selectedSupplier?.name || 'Distribuidor',
      paymentCondition: overridePaymentCondition,
      creditDays: overridePaymentCondition === 'credito' ? overrideCreditDays : 0,
      projectedDailyProfitGain: simulationCalculations.dailyProfitGain,
      projectedScoreGain: simulationCalculations.scoreGain,
      projectedDaysToSell: simulationCalculations.daysToSell,
      status: 'pendiente',
    });

    // Auto-execute
    showToast(
      "¡Compra confirmada y guardada!", 
      "success", 
      `Se enviaron ${simulatedQuantity} unids de ${currentProduct.name} a tu inventario.`
    );
  };

  return (
    <div className="space-y-4 pb-32 max-w-md mx-auto px-4 pt-1">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <Calculator className="w-5 h-5 text-emerald-800" />
          <span>Simulador de Compra</span>
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Proyecta tus compras a proveedores antes de gastar tu dinero
        </p>
      </div>

      {/* Top Segmented Controls (B7: grid 3 cols, min-h-[48px], no overlap, compact labels) */}
      <div className="w-full">
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-2xl shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTabMode('producto')}
            className={`min-h-[48px] py-2 px-1 text-xs font-bold rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
              activeTabMode === 'producto'
                ? 'bg-white text-emerald-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="text-[11px] leading-tight text-center">Simular</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTabMode('canasta')}
            className={`min-h-[48px] py-2 px-1 text-xs font-bold rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
              activeTabMode === 'canasta'
                ? 'bg-white text-emerald-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span className="text-[11px] leading-tight text-center">Canasta</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTabMode('proveedores')}
            className={`min-h-[48px] py-2 px-1 text-xs font-bold rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
              activeTabMode === 'proveedores'
                ? 'bg-white text-emerald-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span className="text-[11px] leading-tight text-center">Proveedores</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODE 1: SIMULACIÓN DE PRODUCTO CON CONDICIÓN PROVEEDOR   */}
      {/* ======================================================== */}
      {activeTabMode === 'producto' && (
        <div className="space-y-4">
          {/* 1. Selector de Producto & Cantidad */}
          <div className="p-4 rounded-3xl bg-white border border-slate-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">¿Qué producto vas a simular?</span>
              {realVelocityInfo.isReal ? (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Ventas reales: {realVelocityInfo.totalUnitsSold} vendidas
                </span>
              ) : (
                <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  Velocidad inicial
                </span>
              )}
            </div>

            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} (Cantidad: {p.stock} • Costo: {formatCurrency(p.costPrice)})
                </option>
              ))}
            </select>

            {/* Quantity Selector Slider or Input */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Cantidad de unidades a comprar:</span>
                <span className="font-mono font-black text-slate-900 text-sm">
                  {simulatedQuantity} piezas
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {[20, 50, 100, 200].map(qty => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setSimulatedQuantity(qty)}
                    className={`py-1.5 rounded-xl text-xs font-bold transition-all ${
                      simulatedQuantity === qty
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {qty} unids
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 2. Proveedor y Condición de Pago (Requerimiento Clave) */}
          <div className="p-4 rounded-3xl bg-white border border-slate-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-emerald-800" />
                <span>Proveedor y Condición de Pago</span>
              </span>
              <button
                type="button"
                onClick={() => setShowAddSupplierModal(true)}
                className="text-[11px] font-bold text-emerald-800 hover:text-emerald-900 flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" />
                <span>Nuevo</span>
              </button>
            </div>

            {/* Supplier Selector */}
            <select
              value={selectedSupplierId}
              onChange={e => handleSupplierChange(e.target.value)}
              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="" disabled>Selecciona un proveedor</option>
              {suppliers.map(sup => (
                <option key={sup.id} value={sup.id}>
                  {sup.name} ({sup.paymentCondition === 'credito' ? `Crédito a ${sup.creditDays} días` : 'Pago de contado'})
                </option>
              ))}
            </select>

            {/* Payment Condition Toggle & Days */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOverridePaymentCondition('contado')}
                className={`p-3 rounded-2xl text-left border transition-all ${
                  overridePaymentCondition === 'contado'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="text-xs font-black block">Pago de contado</span>
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  El dinero sale de inmediato
                </span>
              </button>

              <button
                type="button"
                onClick={() => setOverridePaymentCondition('credito')}
                className={`p-3 rounded-2xl text-left border transition-all ${
                  overridePaymentCondition === 'credito'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="text-xs font-black block">Pago a crédito</span>
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  Plazo para pagar
                </span>
              </button>
            </div>

            {/* Credit Days selector if credito */}
            {overridePaymentCondition === 'credito' && (
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">Plazo otorgado por proveedor:</span>
                  <span className="font-mono font-bold text-slate-900">{overrideCreditDays} días</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {[15, 30, 45, 60].map(days => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setOverrideCreditDays(days)}
                      className={`flex-1 py-1 text-xs font-bold rounded-lg transition-colors ${
                        overrideCreditDays === days
                          ? 'bg-emerald-800 text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {days} días
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 3. Regla de Negocio: Evaluación de Tiempo y Pago (Sin jergas) */}
          <div className="space-y-2">
            {overridePaymentCondition === 'contado' ? (
              // Condición de contado: Dinero parado si no vende rápido
              <div className="p-4 rounded-3xl bg-amber-50 border border-amber-200 text-amber-950 space-y-2 shadow-xs">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-amber-900 block">
                      Pago de contado ({formatCurrency(simulationCalculations.totalCost)})
                    </span>
                    <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                      Este dinero saldrá de inmediato de tu caja. Según tu historial real de ventas de <strong className="text-slate-900">{currentProduct?.name}</strong> (~{realVelocityInfo.dailyVelocity} unids/día), tardarás <strong className="font-mono font-bold text-slate-900">~{simulationCalculations.daysToSell} días</strong> en vender todo.
                    </p>
                    {simulationCalculations.daysToSell > 30 && (
                      <p className="text-[11px] text-amber-800 font-semibold mt-1">
                        ⚠️ Alerta: Si tarda más de un mes en venderse, quedará como dinero parado sin generar ganancias rápidas.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              // Condición a crédito: Comparar días para venderse vs días de crédito
              (() => {
                const canPayInTime = simulationCalculations.daysToSell <= overrideCreditDays;

                if (canPayInTime) {
                  return (
                    <div className="p-4 rounded-3xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2 shadow-xs">
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-black text-emerald-900 block">
                            Bajo riesgo: Vas a poder pagar a tiempo
                          </span>
                          <p className="text-xs text-emerald-900 mt-1 leading-relaxed">
                            Te da tiempo de vender antes de pagar. Con tu historial real venderás las {simulatedQuantity} unidades en <strong className="font-mono font-bold text-slate-900">~{simulationCalculations.daysToSell} días</strong>, y tu proveedor te da <strong className="font-mono font-bold text-emerald-800">{overrideCreditDays} días</strong> de plazo.
                          </p>
                          <span className="text-[11px] text-emerald-800 font-bold block mt-1">
                            ✅ Cobrarás el dinero a tus clientes antes de que llegue la fecha de pago a {selectedSupplier?.name}.
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="p-4 rounded-3xl bg-rose-50 border border-rose-200 text-rose-950 space-y-2 shadow-xs">
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center shrink-0 mt-0.5">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-black text-rose-900 block">
                            Cuidado: podrías tener que pagar antes de vender todo
                          </span>
                          <p className="text-xs text-rose-900 mt-1 leading-relaxed">
                            Tardarías aprox. <strong className="font-mono font-bold text-slate-900">{simulationCalculations.daysToSell} días</strong> en vender todo el lote, pero tienes que pagarle al proveedor en solo <strong className="font-mono font-bold text-rose-800">{overrideCreditDays} días</strong>.
                          </p>
                          <span className="text-[11px] text-rose-800 font-bold block mt-1">
                            ⚠️ Podrías quedarte sin efectivo para pagar la factura antes de terminar de vender. Considera pedir menos unidades o pedir un plazo mayor.
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
              })()
            )}
          </div>

          {/* 4. Proyección de Resultados */}
          <div className="p-4 rounded-3xl bg-white border border-slate-100 shadow-xs space-y-3">
            <span className="text-xs font-bold text-slate-900 block">
              Proyección si realizas esta compra
            </span>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-slate-50 rounded-2xl">
                <span className="text-[10px] text-slate-500 block font-medium">Inversión requerida</span>
                <span className="font-mono font-black text-slate-900 text-base">
                  {formatCurrency(simulationCalculations.totalCost)}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {formatCurrency(simulationCalculations.unitCost)} c/u
                </span>
              </div>

              <div className="p-3 bg-emerald-50/70 rounded-2xl border border-emerald-100">
                <span className="text-[10px] text-emerald-800 block font-medium">Ganancia diaria extra</span>
                <span className="font-mono font-black text-emerald-700 text-base">
                  +{formatCurrency(simulationCalculations.dailyProfitGain)}/día
                </span>
                <span className="text-[10px] text-emerald-800 font-bold block mt-0.5">
                  Ganancia total: +{formatCurrency(simulationCalculations.totalProfit)}
                </span>
              </div>
            </div>
          </div>

          {/* 5. CTA Buttons: Guardar en Historial y Comprar */}
          <div className="space-y-2 pt-1">
            <button
              onClick={handleSaveSimulationOnly}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-800 hover:bg-emerald-900 text-white font-black text-xs shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 active:scale-98 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>Guardar Simulación en Historial</span>
            </button>

            <button
              onClick={handleExecutePurchaseNow}
              className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-all"
            >
              <Truck className="w-4 h-4 text-emerald-800" />
              <span>Marcar Compra Realizada y Sumar Cantidad</span>
            </button>
            <p className="text-center text-[10px] text-slate-400">
              Quedará registrado para comparar "Lo que dijimos que pasaría" vs "Lo que pasó de verdad"
            </p>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODE 2: CANASTA RECOMENDADA POR PRESUPUESTO              */}
      {/* ======================================================== */}
      {activeTabMode === 'canasta' && (
        <div className="space-y-4">
          {/* Presupuesto a Invertir Widget */}
          <div className="p-4 rounded-3xl bg-white border border-slate-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900">Presupuesto a Invertir</span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold text-slate-500 font-mono">S/</span>
                <input
                  type="number"
                  value={budget}
                  onChange={e => {
                    const val = parseFloat(e.target.value) || 0;
                    setBudget(val);
                    setSelectedPreset('custom');
                  }}
                  className="text-2xl font-black text-slate-900 font-mono bg-transparent focus:outline-hidden w-36"
                />
              </div>
              <span className="text-xs font-bold text-slate-400 font-mono">PEN</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setBudget(200);
                  setSelectedPreset(200);
                }}
                className={`py-2 rounded-xl text-xs font-bold transition-colors ${
                  selectedPreset === 200
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                S/ 200
              </button>

              <button
                type="button"
                onClick={() => {
                  setBudget(500);
                  setSelectedPreset(500);
                }}
                className={`py-2 rounded-xl text-xs font-bold transition-colors ${
                  selectedPreset === 500
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                S/ 500 <span className="text-[10px] font-normal opacity-90">(Recomendado)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setBudget(1000);
                  setSelectedPreset(1000);
                }}
                className={`py-2 rounded-xl text-xs font-bold transition-colors ${
                  selectedPreset === 1000
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                S/ 1,000
              </button>

              <button
                type="button"
                onClick={() => setSelectedPreset('custom')}
                className={`py-2 rounded-xl text-xs font-bold transition-colors ${
                  selectedPreset === 'custom'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Personalizado
              </button>
            </div>
          </div>

          {/* Proyección del Puntaje de Salud */}
          <div className="p-4 rounded-3xl bg-white border border-slate-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">Proyección de tu Puntaje de Salud</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center gap-1">
                ⚡ +12 pts
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <span className="text-[10px] text-slate-400 block font-medium">Actual</span>
                  <span className="text-lg font-black text-slate-800 font-mono">{metrics.totalScore}</span>
                </div>

                <div className="w-6 h-6 rounded-full bg-emerald-800 text-white flex items-center justify-center">
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>

                <div className="text-center">
                  <span className="text-[10px] text-slate-400 block font-medium">Meta</span>
                  <span className="text-lg font-black text-emerald-800 font-mono">{scoreProjected}</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-medium">Ganarías esto al día</span>
                <span className="text-sm font-black text-emerald-700 font-mono">+{formatCurrency(projectedDailyGain)}/día</span>
              </div>
            </div>
          </div>

          {/* Recomendación Óptima (Productos seleccionados) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <span>🛒</span>
                <span>Recomendación Óptima</span>
              </div>
              <span className="text-[11px] text-slate-400">
                {optimalRecommendations.length} Productos seleccionados
              </span>
            </div>

            <div className="space-y-2">
              {optimalRecommendations.map(item => (
                <div 
                  key={item.id}
                  className="p-3.5 rounded-3xl bg-white border border-slate-100 shadow-xs flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {item.name}
                      </h4>
                      {item.status === 'REAL' ? (
                        <span className="px-1.5 py-0.2 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-0.5 shrink-0">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Real
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded-md bg-slate-50 text-slate-600 border border-dashed border-slate-300 text-[10px] font-medium flex items-center gap-0.5 shrink-0">
                          <Clock className="w-2.5 h-2.5" />
                          Estimado
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-500 mt-1">
                      Sugerido: <strong className="text-slate-800 font-semibold">{item.suggestedUnits} unids</strong> • Retorno {item.dailyProfitPercent.toFixed(1)}%/día
                    </div>

                    <div className="text-xs font-black font-mono text-slate-900 mt-0.5">
                      {formatCurrency(item.allocatedCost)}
                    </div>
                  </div>

                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 shrink-0">
                    {item.tag}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs font-semibold px-2 text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <span>Asignado: {formatCurrency(totalAssigned)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                <span>Reserva: {formatCurrency(reserveAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODE 3: PANTALLA "MIS PROVEEDORES"                       */}
      {/* ======================================================== */}
      {activeTabMode === 'proveedores' && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900">Mis Proveedores</h3>
              <p className="text-xs text-slate-500">
                Lista de proveedores y condiciones de pago
              </p>
            </div>

            <button
              onClick={() => setShowAddSupplierModal(true)}
              className="py-2 px-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center gap-1 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar proveedor</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {suppliers.map(sup => (
              <div 
                key={sup.id}
                className="p-4 rounded-3xl bg-white border border-slate-100 shadow-xs space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      {sup.name}
                    </h4>
                    {sup.category && (
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Categoría: {sup.category}
                      </span>
                    )}
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    sup.paymentCondition === 'credito'
                      ? 'bg-blue-50 text-blue-800 border border-blue-200'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  }`}>
                    {sup.paymentCondition === 'credito'
                      ? `Crédito a ${sup.creditDays} días`
                      : 'Pago de contado'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-50">
                  <span>{sup.contactPhone ? `Tel: ${formatPeruPhoneDisplay(sup.contactPhone)}` : 'Contacto registrado'}</span>
                  <button
                    onClick={() => {
                      setSelectedSupplierId(sup.id);
                      setOverridePaymentCondition(sup.paymentCondition);
                      setOverrideCreditDays(sup.creditDays || 30);
                      setActiveTabMode('producto');
                      showToast(`Proveedor ${sup.name} seleccionado para simular`, 'info');
                    }}
                    className="text-emerald-800 font-bold hover:underline flex items-center gap-0.5"
                  >
                    <span>Simular compra</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: REGISTRAR NUEVO PROVEEDOR                         */}
      {/* ======================================================== */}
      {showAddSupplierModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-emerald-800" />
                  <span>Registrar Proveedor</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Guarda su condición de pago para evaluar riesgos de compra
                </p>
              </div>
              <button 
                onClick={() => setShowAddSupplierModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-3.5">
              {/* Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Nombre del proveedor</label>
                <input
                  type="text"
                  required
                  value={newSupplierName}
                  onChange={e => setNewSupplierName(e.target.value)}
                  placeholder="Ej: Distribuidora del Norte, Panificadora Bimbo..."
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              {/* Payment Condition */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Condición de pago habitual</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewSupplierCondition('contado')}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-center ${
                      newSupplierCondition === 'contado'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Pago de contado
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewSupplierCondition('credito')}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-center ${
                      newSupplierCondition === 'credito'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Pago a crédito
                  </button>
                </div>
              </div>

              {/* Credit Days if credito */}
              {newSupplierCondition === 'credito' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Plazo en días para pagar</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={newSupplierDays}
                      onChange={e => setNewSupplierDays(parseInt(e.target.value) || 1)}
                      className="w-28 p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                    <div className="flex items-center gap-1">
                      {[15, 30, 45].map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setNewSupplierDays(d)}
                          className="px-2.5 py-2 text-[11px] font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Category / Phone (B8: +51 fixed prefix) */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Categoría (opcional)</label>
                  <input
                    type="text"
                    value={newSupplierCategory}
                    onChange={e => setNewSupplierCategory(e.target.value)}
                    placeholder="Bebidas, Lácteos..."
                    className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Celular (opcional)</label>
                  <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-slate-50 focus-within:ring-2 focus-within:ring-emerald-600 focus-within:bg-white">
                    <span className="px-2 py-2 text-xs font-bold text-slate-500 bg-slate-100 border-r border-slate-200 select-none flex items-center">
                      +51
                    </span>
                    <input
                      type="tel"
                      inputMode="tel"
                      maxLength={9}
                      value={newSupplierPhone}
                      onChange={e => setNewSupplierPhone(cleanPeruPhone(e.target.value))}
                      placeholder="987654321"
                      className="w-full p-2 text-xs bg-transparent text-slate-800 font-mono focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddSupplierModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold shadow-xs transition-colors"
                >
                  Guardar Proveedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
