# Índice General de la Documentación Técnica de Rentabill

Esta suite documental contiene la especificación técnica verificada contra el código fuente del sistema **Rentabill** (código fuente, arquitectura de software y base de datos relacional). Su objetivo principal es servir como material de referencia y sustento técnico ante la evaluación académica del Curso Integrador (Universidad Tecnológica del Perú - UTP, 2026).

---

## 1. Identificación y Versiones del Proyecto

Las versiones oficiales del proyecto registradas en sus archivos de configuración son:

| Componente | Archivo de Origen | Versión Declarada | Detalle Técnico |
| :--- | :--- | :---: | :--- |
| **Aplicación Web / PWA** | `package.json:4` | `0.0.0` | Versión de paquete base en Node.js / Vite |
| **Aplicación Móvil (Android)** | `android/app/build.gradle:10-11` | `versionCode 4` / `1.0` | Compilación para Android (`applicationId: com.proyecto.rentabill`) |
| **Base de Datos Relacional** | `supabase/rentabill_schema_v3.7.sql:2` | `3.7.0` | Esquema DDL consolidado en PostgreSQL (Supabase) |
| **Documentación de Arquitectura** | `docs/ARQUITECTURA.md:1-5` | `Octubre 2026` | Especificación de capas y contratos |

---

## 2. Mapa y Estructura Documental

La documentación está organizada de forma modular en 15 documentos temáticos:

### Visión General y Arquitectura
* [01-vision-general.md](01-vision-general.md): Propósito de Rentabill, actores, roles, alcance, tecnologías verificadas y matriz de trazabilidad completa de extremo a extremo.
* [02-arquitectura.md](02-arquitectura.md): Síntesis de la arquitectura en capas (4 capas más módulo compartido), responsabilidades, reglas de importación y diagramas estructurales.

### Análisis del Código Fuente (`03-codigo/`)
* [03-codigo/presentacion-pantallas.md](03-codigo/presentacion-pantallas.md): Especificación de las 10 pantallas principales (UI, estados reactivos, casos de uso, control por rol y estados vacíos).
* [03-codigo/presentacion-componentes.md](03-codigo/presentacion-componentes.md): Catálogo de los 14 componentes visuales y modales auxiliares.
* [03-codigo/aplicacion-casos-de-uso.md](03-codigo/aplicacion-casos-de-uso.md): Casos de uso de la capa de aplicación, parámetros, invariantes y orquestación hacia repositorios.
* [03-codigo/aplicacion-logica-negocio.md](03-codigo/aplicacion-logica-negocio.md): Fórmulas matemáticas, algoritmos financieros (`financialMetrics.ts`, `simulationEngine.ts`), verificaciones numéricas y guardia del modo prueba (`writeGuard.ts`).
* [03-codigo/aplicacion-estado.md](03-codigo/aplicacion-estado.md): Radiografía del estado global en `InventoryContext.tsx`, funciones expuestas, suscripciones en tiempo real y análisis de responsabilidades.
* [03-codigo/plataforma.md](03-codigo/plataforma.md): Adaptadores de plataforma móvil nativa (`@capacitor/*`), contratos agnósticos y fallbacks web.
* [03-codigo/datos-repositorios.md](03-codigo/datos-repositorios.md): Los 11 repositorios de acceso a datos, contratos de mapeo snake_case a camelCase, cliente Supabase desacoplado y canales Realtime.
* [03-codigo/compartido.md](03-codigo/compartido.md): Tipos TypeScript puros, matriz de roles y permisos, formateadores y contratos de almacenamiento.
* [03-codigo/raiz-y-configuracion.md](03-codigo/raiz-y-configuracion.md): Puntos de entrada (`main.tsx`, `App.tsx`), configuración de Vite, TypeScript, Capacitor, Gradle, scripts y variables de entorno.

