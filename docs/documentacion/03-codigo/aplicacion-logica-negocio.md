# Capa de Aplicación: Lógica de Negocio Pura y Algoritmos Financieros

El submódulo `src/application/logic/` concentra todas las fórmulas matemáticas, motores de decisión algorítmica y mecanismos de guardia del sistema. Está compuesto exclusivamente por funciones puras e independientes de React, del DOM y de llamadas a bases de datos.

---

## 1. Métricas Financieras del Negocio (`src/application/logic/financialMetrics.ts:1-212`)

Rentabill traduce las existencias físicas y el flujo transaccional en indicadores económicos de liquidez.

### 1.1. Margen Unitario en Soles y Porcentual
* **Fórmula:**
  $$\text{unitMarginDollar} = P_{\text{venta}} - P_{\text{costo}}$$
  $$\text{marginPercent} = \frac{P_{\text{venta}} - P_{\text{costo}}}{P_{\text{venta}}} \times 100$$
* **Explicación en lenguaje simple:** Es la ganancia neta en Soles y el rendimiento porcentual que deja cada unidad vendida.
* **Ejemplo numérico verificado (`scripts/verify-logic.mjs:15-37`):**
  * Leche Gloria: Costo = S/ 3.50, Venta = S/ 4.20.
  * Margen en Soles = $4.20 - 3.50 = \text{S/ } 0.70$.
  * Margen Porcentual = $(0.70 / 4.20) \times 100 = 16.67\%$.

### 1.2. Velocidad Diaria de Rotación y Transición ESTIMADO -> REAL
* **Arranque en frío (Modo `ESTIMADO`):**
  Cuando un producto se da de alta, no registra ventas históricas. El comerciante declara una velocidad estimada (`RAPIDO`, `NORMAL`, `LENTO`):
  * `RAPIDO`: 30% del stock por semana $\rightarrow \text{dailyVelocity} = \frac{\text{stock} \times 0.30}{7}$.
  * `NORMAL`: 15% del stock por semana $\rightarrow \text{dailyVelocity} = \frac{\text{stock} \times 0.15}{7}$.
  * `LENTO`: 5% del stock por semana $\rightarrow \text{dailyVelocity} = \frac{\text{stock} \times 0.05}{7}$.
* **Transición a Modo `REAL`:**
  En cuanto el producto acumula **5 tickets de venta (`salesCount >= 5`)**:
  $$\text{dailyVelocity} = \frac{\text{unitsSold}}{\max(\text{díasActivo}, 1)}$$
* **Ejemplo numérico verificado (`scripts/verify-logic.mjs:40-60`):**
  * Arroz Costeño: Stock = 50 kg, Ventas = 30 kg en 10 días, Tickets = 8.
  * Estado: `REAL` (porque $8 \ge 5$).
  * Velocidad Diaria = $30 / 10 = 3.00\text{ kg/día}$.

### 1.3. Días de Existencia Restantes
* **Fórmula:**
  $$\text{daysOfStock} = \frac{\text{stockActual}}{\text{dailyVelocity}}$$
* **Explicación:** Si la velocidad diaria es mayor a 0, indica cuántos días de inventario quedan antes de agotar existencias (*stock-out*). Si la velocidad es 0, el valor es infinito (mercancía estancada).

### 1.4. Ganancia Diaria Promedio Proyectada
* **Fórmula:**
  $$\text{dailyProfitDollar} = \text{unitMarginDollar} \times \text{dailyVelocity}$$
* **Ejemplo:** Con margen de S/ 0.70 y velocidad de 1.03 unid/día $\rightarrow 0.70 \times 1.03 = \text{S/ } 0.72\text{ diarios}$.

### 1.5. Puntaje de Salud Financiera (`calculateHealthScore`, 0 a 100)
* **Fórmula de ponderación:**
  $\text{Puntaje} = (\text{marginHealthPercent} \times 0.60) + (\text{diversificationScore} \times 0.40)$
