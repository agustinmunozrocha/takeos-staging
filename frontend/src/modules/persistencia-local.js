// Persistencia LOCAL — extraído de index.html (Etapa B2)
// src/modules/persistencia-local.js
// Guardado/carga .json, autosave a localStorage, snapshots anti-destrucción,
// export/import por proyecto y undo/redo. La persistencia REMOTA (Supabase)
// vive en dal.js; las 2 costuras entre ambas: markDirty→dalTouchProyecto y
// undo/redo→_conflictoBannerHide (vía window, bridgeadas en dal.js).

// D1e · imports reales. DIFERIDOS anti-ciclo: dal (dalTouchProyecto,
// _conflictoBannerHide — dal importa persistencia), kanban (3 renders — kanban
// importa persistencia), admin (_puedeModoAdmin — arrastre por 1 símbolo).
import { escapeHtml, showToast } from '../lib/helpers.js';
import { BD_CONTACTOS, BD_EMPRESAS, BD_EMPRESAS_BYID, BD_LEGAL, BD_LEGAL_TPL, BD_LOC, BD_PERSONAS, BD_TALENTOS, EMPRESA_PERFIL, PROJECTS, STATE, TAKEOS_VERSION, TRASH } from '../lib/state.js';
import { hydrateContactStore } from '../lib/modelo.js';
import { showModal } from '../lib/ui.js';
import { navigateToModule } from '../lib/nav.js';

import { registrarAcciones, accionHTML } from '../lib/delegacion.js';
let UNDO_STACK = [];
let UNDO_BASELINE = null;
const UNDO_MAX = 30;
let REDO_STACK = [];   // V7.8: pila de rehacer (Cmd+Shift+Z)
window._persisResetOrg = function () {
  UNDO_STACK = []; REDO_STACK = []; UNDO_BASELINE = null;   // D0 · el historial de deshacer no cruza organizaciones
  if (_autosaveTimer) { clearTimeout(_autosaveTimer); _autosaveTimer = null; }   // que el autosave de 2 s no pise el airbag local con el estado recién vaciado
};

/* ════════════════════════════════════════════════════════════════════
   V5.5 — SISTEMA DE GUARDADO / CARGA (save file .json + autoguardado)
   ════════════════════════════════════════════════════════════════════
   Modelo: el HTML es la "consola"; el .json exportado es el "cartucho de
   guardado". Desacopla DATOS de CÓDIGO: puedes recibir versiones nuevas
   del TakeOS y volver a cargar el mismo .json sin perder el proyecto.

   Capas:
   1. Export/Import .json  → mecanismo DURABLE y portable (el respaldo serio).
   2. Autoguardado en localStorage → AIRBAG dentro del mismo navegador.
      Todo el acceso a localStorage va en try/catch porque en el visor de
      artefactos de Claude está bloqueado y NO debe romper la página. */

const SAVE_FORMAT_VERSION = 5;  // V7.3: modelo unificado (bdContactos + bdEmpresasById); mantiene proyecciones legacy para compat con clientes V7.2.x
const LS_KEY = 'takeos_autosave_v1';
let _autosaveTimer = null;

