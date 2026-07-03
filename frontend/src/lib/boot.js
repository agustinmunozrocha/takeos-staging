// Boot de TakeOS — extraído de index.html (Etapa C6, cierre del vaciado del <script>)
// Importado AL FINAL de main.js: cuando evalúa, todos los bridges del sistema existen.
// El veil ahora nace en el HTML estático (anti-flash CSS-first); aquí solo se gobierna.

// D1e · imports reales — la mitad IMPORT del ciclo duro boot⇄dal (down-call
// del orquestador). DIFERIDOS anti-ciclo: config, espacio, invitaciones,
// perfil-onboarding (todos importan boot; sus símbolos siguen vía window).
// VETADO: _TIENE_EMPRESA (boot lo escribe).
import { supabaseInit } from './supabase.js';
import { dalBootTaxRates } from './rates.js';
import { BD_CONTACTOS, BD_EMPRESAS, BD_EMPRESAS_BYID, BD_LEGAL, BD_LEGAL_TPL, BD_LOC, BD_PERSONAS, BD_TALENTOS, EMPRESA_PERFIL, PROJECTS, STATE, TAKEOS_VERSION, TRASH, setOrgId, setSource, setTakeosAcceso, setTieneEmpresa, setUserNombre, setUserApellido, setUsuarioActual, TAKEOS_PERFIL, USER_APELLIDO, USER_NOMBRE, USUARIO_ACTUAL, _TIENE_EMPRESA } from './state.js';
import { authNivel, authNivelModulo, authPuedeVer } from './auth.js';
import { applyStoredTheme, setupTooltipListeners, showModal } from './ui.js';
import { newProject, renderKanban, renderMetrics, navigateToControlRoom } from '../modules/kanban.js';
import { notifInit, bellToggle, notifMarcarTodas } from '../modules/notificaciones.js';
import { autosaveNow, markDirty, redoLast, undoLast, importSaveFromInput, importSingleProjectFromInput } from '../modules/persistencia-local.js';
import { dalBootContactos, dalBootLegal, dalBootLocaciones, dalBootPerfil, dalBootPersonasExternos, dalBootProyectos, dalFlushProyectos, dalLoadPermisos, dalResetOrg, dalResolveIdentidad, dalTouchProyecto } from '../modules/dal.js';
import { openGlobalCFO } from '../modules/gastos.js';

import { registrarAcciones } from './delegacion.js';
import { _gsearchHide, globalSearchInput, globalSearchKey } from '../modules/buscador.js';
import { navigateToModule } from './nav.js';
import { openTrash } from '../modules/info-proyecto.js';
import { gancho, valor, define } from './ganchos.js';
function currentUser() {
  if (USUARIO_ACTUAL && String(USUARIO_ACTUAL).trim()) return USUARIO_ACTUAL;
  const ep = (typeof EMPRESA_PERFIL !== 'undefined') ? EMPRESA_PERFIL : {};
  if (ep.remitenteNombre) return ep.remitenteNombre;
  if (typeof BD_PERSONAS !== 'undefined') { const ks = Object.keys(BD_PERSONAS); if (ks.length) return ks[0]; }
  return 'Yo';
}
function setCurrentUser(name) { setUsuarioActual(name || ''); try { localStorage.setItem('takeos_usuario_actual', window.USUARIO_ACTUAL); } catch (e) {} try { renderMetrics(); renderKanban(); } catch (e) {} }
(function(){ try { const u = localStorage.getItem('takeos_usuario_actual'); if (u) setUsuarioActual(u); } catch (e) {} })();

// TAREAS/SEÑALES: ensureTareas, ensureSenales, marcarSenal*, senalAplica, userSenales, menciones, openTareasModal, _tm*, renderTareasModal, tm*, renderMisTareas, crtToggle, crtGoTask, crtGoSenal, STORAGE_BUCKET_ADJUNTOS → movido a src/modules/tareas.js (Etapa C3)
/* renderMetrics, renderKanban, renderProjectCard -> movidos a src/modules/kanban.js (Etapa 2) */

/* ════════════════════════════════════════════════════════════════════
   NAVEGACIÓN
   ════════════════════════════════════════════════════════════════════ */

/* V11.15.0 · FRENTE B · "dejar al usuario donde estaba" tras recargar (F5).
   Snapshot de la vista actual en sessionStorage (sobrevive a la recarga del
   mismo tab; se borra al cerrar el tab, como takeos_ir_proyecto). Guarda la
   org activa para validar la restauración contra las membresías reales y no
   cruzar cuentas. La restauración (lectura) vive en el arranque (B2). */
/* _LV_KEY, _lastViewSave, _lastViewLeer, navigateToControlRoom, projectClientNet,
   navigateToProject -> movidos a src/modules/kanban.js (Etapa 2) */

// NAVEGACIÓN+MODULES: navigateToModule, registro MODULES (window.MODULES viaja adentro) → movido a src/lib/nav.js (Etapa C5)

// PLAN DE RODAJE: renderPlanRodaje, pr* (todas), PR_DRAG_ID → movido a src/modules/plan-rodaje.js (Etapa A2)
// TIPO DE CUENTA + CUMPLEAÑOS: TIPOS_CUENTA, tipoCuentaSelectHTML, _cumple*, cumple*SelectHTML → movido a src/modules/bd.js (Etapa A3)

/* ════════════════════════════════════════════════════════════════════
   V8.5 · RESPONSABLE POR SECCIÓN / PESTAÑA
   Un único responsable por sección. Default por rol (resuelto desde Info
   Proyecto cuando aplica). Sin responsables por tarea (queda para futuro).
   ════════════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === ',') {
    e.preventDefault();
    gancho('_configPanelOpen')()() ? gancho('closeConfigPanel')() : gancho('openConfigPanel')();
  }
  if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
    const ae = document.activeElement;
    const editando = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
    if (!editando) { e.preventDefault(); undoLast(); }   // deja el deshacer nativo dentro de campos de texto
  }
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    const ae = document.activeElement;
    const editando = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
    if (!editando) { e.preventDefault(); redoLast(); }
  }
});
const AUTH_RETORNO_OAUTH = /[#?&](access_token|refresh_token|code)=/.test(window.location.hash + ' ' + window.location.search);
/* V11.3.0 · token de invitación en la URL (?invitacion=...). Se guarda en
   sessionStorage porque el viaje a Google y de vuelta pierde el query. */
