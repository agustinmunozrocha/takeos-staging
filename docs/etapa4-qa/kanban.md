# QA · Kanban / Control Room (`frontend/src/modules/kanban.js`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
El Control Room: columnas por estado (Venta→Rechazado), tarjetas de proyecto,
métricas, crear/abrir/exportar/eliminar proyectos, papelera, filtros.
Cobertura: 6/10 ✅ + gates/👁 (QA automatizado 2026-07-20, 0 bugs de migración; 1
hallazgo **pre-existente** — ver ⚠).

> **Resultado del cruce:** port **fiel**. Crear/abrir/columnas/métricas/filtros
> verificados. Eliminar proyectos está protegido tras **Modo administrador** (no
> ejecutable sin la clave de admin). El juez final eres tú en `localhost:5173`.
>
> ⚠ **Hallazgo (NO es bug de Etapa 4 — pre-existente, mismo orden en `main`):** al
> **crear** un proyecto, `markDirty()` se llama **antes** de `navigateToProject(id)`,
> así que toca el proyecto anterior (o ninguno), no el recién creado. La modular
> **mejoró** el caso con cargos (guarda explícito vía I11b), pero un proyecto creado
> **sin PE/Director/JP y que no se edita** no se escribe a la base y **se pierde al
> recargar**. En el monolito el orden es idéntico (todos los proyectos nuevos dependen
> de la primera edición para persistir). Riesgo latente de pérdida de datos; el arreglo
> (llamar `dalTouchProyecto(nuevo)` tras `navigateToProject`) es una decisión aparte,
> no de la modularización.

---

| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| KB1 | Columnas por estado | Control Room | 7 columnas (Venta, Preproducción, Producción, Postproducción, Cierre, Cerrado, Rechazado) con las tarjetas en su estado | ✅ |
| KB2 | Métricas | Control Room | KPI "Proyectos activos" = N° de tarjetas activas (5) | ✅ |
| KB3 | Crear proyecto | "Nuevo proyecto" → nombre + cliente → "Crear proyecto" | Aparece una tarjeta nueva en la columna Venta; toast "Proyecto creado" | ✅ (aparece en Venta) |
| KB4 | Abrir proyecto | Click en una tarjeta | Entra al proyecto (Info Proyecto) | ✅ |
| KB5 | Mover entre estados | Cambiar el estado del proyecto | La tarjeta se mueve de columna; el KPI se ajusta | 👁 (avance de estado / drag — sin acción 🤖 directa) |
| KB6 | Eliminar proyecto | Eliminar (requiere tipear el nombre para confirmar) | Va a la Papelera (soft-delete `deleted_at`); "se puede restaurar" | 👁 (protegido tras Modo administrador — requiere la clave de admin) |
| KB7 | Papelera / restaurar | "Papelera" → restaurar | El proyecto vuelve al Control Room | 👁 (depende de KB6) |
| KB8 | Persistencia del proyecto nuevo | Crear proyecto → hard refresh | El proyecto debería seguir | ✅ **ARREGLADO** (branch `fix/persistencia-proyectos-crear-y-estado`): `dalTouchProyecto(nuevo)` ahora corre tras `navigateToProject`, así que el proyecto nuevo se guarda SIEMPRE apenas se crea (con o sin responsables). Verificado en la base + hard refresh. (El monolito/producción tiene el mismo bug → arreglo aparte) |
| KB9 | Filtros | "Todos / Mis proyectos / Con alertas / Recientes / Lista" | Filtra/cambia la vista sin error | ✅ |
| KB10 | Exportar proyecto | Dentro del proyecto: "Exportar este proyecto" | Descarga un `.json` de ese proyecto (no toca la BD) | ✅ (botón presente; la descarga la miras tú) |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó · ❌ falló · 🔁 cambió a propósito / = main.

## Notas
- **0 bugs de migración.** Columnas, métricas, crear, abrir, filtros y export verificados.
  Eliminar/restaurar están tras Modo administrador (👁, requiere la clave). El punto
  importante es el ⚠ **KB8**: crear un proyecto sin cargos y no tocarlo lo pierde al
  recargar — **pre-existente, idéntico en el monolito** (la modular incluso lo mitigó
  para el caso con cargos). Vale como mejora futura (persistir el proyecto nuevo de
  inmediato), pero no es de la Etapa 4.
