# Guía de Despliegue, Operación y Generación de APK

Este documento detalla los pasos reproducibles para configurar el backend de datos en Supabase, inicializar el entorno de desarrollo local, compilar la versión web para producción y generar el paquete instalador APK para dispositivos móviles Android.

---

## 1. Configuración de Supabase desde Cero

Para desplegar un entorno limpio de base de datos para Rentabill:

1. **Crear un Proyecto en Supabase:**
   * Crear una nueva organización o proyecto en el panel de control de Supabase con región Sudamérica (Sao Paulo) para baja latencia en Perú.
2. **Ejecutar el Esquema SQL Oficial (v3.7):**
   * Abrir el editor de SQL (*SQL Editor*) en el panel de Supabase.
   * Cargar y ejecutar íntegramente el contenido del archivo oficial del repositorio:
     ```text
     supabase/rentabill_schema_v3.7.sql
     ```
   * Este script creará de forma atómica:
     * Las 16 tablas con constraints e índices.
     * La vista calculada `product_stats`.
     * Las 8 funciones RPC (`process_sale`, `process_purchase`, etc.).
     * Los triggers de integridad y sincronización de perfiles.
     * Las políticas de Row Level Security (RLS) con `FORCE`.
3. **Configurar el Bucket de Supabase Storage:**
   * Si no se creó automáticamente, crear en el panel de Storage un bucket público llamado `product-images`.
4. **Obtener las Credenciales de Conexión:**
   * En el panel del proyecto -> *Project Settings* -> *API*, copiar:
     * La URL del Proyecto (*Project URL*).
     * La Clave Anónima Pública (*anon / public key*).

---

## 2. Configuración del Entorno Local y Variables

1. **Requisitos del Sistema:**
   * Node.js versión `20.x` o `22 LTS` recomendada (`npm` versión 10+).
   * Java Development Kit (JDK 17 o superior) para compilación de Android.
   * Android SDK con `platform-tools` instalado.
2. **Instalación de Dependencias:**
   ```bash
   npm install
   ```
3. **Creación del Archivo de Variables de Entorno (`.env`):**
   Copiar la plantilla `.env.example` en la raíz del proyecto creando el archivo `.env`:
   ```env
   VITE_SUPABASE_URL="https://tu-proyecto.supabase.co"
   VITE_SUPABASE_ANON_KEY="tu-anon-key-de-supabase"
   ```

---

## 3. Ejecución en Modo Desarrollo y Compilación Web

* **Iniciar Servidor de Desarrollo:**
  ```bash
  npm run dev
  ```
  Inicia el servidor Vite en el puerto **3000** (`http://localhost:3000`), con escucha en `0.0.0.0` para pruebas en red local desde teléfonos inteligentes.

* **Compilar para Producción Web (PWA):**
  ```bash
  npm run build
  ```
  Genera los archivos optimizados y minificados en la carpeta `dist/`.

---

## 4. Generación del Paquete APK para Android

Para generar el instalador de depuración (*Debug APK*) para probar la aplicación en teléfonos Android físicos o emuladores:

### Paso 1: Generar el Bundle Web
```bash
npm run build
```

### Paso 2: Sincronizar con el Proyecto Nativo de Capacitor
```bash
npx cap sync android
```
Este comando copia los artefactos de `dist/` a `android/app/src/main/assets/public/` y actualiza las dependencias de los plugins nativos.

### Paso 3: Compilar con Gradle
* **En Windows (PowerShell / CMD):**
  ```bash
  cd android
  .\gradlew.bat assembleDebug
  cd ..
  ```
* **En Linux o macOS:**
  ```bash
  cd android
  ./gradlew assembleDebug
  cd ..
  ```

### Paso 4: Ubicación del Archivo APK Generado
El archivo binario compilado queda generado en la ruta:
```text
android/app/build/outputs/apk/debug/app-debug.apk
```

> [!NOTE] Exclusión de Binarios en Git
> Los archivos ejecutables `*.apk`, `*.aab` y los directorios de compilación `android/app/build/` están incluidos en `.gitignore` y **no se versionan en el repositorio remoto**.

---

## 5. Estrategia de Versionado del Proyecto

El sistema mantiene un esquema de versionado en tres ejes:
1. **Paquete Web (`package.json:4`):** Gestionado como módulo base (`version: 0.0.0`).
2. **Aplicación Móvil (`android/app/build.gradle:10-11`):**
   * `versionCode`: Entero incremental que identifica compilaciones para Android (`versionCode 4`). Cada vez que se compila un nuevo APK para pruebas se eleva en $+1$.
   * `versionName`: Cadena de versión semántica visible para el usuario (`"1.0"`).
3. **Esquema de Base de Datos (`supabase/rentabill_schema_v3.7.sql`):** Versión declarativa `3.7.0` que acompaña a la consolidación relacional y alineación de RPCs.
