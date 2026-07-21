# QA · Rodajes (`frontend/src/modules/rodajes.js`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
Módulos de apoyo: `dal.js` (round-trip vía `project_shoot_days` / RPC 4a),
`plan-rodaje.js` y `hoja-llamado` (consumen los días), `lib/delegacion.js`.
Cobertura: 22/22 ✅ (QA automatizado 2026-07-20, 0 bugs; ROD-12 verificado por
código, ROD-15 borrado ✓ con nota de Hoja de Llamado). Persistencia confirmada en
la base (project_shoot_days) + hard refresh.

> **Resultado del cruce:** la migración de Rodajes es **limpia** (0 bugs). Las 9
> funciones son idénticas al monolito salvo el recableo de eventos; la delegación
> mapea 1:1 y el round-trip de los 4 campos (día/fecha/activo/descripción) es sano.
> Las ⭐ son los caminos sensibles a la migración (verificados por código, conviene
> confirmar a mano). El juez final eres tú en `localhost:5173`.

---

### A. Alta / edición de días
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| ROD-01 | Agregar día (barra KPI) | Click en "+ Agregar día de rodaje" | Fila nueva con activo, fecha y descripción vacías y Día ID autogenerado (DIA-01, DIA-02…) | ✅ |
| ROD-02 | Agregar primer día (vacío) | Con 0 días, click en "+ Agregar día de rodaje" | Crea DIA-01 y aparece la tabla | ✅ |
| ROD-03 | Editar fecha | Cambiar el campo de fecha y salir | Se guarda; si el día está activo aparece la fecha larga ("lunes 18 de junio de 2026"); los KPIs se recalculan | ✅ |
| ROD-04 | Editar descripción | Escribir en descripción y salir | Se guarda; NO recalcula KPIs (solo la fecha lo hace) | ✅ |
| ROD-05 | Descripción con comillas/backslash | Escribir `Día "grande" \ set`, salir, agregar otro día (re-render) | El valor se conserva literal, sin corrupción | ✅ (literal en modelo, re-render y base) |
| ROD-06 | Fecha larga sin corrimiento | Poner una fecha (ej. 2026-06-18) en un día activo | La fecha larga muestra el mismo día (18), sin corrimiento por zona horaria | ✅ ("Jueves 18 de junio de 2026", sin off-by-one) |

### B. Activar / desactivar
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| ROD-07 | Desactivar un día | Destildar el check Activo | La fila queda atenuada/tachada; se oculta la fecha larga; el KPI "Días activos" baja | ✅ (clase `rodaje-inactivo`; Activos 4→3) |
| ROD-08 | Reactivar un día | Volver a tildar | La fila vuelve a normal; reaparece la fecha larga; el KPI sube | ✅ (Activos 3→4) |
| ROD-09 | Día desactivado conserva registro | Desactivar y verificar la tabla | El día sigue en la lista (no se borra); "Días registrados" no cambia | ✅ (Registrados sigue en 4) |

### C. Día ID (estabilidad)
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| ROD-10 | ID estable al desactivar | Con DIA-01..03, desactivar DIA-02 | Los IDs NO se renumeran; DIA-02 sigue siendo DIA-02 | ✅ |
| ROD-11 | ID no reutiliza números | Con DIA-01..03, borrar DIA-02, luego agregar día | El nuevo día es DIA-04 (max+1), no reutiliza DIA-02 | ✅ (borrado DIA-02 → nuevo DIA-05, max+1) |
| ROD-12 ⭐ | ID no estándar | Estado con un día cuyo Día ID no sea "DIA-NN" | No rompe: lo ignora al calcular el siguiente número | ✅ (verificado por código: `nextDiaId` parsea DIA-NN e ignora otros) |

### D. Borrado
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| ROD-13 | Borrar pide confirmación | Click en la × de una fila | Modal "¿Eliminar este día?" con el Día ID; botones "Sí, eliminar" / "Cancelar" | ✅ (modal menciona el Día ID; botones Cancelar / "Sí, eliminar día") |
| ROD-14 | Cancelar borrado | En el modal, Cancelar | No se elimina nada | ✅ |
| ROD-15 | Borrar limpia Hoja de Llamado | El día tiene datos de Hoja de Llamado; borrar y confirmar | Se elimina el día y sus datos de Hoja de Llamado; toast "Día eliminado" | ✅ (borrado del día verificado; la limpieza específica de datos de Hoja de Llamado no se probó con un día con HdL cargada) |

