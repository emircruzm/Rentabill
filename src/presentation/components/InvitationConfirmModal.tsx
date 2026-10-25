import React from 'react';
import { Store, UserCheck, Shield, ShoppingBag, Boxes, Check, X, Sparkles, AlertCircle } from 'lucide-react';
import { useInventory } from '@application/index';
import { ROLE_INFO } from '@shared/constants/roles';

export const InvitationConfirmModal: React.FC = () => {
  const { 
    incomingInvitation, 
    showInvitationConfirmModal, 
    setShowInvitationConfirmModal, 
    acceptInvitation, 
    rejectInvitation 
  } = useInventory();

  if (!showInvitationConfirmModal || !incomingInvitation) return null;

  const roleDetails = ROLE_INFO[incomingInvitation.role];

  const getRoleIcon = () => {
    if (incomingInvitation.role === 'CAJERO') {
      return <ShoppingBag className="w-5 h-5 text-blue-600" />;
    }
    if (incomingInvitation.role === 'REPOSITOR') {
      return <Boxes className="w-5 h-5 text-purple-600" />;
    }
    return <Shield className="w-5 h-5 text-emerald-600" />;
  };

  const getRoleColorTheme = () => {
    if (incomingInvitation.role === 'CAJERO') {
      return {
        badgeBg: 'bg-blue-100 text-blue-800 border-blue-200',
        cardBg: 'bg-blue-50/70 border-blue-200',
      };
    }
    if (incomingInvitation.role === 'REPOSITOR') {
      return {
        badgeBg: 'bg-purple-100 text-purple-800 border-purple-200',
        cardBg: 'bg-purple-50/70 border-purple-200',
      };
    }
    return {
      badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      cardBg: 'bg-emerald-50/70 border-emerald-200',
    };
  };

  const theme = getRoleColorTheme();

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-5 shadow-2xl border border-slate-100 relative">
        {/* Header with celebration / invite icon */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-800 shadow-xs mb-1">
            <Store className="w-7 h-7" />
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-700">
            <Sparkles className="w-3 h-3 text-emerald-600" />
            Invitación de Negocio
          </span>
          <h3 className="text-lg font-black text-slate-900 leading-tight">
            Te han invitado a colaborar
          </h3>
          <p className="text-xs text-slate-500">
            Revisa los detalles y el rol asignado antes de unirte
          </p>
        </div>

        {/* Resumen: Negocio, Dueño y Rol */}
        <div className="space-y-3">
          {/* Nombre del negocio & Dueño */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Negocio / Bodega
              </span>
              <span className="text-sm font-black text-slate-900 block truncate">
                {incomingInvitation.storeName}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Dueño que invita
                </span>
                <span className="text-xs font-bold text-slate-700 block">
                  {incomingInvitation.inviterName}
                </span>
              </div>
              <span className="text-[10px] font-semibold text-slate-400 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                ID: {incomingInvitation.userId}
              </span>
            </div>
          </div>

          {/* Rol asignado y descripción exacta de permisos */}
          <div className={`p-4 rounded-2xl border ${theme.cardBg} space-y-2`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-xs">
                  {getRoleIcon()}
                </div>
                <div>
                  <span className="text-xs font-black text-slate-900 block">
                    {roleDetails.name}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">
                    Rol asignado
                  </span>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${theme.badgeBg}`}>
                {roleDetails.badge}
              </span>
            </div>

            {/* Texto exacto de permisos requerido por el usuario */}
            <p className="text-xs text-slate-700 leading-relaxed font-normal pt-1 border-t border-slate-200/50">
              "{roleDetails.description}"
            </p>
          </div>
        </div>

        {/* Action Buttons: Aceptar y Rechazar */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => rejectInvitation(incomingInvitation.id)}
            className="w-full py-3 px-3 rounded-2xl border-2 border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <X className="w-4 h-4 text-slate-400" />
            <span>Rechazar</span>
          </button>

          <button
            type="button"
            onClick={() => acceptInvitation(incomingInvitation.id)}
            className="w-full py-3 px-3 rounded-2xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-md shadow-emerald-900/20 active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4 text-white" />
            <span>Aceptar invitación</span>
          </button>
        </div>
      </div>
    </div>
  );
};

