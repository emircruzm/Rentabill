import type { Product, ProductUnit } from '../../shared/types/index.ts';
import { perfStart, perfEnd } from '../../shared/utils/perf.ts';

export const MAX_BULK_PRODUCTS = 500;

export interface BulkProductInput {
  name: string;
  costPrice: number;
  salePrice: number;
  stock: number;
  unit: ProductUnit;
  category: string;
  categoryId?: string;
  barcode?: string | null;
  sku?: string | null;
}

export interface ParsedBulkRow {
  numero: number; // 1-based index
  datos: BulkProductInput | null;
  errores: string[];
  esValida: boolean;
}

export interface BulkParseResult {
  filas: ParsedBulkRow[];
  resumen: {
    total: number;
    validas: number;
    conError: number;
    errorGlobal?: string;
    delimitadorDetectado: string;
    tieneEncabezado: boolean;
  };
}

export interface ExistingProductMinimal {
  id?: string;
  name: string;
  barcode?: string | null;
  sku?: string | null;
}

export type KnownCategoryItem = string | { id: string; name: string };

/**
 * Detecta el delimitador más probable en un texto (\t, ;, ,).
 */
export function detectDelimiter(firstLines: string[]): '\t' | ';' | ',' {
  let tabs = 0;
  let semicolons = 0;
  let commas = 0;

  for (const line of firstLines) {
    if (!line.trim()) continue;
    for (const char of line) {
      if (char === '\t') tabs++;
      else if (char === ';') semicolons++;
      else if (char === ',') commas++;
    }
  }

  if (tabs > 0 && tabs >= semicolons && tabs >= commas) return '\t';
  if (semicolons > 0 && semicolons >= commas) return ';';
  return ',';
}

/**
 * Divide una línea respetando comillas dobles (RFC 4180 básico).
 */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // saltar comilla escapada
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Determina si la primera fila es un encabezado analizando sus nombres y tipos.
 */
export function isHeaderRow(fields: string[]): boolean {
  if (fields.length === 0) return false;
  const headerKeywords = [
    'nombre', 'producto', 'name', 'item', 'descrip', 'articulo', 'artículo',
    'precio', 'costo', 'cost_price', 'sale_price', 'stock', 'cantidad',
    'categoria', 'categoría', 'category', 'codigo', 'código', 'barcode',
    'sku', 'unidad', 'unit'
  ];

  const firstFieldLower = fields[0].toLowerCase();
  for (const kw of headerKeywords) {
    if (firstFieldLower.includes(kw)) return true;
  }

  // Si varias columnas coinciden con palabras clave de encabezado
  let keywordMatches = 0;
  for (const f of fields) {
    const lower = f.toLowerCase();
    if (headerKeywords.some(kw => lower.includes(kw))) {
      keywordMatches++;
    }
  }
  return keywordMatches >= 2;
}

/**
 * Mapea nombres de encabezado a índices conocidos de columna.
 */
interface ColumnIndices {
  name: number;
  costPrice: number;
  salePrice: number;
  stock: number;
  category: number;
  barcode: number;
  sku: number;
  unit: number;
}

function resolveColumnIndices(headerFields: string[]): ColumnIndices {
  const indices: ColumnIndices = {
    name: -1,
    costPrice: -1,
    salePrice: -1,
    stock: -1,
    category: -1,
    barcode: -1,
    sku: -1,
    unit: -1,
  };

  headerFields.forEach((field, idx) => {
    const lower = field.toLowerCase().replace(/[^a-z0-9áéíóúñ]/g, ' ').trim();
    if (indices.name === -1 && (lower.includes('nombre') || lower.includes('producto') || lower.includes('name') || lower.includes('articulo'))) {
      indices.name = idx;
    } else if (indices.costPrice === -1 && (lower.includes('compra') || lower.includes('costo') || lower.includes('cost') || lower.includes('precio compra') || lower.includes('pc'))) {
      indices.costPrice = idx;
    } else if (indices.salePrice === -1 && (lower.includes('venta') || lower.includes('pvp') || lower.includes('sale') || lower.includes('precio venta') || lower === 'precio')) {
      indices.salePrice = idx;
    } else if (indices.stock === -1 && (lower.includes('stock') || lower.includes('cantidad') || lower.includes('unidades') || lower.includes('inventario'))) {
      indices.stock = idx;
    } else if (indices.category === -1 && (lower.includes('categoria') || lower.includes('categoría') || lower.includes('category') || lower.includes('rubro'))) {
      indices.category = idx;
    } else if (indices.barcode === -1 && (lower.includes('barcode') || lower.includes('barra') || lower.includes('barras') || lower === 'codigo' || lower === 'código')) {
      indices.barcode = idx;
    } else if (indices.sku === -1 && (lower.includes('sku') || lower.includes('codigo interno') || lower.includes('código interno'))) {
      indices.sku = idx;
    } else if (indices.unit === -1 && (lower.includes('unidad') || lower.includes('unit') || lower.includes('medida'))) {
      indices.unit = idx;
    }
  });

  return indices;
}

