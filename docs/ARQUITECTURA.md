# TakeOS — Informe Técnico de Arquitectura

**Fecha:** 6 de julio de 2026 · **Base de medición:** rama `etapa4-integracion` @ `4c8067b` · **Audiencia:** ingeniería.
**Base de medición de los 17 capítulos:** `4c8067b` — un snapshot fechado; **no se reescriben tras correcciones.** El estado vigente es esta portada + el addendum de abajo.

**Metodología.** Este informe fue producido por un análisis multi-agente sobre el repositorio completo: 11 analistas paralelos (uno por subsistema), un crítico de completitud que verificó ~15 cifras por muestreo contra el repo y detectó contradicciones entre secciones, y 6 analistas de seguimiento que cerraron los huecos y **adjudicaron** las contradicciones (incluida la inspección directa del bundle minificado de `dist/`). Total: 18 agentes, 711 operaciones de lectura, ~2,7 M tokens de análisis. **Toda cifra fue contada con un comando citado, jamás estimada.** Donde dos capítulos difieren en una cifra, gobierna el [censo canónico (cap. 14)](arquitectura/14-censo-canonico.md); donde afirman cosas incompatibles, gobierna la [adjudicación (cap. 13)](arquitectura/13-bugs-adjudicados.md).

> ### ⚑ Addendum — FASE HF (6-jul, merge `e855ec2`): los 4 bugs de §3 y el gating de §4-P0 están RESUELTOS
> Los capítulos abajo describen el árbol `4c8067b` (pre-fix) y **se conservan intactos como registro**. Delta aplicado tras el informe:
> - **Bug 1** (detalle de locación muerto) → `_bdPuedeArchivar` exportado en bd.js + importado en locaciones.js (`f6586f6`).
> - **Bug 2** (47 `on*=` drag&drop + export Chipax muertos bajo CSP) → los 47 migrados a delegación en 10 familias; `delegacion.js` amplió tipos (dragstart/dragend/mouseup) y ahora **asciende** por ancestros, restaurando el burbujeo nativo (`5028bf6`+`d47aa6a`). **⇒ los capítulos 03, 07, 08, 15, 16 que declaran «DnD muerto bajo CSP» quedan superseded.**
> - **Bug 3** (banner de cookies nunca corría) → `gancho('_pdCookiesBootCheck')` en boot.js (`f6586f6`).
> - **Bug 4** (mina TDZ en `state.js:54`) → RHS `window.USUARIO_ACTUAL` (`f6586f6`).
> - **P0-2** (gating de permisos UI muerto, selectores `[onclick*=]` huérfanos) → `[data-accion]` (`f6586f6`).
> - **Recomendación R2 / hallazgo cap. 11-H10** (sin infraestructura de gate en el repo) → **`npm run gate`** versionado: `check-inline-handlers.mjs` (cero `on*=`) + `check-free-idents.mjs` (cero identificadores libres, semántica ESLint `no-undef`, sin dependencias). Validado adversarialmente: caza los bugs 1 y 3 en `5e1d621` (`17595f8`).
>
> **Sigue abierto** (no tocado por HF): todos los hallazgos P1 de seguridad (RLS soft-delete, aislamiento de externos), P2 (tests/lint completos, red async, comentarios fósiles, changelog en index.html, airbag, rendimiento, a11y, lock-in) y la deuda de las 11 guardas `typeof` sobre bridges window. Ver §4–§5.

---

## 1 · Qué es TakeOS, técnicamente

SaaS de gestión de producción audiovisual (presupuestos, cotizaciones, plan de rodaje, gastos/CFO, BD de contactos, locaciones, legal, notificaciones) construido como **SPA vanilla JavaScript con ES Modules, sin framework**. Stack completo:

