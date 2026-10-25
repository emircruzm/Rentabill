import React from 'react';
import { Eye, ShieldCheck, Key } from 'lucide-react';
import { useInventory } from '@application/index';

export const RoleTestBanner: React.FC = () => {
  const { user, isTestingRole, exitRoleTest } = useInventory();

  // ONLY display when isTestingRole is active. Never show to real users with non-ADMIN roles.
  if (!isTestingRole) {
    return null;
  }

  const roleName = user.role === 'CAJERO' ? 'Cajero (Cobros)' : user.role === 'REPOSITOR' ? 'Repositor (Almacén)' : 'Administrador';

  return (
    <div className="bg-amber-400 text-slate-950 px-4 py-2 border-b border-amber-500 shadow-xs z-50">
      <div className="flex items-center justify-between gap-2 max-w-md mx-auto">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="w-4 h-4 text-slate-950 shrink-0" />
          <div className="min-w-0 flex flex-col">
            <span className="text-xs font-black truncate leading-tight">
              MODO PRUEBA: los cambios NO se guardan
            </span>
            <span className="text-[10px] font-semibold text-slate-900 truncate">
              Viendo como: {roleName}
            </span>
          </div>
        </div>

        <button
          onClick={exitRoleTest}
          className="shrink-0 px-2.5 py-1 rounded-lg font-bold text-xs bg-slate-950 hover:bg-slate-900 text-amber-300 transition-all flex items-center gap-1 active:scale-95 shadow-2xs"
          title="Salir del modo de prueba y volver a Administrador"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          <span>Salir de prueba</span>
        </button>
      </div>
    </div>
  );
};

