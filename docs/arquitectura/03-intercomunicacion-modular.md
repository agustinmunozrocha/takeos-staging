> ⚠ **Actualizado en FASE HF (6-jul, `e855ec2`) — `lib/delegacion.js` cambió su contrato tras este análisis.** El código citado abajo es el de `4c8067b`. Diferencias vigentes: (1) la lista de tipos escuchados en burbuja **suma** `dragstart`, `dragend`, `mouseup` (para migrar los 47 `on*=` del drag&drop, cap. 13 Bug 2); (2) `despachar()` ya no descarta el evento si el `closest([data-accion])` no escucha ese tipo: **asciende** por los ancestros hasta encontrar uno que sí (restaura el burbujeo nativo — un `<tr>` con `data-on="click dragover…"` recibe el dragover que nace sobre un input hijo). Todo lo demás del contrato (firma `(args, el, ev)`, `registrarAcciones`/`accionHTML`, despachadores de 2.º nivel) sigue vigente. El §Hallazgos que trata los `on*=` supervivientes como muertos queda superseded.

# Sistema de intercomunicación modular de Take-OS (frontend/src)

Base analizada: rama `etapa4-integracion`, 40 archivos JS, 25.327 líneas (`wc -l frontend/src/lib/*.js frontend/src/modules/*.js frontend/src/main.js`). Tres mecanismos conviven con roles disjuntos: **imports ESM** (aristas hacia abajo), **delegación de eventos** (DOM → módulo) y **ganchos** (aristas hacia arriba / inversión de dependencias). `main.js` es el manifiesto de eval (`frontend/src/main.js:6-42`) y termina con `lib/boot.js` como última entrada, con la advertencia explícita de que su eval real se adelanta por el grafo de imports (`frontend/src/main.js:42`).

---

## 1. `frontend/src/lib/delegacion.js` — el bus DOM (60 líneas, archivo completo)

```js
// D2 · Delegación de eventos — el reemplazo de los ~991 handlers on*= inline.
//
// UN listener por tipo de evento a nivel documento; los módulos registran
// acciones con registrarAcciones(ns, mapa) y el HTML generado las invoca con
// data-accion="ns.nombre" + data-args (JSON) + data-on (tipos, default click).
// Mata la familia de escaping de comillas de on*= (los data-* llegan ya
// decodificados vía dataset, sin re-parseo de JS) y es el camino a una CSP
// sin 'unsafe-inline' (D3).
//
// Firma de toda acción: (args, el, ev) — args del JSON, el = elemento con
// data-accion, ev = evento nativo (los handlers que usaban this/event).
import { escapeHtml } from './helpers.js';

const ACCIONES = {};

export function registrarAcciones(ns, mapa) {
  ACCIONES[ns] = Object.assign(ACCIONES[ns] || {}, mapa);
}

/* Atributos para HTML generado:
   `<button ${accionHTML('snap.revertir', i)}>`                → click
   `<input ${accionHTML('bd.filtro', id, { on: 'input' })}>`   → otro evento
   El último argumento {on:'...'} (objeto plano) define el/los tipos. */
export function accionHTML(accion) {
  var args = Array.prototype.slice.call(arguments, 1);
  var on = 'click';
  var ult = args[args.length - 1];
  if (ult && typeof ult === 'object' && !Array.isArray(ult) && ult.on) { on = ult.on; args.pop(); }
  var a = 'data-accion="' + accion + '"';
  if (args.length) a += ' data-args="' + escapeHtml(JSON.stringify(args)) + '"';
  if (on !== 'click') a += ' data-on="' + on + '"';
  return a;
}

function despachar(ev) {
  var el = ev.target && ev.target.closest ? ev.target.closest('[data-accion]') : null;
  if (!el) return;
  var tipos = (el.dataset.on || 'click').split(/\s+/);
  if (tipos.indexOf(ev.type) < 0) return;
  var punto = el.dataset.accion.indexOf('.');
  var fn = ACCIONES[el.dataset.accion.slice(0, punto)] && ACCIONES[el.dataset.accion.slice(0, punto)][el.dataset.accion.slice(punto + 1)];
  if (!fn) { console.error('[delegacion] acción sin registrar:', el.dataset.accion); return; }
  var args = [];
  if (el.dataset.args) {
    try { args = JSON.parse(el.dataset.args); } catch (e) { console.error('[delegacion] data-args inválido en', el.dataset.accion, e); return; }
  }
  try { fn(args, el, ev); } catch (e) { console.error('[delegacion] acción', el.dataset.accion, e); }
}

/* Fase burbuja (paridad con los on*= inline durante la convivencia de la
   migración: un stopPropagation inline aguas abajo sigue frenando esto).
   Tipos que no burbujean (blur/focus/toggle) se agregan con captura cuando
   una tranche los necesite. */
['click', 'input', 'change', 'keydown', 'dblclick', 'mousedown', 'paste', 'submit', 'dragover', 'dragleave', 'drop'].forEach(function (t) {
  document.addEventListener(t, despachar);
});
['focus', 'blur'].forEach(function (t) {   // no burbujean: captura
  document.addEventListener(t, despachar, true);
});
```

**Contrato:**