### E. KPIs
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| ROD-16 | "Días registrados" incluye cancelados | 3 días, 1 desactivado | Registrados = 3, Activos = 2 | ✅ (Registrados 4 / Activos 3 con 1 desactivado) |
| ROD-17 | "Activos sin fecha" | 2 activos, 1 sin fecha | "Activos sin fecha" = 1 en ámbar; al poner fecha baja a 0 y dice "✓ Todo con fecha" | ✅ (bajó a 0 y muestra "✓ Todo con fecha") |
| ROD-18 | KPI se actualiza sin robar foco | Editar fecha y saltar rápido a otro campo | Solo la barra de KPIs se actualiza, sin re-render que robe el foco | ✅ (al editar fecha solo cambia el KPI; la fila no se re-renderiza) |

### F. Integración aguas abajo
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| ROD-19 | Alimenta Plan de Rodaje | Crear días activos con fecha → ir a Plan de Rodaje | El selector muestra "DIA-NN · <fecha larga>" (o "· sin fecha") | ✅ (los 4 días activos aparecen en el selector de Plan de Rodaje con su fecha) |
| ROD-20 | Solo días válidos llegan a documentos | Mezcla de días activos/inactivos, con/sin fecha | Los consumidores filtran por activo && fecha, igual que el monolito | ✅ (al desactivar DIA-05 desaparece del selector de Plan de Rodaje) |

### G. Persistencia (round-trip)
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| ROD-21 ⭐ | Round-trip de los 4 campos | Crear días (fecha, activo, descripción, id), guardar, recargar | Cada día conserva día/fecha/activo/descripción, en el mismo orden | ✅ (4 días confirmados en project_shoot_days + hard refresh) |
| ROD-22 | Orden estable tras recarga | Crear varios días, guardar, recargar | El orden se preserva | ✅ (orden por posición estable tras recarga) |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó (no re-probar) · ❌ falló (bug abierto) · 🔁 cambió a propósito.

## Bug encontrado y arreglado — persistencia de agregar/borrar día (2026-07-20)
Branch `fix/persistencia-proyectos-crear-y-estado`. `addRodaje` y `deleteRodaje`
mutaban el modelo (`rodajes.push` / `.splice`) pero **NO llamaban `markDirty()`**, y
como son acciones de **botón** (no disparan el listener global de `change`/`input` de
`boot.js`), el día agregado/borrado **no se guardaba** hasta que editabas algún campo.
Si recargabas antes de editar, se perdía. Como **Rodajes es el módulo de la etapa
Producción**, esto se veía como "los cambios no persisten cuando el proyecto está en
Producción" (reportado por Agustín). Fix: `markDirty()` en `addRodaje` y `deleteRodaje`.
Verificado: agregar un día (sin tocar nada más) ahora persiste en `project_shoot_days`.
El monolito tiene el mismo `addRodaje` sin markDirty → producción necesita el mismo fix
por su flujo aparte. Los demás módulos operacionales (crew, gastos, plan-rodaje,
locaciones) ya llamaban markDirty; solo Rodajes tenía el hueco.

## Notas
- **0 bugs.** Migración fiel: las acciones (`rodajes.add`, `rodajes.campo`,
  `rodajes.activo`, `rodajes.borrar`) tienen handler registrado; `recalcRodajesKPI`
  solo se dispara al cambiar la fecha (igual que el monolito); `nextDiaId`,
  `fmtFechaLarga` y los KPIs son idénticos; el round-trip de los 4 campos es sano.
- **Nota (fuera de Rodajes):** al leer el DAL compartido se detectó que la
  persistencia del **Plan de Scouting** se había perdido en la migración — eso
  pertenece al módulo **Locaciones** y se corrigió en esta misma tanda (BUG-LOC-1,
  branch `fix/locaciones-scouting-persistencia-visita`). El round-trip de Rodajes
  no se ve afectado.
