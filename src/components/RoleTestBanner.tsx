import React from 'react';
import { Eye, ShieldCheck, Key } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';

export const RoleTestBanner: React.FC = () => {
  const { user, isTestingRole, exitRoleTest } = useInventory();

  // If user is Admin with business linked and not testing, don't show banner
  if (user.role === 'ADMIN' && user.businessLinked !== false && !isTestingRole) {
    return null;
  }

  const isUnlinked = user.businessLinked === false;
  const roleName = user.role === 'CAJERO' ? 'Cajero (Cobros)' : user.role === 'REPOSITOR' ? 'Repositor (Almacén)' : 'Administrador';

  return (
    <div className={`${isUnlinked ? 'bg-blue-600 text-white' : 'bg-amber-400 text-slate-950'} px-4 py-2 border-b ${isUnlinked ? 'border-blue-700' : 'border-amber-500'} shadow-xs`}>
      <div className="flex items-center justify-between gap-2 max-w-md mx-auto">
        <div className="flex items-center gap-2 min-w-0">
          {isUnlinked ? (
            <Key className="w-4 h-4 text-white shrink-0" />
          ) : (
            <Eye className="w-4 h-4 text-slate-950 shrink-0" />
          )}
          <span className="text-xs font-black truncate">
            {isUnlinked ? 'Modo: Persona invitada' : `Viendo como: ${roleName}`}
          </span>
        </div>

        <button
          onClick={exitRoleTest}
          className={`shrink-0 px-2.5 py-1 rounded-lg font-bold text-xs transition-all flex items-center gap-1 active:scale-95 ${
            isUnlinked 
              ? 'bg-white hover:bg-slate-100 text-blue-900 shadow-2xs' 
              : 'bg-slate-950 hover:bg-slate-900 text-amber-300'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Volver al Dueño</span>
        </button>
      </div>
    </div>
  );
};
