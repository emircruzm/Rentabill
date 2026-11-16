#!/usr/bin/env node
/**
 * scripts/verify-password-policy.mjs
 *
 * Verificación de la política unificada de contraseñas (mínimo 8 caracteres).
 */

import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_TOO_SHORT_MESSAGE,
  isPasswordLongEnough,
} from '../src/shared/utils/passwordPolicy.ts';

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

console.log('--- Verificación de Política Unificada de Contraseñas ---\n');

// 1. Contraseña de 7 caracteres (inválida)
assert(
  isPasswordLongEnough('1234567') === false,
  '1. Contraseña de 7 caracteres es inválida (devuelve false)'
);

// 2. Contraseña de 8 caracteres (válida)
assert(
  isPasswordLongEnough('12345678') === true,
  '2. Contraseña de 8 caracteres es válida (devuelve true)'
);

// 3. Contraseña vacía (inválida)
assert(
  isPasswordLongEnough('') === false,
  '3. Contraseña vacía es inválida (devuelve false)'
);

// 4. Solo espacios (inválida)
assert(
  isPasswordLongEnough('        ') === false,
  '4. Contraseña con solo espacios en blanco es inválida (devuelve false)'
);

// 5. Constante igual a 8
assert(
  MIN_PASSWORD_LENGTH === 8,
  `5. MIN_PASSWORD_LENGTH es exactamente 8 (obtenido: ${MIN_PASSWORD_LENGTH})`
);

// 6. Mensaje exacto
const expectedMessage = 'La contraseña debe tener al menos 8 caracteres.';
assert(
  PASSWORD_TOO_SHORT_MESSAGE === expectedMessage,
  `6. Mensaje exacto coincide con "${expectedMessage}"`
);

// 7. Pruebas adicionales: mayor a 8 caracteres y espacios perimetrales
assert(
  isPasswordLongEnough('miSuperClaveSegura2026') === true,
  '7. Contraseña de más de 8 caracteres es válida (devuelve true)'
);

assert(
  isPasswordLongEnough('   abcdefgh   ') === true,
  '8. Contraseña de 8 caracteres rodeada de espacios es válida'
);

console.log('\n=======================================================');
if (failedTests === 0) {
  console.log(`✅ ¡Todas las ${passedTests} de ${totalTests} pruebas de política de contraseña pasaron exitosamente!`);
  console.log('=======================================================');
  process.exit(0);
} else {
  console.error(`❌ Fallaron ${failedTests} de ${totalTests} pruebas.`);
  console.log('=======================================================');
  process.exit(1);
}
