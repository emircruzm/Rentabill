# Raíz de Composición, Configuración y Scripts de Verificación

Este documento detalla los archivos de arranque del sistema, los mecanismos de configuración de compilación web y móvil, los scripts de verificación automatizada y la gestión de variables de entorno.

---

## 1. Puntos de Entrada y Raíz de Composición

### 1.1. `src/main.tsx:1-16` (Bootstrap del Sistema)
* **Propósito:** Punto de entrada de la aplicación en el navegador o webview móvil.
* **Inyección de Infraestructura:** Antes de montar React, inyecta el adaptador nativo de preferencias en el cliente de datos:
  ```typescript
  import { setSupabaseStorage } from './data/supabase/client';
  import { capacitorPreferencesStorage } from './platform/storage/capacitorPreferencesStorage';

  setSupabaseStorage(capacitorPreferencesStorage);
  ```
* **Montaje del DOM:** Inicializa el árbol de componentes dentro de `<div id="root"></div>` envolviéndolo en `<InventoryProvider>`.

### 1.2. `src/App.tsx:1-91` (Controlador de Navegación y Modales)
* **Propósito:** Componente raíz visual que coordina la navegación y la apertura de modales.
* **Control de Navegación por Rol:**
  * Si el usuario no tiene sesión activa, renderiza `AuthView`.
  * Si el usuario no tiene tiendas asociadas, renderiza `OnboardingView`.
  * Si hay error crítico de conexión de red, renderiza `ConnectionErrorView`.
  * Si está autenticado, renderiza la cabecera `Header`, la vista activa seleccionada (`activeTab`) y la barra inferior `BottomNavigation`.
  * Restricción en caliente: Si un usuario con rol `CAJERO` intenta acceder a una pestaña no autorizada (como Pulso o Ajustes), es redirigido automáticamente a la vista de ventas `POSView`.
* **Montaje de Modales Globales:** Mantiene en el DOM los modales de selección de tienda, edición de producto, invitación de equipo y el banner de advertencia `RoleTestBanner`.

---

## 2. Configuración de Compilación y Entorno

### 2.1. `vite.config.ts`
* **Plugins integrados:**
  * `@vitejs/plugin-react`: Soporte para JSX/TSX y Fast Refresh.
  * `@tailwindcss/vite`: Compilador nativo de Tailwind CSS v4.
* **Servidor de Desarrollo:** Configurado con `--port=3000` y `--host=0.0.0.0` para permitir pruebas desde dispositivos móviles en la misma red local Wi-Fi.

### 2.2. `tsconfig.json`
* **Compilación:** `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "Bundler"`.
* **Rigurosidad de Tipado:** `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, garantizando que ninguna inconsistencia de tipos pase desapercibida.

### 2.3. `capacitor.config.ts`
* **Identificador de Aplicación:** `appId: 'com.proyecto.rentabill'`.
* **Nombre Comercial:** `appName: 'Rentabill'`.
* **Directorio Web:** `webDir: 'dist'`.

### 2.4. `android/app/build.gradle`
* **Versión de Compilación:**
  * `versionCode: 4`
  * `versionName: "1.0"`
* **SDK:** `minSdkVersion: 22` (Android 5.1+), `targetSdkVersion: 34` (Android 14).
* **Plugins Android:** `com.android.application`, `capacitor-cordova-android-plugins`.

---

## 3. Scripts de Automatización en `package.json:6-13`

| Comando Script | Instrucción Ejecutada | Propósito Técnico |
| :--- | :--- | :--- |
| **`npm run dev`** | `vite --port=3000 --host=0.0.0.0` | Inicia el servidor de desarrollo web local en el puerto 3000. |
| **`npm run build`** | `vite build` | Compila y empaqueta el bundle de producción en la carpeta `dist/`. |
| **`npm run preview`**| `vite preview` | Previsualiza el bundle compilado de producción localmente. |
| **`npm run clean`** | `rm -rf dist server.js` | Limpia artefactos de compilaciones previas. |
| **`npm run lint`** | `tsc --noEmit` | Ejecuta la comprobación estricta de tipos de TypeScript sin emitir archivos. |
| **`npm run check:layers`** | `node scripts/check-layers.mjs` | Audita las reglas de importación entre capas para evitar dependencias ilegales. |

---

## 4. Scripts de Verificación en `scripts/`

### 4.1. `scripts/check-layers.mjs` (Auditoría de Arquitectura)
* **Mecanismo:** Analiza mediante expresiones regulares las sentencias `import` de todos los archivos TypeScript en `src/`.
* **Reglas validadas:**
  * Que `src/presentation/` no importe de `src/data/`, `@supabase/*` ni `@capacitor/*`.
  * Que `src/application/` no importe de `src/presentation/` ni `@capacitor/*`.
  * Que `src/application/logic/` no importe de React ni de librerías externas.
  * Que `src/platform/` y `src/data/` no importen de capas superiores.
  * Que `src/shared/` permanezca 100% aislado.

### 4.2. `scripts/verify-logic.mjs` (Verificación Matemática de Fórmulas)
* **Mecanismo:** Ejecuta 3 escenarios de prueba en Node.js sobre `financialMetrics.ts`:
  1. *Tienda vacía:* Valida capital invertido en 0 y puntaje base.
  2. *Producto estimado:* Valida márgenes y velocidad semanal proyectada para Leche Gloria (S/ 0.70 de margen, velocidad 1.03 unid/día).
  3. *Producto calibrado real:* Valida cálculo de velocidad real con ventas acumuladas para Arroz Costeño (3.00 kg/día y estado `REAL`).
* **Comando de ejecución:** `npx tsx scripts/verify-logic.mjs`.

---

## 5. Gestión de Variables de Entorno

El sistema no incluye claves privadas ni tokens de servicio en su código fuente. Las variables necesarias para conectar con el backend de datos se leen mediante `import.meta.env` y están declaradas en la plantilla `.env.example`:

* **`VITE_SUPABASE_URL`:** URL pública del proyecto Supabase (endpoint REST/GraphQL/Auth).
* **`VITE_SUPABASE_ANON_KEY`:** Clave pública anónima (*anon key*) del cliente Supabase, protegida por políticas de Row Level Security (RLS) en el servidor.
