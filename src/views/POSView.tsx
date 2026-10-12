import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Camera, 
  Trash2, 
  Plus, 
  Minus, 
  QrCode, 
  CreditCard, 
  Banknote, 
  CheckCircle2, 
  Sparkles, 
  ShoppingBag,
  ArrowRight,
  Zap,
  Clock,
  Package
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { executeBarcodeScan } from '../utils/barcodeScanner';
import { formatCurrency } from '../utils/formatters';

interface BulkScaleWidgetProps {
  productId: string;
  productName: string;
  quantity: number;
  salePrice: number;
  lineTotal: number;
  onUpdateQuantity: (val: number) => void;
  onSetQuantity: (val: number) => void;
}

const BulkScaleWidget: React.FC<BulkScaleWidgetProps> = ({
  productId,
  productName,
  quantity,
  salePrice,
  lineTotal,
  onUpdateQuantity,
  onSetQuantity
}) => {
  const [textValue, setTextValue] = React.useState<string>(quantity > 0 ? String(Number(quantity.toFixed(3))) : '');

  React.useEffect(() => {
    setTextValue(quantity > 0 ? String(Number(quantity.toFixed(3))) : '');
  }, [quantity]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(',', '.');
    if (raw === '' || /^[0-9]*\.?[0-9]*$/.test(raw)) {
      setTextValue(raw);
      const parsed = parseFloat(raw);
      if (!isNaN(parsed) && parsed > 0) {
        onSetQuantity(parsed);
      } else {
        onSetQuantity(0);
      }
    }
  };

  const handleBlur = () => {
    const parsed = parseFloat(textValue);
    if (isNaN(parsed) || parsed <= 0) {
      setTextValue('');
      onSetQuantity(0);
    } else {
      const normalized = parseFloat(parsed.toFixed(3));
      setTextValue(String(normalized));
      onSetQuantity(normalized);
    }
  };

  const handleClear = () => {
    setTextValue('');
    onSetQuantity(0);
  };

  const handleShortcut = (val: number) => {
    const current = parseFloat(textValue) || 0;
    const next = parseFloat((current + val).toFixed(3));
    setTextValue(String(next));
    onSetQuantity(next);
  };

  const isInvalid = !quantity || quantity <= 0;

  return (
    <div className={`p-2.5 rounded-2xl transition-colors space-y-2 ${
      isInvalid 
        ? 'bg-amber-50/80 border border-amber-300' 
        : 'bg-emerald-50/70 border border-emerald-200/80'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-bold text-xs">
          <span className="text-sm">⚖️</span>
          <span className={isInvalid ? 'text-amber-900' : 'text-emerald-950'}>Báscula Digital:</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`flex items-center gap-1 bg-white rounded-xl px-2 py-1 border shadow-2xs ${
            isInvalid ? 'border-amber-400 ring-1 ring-amber-300' : 'border-emerald-300'
          }`}>
            <input
              type="text"
              inputMode="decimal"
              value={textValue}
              onFocus={e => e.target.select()}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="0"
              className="w-16 font-mono font-black text-sm text-slate-900 text-right focus:outline-hidden bg-transparent placeholder:text-slate-300"
            />
            <span className="font-bold text-xs text-slate-700">kg</span>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="w-7 h-7 rounded-xl bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center text-xs font-bold transition-colors shadow-2xs"
            title="Borrar todo el peso"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-1 pt-0.5">
        <span className="text-[10px] text-slate-600 font-semibold">Atajos:</span>
        <div className="flex items-center gap-1">
          {[
            { label: '+100g', val: 0.1 },
            { label: '+250g', val: 0.25 },
            { label: '+500g', val: 0.5 },
            { label: '+1kg', val: 1.0 },
          ].map(chip => (
            <button
              key={chip.label}
              type="button"
              onClick={() => handleShortcut(chip.val)}
              className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[10px] font-bold text-slate-800 shadow-2xs transition-all active:scale-95"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="text-[11px] font-mono text-right font-medium">
        {quantity > 0 ? (
          <span className="text-emerald-900">
            {quantity.toFixed(3)} kg × {formatCurrency(salePrice)}/kg = <strong className="text-emerald-950 font-bold">{formatCurrency(lineTotal)}</strong>
          </span>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-amber-800 font-bold text-[10px]">⚠️ Falta ingresar el peso</span>
            <span className="text-slate-400 font-mono text-xs">{formatCurrency(0)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const POSView: React.FC = () => {
  const { 
    cart, 
    addToCart, 
    removeFromCart, 
    updateCartQuantity, 
    setCartQuantity,
    clearCart, 
    checkout, 
    products, 
    calculatedProducts,
    storeInfo,
    setActiveTab,
    showToast 
  } = useInventory();

  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'qr' | 'tarjeta'>('efectivo');
  const [cashGiven, setCashGiven] = useState<number>(20);
  const [posSearch, setPosSearch] = useState<string>('');
  const [showCatalogModal, setShowCatalogModal] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [saleConfirmation, setSaleConfirmation] = useState<{
    totalAmount: number;
    changeGiven: number;
    paymentMethod: 'efectivo' | 'qr' | 'tarjeta';
    itemCount: number;
  } | null>(null);

  // Cart total calculations
  const totalAmount = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.product.salePrice * item.quantity), 0);
  }, [cart]);

  // Validation for bulk items with 0 or empty weight (B6)
  const invalidWeightItem = useMemo(() => {
    return cart.find(item => !item.quantity || item.quantity <= 0);
  }, [cart]);
  const hasInvalidWeight = !!invalidWeightItem;

  // Validation for cart items exceeding stock (Bug 2)
  const invalidStockItem = useMemo(() => {
    return cart.find(item => {
      const prod = products.find(p => p.id === item.product.id);
      return prod ? item.quantity > prod.stock : false;
    });
  }, [cart, products]);
  const hasInvalidStock = !!invalidStockItem;

  // Live change calculation
  const liveChange = useMemo(() => {
    if (paymentMethod !== 'efectivo') return 0;
    return Math.max(0, cashGiven - totalAmount);
  }, [paymentMethod, cashGiven, totalAmount]);

  // Check if any product in the cart is about to reach the 5th sale ticket
  const calibrationPendingItem = useMemo(() => {
    return cart.find(item => {
      const prod = products.find(p => p.id === item.product.id);
      return prod && prod.status === 'ESTIMADO' && (prod.salesCount + 1 >= 5);
    });
  }, [cart, products]);

  // Handle Real Barcode Scan
  const handleScanBarcode = async () => {
    try {
      setIsScanning(true);
      const scannedCode = await executeBarcodeScan({
        onStatusChange: (status) => showToast(status, 'info'),
      });

      if (scannedCode) {
        const found = products.find(p => p.barcode === scannedCode);
        if (found) {
          if (found.stock <= 0) {
            showToast(`"${found.name}" está sin stock`, 'alert');
          } else {
            addToCart(found, 1);
            showToast(`"${found.name}" agregado al ticket`, 'success');
          }
        } else {
          showToast('Producto no encontrado', 'alert', `No hay ningún producto registrado con el código ${scannedCode}`);
        }
      }
    } catch (err: any) {
      console.error('Error al escanear en POS:', err);
      showToast('Error al escanear', 'alert', err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const handleCheckout = async () => {
    if (isProcessing) return;
    if (cart.length === 0) {
      showToast('No hay productos agregados para cobrar.', 'alert');
      return;
    }
    if (hasInvalidWeight) {
      showToast('Peso inválido', 'alert', 'Hay productos a granel sin peso asignado. Ingresa un peso válido mayor a 0 kg antes de cobrar.');
      return;
    }

    try {
      setIsProcessing(true);
      const currentTotal = totalAmount;
      const currentItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
      const result = await checkout(paymentMethod, paymentMethod === 'efectivo' ? cashGiven : totalAmount);
      if (result.success) {
        setSaleConfirmation({
          totalAmount: currentTotal,
          changeGiven: result.change,
          paymentMethod,
          itemCount: currentItemCount,
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4 pb-32 max-w-md mx-auto px-4 pt-2">
      {/* Barcode Search & Scan */}
      <div className="space-y-2">
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nombre o código EAN..."
              value={posSearch}
              onChange={e => setPosSearch(e.target.value)}
              className="w-full pl-9 pr-10 py-2.5 rounded-2xl bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-emerald-500 shadow-2xs"
            />
            {posSearch && (
              <button 
                onClick={() => setPosSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={handleScanBarcode}
            disabled={isScanning}
            className="p-2.5 rounded-2xl bg-emerald-800 text-white hover:bg-emerald-900 transition-colors shadow-xs flex items-center justify-center shrink-0 disabled:opacity-50"
            title="Escanear código de barras para venta"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Search Dropdown / Suggestions */}
        {posSearch.trim() !== '' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-lg max-h-48 overflow-y-auto space-y-1 z-20">
            {products
              .filter(p => p.name.toLowerCase().includes(posSearch.toLowerCase()) || p.barcode.includes(posSearch))
              .map(prod => (
                <div
                  key={prod.id}
                  onClick={() => {
                    addToCart(prod, 1);
                    setPosSearch('');
                  }}
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer text-xs gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {prod.imageUrl ? (
                      <img src={prod.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-xs">
                        📦
                      </div>
                    )}
                    <div className="min-w-0 truncate">
                      <span className="font-bold text-slate-900 block truncate">{prod.name}</span>
                      <span className="text-[10px] text-slate-400 block">{prod.barcode} • Cantidad: {prod.stock}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-bold text-emerald-800">{formatCurrency(prod.salePrice)}</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold text-[10px]">
                      + Agregar
                    </span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Validation in Progress Alert Banner (Key Microinteraction from Screenshot 3) */}
      {calibrationPendingItem && (
        <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-300 text-amber-950 space-y-2 shadow-xs animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
              ⭐
            </div>
            <div className="flex-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-800">
                ¡VALIDACIÓN EN CAMINO! 🎉
              </span>
              <p className="text-xs text-amber-900 leading-snug mt-0.5">
                Esta venta completará la calibración de{' '}
                <strong className="font-bold text-slate-900">{calibrationPendingItem.product.name}</strong> a{' '}
                <span className="font-bold text-emerald-800">Dato 100% Real</span>.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-800 pt-1 border-t border-amber-200">
            <div className="w-full bg-amber-200/80 h-1.5 rounded-full overflow-hidden mr-3">
              <div className="bg-emerald-600 h-full w-full animate-pulse" />
            </div>
            <span className="shrink-0 flex items-center gap-1 font-mono">
              <Sparkles className="w-3 h-3 text-amber-600" />
              +1.2 pts Puntaje de Salud
            </span>
          </div>
        </div>
      )}

      {/* Venta Actual Section */}
      <div className="p-4 rounded-3xl bg-white border border-slate-100 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Venta Actual</h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">
              {cart.length} {cart.length === 1 ? 'producto' : 'productos'}
            </span>
          </div>

          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="text-[11px] text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Vaciar</span>
            </button>
          )}
        </div>

        {/* Cart Item Rows */}
        <div className="divide-y divide-slate-100 space-y-1">
          {cart.length === 0 ? (
            <div className="py-8 text-center text-slate-400 space-y-2">
              <ShoppingBag className="w-8 h-8 mx-auto text-slate-300 stroke-[1.5]" />
              <p className="text-xs">No hay productos seleccionados en el ticket</p>
              <button
                type="button"
                onClick={handleScanBarcode}
                className="text-xs font-bold text-emerald-700 underline"
              >
                Escanear código de producto
              </button>
            </div>
          ) : (
            cart.map(item => {
              const prod = products.find(p => p.id === item.product.id) || item.product;
              const willCalibrate = prod.status === 'ESTIMADO' && (prod.salesCount + 1 >= 5);
              const isKg = (item.product.unit || '').toLowerCase() === 'kg';
              const lineTotal = Number((item.product.salePrice * item.quantity).toFixed(2));

              return (
                <div key={item.product.id} className="pt-3 pb-3 border-b border-slate-100 last:border-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {item.product.imageUrl ? (
                        <img 
                          src={item.product.imageUrl} 
                          alt="" 
                          className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0 shadow-2xs" 
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-base">
                          {isKg ? '⚖️' : '🛒'}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs font-bold text-slate-900 truncate">
                            {item.product.name}
                          </h4>
                          {isKg && (
                            <span className="px-1.5 py-0.2 rounded-md bg-emerald-100/90 text-emerald-900 border border-emerald-300 text-[10px] font-bold">
                              Por Kilo
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {prod.status === 'REAL' ? (
                            <span className="px-1.5 py-0.2 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-0.5">
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                              Real
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded-md bg-amber-50 text-amber-800 border border-dashed border-amber-300 text-[10px] font-medium flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5 text-amber-600" />
                              {prod.salesCount}/5 para validar
                            </span>
                          )}
                          <span className="text-[11px] font-mono text-slate-500">
                            {formatCurrency(item.product.salePrice)} / {item.product.unit || 'pza'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Line total & remove action */}
                    <div className="text-right flex items-center gap-2 shrink-0">
                      <span className="text-sm font-black font-mono text-slate-900 block">
                        {formatCurrency(lineTotal)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                        title="Quitar del ticket"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Advertencia de stock insuficiente por línea (Bug 2) */}
                  {item.quantity > prod.stock && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-between gap-2 text-xs animate-in fade-in">
                      <div className="text-amber-900 font-bold">
                        ⚠️ Solo hay {prod.stock} {prod.unit || 'u'} de {prod.name} en stock
                      </div>
                      <button
                        type="button"
                        onClick={() => setCartQuantity(item.product.id, prod.stock)}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] shrink-0 shadow-2xs transition-all active:scale-95"
                      >
                        Usar máximo ({prod.stock})
                      </button>
                    </div>
                  )}

                  {/* Quantity & Scale Control (B6) */}
                  {isKg ? (
                    <BulkScaleWidget
                      productId={item.product.id}
                      productName={item.product.name}
                      quantity={item.quantity}
                      salePrice={item.product.salePrice}
                      lineTotal={lineTotal}
                      onUpdateQuantity={(val) => updateCartQuantity(item.product.id, val)}
                      onSetQuantity={(val) => setCartQuantity(item.product.id, val)}
                    />
                  ) : (
                    /* Standard integer quantity buttons */
                    <div className="flex items-center justify-end gap-2">
                      <div className="flex items-center gap-1.5 bg-slate-50 rounded-xl p-1 border border-slate-100">
                        <button
                          type="button"
                          onClick={() => updateCartQuantity(item.product.id, -1)}
                          className="w-7 h-7 rounded-lg bg-white shadow-2xs hover:bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-xs active:scale-95"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-bold text-xs font-mono w-8 text-center text-slate-900">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCartQuantity(item.product.id, 1)}
                          className="w-7 h-7 rounded-lg bg-white shadow-2xs hover:bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-xs active:scale-95"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Payment & Live Change Calculator Section */}
      <div className="p-4 rounded-3xl bg-white border border-slate-100 shadow-xs space-y-4">
        {paymentMethod === 'efectivo' && (
          <div className="space-y-4 animate-in fade-in">
            {/* Total a Cobrar y Vuelto en Vivo (Bug 3: sin truncate, layout limpio) */}
            <div className="space-y-2">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider shrink-0">
                  Total a Cobrar
                </span>
                <div className={`font-black text-slate-900 font-mono tracking-tight whitespace-nowrap tabular-nums text-right ${
                  formatCurrency(totalAmount).length > 10 ? 'text-xl' : formatCurrency(totalAmount).length > 8 ? 'text-2xl' : 'text-3xl'
                }`}>
                  {formatCurrency(totalAmount)}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/60 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 shrink-0">
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  <span className="text-[11px] text-emerald-800 font-bold uppercase tracking-wider">
                    Vuelto en Vivo
                  </span>
                </div>
                <div className={`font-black text-emerald-700 font-mono tracking-tight whitespace-nowrap tabular-nums text-right ${
                  formatCurrency(liveChange).length > 10 ? 'text-xl' : formatCurrency(liveChange).length > 8 ? 'text-2xl' : 'text-2xl'
                }`}>
                  {formatCurrency(liveChange)}
                </div>
              </div>
            </div>

            {/* Quick cash denomination buttons (B8: Soles peruanos S/ 10, S/ 20, S/ 50, Exacto) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Paga con Efectivo</span>
                <span className="text-[11px] text-amber-800 font-bold">Billetes rápidos:</span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[10, 20, 50, 'Exacto'].map((val, idx) => {
                  const isSelected = val === 'Exacto' ? cashGiven === totalAmount : cashGiven === val;

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        if (val === 'Exacto') {
                          setCashGiven(totalAmount);
                        } else {
                          setCashGiven(Number(val));
                        }
                        setPaymentMethod('efectivo');
                      }}
                      className={`py-2 rounded-xl text-xs font-bold transition-all ${
                        isSelected
                          ? 'bg-emerald-800 text-white shadow-xs scale-102'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {val === 'Exacto' ? 'Exacto' : `S/ ${val}`}
                    </button>
                  );
                })}
              </div>

              {/* Custom cash input */}
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">S/</div>
                <input
                  type="number"
                  step="0.5"
                  value={cashGiven || ''}
                  onChange={e => setCashGiven(parseFloat(e.target.value) || 0)}
                  className="w-full pl-8 pr-8 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:border-emerald-500"
                  placeholder="Monto entregado..."
                />
                {cashGiven > 0 && (
                  <button
                    onClick={() => setCashGiven(0)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {paymentMethod === 'qr' && (
          <div className="space-y-3 animate-in fade-in">
            {storeInfo.qrImageUrl ? (
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-3 text-center">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-900">
                  <QrCode className="w-4 h-4 text-emerald-800" />
                  <span>Escanea para Pagar con Yape / Plin</span>
                </div>

                {/* Código QR grande de la tienda */}
                <div className="p-3 bg-white rounded-2xl border border-emerald-200 shadow-xs inline-block mx-auto">
                  <img 
                    src={storeInfo.qrImageUrl} 
                    alt="Código QR de cobro de la tienda" 
                    className="w-56 h-56 max-w-[220px] max-h-[220px] object-contain mx-auto rounded-xl"
                  />
                </div>

                {/* Monto exacto a pagar */}
                <div className="space-y-0.5 pt-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Monto total a cobrar
                  </span>
                  <div className="text-3xl font-black text-emerald-800 font-mono tracking-tight">
                    {formatCurrency(totalAmount)}
                  </div>
                  <p className="text-[11px] text-slate-600 max-w-xs mx-auto leading-relaxed pt-1">
                    Pide al cliente que escanee el código desde su app de pagos (Yape, Plin u otra) y verifique el monto.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-center space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
                  <QrCode className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-900">
                    No tienes un código QR configurado
                  </h4>
                  <p className="text-[11px] text-amber-800/90 max-w-xs mx-auto mt-0.5 leading-relaxed">
                    Sube una foto de tu QR de Yape, Plin o cuenta bancaria en Ajustes para mostrarlo a tus clientes aquí al cobrar.
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-white border border-amber-200 inline-block w-full">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Total a cobrar</span>
                  <span className="text-xl font-black text-slate-900 font-mono">{formatCurrency(totalAmount)}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('ajustes')}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs inline-flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Configurar mi código QR en Ajustes</span>
                </button>
              </div>
            )}
          </div>
        )}

        {paymentMethod === 'tarjeta' && (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2 animate-in fade-in">
            <div className="w-10 h-10 rounded-2xl bg-slate-200 text-slate-700 flex items-center justify-center mx-auto">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Cobro con Tarjeta</span>
              <div className="text-2xl font-black text-slate-900 font-mono">{formatCurrency(totalAmount)}</div>
            </div>
            <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
              Procesa el pago en tu terminal físico o POS por este monto y luego confirma la venta.
            </p>
          </div>
        )}

        {/* Payment Methods tabs (B8: Yape / Plin / Transferencia) */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100">
          <button
            onClick={() => setPaymentMethod('efectivo')}
            className={`py-2 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors ${
              paymentMethod === 'efectivo'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Banknote className="w-3.5 h-3.5" />
            <span>Efectivo</span>
          </button>

          <button
            onClick={() => {
              setPaymentMethod('qr');
              setCashGiven(totalAmount);
            }}
            className={`py-2 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors ${
              paymentMethod === 'qr'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Yape / Plin</span>
          </button>

          <button
            onClick={() => {
              setPaymentMethod('tarjeta');
              setCashGiven(totalAmount);
            }}
            className={`py-2 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors ${
              paymentMethod === 'tarjeta'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Tarjeta</span>
          </button>
        </div>
      </div>

      {/* Big Action Button: Confirmar Cobro (deshabilitado si no hay carrito, se está procesando, falta peso o excede stock) */}
      <div className="space-y-2">
        <button
          onClick={handleCheckout}
          disabled={cart.length === 0 || isProcessing || hasInvalidWeight || hasInvalidStock}
          className={`w-full py-3.5 px-4 rounded-2xl font-black text-sm text-white flex items-center justify-between shadow-lg transition-transform active:scale-98 ${
            cart.length > 0 && !isProcessing && !hasInvalidWeight && !hasInvalidStock
              ? 'bg-emerald-800 hover:bg-emerald-900 shadow-emerald-900/25'
              : 'bg-slate-300 cursor-not-allowed text-slate-500 shadow-none'
          }`}
        >
          <div className="flex items-center gap-2">
            {isProcessing ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
            )}
            <div className="text-left">
              <span className="text-[10px] uppercase font-bold text-emerald-200 block leading-none">
                {isProcessing 
                  ? 'Guardando en Supabase...' 
                  : paymentMethod === 'qr' 
                  ? 'Confirmar Pago Yape / Plin' 
                  : paymentMethod === 'tarjeta' 
                  ? 'Confirmar Tarjeta' 
                  : 'Confirmar Cobro'}
              </span>
              <span className="text-sm font-bold">
                {isProcessing ? 'Registrando cobro...' : `Cobrar ${formatCurrency(totalAmount)}`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-bold bg-emerald-700/80 px-3 py-1.5 rounded-xl border border-emerald-600/50">
            <span>{isProcessing ? 'Procesando...' : 'Registrar Venta'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </button>

        {/* Indicadores contextuales bajo el botón si está bloqueado */}
        {hasInvalidWeight && invalidWeightItem && (
          <div className="text-center text-xs font-bold text-amber-800 bg-amber-50 py-1.5 px-3 rounded-xl border border-amber-200 animate-in fade-in">
            Completa el peso de: {invalidWeightItem.product.name}
          </div>
        )}
        {!hasInvalidWeight && hasInvalidStock && invalidStockItem && (
          <div className="text-center text-xs font-bold text-amber-800 bg-amber-50 py-1.5 px-3 rounded-xl border border-amber-200 animate-in fade-in">
            Ajusta la cantidad de {invalidStockItem.product.name} para continuar
          </div>
        )}
      </div>

      {/* Modal / Cuadro de Confirmación Visual de Venta (Solo visual, sin comprobantes) */}
      {saleConfirmation && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 text-center space-y-4 shadow-2xl border border-slate-100">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900">
                ¡Venta Registrada con Éxito!
              </h3>
              <p className="text-xs text-slate-500 leading-snug">
                El cobro ha quedado asentado en el sistema y el inventario se actualizó automáticamente.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs space-y-2 text-left">
              <div className="flex justify-between items-center text-slate-600">
                <span>Total cobrado:</span>
                <span className="font-mono font-black text-slate-900 text-base">
                  {formatCurrency(saleConfirmation.totalAmount)}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Método de pago:</span>
                <span className="font-bold text-slate-800">
                  {saleConfirmation.paymentMethod === 'efectivo' ? 'Efectivo' : saleConfirmation.paymentMethod === 'qr' ? 'Yape / Plin / Transferencia' : 'Tarjeta'}
                </span>
              </div>
              {saleConfirmation.paymentMethod === 'efectivo' && (
                <div className="flex justify-between items-center text-slate-600 pt-1 border-t border-slate-200/60">
                  <span>Cambio devuelto:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {formatCurrency(saleConfirmation.changeGiven)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center text-slate-400 text-[11px] pt-1 border-t border-slate-200/60">
                <span>Artículos vendidos:</span>
                <span className="font-medium text-slate-600">{saleConfirmation.itemCount} unid(s).</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Operación guardada en tu Historial de Negocio.
            </p>

            <button
              onClick={() => setSaleConfirmation(null)}
              className="w-full py-3 px-4 rounded-2xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-md transition-all active:scale-98"
            >
              Nueva Venta
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