- **13 listeners globales fijos**, uno por tipo: 11 en fase **burbuja** (`delegacion.js:54-56` — `click input change keydown dblclick mousedown paste submit dragover dragleave drop`) y 2 en fase **captura** (`delegacion.js:57-59` — `focus blur`, porque no burbujean; la captura es el único modo de verlos a nivel `document`). La elección de burbuja está documentada como decisión de paridad con los `on*=` inline durante la convivencia de la migración (`delegacion.js:50-53`): un `stopPropagation()` aguas abajo sigue frenando el despacho.
- **Resolución del objetivo**: `ev.target.closest('[data-accion]')` (`delegacion.js:36`) — gana el ancestro con `data-accion` **más cercano** al target; un solo elemento se despacha por evento (no hay cadena). Sobre esto se apoya la acción no-op `ui.stop` (§3).
- **Filtro por tipo**: `data-on` es lista separada por espacios; default `'click'` (`delegacion.js:38-39`). Un mismo elemento puede escuchar varios tipos (`data-on="focus input blur change"`) y la acción discrimina por `ev.type`.
- **Direccionamiento**: `data-accion="ns.nombre"` se parte por el **primer** punto (`delegacion.js:40-41`) contra el registro `ACCIONES` (mapa plano de dos niveles). `registrarAcciones` hace **merge** por `Object.assign` (`delegacion.js:16-18`), lo que permite registrar un namespace en varias tandas (caso real: `pre` se registra dos veces, `presupuesto-cotizacion.js:4444` y `:4471`).
- **Firma universal**: toda acción es `(args, el, ev)` — `args` = array parseado de `data-args` (JSON), `el` = el elemento portador del `data-accion` (reemplazo de `this`), `ev` = evento nativo (`delegacion.js:10-11,47`).
- **Manejo de errores — tres vías, todas `console.error`, ninguna relanza** (`delegacion.js:42,45,47`): acción sin registrar; `data-args` no-JSON (aborta antes de invocar); excepción dentro de la acción (aislada — un handler roto no tumba el bus).
- Contexto CSP: `frontend/index.html:35` — `script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com` sin `'unsafe-inline'`; la delegación es la precondición de esa directiva (`index.html:9`).

---

## 2. Censo completo de acciones delegadas

Método: `grep -rn "registrarAcciones(" frontend/src --include='*.js'` (25 llamadas en 23 archivos) + script Python que localiza cada literal de objeto, lo recorre balanceando llaves/strings/comentarios y cuenta las claves de nivel superior.

| ns | módulo (archivo:línea) | # acciones | dominio |
|---|---|---:|---|
| `app` | `lib/boot.js:705` | 15 | chrome estático de `index.html` (sidebar, topbar, búsqueda global, undo, import/export, campana, logout, papelera, CFO, nuevo proyecto) |
| `bd` | `modules/bd.js:1131` | 40 | Base de Datos: personas, empresas, talentos, locaciones, import/export, perfiles |
| `boot` | `lib/boot.js:699` | 1 | `cgEnter` — Enter en el cloud-gate de login |
| `buscador` | `modules/buscador.js:91` | 1 | `ir` — navegar a un resultado de la búsqueda global |
| `calc` | `modules/calculadoras.js:629` | 17 | calculadoras tributaria, costo real y horas extra |
| `cargo` | `modules/cargos.js:426` | 13 | cargos del proyecto e invitaciones por cargo |
| `cfg` | `modules/config.js:2143` | 14 | panel de configuración, perfil de empresa, privacidad/cookies, onboarding de productora |
| `crew` | `modules/crew.js:347` | 10 | crew por día, transporte, externos, exports PDF |
| `doc` | `modules/documentos.js:213` | 7 | Creative Hub (documentos del proyecto) |
| `esp` | `modules/espacio.js:429` | 11 | espacio de usuario multi-organización |
| `go` | `modules/gastos.js:1628` | 50 | gastos, caja, CFO, validación, pagos, export Chipax/Santander |
| `info` | `modules/info-proyecto.js:554` | 13 | Info Proyecto: vínculos con BD, estados, papelera |
| `inv` | `modules/invitaciones.js:207` | 4 | aceptar/rechazar/consentir invitaciones |
| `kanban` | `modules/kanban.js:350` | 6 | control room / kanban de proyectos |
| `lgl` | `modules/legal.js:889` | 27 | módulo legal: documentos, plantillas, generación, export |
| `loc` | `modules/locaciones.js:851` | 37 | locaciones, fotos, lightbox, scouting y PDF de scout |
| `ntf` | `modules/notificaciones.js:699` | 32 | centro de notificaciones, plantillas, envíos, programación |
| `plan` | `modules/plan-limites.js:105` | 1 | `verPlanes` — CTA de límites del plan SaaS |
| `pr` | `modules/plan-rodaje.js:1463` | 9 | plan de rodaje + hoja de llamado (incluye despachador `pr.d`) |
| `pre` | `modules/presupuesto-cotizacion.js:4444` y `:4471` | 23 | presupuesto y cotización (incluye despachador `pre.d`) |
| `rodajes` | `modules/rodajes.js:218` | 4 | días de rodaje |
| `snap` | `modules/persistencia-local.js:626` | 2 | snapshots: `revertir`, `borrar` |
| `tm` | `modules/tareas.js:310` | 16 | tareas, menciones, señales, control-room de tareas |
| `ui` | `lib/ui.js:785` | 11 | universales: modal, combobox, responsables (§3) |

**Total global: 364 acciones en 24 namespaces** (suma del script sobre las 25 llamadas).

