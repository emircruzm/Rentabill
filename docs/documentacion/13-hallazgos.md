# Bitácora de Hallazgos Técnicos, Incoherencias y Código Muerto

En cumplimiento estricto de la regla número 1, **ninguno de los hallazgos descritos a continuación ha sido modificado o alterado en el código fuente**. Se documentan con su ubicación exacta (`archivo:línea`) para su análisis, priorización y eventual resolución por el equipo de ingeniería.

---

## 1. Dependencias Residuales y Código No Utilizado

### 1.1. Dependencias de Servidor Web en una Aplicación Client-Side / PWA
* **Ubicación:** `package.json:27-28` y `package.json:36`
  ```json
  "dotenv": "^17.2.3",
  "express": "^4.21.2",
  ...
  "@types/express": "^4.17.21"
  ```
* **Diagnóstico:** Rentabill opera como una SPA compilada con Vite y empaquetada como APK con Capacitor. `express` y `@types/express` no son importados en ningún módulo de `src/` ni forman parte del runtime de producción web o móvil. Constituyen código residual de un prototipo temprano de servidor local de desarrollo.
* **Impacto:** Incrementa innecesariamente el peso de `node_modules` y el tiempo de instalación en entornos CI (`npm install`).

### 1.2. Dependencia de IA Generativa sin Importación Activa
* **Ubicación:** `package.json:23`
  ```json
  "@google/genai": "^2.4.0"
  ```
* **Diagnóstico:** El SDK de Google GenAI se encuentra instalado como dependencia de producción, pero ninguna vista ni caso de uso de `src/` realiza importaciones de este paquete.
* **Impacto:** Dependencia inerte en el manifiesto del proyecto.

---

## 2. Puntos de Concentración Arquitectónica

### 2.1. Monolito de Estado en `InventoryContext.tsx`
* **Ubicación:** `src/application/state/InventoryContext.tsx:1-2961`
* **Diagnóstico:** El archivo concentra **2,961 líneas de código** y asume 11 dominios de responsabilidad simultáneos (autenticación, multi-tienda, catálogo, POS/carrito, ventas, compras, kardex, simulaciones, equipo, realtime y modales).
* **Riesgo:** Alta propensión a colisiones en Git durante el trabajo en equipo concurrente y renderizados innecesarios en componentes que solo consumen una porción pequeña del estado.

---

## 3. Limitaciones Funcionales y de Rendimiento

### 3.1. Procesamiento de Métricas en el Hilo Principal del Cliente
* **Ubicación:** `src/application/logic/financialMetrics.ts:180-280`
* **Diagnóstico:** Las funciones `calculateProductMetrics` y `calculateGlobalMetrics` iteran sincrónicamente sobre todo el catálogo en memoria dentro del hilo principal de JavaScript (*main thread*).
* **Riesgo:** En comercios con catálogos extensos (más de 1,500 productos), el recálculo reactivo ante filtros o ventas puede producir congelamientos perceptibles de interfaz (*frame drops*) en teléfonos Android de gama de entrada.

### 3.2. Ausencia de Cola Fuera de Línea (*Offline-First Sync Queue*)
* **Ubicación:** `src/application/use-cases/sales/processSaleUseCase.ts:1-75`
* **Diagnóstico:** La operación de cobro requiere conexión activa inmediata con Supabase para invocar la RPC `process_sale`. Si la bodega experimenta microcortes de internet durante el cobro, la venta es rechazada sin posibilidad de encolarse localmente para sincronización posterior.

### 3.3. Alcance Limitado de la Exportación de Reportes
* **Ubicación:** `src/presentation/pages/AjustesView.tsx:400-430` y `src/platform/filesystem/capacitorFilesystem.ts:1-70`
* **Diagnóstico:** La interfaz provee una única opción de descarga en la sección de Ajustes ("Descargar reporte de productos y ventas"), la cual exporta el catálogo consolidado de productos con sus ventas y márgenes acumulados (`productos_YYYY-MM-DD.csv`). No existe en la interfaz una opción para descargar el histórico desglosado de tickets de venta individuales.
