#!/usr/bin/env node
/**
 * scripts/verify-bulk-parse.mjs
 *
 * Verificación exhaustiva de la función pura parseBulkProducts.
 * Prueba encabezados, delimitadores (TAB, ;, ,), formatos de decimales,
 * duplicados locales y contra existentes, límites de filas (>500) y validaciones de campo.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBulkProducts } from '../src/application/logic/bulkProductParser.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Verificación de Lógica Pura: parseBulkProducts ---\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FALLA: ${message}`);
    throw new Error(`Prueba fallida: ${message}`);
  }
  passedTests++;
  console.log(`  ✓ ${message}`);
}

// ----------------------------------------------------------------------------
// 1. Texto vacío o solo espacios
// ----------------------------------------------------------------------------
console.log('1. Texto vacío o espacios:');
const resEmpty = parseBulkProducts('');
assert(resEmpty.filas.length === 0, 'No debe generar filas para texto vacío');
assert(resEmpty.resumen.total === 0, 'Total debe ser 0');
assert(!!resEmpty.resumen.errorGlobal, 'Debe indicar errorGlobal por texto vacío');

const resSpaces = parseBulkProducts('   \n  \r\n   ');
assert(resSpaces.filas.length === 0, 'No debe generar filas para espacios');

// ----------------------------------------------------------------------------
// 2. Con encabezado estándar
// ----------------------------------------------------------------------------
console.log('\n2. Con encabezado (separador coma):');
const csvWithHeader = `Nombre,Precio Compra,Precio Venta,Stock,Categoría,Código de Barras,SKU,Unidad
Arroz Costeño 1kg,3.80,4.50,20,Abarrotes,7750123456789,ARR-001,kg
Aceite Primor 1L,8.50,10.20,15,Abarrotes,,ACE-001,lt`;

const resHeader = parseBulkProducts(csvWithHeader);
assert(resHeader.resumen.tieneEncabezado === true, 'Debe detectar encabezado');
assert(resHeader.resumen.total === 2, 'Debe parsear 2 filas de datos (omitiendo encabezado)');
assert(resHeader.resumen.validas === 2, 'Las 2 filas deben ser válidas');
assert(resHeader.filas[0].datos.name === 'Arroz Costeño 1kg', 'Nombre del producto 1 correcto');
assert(resHeader.filas[0].datos.costPrice === 3.8, 'Costo producto 1 correcto');
assert(resHeader.filas[0].datos.salePrice === 4.5, 'Venta producto 1 correcto');
assert(resHeader.filas[0].datos.stock === 20, 'Stock producto 1 correcto');
assert(resHeader.filas[0].datos.unit === 'kg', 'Unidad producto 1 correcta');
assert(resHeader.filas[0].datos.barcode === '7750123456789', 'Código de barras producto 1 correcto');
assert(resHeader.filas[0].datos.sku === 'ARR-001', 'SKU producto 1 correcto');

// ----------------------------------------------------------------------------
// 3. Sin encabezado (formato estándar)
// ----------------------------------------------------------------------------
console.log('\n3. Sin encabezado:');
const csvNoHeader = `Galletas Margarita,1.20,1.80,50,Golosinas,7750001,GAL-01,pza
Chupetín Globo Pop,0.30,0.50,100,Golosinas,7750002,GLO-01,pza`;

const resNoHeader = parseBulkProducts(csvNoHeader);
assert(resNoHeader.resumen.tieneEncabezado === false, 'Debe detectar ausencia de encabezado');
assert(resNoHeader.resumen.total === 2, 'Debe parsear 2 filas');
assert(resNoHeader.resumen.validas === 2, '2 filas válidas');
assert(resNoHeader.filas[0].datos.name === 'Galletas Margarita', 'Nombre correcto en fila 1');
assert(resNoHeader.filas[1].datos.costPrice === 0.30, 'Costo correcto en fila 2');

// ----------------------------------------------------------------------------
// 4. Separador TAB (copiado de Excel)
// ----------------------------------------------------------------------------
console.log('\n4. Separador TAB (Excel):');
const tsvExcel = `Producto\tPrecio Compra\tPrecio Venta\tCantidad\tRubro\r\nLeche Evaporada\t3.50\t4.20\t24\tLácteos\r\nYogurt Fresa 1L\t5.50\t6.80\t12\tLácteos`;

const resTsv = parseBulkProducts(tsvExcel);
assert(resTsv.resumen.delimitadorDetectado === '\t', 'Debe detectar tabulación como delimitador');
assert(resTsv.resumen.total === 2, 'Debe procesar 2 filas');
assert(resTsv.resumen.validas === 2, '2 filas válidas');
assert(resTsv.filas[0].datos.name === 'Leche Evaporada', 'Nombre parseado');
assert(resTsv.filas[0].datos.stock === 24, 'Stock parseado desde columna "Cantidad"');

// ----------------------------------------------------------------------------
// 5. Separador punto y coma (;) con coma decimal
// ----------------------------------------------------------------------------
console.log('\n5. Separador punto y coma con coma decimal:');
const csvSemicolon = `Nombre;Costo;Venta;Stock;Categoria\nGaseosa Inca Kola 1.5L;4,20;5,50;18;Bebidas\nAgua San Luis 625ml;1,10;1,80;30;Bebidas`;

const resSemi = parseBulkProducts(csvSemicolon);
assert(resSemi.resumen.delimitadorDetectado === ';', 'Debe detectar punto y coma');
assert(resSemi.resumen.validas === 2, 'Debe aceptar coma decimal (4,20 -> 4.2)');
assert(resSemi.filas[0].datos.costPrice === 4.20, 'Costo decimal con coma parseado correctamente a 4.20');
assert(resSemi.filas[0].datos.salePrice === 5.50, 'Venta decimal con coma parseada correctamente a 5.50');

// ----------------------------------------------------------------------------
// 6. Decimales en stock (p. ej. kg, lt)
// ----------------------------------------------------------------------------
console.log('\n6. Decimales en stock:');
const csvDecimalStock = `Nombre,Precio Compra,Precio Venta,Stock,Categoría,Unidad
Queso Fresco Andino,18.00,24.00,12.750,Lácteos,kg
Pechuga de Pollo,12.50,16.80,8.325,Carnes,kg`;

const resDecStock = parseBulkProducts(csvDecimalStock);
assert(resDecStock.resumen.validas === 2, '2 filas válidas');
assert(resDecStock.filas[0].datos.stock === 12.750, 'Stock decimal 12.750 permitido');
assert(resDecStock.filas[1].datos.stock === 8.325, 'Stock decimal 8.325 permitido');

// ----------------------------------------------------------------------------
// 7. Duplicados dentro del archivo
// ----------------------------------------------------------------------------
console.log('\n7. Duplicados dentro del archivo:');
const csvDuplicatesInFile = `Nombre,Precio Compra,Precio Venta,Stock,Código de Barras,SKU
Arroz Superior,3.50,4.20,10,775111,SKU-A
arroz superior,3.50,4.20,15,775222,SKU-B
Fideos Cortos,2.00,2.50,20,775333,SKU-C
Fideos Largos,2.00,2.50,20,775333,SKU-D
Aceite Vegetal,7.00,8.50,10,775444,SKU-A`;

const resDupFile = parseBulkProducts(csvDuplicatesInFile);
assert(resDupFile.resumen.total === 5, 'Total 5 filas');
assert(resDupFile.filas[0].esValida === true, 'Fila 1 (primera aparición de Arroz Superior) es válida');
assert(resDupFile.filas[1].esValida === false, 'Fila 2 (arroz superior minúsculas) debe marcar error de nombre duplicado');
assert(resDupFile.filas[1].errores.some(e => e.includes('duplicado dentro del archivo')), 'Error de nombre duplicado claro');
assert(resDupFile.filas[3].esValida === false, 'Fila 4 (código 775333 duplicado) debe marcar error');
assert(resDupFile.filas[4].esValida === false, 'Fila 5 (SKU-A duplicado) debe marcar error');

// ----------------------------------------------------------------------------
// 8. Duplicados contra productos ya existentes en la tienda
// ----------------------------------------------------------------------------
console.log('\n8. Duplicados contra productos existentes:');
const existingProducts = [
  { id: '1', name: 'Atún Primor 170g', barcode: '775999001', sku: 'ATUN-01' },
];

const csvExistingDup = `Nombre,Precio Compra,Precio Venta,Stock,Código de Barras,SKU
atun primor 170g,4.00,5.00,10,775000,ATUN-99
Sardinas Campomar,3.20,4.00,12,775999001,SARD-01
Pescado Jurel,2.50,3.50,8,775888,ATUN-01
Atún Florida 170g,4.20,5.50,20,775777,ATUN-02`;

const resExistDup = parseBulkProducts(csvExistingDup, existingProducts);
assert(resExistDup.filas[0].esValida === false, 'Debe marcar error por nombre idéntico a existente');
assert(resExistDup.filas[1].esValida === false, 'Debe marcar error por código de barras existente');
assert(resExistDup.filas[2].esValida === false, 'Debe marcar error por SKU existente');
assert(resExistDup.filas[3].esValida === true, 'Fila 4 no colisiona y debe ser válida');

// ----------------------------------------------------------------------------
// 9. Límite máximo de 500 filas
// ----------------------------------------------------------------------------
console.log('\n9. Límite de más de 500 filas:');
const lines501 = ['Nombre,Precio Compra,Precio Venta,Stock'];
for (let i = 1; i <= 501; i++) {
  lines501.push(`Producto Test ${i},1.00,2.00,5`);
}
const csv501 = lines501.join('\n');
const res501 = parseBulkProducts(csv501);
assert(res501.filas.length === 0, 'No debe parsear filas si excede 500');
assert(!!res501.resumen.errorGlobal, 'Debe reportar errorGlobal');
assert(res501.resumen.errorGlobal.includes('límite máximo permitido de 500'), 'Mensaje de límite correcto');

// ----------------------------------------------------------------------------
// 10. Validaciones de campo (precios negativos, vacíos, categoría desconocida)
// ----------------------------------------------------------------------------
console.log('\n10. Validaciones de campos individuales:');
const knownCats = ['Abarrotes', 'Bebidas', 'Lácteos'];
const csvErrors = `Nombre,Precio Compra,Precio Venta,Stock,Categoría,Unidad
,3.00,4.00,10,Abarrotes,pza
Producto Costo Negativo,-2.00,4.00,10,Abarrotes,pza
Producto Venta Negativa,2.00,-4.00,10,Abarrotes,pza
Producto Stock Negativo,2.00,4.00,-5,Abarrotes,pza
Producto Categoria Inexistente,2.00,4.00,10,Ferreteria,pza
Producto Categoria Vacia,2.00,4.00,10,,pza
Producto Unidad Invalida,2.00,4.00,10,Abarrotes,tonelada`;

const resFields = parseBulkProducts(csvErrors, [], knownCats);
assert(resFields.filas[0].esValida === false && resFields.filas[0].errores.some(e => e.includes('nombre')), 'Nombre obligatorio');
assert(resFields.filas[1].esValida === false && resFields.filas[1].errores.some(e => e.includes('compra no puede ser negativo')), 'Costo negativo rechazado');
assert(resFields.filas[2].esValida === false && resFields.filas[2].errores.some(e => e.includes('venta no puede ser negativo')), 'Venta negativa rechazada');
assert(resFields.filas[3].esValida === false && resFields.filas[3].errores.some(e => e.includes('stock no puede ser negativo')), 'Stock negativo rechazado');
assert(resFields.filas[4].esValida === false && resFields.filas[4].errores.some(e => e.includes('Ferreteria')), 'Categoría desconocida reporta error');
assert(resFields.filas[5].esValida === true && resFields.filas[5].datos.category === 'General', 'Categoría vacía asigna "General" por defecto');
assert(resFields.filas[6].esValida === false && resFields.filas[6].errores.some(e => e.includes('tonelada')), 'Unidad inválida rechazada');

// ----------------------------------------------------------------------------
// 11. Límite de tamaño de texto (> 1 MB)
// ----------------------------------------------------------------------------
console.log('\n11. Límite de tamaño de texto (> 1 MB):');
const largeText = 'A'.repeat(1_000_001);
const resLarge = parseBulkProducts(largeText);
assert(resLarge.filas.length === 0, 'No debe generar filas si supera 1 MB');
assert(resLarge.resumen.total === 0, 'Total debe ser 0 para texto > 1 MB');
assert(!!resLarge.resumen.errorGlobal, 'Debe tener errorGlobal');
assert(resLarge.resumen.errorGlobal.includes('El archivo supera 1 MB'), 'Mensaje de error indica límite de 1 MB');

// ----------------------------------------------------------------------------
// 12. Verificación de fixtures CSV (carga-60, carga-60b, carga-mixta)
// ----------------------------------------------------------------------------
console.log('\n12. Verificación de fixtures CSV:');
const fixtureDir = path.join(__dirname, 'fixtures');
const carga60Csv = fs.readFileSync(path.join(fixtureDir, 'carga-60.csv'), 'utf8');
const carga60bCsv = fs.readFileSync(path.join(fixtureDir, 'carga-60b.csv'), 'utf8');
const cargaMixtaCsv = fs.readFileSync(path.join(fixtureDir, 'carga-mixta.csv'), 'utf8');

// 12a. carga-60.csv con categoriasConocidas = ['General'] y existentes = []
const resCarga60 = parseBulkProducts(carga60Csv, [], ['General']);
assert(resCarga60.resumen.total === 60, 'carga-60.csv debe tener 60 filas totales');
assert(resCarga60.resumen.validas === 60, 'carga-60.csv: 60 válidas');
assert(resCarga60.resumen.conError === 0, 'carga-60.csv: 0 errores');

// 12b. carga-60b.csv con categoriasConocidas = ['General'] y existentes = []
const resCarga60b = parseBulkProducts(carga60bCsv, [], ['General']);
assert(resCarga60b.resumen.total === 60, 'carga-60b.csv debe tener 60 filas totales');
assert(resCarga60b.resumen.validas === 60, 'carga-60b.csv: 60 válidas');
assert(resCarga60b.resumen.conError === 0, 'carga-60b.csv: 0 errores');

// Comprobar que no hay ningún nombre/código/SKU en común entre carga-60 y carga-60b
const names60 = new Set(resCarga60.filas.map(f => f.datos.name.toLowerCase()));
const barcodes60 = new Set(resCarga60.filas.filter(f => f.datos.barcode).map(f => f.datos.barcode.toLowerCase()));
const skus60 = new Set(resCarga60.filas.filter(f => f.datos.sku).map(f => f.datos.sku.toLowerCase()));

let commonCount = 0;
for (const f of resCarga60b.filas) {
  if (names60.has(f.datos.name.toLowerCase())) commonCount++;
  if (f.datos.barcode && barcodes60.has(f.datos.barcode.toLowerCase())) commonCount++;
  if (f.datos.sku && skus60.has(f.datos.sku.toLowerCase())) commonCount++;
}
assert(commonCount === 0, 'carga-60b.csv sin ningún nombre/código/SKU en común con carga-60.csv');

// 12c. carga-mixta.csv con existentes = los 60 productos de carga-60.csv
const existing60 = resCarga60.filas.map(f => ({
  name: f.datos.name,
  barcode: f.datos.barcode,
  sku: f.datos.sku,
}));

const resMixta = parseBulkProducts(cargaMixtaCsv, existing60, ['General']);
assert(resMixta.resumen.total === 10, 'carga-mixta.csv debe tener 10 filas totales');
assert(resMixta.resumen.validas === 6, 'carga-mixta.csv: exactamente 6 válidas');
assert(resMixta.resumen.conError === 4, 'carga-mixta.csv: exactamente 4 con error');

console.log('   Mensajes de los errores detectados en carga-mixta.csv:');
resMixta.filas.filter(f => !f.esValida).forEach(f => {
  console.log(`    - Fila ${f.numero}: ${f.errores.join('; ')}`);
});

// 12d. carga-60c.csv con categoriasConocidas = ['General'] y existentes = []
const carga60cCsv = fs.readFileSync(path.join(fixtureDir, 'carga-60c.csv'), 'utf8');
const resCarga60c = parseBulkProducts(carga60cCsv, [], ['General']);
assert(resCarga60c.resumen.total === 60, 'carga-60c.csv debe tener 60 filas totales');
assert(resCarga60c.resumen.validas === 60, 'carga-60c.csv: 60 válidas');
assert(resCarga60c.resumen.conError === 0, 'carga-60c.csv: 0 errores');

// 12e. carga-500.csv con categoriasConocidas = ['General'] y existentes = []
const carga500Csv = fs.readFileSync(path.join(fixtureDir, 'carga-500.csv'), 'utf8');
const resCarga500 = parseBulkProducts(carga500Csv, [], ['General']);
assert(resCarga500.resumen.total === 500, 'carga-500.csv debe tener 500 filas totales');
assert(resCarga500.resumen.validas === 500, 'carga-500.csv: 500 válidas');
assert(resCarga500.resumen.conError === 0, 'carga-500.csv: 0 errores');

// 12f. Sin coincidencias de nombres/códigos/SKU entre carga-60, carga-60b, carga-60c y carga-500
const allDatasets = [
  { name: 'carga-60', filas: resCarga60.filas },
  { name: 'carga-60b', filas: resCarga60b.filas },
  { name: 'carga-60c', filas: resCarga60c.filas },
  { name: 'carga-500', filas: resCarga500.filas },
];

for (let i = 0; i < allDatasets.length; i++) {
  for (let j = i + 1; j < allDatasets.length; j++) {
    const d1 = allDatasets[i];
    const d2 = allDatasets[j];
    const setNames = new Set(d1.filas.map(f => f.datos.name.toLowerCase()));
    const setBars = new Set(d1.filas.filter(f => f.datos.barcode).map(f => f.datos.barcode.toLowerCase()));
    const setSkus = new Set(d1.filas.filter(f => f.datos.sku).map(f => f.datos.sku.toLowerCase()));

    let collisions = 0;
    for (const f of d2.filas) {
      if (setNames.has(f.datos.name.toLowerCase())) collisions++;
      if (f.datos.barcode && setBars.has(f.datos.barcode.toLowerCase())) collisions++;
      if (f.datos.sku && setSkus.has(f.datos.sku.toLowerCase())) collisions++;
    }
    assert(collisions === 0, `${d1.name} y ${d2.name} sin nombres/códigos/SKUs en común`);
  }
}

console.log(`\n=======================================================`);
console.log(`✅ ¡Todas las ${passedTests} de ${totalTests} pruebas pasaron exitosamente!`);
console.log(`=======================================================\n`);