**Invariante verificada (compuerta reproducida):** extraje todo `data-accion="…"` de JS + `index.html` y todo primer argumento de `accionHTML('…')` (348 call-sites de `accionHTML`, 374 `data-accion=` literales en JS, 32 en `index.html`, contados con `grep -c`), y crucé contra el registro: **364 acciones usadas = 364 registradas, cero huérfanas en ambas direcciones** (script de cruce; salida: `USADAS SIN REGISTRAR: ∅`, `REGISTRADAS SIN USO: 0`). El bus es biyectivo en estático.

---

## 3. Acciones universales del namespace `ui` (`lib/ui.js:785-802`)

```js
registrarAcciones('ui', {
  cerrar: function () { closeModal(); },
  stop: function () {},   // absorbe el evento: closest() se detiene aquí (ex event.stopPropagation() de celdas)
  backdrop: function (a, el, ev) { if (ev.target === el) closeModal(); },
  modalCancel: function () { _modalCancel(); },
  modalConfirm: function () { _modalConfirm(); },
  cbAddBD: function (a, el, ev) { if (ev.type === 'mousedown') ev.preventDefault(); else comboboxAddToBD(el); },
  cbAddEmpresa: function (a, el, ev) { if (ev.type === 'mousedown') ev.preventDefault(); else comboboxAddEmpresaToBD(el); },
  cbSel: function (a, el) { comboboxSelect(el, a[0]); },
  verPersona: function (a) { gancho('openPersonaByName')(a[0]); },
  respCombo: function (a, el, ev) {
    if (ev.type === 'focus') comboboxOpen(el);
    else if (ev.type === 'input') comboboxFilter(el);
    else if (ev.type === 'blur') comboboxCloseDelayed(el);
    else setSectionResponsable(a[0], el.value);
  },
  tareas: function (a) { gancho('openTareasModal')(a[0]); },
});
```

- **`ui.cerrar`** → `closeModal()` (`ui.js:67`): cierre estándar de cualquier modal.
- **`ui.backdrop`** (`ui.js:788`): cierra **solo si** `ev.target === el` — clic en el fondo, no en el contenido del modal. Es el patrón de todos los modales generados (p.ej. `plan-rodaje.js:407`).
- **`ui.stop`** (`ui.js:787`): función **vacía**. No llama `stopPropagation`; explota la semántica de `closest()` del despachador (`delegacion.js:36`): al ser el `[data-accion]` más cercano, "absorbe" el evento y las acciones delegadas de ancestros no se evalúan. Reemplazo declarativo del viejo `event.stopPropagation()` de celdas. Solo bloquea el bus de delegación, no otros listeners.
- **`ui.modalCancel` / `ui.modalConfirm`** → `_modalCancel()` (`ui.js:61`) / `_modalConfirm()` (`ui.js:49`), los callbacks del modal genérico `showModal({ title, body, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false, onConfirm, onCancel })` (`ui.js:25`).
- **`ui.cbAddBD` / `ui.cbAddEmpresa`**: patrón bi-evento — en `mousedown` hacen `preventDefault()` (evita robar foco al input del combobox) y en `click` ejecutan `comboboxAddToBD(el)` (`ui.js:158`).
- **`ui.cbSel`** → `comboboxSelect(optEl, value)` (`ui.js:283`): selección de opción en cualquier combobox de la app.
- **`ui.respCombo`**: acción multi-evento (`{ on: 'focus input blur change' }`, emitida en `ui.js:502`) que multiplexa por `ev.type` sobre el ciclo de vida del combobox de responsables; el `change` final llama `setSectionResponsable(key, nombre)` (`ui.js:473`).
- **`ui.verPersona` / `ui.tareas`**: puro reenvío hacia arriba vía ganchos `openPersonaByName` (productor `bd.js:1191`) y `openTareasModal` (productor `tareas.js:332`) — `ui` es módulo temprano y no puede importar bd/tareas.
- Razón de existir aquí y no en `delegacion.js`: comentario `ui.js:781-782` — *"movidas desde delegacion.js para no cerrar el ciclo delegacion⇄ui"* (delegacion importa `escapeHtml`; ui importa `registrarAcciones`).

---

## 4. `accionHTML()` — el generador de atributos

Firma real (`delegacion.js:24`): `export function accionHTML(accion)` con varargs: `accionHTML(accion, ...args, [{on}])`.

Mecánica (`delegacion.js:25-32`):
1. Todo lo posterior a `accion` se toma como args posicionales.
2. Si el **último** arg es objeto plano (no array) con clave `on`, se extrae como especificador de tipos de evento (`{ on: 'change' }`, `{ on: 'focus input blur change' }`) y se saca del array.
3. Emite `data-accion="ns.x"`; si quedan args, `data-args="…"` con `escapeHtml(JSON.stringify(args))` — el escape HTML garantiza que comillas dentro del JSON sobrevivan al atributo (`&quot;`), y `dataset.args` los devuelve ya decodificados al despacho, donde `JSON.parse` reconstruye el array (`delegacion.js:45`). Esto mata la "familia de escaping de comillas" de los `on*=` (`delegacion.js:6-7`).
4. `data-on` solo se emite si difiere de `'click'`.

**Call-sites reales** (348 en total, `grep -rn "accionHTML(" frontend/src --include='*.js' | grep -v lib/delegacion.js | wc -l` → 348):

