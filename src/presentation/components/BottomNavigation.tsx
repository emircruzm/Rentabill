import React from 'react';
import { Activity, Package, ShoppingBag, History, Calculator, Lock } from 'lucide-react';
import { useInventory } from '@application/index';

export const BottomNavigation: React.FC = () => {
  const { activeTab, setActiveTab, cart, user, showToast } = useInventory();

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const isCajero = user.role === 'CAJERO';
  const isRepositor = user.role === 'REPOSITOR';

  const handleTabClick = (tab: 'pulso' | 'inventario' | 'vender' | 'historial' | 'simulador') => {
    if (isCajero && tab !== 'vender') {
      showToast('Acceso limitado (Modo Prueba)', 'alert', 'Como Cajero solo cobras. Toca "Salir de prueba" arriba para volver a Admin.');
      return;
    }
    if (isRepositor && tab !== 'inventario' && tab !== 'historial') {
      showToast('Acceso limitado (Modo Prueba)', 'alert', 'Como Repositor solo ves inventario y movimientos. Toca "Salir de prueba" arriba para volver a Admin.');
      return;
    }
    setActiveTab(tab);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-2 py-1.5 shadow-lg">
      <div className="max-w-md mx-auto grid grid-cols-5 items-center justify-between">
        {/* Tab 1: Pulso */}
        <button
          onClick={() => handleTabClick('pulso')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
            isCajero || isRepositor
              ? 'opacity-40 cursor-not-allowed text-slate-300'
              : activeTab === 'pulso' 
              ? 'text-emerald-800 font-bold' 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <div className="relative">
            <Activity className={`w-5 h-5 ${activeTab === 'pulso' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
            {(isCajero || isRepositor) && (
              <Lock className="w-2.5 h-2.5 text-slate-400 absolute -top-1 -right-1" />
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight font-medium">Pulso</span>
        </button>

        {/* Tab 2: Inventario */}
        <button
          onClick={() => handleTabClick('inventario')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
            isCajero
              ? 'opacity-40 cursor-not-allowed text-slate-300'
              : activeTab === 'inventario' 
              ? 'text-emerald-800 font-bold' 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <div className="relative">
            <Package className={`w-5 h-5 ${activeTab === 'inventario' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
            {isCajero && (
              <Lock className="w-2.5 h-2.5 text-slate-400 absolute -top-1 -right-1" />
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight font-medium">Inventario</span>
        </button>

        {/* Tab 3: Center Action - Vender */}
        <button
          onClick={() => handleTabClick('vender')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all relative ${
            activeTab === 'vender'
              ? 'text-emerald-800 font-bold'
              : 'text-emerald-700 hover:text-emerald-800'
          }`}
        >
          <div className="relative">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-all ${
              activeTab === 'vender' ? 'bg-emerald-800 text-white shadow-xs' : 'bg-emerald-100 text-emerald-800'
            }`}>
              <ShoppingBag className="w-4 h-4 stroke-[2.2]" />
            </div>
            {totalCartCount > 0 && (
              <span className="absolute -top-1 -right-1.5 bg-amber-500 text-slate-950 font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                {totalCartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight font-bold">Vender</span>
        </button>

        {/* Tab 4: Historial */}
        <button
          onClick={() => handleTabClick('historial')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
            isCajero
              ? 'opacity-40 cursor-not-allowed text-slate-300'
              : activeTab === 'historial' 
              ? 'text-emerald-800 font-bold' 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <div className="relative">
            <History className={`w-5 h-5 ${activeTab === 'historial' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
            {isCajero && (
              <Lock className="w-2.5 h-2.5 text-slate-400 absolute -top-1 -right-1" />
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight font-medium">Historial</span>
        </button>

        {/* Tab 5: Simulador */}
        <button
          onClick={() => handleTabClick('simulador')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
            isCajero || isRepositor
              ? 'opacity-40 cursor-not-allowed text-slate-300'
              : activeTab === 'simulador' 
              ? 'text-emerald-800 font-bold' 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <div className="relative">
            <Calculator className={`w-5 h-5 ${activeTab === 'simulador' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
            {(isCajero || isRepositor) && (
              <Lock className="w-2.5 h-2.5 text-slate-400 absolute -top-1 -right-1" />
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight font-medium">Simulador</span>
        </button>
      </div>
    </nav>
  );
};


