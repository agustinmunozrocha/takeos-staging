# Progreso corrida nocturna — QA módulos con catálogo

**Inicio:** 2026-07-20 (sesión Chrome MCP, modo liviano)
**Rama:** etapa4-integracion · **Login:** perfil@administrador.com

## Orden y estado
| # | Módulo | Pruebas | Estado |
|---|--------|---------|--------|
| 1 | Cargos | 17 | ✅ 15/17 · 0 bugs (CG16 incompleto·tope, CG17 pendiente·permiso) |
| 2 | Crew | 18 | ✅ 8/18 · 0 bugs (5 pend·espejo presupuesto, 2 incompl·proyecto vacío, 3 👁 PDF) |
| 3 | Rodajes | 22 | ✅ 22/22 · 0 bugs (ROD-12 por código, ROD-15 con nota HdL) |
| 4 | Documentos | 20 | ✅ 13/20 · 0 bugs (D8 incompl, D9-D13/D15 pend·infra/dnd) |
| 5 | Base de datos | 34 | ✅ 12/35 · 0 bugs (resto: Excel/permisos/detalles → sesión dedicada) |

## Reglas de esta corrida
- Solo corro las 🤖 (técnicas); las 👁 (PDF/visual) van al reporte final para Agustín.
- Bug real → ❌ en catálogo + reproducción; NO se arregla.
- Nada de push/merge/migraciones. Commit local del registro por módulo.
- Hard refresh en toda prueba de guardar/editar/borrar.

## Bitácora
- Preparación OK: caffeinate, dev server 200, guard de impresión, login administrador.
- **Cargos (2026-07-20):** 15/17 ✅, 0 bugs. Persistencia CG13 confirmada por consulta
  a la base (project_cargos) + hard refresh. Proyecto de prueba P-1784507176223
  ("QA Plan de Rodaje") quedó limpio (0 cargos). Residuo menor: infoProyecto.director/PE
  quedaron con "Juan de la Cuadra" (la derivación no borra el valor previo al quitar el
  cargo, por diseño). CG16 incompleto (requiere 12 colaboradores). CG17 pendiente
  (login con otro perfil, va a la pasada de permisos junto con los demás módulos).
- **Crew (2026-07-20):** 8/18 ✅, 0 bugs. Externos CRUD + persistencia y transporte
  confirmados en la base (project_crew_extra / project_external_crew). Espejo del
  Presupuesto (CR1-3,6,7) pendiente: el proyecto QA está en "solo cotización" y no
  expone los controles de rodaje. Datos de prueba limpiados.
- **Rodajes (2026-07-20):** 22/22 ✅, 0 bugs. Alta/edición/activar/borrar/KPIs/
  persistencia confirmados (project_shoot_days + hard refresh). Residuo: el proyecto
  QA quedó con 1 día (DIA-01) — el DIA-02 original se consumió probando ROD-11 (borrado
  sin reutilización de ID). No afecta a plan-rodaje/hoja-llamado (QA ya cerrado).
- **Base de datos (2026-07-20):** 12/35 ✅, 0 bugs. CRUD de persona/empresa/talento/
  locación + dedup + bloqueo sin email + código banco + persistencia (contacts /
  contact_bank_accounts / companies incl. representante/duenos JSONB de la migración
  20260710140000) confirmada en la base + hard refresh. Resto (Excel BD25-31, permisos
  BD3/BD4, detalles BD5/6/8/13-18/20/21/24/33, archivar BD35) → sesión dedicada. Quedan
  4 registros "QA Test" en la BD de staging (desechables).

## Estado final de la corrida
- **5 módulos corridos, 0 bugs en total.** Cargos 15/17, Crew 8/18, Rodajes 22/22,
  Documentos 13/20, BD 12/35. Commits locales: 11e74ee, 7ae05ce, 498a64a, 33afb48
  (+ el de BD). Nada pusheado (espera OK de Agustín).