### Base de Datos (`04-base-de-datos/`)
* [04-base-de-datos/modelo-er.md](04-base-de-datos/modelo-er.md): Diagrama Entidad-Relación en Mermaid (16 tablas y 1 vista), normalización relacional y cardinalidades.
* [04-base-de-datos/diccionario-de-datos.md](04-base-de-datos/diccionario-de-datos.md): Catálogo exhaustivo de campos, tipos SQL, constraints, índices y regla de transición ESTIMADO a REAL.
* [04-base-de-datos/seguridad-rls.md](04-base-de-datos/seguridad-rls.md): Políticas de Row Level Security (RLS), aislamiento multi-tienda y mitigación de recursión mediante SECURITY DEFINER.
* [04-base-de-datos/funciones-rpc.md](04-base-de-datos/funciones-rpc.md): Especificación técnica de las 8 funciones RPC, parámetros, atomicidad transaccional y códigos de error SQLSTATE.
* [04-base-de-datos/triggers-y-otros.md](04-base-de-datos/triggers-y-otros.md): Triggers automáticos, almacenamiento de imágenes en Supabase Storage y configuración de Realtime.
* [04-base-de-datos/evolucion-del-esquema.md](04-base-de-datos/evolucion-del-esquema.md): Historia y evolución técnica del modelo relacional hasta consolidar el esquema v3.7.

### Reglas, Flujos, Seguridad y Sustentación
* [05-reglas-de-negocio.md](05-reglas-de-negocio.md): Catálogo de todas las reglas de negocio del sistema y su capa de aplicación (UI, Application, Database).
* [06-flujos.md](06-flujos.md): Diagramas de secuencia en Mermaid de los 9 flujos transaccionales clave del negocio.
* [07-seguridad.md](07-seguridad.md): Esquema de seguridad en 3 niveles (interfaz, aplicación, base de datos), anon key, gestión de credenciales y modo prueba.
* [08-decisiones-de-diseno.md](08-decisiones-de-diseno.md): Decisiones arquitectónicas en formato ADR (Architecture Decision Record) categorizadas como `[DOCUMENTADO]` o `[DEDUCIDO]`.
* [09-pruebas-y-verificacion.md](09-pruebas-y-verificacion.md): Comandos de validación estática, verificación matemática de fórmulas y límites de cobertura.
* [10-despliegue-y-operacion.md](10-despliegue-y-operacion.md): Guía paso a paso para despliegue desde cero de backend y frontend, y generación de APK nativo Android.
* [11-guia-de-sustentacion.md](11-guia-de-sustentacion.md): Banco de preguntas y respuestas técnicas para la defensa ante el docente evaluador y mapa de ubicación de código.
* [12-glosario.md](12-glosario.md): Definición formal de conceptos de negocio y términos de ingeniería de software utilizados.
* [13-hallazgos.md](13-hallazgos.md): Bitácora de incoherencias, código inalcanzado o áreas de mejora identificadas en el código fuente.
* [14-preguntas-abiertas.md](14-preguntas-abiertas.md): Consolidado de aspectos `[DEDUCIDO]` y puntos pendientes de confirmación técnica con el equipo de desarrollo.
* [CORRECCIONES.md](CORRECCIONES.md): Bitácora de verificación y corrección técnica exhaustiva frente al código fuente y esquema SQL v3.7.

---

## 3. Guía de Lectura según el Rol del Lector

* **Para el Docente Evaluador / Jurado:**
  Se recomienda iniciar con [01-vision-general.md](01-vision-general.md) para comprender el problema y el alcance real; pasar a [02-arquitectura.md](02-arquitectura.md) y [04-base-de-datos/modelo-er.md](04-base-de-datos/modelo-er.md) para constatar la rigurosidad arquitectónica y el modelo de datos; y consultar [11-guia-de-sustentacion.md](11-guia-de-sustentacion.md) para auditar las decisiones y limitaciones honestas del sistema.
* **Para Nuevos Desarrolladores del Proyecto:**
  Comenzar por [01-vision-general.md](01-vision-general.md) y [02-arquitectura.md](02-arquitectura.md); revisar [03-codigo/aplicacion-estado.md](03-codigo/aplicacion-estado.md) y [03-codigo/aplicacion-logica-negocio.md](03-codigo/aplicacion-logica-negocio.md); y seguir los pasos de [10-despliegue-y-operacion.md](10-despliegue-y-operacion.md) para levantar el entorno local de desarrollo.
