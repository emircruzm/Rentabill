import React from 'react';
import { WifiOff, RefreshCw, LogOut } from 'lucide-react';
import { useInventory } from '@application/index';

export const ConnectionErrorView: React.FC = () => {
  const { storesError, error, retrySession, logout, loading } = useInventory();

  const errorMessage = storesError || error || 'No se pudo conectar con el servidor o verificar tus tiendas.';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-white rounded-3xl p-6 shadow-xl border border-slate-100 text-center space-y-5 animate-in fade-in duration-300">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
          <WifiOff className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-black text-slate-900 tracking-tight">
            Problema de conexión
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            {errorMessage}
          </p>
        </div>

        <div className="space-y-2 pt-2">
          <button
            type="button"
            disabled={loading}
            onClick={retrySession}
            className="w-full py-3 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-98 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Reintentando...' : 'Reintentar'}</span>
          </button>

          <button
            type="button"
            onClick={logout}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-50 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>
    </div>
  );
};

