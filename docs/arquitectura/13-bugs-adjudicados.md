> ✅ **RESUELTO (6-jul, merge `e855ec2`) — este capítulo describe el árbol pre-fix `4c8067b`, conservado como registro de por-qué.** Los 4 bugs están reparados en FASE HF: Bug 1 (`_bdPuedeArchivar` export+import) y Bugs 3/4 (`gancho('_pdCookiesBootCheck')` · `window.USUARIO_ACTUAL`) en `f6586f6`; Bug 2 (los 47 `on*=` → delegación con ascenso) en `5028bf6`+`d47aa6a`. La contradicción del §Hallazgos ("Rollup lo aplana y funciona", refutada aquí inspeccionando `dist/`) motivó la compuerta `check-free-idents.mjs` (`17595f8`), validada contra `5e1d621`. Lo de abajo se lee en pasado. Ver [ARQUITECTURA.md §3](../ARQUITECTURA.md#3--los-4-bugs-funcionales-encontrados-adjudicados-contra-dist).

# Adjudicación de los 4 bugs funcionales declarados + contradicción sobre handlers inline

**Base de evidencia:** working tree en `etapa4-integracion` @ `4c8067b`; bundle local `frontend/dist/assets/index-DURjYUNe.js` (mtime `2026-07-03 19:24:35`, 17 s anterior al commit HEAD `2026-07-03 19:24:52` — representa el src actual; `frontend/dist/` está gitignored, `.gitignore:3`). Remotos verificados con `git ls-remote`: **staging** (`takeos-staging`, main = `4c8067b` = HEAD local) despliega este código vía `.github/workflows/deploy.yml` (`npm run build:staging` → Vite/Rollup + minify, publica `frontend/dist`). **Producción** (`origin`, main = `fa008d5`) es el **monolito pre-modularización** (`index.html` en raíz, 28.649 líneas — `git show fa008d5:index.html | wc -l` —, 549 `onclick=|ondragstart=` y CSP `script-src 'self' 'unsafe-inline' …`): **ninguno de los 4 bugs existe en producción real**; los cuatro son regresiones de la Etapa 4 que hoy viven en dev, en el dist local y en staging.

---

## Bug 1 · `_bdPuedeArchivar` libre en `frontend/src/modules/locaciones.js:318` — VEREDICTO: ReferenceError en dev **Y TAMBIÉN en dist/staging**. La tesis "Rollup aplana el scope y funciona en producción" es FALSA para este artefacto.

**Hechos en src:**
- Definición file-local, **sin `export`** — `frontend/src/modules/bd.js:695`:
  ```js
  function _bdPuedeArchivar() { return !!(STATE.adminMode && authNivel('eliminar_proyecto') === 'E'); }
  ```
- Consumo huérfano — `frontend/src/modules/locaciones.js:318` (dentro del template literal de `export function openLocDetail(locId)`, locaciones.js:239):
  ```js
  <div class="modal-footer">${_bdPuedeArchivar() ? `<button class="btn btn-ghost btn-sm" ... ${accionHTML('loc.archivar', locId)}>Archivar</button>` : ''}...
  ```
- Los imports de locaciones.js (líneas 7–26) traen de `./bd.js` **solo** `openPersonaByName` (locaciones.js:14). No hay declaración local ni `window._bdPuedeArchivar` en ningún archivo (`grep -rn "window\._bdPuedeArchivar" frontend/` → 0 hits).
- **Origen de la regresión:** commit `e2e9c5a` (D4c "purga final") eliminó el puente `window._bdPuedeArchivar = _bdPuedeArchivar;` de bd.js (visible en `git show e2e9c5a`) sin tocar al consumidor desnudo de locaciones.js:318. Antes de D4c el identificador libre resolvía por fall-through a `globalThis`.

**Modo dev (Vite, ESM nativo):** cada módulo tiene su propio scope; `_bdPuedeArchivar` no liga a nada → **ReferenceError en cada `openLocDetail()`**, lanzado durante la evaluación del template (línea 318) **antes** de la asignación a `modalRoot.innerHTML` (línea 269) → el modal nunca abre. El error lo traga el despachador (`frontend/src/lib/delegacion.js:47`: `try { fn(args, el, ev); } catch (e) { console.error('[delegacion] acción', el.dataset.accion, e); }`) → click silencioso + console.error.

**Modo dist (inspección directa del chunk):** `grep -c "_bdPuedeArchivar" dist/assets/index-DURjYUNe.js` → **1** ocurrencia: exactamente el call-site de locaciones (`${_bdPuedeArchivar()?` — offset ~481592, contexto con `loc.archivar` y `ui.cerrar`). La definición fue **renombrada por el minificador a `sp`**:
```js
function sp(){return!!(u.adminMode&&Me("eliminar_proyecto")==="E")}
```
Adjudicación de la contradicción: Rollup sí aplana los módulos en un scope, pero **solo liga referencias resueltas por import**; un identificador libre se trata como global implícito y se deja textual. Sin minificación la referencia habría resuelto *por accidente* contra `function _bdPuedeArchivar` en el mismo module-scope aplanado; **con la minificación por defecto de `vite build`, la definición se renombra y la referencia libre queda colgando** → mismo ReferenceError que en dev. Los dos usos internos de bd.js (bd.js:483 y bd.js:1017) sí funcionan (mismo módulo → renombrados coherentemente a `sp`).

**Impacto de usuario (dev = dist = staging): el detalle de locación está 100 % muerto.** Entradas afectadas: card de locación (`locaciones.js:229`: `<div class="loc-card" ${accionHTML('bd.verLoc', l.locId)}>`), botón "Ver / editar" de BD (`bd.js:183`), acción `verLoc` (`bd.js:1144`: `verLoc: function (a) { openLocDetail(a[0]); }`), y los flujos post-creación (`bd.js:214,217`; `locaciones.js:547,554` — la locación se crea y guarda, pero el detalle no abre). Sin el modal, mueren en cascada: edición de datos/contactos/fotos de la locación, estado en proyecto, costo negociado, quitar del proyecto y archivar.

---

## Bug 2 · Handlers inline `on*=` vivos en HTML generado — VEREDICTO: bloqueados por CSP en dev **y** dist; doblemente muertos (CSP + funciones ausentes de `window`). La afirmación de "convenciones" (gastos.js:1558 = "el único `on*=`") es FALSA.

**Cifras exactas** (comando: `grep -rnoE "[^a-zA-Z0-9_]on(click|mouseup|mousedown|mousemove|drag[a-z]*|drop|focus|blur|input|change|keydown|keyup|load|submit)=" frontend/src/` menos comentarios):
- **47 atributos `on*=` reales en 19 líneas de 4 módulos**: `plan-rodaje.js` 304, 314, 338, 375, 754, 755, 787, 788 · `locaciones.js` 261, 262, 719, 724 · `presupuesto-cotizacion.js` 758, 2841, 3002, 3003, 3023, 3025 · `gastos.js` 1558.
- +5 ocurrencias **en comentarios** (no ejecutables): `ui.js:150–153` (doc-block `/* */`) y `calculadoras.js:3` (`//`). Estas explican discrepancias entre conteos previos.
- **34 funciones distintas** referenciadas (`rowDrag{Start,Over,End}`, `rowDrop`, `prDrag{Start,End,Over,Leave}`, `prDrop`, `prDropImagen`, `prImgDrag{Over,Leave}`, `hlDrag{Start,End,Over,Leave}`, `hlDrop`, `locFotoDrag{Start,End,Over,Leave}`, `locFotoDrop`, `locScoutDrag{Start,End,Over,Leave}`, `locScoutDrop`, `cotDrag{Start,End,Over,Leave}`, `cotDrop`, `cotDescGuardarAlto`, `goDescargarXlsx`). Verificación por loop de grep: **34/34 definidas file-local, 0/34 con `window.X =` o `define('X', …)`** en todo `frontend/src/`.
- Corrección a "convenciones": `gastos.js:1558` es el único **`onclick=`** — y el único con comilla simple (`onclick='goDescargarXlsx(${...})'`), lo que lo hace invisible a greps de comilla doble; probablemente por eso se lo declaró "único". No es el único `on*=`: hay 47.

**CSP — `frontend/index.html:35`** (byte-idéntica en `frontend/dist/index.html:35`):
```
script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com
```
Sin `'unsafe-inline'`, sin `'unsafe-hashes'`, sin directiva `script-src-attr` → los event-handler attributes caen bajo `script-src` y **se rehúsan a compilar** (la CSP por `<meta http-equiv>` sí gobierna handlers inline). Vite dev sirve el mismo `frontend/index.html` (el `@vite/client` inyectado va por `src`, permitido por `'self'`) → **bloqueo idéntico en dev y dist**. Fecha del bloqueo: commit `7240a28` (D3b, "CSP sin 'unsafe-inline' en script-src"); desde `e2e9c5a` (D4c) además desapareció el plan B (los puentes `window.*` de esas 34 funciones), así que incluso relajando la CSP habría ReferenceError. En el chunk de dist los atributos viajan intactos como data del template (`grep` en dist: 8× `ondragstart=`, 1× `onmouseup=`, 1× `onclick='goDescargarXlsx`) y las 8 funciones muestreadas dan `def=0` con su nombre original (todas minificadas) — doble muerte también en producción-staging.

**Features muertas (dev = dist = staging), sin ruta alternativa:**

| Feature | Líneas | Estado |
|---|---|---|
| Reordenar filas del presupuesto (drag de `<tr>`) | presupuesto-cotizacion.js:758 | Muerta |
| Reordenar crew y externos en Hoja de Llamado | plan-rodaje.js:754–755, 787–788 (`hlMoverCrew`/`hlMoverExterna` solo se llaman desde `hlDrop`, plan-rodaje.js:876–877) | Muerta |
| Reordenar galería de fotos de locación = **elegir portada** | locaciones.js:261–262 (el comentario en 258–259 dice que estrella/flechas "se eliminaron" a favor del DnD → no hay fallback) | Muerta |
| Reordenar paradas de la ruta de scouting | locaciones.js:719, 724 (`locScoutMoverParada`, :633, solo desde `locScoutDrop`, :632) | Muerta |
| Reordenar bullets de oferta y videos de entregables (cotización) | presupuesto-cotizacion.js:3002–3003, 3023–3025 | Muerta |
| Persistir alto del textarea de descripción de cotización | presupuesto-cotizacion.js:2841 (`onmouseup="cotDescGuardarAlto(this)"`) | Muerta (cosmética: no se guarda `c.descAlto`) |
| Arrastrar imagen a celda del plan de rodaje | plan-rodaje.js:314 (`prDropImagen`) | Muerta |
| **Botón "⬇ Descargar .xlsx" (export masivo Chipax de gastos validados)** | gastos.js:1558 → `function goDescargarXlsx(projId)` (gastos.js:1565) | **Muerta — única baja no-DnD; el CFO no puede exportar** |

**Con fallback degradado:** reordenar filas del plan de rodaje — el drag handle (plan-rodaje.js:304) está muerto, pero los botones ⌃/⌄ (plan-rodaje.js:305–306, `accionHTML('pr.d', 'prMoveFila', f.id, ±1)` → `function prMoveFila(id, dir)`, plan-rodaje.js:475) van por delegación y funcionan.

---

## Bug 3 · `_pdCookiesBootCheck` libre en `frontend/src/lib/boot.js:578` — VEREDICTO: ReferenceError real, tragado silenciosamente, en dev y dist/staging.

- boot.js:578, dentro de `export function arrancarTakeOS()`:
  ```js
  .then(function(){ try { setTimeout(_pdCookiesBootCheck, 1200); } catch (e) {} })
  ```
- Los imports de boot.js (líneas 9–24) **no** incluyen `_pdCookiesBootCheck`; no hay declaración local (grep exhaustivo del identificador en boot.js → solo la línea 578); no existe `window._pdCookiesBootCheck` en ningún archivo. La definición real es `frontend/src/modules/config.js:2060`: `export async function _pdCookiesBootCheck() {` con gancho registrado en config.js:2164: `define('_pdCookiesBootCheck', _pdCookiesBootCheck);`.
- **Origen quirúrgicamente identificado:** `git show e870a82` (D4b) borra el import directo `import { …, _pdCookiesBootCheck, … } from '../modules/config.js';` de boot.js y convierte `_cpTourInicialQuizas()` → `gancho('_cpTourInicialQuizas')()` **en la misma línea**, pero olvida convertir `_pdCookiesBootCheck` → quedó identificador libre. El fix previsto era obvio: `gancho('_pdCookiesBootCheck')`.
- Semántica verificada con node (`node --input-type=module`): evaluar el argumento de `setTimeout` lanza el ReferenceError **síncronamente** dentro del `try` → el `catch (e) {}` vacío lo traga. Sin crash, sin log, sin banner.
- **Dist:** mismo estado — el chunk contiene `try{setTimeout(_pdCookiesBootCheck,1200)}catch{}` textual mientras la definición fue renombrada a `Rp` (registrada como `j("_pdCookiesBootCheck",Rp)`).
- **Impacto:** el chequeo del banner de cookies/consentimiento (Plan G §2, "banner de cookies en primera visita") **nunca corre por la ruta `arrancarTakeOS()`** — usuario de una sola organización que entra directo. Sí corre por la ruta espacio personal (multi-org o `?espacio=1`): `frontend/src/modules/espacio.js:13` lo importa correctamente y lo usa en espacio.js:348. Impacto de compliance, invisible funcionalmente; idéntico en dev, dist y staging.

---

## Bug 4 · TDZ en `frontend/src/lib/state.js:54` — VEREDICTO: mina latente, hoy inerte en los tres entornos; si detona, mata el boot completo.

```js
export let USUARIO_ACTUAL = ('USUARIO_ACTUAL' in window) ? USUARIO_ACTUAL : '';
```
- El `USUARIO_ACTUAL` del lado derecho liga **a la propia declaración `let`** (shadowing del global), que está en su Temporal Dead Zone durante el inicializador. Si `'USUARIO_ACTUAL' in window` fuera `true` al evaluar el módulo → `ReferenceError: Cannot access 'USUARIO_ACTUAL' before initialization` (reproducido con node ESM). Como state.js es raíz del grafo (main.js:9 `import { STATE } from './lib/state.js';`), la evaluación de **todo el bundle/grafo falla → app en blanco**. La intención evidente era `window.USUARIO_ACTUAL` en el RHS.
- **Preservado en dist**, no neutralizado: `let Ht="USUARIO_ACTUAL"in window?Ht:""` — el minificador renombró ambos lados coherentemente; el gatillo sigue siendo la propiedad con nombre **original** en `window`.
- **Por qué hoy no detona:** nadie escribe `window.USUARIO_ACTUAL`. Todas las ocurrencias del identificador en src son: state.js:54, el setter `export function setUsuarioActual(v) { USUARIO_ACTUAL = v; }` (state.js:236), lecturas en boot.js:27,255 y el comentario state.js:220. Los únicos scripts clásicos previos al módulo son los CDN xlsx/supabase (index.html:1282,1284), que no definen esa global; el `<script>` clásico del monolito está vacío (index.html:1552). El ternario toma siempre la rama `''` → la condición es **código muerto + trampa armada**: cualquier script clásico futuro, snippet de consola o extensión que defina `window.USUARIO_ACTUAL` antes de la evaluación del módulo tumba el arranque entero.

---

## Tabla veredicto único: bug × entorno × impacto

| Bug | Vite dev (ESM nativo) | dist local (`index-DURjYUNe.js`) | Staging desplegado (takeos-staging @ 4c8067b, mismo pipeline) | Producción real (origin/main fa008d5, monolito) | Impacto de usuario |
|---|---|---|---|---|---|
| **1** `_bdPuedeArchivar` loc:318 | **ROTO** — ReferenceError por módulo-scope; tragado por delegacion.js:47 | **ROTO** — def minificada a `sp`, referencia libre intacta (1 hit en chunk) | **ROTO** (mismo build) | No existe (monolito, todo global) | Detalle de locación inabrible por todas sus entradas → edición/fotos/estado/costo/archivar de locaciones muertos |
| **2** 47 atributos `on*=` en 19 líneas | **BLOQUEADO por CSP** (index.html:35, sin `unsafe-inline`/`unsafe-hashes`/`script-src-attr`) + 0/34 funciones en window | **BLOQUEADO por CSP** (dist/index.html:35 idéntica) + defs minificadas | **BLOQUEADO** (mismo build) | Funciona (CSP con `'unsafe-inline'`, 549 handlers) | Todo reordenamiento DnD muerto (presupuesto, hoja de llamado, fotos/portada, scouting, bullets cotización, imagen→plan) + **export Chipax .xlsx muerto**; único fallback: ⌃/⌄ del plan de rodaje |
| **3** `_pdCookiesBootCheck` boot.js:578 | **ROTO-SILENTE** — ReferenceError síncrono tragado por `catch(e){}` | **ROTO-SILENTE** — `try{setTimeout(_pdCookiesBootCheck,1200)}catch{}` textual, def = `Rp` | **ROTO-SILENTE** (mismo build) | No existe | Banner cookies no corre en la ruta de entrada directa (una sola org); sí en la ruta espacio (espacio.js:348). Riesgo compliance, no funcional |
| **4** TDZ state.js:54 | **LATENTE** — condición hoy siempre falsa | **LATENTE** — TDZ preservado (`let Ht="USUARIO_ACTUAL"in window?Ht:""`) | **LATENTE** (mismo build) | No existe | Hoy ninguno. Si `window.USUARIO_ACTUAL` aparece antes de evaluar el módulo: boot total muerto (app en blanco) |

---

## Hallazgos

1. **Las tres contradicciones adjudicadas tienen la misma raíz metodológica:** las secciones que declararon "funciona en producción" razonaron sobre el aplanado de Rollup sin inspeccionar el chunk minificado; la minificación por defecto de `vite build` renombra las declaraciones top-level y deja los identificadores libres textuales, rompiendo la resolución accidental. Verificable en 30 s con `grep` sobre `dist/assets/index-DURjYUNe.js`.
2. **"Producción rota" es ambiguo en este repo:** hay dos remotos con contenidos radicalmente distintos. `origin/main` (`fa008d5`) = monolito de 28.649 líneas sin ninguno de estos bugs; `staging/main` (`4c8067b`) = HEAD de etapa4 con los cuatro. Todo informe debe fijar contra cuál remoto habla.
3. **`delegacion.js:54` no registra `dragstart`/`dragend`** (`['click','input','change','keydown','dblclick','mousedown','paste','submit','dragover','dragleave','drop']`): la migración pendiente de los 47 atributos DnD requerirá ampliar esa lista, no solo reescribir templates.
4. **El comilla-simple de `gastos.js:1558`** (`onclick='goDescargarXlsx(...)'`) evade cualquier auditoría con grep de comilla doble — causa probable del sub-conteo de "convenciones". Las auditorías de `on*=` deben usar clase `["']`.
5. **Deuda de comentarios-fósil:** `delegacion.js:1` afirma que la delegación es "el reemplazo de los ~991 handlers on*= inline" y `dist/index.html:1552` que "todo el JS vive en src/" — con 47 atributos vivos ambas afirmaciones son aspiracionales, no descriptivas.
6. **Inconsistencia de política D4b:** boot.js consume `_cpTourInicialQuizas` vía `gancho()` pero `espacio.js:13` importa `_pdCookiesBootCheck` directo de `config.js` (arista módulo→módulo que la inversión por ganchos pretendía uniformar); el gancho `define('_pdCookiesBootCheck', …)` de config.js:2164 existe y hoy solo lo consume nadie — el consumidor roto de boot.js:578 era su destinatario.
7. **Los tres `catch` vacíos involucrados** (boot.js:578, delegacion.js:47 con solo console.error, locaciones.js:267) convirtieron dos ReferenceError de regresión en fallas silenciosas que sobrevivieron a las compuertas de la Etapa 4; ninguna compuerta actual (grep de imports/ganchos) detecta identificadores libres — un `no-undef` de ESLint sobre `frontend/src/` habría atrapado los bugs 1 y 3 en el commit que los creó.