- Click simple con un arg: `frontend/src/modules/persistencia-local.js:334` — `<button ${accionHTML('snap.revertir', i)} …>Revertir</button>`
- Evento no-click: `frontend/src/modules/plan-rodaje.js:316` — `` `<textarea class="pr-ta" … ${accionHTML('pr.d', 'prSetFilaField', id, key, '§v§', { on: 'change' })}>` `` (además ilustra despacho de segundo nivel + centinela).
- Multi-evento (ciclo de vida de combobox): `frontend/src/modules/info-proyecto.js:212` — `${accionHTML('info.contactoCombo', 'contactoCliente', { on: 'focus input blur change' })}` y `frontend/src/lib/ui.js:502` — `accionHTML('ui.respCombo', key, { on: 'focus input blur change' })`.
- Condicional dentro de template: `frontend/src/modules/gastos.js:213` — `` `<button class="btn btn-secondary btn-sm" ${accionHTML('go.exportChipax', project.id)}>⬇ Exportar a Chipax</button>` ``.

Alternativa manual equivalente: 374 apariciones de `data-accion=` escritas directo en template literals (`grep -rn 'data-accion=' frontend/src --include='*.js' | grep -v accionHTML | wc -l`), p.ej. `plan-rodaje.js:652` — `<select data-accion="pr.d" data-args="[&quot;selectHojaDia&quot;,&quot;§v§&quot;]" data-on="change">` — con el escaping HTML hecho a mano.

---

## 5. Despachadores de segundo nivel: `cfg.fn`, `pr.d`, `pre.d` y los centinelas `§…§`

Los tres módulos gordos no registran una acción por función: registran **una** acción-router que despacha por nombre (`a[0]`) contra un **mapa local** del módulo. Esto mantiene el namespace global pequeño (`pr` = 9 acciones que cubren 50 funciones; `pre` = 23 que cubren 71; `cfg` = 14 que cubren 52 — claves contadas con script regex sobre cada `var _X_FN = {…}`).

**Implementaciones (encontradas con `grep -rn '§' frontend/src --include='*.js'` y `grep -n '_CFG_FN\|_PRE_FN\|_prSent\|_preSent'`):**

- `modules/plan-rodaje.js:1410-1461` — `var _PR_FN = { … }` (50 claves, todas thunks: `prAddImagen: function () { return prAddImagen.apply(null, arguments); }`).
- `modules/plan-rodaje.js:1462` — `function _prSent(x, el, ev) { return x === '§v§' ? el.value : x === '§c§' ? el.checked : x === '§el§' ? el : x === '§ev§' ? ev : x; }`
- `modules/plan-rodaje.js:1464` — `d: function (a, el, ev) { var f = _PR_FN[a[0]]; if (!f) { console.error('[pr] fn sin mapear:', a[0]); return; } f.apply(null, a.slice(1).map(function (x) { return _prSent(x, el, ev); })); }`
- `modules/presupuesto-cotizacion.js:4370-4442` — `var _PRE_FN = { … }` (71 claves; mezcla thunks locales y **ganchos**: `crewAddToBD: gancho('crewAddToBD')`, `mentionInput: gancho('mentionInput')`, `openHorasExtraCalc: gancho('openHorasExtraCalc')`, `updateInfoField: gancho('updateInfoField')` — líneas 4415, 4420, 4429, 4440).
- `modules/presupuesto-cotizacion.js:4443` — `_preSent`, copia idéntica de `_prSent`.
- `modules/presupuesto-cotizacion.js:4445` — `d:` idéntico patrón, error `'[pre] fn sin mapear:'`.
- `modules/config.js:2122-2142` — `var _CFG_FN = { … }` (52 claves; estilo mixto: referencias directas `_empShowSub: _empShowSub` junto a wrappers de aridad cero `closeConfigPanel: function () { closeConfigPanel(); }` y ganchos `toggleAdminMode: function () { gancho('toggleAdminMode')(); }`).
- `modules/config.js:2144` — `fn: function (a) { var f = _CFG_FN[a[0]]; if (f) f.apply(null, a.slice(1)); else console.error('[cfg] fn sin mapear:', a[0]); }` y `:2154` — `enter:` (variante que solo dispara con `ev.key === 'Enter'`). **`cfg.fn` no tiene fase de centinelas** — no puede recibir `el.value`.

**Centinelas.** El problema: `data-args` es JSON estático horneado en render-time, pero muchos handlers necesitan valores que solo existen en dispatch-time. Solución: strings reservados que el router sustituye posicionalmente antes del `apply`:

| centinela | se sustituye por |
|---|---|
| `'§v§'` | `el.value` |
| `'§c§'` | `el.checked` |
| `'§el§'` | el elemento (`el`) |
| `'§ev§'` | el evento nativo (`ev`) |

Ejemplo end-to-end: `plan-rodaje.js:756` — `${accionHTML('pr.d', 'toggleCrewPresente', sel, nm, '§c§', { on: 'change' })}` genera `data-accion="pr.d" data-args="[&quot;toggleCrewPresente&quot;,…,&quot;§c§&quot;]" data-on="change"`; al `change`, `pr.d` resuelve `_PR_FN.toggleCrewPresente` y lo invoca con `(sel, nm, el.checked)`. Ejemplo con `§el§`: `plan-rodaje.js:314` — `accionHTML('pr.d', 'prAddImagen', id, imgKey, '§el§', { on: 'change' })` pasa el `<input type=file>` entero para leer `input.files` (`prAddImagen(id, imgKey, input)`, `plan-rodaje.js:520`). Solo dos archivos implementan centinelas (`grep -l "§v§"` → `plan-rodaje.js`, `presupuesto-cotizacion.js`).

