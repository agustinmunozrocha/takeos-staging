# QA · Presupuesto / Cotización (`frontend/src/modules/presupuesto-cotizacion.js`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
Módulos de apoyo: `calculadoras.js`, `lib/calc.js`, `lib/data.js`, `dal.js` (persistencia), `gastos.js` (sync Costo Real).
Cobertura: 20/36 ✅ · 2 🔁 (P23, P27) · 4 ❌ abiertos (P19, P20, P21, P22 — ver cierres: van por BD/Juan o repro en vivo). Resto ⬜.

> **Cómo leer este catálogo.** Las pruebas marcadas **⭐** en "Qué probar" son
> donde el cruce monolito↔modular levantó sospecha de que la migración pudo
> romper algo: **pruébalas primero**. El resto son cobertura de regresión normal.
> El juez final eres tú en `localhost:5173`; esto es la guía para no olvidar nada.

---

## A. Cálculos de fila y subtotales

| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| P1 | Costo cotizado con **factura** | Fila en Servicios: Valor 100.000, Cant. 2, DTE Factura | Costo cotizado = **$200.000** (valor × cant, sin retención) | ✅ |
| P2 | Costo cotizado con **boleta de honorarios** (retención) | Misma fila, DTE = Boleta de honorarios | Costo = round(valor / 0,8475 × cant) = **$236.000** aprox (la boleta infla por la retención 15,25%) | ✅ |
| P3 | Boleta a terceros | DTE = Boleta a terceros | Aplica `FACTOR_BTE` (mismo 0,8475 hoy) → infla igual que boleta | ✅ |
| P4 | Fila **sin DTE** en Servicios/Talentos | Dejar DTE vacío con valor y cantidad | La celda muestra **"FALTA DTE"** (no calcula, no cae a 0 silencioso) | ✅ |
| P5 | Fila sin DTE en **Gastos/Técnica** | Ítem de Gastos con valor y cant., DTE vacío | Calcula como factura: **round(valor × cant)** (no exige DTE) | ✅ |
| P6 | Fila sin valor o sin cantidad | Dejar Valor o Cant. vacío | Costo = **$0** (fila no usable, sin error) | ✅ |
| P7 | Subtotal por sub-departamento y sección | Varias filas en Dirección/Producción | Subtotal = suma de costos cotizados; se muestra Cot / Real / delta | ✅ |
| P8 | Redondeo a peso entero | Valores que den decimales (ej. boleta) | Cada fila redondea a CLP entero **en la fuente**; los subtotales cuadran exactos con las filas | ✅ |

## B. Hora extra (HE)

| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| P9 | HE por defecto en fila **Jornadas** | Proyecto en Preproducción+. Fila con Unidad=Jornadas, Valor 500.000. Poner Horas extra = 2 | Valor hora = 500.000/10 = 50.000; líquido = round(50.000 × 150% × 2) = **$150.000** (recargo proyecto 150%), convertido a costo empresa según DTE | ✅ |
| P10 | ⭐ HE al cambiar **Unidad** a Jornadas | Fila con HE y horas>0, unidad ≠ Jornadas → cambiarla a Jornadas | La HE debe **recalcular** el valor hora (÷10) y el costo. *(Sospecha: `onUnidadChange` no dispara `afterRowChange`; puede no recomputar hasta re-render.)* | ✅ |
| P11 | ⭐ Fila sin valor hora derivable | Unidad ≠ Jornadas, poner horas>0 con "usar cálculo del proyecto" | Celda muestra **"⚠ definir"** (warning, clicable); NO descarta la HE en silencio | ✅ |
| P12 | Override por fila (fórmula propia / tarifa plana) | ⚙ de la celda → desactivar "usar cálculo del proyecto" → tarifa plana $80.000 | Usa el monto plano; ignora valor hora y recargo del proyecto | ✅ |
| P13 | ⚙ recargo por defecto del proyecto | ⚙ del encabezado Horas extra → cambiar recargo a 200% | Recalcula **solo** las filas con "usar cálculo del proyecto"; las override quedan intactas | ✅ |
| P14 | HE fuera del subtotal | Sección con filas + HE | El subtotal de sección **no** incluye HE; se muestra "+ HE $X" aparte | ✅ |
| P15 | HE en el resumen financiero | Con HE real > 0 | Aparece fila "Horas extra" en el resumen y se suma al **Costo de Producción real al final** (no infla admin ni contingencias); solo lado real | ✅ |