/* Detección segura de localStorage (puede lanzar en sandbox/artefacto). */
function hasLS() {
  try {
    const k = '__takeos_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch (e) { return false; }
}

/* Construye el objeto serializable del estado completo. */
function buildSaveObject() {
  return {
    app: 'TakeOS',
    format: 'takeos-save',
    version: SAVE_FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    projects: PROJECTS,
    trash: TRASH,
    empresaPerfil: EMPRESA_PERFIL,
    // V7.3: modelo canónico unificado (fuente de verdad)
    bdContactos: BD_CONTACTOS,
    bdEmpresasById: BD_EMPRESAS_BYID,
    // V8.2: BD de Locaciones (transversal)
    bdLoc: BD_LOC,
    // V8.3: BD de Legal (transversal)
    bdLegal: BD_LEGAL,
    bdLegalTpl: BD_LEGAL_TPL,
    // Proyecciones legacy: se siguen escribiendo para que un cliente aún en
    // V7.2.x (ventana de actualización en la nube) pueda leer la BD.
    bdPersonas: BD_PERSONAS,
    bdEmpresas: BD_EMPRESAS,
    bdTalentos: BD_TALENTOS
  };
}

/* V8.3.3 — BLINDAJE DE FOTOS PARA LA NUBE.
   El modo local guarda TODO el estado como un único JSON con tope de
   1 MiB. Las fotos base64 (aunque comprimidas) lo superan rápido y hacen que
   el push falle EN SILENCIO; peor aún, una vez sobre el límite deja de
   sincronizarse TODO. Por eso el payload de nube va SIN fotos: las fotos viven
   en localStorage (este navegador) y se reinyectan al cargar. Cross-device
   real requiere Supabase Storage, pendiente. */
/* Reinyecta en BD_LOC (en memoria) las fotos guardadas en localStorage, que NO
   viajan por la nube. Solo rellena registros que llegan SIN fotos, así no pisa
   fotos entrantes de un cliente antiguo que todavía las envíe. */
export function restoreLocalLocPhotos() {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.bdLoc)) return;
    const map = {};
    obj.bdLoc.forEach(l => { if (l && l.locId && l.fotos && l.fotos.length) map[l.locId] = l.fotos; });
    BD_LOC.forEach(l => { if (l && (!l.fotos || !l.fotos.length) && map[l.locId]) l.fotos = map[l.locId]; });
  } catch (e) {}
}

/* Valida la forma mínima de un save antes de aplicarlo. */
function validateSaveObject(obj) {
  if (!obj || obj.format !== 'takeos-save') return 'No parece un archivo de guardado de TakeOS.';
  if (!Array.isArray(obj.projects)) return 'El archivo no contiene proyectos válidos.';
  for (const p of obj.projects) {
    if (!p || typeof p.id !== 'string' || !p.data) return 'Hay proyectos con estructura inválida.';
  }
  return null; // ok
}

/* Reemplaza el estado en memoria con el cargado y re-renderiza. */
function applyLoadedState(obj) {
  // Mutar PROJECTS en sitio (es const) para no romper referencias del módulo.
  PROJECTS.length = 0;
  obj.projects.forEach(p => PROJECTS.push(p));
  // V5.7: restaurar la Base de Datos de Personas si el archivo la trae
  if (Array.isArray(obj.trash)) { TRASH.length = 0; obj.trash.forEach(p => TRASH.push(p)); }
  if (obj.empresaPerfil && typeof obj.empresaPerfil === 'object') Object.assign(EMPRESA_PERFIL, obj.empresaPerfil);
  if (obj.bdPersonas && typeof obj.bdPersonas === 'object') {
    Object.keys(BD_PERSONAS).forEach(k => delete BD_PERSONAS[k]);
    Object.keys(obj.bdPersonas).forEach(k => { BD_PERSONAS[k] = obj.bdPersonas[k]; });
  }
  // V7.1: restaurar también Empresas y Talentos
  if (obj.bdEmpresas && typeof obj.bdEmpresas === 'object') {
    Object.keys(BD_EMPRESAS).forEach(k => delete BD_EMPRESAS[k]);
    Object.keys(obj.bdEmpresas).forEach(k => { BD_EMPRESAS[k] = obj.bdEmpresas[k]; });
  }
  if (obj.bdTalentos && typeof obj.bdTalentos === 'object') {
    Object.keys(BD_TALENTOS).forEach(k => delete BD_TALENTOS[k]);
    Object.keys(obj.bdTalentos).forEach(k => { BD_TALENTOS[k] = obj.bdTalentos[k]; });
  }
  hydrateContactStore(obj);   // V7.3: reconstruir el modelo unificado (nuevo o viejo)
  // V8.2: restaurar la BD de Locaciones (transversal)
  if (Array.isArray(obj.bdLoc)) { BD_LOC.length = 0; obj.bdLoc.forEach(l => BD_LOC.push(l)); }
  if (Array.isArray(obj.bdLegal)) { BD_LEGAL.length = 0; obj.bdLegal.forEach(d => BD_LEGAL.push(d)); }
  if (Array.isArray(obj.bdLegalTpl)) { BD_LEGAL_TPL.length = 0; obj.bdLegalTpl.forEach(t => BD_LEGAL_TPL.push(t)); }
  PROJECTS.forEach(p => { if (p && p.data) { if (!Array.isArray(p.data.locaciones)) p.data.locaciones = []; } });
  STATE.currentProject = null;
  navigateToControlRoom();
  renderMetrics();
  renderKanban();
  clearDirty();
}