* **Componente 1 (`marginHealthPercent`, 60% peso):** Porcentaje de productos con rentabilidad diaria calculada $\ge 1.0\%$ (`dailyProfitPercent >= 1.0`).
* **Componente 2 (`diversificationScore`, 40% peso):** $100 - \text{capitalLockedInSlowPercent}$, donde `capitalLockedInSlowPercent` es el porcentaje del capital total inmovilizado en productos de rotación lenta.
* **Estados y Semáforo:**
  * $\ge 80$: `OPTIMAL` (Verde). Capital trabajando eficientemente con rotación activa.
  * $50 - 79$: `STABLE` (Ámbar). Negocio operativo con oportunidades de liquidar productos lentos.
  * $< 50$: `CRITICAL` (Rojo). Alto porcentaje de capital inmovilizado en mercancía parada.

### 1.6. Capital Invertido vs. Capital Parado
* **Dinero Invertido Total:** $\sum (\text{stock} \times \text{costPrice})$.
* **Dinero Parado (`totalTrappedCapital`):** $\sum (\text{stock} \times \text{costPrice})$ de productos clasificados como lentos (`isSlow`). Un producto es lento si:
  * En modo `REAL`: su velocidad diaria es menor a 0.5 unid/día (`dailyVelocity < 0.5`).
  * En modo `ESTIMADO`: su velocidad declarada es `LENTO` (`estimatedSpeed === 'LENTO'`).
  * Sin clasificar pero con ventas: `dailyVelocity < 0.5` tras al menos 15 días de creación.

---

## 2. Motor de Simulación de Compras (`src/application/logic/simulationEngine.ts:1-83`)

Permite proyectar el retorno financiero antes de emitir una orden de compra:
* **Parámetros de entrada:** Catálogo actual, producto a reabastecer, cantidad sugerida y costo negociado.
* **Cálculo de Retorno de Inversión (ROI):**
  $$\text{ROI} = \frac{\text{Ganancia Bruta Proyectada}}{\text{Inversión en Compra}} \times 100$$
* **Días de Venta Estimados:** $\text{días} = \frac{\text{Cantidad Comprada}}{\text{dailyVelocity}}$.
* **Veredicto Automático (`computeSimulationVerdict` en `simulationEngine.ts:65-82`):**
  * Para compras a **crédito**:
    * `CONVIENE`: Días de venta $\le \text{días de crédito}$ (`daysToSell <= creditDays`).
    * `RIESGOSO`: Días de venta $\le \text{días de crédito} + 15$ (`daysToSell <= creditDays + 15`).
    * `NO_CONVIENE`: Días de venta $> \text{días de crédito} + 15$.
  * Para compras al **contado**:
    * `CONVIENE`: Días de venta $\le 15$ días.
    * `RIESGOSO`: Días de venta entre $16$ y $30$ días (`daysToSell <= 30`).
    * `NO_CONVIENE`: Días de venta $> 30$ días.

---

## 3. Guardia de Escritura y Simulación para Modo Prueba (`src/application/logic/writeGuard.ts:1-66`)

### Propósito y Mecanismo Único de Control
El sistema permite a un Administrador previsualizar la interfaz como Cajero o Repositor. Para garantizar que ninguna prueba altere la base de datos de producción, `runWrite` actúa como interceptor mandatorio:

```typescript
export interface WriteGuardOptions<T> {
  isTestingRole: boolean;
  actionDescription?: string;
  onSimulate: () => T | Promise<T>;
  onRealWrite: () => Promise<T>;
  notifyTestMode: (title: string, message: string) => void;
}

export async function runWrite<T>(options: WriteGuardOptions<T>): Promise<T> {
  if (options.isTestingRole) {
    options.notifyTestMode(
      'Modo prueba: nada se guardó',
      options.actionDescription || 'Esta operación no se guardó en la base de datos'
    );
    return await options.onSimulate();
  }
  return await options.onRealWrite();
}): Promise<T> {
  if (params.isTestingRole) {
    // 1. Intercepta antes de tocar red o Supabase
    const result = await params.onSimulate();
    // 2. Notifica visualmente al comerciante
    params.notify('Modo prueba: nada se guardó');
    // 3. Devuelve resultado simulado idéntico al real
    return result;
  }
  // Fuera del modo prueba ejecuta la operación real contra la BD
  return await params.onExecute();
}
```

* **Garantía Técnica:** Ningún `INSERT`, `UPDATE`, `DELETE`, RPC ni subida a Supabase Storage llega al servidor cuando `isTestingRole === true`.
