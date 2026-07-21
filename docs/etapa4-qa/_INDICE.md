# Índice QA — Etapa 4

Tablero de cobertura de pruebas de la app modular. Un catálogo (`<modulo>.md`) se
crea en Modo QA cuando Agustín pide "dame pruebas para testear X".

**Leyenda cobertura:** ⬜ sin catálogo aún · 🔄 en progreso · ✅ todo aprobado.

| Módulo | Archivo | Catálogo | Cobertura |
|--------|---------|----------|-----------|
| Presupuesto (grilla) | `presupuesto-cotizacion.js` | [presupuesto.md](presupuesto.md) | ✅ 32/36 ✅ · 4 🔁 · 0 ❌ (todo cubierto) |
| Cotización (ofertas) | `presupuesto-cotizacion.js` · renderCotizacion | [cotizacion.md](cotizacion.md) | ✅ 24/25 ✅ · 1 🔁 (BUG-COT-1/2 arreglados · C1–C18/C22–C25 QA automatizado 14-jul, 0 bugs · C19/C21 por Agustín · C20 🔁 Carta/Manifiesto desconectadas) |
| Gastos | `gastos.js` | [gastos.md](gastos.md) | ✅ 41/42 ✅ · 1 🔁 · 0 bugs (CERRADO 14-jul; QA automatizado + Agustín; buckets de Storage staging resueltos) |
| Crew | `crew.js` | [crew.md](crew.md) | 🔄 8/18 ✅ · 0 bugs (QA auto 20-jul; 5 pend·espejo presupuesto, 3 👁 PDF) |
| Cargos | `cargos.js` | [cargos.md](cargos.md) | 🔄 16/17 ✅ · 0 bugs (QA auto 20-jul; solo falta CG16·tope de 12) |
| Rodajes | `rodajes.js` | [rodajes.md](rodajes.md) | ✅ 22/22 ✅ · 0 bugs (QA auto 20-jul, cerrado) |
| Plan de rodaje | `plan-rodaje.js` | [plan-rodaje.md](plan-rodaje.md) | ✅ 50/50 ✅ (0 bugs, cerrado) |
| Hoja de Llamado | `plan-rodaje.js` · renderHojaLlamado | [hoja-llamado.md](hoja-llamado.md) | ✅ 33/33 ✅ (0 bugs, cerrado) |
| Kanban | `kanban.js` | — | ⬜ |
| Tareas | `tareas.js` | [tareas.md](tareas.md) | 🔄 12/13 ✅ · 0 bugs (QA auto 20-jul; TM13 permiso·Invitado) |
| Locaciones | `locaciones.js` | [locaciones.md](locaciones.md) | ✅ 25/25 ✅ (0 bugs abiertos; LOC-16 arreglado) |
| Documentos | `documentos.js` | [documentos.md](documentos.md) | 🔄 13/20 ✅ · 0 bugs (QA auto 20-jul; D8 tope, D9-D13/D15 infra/dnd) |
| Legal | `legal.js` | — | ⬜ |
| Base de datos | `bd.js` / `bd-excel.js` | [bd.md](bd.md) | 🔄 14/35 ✅ · 0 bugs (QA auto 20-jul; permisos BD3/BD4 verificados; resto Excel/detalles → sesión dedicada) |
| Buscador | `buscador.js` | — | ⬜ |
| Calculadoras | `calculadoras.js` | [calculadoras.md](calculadoras.md) | 🔄 4/6 ✅ · 0 bugs (QA auto 20-jul; calc tributaria exacta; crc/hec por código·preproducción) |
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
