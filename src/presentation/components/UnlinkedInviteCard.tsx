import React, { useState } from 'react';
import { Key, ArrowRight, Check, X, Shield, ShoppingBag, Boxes, Store, UserCheck, AlertCircle, ArrowLeft } from 'lucide-react';
import { useInventory } from '@application/index';
import { TeamInvitation, ROLE_DESCRIPTIONS, ROLE_TITLES } from '@shared/types/index';

export const UnlinkedInviteCard: React.FC = () => {
  const { 
    acceptInvitation, 
    rejectInvitation, 
    invitations,
    exitRoleTest,
    user,
    showToast 
  } = useInventory();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [validatedInvitation, setValidatedInvitation] = useState<TeamInvitation | null>(null);
  const [step, setStep] = useState<'input' | 'confirmation'>('input');

  // List of active pending codes for quick testing
  const pendingCodes = invitations.filter(i => i.status === 'Esperando');

  const handleContinue = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const found = invitations.find(i => i.userId.toLowerCase() === code.trim().toLowerCase() || i.id === code.trim());
    if (!found) {
      setError('Código o ID no válido');
      return;
    }

    setValidatedInvitation(found);
    setStep('confirmation');
  };

  const handleAccept = () => {
    if (!validatedInvitation) return;
    acceptInvitation(validatedInvitation.id);
  };

  const handleReject = () => {
    if (!validatedInvitation) return;
    rejectInvitation(validatedInvitation.id);
    setValidatedInvitation(null);
    setCode('');
    setStep('input');
    setError('Rechazaste la invitación. El dueño verá el estado como "Rechazada" en su lista.');
  };

  const handleQuickFill = (c: string) => {
    setCode(c);
    setError(null);
  };

  return (
    <div className="p-4 sm:p-5 max-w-md mx-auto w-full animate-in fade-in pb-28 pt-3">
      {step === 'input' ? (
        /* TARJETA 1: Ingreso de Código */
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-5">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-800 mx-auto flex items-center justify-center shadow-xs">
              <Key className="w-7 h-7 stroke-[2.2]" />
            </div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              ¿Tienes un código de invitación? Ingrésalo aquí
            </h2>
            <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
              Si el dueño o administrador de una tienda te invitó a su equipo, escribe el código que te compartió para vincular tu cuenta.
            </p>
          </div>

          <form onSubmit={handleContinue} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block text-center">
                Código de invitación
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={code}
                  onChange={e => {
                    setCode(e.target.value.toUpperCase());
                    if (error) setError(null);
                  }}
                  placeholder="Ej: RENT-4F7K"
                  className={`w-full py-3.5 px-4 text-center rounded-2xl border text-sm font-mono font-black uppercase tracking-wider transition-all focus:outline-hidden ${
                    error 
                      ? 'border-rose-400 bg-rose-50/50 text-rose-900' 
                      : 'border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
                  }`}
                />
              </div>

              {error && (
                <div className="flex items-center gap-1.5 text-xs text-rose-600 justify-center p-2 rounded-xl bg-rose-50 border border-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!code.trim()}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm shadow-md shadow-emerald-950/10 flex items-center justify-center gap-2 transition-all active:scale-98"
            >
              <span>Continuar</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick test codes suggestions */}
          {pendingCodes.length > 0 && (
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <span className="text-[11px] font-bold text-slate-500 block text-center">
                Códigos de prueba disponibles para canjear:
              </span>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {pendingCodes.map((inv: TeamInvitation) => (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => handleQuickFill(inv.userId)}
                    className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 font-mono text-[11px] font-bold transition-all"
                  >
                    {inv.userId} ({inv.userName} - {inv.role === 'ADMIN' ? 'Admin' : inv.role === 'CAJERO' ? 'Cajero' : 'Repositor'})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Switch back to owner shortcut */}
          <div className="pt-2 text-center border-t border-slate-100">
            <button
              type="button"
              onClick={exitRoleTest}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a la vista del Administrador (Dueño)</span>
            </button>
          </div>
        </div>
      ) : validatedInvitation ? (
        /* TARJETA 2: CONFIRMACIÓN DE INGRESO */
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-md space-y-5 animate-in zoom-in-95">
          <div className="text-center space-y-1 border-b border-slate-100 pb-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 mb-1">
              <UserCheck className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              Invitación a equipo de trabajo
            </h2>
            <p className="text-xs text-slate-500">
              Verifica los datos antes de aceptar o rechazar
            </p>
          </div>

          {/* Business & Person Info */}
          <div className="space-y-3">
            {/* Nombre del negocio */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-emerald-800 flex items-center justify-center shrink-0 shadow-2xs">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Nombre del negocio
                </span>
                <span className="text-sm font-black text-slate-900 block">
                  {validatedInvitation.storeName}
                </span>
              </div>
            </div>

            {/* Nombre de la persona (tal como lo escribió el dueño) */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Invitado para
                </span>
                <span className="text-sm font-black text-slate-900 block">
                  {validatedInvitation.userName}
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700">
                {validatedInvitation.userId}
              </span>
            </div>

            {/* Rol Asignado con descripción EXACTA */}
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                    validatedInvitation.role === 'ADMIN' ? 'bg-emerald-200 text-emerald-900' :
                    validatedInvitation.role === 'CAJERO' ? 'bg-blue-200 text-blue-900' : 'bg-purple-200 text-purple-900'
                  }`}>
                    {validatedInvitation.role === 'ADMIN' ? <Shield className="w-4 h-4" /> :
                     validatedInvitation.role === 'CAJERO' ? <ShoppingBag className="w-4 h-4" /> : <Boxes className="w-4 h-4" />}
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-emerald-900/70 block">
                      Rol asignado
                    </span>
                    <span className="text-xs font-black text-emerald-950">
                      {ROLE_TITLES[validatedInvitation.role].title}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                  {ROLE_TITLES[validatedInvitation.role].badge}
                </span>
              </div>

              {/* DESCRIPCIÓN EXACTA SEGÚN ESPECIFICACIÓN */}
              <p className="text-xs text-emerald-950/90 leading-relaxed pt-1 border-t border-emerald-200/60">
                "{ROLE_DESCRIPTIONS[validatedInvitation.role]}"
              </p>
            </div>
          </div>

          {/* DOS BOTONES GRANDES: ACEPTAR Y RECHAZAR */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={handleAccept}
              className="w-full py-4 px-4 rounded-2xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-sm shadow-md shadow-emerald-950/15 flex items-center justify-center gap-2 transition-all active:scale-98"
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
              <span>Aceptar</span>
            </button>

            <button
              type="button"
              onClick={handleReject}
              className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-rose-50 border-2 border-rose-200 text-rose-700 font-bold text-sm shadow-2xs flex items-center justify-center gap-2 transition-all active:scale-98"
            >
              <X className="w-5 h-5" />
              <span>Rechazar</span>
            </button>
          </div>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => {
                setStep('input');
                setError(null);
              }}
              className="text-xs text-slate-400 hover:text-slate-600 font-medium"
            >
              Escribir otro código
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

