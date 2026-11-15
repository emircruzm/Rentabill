import React from 'react';
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Pencil 
} from 'lucide-react';
import { Product, CalculatedProductMetrics } from '@shared/types/index';
import { formatCurrency } from '@shared/formatters/index';

export interface ProductCardProps {
  product: CalculatedProductMetrics;
  onEdit: (product: Product) => void;
  onAddToCart: (product: Product) => void;
}

export const ProductCard = React.memo<ProductCardProps>(({
  product,
  onEdit,
  onAddToCart,
}) => {
  const isNearCalibration = product.status === 'ESTIMADO' && product.salesCount >= 4;

  return (
    <div 
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
            {product.unitsSoldLast28d != null
              ? `Basado en ${product.unitsSoldLast28d} u vendidas en los últimos ${Math.min(28, Math.max(product.createdDaysAgo, 1))} días`
              : `Basado en ${product.salesCount} ventas (${product.unitsSold} u) / ${Math.max(product.createdDaysAgo, 1)} días`}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onEdit(product)}
              className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center gap-1 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              <span>Editar</span>
            </button>
            <button
              onClick={() => onAddToCart(product)}
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
                onClick={() => onEdit(product)}
                className="font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 text-[11px]"
              >
                <Pencil className="w-3 h-3" />
                <span>Editar</span>
              </button>
              <button
                onClick={() => onAddToCart(product)}
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
});

ProductCard.displayName = 'ProductCard';
