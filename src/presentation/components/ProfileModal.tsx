import React, { useState } from 'react';
import { User, Mail, Phone, Shield, X, Check, Copy, Fingerprint, Store, Plus } from 'lucide-react';
import { useInventory } from '@application/index';
import { cleanPeruPhone, isValidPeruPhone } from '@shared/formatters/index';

export const ProfileModal: React.FC = () => {
  const { 
    user, 
    showProfileModal, 
    setShowProfileModal, 
    updateProfile, 
    copyUserId, 
    showToast,
    userStores,
    openAddStoreOnboarding,
    switchStore
  } = useInventory();

  const [name, setName] = useState(user.name);
  const [emailOrPhone, setEmailOrPhone] = useState(user.emailOrPhone);
  const [phone, setPhone] = useState(cleanPeruPhone(user.phone || ''));
  const [copied, setCopied] = useState(false);

  if (!showProfileModal) return null;

  const handleCopy = () => {
    copyUserId();
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = cleanPeruPhone(phone);
    if (cleaned && !isValidPeruPhone(cleaned)) {
      showToast('Teléfono inválido', 'alert', 'El teléfono debe ser un celular peruano de 9 dígitos que comience con 9.');
      return;
    }

    updateProfile({
      name,
      emailOrPhone,
      phone: cleaned,
    });
    setShowProfileModal(false);
  };

  const getRoleBadge = () => {
    if (user.role === 'ADMIN') return { label: 'Administrador (Dueño)', bg: 'bg-emerald-100 text-emerald-800' };
    if (user.role === 'CAJERO') return { label: 'Cajero', bg: 'bg-blue-100 text-blue-800' };
    return { label: 'Repositor de Inventario', bg: 'bg-purple-100 text-purple-800' };
  };

  const roleInfo = getRoleBadge();

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-xl border border-slate-100 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-emerald-700 text-white font-black text-sm flex items-center justify-center shadow-xs">
              {user.avatar || user.name[0]}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{user.name}</h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleInfo.bg} inline-block mt-0.5`}>
                {roleInfo.label}
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowProfileModal(false)}
            className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* MÓDULO: ID DE USUARIO (Mi Cuenta) */}
        <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200/90 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-emerald-900 tracking-wider flex items-center gap-1.5">
              <Fingerprint className="w-3.5 h-3.5 text-emerald-700" />
              ID Único de Usuario
            </span>
            <span className="text-[10px] text-emerald-700 font-semibold">
              6 caracteres
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-emerald-200 shadow-2xs">
            <span className="font-mono text-base font-black tracking-widest text-slate-900 select-all">
              {user.userId}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 ${
                copied 
                  ? 'bg-emerald-700 text-white' 
                  : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '¡Copiado!' : 'Copiar ID'}</span>
            </button>
          </div>

          <p className="text-[11px] text-emerald-950 leading-snug">
            Comparte este ID con el dueño de un negocio para que te invite a su equipo directamente sin escribir tus datos manuales.
          </p>
        </div>

        {/* MÓDULO: MIS TIENDAS (Agregar otra tienda) */}
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-emerald-800" />
              Mis tiendas vinculadas
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {userStores.length} {userStores.length === 1 ? 'tienda' : 'tiendas'}
            </span>
          </div>

          {userStores.length > 0 && (
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {userStores.map(st => {
                const isCurrent = st.storeId === user.storeId;
                return (
                  <div
                    key={st.storeId}
                    className={`p-2 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                      isCurrent
                        ? 'bg-emerald-50/70 border-emerald-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-bold text-slate-900 block truncate">
                        {st.storeName}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {st.isOwner ? 'Dueño' : st.role} • {st.storeType}
                      </span>
                    </div>
                    {isCurrent ? (
                      <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md shrink-0">
                        Activa
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          switchStore(st.storeId);
                          setShowProfileModal(false);
                        }}
                        className="text-[10px] font-bold text-emerald-800 hover:underline shrink-0"
                      >
                        Cambiar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => openAddStoreOnboarding()}
            className="w-full py-2 px-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all active:scale-98"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Agregar otra tienda</span>
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3.5">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">Nombre completo</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-emerald-600"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">Correo electrónico</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={emailOrPhone}
                onChange={e => setEmailOrPhone(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-emerald-600"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">Celular de contacto</label>
            <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-slate-50 focus-within:ring-2 focus-within:ring-emerald-600 focus-within:bg-white">
              <span className="px-3 py-2 text-xs font-bold text-slate-500 bg-slate-100 border-r border-slate-200 select-none flex items-center">
                +51
              </span>
              <input
                type="tel"
                inputMode="tel"
                maxLength={9}
                value={phone}
                onChange={e => setPhone(cleanPeruPhone(e.target.value))}
                placeholder="987654321"
                className="w-full px-3 py-2 text-xs font-mono font-semibold text-slate-800 bg-transparent focus:outline-hidden"
              />
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2 text-[11px] text-slate-600">
            <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Tus datos están protegidos y solo se usan para tu cuenta.</span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowProfileModal(false)}
              className="py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Guardar cambios</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

