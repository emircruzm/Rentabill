import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { capacitorAppLifecycle } from '@platform/index';
import { 
  X, 
  Store, 
  Check, 
  Plus, 
  Shield, 
  ShoppingBag, 
  Boxes, 
  RefreshCw,
  AlertTriangle,
  ChevronRight
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { UserRole } from '../types';

export const StoreSelectorModal: React.FC = () => {
  const {
    showStoreSelectorModal,
    setShowStoreSelectorModal,
    userStores,
    storesLoadingStatus,
    storesError,
    retryLoadStores,
    user,
    switchStore,
    openAddStoreOnboarding
  } = useInventory();

  const [switchingStoreId, setSwitchingStoreId] = useState<string | null>(null);

  useEffect(() => {
    if (!showStoreSelectorModal) return;

    let cleanupFn: (() => void) | undefined;
    capacitorAppLifecycle.onBackButton(() => {
      setShowStoreSelectorModal(false);
    }).then(cleanup => {
      cleanupFn = cleanup;
    });

    return () => {
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, [showStoreSelectorModal, setShowStoreSelectorModal]);

  if (!showStoreSelectorModal) return null;

  const handleSelectStore = async (storeId: string) => {
    if (storeId === user.storeId) {
      setShowStoreSelectorModal(false);
      return;
    }

    try {
      setSwitchingStoreId(storeId);
      const ok = await switchStore(storeId);
      if (ok) {
        setShowStoreSelectorModal(false);
      }
    } finally {
      setSwitchingStoreId(null);
    }
  };

  const getRoleIcon = (role: UserRole) => {
    if (role === 'ADMIN') return <Shield className="w-3.5 h-3.5 text-emerald-700" />;
    if (role === 'CAJERO') return <ShoppingBag className="w-3.5 h-3.5 text-blue-700" />;
    return <Boxes className="w-3.5 h-3.5 text-purple-700" />;
  };

  const getRoleBadge = (role: UserRole, isOwner: boolean) => {
    if (isOwner) {
      return (
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
          Dueño (Admin)
        </span>
      );
    }
    if (role === 'ADMIN') {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
          Administrador
        </span>
      );
    }
    if (role === 'CAJERO') {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-200">
          Cajero
        </span>
      );
    }
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-200">
        Repositor
      </span>
    );
  };

  const modalContent = (
    <div 
      className="fixed inset-0 z-999 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={() => setShowStoreSelectorModal(false)}
    >
      <div 
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-8 duration-300 pb-safe"
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile handle indicator */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3 pb-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-800 text-white flex items-center justify-center shadow-xs">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight">Mis tiendas</h3>
              <p className="text-[11px] text-slate-500">
                Selecciona una tienda para gestionar sus datos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowStoreSelectorModal(false)}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-3">
          {storesLoadingStatus === 'loading' ? (
            /* Esqueleto al cargar */
            <div className="space-y-2.5 py-1">
              {[1, 2, 3].map(i => (
                <div key={i} className="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/60 flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-slate-200" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-slate-200 rounded w-3/5" />
                    <div className="h-2.5 bg-slate-200 rounded w-2/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : storesLoadingStatus === 'error' ? (
            /* Error con botón Reintentar */
            <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
              <div>
                <p className="text-xs font-bold text-rose-900">
                  {storesError || 'No se pudieron cargar tus tiendas'}
                </p>
                <p className="text-[11px] text-rose-700 mt-0.5">
                  Verifica tu conexión a internet o intenta nuevamente.
                </p>
              </div>
              <button
                type="button"
                onClick={retryLoadStores}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-all active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reintentar</span>
              </button>
            </div>
          ) : (
            /* Lista de tiendas */
            <div className="space-y-2">
              {userStores.length === 0 ? (
                <div className="p-6 text-center text-slate-500 space-y-1">
                  <p className="text-xs font-medium">No se encontraron tiendas vinculadas a tu cuenta.</p>
                </div>
              ) : (
                userStores.map(st => {
                  const isActive = st.storeId === user.storeId;
                  const isSwitching = switchingStoreId === st.storeId;

                  return (
                    <button
                      key={st.storeId}
                      type="button"
                      disabled={isSwitching}
                      onClick={() => handleSelectStore(st.storeId)}
                      className={`w-full text-left p-3.5 rounded-2xl transition-all border flex items-center justify-between gap-3 ${
                        isActive
                          ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-emerald-300 hover:bg-slate-50/80 active:scale-99'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Inicial en círculo */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                          isActive
                            ? 'bg-emerald-800 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {st.storeName ? st.storeName[0].toUpperCase() : 'T'}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900 truncate">
                              {st.storeName}
                            </span>
                            {isActive && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-600 text-white flex items-center gap-1 shadow-2xs">
                                <Check className="w-3 h-3 stroke-[3]" />
                                Activa
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex items-center gap-1">
                              {getRoleIcon(st.role)}
                              {getRoleBadge(st.role, st.isOwner)}
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium">• {st.storeType}</span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isSwitching ? (
                          <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                        ) : isActive ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Botón normal "Agregar tienda" al final */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                setShowStoreSelectorModal(false);
                openAddStoreOnboarding();
              }}
              className="w-full py-3 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-98"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Agregar tienda</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
