# Capa de Plataforma: Adaptadores Nativos y Fallbacks Web

La capa de plataforma (`src/platform/`) encapsula el acceso a las funciones del dispositivo móvil provistas por los plugins de Capacitor. Cada módulo define una interfaz abstracta en TypeScript, una implementación para dispositivos nativos Android y un mecanismo de respaldo (*fallback*) para ejecución en navegadores web convencionales.

---

## 1. Adaptador de Persistencia de Clave-Valor (`src/platform/storage/`)

### 1.1. Interfaz del Contrato
Ubicada en `src/shared/storage/storage.interface.ts:1-12`:
```typescript
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
```

### 1.2. Implementación Nativa (`capacitorPreferencesStorage.ts`)
* **Plugin utilizado:** `@capacitor/preferences` (versión `8.0.1`).
* **Mecanismo:** En Android almacena las preferencias en `SharedPreferences` del sistema operativo móvil, garantizando persistencia segura de los tokens JWT de sesión de Supabase Auth.
* **Inyección de Dependencia:** `setSupabaseStorage(capacitorPreferencesStorage)` se ejecuta en `src/main.tsx:1-25`, evitando que la capa de datos (`src/data/`) dependa directamente de Capacitor.

### 1.3. Comportamiento en Navegador Web
`@capacitor/preferences` detecta automáticamente la ausencia de un contenedor nativo y almacena los valores de forma transparente en el `window.localStorage` del navegador.

---

## 2. Adaptador de Sistema de Archivos (`src/platform/filesystem/`)

### 2.1. Implementación Nativa (`capacitorFilesystem.ts`)
* **Plugin utilizado:** `@capacitor/filesystem` (versión `8.1.5`).
* **Propósito:** Exportación física del reporte de inventario y ventas en formato CSV con codificación UTF-8 BOM (`\uFEFF`).
* **Ruta de Almacenamiento en Android:**
  * Crea el directorio nativo `Documentos/Rentabill/` dentro de `Directory.Documents`.
  * Escribe el archivo bajo el formato: `productos_YYYY-MM-DD.csv`.
  * Solicita permisos de escritura en almacenamiento si la versión de Android lo requiere.

### 2.2. Comportamiento en Navegador Web (Fallback)
Cuando la aplicación se ejecuta como PWA o en navegador de escritorio:
* Se crea en memoria un objeto `Blob` con tipo MIME `text/csv;charset=utf-8;`.
* Se genera una URL temporal mediante `URL.createObjectURL(blob)`.
* Se instancia un elemento virtual `HTMLAnchorElement` con el atributo `download` y se dispara un evento `.click()`, iniciando la descarga directa en la carpeta de Descargas del usuario.

---

## 3. Adaptador de Escáner de Código de Barras (`src/platform/barcode/`)

### 3.1. Implementación Nativa (`capacitorBarcodeScanner.ts`)
* **Plugin utilizado:** `@capacitor-mlkit/barcode-scanning` (versión `8.2.1`).
* **Tecnología Subyacente:** Google Play Services ML Kit.
* **Operación:**
  * Oculta el fondo web (`document.body.classList.add('barcode-scanner-active')`) permitiendo que la vista nativa de la cámara capture los frames a 60 FPS.
  * Detecta formatos de código de barras comerciales estándar: `EAN-13`, `EAN-8`, `UPC-A`, `UPC-E`, `Code 128` y `QR Code`.
  * Al detectar un código, emite una vibración háptica y devuelve la cadena al formulario.

### 3.2. Comportamiento en Navegador Web (Fallback)
En navegadores de escritorio donde no existe cámara móvil con ML Kit:
* Provee un campo de entrada de texto con captura de evento `keydown` (detección de tecla `Enter`), permitiendo la conexión de pistolas lectoras de códigos de barras USB o Bluetooth que operan como emuladores de teclado (*HID keyboard wedge*).

---

## 4. Adaptador de Cámara Fotográfica (`src/platform/camera/`)

### 4.1. Implementación Nativa (`capacitorCamera.ts`)
* **Plugin utilizado:** `@capacitor/camera` (versión `8.2.4`).
* **Propósito:** Captura de fotos de productos para catálogo y escaneo de comprobantes QR de pago.
* **Configuración:**
  * `quality: 80` (optimización de peso para no saturar memoria en teléfonos de gama baja).
  * `resultType: CameraResultType.Base64`.
  * `source: CameraSource.Camera` o `CameraSource.Photos`.

### 4.2. Comportamiento en Navegador Web (Fallback)
* Si no se dispone de acceso a la API nativa, despliega dinámicamente el selector nativo del sistema operativo `<input type="file" accept="image/*">`, permitiendo adjuntar archivos PNG, JPG o WebP desde el disco duro.

---

## 5. Adaptador del Ciclo de Vida de la App (`src/platform/appLifecycle/`)

### 5.1. Implementación Nativa (`capacitorAppLifecycle.ts`)
* **Plugin utilizado:** `@capacitor/app` (versión `8.1.2`).
* **Propósito:** Control del botón físico o gestual "Atrás" de Android (*Hardware Back Button*).
* **Mecanismo:**
  * Intercepta el evento `appBackButton`.
  * Si hay un modal abierto (`StoreSelectorModal`, `EditProductModal`, etc.), el botón lo cierra sin abandonar la aplicación.
  * Si la navegación se encuentra en una pantalla secundaria, retrocede a la pantalla previa.
  * Si el usuario está en la pantalla principal (Pulso o POS), solicita confirmación antes de suspender la aplicación, evitando salidas accidentales durante una venta.

### 5.2. Comportamiento en Navegador Web (Fallback)
* En navegadores web este módulo es una operación nula (*no-op*), delegando el control de navegación al historial estándar de la ventana (`window.history`).