| Capa | Tecnología | Cifras |
|---|---|---|
| Frontend | Vanilla JS (ES2020+), ESM estático, cero framework | 40 archivos `.js`, 25.327 líneas en `frontend/src/` |
| Shell | `frontend/index.html` (DOM estático: sidebar, contenedores, modales base) | 1.556 líneas (≈79 % es un changelog en comentario — ver hallazgo P2-6) |
| Estilos | `frontend/src/styles.css` + `style=` inline en HTML generado | 3.230 líneas CSS; ~1.165 `style=` en builders JS |
| Build | Vite 7 / Rollup, chunk único IIFE-like ESM | `dist/assets/index-*.js` ≈ 1,0 MB minificado |
| Vendor | 2 CDN runtime: `xlsx@0.18.5` (jsdelivr, eager) + `@supabase/supabase-js@2` (jsdelivr); `exceljs@4.4.0` lazy (cdnjs) | sin SRI, supabase-js con major flotante |
| Backend | Supabase (PostgreSQL + PostgREST + GoTrue + Storage + Realtime) | 14 migraciones, 9.349 líneas SQL, 72 tablas, **157 policies RLS**, 76 funciones `SECURITY DEFINER`, familia de RPC `guardar_*` (8) |
| Hosting | GitHub Pages vía `.github/workflows/deploy.yml` (build por push a `main` del repo staging) | dos remotos, ver §2 |
| Auth/roles | GoTrue + `memberships` con perfiles numerados; matriz de niveles `authNivel(permiso) → 'none'/'V'/'E'` | gates en cliente (UX) + RLS/RPC en servidor (autoridad) |

**Los dos remotos NO son el mismo software** (hallazgo estructural del cap. 1): `origin/main` (`fa008d5`) sirve **el monolito pre-modularización** — un `index.html` de raíz con 28.649 líneas, 549 handlers inline y CSP con `unsafe-inline`. `staging/main` (`4c8067b`) sirve la arquitectura descrita en este informe. Deriva: 189 commits. Todo lo que sigue describe la rama modular.

---

## 2 · La arquitectura: tres mecanismos de intercomunicación

El sistema resuelve toda comunicación entre módulos por exactamente tres canales, elegidos por **dirección de la arista y momento de uso**. Los números son del censo canónico (capa "call-sites ejecutables", comentarios y strings enmascarados con lexer).

### 2.1 Imports ESM — dependencias hacia abajo (parse-time)

**365 declaraciones `import` = 364 aristas únicas** (un solo duplicado: `presupuesto-cotizacion.js:6` y `:12` → `lib/state.js`). Cero `import()` dinámicos, cero re-exports `export … from`. Distribución por zonas:

```
modules → lib      189      main.js → modules   25
modules → modules  101      main.js → lib       11
lib     → lib       31      lib     → modules    7   (las 7 desde lib/boot.js)
```