**Por qué los mapas son perezosos (thunks) — orden de eval.** El literal `var _PRE_FN = {…}` se evalúa en el **eval del módulo**, no en el click. Dos consecuencias:

1. Las entradas cross-módulo **deben** ser perezosas: `crewAddToBD` la define `bd.js:1190` vía `define()`, y `presupuesto-cotizacion.js` se evalúa **antes** que `bd.js` (posición 3 vs 8 en el manifiesto `main.js:16-22`; además `bd.js:17` importa `calcSummaryFin` de presupuesto, así que el import inverso sería ciclo ESM). `gancho('crewAddToBD')` devuelve un wrapper inmediatamente utilizable que resuelve el registro **en cada invocación** (`ganchos.js:23-29`) — el mapa puede construirse antes de que exista el productor.
2. Las entradas locales usan thunks `function () { return X.apply(null, arguments); }` por uniformidad y para desacoplar el mapa del *kind* de la declaración: la entrada nunca captura el valor en eval-time (inmune a TDZ si una función migra a `const`, a reordenamientos del archivo y a reasignaciones posteriores), y el mapa completo puede generarse mecánicamente sin auditar cada nombre. La resolución nombre→función ocurre siempre en dispatch-time (doble pereza: `_PR_FN[a[0]]` en el click, y el deref del identificador dentro del thunk).

Volumen de uso de los routers (contado con `str.count` por patrón): `pr.d` → 49 `accionHTML` + 33 `data-accion` manuales; `pre.d` → 51 + 35; `cfg.fn` → 20 + 57.

---

## 6. `frontend/src/lib/ganchos.js` — inversión de dependencias (34 líneas, archivo completo)

```js
// D4 · Ganchos — la inversión uniforme de TODAS las aristas hacia-arriba.
//
// Un módulo TEMPRANO (p.ej. nav, dal, ui) necesita invocar algo que define un
// módulo TARDÍO (p.ej. renderDocumentos). Importarlo crearía un ciclo ESM o un
// hoist peligroso; window era el viejo tablón de anuncios. El gancho es el
// reemplazo tipado y greppable:
//
//   productor (tardío):   define('renderDocumentos', renderDocumentos);
//   consumidor (temprano): gancho('renderDocumentos')(...args)   // en RUNTIME
//   valores no-función:    define('MODULES', MODULES); … valor('MODULES')
//
// Todos los define() corren al EVAL del productor (antes de DOMContentLoaded);
// toda invocación es runtime post-arranque — nunca hay carrera. Un gancho sin
// definir grita en consola con su nombre (jamás falla en silencio).

const REGISTRO = {};

export function define(nombre, fn) {
  if (REGISTRO[nombre] && REGISTRO[nombre] !== fn) console.warn('[ganchos] redefinición de', nombre);
  REGISTRO[nombre] = fn;
}

export function gancho(nombre) {
  return function () {
    const f = REGISTRO[nombre];
    if (typeof f !== 'function') { console.error('[ganchos] sin definir:', nombre); return undefined; }
    return f.apply(null, arguments);
  };
}

export function valor(nombre) {
  if (!(nombre in REGISTRO)) console.error('[ganchos] valor sin definir:', nombre);
  return REGISTRO[nombre];
}
```

**Contrato:**
- `define(nombre, fn)`: registro global; sobreescribe siempre; si el nombre ya existía con **otro** valor emite `console.warn('[ganchos] redefinición de', nombre)` (no lanza). Corre en el eval del productor.
- `gancho(nombre)`: **no resuelve** — devuelve un wrapper que resuelve `REGISTRO[nombre]` en **cada llamada** (`f.apply(null, arguments)`). Si en ese momento no hay función: `console.error('[ganchos] sin definir:', nombre)` y retorna `undefined` (nunca lanza, nunca en silencio). Esto hace seguro capturar el wrapper en eval-time (p.ej. dentro de `_PRE_FN`, §5).
- `valor(nombre)`: lectura **inmediata** para no-funciones; `console.error` si el nombre no existe (usa `in`, así que un `define(x, undefined)` legítimo no gritaría). 3 nombres son valores: `MODULES`, `ESPACIO_DEMO`, `_orgLogos`.
- **Invariante temporal** (documentada en `ganchos.js:12-13` y verificada por construcción): todo `define` es top-level de módulo (eval, pre-DOMContentLoaded); toda invocación de wrapper es post-arranque → no hay carrera. Todos los nombres son **literales** (`grep "gancho(" | grep -v "gancho('"` → 0 usos no-literales): el registro es 100% greppable.

**Censo** (script Python: regex `define\('…'` / `gancho\('…'` / `valor\('…'` sobre `src/`, excluyendo `lib/ganchos.js` y líneas de comentario): **108 nombres definidos; 105 consumidos (102 vía `gancho`, 3 vía `valor`); 189 call-sites `gancho()` + 5 `valor()` en 16 archivos consumidores; 3 defines sin consumidor** (ver Hallazgos). Coincide con la compuerta "105/105" del commit `4c8067b`.

### Tabla completa del registro, por clúster