## C. Columnas y orden

| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| P16 | Redimensionar columna | Arrastrar el grip de una columna; recargar | El ancho cambia y **persiste** (localStorage por navegador). Doble clic en el grip restablece | ✅ |
| P17 | Ordenar por columna (transitorio) | Click en encabezado de una columna | Ordena **solo en pantalla**; desactiva el drag de filas; "↺ Restaurar orden" limpia; NO persiste al recargar | ✅ |
| P18 | Reordenar filas (drag ⋮⋮) | Arrastrar una fila por el grip dentro del mismo depto | El nuevo orden **persiste** al recargar (vive en el array) | ✅ |
| P19 | Renombrar sub-sección (Servicios) | ✎ de un sub-departamento (no de fábrica) → nuevo nombre | Se renombra y **persiste**; migra la llave con sus filas | ❌ |
| P20 | Mover sub-sección (Servicios) | Panel Visualización → mover un sub-depto | El orden de sub-deptos **persiste** | ❌ |

## D. Persistencia de estado

| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| P21 | Estado general sobrevive a recargar | Editar nombre, valor, cant., unidad, DTE, confirmado, costo real, HE; recargar (Cmd+Shift+R) | Todo sigue guardado tal cual | ❌ |
| P22 | ⭐ **Nota por fila** persiste | Poner una nota en una fila; recargar | La nota debe seguir ahí. *(Sospecha fuerte: en la modular la nota se envía pero el SELECT no la relee → se perdería al recargar. En `main` sí persiste.)* | ❌ |
| P23 | ⭐ **DTE real** persiste | Cambiar DTE real de una fila; recargar | Verificar contra `main`: en el monolito el DTE real **tampoco persiste** (gap conocido) → si en la modular vuelve al DTE cotizado, **coincide con main** (no es bug); anotar el hallazgo | 🔁 |
| P24 | Borrar fila no reaparece | Eliminar una fila ya guardada; recargar | La fila queda eliminada (baja encolada al servidor), no reaparece | ✅ |
| P25 | Concurrencia por fila | Editar una fila, guardar; editar otra | Cada fila guarda por su cuenta (upsert diff por `clientUuid`/version); sin pisar cambios ajenos ni conflictos falsos | ✅ |

## E. Documento tributario (DTE)

| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| P26 | Cambiar **DTE cotizado** recalcula | Cambiar DTE de Factura a Boleta en una fila | Recalcula el costo cotizado al instante (aplica/quita retención) y recomputa HE si la fila usa cálculo de proyecto | ⬜ |
| P27 | ⭐ Cambiar **DTE real** | Cambiar el DTE real de una fila con HE | El costo real no cambia (es literal). La HE (que usa DTE real como efectivo) **se recomputa en vivo** al cambiar el DTE real. *(Mejora deliberada sobre `main`: en el monolito no recomputaba hasta empujar la fila.)* | 🔁 |

## F. Panel de Finanzas (Resumen financiero)

| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| P28 | Cadena financiera completa | Con datos en las 4 secciones + Presupuesto Cliente | Subtotal → Gastos Admin (5% def) → Riesgos → Costo Producción → Ganancia Parcial → Comisiones → **Ganancia Final**; márgenes % en el header. Cada campo % editable recalcula todo | ⬜ |
| P29 | Extras de ingreso (ampliaciones) | Agregar un extra de ingreso al cliente | Se suma a **Presupuesto Cliente Efectivo**; afecta solo el lado real/efectivo; editable **incluso** con proyecto aprobado | ⬜ |
| P30 | Riesgos y comisiones ($ vs %) | Agregar un riesgo modo % y una comisión modo $ | % se aplica sobre subtotal/ganancia; $ es monto fijo; se pueden agregar/eliminar | ⬜ |
| P31 | Visibilidad por perfil + label final | Ver el resumen; revisar la fila de total | Se oculta entero a perfiles Producción (3) y Asistencia (4). **Cosmético:** la fila final dice "GANANCIA FINAL PRIMATE (NETO)" en `main` y en la modular; con el rebranding a Rizora quizá deba decir otra cosa — anotar, no es bug de migración | ⬜ |

## G. Etapas y bloqueo del cotizado

| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| P32 | Modo Venta (solo cotización) | Proyecto en Venta | Sin columnas Costo real / DTE real / Horas extra / Confirmado; todo editable; header "Modo: Solo cotización" | ⬜ |
| P33 | Bloqueo al aprobar (Preproducción+) | Pasar el proyecto a Preproducción | Rol/Ítem, DTE, Valor, Cant. de filas no-extra quedan readonly; aparecen columnas reales + Confirmado; Presupuesto Cliente y Gastos Admin/Riesgos se congelan (🔒); botón × desaparece en filas bloqueadas | ⬜ |
| P34 | Agregar fila post-aprobación = EXTRA | Con proyecto aprobado, "+ Agregar rol" | La fila nueva nace como **EXTRA** (badge, siempre editable, no toca el cotizado) con toast | ⬜ |

## H. Comboboxes / Gastos ↔ Presupuesto

| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| P35 | Combobox de Nombre contra BD | Escribir un nombre en la columna Nombre | Filtra contra la BD de personas; nombre no existente muestra "● no en BD" con acción "+ Agregar a la BD" | ⬜ |
| P36 | Costo Real derivado de Gastos | Fila de Gastos con caja vinculada y movimientos > 0 | El Costo Real es **derivado** (solo lectura, suma de movimientos), con link a la pestaña Gastos. Sin caja o con $0, editable a mano | ⬜ |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó (no re-probar) · ❌ falló (bug abierto) · 🔁 cambió a propósito.

## Notas

- **Sospechas prioritarias del cruce (probar primero):**
  - **P22 — Nota por fila:** el mapeo de la modular indica que la nota se envía en
    el upsert pero el SELECT de `dal.js` no la relee → probable pérdida al recargar.
    En `main` la nota persiste. Candidato #1 a bug de migración.
  - **P10 / P27 — `afterRowChange` faltante:** cambiar Unidad (a Jornadas) o DTE
    real no dispararía el recálculo de HE en vivo en la modular; en `main` el
    recálculo es inmediato. Verificar si la HE queda desactualizada hasta re-render.
- **P23 — DTE real:** NO es regresión esperada: el monolito **tampoco** persiste el
  DTE real (gap documentado). Si la modular hace lo mismo, marcar 🔁 / coincide.
- **P31 — "PRIMATE":** el label proviene del monolito (marca antigua); coincide con
  `main`, así que no es bug de migración. Queda como pendiente de branding (Rizora).
- Al probar, agrupa los ❌ por familia para armar un solo reporte de bugs (Paso 4)
  y una sola vuelta de fix.

### Cierre vuelta `fix/presupuesto-he-unidad-y-notas` (2026-07-08, merge `b10b01c`)
Causa raíz única: el `dept` viajaba con comillas por la delegación (herencia del
`onclick` inline del monolito) → fallaban los lookups en filas de **Servicios**.
- **P10, P11 → ✅** unidad se mantiene, HE recalcula, no revierte.
- **P17 → ✅** ordenar por columna en Servicios ahora sí ordena (mismo fix).
- **P27 → ✅** coincide con `main`. Precisión (2ª vuelta): el DTE real **sí**
  alimenta el cálculo de la HE (DTE efectivo = `dteReal || dte`, `_heEffDte`).
  Pero **ni `main` ni la modular recalculan la HE en vivo al cambiar el DTE
  real**: la celda de DTE real no dispara `afterRowChange` (a diferencia de la de
  DTE cotizado), así que hay que "empujar" la fila para ver el nuevo costo. Como
  la modular replica exactamente a `main`, **no es regresión de la migración**.
  El auto-recálculo al cambiar DTE real sería una **mejora sobre `main`** (decisión
  de producto, ver abajo), no un fix de Etapa 4.
- **P23 → 🔁** el DTE real no persiste al recargar; el monolito **tampoco** → no
  es regresión.
- **P22 → ❌ (abierto, parcial):** la nota ya guarda y se muestra **dentro de la
  sesión** (regresión corregida, igual que main). Falta **persistir al recargar**:
  no hay columna en la BD (`budget_line_items`) y main tampoco la persiste →
  **NO es de esta migración**; es una función nueva que va por el **flujo de
  migraciones** (BD/Juan), fuera de la Etapa 4 frontend. Pendiente registrado en
  memoria de proyecto.

