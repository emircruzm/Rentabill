import React from 'react';
import { Sparkles, CheckCircle, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';

export const CalibrationModal: React.FC = () => {
  const { calibrationEvent, dismissCalibrationModal, setActiveTab } = useInventory();

  if (!calibrationEvent) return null;

  const { product, previousSales, newSales, newVelocity } = calibrationEvent;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-emerald-100 text-center relative overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Glow background */}
        <div className="absolute -top-16 -left-16 w-36 h-36 bg-emerald-400/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-36 h-36 bg-teal-400/20 rounded-full blur-2xl pointer-events-none" />

        {/* Badge Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-600 flex items-center justify-center mb-4 shadow-inner">
          <Sparkles className="w-8 h-8 text-emerald-600 animate-bounce" />
        </div>

        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-xs border border-emerald-200 mb-2">
          <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          Hito de Madurez Alcanzado
        </span>

        <h3 className="text-xl font-bold text-slate-900 leading-snug">
          🎉 ¡Producto Calibrado!
        </h3>

        <p className="text-sm text-slate-600 mt-2">
          <strong className="text-slate-900 font-semibold">{product.name}</strong> ha alcanzado{' '}
          <span className="text-emerald-700 font-bold">{newSales} ventas</span> acumuladas y ahora utiliza{' '}
          <strong className="text-emerald-700 font-semibold">rentabilidad real</strong>.
        </p>

        {/* Transition comparison card */}
        <div className="mt-5 p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-left space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Estado del Dato:</span>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md border border-dashed border-slate-300 text-slate-500 bg-white text-[11px]">
                Estimado
              </span>
              <ArrowRight className="w-3 h-3 text-slate-400" />
              <span className="px-2 py-0.5 rounded-md border border-solid border-emerald-500 text-emerald-700 bg-emerald-50 font-semibold text-[11px] flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-emerald-600" />
                Real
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Velocidad Diaria:</span>
            <div className="flex items-center gap-1.5 font-mono text-slate-700">
              <span className="text-slate-400">estimada</span>
              <ArrowRight className="w-3 h-3 text-slate-400" />
              <span className="font-bold text-emerald-700 bg-emerald-100/60 px-1.5 py-0.5 rounded">
                {newVelocity} u/día real
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60">
            <span className="text-slate-500 font-medium">Certeza Financiera:</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> 100% Empírica
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={() => {
              dismissCalibrationModal();
              setActiveTab('inventario');
            }}
            className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-md shadow-emerald-600/20 transition-colors flex items-center justify-center gap-2"
          >
            <span>Ver en Inventario</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={dismissCalibrationModal}
            className="w-full py-2.5 px-4 rounded-xl text-slate-500 hover:bg-slate-100 text-xs font-medium transition-colors"
          >
            Continuar en Caja
          </button>
        </div>
      </div>
    </div>
  );
};