/* ─── EXPORTAR (.json) ─────────────────────────────────────────────── */
export function exportSave() {
  try {
    const data = buildSaveObject();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const fname = `takeos_save_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    autosaveNow(); // también refresca el airbag
    clearDirty();
    showToast({ kind: 'success', title: 'Proyecto guardado', body: `Se descargó <strong>${escapeHtml(fname)}</strong>. Guárdalo en un lugar seguro (Drive/Dropbox); es tu respaldo durable.` });
  } catch (e) {
    showToast({ kind: 'error', title: 'No se pudo guardar', body: 'Ocurrió un error al generar el archivo. Intenta de nuevo.' });
  }
}

/* ─── IMPORTAR (.json) ─────────────────────────────────────────────── */
/* V10.5.1: Cargar OS es ADITIVO — agrega solo los proyectos cuyo id no exista,
   sin borrar ni sobreescribir proyectos existentes ni la Base de Datos transversal.
   (applyLoadedState, que reemplaza todo, queda reservada para revertir Snapshots.) */
function mergeAddProjectsFromSave(obj) {
  const res = { agregados: 0, omitidos: 0 };
  const existentes = new Set(PROJECTS.map(p => p && p.id).filter(Boolean));
  (obj.projects || []).forEach(p => {
    if (!p || !p.id) return;
    if (existentes.has(p.id)) { res.omitidos++; return; }
    if (p.data && !Array.isArray(p.data.locaciones)) p.data.locaciones = [];
    PROJECTS.push(p); existentes.add(p.id); res.agregados++;
  });
  return res;
}
function importSaveFromInput(input) {
  const file = input.files && input.files[0];
  input.value = ''; // permitir recargar el mismo archivo después
  if (!file) return;
  // V10.5.1: Cargar OS reservado al perfil Administrador, en modo administrador (acción seria).
  if (!_puedeModoAdmin()) {
    showToast({ kind: 'error', title: 'Cargar OS no disponible', body: 'Solo el perfil Administrador puede cargar un OS.' });
    return;
  }
  if (!STATE.adminMode) {
    showToast({ kind: 'warning', title: 'Activa el modo administrador', body: 'Cargar un OS requiere el modo administrador activo. Actívalo en Configuración.' });
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    let obj;
    try { obj = JSON.parse(reader.result); }
    catch (e) {
      showToast({ kind: 'error', title: 'Archivo ilegible', body: 'No se pudo leer el archivo como JSON válido.' });
      return;
    }
    const err = validateSaveObject(obj);
    if (err) { showToast({ kind: 'error', title: 'Archivo inválido', body: escapeHtml(err) }); return; }
    if (obj.version > SAVE_FORMAT_VERSION) {
      showToast({ kind: 'warning', title: 'Guardado más nuevo', body: 'Este archivo fue creado por una versión más nueva de TakeOS. Se intentará cargar igual.' });
    }
    const savedWhen = obj.savedAt ? new Date(obj.savedAt).toLocaleString('es-CL') : 'fecha desconocida';
    const idsActuales = new Set(PROJECTS.map(p => p && p.id).filter(Boolean));
    const nuevos = (obj.projects || []).filter(p => p && p.id && !idsActuales.has(p.id)).length;
    const yaExisten = (obj.projects || []).length - nuevos;
    showModal({
      title: 'Cargar OS · agregar proyectos',
      body: `Esta acción <strong>solo agrega</strong> proyectos nuevos. No borra ni modifica los proyectos actuales ni la Base de Datos.<br><br>
        <strong>Del archivo</strong> <code>${escapeHtml(file.name)}</code> (${escapeHtml(savedWhen)}):<br>
        • ${nuevos} proyecto(s) nuevo(s) que se agregarán<br>
        • ${yaExisten} ya existen y se mantienen sin cambios<br><br>
        Se crea un <strong>snapshot automático</strong> antes, por si necesitas revertir desde el menú "Snapshots".<br><br>
        ¿Agregar los proyectos nuevos?`,
      confirmLabel: 'Agregar proyectos',
      cancelLabel: 'Cancelar',
      onConfirm: () => {
        pushSnapshot('Antes de cargar OS ' + file.name);
        const r = mergeAddProjectsFromSave(obj);
        STATE.currentProject = null;
        navigateToControlRoom();
        renderMetrics();
        renderKanban();
        markDirty();
        showToast({ kind: 'success', title: 'Proyectos agregados', body: `${r.agregados} proyecto(s) nuevo(s) agregado(s). ${r.omitidos} ya existían y se mantuvieron sin cambios.` });
      },
      onCancel: () => {}
    });
  };
  reader.onerror = () => showToast({ kind: 'error', title: 'Error de lectura', body: 'No se pudo leer el archivo.' });
  reader.readAsText(file);
}

/* ═══════════════════════════════════════════════════════════════════════
   SNAPSHOTS ANTI-DESTRUCCIÓN  (V7.1)
   ─────────────────────────────────────────────────────────────────────
   Antes de cualquier operación destructiva (cargar respaldo "todo el OS"
   que reemplaza PROJECTS+BD), TakeOS guarda un snapshot del estado actual.
   El usuario puede revertir desde el menú "Snapshots".

   Almacenamiento: localStorage clave 'takeos_snapshots' = JSON array.
   Tope: 5 snapshots; FIFO (el más viejo se elimina).
   ═══════════════════════════════════════════════════════════════════════ */
const SNAP_KEY = 'takeos_snapshots';
const SNAP_MAX = 5;

function _readSnapshots() {
  if (!hasLS()) return [];
  try {
    const raw = window.localStorage.getItem(SNAP_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function _writeSnapshots(list) {
  if (!hasLS()) return;
  try { window.localStorage.setItem(SNAP_KEY, JSON.stringify(list)); }
  catch (e) { console.error('[snapshots] no se pudo escribir el snapshot de seguridad', e); _persisAvisarFallo('No se pudo guardar el snapshot de seguridad previo a la operación. Considera exportar un respaldo (.json) manualmente.'); }
}
export function pushSnapshot(label) {
  const snap = {
    label: label || 'Snapshot',
    createdAt: new Date().toISOString(),
    json: JSON.stringify(buildSaveObject())
  };
  const list = _readSnapshots();
  list.unshift(snap);
  while (list.length > SNAP_MAX) list.pop();
  _writeSnapshots(list);
}
function restoreSnapshot(index) {
  const list = _readSnapshots();
  const snap = list[index];
  if (!snap) {
    showToast({ kind: 'error', title: 'Snapshot no encontrado', body: 'El snapshot ya no está disponible.' });
    return;
  }
  let obj;
  try { obj = JSON.parse(snap.json); }
  catch (e) {
    showToast({ kind: 'error', title: 'Snapshot corrupto', body: 'No se pudo leer el snapshot.' });
    return;
  }
  showModal({
    danger: true,
    title: 'Revertir al snapshot',
    body: `Vas a reemplazar el estado actual por el snapshot <strong>${escapeHtml(snap.label)}</strong> (${escapeHtml(new Date(snap.createdAt).toLocaleString('es-CL'))}).<br><br>
      TakeOS va a crear otro snapshot antes de revertir, por si te arrepientes de revertir también. Operación segura, pero confirmá.`,
    confirmLabel: 'Sí, revertir',
    cancelLabel: 'Cancelar',
    onConfirm: () => {
      pushSnapshot('Antes de revertir a: ' + snap.label);
      applyLoadedState(obj);
      showToast({ kind: 'success', title: 'Estado revertido', body: `Restaurado desde "${escapeHtml(snap.label)}".` });
    },
    onCancel: () => {}
  });
}
function deleteSnapshot(index) {
  const list = _readSnapshots();
  if (!list[index]) return;
  list.splice(index, 1);
  _writeSnapshots(list);
}

export function openSnapshotsModal() {
  const list = _readSnapshots();
  let body;
  if (list.length === 0) {
    body = '<div style="color:#8a8d95;padding:24px;text-align:center;">No hay snapshots todavía.<br>Se crean automáticamente antes de cualquier carga destructiva.</div>';
  } else {
    body = '<div style="display:flex;flex-direction:column;gap:8px;max-height:50vh;overflow-y:auto;">' +
      list.map((s, i) => {
        const when = new Date(s.createdAt).toLocaleString('es-CL');
        let bytes = 0;
        try { bytes = s.json.length; } catch(e){}
        const kb = (bytes / 1024).toFixed(1);
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;background:#1a1a1c;border:1px solid #2a2a2e;border-radius:8px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;color:#e8e8ea;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(s.label)}</div>
            <div style="color:#8a8d95;font-size:11px;margin-top:2px;">${escapeHtml(when)} · ${kb} KB</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button ${accionHTML('snap.revertir', i)} style="padding:6px 12px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:500;">Revertir</button>
            <button ${accionHTML('snap.borrar', i)} style="padding:6px 10px;background:transparent;color:#8a8d95;border:1px solid #3a3a3e;border-radius:6px;font-size:12px;cursor:pointer;" title="Eliminar">✕</button>
          </div>
        </div>`;
      }).join('') + '</div>';
  }
  showModal({
    title: 'Snapshots — historial de respaldos',
    body: body + '<div style="color:#8a8d95;font-size:11px;margin-top:14px;line-height:1.5;">Los snapshots se guardan en este navegador (localStorage). Si cambias de navegador o limpias datos, se pierden. Para respaldo permanente, exporta a JSON.</div>',
    confirmLabel: 'Cerrar',
    cancelLabel: null,
    onConfirm: () => {}
  });
}
function deleteSnapshotFromModal(index) {
  deleteSnapshot(index);
  // Reabrir el modal con la lista actualizada
  setTimeout(() => {
    // cerrar modal abierto primero
    const m = document.querySelector('.modal-overlay');
    if (m) m.remove();
    openSnapshotsModal();
  }, 50);
}

