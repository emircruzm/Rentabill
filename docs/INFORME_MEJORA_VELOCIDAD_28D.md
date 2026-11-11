# Informe Técnico: Mejora de la Velocidad Diaria "REAL" de Productos (Ventana Móvil 28 Días)

**Fecha:** 11 de Noviembre de 2026  
**Rama:** `arquitectura-capas`  
**Rama de Respaldo Previo:** `backup/antes-velocidad`  
**Estado:** Implementado, Validado y Aprobado (`USE_WINDOW_28D = true`)

---

## 1. Resumen Ejecutivo

Se implementó la optimización de la velocidad diaria de rotación de productos en etapa `REAL` sin alterar la regla de transición de negocio (`salesCount >= 5` o `createdDaysAgo >= 30`).

La mejora resuelve la inercia del promedio histórico acumulado de por vida (`unitsSoldTotal / createdDaysAgo`), el cual provocaba retrasos significativos en la detección de productos estancados o con cambios de tendencia de consumo. Mediante una ventana móvil de **28 días** (`unitsSoldLast28d / Math.min(28, createdDaysAgo)`):
1. Si el producto tiene $\le 28$ días de creado, el cálculo coincide de forma idéntica con la fórmula histórica.
2. Si el producto supera los 28 días, el denominador se fija en 28 días, capturando 4 semanas completas (estacionalidad completa de lunes a domingo) y adaptándose de forma ágil a la demanda contemporánea.
3. Si un producto en etapa `REAL` no registra ventas en el periodo, **no cae al estimado por stock**: devuelve `0.1 u/día` y activa la alerta `isSlow = true`.

---

## 2. Componentes Implementados y Modificados

### 2.1. Módulo de Lógica Pura: `src/application/logic/velocity.ts`
* **Lógica pura:** Sin dependencias de React, Supabase ni Capacitor.
* **`estimatedVelocity(stock, estimatedSpeed)`**:
  $$\text{Velocidad Estimada} = \frac{\max(\text{stock}, 1) \times \text{tasa semanal}}{7}$$
  Donde $\text{tasa semanal}$ es `RAPIDO: 0.30`, `NORMAL: 0.15`, `LENTO: 0.05` (por defecto `0.15`).
* **`realVelocityCurrent({ unitsSoldTotal, createdDaysAgo })`**:
  $$\text{Velocidad Histórica} = \frac{\text{unitsSoldTotal}}{\max(\text{createdDaysAgo}, 1)}$$
* **`realVelocity28({ unitsSoldLast28d, createdDaysAgo })`**:
  $$\text{Velocidad 28d} = \frac{\text{unitsSoldLast28d}}{\min(28, \max(\text{createdDaysAgo}, 1))}$$
* **`resolveRealVelocity(...)`**:
  Evalúa el flag `USE_WINDOW_28D`. Si `unitsSoldLast28d` es `undefined` o `null` (columna ausente en la base de datos), **no lo trata como 0**: recurre automáticamente a `realVelocityCurrent` como respaldo. Solo si la velocidad calculada es $\le 0$, devuelve `0.1` e `isSlow = true`.
* **Mapeo de Integración:**
  Se integró `unitsSold28d` y `unitsSoldLast28d` en la interfaz `Product`, en `productMapper.fromRow` (mapeando `row.units_sold_28d`) y en la consulta `.select('*')` de `productsRepository.getByStoreId`.
* **Reemplazo de `ESTIMATED_SPEED_VALUES`**: Sustituido por `SPEED_WEEKLY_RATES`.

### 2.2. Unificación de Lugares Duplicados
* **`calculateProductMetrics` (`src/application/logic/financialMetrics.ts`)**: Se reemplazó el cálculo manual duplicado por llamadas directas a `resolveRealVelocity`, `realVelocityCurrent` y `estimatedVelocity`.
* **`getRealProductVelocity` (`src/application/state/InventoryContext.tsx`)**: Se integró `resolveRealVelocity` para productos en etapa `REAL` (eliminando la caída a velocidad estimada de stock si el producto real tiene velocidad 0) y `estimatedVelocity` para estimados.
* **`ProductRegisterView.tsx` (`src/presentation/pages/ProductRegisterView.tsx`)**: Se eliminó el cálculo inline duplicado de tasa semanal y se delegó a `estimatedVelocity(stock, speed)`.

---

## 3. Revisión de Datos de Ventas y Propuesta SQL

### 3.1. Diagnóstico de `sales` en Memoria
Al auditar `InventoryContext.tsx:355` y `salesRepository.ts:37-47`, se confirmó que el listado de ventas en memoria se carga con límite:
```typescript
const loadedSales = await salesRepository.getByStoreId(storeId, 100);
```
Dado que `.limit(100)` trunca las ventas cuando hay alta rotación o más de 100 tickets en el mes, **`sales` en el cliente no garantiza cubrir los últimos 28 días**.

### 3.2. Propuesta para la Vista `public.product_stats`
Para proveer `units_sold_28d` de manera performante y respetando RLS (`security_invoker = true`), se formuló la siguiente actualización para `supabase/rentabill_schema_v3.7.sql`:

