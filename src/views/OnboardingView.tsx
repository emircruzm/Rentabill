import React, { useState } from 'react';
import { Store, Camera, Check, ArrowRight, ArrowLeft, UserPlus, Fingerprint, RefreshCw } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { StoreConfig } from '../types';

const STORE_TYPES: { id: StoreConfig['type']; label: string; icon: string }[] = [
  { id: 'Abarrotes', label: 'Abarrotes / Tiendita', icon: '🥫' },
  { id: 'Ropa', label: 'Ropa y Calzado', icon: '👕' },
  { id: 'Farmacia', label: 'Farmacia / Botica', icon: '💊' },
  { id: 'Ferretería', label: 'Ferretería / Tlapalería', icon: '🔨' },
  { id: 'Otro', label: 'Otro Comercio', icon: '🏪' },
];

const SUGGESTED_LOGOS = ['🏪', '🛒', '🍎', '🍞', '🥤', '🛍️', '💈', '🥑'];

export const OnboardingView: React.FC = () => {
  const { 
    completeOnboarding, 
    skipOnboardingForInvitation, 
    showToast, 
    loading,
    onboardingMode,
    cancelAddStoreOnboarding
  } = useInventory();

  const [storeName, setStoreName] = useState(onboardingMode === 'add_store' ? 'Mi Nueva Tienda' : 'Mi Bodega');
  const [storeType, setStoreType] = useState<StoreConfig['type']>('Abarrotes');
  const currency = 'PEN';
  const [selectedEmoji, setSelectedEmoji] = useState('🏪');
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomLogoUrl(reader.result as string);
        showToast('Foto cargada correctamente', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) {
      showToast('Escribe el nombre de tu negocio', 'alert');
      return;
    }

    try {
      setIsSubmitting(true);
      await completeOnboarding({
        name: storeName.trim(),
        type: storeType,
        logoUrl: customLogoUrl || selectedEmoji,
        currency,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBusy = loading || isSubmitting;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-8 max-w-md mx-auto">
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-5">
        {/* Botón arriba a la izquierda: retroceder ÚNICAMENTE en el apartado de agregar tienda */}
        {onboardingMode === 'add_store' && (
          <div className="flex items-center justify-between pb-1">
            <button
              type="button"
              onClick={cancelAddStoreOnboarding}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver</span>
            </button>
          </div>
        )}

        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 mb-1">
            <Store className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            {onboardingMode === 'add_store' ? 'Personaliza tu nueva tienda' : 'Personaliza tu tienda'}
          </h2>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            {onboardingMode === 'add_store'
              ? 'Configura el nombre y giro de tu nueva tienda o sucursal'
              : 'Solo toma unos segundos para que la app configure todo para tu negocio'}
          </p>
        </div>

        {/* ATAJO: ¿Tienes una invitación a un negocio? (Oculto en apartado agregar tienda) */}
        {onboardingMode !== 'add_store' && (
          <>
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-300/80 shadow-2xs space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-800 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-black text-slate-900 block leading-tight">
                    ¿Tienes una invitación a un negocio?
                  </span>
                  <p className="text-[11px] text-slate-600 leading-snug mt-0.5">
                    Si vas a ingresar como cajero o repositor, no necesitas crear una tienda.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={skipOnboardingForInvitation}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
              >
                <Fingerprint className="w-4 h-4" />
                <span>Omitir configuración y obtener mi ID</span>
              </button>
            </div>

            {/* Separador */}
            <div className="relative flex items-center py-0.5">
              <div className="grow border-t border-slate-200"></div>
              <span className="shrink mx-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                o configura tu propia tienda
              </span>
              <div className="grow border-t border-slate-200"></div>
            </div>
          </>
        )}

        <form onSubmit={handleContinue} className="space-y-4">
          {/* 1. Nombre del negocio */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">
              Nombre de tu negocio <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
              placeholder="Ej. Bodega Don Pepe, Abarrotes San Martín..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-emerald-600"
            />
          </div>

          {/* 2. Tipo de negocio */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Tipo de negocio
            </label>
            <div className="grid grid-cols-1 gap-2">
              {STORE_TYPES.map(type => (
                <button
                  type="button"
                  key={type.id}
                  onClick={() => setStoreType(type.id)}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                    storeType === type.id
                      ? 'bg-emerald-50/80 border-emerald-600 text-emerald-950 ring-1 ring-emerald-600 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{type.icon}</span>
                    <span className="text-xs font-bold">{type.label}</span>
                  </div>
                  {storeType === type.id && (
                    <div className="w-4 h-4 rounded-full bg-emerald-700 text-white flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Logo o foto del local (opcional) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                Logo o foto de tu local <span className="text-[10px] text-slate-400 font-normal">(opcional)</span>
              </label>
              <span className="text-[10px] text-slate-400">Tómale foto o elige un ícono</span>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-2xl shadow-2xs shrink-0 overflow-hidden">
                {customLogoUrl ? (
                  <img src={customLogoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <span>{selectedEmoji}</span>
                )}
              </div>

              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {SUGGESTED_LOGOS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setSelectedEmoji(emoji);
                        setCustomLogoUrl(null);
                      }}
                      className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition-all ${
                        selectedEmoji === emoji && !customLogoUrl
                          ? 'bg-emerald-100 border border-emerald-600 scale-110'
                          : 'bg-white border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 hover:text-emerald-900 cursor-pointer pt-0.5">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Subir o tomar foto</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Botón Continuar */}
          <button
            type="submit"
            disabled={isBusy}
            className="w-full py-3.5 px-4 rounded-2xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-md shadow-emerald-900/20 active:scale-98 transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
          >
            {isBusy ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Configurando tu tienda en Supabase...</span>
              </>
            ) : (
              <>
                <span>{onboardingMode === 'add_store' ? 'Crear y entrar a mi nueva tienda' : 'Continuar a mi negocio'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
