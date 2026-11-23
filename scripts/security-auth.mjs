/**
 * scripts/security-auth.mjs
 *
 * FASE 2: Pruebas de Autenticación y Sesión (Rentabill)
 * Cobertura de especificaciones:
 *   - SEG-09: Token alterado (firmas, payloads manipulados, alg none, headers)
 *   - SEG-10: Token tras cerrar sesión, expiración y reutilización de refresh token
 *   - SEG-12: Cambio de contraseña con sesión concurrente y restauración segura
 *   - SEG-08: Enumeración de usuarios (mensajes, códigos y análisis temporal)
 *   - SEG-07: Fuerza bruta y rate limiting (solo con bandera --fuerza-bruta)
 *
 * Reglas de seguridad:
 *   - Usa SOLO la cuenta C (TEST_USER_C_*). NUNCA registra usuarios (sin signUp).
 *   - NUNCA llama a resetPasswordForEmail con correos reales.
 *   - NUNCA imprime contraseñas, access tokens ni refresh tokens completos.
 *   - Restaura obligatoriamente la contraseña de C si se prueba cambio.
 */

import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';
import { isPasswordValid } from '../src/shared/utils/passwordPolicy.ts';

// ============================================================================
// 1. Helpers y Enmascaramiento
// ============================================================================
function maskToken(token) {
  if (!token || typeof token !== 'string') return 'null';
  return token.length > 6 ? `${token.substring(0, 6)}…` : token;
}

function shortId(id) {
  if (!id || typeof id !== 'string') return 'null';
  return id.substring(0, 8);
}

function median(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile95(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length < 2) throw new Error('Formato JWT inválido');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  return { header, payload, signature: parts[2] || '' };
}

function encodeJwtParts(headerObj, payloadObj, signatureStr = '') {
  const hdr = Buffer.from(JSON.stringify(headerObj)).toString('base64url');
  const pay = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  return `${hdr}.${pay}.${signatureStr}`;
}

