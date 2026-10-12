import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, MessageCircle, X, CheckCircle2, Sparkles, BookOpen } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';

interface FAQ {
  question: string;
  answer: string;
}

const FAQS: FAQ[] = [
  {
    question: '¿Por qué dice "Estimado" al registrar un producto nuevo?',
    answer: 'Cuando compras un producto por primera vez, no sabemos aún qué tan rápido lo compran tus clientes. Le ponemos una velocidad estimada. En cuanto registras sus primeras 5 ventas reales en mostrador, la app calcula sus números 100% reales automáticamente.',
  },
  {
    question: '¿Cómo sé si un producto me deja buena ganancia?',
    answer: 'Mira el porcentaje diario en verde (+%). Si te deja 1% o más al día, es un producto estrella porque tu dinero invertido regresa rápido con ganancia. Si está en rojo o dice "Dinero parado", significa que compraste de más o se vende muy lento.',
  },
  {
    question: '¿Puedo usar Rentabill sin conexión a internet?',
    answer: '¡Sí! Puedes seguir cobrando y registrando ventas en mostrador. Cuando tu teléfono o computadora vuelva a tener señal, se sincronizará automáticamente sin perder ningún centavo.',
  },
  {
    question: '¿Qué significa "Dinero parado"?',
    answer: 'Es el dinero que tienes invertido en mercancía que lleva muchos días en el mostrador o anaquel sin venderse. La app te sugiere combos o pequeños descuentos para que recuperes ese dinero en mano y compres cosas que se vendan más rápido.',
  },
  {
    question: '¿Cómo invito a mi cajero o ayudante de almacén?',
    answer: 'Ve a Ajustes > Mi equipo > "+ Invitar a alguien". Escribe su nombre y teléfono o correo, y dale el rol de Cajero (solo para cobrar) o Repositor (para registrar productos). Así tus números de ganancia se mantienen privados.',
  },
];

export const HelpTutorialModal: React.FC = () => {
  const { showHelpModal, setShowHelpModal, showToast } = useInventory();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [activeTab, setActiveTab] = useState<'tutorial' | 'faq'>('tutorial');

  if (!showHelpModal) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl p-5 max-w-md w-full space-y-4 shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Centro de Ayuda y Guía</h3>
              <p className="text-[11px] text-slate-500">Aprende a sacarle el máximo provecho a tu tienda</p>
            </div>
          </div>
          <button
            onClick={() => setShowHelpModal(false)}
            className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-bold">
          <button
            onClick={() => setActiveTab('tutorial')}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'tutorial' ? 'bg-white text-emerald-900 shadow-2xs' : 'text-slate-600'
            }`}
          >
            Guía en 3 pasos
          </button>
          <button
            onClick={() => setActiveTab('faq')}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'faq' ? 'bg-white text-emerald-900 shadow-2xs' : 'text-slate-600'
            }`}
          >
            Preguntas frecuentes
          </button>
        </div>

        {activeTab === 'tutorial' ? (
          <div className="space-y-3">
            {/* Step 1 */}
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-700 text-white font-black text-xs flex items-center justify-center">
                  1
                </span>
                <h4 className="text-xs font-black text-emerald-950">Anota lo que compraste</h4>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed pl-8">
                Cuando compres refrescos, jabón o latas para surtir tu tienda, anótalos con su precio de compra y a cómo los vas a dar.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/80 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-700 text-white font-black text-xs flex items-center justify-center">
                  2
                </span>
                <h4 className="text-xs font-black text-blue-950">Cobra en mostrador con un toque</h4>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed pl-8">
                En la pestaña <strong>"Vender"</strong>, toca el producto o escanea su código. La app te dice al instante cuánto cobrar y cuánto vuelto dar.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-700 text-white font-black text-xs flex items-center justify-center">
                  3
                </span>
                <h4 className="text-xs font-black text-amber-950">Mira tu Pulso de Salud</h4>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed pl-8">
                La app te avisa qué productos te dejan más dinero en el bolsillo y cuáles están "parados" para que no vuelvas a gastar en lo que no se vende.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-200/80 overflow-hidden bg-white"
                >
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full p-3 text-left flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-xs font-bold text-slate-900 leading-tight">
                      {faq.question}
                    </span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="p-3 pt-0 text-xs text-slate-600 bg-slate-50/50 border-t border-slate-100 leading-relaxed">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* WhatsApp or Contact Support Button */}
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
              <MessageCircle className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block">¿Tienes alguna duda?</span>
              <span className="text-[10px] text-slate-500">Estamos listos para ayudarte</span>
            </div>
          </div>
          <button
            onClick={() => {
              showToast('Conectando con soporte técnico por WhatsApp...', 'info', 'Horario de atención: Lun a Sáb de 8am a 8pm');
            }}
            className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-2xs flex items-center gap-1.5"
          >
            <span>WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  );
};
