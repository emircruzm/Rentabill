import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Camera as CameraIcon, 
  Trash2, 
  Package, 
  Scale, 
  Plus, 
  Minus, 
  CheckCircle2, 
  Scan, 
  Zap, 
  Clock, 
  AlertTriangle,
  Sparkles
} from 'lucide-react';
import { Product, SpeedCategory } from '../types';
import { useInventory } from '../context/InventoryContext';
import { executeBarcodeScan } from '../utils/barcodeScanner';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { supabase } from '../lib/supabase';

interface EditProductModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EditProductModal: React.FC<EditProductModalProps> = ({
  product,
  isOpen,
  onClose,
}) => {
  const { updateProduct, deleteProduct, showToast } = useInventory();

  // Local state initialized with product values
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('Abarrotes');
  const [unit, setUnit] = useState('pza');
  const [costPrice, setCostPrice] = useState<number>(0);
  const [salePrice, setSalePrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(0);
  const [reorderPoint, setReorderPoint] = useState<number>(12);
  const [speed, setSpeed] = useState<SpeedCategory | null>('NORMAL');
  const [imageUrl, setImageUrl] = useState<string>('');

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Synchronize form when selected product changes
  useEffect(() => {
    if (product) {
      setName(product.name || '');
      setBarcode(product.barcode || '');
      setSku(product.sku || '');
      setCategory(product.categoryName || product.category || 'General');
      setUnit(product.unit || 'pza');
      setCostPrice(product.costPrice || 0);
      setSalePrice(product.salePrice || 0);
      setStock(product.stock || 0);
      setReorderPoint(product.reorderPoint || 12);
      setSpeed(product.estimatedSpeed || 'NORMAL');
      setImageUrl(product.imageUrl || '');
      setShowDeleteConfirm(false);
    }
  }, [product]);

  // Real-time Margin & Profit calculations
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

  if (!isOpen || !product) return null;

  // Real Barcode Scanning
  const handleScanBarcode = async () => {
    try {
      setIsScanning(true);
      const scannedCode = await executeBarcodeScan({
        onStatusChange: (status) => showToast(status, 'info'),
      });

      if (scannedCode) {
        setBarcode(scannedCode);
        showToast(`Código ${scannedCode} asignado`, 'success');
      }
    } catch (err: any) {
      console.error('Error al escanear código en edición:', err);
      showToast('Error al escanear', 'alert', err.message);
    } finally {
      setIsScanning(false);
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

      const fileName = `product_${product.id}_${Date.now()}.${photo.format || 'jpeg'}`;
      const byteCharacters = atob(photo.base64String);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: `image/${photo.format || 'jpeg'}` });

      const { error: uploadErr } = await supabase.storage
        .from('product-images')
        .upload(fileName, blob, {
          contentType: `image/${photo.format || 'jpeg'}`,
          upsert: true,
        });

      if (uploadErr) throw uploadErr;

      const { data: publicData } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      if (publicData?.publicUrl) {
        setImageUrl(publicData.publicUrl);
        showToast('Foto cargada correctamente', 'success');
      }
    } catch (err: any) {
      if (err.message !== 'User cancelled photos app') {
        console.error('Error al capturar foto:', err);
        showToast('Error al capturar foto', 'alert', err.message);
      }
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('El nombre del producto es obligatorio', 'alert');
      return;
    }
    if (salePrice < 0 || costPrice < 0) {
      showToast('Los precios no pueden ser negativos', 'alert');
      return;
    }

    try {
      setIsSaving(true);
      const success = await updateProduct(product.id, {
        name: name.trim(),
        barcode: barcode.trim(),
        sku: sku.trim() || undefined,
        category,
        unit,
        costPrice,
        salePrice,
        stock,
        reorderPoint,
        estimatedSpeed: speed,
        imageUrl: imageUrl || undefined,
      });

      if (success) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const success = await deleteProduct(product.id);
      if (success) {
        onClose();
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl border border-slate-100 my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              ✏️
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 leading-tight">
                Editar Producto
              </h2>
              <p className="text-[11px] text-slate-500">
                {product.status === 'REAL' ? 'Validado con ventas reales' : 'En período de estimación'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body - Scrollable */}
        <form onSubmit={handleSave} className="space-y-4 pt-3 overflow-y-auto pr-1">
          {/* Photo Section */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <CameraIcon className="w-4 h-4 text-emerald-800" />
                <span>Foto del producto</span>
              </label>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="text-[11px] text-rose-600 font-bold flex items-center gap-0.5 hover:underline"
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
                  alt="Vista previa del producto" 
                  className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shadow-2xs" 
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-white border border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                  <Package className="w-7 h-7" />
                </div>
              )}

              <div className="flex-1">
                <button
                  type="button"
                  onClick={handleTakePhoto}
                  disabled={isUploadingPhoto}
                  className="w-full py-2 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
                >
                  <CameraIcon className="w-3.5 h-3.5 text-emerald-700" />
                  <span>{isUploadingPhoto ? 'Subiendo imagen...' : imageUrl ? 'Reemplazar foto' : 'Tomar o elegir foto'}</span>
                </button>
                <p className="text-[10px] text-slate-400 mt-1">
                  Se almacena en Supabase Storage
                </p>
              </div>
            </div>
          </div>

          {/* Product Name */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Nombre del Producto *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej. Toallitas húmedas Ninet"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-hidden focus:border-emerald-600"
              required
            />
          </div>

          {/* Barcode & SKU */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-500 block">
                Código de Barras
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={barcode}
                  onChange={e => setBarcode(e.target.value)}
                  placeholder="EAN / Código"
                  className="w-full pl-3 pr-8 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-800 focus:outline-hidden focus:border-emerald-600"
                />
                <button
                  type="button"
                  onClick={handleScanBarcode}
                  disabled={isScanning}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-emerald-700 hover:bg-emerald-50"
                  title="Escanear con cámara"
                >
                  <Scan className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-500 block">
                SKU / Código Interno
              </label>
              <input
                type="text"
                value={sku}
                onChange={e => setSku(e.target.value)}
                placeholder="Opcional"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 focus:outline-hidden focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Category & Unit */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-500 block">Categoría</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-emerald-600"
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

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-500 block">Unidad de medida</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-emerald-600"
              >
                <option value="pza">Pieza (pza)</option>
                <option value="kg">Kilogramo (kg)</option>
                <option value="lt">Litro (lt)</option>
                <option value="caja">Caja</option>
                <option value="paq">Paquete</option>
              </select>
            </div>
          </div>

          {unit === 'kg' && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-[11px] text-emerald-900">
              <Scale className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>
                <strong>Producto por peso (kg):</strong> El stock y ventas admiten cantidades fraccionadas (ej. 2.5 kg).
              </span>
            </div>
          )}

          {/* Prices */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                {unit === 'kg' ? 'Costo por Kilo' : 'Costo de Compra'}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-slate-400 font-mono">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costPrice || ''}
                  onChange={e => setCostPrice(parseFloat(e.target.value) || 0)}
                  className="w-full text-base font-black text-slate-900 font-mono focus:outline-hidden bg-transparent"
                  required
                />
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                {unit === 'kg' ? 'Precio por Kilo' : 'Precio de Venta'}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-emerald-600 font-mono">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={salePrice || ''}
                  onChange={e => setSalePrice(parseFloat(e.target.value) || 0)}
                  className="w-full text-base font-black text-emerald-800 font-mono focus:outline-hidden bg-transparent"
                  required
                />
              </div>
            </div>
          </div>

          {/* Margin calculation pill */}
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-slate-700">
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span>Margen por {unit === 'kg' ? 'kilo' : 'unidad'}:</span>
              <strong className="font-mono text-emerald-800">+${unitMarginDollar.toFixed(2)}</strong>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black font-mono text-[11px]">
              {unitMarginPercent.toFixed(1)}%
            </span>
          </div>

          {/* Stock in Shelf and Reorder Point */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                {unit === 'kg' ? 'Stock actual (kg)' : 'Stock actual (pzas)'}
              </span>
              <div className="flex items-center justify-between">
                <input
                  type="number"
                  step={unit === 'kg' ? '0.001' : '1'}
                  min="0"
                  value={stock}
                  onChange={e => {
                    const val = unit === 'kg' ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0;
                    setStock(val);
                  }}
                  className="w-16 text-base font-black text-slate-900 font-mono bg-transparent focus:outline-hidden"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const stepVal = unit === 'kg' ? 0.5 : 1;
                      setStock(prev => Math.max(0, Math.round((prev - stepVal) * 1000) / 1000));
                    }}
                    className="w-6 h-6 rounded-md bg-white border border-slate-200 text-slate-700 font-bold flex items-center justify-center hover:bg-slate-100"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const stepVal = unit === 'kg' ? 0.5 : 1;
                      setStock(prev => Math.round((prev + stepVal) * 1000) / 1000);
                    }}
                    className="w-6 h-6 rounded-md bg-emerald-800 text-white font-bold flex items-center justify-center shadow-2xs hover:bg-emerald-700"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Punto de Reorden
              </span>
              <input
                type="number"
                min="0"
                value={reorderPoint}
                onChange={e => setReorderPoint(parseInt(e.target.value) || 0)}
                className="w-full text-base font-black text-slate-900 font-mono bg-transparent focus:outline-hidden"
                title="Avisar cuando el stock baje de esta cantidad"
              />
              <span className="text-[9px] text-slate-400 block">Aviso de stock bajo</span>
            </div>
          </div>

          {/* Speed Category (if still estimated) */}
          {product.status === 'ESTIMADO' && (
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-bold text-slate-700 block">
                Ritmo de venta esperado (estimación inicial):
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSpeed('LENTO')}
                  className={`py-2 px-1 rounded-xl border text-center transition-all flex flex-col items-center gap-0.5 ${
                    speed === 'LENTO'
                      ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-base">🐢</span>
                  <span className="text-[10px] font-bold leading-tight">Lento</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSpeed('NORMAL')}
                  className={`py-2 px-1 rounded-xl border text-center transition-all flex flex-col items-center gap-0.5 ${
                    speed === 'NORMAL'
                      ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-base">🚶</span>
                  <span className="text-[10px] font-bold leading-tight">Normal</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSpeed('RAPIDO')}
                  className={`py-2 px-1 rounded-xl border text-center transition-all flex flex-col items-center gap-0.5 ${
                    speed === 'RAPIDO'
                      ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-base">🚀</span>
                  <span className="text-[10px] font-bold leading-tight">Rápido</span>
                </button>
              </div>
            </div>
          )}

          {/* Submit Action */}
          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-3 px-4 rounded-2xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-md shadow-emerald-900/20 flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSaving ? 'Guardando cambios...' : 'Guardar Cambios'}</span>
            </button>

            {/* Delete Confirmation or Button */}
            {showDeleteConfirm ? (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 space-y-2 animate-in fade-in">
                <div className="flex items-center gap-2 text-rose-800 text-xs font-bold">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>¿Seguro que deseas eliminar este producto?</span>
                </div>
                <p className="text-[11px] text-rose-700">
                  Esta acción no se puede deshacer. Se removerá del inventario y del catálogo.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1 py-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-2xs disabled:opacity-50"
                  >
                    {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="py-1.5 px-3 rounded-xl bg-white border border-rose-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2 text-center text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center justify-center gap-1 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar producto del inventario</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