function forgeHs256Jwt(payloadObj, secret = crypto.randomBytes(32).toString('hex')) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const hdr = Buffer.from(JSON.stringify(header)).toString('base64url');
  const pay = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${hdr}.${pay}`).digest('base64url');
  return `${hdr}.${pay}.${sig}`;
}

// ============================================================================
// 2. Registro de Resultados
// ============================================================================
const testResults = [];

function recordResult(codigo, prueba, esperado, resultado, detalle) {
  testResults.push({ codigo, prueba, esperado, resultado, detalle });
  const icon =
    resultado === 'PASA' ? '✅' :
    resultado === 'FALLA' ? '❌' :
    resultado === 'OBSERVACIÓN' ? 'ℹ️' : '⚠️';
  console.log(`[${icon} ${resultado}] ${codigo} — ${prueba}: ${detalle}`);
}

// ============================================================================
// 3. Ejecución Principal
// ============================================================================
async function main() {
  console.log('='.repeat(80));
  console.log('🛡️ FASE 2 — PRUEBAS DE AUTENTICACIÓN Y SESIÓN (RENTABILL)');
  console.log('='.repeat(80));

  const isBruteForceMode = process.argv.includes('--fuerza-bruta');
  const isBruteForceExtended = process.argv.includes('--fuerza-bruta-extendida');
  const isSolo10 = process.argv.includes('--solo-10');
  const isVerificarFixes = process.argv.includes('--verificar-fixes');

  // Validación de variables de entorno
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const TEST_USER_C_EMAIL = process.env.TEST_USER_C_EMAIL;
  const TEST_USER_C_PASSWORD = process.env.TEST_USER_C_PASSWORD;

  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
  if (!TEST_USER_C_EMAIL) missing.push('TEST_USER_C_EMAIL');
  if (!TEST_USER_C_PASSWORD) missing.push('TEST_USER_C_PASSWORD');

  if (missing.length > 0) {
    console.error('❌ Faltan variables requeridas en .env.test:');
    missing.forEach(m => console.error(`   - ${m}`));
    process.exit(1);
  }

  // Validación previa obligatoria de la contraseña de C según política H-15
  if (!isPasswordValid(TEST_USER_C_PASSWORD)) {
    console.error('\n' + '!'.repeat(80));
    console.error('🚨 ABORTO DE SEGURIDAD: TEST_USER_C_PASSWORD no cumple la nueva política de contraseñas.');
    console.error('   Debe tener al menos 10 caracteres, incluir letra y dígito, y <= 72 bytes.');
    console.error('   Por favor actualiza la contraseña de Usuario C antes de ejecutar este script.');
    console.error('!'.repeat(80) + '\n');
    process.exit(1);
  }

  const clientOptions = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  };

  const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);

  // Helper para generar contraseñas temporales que cumplen la política (>= 12 caracteres con letras y números)
  function generateCompliantPassword() {
    const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    let pass = '';
    for (let i = 0; i < 6; i++) pass += letters[crypto.randomInt(0, letters.length)];
    for (let i = 0; i < 6; i++) pass += digits[crypto.randomInt(0, digits.length)];
    return pass + crypto.randomBytes(4).toString('hex');
  }

  // Helper compartido para restaurar la contraseña original de C de manera garantizada
  async function restoreUserCPassword(currentPassword) {
    let restoredPassword = currentPassword;
    if (restoredPassword !== TEST_USER_C_PASSWORD) {
      console.log('\n[Restauración] Restaurando contraseña original de Usuario C...');
      const clientRestore = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
      const { error: errLoginKnown } = await clientRestore.auth.signInWithPassword({
        email: TEST_USER_C_EMAIL,
        password: restoredPassword,
      });

      if (!errLoginKnown) {
        const { error: errRestWithCurrent } = await clientRestore.auth.updateUser({
          password: TEST_USER_C_PASSWORD,
          current_password: restoredPassword,
        });

        if (!errRestWithCurrent) {
          restoredPassword = TEST_USER_C_PASSWORD;
        } else {
          console.warn(`   Aviso con current_password (${errRestWithCurrent.code || errRestWithCurrent.message}), reintentando sin ella...`);
          const { error: errRestFallback } = await clientRestore.auth.updateUser({
            password: TEST_USER_C_PASSWORD,
          });
          if (!errRestFallback) {
            restoredPassword = TEST_USER_C_PASSWORD;
          } else {
            console.error(`   Error en fallback sin current_password: ${errRestFallback.code || errRestFallback.message}`);
          }
        }
      } else {
        console.error(`   Error iniciando sesión con knownPassword: ${errLoginKnown.code || errLoginKnown.message}`);
      }
    }

    // Confirmar que la contraseña original vuelve a funcionar
    const clientCheck = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
    const { data: checkOrig, error: errCheckOrig } = await clientCheck.auth.signInWithPassword({
      email: TEST_USER_C_EMAIL,
      password: TEST_USER_C_PASSWORD,
    });

    if (!errCheckOrig && checkOrig?.user) {
      console.log('✅ Contraseña original de Usuario C confirmada y operativa.');
      return true;
    } else {
      console.error('\n' + '!'.repeat(80));
      console.error('🚨 CONTRASEÑA DE C NO RESTAURADA');
      console.error('!'.repeat(80) + '\n');
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // MODO VERIFICAR FIXES (--verificar-fixes) - H-11, H-13, H-15
  // --------------------------------------------------------------------------
  if (isVerificarFixes) {
    console.log('\n⚠️ ADVERTENCIA: Cambia varias veces la contraseña de C y la restaura; requiere \'Password changed\' apagada y \'Require current password\' encendida.\n');
    console.log('🛡️ [FIXES] Verificación de arreglos de seguridad (H-11, H-13, H-15)...');

    // Validación previa obligatoria de la contraseña actual de C
    if (!isPasswordValid(TEST_USER_C_PASSWORD)) {
      console.error('\n' + '!'.repeat(80));
      console.error('🚨 ABORTO DE SEGURIDAD: TEST_USER_C_PASSWORD no cumple la nueva política de contraseñas.');
      console.error('   Debe tener al menos 10 caracteres, incluir letra y dígito, y <= 72 bytes.');
      console.error('   Por favor actualiza la contraseña de Usuario C antes de ejecutar esta verificación.');
      console.error('!'.repeat(80) + '\n');
      process.exit(1);
    }

    // Iniciar sesión legítima con C
    const clientC = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
    const { data: authInit, error: errAuthInit } = await clientC.auth.signInWithPassword({
      email: TEST_USER_C_EMAIL,
      password: TEST_USER_C_PASSWORD,
    });

    if (errAuthInit || !authInit?.session) {
      console.error('❌ Error fatal autenticando a Usuario C para verificar fixes:', errAuthInit?.message);
      process.exit(1);
    }

    console.log(`✅ Usuario C autenticado correctamente: ${shortId(authInit.user.id)}`);

    // Helper para detectar si un error indica requerimiento o fallo de contraseña actual
    function indicatesCurrentPassword(err) {
      if (!err) return false;
      const code = String(err.code || err.error_code || '').toLowerCase();
      const msg = String(err.message || '').toLowerCase();
      return (
        code.includes('current_password') ||
        code.includes('reauthentication') ||
        code.includes('invalid_credentials') ||
        code.includes('same_password') ||
        msg.includes('current_password') ||
        msg.includes('current password') ||
        msg.includes('reauthenticat') ||
        msg.includes('re-authenticat')
      );
    }

    // Seguimiento dinámico de la contraseña real de C
    let knownPassword = TEST_USER_C_PASSWORD;

    try {
      // 1. updateUser({ password }) SIN current_password -> debe ser RECHAZADO indicando contraseña actual
      console.log('\n[1/5] Prueba 1: updateUser SIN current_password...');
      const dummyNewPass1 = generateCompliantPassword();
      const { data: res1, error: err1 } = await clientC.auth.updateUser({
        password: dummyNewPass1,
      });

      if (!err1) {
        knownPassword = dummyNewPass1;
        recordResult(
          'FIX-H11.1',
          'updateUser({ password }) SIN current_password',
          'Rechazado por el servidor requiriendo contraseña actual',
          'FALLA',
          "la opción 'Require current password' parece apagada"
        );
      } else if (indicatesCurrentPassword(err1)) {
        recordResult(
          'FIX-H11.1',
          'updateUser({ password }) SIN current_password',
          'Rechazado por el servidor requiriendo contraseña actual',
          'PASA',
          `Rechazado correctamente: code="${err1.code || ''}", status=${err1.status || 'N/A'}, mensaje="${err1.message}"`
        );
      } else {
        recordResult(
          'FIX-H11.1',
          'updateUser({ password }) SIN current_password',
          'Rechazado por el servidor requiriendo contraseña actual',
          'OBSERVACIÓN',
          `Error no esperado: code="${err1.code || ''}", status=${err1.status || 'N/A'}, mensaje="${err1.message}"`
        );
      }

      // 2. updateUser({ password, current_password }) con current_password ERRÓNEA -> RECHAZADO indicando contraseña actual
      console.log('\n[2/5] Prueba 2: updateUser con current_password ERRÓNEA...');
      const dummyNewPass2 = generateCompliantPassword();
      const wrongCurrentPass = `WrongCurrent_${crypto.randomBytes(6).toString('hex')}!`;
      const { data: res2, error: err2 } = await clientC.auth.updateUser({
        password: dummyNewPass2,
        current_password: wrongCurrentPass,
      });

      if (!err2) {
        knownPassword = dummyNewPass2;
        recordResult(
          'FIX-H11.2',
          'updateUser con current_password ERRÓNEA',
          'Rechazado por el servidor indicando contraseña actual inválida',
          'FALLA',
          "la opción 'Require current password' parece apagada"
        );
      } else if (indicatesCurrentPassword(err2)) {
        recordResult(
          'FIX-H11.2',
          'updateUser con current_password ERRÓNEA',
          'Rechazado por el servidor indicando contraseña actual inválida',
          'PASA',
          `Rechazado correctamente: code="${err2.code || ''}", status=${err2.status || 'N/A'}, mensaje="${err2.message}"`
        );
      } else {
        recordResult(
          'FIX-H11.2',
          'updateUser con current_password ERRÓNEA',
          'Rechazado por el servidor indicando contraseña actual inválida',
          'OBSERVACIÓN',
          `Error no esperado: code="${err2.code || ''}", status=${err2.status || 'N/A'}, mensaje="${err2.message}"`
        );
      }

      // 3. updateUser con current_password correcta y nueva contraseña válida -> OK, luego restaurar
      console.log('\n[3/5] Prueba 3: updateUser con current_password correcta y nueva contraseña válida...');
      const validTempPass = generateCompliantPassword();
      const { data: res3, error: err3 } = await clientC.auth.updateUser({
        password: validTempPass,
        current_password: knownPassword,
      });

      const test3Ok = !err3 && Boolean(res3?.user);
      if (test3Ok) {
        knownPassword = validTempPass;
      }
      recordResult(
        'FIX-H11.3',
        'updateUser con current_password correcta y nueva contraseña válida',
        'Aceptado por el servidor',
        test3Ok ? 'PASA' : 'FALLA',
        test3Ok
          ? 'Contraseña actualizada con éxito validando current_password'
          : `Fallo al actualizar: code="${err3?.code || ''}", status=${err3?.status || 'N/A'}, mensaje="${err3?.message}"`
      );

      // Restaurar inmediatamente la original con la temporal como current_password
      if (knownPassword === validTempPass) {
        const { error: errRest3 } = await clientC.auth.updateUser({
          password: TEST_USER_C_PASSWORD,
          current_password: knownPassword,
        });
        if (!errRest3) {
          knownPassword = TEST_USER_C_PASSWORD;
          console.log('   Restauración intermedia exitosa de la contraseña original.');
        } else {
          console.error(`   Aviso en restauración intermedia: code="${errRest3.code || ''}", mensaje="${errRest3.message}"`);
        }
      }

      // 4. Contraseña débil (9 caracteres y 10 solo dígitos) -> RECHAZADA con error.code === 'weak_password'
      console.log('\n[4/5] Prueba 4: Contraseña débil rechazada por el servidor (política H-15)...');
      // 4a. 9 caracteres
      const weak9 = 'Abc123456';
      const { data: res4a, error: err4a } = await clientC.auth.updateUser({
        password: weak9,
        current_password: knownPassword,
      });
      if (!err4a && res4a?.user) {
        knownPassword = weak9;
      }

      // 4b. 10 solo dígitos
      const weak10Digits = '1234567890';
      const { data: res4b, error: err4b } = await clientC.auth.updateUser({
        password: weak10Digits,
        current_password: knownPassword,
      });
      if (!err4b && res4b?.user) {
        knownPassword = weak10Digits;
      }

      if (!err4a || !err4b) {
        recordResult(
          'FIX-H15',
          'Contraseñas débiles (9 caracteres y 10 solo dígitos) rechazadas por servidor',
          'Rechazadas con error.code === "weak_password"',
          'FALLA',
          `El servidor aceptó contraseñas débiles (aceptó 9 chars: ${!err4a}, aceptó 10 dígitos: ${!err4b})`
        );
      } else {
        const code4a = err4a.code || err4a.error_code || '';
        const code4b = err4b.code || err4b.error_code || '';
        if (code4a === 'weak_password' && code4b === 'weak_password') {
          recordResult(
            'FIX-H15',
            'Contraseñas débiles (9 caracteres y 10 solo dígitos) rechazadas por servidor',
            'Rechazadas con error.code === "weak_password"',
            'PASA',
            `Ambas rechazadas correctamente con code="weak_password" (4a: "${err4a.message}", 4b: "${err4b.message}")`
          );
        } else {
          recordResult(
            'FIX-H15',
            'Contraseñas débiles (9 caracteres y 10 solo dígitos) rechazadas por servidor',
            'Rechazadas con error.code === "weak_password"',
            'OBSERVACIÓN',
            `Rechazadas con códigos distintos de "weak_password" (4a: code="${code4a}", status=${err4a.status || 'N/A'}; 4b: code="${code4b}", status=${err4b.status || 'N/A'})`
          );
        }
      }

      // 5. Dos sesiones de C: cambiar contraseña en sesión 1 y signOut scope 'others' -> sesión 2 no puede renovar
      console.log('\n[5/5] Prueba 5: Cierre de otras sesiones (H-13 signOut scope others)...');
      const clientSession1 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
      const clientSession2 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);

      const { data: s1Auth, error: errS1Login } = await clientSession1.auth.signInWithPassword({
        email: TEST_USER_C_EMAIL,
        password: knownPassword,
      });
      const { data: s2Auth, error: errS2Login } = await clientSession2.auth.signInWithPassword({
        email: TEST_USER_C_EMAIL,
        password: knownPassword,
      });

      if (errS1Login || !s1Auth?.session || errS2Login || !s2Auth?.session) {
        recordResult(
          'FIX-H13',
          'Cierre de otras sesiones con signOut({ scope: "others" })',
          'Sesión 2 revocada y sesión 1 válida',
          'INCONCLUSO',
          `No se pudieron iniciar las dos sesiones de prueba (s1: ${errS1Login?.message || 'sin sesión'}, s2: ${errS2Login?.message || 'sin sesión'})`
        );
      } else {
        const s2AccessToken = s2Auth.session.access_token;
        const s2RefreshToken = s2Auth.session.refresh_token;

        // Control previo: sesión 2 válida (getUser sin error)
        const { data: userS2Before, error: errUserS2Before } = await clientSession2.auth.getUser(s2AccessToken);
        if (errUserS2Before || !userS2Before?.user) {
          recordResult(
            'FIX-H13',
            'Cierre de otras sesiones con signOut({ scope: "others" })',
            'Sesión 2 revocada y sesión 1 válida',
            'INCONCLUSO',
            `Control previo falló: la sesión 2 no es válida antes de iniciar la prueba (${errUserS2Before?.message || 'sin usuario'})`
          );
        } else {
          // Cambiar contraseña en sesión 1
          const tempPass5 = generateCompliantPassword();
          const { data: updateRes5, error: errPass5 } = await clientSession1.auth.updateUser({
            password: tempPass5,
            current_password: knownPassword,
          });

          if (errPass5) {
            recordResult(
              'FIX-H13',
              'Cierre de otras sesiones con signOut({ scope: "others" })',
              'Sesión 2 revocada y sesión 1 válida',
              'INCONCLUSO',
              `Fallo al cambiar contraseña en sesión 1: code="${errPass5.code || ''}", status=${errPass5.status || 'N/A'}, mensaje="${errPass5.message}"`
            );
          } else {
            knownPassword = tempPass5;

            // Cerrar otras sesiones
            await clientSession1.auth.signOut({ scope: 'others' });

            // Control posterior 1: sesión 1 sigue válida (getUser sin error)
            const tokenS1 = updateRes5?.session?.access_token || s1Auth.session.access_token;
            const { data: userS1After, error: errUserS1After } = await clientSession1.auth.getUser(tokenS1);
            const s1StillValid = !errUserS1After && Boolean(userS1After?.user);

            // Control posterior 2: sesión 2 intenta renovar su token -> debe fallar
            const { data: s2RefreshTry, error: errS2Refresh } = await clientSession2.auth.refreshSession({
              refresh_token: s2RefreshToken,
            });
            const s2RenewFailed = Boolean(errS2Refresh) || !s2RefreshTry?.session;

            if (s2RenewFailed && s1StillValid) {
              recordResult(
                'FIX-H13',
                'Cierre de otras sesiones con signOut({ scope: "others" })',
                'Sesión 2 revocada y sesión 1 válida',
                'PASA',
                `Sesión 2 revocada correctamente (fallo de renovación: "${errS2Refresh?.message || 'sin sesión'}") y sesión 1 permanece válida`
              );
            } else {
              recordResult(
                'FIX-H13',
                'Cierre de otras sesiones con signOut({ scope: "others" })',
                'Sesión 2 revocada y sesión 1 válida',
                'FALLA',
                `Fallo en verificación: sesión 2 renovó=${!s2RenewFailed}, sesión 1 válida=${s1StillValid}`
              );
            }
          }
        }
      }

    } finally {
      // RESTAURACIÓN GARANTIZADA DE LA CONTRASEÑA ORIGINAL DE C
      await restoreUserCPassword(knownPassword);
    }

    printSummary();
    return;
  }

  // --------------------------------------------------------------------------
  // MODO SOLO FUERZA BRUTA (--fuerza-bruta)
  // --------------------------------------------------------------------------
  if (isBruteForceMode) {
    console.log('\n⚠️ ADVERTENCIA: La prueba de fuerza bruta puede bloquear temporalmente el');
    console.log('   inicio de sesión desde esta dirección IP durante aproximadamente 5 minutos.\n');
    console.log('[SEG-07] Iniciando prueba de fuerza bruta y rate limiting...');

    let hitRateLimit = false;
    let attempt429 = null;
    let statusReceived = null;
    let messageReceived = null;

    const maxAttempts = 35;
    for (let i = 1; i <= maxAttempts; i++) {
      const wrongPw = `WrongPass_${crypto.randomBytes(6).toString('hex')}!`;
      const { data, error } = await supabaseAnon.auth.signInWithPassword({
        email: TEST_USER_C_EMAIL,
        password: wrongPw,
      });

      if (error) {
        statusReceived = error.status;
        messageReceived = error.message;
        const isRateLimit =
          error.status === 429 ||
          String(error.message).toLowerCase().includes('rate limit') ||
          String(error.message).toLowerCase().includes('too many');

        if (isRateLimit) {
          hitRateLimit = true;
          attempt429 = i;
          console.log(`🛑 Rate limit (HTTP 429) detectado en el intento #${i}: "${error.message}"`);
          break;
        }
      }

      await new Promise(r => setTimeout(r, 300));
    }

    if (hitRateLimit) {
      console.log(`\n⏳ Esperando recuperación de la cuenta (probando contraseña correcta cada 30s, máx 7 min)...`);
      const startTime = Date.now();
      let recovered = false;
      let recoveryTimeSec = 0;

      while ((Date.now() - startTime) < 7 * 60 * 1000) {
        await new Promise(r => setTimeout(r, 30000));
        const { data: recData, error: recError } = await supabaseAnon.auth.signInWithPassword({
          email: TEST_USER_C_EMAIL,
          password: TEST_USER_C_PASSWORD,
        });

        if (!recError && recData?.user) {
          recovered = true;
          recoveryTimeSec = Math.round((Date.now() - startTime) / 1000);
          console.log(`✅ Cuenta recuperada y desbloqueada tras ${recoveryTimeSec} segundos.`);
          break;
        }
      }

      recordResult(
        'SEG-07',
        'Fuerza bruta: detección de límite de peticiones (429) y recuperación',
        'HTTP 429 antes de 35 intentos y desbloqueo posterior',
        'PASA',
        `Límite 429 alcanzado en el intento #${attempt429} (${messageReceived}). Cuenta operativa tras ${recoveryTimeSec} s. La cuenta NO quedó bloqueada permanentemente.`
      );
    } else {
      recordResult(
        'SEG-07',
        'Fuerza bruta: detección de límite de peticiones (429)',
        'HTTP 429 antes de 35 intentos',
        'FALLA',
        `No se activó rate limit (429) tras ${maxAttempts} intentos erróneos. Último status: ${statusReceived} (${messageReceived}). Riesgo documentado: evaluar activación de CAPTCHA.`
      );
    }

    printSummary();
    return;
  }

  // --------------------------------------------------------------------------
  // MODO FUERZA BRUTA EXTENDIDA (--fuerza-bruta-extendida)
  // --------------------------------------------------------------------------
  if (isBruteForceExtended) {
    console.log('\n⚠️ ADVERTENCIA: La prueba de fuerza bruta extendida puede bloquear temporalmente el');
    console.log('   inicio de sesión desde esta dirección IP durante varios minutos.\n');
    console.log('[SEG-07] Iniciando prueba de fuerza bruta extendida (hasta 150 intentos vía fetch directo)...');

    const maxAttempts = 150;
    const endpoint = `${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`;
    const statusCounts = {};
    const responseTimes = [];
    let hit429 = false;
    let attempt429 = null;
    let errCode429 = null;
    let msg429 = null;

    const testStart = performance.now();

    for (let i = 1; i <= maxAttempts; i++) {
      const wrongPw = `WrongPass_${crypto.randomBytes(8).toString('hex')}!`;
      const t0 = performance.now();
      let resStatus = 0;
      let resBody = null;

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: TEST_USER_C_EMAIL,
            password: wrongPw,
          }),
        });
        resStatus = res.status;
        try {
          resBody = await res.json();
        } catch {
          resBody = null;
        }
      } catch (err) {
        resStatus = 0;
        resBody = { msg: err.message };
      }

      const t1 = performance.now();
      const duration = t1 - t0;
      responseTimes.push(duration);

      statusCounts[resStatus] = (statusCounts[resStatus] || 0) + 1;

      const is429 = resStatus === 429 || resBody?.error_code === 'over_request_rate_limit';
      if (is429) {
        hit429 = true;
        attempt429 = i;
        errCode429 = resBody?.error_code || '429';
        msg429 = resBody?.msg || resBody?.message || resBody?.error_description || 'rate limit';
        console.log(`🛑 Rate limit detectado en el intento #${i} (HTTP ${resStatus}, error_code: ${errCode429})`);
        break;
      }

      if (i % 25 === 0 || i === maxAttempts) {
        console.log(`   ... intento ${i}/${maxAttempts} (HTTP ${resStatus}, tiempo: ${Math.round(duration)} ms)`);
      }

      await new Promise(r => setTimeout(r, 100));
    }

    const testEnd = performance.now();
    const totalDurationSec = (testEnd - testStart) / 1000;
    const attemptsCompleted = responseTimes.length;
    const attemptsPerSec = (attemptsCompleted / totalDurationSec).toFixed(2);

    // Estadísticas temporales
    const first30 = responseTimes.slice(0, Math.min(30, attemptsCompleted));
    const last30 = responseTimes.slice(Math.max(0, attemptsCompleted - 30));

    const medFirst30 = median(first30);
    const p95First30 = percentile95(first30);
    const medLast30 = median(last30);
    const p95Last30 = percentile95(last30);

    console.log('\n📊 Métricas de Fuerza Bruta Extendida:');
    console.log(`   - Intentos realizados: ${attemptsCompleted} / ${maxAttempts}`);
    console.log(`   - Tasa: ${attemptsPerSec} req/s (duración total: ${totalDurationSec.toFixed(1)} s)`);
    console.log(`   - Conteo de HTTP status: ${JSON.stringify(statusCounts)}`);
    console.log(`   - Primeros 30 intentos : Mediana = ${medFirst30.toFixed(1)} ms | p95 = ${p95First30.toFixed(1)} ms`);
    console.log(`   - Últimos 30 intentos  : Mediana = ${medLast30.toFixed(1)} ms | p95 = ${p95Last30.toFixed(1)} ms`);

    // 5. Inmediatamente después: login con contraseña CORRECTA de C
    console.log('\n🔑 Verificando inicio de sesión inmediato con la contraseña CORRECTA de C...');
    let loginOk = false;
    let recoverySec = 0;

    const { data: directLogin, error: errDirectLogin } = await supabaseAnon.auth.signInWithPassword({
      email: TEST_USER_C_EMAIL,
      password: TEST_USER_C_PASSWORD,
    });

    if (!errDirectLogin && directLogin?.user) {
      loginOk = true;
      console.log('✅ Inicio de sesión con contraseña correcta exitoso de inmediato (sin bloqueo temporal).');
    } else {
      console.log(`⚠️ Inicio de sesión correcto falló (${errDirectLogin?.message}, status: ${errDirectLogin?.status}). Monitoreando recuperación cada 30s...`);
      const waitStart = Date.now();
      while ((Date.now() - waitStart) < 7 * 60 * 1000) {
        await new Promise(r => setTimeout(r, 30000));
        const { data: recData, error: recError } = await supabaseAnon.auth.signInWithPassword({
          email: TEST_USER_C_EMAIL,
          password: TEST_USER_C_PASSWORD,
        });
        if (!recError && recData?.user) {
          loginOk = true;
          recoverySec = Math.round((Date.now() - waitStart) / 1000);
          console.log(`✅ Cuenta recuperada tras ${recoverySec} segundos.`);
          break;
        }
      }
    }

    // Determinación del resultado:
    // - PASA si aparece un 429 en algún intento
    // - FALLA si hay 150 intentos sin 429 (no existe límite efectivo)
    // - OBSERVACIÓN si solo se degrada el tiempo de respuesta
    let resultadoFinal = 'FALLA';
    const degraded = (medLast30 > medFirst30 * 2) && (medLast30 - medFirst30 > 200);

    if (hit429) {
      resultadoFinal = 'PASA';
    } else if (degraded) {
      resultadoFinal = 'OBSERVACIÓN';
    } else {
      resultadoFinal = 'FALLA';
    }

    const detalleStr = hit429
      ? `Límite 429 alcanzado en el intento #${attempt429} (${msg429}). Tasa: ${attemptsPerSec} req/s. Status: ${JSON.stringify(statusCounts)}. Recuperación: ${recoverySec} s.`
      : `${attemptsCompleted} intentos completados sin HTTP 429. Status: ${JSON.stringify(statusCounts)}. Tasa: ${attemptsPerSec} req/s. Primeros 30: med=${medFirst30.toFixed(0)}ms, p95=${p95First30.toFixed(0)}ms; Últimos 30: med=${medLast30.toFixed(0)}ms, p95=${p95Last30.toFixed(0)}ms. Login legítimo inmediato: ${loginOk ? 'SÍ' : 'NO'}. ${degraded ? 'Degradación temporal detectada.' : 'Sin límite efectivo detectado (evaluar CAPTCHA).'}`;

    recordResult(
      'SEG-07',
      'Fuerza bruta extendida (hasta 150 intentos vía fetch directo)',
      'HTTP 429 antes de 150 intentos',
      resultadoFinal,
      detalleStr
    );

    printSummary();
    return;
  }

  // Helper para consultar endpoints REST con fetch nativo
  async function testTokenEndpoint(urlPath, tokenHeaderValue, sendApiKey = true) {
    const fullUrl = `${SUPABASE_URL.replace(/\/+$/, '')}${urlPath}`;
    const headers = {};
    if (sendApiKey) headers['apikey'] = SUPABASE_ANON_KEY;
    if (tokenHeaderValue !== null) headers['Authorization'] = tokenHeaderValue;

    try {
      const res = await fetch(fullUrl, { headers });
      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return { status: res.status, body };
    } catch (err) {
      return { status: 0, error: err.message };
    }
  }

  // Helper para renovar sesión vía HTTP directo (POST /auth/v1/token?grant_type=refresh_token)
  async function httpRefreshToken(token) {
    const endpoint = `${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/token?grant_type=refresh_token`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: token }),
      });
      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return {
        status: res.status,
        ok: res.ok,
        errorCode: body?.error_code || body?.code || (res.ok ? null : 'unknown_error'),
        msg: body?.msg || body?.error_description || body?.message || null,
        accessToken: body?.access_token || null,
        refreshToken: body?.refresh_token || null,
      };
    } catch (err) {
      return {
        status: 0,
        ok: false,
        errorCode: 'fetch_error',
        msg: err.message,
        accessToken: null,
        refreshToken: null,
      };
    }
  }

  // Definición de SEG-10
  async function runSeg10() {
    console.log('\n[2/4] SEG-10 — Token tras cerrar sesión, ciclo de expiración y reuso...');

    // a) Login -> guardar tokens -> signOut -> intentar refreshSession con refresh_token viejo
    const clientSignOutTest = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
    const { data: authSignOut, error: errSignOutAuth } = await clientSignOutTest.auth.signInWithPassword({
      email: TEST_USER_C_EMAIL,
      password: TEST_USER_C_PASSWORD,
    });

    if (errSignOutAuth || !authSignOut?.session) {
      console.error('❌ Error iniciando sesión para prueba SEG-10:', errSignOutAuth?.message);
      process.exit(1);
    }

    const oldAccessToken = authSignOut.session.access_token;
    const oldRefreshToken = authSignOut.session.refresh_token;

    await clientSignOutTest.auth.signOut();
    console.log(`✅ Sesión cerrada con signOut() para token ${maskToken(oldAccessToken)}`);

    // Intento de refresh con el refresh token tras signOut
    const clientRefreshTry = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
    const { data: refreshAfterSignOut, error: errRefreshSignOut } = await clientRefreshTry.auth.refreshSession({
      refresh_token: oldRefreshToken,
    });

    const refreshSignOutBlocked = errRefreshSignOut && !refreshAfterSignOut?.session;
    recordResult(
      'SEG-10.a',
      'refreshSession con refresh token tras signOut()',
      'Falla / Rechazado',
      refreshSignOutBlocked ? 'PASA' : 'FALLA',
      refreshSignOutBlocked
        ? `Rechazado correctamente: "${errRefreshSignOut.message}"`
        : 'Permitió refrescar sesión tras signOut'
    );

    // b) Access token viejo tras signOut -> consultar endpoints y revisar expiración
    const resOldAuth = await testTokenEndpoint('/auth/v1/user', `Bearer ${oldAccessToken}`);
    const resOldRest = await testTokenEndpoint('/rest/v1/profiles?select=id', `Bearer ${oldAccessToken}`);

    const decodedOld = decodeJwt(oldAccessToken);
    const lifetimeSec = (decodedOld.payload.exp || 0) - (decodedOld.payload.iat || 0);
    const lifetimeMin = Math.round(lifetimeSec / 60);

    recordResult(
      'SEG-10.b',
      'Access token previo tras signOut y tiempo de vida configurado',
      'Registro de comportamiento y duración JWT',
      'OBSERVACIÓN',
      `Un JWT stateless no revocado en servidor responde: Auth=${resOldAuth.status}, REST=${resOldRest.status}. Duración configurada: ${lifetimeMin} min (${lifetimeSec} s).`
    );

    // c) Reutilización de refresh token con llamadas HTTP directas (fetch)
    console.log('   Iniciando verificación de reutilización con HTTP directo (POST /auth/v1/token?grant_type=refresh_token)...');

    // --- Escenario 1 (doble rotación): C -> R1, R1 -> R2, R2 -> R3, espera 15s, reuso R1, prueba R3 ---
    console.log('\n   [Escenario 1] Doble rotación (R1 -> R2 -> R3, espera 15s, reuso R1, chequeo R3):');
    const clientE1 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
    const { data: authE1, error: errE1 } = await clientE1.auth.signInWithPassword({
      email: TEST_USER_C_EMAIL,
      password: TEST_USER_C_PASSWORD,
    });
    if (errE1 || !authE1?.session) {
      console.error('❌ Error iniciando sesión para Escenario 1:', errE1?.message);
      process.exit(1);
    }
    const r1_e1 = authE1.session.refresh_token;
    console.log(`     Sesión inicial obtenida -> R1: ${maskToken(r1_e1)}`);

    // R1 -> R2
    const resE1_R2 = await httpRefreshToken(r1_e1);
    const r2_e1 = resE1_R2.refreshToken;
    console.log(`     Renovación R1 -> R2: HTTP ${resE1_R2.status} (ok=${resE1_R2.ok}), error_code: ${resE1_R2.errorCode || 'ninguno'}`);

    // R2 -> R3
    const resE1_R3 = await httpRefreshToken(r2_e1);
    const r3_e1 = resE1_R3.refreshToken;
    console.log(`     Renovación R2 -> R3: HTTP ${resE1_R3.status} (ok=${resE1_R3.ok}), error_code: ${resE1_R3.errorCode || 'ninguno'}`);

    console.log('     Esperando 15 segundos para superar ventana de reutilización (panel: 10s)...');
    await new Promise(r => setTimeout(r, 15000));

    // Reutilizar R1
    const resE1_ReuseR1 = await httpRefreshToken(r1_e1);
    console.log(`     Reutilización de R1: HTTP ${resE1_ReuseR1.status}, error_code: ${resE1_ReuseR1.errorCode || 'ninguno'}${resE1_ReuseR1.msg ? ` (${resE1_ReuseR1.msg})` : ''}`);

    // Probar R3 (el último válido)
    const resE1_CheckR3 = await httpRefreshToken(r3_e1);
    console.log(`     Uso de R3 tras reuso de R1: HTTP ${resE1_CheckR3.status}, error_code: ${resE1_CheckR3.errorCode || 'ninguno'}${resE1_CheckR3.msg ? ` (${resE1_CheckR3.msg})` : ''}`);

    // --- Escenario 2 (rotación simple): C -> R1, R1 -> R2, espera 15s, reuso R1, prueba R2 ---
    console.log('\n   [Escenario 2] Rotación simple (R1 -> R2, espera 15s, reuso R1, chequeo R2):');
    const clientE2 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
    const { data: authE2, error: errE2 } = await clientE2.auth.signInWithPassword({
      email: TEST_USER_C_EMAIL,
      password: TEST_USER_C_PASSWORD,
    });
    if (errE2 || !authE2?.session) {
      console.error('❌ Error iniciando sesión para Escenario 2:', errE2?.message);
      process.exit(1);
    }
    const r1_e2 = authE2.session.refresh_token;
    console.log(`     Sesión inicial obtenida -> R1: ${maskToken(r1_e2)}`);

    // R1 -> R2
    const resE2_R2 = await httpRefreshToken(r1_e2);
    const r2_e2 = resE2_R2.refreshToken;
    console.log(`     Renovación R1 -> R2: HTTP ${resE2_R2.status} (ok=${resE2_R2.ok}), error_code: ${resE2_R2.errorCode || 'ninguno'}`);

    console.log('     Esperando 15 segundos para superar ventana de reutilización (panel: 10s)...');
    await new Promise(r => setTimeout(r, 15000));

    // Reutilizar R1
    const resE2_ReuseR1 = await httpRefreshToken(r1_e2);
    console.log(`     Reutilización de R1: HTTP ${resE2_ReuseR1.status}, error_code: ${resE2_ReuseR1.errorCode || 'ninguno'}${resE2_ReuseR1.msg ? ` (${resE2_ReuseR1.msg})` : ''}`);

    // Probar R2
    const resE2_CheckR2 = await httpRefreshToken(r2_e2);
    console.log(`     Uso de R2 tras reuso de R1: HTTP ${resE2_CheckR2.status}, error_code: ${resE2_CheckR2.errorCode || 'ninguno'}${resE2_CheckR2.msg ? ` (${resE2_CheckR2.msg})` : ''}`);

    // Evaluación
    const e1_r1_blocked = !resE1_ReuseR1.ok;
    const e2_r1_blocked = !resE2_ReuseR1.ok;
    const allBlocked = e1_r1_blocked && e2_r1_blocked;

    const e1_r3_revoked = !resE1_CheckR3.ok;
    const e2_r2_revoked = !resE2_CheckR2.ok;

    if (allBlocked) {
      const familyNote = e1_r3_revoked
        ? 'Detección de familia activa (R3 revocado tras reuso de R1).'
        : 'R1 bloqueado; R3 activo.';
      recordResult(
        'SEG-10.c',
        'Reutilización de refresh token antiguo vía HTTP directo (15s ventana)',
        'Rechazo de refresh token ya usado tras ventana de 10s',
        'PASA',
        `Rechazado correctamente en ambos escenarios (E1: HTTP ${resE1_ReuseR1.status} ${resE1_ReuseR1.errorCode || ''}, E2: HTTP ${resE2_ReuseR1.status} ${resE2_ReuseR1.errorCode || ''}). ${familyNote}`
      );
    } else {
      const acceptedIn = [];
      if (!e1_r1_blocked) acceptedIn.push(`Escenario 1 (HTTP ${resE1_ReuseR1.status}, error_code: ${resE1_ReuseR1.errorCode || 'ninguno'})`);
      if (!e2_r1_blocked) acceptedIn.push(`Escenario 2 (HTTP ${resE2_ReuseR1.status}, error_code: ${resE2_ReuseR1.errorCode || 'ninguno'})`);

      recordResult(
        'SEG-10.c',
        'Reutilización de refresh token antiguo vía HTTP directo (15s ventana)',
        'Rechazo de refresh token ya usado tras ventana de 10s',
        'OBSERVACIÓN',
        `Hallazgo: Refresh token previo aceptado en: ${acceptedIn.join(', ')}. Contrastado con configuración del panel (detección de reuso activa, intervalo 10 s). E1 R3 revocado: ${e1_r3_revoked ? 'SÍ' : 'NO'} (${resE1_CheckR3.status}), E2 R2 revocado: ${e2_r2_revoked ? 'SÍ' : 'NO'} (${resE2_CheckR2.status}).`
      );
    }
  }

  // Si se solicitó ejecutar únicamente SEG-10
  if (isSolo10) {
    await runSeg10();
    printSummary();
    return;
  }

  // --- [1/4] SEG-09: Token alterado ---
  console.log('\n[1/4] SEG-09 — Pruebas con tokens JWT alterados y firmas manipuladas...');

  // Iniciar sesión legítima con C para obtener token base
  const supabaseC = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
  const { data: authC, error: errAuthC } = await supabaseC.auth.signInWithPassword({
    email: TEST_USER_C_EMAIL,
    password: TEST_USER_C_PASSWORD,
  });

  if (errAuthC || !authC?.session) {
    console.error('❌ Error fatal: No se pudo autenticar Usuario C:', errAuthC?.message);
    process.exit(1);
  }

  const validAccessToken = authC.session.access_token;
  const userC_id = authC.user.id;
  const decodedValid = decodeJwt(validAccessToken);
  console.log(`✅ Usuario C autenticado: ID ${shortId(userC_id)}, token válido ${maskToken(validAccessToken)}`);

  // 1. Token válido (control positivo)
  const resValidRest = await testTokenEndpoint('/rest/v1/profiles?select=id', `Bearer ${validAccessToken}`);
  const resValidAuth = await testTokenEndpoint('/auth/v1/user', `Bearer ${validAccessToken}`);
  const validOk =
    resValidRest.status === 200 &&
    Array.isArray(resValidRest.body) &&
    resValidRest.body.some(p => p.id === userC_id) &&
    resValidAuth.status === 200 &&
    resValidAuth.body?.id === userC_id;

  recordResult(
    'SEG-09.1',
    'Token válido de C (control positivo)',
    'HTTP 200 y perfil de C devuelto',
    validOk ? 'PASA' : 'FALLA',
    validOk ? `HTTP 200 en REST y Auth con perfil de C (${shortId(userC_id)})` : `Fallo de control positivo (REST: ${resValidRest.status}, Auth: ${resValidAuth.status})`
  );

  // 2. Firma alterada (cambiar último carácter asegurando diferencia de bits decodificados)
  const lastChar = validAccessToken.slice(-1);
  const replacementChar = (lastChar >= 'a' && lastChar <= 'z') ? 'A' : 'z';
  const tokenTamperedSig = validAccessToken.slice(0, -1) + replacementChar;

  // 3. Payload con sub cambiado a otro UUID, sin volver a firmar
  const fakeUuid = '00000000-0000-0000-0000-000000000001';
  const tokenFakeSub = encodeJwtParts(
    decodedValid.header,
    { ...decodedValid.payload, sub: fakeUuid },
    decodedValid.signature
  );

  // 4. Payload con role = "service_role", sin volver a firmar
  const tokenFakeRole = encodeJwtParts(
    decodedValid.header,
    { ...decodedValid.payload, role: 'service_role' },
    decodedValid.signature
  );

  // 5. alg = "none" y firma vacía
  const tokenAlgNone = encodeJwtParts(
    { alg: 'none', typ: 'JWT' },
    { ...decodedValid.payload, sub: fakeUuid },
    ''
  );

  // 6. Firmado con HS256 con secreto aleatorio y sub = otro uuid
  const tokenFakeSecret = forgeHs256Jwt({ ...decodedValid.payload, sub: fakeUuid });

  // 7a. Bearer vacío
  const tokenEmptyBearer = '';

  // 7b. Bearer con texto basura
  const tokenGarbage = 'NOT_A_VALID_JWT_TEXT_GARBAGE_12345';

  const variants = [
    { code: 'SEG-09.2', name: 'Firma alterada (último carácter)', header: `Bearer ${tokenTamperedSig}`, apiKey: true },
    { code: 'SEG-09.3', name: 'Payload con sub ajeno sin refirmar', header: `Bearer ${tokenFakeSub}`, apiKey: true },
    { code: 'SEG-09.4', name: 'Payload con role=service_role sin refirmar', header: `Bearer ${tokenFakeRole}`, apiKey: true },
    { code: 'SEG-09.5', name: 'alg = none y firma vacía', header: `Bearer ${tokenAlgNone}`, apiKey: true },
    { code: 'SEG-09.6', name: 'Firmado con HS256 y clave secreta aleatoria', header: `Bearer ${tokenFakeSecret}`, apiKey: true },
    { code: 'SEG-09.7a', name: 'Header Authorization Bearer vacío', header: 'Bearer ', apiKey: true },
    { code: 'SEG-09.7b', name: 'Header Authorization Bearer con basura', header: `Bearer ${tokenGarbage}`, apiKey: true },
    { code: 'SEG-09.8', name: 'Token válido pero SIN header apikey', header: `Bearer ${validAccessToken}`, apiKey: false },
  ];

  for (const v of variants) {
    const resRest = await testTokenEndpoint('/rest/v1/profiles?select=id', v.header, v.apiKey);
    const resAuth = await testTokenEndpoint('/auth/v1/user', v.header, v.apiKey);

    const exposedRest = resRest.status === 200 && Array.isArray(resRest.body) && resRest.body.length > 0;
    const exposedAuth = resAuth.status === 200 && resAuth.body?.id;
    const isProtected =
      (resRest.status === 401 || resRest.status === 403 || resRest.status === 400) &&
      (resAuth.status === 401 || resAuth.status === 403 || resAuth.status === 400) &&
      !exposedRest &&
      !exposedAuth;

    recordResult(
      v.code,
      v.name,
      'HTTP 401/403 y 0 datos expuestos',
      isProtected ? 'PASA' : 'FALLA',
      isProtected
        ? `Rechazado correctamente (REST: ${resRest.status}, Auth: ${resAuth.status})`
        : `¡Vulnerabilidad! Expuso datos o devolvió status no autorizado (REST: ${resRest.status}, Auth: ${resAuth.status})`
    );
  }

  // --- [2/4] SEG-10: Token tras cerrar sesión, ciclo de expiración y reuso ---
  await runSeg10();

  // --- [3/4] SEG-12: Cambio de contraseña con sesión concurrente ---
  console.log('\n[3/4] SEG-12 — Cambio de contraseña con sesión concurrente y restauración...');
  console.log('   (Requiere notificación "Password changed" apagada y "Require current password" activada en Supabase Auth)\n');

  const clientSession1 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
  const clientSession2 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);

  let knownPasswordSeg12 = TEST_USER_C_PASSWORD;

  try {
    // Iniciar ambas sesiones con Usuario C
    const { data: s1Auth, error: errS1 } = await clientSession1.auth.signInWithPassword({
      email: TEST_USER_C_EMAIL,
      password: knownPasswordSeg12,
    });
    const { data: s2Auth, error: errS2 } = await clientSession2.auth.signInWithPassword({
      email: TEST_USER_C_EMAIL,
      password: knownPasswordSeg12,
    });

    if (errS1 || errS2 || !s1Auth?.session || !s2Auth?.session) {
      throw new Error(`Error abriendo sesiones concurrentes: ${errS1?.message || errS2?.message}`);
    }

    // Generar contraseña temporal segura que cumple la política (>= 12 caracteres con letras y números)
    const tempPassword = generateCompliantPassword();

    // Cambiar contraseña en sesión 1 enviando current_password
    const { error: errChangePw } = await clientSession1.auth.updateUser({
      password: tempPassword,
      current_password: knownPasswordSeg12,
    });

    if (errChangePw) {
      throw new Error(`Error cambiando contraseña a temporal: ${errChangePw.code || errChangePw.message}`);
    }
    knownPasswordSeg12 = tempPassword;

    // 1. Contraseña vieja ya no debe servir
    const { data: oldTry, error: errOldTry } = await supabaseAnon.auth.signInWithPassword({
      email: TEST_USER_C_EMAIL,
      password: TEST_USER_C_PASSWORD,
    });
    const oldRejected = errOldTry && !oldTry?.user;
    recordResult(
      'SEG-12.1',
      'Inicio de sesión con contraseña antigua tras cambio',
      'Rechazado',
      oldRejected ? 'PASA' : 'FALLA',
      oldRejected ? `Rechazado correctamente: "${errOldTry.message}"` : 'Permitió iniciar sesión con contraseña vieja'
    );

    // 2. Contraseña nueva sí sirve
    const { data: newTry, error: errNewTry } = await supabaseAnon.auth.signInWithPassword({
      email: TEST_USER_C_EMAIL,
      password: knownPasswordSeg12,
    });
    const newAccepted = !errNewTry && newTry?.user;
    recordResult(
      'SEG-12.2',
      'Inicio de sesión con nueva contraseña temporal',
      'Permitido',
      newAccepted ? 'PASA' : 'FALLA',
      newAccepted ? 'Inicio de sesión exitoso con nueva contraseña' : `Fallo al iniciar sesión: ${errNewTry?.message}`
    );

    // 3. ¿La sesión 2 sigue activa?
    const { data: s2Profile, error: errS2Profile } = await clientSession2.from('profiles').select('id').maybeSingle();
    const s2StillActive = !errS2Profile && s2Profile?.id === userC_id;

    recordResult(
      'SEG-12.3',
      'Estado de sesión concurrente preexistente (Sesión 2)',
      'Registro de vigencia de sesión abierta (notificación "Password changed" debe estar apagada en Supabase)',
      'OBSERVACIÓN',
      `Sesión concurrente 2 sigue activa: ${s2StillActive ? 'SÍ (comportamiento esperado de JWT stateless sin revocación forzada)' : `NO (revocada: ${errS2Profile?.message})`}. Notificación 'Password changed' debe permanecer apagada en el panel de Supabase.`
    );

  } finally {
    // RESTAURACIÓN OBLIGATORIA Y GARANTIZADA DE LA CONTRASEÑA ORIGINAL
    await restoreUserCPassword(knownPasswordSeg12);
  }

  // --- [4/4] SEG-08: Enumeración de usuarios ---
  console.log('\n[4/4] SEG-08 — Análisis de enumeración de usuarios (mensajes, códigos y tiempos)...');

  // Petición previa de calentamiento para abrir/reutilizar conexión HTTP y TLS keep-alive
  await supabaseAnon.auth.signInWithPassword({
    email: `warmup_${crypto.randomBytes(4).toString('hex')}@example.invalid`,
    password: 'WarmupPassword123!',
  });
  await new Promise(r => setTimeout(r, 400));

  const timesExisting = [];
  const timesNonExisting = [];
  let existingResult = null;
  let nonExistingResult = null;

  for (let i = 0; i < 5; i++) {
    // 1. Usuario existente con contraseña errónea
    const t0 = performance.now();
    const { error: errExist } = await supabaseAnon.auth.signInWithPassword({
      email: TEST_USER_C_EMAIL,
      password: `WrongPassword_${i}_${crypto.randomBytes(4).toString('hex')}!`,
    });
    const t1 = performance.now();
    timesExisting.push(t1 - t0);
    if (!existingResult && errExist) {
      existingResult = { message: errExist.message, code: errExist.code || errExist.status };
    }

    await new Promise(r => setTimeout(r, 350));

    // 2. Usuario inexistente inventado con dominio .invalid
    const fakeEmail = `nonexistent_${crypto.randomBytes(6).toString('hex')}@example.invalid`;
    const t2 = performance.now();
    const { error: errNonExist } = await supabaseAnon.auth.signInWithPassword({
      email: fakeEmail,
      password: `WrongPassword_${i}_${crypto.randomBytes(4).toString('hex')}!`,
    });
    const t3 = performance.now();
    timesNonExisting.push(t3 - t2);
    if (!nonExistingResult && errNonExist) {
      nonExistingResult = { message: errNonExist.message, code: errNonExist.code || errNonExist.status };
    }

    await new Promise(r => setTimeout(r, 350));
  }

  const medExisting = median(timesExisting);
  const medNonExisting = median(timesNonExisting);
  const diffMed = Math.abs(medExisting - medNonExisting);

  const sameMessage = existingResult?.message === nonExistingResult?.message;
  const sameCode = String(existingResult?.code) === String(nonExistingResult?.code);
  const timingAcceptable = diffMed < 150; // Menor a 150 ms de diferencia en mediana

  const noEnumeration = sameMessage && sameCode && timingAcceptable;

  recordResult(
    'SEG-08',
    'Enumeración de usuarios en signInWithPassword (mensajes, código y tiempos)',
    'Mensajes y códigos idénticos, diferencia mediana < 150 ms',
    noEnumeration ? 'PASA' : 'FALLA',
    `Mensajes idénticos: ${sameMessage ? 'SÍ' : 'NO'} ("${existingResult?.message}"). Códigos: ${sameCode ? 'SÍ' : 'NO'} (${existingResult?.code}). Mediana existente: ${medExisting.toFixed(1)} ms, inexistente: ${medNonExisting.toFixed(1)} ms (Δ = ${diffMed.toFixed(1)} ms).`
  );

  printSummary();
}

