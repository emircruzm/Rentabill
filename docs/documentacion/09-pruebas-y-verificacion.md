# Procedimientos de Verificación, Calidad y Pruebas Técnicas

Este documento describe con rigor las herramientas de verificación automatizada que existen formalmente en el repositorio de Rentabill, su cobertura técnica y la declaración transparente de sus limitaciones de prueba.

---

## 1. Verificaciones que Existen Realmente en el Proyecto

El proyecto dispone de 4 mecanismos de validación automatizada configurados en `package.json:6-13` y ejecutables localmente o en un flujo de integración continua:

### 1.1. Verificación de Capas de Arquitectura (`npm run check:layers`)
* **Comando:** `npm run check:layers` (ejecuta `node scripts/check-layers.mjs`).
* **Mecanismo:** Analizador estático basado en expresiones regulares que examina las cláusulas `import` de todos los archivos en `src/`.
* **Reglas que Audita:**
  * Que `src/presentation/` no importe de `src/data/`, `@supabase/*` ni `@capacitor/*`.
  * Que `src/application/` no importe de `src/presentation/` ni `@capacitor/*`.
  * Que `src/application/logic/` esté completamente desacoplado de React, red y plataforma.
  * Que `src/platform/` y `src/data/` no importen de capas superiores.
  * Que `src/shared/` permanezca como módulo puro sin dependencias internas.
* **Resultado Esperado:** Mensaje de éxito: `✅ ¡Excelente! Cero violaciones de capas encontradas.`

### 1.2. Verificación Matemática de Fórmulas Financieras (`verify-logic.mjs`)
* **Comando:** `npx tsx scripts/verify-logic.mjs`.
* **Mecanismo:** Ejecuta 3 casos de prueba matemáticos deterministas sobre las funciones puras de `src/application/logic/financialMetrics.ts`:
  1. *Caso 1 (Tienda vacía):* Valida que con catálogo vacío el capital invertido sea exactamente `0` y el puntaje base `40`.
  2. *Caso 2 (Producto estimado - Leche Gloria):* Valida margen unitario de S/ 0.70, velocidad estimada de 1.03 unid/día y estado `ESTIMADO`.
  3. *Caso 3 (Producto real con ventas - Arroz Costeño):* Valida velocidad real calculada de 3.00 kg/día y transición automática a estado `REAL`.
  4. *Evaluación global:* Valida capital total invertido de S/ 284.00 y 70.4% de capital en modo real.
* **Resultado Esperado:** `✅ ¡Verificación matemática superada! Las fórmulas son 100% idénticas.`

### 1.3. Comprobación Estricta de Tipos de TypeScript (`npm run lint`)
* **Comando:** `npm run lint` o `npx tsc --noEmit`.
* **Mecanismo:** Compilador de TypeScript (`tsc`) con configuración estricta (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`).
* **Cobertura:** Audita que todas las interfaces, mappers, propiedades de componentes y firmas de casos de uso encajen sin discrepancias de tipos.
* **Resultado Esperado:** Salida limpia con código de retorno `0`.

### 1.4. Empaquetado de Producción Web (`npm run build`)
* **Comando:** `npm run build` (ejecuta `vite build`).
* **Mecanismo:** Procesa TypeScript, compila clases utilitarias de Tailwind CSS v4 con `@tailwindcss/vite` y genera los artefactos minificados en `dist/`.
* **Resultado Esperado:** Generación exitosa de bundles JS/CSS sin advertencias de dependencias no resueltas.

---

## 2. Declaración Transparente: Qué NO Cubren las Pruebas

> [!WARNING] Ausencia de Framework de Pruebas Unitarias Automatizadas
> El proyecto **no implementa un framework de pruebas unitarias automatizadas** (como Jest, Vitest o Mocha) en sus dependencias de `package.json:35-45`.

### Límites de Cobertura Actuales:
1. **Sin Pruebas Unitarias de Componentes UI:** No se ejecutan pruebas de renderizado ni simulación de eventos en componentes de React (ausencia de React Testing Library).
2. **Sin Pruebas End-to-End (E2E):** No existen scripts de automatización de navegador (Cypress o Playwright) que simulen el flujo completo de venta desde la selección en pantalla hasta la emisión del ticket.
3. **Sin Pruebas de Integración con Backend:** Las políticas de Row Level Security (RLS) y las 8 funciones RPC se validan mediante la suite manual/histórica en SQL y mediante pruebas exploratorias en el cliente, pero no mediante un pipeline automatizado de integración continua contra una instancia local de Supabase.
