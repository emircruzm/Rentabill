# Rentabill

Aplicación móvil y Progressive Web App (PWA) orientada a bodegas y pequeños comercios minoristas peruanos. El sistema permite supervisar la distribución del capital financiero (dinero trabajando versus dinero inmovilizado en mercadería), operar el punto de venta (POS) para cobros rápidos, gestionar existencias e historial transaccional, y simular la conveniencia financiera de compras a proveedores antes de ejecutarlas.

Proyecto desarrollado para el Curso Integrador de la Universidad Tecnológica del Perú (UTP), Sede Piura, periodo 2026.

## Integrantes y Docente

* **Sandoval Libia, Gustavo David** (Jefe de equipo)
* **Cervantes Pizarro, Fabian Aimar**
* **Cruz Mauricio, Emir Xaniel**
* **Docente:** Francisco Alonso Donayre Monteza

## Funcionalidades Principales

* **Pulso (Panel Financiero):** Diagnóstico en tiempo real del estado económico del negocio. Muestra capital de trabajo en inventario, dinero inmovilizado, margen proyectado, ventas del día y un puntaje de salud financiera (0 a 100).
* **Inventario:** Catálogo de productos con métricas de velocidad de rotación, días de inventario restantes y calibración automática de velocidad basada en ventas reales.
* **Vender (Punto de Venta - POS):** Registro de ventas ágil con carrito de compras, selección de métodos de pago (efectivo, tarjeta, Yape, Plin, transferencia bancaria) y cálculo automático de vuelto con opción de cobro exacto.
* **Historial:** Registro cronológico de ventas concretadas, compras ingresadas, kardex de movimientos de inventario y registro de simulaciones.
* **Simulador de Compras:** Análisis prospectivo de reposición de mercadería que evalúa rentabilidad neta, retorno de inversión y velocidad esperada antes de comprometer capital.
* **Registro de Productos con Escáner:** Alta y modificación de productos con soporte para lectura de códigos de barra mediante la cámara del dispositivo móvil (ML Kit) o entrada manual.
* **Múltiples Tiendas:** Administración de múltiples sucursales o comercios desde una única cuenta de usuario, con aislamiento total de datos por tienda.
* **Equipo y Roles:** Control de acceso granular basado en tres roles diferenciados (Administrador, Cajero y Repositor) con sistema de vinculación mediante códigos de invitación.
* **Reporte de Productos en CSV:** Generación y exportación del catálogo completo junto a sus indicadores de ventas acumuladas en formato CSV con codificación UTF-8 BOM, compatible con Microsoft Excel.

## Tecnologías y Dependencias

Las tecnologías y versiones utilizadas en el proyecto, extraídas directamente de `package.json`, son:

* **React:** 19.0.1
* **TypeScript:** 7.0.2
* **Vite:** 8.3.0
* **Tailwind CSS:** 4.3.3
* **Capacitor (Core, CLI, Android):** 8.5.2
* **Supabase Client (`@supabase/supabase-js`):** 2.117.1 (Base de datos PostgreSQL en la nube con Row Level Security)
* **Lucide React:** 0.546.0 (Iconografía)
* **Motion:** 12.23.24 (Animaciones de interfaz)

### Plugins de Capacitor

* `@capacitor/preferences` (8.0.1): Persistencia clave-valor para sesiones y configuraciones locales.
* `@capacitor/filesystem` (8.1.5): Gestión de archivos nativos y almacenamiento de reportes CSV.
* `@capacitor/camera` (8.2.4): Captura fotográfica de productos.
* `@capacitor-mlkit/barcode-scanning` (8.2.1): Reconocimiento de códigos de barras de alta velocidad en Android.
* `@capacitor/app` (8.1.2): Manejo de eventos del sistema operativo móvil y botón atrás nativo de Android.

## Arquitectura del Software

El sistema implementa una arquitectura en capas desacoplada y unidireccional. La capa de Presentación gestiona interfaces y modales sin conocer la base de datos ni los plugins móviles; la capa de Aplicación organiza casos de uso atómicos, lógica financiera pura y estado global; la capa de Plataforma encapsula las interfaces nativas de Capacitor; la capa de Datos administra repositorios, mapeadores y canales en tiempo real de Supabase; y la capa Compartida centraliza contratos, constantes y tipos de dominio. La integridad de las dependencias entre capas es auditada automáticamente mediante el comando `npm run check:layers`.

```text
src/
├── presentation/    # Vistas principales (10 pantallas) y componentes de interfaz (14 modales)
├── application/     # Casos de uso de negocio, lógica pura (métricas, simulador) y estado (InventoryContext)
├── platform/        # Adaptadores nativos de Capacitor (cámara, código de barras, filesystem, storage)
├── data/            # Repositorios centralizados (11), mappers de entidades y suscripciones realtime
└── shared/          # Interfaces transversales, contratos de almacenamiento, formateadores y roles
```