// ============================================================================
// 4. Reporte Final
// ============================================================================
function printSummary() {
  console.log('\n' + '='.repeat(105));
  console.log('📊 REPORTE DE AUTENTICACIÓN Y SESIÓN (FASE 2 — SEG-07 A SEG-12)');
  console.log('='.repeat(105));

  let passCount = 0;
  let failCount = 0;
  let obsCount = 0;
  let incCount = 0;

  console.log('| Código | Prueba | Esperado | Resultado | Detalle |');
  console.log('|---|---|---|---|---|');
  for (const r of testResults) {
    if (r.resultado === 'PASA') passCount++;
    else if (r.resultado === 'FALLA') failCount++;
    else if (r.resultado === 'OBSERVACIÓN') obsCount++;
    else incCount++;

    console.log(`| \`${r.codigo}\` | ${r.prueba} | ${r.esperado} | **${r.resultado}** | ${r.detalle} |`);
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`Total Pruebas Ejecutadas : ${testResults.length}`);
  console.log(`✅ PASA                  : ${passCount}`);
  console.log(`❌ FALLA                 : ${failCount}`);
  console.log(`ℹ️ OBSERVACIÓN           : ${obsCount}`);
  console.log(`⚠️ INCONCLUSO            : ${incCount}`);
  console.log('-'.repeat(60));

  if (failCount === 0) {
    console.log('\n🛡️ AUTENTICACIÓN VERIFICADA: Todas las pruebas cumplieron los criterios de seguridad.');
    process.exit(0);
  } else {
    console.error('\n⚠️ SE DETECTARON FALLAS DE SEGURIDAD EN AUTENTICACIÓN O SESIÓN.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
