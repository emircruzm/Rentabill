# Diagramas de Flujo y Secuencia del Sistema

Este documento describe mediante diagramas de secuencia en Mermaid los 9 flujos transaccionales y operativos críticos de Rentabill, modelando la interacción paso a paso entre el Usuario, la Interfaz (UI), la Capa de Aplicación, los Repositorios y la Base de Datos.

---

## 1. Flujo de Venta y Cobro en Mostrador (`processSale`)

```mermaid
sequenceDiagram
    autonumber
    actor Cajero as Cajero o Administrador
    participant POS as POSView (UI)
    participant State as InventoryContext (State)
    participant UC as processSaleUseCase
    participant Repo as salesRepository
    participant DB as PostgreSQL (RPC process_sale)
    participant RT as Supabase Realtime

    Cajero->>POS: Presiona "Cobrar Venta"
    POS->>UC: processSaleUseCase(storeId, items, paymentMethod, cashGiven)
    Note over UC: Valida invariantes (tienda valida, items > 0)
    UC->>Repo: salesRepository.processSale(params)
    Repo->>DB: supabase.rpc('process_sale', payload)
    Note over DB: Transaccion ACID:<br/>1. Valida stock suficiente<br/>2. Descuenta stock e incrementa contadores<br/>3. Inserta cabecera y partidas en sale_items<br/>4. Inserta asiento en kardex (VENTA)<br/>5. Evalua si acumula >= 5 ventas (calibracion)
    DB-->>Repo: { sale_id, ticket_number, total_amount, change_given, calibrated_items }
    Repo-->>UC: ProcessSaleResult
    UC-->>State: Actualiza estado local y vuelto
    State-->>POS: Limpia carrito y muestra confirmacion
    par Notificacion WebSocket
        DB->>RT: Evento de cambio en products y sales
        RT->>State: Sincroniza nuevo stock en otros terminales
    end
```

---

## 2. Flujo de Ingreso de Compra a Proveedor (`processPurchase`)

```mermaid
sequenceDiagram
    autonumber
    actor Operador as Repositor o Administrador
    participant View as RestockSimulatorView (UI)
    participant UC as processPurchaseUseCase
    participant Repo as purchasesRepository
    participant DB as PostgreSQL (RPC process_purchase)

    Operador->>View: Ingresa factura de compra y partidas
    View->>UC: processPurchaseUseCase(storeId, items, condition, creditDays)
    UC->>Repo: purchasesRepository.processPurchase(params)
    Repo->>DB: supabase.rpc('process_purchase', payload)
    Note over DB: Transaccion en Servidor:<br/>1. Inserta purchases (PENDIENTE o PAGADA)<br/>2. Inserta purchase_items<br/>3. Incrementa stock en products<br/>4. Inserta kardex en inventory_movements (COMPRA)
    DB-->>Repo: { purchase_id, purchase_number, total_amount, status }
    Repo-->>UC: Resultado exitoso
    UC-->>View: Cierra formulario y actualiza existencias
```

---

## 3. Flujo de Liquidación de Compra a Crédito (`payPurchase`)

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Administrador
    participant Historial as HistorialView (Compras)
    participant UC as payPurchaseUseCase
    participant Repo as purchasesRepository
    participant DB as PostgreSQL (RPC pay_purchase)

    Admin->>Historial: Presiona "Liquidar Deuda" en compra pendiente
    Historial->>UC: payPurchaseUseCase(storeId, purchaseId)
    UC->>Repo: purchasesRepository.payPurchase(storeId, purchaseId)
    Repo->>DB: supabase.rpc('pay_purchase', { p_store_id, p_purchase_id })
    Note over DB: Valida rol ADMIN y actualiza status = 'PAGADA'
    DB-->>Repo: { success: true, purchase_id }
    Repo-->>UC: Confirmacion
    UC-->>Historial: Actualiza estado a PAGADA en la interfaz
```

---

## 4. Flujo de Ajuste Manual de Inventario (`adjustStock`)

```mermaid
sequenceDiagram
    autonumber
    actor Almacen as Repositor o Administrador
    participant Modal as Modal Ajuste Stock (UI)
    participant UC as adjustStockUseCase
    participant Repo as stockRepository
    participant DB as PostgreSQL (RPC adjust_stock)

    Almacen->>Modal: Ingresa cantidad (-3 mermas) y motivo
    Modal->>UC: adjustStockUseCase(storeId, productId, -3, "Envase roto", user)
    UC->>Repo: stockRepository.adjustStock(params)
    Repo->>DB: supabase.rpc('adjust_stock', payload)
    Note over DB: Actualiza stock en products e inserta kardex (AJUSTE)
    DB-->>Repo: { product_id, stock_before: 10, stock_after: 7 }
    Repo-->>UC: Exito
    UC-->>Modal: Notifica ajuste y refresca catalogo
