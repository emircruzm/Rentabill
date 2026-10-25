import React from 'react';
import { AlertCircle, LogOut } from 'lucide-react';
import { useInventory } from '@application/index';

export const LogoutConfirmModal: React.FC = () => {
  const { showLogoutModal, setShowLogoutModal, logout } = useInventory();

  if (!showLogoutModal) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-xl border border-slate-100 text-center">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <LogOut className="w-6 h-6" />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-black text-slate-900">¿Seguro que quieres salir?</h3>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Se cerrará tu sesión en este teléfono o computadora. Para volver a entrar necesitarás tu usuario y contraseña.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            type="button"
            onClick={() => setShowLogoutModal(false)}
            className="py-2.5 px-4 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={logout}
            className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors"
          >
            Sí, salir
          </button>
        </div>
      </div>
    </div>
  );
};

