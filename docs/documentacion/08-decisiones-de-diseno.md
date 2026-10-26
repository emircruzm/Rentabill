# Decisiones de Diseño Arquitectónico (Formato ADR)

Este documento registra en formato **Architecture Decision Record (ADR)** las 10 decisiones de ingeniería de software más relevantes tomadas en Rentabill. Cada fundamento o justificación ("el por qué") está explícitamente etiquetado como:
* **`[DOCUMENTADO]`**: Si está expresamente sustentado en `docs/ARQUITECTURA.md`, en comentarios del código fuente o en la documentación técnica del esquema SQL.
* **`[DEDUCIDO]`**: Si se infiere a partir de la implementación técnica y debe ser ratificado por el equipo de desarrollo (consolidado en `docs/documentacion/14-preguntas-abiertas.md`).

---

## ADR-01: Adopción de Arquitectura en Capas (4 Capas más Módulo Compartido)
* **Contexto:** El proyecto inicial presentaba lógica de negocio, consultas de base de datos y llamadas directas a Capacitor mezcladas dentro de las vistas (`src/views/`) y en utilitarios dispersos.
* **Decisión:** Reorganizar el código fuente en 4 capas unidireccionales (`presentation`, `application`, `platform`, `data`) más un módulo transversal compartido (`shared`), validando las reglas de dependencia con el script `npm run check:layers`.
* **Alternativas consideradas:** Mantener arquitectura basada en características (*feature-based folders*) o arquitectura hexagonal completa con puertos y adaptadores formales para cada entidad.
* **Consecuencias y Justificación:**
  * **[DOCUMENTADO]** `docs/ARQUITECTURA.md:7-14`: Desacopla la interfaz de usuario del motor de base de datos y de la plataforma nativa, facilitando pruebas y mantenimiento independiente.
  * **[DOCUMENTADO]** `docs/ARQUITECTURA.md:321-332`: Permite auditar en CI/Local que ninguna capa interna rompa la jerarquía mediante análisis estático automatizado.

---

## ADR-02: Backend-as-a-Service (BaaS) con Supabase y PostgreSQL
* **Contexto:** El sistema requería una base de datos relacional robusta con soporte ACID, autenticación de usuarios, almacenamiento de imágenes y sincronización en tiempo real sin desplegar un servidor backend dedicado (como Express o NestJS).
* **Decisión:** Emplear Supabase sobre PostgreSQL 17, aprovechando GoTrue (Auth), Storage (Buckets), Realtime (WebSockets) y llamadas a funciones PL/pgSQL (RPC).
* **Alternativas consideradas:** Desarrollar una API REST tradicional en Node.js/Express con ORM (Prisma/TypeORM) alojada en un VPS o usar Firebase (NoSQL).
* **Consecuencias y Justificación:**
  * **[DOCUMENTADO]** `docs/ARQUITECTURA.md:10-12`: PostgreSQL garantiza integridad relacional 3FN, transacciones ACID para inventario y evaluación de políticas de seguridad en el motor mediante Row Level Security.
  * **[DEDUCIDO]** Se descartó Firebase porque los modelos de microcomercio exigen integridad referencial estricta y restricciones de unicidad compuestas (como código de barras por tienda) que NoSQL no garantiza de forma nativa.

---

## ADR-03: Desarrollo Híbrido PWA y Móvil con Capacitor
* **Contexto:** Se necesitaba distribuir una aplicación móvil nativa para Android (capaz de usar cámara, escáner de barras y sistema de archivos) y al mismo tiempo permitir acceso web en computadoras de mostrador.
* **Decisión:** Utilizar Capacitor 8 sobre una aplicación web React 19 empaquetada con Vite.
* **Alternativas consideradas:** React Native o Flutter.
* **Consecuencias y Justificación:**
  * **[DOCUMENTADO]** `docs/ARQUITECTURA.md:258-278`: Capacitor permite un único código base TypeScript/React, exponiendo plugins oficiales para cámara, escáner ML Kit, ciclo de vida y preferencias nativas.
  * **[DEDUCIDO]** Se eligió frente a Flutter/React Native para reducir la curva de aprendizaje del equipo y reutilizar componentes web responsivos con Tailwind CSS.

