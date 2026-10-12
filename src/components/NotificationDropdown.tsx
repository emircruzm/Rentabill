import React, { useRef, useEffect } from 'react';
import { 
  AlertTriangle, 
  PackageX, 
  TrendingDown, 
  ArrowRight, 
  Check, 
  X, 
  Boxes, 
  RefreshCw,
  Sparkles,
  ShieldAlert,
  Clock
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';

export interface WarehouseNotification {
  id: string;
  type: 'stock_bajo' | 'rotacion_lenta' | 'capital_atrapado' | 'calibracion_pendiente';
  title: string;
  description: string;
  badge: string;
  priority: 'alta' | 'media' | 'baja';
  time: string;
  actionTab?: 'inventario' | 'simulador' | 'vender';
  actionLabel?: string;
  skuName?: string;
  metricValue?: string;
}

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ isOpen, onClose }) => {
  const { 
    calculatedProducts, 
    metrics, 
    setActiveTab, 
    showToast,
    incomingInvitation,
    setShowInvitationConfirmModal
  } = useInventory();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Compute dynamic warehouse alerts from current inventory data
  const notifications: WarehouseNotification[] = React.useMemo(() => {
    const list: WarehouseNotification[] = [];

    // 1. Stock Bajo (Stock <= 12)
    const lowStockItems = calculatedProducts.filter(p => p.stock <= 12);
    lowStockItems.forEach(item => {
      list.push({
        id: `low-stock-${item.id}`,
        type: 'stock_bajo',
        title: `Stock Crítico: ${item.name}`,
        description: `Quedan solo ${item.stock} unidades en anaquel. Riesgo de quiebre de stock en menos de 48h.`,
        badge: `${item.stock} unids`,
        priority: item.stock <= 6 ? 'alta' : 'media',
        time: 'Hace 15 min',
        actionTab: 'simulador',
        actionLabel: 'Simular Reposición',
        skuName: item.name,
        metricValue: `$${(item.costPrice * item.stock).toFixed(2)} remanente`
      });
    });

    // 2. Rotaciones Lentas / Dinero Atrapado
    const slowItems = calculatedProducts.filter(p => p.isSlow || p.estimatedSpeed === 'LENTO');
    slowItems.forEach(item => {
      list.push({
        id: `slow-rot-${item.id}`,
        type: 'rotacion_lenta',
        title: `Rotación Baja: ${item.name}`,
        description: `Velocidad de ${item.dailyVelocity.toFixed(1)} u/día. Capital inmovilizado: $${item.investedCapital.toFixed(2)}.`,
        badge: 'Lenta rotación',
        priority: 'alta',
        time: 'Alerta de Almacén',
        actionTab: 'inventario',
        actionLabel: 'Ver en Inventario',
        skuName: item.name,
        metricValue: `$${item.investedCapital.toFixed(2)} inmovilizados`
      });
    });

    // 3. Validación / Calibración próxima
    const nearCalibration = calculatedProducts.filter(p => p.status === 'ESTIMADO' && p.salesCount >= 3);
    nearCalibration.forEach(item => {
      list.push({
        id: `calib-${item.id}`,
        type: 'calibracion_pendiente',
        title: `A ${5 - item.salesCount} ventas de Calibrar`,
        description: `${item.name} lleva ${item.salesCount}/5 ventas para validar velocidad real de mostrador.`,
        badge: `${item.salesCount}/5 Ventas`,
        priority: 'baja',
        time: 'Progreso',
        actionTab: 'vender',
        actionLabel: 'Ir al Mostrador',
        skuName: item.name
      });
    });

    return list;
  }, [calculatedProducts]);

  if (!isOpen) return null;

  const handleActionClick = (tab?: 'inventario' | 'simulador' | 'vender', name?: string) => {
    if (tab) {
      setActiveTab(tab);
    }
    showToast(`Navegando a gestión de ${name || 'almacén'}`, 'info');
    onClose();
  };

  const highPriorityCount = notifications.filter(n => n.priority === 'alta').length;

  return (
    <div 
      className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs flex justify-center items-start pt-14 pb-4 px-3 sm:px-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        ref={dropdownRef}
        id="warehouse-notifications-panel"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[calc(100vh-4.5rem)] animate-in zoom-in-95 slide-in-from-top-2 duration-200"
      >
        {/* Panel Header */}
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-xs tracking-tight text-white">Alertas de Almacén</h3>
                {highPriorityCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                    {highPriorityCount} urgentes
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400">Stock crítico y rotaciones operativas</p>
            </div>
          </div>

          <button
            onClick={onClose}
            id="close-notifications-btn"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Cerrar panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick summary strip */}
        <div className="bg-slate-50 border-b border-slate-100 px-4 py-2 flex items-center justify-between text-[11px] shrink-0">
          <span className="text-slate-500 font-medium">
            Total: <strong className="text-slate-800 font-bold">{notifications.length} avisos activos</strong>
          </span>
          <span className="text-emerald-700 font-semibold flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-emerald-600" />
            Monitor continuo
          </span>
        </div>

        {/* Notifications list */}
        <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100 overscroll-contain">
          {/* Prominent Invitation Card if pending */}
          {incomingInvitation && (
            <div className="p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-b border-emerald-200">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-800 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-black text-slate-900 truncate">
                      Invitación de negocio recibida
                    </span>
                    <span className="text-[10px] font-bold bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded-md uppercase">
                      {incomingInvitation.role}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-700 mt-0.5 leading-snug">
                    <strong>{incomingInvitation.storeName}</strong> ({incomingInvitation.inviterName}) te ha invitado como {incomingInvitation.role}.
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 font-mono">
                      ID: {incomingInvitation.userId}
                    </span>
                    <button
                      onClick={() => {
                        setShowInvitationConfirmModal(true);
                        onClose();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-2xs transition-colors flex items-center gap-1"
                    >
                      <span>Ver y responder</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {notifications.length === 0 && !incomingInvitation ? (
            <div className="p-8 text-center text-slate-400 space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                <Check className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-700">Almacén en perfecto estado</p>
              <p className="text-[11px] text-slate-400">No hay alertas de stock bajo ni dinero atrapado en este momento.</p>
            </div>
          ) : (
            notifications.map((item) => (
              <div 
                key={item.id}
                className={`p-3.5 transition-colors hover:bg-slate-50/80 ${
                  item.priority === 'alta' ? 'bg-rose-50/30' : ''
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Icon based on type */}
                  <div className="shrink-0 mt-0.5">
                    {item.type === 'stock_bajo' && (
                      <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                        <PackageX className="w-4 h-4" />
                      </div>
                    )}
                    {item.type === 'rotacion_lenta' && (
                      <div className="w-7 h-7 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                        <TrendingDown className="w-4 h-4" />
                      </div>
                    )}
                    {item.type === 'calibracion_pendiente' && (
                      <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <Clock className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {item.title}
                      </h4>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md shrink-0 ${
                        item.priority === 'alta' 
                          ? 'bg-rose-100 text-rose-700' 
                          : item.priority === 'media'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {item.badge}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                      {item.description}
                    </p>

                    {item.metricValue && (
                      <div className="mt-1 text-[10px] font-mono font-semibold text-slate-700">
                        Impacto: <span className="text-slate-900">{item.metricValue}</span>
                      </div>
                    )}

                    {/* Action Link button */}
                    {item.actionLabel && (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-medium">
                          {item.time}
                        </span>
                        <button
                          onClick={() => handleActionClick(item.actionTab, item.skuName)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-lg transition-colors"
                        >
                          <span>{item.actionLabel}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs shrink-0">
          <button
            onClick={() => {
              setActiveTab('simulador');
              onClose();
            }}
            className="text-emerald-800 font-bold hover:underline flex items-center gap-1"
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Abrir Plan de Reposición</span>
          </button>

          <button
            onClick={onClose}
            className="text-slate-500 font-semibold hover:text-slate-800 px-2.5 py-1 rounded-lg bg-slate-200/70 hover:bg-slate-200 transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
