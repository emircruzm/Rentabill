import React, { useState } from 'react';
import { 
  Store, 
  User, 
  Users, 
  Target, 
  Database, 
  HelpCircle, 
  Sparkles, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  Download, 
  Lock, 
  LogOut, 
  ShieldCheck, 
  Bell,
  Camera,
  Phone,
  Mail,
  AlertTriangle,
  RefreshCw,
  MessageCircle,
  Eye,
  Copy,
  Fingerprint,
  UserPlus,
  UserMinus,
  Clock,
  QrCode,
  Upload
} from 'lucide-react';
import { capacitorCamera } from '@platform/index';
import { uploadImageUseCase } from '@application/index';
import { useInventory } from '../context/InventoryContext';
import { UserRole, StoreConfig, TeamInvitation, TeamMember } from '../types';
import { formatPeruPhoneDisplay } from '../utils/formatters';

type SectionKey = 'negocio' | 'cuenta' | 'equipo' | 'metas' | 'datos' | 'ayuda';

export const AjustesView: React.FC = () => {
  const { 
    user, 
    storeInfo, 
    teamMembers, 
    settings,
    invitations,
    cancelInvitation,
    copyInvitation,
    copyUserId,
    setIncomingInvitation,
    setShowInvitationConfirmModal,
    updateProfile, 
    updateStoreInfo, 
    updateTeamMemberRole, 
    removeTeamMember, 
    setUserRole,
    isTestingRole,
    exitRoleTest,
    updateSettings, 
    downloadSalesExcel,
    setShowInviteModal,
    setShowLogoutModal,
    setShowProfileModal,
    setShowHelpModal,
    userStores,
    switchStore,
    setShowStoreSelectorModal,
    openAddStoreOnboarding,
    showToast 
  } = useInventory();

  const [activeSection, setActiveSection] = useState<SectionKey>('negocio');

  // Business editing
  const [editingStore, setEditingStore] = useState(false);
  const [storeName, setStoreName] = useState(storeInfo.name);
  const [storeType, setStoreType] = useState<StoreConfig['type']>(storeInfo.type);

  // Password change form
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmNewPass, setConfirmNewPass] = useState('');

  const [isUploadingQr, setIsUploadingQr] = useState(false);

  // B2: Estado para modal de cambio de rol de miembros
  const [roleChangeModal, setRoleChangeModal] = useState<{
    memberId: string;
    memberName: string;
    currentRole: UserRole;
    selectedRole: UserRole;
  } | null>(null);
  const [isChangingRole, setIsChangingRole] = useState(false);

  const handleOpenRoleChange = (member: TeamMember) => {
    if (member.isOwner) {
      showToast('Acción no permitida', 'alert', 'El propietario de la tienda tiene un rol fijo e inmutable.');
      return;
    }
    setRoleChangeModal({
      memberId: member.id,
      memberName: member.name,
      currentRole: member.role,
      selectedRole: member.role,
    });
  };

  const handleConfirmRoleChange = async () => {
    if (!roleChangeModal) return;
    const { memberId, currentRole, selectedRole, memberName } = roleChangeModal;

    if (currentRole === selectedRole) {
      setRoleChangeModal(null);
      return;
    }

    // Comprobación: No dejar la tienda sin ADMIN (B2)
    if (currentRole === 'ADMIN' && selectedRole !== 'ADMIN') {
      const adminCount = teamMembers.filter(m => m.role === 'ADMIN').length;
      if (adminCount <= 1) {
        showToast(
          'No se puede cambiar el rol',
          'alert',
          'La tienda debe tener al menos un Administrador activo. Asigna otro Administrador antes de degradar a este usuario.'
        );
        return;
      }
    }

    try {
      setIsChangingRole(true);
      await updateTeamMemberRole(memberId, selectedRole);
      setRoleChangeModal(null);
    } catch (err: any) {
      showToast('Error al cambiar rol', 'alert', err.message);
    } finally {
      setIsChangingRole(false);
    }
  };

  const handleSaveStore = (e: React.FormEvent) => {
    e.preventDefault();
    updateStoreInfo({
      name: storeName,
      type: storeType,
    });
    setEditingStore(false);
  };

  const handleUploadQrPhoto = async () => {
    try {
      setIsUploadingQr(true);
      const captured = await capacitorCamera.capturePhoto({
        quality: 90,
        prefix: `qr_store_${storeInfo.id || 'store'}`,
      });

      if (!captured) return;

      const publicUrl = await uploadImageUseCase('product-images', captured.fileName, captured.blob);

      if (publicUrl) {
        await updateStoreInfo({ qrImageUrl: publicUrl });
        showToast('Código QR guardado correctamente', 'success');
      }
    } catch (err: any) {
      console.error('Error al subir QR:', err);
      showToast('Error al subir código QR', 'alert', err.message);
    } finally {
      setIsUploadingQr(false);
    }
  };

  const handleRemoveQr = async () => {
    if (window.confirm('¿Seguro que deseas eliminar el código QR de cobro de tu tienda?')) {
      await updateStoreInfo({ qrImageUrl: '' });
      showToast('Código QR eliminado', 'info');
    }
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPass || newPass !== confirmNewPass) {
      showToast('Las contraseñas nuevas no coinciden', 'alert');
      return;
    }
    if (newPass.length < 4) {
      showToast('La nueva contraseña debe tener mínimo 4 caracteres', 'alert');
      return;
    }
    setShowPasswordChange(false);
    setCurrentPass('');
    setNewPass('');
    setConfirmNewPass('');
    showToast('Contraseña actualizada con éxito', 'success');
  };

  const sections: { id: SectionKey; label: string; icon: React.ReactNode; desc: string }[] = [
    { id: 'negocio', label: 'Mi negocio', icon: <Store className="w-4 h-4" />, desc: 'Nombre y giro comercial' },
    { id: 'cuenta', label: 'Mi cuenta', icon: <User className="w-4 h-4" />, desc: 'Tus datos y contraseña' },
    { id: 'equipo', label: 'Mi equipo', icon: <Users className="w-4 h-4" />, desc: 'Cajeros, repositores y permisos' },
    { id: 'metas', label: 'Metas y avisos', icon: <Target className="w-4 h-4" />, desc: 'Objetivo de ganancia y alertas' },
    { id: 'datos', label: 'Mis datos', icon: <Database className="w-4 h-4" />, desc: 'Descargar ventas y reportes' },
    { id: 'ayuda', label: 'Ayuda y guía', icon: <HelpCircle className="w-4 h-4" />, desc: 'Cómo usar la app y soporte' },
  ];

  return (
    <div className="space-y-4 pb-36 max-w-md mx-auto px-4 pt-2">
      {/* Header card */}
      <div className="p-4 rounded-3xl bg-white border border-slate-100 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-800 text-white font-black text-base flex items-center justify-center shadow-xs shrink-0">
            {user.avatar || user.name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black text-slate-900 leading-tight">
                {user.name}
              </h2>
              <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                user.role === 'ADMIN' ? 'bg-emerald-100 text-emerald-800' :
                user.role === 'CAJERO' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
              }`}>
                {user.role === 'ADMIN' ? 'Administrador' : user.role === 'CAJERO' ? 'Cajero' : 'Repositor'}
              </span>
            </div>
            {/* ID alfanumérico debajo del nombre */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-mono font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                ID: {user.userId}
              </span>
              <button
                type="button"
                onClick={() => copyUserId()}
                className="text-[10px] font-bold text-emerald-800 hover:text-emerald-900 flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-md transition-colors shadow-2xs"
                title="Copiar ID para recibir invitaciones"
              >
                <Copy className="w-3 h-3" />
                <span>Copiar ID</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 truncate mt-1">
              {storeInfo.name} • {storeInfo.type}
            </p>
          </div>
        </div>
      </div>

      {/* Banner de Modo de Prueba en Ajustes */}
      {(user.role !== 'ADMIN' || isTestingRole) && (
        <div className="p-3.5 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-between gap-2 shadow-xs border border-amber-500">
          <div className="flex items-center gap-2 min-w-0">
            <Eye className="w-5 h-5 text-slate-950 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-black block truncate">
                Probando como {user.role === 'CAJERO' ? 'Cajero' : 'Repositor'}
              </span>
              <span className="text-[11px] font-medium text-slate-900 block leading-tight truncate">
                Viendo la app con permisos restringidos
              </span>
            </div>
          </div>
          <button
            onClick={exitRoleTest}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-900 text-amber-300 hover:text-white font-black text-xs shadow-2xs flex items-center gap-1 transition-all active:scale-95"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>Salir de prueba</span>
          </button>
        </div>
      )}

      {/* Horizontal Category Nav */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {sections.map(sec => (
          <button
            key={sec.id}
            onClick={() => setActiveSection(sec.id)}
            className={`px-3 py-2 rounded-2xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all shrink-0 ${
              activeSection === sec.id
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/80'
            }`}
          >
            <span>{sec.icon}</span>
            <span>{sec.label}</span>
          </button>
        ))}
      </div>

      {/* 1. SECCIÓN: MI NEGOCIO */}
      {activeSection === 'negocio' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Datos de tu negocio</h3>
              <p className="text-xs text-slate-500">Configura el nombre y giro de tu tienda</p>
            </div>
            {!editingStore ? (
              <button
                onClick={() => setEditingStore(true)}
                className="text-xs font-bold text-emerald-800 hover:text-emerald-900 flex items-center gap-1"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>
            ) : (
              <button
                onClick={() => setEditingStore(false)}
                className="text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
            )}
          </div>

          {editingStore ? (
            <form onSubmit={handleSaveStore} className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">Nombre del negocio</label>
                <input
                  type="text"
                  value={storeName}
                  onChange={e => setStoreName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">Tipo de negocio</label>
                <select
                  value={storeType}
                  onChange={e => setStoreType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:border-emerald-600 focus:outline-hidden"
                >
                  <option value="Abarrotes">Abarrotes / Tiendita</option>
                  <option value="Ropa">Ropa y Calzado</option>
                  <option value="Farmacia">Farmacia / Botica</option>
                  <option value="Ferretería">Ferretería</option>
                  <option value="Otro">Otro Comercio</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-xs"
              >
                Guardar cambios del negocio
              </button>
            </form>
          ) : (
            <div className="space-y-2">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Nombre</span>
                  <span className="text-xs font-black text-slate-900">{storeInfo.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Giro comercial</span>
                  <span className="text-xs font-bold text-slate-700">{storeInfo.type}</span>
                </div>
              </div>
            </div>
          )}

          {/* Mis tiendas / Agregar otra tienda */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/90 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-emerald-800" />
                <span className="text-xs font-black text-slate-900">Mis tiendas y sucursales</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                {userStores.length} {userStores.length === 1 ? 'tienda' : 'tiendas'}
              </span>
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed">
              Cada tienda tiene su propio inventario, caja y ventas separados en la base de datos. Puedes alternar entre ellas en cualquier momento.
            </p>

            <div className="space-y-1.5 pt-1">
              {userStores.map(st => {
                const isCurrent = st.storeId === user.storeId;
                return (
                  <div 
                    key={st.storeId} 
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs ${
                      isCurrent 
                        ? 'bg-white border-emerald-500 shadow-2xs font-bold text-slate-900' 
                        : 'bg-white/60 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                        isCurrent ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {st.storeName ? st.storeName[0].toUpperCase() : 'T'}
                      </div>
                      <div className="min-w-0">
                        <span className="truncate block leading-tight">{st.storeName}</span>
                        <span className="text-[9px] text-slate-400 font-normal">
                          {st.isOwner ? '👑 Dueño' : st.role} • {st.storeType}
                        </span>
                      </div>
                    </div>
                    {isCurrent ? (
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md shrink-0">
                        Activa
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => switchStore(st.storeId)}
                        className="text-[10px] font-bold text-emerald-800 hover:underline shrink-0"
                      >
                        Cambiar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Botón destacado: Agregar otra tienda */}
            <button
              type="button"
              onClick={() => openAddStoreOnboarding()}
              className="w-full mt-2 py-2.5 px-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all active:scale-98"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Agregar otra tienda (nueva base de datos)</span>
            </button>
          </div>
        </div>

        {/* Mi código QR de cobro */}
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-800" />
                <span>Mi código QR de cobro</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Muestra este código a tus clientes al cobrar con QR (Yape, Plin, cuenta bancaria, etc.)
              </p>
            </div>
          </div>

          {storeInfo.qrImageUrl ? (
            <div className="space-y-3">
              <div className="relative group max-w-xs mx-auto">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center space-y-2">
                  <img 
                    src={storeInfo.qrImageUrl} 
                    alt="Código QR de la tienda" 
                    className="w-52 h-52 max-w-[220px] max-h-[220px] object-contain mx-auto rounded-xl bg-white p-2 border border-slate-200 shadow-2xs"
                  />
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-700 font-bold">
                    <Check className="w-3.5 h-3.5" />
                    <span>QR activo para cobros en caja</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleUploadQrPhoto}
                  disabled={isUploadingQr}
                  className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{isUploadingQr ? 'Subiendo...' : 'Cambiar imagen'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRemoveQr}
                  disabled={isUploadingQr}
                  className="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar QR</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div 
                onClick={handleUploadQrPhoto}
                className="border-2 border-dashed border-slate-200 hover:border-emerald-500 rounded-2xl p-6 text-center cursor-pointer transition-all bg-slate-50/50 hover:bg-emerald-50/30 group"
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                  <QrCode className="w-6 h-6" />
                </div>
                <h4 className="text-xs font-bold text-slate-800">
                  {isUploadingQr ? 'Subiendo código QR...' : 'Toca para subir tu código QR'}
                </h4>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto mt-1 leading-relaxed">
                  Toma una foto de tu QR o elígelo de tu galería. Se mostrará en pantalla al cobrar con QR.
                </p>
                <button
                  type="button"
                  disabled={isUploadingQr}
                  className="mt-3 px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs inline-flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{isUploadingQr ? 'Subiendo a Supabase...' : 'Subir foto o captura'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
        </div>
      )}

      {/* 2. SECCIÓN: MI CUENTA */}
      {activeSection === 'cuenta' && (
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Tu cuenta personal</h3>
              <p className="text-xs text-slate-500">Datos de acceso y seguridad</p>
            </div>
            <button
              onClick={() => setShowProfileModal(true)}
              className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold hover:bg-emerald-100"
            >
              Editar datos
            </button>
          </div>

          <div className="space-y-2">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Nombre</span>
                  <span className="text-xs font-bold text-slate-900">{user.name}</span>
                </div>
              </div>
            </div>

            {/* MÓDULO: ID DE USUARIO (Mi Cuenta) */}
            <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200/90 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-emerald-900 tracking-wider flex items-center gap-1.5">
                  <Fingerprint className="w-3.5 h-3.5 text-emerald-700" />
                  ID Único de Usuario
                </span>
                <span className="text-[10px] text-emerald-700 font-semibold">
                  Alfanumérico (6 caracteres)
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-emerald-200 shadow-2xs">
                <span className="font-mono text-base font-black tracking-widest text-slate-900 select-all">
                  {user.userId}
                </span>
                <button
                  type="button"
                  onClick={() => copyUserId()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs active:scale-95"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar ID</span>
                </button>
              </div>

              <p className="text-[11px] text-emerald-950 leading-snug">
                Este ID es tu identificador único que compartirás con el dueño de una bodega para ser invitado al equipo sin escribir tus datos manualmente.
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3">
              <Mail className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Correo o usuario</span>
                <span className="text-xs font-bold text-slate-900">{user.emailOrPhone}</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3">
              <Phone className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Teléfono</span>
                <span className="text-xs font-bold text-slate-900">{user.phone || 'No registrado'}</span>
              </div>
            </div>

            {/* MÓDULO: MIS TIENDAS (Mi Cuenta) */}
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/90 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-emerald-900 tracking-wider flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-emerald-700" />
                  Mis tiendas vinculadas
                </span>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                  {userStores.length} {userStores.length === 1 ? 'tienda' : 'tiendas'}
                </span>
              </div>

              <div className="space-y-1.5">
                {userStores.map(st => {
                  const isCurrent = st.storeId === user.storeId;
                  return (
                    <div 
                      key={st.storeId} 
                      className={`flex items-center justify-between p-2 rounded-xl border text-xs ${
                        isCurrent 
                          ? 'bg-white border-emerald-500 shadow-2xs font-bold text-slate-900' 
                          : 'bg-white/70 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
                          isCurrent ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {st.storeName ? st.storeName[0].toUpperCase() : 'T'}
                        </div>
                        <div className="min-w-0">
                          <span className="truncate block text-xs">{st.storeName}</span>
                          <span className="text-[9px] text-slate-400 font-normal">
                            {st.isOwner ? '👑 Dueño' : st.role}
                          </span>
                        </div>
                      </div>
                      {isCurrent ? (
                        <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md shrink-0">
                          Activa
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowStoreSelectorModal(true)}
                          className="text-[10px] font-bold text-emerald-800 hover:underline shrink-0"
                        >
                          Cambiar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => openAddStoreOnboarding()}
                className="w-full mt-1 py-2 px-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all active:scale-98"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Agregar otra tienda</span>
              </button>
            </div>
          </div>

          {/* Cambiar contraseña */}
          <div className="pt-2 border-t border-slate-100">
            {!showPasswordChange ? (
              <button
                onClick={() => setShowPasswordChange(true)}
                className="w-full py-2.5 px-3 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Cambiar mi contraseña</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            ) : (
              <form onSubmit={handleChangePassword} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <h4 className="text-xs font-bold text-slate-900">Nueva contraseña</h4>
                <input
                  type="password"
                  placeholder="Contraseña actual"
                  value={currentPass}
                  onChange={e => setCurrentPass(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white"
                />
                <input
                  type="password"
                  required
                  placeholder="Nueva contraseña"
                  value={newPass}
                  onChange={e => setNewPass(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white"
                />
                <input
                  type="password"
                  required
                  placeholder="Confirmar nueva contraseña"
                  value={confirmNewPass}
                  onChange={e => setConfirmNewPass(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white"
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowPasswordChange(false)}
                    className="px-3 py-1 text-xs font-bold text-slate-500"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 rounded-lg bg-emerald-800 text-white text-xs font-bold"
                  >
                    Actualizar clave
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Botón cerrar sesión */}
          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={() => setShowLogoutModal(true)}
              className="w-full py-2.5 px-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Cerrar sesión en este dispositivo</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. SECCIÓN: MI EQUIPO (ROLES & PERMISOS) */}
      {activeSection === 'equipo' && (
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Equipo de tu tienda</h3>
              <p className="text-xs text-slate-500">Quién puede cobrar y quién puede surtir</p>
            </div>
            {user.role === 'ADMIN' && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="px-3 py-1.5 rounded-xl bg-emerald-800 text-white text-xs font-bold hover:bg-emerald-900 flex items-center gap-1.5 shadow-2xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Invitar</span>
              </button>
            )}
          </div>

          {/* SIMULADOR DE ROL (Interactivo para probar la app) */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200/90 space-y-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-800" />
              <span className="text-xs font-bold text-emerald-950">
                Prueba cómo ve la app cada empleado:
              </span>
            </div>
            <p className="text-[11px] text-emerald-900 leading-snug">
              Toca un rol para experimentar en vivo cómo se protegen las ganancias y cómo cambia la barra inferior:
            </p>
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <button
                onClick={() => setUserRole('ADMIN')}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-bold text-center transition-all ${
                  user.role === 'ADMIN'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-white text-emerald-900 border border-emerald-300 hover:bg-emerald-100'
                }`}
              >
                Admin (Todo)
              </button>
              <button
                onClick={() => setUserRole('CAJERO')}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-bold text-center transition-all ${
                  user.role === 'CAJERO'
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'bg-white text-blue-900 border border-blue-300 hover:bg-blue-100'
                }`}
              >
                Cajero (Solo Vender)
              </button>
              <button
                onClick={() => setUserRole('REPOSITOR')}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-bold text-center transition-all ${
                  user.role === 'REPOSITOR'
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'bg-white text-purple-900 border border-purple-300 hover:bg-purple-100'
                }`}
              >
                Repositor (Almacén)
              </button>
            </div>

            {/* Botón para salir de la prueba */}
            {(user.role !== 'ADMIN' || isTestingRole) && (
              <div className="pt-2 border-t border-emerald-200/80 flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-950">
                  ⚠️ Viendo como {user.role === 'CAJERO' ? 'Cajero' : 'Repositor'}
                </span>
                <button
                  type="button"
                  onClick={exitRoleTest}
                  className="px-2.5 py-1 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-[11px] flex items-center gap-1 shadow-2xs transition-all active:scale-95"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Salir de prueba</span>
                </button>
              </div>
            )}
          </div>

          {/* 1. Lista de Miembros Activos */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 block">
                Miembros Activos ({teamMembers.length})
              </span>
              <span className="text-[10px] text-slate-400 font-medium">Con acceso al changarro</span>
            </div>

            {teamMembers.map(member => {
              const isCurrentUser = member.contact === user.emailOrPhone || member.name.includes('(Tú)');

              const getRoleTag = (r: UserRole) => {
                if (r === 'ADMIN') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
                if (r === 'CAJERO') return 'bg-blue-100 text-blue-800 border-blue-200';
                return 'bg-purple-100 text-purple-800 border-purple-200';
              };

              return (
                <div
                  key={member.id}
                  className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black text-slate-900">{member.name}</span>
                        {member.isOwner && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                            👑 Propietario
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRoleTag(member.role)}`}>
                          {member.role === 'ADMIN' ? 'Admin' : member.role === 'CAJERO' ? 'Cajero' : 'Repositor'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        {member.contact} • Ingreso: {member.addedDate}
                      </span>
                    </div>

                    {user.role === 'ADMIN' && !isCurrentUser && !member.isOwner && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Botón Cambiar Rol (B2) */}
                        <button
                          type="button"
                          onClick={() => handleOpenRoleChange(member)}
                          className="py-1 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold flex items-center gap-1 transition-colors"
                          title="Cambiar el rol de este miembro"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Cambiar rol</span>
                        </button>

                        {/* Botón Remover Acceso */}
                        <button
                          type="button"
                          onClick={() => removeTeamMember(member.id)}
                          className="py-1 px-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold flex items-center gap-1 transition-colors"
                          title="Remover acceso de este empleado a la tienda"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Modal interactivo de Cambiar Rol (B2) */}
          {roleChangeModal && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="w-full max-w-sm bg-white rounded-3xl p-5 space-y-4 shadow-2xl border border-slate-100">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      Cambiar rol de empleado
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Miembro: <strong className="text-slate-800">{roleChangeModal.memberName}</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => setRoleChangeModal(null)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">
                    Selecciona el nuevo rol:
                  </label>

                  <div className="grid grid-cols-1 gap-2">
                    {[
                      {
                        role: 'CAJERO' as UserRole,
                        title: 'Cajero',
                        desc: 'Solo cobra en mostrador. No ve ganancias ni ajustes.',
                        badge: 'Venta',
                      },
                      {
                        role: 'REPOSITOR' as UserRole,
                        title: 'Repositor',
                        desc: 'Registra mercancía y stock. No ve reportes financieros.',
                        badge: 'Almacén',
                      },
                      {
                        role: 'ADMIN' as UserRole,
                        title: 'Administrador',
                        desc: 'Acceso total a finanzas, inventario, precios y equipo.',
                        badge: 'Total',
                      },
                    ].map(opt => {
                      const isSelected = roleChangeModal.selectedRole === opt.role;
                      return (
                        <button
                          key={opt.role}
                          type="button"
                          onClick={() => setRoleChangeModal({ ...roleChangeModal, selectedRole: opt.role })}
                          className={`p-3 rounded-2xl text-left border transition-all flex items-start justify-between gap-2 ${
                            isSelected
                              ? 'border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black text-slate-900">{opt.title}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                {opt.badge}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-tight">
                              {opt.desc}
                            </p>
                          </div>
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 shrink-0 ${
                            isSelected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'
                          }`}>
                            {isSelected && <span className="text-[10px] font-bold">✓</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Advertencia obligatoria para ADMIN (B2) */}
                {roleChangeModal.selectedRole === 'ADMIN' && (
                  <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 space-y-1 animate-in fade-in">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>Advertencia de Acceso Total</span>
                    </div>
                    <p className="text-[11px] text-amber-900 leading-snug">
                      Este usuario tendrá acceso total al negocio, incluyendo finanzas, inventario y gestión de usuarios.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRoleChangeModal(null)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmRoleChange}
                    disabled={isChangingRole}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                  >
                    {isChangingRole ? 'Guardando...' : 'Confirmar Rol'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. Lista de Invitaciones Pendientes */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 block">
                  Invitaciones Pendientes ({invitations.filter(i => i.status !== 'Usada').length})
                </span>
                <span className="text-[10px] text-slate-400">
                  Esperando a que la persona acepte desde su cuenta
                </span>
              </div>
              {user.role === 'ADMIN' && (
                <button
                  type="button"
                  onClick={() => setShowInviteModal(true)}
                  className="text-xs font-bold text-emerald-800 hover:text-emerald-900 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nueva invitación</span>
                </button>
              )}
            </div>

            {invitations.filter(i => i.status !== 'Usada').length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 text-center text-slate-400 text-xs">
                <span>No tienes invitaciones pendientes en este momento.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {invitations.filter(i => i.status !== 'Usada').map(inv => {
                  const getStatusTag = (status: TeamInvitation['status']) => {
                    if (status === 'Esperando') {
                      return 'bg-amber-100 text-amber-800 border-amber-300';
                    }
                    if (status === 'Rechazada') {
                      return 'bg-rose-100 text-rose-700 border-rose-300';
                    }
                    if (status === 'Vencido') {
                      return 'bg-slate-100 text-slate-600 border-slate-300';
                    }
                    return 'bg-emerald-100 text-emerald-800 border-emerald-300';
                  };

                  const getRoleBadgeStyle = (r: UserRole) => {
                    if (r === 'CAJERO') return 'bg-blue-100 text-blue-800 border-blue-200';
                    if (r === 'REPOSITOR') return 'bg-purple-100 text-purple-800 border-purple-200';
                    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
                  };

                  return (
                    <div
                      key={inv.id}
                      className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2.5 transition-all"
                    >
                      {/* Top: Name/ID, Role, Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-black text-slate-900 truncate">
                              {inv.userName}
                            </span>
                            <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded-sm border border-slate-200">
                              ID: {inv.userId}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 block mt-0.5 truncate">
                            {inv.userPhone} • {inv.userEmail}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <div className="text-right shrink-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border inline-block ${getStatusTag(inv.status)}`}>
                            {inv.status}
                          </span>
                        </div>
                      </div>

                      {/* Middle: Role assigned */}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                        <span className="text-[11px] text-slate-500">Rol asignado:</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${getRoleBadgeStyle(inv.role)}`}>
                          {inv.role === 'ADMIN' ? 'Administrador' : inv.role === 'CAJERO' ? 'Cajero' : 'Repositor'}
                        </span>
                      </div>

                      {/* Acciones: Copiar invitación y Cancelar invitación */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => copyInvitation(inv.id)}
                          className="flex-1 py-1.5 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                          title="Copiar texto con datos de invitación"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar invitación</span>
                        </button>

                        {inv.status === 'Esperando' && (
                          <button
                            type="button"
                            onClick={() => cancelInvitation(inv.id)}
                            className="py-1.5 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                            title="Cancelar y eliminar esta invitación"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Cancelar invitación</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Explicación simple de roles */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5 text-[11px] text-slate-600">
            <span className="font-bold text-slate-800 block">¿Qué puede ver cada rol?</span>
            <p>• <strong>Cajero:</strong> Solo cobra en mostrador. No ve las ganancias totales ni los ajustes.</p>
            <p>• <strong>Repositor:</strong> Registra mercancía y stock. No ve reportes financieros.</p>
            <p>• <strong>Admin:</strong> Control total, reportes, invitaciones y cambios de precio.</p>
          </div>
        </div>
      )}

      {/* 4. SECCIÓN: METAS Y NOTIFICACIONES */}
      {activeSection === 'metas' && (
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-4 animate-in fade-in">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">Metas y avisos de tu tienda</h3>
            <p className="text-xs text-slate-500">Recibe alertas automáticas para no perder dinero</p>
          </div>

          <div className="space-y-4">
            {/* Meta diaria de ganancia */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Meta diaria de ganancia sobre lo invertido
                </label>
                <span className="text-xs font-mono font-bold text-emerald-800">
                  {settings.dailyProfitGoal}% diario
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="5.0"
                step="0.1"
                value={settings.dailyProfitGoal}
                onChange={e => updateSettings({ dailyProfitGoal: parseFloat(e.target.value) })}
                className="w-full accent-emerald-700 cursor-pointer"
              />
              <span className="text-[11px] text-slate-400 block">
                Te avisaremos cuando tu tienda alcance o supere este porcentaje diario.
              </span>
            </div>

            {/* Aviso de productos lentos */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Avisar si un producto lleva sin venderse más de:
                </label>
                <span className="text-xs font-bold text-slate-900">
                  {settings.warnSlowDays} días
                </span>
              </div>
              <div className="flex items-center gap-2">
                {[7, 15, 30].map(days => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => updateSettings({ warnSlowDays: days })}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      settings.warnSlowDays === days
                        ? 'bg-emerald-800 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {days} días
                  </button>
                ))}
              </div>
            </div>

            {/* Aviso de stock bajo */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Avisar cuando queden menos de:
                </label>
                <span className="text-xs font-bold text-slate-900">
                  {settings.warnLowStock} unidades
                </span>
              </div>
              <div className="flex items-center gap-2">
                {[5, 10, 20].map(qty => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => updateSettings({ warnLowStock: qty })}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      settings.warnLowStock === qty
                        ? 'bg-emerald-800 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {qty} u.
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. SECCIÓN: MIS DATOS */}
      {activeSection === 'datos' && (
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-4 animate-in fade-in">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">Descarga y respaldo de datos</h3>
            <p className="text-xs text-slate-500">Tu información siempre te pertenece y está protegida</p>
          </div>

          <div className="space-y-3">
            {/* Descargar Excel / CSV */}
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-2">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-800" />
                <span className="text-xs font-bold text-emerald-950">Descargar reporte de productos y ventas</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">
                Obtén un archivo para abrir en Excel o imprimir con precios de compra, venta, ganancias y stock actual.
              </p>
              <button
                onClick={downloadSalesExcel}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar archivo para Excel (CSV)</span>
              </button>
            </div>

            {/* Respaldo automático */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 block">Copia de seguridad en la nube</span>
                <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 mt-0.5">
                  <Check className="w-3 h-3" /> Última copia guardada hace unos minutos
                </span>
              </div>
              <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                Activada
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 6. SECCIÓN: AYUDA */}
      {activeSection === 'ayuda' && (
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-4 animate-in fade-in">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">Ayuda para tu changarro</h3>
            <p className="text-xs text-slate-500">Respuestas claras y asistencia inmediata</p>
          </div>

          <div className="space-y-2.5">
            <button
              onClick={() => setShowHelpModal(true)}
              className="w-full p-3 rounded-2xl border border-slate-200 text-left hover:bg-slate-50 flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <HelpCircle className="w-4 h-4 text-emerald-800" />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Guía visual en 3 pasos</span>
                  <span className="text-[11px] text-slate-500">Aprende lo básico en 1 minuto</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              onClick={() => setShowHelpModal(true)}
              className="w-full p-3 rounded-2xl border border-slate-200 text-left hover:bg-slate-50 flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Preguntas frecuentes</span>
                  <span className="text-[11px] text-slate-500">¿Por qué dice estimado? ¿Qué es dinero parado?</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 space-y-2">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-800" />
                <span className="text-xs font-bold text-emerald-950">Atención personalizada</span>
              </div>
              <p className="text-[11px] text-slate-600">
                ¿Necesitas ayuda para dar de alta tus productos o tienes alguna falla? Escríbenos directamente.
              </p>
              <button
                onClick={() => {
                  showToast('Conectando con el equipo de soporte Rentabill por WhatsApp...', 'info');
                }}
                className="w-full py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-2xs flex items-center justify-center gap-1.5"
              >
                <span>Enviar mensaje por WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
