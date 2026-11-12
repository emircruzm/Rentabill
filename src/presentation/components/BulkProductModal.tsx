import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  X, 
  Upload, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  HelpCircle,
  Loader2,
  PackagePlus,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useInventory, parseBulkProducts, BulkParseResult } from '@application/index';
import { formatCurrency } from '@shared/formatters/index';

interface BulkProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerButtonId?: string;
}

export const BulkProductModal: React.FC<BulkProductModalProps> = ({
  isOpen,
  onClose,
  triggerButtonId = 'btn-carga-rapida',
}) => {
  const { products, addProductsBulk, showToast } = useInventory();

  const [inputText, setInputText] = useState('');
  const [parseResult, setParseResult] = useState<BulkParseResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [progress, setProgress] = useState({ saved: 0, total: 0 });
  const [saveSummary, setSaveSummary] = useState<{
    saved: number;
    skipped: number;
    error?: string;
    warning?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bloquear el scroll del fondo mientras el modal está abierto
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Manejar tecla Esc para cerrar y devolver foco accesible
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isSaving]);

  // Lista de categorías conocidas inferidas de los productos existentes
  const knownCategories = useMemo(() => {
    const cats = new Set<string>(['General', 'Abarrotes']);
    products.forEach(p => {
      if (p.categoryName) cats.add(p.categoryName);
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  }, [products]);

  // Lista mínima de productos existentes para verificar duplicados
  const existingMinimal = useMemo(() => {
    return products.map(p => ({
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      sku: p.sku,
    }));
  }, [products]);

  // Ejecuta el parseo con la función pura
  const handleParse = (text: string) => {
    setSaveSummary(null);
    if (!text.trim()) {
      setParseResult(null);
      return;
    }
    const result = parseBulkProducts(text, existingMinimal, knownCategories);
    setParseResult(result);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    handleParse(val);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1_000_000) {
      showToast('Archivo demasiado grande', 'alert', 'El archivo supera 1 MB. Una carga admite hasta 500 filas.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setInputText(content);
        handleParse(content);
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const downloadTemplate = () => {
    const csvContent =
      'Nombre,Precio Compra,Precio Venta,Stock,Categoría,Código de Barras,SKU,Unidad\r\n' +
      'Arroz Costeño 1kg,3.80,4.50,20,Abarrotes,7750123456789,ARR-001,kg\r\n' +
      'Aceite Primor 1L,8.50,10.20,15,Abarrotes,,ACE-001,lt\r\n' +
      'Atún Gloria 170g,4.20,5.50,30,Conservas,7750987654321,,pza\r\n' +
      'Fideos Don Vittorio 500g,2.20,2.80,25,Abarrotes,,,pza\r\n';

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'plantilla_productos_rentabill.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!parseResult || parseResult.resumen.validas === 0 || isSaving) return;

    const validRows = parseResult.filas.filter(f => f.esValida && f.datos);
    const inputsToSave = validRows.map(f => f.datos!);
    const totalToSave = inputsToSave.length;
    const totalSkipped = parseResult.resumen.conError;

    setIsSaving(true);
    setProgress({ saved: 0, total: totalToSave });
    setSaveSummary(null);

    try {
      const res = await addProductsBulk(inputsToSave, (saved, total) => {
        setProgress({ saved, total });
      });

      setSaveSummary({
        saved: res.insertedCount,
        skipped: totalSkipped + (totalToSave - res.insertedCount),
        error: res.error,
        warning: res.warning,
      });

      if (res.success && !res.warning) {
        const savedText = res.insertedCount === 1 
          ? 'Se guardó 1 producto con éxito.' 
          : `Se guardaron ${res.insertedCount} productos con éxito.`;
        showToast(
          'Carga completada',
          'success',
          savedText
        );
      } else if (res.success && res.warning) {
        showToast(
          'Carga con advertencia',
          'alert',
          res.warning
        );
      }
    } catch (err: any) {
      setSaveSummary({
        saved: progress.saved,
        skipped: totalSkipped,
        error: err.message || 'Error inesperado al guardar',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isSavedSuccessfully = Boolean(saveSummary?.saved && !saveSummary?.error);

  const handleReset = () => {
    setInputText('');
    setParseResult(null);
    setSaveSummary(null);
    setProgress({ saved: 0, total: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (isSaving) return;
    handleReset();
    onClose();
    // Devolver el foco al botón que abrió el modal
    setTimeout(() => {
      document.getElementById(triggerButtonId)?.focus();
    }, 50);
  };

  if (!isOpen) return null;

  const validCount = parseResult?.resumen.validas || 0;
  const errorCount = parseResult?.resumen.conError || 0;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-bulk-title"
    >
      <div 
        className="w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 duration-300 pb-safe"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Mobile handle indicator */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        {/* Cabecera */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-800 text-white flex items-center justify-center shadow-xs">
              <PackagePlus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 id="modal-bulk-title" className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                Carga Rápida de Productos
              </h2>
              <p className="text-xs text-slate-500">
                Pega desde Excel o sube un archivo CSV (hasta 500 productos)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            aria-label="Cerrar ventana de carga rápida"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors disabled:opacity-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-700/30"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-sm overflow-x-hidden">
          
          {/* Barra de Acciones: Subir archivo y Plantilla */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv"
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSaving || isSavedSuccessfully}
                className="min-h-[44px] flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-bold border border-slate-200 text-xs shadow-2xs active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none focus:outline-hidden focus:ring-2 focus:ring-emerald-700/30"
              >
                <Upload className="w-4 h-4 text-emerald-800" />
                <span>Subir archivo CSV</span>
              </button>

              <button
                type="button"
                onClick={downloadTemplate}
                className="min-h-[44px] flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-emerald-800 hover:bg-slate-100 font-bold text-xs transition-colors focus:outline-hidden focus:ring-2 focus:ring-emerald-700/30"
              >
                <Download className="w-4 h-4" />
                <span>Descargar plantilla</span>
              </button>
            </div>

            <span className="text-xs text-slate-500 font-medium hidden sm:inline">
              Separadores: Tabulación (Excel), coma (,) o punto y coma (;)
            </span>
          </div>

          {/* Bloque Plegable: ¿Cómo preparo mi lista? (cerrado por defecto) */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
            <button
              type="button"
              onClick={() => setIsHelpOpen(prev => !prev)}
              aria-expanded={isHelpOpen}
              className="w-full p-3.5 flex items-center justify-between text-left text-xs font-bold text-slate-700 hover:bg-slate-100/70 transition-colors focus:outline-hidden focus:ring-2 focus:ring-emerald-700/20"
            >
              <span className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-emerald-800 shrink-0" />
                <span>¿Cómo preparo mi lista?</span>
              </span>
              {isHelpOpen ? (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {isHelpOpen && (
              <div className="px-3.5 pb-3.5 pt-1 text-xs text-slate-600 border-t border-slate-200/60 space-y-1.5 animate-in fade-in duration-150">
                <p>
                  • Si tu archivo usa <strong>coma (,)</strong> como separador de columnas, los decimales deben escribirse con <strong>punto (.)</strong> (ej: <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-xs text-slate-800">10.50</code>).
                </p>
                <p>
                  • Si copias y pegas celdas directo de Excel, el separador es <strong>tabulación</strong> y se detecta automáticamente.
                </p>
                <p>
                  • Columnas recomendadas: <strong>Nombre, Precio Compra, Precio Venta, Stock, Categoría, Código de Barras, SKU, Unidad</strong>.
                </p>
                <p className="text-slate-500">
                  • La categoría es opcional: si la dejas vacía, se asignará <strong>General</strong> automáticamente.
                </p>
              </div>
            )}
          </div>

          {/* Área de texto para pegar */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Pega aquí el contenido de tus filas:
            </label>
            <textarea
              value={inputText}
              onChange={handleTextChange}
              disabled={isSaving || isSavedSuccessfully}
              readOnly={isSavedSuccessfully}
              rows={5}
              placeholder="Arroz Costeño 1kg,3.80,4.50,20&#10;Aceite Primor 1L,8.50,10.20,15"
              className="w-full p-3.5 font-mono text-sm bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-emerald-600 focus:ring-2 focus:ring-emerald-700/20 transition-all resize-y min-h-[120px] disabled:opacity-60"
            />
          </div>

          {/* Resumen del Parseo / Estado */}
          {parseResult && (
            <div className="space-y-3 pt-1">
              
              {/* Badges de contadores */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>{validCount} {validCount === 1 ? 'fila válida' : 'filas válidas'}</span>
                  </div>
                  {errorCount > 0 && (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700">
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                      <span>{errorCount} {errorCount === 1 ? 'con error' : 'con errores'}</span>
                    </div>
                  )}
                </div>

                <div className="text-xs text-slate-500">
                  <span>Delimitador: <strong className="font-mono text-slate-700">{parseResult.resumen.delimitadorDetectado === '\t' ? 'TAB' : parseResult.resumen.delimitadorDetectado}</strong></span>
                  {parseResult.resumen.tieneEncabezado && <span className="ml-2 font-semibold text-emerald-800">✓ Encabezado detectado</span>}
                </div>
              </div>

              {/* Error Global si excede el límite */}
              {parseResult.resumen.errorGlobal && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="font-medium">{parseResult.resumen.errorGlobal}</span>
                </div>
              )}

              {/* Vista Previa Móvil: Tarjetas individuales (pantallas < 640px) */}
              <div className="sm:hidden space-y-2.5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
                  Vista previa de filas:
                </p>
                {parseResult.filas.map((f, idx) => (
                  <div
                    key={f.numero || idx}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      f.esValida
                        ? 'bg-white border-slate-200 shadow-2xs'
                        : 'bg-rose-50/40 border-rose-200 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-mono text-slate-400">#{f.numero}</span>
                          <span className="text-sm font-bold text-slate-900 leading-snug break-words">
                            {f.datos?.name || <em className="text-slate-400 font-normal">(Sin nombre)</em>}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {f.datos?.category || 'General'}
                          {f.datos?.barcode ? ` • Código: ${f.datos.barcode}` : f.datos?.sku ? ` • SKU: ${f.datos.sku}` : ''}
                        </p>
                      </div>

                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                        f.esValida
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {f.esValida ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Válido</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>Con error</span>
                          </>
                        )}
                      </span>
                    </div>

                    {f.datos && (
                      <div className="grid grid-cols-2 gap-2 pt-2 mt-2 border-t border-slate-100 text-xs">
                        <div>
                          <span className="text-slate-400 block text-xs font-medium">Compra → Venta</span>
                          <span className="font-mono font-semibold text-slate-800">
                            {formatCurrency(f.datos.costPrice)} → <strong className="text-slate-900">{formatCurrency(f.datos.salePrice)}</strong>
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 block text-xs font-medium">Stock y unidad</span>
                          <span className="font-mono font-bold text-slate-900">
                            {f.datos.stock} {f.datos.unit}
                          </span>
                        </div>
                      </div>
                    )}

                    {!f.esValida && f.errores.length > 0 && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-rose-100/70 border border-rose-200 text-xs text-rose-800 space-y-1">
                        {f.errores.map((err, i) => (
                          <div key={i} className="flex items-start gap-1.5 font-medium leading-tight">
                            <span className="text-rose-500 font-bold">•</span>
                            <span>{err}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Vista Previa Escritorio: Tabla (pantallas >= 640px) */}
              <div className="hidden sm:block border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">#</th>
                        <th className="py-2.5 px-3">Producto</th>
                        <th className="py-2.5 px-3 w-20 text-right">Compra</th>
                        <th className="py-2.5 px-3 w-20 text-right">Venta</th>
                        <th className="py-2.5 px-3 w-16 text-right">Stock</th>
                        <th className="py-2.5 px-3 w-24">Categoría</th>
                        <th className="py-2.5 px-3 w-24 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parseResult.filas.map((f, idx) => (
                        <tr 
                          key={f.numero || idx}
                          className={`transition-colors ${
                            f.esValida 
                              ? 'hover:bg-slate-50' 
                              : 'bg-rose-50/40 hover:bg-rose-50/70'
                          }`}
                        >
                          <td className="py-2 px-3 text-center font-mono text-slate-400 text-xs">
                            {f.numero}
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-semibold text-slate-900 block text-xs">
                              {f.datos?.name || <em className="text-slate-400 font-normal">(Sin nombre)</em>}
                            </span>
                            {f.datos?.barcode && (
                              <span className="text-xs text-slate-400 font-mono block">
                                Cód: {f.datos.barcode}
                              </span>
                            )}
                            {!f.esValida && f.errores.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {f.errores.map((err, i) => (
                                  <span key={i} className="text-xs text-rose-700 flex items-center gap-1 font-medium">
                                    <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                                    <span>{err}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-700 text-right text-xs">
                            {f.datos ? formatCurrency(f.datos.costPrice) : '-'}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-900 font-bold text-right text-xs">
                            {f.datos ? formatCurrency(f.datos.salePrice) : '-'}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-700 text-right text-xs">
                            {f.datos ? `${f.datos.stock} ${f.datos.unit}` : '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-700 text-xs">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-xs font-medium">
                              {f.datos?.category || 'General'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center text-xs">
                            {f.esValida ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                <span>Válido</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                                <span>Error</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Barra de Progreso durante guardado */}
          {isSaving && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                  Guardando productos en la base de datos...
                </span>
                <span>{progress.saved} de {progress.total}</span>
              </div>
              <div className="w-full h-2.5 bg-emerald-100 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-700 h-full transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.saved / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Resumen Final tras guardar */}
          {saveSummary && (
            <div className={`p-4 rounded-2xl border ${
              saveSummary.error
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : saveSummary.warning
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                {saveSummary.error ? (
                  <AlertCircle className="w-5 h-5 text-rose-600" />
                ) : saveSummary.warning ? (
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                )}
                <span>
                  {saveSummary.error
                    ? 'Carga incompleta con errores'
                    : saveSummary.warning
                    ? 'Carga guardada con advertencias'
                    : '¡Carga completada con éxito!'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-700">
                {saveSummary.saved === 1
                  ? <span>Se guardó <strong>1 producto</strong>.</span>
                  : <span>Se guardaron <strong>{saveSummary.saved} productos</strong>.</span>
                }
                {saveSummary.skipped > 0 && (
                  <span>
                    {saveSummary.skipped === 1
                      ? <span> Se omitió <strong>1 fila</strong> no válida o fallida.</span>
                      : <span> Se omitieron <strong>{saveSummary.skipped} filas</strong> no válidas o fallidas.</span>
                    }
                  </span>
                )}
              </p>
              {saveSummary.warning && (
                <p className="mt-1 text-xs text-amber-800 font-medium">
                  {saveSummary.warning}
                </p>
              )}
              {saveSummary.error && (
                <p className="mt-1 text-xs text-rose-700 font-medium">
                  Detalle del error: {saveSummary.error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer Fijo / Botones */}
        <div className="flex items-center justify-between p-3.5 sm:p-5 border-t border-slate-100 bg-white shrink-0 gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSaving}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors disabled:opacity-50 focus:outline-hidden focus:ring-2 focus:ring-slate-300"
            >
              {saveSummary?.saved ? 'Cerrar' : 'Cancelar'}
            </button>

            {isSavedSuccessfully && (
              <button
                type="button"
                onClick={handleReset}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors focus:outline-hidden focus:ring-2 focus:ring-slate-300"
              >
                Nueva carga
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isSavedSuccessfully && errorCount > 0 && validCount > 0 && (
              <span className="text-xs text-slate-500 hidden sm:inline">
                (Se {errorCount === 1 ? 'omitirá 1 fila' : `omitirán ${errorCount} filas`})
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={validCount === 0 || isSaving || isSavedSuccessfully}
              className="min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-md shadow-emerald-900/20 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none focus:outline-hidden focus:ring-2 focus:ring-emerald-700/40"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <PackagePlus className="w-4 h-4" />
                  <span>Guardar {validCount === 1 ? '1 producto' : `${validCount} productos`}</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
