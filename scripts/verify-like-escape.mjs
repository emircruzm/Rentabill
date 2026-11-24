#!/usr/bin/env node
/**
 * scripts/verify-like-escape.mjs
 *
 * Verificación exhaustiva de escapeLikePattern y pickExactIgnoreCase (H-03).
 * Comprueba el escape correcto de caracteres comodín (\, %, _), la preservación
 * de '*' y caracteres normales/UTF-8, y la selección exacta case-insensitive en JS.
 */

import { escapeLikePattern, pickExactIgnoreCase } from '../src/shared/utils/likeEscape.ts';

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

console.log('--- Verificación de escapeLikePattern (H-03) ---');

// 1. Cadena vacía
assert(escapeLikePattern('') === '', '1. Cadena vacía devuelve cadena vacía');

// 2. Solo "%"
assert(escapeLikePattern('%') === '\\%', '2. "%" se escapa a "\\%"');

// 3. Solo "_"
assert(escapeLikePattern('_') === '\\_', '3. "_" se escapa a "\\_"');

// 4. Solo "*" (se preserva según especificación de PostgREST)
assert(escapeLikePattern('*') === '*', '4. "*" se preserva tal cual (se filtra en JS)');

// 5. Solo "\"
assert(escapeLikePattern('\\') === '\\\\', '5. "\\" se escapa a "\\\\"');

// 6. Texto con % ("100%")
assert(escapeLikePattern('100%') === '100\\%', '6. "100%" se escapa a "100\\%"');

// 7. Texto con _ ("A_B")
assert(escapeLikePattern('A_B') === 'A\\_B', '7. "A_B" se escapa a "A\\_B"');

// 8. Texto con \ ("a\\b")
assert(escapeLikePattern('a\\b') === 'a\\\\b', '8. "a\\b" se escapa a "a\\\\b"');

// 9. Combinación "%_%"
assert(escapeLikePattern('%_%') === '\\%\\_\\%', '9. "%_%" se escapa a "\\%\\_\\%"');

// 10. Caracteres Unicode / tildes / ñ
assert(escapeLikePattern('Ñandú') === 'Ñandú', '10. "Ñandú" no sufre alteraciones');

// 11. Espacios en blanco
assert(escapeLikePattern('   ') === '   ', '11. Espacios en blanco se preservan');

// 12. Espacios alrededor de comodín
assert(escapeLikePattern('  %  ') === '  \\%  ', '12. "  %  " se escapa a "  \\%  "');

// 13. Combinación múltiple: "10_000% \\ total"
assert(escapeLikePattern('10_000% \\ total') === '10\\_000\\% \\\\ total', '13. "10_000% \\ total" escapa correctamente');

// 14. Todos los comodines juntos: "a%b_c\\d*e"
assert(escapeLikePattern('a%b_c\\d*e') === 'a\\%b\\_c\\\\d*e', '14. "a%b_c\\d*e" escapa %, _ y \\ preservando *');

// 15. Texto largo de 10.000 caracteres sin comodines
const text10k = 'a'.repeat(10000);
assert(escapeLikePattern(text10k) === text10k, '15. Texto de 10.000 caracteres normales permanece idéntico');

// 16. Texto largo de 10.000 caracteres "%"
const pcts10k = '%'.repeat(10000);
const expectedPcts10k = '\\%'.repeat(10000);
assert(escapeLikePattern(pcts10k) === expectedPcts10k, '16. Texto de 10.000 comodines "%" escapa todos a "\\%"');

// 17. Null / undefined
assert(escapeLikePattern(null) === '', '17. null devuelve cadena vacía');
assert(escapeLikePattern(undefined) === '', '17b. undefined devuelve cadena vacía');

console.log('\n--- Verificación de pickExactIgnoreCase (H-03) ---');

const sampleRows = [
  { id: '1', name: 'Bebidas' },
  { id: '2', name: '100%' },
  { id: '3', name: 'A_B' },
  { id: '4', name: 'A*' },
  { id: '5', name: '  Lácteos  ' },
  { id: '6', name: null },
  { id: '7', name: undefined },
];

// 18. Coincidencia idéntica
const r18 = pickExactIgnoreCase(sampleRows, r => r.name, 'Bebidas');
assert(r18?.id === '1', '18. Coincidencia idéntica encuentra "Bebidas"');

// 19. Case-insensitive minúsculas
const r19 = pickExactIgnoreCase(sampleRows, r => r.name, 'bebidas');
assert(r19?.id === '1', '19. Minúsculas "bebidas" encuentra "Bebidas"');

// 20. Case-insensitive mayúsculas
const r20 = pickExactIgnoreCase(sampleRows, r => r.name, 'BEBIDAS');
assert(r20?.id === '1', '20. Mayúsculas "BEBIDAS" encuentra "Bebidas"');

// 21. Target con espacios perimetrales
const r21 = pickExactIgnoreCase(sampleRows, r => r.name, '  bebidas  ');
assert(r21?.id === '1', '21. Objetivo con espacios "  bebidas  " encuentra "Bebidas"');

// 22. Fila en BD con espacios perimetrales
const r22 = pickExactIgnoreCase(sampleRows, r => r.name, 'lácteos');
assert(r22?.id === '5', '22. Encuentra fila con espacios perimetrales ("  Lácteos  ")');

// 23. Búsqueda literal de "100%"
const r23 = pickExactIgnoreCase(sampleRows, r => r.name, '100%');
assert(r23?.id === '2', '23. "100%" encuentra exactamente "100%"');

// 24. Búsqueda literal de "A_B"
const r24 = pickExactIgnoreCase(sampleRows, r => r.name, 'A_B');
assert(r24?.id === '3', '24. "A_B" encuentra exactamente "A_B"');

// 25. Búsqueda literal de "A*" no confunde con comodín
const r25 = pickExactIgnoreCase(sampleRows, r => r.name, 'A*');
assert(r25?.id === '4', '25. "A*" encuentra exactamente "A*"');

// 26. "A_B" no coincide con "ACB"
const r26 = pickExactIgnoreCase([{ id: '9', name: 'ACB' }], r => r.name, 'A_B');
assert(r26 === null, '26. "A_B" no coincide con "ACB"');

// 27. "A*" no coincide con "ABC"
const r27 = pickExactIgnoreCase([{ id: '10', name: 'ABC' }], r => r.name, 'A*');
assert(r27 === null, '27. "A*" no coincide con "ABC"');

// 28. Tolerancia a filas con name = null o undefined
const r28 = pickExactIgnoreCase(sampleRows, r => r.name, 'Inexistente');
assert(r28 === null, '28. No lanza error al evaluar null/undefined y devuelve null si no existe');

// 29. Lista vacía devuelve null
const r29 = pickExactIgnoreCase([], r => r.name, 'Bebidas');
assert(r29 === null, '29. Lista vacía devuelve null');

// 30. Primer elemento devuelto cuando hay duplicados
const duplicates = [
  { id: 'first', name: 'General' },
  { id: 'second', name: 'general' },
];
const r30 = pickExactIgnoreCase(duplicates, r => r.name, 'GENERAL');
assert(r30?.id === 'first', '30. Retorna la primera coincidencia en caso de duplicados');

console.log('\n=======================================================');
if (failedTests === 0) {
  console.log(`✅ ¡Todas las ${passedTests} de ${totalTests} pruebas de like-escape pasaron exitosamente!`);
} else {
  console.error(`❌ Fallaron ${failedTests} de ${totalTests} pruebas.`);
  process.exit(1);
}
console.log('=======================================================');
