# Glosario de Términos Técnicos y de Negocio

Este glosario define los conceptos económicos, financieros y de ingeniería de software utilizados en Rentabill.

---

## 1. Conceptos de Negocio y Finanzas de Microcomercio

* **Dinero Invertido (Capital de Trabajo en Inventario):** Suma total del costo de adquisición de todas las existencias físicas presentes en la bodega ($\sum \text{stock} \times \text{costPrice}$).
* **Dinero Parado (Capital Inmovilizado):** Porción del capital invertido atrapada en artículos con velocidad de venta nula o muy baja, o cuyo inventario estimado supera los 45 días de existencias. Representa liquidez congelada que no genera retorno.
* **Margen Unitario Bruto:** Diferencia monetaria entre el precio de venta final al público y el costo de adquisición unitario otorgado por el proveedor ($P_{\text{venta}} - P_{\text{costo}}$).
* **Velocidad Diaria de Rotación:** Número promedio de unidades de un producto vendidas por día. En modo `ESTIMADO` se infiere de la estimación semanal; en modo `REAL` se calcula dividiendo las unidades vendidas entre los días transcurridos.
* **Calibración de Catálogo:** Mecanismo automático por el cual un producto que acumula $\ge 5$ tickets de venta o 30 días de vida deja de utilizar estimaciones heurísticas y pasa a calcular sus indicadores con datos reales de mostrador.
* **Puntaje de Salud Financiera (0 a 100):** Indicador sintético compuesto que evalúa la calidad del margen diario (60%) y la rotación activa del inventario sin estancamiento (40%), clasificando la bodega en un semáforo de tres estados (`OPTIMAL`, `STABLE`, `CRITICAL`).
* **Kardex:** Registro contable cronológico e inalterable de todos los movimientos de entrada, salida y ajuste de existencias de un almacén.
* **Snapshot Inmutable:** Copia fija y congelada de datos (como el costo unitario de compra o el nombre de un producto) guardada en la partida de venta para que futuros cambios de precio en el catálogo no alteren el balance histórico de ventas pasadas.
* **Punto de Venta (POS - Point of Sale):** Terminal o pantalla de cobro rápido donde el comerciante registra los productos, selecciona el medio de pago, calcula el vuelto y emite el ticket.

---

## 2. Conceptos de Arquitectura e Ingeniería de Software

* **Arquitectura en Capas:** Patrón de diseño donde el sistema se divide en niveles jerárquicos independientes con responsabilidades delimitadas (Presentación, Aplicación, Plataforma, Datos y Compartido).
* **BaaS (Backend-as-a-Service):** Modelo de arquitectura donde servicios de infraestructura en la nube (como autenticación, base de datos relacional, almacenamiento de archivos y tiempo real de Supabase) son consumidos mediante clientes SDK sin programar un servidor backend dedicado.
* **Capacitor:** Entorno de ejecución de código abierto que encapsula una aplicación web moderna (HTML/JS/CSS) dentro de un WebView nativo de Android o iOS, proveyendo puentes de comunicación (*plugins*) hacia el hardware del teléfono.
* **PWA (Progressive Web App):** Aplicación web que incorpora estándares modernos (manifiesto web, responsividad y almacenamiento local) para ejecutarse en navegadores web con apariencia y fluidez similar a una app nativa.
* **RPC (Remote Procedure Call):** Función o procedimiento almacenado en el servidor de base de datos (escrito en PL/pgSQL) que puede ser ejecutado por el cliente de forma atómica bajo una transacción ACID.
* **Row Level Security (RLS):** Característica de seguridad de PostgreSQL que evalúa políticas a nivel de fila antes de permitir la lectura o escritura de datos, asegurando el aislamiento multi-inquilino (*multi-tenant*).
* **FORCE ROW LEVEL SECURITY:** Directiva de PostgreSQL que exige la aplicación de políticas RLS incluso sobre el propietario de la tabla o superusuarios locales.
* **`SECURITY DEFINER`:** Directiva de funciones en PostgreSQL que instruye que la función se ejecute con los privilegios del usuario creador (dueño) y no con los del usuario invocador, utilizada en Rentabill para prevenir recursión infinita en consultas de seguridad.
* **Archivado Lógico (*Soft Delete*):** Práctica de marcar un registro como inactivo mediante una columna temporal (`archived_at = now()`) en lugar de borrarlo físicamente con `DELETE`, preservando la integridad referencial y el historial contable.
* **Inversión de Dependencias (*Dependency Inversion*):** Principio de diseño donde los módulos de alto nivel no dependen de módulos de bajo nivel, sino de abstracciones (interfaces como `KeyValueStorage`).