try { var _invm = /[?&]invitacion=([A-Za-z0-9_-]+)/.exec(window.location.search); if (_invm) sessionStorage.setItem('takeos_inv_pendiente', _invm[1]); } catch (e) {}
/* V11.3.0 · sesión breve: una sesión restaurada del navegador es válida solo
   durante AUTH_TTL_HORAS desde la última autenticación explícita Y solo para
   el mismo usuario que se autenticó. Fuera de eso, se exige login de nuevo. */
const AUTH_TTL_HORAS = 12;
/* Base de datos por ENTORNO. Los valores se inyectan en build desde los
   archivos .env (fuente única): .env.production (real) y .env.staging.
   Cada build lleva SOLO su propia base — producción no expone staging. */
/* SUPABASE_URL/KEY + sb + supabaseInit -> movidos a src/lib/supabase.js (Etapa 1); supabaseInit y sb expuestos en window via src/main.js */
/* Cerrar sesión. Por ahora se llama desde la consola: logoutTakeOS()
   Próximo paso: un botón "Salir" en la barra superior. */
window.logoutTakeOS = async function () {
  try { if (sb) await sb.auth.signOut(); } catch (e) {}
  try { localStorage.removeItem('takeos_auth_at'); localStorage.removeItem('takeos_auth_uid'); localStorage.removeItem('takeos_usuario_actual'); localStorage.removeItem('takeos_usuario_uid'); } catch (e) {}
  location.reload();
};
/* Cierre de sesion con confirmacion (boton "Salir" de la barra superior). */
window.confirmLogout = function () {
  showModal({
    danger: false,
    title: 'Cerrar sesion',
    body: 'Vas a cerrar tu sesion de TakeOS en este navegador. \u00bfContinuar?',
    confirmLabel: 'Cerrar sesion',
    cancelLabel: 'Cancelar',
    onConfirm: () => { logoutTakeOS(); },
    onCancel: () => {}
  });
};

/* ════════════════════════════════════════════════════════════════════
   V9.1.0 — CAPA DE ACCESO A DATOS (DAL) · lectura de Contactos y Empresas
   desde Supabase / PostgreSQL.
   Es "el Productor" del software: el resto de la app le pide los datos sin
   saber de qué tabla vienen. Hoy esta capa lee la Tanda 1
   (personas + empresas, con sus tablas satelite) y re-arma EXACTAMENTE el
   mismo modelo en memoria (BD_CONTACTOS / BD_EMPRESAS_BYID) que el resto del
   sistema ya consume, de modo que ninguna otra parte de la UI cambia.
   La ESCRITURA por ficha va a Supabase (ver dalGuardarContacto / dalGuardarEmpresa); el respaldo es el airbag en localStorage.
   ════════════════════════════════════════════════════════════════════ */
/* V10.9.0 · Motor de organización activa.
   ORG_ID deja de ser una constante fija: ahora es la organización ACTIVA del
   usuario en sesión, resuelta desde sus membresías al arrancar (o elegida en el
   espacio de usuario). El valor por defecto (Primate) queda como respaldo para
   no dejar sin contexto a la sesión si la resolución fallara; el equipo actual
   (todos internos de Primate, una sola membresía) resuelve siempre a Primate,
   de modo que su comportamiento no cambia. Toda la app sigue consumiendo ORG_ID
   igual que antes: lo único que cambió es de dónde sale su valor. */
/* ORG_ID -> a src/lib/state.js (Etapa 1); en window */
const _ORG_LS_KEY = 'takeos_org_activa';
const _ORG_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function _setOrgActiva(orgId){
  try{
    var s = String(orgId == null ? '' : orgId).trim();
    if (!_ORG_UUID_RE.test(s)) return false;     // valor inválido: no tocamos la org actual
    /* D0 · cambio REAL de organización → resetear TODO el estado en memoria de
       la org anterior. Sin esto, dalBootProyectos fusionaba los proyectos de la
       nueva org SOBRE los de la vieja (mezcla de datos entre organizaciones) y
       los flags *_SOURCE one-way impedían recargar. Hallazgo 🔴 de la Fase 0. */
    if (s !== window.ORG_ID) {
      try {
        /* Rescate del guardado pendiente ANTES de demoler el estado: si el
           usuario editó dentro de la ventana del debounce (1,5 s), el touch
           re-encola lo sucio y el flush arma el payload SÍNCRONO con la org
           saliente (el RPC resuelve la org de filas existentes desde la BD,
           así que el write tardío no puede cruzarse). Sin esto, la edición se
           descartaba en silencio al cambiar de productora. */
        try { if (window.STATE && window.STATE.currentProject && window.dalTouchProyecto) window.dalTouchProyecto(window.STATE.currentProject); } catch (e) {}
        try { if (window.dalFlushProyectos) window.dalFlushProyectos(); } catch (e) {}
        PROJECTS.length = 0; TRASH.length = 0;
        [BD_LOC, BD_LEGAL, BD_LEGAL_TPL].forEach(function (a) { a.length = 0; });
        [BD_CONTACTOS, BD_EMPRESAS_BYID, BD_PERSONAS, BD_TALENTOS, BD_EMPRESAS].forEach(function (o) {
          Object.keys(o).forEach(function (k) { delete o[k]; });
        });
        Object.keys(EMPRESA_PERFIL).forEach(function (k) { delete EMPRESA_PERFIL[k]; });
        setSource('contacts', 'pending'); setSource('locations', 'pending');
        setSource('legal', 'pending'); setSource('perfil', 'pending');
        setSource('projects', 'pending');
        setTakeosAcceso(null);                      // fail-closed hasta dalLoadPermisos de la nueva org
        if (window.STATE) window.STATE.currentProject = null;
        if (window.dalResetOrg) window.dalResetOrg();     // sets de IDs conocidos + timers pendientes del DAL + época (aborta cadenas de boot en vuelo)
        if (window._persisResetOrg) window._persisResetOrg();   // pilas de deshacer + timer de autosave de la org anterior
        /* Reset de VISTA (el modelo ya está limpio, pero la vista NO): si el
           cambio de org ocurre desde dentro de un proyecto, el #projectView de
           la org anterior quedaba VISIBLE (sidebar/breadcrumb/inputs con sus
           nombres) mientras el kanban nuevo se pintaba en el #controlRoomView
           oculto — la "vista fantasma" que se leía como sangrado entre orgs.
           Inline y NO navigateToControlRoom(): su guarda !_TIENE_EMPRESA
           redirige al Panel según el orden del llamador, y esto debe cubrir
           también los early-returns del boot (error de red / org sin filas). */
        try {
          if (window.STATE) { window.STATE.currentView = 'control-room'; window.STATE.currentModule = null; }
          var _pv = document.getElementById('projectView'); if (_pv) _pv.classList.add('hidden');
          var _crv = document.getElementById('controlRoomView'); if (_crv) _crv.classList.remove('hidden');
          var _bdv = document.getElementById('bdGlobalView'); if (_bdv) _bdv.classList.add('hidden');
          var _mm = document.getElementById('moduleMain'); if (_mm) _mm.innerHTML = '';
          var _bm = document.getElementById('bdGlobalMain'); if (_bm) _bm.innerHTML = '';
          var _sp = document.getElementById('sidebarProject'); if (_sp) _sp.innerHTML = '';
          var _bc = document.getElementById('breadcrumb'); if (_bc) _bc.innerHTML = '<span class="breadcrumb-current">Control Room</span>';
        } catch (e) {}
      } catch (e) { console.error('[org] reset al cambiar de organización', e); }
    }
    setOrgId(s);
    try { localStorage.setItem(_ORG_LS_KEY, s); } catch(e){}   // recordamos la última (para futura entrada directa)
    return true;
  }catch(e){ return false; }
}
/* ════════════════════════════════════════════════════════════════════
   V11.13.0 · INVARIANTE: el Control Room NUNCA se muestra a un usuario sin
   empresa confirmada. ORG_ID tiene un default (Primate), así que NO sirve de
   señal; usamos esta bandera, que solo se enciende con una membresía activa y
   real. Además, una tapa de carga cubre el Control Room base (que vive siempre
   en el DOM) durante toda transición, para que nunca asome vacío.
   ════════════════════════════════════════════════════════════════════ */