**A. Renders de navegación** — productor: cada módulo de pantalla; consumidor: `lib/nav.js` (los `render:` de `MODULES`, `nav.js:48-181`, todos con arrow diferido `render: () => gancho('renderX')()`):

| nombre | define | consumidor |
|---|---|---|
| renderInfoProyecto | info-proyecto.js:592 | nav.js:55 |
| renderBDPersonas | bd.js:1193 | nav.js:64 |
| renderPresupuesto | presupuesto-cotizacion.js:4479 | nav.js:73 |
| renderCrew | crew.js:362 | nav.js:82 |
| renderCargos | cargos.js:450 | nav.js:91 |
| renderRodajes | rodajes.js:226 | nav.js:100 |
| renderLocaciones | locaciones.js:909 | nav.js:109 |
| renderHojaLlamado | plan-rodaje.js:1487 | nav.js:118, presupuesto-cotizacion.js |
| renderPlanRodaje | plan-rodaje.js:1488 | nav.js:127 |
| renderLegal | legal.js:925 | nav.js:136 |
| renderNotificaciones | notificaciones.js:734 | nav.js:145 |
| renderDocumentos | documentos.js:224 | nav.js:154 |
| renderCotizacion | presupuesto-cotizacion.js:4478 | nav.js:181 |

**B. Soporte de navegación** — consumidos por `nav.js`/`ui.js`: `_firstVisibleModule` (boot.js:729 → nav.js:16, kanban.js), `refreshSidebarTaskCounters` (tareas.js:333 → nav.js:30), `_lastViewSave` (kanban.js:360 → nav.js:31), `applyModuleReadonly` (boot.js:732 → nav.js:245, presupuesto), `MODULES` **[valor]** (nav.js:194 → ui.js:511; comentario en el define: *"ui.js lo consume vía valor() (ui→nav sería ciclo: nav importa sectionResponsableHTML de ui)"*).

**C. Identidad/boot → dal** — productor `lib/boot.js:728-737`, consumidor principal `modules/dal.js` (el DAL evalúa antes que boot en el grafo): `_bootCoverHide` (boot.js:728 → dal.js, 8 usos), `aplicarMarcaOrg` (boot.js:731 → dal.js), `applyPermisosUI` (boot.js:733 → dal.js), `currentUser` (boot.js:734 → gastos/kanban/tareas, **20 usos** — el gancho más consumido), `orgNombre` (boot.js:735 → dal, presupuesto, 9 usos), `renderTopbarUser` (boot.js:736 → dal.js, 3), `setCurrentUser` (boot.js:737 → dal.js, 2), `_setOrgActiva` (boot.js:730 → **sin consumidor gancho**, ver Hallazgos).

**D. Hooks del DAL hacia módulos** (dal necesita lógica de dominio de módulos tardíos): `_cargoContactIdPorNombre` (cargos.js:447), `_cargosDerivarRECI` (cargos.js:448), `_cargosKey` (cargos.js:449, 2 usos) — los tres → dal.js.

**E. Espacio de usuario / arranque** — productor `espacio.js:444-450`, consumidor `boot.js`: `ESPACIO_DEMO` **[valor]** (→ boot.js:586), `_espConstruir` (3), `_espInyectarCtaProductora`, `_espInyectarHerramientas` (2), `_espInyectarInvitaciones` (2), `_swToggle` (→ acción `app.swToggle`, boot.js:708), `renderEspacioUsuario` (4). Más `abrirInvitacionRecibida` (invitaciones.js:215 → boot.js).

**F. Config/onboarding/perfil** — productor `config.js:2161-2171` y `perfil-onboarding.js:605-606`, consumidores boot/bd/kanban/presupuesto: `_configPanelOpen` (→ boot), `_cpTourInicialQuizas` (→ boot.js:578), `_invAbrirDatos` (→ bd.js, 2), `abrirFlujoCrearProductora` (→ boot), `closeConfigPanel` (→ boot), `irAlPanelPersonal` (→ kanban, 2), `openConfigPanel` (→ boot, 2 — acción `app.config`, boot.js:714), `orgLogo` (→ presupuesto), `_orgLogos` **[valor]** (config.js:2171 → presupuesto, 3), `abrirPerfilUsuario` (perfil-onboarding.js:606 → boot), `_regionCanonica` (perfil-onboarding.js:605 → ui.js), `_pdCookiesBootCheck` (config.js:2164 → **sin consumidor**, ver Hallazgos).

**G. Persistencia/admin**: `autosaveNow` (persistencia-local.js:632 → ui, 2), `markDirty` (:635 → ui), `exportSave` (:633 → config — acción `cfg.guardarOS`), `exportSingleProject` (:634 → kanban), `openSnapshotsModal` (:636 → config), `_puedeModoAdmin` (admin.js:393 → persistencia-local), `exportSupabaseBackup` (admin.js:394 → config), `toggleAdminMode` (admin.js:395 → config), `updateProjectState` (admin.js:396 → info-proyecto).

**H. BD / Excel** — productores `bd.js:1190-1195` y `bd-excel.js:749-759`, consumidores ui/modelo/presupuesto/locaciones: `archivarLocacionModal` (bd.js:1195 → locaciones), `crewAddToBD` (bd.js:1190 → ui, presupuesto, 3), `openPersonaByName` (bd.js:1191 → ui — acción `ui.verPersona`), `openPersonaForm` (bd.js:1192 → ui), `_codigoBancoSBIF` (bd-excel.js:749 → modelo, ui), `_nombreBancoOficial` (:750 → modelo), `_normKey` (:751 → ui, presupuesto, 6), `_normNameBD` (:752 → ui), `downloadBDPlantilla` (:753 → bd), `ensureExcelJS` (:754 → presupuesto), `exportBDExcelV71` (:755 → bd), `importBDExcelV71` (:756 → bd), `triggerBDExcelImport` (:757 → bd), `buildPersonasDatalist` (:759 → presupuesto).

