# Informe Técnico: Corrección de Velocidad Estimada en Simulador de Compras (Caso 4d)

**Fecha:** 11 de Noviembre de 2026  
**Rama:** `arquitectura-capas`  
**Estado:** Implementado, Validado y Aprobado con Regla de Decisión 100% Cumplida

---

## 1. Contexto y Diagnóstico del Problema

En productos no calibrados (`ESTIMADO` o sin ventas históricas), la fórmula de velocidad diaria estimada:
$$\text{dailyVelocity} = \frac{\max(\text{stock}, 1) \times \text{tasa semanal}}{7}$$
producía una anomalía severa en el **Simulador de Reabastecimiento de Compras** cuando el comerciante evaluaba reponer un producto con **stock 0 o muy bajo**:

* Con $\text{stock} = 0$, la base se forzaba a $\max(0, 1) = 1$.
* Para un producto `NORMAL` ($\text{tasa} = 15\%$), la velocidad diaria daba:
  $$1 \times \frac{0.15}{7} = 0.0214 \approx 0.02\text{ u/día}$$
* Al simular una compra estándar de $24\text{ unidades}$, el motor proyectaba:
  $$\text{daysToSell} = \frac{24}{0.02} = \mathbf{1200\text{ días}}\quad(\approx 3.3\text{ años})$$

Este cálculo resultaba absurdo en la práctica comercial, pues un lote de 24 unidades con una rotación declarada del 15% semanal debe tardar en agotarse aproximadamente 47 días, no 1200. La base no debía anclarse al stock residual (cero), sino a la **escala del lote simulado**.

---

## 2. Solución Matemática Implementada