---

## ADR-04: Ejecución de Transacciones Críticas en Funciones RPC del Servidor
* **Contexto:** El cobro de una venta y el ingreso de compras involucran múltiples escrituras simultáneas: validación de existencias, inserción de cabecera, inserción de partidas, descuento/aumento de existencias y registro inmutable en kardex.
* **Decisión:** Delegar estas operaciones a 8 funciones RPC escritas en PL/pgSQL (`process_sale`, `process_purchase`, etc.), ejecutadas atómicamente en el servidor PostgreSQL.
* **Alternativas consideradas:** Orquestar las mutaciones mediante múltiples llamadas API secuenciales desde el dispositivo móvil.
* **Consecuencias y Justificación:**
  * **[DOCUMENTADO]** `docs/ARQUITECTURA.md:162-195`: La transacción en base de datos garantiza atomicidad: si falla el registro de una partida o no hay stock, toda la venta se revierte (*rollback*) automáticamente, impidiendo inventarios descuadrados ante caídas de red.
  * **[DOCUMENTADO]** `docs/ARQUITECTURA.md:372-401`: Permite validar contratos de datos de forma estricta (ej. partidas con `productId` y `quantity > 0`).

---

## ADR-05: Seguridad Basada en Row Level Security (RLS) y FORCE RLS
* **Contexto:** En una arquitectura BaaS donde el cliente web consulta directamente la base de datos, existe el riesgo de que un usuario modifique el código para leer o alterar registros de otros comercios.
* **Decisión:** Habilitar y forzar Row Level Security (`FORCE ROW LEVEL SECURITY`) en todas las tablas del esquema público, subordinando toda consulta al contexto de membresía `is_store_member(store_id)`.
* **Alternativas consideradas:** Confiar en filtros de frontend o implementar un proxy intermedio con endpoints de backend.
* **Consecuencias y Justificación:**
  * **[DOCUMENTADO]** `supabase/rentabill_schema_v3.7.sql:1715-1746`: Provee aislamiento multi-tenant a nivel de fila directamente en el motor de base de datos.
  * **[DOCUMENTADO]** `supabase/rentabill_schema_v3.7.sql:766-798`: Las funciones de seguridad se definieron como `SECURITY DEFINER` con `search_path = ''` para evitar recursión infinita y ataques de inyección de rutas.

---

## ADR-06: Concentración del Estado Global en `InventoryContext.tsx`
* **Contexto:** La interfaz requería compartir de manera reactiva datos de usuario, tienda activa, existencias, carrito de venta y suscripciones en tiempo real entre múltiples pantallas.
* **Decisión:** Utilizar el Context API de React centralizado en un único proveedor `InventoryProvider` (`src/application/state/InventoryContext.tsx`).
* **Alternativas consideradas:** Redux Toolkit, Zustand o particionar en 5 contextos independientes (AuthContext, StoreContext, CartContext, CatalogContext, RealtimeContext).
* **Consecuencias y Justificación:**
  * **[DOCUMENTADO]** `docs/ARQUITECTURA.md:406-408`: Simplifica el consumo en los componentes mediante un único hook unificado `useInventory()`.
  * **[DOCUMENTADO]** `docs/ARQUITECTURA.md:406-408`: Genera la limitación técnica conocida de concentrar 2,962 líneas de código y 11 áreas de responsabilidad en un solo archivo.
  * **[DEDUCIDO]** Se prefirió Context API nativo frente a Redux para evitar dependencias externas adicionales en el empaquetado final.

---