**I. Tareas/kanban**: `ensureTareas` (tareas.js:336 → kanban), `mentionBlur` (:330 → presupuesto, 2), `mentionInput` (:331 → presupuesto, 2), `openTareasModal` (:332 → ui — acción `ui.tareas`), `sectionTaskCount` (:334 → ui), `renderMisTareas` (:337 → kanban), `userSenales` (:338 → kanban).

**J. Calculadoras → presupuesto**: `_heComputeCosto` (calculadoras.js:650), `openCalculadoraTributaria` (:651), `openCostoRealCalc` (:652), `openHeProyectoDefault` (:653), `openHorasExtraCalc` (:654), `setHeHoras` (:655) — todos consumidos por presupuesto-cotizacion.js (varios embebidos en `_PRE_FN`, §5).

**K. Gastos ⇄ presupuesto/calc**: `_syncGastosCostoReal` (gastos.js:1691 → calc.js, presupuesto, 3), `goLineaRealGastado` (:1692 → presupuesto), `goLineaTieneCaja` (:1693 → presupuesto), `renderGastos` (:1695 → presupuesto, 2), `updateRowField` (presupuesto-cotizacion.js:4480 → **lib/calc.js** — el único gancho consumido por la librería de cálculo), `_markRowDirty` (info-proyecto.js:591 → presupuesto, 8), `updateInfoField` (info-proyecto.js:593 → presupuesto), `goSavePresup` (gastos.js:1694 → **sin consumidor**, ver Hallazgos).

**L. Plan de rodaje → locaciones/presupuesto** (utilidades de tiempo/imagen/print): `prCompressImage` (plan-rodaje.js:1481), `prComputeTimes` (:1482), `prFmtClock` (:1483, 4 usos), `prFmtDur` (:1484, 2), `prNormalizeDur` (:1490), `prParseHM` (:1485, 6) — todos → locaciones.js (scouting reutiliza el motor horario del plan); `printViaIframe` (:1486 → locaciones, presupuesto, 3); `getCrewForExport` (crew.js:361 → plan-rodaje).

**M. Locaciones → modelo**: `bdLocFind` (locaciones.js:906 → modelo, 2), `nextLocIdBD` (:907 → modelo), `projLocFind` (:908 → modelo).

**N. Otros dominio**: `legalRep` (legal.js:924 → presupuesto, 2), `_dalEmpresaSaveSoon` (dal.js:1897 → ui), `_dalPerfilSaveSoon` (dal.js:1898 → presupuesto, 3), `dalGuardarEmpresa` (dal.js:1899 → ui).

---

## 7. Reglas de decisión: import vs gancho vs acción delegada

Las reglas son consistentes en todo el árbol y se pueden enunciar como invariantes:

