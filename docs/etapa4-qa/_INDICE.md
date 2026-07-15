# Índice QA — Etapa 4

Tablero de cobertura de pruebas de la app modular. Un catálogo (`<modulo>.md`) se
crea en Modo QA cuando Agustín pide "dame pruebas para testear X".

**Leyenda cobertura:** ⬜ sin catálogo aún · 🔄 en progreso · ✅ todo aprobado.

| Módulo | Archivo | Catálogo | Cobertura |
|--------|---------|----------|-----------|
| Presupuesto (grilla) | `presupuesto-cotizacion.js` | [presupuesto.md](presupuesto.md) | ✅ 32/36 ✅ · 4 🔁 · 0 ❌ (todo cubierto) |
| Cotización (ofertas) | `presupuesto-cotizacion.js` · renderCotizacion | [cotizacion.md](cotizacion.md) | ✅ 24/25 ✅ · 1 🔁 (BUG-COT-1/2 arreglados · C1–C18/C22–C25 QA automatizado 14-jul, 0 bugs · C19/C21 por Agustín · C20 🔁 Carta/Manifiesto desconectadas) |
| Gastos | `gastos.js` | [gastos.md](gastos.md) | ✅ 41/42 ✅ · 1 🔁 · 0 bugs (CERRADO 14-jul; QA automatizado + Agustín; buckets de Storage staging resueltos) |
| Crew | `crew.js` | [crew.md](crew.md) | 🔄 0/18 (limpio, 0 bugs) |
| Cargos | `cargos.js` | [cargos.md](cargos.md) | 🔄 0/17 (limpio, 0 bugs) |
| Rodajes | `rodajes.js` | [rodajes.md](rodajes.md) | 🔄 0/22 (limpio, 0 bugs) |
| Plan de rodaje | `plan-rodaje.js` | [plan-rodaje.md](plan-rodaje.md) | 🔄 0/50 (limpio, 0 bugs) |
| Hoja de Llamado | `plan-rodaje.js` · renderHojaLlamado | [hoja-llamado.md](hoja-llamado.md) | 🔄 1/33 ✅ (BUG-HL-1 arreglado) |
| Kanban | `kanban.js` | — | ⬜ |
| Tareas | `tareas.js` | — | ⬜ |
| Locaciones | `locaciones.js` | [locaciones.md](locaciones.md) | 🔄 4/25 ✅ (BUG-LOC-1/2 arreglados) |
| Documentos | `documentos.js` | [documentos.md](documentos.md) | 🔄 0/20 (limpio, 0 bugs) |
| Legal | `legal.js` | — | ⬜ |
| Base de datos | `bd.js` / `bd-excel.js` | [bd.md](bd.md) | 🔄 1/35 ✅ (BUG-BD-1 arreglado) |
| Buscador | `buscador.js` | — | ⬜ |
| Calculadoras | `calculadoras.js` | — | ⬜ |
| Configuración | `config.js` | — | ⬜ |
| Admin | `admin.js` | — | ⬜ |
| Espacio | `espacio.js` | — | ⬜ |
| Info proyecto | `info-proyecto.js` | [info-proyecto.md](info-proyecto.md) | ✅ 19/19 ✅ · Grupo 1 y 2 cerrados (2 pend. BD) |
| Invitaciones | `invitaciones.js` | — | ⬜ |
| Notificaciones | `notificaciones.js` | — | ⬜ |
| Perfil / Onboarding | `perfil-onboarding.js` | — | ⬜ |
| Plan / Límites | `plan-limites.js` | — | ⬜ |

Al crear un catálogo, cambia el "—" por `[<modulo>.md](<modulo>.md)` y actualiza
la cobertura.