```

---

## 5. Flujo de Proyección y Confirmación de Compra

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Administrador
    participant SimView as RestockSimulatorView
    participant Engine as simulationEngine.ts
    participant UC as confirmSimulationPurchaseUseCase
    participant DB as PostgreSQL (RPC process_purchase)

    Admin->>SimView: Selecciona producto y cantidad a simular
    SimView->>Engine: calculateSimulation(params)
    Engine-->>SimView: Retorna ROI, margen, dias de recuperacion y veredicto
    Admin->>SimView: Presiona "Confirmar y Ejecutar Compra"
    SimView->>UC: confirmSimulationPurchaseUseCase(simData)
    UC->>DB: Invoca RPC process_purchase vinculando simulation_ids
    DB-->>SimView: Compra formal asentada en inventario
```

---

## 6. Flujo de Creación y Cambio de Sucursal

```mermaid
sequenceDiagram
    autonumber
    actor Usuario as Comerciante
    participant Selector as StoreSelectorModal
    participant State as InventoryContext
    participant Repo as storesRepository
    participant DB as PostgreSQL (RPC switch_store)

    Usuario->>Selector: Selecciona otra tienda de su lista
    Selector->>State: switchStore(storeId)
    State->>Repo: storesRepository.switchStore(storeId)
    Repo->>DB: supabase.rpc('switch_store', { p_store_id })
    Note over DB: Valida membresia en store_members
    DB-->>Repo: { store_id, name, role }
    State->>State: 1. Desconecta WebSockets de tienda previa<br/>2. Conecta WebSockets de nueva tienda<br/>3. Recarga catalogo y ventas aisladas por RLS<br/>4. Reinicia modo prueba (isTestingRole = false)
    State-->>Selector: Cierra modal con nuevo contexto activo
```

---

## 7. Flujo de Invitación y Aceptación de Equipo

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Administrador Tienda
    actor Empleado as Nuevo Cajero
    participant Ajustes as AjustesView (Admin)
    participant Onboard as OnboardingView (Empleado)
    participant DB as PostgreSQL (RPCs invite / accept)

    Admin->>Ajustes: Ingresa codigo "RENT-8A2F" y selecciona rol CAJERO
    Ajustes->>DB: RPC invite_by_code(storeId, "RENT-8A2F", "CAJERO")
    DB-->>Ajustes: Genera store_invitations con token unico
    Empleado->>Onboard: Ingresa token de invitacion recibido
    Onboard->>DB: RPC accept_invitation(token)
    Note over DB: Inserta en store_members con rol CAJERO y marca token ACEPTADA
    DB-->>Onboard: Vinculacion exitosa
    Onboard->>Onboard: Abre tienda con vista restringida de Cajero
```

---

## 8. Flujo de Autenticación y Recuperación de Clave

```mermaid
sequenceDiagram
    autonumber
    actor Usuario as Comerciante
    participant Auth as AuthView (UI)
    participant UC as authUseCases
    participant Repo as authRepository
    participant SupaAuth as Supabase Auth (auth.users)
    participant Storage as KeyValueStorage (Preferences)

    Usuario->>Auth: Ingresa correo y contrasena
    Auth->>UC: loginUseCase(email, password)
    UC->>Repo: authRepository.signIn(email, password)
    Repo->>SupaAuth: supabase.auth.signInWithPassword(...)
    SupaAuth-->>Repo: Retorna Session y Tokens JWT
    Repo->>Storage: setItem('sb-token', sessionData)
    Repo-->>UC: Usuario autenticado
    UC-->>Auth: Redirige a pantalla principal
```

---

## 9. Flujo de Vista Previa de Roles (Modo Prueba y Guardia `runWrite`)

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Administrador
    participant Ajustes as AjustesView
    participant POS as POSView
    participant Guard as writeGuard (runWrite)
    participant State as InventoryContext (Memoria)
    participant DB as PostgreSQL (Supabase Cloud)

    Admin->>Ajustes: Selecciona "Probar modo Cajero"
    Ajustes->>State: setTestingRole('CAJERO')
    Note over State: isTestingRole = true, rol local = CAJERO
    State->>State: Monta RoleTestBanner ("MODO PRUEBA: los cambios NO se guardan")
    Admin->>POS: Ejecuta una venta simulada
    POS->>Guard: runWrite({ isTestingRole, onSimulate, onExecute })
    Note over Guard: isTestingRole === true:<br/>1. INTERCEPTA (no llama a la red)<br/>2. Ejecuta onSimulate() en memoria local<br/>3. Dispara toast "Modo prueba: nada se guardo"
    Guard--xDB: NINGUNA sentencia SQL ni RPC viaja al servidor
    Guard-->>POS: Retorna venta simulada exitosa
    Admin->>Ajustes: Presiona "Salir de prueba" en el Banner
    Ajustes->>State: exitTestingRole()
    Note over State: isTestingRole = false, restaura rol real ADMIN
```