/* ═══════════════════════════════════════════════════════════════════════
   EXPORT / IMPORT POR PROYECTO  (V7.1)
   ─────────────────────────────────────────────────────────────────────
   Permite guardar y cargar UN solo proyecto sin tocar la BD ni los demás
   proyectos. Formato distinto del save "todo el OS":
     { app: 'TakeOS', format: 'takeos-project', version: 1, ... }
   ═══════════════════════════════════════════════════════════════════════ */
const PROJECT_FORMAT_VERSION = 1;

function exportSingleProject(projectId) {
  const proj = PROJECTS.find(p => p.id === projectId);
  if (!proj) {
    showToast({ kind: 'error', title: 'Proyecto no encontrado', body: 'No se pudo localizar el proyecto.' });
    return;
  }
  try {
    const data = {
      app: 'TakeOS',
      format: 'takeos-project',
      version: PROJECT_FORMAT_VERSION,
      savedAt: new Date().toISOString(),
      takeosVersion: TAKEOS_VERSION,
      project: proj
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const cliente = (proj.data?.infoProyecto?.cliente || 'proyecto').replace(/[^a-z0-9_-]/gi, '_').slice(0, 30);
    const nombre = (proj.data?.infoProyecto?.nombreProyecto || '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 30);
    const fname = `takeos_proyecto_${cliente}${nombre ? '_'+nombre : ''}_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}.json`;
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast({ kind: 'success', title: 'Proyecto exportado', body: `Se descargó <strong>${escapeHtml(fname)}</strong>. Es un archivo seguro: importarlo no toca tu BD ni el resto de proyectos.` });
  } catch (e) {
    showToast({ kind: 'error', title: 'No se pudo exportar', body: 'Ocurrió un error al generar el archivo.' });
  }
}

function importSingleProjectFromInput(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let obj;
    try { obj = JSON.parse(reader.result); }
    catch (e) {
      showToast({ kind: 'error', title: 'Archivo ilegible', body: 'No se pudo leer el archivo como JSON válido.' });
      return;
    }

    // Detectar formato: takeos-project (un proyecto) vs takeos-save (todo el OS)
    if (obj && obj.format === 'takeos-save') {
      showModal({
        danger: true,
        title: 'Esto es un respaldo completo, no un proyecto suelto',
        body: 'El archivo que elegiste es un respaldo de <strong>TODO el OS</strong> (proyectos + BD), no un proyecto individual.<br><br>Si quieres cargarlo, usa el botón <strong>"Cargar respaldo completo"</strong> (es destructivo, te avisamos antes).<br><br>Si quieres cargar solo un proyecto, exporta uno desde el menú del proyecto correspondiente (botón "Exportar este proyecto").',
        confirmLabel: 'Entendido',
        cancelLabel: null,
        onConfirm: () => {}
      });
      return;
    }
    if (!obj || obj.format !== 'takeos-project' || !obj.project || typeof obj.project.id !== 'string') {
      showToast({ kind: 'error', title: 'Archivo inválido', body: 'No parece un archivo de proyecto de TakeOS.' });
      return;
    }

    const incoming = obj.project;
    const existing = PROJECTS.find(p => p.id === incoming.id);
    const cliente = incoming.data?.infoProyecto?.cliente || '(sin cliente)';
    const nombre = incoming.data?.infoProyecto?.nombreProyecto || '(sin nombre)';
    const savedWhen = obj.savedAt ? new Date(obj.savedAt).toLocaleString('es-CL') : 'fecha desconocida';

    if (existing) {
      showModal({
        danger: true,
        title: 'Ya existe un proyecto con este ID',
        body: `Hay un proyecto con el mismo ID en tu OS:<br><br>
          <strong>Existente:</strong> ${escapeHtml(existing.data?.infoProyecto?.cliente || '?')} — ${escapeHtml(existing.data?.infoProyecto?.nombreProyecto || '?')}<br>
          <strong>Entrante:</strong> ${escapeHtml(cliente)} — ${escapeHtml(nombre)} (guardado el ${escapeHtml(savedWhen)})<br><br>
          Si reemplazás, el proyecto actual se pierde. La BD y los demás proyectos quedan intactos.`,
        confirmLabel: 'Reemplazar este proyecto',
        cancelLabel: 'Cancelar',
        onConfirm: () => {
          pushSnapshot('Antes de reemplazar proyecto: ' + nombre);
          const idx = PROJECTS.findIndex(p => p.id === incoming.id);
          PROJECTS[idx] = incoming;
          renderKanban && renderKanban();
          renderMetrics && renderMetrics();
          autosaveNow();
          showToast({ kind: 'success', title: 'Proyecto reemplazado', body: `<strong>${escapeHtml(cliente)}</strong> — ${escapeHtml(nombre)} actualizado.` });
        },
        onCancel: () => {}
      });
    } else {
      showModal({
        title: 'Importar proyecto',
        body: `Vas a importar el proyecto <strong>${escapeHtml(cliente)}</strong> — ${escapeHtml(nombre)} (guardado el ${escapeHtml(savedWhen)}).<br><br>Se va a agregar a tus proyectos actuales. La BD y los demás proyectos no se tocan.`,
        confirmLabel: 'Importar',
        cancelLabel: 'Cancelar',
        onConfirm: () => {
          PROJECTS.push(incoming);
          renderKanban && renderKanban();
          renderMetrics && renderMetrics();
          autosaveNow();
          showToast({ kind: 'success', title: 'Proyecto importado', body: `<strong>${escapeHtml(cliente)}</strong> — ${escapeHtml(nombre)} agregado.` });
        },
        onCancel: () => {}
      });
    }
  };
  reader.onerror = () => showToast({ kind: 'error', title: 'Error de lectura', body: 'No se pudo leer el archivo.' });
  reader.readAsText(file);
}

/* ─── AUTOGUARDADO (localStorage, best-effort) ─────────────────────── */
let _persisFalloAvisado = false;
function _persisAvisarFallo(body) {
  /* D0 · el fallo de escritura local (quota llena, modo privado) era tragado en
     silencio por ~30 llamadores que jamás revisan el retorno. Un aviso por
     sesión: informar sin spamear. Hallazgo 🔴 de la Fase 0. */
  if (_persisFalloAvisado) return; _persisFalloAvisado = true;
  try { showToast({ kind: 'warning', title: 'Respaldo local con problemas', body: body, duration: 9000 }); } catch (e) {}
}
export function autosaveNow() {
  let ok = false;
  if (hasLS()) {
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(buildSaveObject())); ok = true; }
    catch (e) { console.error('[autosave] no se pudo escribir localStorage', e); _persisAvisarFallo('El autoguardado local falló (¿espacio del navegador lleno?). Tus cambios siguen yendo a la nube, pero el respaldo offline no se está actualizando.'); }
  }
  return ok;
}
function scheduleAutosave() {
  if (_autosaveTimer) clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(autosaveNow, 2000);
}

