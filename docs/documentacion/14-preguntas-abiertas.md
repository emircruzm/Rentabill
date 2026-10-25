# Preguntas Abiertas y Aspectos Deducidos a Confirmar con el Equipo

Este documento consolida todos los aspectos etiquetados como **`[DEDUCIDO]`** a lo largo de la documentación técnica. Corresponden a decisiones arquitectónicas, elecciones tecnológicas y justificaciones que fueron inferidas a partir del análisis del código fuente y del repositorio, y que deben ser formalmente confirmadas o ajustadas por el equipo de ingeniería antes de la sustentación final.

---

## 1. Decisiones de Diseño Deducidas (Checklist de Confirmación)

- [ ] **1. Descarte de Firebase / NoSQL en favor de PostgreSQL (ADR-02):**
  * *Deducción:* Se infiere que se descartó un motor documental NoSQL (como Firebase Firestore) debido a que los cálculos de rotación, la unicidad parcial de códigos de barra por tienda y las transacciones de descuento de inventario con kardex exigen consistencia relacional ACID estricta en Tercera Forma Normal (3FN).
  * *Acción del equipo:* Confirmar si esta fue la motivación oficial o si influyeron otros factores (como costos de lectura/escritura en Firebase).

- [ ] **2. Selección de Capacitor frente a Flutter o React Native (ADR-03):**
  * *Deducción:* Se deduce que la elección de Capacitor obedeció a la estrategia de mantener un único código base TypeScript reutilizando componentes web responsivos con Tailwind CSS v4, reduciendo la curva de aprendizaje frente a frameworks que requieren lenguajes adicionales (Dart).
  * *Acción del equipo:* Confirmar la justificación oficial de la elección de Capacitor.

- [ ] **3. Adopción de Context API nativo frente a Redux Toolkit o Zustand (ADR-06):**
  * *Deducción:* Se infiere que se prefirió Context API nativo de React para evitar dependencias externas adicionales en el empaquetado móvil, asumiendo el costo de concentración en `InventoryContext.tsx`.
  * *Acción del equipo:* Confirmar si se evaluaron librerías de estado ligero (como Zustand) o si se planifica migrar hacia contextos particionados.

- [ ] **4. Propósito de las dependencias `express`, `@types/express` y `@google/genai` en `package.json`:**
  * *Deducción:* Se deduce que `express` se utilizó temporalmente para un mock server local previo a la integración con Supabase, y que `@google/genai` fue explorado para recomendaciones inteligentes pero no llegó a integrarse en la versión actual.
  * *Acción del equipo:* Confirmar si estas dependencias pueden desinstalarse (`npm uninstall express @google/genai`) o si tienen un propósito reservado para futuras entregas.

- [ ] **5. Plan de Refactorización y Modularización de `InventoryContext.tsx`:**
  * *Deducción:* Se deduce que el equipo reconoce el tamaño del archivo (2,961 líneas) como deuda técnica justificada por la velocidad de entrega del prototipo funcional para el Curso Integrador.
  * *Acción del equipo:* Validar si se expondrá ante el docente como una mejora planificada hacia una arquitectura de contextos particionados por dominio.

- [ ] **6. Hoja de Ruta para Operación Fuera de Línea (*Offline-First*):**
  * *Deducción:* Se asume que el microcomercio objetivo dispone de conectividad móvil (red 4G/Wi-Fi en tienda), por lo que se priorizó la consistencia centralizada en Supabase sobre la complejidad de una cola local con resolución de conflictos de inventario.
  * *Acción del equipo:* Ratificar esta justificación como respuesta ante preguntas del jurado sobre funcionamiento sin internet.

- [ ] **7. Adopción Futura de Framework de Pruebas Unitarias:**
  * *Deducción:* Se deduce que la verificación estática de tipos (`tsc`), el analizador de reglas de capas (`check-layers.mjs`) y el script matemático (`verify-logic.mjs`) suplieron temporalmente la necesidad de un framework formal como Vitest o Jest.
  * *Acción del equipo:* Confirmar si se tiene previsto integrar Vitest en una fase posterior.
