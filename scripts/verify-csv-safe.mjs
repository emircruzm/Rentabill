#!/usr/bin/env node
/**
 * scripts/verify-csv-safe.mjs
 *
 * Verificación exhaustiva de neutralizeCsvFormula (H-22).
 * Comprueba la neutralización de inyección de fórmulas en exportaciones CSV
 * ante caracteres detonantes (=, +, -, @, \t, \r), respetando espacios iniciales,
 * preservando cadenas normales, números, guiones intermedios y tolerando null/undefined.
 */

import { neutralizeCsvFormula } from '../src/shared/utils/csvSafe.ts';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FALLÓ: ${message}`);
  }
}

console.log('--- Verificación de neutralizeCsvFormula (H-22) ---');

// 1. Caso mínimo: =1+1
assert(neutralizeCsvFormula('=1+1') === "'=1+1", '1. "=1+1" se neutraliza anteponiendo apóstrofo');

// 2. Caso mínimo: +cmd|' /C calc'!A0
assert(
  neutralizeCsvFormula("+cmd|' /C calc'!A0") === "'+cmd|' /C calc'!A0",
  '2. "+cmd|\' /C calc\'!A0" se neutraliza anteponiendo apóstrofo'
);

// 3. Caso mínimo: -2+3
assert(neutralizeCsvFormula('-2+3') === "'-2+3", '3. "-2+3" se neutraliza anteponiendo apóstrofo');

// 4. Caso mínimo: @SUM(1+1)
assert(neutralizeCsvFormula('@SUM(1+1)') === "'@SUM(1+1)", '4. "@SUM(1+1)" se neutraliza anteponiendo apóstrofo');

// 5. Caso mínimo: =HYPERLINK("http://example.com","clic")
assert(
  neutralizeCsvFormula('=HYPERLINK("http://example.com","clic")') ===
    '\'=HYPERLINK("http://example.com","clic")',
  '5. "=HYPERLINK(...)" se neutraliza anteponiendo apóstrofo'
);

// 6. Caso mínimo: texto con tabulador inicial (\t)
assert(neutralizeCsvFormula('\tProductoTab') === "'\tProductoTab", '6. "\\tProductoTab" se neutraliza anteponiendo apóstrofo');

// 7. Caso mínimo: texto con retorno de carro inicial (\r)
assert(neutralizeCsvFormula('\rProductoCR') === "'\rProductoCR", '7. "\\rProductoCR" se neutraliza anteponiendo apóstrofo');

// 8. Caso mínimo: texto con espacios y luego =
assert(neutralizeCsvFormula('   =1+1') === "'   =1+1", '8. "   =1+1" se neutraliza anteponiendo apóstrofo');

// 9. Caso mínimo: Producto normal (sin cambios)
assert(neutralizeCsvFormula('Producto normal') === 'Producto normal', '9. "Producto normal" permanece sin cambios');

// 10. Caso mínimo: Coca-Cola 500ml (el guion en medio no cambia)
assert(neutralizeCsvFormula('Coca-Cola 500ml') === 'Coca-Cola 500ml', '10. "Coca-Cola 500ml" permanece sin cambios');

// 11. Caso mínimo: cadena vacía
assert(neutralizeCsvFormula('') === '', '11. Cadena vacía devuelve cadena vacía');

// 12. Caso mínimo: undefined
assert(neutralizeCsvFormula(undefined) === '', '12. undefined devuelve cadena vacía');

// 13. Caso mínimo: null
assert(neutralizeCsvFormula(null) === '', '13. null devuelve cadena vacía');

// 14. Caso mínimo: nombre que empiece con número (sin cambios)
assert(neutralizeCsvFormula('123 Producto') === '123 Producto', '14. "123 Producto" permanece sin cambios');

console.log('\n--- Casos Adicionales de Robustez y Cobertura ---');

// 15. Espacios iniciales y luego '+'
assert(neutralizeCsvFormula('  +cmd') === "'  +cmd", '15. "  +cmd" se neutraliza correctamente');

// 16. Espacios iniciales y luego '-'
assert(neutralizeCsvFormula('  -5') === "'  -5", '16. "  -5" se neutraliza correctamente');

// 17. Espacios iniciales y luego '@'
assert(neutralizeCsvFormula('  @SUM(1+1)') === "'  @SUM(1+1)", '17. "  @SUM(1+1)" se neutraliza correctamente');

// 18. Espacios iniciales y luego '\t'
assert(neutralizeCsvFormula('  \tTab') === "'  \tTab", '18. "  \\tTab" se neutraliza correctamente');

// 19. Espacios iniciales y luego '\r'
assert(neutralizeCsvFormula('  \rCR') === "'  \rCR", '19. "  \\rCR" se neutraliza correctamente');

// 20. Solo espacios en blanco
assert(neutralizeCsvFormula('   ') === '   ', '20. "   " (solo espacios) no se altera');

// 21. Solo caracteres detonantes aislados
assert(neutralizeCsvFormula('=') === "'=", '21. "=" aislado se neutraliza a "\'="');
assert(neutralizeCsvFormula('+') === "'+", '22. "+" aislado se neutraliza a "\'+"');
assert(neutralizeCsvFormula('-') === "'-", '23. "-" aislado se neutraliza a "\'-"');
assert(neutralizeCsvFormula('@') === "'@", '24. "@" aislado se neutraliza a "\'@\"');
assert(neutralizeCsvFormula('\t') === "'\t", '25. "\\t" aislado se neutraliza a "\'\\t"');
assert(neutralizeCsvFormula('\r') === "'\r", '26. "\\r" aislado se neutraliza a "\'\\r"');

// 22. Espacios iniciales con texto normal
assert(neutralizeCsvFormula('  Arroz Costeño 1kg') === '  Arroz Costeño 1kg', '27. "  Arroz Costeño 1kg" no se altera');

// 23. Código de barras normal vs malicioso
assert(neutralizeCsvFormula('7751234567890') === '7751234567890', '28. Código de barras numérico no se altera');
assert(neutralizeCsvFormula('=7751234567890') === "'=7751234567890", '29. Código de barras con "=" inicial se neutraliza');

// 24. Categoría normal vs maliciosa
assert(neutralizeCsvFormula('Abarrotes') === 'Abarrotes', '30. Categoría "Abarrotes" no se altera');
assert(neutralizeCsvFormula('@Categoría') === "'@Categoría", '31. Categoría "@Categoría" se neutraliza');

// 25. Simulación de formato CSV con comillas (flujo idéntico a downloadSalesExcel)
function formatCsvField(val) {
  return `"${neutralizeCsvFormula(val).replace(/"/g, '""')}"`;
}
assert(
  formatCsvField('=1+1') === '"\'=1+1"',
  '32. Formato CSV: "=1+1" se exporta como "\'\'=1+1"'
);
assert(
  formatCsvField('Arroz "Extra"') === '"Arroz ""Extra"""',
  '33. Formato CSV: texto con comillas normales preserva escape estándar sin apóstrofo'
);
assert(
  formatCsvField('=HYPERLINK("http://example.com","clic")') === '"\'=HYPERLINK(""http://example.com"",""clic"")"',
  '34. Formato CSV: fórmula con comillas neutraliza con apóstrofo y escapa comillas dobles'
);
assert(
  formatCsvField(null) === '""',
  '35. Formato CSV: null se exporta como campo vacío entre comillas'
);
assert(
  formatCsvField(undefined) === '""',
  '36. Formato CSV: undefined se exporta como campo vacío entre comillas'
);

console.log(`\nResumen: ${passedTests}/${totalTests} pruebas pasadas.`);

if (failedTests > 0) {
  console.error(`\n🚨 Fallaron ${failedTests} prueba(s).`);
  process.exit(1);
} else {
  console.log('\n✅ ¡Todas las pruebas de neutralización de fórmulas CSV pasaron exitosamente!');
}
