import React from 'react';
import { Sparkles, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { useInventory } from '@application/index';

export const ToastNotification: React.FC = () => {
  const { toast, showToast } = useInventory();

  if (!toast) return null;

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
    calibration: <Sparkles className="w-5 h-5 text-amber-500 shrink-0 animate-spin" />,
    alert: <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />,
    info: <Info className="w-5 h-5 text-sky-600 shrink-0" />,
  };

  const bgStyles = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-950',
    calibration: 'bg-gradient-to-r from-emerald-900 to-teal-900 border-emerald-500/40 text-white shadow-xl',
    alert: 'bg-rose-50 border-rose-200 text-rose-950',
    info: 'bg-white border-slate-200 text-slate-800 shadow-md',
  };

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-sm transition-all duration-300 pointer-events-auto">
      <div className={`p-3.5 rounded-2xl border flex items-start gap-3 shadow-lg backdrop-blur-xs ${bgStyles[toast.type]}`}>
        {icons[toast.type]}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold leading-tight">{toast.message}</p>
          {toast.subtext && (
            <p className={`text-[11px] mt-0.5 leading-snug ${toast.type === 'calibration' ? 'text-emerald-100' : 'text-slate-500'}`}>
              {toast.subtext}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