`frontend/src/main.js` (50 líneas) es el manifiesto: 11 entradas de `lib/` + 25 módulos, con `boot.js` como último import. El **orden efectivo de evaluación ≠ orden del manifiesto**: los imports internos adelantan la evaluación (p. ej. `boot.js` evalúa en la posición #26, arrastrado por `locaciones.js:19`, no en su posición #36 del manifiesto). El grafo tiene **una SCC de 19 módulos** (48 % de los nodos, 88 aristas internas) que hoy es benigna porque ningún binding intra-ciclo se usa en tiempo de evaluación (verificado por AST) — pero ese invariante **no tiene compuerta estática** (ver recomendación R2).

### 2.2 Delegación de eventos — UI → código (runtime, vía DOM)

`lib/delegacion.js` (60 líneas): **un** listener por tipo de evento a nivel `document` (11 tipos en burbuja + `focus`/`blur` en captura), despacho por `data-accion="ns.nombre"` + `data-args` (JSON) + `data-on`. Firma universal de toda acción: `(args, el, ev)`. Los módulos registran con `registrarAcciones(ns, mapa)` y el HTML generado emite atributos con `accionHTML(accion, ...args, {on})`.

**Censo:** 25 llamadas a `registrarAcciones` → **24 namespaces → 364 acciones registradas**. Referencias: 373 call-sites de `accionHTML` + 424 `data-accion` literales en strings + 31 en `index.html` = 828 referencias, todas estáticas (cero nombres interpolados). **Invariante central verificado: biyección exacta** — 364 registradas ≡ 364 referenciadas, 0 huérfanas en cualquiera de las dos direcciones.

| ns | # | ns | # | ns | # | ns | # |
|---|---|---|---|---|---|---|---|
| `go` (gastos) | 50 | `bd` | 40 | `loc` | 37 | `ntf` | 32 |
| `lgl` | 27 | `pre` (presupuesto) | 23 | `calc` | 17 | `tm` (tareas) | 16 |
| `app` | 15 | `cfg` | 14 | `cargo` | 13 | `info` | 13 |
| `ui` | 11 | `esp` | 11 | `crew` | 10 | `pr` (plan) | 9 |
| `doc` | 7 | `kanban` | 6 | `inv` | 4 | `rodajes` | 4 |
| `snap` | 2 | `boot` | 1 | `buscador` | 1 | `plan` | 1 |

Encima de esto hay **despachadores de segundo nivel** (`cfg.fn`, `pr.d`, `pre.d`): la acción lleva el nombre de función como primer arg y se resuelve contra un **mapa local perezoso** (thunks, jamás referencias directas — lección de orden de evaluación), con centinelas runtime `§v§`/`§c§`/`§el§`/`§ev§` que se sustituyen por `el.value`/`el.checked`/elemento/evento al despachar.

### 2.3 Ganchos — dependencias hacia arriba (inversión de control)

`lib/ganchos.js` (34 líneas): registro global `define(nombre, fn)` (corre al eval del productor tardío) / `gancho(nombre)` (invocador perezoso) / `valor(nombre)` (no-funciones). Un nombre sin definir **grita en consola con su nombre** — nunca falla en silencio. Se usa cuando la arista va de un módulo temprano a uno tardío y un import crearía ciclo ESM.

**Censo:** 108 nombres definidos (cada uno exactamente una vez) · 105 consumidos (102 vía `gancho`, 3 vía `valor`) · **0 consumidos sin define** (compuerta) · 3 defines sin consumidor. Como aristas: **57 pares únicos consumidor~>productor**, de los cuales **44 tienen el import reverso** (el productor importa al consumidor: la inversión es real — sin gancho habría ciclo) y 27 son `lib ~> modules`. Top consumidores: `presupuesto-cotizacion.js` (46), `boot.js` (22), `dal.js` (20), `ui.js` (19), `nav.js` (17).

### 2.4 La regla de decisión

```
¿El destino evalúa ANTES que yo y no me importa?   → import ESM
¿El destino evalúa DESPUÉS o me importa (ciclo)?   → gancho (define en el productor)
¿La invocación nace de un click/input del usuario? → acción delegada (data-accion)
¿Estado global compartido?                          → binding de state.js/rates.js + setter
```

### 2.5 Estado con dueños

`lib/state.js` (246 líneas) posee el estado global: `STATE`, `PROJECTS`, `TRASH`, stores de BD (`BD_CONTACTOS`, `BD_EMPRESAS(_BYID)`, …), `ORG_ID`, flags `*_SOURCE`, perfil/acceso — con **setters exportados como única vía de escritura** (invariante verificado por grep: cero asignaciones directas fuera del dueño). `lib/rates.js` posee las 6 tasas tributarias (pobladas por `dalBootTaxRates` desde la tabla `tax_rates`). `lib/catalogos.js` las constantes compartidas sin ciclo. El residuo `window` quedó en **73 asignaciones sobre 68 propiedades propias, de las cuales 65 son solo-escritura** (API de consola/legado sin lector interno); las 3 con lectura interna real: `_ORG_EPOCA` (época multi-org), `__TAKEOS_USER`, `_persisResetOrg`.

### 2.6 Persistencia y multi-tenancy

Doble capa: **Supabase como fuente de verdad** (dal.js, 1.899 líneas: familia `dalGuardar*` con debounces de 900 ms por entidad, `guardar_proyecto` como RPC atómico con versionado optimista de cabecera+presupuesto y señal `TAKEOS_CONFLICT`) + **localStorage como capa auxiliar** (autosave 1,5–2 s, snapshots, undo ⌘Z por stringify de proyecto). El cambio de organización (`_setOrgActiva`, boot.js) ejecuta un reset total (stores + flags→'pending' + vista→Control Room + timers) gobernado por la **época** (`_ORG_EPOCA`): todo trabajo async en vuelo compara época tras cada `await` y aborta si la organización cambió; el guardado pendiente se rescata con flush previo al reset (la RPC resuelve la organización en servidor — imposible cruzar datos).

### 2.7 Seguridad

CSP por `<meta>` (index.html:35): `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com` — **sin `unsafe-inline` en script-src**: el navegador rechaza todo JS inline, propio o inyectado. `style-src` conserva `unsafe-inline` (deuda dimensionada, "proyecto S"). El cliente sanea con `escapeHtml` (619 call-sites) y `safeUrl`. La autoridad real de acceso es RLS en servidor (157 policies + RPC `SECURITY DEFINER` con `rpc_assert_nivel`); los gates del cliente (`authNivel`, `applyModuleReadonly`) son UX. Huecos conocidos: sin SRI en CDNs, `frame-ancestors` inaplicable en GitHub Pages, allowlist de CDN amplia, y los hallazgos P1 de abajo.

---

## 3 · Los 4 bugs funcionales encontrados (adjudicados contra dist/) — ✅ los 4 RESUELTOS en FASE HF (`e855ec2`)

El análisis encontró y **verificó contra el bundle minificado** cuatro regresiones. Las cuatro vivían en dev/dist/staging; **ninguna existía en producción real** (`origin/main` = monolito). Detalle completo con evidencia: [cap. 13](arquitectura/13-bugs-adjudicados.md). Causa raíz común: **identificadores libres** — legales al parsear, invisibles para `node --check`, Rollup y las compuertas de imports/ganchos; solo detonan en runtime. La minificación de `vite build` renombra las declaraciones top-level y deja el identificador libre textual, así que "Rollup lo aplana y funciona" es **falso** en este artefacto. **Reparados el 6-jul (columna "Fix" abajo); `npm run gate` impide su reaparición.**

| # | Bug | Síntoma | Fix aplicado (`e855ec2`) |
|---|---|---|---|
| 1 | `_bdPuedeArchivar()` libre en `locaciones.js:318` (el puente window se purgó en D4c; el consumidor quedó desnudo) | **El detalle de locación no abría** por ninguna de sus ≥8 entradas → edición/fotos/estado/costo/archivar de locaciones muertos. ReferenceError tragado por el catch del despachador | ✅ `export` en bd.js + import en locaciones.js (`f6586f6`) |
| 2 | **47 atributos `on*=` en 19 líneas de 4 módulos** (toda la familia drag&drop + 1 `onclick` + 1 `onmouseup`) — bloqueados por la CSP estricta Y con sus 34 funciones fuera de `window` | Todo reordenamiento por arrastre muerto (filas de presupuesto, hoja de llamado, fotos/portada de locación, paradas de scouting, bullets de cotización, imagen→plan) + **el botón "⬇ Descargar .xlsx" del export Chipax muerto**. Único fallback: botones ⌃/⌄ del plan de rodaje | ✅ 47 migrados a delegación (10 familias); `delegacion.js` +dragstart/dragend/mouseup y despacho con ascenso (`5028bf6`+`d47aa6a`) |
| 3 | `_pdCookiesBootCheck` libre en `boot.js:578` (conversión a gancho a medias en D4b: el `define` existe, el consumidor no se convirtió) | El check del banner de cookies **nunca corría** en la ruta de entrada directa (org única); sí en la ruta espacio. ReferenceError tragado por `catch(e){}` vacío. Compliance, no funcional | ✅ `gancho('_pdCookiesBootCheck')` (`f6586f6`) |
| 4 | TDZ auto-referente en `state.js:54`: `export let USUARIO_ACTUAL = ('USUARIO_ACTUAL' in window) ? USUARIO_ACTUAL : ''` — el RHS liga al propio binding en TDZ, no a `window.*` | **Latente** (nadie escribía `window.USUARIO_ACTUAL`). Si algún script clásico/extensión la definía antes del eval → ReferenceError en la raíz del grafo → **app en blanco** | ✅ RHS → `window.USUARIO_ACTUAL` (`f6586f6`) |

**Por qué las compuertas no los vieron:** la #2 se subcontó históricamente porque `gastos.js:1558` usa comilla simple (`onclick='…'`, invisible a greps de comilla doble) y el resto es familia `ondrag*` que se dio por "residuo no funcional"; la #1 y la #3 son exactamente la clase de error que un **ESLint `no-undef`** habría atrapado en el commit que los creó (recomendación R1/R2).

---

## 4 · Hallazgos consolidados, priorizados

Selección de los ~90 hallazgos de los capítulos (cada uno con evidencia `archivo:línea` en su capítulo). Prioridad = impacto × exposición.

### P0 — Funcional, visible en staging → ✅ RESUELTO en FASE HF
1. ~~Los bugs 1 y 2 de §3 (detalle de locación; DnD + export Chipax).~~ ✅ Reparados (`e855ec2`).
2. ~~**Gating de permisos de UI muerto**~~ ✅ Reparado — `boot.js:293,298` buscaba botones por `[onclick*="newProject"]` / `[onclick*="openGlobalCFO"]`, selectores huérfanos; ahora `[data-accion="app.nuevoProyecto"]` / `[data-accion="app.cfo"]` (`f6586f6`). El gate de runtime y RLS ya protegían la acción; ahora la UI también oculta correctamente.

### P1 — Seguridad / integridad
3. **El soft-delete de proyectos elude el permiso `eliminar_proyecto` a nivel de BD**: `kanban.js:320` hace UPDATE directo de `deleted_at`, autorizado por la policy de `info_proyecto`; las RPC endurecidas `eliminar_proyecto`/`restaurar_proyecto` existen y el frontend no las llama. Un perfil Ejecutivo puede borrar (soft) proyectos vía PostgREST pese a tener `eliminar_proyecto='none'` ([cap. 12 H1](arquitectura/12-backend-supabase-rls-rpc.md)).
4. **"Externo no lee `contacts`" es convención, no invariante**: ninguna policy consulta `memberships.tipo`; un externo invitado con perfil 3–6 lee la tabla de contactos completa de la organización (cap. 12 H2).
5. **11 guardas `typeof X === 'function'` sobre identificadores que solo existen como espejos `window`** (`ui.js:162,163,353,362`, `presupuesto-cotizacion.js:740,1116,1117,3905,4141`, `modelo.js:23,28`): si la purga de window continúa, degradan a no-op **silencioso** — el mismo mecanismo que produjo los bugs 1 y 3. Deben consultar el registro de ganchos.
6. **Cadena de suministro**: cero `integrity` (SRI) en los 3 CDN; `supabase-js@2` con major flotante (el runtime de producción puede cambiar sin commit); xlsx cargado **dos veces** (eager jsdelivr + lazy cdnjs).
7. `showToast` inyecta `body` sin escapar y 13 call-sites le pasan `e.message` del servidor (marcado/estilo inyectable; sin JS por la CSP).

### P2 — Deuda estructural
8. **Cero infraestructura de calidad**: sin tests, sin linter, sin typecheck, sin hooks de git en un frontend de 25 KLOC cuyos invariantes (biyección 364/364, ganchos 105/105, orden de eval) hoy se verifican a mano y viven en mensajes de commit.
9. **Red async sin fondo**: 35 fire-and-forget + 12 `.then` sin `.catch`, sin handler `unhandledrejection`, y el antipatrón `try { fnAsync(); } catch {}` que aparenta protección sin darla. Errores de producción = consola que nadie mira.
10. **Comentarios fósiles masivos** que documentan invariantes ya falsas (cabeceras de calculadoras/tareas/espacio/kanban/cargos; `state.js` prometiendo espejos window que D4c apagó; `docs/CLAUDE.md` describiendo el proyecto en "~88 % pendiente" y fuera de su ubicación declarada). Un ingeniero nuevo tomaría decisiones sobre contratos muertos.
11. **`index.html` viaja con ~1.230 líneas de changelog en comentario** (84 % del peso del HTML): ~28 KB gzip evitables + exposición pública de historial interno.
12. **El "airbag" de autosave no restaura**: `takeos_autosave_v1` se escribe siempre y solo se lee para fotos de locación; ediciones dentro de la ventana de 1,5 s se pierden al recargar. Además snapshots/airbag **no segregan por organización** (restaurar un snapshot de la org A activa en B reintroduce datos cruzados en memoria).
13. **`_dalReplaceChildren` no atómico** (delete+insert en 2 requests): fallo de red entre ambos deja los satélites del contacto borrados en servidor.
14. **Rendimiento**: chunk único ~1 MB con xlsx eager (~41 % del transfer de arranque para un export ocasional); `markDirty()` stringifica el proyecto completo en cada edición (con imágenes base64 = MBs síncronos por tecla); fuentes muertas + `@import` en cascada.
15. **Accesibilidad ~cero**: 4 atributos `aria-*` en toda la app, foco invisible en 21 casos con `outline:none`, sin `prefers-reduced-motion`, buscador sin navegación por teclado real ([cap. 16](arquitectura/16-accesibilidad.md)).
16. **Lock-in regional codificado**: catálogo bancario chileno duplicado en 2 módulos, export Santander/Chipax literal, `project.currency` escrito y jamás leído; versionado de saves declarado pero no operativo ([cap. 17](arquitectura/17-limites-de-producto.md)).

---

## 5 · Recomendaciones (orden propuesto)

- **R1 · Hotfix de los 4 bugs de §3** — ✅ **HECHO** (`e855ec2`, 6-jul): fixes 1/3/4 de una línea + migración de los 47 `on*=` a delegación con ascenso.
- **R2 · Compuertas como CI, no como memoria** — ✅ **PARCIAL** (`17595f8`): `npm run gate` versionado con `check-inline-handlers` (cero `on*=`) y `check-free-idents` (identificadores libres, semántica `no-undef`, sin dependencias), validado adversarialmente. **Pendiente:** el gate de eval-time sobre la SCC (script del cap. 6, reutilizable) y los checkers de biyección de acciones/ganchos aún viven fuera del repo; falta atarlos a un pre-push/CI real (hoy `npm run gate` se corre a mano).
- **R3 · Cadena de suministro**: pin exacto de `supabase-js`, SRI en los 3 CDN, eliminar la doble carga de xlsx (decidir eager o lazy).
- **R4 · Los dos huecos de RLS** (P1-3 y P1-4): usar las RPC `eliminar_proyecto`/`restaurar_proyecto` desde kanban; policy que restrinja `contacts` para `memberships.tipo='externo'`.
- **R5 · Purga de comentarios fósiles + changelog fuera de index.html** (a `docs/CHANGELOG.md`, que ya existe).
- **R6 · Las 11 guardas `typeof` → registro de ganchos** (P1-5), y política de canal único por símbolo (3 defines huérfanos, `_orgLogos` publicado por window Y gancho).
- **R7 · Proyecto S** (estilos → `style-src` sin `unsafe-inline`): ya dimensionado aparte; activarlo con el primer rediseño visual.

---

## 6 · Índice de capítulos

| Cap. | Contenido |
|---|---|
| [01 · Topología, build y despliegue](arquitectura/01-topologia-build-deploy.md) | Árbol completo del repo, inventario de 40 archivos con líneas, package.json/vite/deploy.yml, los dos remotos, CDNs |
| [02 · Arranque y orden de evaluación](arquitectura/02-arranque-orden-evaluacion.md) | main.js, orden efectivo vs manifiesto (DFS), secuencia de boot paso a paso, auth, código top-level por archivo |
| [03 · Intercomunicación modular](arquitectura/03-intercomunicacion-modular.md) | Contratos completos de delegación y ganchos, censo de acciones por namespace, despachadores de 2.º nivel y centinelas, reglas de decisión |
| [04 · Estado y modelo de dominio](arquitectura/04-estado-y-modelo-de-dominio.md) | state.js/rates.js/catalogos.js con firmas, shape real de STATE/proyecto/BD, modelo.js vs data.js, entidades y relaciones |
| [05 · Persistencia, sync y multi-org](arquitectura/05-persistencia-sync-multiorg.md) | API completa de dal.js, tablas/RPCs/buckets, debounces, época, reset multi-org, sesión y permisos |
| [06 · Grafo de dependencias](arquitectura/06-grafo-de-dependencias.md) | 364 aristas, SCC de 19 módulos, capas topológicas, frontera lib/modules, aristas invertidas |
| [07 · Módulos pesados](arquitectura/07-modulos-presupuesto-plan-gastos.md) | presupuesto-cotizacion (4.480 líneas), plan-rodaje, gastos: subdominios, despachadores, impresión, acoplamientos |
| [08 · BD, locaciones, legal, notificaciones](arquitectura/08-modulos-bd-locaciones-legal-ntf.md) | Los 5 módulos con integración Supabase y patrones de UI |
| [09 · Módulos restantes + ui/nav](arquitectura/09-modulos-restantes-ui-nav.md) | Los 15 módulos menores, librería ui.js, registro MODULES, helpers |
| [10 · Seguridad, CSP y superficie global](arquitectura/10-seguridad-csp-superficie-global.md) | CSP directiva por directiva, censo window clasificado, secretos, innerHTML/escapeHtml |
| [11 · Convenciones y calidad](arquitectura/11-convenciones-y-calidad.md) | Familias de nombres, canales de error, código muerto, infraestructura de pruebas (ausente), documentación |
| [12 · Backend Supabase](arquitectura/12-backend-supabase-rls-rpc.md) | Esquema, 157 policies, contratos de las RPC guardar_*, hallazgos de seguridad H1–H7 |
| [13 · Bugs adjudicados](arquitectura/13-bugs-adjudicados.md) | Los 4 bugs con evidencia dev/dist/staging/producción y la adjudicación de contradicciones |
| [14 · Censo canónico](arquitectura/14-censo-canonico.md) | **Apéndice normativo**: cifras definitivas de window/ganchos/acciones/imports con metodología de 3 capas |
| [15 · Rendimiento](arquitectura/15-rendimiento.md) | Presupuesto de carga, xlsx duplicado, markDirty, fuentes |
| [16 · Accesibilidad](arquitectura/16-accesibilidad.md) | Línea base cuantitativa (4 aria-), foco, teclado, contraste, reduced-motion |
| [17 · Límites de producto](arquitectura/17-limites-de-producto.md) | i18n/lock-in Chile, versionado de saves, compatibilidad de formatos |