Se agregó la función especializada [`estimatedVelocityForPurchase`](file:///e:/Visitante/Downloads/Tarea-main/Tarea-main/src/application/logic/velocity.ts#L33-L49):

$$\text{Velocidad para Compra} = \frac{\max(\text{stock}, \text{quantity}, 1) \times \text{tasa semanal}}{7}$$

### Propiedades Matemáticas:
1. **Cuando $\text{stock} \ge \text{quantity}$:** $\max(\text{stock}, \text{quantity}, 1) = \max(\text{stock}, 1)$.  
   $\rightarrow$ **El resultado es $100\%$ idéntico a la fórmula histórica previa** (cero regresión en productos con stock suficiente).
2. **Cuando $\text{stock} < \text{quantity}$:** La base escala automáticamente con la cantidad simulada ($\text{quantity}$), normalizando el tiempo de rotación del lote:
   $$\text{Tiempo de rotación} = \frac{\text{quantity}}{\frac{\text{quantity} \times \text{tasa}}{7}} = \frac{7}{\text{tasa semanal}}$$
   * Para `RAPIDO` ($30\%$): $7 / 0.30 \approx \mathbf{23\text{ días}}$
   * Para `NORMAL` ($15\%$): $7 / 0.15 \approx \mathbf{47\text{ días}}$
   * Para `LENTO` ($5\%$): $7 / 0.05 = \mathbf{140\text{ días}}$

---

## 3. Componentes Modificados

1. **[`src/application/logic/velocity.ts`](file:///e:/Visitante/Downloads/Tarea-main/Tarea-main/src/application/logic/velocity.ts#L33-L49):**
   * Se exportó `estimatedVelocityForPurchase(stock, quantity, estimatedSpeed)`.
   * Se conservaron intactas las tasas semanales (`RAPIDO: 0.30`, `NORMAL: 0.15`, `LENTO: 0.05`).
2. **[`src/application/state/InventoryContext.tsx`](file:///e:/Visitante/Downloads/Tarea-main/Tarea-main/src/application/state/InventoryContext.tsx#L109-L1842):**
   * Se extendió la interfaz y el callback `getRealProductVelocity(productId: string, simulatedQuantity?: number)`.
   * Si el producto es `REAL`: no cambia nada (emplea ventas reales históricas/28d).
   * Si el producto es `ESTIMADO` o sin ventas: si se pasa `simulatedQuantity > 0`, usa `estimatedVelocityForPurchase`. Si no se pasa cantidad, mantiene `estimatedVelocity(stock, speed)`.
3. **[`src/presentation/pages/RestockSimulatorView.tsx:81-82`](file:///e:/Visitante/Downloads/Tarea-main/Tarea-main/src/presentation/pages/RestockSimulatorView.tsx#L81-L82):**
   * Invoca `getRealProductVelocity(currentProduct.id, simulatedQuantity)`.
4. **Garantía de Invariabilidad:**
   * `calculateProductMetrics` (`financialMetrics.ts`) y `ProductRegisterView.tsx` continúan usando `estimatedVelocity(stock, speed)` sin cantidad.
   * `simulationEngine.ts` y la regla `shouldTransitionToReal` no fueron alteradas.

---

## 4. Matriz Comparativa Antes vs. Después (Punto 4e)

Evaluación exhaustiva de las **36 combinaciones** ($\text{Stock} \in \{0, 5, 24, 100\} \times \text{Cantidad} \in \{12, 24, 60\} \times \text{Velocidad} \in \{\text{RAPIDO}, \text{NORMAL}, \text{LENTO}\}$):

| Stock | Cantidad | Velocidad | Tasa/sem | Días Viejo | Días Nuevo | Vel. Vieja | Vel. Nueva | Regla Cumplida |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 0 | 12 | RAPIDO | 30% | 300 | 24 | 0.04 | 0.51 | ✅ SÍ |
| 0 | 12 | NORMAL | 15% | 600 | 46 | 0.02 | 0.26 | ✅ SÍ |
| 0 | 12 | LENTO | 5% | 1200 | 133 | 0.01 | 0.09 | ✅ SÍ |
| 0 | 24 | RAPIDO | 30% | 600 | 23 | 0.04 | 1.03 | ✅ SÍ |
| 0 | 24 | NORMAL | 15% | 1200 | 47 | 0.02 | 0.51 | ✅ SÍ |
| 0 | 24 | LENTO | 5% | 2400 | 141 | 0.01 | 0.17 | ✅ SÍ |
| 0 | 60 | RAPIDO | 30% | 1500 | 23 | 0.04 | 2.57 | ✅ SÍ |
| 0 | 60 | NORMAL | 15% | 3000 | 47 | 0.02 | 1.29 | ✅ SÍ |
| 0 | 60 | LENTO | 5% | 6000 | 140 | 0.01 | 0.43 | ✅ SÍ |
| 5 | 12 | RAPIDO | 30% | 57 | 24 | 0.21 | 0.51 | ✅ SÍ |
| 5 | 12 | NORMAL | 15% | 109 | 46 | 0.11 | 0.26 | ✅ SÍ |
| 5 | 12 | LENTO | 5% | 300 | 133 | 0.04 | 0.09 | ✅ SÍ |
| 5 | 24 | RAPIDO | 30% | 114 | 23 | 0.21 | 1.03 | ✅ SÍ |
| 5 | 24 | NORMAL | 15% | 218 | 47 | 0.11 | 0.51 | ✅ SÍ |
| 5 | 24 | LENTO | 5% | 600 | 141 | 0.04 | 0.17 | ✅ SÍ |
| 5 | 60 | RAPIDO | 30% | 286 | 23 | 0.21 | 2.57 | ✅ SÍ |
| 5 | 60 | NORMAL | 15% | 545 | 47 | 0.11 | 1.29 | ✅ SÍ |
| 5 | 60 | LENTO | 5% | 1500 | 140 | 0.04 | 0.43 | ✅ SÍ |
| 24 | 12 | RAPIDO | 30% | 12 | 12 | 1.03 | 1.03 | ✅ SÍ |
| 24 | 12 | NORMAL | 15% | 24 | 24 | 0.51 | 0.51 | ✅ SÍ |
| 24 | 12 | LENTO | 5% | 71 | 71 | 0.17 | 0.17 | ✅ SÍ |
| 24 | 24 | RAPIDO | 30% | 23 | 23 | 1.03 | 1.03 | ✅ SÍ |
| 24 | 24 | NORMAL | 15% | 47 | 47 | 0.51 | 0.51 | ✅ SÍ |
| 24 | 24 | LENTO | 5% | 141 | 141 | 0.17 | 0.17 | ✅ SÍ |
| 24 | 60 | RAPIDO | 30% | 58 | 23 | 1.03 | 2.57 | ✅ SÍ |
| 24 | 60 | NORMAL | 15% | 118 | 47 | 0.51 | 1.29 | ✅ SÍ |
| 24 | 60 | LENTO | 5% | 353 | 140 | 0.17 | 0.43 | ✅ SÍ |
| 100 | 12 | RAPIDO | 30% | 3 | 3 | 4.29 | 4.29 | ✅ SÍ |
| 100 | 12 | NORMAL | 15% | 6 | 6 | 2.14 | 2.14 | ✅ SÍ |
| 100 | 12 | LENTO | 5% | 17 | 17 | 0.71 | 0.71 | ✅ SÍ |
| 100 | 24 | RAPIDO | 30% | 6 | 6 | 4.29 | 4.29 | ✅ SÍ |
| 100 | 24 | NORMAL | 15% | 11 | 11 | 2.14 | 2.14 | ✅ SÍ |
| 100 | 24 | LENTO | 5% | 34 | 34 | 0.71 | 0.71 | ✅ SÍ |
| 100 | 60 | RAPIDO | 30% | 14 | 14 | 4.29 | 4.29 | ✅ SÍ |
| 100 | 60 | NORMAL | 15% | 28 | 28 | 2.14 | 2.14 | ✅ SÍ |
| 100 | 60 | LENTO | 5% | 85 | 85 | 0.71 | 0.71 | ✅ SÍ |

---

## 5. Evaluación de Reglas de Decisión (Paso 5)

1. **Cuando $\text{stock} \ge \text{quantity}$:**
   * $\text{Días Nuevo} = \text{Días Viejo}$ en el **$100\%$ de los casos**.
   * Ejemplos: $(\text{stock } 24, \text{cant } 24) \rightarrow 47\text{ días}$ en ambos; $(\text{stock } 100, \text{cant } 24) \rightarrow 11\text{ días}$ en ambos.
2. **Cuando $\text{stock} < \text{quantity}$:**
   * $\text{Días Nuevo} \le \text{Días Viejo}$ en el **$100\%$ de los casos**.
   * El resultado es estrictamente menor o igual que $7 / \text{tasa} + 1\text{ día}$:
     * `RAPIDO` ($30\%$): $7 / 0.30 + 1 = 24.3\text{ días} \rightarrow$ máximo observado: **$24\text{ días}$**.
     * `NORMAL` ($15\%$): $7 / 0.15 + 1 = 47.7\text{ días} \rightarrow$ máximo observado: **$47\text{ días}$**.
     * `LENTO` ($5\%$): $7 / 0.05 + 1 = 141.0\text{ días} \rightarrow$ máximo observado: **$141\text{ días}$**.

**Veredicto de Decisión:** ✅ **$100\%$ CUMPLIDA** en las 36 celdas evaluadas.

---

## 6. Salida Completa de Comprobaciones Automatizadas

### A) `npm run lint`
```text
> react-example@0.0.0 lint
> tsc --noEmit
```
*(Salida limpia, 0 errores).*

### B) `npm run check:layers`
```text
> react-example@0.0.0 check:layers
> node scripts/check-layers.mjs

--- Verificación de Capas de Arquitectura ---
✅ ¡Excelente! Cero violaciones de capas encontradas.
```

### C) `node scripts/verify-logic.mjs`
```text
--- Verificación Matemática de Lógica Pura ---
Caso 1 (Tienda vacía):
 - Total Invested: 0 (esperado: 0)
 - Total Score: 40 (esperado: 40 en fórmula sin productos)
 - Is Calibrated: false (esperado: false)

Caso 2 (Producto Estimado Rápido):
 - Unit Margin Dollar: 0.7 (esperado: 0.70)
 - Daily Velocity: 1.03 (esperado: 1.03)
 - Daily Profit Dollar: 0.72 (esperado: 0.72)
 - Status: ESTIMADO (esperado: ESTIMADO)

Caso 3 (Producto Real con ventas):
 - Daily Velocity: 3 (esperado: 3.00)
 - Status: REAL (esperado: REAL)

Caso 4a (Producto de 10 días):
 - realVelocityCurrent (30u / 10d): 3 (esperado: 3.00)
 - realVelocity28 (30u / min(28,10)d): 3 (esperado: 3.00)

Caso 4b (Producto de 90 días con desaceleración):
 - realVelocityCurrent (120u / 90d): 1.33 (histórico acumulado: 1.33 u/día)
 - realVelocity28 (10u / 28d): 0.36 (esperado: 10/28 = 0.36 u/día)

Caso 4c (Producto REAL sin ventas en 28 días):
 - Status: REAL (esperado: REAL)
 - Daily Velocity: 0.1 (esperado: 0.1 u/día sin caer a estimado)
 - isSlow: true (esperado: true)

Caso 4d (Producto ESTIMADO sin ventas con stock 0):
 - Base de velocidad calculada (stock=0 -> Math.max(0,1)*0.15/7): 0.02 u/día
 - Días en Simulador (simulationEngine) para 24 unidades: 1200 días (24 / 0.02 = 1200)
 - Días para agotar inventario (daysToDeplete) para 24 unidades: 240 días (24 / 0.1 = 240)

Caso 4e (Producto REAL de 90 días con unitsSoldLast28d = undefined):
 - Status: REAL (esperado: REAL)
 - Daily Velocity: 1.33 (esperado: 1.33 u/día histórica de respaldo, NO 0.1)
 - isSlow: false (esperado: false)

Evaluación Global Combinada:
 - Total Invested: 284 (esperado: 284.00)
 - Score Status: STABLE (esperado: OPTIMAL o STABLE)
 - Real Capital Percent: 70.4 (esperado: 70.4%)

--- Verificación de Corrección para Simulador de Compras (estimatedVelocityForPurchase) ---

Caso 5a (stock 0, cantidad 24, NORMAL):
 - Velocidad para compra: 0.51 u/día (esperado: ≈ 0.51)
 - Días en el simulador: 47 días (esperado: ≈ 47)

Caso 5b (stock 0, cantidad 24, RÁPIDO y LENTO):
 - RAPIDO: vel = 1.03 u/día, días = 23 (esperado: ≈ 23 días)
 - LENTO:  vel = 0.17 u/día, días = 141 (esperado: ≈ 141 días)

Caso 5c (REGRESIÓN: stock >= cantidad idéntico al cálculo anterior):
 - stock 24, cant 24, NORMAL: días anterior = 47 , días nuevo = 47
 - stock 100, cant 24, NORMAL: días anterior = 11 , días nuevo = 11

Caso 5d (REGRESIÓN: producto REAL con ventas mantiene velocidad en el simulador):
 - Velocidad real esperada: 3 u/día
 - Velocidad real con cant 24: 3 u/día
 - Velocidad real con cant 60: 3 u/día

Caso 5e (Matriz Comparativa Antes/Después y Verificación de Regla de Decisión):
| Stock | Cantidad | Velocidad | Tasa/sem | Días Viejo | Días Nuevo | Vel. Vieja | Vel. Nueva | Regla Cumplida |
|-------|----------|-----------|----------|------------|------------|------------|------------|----------------|
|     0 |       12 | RAPIDO    |     30% |        300 |         24 |       0.04 |       0.51 |           ✅ SÍ |
|     0 |       12 | NORMAL    |     15% |        600 |         46 |       0.02 |       0.26 |           ✅ SÍ |
|     0 |       12 | LENTO     |      5% |       1200 |        133 |       0.01 |       0.09 |           ✅ SÍ |
|     0 |       24 | RAPIDO    |     30% |        600 |         23 |       0.04 |       1.03 |           ✅ SÍ |
|     0 |       24 | NORMAL    |     15% |       1200 |         47 |       0.02 |       0.51 |           ✅ SÍ |
|     0 |       24 | LENTO     |      5% |       2400 |        141 |       0.01 |       0.17 |           ✅ SÍ |
|     0 |       60 | RAPIDO    |     30% |       1500 |         23 |       0.04 |       2.57 |           ✅ SÍ |
|     0 |       60 | NORMAL    |     15% |       3000 |         47 |       0.02 |       1.29 |           ✅ SÍ |
|     0 |       60 | LENTO     |      5% |       6000 |        140 |       0.01 |       0.43 |           ✅ SÍ |
|     5 |       12 | RAPIDO    |     30% |         57 |         24 |       0.21 |       0.51 |           ✅ SÍ |
|     5 |       12 | NORMAL    |     15% |        109 |         46 |       0.11 |       0.26 |           ✅ SÍ |
|     5 |       12 | LENTO     |      5% |        300 |        133 |       0.04 |       0.09 |           ✅ SÍ |
|     5 |       24 | RAPIDO    |     30% |        114 |         23 |       0.21 |       1.03 |           ✅ SÍ |
|     5 |       24 | NORMAL    |     15% |        218 |         47 |       0.11 |       0.51 |           ✅ SÍ |
|     5 |       24 | LENTO     |      5% |        600 |        141 |       0.04 |       0.17 |           ✅ SÍ |
|     5 |       60 | RAPIDO    |     30% |        286 |         23 |       0.21 |       2.57 |           ✅ SÍ |
|     5 |       60 | NORMAL    |     15% |        545 |         47 |       0.11 |       1.29 |           ✅ SÍ |
|     5 |       60 | LENTO     |      5% |       1500 |        140 |       0.04 |       0.43 |           ✅ SÍ |
|    24 |       12 | RAPIDO    |     30% |         12 |         12 |       1.03 |       1.03 |           ✅ SÍ |
|    24 |       12 | NORMAL    |     15% |         24 |         24 |       0.51 |       0.51 |           ✅ SÍ |
|    24 |       12 | LENTO     |      5% |         71 |         71 |       0.17 |       0.17 |           ✅ SÍ |
|    24 |       24 | RAPIDO    |     30% |         23 |         23 |       1.03 |       1.03 |           ✅ SÍ |
|    24 |       24 | NORMAL    |     15% |         47 |         47 |       0.51 |       0.51 |           ✅ SÍ |
|    24 |       24 | LENTO     |      5% |        141 |        141 |       0.17 |       0.17 |           ✅ SÍ |
|    24 |       60 | RAPIDO    |     30% |         58 |         23 |       1.03 |       2.57 |           ✅ SÍ |
|    24 |       60 | NORMAL    |     15% |        118 |         47 |       0.51 |       1.29 |           ✅ SÍ |
|    24 |       60 | LENTO     |      5% |        353 |        140 |       0.17 |       0.43 |           ✅ SÍ |
|   100 |       12 | RAPIDO    |     30% |          3 |          3 |       4.29 |       4.29 |           ✅ SÍ |
|   100 |       12 | NORMAL    |     15% |          6 |          6 |       2.14 |       2.14 |           ✅ SÍ |
|   100 |       12 | LENTO     |      5% |         17 |         17 |       0.71 |       0.71 |           ✅ SÍ |
|   100 |       24 | RAPIDO    |     30% |          6 |          6 |       4.29 |       4.29 |           ✅ SÍ |
|   100 |       24 | NORMAL    |     15% |         11 |         11 |       2.14 |       2.14 |           ✅ SÍ |
|   100 |       24 | LENTO     |      5% |         34 |         34 |       0.71 |       0.71 |           ✅ SÍ |
|   100 |       60 | RAPIDO    |     30% |         14 |         14 |       4.29 |       4.29 |           ✅ SÍ |
|   100 |       60 | NORMAL    |     15% |         28 |         28 |       2.14 |       2.14 |           ✅ SÍ |
|   100 |       60 | LENTO     |      5% |         85 |         85 |       0.71 |       0.71 |           ✅ SÍ |

Evaluación de Regla de Decisión en 36 combinaciones: ✅ 100% CUMPLIDA

Estado actual de USE_WINDOW_28D: true
✅ ¡Verificación matemática superada! Todos los casos pasaron correctamente.
```
