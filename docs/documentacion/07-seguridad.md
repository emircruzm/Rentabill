# Arquitectura de Seguridad y Defensa en Profundidad

Rentabill implementa un modelo de seguridad basado en el principio de **Defensa en Profundidad (*Defense in Depth*)**, articulado en tres niveles independientes y complementarios: **Capa de Presentación (UI)**, **Capa de Aplicación** y **Capa de Base de Datos (PostgreSQL)**.

---

## 1. Autenticación y Ciclo de Vida de Sesión

### 1.1. Motor de Autenticación
* La autenticación está delegada al servicio gestionado Supabase Auth (`auth.users`), basado en tokens criptográficos **JSON Web Tokens (JWT)** firmados con algoritmo asimétrico.
* Las sesiones se refrescan automáticamente en segundo plano mediante tokens de actualización (*refresh tokens*).

### 1.2. Persistencia Segura de Credenciales
* Los tokens de sesión se almacenan mediante el adaptador `capacitorPreferencesStorage` (`src/platform/storage/`), el cual en dispositivos Android interactúa con `SharedPreferences` privado del sistema operativo, aislado de otras aplicaciones del teléfono.

---

## 2. Autorización en Tres Niveles

```
┌────────────────────────────────────────────────────────────────────────┐
│ NIVEL 1: INTERFAZ DE USUARIO (PRESENTACIÓN)                           │
│ - Filtrado de pestañas en BottomNavigation (Cajero solo ve POS/Hist)   │
│ - Ocultamiento condicional de botones (Edición y Ajustes de Stock)     │
│ - Redirección en caliente en App.tsx ante accesos no autorizados       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ NIVEL 2: CAPA DE APLICACIÓN (APPLICATION)                             │
│ - Validación de invariantes de dominio en Casos de Uso                 │
│ - Intercepción obligatoria en runWrite() durante Modo Prueba           │
│ - Verificación de tipos TypeScript en tiempo de compilación            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ NIVEL 3: BASE DE DATOS (POSTGRESQL - LÍMITE INFRAQUEABLE)              │
│ - Políticas de Row Level Security (RLS) con FORCE activado             │
│ - Comprobación de roles en Funciones RPC (has_store_role)              │
│ - Triggers de salvaguarda de gobernanza (check_last_store_admin)       │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1. Nivel 1: Autorización en Interfaz de Usuario
* **Navegación Controlada:** La barra `BottomNavigation.tsx:32-48` no renderiza las pestañas de finanzas ("Pulso") ni administración a usuarios con rol `CAJERO` o `REPOSITOR`.
* **Guardia de Rutas en `App.tsx:65-90`:** Si un usuario manipula el estado local para navegar a una pestaña prohibida, el componente raíz detecta la infracción y lo redirige forzosamente a `POSView`.

### 2.2. Nivel 2: Autorización en Capa de Aplicación
* **Casos de Uso Atómicos:** Cada caso de uso valida que los parámetros cumplan con las invariantes de negocio (ej. que una partida tenga costo y cantidad estrictamente positivos) antes de enviar tráfico a la red.
* **Guardia de Simulación (`runWrite`):** Si el Administrador activó la bandera `isTestingRole === true`, la función guardia `runWrite` intercepta la mutación y cancela cualquier comunicación con la API de Supabase, impidiendo escrituras en producción.

### 2.3. Nivel 3: Autorización en Base de Datos (Límite Infranqueable)
Incluso si un atacante modificara el código JavaScript del cliente en el navegador o emitiera llamadas HTTP manuales mediante herramientas como `curl` o Postman, la base de datos rechaza la operación:
* **Políticas RLS:** Cada sentencia SQL evalúa `is_store_member(store_id)` y `has_store_role(store_id, roles)`. Si el token JWT no pertenece a un Administrador, sentencias de actualización o borrado en `store_members`, `products` o `store_settings` son rechazadas con error `42501 (insufficient_privilege)`.
* **Funciones RPC:** Las funciones críticas validan internamente la identidad del invocador (`auth.uid()`) antes de ejecutar operaciones transaccionales.

---

## 3. Gestión de Secretos y Variables de Entorno

### 3.1. Clave Anónima Pública (`VITE_SUPABASE_ANON_KEY`)
* **Naturaleza:** La clave *anon key* expuesta en el cliente móvil y web actúa como un identificador de acceso a la API REST de Supabase.
* **¿Por qué es aceptable que sea pública?** Por diseño de Supabase, la *anon key* **no otorga ningún privilegio administrativo**. Cualquier consulta realizada con ella está subordinada de forma estricta a las políticas de Row Level Security (RLS) en PostgreSQL. Sin un JWT de usuario válido y membresía en una tienda, la clave no permite leer ni modificar filas ajenas.

### 3.2. Clave Maestra de Servicio (`service_role`)
* **Regla Absoluta:** La clave `service_role` de Supabase posee privilegios de superusuario que omiten (*bypass*) las políticas de RLS.
* **Auditoría del Repositorio:** El código fuente de Rentabill **no contiene ninguna clave `service_role` ni tokens JWT hardcodeados**. Todo el cliente opera exclusivamente con la clave anónima pública y tokens de sesión de usuario autenticado.

---

## 4. Riesgos Conocidos y Estrategias de Mitigación

1. **Riesgo: Pérdida o Robo de Dispositivo Móvil en Mostrador**
   * *Mitigación:* La sesión se puede invalidar remotamente desde Supabase Auth. Adicionalmente, el rol `CAJERO` carece de permisos para consultar el capital de la tienda o exportar el catálogo.
2. **Riesgo: Manipulación de Datos en Memoria en Navegadores Web**
   * *Mitigación:* Toda la lógica financiera crítica y los precios de venta son verificados o recalculados en el servidor mediante la función RPC `process_sale` y los snapshots inmutables de `sale_items`.