export function _bootCoverShow(msg){
  try{
    var c = document.getElementById('takeosBootCover');
    if (!c){
      c = document.createElement('div');
      c.id = 'takeosBootCover';
      c.style.cssText = 'position:fixed;inset:0;z-index:99990;display:grid;place-items:center;background:var(--bg-page,#1a1a19);color:var(--ink-secondary,#d3d6cb);font-family:var(--font-sans),system-ui,sans-serif;';
      c.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:14px;">'
        + '<div style="width:34px;height:34px;border-radius:50%;border:3px solid var(--rule,#2a2a28);border-top-color:var(--accent,#c2410c);animation:tkspin 0.8s linear infinite;"></div>'
        + '<div id="takeosBootCoverMsg" style="font-size:13px;letter-spacing:.02em;"></div></div>'
        + '<style>@keyframes tkspin{to{transform:rotate(360deg)}}</style>';
      document.body.appendChild(c);
    }
    var m = document.getElementById('takeosBootCoverMsg'); if (m) m.textContent = msg || 'Cargando…';
    c.style.display = 'grid';
    try{ clearTimeout(window._bootCoverTO); }catch(e){}
    window._bootCoverTO = setTimeout(_bootCoverHide, 10000);   /* red de seguridad: nunca dejar al usuario pegado */
  }catch(e){}
}
export function _bootCoverHide(){ try{ clearTimeout(window._bootCoverTO); }catch(e){} try{ var c = document.getElementById('takeosBootCover'); if (c) c.remove(); }catch(e){} }
/* Render seguro cuando NO hay empresa confirmada: el Panel Personal cubre el
   Control Room. Jamás cae al Control Room. */
function _renderEspacioSeguro(email){
  try{ gancho('renderEspacioUsuario')(gancho('_espConstruir')([], email || '')); }
  catch(e){ _bootCoverHide(); }
}
// DAL LECTORES: _SOURCE flags (ahora window, lib/state.js), DAL_KNOWN_*, _dal*Map, dalLoadTanda1, dalApplyTanda1, dalBootContactos, dalBootPersonasExternos, dalBulkFrozen, dalLoad/Apply/BootLocaciones, dalLoad/Apply/BootLegal → movido a src/modules/dal.js (Etapa B1)
export function orgNombre() {
  var e = (typeof EMPRESA_PERFIL !== 'undefined' && EMPRESA_PERFIL) ? EMPRESA_PERFIL : {};
  return String(e.nombreFicticio || e.razonSocial || '').trim();
}
function aplicarMarcaOrg() {
  var nom = orgNombre();
  try { document.title = nom ? ('TakeOS · ' + nom) : 'TakeOS'; } catch (e) {}
  try { var bs = document.getElementById('brandSub'); if (bs) bs.textContent = nom; } catch (e) {}
  try { var bl = document.getElementById('brandLogo'); if (bl) bl.textContent = (nom ? nom.charAt(0).toUpperCase() : 'T'); } catch (e) {}
  try {
    var cs = document.getElementById('crSubtitle');
    if (cs) {
      var _esExt = (typeof TAKEOS_PERFIL !== 'undefined' && TAKEOS_PERFIL && TAKEOS_PERFIL.tipo === 'externo');
      if (_esExt) cs.textContent = 'Los proyectos a los que te han invitado a colaborar.';
      else cs.textContent = nom ? ('Vista global de todos los proyectos de ' + nom + '.') : 'Vista global de todos tus proyectos.';
    }
  } catch (e) {}
}
export function aplicarUsuario() {
  var nom = String(USER_NOMBRE || '').trim();
  var ape = String(USER_APELLIDO || '').trim();
  try { var g = document.getElementById('crGreeting'); if (g) g.textContent = nom ? ('Buenos días, ' + nom + '.') : 'Buenos días.'; } catch (e) {}
  try { var un = document.getElementById('userName'); if (un) un.textContent = nom ? (nom + (ape ? (' ' + ape.charAt(0).toUpperCase() + '.') : '')) : 'Mi cuenta'; } catch (e) {}
  try { var av = document.getElementById('userAvatar'); if (av) av.textContent = (nom ? nom.charAt(0).toUpperCase() : '') + (ape ? ape.charAt(0).toUpperCase() : ''); } catch (e) {}
}

// DAL PERFIL/IDENTIDAD: dalLoad/Apply/BootPerfil, dalResolveIdentidad, dalLoadPermisos → movido a src/modules/dal.js (Etapa B1)