function normalizeKey(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza y analiza un número admitiendo coma o punto según el delimitador.
 */
function parseNumber(valueStr: string, delimiter: string): number | null {
  if (!valueStr) return null;
  let clean = valueStr.trim().replace(/[$S/€\s]/g, '');

  if (delimiter === ',') {
    // Si el separador CSV es coma, los decimales usan punto
    clean = clean.replace(/,/g, '');
  } else {
    // Si el separador es tab o punto y coma, permite coma decimal
    if (clean.includes(',') && !clean.includes('.')) {
      clean = clean.replace(',', '.');
    } else if (clean.includes(',') && clean.includes('.')) {
      // Formato con miles y decimales
      if (clean.indexOf('.') < clean.indexOf(',')) {
        clean = clean.replace(/\./g, '').replace(',', '.');
      } else {
        clean = clean.replace(/,/g, '');
      }
    }
  }

  const num = Number(clean);
  return Number.isFinite(num) ? num : null;
}

/**
 * Función pura que analiza y valida un texto (Excel/CSV) con productos en lote.
 *
 * @param texto Contenido en texto plano copiado de Excel o extraído de CSV
 * @param existentes Lista de productos ya existentes en la tienda
 * @param categoriasConocidas Lista de categorías existentes en la tienda
 */
export function parseBulkProducts(
  texto: string,
  existentes: ExistingProductMinimal[] = [],
  categoriasConocidas: KnownCategoryItem[] = []
): BulkParseResult {
  perfStart('bulk:parse');

  if (texto && texto.length > 1_000_000) {
    perfEnd('bulk:parse');
    return {
      filas: [],
      resumen: {
        total: 0,
        validas: 0,
        conError: 0,
        errorGlobal: 'El archivo supera 1 MB. Una carga admite hasta 500 filas.',
        delimitadorDetectado: ',',
        tieneEncabezado: false,
      },
    };
  }

  if (!texto || !texto.trim()) {
    perfEnd('bulk:parse');
    return {
      filas: [],
      resumen: {
        total: 0,
        validas: 0,
        conError: 0,
        errorGlobal: 'El texto o archivo está vacío.',
        delimitadorDetectado: ',',
        tieneEncabezado: false,
      },
    };
  }

  // Dividir líneas
  const rawLines = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmptyLines = rawLines.filter(l => l.trim().length > 0);

  if (nonEmptyLines.length === 0) {
    perfEnd('bulk:parse');
    return {
      filas: [],
      resumen: {
        total: 0,
        validas: 0,
        conError: 0,
        errorGlobal: 'No se encontraron filas con datos.',
        delimitadorDetectado: ',',
        tieneEncabezado: false,
      },
    };
  }

  // Detectar delimitador
  const delimiter = detectDelimiter(nonEmptyLines.slice(0, 5));

  // Verificar si hay encabezado
  const firstLineFields = splitCsvLine(nonEmptyLines[0], delimiter);
  const hasHeader = isHeaderRow(firstLineFields);

  const dataLines = hasHeader ? nonEmptyLines.slice(1) : nonEmptyLines;

  // Límite de 500 filas
  if (dataLines.length > MAX_BULK_PRODUCTS) {
    perfEnd('bulk:parse');
    return {
      filas: [],
      resumen: {
        total: dataLines.length,
        validas: 0,
        conError: dataLines.length,
        errorGlobal: `El archivo contiene ${dataLines.length} filas de datos, superando el límite máximo permitido de ${MAX_BULK_PRODUCTS} productos por carga. Divide el archivo en partes más pequeñas.`,
        delimitadorDetectado: delimiter,
        tieneEncabezado: hasHeader,
      },
    };
  }

  // Índices de columnas
  let colIndices: ColumnIndices;
  if (hasHeader) {
    colIndices = resolveColumnIndices(firstLineFields);
    // Si alguna columna requerida básica no se encontró por nombre, usar posiciones por defecto si son válidas
    if (colIndices.name === -1) colIndices.name = 0;
    if (colIndices.costPrice === -1) colIndices.costPrice = 1;
    if (colIndices.salePrice === -1) colIndices.salePrice = 2;
    if (colIndices.stock === -1) colIndices.stock = 3;
  } else {
    // Sin encabezado: Orden estándar posicional
    colIndices = {
      name: 0,
      costPrice: 1,
      salePrice: 2,
      stock: 3,
      category: 4,
      barcode: 5,
      sku: 6,
      unit: 7,
    };
  }

  // Mapas para verificar duplicados en el lote actual
  const seenLowerNamesInFile = new Map<string, number>(); // normalizedName -> primera fila
  const seenBarcodesInFile = new Map<string, number>();   // barcode -> primera fila
  const seenSkusInFile = new Map<string, number>();       // sku -> primera fila

  // Conjuntos para verificar duplicados contra existentes
  const existingLowerNames = new Set(existentes.map(p => normalizeKey(p.name || '')));
  const existingBarcodes = new Set(
    existentes.filter(p => p.barcode && p.barcode.trim()).map(p => p.barcode!.trim().toLowerCase())
  );
  const existingSkus = new Set(
    existentes.filter(p => p.sku && p.sku.trim()).map(p => p.sku!.trim().toLowerCase())
  );

  // Normalizar lista de categorías conocidas
  const knownCategoriesMap = new Map<string, { id?: string; name: string }>();
  for (const cat of categoriasConocidas) {
    if (typeof cat === 'string') {
      knownCategoriesMap.set(cat.trim().toLowerCase(), { name: cat.trim() });
    } else if (cat && cat.name) {
      knownCategoriesMap.set(cat.name.trim().toLowerCase(), { id: cat.id, name: cat.name.trim() });
    }
  }

  const filas: ParsedBulkRow[] = [];
  let validCount = 0;
  let errorCount = 0;

  dataLines.forEach((line, index) => {
    const rowNumber = hasHeader ? index + 2 : index + 1;
    const fields = splitCsvLine(line, delimiter);
    const errors: string[] = [];

    // 1. Nombre (Obligatorio)
    const rawName = colIndices.name >= 0 && colIndices.name < fields.length ? fields[colIndices.name] : '';
    const name = rawName.trim();
    if (!name) {
      errors.push('El nombre del producto es obligatorio.');
    }

    // 2. Precio de Costo (Obligatorio, >= 0)
    const rawCost = colIndices.costPrice >= 0 && colIndices.costPrice < fields.length ? fields[colIndices.costPrice] : '';
    const costPrice = parseNumber(rawCost, delimiter);
    if (costPrice === null || isNaN(costPrice)) {
      errors.push(`Precio de compra inválido: "${rawCost || '(vacío)'}". Debe ser un número.`);
    } else if (costPrice < 0) {
      errors.push('El precio de compra no puede ser negativo.');
    }

    // 3. Precio de Venta (Obligatorio, >= 0)
    const rawSale = colIndices.salePrice >= 0 && colIndices.salePrice < fields.length ? fields[colIndices.salePrice] : '';
    const salePrice = parseNumber(rawSale, delimiter);
    if (salePrice === null || isNaN(salePrice)) {
      errors.push(`Precio de venta inválido: "${rawSale || '(vacío)'}". Debe ser un número.`);
    } else if (salePrice < 0) {
      errors.push('El precio de venta no puede ser negativo.');
    }

    // 4. Stock (Obligatorio, >= 0, admite decimales hasta 3 posiciones)
    const rawStock = colIndices.stock >= 0 && colIndices.stock < fields.length ? fields[colIndices.stock] : '0';
    let stock = parseNumber(rawStock, delimiter);
    if (stock === null || isNaN(stock)) {
      // Si la columna está vacía, asumir 0 por defecto si hay precios
      if (!rawStock || !rawStock.trim()) {
        stock = 0;
      } else {
        errors.push(`Stock inválido: "${rawStock}". Debe ser un número.`);
      }
    } else if (stock < 0) {
      errors.push('El stock no puede ser negativo.');
    }

    // 5. Categoría (Opcional, default "General")
    const rawCat = colIndices.category >= 0 && colIndices.category < fields.length ? fields[colIndices.category] : '';
    const catTrimmed = rawCat.trim();
    let finalCategory = 'General';
    let finalCategoryId: string | undefined = undefined;

    if (catTrimmed) {
      const lowerCat = catTrimmed.toLowerCase();
      if (knownCategoriesMap.size > 0) {
        const found = knownCategoriesMap.get(lowerCat);
        if (found) {
          finalCategory = found.name;
          finalCategoryId = found.id;
        } else {
          // Decisión: si el usuario especifica una categoría que no existe, marcamos error claro
          errors.push(`La categoría "${catTrimmed}" no existe en la tienda. Déjala vacía para usar "General" o créala primero.`);
          finalCategory = catTrimmed;
        }
      } else {
        finalCategory = catTrimmed;
      }
    } else {
      // Si viene vacía, usa "General" por defecto
      finalCategory = 'General';
      const generalFound = knownCategoriesMap.get('general');
      if (generalFound) {
        finalCategoryId = generalFound.id;
      }
    }

    // 6. Código de barras (Opcional)
    const rawBarcode = colIndices.barcode >= 0 && colIndices.barcode < fields.length ? fields[colIndices.barcode] : '';
    const barcode = rawBarcode.trim() ? rawBarcode.trim() : null;

    // 7. SKU (Opcional)
    const rawSku = colIndices.sku >= 0 && colIndices.sku < fields.length ? fields[colIndices.sku] : '';
    const sku = rawSku.trim() ? rawSku.trim() : null;

    // 8. Unidad (Opcional, default "pza")
    const rawUnit = colIndices.unit >= 0 && colIndices.unit < fields.length ? fields[colIndices.unit] : '';
    let unit: ProductUnit = 'pza';
    if (rawUnit.trim()) {
      const uLower = rawUnit.trim().toLowerCase();
      if (uLower === 'pza' || uLower === 'pieza' || uLower === 'unid' || uLower === 'unidad') {
        unit = 'pza';
      } else if (uLower === 'kg' || uLower === 'kilo' || uLower === 'kilogramo') {
        unit = 'kg';
      } else if (uLower === 'lt' || uLower === 'litro' || uLower === 'l') {
        unit = 'lt';
      } else if (uLower === 'caja' || uLower === 'cj') {
        unit = 'caja';
      } else {
        errors.push(`Unidad "${rawUnit.trim()}" no válida. Usa: pza, kg, lt o caja.`);
      }
    }

    // Validaciones de unicidad si los datos base están limpios
    if (name) {
      const normName = normalizeKey(name);
      if (seenLowerNamesInFile.has(normName)) {
        const prevRow = seenLowerNamesInFile.get(normName)!;
        errors.push(`Nombre duplicado dentro del archivo (idéntico al de la fila ${prevRow}).`);
      } else {
        seenLowerNamesInFile.set(normName, rowNumber);
      }

      if (existingLowerNames.has(normName)) {
        errors.push(`Ya existe un producto con el nombre "${name}" en la tienda.`);
      }
    }

    if (barcode) {
      const lowerBarcode = barcode.toLowerCase();
      if (seenBarcodesInFile.has(lowerBarcode)) {
        const prevRow = seenBarcodesInFile.get(lowerBarcode)!;
        errors.push(`Código de barras duplicado dentro del archivo (fila ${prevRow}).`);
      } else {
        seenBarcodesInFile.set(lowerBarcode, rowNumber);
      }

      if (existingBarcodes.has(lowerBarcode)) {
        errors.push(`Ya existe un producto con el código de barras "${barcode}" en la tienda.`);
      }
    }

    if (sku) {
      const lowerSku = sku.toLowerCase();
      if (seenSkusInFile.has(lowerSku)) {
        const prevRow = seenSkusInFile.get(lowerSku)!;
        errors.push(`SKU duplicado dentro del archivo (fila ${prevRow}).`);
      } else {
        seenSkusInFile.set(lowerSku, rowNumber);
      }

      if (existingSkus.has(lowerSku)) {
        errors.push(`Ya existe un producto con el SKU "${sku}" en la tienda.`);
      }
    }

    const esValida = errors.length === 0;
    if (esValida) {
      validCount++;
      filas.push({
        numero: rowNumber,
        esValida: true,
        errores: [],
        datos: {
          name,
          costPrice: costPrice!,
          salePrice: salePrice!,
          stock: stock !== null ? stock : 0,
          unit,
          category: finalCategory,
          categoryId: finalCategoryId,
          barcode,
          sku,
        },
      });
    } else {
      errorCount++;
      filas.push({
        numero: rowNumber,
        esValida: false,
        errores: errors,
        datos: {
          name: name || rawName || '(sin nombre)',
          costPrice: costPrice !== null && !isNaN(costPrice) ? costPrice : 0,
          salePrice: salePrice !== null && !isNaN(salePrice) ? salePrice : 0,
          stock: stock !== null && !isNaN(stock) ? stock : 0,
          unit,
          category: finalCategory,
          categoryId: finalCategoryId,
          barcode,
          sku,
        },
      });
    }
  });

  perfEnd('bulk:parse');

  return {
    filas,
    resumen: {
      total: filas.length,
      validas: validCount,
      conError: errorCount,
      delimitadorDetectado: delimiter,
      tieneEncabezado: hasHeader,
    },
  };
}
