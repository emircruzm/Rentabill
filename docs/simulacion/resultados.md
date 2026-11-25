# INFORME DE SIMULACIÓN MULTI-TIENDA CONCURRENTE (FASE 5c)

**Fecha y Hora:** 2026-11-25T08:22:20.687Z  
**Configuración:** Cuentas=10 | Rondas=24 (168 días simulados) | Semilla=42 | Presupuesto=8000 llamadas  
**Duración Total:** 168.33 s | **Llamadas API Totales:** 6638/8000 | **Rendimiento:** 39.43 ops/s  
**Control de Ventas:** Total Solicitadas = 4768 | Rechazos por Falta de Stock = 0 (0.00%)  

---

## Parámetros del Modelo de Simulación

| Parámetro | Valor | Descripción |
| :--- | :---: | :--- |
| Probabilidad de acatar alertas ($p_c$) | 0.75 (75%) | Probabilidad de que el comerciante descarte una compra riesgosa ante veredicto de alerta |
| Tasa de churn mensual | 0.04 (4%) | Probabilidad mensual de abandono/inactividad por tienda a partir del mes 2 |
| Umbral de cobertura inmovilizada | 30 días | Días de venta (stock / ventas diarias últimas 4 rondas) para considerar stock inmovilizado |
| Ventas por tienda y ronda | 8 transacciones | Ritmo calibrado de ventas semanales por tienda |
| Reposición semanal | Objetivo 12–18 u | Compra semanal consolidada por tienda para productos con stock $\le$ 5 |
| Semilla PRNG | 42 | Semilla Mulberry32 para reproducibilidad determinista |

---

## 1. Métricas Técnicas y Rendimiento de RPCs

| Tipo de Operación | Total | Exitosas | Rechazo Esperado | Errores | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `auth_login` | 10 | 10 | 0 | 0 | 280.9 | 1090.7 | 1090.7 | 1090.7 |
| `rpc_create_store` | 26 | 26 | 0 | 0 | 212.4 | 422.2 | 571.7 | 571.7 |
| `insert_categories` | 26 | 26 | 0 | 0 | 182.9 | 202.3 | 205.7 | 205.7 |
| `fetch_categories` | 26 | 26 | 0 | 0 | 178.8 | 190.7 | 238.9 | 238.9 |
| `insert_suppliers` | 26 | 26 | 0 | 0 | 183.8 | 196.2 | 197.6 | 197.6 |
| `insert_products` | 26 | 26 | 0 | 0 | 221.6 | 243.4 | 283.9 | 283.9 |
| `rpc_process_purchase_replenish` | 565 | 565 | 0 | 0 | 227.6 | 288.8 | 799.7 | 828.3 |
| `rpc_process_sale` | 4768 | 4768 | 0 | 0 | 199.4 | 235.8 | 270.3 | 414.8 |
| `rpc_pay_purchase` | 150 | 150 | 0 | 0 | 183.3 | 207.4 | 217.8 | 258.9 |
| `insert_simulation` | 298 | 298 | 0 | 0 | 184.5 | 226.4 | 371.7 | 406.2 |
| `update_simulation_discarded` | 145 | 145 | 0 | 0 | 183.0 | 244.4 | 295.6 | 387.1 |
| `rpc_process_purchase_sim` | 153 | 153 | 0 | 0 | 188.3 | 251.9 | 347.3 | 418.5 |
| `rpc_adjust_stock` | 149 | 149 | 0 | 0 | 183.2 | 207.2 | 285.1 | 312.7 |
| `fetch_month_snapshot` | 149 | 149 | 0 | 0 | 182.2 | 195.3 | 201.7 | 217.4 |
| `insert_comp_product` | 3 | 3 | 0 | 0 | 187.4 | 207.3 | 207.3 | 207.3 |
| `insert_snapshot_product` | 1 | 1 | 0 | 0 | 178.3 | 178.3 | 178.3 | 178.3 |
| `fetch_snapshot` | 1 | 1 | 0 | 0 | 183.4 | 183.4 | 183.4 | 183.4 |
| `rpc_process_sale_snapshot` | 1 | 1 | 0 | 0 | 190.1 | 190.1 | 190.1 | 190.1 |
| `fetch_snapshot_truth` | 1 | 1 | 0 | 0 | 195.7 | 195.7 | 195.7 | 195.7 |
| `insert_rt_product` | 5 | 5 | 0 | 0 | 190.1 | 228.8 | 228.8 | 228.8 |
| `rpc_process_sale_rt` | 5 | 5 | 0 | 0 | 190.8 | 201.7 | 201.7 | 201.7 |
| `fetch_movements_integrity` | 26 | 26 | 0 | 0 | 204.7 | 224.3 | 227.4 | 227.4 |
| `fetch_prods_integrity` | 26 | 26 | 0 | 0 | 179.3 | 186.2 | 188.6 | 188.6 |
| `fetch_sales_integrity` | 26 | 26 | 0 | 0 | 212.0 | 233.1 | 233.5 | 233.5 |
| `fetch_prods_for_turnover` | 26 | 26 | 0 | 0 | 181.6 | 189.2 | 192.9 | 192.9 |