/* Refleja la identidad real en el topbar y el saludo del Control Room. */
function _iniciales(nombre) {
  const parts = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '··';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
function renderTopbarUser() {
  const nombre = (typeof USUARIO_ACTUAL !== 'undefined' && USUARIO_ACTUAL) ? USUARIO_ACTUAL : (window.__TAKEOS_USER || '');
  if (!nombre) return;
  const av = document.querySelector('.topbar-user .user-avatar');
  if (av) av.textContent = _iniciales(nombre);
  const nm = document.querySelector('.topbar-user .user-name');
  if (nm) {
    const parts = nombre.split(/\s+/);
    nm.textContent = parts[0] + (parts.length > 1 ? ' ' + parts[1][0] + '.' : '');
    if (TAKEOS_PERFIL && TAKEOS_PERFIL.nombre) nm.title = 'Perfil: ' + TAKEOS_PERFIL.nombre;
  }
  const greet = document.querySelector('.cr-title');
  if (greet && /Buen/i.test(greet.textContent)) {
    const h = new Date().getHours();
    const saludo = h < 12 ? 'Buenos días' : (h < 20 ? 'Buenas tardes' : 'Buenas noches');
    greet.textContent = saludo + ', ' + (nombre.split(/\s+/)[0]) + '.';
  }
}

/* Aplica los permisos a la UI global: oculta módulos del sidebar sin acceso y
   esconde botones de acción que el perfil no puede ejecutar. */
function applyPermisosUI() {
  try {
    document.querySelectorAll('.sidebar-item[data-module]').forEach(function (el) {
      const vis = authPuedeVer(el.dataset.module);
      el.style.display = vis ? '' : 'none';
      // V10.5.1: indicador de solo-lectura (L) cuando el nivel del módulo es 'L'
      const ro = vis && authNivelModulo(el.dataset.module) === 'L';
      let badge = el.querySelector('.ro-badge');
      if (ro && !badge) {
        badge = document.createElement('span');
        badge.className = 'ro-badge';
        badge.textContent = 'L';
        badge.title = 'Solo lectura';
        el.appendChild(badge);
      } else if (!ro && badge) {
        badge.remove();
      }
    });
    const btnNuevo = document.querySelector('.cr-actions .btn-primary[onclick*="newProject"]');
    if (btnNuevo) btnNuevo.style.display = (authNivel('crear_proyecto') === 'E') ? '' : 'none';
    // V10.5.1: importar proyecto reservado a perfiles con crear_proyecto = E (Administrador y Ejecutivo)
    const btnImport = document.getElementById('importProjectBtn');
    if (btnImport) btnImport.style.display = (authNivel('crear_proyecto') === 'E') ? '' : 'none';
    const btnCFO = document.querySelector('.cr-actions [onclick*="openGlobalCFO"]');
    if (btnCFO) btnCFO.style.display = (authNivel('finanzas_consolidada') !== 'none') ? '' : 'none';
  } catch (e) { console.warn('[auth] applyPermisosUI', e); }
}

/* Primer módulo visible del sidebar (para no dejar el área vacía si el módulo
   por defecto está oculto para el perfil). */
function _firstVisibleModule() {
  const items = document.querySelectorAll('.sidebar-item[data-module]');
  for (let i = 0; i < items.length; i++) { if (authPuedeVer(items[i].dataset.module)) return items[i].dataset.module; }
  return null;
}

/* Marca el contenido de un módulo como solo-lectura cuando el nivel es 'L'. */
function applyModuleReadonly(appKey) {
  const content = document.getElementById('moduleContent');
  if (!content) return;
  const ro = authNivelModulo(appKey) === 'L';
  content.classList.toggle('mod-readonly', ro);
  const prev = content.querySelector('.mod-readonly-banner');
  if (prev) prev.remove();
  if (ro) {
    const b = document.createElement('div');
    b.className = 'mod-readonly-banner';
    b.textContent = 'Solo lectura · tu perfil' + (TAKEOS_PERFIL ? ' (' + TAKEOS_PERFIL.nombre + ')' : '') + ' puede ver este módulo pero no editarlo.';
    content.insertBefore(b, content.firstChild);
  }
}

// DAL ESCRITORES+PROYECTOS: DAL_KNOWN_*_IDS, _dal* coerción/payloads, dalGuardar*, dalEliminar*, _dal*SaveSoon, dalLoad/Boot/Reload/GuardarProyecto(s), manejo de conflictos, dalGuardarOperaciones4a-4e, dalTouchProyecto, dalFlushProyectos, dalBannerHTML → movido a src/modules/dal.js (Etapa B1)

/* V10.6.0 · Capa de nube anterior retirada por completo. La persistencia es
   100% Supabase (markDirty -> dalTouchProyecto / _dal*SaveSoon) más el airbag en
   localStorage. No se carga ningún SDK ni se abre ningún listener. Solo se
   conserva cloudGate (abajo), que es el LOGIN real con Supabase Auth: el nombre
   es heredado y no implica ninguna otra dependencia externa. */

/* Pantalla de LOGIN real (V9.3.0 · Supabase Auth con Google OAuth).
   - Si ya hay sesión iniciada (visita anterior O regreso desde Google), entra directo:
     el cliente de Supabase detecta la sesión en la URL al volver del OAuth, así que
     getSession() ya la tiene cuando corre cloudGate.
   - Si no hay sesión, se muestra el botón "Iniciar sesión con Google", que redirige a
     Google y vuelve a esta misma URL con la sesión activa.
   - Si Supabase no carga por algún motivo, NO bloquea el arranque (fallback).
   La identidad (currentUser) se deriva del correo de la sesión, igual que antes:
   el proveedor (Google vs. contraseña) no cambia cómo se consume auth.uid/auth.email. */
// INVITACIONES: PERFIL_CODIGO/NOMBRE_POR_*, invitacionLink, dalInvitar, _inv*, inv*, abrirInvitacionRecibida → movido a src/modules/invitaciones.js (Etapa C3). TAKEOS_VERSION se queda arriba (L~4180): const clásica leída léxicamente por persistencia-local y este archivo.
// CTA PRODUCTORA + FRENTE D: TAKEOS_MARCA/LANDING, cta*, _PLAN_MOD, _plan*, manejarErrorPlan → movido a src/modules/plan-limites.js (Etapa C4)
// INYECCIONES ESPACIO: _espInyectarCtaProductora, _espInyectarHerramientas, _espInyectarInvitaciones → movido a src/modules/espacio.js (Etapa C4)

// FRENTE A · CREAR PRODUCTORA: _CP_*, _cp* (flujo, TyC, pago, provisión, tour), abrirFlujoCrearProductora → movido a src/modules/config.js (Etapa A6)
/* V11.4.0 · cortina de arranque: tapa el microsegundo de Control Room vacío
   antes del login y los ~2 s de carga de proyectos después de loguear. */
function _bootVeil(msg) {
  let v = document.getElementById('bootVeil');
  if (!v) {
    v = document.createElement('div'); v.id = 'bootVeil';
    v.style.cssText = 'position:fixed;inset:0;z-index:100000;background:var(--bg-page,#111);display:grid;place-items:center;color:var(--ink-faint,#888);font-family:var(--font-sans),system-ui,sans-serif;transition:opacity .25s;';
    document.body.appendChild(v);
  }
  v.innerHTML = '<div style="text-align:center;"><div style="font-weight:700;font-size:20px;letter-spacing:.02em;color:var(--ink-primary,#eee);margin-bottom:10px;">TakeOS</div><div style="font-size:13px;">' + (msg || '') + '</div></div>';
  v.style.opacity = '1'; v.style.pointerEvents = 'auto';
  clearTimeout(v._t);
  v._t = setTimeout(_bootVeilOff, 1300);   // se quita sola: cortina, no muro
}
function _bootVeilOff() {
  const v = document.getElementById('bootVeil'); if (!v) return;
  v.style.opacity = '0'; v.style.pointerEvents = 'none';
  setTimeout(function () { try { v.remove(); } catch (e) {} }, 300);
}
export async function cloudGate(onUnlock) {
  const client = supabaseInit();
  if (!client) { onUnlock(); return; }   // fallback: sin Supabase, no bloqueamos

  /* V11.2.1 · AUTENTICACIÓN OBLIGATORIA EN CADA ENTRADA.
     Una sesión solo entra si nació en ESTA carga de página (regreso del
     OAuth de Google). Una sesión restaurada del almacenamiento del navegador
     se descarta y se vuelve a pedir login. Esto cierra el bug de sesión
     cruzada (una sesión ajena guardada en el navegador entraba sola, sin
     pasar por Google) y aplica la política de Agustín: imposible entrar a
     TakeOS sin autenticarse, como Chipax. */
  try {
    if (AUTH_RETORNO_OAUTH) {
      // Regreso fresco de Google: la sesión puede tardar un instante en quedar lista.
      let sess = null;
      for (let i = 0; i < 15; i++) {
        const { data } = await client.auth.getSession();
        sess = (data && data.session) ? data.session : null;
        if (sess) break;
        await new Promise(r => setTimeout(r, 200));
      }
      if (sess) {
        // Sello de autenticación explícita: habilita la ventana de sesión breve.
        try {
          localStorage.setItem('takeos_auth_at', String(Date.now()));
          localStorage.setItem('takeos_auth_uid', (sess.user && sess.user.id) || '');
        } catch (e) {}
        // Limpia los restos del OAuth de la URL para que un refresh no se confunda.
        try {
          const qs = window.location.search
            .replace(/[?&](code|access_token|refresh_token|expires_in|expires_at|token_type|provider_token|provider_refresh_token|type)=[^&]*/g, '')
            .replace(/^&/, '?');
          history.replaceState(null, '', window.location.pathname + (qs === '?' ? '' : qs));
        } catch (e) {}
        _bootVeil('Cargando tus proyectos…'); onUnlock(); return;
      }
      console.warn('[auth] regreso del OAuth sin sesión utilizable; se muestra el login');
      _bootVeilOff();
    } else {
      /* V11.15.0 · validación contra el SERVIDOR: getUser() verifica el token con
         Supabase, a diferencia de getSession() que solo lee el almacenamiento del
         navegador. Así, si el usuario fue borrado o deshabilitado en la base, no
         entra una "sesión fantasma" (getSession la daba por válida y la app lo
         mandaba al Panel Personal): getUser() devuelve error → cerramos la sesión
         local y pedimos login. No afecta el retorno de OAuth (rama de arriba). */
      const { data, error } = await client.auth.getUser();
      const user = (!error && data && data.user) ? data.user : null;
      if (user) {
        /* V11.3.0 · sesión breve (lo mejor de ambos mundos): la sesión
           restaurada entra SIN login solo si (a) pertenece al mismo usuario
           que se autenticó explícitamente en este navegador y (b) esa
           autenticación ocurrió hace menos de AUTH_TTL_HORAS. Cualquier otra
           sesión (ajena, vieja, sin sello) se descarta y se pide login. */
        let okTTL = false;
        try {
          const at = parseInt(localStorage.getItem('takeos_auth_at') || '0', 10);
          const uid = localStorage.getItem('takeos_auth_uid') || '';
          const mismo = uid && user.id === uid;
          const vigente = at > 0 && (Date.now() - at) < AUTH_TTL_HORAS * 3600 * 1000;
          okTTL = !!(mismo && vigente);
        } catch (e) { okTTL = false; }
        if (okTTL) { try { if (sessionStorage.getItem('takeos_sin_veil') === '1') { sessionStorage.removeItem('takeos_sin_veil'); } else { _bootVeil('Cargando tus proyectos…'); } } catch (e) { _bootVeil('Cargando tus proyectos…'); } onUnlock(); return; }
        const quien = user.email || '(desconocido)';
        console.info('[auth] sesión guardada de ' + quien + ' descartada (vencida o de otro usuario): se pide autenticación.');
        try { await client.auth.signOut({ scope: 'local' }); } catch (e) {}
        try { localStorage.removeItem('takeos_auth_at'); localStorage.removeItem('takeos_auth_uid'); } catch (e) {}
      } else {
        /* getUser() sin usuario: o no hay sesión, o el token ya no es válido
           (usuario borrado / revocado). Limpiamos lo local y pedimos login. */
        try { await client.auth.signOut({ scope: 'local' }); } catch (e) {}
        try { localStorage.removeItem('takeos_auth_at'); localStorage.removeItem('takeos_auth_uid'); } catch (e) {}
      }
    }
  } catch (e) { /* si falla, seguimos y mostramos el login */ }
  _bootVeilOff();
  setTimeout(function () { try { if (sessionStorage.getItem('takeos_inv_pendiente')) { var h = document.getElementById('cgInvHint'); if (h) h.style.display = 'block'; } } catch (e) {} }, 400);

  const ov = document.createElement('div');
  ov.id = 'cloudGate';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#0e0f13;';
  ov.innerHTML = `
    <div style="text-align:center;max-width:340px;padding:24px;font-family:system-ui,sans-serif;">
      <div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:4px;">TakeOS</div>
      <div style="color:#7a7d85;font-size:13px;margin-bottom:22px;">Tu sesión dura ${AUTH_TTL_HORAS} horas; después TakeOS vuelve a pedir autenticación.</div>
        <div id="cgInvHint" style="display:none;border:1px solid #4a7;border-radius:8px;padding:10px 12px;margin-bottom:18px;font-size:12.5px;color:#9c8;line-height:1.5;">Te invitaron a colaborar. Entra con Google y tu <strong>cuenta se crea sola</strong>; al entrar verás la invitación.</div>
      <button id="cloudGateGoogle"
        style="width:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;border:1px solid #d7dae0;border-radius:8px;background:#fff;color:#1f1f1f;font-weight:600;font-size:14px;cursor:pointer;">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style="flex:0 0 auto;">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
          <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.42 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
        </svg>
        <span id="cloudGateGoogleLbl">Iniciar sesión con Google</span>
      </button>
      <div style="display:flex;align-items:center;gap:10px;margin:18px 0 14px;"><div style="flex:1;height:1px;background:#2a2c33;"></div><span style="color:#6a6d75;font-size:11px;">o con tu correo</span><div style="flex:1;height:1px;background:#2a2c33;"></div></div>
      <input id="cgEmail" type="email" placeholder="tu@correo.cl" autocomplete="email"
        style="width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #2a2c33;border-radius:8px;background:#16171c;color:#fff;font-size:14px;margin-bottom:9px;">
      <input id="cgPass" type="password" placeholder="Contraseña" autocomplete="current-password"
        style="width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #2a2c33;border-radius:8px;background:#16171c;color:#fff;font-size:14px;margin-bottom:11px;"
        data-accion="boot.cgEnter" data-on="keydown">
      <button id="cgEntrar"
        style="width:100%;box-sizing:border-box;padding:12px;border:none;border-radius:8px;background:var(--accent,#c2410c);color:#fff;font-weight:600;font-size:14px;cursor:pointer;">Entrar</button>
      <div id="cloudGateErr" style="color:#e0533d;font-size:12px;margin-top:12px;min-height:14px;"></div>
      <div style="color:#4a4d55;font-size:11px;margin-top:16px;letter-spacing:0.04em;">${TAKEOS_VERSION}</div>
    </div>`;
  document.body.appendChild(ov);
  const err = ov.querySelector('#cloudGateErr');
  const gBtn = ov.querySelector('#cloudGateGoogle');
  const gLbl = ov.querySelector('#cloudGateGoogleLbl');
  const signInGoogle = async () => {
    err.textContent = '';
    gBtn.disabled = true; gLbl.textContent = 'Redirigiendo a Google…';
    try {
      // Volvemos a ESTA misma URL (sin query/hash); debe estar en la lista de
      // URLs de redirección permitidas en Supabase y Google Cloud Console.
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTo,
          /* V11.2.1: fuerza el selector de cuentas de Google en cada login.
             Sin esto, Google reutiliza en silencio la última cuenta autorizada
             y nunca te deja elegir con cuál entrar. */
          queryParams: { prompt: 'select_account' }
        }
      });
      if (error) {
        err.textContent = 'No se pudo iniciar sesión con Google. Reintenta.';
        gBtn.disabled = false; gLbl.textContent = 'Iniciar sesión con Google';
      }
      // Sin error: el navegador se redirige a Google. Al volver, cloudGate corre
      // de nuevo y getSession() ya tiene la sesión -> onUnlock().
    } catch (e) {
      err.textContent = 'Error de conexión. Reintenta.';
      gBtn.disabled = false; gLbl.textContent = 'Iniciar sesión con Google';
    }
  };
  gBtn.onclick = signInGoogle;

  /* V11.8.2 · login con email + contraseña. El proveedor ya está activo en
     Supabase. Mismo destino que Google: onUnlock() arranca la app. */
  const eBtn = ov.querySelector('#cgEntrar');
  const emailInp = ov.querySelector('#cgEmail');
  const passInp = ov.querySelector('#cgPass');
  const signInPass = async () => {
    err.textContent = '';
    const correo = (emailInp.value || '').trim();
    const clave = passInp.value || '';
    if (!correo || !clave) { err.textContent = 'Escribe tu correo y contraseña.'; return; }
    eBtn.disabled = true; eBtn.textContent = 'Entrando…';
    try {
      const { error } = await client.auth.signInWithPassword({ email: correo, password: clave });
      if (error) {
        const m = String(error.message || '');
        if (/email not confirmed/i.test(m)) err.textContent = 'Revisa tu correo para confirmar tu cuenta antes de entrar.';
        else err.textContent = 'Correo o contraseña incorrectos.';
        eBtn.disabled = false; eBtn.textContent = 'Entrar';
        return;
      }
      /* V11.9.6 · BUG-7 · dos arreglos:
         1) Sello en el MISMO formato que Google: timestamp simple en
            'takeos_auth_at' + uid en su propia clave 'takeos_auth_uid'. Antes se
            guardaba como un objeto JSON, y el arranque lo lee con parseInt (=NaN)
            y busca 'takeos_auth_uid' (que no existía) → descartaba la sesión al
            recargar.
         2) Remover el overlay del login: en el camino contraseña el overlay
            #cloudGate ya está en pantalla, y nadie lo quitaba (con Google se va
            porque la página recarga). Por eso el botón quedaba pegado en
            "Entrando…" debajo de la cortina de carga. */
      try { const uNow = await client.auth.getUser(); const uid2 = (uNow && uNow.data && uNow.data.user) ? uNow.data.user.id : ''; localStorage.setItem('takeos_auth_at', String(Date.now())); localStorage.setItem('takeos_auth_uid', uid2); } catch (e) {}
      try { const g = document.getElementById('cloudGate'); if (g) g.remove(); } catch (e) {}
      _bootVeil('Cargando tus proyectos…');
      onUnlock();
    } catch (e) {
      err.textContent = 'Error de conexión. Reintenta.';
      eBtn.disabled = false; eBtn.textContent = 'Entrar';
    }
  };
  eBtn.onclick = signInPass;
  /* Preparado para el paso siguiente (SaaS): registro (signUp) y
     "olvidé mi contraseña" (resetPasswordForEmail) se sumarán aquí. */
}

