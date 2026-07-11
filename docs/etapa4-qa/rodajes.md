# QA · Rodajes (`frontend/src/modules/rodajes.js`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
Módulos de apoyo: `dal.js` (round-trip vía `project_shoot_days` / RPC 4a),
`plan-rodaje.js` y `hoja-llamado` (consumen los días), `lib/delegacion.js`.
Cobertura: 0/22 ✅ (catálogo nuevo).

> **Resultado del cruce:** la migración de Rodajes es **limpia** (0 bugs). Las 9
> funciones son idénticas al monolito salvo el recableo de eventos; la delegación
> mapea 1:1 y el round-trip de los 4 campos (día/fecha/activo/descripción) es sano.
> Las ⭐ son los caminos sensibles a la migración (verificados por código, conviene
> confirmar a mano). El juez final eres tú en `localhost:5173`.

---

### A. Alta / edición de días
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| ROD-01 | Agregar día (barra KPI) | Click en "+ Agregar día de rodaje" | Fila nueva con activo, fecha y descripción vacías y Día ID autogenerado (DIA-01, DIA-02…) | ⬜ |
| ROD-02 | Agregar primer día (vacío) | Con 0 días, click en "+ Agregar día de rodaje" | Crea DIA-01 y aparece la tabla | ⬜ |
| ROD-03 | Editar fecha | Cambiar el campo de fecha y salir | Se guarda; si el día está activo aparece la fecha larga ("lunes 18 de junio de 2026"); los KPIs se recalculan | ⬜ |
| ROD-04 | Editar descripción | Escribir en descripción y salir | Se guarda; NO recalcula KPIs (solo la fecha lo hace) | ⬜ |
| ROD-05 | Descripción con comillas/backslash | Escribir `Día "grande" \ set`, salir, agregar otro día (re-render) | El valor se conserva literal, sin corrupción | ⬜ |
| ROD-06 | Fecha larga sin corrimiento | Poner una fecha (ej. 2026-06-18) en un día activo | La fecha larga muestra el mismo día (18), sin corrimiento por zona horaria | ⬜ |

### B. Activar / desactivar
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| ROD-07 | Desactivar un día | Destildar el check Activo | La fila queda atenuada/tachada; se oculta la fecha larga; el KPI "Días activos" baja | ⬜ |
| ROD-08 | Reactivar un día | Volver a tildar | La fila vuelve a normal; reaparece la fecha larga; el KPI sube | ⬜ |
| ROD-09 | Día desactivado conserva registro | Desactivar y verificar la tabla | El día sigue en la lista (no se borra); "Días registrados" no cambia | ⬜ |

### C. Día ID (estabilidad)
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| ROD-10 | ID estable al desactivar | Con DIA-01..03, desactivar DIA-02 | Los IDs NO se renumeran; DIA-02 sigue siendo DIA-02 | ⬜ |
| ROD-11 | ID no reutiliza números | Con DIA-01..03, borrar DIA-02, luego agregar día | El nuevo día es DIA-04 (max+1), no reutiliza DIA-02 | ⬜ |
| ROD-12 ⭐ | ID no estándar | Estado con un día cuyo Día ID no sea "DIA-NN" | No rompe: lo ignora al calcular el siguiente número | ⬜ |

### D. Borrado
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| ROD-13 | Borrar pide confirmación | Click en la × de una fila | Modal "¿Eliminar este día?" con el Día ID; botones "Sí, eliminar" / "Cancelar" | ⬜ |
| ROD-14 | Cancelar borrado | En el modal, Cancelar | No se elimina nada | ⬜ |
| ROD-15 | Borrar limpia Hoja de Llamado | El día tiene datos de Hoja de Llamado; borrar y confirmar | Se elimina el día y sus datos de Hoja de Llamado; toast "Día eliminado" | ⬜ |

### E. KPIs
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| ROD-16 | "Días registrados" incluye cancelados | 3 días, 1 desactivado | Registrados = 3, Activos = 2 | ⬜ |
| ROD-17 | "Activos sin fecha" | 2 activos, 1 sin fecha | "Activos sin fecha" = 1 en ámbar; al poner fecha baja a 0 y dice "✓ Todo con fecha" | ⬜ |
| ROD-18 | KPI se actualiza sin robar foco | Editar fecha y saltar rápido a otro campo | Solo la barra de KPIs se actualiza, sin re-render que robe el foco | ⬜ |

### F. Integración aguas abajo
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| ROD-19 | Alimenta Plan de Rodaje | Crear días activos con fecha → ir a Plan de Rodaje | El selector muestra "DIA-NN · <fecha larga>" (o "· sin fecha") | ⬜ |
| ROD-20 | Solo días válidos llegan a documentos | Mezcla de días activos/inactivos, con/sin fecha | Los consumidores filtran por activo && fecha, igual que el monolito | ⬜ |

### G. Persistencia (round-trip)
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| ROD-21 ⭐ | Round-trip de los 4 campos | Crear días (fecha, activo, descripción, id), guardar, recargar | Cada día conserva día/fecha/activo/descripción, en el mismo orden | ⬜ |
| ROD-22 | Orden estable tras recarga | Crear varios días, guardar, recargar | El orden se preserva | ⬜ |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó (no re-probar) · ❌ falló (bug abierto) · 🔁 cambió a propósito.

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
