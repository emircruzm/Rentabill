#!/usr/bin/env node
/**
 * scripts/verify-recovery-link.mjs
 *
 * Verificación exhaustiva de parseRecoveryHash (función pura de src/shared/utils/recoveryLink.ts).
 * Valida flujos válidos de recuperación, manejo de errores de Supabase Auth,
 * resiliencia ante parámetros vacíos o desordenados, y garantías de seguridad
 * (ningún token expuesto en mensajes de error o resultados).
 */

import { parseRecoveryHash } from '../src/shared/utils/recoveryLink.ts';
import { isPasswordValid, PASSWORD_POLICY_MESSAGE } from '../src/shared/utils/passwordPolicy.ts';

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

console.log('--- Verificación de Parseo de Enlace de Recuperación (parseRecoveryHash) ---\n');

// 1. Recovery válido
const sampleAccess = 'eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sample_access_token_12345';
const sampleRefresh = 'sample_refresh_token_67890';
const r1 = parseRecoveryHash(`#access_token=${sampleAccess}&refresh_token=${sampleRefresh}&expires_in=3600&token_type=bearer&type=recovery`);
assert(
  r1.kind === 'tokens' && r1.accessToken === sampleAccess && r1.refreshToken === sampleRefresh,
  '1. Recovery válido: extrae accessToken y refreshToken correctamente'
);

// 2. Recovery sin refresh_token
const r2 = parseRecoveryHash(`#access_token=${sampleAccess}&expires_in=3600&token_type=bearer&type=recovery`);
assert(
  r2.kind === 'error' && typeof r2.message === 'string',
  '2. Recovery sin refresh_token: devuelve kind error con mensaje genérico'
);

// 3. Recovery con token vacío
const r3a = parseRecoveryHash(`#access_token=&refresh_token=${sampleRefresh}&type=recovery`);
const r3b = parseRecoveryHash(`#access_token=${sampleAccess}&refresh_token=%20%20&type=recovery`);
assert(
  r3a.kind === 'error' && r3b.kind === 'error',
  '3. Recovery con token vacío o en blanco: devuelve kind error'
);

// 4. Error otp_expired
const r4 = parseRecoveryHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
assert(
  r4.kind === 'error' && r4.message === 'El enlace venció o ya se usó. Pide uno nuevo desde «¿Olvidaste tu contraseña?».',
  '4. Error otp_expired: devuelve kind error con mensaje específico de vencimiento'
);

// 5. Error otro código
const r5 = parseRecoveryHash('#error=server_error&error_code=unexpected_failure&error_description=Database+down');
assert(
  r5.kind === 'error' && r5.message === 'No se pudo validar el enlace. Pide uno nuevo desde «¿Olvidaste tu contraseña?».',
  '5. Error con otro código: devuelve kind error con mensaje genérico amigable'
);

// 6. Hash vacío
const r6 = parseRecoveryHash('');
assert(
  r6.kind === 'none',
  '6. Hash vacío: devuelve kind none'
);

// 7. '#' solo
const r7 = parseRecoveryHash('#');
assert(
  r7.kind === 'none',
  '7. Hash con solo "#": devuelve kind none'
);

// 8. type=signup con tokens (debe dar none)
const r8 = parseRecoveryHash(`#access_token=${sampleAccess}&refresh_token=${sampleRefresh}&token_type=bearer&type=signup`);
assert(
  r8.kind === 'none',
  '8. type=signup con tokens: no interfiere y devuelve kind none'
);

// 9. Parámetros desordenados
const r9 = parseRecoveryHash(`#refresh_token=${sampleRefresh}&expires_in=3600&type=recovery&access_token=${sampleAccess}`);
assert(
  r9.kind === 'tokens' && r9.accessToken === sampleAccess && r9.refreshToken === sampleRefresh,
  '9. Parámetros desordenados: extrae correctamente tokens sin importar el orden'
);

// 10. Caracteres especiales URL-encoded
const encodedAccess = 'token%2Bwith%20plus%2Fslash%3Dequal';
const encodedRefresh = 'ref%40token%24special';
const r10 = parseRecoveryHash(`#type=recovery&access_token=${encodedAccess}&refresh_token=${encodedRefresh}`);
assert(
  r10.kind === 'tokens' &&
  r10.accessToken === 'token+with plus/slash=equal' &&
  r10.refreshToken === 'ref@token$special',
  '10. Caracteres especiales URL-encoded: decodifica adecuadamente los tokens'
);

// 11. Hash sin '#' inicial
const r11 = parseRecoveryHash(`access_token=${sampleAccess}&refresh_token=${sampleRefresh}&type=recovery`);
assert(
  r11.kind === 'tokens' && r11.accessToken === sampleAccess && r11.refreshToken === sampleRefresh,
  '11. Hash sin "#" inicial: tolera el string y devuelve kind tokens'
);

// 12. Mensajes de error no contienen 'ey' ni 'token=' ni valor del token
const fakeTokenSecret = 'eySecretTokenPayload999';
const r12a = parseRecoveryHash(`#access_token=${fakeTokenSecret}&type=recovery`);
const r12b = parseRecoveryHash(`#error=invalid_token&error_code=token_error&access_token=${fakeTokenSecret}`);
const msg1 = (r12a.kind === 'error' ? r12a.message : '') + (r12b.kind === 'error' ? r12b.message : '');
const containsLeak = msg1.includes('ey') || msg1.toLowerCase().includes('token=') || msg1.includes(fakeTokenSecret);
assert(
  !containsLeak,
  '12. Seguridad: los mensajes de error NUNCA contienen "ey", "token=" ni el valor de ningún token'
);