---

## 2. Prueba de Competencia en la Misma Tienda (B5)
*Condición:* 8 ventas simultáneas de 1 unidad sobre un producto con stock exactamente 5. Esperado: 5 exitosas, 3 "Stock insuficiente", stock final 0.

| Tienda | Producto ID | Exitosas (Esp: 5) | Rechazadas (Esp: 3) | Otros Errores | Stock Final | Resultado |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| Bodega Don Lucho | `6091d0a7...` | 5 | 3 | 0 | 0 | ✅ PASA |
| Botica San Gabriel | `d6d43d28...` | 5 | 3 | 0 | 0 | ✅ PASA |
| Ferretería El Tornillo | `88fc5c4b...` | 5 | 3 | 0 | 0 | ✅ PASA |

---

## 3. Pruebas de Integridad de Datos (B7)

| Tienda | Continuidad Movimientos | Stock Coincide Movimientos | Sin NaN / Negativos | Ventas = Suma Partidas | Estado |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Bodega Don Lucho | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Botica San Gabriel | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Ferretería El Tornillo | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Minimarket La Esquina | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Farmacia Santa Rosa | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Ferretería Los Andes | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Bodega Mi Esperanza | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Botica San Judas Tadeo | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Ferretería Progreso | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Minimarket Don Pepe | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Farmacia El Sol | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Ferretería Central | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Bodega Santa Fe | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Botica Buena Salud | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Ferretería El Maestro | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Minimarket El Triunfo | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Farmacia San Martín | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Ferretería San José | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Bodega El Porvenir | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Botica Panacea | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Ferretería El Constructor | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Minimarket San Pedro | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Bodega La Unión | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Botica Cruz del Sur | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Ferretería Fortaleza | ✅ | ✅ | ✅ | ✅ | ✅ PASA |
| Minimarket La Familia | ✅ | ✅ | ✅ | ✅ | ✅ PASA |

### Aislamiento RLS Multi-Inquilino (Muestra de Pares)
- **Cuenta 1** intentando leer tienda **"Botica San Gabriel"**: ✅ Aislado (0 filas accesibles)  
- **Cuenta 2** intentando leer tienda **"Ferretería El Tornillo"**: ✅ Aislado (0 filas accesibles)  
- **Cuenta 1** intentando leer tienda **"Ferretería El Tornillo"**: ✅ Aislado (0 filas accesibles)  

---

## 4. Pruebas de Memoria y Realtime (B8) - Validación Rigurosa
- **Snapshot en Memoria:**
  - **Estado de Prueba:** **VÁLIDA**
  - **Divergencias detectadas:** Se detectaron **1 producto(s) divergente(s)** en memoria tras venta concurrente de 3 unidades desde sesión secundaria.
  - **Recarga de BD:** La recarga explícita devuelve la verdad y restaura la consistencia (SÍ).
