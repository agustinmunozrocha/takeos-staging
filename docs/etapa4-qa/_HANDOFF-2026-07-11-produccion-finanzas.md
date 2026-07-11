# Handoff Etapa 4 — Módulos de producción y finanzas (2026-07-11, tanda 2)

Segunda tanda autónoma: Rodajes, Locaciones, Hoja de Llamado, Plan de Rodaje, Gastos.
(Omitidos por pedido: Legal, Notificaciones.) Todo quedó en **branches sin mergear**
colgando de `etapa4-integracion`. **Nada se mergeó, nada se pusheó, no se aplicó
ningún cambio de base de datos.** Falta tu aprobación.

## Resumen por módulo
| Módulo | Resultado | Branch |
|--------|-----------|--------|
| Rodajes | 0 bugs (limpio) — solo catálogo | `chore/qa-rodajes-plan-rodaje` |
| Plan de Rodaje | 0 bugs (limpio) — solo catálogo | `chore/qa-rodajes-plan-rodaje` |
| Locaciones | 2 bugs arreglados (LOC-1 🔴, LOC-2 🟡) | `fix/locaciones-scouting-persistencia-visita` |
| Hoja de Llamado | 1 bug arreglado (HL-1 🟡) | `fix/hoja-llamado-crew-override-escape` |
| Gastos | 1 bug arreglado (GAS-1 🔴) | `fix/gastos-editar-borrar-presupuesto` |

## Branches abiertos de ESTA tanda (esperan tu revisión y merge)
1. **`fix/gastos-editar-borrar-presupuesto`** (`e84ef8a`) — gastos.js + gastos.md.
2. **`fix/locaciones-scouting-persistencia-visita`** (`acb61f3`) — dal.js + locaciones.js + locaciones.md.
3. **`fix/hoja-llamado-crew-override-escape`** (`902d3f5`) — plan-rodaje.js + hoja-llamado.md.
4. **`chore/qa-rodajes-plan-rodaje`** — rodajes.md + plan-rodaje.md + este handoff + `_PRUEBAS-PENDIENTES.md` (sin código).

## Branches abiertos de la TANDA 1 (siguen esperando, sin tocar)
- `fix/bd-empresa-observaciones` (`7c8f568`)
- `fix/cotizacion-resumen-snapshot` (`299d77a`)
- `chore/qa-crew-cargos-documentos` (`cf2b70f`)

## Decisiones en cola (NO cruzadas por mí)
- **Merge de los 7 branches a `etapa4-integracion`** (`--no-ff`): pendiente de tu OK.
- **Push a GitHub** (`origin etapa4-integracion`) y **force-push a staging**: pendiente.
- **Base de datos**: no apliqué nada. Ver "Cola de BD".
- **`_INDICE.md`**: no lo toqué (para no generar conflictos entre branches); al mergear,
  agrega las filas de los 8 catálogos nuevos.

## Cola de BD (solo señalado — nada aplicado)
- **LOC-1 — SIN pendiente de BD.** Verifiqué por inspección de solo lectura que
  **staging** (`jovroab…`) ya tiene la tabla `project_scouting` y la RPC
  `guardar_operaciones_4a` con soporte de `scouting`; producción también (main la usa).
  El fix es frontend puro y seguro. *Dato importante:* la RPC borra `project_scouting`
  si no le mandan `scouting` → **hoy** la modular (sin el fix) puede estar borrando el
  scouting en la nube en cada guardado. El fix detiene esa pérdida.
- **Gastos (idénticos a main, no regresiones — confirmar si se quieren cerrar en BD):**
  - `ppPagos` (fecha de pago de prontos pagos) no se persiste a la nube.
  - `gasto_comments` (hilo de "Observar"): confirmar que la RPC lo preserva cuando la
    clave viene ausente.
  - Copy obsoleto de la caja de producción ("no persiste"): ya persiste (PR8); alinear texto.

## Verificación que sí hice yo
- Análisis con verificación adversarial de cada hallazgo (workflow), y **re-verificación
  propia** de los 4 bugs contra el código real del monolito antes de editar.
- `node --check` y `npm run gate` (0 handlers inline · 0 identificadores libres): OK en
  todos los archivos tocados (gastos.js, dal.js, locaciones.js, plan-rodaje.js).

## Pruebas que NO pude comprobar yo (para ti)
Todo lo que necesita UI real, Supabase real o archivos/PDF: está en
**`_PRUEBAS-PENDIENTES.md`** (runbook consolidado de las dos tandas) y en la sección
"Notas / requieren humano" de cada catálogo.
