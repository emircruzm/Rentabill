import React, { useState, useRef, useEffect } from 'react';
import { 
  TrendingUp, 
  Bell, 
  ChevronDown, 
  User, 
  Settings as SettingsIcon, 
  HelpCircle, 
  LogOut, 
  CheckCircle2, 
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Sliders,
  Mail,
  Copy,
  Store
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { NotificationDropdown } from './NotificationDropdown';
import { StoreSelectorModal } from './StoreSelectorModal';

export const Header: React.FC = () => {
  const { 
    metrics, 
    calculatedProducts, 
    user, 
    storeInfo, 
    activeTab,
    setActiveTab,
    setShowProfileModal,
    setShowLogoutModal,
    setShowHelpModal,
    isTestingRole,
    exitRoleTest,
    incomingInvitation,
    setShowInvitationConfirmModal,
    userStores,
    storesLoadingStatus,
    setShowStoreSelectorModal
  } = useInventory();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);

  // Auto-close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate count of alerts
  const alertCount = calculatedProducts.filter(p => p.stock <= 12 || p.isSlow || p.estimatedSpeed === 'LENTO').length + (incomingInvitation ? 1 : 0);

  return (
    <header className="w-full bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-2.5 shadow-xs">
      <div className="max-w-md mx-auto flex items-center justify-between relative">
        {/* Logo & Store Switcher */}
        <div className="flex items-center gap-2 select-none">
          <div 
            onClick={() => setActiveTab('pulso')}
            className="w-8 h-8 rounded-xl bg-emerald-800 flex items-center justify-center text-white shadow-xs cursor-pointer active:scale-95 transition-transform"
          >
            <TrendingUp className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span 
                onClick={() => setActiveTab('pulso')}
                className="font-bold text-base leading-tight tracking-tight text-slate-900 cursor-pointer"
              >
                Rentabill
              </span>
              <div className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-emerald-50 border border-emerald-200/60 text-[9px] font-semibold text-emerald-700">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-600"></span>
                </span>
                EN VIVO
              </div>
            </div>

            {/* Nombre de la tienda activa con chevron (Parte B1) */}
            {storesLoadingStatus === 'loading' || !storeInfo.id ? (
              <div className="h-3.5 w-24 bg-slate-200 animate-pulse rounded-md mt-0.5" />
            ) : storesLoadingStatus === 'error' ? (
              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md mt-0.5 inline-block">
                Sin conexión
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setShowStoreSelectorModal(true)}
                className="flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-emerald-800 active:text-emerald-950 transition-colors group text-left truncate max-w-[170px]"
                title="Cambiar de tienda o sucursal"
              >
                <span className="truncate">{storeInfo.name}</span>
                <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-emerald-700 shrink-0 transition-transform" />
              </button>
            )}
          </div>
        </div>

        {/* Right HUD: Notifications + Ajustes Direct Button + Avatar */}
        <div className="flex items-center gap-1.5">
          {/* Campana de Notificaciones */}
          <div className="relative">
            <button 
              id="notifications-bell-button"
              onClick={() => {
                setShowNotifications(prev => !prev);
                setShowUserMenu(false);
              }}
              aria-label="Notificaciones de la tienda"
              aria-expanded={showNotifications}
              className={`relative p-2 rounded-xl transition-all ${
                showNotifications 
                  ? 'bg-emerald-100 text-emerald-800 scale-105' 
                  : 'hover:bg-slate-100 text-slate-600'
              }`}
              title="Notificaciones"
            >
              <Bell className="w-4 h-4" />
              {alertCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 ring-2 ring-white"></span>
                </span>
              )}
            </button>

            <NotificationDropdown 
              isOpen={showNotifications} 
              onClose={() => setShowNotifications(false)} 
            />
          </div>

          {/* Botón de Acceso Directo a Ajustes (Solo Administrador) */}
          {user.role === 'ADMIN' && (
            <button
              onClick={() => {
                setShowNotifications(false);
                setShowUserMenu(false);
                setActiveTab('ajustes');
              }}
              className={`p-2 rounded-xl transition-all flex items-center justify-center ${
                activeTab === 'ajustes'
                  ? 'bg-emerald-800 text-white shadow-xs scale-105'
                  : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
              title="Ir a Ajustes del negocio"
              aria-label="Ajustes"
            >
              <Sliders className="w-4 h-4 stroke-[2]" />
            </button>
          )}

          {/* Avatar del Usuario + Menú Desplegable */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => {
                setShowUserMenu(!showUserMenu);
                setShowNotifications(false);
              }}
              className="w-8 h-8 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center justify-center ring-2 ring-emerald-100 shadow-2xs transition-all active:scale-95 ml-0.5"
              title="Mi perfil y menú"
            >
              {user.avatar || (user.name ? user.name[0].toUpperCase() : 'U')}
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 z-50 animate-in fade-in zoom-in-95">
                {/* 1. Nombre y negocio */}
                <div 
                  onClick={() => {
                    setShowUserMenu(false);
                    if (user.role === 'ADMIN') {
                      setActiveTab('ajustes');
                    } else {
                      setShowProfileModal(true);
                    }
                  }}
                  className="p-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50/60 border border-slate-100/80 mb-1 cursor-pointer transition-colors group"
                  title={user.role === 'ADMIN' ? 'Toca para ir a Ajustes' : 'Toca para ver mi perfil'}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 block truncate group-hover:text-emerald-900">
                      {user.name}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-800 bg-white px-1.5 py-0.2 rounded-md border border-slate-200">
                      {user.role === 'ADMIN' ? 'Ajustes →' : 'Perfil →'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-600 font-semibold block truncate mt-0.5">
                    {storeInfo.name}
                  </span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                      user.role === 'ADMIN' 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : user.role === 'CAJERO'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {user.role === 'ADMIN' ? 'Administrador' : user.role === 'CAJERO' ? 'Cajero' : 'Repositor'}
                    </span>
                    <span className="text-[10px] text-slate-400">• ID: {user.userId}</span>
                  </div>
                </div>

                {/* Botón destacado: Salir de la prueba (SOLO si isTestingRole está activo) */}
                {isTestingRole && (
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      exitRoleTest();
                    }}
                    className="w-full text-left flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-black bg-amber-400 hover:bg-amber-300 text-slate-950 transition-colors mb-1.5 shadow-2xs border border-amber-500/50"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-slate-950" />
                      <span>Salir de prueba (Volver a Admin)</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* 2. Ver/editar mi perfil */}
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    setShowProfileModal(true);
                  }}
                  className="w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <User className="w-4 h-4 text-slate-500" />
                  <span>Ver mi perfil e ID ({user.userId})</span>
                </button>

                {/* 3. Mis Tiendas (Parte B1) */}
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    setShowStoreSelectorModal(true);
                  }}
                  className="w-full text-left flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-emerald-700" />
                    <span>Mis tiendas</span>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {userStores.length}
                  </span>
                </button>

                {/* 4. Ajustes (Solo Administrador) */}
                {user.role === 'ADMIN' && (
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setActiveTab('ajustes');
                    }}
                    className="w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-emerald-50 hover:text-emerald-900 transition-colors"
                  >
                    <Sliders className="w-4 h-4 text-emerald-700" />
                    <span>Ajustes de la tienda</span>
                  </button>
                )}

                {/* 5. Ayuda */}
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    setShowHelpModal(true);
                  }}
                  className="w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <HelpCircle className="w-4 h-4 text-slate-500" />
                  <span>Ayuda y Guía</span>
                </button>

                {/* 6. Línea separadora */}
                <div className="h-px bg-slate-100 my-1.5" />

                {/* 7. Cerrar sesión */}
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    setShowLogoutModal(true);
                  }}
                  className="w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="w-4 h-4 text-rose-600" />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alerta / Nubecita de Notificación de Invitación (Flujo para la persona invitada) */}
      {incomingInvitation && (
        <div className="max-w-md mx-auto mt-2 animate-in slide-in-from-top-2 duration-200">
          <button
            onClick={() => setShowInvitationConfirmModal(true)}
            className="w-full p-2.5 rounded-2xl bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 text-white shadow-md flex items-center justify-between gap-2.5 text-left border border-emerald-500/40 hover:brightness-105 transition-all group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-xl bg-white/20 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black tracking-tight text-white truncate">
                    ¡Tienes 1 invitación de negocio!
                  </span>
                  <span className="text-[9px] bg-amber-400 text-slate-950 font-black px-1.5 py-0.2 rounded-full uppercase">
                    {incomingInvitation.role}
                  </span>
                </div>
                <span className="text-[10px] text-emerald-100 block truncate">
                  {incomingInvitation.storeName} ({incomingInvitation.inviterName})
                </span>
              </div>
            </div>
            <div className="px-2.5 py-1 rounded-xl bg-amber-400 text-slate-950 text-[10px] font-black shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
              Ver invitación
            </div>
          </button>
        </div>
      )}

      {/* Modal Bottom Sheet: Mis Tiendas (Parte B1) */}
      <StoreSelectorModal />
    </header>
  );
};