/* ─── ESTADO "SIN GUARDAR" (dirty) ─────────────────────────────────── */
function _syncDirtyChip() {
  const cb = document.querySelector('.topbar-config-btn');   // V7.5: lucecita de cambios sin guardar
  if (cb) cb.classList.toggle('is-dirty', !!STATE.dirty);
}
export function markDirty() {
  STATE.dirty = true;
  const btn = document.getElementById('saveBtn');
  if (btn) btn.classList.add('is-dirty');
  _syncDirtyChip();
  recordUndoPoint();  // V5.11 (Nota 1)
  scheduleAutosave();
  if (STATE.currentProject) dalTouchProyecto(STATE.currentProject);   // V9.2.2: escribe el proyecto abierto a Supabase
}
function clearDirty() {
  STATE.dirty = false;
  const btn = document.getElementById('saveBtn');
  if (btn) btn.classList.remove('is-dirty');
  _syncDirtyChip();
}

/* V5.11 (Nota 1) — Undo básico */
export function captureUndoBaseline() {
  const p = STATE.currentProject;
  UNDO_STACK = [];
  UNDO_BASELINE = p ? { id: p.id, snap: JSON.stringify(p) } : null;
  updateUndoButton();
}
function recordUndoPoint() {
  if (STATE.currentView !== 'project') return;
  const p = STATE.currentProject;
  if (!p) return;
  if (UNDO_BASELINE && UNDO_BASELINE.id === p.id) {
    UNDO_STACK.push(UNDO_BASELINE);
    while (UNDO_STACK.length > UNDO_MAX) UNDO_STACK.shift();
    REDO_STACK = [];   // una edición nueva invalida el rehacer
  }
  UNDO_BASELINE = { id: p.id, snap: JSON.stringify(p) };
  updateUndoButton();
}
function updateUndoButton() {
  const b = document.getElementById('undoBtn');
  if (b) b.disabled = UNDO_STACK.length === 0;
}
/* Pasada 1 · reinicia los flags de runtime que NO deben sobrevivir a un undo/redo
   (el snapshot serializa el proyecto entero, incluidos estos). Sin esto, un undo
   tomado durante un guardado restauraría _saving=true y trabaría el autosave. */
