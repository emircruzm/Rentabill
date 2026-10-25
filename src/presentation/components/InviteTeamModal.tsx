import React, { useState, useEffect } from 'react';
import { 
  UserPlus, 
  Mail, 
  User, 
  Phone, 
  Shield, 
  Check, 
  Copy,
  X, 
  ShoppingBag, 
  Boxes, 
  Fingerprint, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { useInventory } from '@application/index';
import { UserRole } from '@shared/types/index';
import { ROLE_INFO } from '@shared/constants/roles';
import { formatPeruPhoneDisplay } from '@shared/formatters/index';

export const InviteTeamModal: React.FC = () => {
  const { 
    showInviteModal, 
    setShowInviteModal, 
    sendInvitation, 
    findUserByUserId, 
    showToast,
    user,
    copyUserId
  } = useInventory();

  const [userIdInput, setUserIdInput] = useState('');
  const [role, setRole] = useState<UserRole>('CAJERO');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedOwnCode, setCopiedOwnCode] = useState(false);
  const [recognizedUser, setRecognizedUser] = useState<{
    userId: string;
    name: string;
    email: string;
    phone: string;
  } | null>(null);

  useEffect(() => {
    let isCurrent = true;
    if (userIdInput.trim().length >= 4) {
      findUserByUserId(userIdInput.trim()).then(match => {
        if (isCurrent) setRecognizedUser(match);
      });
    } else {
      setRecognizedUser(null);
    }
    return () => {
      isCurrent = false;
    };
  }, [userIdInput, findUserByUserId]);

  if (!showInviteModal) return null;

  const handleCopyOwn = () => {
    if (user.userId) {
      copyUserId(user.userId);
      setCopiedOwnCode(true);
      setTimeout(() => setCopiedOwnCode(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = userIdInput.trim().toUpperCase();
    if (!cleanCode) {
      showToast('Ingresa el ID del usuario', 'alert');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await sendInvitation(cleanCode, role);
      if (res.success) {
        setUserIdInput('');
        setRecognizedUser(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl p-5 max-w-md w-full space-y-4 shadow-xl border border-slate-100 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-xs">
              <UserPlus className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">Invitar a alguien al equipo</h3>
              <p className="text-[11px] text-slate-500">Agrega personas usando su ID único de usuario</p>
            </div>
          </div>
          <button
            onClick={() => setShowInviteModal(false)}
            className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tarjeta de Código Propio del Usuario (Corrección #2) */}
        {user.userId && (
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/90 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">
                Tu Código para que te inviten:
              </span>
              <span className="text-xs font-mono font-black text-slate-900 tracking-wider">
                {user.userId}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyOwn}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shrink-0 ${
                copiedOwnCode
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
              }`}
            >
              {copiedOwnCode ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedOwnCode ? '¡Copiado!' : 'Copiar'}</span>
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. CAMPO: ID DEL USUARIO */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Fingerprint className="w-3.5 h-3.5 text-emerald-700" />
                <span>ID del usuario (alfanumérico)</span>
              </label>
              <span className="text-[10px] text-slate-400 font-medium">Ej: RENT-4F7K</span>
            </div>

            <div className="relative">
              <input
                type="text"
                required
                value={userIdInput}
                onChange={e => setUserIdInput(e.target.value.toUpperCase())}
                placeholder="Pega o escribe el ID (ej. RENT-4F7K)"
                className={`w-full px-3.5 py-2.5 rounded-xl border font-mono font-bold text-xs uppercase tracking-wider transition-all focus:outline-hidden ${
                  recognizedUser 
                    ? 'border-emerald-500 bg-emerald-50/30 text-emerald-950 focus:border-emerald-600 ring-1 ring-emerald-500/50' 
                    : 'border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600'
                }`}
              />
              {recognizedUser && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-md">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Usuario Encontrado</span>
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-400">
              Pídele al usuario su código alfanumérico que aparece en su perfil de Rentabill (ej. RENT-4F7K).
            </p>
          </div>

          {/* 2. AUTO-COMPLETADO DE DATOS (Al ingresar un ID válido) */}
          {recognizedUser ? (
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/90 space-y-2.5 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-emerald-200/70 pb-1.5">
                <span className="text-[11px] font-bold text-emerald-900 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  Datos autocompletados de la cuenta
                </span>
                <span className="text-[10px] font-mono font-black text-emerald-800 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                  {recognizedUser.userId}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 text-xs">
                {/* Nombre */}
                <div className="flex items-center gap-2.5 bg-white p-2 rounded-xl border border-emerald-100">
                  <User className="w-4 h-4 text-emerald-700 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 block font-bold leading-tight">Nombre</span>
                    <span className="text-xs font-black text-slate-900 truncate block">
                      {recognizedUser.name}
                    </span>
                  </div>
                </div>

                {/* Teléfono */}
                <div className="flex items-center gap-2.5 bg-white p-2 rounded-xl border border-emerald-100">
                  <Phone className="w-4 h-4 text-emerald-700 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 block font-bold leading-tight">Teléfono</span>
                    <span className="text-xs font-bold text-slate-800 truncate block font-mono">
                      {formatPeruPhoneDisplay(recognizedUser.phone)}
                    </span>
                  </div>
                </div>

                {/* Correo electrónico */}
                <div className="flex items-center gap-2.5 bg-white p-2 rounded-xl border border-emerald-100">
                  <Mail className="w-4 h-4 text-emerald-700 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 block font-bold leading-tight">Correo electrónico</span>
                    <span className="text-xs font-bold text-slate-800 truncate block">
                      {recognizedUser.email}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            userIdInput.trim().length >= 3 && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Escribe un ID registrado (ej: <strong>RENT-4F7K</strong>) para autocompletar nombre, teléfono y correo automáticamente.</span>
              </div>
            )
          )}

          {/* 3. SELECTOR DE ROL: (Cajero / Repositor / Administrador) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Selecciona el rol asignado
            </label>

            {/* Role 1: Cajero (Cobros) */}
            <div
              onClick={() => setRole('CAJERO')}
              className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                role === 'CAJERO'
                  ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/50 shadow-xs'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-slate-900">{ROLE_INFO.CAJERO.name}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-800 ml-1.5">
                      {ROLE_INFO.CAJERO.badge}
                    </span>
                  </div>
                </div>
                <input
                  type="radio"
                  name="role"
                  checked={role === 'CAJERO'}
                  onChange={() => setRole('CAJERO')}
                  className="text-blue-600"
                />
              </div>
              <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                "{ROLE_INFO.CAJERO.description}"
              </p>
            </div>

            {/* Role 2: Repositor (Almacén) */}
            <div
              onClick={() => setRole('REPOSITOR')}
              className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                role === 'REPOSITOR'
                  ? 'bg-purple-50/80 border-purple-500 ring-2 ring-purple-500/50 shadow-xs'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                    <Boxes className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-slate-900">{ROLE_INFO.REPOSITOR.name}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-purple-100 text-purple-800 ml-1.5">
                      {ROLE_INFO.REPOSITOR.badge}
                    </span>
                  </div>
                </div>
                <input
                  type="radio"
                  name="role"
                  checked={role === 'REPOSITOR'}
                  onChange={() => setRole('REPOSITOR')}
                  className="text-purple-600"
                />
              </div>
              <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                "{ROLE_INFO.REPOSITOR.description}"
              </p>
            </div>

            {/* Role 3: Administrador (Dueño o Encargado) (Total) */}
            <div
              onClick={() => setRole('ADMIN')}
              className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                role === 'ADMIN'
                  ? 'bg-emerald-50/80 border-emerald-600 ring-2 ring-emerald-600/50 shadow-xs'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-slate-900">{ROLE_INFO.ADMIN.name}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 ml-1.5">
                      {ROLE_INFO.ADMIN.badge}
                    </span>
                  </div>
                </div>
                <input
                  type="radio"
                  name="role"
                  checked={role === 'ADMIN'}
                  onChange={() => setRole('ADMIN')}
                  className="text-emerald-700"
                />
              </div>
              <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                "{ROLE_INFO.ADMIN.description}"
              </p>
            </div>
          </div>

          {/* 4. BOTÓN: "Invitar persona" */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowInviteModal(false)}
              className="py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || userIdInput.trim().length < 4}
              className={`py-2.5 rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all ${
                !isSubmitting && userIdInput.trim().length >= 4
                  ? 'bg-emerald-800 hover:bg-emerald-900 text-white active:scale-95 shadow-md shadow-emerald-900/20'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>{isSubmitting ? 'Enviando...' : 'Invitar persona'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

