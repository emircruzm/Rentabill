import React, { useState } from 'react';
import { TrendingUp, Lock, Mail, User, Phone, ArrowRight, Eye, EyeOff, CheckCircle2, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { supabase } from '../lib/supabase';
import { formatAuthError } from '../lib/authHelpers';

interface AuthViewProps {
  initialMode?: 'login' | 'register';
}

export const AuthView: React.FC<AuthViewProps> = ({ initialMode = 'login' }) => {
  const { login, registerUser, showToast } = useInventory();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  
  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // UI states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailConfirmationRequired, setEmailConfirmationRequired] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);

  // Forgot password modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotInput, setForgotInput] = useState('');
  const [isSendingForgot, setIsSendingForgot] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setErrorMessage('Por favor escribe tu correo y contraseña.');
      return;
    }

    try {
      setIsLoading(true);

      if (mode === 'register') {
        const cleanName = name.trim();
        if (!cleanName) {
          setErrorMessage('Por favor escribe tu nombre completo.');
          return;
        }
        if (cleanPassword !== confirmPassword.trim()) {
          setErrorMessage('Las contraseñas no coinciden. Verifícalas.');
          return;
        }
        if (cleanPassword.length < 6) {
          setErrorMessage('La contraseña debe tener al menos 6 caracteres.');
          return;
        }

        const res = await registerUser(cleanName, cleanEmail, cleanPassword, 'ADMIN', phone.trim() || undefined);
        
        if (!res.success) {
          setErrorMessage(res.error || 'No se pudo crear la cuenta.');
        } else if (res.requiresEmailConfirmation) {
          setEmailConfirmationRequired(true);
        }
      } else {
        const res = await login(cleanEmail, cleanPassword);
        if (!res.success) {
          setErrorMessage(res.error || 'No se pudo iniciar sesión.');
        }
      }
    } catch (err: any) {
      console.error('Error en autenticación:', err);
      setErrorMessage(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!email.trim()) return;
    try {
      setResendingEmail(true);
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      });
      if (error) throw error;
      showToast('Correo de confirmación reenviado con éxito', 'success');
    } catch (err: any) {
      showToast('Error al reenviar correo', 'alert', formatAuthError(err));
    } finally {
      setResendingEmail(false);
    }
  };

  const handleSendForgotPassword = async () => {
    if (!forgotInput.trim()) {
      showToast('Por favor escribe tu correo electrónico', 'alert');
      return;
    }

    try {
      setIsSendingForgot(true);
      const { error } = await supabase.auth.resetPasswordForEmail(forgotInput.trim());
      if (error) throw error;

      setShowForgotModal(false);
      showToast('Enlace de recuperación enviado', 'success', 'Revisa tu bandeja de entrada o spam.');
    } catch (err: any) {
      showToast('Error al enviar enlace', 'alert', formatAuthError(err));
    } finally {
      setIsSendingForgot(false);
    }
  };

  // If email confirmation is pending
  if (emailConfirmationRequired) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-8 max-w-md mx-auto">
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-800 mx-auto shadow-xs">
            <Mail className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              ¡Revisa tu correo!
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
              Te enviamos un enlace de confirmación a:
            </p>
            <p className="text-xs font-bold text-slate-800 bg-slate-100 py-1.5 px-3 rounded-lg inline-block">
              {email}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-left space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-950 font-bold text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Siguiente paso sencillo:</span>
            </div>
            <p className="text-[11px] text-emerald-900 leading-normal pl-6">
              Abre el correo en tu bandeja o carpeta de spam, presiona el botón de confirmación y luego regresa aquí para iniciar sesión.
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setEmailConfirmationRequired(false);
                setMode('login');
                setErrorMessage(null);
              }}
              className="w-full py-3 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-md shadow-emerald-900/20 active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              <span>Ya confirmé mi correo / Iniciar sesión</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleResendConfirmation}
              disabled={resendingEmail}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resendingEmail ? 'animate-spin text-emerald-600' : ''}`} />
              <span>{resendingEmail ? 'Reenviando...' : 'Reenviar correo de confirmación'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-8 max-w-md mx-auto">
      {/* Brand Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-800 text-white shadow-lg shadow-emerald-900/20 mb-3">
          <TrendingUp className="w-8 h-8 stroke-[2.5]" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Rentabill</h1>
        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
          El control fácil y sin enredos para el dinero y productos de tu negocio
        </p>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-5">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-lg font-black text-slate-900">
            {mode === 'register' ? 'Crear tu cuenta' : 'Iniciar sesión'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {mode === 'register' 
              ? 'Conectado a tu base de datos Supabase'
              : 'Bienvenido de vuelta a tu negocio'}
          </p>
        </div>

        {/* Error message banner */}
        {errorMessage && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2.5 text-xs animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span className="font-bold block">No se pudo continuar</span>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Nombre completo <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => {
                      setName(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Ej. Juan Pérez"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Teléfono / WhatsApp <span className="text-[10px] text-slate-400 font-normal">(opcional)</span>
                </label>
                <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-slate-50 focus-within:ring-2 focus-within:ring-emerald-600 focus-within:bg-white">
                  <span className="px-3 py-2.5 text-xs font-bold text-slate-500 bg-slate-100 border-r border-slate-200 select-none flex items-center">
                    +51
                  </span>
                  <input
                    type="tel"
                    inputMode="tel"
                    maxLength={9}
                    value={phone}
                    onChange={e => {
                      const cleaned = e.target.value.replace(/\D/g, '').slice(0, 9);
                      setPhone(cleaned);
                    }}
                    placeholder="Ej. 984512763"
                    className="w-full px-3 py-2.5 text-xs font-mono font-medium text-slate-800 bg-transparent placeholder:text-slate-400 focus:outline-hidden"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Número peruano de 9 dígitos que empieza con 9 (Ej. 984512763)
                </p>
              </div>
            </>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">
              Correo electrónico <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="ejemplo@correo.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-emerald-600"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 block">
                Contraseña <span className="text-rose-500">*</span>
              </label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => {
                    setForgotInput(email);
                    setShowForgotModal(true);
                  }}
                  className="text-[11px] font-semibold text-emerald-800 hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Mínimo 6 caracteres"
                className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-emerald-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                Confirmar contraseña <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={e => {
                    setConfirmPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Repite tu contraseña"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-emerald-600"
                />
              </div>
            </div>
          )}

          {/* Botón Principal */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-md shadow-emerald-900/20 active:scale-98 transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Conectando con Supabase...</span>
              </>
            ) : (
              <>
                <span>{mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Alternate Action Links */}
        <div className="pt-2 text-center border-t border-slate-100">
          {mode === 'register' ? (
            <p className="text-xs text-slate-600">
              ¿Ya tienes cuenta?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                }}
                className="font-bold text-emerald-800 hover:underline"
              >
                Inicia sesión
              </button>
            </p>
          ) : (
            <p className="text-xs text-slate-600">
              ¿No tienes cuenta?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMessage(null);
                }}
                className="font-bold text-emerald-800 hover:underline"
              >
                Crear cuenta nueva
              </button>
            </p>
          )}
        </div>
      </div>

      {/* Modal Olvidé Contraseña */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">Recuperar contraseña</h3>
            <p className="text-xs text-slate-500">
              Escribe tu correo registrado para recibir el enlace de restablecimiento.
            </p>
            <input
              type="email"
              value={forgotInput}
              onChange={e => setForgotInput(e.target.value)}
              placeholder="tu-correo@ejemplo.com"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:border-emerald-600 font-medium"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isSendingForgot}
                onClick={() => setShowForgotModal(false)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSendingForgot}
                onClick={handleSendForgotPassword}
                className="px-4 py-2 rounded-xl bg-emerald-800 text-white text-xs font-bold hover:bg-emerald-900 shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSendingForgot && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSendingForgot ? 'Enviando...' : 'Enviar enlace'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