### Cierre vuelta `feat/presupuesto-dte-real-recalcula-he` (2026-07-08)
Grupo A completo (P1–P8 ✅) y grupo B menos lo ya aprobado (P9, P12–P15 ✅). Al
probar P9, Agustín notó que cambiar el **DTE real** no recalculaba la HE en vivo
(había que empujar la fila). Se verificó contra `main`: **coincide** (el monolito
tampoco recomputa — la celda de DTE real no dispara `afterRowChange`), así que **no
era regresión**. Por decisión de producto se hizo la **mejora deliberada**: la
celda de DTE real ahora dispara `afterRowChange` (1 línea en
`presupuesto-cotizacion.js`), igual que la de DTE cotizado.
- **P1–P8 → ✅** cálculos de fila y subtotales OK (factura, boletas, sin DTE,
  redondeo, subtotales).
- **P9, P12, P13, P14, P15 → ✅** hora extra OK (valor hora, tarifa plana, recargo
  del proyecto, HE fuera del subtotal, HE en el resumen).
- **P27 → 🔁** ahora la HE se recalcula sola al cambiar el DTE real (mejor que
  `main`, a propósito).

### Cierre vuelta `fix/presupuesto-ui-columnas-lapiz-viz` (2026-07-09, merge `de8abdf`)
Bugs de UI de columnas y sub-secciones surgidos al probar C–D (P16–P25). Causa
raíz de P16: el grip de ancho perdió el reclamo del `click` en la migración a
delegación de eventos → el clic subía al `<th>` y ordenaba.
- **P16 → ✅** soltar el redimensionado ya no reordena; el doble clic en el grip
  restablece el ancho (antes lo tomaba como "ordenar"). Fix: el grip vuelve a
  reclamar `click` (2 reemplazos en `presupuesto-cotizacion.js`).
- **P18 → ✅** reordenar filas por el grip ⋮⋮ persiste al recargar.
- **P24 → ✅** borrar una fila guardada no reaparece al recargar.
- **P25 → ✅** editar filas distintas no se pisan entre sí.
- **P19b (lápiz en fábrica) → ✅ arreglado** el ✎ ya no se muestra en
  sub-secciones de fábrica (donde renombrar está bloqueado); ídem el input del
  panel Visualización queda de solo lectura. **P19 (catálogo) queda ❌** por
  **P19a**: renombrar a un nombre de fábrica oculto (ej "Producción") da un falso
  "ya existe". Causa: el RPC `renombrar_departamento` valida la unicidad contra la
  tabla `departments` de toda la organización (incluye los de fábrica ocultos).
  **Es regresión de la migración, pero el fix vive en la BD/RPC → va por el flujo
  de migraciones (Juan), no por esta etapa.**
- **P20 → ❌ (fuera de Etapa 4)** mover un sub-departamento no persiste. **No es
  regresión**: `main` tampoco persiste un reorden puro. La modular hizo de
  `departments.orden` la fuente del orden, pero no hay RPC para escribirlo →
  persistirlo es **feature nueva de BD** (RPC `reordenar_departamentos`), va por
  Juan.
- **P21 → ❌ (parcial; ninguno es regresión limpia)** al recargar **sí** persisten
  Pronto Pago, Unidad, Costo Real, DTE Real, HE y "Confirmado". Fallan: **Nombre**
  (P21a) — el cableado es idéntico a `main` (no es rotura de la mudanza); Agustín
  lo cargó eligiéndolo del listado → probable `contact_id` pegajoso (que también
  falla en `main`). **Pendiente de repro en vivo**, no se tocó. **NO Rodaje**
  (P21b) — nunca se persistió (sin columna en BD; `main` igual) → feature de BD
  (Juan). **Nota de fila** (P22) — igual, sin columna → BD (ya registrado).
- **UI (aparte):** el botón "Visualización" se movió junto al título "Servicios —
  Personal contratado" (pedido de Agustín; no es bug).

**Pendientes para Juan (BD, fuera de Etapa 4 frontend):** P19a (unicidad de
`renombrar_departamento` por proyecto, no org-wide), P20 (RPC de reordenar
departamentos), P21b/P22 (columnas `no_rodaje` y `nota` en `budget_line_items`).
**Pendiente de repro:** P21a (Nombre elegido del listado).
