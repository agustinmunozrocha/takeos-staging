# Handoff Etapa 4 — Módulos de identidad y equipo (2026-07-11)

Tanda autónoma de depuración: Base de Datos, Cotización, Crew, Cargos, Documentos.
Todo el trabajo quedó en **branches sin mergear** colgando de `etapa4-integracion`.
**Nada se mergeó, nada se pusheó, no se tocó la base de datos.** Falta tu aprobación.

## Resumen por módulo
| Módulo | Resultado | Branch |
|--------|-----------|--------|
| Base de Datos | 1 bug arreglado (Observaciones de empresa) | `fix/bd-empresa-observaciones` |
| Cotización (ofertas) | 2 bugs arreglados (resumen $0; alternativo con apóstrofo) | `fix/cotizacion-resumen-snapshot` |
| Crew | 0 bugs (migración limpia) — solo catálogo QA | `chore/qa-crew-cargos-documentos` |
| Cargos | 0 bugs (migración limpia) — solo catálogo QA | `chore/qa-crew-cargos-documentos` |
| Documentos | 0 bugs (migración limpia) — solo catálogo QA | `chore/qa-crew-cargos-documentos` |

Catálogos QA: `docs/etapa4-qa/{bd,cotizacion,crew,cargos,documentos}.md`.

## Branches abiertos (esperan tu revisión y merge)
1. **`fix/bd-empresa-observaciones`** (commit `7c8f568`) — bd.js + bd.md.
2. **`fix/cotizacion-resumen-snapshot`** (commit `299d77a`) — presupuesto-cotizacion.js + cotizacion.md.
3. **`chore/qa-crew-cargos-documentos`** — crew.md + cargos.md + documentos.md + este handoff (sin código).

## Decisiones en cola (NO cruzadas por mí)
- **Merge de los 3 branches a `etapa4-integracion`** (`--no-ff`): pendiente de tu OK.
- **Push a GitHub** (`origin etapa4-integracion`) y **force-push a staging**
  (`etapa4-integracion:main`): pendiente. No lo hice.
- **Cambios de BD**: no apliqué ninguno. Ver "Cola de BD" abajo.
- **Actualizar `_INDICE.md`**: no lo toqué (para no generar conflictos entre
  branches). Al mergear, cambiar en el índice: BD → `[bd.md]`, Cotización → catálogo
  propio `[cotizacion.md]`, y Crew/Cargos/Documentos → `[<modulo>.md]` con "0 bugs".

## Cola de BD (solo señalado — nada aplicado)
- **`companies.representante` / `companies.duenos`** deben existir en prod para que
  el guardado de empresa no falle. Ya venía en la cola del marcador (migración
  `20260710140000`, aplicada a staging, va a prod en el merge final). Afecta BD12/BD34.
- **RPC `guardar_operaciones_4e`**: confirmar que asigna `posicion` por el orden del
  array (Documentos D20). Idéntico a `main`, no es de esta migración.
- **Decisión de producto (no BD):** en la modular guardar una persona **exige correo**
  (en `main` no). Confirmar si es lo querido (BD2).

## Verificación que sí hice yo
- `node --check` en bd.js y presupuesto-cotizacion.js: OK.
- `npm run gate` (0 handlers inline · 0 identificadores libres): OK en ambos.
- Cruce de cada bug contra el monolito de `main` línea a línea.

## Pruebas que NO pude comprobar yo (requieren que las corras tú)
Ver la sección "Notas" de cada catálogo. Las prioritarias (⭐) por los arreglos:
- **BD11** — Observaciones de empresa no "revierte" al re-render.
- **C16 / C17** — chips de versión y comparador muestran el valor real (no $0).
- **C13** — presupuesto alternativo con sub-sección con apóstrofo (`D'Arte`) agrega/edita/borra.
El resto de cada catálogo es cobertura de regresión para cuando pruebes cada módulo.