- **Sondeo Realtime (5 Tiendas Distintas - Espera de canal `SUBSCRIBED`):**
  - **Sondeos realizados ($n$):** 5
  - **Eventos recibidos en total:** 12 (Products: 4, Sales: 4, Inventory Movements: 4)
  - **Latencia observada:** Mínima = 499.9 ms | Mediana (p50) = 794.6 ms | Máxima = 805.2 ms
  - **Veces que no llegó (Timeout 8s):** 1 / 5
  - **Diagnóstico:** Conexión WebSocket activa; el servidor emite cambios tras suscripción confirmada.

| Tienda Sondeada | Llegó Evento | Latencia (ms) | Eventos Products | Eventos Sales | Eventos Movimientos |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Bodega Don Lucho | ❌ NO | N/A | 0 | 0 | 0 |
| Botica San Gabriel | ✅ SÍ | 499.9 | 1 | 1 | 1 |
| Ferretería El Tornillo | ✅ SÍ | 805.2 | 1 | 1 | 1 |
| Minimarket La Esquina | ✅ SÍ | 794.6 | 1 | 1 | 1 |
| Farmacia Santa Rosa | ✅ SÍ | 590.0 | 1 | 1 | 1 |

---

## 5. Métricas de Negocio (B9) - Reloj Simulado

### 1) Negocios Activos por Mes Simulado
| Mes Simulado | Tiendas Activas | Tipo | Validez | Motivo | Detalle / Modelo |
| :---: | :---: | :---: | :---: | :--- | :--- |
| Mes 1 | 26 | `SIMULADO` | Válida | Coherente con modelo estocástico de retención comercial | Modelo de abandono (churn 4% mensual sembrado) |
| Mes 2 | 26 | `SIMULADO` | Válida | Coherente con modelo estocástico de retención comercial | Modelo de abandono (churn 4% mensual sembrado) |
| Mes 3 | 25 | `SIMULADO` | Válida | Coherente con modelo estocástico de retención comercial | Modelo de abandono (churn 4% mensual sembrado) |
| Mes 4 | 24 | `SIMULADO` | Válida | Coherente con modelo estocástico de retención comercial | Modelo de abandono (churn 4% mensual sembrado) |
| Mes 5 | 24 | `SIMULADO` | Válida | Coherente con modelo estocástico de retención comercial | Modelo de abandono (churn 4% mensual sembrado) |
| Mes 6 | 24 | `SIMULADO` | Válida | Coherente con modelo estocástico de retención comercial | Modelo de abandono (churn 4% mensual sembrado) |

### 2) Capital Protegido Acumulado
- **Monto total de compras riesgosas descartadas:** **S/ 43629.60**  
- **Tipo:** `REAL con supuesto de decisión`  
- **Validez:** **Válida** (Motivo: Compras de alto riesgo descartadas bajo la política sembrada $p_c = 0.75$ utilizando el motor analítico real).

### 3) Retención Mensual
| Mes Simulado | Tasa de Retención (%) | Tipo | Validez | Motivo |
| :---: | :---: | :---: | :---: | :--- |
| Mes 1 | 100% | `SIMULADO` | Válida | Ratio de actividad mensual consistente con modelo de churn sembrado |
| Mes 2 | 100% | `SIMULADO` | Válida | Ratio de actividad mensual consistente con modelo de churn sembrado |
| Mes 3 | 96.2% | `SIMULADO` | Válida | Ratio de actividad mensual consistente con modelo de churn sembrado |
| Mes 4 | 96% | `SIMULADO` | Válida | Ratio de actividad mensual consistente con modelo de churn sembrado |
| Mes 5 | 100% | `SIMULADO` | Válida | Ratio de actividad mensual consistente con modelo de churn sembrado |
| Mes 6 | 100% | `SIMULADO` | Válida | Ratio de actividad mensual consistente con modelo de churn sembrado |

