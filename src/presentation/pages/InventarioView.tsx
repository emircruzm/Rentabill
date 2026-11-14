import React, { useState, useMemo, useCallback, useDeferredValue } from 'react';
import { 
  Search, 
  QrCode, 
  Plus, 
  Upload, 
  CheckCircle2, 
  Clock, 
  ArrowUpDown, 
  TrendingUp, 
  TrendingDown, 
  Percent, 
  Flame, 
  Boxes, 
  PackageCheck
} from 'lucide-react';
import { useInventory } from '@application/index';
import { Product } from '@shared/types/index';
import { EditProductModal } from '@presentation/components/EditProductModal';
import { BulkProductModal } from '@presentation/components/BulkProductModal';
import { ProductCard } from '@presentation/components/ProductCard';
import { formatCurrency } from '@shared/formatters/index';

const INITIAL_VISIBLE = 30;
const STEP = 30;

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
    refreshData,
    user
  } = useInventory();

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const canCreateProducts = user.role === 'ADMIN' || user.role === 'REPOSITOR';

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const currentFilterKey = `${deferredSearchQuery}|${selectedFilter}|${currentSort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(currentFilterKey);

  // Reiniciar ventana de renderizado a 30 DURANTE el render si cambian filtros, búsqueda u orden
  if (currentFilterKey !== prevFilterKey) {
    setPrevFilterKey(currentFilterKey);
    setVisibleCount(INITIAL_VISIBLE);
  }

  const handleEdit = useCallback((product: Product) => {
    setEditingProduct(product);
  }, []);

  const handleAddToCart = useCallback((product: Product) => {
    addToCart(product);
  }, [addToCart]);

  const handleShowMore = useCallback(() => {
    setVisibleCount(prev => prev + STEP);
  }, []);

  // Filter & Search Logic
  const filteredProducts = useMemo(() => {
    return calculatedProducts
      .filter(p => {
        // Filter tabs
        if (selectedFilter === 'real' && p.status !== 'REAL') return false;
        if (selectedFilter === 'estimated' && p.status !== 'ESTIMADO') return false;

        // Search query
        if (deferredSearchQuery.trim()) {
          const q = deferredSearchQuery.toLowerCase();
          const matchName = p.name.toLowerCase().includes(q);
          const matchBarcode = p.barcode ? p.barcode.toLowerCase().includes(q) : false;
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
  }, [calculatedProducts, selectedFilter, deferredSearchQuery, currentSort]);

  const visibleProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

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
              {formatCurrency(metrics.totalRealCapital)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50">
            <span className="text-[10px] text-slate-500 block font-medium">En proceso</span>
            <span className="text-sm font-black text-slate-700 font-mono">
              {formatCurrency(metrics.totalEstimatedCapital)}
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
              const prodWithCode = calculatedProducts.find(p => !!p.barcode) || calculatedProducts[0];
              if (prodWithCode) {
                const code = prodWithCode.barcode || prodWithCode.name;
                setSearchQuery(code);
                showToast(`Código ${code} escaneado`, 'info');
              }
            }}
            title="Escanear Barcode"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-slate-100"
          >
            <QrCode className="w-4 h-4" />
          </button>
        </div>

        {/* Sorting header & Quick selector */}
        {/* Sorting header */}
        <div className="flex items-center text-xs px-1 pt-0.5">
          <span className="text-slate-500 font-medium flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <span>Ordenar por:</span>
          </span>
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
          <>
            {visibleProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onEdit={handleEdit}
                onAddToCart={handleAddToCart}
              />
            ))}

            {/* Pie de lista bajo demanda */}
            {filteredProducts.length > visibleCount && (
              <div className="pt-2 pb-2 text-center space-y-2">
                <p className="text-xs text-slate-500 font-medium">
                  Mostrando {visibleProducts.length} de {filteredProducts.length} productos
                </p>
                <button
                  type="button"
                  onClick={handleShowMore}
                  className="w-full py-3 px-4 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-2xs active:scale-[0.99] transition-all cursor-pointer"
                >
                  Mostrar más (+{STEP})
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating Action Buttons */}
      {canCreateProducts && (
        <div className="fixed bottom-24 right-4 sm:right-[max(1rem,calc(50%-13rem))] z-30 pointer-events-auto flex items-center gap-2">
          <button
            id="btn-carga-rapida"
            onClick={() => setIsBulkModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-3 rounded-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-xl shadow-slate-900/30 active:scale-95 transition-all focus:outline-hidden focus:ring-2 focus:ring-slate-400"
            title="Carga rápida de productos desde Excel o CSV"
          >
            <Upload className="w-4 h-4 stroke-[2.5]" />
            <span>Carga Rápida</span>
          </button>
          <button
            onClick={() => setActiveTab('nuevo-producto')}
            className="flex items-center gap-2 px-4 py-3 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-xl shadow-emerald-900/30 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Nuevo Producto</span>
          </button>
        </div>
      )}

      {/* Modal para Carga Rápida de Productos */}
      <BulkProductModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
      />

      {/* Modal para Editar Producto */}
      <EditProductModal
        product={editingProduct}
        isOpen={!!editingProduct}
        onClose={() => setEditingProduct(null)}
      />
    </div>
  );
};