1. **Arista hacia abajo (o lateral sin ciclo) → import ESM.** Si el destino evalúa antes en el grafo (lib/* o un módulo del que ya se depende), se importa con nombre: `plan-rodaje.js:10` importa `closeModal` de `lib/ui.js`; `bd.js:17` importa `calcSummaryFin` de presupuesto. El import da binding estático, tree-shaking y verificación en build.
2. **Arista hacia arriba (temprano → tardío) o que cerraría ciclo → gancho.** Criterio literal de `ganchos.js:3-5`: *"Importarlo crearía un ciclo ESM o un hoist peligroso"*. Casos canónicos: `nav.js` no puede importar los 13 renders (los módulos importan `nav` para `navigateToModule(moduleKey)`, `nav.js:13`); `ui.js` consume `MODULES` vía `valor()` porque `nav→ui` ya existe por import (`nav.js:10,194`); presupuesto consume `crewAddToBD` por gancho porque `bd→presupuesto` ya existe por import (`bd.js:17` vs `_PRE_FN` `presupuesto-cotizacion.js:4415`). El timing lo garantiza el contrato: `define` en eval, invocación en runtime.
3. **Funciones se consumen con `gancho()` (perezoso, por-invocación); datos con `valor()` (inmediato)** — 105 nombres función vs 3 valores.
4. **DOM → módulo, siempre acción delegada.** Ningún HTML generado invoca funciones: emite `data-accion` (vía `accionHTML` o literal) y el módulo dueño registra el handler en **su propio namespace** (convención 1 namespace ≈ 1 módulo; únicas excepciones: `boot.js` registra `boot` y `app`, y `ui` centraliza las universales). La dirección de la arista es DOM→registro→módulo: el emisor del HTML no necesita conocer al implementador (p.ej. un modal de presupuesto puede emitir `ui.backdrop` sin importar ui).
5. **Dentro de un módulo grande, despacho de segundo nivel** (`pr.d`/`pre.d`/`cfg.fn`) para no inflar el registro global, con centinelas `§v§/§c§/§el§/§ev§` para inyectar estado de dispatch-time en args de render-time (§5).
6. **`window` ya no es canal**: quedan 184 referencias `window.` (`grep -rn 'window\.' … | wc -l`, incluye usos legítimos tipo `window.open`), tras la purga 962→73 props declarada en el merge `5e1d621`; los bridges restantes están comentados como tales (p.ej. `config.js:2110-2119`).
7. **Compuertas del sistema** (commits `a040649`, `4c8067b`): todo uso de `gancho/valor/define` exige su import; todo nombre consumido debe tener `define`. Reproduje la segunda: 105 nombres consumidos / 105 con productor. Y la equivalente de delegación: 364 acciones usadas / 364 registradas (§2).

---

## Hallazgos

1. **BUG latente — `lib/boot.js:578`: identificador `_pdCookiesBootCheck` sin declarar.** La cadena de boot ejecuta `try { setTimeout(_pdCookiesBootCheck, 1200); } catch (e) {}`, pero `boot.js` **no importa** ese símbolo (imports: `boot.js:9-24`, sin `config.js`), no existe `window._pdCookiesBootCheck` (grep vacío) y no usa `gancho('_pdCookiesBootCheck')` (grep vacío). Resultado: `ReferenceError` **silenciado por el try/catch** — el banner de cookies (Plan G §2) nunca se dispara por la vía del boot normal; solo funciona la vía de `espacio.js:348`, que sí lo importa (`espacio.js:13`). El `define('_pdCookiesBootCheck', …)` de `config.js:2164` existe y tiene **cero consumidores**: todo indica una conversión a gancho que quedó a medias (debió ser `gancho('_pdCookiesBootCheck')` en boot.js:578, como su vecino `gancho('_cpTourInicialQuizas')` en la misma línea).
2. **Defines muertos en el registro** (censo §6): `_setOrgActiva` (boot.js:730 — se consume solo vía import ESM en invitaciones.js:10, espacio.js:16, config.js:23) y `goSavePresup` (gastos.js:1694 — único uso es local, gastos.js:1647). Registro sin consumidor = ruido para la compuerta y falsa señal de arista invertida.
3. **Doble canal para el mismo símbolo**: `_setOrgActiva` y `_pdCookiesBootCheck` están simultáneamente exportados/importados por ESM **y** definidos como gancho. Sin regla que prohíba el doble mecanismo, el lector no puede saber cuál es el canal canónico.
4. **`_CFG_FN` es inconsistente con `_PR_FN`/`_PRE_FN`** (`config.js:2122-2142` vs `plan-rodaje.js:1410`, `presupuesto-cotizacion.js:4370`): mezcla referencias directas (`saveEmpresaPerfil: saveEmpresaPerfil`) con wrappers de **aridad cero** (`closeConfigPanel: function () { closeConfigPanel(); }`) que tragan argumentos, mientras `cfg.fn` (`config.js:2144`) hace `f.apply(null, a.slice(1))` como si todos los aceptaran. Además `cfg.fn` **no tiene centinelas** `§…§`: no puede pasar `el.value`/`el.checked`, lo que obliga a acciones ad-hoc paralelas (`cfg.perfilSel`, `cfg.logoNombre`, `config.js:2155-2156`).
5. **Duplicación literal de `_prSent`/`_preSent`** (`plan-rodaje.js:1462` y `presupuesto-cotizacion.js:4443`, byte a byte idénticas): el mecanismo de centinelas es candidato obvio a vivir en `lib/delegacion.js` como helper compartido; hoy cada módulo re-implementa el protocolo.
6. **Colisión teórica de centinelas con datos**: la sustitución opera sobre **valores** de args (`a.slice(1).map(_prSent)`), así que cualquier arg cuyo dato real sea la cadena `'§v§'`/`'§c§'`/`'§el§'`/`'§ev§'` (p.ej. un nombre de persona horneado en `accionHTML('pr.d','updateCrewOverride', sel, nm, …)`, `plan-rodaje.js:757`) sería reemplazado en despacho. Improbable, pero el protocolo no tiene escape.
7. **Fragilidad asumida de la fase burbuja** (`delegacion.js:50-53`): cualquier `stopPropagation()` de un listener directo aguas abajo (propio o de una lib de terceros) mata silenciosamente las acciones delegadas de esa rama. Está documentado como decisión de paridad de migración; terminada la migración, la justificación original ("convivencia con on*= inline") ya no aplica y no se re-evaluó.
8. **Errores solo-consola en producción**: los tres canales degradan a `console.error/warn` sin telemetría ni rethrow (`delegacion.js:42,45,47`; `ganchos.js:19,26,32`; routers `plan-rodaje.js:1464`, `presupuesto-cotizacion.js:4445`, `config.js:2144`). Coherente con "jamás falla en silencio" en consola, pero en GitHub Pages nadie observa esa consola: un `data-args` corrupto o un gancho sin definir en producción es invisible.
9. **Cosmético/deuda menor**: variable local llamada `onclick` que ya no contiene un onclick (`gastos.js:281` — `onclick = ' ' + accionHTML('go.sort', sortKey);`); comentario desactualizado en `boot.js:703-704` (*"resuelven vía window (bridges vigentes hasta D3)"*) cuando D4 ya purgó esos bridges; `ui.js:783-784` declara PENDIENTE la conversión de `regionSelectHTML/bancoSelectHTML` que "aún emiten opts.onchange inline" — verificar si sigue vigente, porque contradiría la CSP sin `unsafe-inline` si quedara HTML vivo con `onchange=`.