### 4) Alertas que terminaron en cambio de decisión (depende del supuesto p_c)
- **Total Alertas de Riesgo Generadas:** 207  
- **Compras Riesgosas Descartadas:** 145  
- **Tasa de Cambio de Decisión:** **70%**  
- **Tipo:** `REAL con supuesto de decisión`  
- **Validez:** **Válida** (Motivo: El porcentaje obtenido refleja directamente la parametrización de decisión sembrada $p_c = 0.75$).

### 5) Rotación de Inventario por Categoría
*Metodología:* Stock Promedio Mensual = promedio del stock total registrado en las instantáneas mensuales de tiendas activas.  
Días de Rotación = (Stock Promedio Mensual) / (Ventas por Día de la Categoría).

| Categoría | Tipo | Validez | Motivo | N.º Productos | Stock Promedio Mensual (u) | Ventas / Día (Cat) | Ventas / Prod / Día | Días de Rotación |
| :--- | :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| Abarrotes | `REAL` | Válida | Basada en promedio de instantáneas mensuales sobre ventas efectivas | 75 | 1225.3 | 10.55 | 0.14 | 116.1 días |
| Bebidas | `REAL` | Válida | Basada en promedio de instantáneas mensuales sobre ventas efectivas | 60 | 854.8 | 9.25 | 0.15 | 92.4 días |
| Lácteos | `REAL` | Válida | Basada en promedio de instantáneas mensuales sobre ventas efectivas | 54 | 629.5 | 6.98 | 0.13 | 90.2 días |
| Snacks | `REAL` | Válida | Basada en promedio de instantáneas mensuales sobre ventas efectivas | 42 | 500.8 | 6.05 | 0.14 | 82.7 días |
| Higiene | `REAL` | Válida | Basada en promedio de instantáneas mensuales sobre ventas efectivas | 41 | 473 | 5.6 | 0.14 | 84.5 días |
| Limpieza | `REAL` | Válida | Basada en promedio de instantáneas mensuales sobre ventas efectivas | 46 | 538 | 6.86 | 0.15 | 78.5 días |
| Ferretería | `REAL` | Válida | Basada en promedio de instantáneas mensuales sobre ventas efectivas | 203 | 2360.7 | 30.26 | 0.15 | 78 días |
| Farmacia | `REAL` | Válida | Basada en promedio de instantáneas mensuales sobre ventas efectivas | 228 | 2886.8 | 33.52 | 0.15 | 86.1 días |
| General | `REAL` | Válida | Basada en promedio de instantáneas mensuales sobre ventas efectivas | 34 | 292.5 | 4.04 | 0.12 | 72.5 días |

#### Cobertura por Categoría al Cierre de Cada Mes (Días)
| Categoría | Mes 1 | Mes 2 | Mes 3 | Mes 4 | Mes 5 | Mes 6 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Abarrotes | 77.3d | 104.8d | 107.3d | 126.2d | 145.5d | 146.9d |
| Bebidas | 71.4d | 66.4d | 95.8d | 120.8d | 109.7d | 104.3d |
| Lácteos | 78.1d | 96.6d | 90.1d | 94.3d | 86.6d | 97.8d |
| Snacks | 70.0d | 75.9d | 78.9d | 85.8d | 99.3d | 87.3d |
| Higiene | 72.7d | 61.9d | 80.0d | 90.9d | 100.1d | 113.2d |
| Limpieza | 74.6d | 78.9d | 73.9d | 77.3d | 71.7d | 96.1d |
| Ferretería | 69.9d | 74.6d | 74.9d | 82.2d | 86.9d | 80.2d |
| Farmacia | 72.1d | 72.9d | 81.2d | 91.8d | 101.7d | 99.8d |
| General | 67.1d | 68.0d | 62.7d | 67.3d | 72.0d | 96.3d |

