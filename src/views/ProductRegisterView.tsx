import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, 
  Barcode, 
  Sparkles, 
  Zap, 
  Check, 
  Minus, 
  Plus, 
  HelpCircle, 
  Clock, 
  Info,
  CheckCircle2,
  Scan,
  Flashlight,
  Camera as CameraIcon,
  Trash2,
  Package,
  Scale
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { SpeedCategory, ProductUnit } from '../types';
import { executeBarcodeScan } from '../utils/barcodeScanner';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../utils/formatters';

export const ProductRegisterView: React.FC = () => {
  const { addProduct, products, setActiveTab, showToast } = useInventory();

  // Clean initial state (inicia vacío con placeholder "0" atenuado)
  const [barcode, setBarcode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [category, setCategory] = useState<string>('Abarrotes');
  const [unit, setUnit] = useState<string>('pza');
  const [costPriceStr, setCostPriceStr] = useState<string>('');
  const [salePriceStr, setSalePriceStr] = useState<string>('');
  const [stockStr, setStockStr] = useState<string>('');
  const [reorderPoint, setReorderPoint] = useState<number>(12);
  const [speed, setSpeed] = useState<SpeedCategory | null>('NORMAL');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const costPrice = parseFloat(costPriceStr) || 0;
  const salePrice = parseFloat(salePriceStr) || 0;
  const stock = parseFloat(stockStr) || 0;

  // Real-time calculations matching updated formula
  const unitMarginDollar = useMemo(() => {
    return Number((salePrice - costPrice).toFixed(2));
  }, [salePrice, costPrice]);

  const unitMarginPercent = useMemo(() => {
    if (costPrice <= 0) return 0;
    return Number((((salePrice - costPrice) / costPrice) * 100).toFixed(1));
  }, [salePrice, costPrice]);

  const investedCapital = useMemo(() => {
    return Number((costPrice * stock).toFixed(2));
  }, [costPrice, stock]);

  const weeklyRate = speed === 'RAPIDO' ? 0.30 : speed === 'NORMAL' ? 0.15 : 0.05;
  const dailyVelocity = useMemo(() => {
    const base = Math.max(stock, 1);
    return Number(((base * weeklyRate) / 7).toFixed(2));
  }, [weeklyRate, stock]);

  const dailyProfitDollar = Number((unitMarginDollar * dailyVelocity).toFixed(2));

  const projectedDailyReturnPercent = useMemo(() => {
    if (investedCapital <= 0) return 0;
    return Number(((dailyProfitDollar / investedCapital) * 100).toFixed(2));
  }, [dailyProfitDollar, investedCapital]);

  const monthlyReturnPercent = useMemo(() => {
    return Number((projectedDailyReturnPercent * 30).toFixed(1));
  }, [projectedDailyReturnPercent]);

  // Real Barcode Scanning
  const handleScanBarcode = async () => {
    try {
      setIsScanning(true);
      const scannedCode = await executeBarcodeScan({
        onStatusChange: (status) => showToast(status, 'info'),
      });

      if (scannedCode) {
        processScannedCode(scannedCode);
      }
    } catch (err: any) {
      console.error("Error al escanear producto:", err);
      showToast("Error al escanear", "alert", err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const processScannedCode = (scannedCode: string) => {
    setBarcode(scannedCode);
    const existing = products.find(p => p.barcode === scannedCode);
    if (existing) {
      setName(existing.name);
      setCategory(existing.category || 'General');
      setUnit(existing.unit || 'pza');
      setCostPriceStr(existing.costPrice ? String(existing.costPrice) : '');
      setSalePriceStr(existing.salePrice ? String(existing.salePrice) : '');
      setStockStr(existing.stock !== undefined ? String(existing.stock) : '');
      setReorderPoint(existing.reorderPoint || 12);
      setSpeed(existing.estimatedSpeed || null);
      setImageUrl(existing.imageUrl || '');
      showToast(`Producto existente encontrado: ${existing.name}`, 'info');
    } else {
      showToast(`Código ${scannedCode} detectado. Completa los datos para registrarlo`, 'success');
    }
  };

  // Real Camera Photo Capture & Upload to Supabase Storage
  const handleTakePhoto = async () => {
    try {
      setIsUploadingPhoto(true);
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
      });

      if (!photo.base64String) return;

      const fileName = `product_${Date.now()}.${photo.format || 'jpeg'}`;
      const byteCharacters = atob(photo.base64String);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: `image/${photo.format || 'jpeg'}` });

      const { data, error } = await supabase.storage
        .from('product-images')
        .upload(fileName, blob, {
          contentType: `image/${photo.format || 'jpeg'}`,
          upsert: true,
        });

      if (error) throw error;

      const { data: publicData } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      if (publicData?.publicUrl) {
        setImageUrl(publicData.publicUrl);
        showToast('Foto cargada correctamente', 'success');
      }
    } catch (err: any) {
      if (err.message !== 'User cancelled photos app') {
        console.error('Error al tomar foto:', err);
        showToast('Error al capturar foto', 'alert', err.message);
      }
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = 'Falta completar este valor';
    }
    if (costPriceStr.trim() === '') {
      errors.costPrice = 'Falta completar este valor';
    }
    if (salePriceStr.trim() === '') {
      errors.salePrice = 'Falta completar este valor';
    }
    if (stockStr.trim() === '') {
      errors.stock = 'Falta completar este valor';
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      showToast('Falta completar valores obligatorios', 'alert');
      return;
    }
    setValidationErrors({});

    if (costPrice < 0 || salePrice <= 0) {
      showToast('El precio de venta debe ser mayor a 0', 'alert');
      return;
    }
    if (salePrice < costPrice) {
      showToast('El precio de venta no puede ser menor al costo', 'alert');
      return;
    }

    try {
      setIsSaving(true);
      const cleanBarcode = barcode.trim() || null;
      const success = await addProduct({
        barcode: cleanBarcode,
        name: name.trim(),
        category: category || 'Abarrotes',
        unit: (unit || 'pza') as ProductUnit,
        costPrice,
        salePrice,
        stock,
        reorderPoint,
        estimatedSpeed: speed,
        imageUrl: imageUrl || undefined,
      });

      if (success) {
        setActiveTab('inventario');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3.5 pb-32 max-w-md mx-auto px-4 pt-1">
      {/* Top Header Navigation */}
      <div className="flex items-center justify-between py-2">
        <button
          onClick={() => setActiveTab('inventario')}
          className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-700 flex items-center gap-1 text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al Inventario</span>
        </button>

        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[10px] border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping" />
          NUEVO PRODUCTO REAL
        </span>
      </div>

      {/* Barcode Scanner Section - Rentabill Design System (Opcional) */}
      <div className="p-4 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-700">
            <Barcode className="w-4 h-4 text-emerald-800" />
            <span className="text-xs font-bold">Código de Barras <span className="text-[10px] text-slate-400 font-normal">(opcional)</span></span>
          </div>

          <div className="flex items-center gap-1.5">
            {barcode && (
              <button
                type="button"
                onClick={() => setBarcode('')}
                className="px-2 py-1 rounded-lg text-[10px] font-bold text-slate-500 hover:bg-slate-100"
              >
                Quitar
              </button>
            )}
            <button 
              type="button"
              onClick={handleScanBarcode}
              disabled={isScanning}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-50"
            >
              <Scan className="w-3.5 h-3.5" />
              <span>{isScanning ? 'Escaneando...' : 'Escanear'}</span>
            </button>
          </div>
        </div>

        {/* Framing area for barcode */}
        <div 
          onClick={handleScanBarcode}
          className="relative h-14 border border-slate-200 rounded-2xl flex items-center justify-center bg-slate-50/70 hover:bg-emerald-50/40 hover:border-emerald-300 cursor-pointer transition-all"
        >
          <div className="absolute top-2 left-2 w-2.5 h-2.5 border-t-2 border-l-2 border-emerald-800 rounded-tl-xs" />
          <div className="absolute top-2 right-2 w-2.5 h-2.5 border-t-2 border-r-2 border-emerald-800 rounded-tr-xs" />
          <div className="absolute bottom-2 left-2 w-2.5 h-2.5 border-b-2 border-l-2 border-emerald-800 rounded-bl-xs" />
          <div className="absolute bottom-2 right-2 w-2.5 h-2.5 border-b-2 border-r-2 border-emerald-800 rounded-br-xs" />

          {barcode ? (
            <span className="text-sm font-bold font-mono text-slate-900 tracking-wider bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-2xs">
              {barcode}
            </span>
          ) : (
            <span className="text-xs text-slate-500 font-medium">
              Toca para abrir la cámara y escanear (o dejar vacío)
            </span>
          )}
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>Opcional: productos sin código se guardan como NULL</span>
          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-semibold text-[10px] border border-emerald-200">
            MLKit Nativo
          </span>
        </div>
      </div>

      {/* Product Photo Upload Section */}
      <div className="p-3.5 rounded-3xl bg-white border border-slate-100 shadow-xs space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <CameraIcon className="w-4 h-4 text-emerald-800" />
            <span>Foto del producto (opcional)</span>
          </label>
          {imageUrl && (
            <button
              type="button"
              onClick={() => setImageUrl('')}
              className="text-[10px] text-rose-600 font-bold flex items-center gap-0.5 hover:underline"
            >
              <Trash2 className="w-3 h-3" />
              <span>Quitar foto</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt="Foto producto" 
              className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shadow-xs" 
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400">
              <Package className="w-7 h-7" />
            </div>
          )}

          <div className="flex-1">
            <button
              type="button"
              onClick={handleTakePhoto}
              disabled={isUploadingPhoto}
              className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <CameraIcon className="w-3.5 h-3.5 text-emerald-700" />
              <span>{isUploadingPhoto ? 'Subiendo imagen...' : imageUrl ? 'Cambiar foto' : 'Tomar o elegir foto'}</span>
            </button>
            <p className="text-[10px] text-slate-400 mt-1">
              Se guarda en Supabase Storage (product-images)
            </p>
          </div>
        </div>
      </div>

      {/* Form Fields */}
      <form onSubmit={handleSave} className="space-y-3.5">
        {/* Nombre de Producto */}
        <div className="p-3.5 rounded-3xl bg-white border border-slate-100 shadow-xs space-y-1.5">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Nombre del Producto *
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej. Leche Entera 1L"
            className="w-full text-sm font-bold text-slate-900 border-b border-slate-200 focus:border-emerald-600 focus:outline-hidden py-1 transition-colors"
            required
          />
        </div>

        {/* Categoría y Unidad */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3 rounded-3xl bg-white border border-slate-100 shadow-xs space-y-1">
            <label className="text-[11px] font-medium text-slate-500 block">Categoría</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full text-xs font-bold text-slate-800 bg-transparent focus:outline-hidden"
            >
              <option value="Abarrotes">Abarrotes</option>
              <option value="Bebidas">Bebidas</option>
              <option value="Lácteos">Lácteos</option>
              <option value="Snacks">Snacks</option>
              <option value="Higiene">Higiene</option>
              <option value="Limpieza">Limpieza</option>
              <option value="Ferretería">Ferretería</option>
              <option value="Farmacia">Farmacia</option>
              <option value="General">General</option>
            </select>
          </div>

          <div className="p-3 rounded-3xl bg-white border border-slate-100 shadow-xs space-y-1">
            <label className="text-[11px] font-medium text-slate-500 block">Unidad de medida</label>
            <select
              value={unit}
              onChange={e => setUnit(e.target.value)}
              className="w-full text-xs font-bold text-slate-800 bg-transparent focus:outline-hidden"
            >
              <option value="pza">Pieza (pza)</option>
              <option value="kg">Kilogramo (kg)</option>
              <option value="lt">Litro (lt)</option>
              <option value="caja">Caja</option>
              <option value="paq">Paquete</option>
            </select>
          </div>
        </div>

        {/* Info Banner when Unit is KG */}
        {unit === 'kg' && (
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200/90 flex items-center gap-2.5 text-xs text-emerald-900 shadow-2xs">
            <Scale className="w-4 h-4 text-emerald-800 shrink-0" />
            <span>
              <strong>Producto por peso (kg):</strong> El precio y costo representan el valor por kilo. En ventas y stock podrás registrar cantidades fraccionadas (ej. 1.250 kg).
            </span>
          </div>
        )}

        {/* Precios: Costo Unitario vs Precio Mostrador */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className={`p-3 rounded-3xl bg-white border transition-colors shadow-xs space-y-1 ${
            validationErrors.costPrice ? 'border-rose-400 bg-rose-50/20 ring-1 ring-rose-400' : 'border-slate-100'
          }`}>
            <span className="text-[11px] font-medium text-slate-500 block">
              {unit === 'kg' ? 'Costo por Kilo' : 'Costo de Compra'}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold text-slate-400 font-mono">S/</span>
              <input
                type="text"
                inputMode="decimal"
                value={costPriceStr}
                onFocus={e => e.target.select()}
                onChange={e => {
                  const val = e.target.value.replace(',', '.');
                  if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
                    setCostPriceStr(val);
                    if (validationErrors.costPrice) {
                      setValidationErrors(prev => ({ ...prev, costPrice: '' }));
                    }
                  }
                }}
                placeholder="0.00"
                className="w-full text-lg font-black text-slate-900 font-mono focus:outline-hidden placeholder:text-slate-300"
              />
            </div>
            {validationErrors.costPrice ? (
              <span className="text-[10px] text-rose-600 font-bold block">{validationErrors.costPrice}</span>
            ) : (
              <span className="text-[10px] text-slate-400 block">
                {unit === 'kg' ? 'Costo por kg prov.' : 'Costo unitario prov.'}
              </span>
            )}
          </div>

          <div className={`p-3 rounded-3xl bg-white border transition-colors shadow-xs space-y-1 ${
            validationErrors.salePrice ? 'border-rose-400 bg-rose-50/20 ring-1 ring-rose-400' : 'border-slate-100'
          }`}>
            <span className="text-[11px] font-medium text-slate-500 block">
              {unit === 'kg' ? 'Precio por Kilo' : 'Precio de Venta'}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold text-slate-400 font-mono">S/</span>
              <input
                type="text"
                inputMode="decimal"
                value={salePriceStr}
                onFocus={e => e.target.select()}
                onChange={e => {
                  const val = e.target.value.replace(',', '.');
                  if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
                    setSalePriceStr(val);
                    if (validationErrors.salePrice) {
                      setValidationErrors(prev => ({ ...prev, salePrice: '' }));
                    }
                  }
                }}
                placeholder="0.00"
                className="w-full text-lg font-black text-emerald-800 font-mono focus:outline-hidden placeholder:text-slate-300"
              />
            </div>
            {validationErrors.salePrice ? (
              <span className="text-[10px] text-rose-600 font-bold block">{validationErrors.salePrice}</span>
            ) : (
              <span className="text-[10px] text-slate-400 block">
                {unit === 'kg' ? 'Venta por kg mostrador' : 'Venta en mostrador'}
              </span>
            )}
          </div>
        </div>

        {/* Stock inicial y Lote comprado */}
        <div className="space-y-2.5">
          <div className={`p-3.5 rounded-3xl bg-white border transition-colors shadow-xs space-y-1 ${
            validationErrors.stock ? 'border-rose-400 bg-rose-50/20 ring-1 ring-rose-400' : 'border-slate-100'
          }`}>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {unit === 'kg' ? 'Cantidad que tienes ahora (kg)' : 'Stock en anaquel'}
            </span>
            <div className="flex items-center justify-between">
              <input
                type="text"
                inputMode="decimal"
                value={stockStr}
                onFocus={e => e.target.select()}
                onChange={e => {
                  const val = e.target.value.replace(',', '.');
                  if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
                    setStockStr(val);
                    if (validationErrors.stock) {
                      setValidationErrors(prev => ({ ...prev, stock: '' }));
                    }
                  }
                }}
                placeholder="0"
                className="text-xl font-black text-slate-900 font-mono w-28 focus:outline-hidden placeholder:text-slate-300"
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const stepVal = unit === 'kg' ? 0.5 : 1;
                    const cur = parseFloat(stockStr) || 0;
                    const next = Math.max(0, Math.round((cur - stepVal) * 1000) / 1000);
                    const nextStr = String(next);
                    setStockStr(nextStr);
                  }}
                  className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-bold flex items-center justify-center hover:bg-slate-200 transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const stepVal = unit === 'kg' ? 0.5 : 1;
                    const cur = parseFloat(stockStr) || 0;
                    const next = Math.round((cur + stepVal) * 1000) / 1000;
                    const nextStr = String(next);
                    setStockStr(nextStr);
                  }}
                  className="w-7 h-7 rounded-lg bg-emerald-800 text-white font-bold flex items-center justify-center shadow-xs hover:bg-emerald-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {validationErrors.stock && (
              <span className="text-[10px] text-rose-600 font-bold block">{validationErrors.stock}</span>
            )}
          </div>

          {/* Fin de bloque de stock */}
        </div>

        {/* Margen por Unidad Banner */}
        <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                {unit === 'kg' ? 'Margen por Kilo' : 'Margen por Unidad'}
              </span>
              <span className="text-sm font-black text-slate-900 font-mono">
                +{formatCurrency(unitMarginDollar)}
              </span>
            </div>
          </div>

          <div className="px-2.5 py-0.5 rounded-full bg-emerald-200/70 text-emerald-900 font-black text-xs font-mono">
            {unitMarginPercent.toFixed(1)}%
          </div>
        </div>

        {/* Ganancia Diaria Proyectada */}
        <div className="p-3.5 rounded-3xl bg-white border border-slate-100 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-800 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              GANANCIA DIARIA PROYECTADA
            </span>
            <span className="px-2 py-0.5 rounded-full border border-dashed border-slate-300 text-slate-500 text-[10px] font-medium flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              Estimado
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-800 font-mono tracking-tight">
                {projectedDailyReturnPercent.toFixed(2)}% <span className="text-xs font-normal text-slate-400">/día</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Capital invertido: <strong className="text-slate-800 font-mono">{formatCurrency(investedCapital)}</strong>
              </p>
            </div>

            <div className="w-12 h-12 rounded-full border-4 border-slate-100 border-t-emerald-600 border-r-emerald-500 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
        </div>

        {/* Selector de Ritmo de Venta Inicial */}
        <div className="p-3.5 rounded-3xl bg-white border border-slate-100 shadow-xs space-y-2.5">
          <div>
            <label className="text-xs font-bold text-slate-900 block">
              ¿Qué tan rápido crees que se va a vender?
            </label>
            <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
              Esto es solo un cálculo inicial. En cuanto vendas varias veces este producto, el sistema aprenderá solo y ya no lo necesitarás.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => setSpeed('LENTO')}
              className={`py-3 px-2 rounded-2xl border text-center transition-all flex flex-col items-center justify-between gap-1 active:scale-95 ${
                speed === 'LENTO'
                  ? 'bg-emerald-800 text-white border-emerald-800 shadow-sm'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="text-lg">🐢</span>
              <span className="text-[11px] font-bold leading-tight">
                Se vende poco a poco
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSpeed('NORMAL')}
              className={`py-3 px-2 rounded-2xl border text-center transition-all flex flex-col items-center justify-between gap-1 active:scale-95 ${
                speed === 'NORMAL'
                  ? 'bg-emerald-800 text-white border-emerald-800 shadow-sm'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="text-lg">🚶</span>
              <span className="text-[11px] font-bold leading-tight">
                Se vende a ritmo normal
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSpeed('RAPIDO')}
              className={`py-3 px-2 rounded-2xl border text-center transition-all flex flex-col items-center justify-between gap-1 active:scale-95 ${
                speed === 'RAPIDO'
                  ? 'bg-emerald-800 text-white border-emerald-800 shadow-sm'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="text-lg">🚀</span>
              <span className="text-[11px] font-bold leading-tight">
                Se vende muy rápido
              </span>
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSaving}
          className="w-full py-3 px-4 rounded-2xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-md shadow-emerald-900/20 flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{isSaving ? 'Guardando en Supabase...' : 'Guardar en Inventario'}</span>
        </button>
      </form>
    </div>
  );
};