/* ════════════════════════════════════════════════════════════════════
   INICIALIZACIÓN
   ════════════════════════════════════════════════════════════════════ */
// TEMA: THEME_KEY, getStoredTheme, applyStoredTheme, toggleTheme, updateThemeButton → movido a src/lib/ui.js (Etapa C5)

/* ════════════════════════════════════════════════════════════════════
   V10.7.0 · ESPACIO DE USUARIO (multi-organización) — primera integración
   ─────────────────────────────────────────────────────────────────────
   Tras el login, si la persona pertenece a MÁS DE UNA organización (o se
   fuerza con ?espacio=1), se muestra su espacio personal para elegir a dónde
   entrar. Si pertenece a una sola, entra directo (sin cambio para el equipo
   actual de Primate). DEFENSIVO: ante cualquier error, arranca TakeOS normal.
   Modo demostración: ?espacio=demo pinta la pantalla con datos ficticios
   (Game of Thrones) para evaluar la estética integrada sin depender de datos.

   PENDIENTE (ver handoff al BD Expert):
   · Motor de organización activa (hoy ORG_ID está fijo en Primate Films).
   · Modo externo: cargar SOLO el/los proyecto(s) invitados, no la org completa.
   · Perfil personal del usuario (datos personales editables).
   ════════════════════════════════════════════════════════════════════ */
