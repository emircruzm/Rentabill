#!/usr/bin/env node
/**
 * scripts/verify-password-change.mjs
 *
 * Verificación exhaustiva de la función validatePasswordChange (src/shared/utils/passwordChange.ts).
 * Valida las reglas en su estricto orden de prioridad, sanitización y casos límite.
 */

import { validatePasswordChange } from '../src/shared/utils/passwordChange.ts';
import { PASSWORD_TOO_SHORT_MESSAGE } from '../src/shared/utils/passwordPolicy.ts';

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

console.log('--- Verificación de Validación de Cambio de Contraseña (validatePasswordChange) ---\n');

// 1. Regla 1: actual vacía
assert(
  validatePasswordChange('', 'nuevaClave123', 'nuevaClave123') === 'Escribe tu contraseña actual.',
  '1. Actual vacía devuelve "Escribe tu contraseña actual."'
);

// 2. Regla 1: actual con solo espacios
assert(
  validatePasswordChange('   ', 'nuevaClave123', 'nuevaClave123') === 'Escribe tu contraseña actual.',
  '2. Actual con solo espacios devuelve "Escribe tu contraseña actual."'
);

// 3. Regla 2: nueva vacía
assert(
  validatePasswordChange('actualClave123', '', '') === 'Escribe tu nueva contraseña.',
  '3. Nueva vacía devuelve "Escribe tu nueva contraseña."'
);

// 4. Regla 2: nueva con solo espacios
assert(
  validatePasswordChange('actualClave123', '   ', '   ') === 'Escribe tu nueva contraseña.',
  '4. Nueva con solo espacios devuelve "Escribe tu nueva contraseña."'
);

// 5. Regla 3: confirmación vacía
assert(
  validatePasswordChange('actualClave123', 'nuevaClave123', '') === 'Confirma tu nueva contraseña.',
  '5. Confirmación vacía devuelve "Confirma tu nueva contraseña."'
);

// 6. Regla 3: confirmación con solo espacios
assert(
  validatePasswordChange('actualClave123', 'nuevaClave123', '   ') === 'Confirma tu nueva contraseña.',
  '6. Confirmación con solo espacios devuelve "Confirma tu nueva contraseña."'
);

// 7. Regla 4: no coinciden
assert(
  validatePasswordChange('actualClave123', 'nuevaClave123', 'otraClave456') === 'Las contraseñas no coinciden.',
  '7. No coinciden devuelve "Las contraseñas no coinciden."'
);

// 8. Regla 5: igual a la actual
assert(
  validatePasswordChange('mismaClave123', 'mismaClave123', 'mismaClave123') === 'La nueva contraseña debe ser diferente de la actual.',
  '8. Igual a la actual devuelve "La nueva contraseña debe ser diferente de la actual."'
);

// 9. Regla 5: igual a la actual considerando espacios en la nueva (trim)
assert(
  validatePasswordChange('mismaClave123', '  mismaClave123  ', '  mismaClave123  ') === 'La nueva contraseña debe ser diferente de la actual.',
  '9. Igual a la actual con espacios en la nueva devuelve "La nueva contraseña debe ser diferente de la actual."'
);

// 10. Regla 6: nueva corta < 8
assert(
  validatePasswordChange('actualClave123', '1234567', '1234567') === PASSWORD_TOO_SHORT_MESSAGE,
  `10. Nueva corta (< 8) devuelve "${PASSWORD_TOO_SHORT_MESSAGE}"`
);

// 11. Caso válido: exactamente 8 caracteres
assert(
  validatePasswordChange('actualClave1', 'nueva123', 'nueva123') === null,
  '11. Válida con exactamente 8 caracteres devuelve null'
);

// 12. Caso válido: más de 8 caracteres
assert(
  validatePasswordChange('actualClave123', 'nuevaClaveSegura2026', 'nuevaClaveSegura2026') === null,
  '12. Válida con más de 8 caracteres devuelve null'
);

// 13. Actual con espacios pero no vacía (tratamiento sin trim estricto pero válida)
assert(
  validatePasswordChange('  clave actual con espacios  ', 'nuevaClave123', 'nuevaClave123') === null,
  '13. Actual con espacios pero no vacía permite el cambio (devuelve null)'
);

// 14. Confirmación no coincide por espacios internos
assert(
  validatePasswordChange('actualClave123', 'nuevaClave123', 'nueva Clave123') === 'Las contraseñas no coinciden.',
  '14. Confirmación con espacio interno no coincide y devuelve "Las contraseñas no coinciden."'
);

// 15. Prioridad de reglas: confirmación no coincide tiene prioridad sobre longitud corta
assert(
  validatePasswordChange('actualClave123', 'abc', 'xyz') === 'Las contraseñas no coinciden.',
  '15. Prioridad: "Las contraseñas no coinciden." tiene prioridad sobre longitud corta'
);

// 16. Prioridad de reglas: igual a la actual tiene prioridad sobre longitud corta
assert(
  validatePasswordChange('1234', '1234', '1234') === 'La nueva contraseña debe ser diferente de la actual.',
  '16. Prioridad: "La nueva contraseña debe ser diferente de la actual." tiene prioridad sobre longitud corta'
);

console.log(`\nResultados: ${passedTests}/${totalTests} pruebas pasadas.`);

if (failedTests > 0) {
  console.error(`ERROR: ${failedTests} prueba(s) fallaron.`);
  process.exit(1);
} else {
  console.log('✓ Todas las pruebas de validatePasswordChange pasaron exitosamente.');
  process.exit(0);
}