Para consultar la documentación completa de flujos, diagramas de secuencia y especificación técnica, revisar [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Base de Datos

El backend de datos está construido sobre PostgreSQL alojado en Supabase, protegido mediante políticas de Row Level Security (RLS) vinculadas a las tablas de tiendas y miembros de equipo.

* **Tablas (16):** `stores`, `store_members`, `profiles`, `user_preferences`, `store_settings`, `categories`, `products`, `sales`, `sale_items`, `inventory_movements`, `purchases`, `purchase_items`, `suppliers`, `simulations`, `store_invitations`, `cash_registers`.
* **Vistas (1):** `product_stats` (cálculo de ventas acumuladas y existencias por producto).
* **Funciones RPC (8):** `process_sale`, `process_purchase`, `pay_purchase`, `adjust_stock`, `create_store`, `switch_store`, `invite_by_code`, `accept_invitation`.

### Ubicación del Esquema en el Repositorio

Los scripts SQL que componen la base de datos están organizados en:
* `supabase/schema_completo.sql`: Definición global consolidada de la estructura de base de datos.
* `supabase/migrations/`: Colección de 12 archivos de migraciones secuenciales del proyecto.
* `docs/REDISENO_BASE_DE_DATOS.sql`: Especificación DDL del modelo entidad-relación y funciones.

*Nota de verificación:* El archivo de referencia `rentabill_schema_v3.7.sql` corresponde al esquema desplegado en la instancia en la nube de Supabase y no forma parte del árbol de archivos versionados en este repositorio local.

## Requisitos y Cómo Ejecutarlo

### Requisitos Previos

* **Node.js:** Versión 20.x o superior (Node.js 22 LTS recomendado; `@types/node` versión 22.14.0 instalada).
* **NPM:** Gestor de paquetes incluido con Node.js.

### Configuración del Entorno

1. Clonar el repositorio y acceder al directorio del proyecto:
```bash
git clone https://github.com/emircruzm/Rentabill.git
cd Rentabill
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
Crear un archivo `.env` en la raíz del proyecto tomando como plantilla `.env.example`:
```env
VITE_SUPABASE_URL="https://tu-proyecto.supabase.co"
VITE_SUPABASE_ANON_KEY="tu-anon-key"
```

### Comandos de Ejecución y Validación

* Iniciar servidor de desarrollo web (puerto 3000 según configuración de `package.json`):
```bash
npm run dev
```

* Validar reglas de arquitectura en capas:
```bash
npm run check:layers
```

* Comprobación estricta de tipos con TypeScript:
```bash
npm run lint
```
*(O de forma directa mediante `npx tsc --noEmit`)*.

* Compilar bundle de producción web:
```bash
npm run build
```

## Generación de APK para Android

### Requisitos Adicionales

* Android Studio instalado con Android SDK Platform-Tools y JDK 17 o superior.

### Pasos de Compilación

1. Generar la compilación web optimizada:
```bash
npm run build
```

2. Sincronizar los activos web con el proyecto nativo de Capacitor:
```bash
npx cap sync android
```

3. Compilar el archivo APK de depuración con Gradle:
* En Windows:
```bash
cd android
.\gradlew.bat assembleDebug
cd ..
```
* En Linux o macOS:
```bash
cd android
./gradlew assembleDebug
cd ..
```

### Ubicación del APK

El instalador compilado se genera en la ruta:
```text
android/app/build/outputs/apk/debug/app-debug.apk
```

*Nota:* Los archivos binarios `*.apk`, `*.aab` y los artefactos de compilación en `android/app/build/` están incluidos en `.gitignore` y no se suben al repositorio.

## Roles y Permisos

| Módulo o Acción | Administrador (ADMIN) | Cajero (CAJERO) | Repositor (REPOSITOR) |
| :--- | :---: | :---: | :---: |
| **Pulso (Métricas financieras)** | Permitido | Denegado | Denegado |
| **Inventario (Catálogo)** | Lectura y edición | Solo lectura | Lectura y edición |
| **Ajuste manual de stock** | Permitido | Denegado | Permitido |
| **Punto de Venta (POS)** | Permitido | Permitido | Denegado |
| **Historial de transacciones** | Total | Solo sus ventas | Solo lectura |
| **Registro de compras** | Permitido | Denegado | Permitido |
| **Pago de compras pendientes** | Permitido | Denegado | Denegado |
| **Simulador de compras** | Permitido | Denegado | Denegado |
| **Directorio de proveedores** | Total | Denegado | Gestión de contactos |
| **Gestión de tiendas y ajustes** | Total | Denegado | Denegado |
| **Invitación y gestión de equipo**| Total | Denegado | Denegado |

## Limitaciones Técnicas Conocidas

De acuerdo con lo detallado en la sección 8 de `docs/ARQUITECTURA.md`:

1. **Concentración de estado en `InventoryContext.tsx`:** El proveedor global de estado concentra la reactividad y gestión de datos de 11 áreas de responsabilidad en un único archivo, en lugar de estar dividido en contextos modulares por dominio.
2. **Dependencia de conectividad activa (Sin cola offline):** La aplicación requiere comunicación activa con el backend de Supabase para registrar ventas, compras o ajustes de stock. No implementa una cola local persistente para almacenamiento fuera de línea y posterior sincronización.
3. **Cálculo de métricas financieras en el cliente:** Los cálculos de margen, rotación y salud proyectada se procesan en el hilo principal del dispositivo cliente en `financialMetrics.ts`. En catálogos muy extensos, esto puede provocar impacto en el rendimiento en dispositivos móviles de gama de entrada.
4. **Alcance de los reportes en pantalla:** La interfaz ofrece una única opción de exportación en la sección de Ajustes para el catálogo de productos con sus ventas y márgenes acumulados (`productos_YYYY-MM-DD.csv`), sin disponer de una descarga independiente ticket por ticket del historial transaccional.

## Enlaces a la Documentación Completa

* [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md): Especificación detallada de la arquitectura en capas, patrones de diseño, diagramas de secuencia y contratos de funciones RPC.
* [informe_tecnico.md](informe_tecnico.md): Informe técnico integral sobre el rediseño estructural, modelo relacional y auditoría de la base de datos.
