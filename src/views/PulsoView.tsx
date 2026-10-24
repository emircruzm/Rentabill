import React from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  HelpCircle, 
  Sparkles, 
  Plus, 
  QrCode, 
  Zap, 
  ShieldCheck, 
  ShoppingBag,
  ArrowUpRight,
  Package
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { formatCurrency } from '../utils/formatters';

export const PulsoView: React.FC = () => {
  const { metrics, products, sales, setActiveTab, showToast } = useInventory();

  // Condición limpia y reutilizable para verificar si la tienda tiene datos
  const hasStoreData = products.length > 0;

  // Calculate SVG arc for gauge
  const radius = 78;
  const strokeWidth = 16;
  const circumference = 2 * Math.PI * radius;
  // Use a 270 degree arc or full circle
  const scoreRatio = hasStoreData ? Math.min(1, Math.max(0, metrics.totalScore / 100)) : 0;
  const strokeDashoffset = circumference - (scoreRatio * circumference);

  const getStatusBadge = () => {
    if (!hasStoreData) {
      return { label: 'Sin datos aún', bg: 'bg-slate-100 text-slate-600 border-slate-200' };
    }
    switch (metrics.scoreStatus) {
      case 'OPTIMAL':
        return { label: 'Óptimo', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'STABLE':
        return { label: 'Estable', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'CRITICAL':
        return { label: 'Crítico', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div className="space-y-4 pb-24 max-w-md mx-auto px-4 pt-2">
      {/* Diagnóstico de Caja / Puntaje de Salud Card */}
      <div className={`p-5 rounded-3xl bg-white shadow-xs border transition-all ${
        metrics.isCalibratedMode 
          ? 'border-emerald-200 shadow-emerald-900/5' 
          : 'border-dashed border-slate-300'
      }`}>
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
              Diagnóstico de Caja
            </span>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              PUNTAJE DE SALUD
            </h2>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${statusBadge.bg}`}>
            <ShieldCheck className="w-3.5 h-3.5" />
            {statusBadge.label}
          </span>
        </div>

        {/* Gauge Widget (Diseño mejorado con mayor espacio interno y jerarquía clara) */}
        <div className="flex flex-col items-center justify-center my-6 py-1 relative">
          <div className="relative w-56 h-56 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 200 200">
              {/* Background circle */}
              <circle
                cx="100"
                cy="100"
                r={radius}
                stroke="#F1F5F9"
                strokeWidth={strokeWidth}
                fill="transparent"
              />
              {/* Progress arc (anillo más grueso con color según nivel) */}
              <circle
                cx="100"
                cy="100"
                r={radius}
                stroke={hasStoreData ? metrics.scoreColor : '#CBD5E1'}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                strokeDashoffset-animation="true"
                className={`transition-all duration-700 ease-out ${
                  !metrics.isCalibratedMode ? 'stroke-dasharray-4' : ''
                }`}
                style={!metrics.isCalibratedMode && hasStoreData ? { strokeDasharray: '8 5' } : undefined}
              />
            </svg>

            {/* Score Center Label con jerarquía clara y espaciado */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
              {!hasStoreData ? (
                <div className="flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-slate-400 font-mono tracking-tight leading-none">—</span>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-2">Sin datos aún</span>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline justify-center">
                    <span className="text-5xl font-black tracking-tight text-slate-900 leading-none">
                      {metrics.totalScore}
                    </span>
                    <span className="text-base font-bold text-slate-400 ml-1">/100</span>
                  </div>

                  {/* Etiqueta de estado destacada debajo del puntaje */}
                  <div className="mt-2.5">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border shadow-2xs ${statusBadge.bg}`}>
                      <ShieldCheck className="w-3 h-3" />
                      {statusBadge.label}
                    </span>
                  </div>

                  <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mt-1.5">
                    {metrics.isCalibratedMode ? 'Salud Real' : 'Salud Proyectada'}
                  </span>

                  {sales.length > 0 ? (
                    <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-[11px] font-bold text-emerald-700">
                      <ArrowUpRight className="w-3 h-3" />
                      <span>{sales.length} {sales.length === 1 ? 'venta' : 'ventas'}</span>
                    </div>
                  ) : (
                    <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">
                      <span>Sin ventas aún</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Seed vs Calibrated Data Indicator con separación visual */}
          <div className="mt-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-100 text-xs text-slate-600">
            <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            <span className="font-semibold text-slate-800">{metrics.realCapitalPercent}% datos reales</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500">{metrics.estimatedCapitalPercent}% estimados</span>
            <button 
              onClick={() => showToast(
                metrics.isCalibratedMode 
                  ? "Modo Calibrado activo: más del 50% de tu dinero invertido opera con ventas confirmadas en mostrador."
                  : "Modo Semilla activo: realiza ventas en caja para confirmar automáticamente qué tan rápido se venden tus productos.", 
                "info"
              )}
              title="Información de calibración"
              className="ml-1 text-slate-400 hover:text-slate-600"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Separated Global Financial Metrics Cards: Dinero Invertido vs Dinero Parado (B4) */}
        <div className="space-y-2.5 mt-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Métrica 1: Dinero Invertido (B4: h-24, p-3.5, solo título, badge Total, monto S/, sin texto descriptivo) */}
            <div className="h-24 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Dinero Invertido</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-200/70 text-slate-700">
                  Total
                </span>
              </div>
              <div className="text-lg font-black text-slate-900 tracking-tight font-mono truncate">
                {formatCurrency(metrics.totalInvestedCapital)}
              </div>
            </div>

            {/* Métrica 2: Dinero Parado (B4: h-24, p-3.5, solo título, badge Sin vender, monto S/ y %, sin texto descriptivo) */}
            <div className="h-24 p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200/80 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-900">Dinero Parado</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-200/80 text-rose-800">
                  Sin vender
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 flex-wrap truncate">
                <span className="text-lg font-black text-rose-700 tracking-tight font-mono">
                  {formatCurrency(metrics.totalTrappedCapital)}
                </span>
                <span className="text-xs font-bold text-rose-600/90 font-mono">
                  ({metrics.capitalLockedInSlowPercent.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Métrica Complementaria: Rendimiento Diario */}
          <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                %
              </div>
              <div>
                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                  Ganancia Diaria Promedio
                </span>
                <span className="text-sm font-black text-emerald-900 font-mono">
                  {metrics.averageDailyProfitPercent.toFixed(2)}% <span className="text-[11px] font-normal text-emerald-700">/día</span>
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-500 block">Meta recomendada</span>
              <span className="text-xs font-bold text-slate-700 font-mono">2.00% al día</span>
            </div>
          </div>
        </div>
      </div>

      {/* ¿Cómo va tu negocio? (Factores de Rendimiento) */}
      <div className="p-4 rounded-3xl bg-white shadow-xs border border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">¿Cómo va tu negocio?</h3>
            <span className="text-[11px] text-slate-400">Los 2 factores que evalúa el sistema</span>
          </div>
        </div>

        {sales.length === 0 ? (
          <div className="p-5 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center mx-auto">
              <ShoppingBag className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">
                Todavía no hay suficientes datos
              </h4>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed mt-0.5">
                Vuelve cuando hayas hecho algunas ventas en la caja para que el sistema empiece a medir el ritmo real de tu tienda.
              </p>
            </div>
            <button
              onClick={() => setActiveTab('vender')}
              className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs inline-flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Ir a Cobrar en Caja</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Componente 1: Ganancia por Venta */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span className="font-bold text-slate-800">Qué tanto ganas por venta</span>
                </div>
                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                  Cuenta el 60% del total
                </span>
              </div>

              {/* Barra que refleja SOLO el dato medido real */}
              <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div 
                  className="h-full bg-emerald-600 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(0, metrics.marginHealthPercent))}%` }}
                />
              </div>

              <div className="text-[11px] text-slate-600 font-medium">
                {metrics.totalProductsCount === 0 ? (
                  <span>Aún no tienes productos registrados</span>
                ) : (
                  <span>
                    <strong className="text-slate-900 font-bold">{metrics.productsWithGoodMargin ?? 0}</strong> de tus{' '}
                    <strong className="text-slate-900 font-bold">{metrics.totalProductsCount}</strong> productos te están dejando buena ganancia
                  </span>
                )}
              </div>
            </div>

            {/* Componente 2: Velocidad y Variedad */}
            <div className="space-y-1.5 pt-3 border-t border-slate-50">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="font-bold text-slate-800">Qué tan rápido se vende + variedad</span>
                </div>
                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                  Cuenta el 40% del total
                </span>
              </div>

              {/* Barra que refleja SOLO el dato medido real (capital en movimiento) */}
              <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    metrics.diversificationScore >= 70 ? 'bg-emerald-600' : 'bg-amber-500'
                  }`} 
                  style={{ width: `${Math.min(100, Math.max(0, metrics.diversificationScore))}%` }}
                />
              </div>

              <div className="text-[11px] text-slate-600 font-medium">
                {metrics.totalTrappedCapital <= 0 ? (
                  <span className="text-emerald-700 font-semibold">
                    Nada de tu dinero está atorado en productos que no se venden
                  </span>
                ) : (
                  <span>
                    Tienes <strong className="text-slate-900 font-mono font-bold">{formatCurrency(metrics.totalTrappedCapital)}</strong> de tu dinero en productos que casi no se venden
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Radar de Productos (Solo se muestra cuando hay datos reales en la tienda) */}
      {hasStoreData && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Radar de Productos</h3>
              <p className="text-[11px] text-slate-400">Ordenado por qué tan rápido recuperas tu dinero</p>
            </div>
            <button 
              onClick={() => setActiveTab('inventario')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              Ver todos
            </button>
          </div>

          {/* Top Rendimiento (Estrellas) */}
          <div className="p-4 rounded-3xl bg-white border border-slate-100 shadow-xs space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600">
              <span>⭐</span>
              <span>TOP RENDIMIENTO (ESTRELLAS)</span>
            </div>

            <div className="space-y-2.5">
              {metrics.starProducts.map(product => (
                 <div 
                  key={product.id}
                  className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 hover:bg-slate-100/80 transition-colors"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900 truncate">
                        {product.name}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                        product.status === 'REAL' 
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                          : 'bg-slate-100 text-slate-600 border border-dashed border-slate-300'
                      }`}>
                        {product.status === 'REAL' ? '✓ Real' : 'Estimado'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>{product.velocityLabel}</span>
                      <span>•</span>
                      <span>Cantidad: {product.stock} u.</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-black text-emerald-700 font-mono">
                      +{product.dailyProfitPercent.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-slate-400">diario</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dinero Parado (Necesitas Venderlo) */}
          {metrics.trappedCapitalProducts.length > 0 && (
            <div className="p-4 rounded-3xl bg-rose-50/50 border border-rose-200/70 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>DINERO PARADO (NECESITAS VENDERLO)</span>
                </div>
                <span className="text-xs font-bold text-rose-700 font-mono">
                  {formatCurrency(metrics.totalTrappedCapital)} estancados
                </span>
              </div>

              <div className="space-y-2.5">
                {metrics.trappedCapitalProducts.map(product => (
                  <div 
                    key={product.id}
                    className="p-3 rounded-2xl bg-white border border-rose-100 space-y-2 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">{product.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-slate-100 text-slate-600 border border-dashed border-slate-300">
                            {product.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {formatCurrency(product.investedCapital)} sin vender • {product.createdDaysAgo} días en mostrador
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-sm text-rose-600">
                          {product.dailyProfitPercent.toFixed(1)}%
                        </span>
                        <div className="text-[10px] text-slate-400">diario</div>
                      </div>
                    </div>

                    {/* Promotional recommendation suggestion */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                      <span className="text-amber-800 font-medium flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        Sugerencia: Combo o 15% Descuento
                      </span>
                      <button
                        onClick={() => {
                          showToast(`Descuento promocional aplicado para ${product.name}`, 'success');
                        }}
                        className="px-2 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] transition-colors"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Consejo de Caja Banner (Solo con datos suficientes y dinero parado real) */}
      {hasStoreData && metrics.totalTrappedCapital > 0 && (
        <div className="p-3.5 rounded-2xl bg-emerald-900 text-white flex items-start gap-3 shadow-md">
          <div className="w-8 h-8 rounded-xl bg-emerald-800/80 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-4 h-4 text-emerald-300" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-emerald-300 tracking-wider uppercase">
              Consejo de Caja
            </span>
            <p className="text-xs text-emerald-50 mt-0.5 leading-snug">
              "Si vendes esos {formatCurrency(metrics.totalTrappedCapital)} en productos parados, tendrás{' '}
              <strong className="text-amber-300 font-bold">
                +{formatCurrency(metrics.totalTrappedCapital * 0.12)} más de dinero en mano
              </strong>{' '}
              esta misma semana."
            </p>
          </div>
        </div>
      )}

      {/* Estado vacío corto y amable cuando la tienda no tiene productos */}
      {!hasStoreData && (
        <div className="p-6 rounded-3xl bg-white border border-dashed border-slate-200 text-center space-y-3 shadow-2xs">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center mx-auto">
            <Package className="w-6 h-6 text-emerald-700" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-black text-slate-900">
              Registra tu primer producto para ver tu Pulso
            </h4>
            <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
              El diagnóstico de salud, radar de productos y consejos financieros se activarán automáticamente cuando agregues mercancía a tu tienda.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('nuevo-producto')}
            className="px-4 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-xs inline-flex items-center gap-1.5 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Registrar Primer Producto</span>
          </button>
        </div>
      )}

      {/* Bottom Direct CTA Buttons */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button
          onClick={() => setActiveTab('nuevo-producto')}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold text-xs shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4 text-emerald-600" />
          <span>Nuevo Prod.</span>
        </button>

        <button
          onClick={() => setActiveTab('vender')}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-md shadow-emerald-700/20 transition-colors"
        >
          <QrCode className="w-4 h-4" />
          <span>Escanear / Vender</span>
        </button>
      </div>
    </div>
  );
};
