import React, { useState, useMemo } from 'react';
import { 
  Search, 
  QrCode, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ArrowUpDown, 
  TrendingUp, 
  TrendingDown, 
  Percent, 
  Flame, 
  Boxes, 
  ChevronDown, 
  PackageCheck,
  Pencil
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { Product } from '../types';
import { EditProductModal } from '../components/EditProductModal';
import { formatCurrency } from '../utils/formatters';

interface SortOptionConfig {
  id: string;
  label: string;
  badge?: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  bgColor: string;
}

const SORT_OPTIONS: SortOptionConfig[] = [
  {
    id: 'rentabilidad_desc',
    label: 'Mayor Ganancia Diaria',
    badge: 'Recomendado',
    description: 'Los productos que más dinero rinden al día',
    icon: TrendingUp,
    iconColor: 'text-emerald-700',
    bgColor: 'bg-emerald-100/80',
  },
  {
    id: 'rentabilidad_asc',
    label: 'Menor Ganancia Diaria',
    badge: 'Alerta',
    description: 'Mercancía lenta o con menor retorno diario',
    icon: TrendingDown,
    iconColor: 'text-rose-600',
    bgColor: 'bg-rose-100/80',
  },
  {
    id: 'margen_desc',
    label: 'Mayor Ganancia por Venta',
    description: 'Mayor ganancia en dinero por cada unidad vendida',
    icon: Percent,
    iconColor: 'text-blue-700',
    bgColor: 'bg-blue-100/80',
  },
  {
    id: 'sales_desc',
    label: 'Más Vendidos',
    description: 'Productos con mayor rotación de salida',
    icon: Flame,
    iconColor: 'text-amber-600',
    bgColor: 'bg-amber-100/80',
  },
  {
    id: 'stock_desc',
    label: 'Más Cantidad Disponible',
    description: 'Artículos con mayor número de piezas disponibles',
    icon: Boxes,
    iconColor: 'text-purple-700',
    bgColor: 'bg-purple-100/80',
  },
];

export const InventarioView: React.FC = () => {
  const { 
    calculatedProducts, 
    metrics, 
    setActiveTab, 
    addToCart, 
    showToast,
    searchQuery,
    setSearchQuery,
    selectedFilter,
    setSelectedFilter,
    currentSort,
    setCurrentSort,
    loading,
    error,
    refreshData
  } = useInventory();

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Current active sort option
  const activeSortOption = useMemo(() => {
    return SORT_OPTIONS.find(opt => opt.id === currentSort) || SORT_OPTIONS[0];
  }, [currentSort]);

  // Filter & Search Logic
  const filteredProducts = useMemo(() => {
    return calculatedProducts
      .filter(p => {
        // Filter tabs
        if (selectedFilter === 'real' && p.status !== 'REAL') return false;
        if (selectedFilter === 'estimated' && p.status !== 'ESTIMADO') return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = p.name.toLowerCase().includes(q);
          const matchBarcode = p.barcode.includes(q);
          const matchSku = p.sku?.toLowerCase().includes(q) || false;
          const catName = p.categoryName || p.category || '';
          const matchCategory = catName.toLowerCase().includes(q);
          if (!matchName && !matchBarcode && !matchSku && !matchCategory) return false;
        }

        return true;
      })
      .sort((a, b) => {
        switch (currentSort) {
          case 'rentabilidad_desc':
            return b.dailyProfitPercent - a.dailyProfitPercent;
          case 'rentabilidad_asc':
            return a.dailyProfitPercent - b.dailyProfitPercent;
          case 'stock_desc':
            return b.stock - a.stock;
          case 'margen_desc':
            return b.unitMarginPercent - a.unitMarginPercent;
          case 'sales_desc':
            return b.unitsSold - a.unitsSold;
          default:
            return b.dailyProfitPercent - a.dailyProfitPercent;
        }
      });
  }, [calculatedProducts, selectedFilter, searchQuery, currentSort]);

  return (
    <div className="space-y-4 pb-36 max-w-md mx-auto px-4 pt-2">
      {/* Banner / Header: Confiabilidad de tus Datos */}
      <div className="p-4 rounded-3xl bg-white border border-slate-100 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              CONFIABILIDAD DE TUS DATOS
            </span>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              {metrics.totalProductsCount} productos activos
            </h2>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Stacked Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full h-3 rounded-full bg-slate-100 flex overflow-hidden">
            <div 
              className="bg-emerald-700 h-full transition-all duration-500"
              style={{ width: `${Math.max(5, metrics.realCapitalPercent)}%` }}
              title={`Reales: ${metrics.realCapitalPercent}%`}
            />
            <div 
              className="bg-slate-300 h-full transition-all duration-500"
              style={{ width: `${Math.max(5, metrics.estimatedCapitalPercent)}%` }}
              title={`Aún estimando: ${metrics.estimatedCapitalPercent}%`}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-semibold">
            <div className="flex items-center gap-1.5 text-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-700" />
              <span>{metrics.realProductsCount} Reales ({metrics.realCapitalPercent.toFixed(0)}%)</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>{metrics.estimatedProductsCount} Aún estimando ({metrics.estimatedCapitalPercent.toFixed(0)}%)</span>
            </div>
          </div>
        </div>

        {/* Capital comparison sub-cards */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
          <div className="p-2.5 rounded-xl bg-slate-50">
            <span className="text-[10px] text-slate-500 block font-medium">Dinero confirmado</span>
            <span className="text-sm font-black text-slate-900 font-mono">
              ${metrics.totalRealCapital.toFixed(2)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50">
            <span className="text-[10px] text-slate-500 block font-medium">En proceso</span>
            <span className="text-sm font-black text-slate-700 font-mono">
              ${metrics.totalEstimatedCapital.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setSelectedFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${
            selectedFilter === 'all'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Todos ({metrics.totalProductsCount})
        </button>

        <button
          onClick={() => setSelectedFilter('real')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            selectedFilter === 'real'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50/50'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Solo Reales ({metrics.realProductsCount})
        </button>

        <button
          onClick={() => setSelectedFilter('estimated')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            selectedFilter === 'estimated'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          Aún estimando ({metrics.estimatedProductsCount})
        </button>
      </div>

      {/* Search and Sort controls */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por Producto, nombre o código..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-10 py-2.5 rounded-2xl bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-emerald-500 shadow-2xs"
          />
          <button 
            onClick={() => {
              // Quick simulate barcode scan search
              const randomProd = calculatedProducts[Math.floor(Math.random() * calculatedProducts.length)];
              setSearchQuery(randomProd.barcode);
              showToast(`Código ${randomProd.barcode} escaneado`, 'info');
            }}
            title="Escanear Barcode"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-slate-100"
          >
            <QrCode className="w-4 h-4" />
          </button>
        </div>

        {/* Sorting header & Quick selector */}
        <div className="flex items-center justify-between text-xs px-1 pt-0.5">
          <span className="text-slate-500 font-medium flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <span>Ordenar por:</span>
          </span>

          {/* Clean Robust Dropdown - Uses native picker to avoid any visual overlapping or clipping */}
          <div className="relative inline-flex items-center group">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white group-hover:bg-slate-50 text-slate-800 transition-all duration-200 text-xs font-bold shadow-2xs">
              <div className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 ${activeSortOption.bgColor}`}>
                {React.createElement(activeSortOption.icon, { className: `w-3 h-3 ${activeSortOption.iconColor}` })}
              </div>
              <span className="truncate max-w-[150px]">{activeSortOption.label}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
            </div>

            <select
              value={currentSort}
              onChange={e => {
                setCurrentSort(e.target.value);
                const opt = SORT_OPTIONS.find(o => o.id === e.target.value);
                if (opt) showToast(`Ordenado por: ${opt.label}`, 'info');
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              aria-label="Criterio de orden"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} — {opt.description}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick 1-tap Sort Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-0.5">
          {SORT_OPTIONS.map(opt => {
            const isSelected = currentSort === opt.id;
            const OptIcon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setCurrentSort(opt.id);
                  showToast(`Ordenado por: ${opt.label}`, 'info');
                }}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold shrink-0 flex items-center gap-1.5 transition-all active:scale-95 ${
                  isSelected
                    ? 'bg-emerald-800 text-white shadow-2xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <OptIcon className={`w-3 h-3 ${isSelected ? 'text-emerald-200' : opt.iconColor}`} />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={refreshData}
            className="px-2.5 py-1 rounded-xl bg-rose-100 hover:bg-rose-200 font-bold"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Products List Grid */}
      <div className="space-y-3">
        {loading && filteredProducts.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-3xl border border-slate-100 space-y-2">
            <div className="w-8 h-8 rounded-full border-3 border-emerald-800 border-t-transparent animate-spin mx-auto" />
            <p className="text-xs font-bold text-slate-700">Cargando inventario desde Supabase...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 space-y-3">
            <PackageCheck className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">No hay productos registrados</p>
            <p className="text-xs text-slate-400">Comienza a registrar tus productos escaneando su código de barras.</p>
            <button
              onClick={() => setActiveTab('nuevo-producto')}
              className="px-4 py-2 rounded-xl bg-emerald-800 text-white font-bold text-xs shadow-xs"
            >
              + Agregar Primer Producto
            </button>
          </div>
        ) : (
          filteredProducts.map(product => {
            const isNearCalibration = product.status === 'ESTIMADO' && product.salesCount >= 4;

            return (
              <div 
                key={product.id}
                className={`p-4 rounded-3xl bg-white border shadow-xs transition-all space-y-3 ${
                  product.status === 'REAL'
                    ? 'border-slate-100 hover:border-emerald-200'
                    : 'border-slate-200/90'
                }`}
              >
                {/* Top card row: Name, SKU, Image thumbnail, Status badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt=""
                        className="w-11 h-11 rounded-2xl object-cover border border-slate-200 shrink-0 shadow-2xs"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0 text-base">
                        🥫
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-900 leading-snug truncate">
                        {product.name}
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        Código: <span className="font-mono text-slate-600">{product.barcode || product.sku}</span> • {product.categoryName || product.category || 'General'}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge (B5: duplicate pencil removed, bottom Edit button is preserved) */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {product.status === 'REAL' ? (
                      <span className="px-2 py-0.5 rounded-full border border-emerald-500 bg-emerald-50 text-emerald-700 text-[11px] font-bold flex items-center gap-1 shrink-0 shadow-2xs">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Real
                      </span>
                    ) : !product.hasManualClassification && product.salesCount === 0 ? (
                      <span className="px-2 py-0.5 rounded-full border border-dashed border-slate-300 bg-slate-50 text-slate-500 text-[10px] font-medium flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3 text-slate-400" />
                        estimado, sin datos aún
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full border border-dashed border-slate-400 bg-slate-50 text-slate-600 text-[11px] font-medium flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3 text-amber-500" />
                        Estimado
                      </span>
                    )}
                  </div>
                </div>

                {/* 3-Column Metrics Grid */}
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                  {/* Cantidad disponible */}
                  <div className="border-r border-slate-200/60 pr-1">
                    <span className="text-[10px] text-slate-400 block font-medium">Cantidad</span>
                    <span className="text-xs font-bold text-slate-900 block">
                      {product.unit === 'kg'
                        ? `${Number(product.stock).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} kg`
                        : `${product.stock} ${product.unit || 'pza'}`}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{formatCurrency(product.investedCapital)} inv.</span>
                  </div>

                  {/* Margen */}
                  <div className="border-r border-slate-200/60 px-1">
                    <span className="text-[10px] text-slate-400 block font-medium">Ganancia</span>
                    <span className="text-xs font-bold text-slate-900 block">{product.unitMarginPercent.toFixed(0)}%</span>
                    <span className={`text-[10px] font-semibold ${
                      product.unitMarginPercent >= 30 ? 'text-emerald-600' : 'text-slate-500'
                    }`}>
                      {product.unitMarginPercent >= 35 ? 'Saludable' : product.unitMarginPercent >= 20 ? 'Promedio' : 'Bajo'}
                    </span>
                  </div>

                  {/* Rentab./día */}
                  <div className="pl-1">
                    <span className="text-[10px] text-slate-400 block font-medium">Ganancia/día</span>
                    <span className={`text-xs font-bold font-mono block ${
                      !product.hasManualClassification && product.salesCount === 0
                        ? 'text-slate-600'
                        : product.dailyProfitPercent >= 1.0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}>
                      {product.status === 'REAL' ? '+' : '~'}{product.dailyProfitPercent.toFixed(2)}%
                    </span>
                    <span className={`text-[10px] font-semibold ${
                      !product.hasManualClassification && product.salesCount === 0
                        ? 'text-slate-500'
                        : product.dailyProfitPercent >= 2.5 ? 'text-emerald-600' : product.dailyProfitPercent >= 1.0 ? 'text-slate-600' : 'text-rose-600'
                    }`}>
                      {!product.hasManualClassification && product.salesCount === 0
                        ? 'Sin datos aún'
                        : product.dailyProfitPercent >= 2.5 ? 'Alto' : product.dailyProfitPercent >= 1.0 ? 'Promedio' : 'Crítico'}
                    </span>
                  </div>
                </div>

                {/* Sub-status & Calibration progress */}
                {product.status === 'REAL' ? (
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                    <span className="flex items-center gap-1 text-emerald-700 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Basado en {product.salesCount} ventas ({product.unitsSold} u) / {Math.max(product.createdDaysAgo, 1)} días
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingProduct(product)}
                        className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center gap-1 transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Editar</span>
                      </button>
                      <button
                        onClick={() => addToCart(product)}
                        className="px-2 py-0.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] transition-colors"
                      >
                        + Cobrar en Caja
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 pt-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600 font-medium flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        {product.salesCount} de 5 ventas registradas ({product.progressToReal}%)
                      </span>
                      <span className="font-bold text-amber-700 text-[11px]">
                        {product.salesUntilReal === 1 ? '¡Falta 1 venta!' : `Faltan ${product.salesUntilReal} ventas`}
                      </span>
                    </div>

                    {/* Progress bar towards real */}
                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          isNearCalibration ? 'bg-amber-500 animate-pulse' : 'bg-amber-400'
                        }`}
                        style={{ width: `${product.progressToReal}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Velocidad: <strong className="text-slate-600 font-medium">{product.velocityLabel}</strong></span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingProduct(product)}
                          className="font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 text-[11px]"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Editar</span>
                        </button>
                        <button
                          onClick={() => addToCart(product)}
                          className="font-bold text-emerald-700 hover:text-emerald-800"
                        >
                          + Vender ahora
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warning if slow rotation confirmed */}
                {product.isSlow && product.createdDaysAgo >= 30 && (
                  <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Se vende muy lento (lleva {product.createdDaysAgo} días en la tienda)</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Floating Action Button "+ Nuevo Producto" */}
      <div className="fixed bottom-24 right-4 sm:right-[max(1rem,calc(50%-13rem))] z-30 pointer-events-auto">
        <button
          onClick={() => setActiveTab('nuevo-producto')}
          className="flex items-center gap-2 px-4 py-3 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-xl shadow-emerald-900/30 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Nuevo Producto</span>
        </button>
      </div>

      {/* Modal para Editar Producto */}
      <EditProductModal
        product={editingProduct}
        isOpen={!!editingProduct}
        onClose={() => setEditingProduct(null)}
      />
    </div>
  );
};
