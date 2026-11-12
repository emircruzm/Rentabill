import React, { useState, useMemo, useRef } from 'react';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  HelpCircle,
  Loader2,
  PackagePlus,
  RefreshCw
} from 'lucide-react';
import { useInventory, parseBulkProducts, BulkParseResult } from '@application/index';
import { formatCurrency } from '@shared/formatters/index';

interface BulkProductModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BulkProductModal: React.FC<BulkProductModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { products, addProductsBulk, showToast } = useInventory();

  const [inputText, setInputText] = useState('');
  const [parseResult, setParseResult] = useState<BulkParseResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState({ saved: 0, total: 0 });
  const [saveSummary, setSaveSummary] = useState<{
    saved: number;
    skipped: number;
    error?: string;
    warning?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
        showToast(
          'Carga completada',
          'success',
          `Se guardaron ${res.insertedCount} productos con éxito.`
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
  };

  if (!isOpen) return null;

  const validCount = parseResult?.resumen.validas || 0;
  const errorCount = parseResult?.resumen.conError || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden transition-colors">
        
        {/* Cabecera */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 flex items-center justify-center">
              <PackagePlus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                Carga Rápida de Productos
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pega desde Excel o sube un archivo CSV (hasta 500 productos)
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isSaving}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs sm:text-sm">
          
          {/* Barra de Acciones / Ayuda */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl">
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
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-100 font-bold border border-slate-200 dark:border-slate-600 text-xs shadow-2xs active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Subir archivo CSV</span>
              </button>

              <button
                type="button"
                onClick={downloadTemplate}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-bold text-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar plantilla</span>
              </button>
            </div>

            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
              Separadores: Tabulación (Excel), coma (,) o punto y coma (;)
            </span>
          </div>

          {/* Ayuda de decimales y formato */}
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">Recomendaciones de formato:</p>
              <p>
                • Si tu archivo usa <strong>coma (,)</strong> como separador de columnas, los decimales deben escribirse con <strong>punto (.)</strong> (ej: <code className="bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded font-mono">10.50</code>).
              </p>
              <p>
                • Si copias y pegas celdas directo de Excel, el separador es <strong>tabulación</strong> y se detecta automáticamente.
              </p>
              <p>
                • Columnas: <strong>Nombre, Precio Compra, Precio Venta, Stock, Categoría, Código de Barras, SKU, Unidad</strong>.
              </p>
            </div>
          </div>

          {/* Área de texto para pegar */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Pega aquí el contenido de tus filas:
            </label>
            <textarea
              value={inputText}
              onChange={handleTextChange}
              disabled={isSaving || isSavedSuccessfully}
              readOnly={isSavedSuccessfully}
              rows={5}
              placeholder="Ejemplo:&#10;Arroz Costeño 1kg	3.80	4.50	20	Abarrotes	7750123456789	ARR-001	kg&#10;Aceite Primor 1L	8.50	10.20	15	Abarrotes		ACE-001	lt"
              className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-700 dark:focus:ring-emerald-500 transition-all resize-y"
            />
          </div>

          {/* Resumen del Parseo / Estado */}
          {parseResult && (
            <div className="space-y-3 pt-2">
              
              {/* Badges de contadores */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{validCount} {validCount === 1 ? 'fila válida' : 'filas válidas'}</span>
                  </div>
                  {errorCount > 0 && (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                      <AlertCircle className="w-4 h-4" />
                      <span>{errorCount} {errorCount === 1 ? 'con error' : 'con errores'}</span>
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Delimitador: <strong className="font-mono">{parseResult.resumen.delimitadorDetectado === '\t' ? 'TAB' : parseResult.resumen.delimitadorDetectado}</strong></span>
                  {parseResult.resumen.tieneEncabezado && <span className="ml-2 font-semibold text-emerald-800 dark:text-emerald-400">✓ Encabezado detectado</span>}
                </div>
              </div>

              {/* Error global (ej. > 500 filas) */}
              {parseResult.resumen.errorGlobal && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{parseResult.resumen.errorGlobal}</span>
                </div>
              )}

              {/* Tabla de Vista Previa */}
              {parseResult.filas.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="py-2 px-2.5 w-10 text-center">#</th>
                          <th className="py-2 px-2.5">Producto</th>
                          <th className="py-2 px-2.5">P. Compra</th>
                          <th className="py-2 px-2.5">P. Venta</th>
                          <th className="py-2 px-2.5">Stock</th>
                          <th className="py-2 px-2.5">Categoría</th>
                          <th className="py-2 px-2.5 text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {parseResult.filas.map((fila) => (
                          <tr
                            key={fila.numero}
                            className={`transition-colors ${
                              fila.esValida
                                ? 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                                : 'bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-50/70 dark:hover:bg-rose-950/30'
                            }`}
                          >
                            <td className="py-2 px-2.5 text-center font-mono text-[11px] text-slate-400">
                              {fila.numero}
                            </td>
                            <td className="py-2 px-2.5">
                              <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                                {fila.datos?.name}
                              </span>
                              {fila.datos?.barcode && (
                                <span className="text-[10px] text-slate-400 font-mono block">
                                  Cod: {fila.datos.barcode}
                                </span>
                              )}
                              {!fila.esValida && fila.errores.length > 0 && (
                                <div className="mt-1 space-y-0.5">
                                  {fila.errores.map((err, i) => (
                                    <span key={i} className="text-[10px] text-rose-600 dark:text-rose-400 flex items-center gap-1 font-medium">
                                      • {err}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2.5 font-mono text-slate-700 dark:text-slate-300">
                              {formatCurrency(fila.datos?.costPrice || 0)}
                            </td>
                            <td className="py-2 px-2.5 font-mono text-slate-900 dark:text-slate-100 font-bold">
                              {formatCurrency(fila.datos?.salePrice || 0)}
                            </td>
                            <td className="py-2 px-2.5 font-mono text-slate-700 dark:text-slate-300">
                              {fila.datos?.stock} {fila.datos?.unit || 'pza'}
                            </td>
                            <td className="py-2 px-2.5 text-slate-600 dark:text-slate-300">
                              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-medium">
                                {fila.datos?.category || 'General'}
                              </span>
                            </td>
                            <td className="py-2 px-2.5 text-center">
                              {fila.esValida ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400">
                                  <CheckCircle2 className="w-3 h-3" /> OK
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-400">
                                  <AlertCircle className="w-3 h-3" /> Error
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Barra de Progreso durante el guardado */}
          {isSaving && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-900 dark:text-emerald-200">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-700 dark:text-emerald-400" />
                  Guardando productos en la base de datos...
                </span>
                <span>{progress.saved} de {progress.total}</span>
              </div>
              <div className="w-full h-2.5 bg-emerald-100 dark:bg-emerald-900/60 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-700 dark:bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.saved / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Resumen Final tras guardar */}
          {saveSummary && (
            <div className={`p-4 rounded-2xl border ${
              saveSummary.error
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                : saveSummary.warning
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
            }`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                {saveSummary.error ? (
                  <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                ) : saveSummary.warning ? (
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                )}
                <span>
                  {saveSummary.error
                    ? 'Carga incompleta con errores'
                    : saveSummary.warning
                    ? 'Carga guardada con advertencias'
                    : '¡Carga completada con éxito!'}
                </span>
              </div>
              <p className="mt-1 text-xs">
                Se guardaron <strong>{saveSummary.saved}</strong> productos.
                {saveSummary.skipped > 0 && (
                  <span> Se omitieron <strong>{saveSummary.skipped}</strong> filas no válidas o fallidas.</span>
                )}
              </p>
              {saveSummary.warning && (
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-300 font-medium">
                  {saveSummary.warning}
                </p>
              )}
              {saveSummary.error && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                  Detalle del error: {saveSummary.error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer / Botones */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors disabled:opacity-50"
            >
              {saveSummary?.saved ? 'Cerrar' : 'Cancelar'}
            </button>

            {isSavedSuccessfully && (
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition-colors"
              >
                Nueva carga
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isSavedSuccessfully && errorCount > 0 && validCount > 0 && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                (Se omitirán {errorCount} {errorCount === 1 ? 'fila' : 'filas'})
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={validCount === 0 || isSaving || isSavedSuccessfully}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-md shadow-emerald-900/20 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <PackagePlus className="w-4 h-4" />
                  <span>Guardar {validCount} {validCount === 1 ? 'producto' : 'productos'}</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