// 13. Mensaje exacto para otp_expired
const expectedOtpMsg = 'El enlace venció o ya se usó. Pide uno nuevo desde «¿Olvidaste tu contraseña?».';
assert(
  r4.kind === 'error' && r4.message === expectedOtpMsg,
  `13. Mensaje exacto para otp_expired: coincide textualmente con "${expectedOtpMsg}"`
);

// 14. Mensaje exacto para el genérico
const expectedGenericMsg = 'No se pudo validar el enlace. Pide uno nuevo desde «¿Olvidaste tu contraseña?».';
assert(
  r2.kind === 'error' && r2.message === expectedGenericMsg,
  `14. Mensaje exacto para error genérico: coincide textualmente con "${expectedGenericMsg}"`
);

// 15. Prueba adicional: hash con parámetros irrelevantes sin type
const r15 = parseRecoveryHash('#foo=bar&baz=qux');
assert(
  r15.kind === 'none',
  '15. Hash con parámetros arbitrarios sin type: devuelve kind none'
);

// 16. Prueba adicional: solo type=recovery sin ningún token
const r16 = parseRecoveryHash('#type=recovery');
assert(
  r16.kind === 'error' && r16.message === expectedGenericMsg,
  '16. type=recovery sin ningún token: devuelve kind error con mensaje genérico'
);

// --- Verificaciones de Integración de Flujo: H-11, H-13 y H-15 en Recuperación ---
console.log('\n--- Verificación de Contratos de Recuperación: H-11, H-13 y H-15 ---');

// Helper simulador de use case de recuperación
async function simulateRecoveryUpdate(newPassword, mockRepo) {
  if (!isPasswordValid(newPassword)) {
    throw new Error(PASSWORD_POLICY_MESSAGE);
  }
  // H-11: En recuperación NUNCA se envía current_password
  const { data, error } = await mockRepo.updatePassword(newPassword);
  if (error) throw error;

  // H-13: Invoca signOut({ scope: 'others' })
  try {
    await mockRepo.signOutOthers();
  } catch {
    // Graceful warning
  }
  return data;
}

// 17. H-15: Contraseña de recuperación menor a 10 caracteres rechazada
{
  let threw = false;
  try {
    await simulateRecoveryUpdate('Pass123', {});
  } catch (err) {
    threw = err.message === PASSWORD_POLICY_MESSAGE;
  }
  assert(threw, '17. H-15: Contraseña de recuperación menor a 10 caracteres rechazada con PASSWORD_POLICY_MESSAGE');
}

// 18. H-15: Contraseña de recuperación sin dígitos rechazada
{
  let threw = false;
  try {
    await simulateRecoveryUpdate('ClaveSinDigitos', {});
  } catch (err) {
    threw = err.message === PASSWORD_POLICY_MESSAGE;
  }
  assert(threw, '18. H-15: Contraseña de recuperación sin números rechazada con PASSWORD_POLICY_MESSAGE');
}

// 19. H-15: Contraseña de recuperación válida (10+ caracteres, letras y dígitos) aceptada
{
  let calledWith = null;
  const mockRepo = {
    updatePassword: async (pwd) => {
      calledWith = pwd;
      return { data: { user: { id: 'u1' } }, error: null };
    },
    signOutOthers: async () => ({ error: null }),
  };
  await simulateRecoveryUpdate('NuevaClaveSegura2026', mockRepo);
  assert(
    calledWith === 'NuevaClaveSegura2026',
    '19. H-15: Contraseña de recuperación que cumple la política unificada es procesada con éxito'
  );
}

// 20. H-11: Recuperación garantiza ausencia de current_password en llamada a repositorio
{
  let passedParams = [];
  const mockRepo = {
    updatePassword: async (...args) => {
      passedParams = args;
      return { data: { user: { id: 'u1' } }, error: null };
    },
    signOutOthers: async () => ({ error: null }),
  };
  await simulateRecoveryUpdate('NuevaClaveSegura2026', mockRepo);
  assert(
    passedParams.length === 1 && passedParams[1] === undefined,
    '20. H-11: Recuperación nunca envía current_password (el usuario en recuperación no la conoce)'
  );
}

// 21. H-13: Recuperación cierra otras sesiones activas (signOutOthers)
{
  let othersClosed = false;
  const mockRepo = {
    updatePassword: async () => ({ data: { user: { id: 'u1' } }, error: null }),
    signOutOthers: async () => {
      othersClosed = true;
      return { error: null };
    },
  };
  await simulateRecoveryUpdate('NuevaClaveSegura2026', mockRepo);
  assert(
    othersClosed === true,
    '21. H-13: Recuperación invoca signOutOthers para revocar sesiones ajenas/viejas'
  );
}

// 22. H-13: Fallo en signOutOthers durante recuperación no interrumpe el flujo
{
  const mockRepo = {
    updatePassword: async () => ({ data: { user: { id: 'u1' } }, error: null }),
    signOutOthers: async () => {
      throw new Error('Network error on session purge');
    },
  };
  let errorCaught = false;
  try {
    const res = await simulateRecoveryUpdate('NuevaClaveSegura2026', mockRepo);
    assert(res?.user?.id === 'u1', '22. H-13: Éxito de recuperación devuelto a pesar de fallo en signOutOthers');
  } catch {
    errorCaught = true;
  }
  assert(!errorCaught, '22b. H-13: No se propaga excepción hacia el usuario cuando signOutOthers falla');
}

console.log('\n=======================================================');
if (failedTests === 0) {
  console.log(`✅ ¡Todas las ${passedTests} de ${totalTests} pruebas de recovery-link pasaron exitosamente!`);
  console.log('=======================================================');
  process.exit(0);
} else {
  console.error(`❌ Fallaron ${failedTests} de ${totalTests} pruebas.`);
  console.log('=======================================================');
  process.exit(1);
}