## ADR-07: Procesamiento de Indicadores Financieros en el Dispositivo Cliente
* **Contexto:** Rentabill calcula margen unitario, velocidad diaria, rotación, salud proyectada y clasificación de productos estrella.
* **Decisión:** Implementar las fórmulas matemáticas como funciones puras de TypeScript (`src/application/logic/financialMetrics.ts`) ejecutadas en el cliente sobre el catálogo en memoria.
* **Alternativas consideradas:** Calcular los indicadores en PostgreSQL mediante vistas materializadas o tareas cron periódicas (*pg_cron*).
* **Consecuencias y Justificación:**
  * **[DOCUMENTADO]** `docs/ARQUITECTURA.md:412-414`: Permite que la interfaz responda instantáneamente al simular cambios de precios o aplicar filtros sin generar tráfico de red adicional hacia Supabase.
  * **[DOCUMENTADO]** `docs/ARQUITECTURA.md:412-414`: En catálogos con miles de productos, el cálculo en el hilo principal del navegador puede ocasionar caídas de rendimiento en teléfonos de gama de entrada.

---

## ADR-08: Desacoplamiento de Persistencia Mediante Interfaz `KeyValueStorage`
* **Contexto:** El cliente `@supabase/supabase-js` requiere persistir tokens de sesión. La capa de datos (`src/data/`) no puede depender de plugins de Capacitor (`@capacitor/preferences`) según las reglas de arquitectura.
* **Decisión:** Definir la interfaz abstracta `KeyValueStorage` en `src/shared/storage/storage.interface.ts` e inyectar el adaptador en el punto de arranque `src/main.tsx` mediante `setSupabaseStorage()`.
* **Alternativas consideradas:** Permitir la importación de Capacitor en la capa de datos o usar exclusivamente `localStorage`.
* **Consecuencias y Justificación:**
  * **[DOCUMENTADO]** `docs/ARQUITECTURA.md:351-354`: Mantiene la capa de datos agnóstica de la plataforma móvil nativa, posibilitando pruebas en Node.js y ejecución transparente en navegadores web.

---

## ADR-09: Separación en Repositorios Atómicos y Mappers de Normalización
* **Contexto:** La base de datos sigue el estándar `snake_case`, mientras que el frontend React sigue `camelCase`. Mezclar conversiones ad-hoc en las vistas generaba inconsistencias de nombres y acoplamiento.
* **Decisión:** Crear 11 repositorios atómicos (`src/data/repositories/`) y mappers dedicados (`src/data/mappers/`) para transformar datos en la frontera de entrada y salida.
* **Alternativas consideradas:** Consumir directamente el cliente Supabase en los componentes React o renombrar las columnas de base de datos a camelCase con comillas dobles.
* **Consecuencias y Justificación:**
  * **[DOCUMENTADO]** `docs/ARQUITECTURA.md:283-301`: Aísla a los componentes de la estructura física de la base de datos; si una columna cambia en PostgreSQL, solo se modifica el mapper correspondiente.

---

## ADR-10: Guardia de Escritura Centralizado (`runWrite`) para Modo Prueba
* **Contexto:** Se requería que un comerciante Administrador pudiera previsualizar el sistema con los permisos y limitaciones de un Cajero o Repositor sin correr el riesgo de borrar datos o emitir ventas falsas que alterasen su contabilidad real.
* **Decisión:** Implementar una función guardia única `runWrite()` en la capa de aplicación (`src/application/logic/writeGuard.ts`).
* **Alternativas consideradas:** Colocar condicionales `if (!isTestingRole)` dispersos en cada botón o pantalla de la interfaz de usuario.
* **Consecuencias y Justificación:**
  * **[DOCUMENTADO]** `docs/ARQUITECTURA.md:355-367`: Garantiza un único punto de intercepción infalible. Si `isTestingRole === true`, se actualiza la memoria local de React y se muestra la notificación *"Modo prueba: nada se guardó"*, impidiendo que sentencias SQL lleguen a Supabase.