```sql
CREATE OR REPLACE VIEW public.product_stats AS
SELECT
    p.id,
    p.store_id,
    p.category_id,
    c.name AS category_name,
    p.barcode,
    p.sku,
    p.name,
    p.unit,
    p.cost_price,
    p.sale_price,
    p.stock,
    p.reorder_point,
    p.estimated_speed,
    p.units_sold,
    p.sales_count,
    COALESCE(s28.units_sold_28d, 0) AS units_sold_28d,
    GREATEST(EXTRACT(day FROM now() - p.created_at)::integer, 0) AS created_days_ago,
    CASE
        WHEN p.sales_count >= 5 OR EXTRACT(day FROM now() - p.created_at) >= 30 THEN 'REAL'::text
        ELSE 'ESTIMADO'::text
    END AS status,
    p.image_url,
    p.archived_at,
    p.created_at,
    p.updated_at
FROM public.products p
LEFT JOIN public.categories c ON c.store_id = p.store_id AND c.id = p.category_id
LEFT JOIN (
    SELECT
        si.store_id,
        si.product_id,
        SUM(si.quantity) AS units_sold_28d
    FROM public.sale_items si
    JOIN public.sales s ON s.store_id = si.store_id AND s.id = si.sale_id
    WHERE s.created_at >= (now() - INTERVAL '28 days')
    GROUP BY si.store_id, si.product_id
) s28 ON s28.store_id = p.store_id AND s28.product_id = p.id;

ALTER VIEW public.product_stats SET (security_invoker = true);
```
*(Nota: No se ejecutó contra la base de datos a la espera de confirmación).*

---

## 4. Backtest de No-Empeoramiento (`scripts/backtest-velocity.mjs`)

Se evaluó la precisión predictiva para los siguientes 7 días a lo largo de 180 días de simulación con patrón semanal, derivas de nivel de demanda (*shifts*) y picos esporádicos en 16 productos representativos.

### Métricas de Evaluación
* **WAPE (Weighted Absolute Percentage Error):**
  $$\text{WAPE} = \frac{\sum |\text{Predicho} - \text{Real}|}{\sum \text{Real}} \times 100\%$$
* **Sesgo (Bias):**
  $$\text{Sesgo} = \frac{\sum (\text{Predicho} - \text{Real})}{\sum \text{Real}} \times 100\%$$

### Resultados Comparativos

| Categoría | Comparaciones | WAPE Actual | WAPE 28d | Dif. WAPE (28d - Actual) | Sesgo Actual | Sesgo 28d |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **TOTAL** | **320** | **15.06%** | **10.74%** | **-4.32 pp** | **-1.02%** | **-0.02%** |
| **RAPIDO** | 100 | 14.10% | 9.90% | -4.20 pp | -1.51% | -0.20% |
| **NORMAL** | 120 | 14.43% | 10.42% | -4.01 pp | -1.33% | +0.16% |
| **LENTO** | 100 | 72.57% | 58.60% | -13.97 pp | +28.22% | +7.62% |

### Evaluación de Reglas de Decisión
1. **Muestra representativa:** Cumplida ($N = 320 \ge 30$).
2. **WAPE Total:** Cumplido ($10.74\% \le 15.06\%$, mejora de $4.32\text{ puntos porcentuales}$).
3. **Margen por categoría:** Cumplido. Ninguna categoría empeoró; todas mostraron mejoras considerables, especialmente en artículos lentos estancados (reducción de error de $13.97\text{ pp}$ y corrección de sobreestimación del sesgo de $+28.22\%$ a $+7.62\%$).

**Veredicto:** Aprobado para activación. Se configuró:
```typescript
export const USE_WINDOW_28D = true;
```

---

## 5. Verificación de Lógica Matemática (`scripts/verify-logic.mjs`)

Se validaron los casos preexistentes y los cuatro nuevos escenarios requeridos:

1. **Caso 1 (Tienda vacía):** Inversión total 0, puntaje neutro 40.
2. **Caso 2 (Producto Estimado Rápido):** Margen \$0.70, velocidad $1.03\text{ u/día}$, ganancia diaria \$0.72, estado `ESTIMADO`.
3. **Caso 3 (Producto Real con ventas):** Velocidad $3.00\text{ u/día}$, estado `REAL`.
4. **Caso 4a (Producto de 10 días):**
   * `realVelocityCurrent` (30u / 10d): `3.00 u/día`
   * `realVelocity28` (30u / min(28, 10)d): `3.00 u/día`
   * Equivalencia matemática idéntica comprobada.
5. **Caso 4b (Producto de 90 días con desaceleración):**
   * `realVelocityCurrent` (120u / 90d): `1.33 u/día` (inercia histórica).
   * `realVelocity28` (10u / 28d): `0.36 u/día` ($10/28$).
6. **Caso 4c (Producto REAL sin ventas en 28 días):**
   * Estado: `REAL`.
   * Velocidad: `0.1 u/día` (sin caer a fórmula estimada por stock).
   * Alerta: `isSlow = true`.
7. **Caso 4d (Producto ESTIMADO sin ventas con stock 0):**
   * Base de velocidad calculada: `Math.max(0, 1) * 0.15 / 7` = **`0.02 u/día`**.
   * Días en Simulador (`simulationEngine.ts`) para 24 unidades: **1200 días** ($24 / 0.02$).
   * Días para agotar inventario (`daysToDeplete`) para 24 unidades: **240 días** ($24 / \max(0.02, 0.1) = 24 / 0.1$).
8. **Caso 4e (Producto REAL 90d con `unitsSoldLast28d = undefined` - columna ausente en BD):**
   * Estado: `REAL`.
   * Velocidad calculada: **`1.33 u/día`** (recurre a la velocidad histórica de respaldo `120u / 90d`, **no a 0.1**).
   * Alerta: `isSlow = false` (ya que $1.33 \ge 0.5$).

---

## 6. Resultados de Comprobación de Calidad

* **`npm run lint` (`tsc --noEmit`):** 0 errores.
* **`npm run check:layers`:** 0 violaciones de capas de arquitectura.
* **`node scripts/verify-logic.mjs`:** 100% de pruebas pasadas exitosamente.
* **`node scripts/backtest-velocity.mjs`:** Validación superada con veredicto aprobatorio.