// PERFIL_NOMBRES → movido a src/modules/espacio.js (Etapa C4)
export function arrancarTakeOS() {
  /* V11.13.0 · invariante: sin empresa confirmada y sin un proyecto destino,
     jamás se entra al Control Room (se re-deriva la vista correcta). */
  var _pend = false; try { _pend = !!sessionStorage.getItem('takeos_ir_proyecto'); } catch (e) {}
  if (!_TIENE_EMPRESA && !_pend) { resolverEspacioYArrancar(); return; }
  dalBootTaxRates().then(function(){ return dalBootContactos(); }).then(function(){ return dalResolveIdentidad(); }).then(function(){ return dalLoadPermisos(); }).then(function(){ return dalBootPersonasExternos(); }).then(function(){ return dalBootLocaciones(); }).then(function(){ return dalBootLegal(); }).then(function(){ return dalBootPerfil(); }).then(function(){ return dalBootProyectos(); }).then(function(){ try { notifInit(); } catch (e) {} }).then(function(){ try { gancho('_cpTourInicialQuizas')(); } catch (e) {} }).then(function(){ try { setTimeout(_pdCookiesBootCheck, 1200); } catch (e) {} }).catch(function(e){ console.error('[boot] cadena dal interrumpida', e); try { _bootCoverHide(); } catch (_) {} });
}

