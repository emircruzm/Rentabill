#!/usr/bin/env node
/**
 * scripts/verify-password-policy.mjs
 *
 * Verificación exhaustiva de la política unificada de contraseñas (H-15):
 * - Mínimo 10 caracteres
 * - Al menos una letra
 * - Al menos un dígito
 * - Máximo 72 bytes (límite bcrypt)
 * - Tolerancia a caracteres especiales, tildes, ñ y espacios válidos
 */

import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_BYTES,
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  isPasswordValid,
  isPasswordLongEnough,
  getPasswordByteLength,
  validatePassword,
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

console.log('--- Verificación de Política Unificada de Contraseñas (H-15) ---\n');

// 1. Constante de longitud mínima es 10
assert(
  MIN_PASSWORD_LENGTH === 10,
  `1. MIN_PASSWORD_LENGTH es exactamente 10 (obtenido: ${MIN_PASSWORD_LENGTH})`
);

// 2. Constante de longitud máxima en bytes es 72
assert(
  MAX_PASSWORD_BYTES === 72,
  `2. MAX_PASSWORD_BYTES es exactamente 72 (obtenido: ${MAX_PASSWORD_BYTES})`
);

// 3. Mensaje exacto de política en español sin filtrar datos del servidor
const expectedPolicyMessage =
  'La contraseña debe tener al menos 10 caracteres e incluir al menos una letra y un número.';
assert(
  PASSWORD_POLICY_MESSAGE === expectedPolicyMessage,
  `3. PASSWORD_POLICY_MESSAGE coincide con "${expectedPolicyMessage}"`
);

// 4. Mensaje exacto de longitud excesiva (>72 bytes)
const expectedTooLongMessage =
  'La contraseña es demasiado larga. Usa un máximo de 72 caracteres.';
assert(
  PASSWORD_TOO_LONG_MESSAGE === expectedTooLongMessage,
  `4. PASSWORD_TOO_LONG_MESSAGE coincide con "${expectedTooLongMessage}"`
);

// 5. Alias de compatibilidad PASSWORD_TOO_SHORT_MESSAGE
assert(
  PASSWORD_TOO_SHORT_MESSAGE === PASSWORD_POLICY_MESSAGE,
  '5. PASSWORD_TOO_SHORT_MESSAGE está sincronizado con PASSWORD_POLICY_MESSAGE'
);

// 6. Vacío falla
assert(
  isPasswordValid('') === false,
  '6. Contraseña vacía falla (devuelve false)'
);

// 7. Solo espacios en blanco falla
assert(
  isPasswordValid('          ') === false,
  '7. Contraseña con solo espacios en blanco falla (devuelve false)'
);

// 8. 9 caracteres (con letra y número) falla por longitud
assert(
  isPasswordValid('Abc123456') === false,
  '8. 9 caracteres falla aunque tenga letras y dígitos (devuelve false)'
);

// 9. 10 caracteres solo letras falla por falta de dígito
assert(
  isPasswordValid('abcdefghij') === false,
  '9. 10 caracteres solo letras falla por falta de dígitos (devuelve false)'
);

// 10. 10 caracteres solo dígitos falla por falta de letra
assert(
  isPasswordValid('1234567890') === false,
  '10. 10 caracteres solo dígitos falla por falta de letras (devuelve false)'
);

// 11. 10 caracteres con letras y dígitos pasa
assert(
  isPasswordValid('ClaveSeg10') === true,
  '11. 10 caracteres con letras y dígitos pasa (devuelve true)'
);

// 12. Con ñ y tildes pasa
assert(
  isPasswordValid('Contraseña1') === true,
  '12. Contraseña con "ñ" y dígitos pasa (devuelve true)'
);

// 13. Con tildes pasa
assert(
  isPasswordValid('Autenticación9') === true,
  '13. Contraseña con tildes y dígitos pasa (devuelve true)'
);

// 14. Con espacios internos pasa
assert(
  isPasswordValid('Mi Clave 2026') === true,
  '14. Contraseña con espacios internos pasa (devuelve true)'
);

// 15. Con espacios perimetrales pasa si el contenido limpio cumple
assert(
  isPasswordValid('   ClaveSeg10   ') === true,
  '15. Contraseña válida con espacios perimetrales pasa (devuelve true)'
);

// 16. Más de 72 bytes en ASCII falla
const longAscii = 'A'.repeat(72) + '1'; // 73 bytes
assert(
  isPasswordValid(longAscii) === false,
  `16. Más de 72 bytes en ASCII (${getPasswordByteLength(longAscii)} bytes) falla`
);

// 17. Más de 72 bytes con caracteres multi-byte UTF-8 falla
const multiByteLong = 'ñ'.repeat(36) + '1234'; // 36*2 + 4 = 76 bytes
assert(
  isPasswordValid(multiByteLong) === false,
  `17. Más de 72 bytes en UTF-8 multi-byte (${getPasswordByteLength(multiByteLong)} bytes) falla`
);

// 18. Exactamente 72 bytes con letras y dígitos pasa
const exact72Bytes = 'A'.repeat(70) + '12'; // 72 bytes
assert(
  isPasswordValid(exact72Bytes) === true,
  `18. Exactamente 72 bytes con letras y dígitos (${getPasswordByteLength(exact72Bytes)} bytes) pasa`
);

// 19. Caracteres especiales y símbolos combinados pasan
assert(
  isPasswordValid('P@ssw0rd!2026#') === true,
  '19. Contraseña compleja con símbolos, números y letras pasa'
);

// 20. Función validatePassword para contraseña válida
assert(
  validatePassword('ClaveSeg10') === null,
  '20. validatePassword devuelve null para contraseña válida'
);

// 21. Función validatePassword para contraseña inválida que no cumple política
assert(
  validatePassword('corta1') === PASSWORD_POLICY_MESSAGE,
  '21. validatePassword devuelve PASSWORD_POLICY_MESSAGE para contraseña inválida'
);

// 22. Función validatePassword para contraseña que excede 72 bytes (falla solo por longitud máxima)
const passMasDe72Bytes = 'A'.repeat(72) + '1';
assert(
  validatePassword(passMasDe72Bytes) === PASSWORD_TOO_LONG_MESSAGE,
  '22. validatePassword devuelve PASSWORD_TOO_LONG_MESSAGE cuando excede 72 bytes'
);

// 23. Función validatePassword para contraseña vacía
assert(
  validatePassword('') === 'Escribe una contraseña.',
  '23. validatePassword devuelve "Escribe una contraseña." para contraseña vacía'
);

// 24. Compatibilidad con función isPasswordLongEnough
assert(
  isPasswordLongEnough('ClaveSeg10') === true && isPasswordLongEnough('corta1') === false,
  '24. isPasswordLongEnough preserva equivalencia con isPasswordValid'
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