/* Pasada 1 · la VERSIÓN (cabecera y por fila) es metadata de concurrencia del
   servidor, no contenido del usuario. Tras un undo/redo (que restaura un snapshot
   viejo) se conserva la versión VIVA por clientUuid y la línea base de concurrencia
   (_headerVersion/_budgetPendingDeletes/_snap) del estado vivo, para que el
   contenido restaurado se reenvíe con la versión correcta, sin conflicto falso. */
function _reconcileVersionsFromLive(restored, live) {
  if (!restored || !live) return;
  var liveVers = {};
  function scan(arr) { (arr || []).forEach(function (r) { if (r && r.clientUuid) liveVers[r.clientUuid] = r.version; }); }
  var ld = live.data || {};
  for (var dep in (ld.servicios || {})) scan(ld.servicios[dep]);
  scan(ld.gastos); scan(ld.equipos); scan(ld.talentos);
  function apply(arr) { (arr || []).forEach(function (r) { if (r && r.clientUuid && Object.prototype.hasOwnProperty.call(liveVers, r.clientUuid)) r.version = liveVers[r.clientUuid]; }); }
  var rd = restored.data || {};
  for (var dep2 in (rd.servicios || {})) apply(rd.servicios[dep2]);
  apply(rd.gastos); apply(rd.equipos); apply(rd.talentos);
  restored._headerVersion = live._headerVersion;
  restored._budgetPendingDeletes = (live._budgetPendingDeletes || []).slice();
  restored._snap = live._snap;
}
function _resetFlagsRuntime(project) {
  if (!project) return;
  project._saving = false; project._resaveQueued = false;
  project._autosaveSuspendedByConflict = false; project._conflictoModalAbierto = false;
  try { _conflictoBannerHide(); } catch (e) {}
}
export function undoLast() {
  if (UNDO_STACK.length === 0) {
    showToast({ kind: 'info', title: 'Nada que deshacer', body: 'No hay una acción reciente para revertir en este proyecto.' });
    return;
  }
  const prev = UNDO_STACK.pop();
  if (UNDO_BASELINE && UNDO_BASELINE.id === prev.id) REDO_STACK.push(UNDO_BASELINE);
  const restored = JSON.parse(prev.snap);
  const idx = PROJECTS.findIndex(x => x.id === prev.id);
  const _live = (idx !== -1) ? PROJECTS[idx] : ((STATE.currentProject && STATE.currentProject.id === prev.id) ? STATE.currentProject : null);
  if (idx !== -1) PROJECTS[idx] = restored;
  if (STATE.currentProject && STATE.currentProject.id === prev.id) STATE.currentProject = restored;
  _reconcileVersionsFromLive(restored, _live);   // Pasada 1 · conserva la versión viva (server) → evita conflicto falso tras undo
  _resetFlagsRuntime(restored);   // Pasada 1 · no resucitar flags transitorios (evita deadlock de _saving)
  UNDO_BASELINE = { id: restored.id, snap: prev.snap };
  STATE.dirty = true;
  const sb = document.getElementById('saveBtn'); if (sb) sb.classList.add('is-dirty');
  _syncDirtyChip();
  scheduleAutosave();
  updateUndoButton();
  if (STATE.currentView === 'project') navigateToModule(STATE.currentModule);
  showToast({ kind: 'success', title: 'Acción deshecha', body: 'Cmd+Shift+Z para rehacer.' });
}
export function redoLast() {
  if (REDO_STACK.length === 0) { showToast({ kind: 'info', title: 'Nada que rehacer', body: 'No hay una acción reciente para rehacer.' }); return; }
  const next = REDO_STACK.pop();
  if (UNDO_BASELINE && UNDO_BASELINE.id === next.id) UNDO_STACK.push(UNDO_BASELINE);
  const restored = JSON.parse(next.snap);
  const idx = PROJECTS.findIndex(x => x.id === next.id);
  const _live = (idx !== -1) ? PROJECTS[idx] : ((STATE.currentProject && STATE.currentProject.id === next.id) ? STATE.currentProject : null);
  if (idx !== -1) PROJECTS[idx] = restored;
  if (STATE.currentProject && STATE.currentProject.id === next.id) STATE.currentProject = restored;
  _reconcileVersionsFromLive(restored, _live);   // Pasada 1 · conserva la versión viva (server) → evita conflicto falso tras redo
  _resetFlagsRuntime(restored);   // Pasada 1 · idem undo
  UNDO_BASELINE = { id: restored.id, snap: next.snap };
  STATE.dirty = true;
  const sb = document.getElementById('saveBtn'); if (sb) sb.classList.add('is-dirty');
  _syncDirtyChip();
  scheduleAutosave();
  updateUndoButton();
  if (STATE.currentView === 'project') navigateToModule(STATE.currentModule);
  showToast({ kind: 'success', title: 'Acción rehecha', body: 'Se reaplicó el cambio.' });
}