// _espIniciales, _espSello, _titleCaseNombre, valor('ESPACIO_DEMO'), _espConstruir, _espCargarConteos → movido a src/modules/espacio.js (Etapa C4)

export async function resolverEspacioYArrancar(){
  const forzar = /[?&]espacio=1\b/.test(window.location.search);
  const demo   = /[?&]espacio=demo\b/.test(window.location.search);
  if (demo) { try { gancho('renderEspacioUsuario')(valor('ESPACIO_DEMO')); return; } catch(e){ arrancarTakeOS(); return; } }
  /* FRENTE A · A1 · disparador del flujo de creación de productora:
     ?plan=<gratis|rodaje|produccion>. El plan llega ya elegido desde la landing.
     Se limpia de la URL para que cerrar/cancelar el flujo no lo vuelva a disparar.
     (La organización nace 'free' igual; el plan es para la experiencia y A6.) */
  try {
    const _pm = /[?&]plan=(gratis|rodaje|produccion)\b/.exec(window.location.search);
    if (_pm) {
      const _plan = _pm[1];
      try {
        const _qs = window.location.search.replace(/[?&]plan=[^&]*/, '').replace(/^&/, '?');
        history.replaceState(null, '', window.location.pathname + (_qs === '?' ? '' : _qs));
      } catch (e) {}
      gancho('abrirFlujoCrearProductora')(_plan);
      return;
    }
  } catch (e) {}
  try {
    const client = (typeof sb !== 'undefined' && sb) ? sb : (typeof supabaseInit === 'function' ? supabaseInit() : null);
    if (!client) { _renderEspacioSeguro(''); return; }
    const ures = await client.auth.getUser();
    const uid = (ures && ures.data && ures.data.user) ? ures.data.user.id : null;
    const email = (ures && ures.data && ures.data.user) ? (ures.data.user.email||'') : '';
    if (!uid) { _renderEspacioSeguro(email); return; }
    // V11.3.0 · link de invitación pendiente: va directo a la pantalla de invitación.
    let _invTok = null;
    try { _invTok = sessionStorage.getItem('takeos_inv_pendiente'); } catch (e) {}
    if (_invTok) { gancho('abrirInvitacionRecibida')(_invTok); return; }
    const res = await client.from('memberships')
      .select('organization_id, tipo, profile_id, estado, organizations(nombre)')
      .eq('user_id', uid).eq('estado','activo');
    let rows = res && res.data ? res.data : null;
    if (res.error || !rows) { _renderEspacioSeguro(email); return; }            // error de consulta: NO mostramos Control Room
    /* V11.13.0 · descarta membresías colgantes: si la organización ya no existe
       (o RLS no la deja ver), esa membresía no cuenta como empresa. */
    rows = rows.filter(function(r){ return r && r.organizations; });
    // V11.3.0 · bandeja interna: invitaciones pendientes del usuario.
    let _invs = [];
    try { const ir = await client.rpc('mis_invitaciones'); if (!ir.error && Array.isArray(ir.data)) _invs = ir.data; } catch (e) {}
    if (rows.length === 0) { gancho('renderEspacioUsuario')(gancho('_espConstruir')([], email)); gancho('_espInyectarInvitaciones')(_invs); gancho('_espInyectarHerramientas')(); gancho('_espInyectarCtaProductora')(); return; }  // cuenta sin productora aún (land-and-expand)
    if (rows.length === 1 && !forzar && _invs.length === 0 && rows[0].tipo !== 'externo') { setTieneEmpresa(true); _bootCoverShow('Entrando a tu productora…'); _setOrgActiva(rows[0].organization_id); arrancarTakeOS(); return; }   // un interno único entra directo a su productora
    /* V11.9.7 · un externo opera desde su Panel Personal: ve sus proyectos y
       entra directo a ellos. Nunca aterriza en el Control Room de la productora. */
    gancho('renderEspacioUsuario')(gancho('_espConstruir')(rows, email));
    gancho('_espInyectarInvitaciones')(_invs);
    gancho('_espInyectarHerramientas')();
  } catch (e) {
    _renderEspacioSeguro('');   // V11.13.0 · ante cualquier problema, Panel Personal, NUNCA Control Room
  }
}

