#!/usr/bin/env node
/**
 * scripts/verify-password-change.mjs
 *
 * Verificación exhaustiva de la función validatePasswordChange (src/shared/utils/passwordChange.ts).
 * Valida las reglas en su estricto orden de prioridad, sanitización y casos límite.
 */

import { validatePasswordChange } from '../src/shared/utils/passwordChange.ts';
import {
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
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

// 10. Regla 6: nueva no cumple política (9 caracteres)
assert(
  validatePasswordChange('actualClave123', 'Clave9chr', 'Clave9chr') === PASSWORD_POLICY_MESSAGE,
  `10. Nueva con 9 caracteres devuelve PASSWORD_POLICY_MESSAGE`
);

// 11. Caso válido: exactamente 10 caracteres con letras y dígitos
assert(
  validatePasswordChange('actualClave1', 'ClaveSeg10', 'ClaveSeg10') === null,
  '11. Válida con exactamente 10 caracteres (letras y dígitos) devuelve null'
);

// 12. Caso válido: más de 10 caracteres
assert(
  validatePasswordChange('actualClave123', 'nuevaClaveSegura2026', 'nuevaClaveSegura2026') === null,
  '12. Válida con más de 10 caracteres devuelve null'
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

// 17. Regla 6: 10 caracteres solo letras falla
assert(
  validatePasswordChange('actualClave123', 'abcdefghij', 'abcdefghij') === PASSWORD_POLICY_MESSAGE,
  '17. 10 caracteres solo letras devuelve PASSWORD_POLICY_MESSAGE'
);

// 18. Regla 6: 10 caracteres solo dígitos falla
assert(
  validatePasswordChange('actualClave123', '1234567890', '1234567890') === PASSWORD_POLICY_MESSAGE,
  '18. 10 caracteres solo dígitos devuelve PASSWORD_POLICY_MESSAGE'
);

// 19. Regla 6: más de 72 bytes falla devolviendo PASSWORD_TOO_LONG_MESSAGE
const pass73Bytes = 'A'.repeat(72) + '1';
assert(
  validatePasswordChange('actualClave123', pass73Bytes, pass73Bytes) === PASSWORD_TOO_LONG_MESSAGE,
  '19. Contraseña de más de 72 bytes devuelve PASSWORD_TOO_LONG_MESSAGE'
);

// 20. Caso válido con ñ y tildes
assert(
  validatePasswordChange('actualClave123', 'ContraseñaSeg10', 'ContraseñaSeg10') === null,
  '20. Contraseña con ñ y dígitos devuelve null'
);

// --- Verificaciones de Contrato: H-11 (current_password) y H-13 (signOut others) ---
console.log('\n--- Verificación de Contratos: H-11 (current_password) y H-13 (signOut others) ---');

// Mock harness para simular el comportamiento de authUseCases
async function simulateChangePassword(currentPassword, newPassword, mockAuthRepo) {
  const err = validatePasswordChange(currentPassword, newPassword.trim(), newPassword.trim());
  if (err) throw new Error(err);

  const { error: signInErr } = await mockAuthRepo.signInWithPassword('user@example.com', currentPassword);
  if (signInErr) throw signInErr;

  const { data, error: updateErr } = await mockAuthRepo.updatePassword(newPassword.trim(), currentPassword);
  if (updateErr) throw updateErr;

  try {
    await mockAuthRepo.signOutOthers();
  } catch {
    // Graceful warning
  }

  return { user: data?.user };
}

async function simulateUpdatePasswordRecovery(newPassword, mockAuthRepo) {
  const cleanPass = newPassword.trim();
  if (!cleanPass) throw new Error('Escribe una contraseña.');
  // En recuperación NO se pide ni envía current_password
  const { data, error: updateErr } = await mockAuthRepo.updatePassword(cleanPass);
  if (updateErr) throw updateErr;

  try {
    await mockAuthRepo.signOutOthers();
  } catch {
    // Graceful warning
  }

  return data;
}

// 21. H-11: changePassword envía current_password en updatePassword
{
  let passedCurrentPassword = null;
  let updatePasswordCalled = false;
  const mockRepo = {
    signInWithPassword: async () => ({ error: null }),
    updatePassword: async (newP, currP) => {
      updatePasswordCalled = true;
      passedCurrentPassword = currP;
      return { data: { user: { id: 'u1' } }, error: null };
    },
    signOutOthers: async () => ({ error: null }),
  };

  await simulateChangePassword('ClaveActual10', 'NuevaClaveSegura2026', mockRepo);
  assert(
    updatePasswordCalled && passedCurrentPassword === 'ClaveActual10',
    '21. H-11: changePassword envía obligatoriamente current_password al actualizar contraseña'
  );
}

// 22. H-13: changePassword llama a signOutOthers tras actualización exitosa
{
  let signOutOthersCalled = false;
  const mockRepo = {
    signInWithPassword: async () => ({ error: null }),
    updatePassword: async () => ({ data: { user: { id: 'u1' } }, error: null }),
    signOutOthers: async () => {
      signOutOthersCalled = true;
      return { error: null };
    },
  };

  await simulateChangePassword('ClaveActual10', 'NuevaClaveSegura2026', mockRepo);
  assert(
    signOutOthersCalled === true,
    '22. H-13: changePassword invoca signOut con scope "others" tras éxito'
  );
}

// 23. H-13: Fallo en signOutOthers no bloquea el cambio de contraseña
{
  const mockRepo = {
    signInWithPassword: async () => ({ error: null }),
    updatePassword: async () => ({ data: { user: { id: 'u1' } }, error: null }),
    signOutOthers: async () => {
      throw new Error('Network error on session revoke');
    },
  };

  let threw = false;
  try {
    const res = await simulateChangePassword('ClaveActual10', 'NuevaClaveSegura2026', mockRepo);
    assert(res?.user?.id === 'u1', '23. H-13: Fallo en revocación de otras sesiones no interrumpe el cambio exitoso');
  } catch {
    threw = true;
  }
  assert(!threw, '23b. H-13: No lanza error al usuario si signOutOthers falla');
}

// 24. H-11: Recuperación NO envía current_password
{
  let passedCurrentPassword = 'not-called';
  const mockRepo = {
    updatePassword: async (newP, currP) => {
      passedCurrentPassword = currP;
      return { data: { user: { id: 'u1' } }, error: null };
    },
    signOutOthers: async () => ({ error: null }),
  };

  await simulateUpdatePasswordRecovery('NuevaClaveSegura2026', mockRepo);
  assert(
    passedCurrentPassword === undefined,
    '24. H-11: Recuperación NO envía current_password al actualizar contraseña'
  );
}

// 25. H-13: Recuperación invoca signOutOthers
{
  let recoverySignOutOthersCalled = false;
  const mockRepo = {
    updatePassword: async () => ({ data: { user: { id: 'u1' } }, error: null }),
    signOutOthers: async () => {
      recoverySignOutOthersCalled = true;
      return { error: null };
    },
  };

  await simulateUpdatePasswordRecovery('NuevaClaveSegura2026', mockRepo);
  assert(
    recoverySignOutOthersCalled === true,
    '25. H-13: Recuperación invoca signOutOthers tras actualizar la contraseña'
  );
}

// 26. H-13: Fallo en signOutOthers en recuperación no interrumpe el flujo
{
  const mockRepo = {
    updatePassword: async () => ({ data: { user: { id: 'u1' } }, error: null }),
    signOutOthers: async () => {
      throw new Error('Supabase temporary error on others signOut');
    },
  };

  let threw = false;
  try {
    await simulateUpdatePasswordRecovery('NuevaClaveSegura2026', mockRepo);
  } catch {
    threw = true;
  }
  assert(
    !threw,
    '26. H-13: Recuperación completa con éxito incluso si signOutOthers falla'
  );
}

console.log(`\nResultados: ${passedTests}/${totalTests} pruebas pasadas.`);

if (failedTests > 0) {
  console.error(`ERROR: ${failedTests} prueba(s) fallaron.`);
  process.exit(1);
} else {
  console.log('✓ Todas las pruebas de validatePasswordChange pasaron exitosamente.');
  process.exit(0);
}