/* Al volver a abrir: si hay autoguardado válido, ofrecer restaurarlo
   (no clobbear en silencio, para no confundir entre archivos/versiones). */

// ── Window bridges Persistencia local (verificados caller por caller en pre-análisis) ──
window.markDirty                    = markDirty;                    // ~35 sitios clásicos + 9 módulos + listeners DOMContentLoaded (por referencia)
window.autosaveNow                  = autosaveNow;                  // clásico + beforeunload + bd/legal/locaciones/bd-excel
window.undoLast                     = undoLast;                     // onclick topbar L1323 + keydown ⌘Z
window.redoLast                     = redoLast;                     // keydown ⌘⇧Z
window.importSaveFromInput          = importSaveFromInput;          // onchange estático L1328
window.importSingleProjectFromInput = importSingleProjectFromInput; // onchange estático L1380
window.restoreSnapshot              = restoreSnapshot;              // onclick generado
window.deleteSnapshotFromModal      = deleteSnapshotFromModal;      // onclick generado
window.openSnapshotsModal           = openSnapshotsModal;           // config.js + buscador.js
window.exportSave                   = exportSave;                   // config.js + buscador.js
window.exportSingleProject          = exportSingleProject;          // kanban.js
window.captureUndoBaseline          = captureUndoBaseline;          // kanban.js
window.pushSnapshot                 = pushSnapshot;                 // bd-excel.js
window.restoreLocalLocPhotos        = restoreLocalLocPhotos;        // dal.js:321

// D2 · acciones delegadas
registrarAcciones('snap', {
  revertir: function (args) { restoreSnapshot(args[0]); },
  borrar: function (args) { deleteSnapshotFromModal(args[0]); },
});