// _espOnboarding, _espEntrarInterna, _espAbrirProyecto, _espCargarProyectosExternos, _espPerfil → movido a src/modules/espacio.js (Etapa C4)

// FRENTE B · PRIVACIDAD Y DATOS: _PD_CSS, _pd* (hub, export, consentimientos, eliminación, cookies, edad), abrirPrivacidadDatos → movido a src/modules/config.js (Etapa A6)
// renderEspacioUsuario → movido a src/modules/espacio.js (Etapa C4)

// PERFIL PERSONAL + ONBOARDING: _PERFIL_CTX, abrirPerfilUsuario, _perfil*, _rutValido, _regionCanonica → movido a src/modules/perfil-onboarding.js (Etapa B2)

/* Onboarding: si la persona aún no tiene perfil, se lo ofrecemos antes de
   entrar. Cualquier fallo continúa al arranque normal (no bloquea). */
async function iniciarSesionTakeOS() {
  _bootCoverShow('Cargando tu espacio…');
  try {
    var client = (typeof sb !== 'undefined' && sb) ? sb : (typeof supabaseInit === 'function' ? supabaseInit() : null);
    if (client) {
      var ures = await client.auth.getUser();
      var uid = (ures && ures.data && ures.data.user) ? ures.data.user.id : null;
      if (uid) {
        var pr = await client.from('user_profiles').select('user_id, nombre, apellido').eq('user_id', uid).maybeSingle();
        if (pr.error) console.warn('[perfil] no se pudo verificar el perfil personal; se omite el onboarding', pr.error);
        if (!pr.error && pr && pr.data) { setUserNombre(String(pr.data.nombre || '').trim()); setUserApellido(String(pr.data.apellido || '').trim()); try { aplicarUsuario(); } catch (e) {} }
        if (!pr.error && (!pr || !pr.data)) {
          gancho('abrirPerfilUsuario')(true, function () { resolverEspacioYArrancar(); });
          return;
        }
      }
    }
  } catch (e) { console.error('[perfil] verificación de onboarding falló; se continúa al arranque', e); }
  resolverEspacioYArrancar();
}

document.addEventListener('DOMContentLoaded', () => {
  try { const _bv = document.getElementById('brandVer'); if (_bv) _bv.textContent = 'v' + String(TAKEOS_VERSION || '').replace(/^[vV]\.?/, ''); } catch (e) {}
  try { aplicarMarcaOrg(); } catch (e) {}
  try { aplicarUsuario(); } catch (e) {}
  applyStoredTheme();   // V7.2: aplicar tema guardado antes de renderizar
  renderMetrics();
  renderKanban();
  setupTooltipListeners();

  // V5.5: marcar "sin guardar" ante cualquier edición (delegación: un solo
  // par de listeners cubre todos los inputs/selects/checkbox de la app).
  document.addEventListener('change', markDirty, true);
  document.addEventListener('input', () => { if (STATE.dirty) return; markDirty(); }, true);
  // Airbag adicional: autoguardar al cerrar/recargar.
  window.addEventListener('beforeunload', () => { if (STATE.dirty) autosaveNow(); });

  // Gate A cerrado: el login es Supabase Auth (cloudGate) y la carga es 100% Supabase.
  // V10.7.0: tras el login pasamos por el espacio de usuario (multi-organización).
  // V10.8.0: y antes, por el onboarding si la persona aún no tiene perfil personal.
  cloudGate(() => { iniciarSesionTakeOS(); });
});

// ── Gobierno del veil CSS-first (reemplaza el try{} parse-time del monolito) ──
try {
  if (sessionStorage.getItem('takeos_sin_veil') === '1') { const v = document.getElementById('bootVeil'); if (v) v.remove(); }
  else { _bootVeil(''); }
} catch (e) {}

// ── Bridges C6 (barrido final) ──
window._bootCoverHide = _bootCoverHide;
window._firstVisibleModule = _firstVisibleModule;
window._setOrgActiva = _setOrgActiva;
window.aplicarMarcaOrg = aplicarMarcaOrg;
window.applyModuleReadonly = applyModuleReadonly;
window.applyPermisosUI = applyPermisosUI;
window.arrancarTakeOS = arrancarTakeOS;
window.cloudGate = cloudGate;
window.currentUser = currentUser;
window.iniciarSesionTakeOS = iniciarSesionTakeOS;
window.orgNombre = orgNombre;
window.renderTopbarUser = renderTopbarUser;
window.resolverEspacioYArrancar = resolverEspacioYArrancar;
window.setCurrentUser = setCurrentUser;

// D2 · acciones delegadas
registrarAcciones('boot', {
  cgEnter: function (args, el, ev) { if (ev.key === 'Enter') { var b = document.getElementById('cgEntrar'); if (b) b.click(); } },
});

// D2 · acciones de los 35 estáticos de index.html (mini-boot). Las que no
// están importadas resuelven vía window (bridges vigentes hasta D3).
registrarAcciones('app', {
  modulo: function (a, el) { navigateToModule(el.dataset.module); },
  controlRoom: function () { navigateToControlRoom(); },
  swToggle: function (a, el, ev) { gancho('_swToggle')(ev); },
  buscar: function (a, el, ev) {
    if (ev.type === 'keydown') globalSearchKey(ev);
    else if (ev.type === 'blur') setTimeout(_gsearchHide, 160);
    else globalSearchInput(el.value);
  },
  config: function () { gancho('openConfigPanel')(); },
  undo: function () { undoLast(); },
  importSave: function (a, el) { importSaveFromInput(el); },
  bell: function () { bellToggle(); },
  notifTodas: function () { notifMarcarTodas(); },
  logout: function () { confirmLogout(); },
  importProyectoBtn: function () { document.getElementById('importProjectFileInput').click(); },
  importProyecto: function (a, el) { importSingleProjectFromInput(el); },
  papelera: function () { openTrash(); },
  cfo: function () { openGlobalCFO(); },
  nuevoProyecto: function () { newProject(); },
});

// D4b · ganchos definidos por este módulo (consumidos por módulos más tempranos)
define('_bootCoverHide', _bootCoverHide);
define('_firstVisibleModule', _firstVisibleModule);
define('_setOrgActiva', _setOrgActiva);
define('aplicarMarcaOrg', aplicarMarcaOrg);
define('applyModuleReadonly', applyModuleReadonly);
define('applyPermisosUI', applyPermisosUI);
define('currentUser', currentUser);
define('orgNombre', orgNombre);
define('renderTopbarUser', renderTopbarUser);
define('setCurrentUser', setCurrentUser);