### 6) Capital Inmovilizado Mes a Mes (Stock > 30 días de cobertura)
*Definición:* Cobertura = stock actual / (unidades vendidas en el mes / días del periodo).  
*Escenario B ("con alertas"):* Medición directa en base de datos al cierre de cada mes simulado (costo x stock de productos con cobertura > 30 días).  
*Escenario A ("sin alertas"):* Contrafactual = Escenario B + costo acumulado de compras con veredicto `RIESGOSO` o `NO_CONVIENE` descartadas hasta ese mes.  
*Supuesto declarado:* Las compras riesgosas descartadas tenían proyección de venta superior al umbral admisible, por lo que de haberse ejecutado habrían permanecido inmovilizadas en almacén.

| Periodo | Tipo | Validez | Motivo | Stock Total Valorizado (S/) | Escenario B (Con alertas) | % Inventario Inmovilizado | Variación Mes a Mes (Esc. B) | Escenario A (Sin alertas - Contrafactual) | Diferencia B vs A (%) |
| :--- | :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Mes 1 | `REAL` (B) / `SIMULADO` (A) | Válida | Medición mensual de cobertura frente a stock total valorizado | S/ 54654.80 | S/ 50875.00 | 93.1% | N/A (Mes base) | S/ 61839.80 | **-17.7%** |
| Mes 2 | `REAL` (B) / `SIMULADO` (A) | Válida | Medición mensual de cobertura frente a stock total valorizado | S/ 59181.50 | S/ 55379.70 | 93.6% | S/ +4504.70 (+8.9%) | S/ 73120.30 | **-24.3%** |
| Mes 3 | `REAL` (B) / `SIMULADO` (A) | Válida | Medición mensual de cobertura frente a stock total valorizado | S/ 62876.50 | S/ 58602.20 | 93.2% | S/ +3222.50 (+5.8%) | S/ 83674.90 | **-30.0%** |
| Mes 4 | `REAL` (B) / `SIMULADO` (A) | Válida | Medición mensual de cobertura frente a stock total valorizado | S/ 64705.40 | S/ 61248.60 | 94.7% | S/ +2646.40 (+4.5%) | S/ 91086.20 | **-32.8%** |
| Mes 5 | `REAL` (B) / `SIMULADO` (A) | Válida | Medición mensual de cobertura frente a stock total valorizado | S/ 67798.60 | S/ 63796.50 | 94.1% | S/ +2547.90 (+4.2%) | S/ 100292.40 | **-36.4%** |
| Mes 6 | `REAL` (B) / `SIMULADO` (A) | Válida | Medición mensual de cobertura frente a stock total valorizado | S/ 69877.90 | S/ 67029.40 | 95.9% | S/ +3232.90 (+5.1%) | S/ 110659.00 | **-39.4%** |

---

## 6. Limitaciones del Modelo y Métricas

1. **Alertas que terminaron en cambio de decisión:** La tasa obtenida (~75%) no es una medida empírica de psicología humana o comportamiento autónomo de comerciantes en producción, sino la consecuencia directa del parámetro estocástico sembrado $p_c = 0.75$. El motor de la app calcula el veredicto de riesgo de forma pura, pero la decisión de acatar la recomendación es externa al algoritmo.
2. **Retención y Negocios Activos:** La curva de retención y la disminución de tiendas activas provienen del modelo de abandono sembrado (tasa de churn mensual del 4%). No reflejan fallos del software ni fricción en la experiencia de usuario, sino la modelización de supervivencia comercial del sector minorista.
3. **Escenario A (Contrafactual de Capital Inmovilizado):** El Escenario A asume que el 100% del capital de las compras de riesgo descartadas habría quedado atrapado con cobertura > 30 días. Es un contrafactual conservador y plausible, justificado en que el motor de simulación predijo para esos lotes una rotación insuficiente frente al plazo de crédito o velocidad de venta.
4. **Rotación por categoría:** Al utilizar el promedio de stock de las instantáneas mensuales dividido entre las ventas diarias del periodo, se refleja fielmente la cadencia de abastecimiento semanal y la cobertura operativa de las tiendas activas.

---
*Fin del informe de simulación.*
