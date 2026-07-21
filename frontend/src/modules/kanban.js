// Módulo Proyectos / Kanban — Etapa 2.
//
// Contiene: STATES, métricas del Control Room, tarjetas Kanban, navegación
// (Control Room ↔ proyecto), creación/eliminación de proyectos y persistencia
// de la última vista.
//
// Puentes a window al final del archivo: todo lo que el HTML inline o el
// monolito clásico referencian como global.

// D1d · imports reales — kanban evalúa en pos 16: DIFERIDAS las aristas a
// tareas (×3: tareas importa kanban — ciclo), config (irAlPanelPersonal:
// config importa kanban — ciclo; además window-read en la guarda :142) y boot
// (_firstVisibleModule: no arrastrar boot a 16 por 1 símbolo). VETADOS:
// currentUser, _TIENE_EMPRESA (window mutables).
import { escapeHtml, showToast } from '../lib/helpers.js';
import { PROJECTS, STATE, TRASH, ORG_ID, PROJECTS_SOURCE, TAKEOS_PERFIL, _TIENE_EMPRESA } from '../lib/state.js';
import { buildProjectData } from '../lib/modelo.js';
import { _authBlockWriteToast, authNivel, authPuedeVer } from '../lib/auth.js';
import { formatCLP } from '../lib/calc.js';
import { closeModal, showModal, comboboxOpen, comboboxFilter, comboboxCloseDelayed } from '../lib/ui.js';
import { navigateToModule } from '../lib/nav.js';
import { calcSummaryFin } from './presupuesto-cotizacion.js';
import { DAL_KNOWN_PROJECT_IDS, dalTouchProyecto, dalFlushProyectos, dalGuardarCargos } from './dal.js';
import { captureUndoBaseline, markDirty } from './persistencia-local.js';

// authNivel y authPuedeVer se leen desde window (auth.js auto-puentea a window en Etapa 1)

// ── Constantes ──────────────────────────────────────────────────────────────

import { registrarAcciones, accionHTML } from '../lib/delegacion.js';
import { gancho, define, valor } from '../lib/ganchos.js';
import { sb } from '../lib/supabase.js';
let _delExpected;   // D4c: estado propio del módulo (antes window._delExpected, era de los handlers inline)
let _npDraft;   // D4c: estado propio del módulo (antes window._npDraft, era de los handlers inline)
export const STATES = {
  'venta':         { name: 'Venta',          color: 'var(--state-sale)',   order: 1 },
  'preproduccion': { name: 'Preproducción',  color: 'var(--state-prep)',   order: 2 },
  'produccion':    { name: 'Producción',     color: 'var(--state-prod)',   order: 3 },
  'postproduccion':{ name: 'Postproducción', color: 'var(--state-post)',   order: 4 },
  'cierre':        { name: 'Cierre',         color: 'var(--state-close)',  order: 5 },
  'cerrado':       { name: 'Cerrado',        color: 'var(--state-closed)', order: 6 },
  'rechazado':     { name: 'Rechazado',      color: 'var(--state-reject)', order: 7 }
};

const _LV_KEY = 'takeos_last_view';

// ── Atención / alertas ──────────────────────────────────────────────────────

export function projectAttentionCount(project, user) {
  const u = user || gancho('currentUser')();
  const t = (gancho('ensureTareas')(project)).filter(x => x.estado !== 'completada' && x.asignadoA === u).length;
  return t + gancho('userSenales')(project, u).length;
}

export function projectsNeedingAttention(user) {
  const u = user || gancho('currentUser')(); let n = 0;
  PROJECTS.forEach(p => { if (projectAttentionCount(p, u) > 0) n++; });
  return n;
}

// ── Persistencia de última vista ────────────────────────────────────────────

export function _lastViewSave() {
  try {
    sessionStorage.setItem(_LV_KEY, JSON.stringify({
      org: ORG_ID,
      view: STATE.currentView,
      projectId: (STATE.currentProject && STATE.currentProject.id) || null,
      module: STATE.currentModule || null
    }));
  } catch (e) {}
}

export function _lastViewLeer() {
  try { return JSON.parse(sessionStorage.getItem(_LV_KEY) || 'null'); } catch (e) { return null; }
}

// ── Monto neto del cliente ──────────────────────────────────────────────────

export function projectClientNet(p) {
  try { const sfin = calcSummaryFin(p); if (sfin.presupClienteEfectivo > 0) return sfin.presupClienteEfectivo; } catch (e) {}
  return p.amount || 0;
}

// ── Render ──────────────────────────────────────────────────────────────────

export function renderMetrics() {
  const active = PROJECTS.filter(p => !['cerrado', 'rechazado'].includes(p.state));
  const closedMay = PROJECTS.filter(p => p.state === 'cerrado');
  document.getElementById('metric-active').textContent = active.length;
  document.getElementById('metric-closed-month').textContent = closedMay.length;
  document.getElementById('metric-alerts').textContent = projectsNeedingAttention(gancho('currentUser')());
}

export function renderProjectCard(p) {
  return `
    <div class="project-card" data-project-id="${p.id}">
      <div class="project-card-header">
        <div>
          <div class="project-client">${p.client}</div>
          <div class="project-name">${p.name}</div>
        </div>
        ${projectAttentionCount(p, gancho('currentUser')()) > 0 ? `<div class="project-mine" title="Requieren tu atención (tareas + señales)">${projectAttentionCount(p, gancho('currentUser')())}</div>` : ''}${p.alerts > 0 ? `<div class="project-alert">${p.alerts}</div>` : ''}
      </div>
      <div class="project-meta">
        <div class="project-meta-row">
          <span class="project-meta-label">PE</span>
          <span class="project-meta-value">${p.pe}</span>
        </div>
        <div class="project-meta-row">
          <span class="project-meta-label">${p.state === 'produccion' || p.state === 'postproduccion' || p.state === 'cierre' ? 'Estado' : 'Fecha'}</span>
          <span class="project-meta-value">${p.date}</span>
        </div>
        <div class="project-meta-row">
          <span class="project-meta-label">Monto</span>
          <span class="project-amount">${formatCLP(projectClientNet(p))}</span>
        </div>
      </div>
    </div>
  `;
}

export function renderKanban() {
  const container = document.getElementById('kanbanContainer');
  container.innerHTML = '';

  Object.entries(STATES)
    .sort((a, b) => a[1].order - b[1].order)
    .forEach(([key, state]) => {
      const projects = PROJECTS.filter(p => p.state === key);
      const col = document.createElement('div');
      col.className = 'column';
      col.innerHTML = `
        <div class="column-header">
          <div class="column-title">
            <div class="column-dot" style="background: ${state.color}"></div>
            <span class="column-name">${state.name}</span>
          </div>
          <span class="column-count">${projects.length}</span>
        </div>
        <div class="column-body">
          ${projects.length === 0
            ? '<div class="empty-column">Sin proyectos</div>'
            : projects.map(renderProjectCard).join('')}
        </div>
      `;
      container.appendChild(col);
    });

  document.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => {
      navigateToProject(card.dataset.projectId);
    });
  });
  try { gancho('renderMisTareas')(); } catch (e) {}
}

// ── Navegación ───────────────────────────────────────────────────────────────

export function navigateToControlRoom() {
  try { if (!_TIENE_EMPRESA || (typeof TAKEOS_PERFIL !== 'undefined' && TAKEOS_PERFIL && TAKEOS_PERFIL.tipo === 'externo')) { gancho('irAlPanelPersonal')(); return; } } catch (e) {}
  STATE.currentView = 'control-room';
  STATE.currentProject = null;
  document.getElementById('controlRoomView').classList.remove('hidden');
  const pv = document.getElementById('projectView');
  if (pv) pv.classList.add('hidden');
  const bd = document.getElementById('bdGlobalView');
  if (bd) bd.classList.add('hidden');
  const mm = document.getElementById('moduleMain'); if (mm) mm.innerHTML = '';
  const bm = document.getElementById('bdGlobalMain'); if (bm) bm.innerHTML = '';
  document.getElementById('breadcrumb').innerHTML = `<span class="breadcrumb-current">Control Room</span>`;
  try { renderMetrics(); renderKanban(); } catch (e) {}
  _lastViewSave();
  window.scrollTo(0, 0);
}

export function navigateToProject(projectId) {
  const project = PROJECTS.find(p => p.id === projectId);
  if (!project) return;

  STATE.currentView = 'project';
  STATE.currentProject = project;
  STATE.currentModule = 'info-proyecto';

  document.getElementById('controlRoomView').classList.add('hidden');
  document.getElementById('projectView').classList.remove('hidden');
  const bd = document.getElementById('bdGlobalView');
  if (bd) bd.classList.add('hidden');
  const bm = document.getElementById('bdGlobalMain'); if (bm) bm.innerHTML = '';

  const _esExterno = typeof TAKEOS_PERFIL !== 'undefined' && TAKEOS_PERFIL && TAKEOS_PERFIL.tipo === 'externo';

  document.getElementById('breadcrumb').innerHTML = _esExterno
    ? `<span class="breadcrumb-link" data-accion="kanban.panel">Mis proyectos</span>
       <span class="breadcrumb-sep">›</span>
       <span class="breadcrumb-current">${project.client} · ${project.name}</span>`
    : `<span class="breadcrumb-link" data-accion="kanban.controlRoom">Control Room</span>
       <span class="breadcrumb-sep">›</span>
       <span class="breadcrumb-current">${project.client} · ${project.name}</span>`;

  document.getElementById('sidebarProject').innerHTML = `
    <div class="sidebar-project-client">${project.client}</div>
    <div class="sidebar-project-name">${project.name}</div>
    <div class="sidebar-project-state">
      <div class="column-dot" style="background: ${STATES[project.state].color}"></div>
      ${STATES[project.state].name}
    </div>
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-soft);">
      <button ${accionHTML('kanban.exportar', project.id)}
              title="Exporta este proyecto solo a .json. No toca la BD ni los demás proyectos."
              style="width:100%;padding:8px 12px;background:transparent;color:var(--ink-secondary);border:1px solid var(--border-soft);border-radius:6px;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;font-family:inherit;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Exportar este proyecto
      </button>
    </div>
    ${_esExterno ? `<div style="margin-top:10px;padding:8px 10px;border-radius:6px;background:var(--bg-surface-soft,rgba(120,113,108,.08));border:1px solid var(--rule);font-size:11px;color:var(--ink-faint);line-height:1.5;">Colaboras como externo · solo ves este proyecto.</div>` : ''}
  `;

  var _modIni = (typeof authPuedeVer === 'function' && !authPuedeVer('info-proyecto'))
    ? (gancho('_firstVisibleModule')() || 'info-proyecto') : 'info-proyecto';
  navigateToModule(_modIni);
  captureUndoBaseline();
  window.scrollTo(0, 0);
}

// ── Crear proyecto ───────────────────────────────────────────────────────────

export async function newProject() {
  if (authNivel('crear_proyecto') !== 'E') { _authBlockWriteToast(); return; }
  _npDraft = { nombre: '', cliente: '', pe: '', director: '', jp: '' };
  // I11b · lista REAL de internos de la productora (memberships) para decidir, al
  // crear, si cada responsable es interno o externo (no forzar todos a externo).
  let _internos = [];
  try { _internos = (await gancho('_cargoCargarInternos')()) || []; } catch (e) {}
  const _internSet = new Set(_internos.map(function (n) { return String(n).trim().toLowerCase(); }));
  showModal({
    title: 'Nuevo proyecto',
    body: `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div>
          <label class="field-label">Nombre del proyecto *</label>
          <input class="input" ${accionHTML('kanban.npDraft', 'nombre', { on: 'input' })} placeholder="Ej: Lanzamiento Primavera">
        </div>
        <div>
          <label class="field-label">Cliente *</label>
          <input class="input" ${accionHTML('kanban.npDraft', 'cliente', { on: 'input' })} placeholder="Ej: Watt's">
        </div>
        <div>
          <label class="field-label">Productor/a Ejecutivo/a</label>
          <span class="combobox-wrap cbx-anchored" style="display:block;">
            <input class="input combobox-input" value="" autocomplete="off" ${accionHTML('kanban.npPersona', 'pe', { on: 'focus input blur change' })} placeholder="Elige o escribe un nombre">
            <div class="combobox-dropdown" hidden></div>
          </span>
        </div>
        <div>
          <label class="field-label">Director/a</label>
          <span class="combobox-wrap cbx-anchored" style="display:block;">
            <input class="input combobox-input" value="" autocomplete="off" ${accionHTML('kanban.npPersona', 'director', { on: 'focus input blur change' })} placeholder="Elige o escribe un nombre">
            <div class="combobox-dropdown" hidden></div>
          </span>
        </div>
        <div>
          <label class="field-label">Jefe/a de Producción</label>
          <span class="combobox-wrap cbx-anchored" style="display:block;">
            <input class="input combobox-input" value="" autocomplete="off" ${accionHTML('kanban.npPersona', 'jp', { on: 'focus input blur change' })} placeholder="Elige o escribe un nombre">
            <div class="combobox-dropdown" hidden></div>
          </span>
        </div>
        <p style="font-size:12px; color:var(--ink-faint); margin:0;">Se crea en estado <strong>Venta</strong>. Los responsables quedan asignados y como cargos reales en el módulo Cargos.</p>
      </div>`,
    confirmLabel: 'Crear proyecto',
    cancelLabel: 'Cancelar',
    onConfirm: () => {
      const d = _npDraft || {};
      const nombre = (d.nombre || '').trim();
      const cliente = (d.cliente || '').trim();
      const pe = (d.pe || '').trim();
      const director = (d.director || '').trim();
      const jp = (d.jp || '').trim();
      if (!nombre || !cliente) {
        showToast({ kind: 'error', title: 'Faltan datos', body: 'El nombre del proyecto y el cliente son obligatorios.' });
        return;
      }
      const id = 'P-' + Date.now();
      // I11b · cargos reales para los responsables asignados al crear (los nombres
      // de cargo calzan con la derivación RECI: PE / Director / Jefe de Producción).
      // El tipo se decide según los internos REALES: si la persona es interna de
      // la productora queda 'interno', si no 'externo' (un PE/Director/JP puede ser
      // freelance). No se crea ninguna invitación (guardar_cargos solo escribe el
      // cargo; marcar 'interno' a un miembro ya existente no lo re-invita).
      const _esInterno = function (persona) { return _internSet.has(String(persona || '').trim().toLowerCase()); };
      // Cada rol nace con su perfil de acceso por defecto (evita un cargo sin
      // nivel de permisos). Ninguno es Administrador/Finanzas, así que también
      // vale para externos (guardar_cargos los rechazaría).
      // Estado igual que en el flujo normal de Cargos: un interno queda 'activo';
      // un externo queda 'pendiente' (aún no acepta), nunca 'activo' automático.
      const _mkCargo = function (cargoName, persona, perfil) { if (!persona) return null; const _int = _esInterno(persona); return { id: 'CG-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), cargo: cargoName, custom: false, personaNombre: persona, tipo: _int ? 'interno' : 'externo', perfil: perfil, estado: _int ? 'activo' : 'pendiente' }; };
      const cargosNuevos = [
        _mkCargo('Productor/a Ejecutivo/a', pe, 'Ejecutivo'),
        _mkCargo('Director/a', director, 'Creativo'),
        _mkCargo('Jefe/a de Producción', jp, 'Producción')
      ].filter(Boolean);
      const nuevo = {
        id, client: cliente, name: nombre, state: 'venta',
        pe: pe || '—', amount: 0, currency: 'CLP',
        alerts: 0, lastActivity: 'Recién creado', date: '—',
        data: buildProjectData({ infoProyecto: { cliente, nombreProyecto: nombre, productorEjecutivo: pe, director: director, jefeProduccion: jp, fechaCotizacion: new Date().toISOString().slice(0, 10) } })
      };
      nuevo.data.cargos = cargosNuevos;
      nuevo.data._cargosOK = true;   // ya tenemos los cargos en memoria; que no los pise una carga vacía del server hasta que se guarden
      PROJECTS.push(nuevo);
      markDirty();
      renderMetrics();
      renderKanban();
      showToast({ kind: 'success', title: 'Proyecto creado', body: `“${escapeHtml(nombre)}” creado en Venta. Ábrelo para empezar a cotizar.` });
      navigateToProject(id);
      // FIX persistencia · el proyecto nuevo se escribe SIEMPRE a la base apenas se
      // crea. Antes esto solo pasaba si venía con cargos; sin cargos, markDirty() (más
      // arriba) corría ANTES de navigateToProject y tocaba el proyecto anterior (o
      // ninguno, en el Control Room), así que el proyecto recién creado nunca se
      // guardaba y se perdía al recargar. dalTouchProyecto(nuevo) va tras navigate,
      // cuando el nuevo ya es el proyecto abierto.
      dalTouchProyecto(nuevo);
      // I11b · guardar el proyecto y RECIÉN DESPUÉS los cargos: project_cargos tiene
      // FK al proyecto, así que el RPC guardar_cargos necesita que ya exista en la base.
      if (cargosNuevos.length) {
        Promise.resolve(dalFlushProyectos()).then(function () { return dalGuardarCargos(nuevo); }).catch(function () {});
      }
    },
    onCancel: () => {}
  });
}

// ── Eliminar proyecto ────────────────────────────────────────────────────────

export function deleteProjectFlow(id) {
  if (authNivel('eliminar_proyecto') !== 'E') { _authBlockWriteToast(); return; }
  const proj = PROJECTS.find(p => p.id === id);
  if (!proj) return;
  if (!STATE.adminMode) {
    showToast({ kind: 'warning', title: 'Solo administrador', body: 'Activa el Modo administrador para eliminar proyectos.' });
    return;
  }
  _delExpected = proj.name;
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" data-accion="ui.backdrop">
      <div class="modal" style="max-width: 520px; border: 1px solid var(--negative);">
        <div class="modal-header">
          <div class="modal-title" style="color: var(--negative);">⚠ Eliminar proyecto</div>
          <div style="font-size: 12px; color: var(--ink-muted); margin-top: 4px;">Esto es <strong>irreversible</strong>: se borra “${escapeHtml(proj.name)}” y todos sus datos de esta sesión. Si no exportaste un guardado, no hay vuelta atrás.</div>
        </div>
        <div class="modal-body">
          <label class="field-label">Para confirmar, escribe el nombre exacto del proyecto:</label>
          <div style="font-family: monospace; background: var(--accent-bg); color: var(--ink-primary); padding: 6px 10px; border-radius: 6px; margin: 8px 0; user-select: all;">${escapeHtml(proj.name)}</div>
          <input class="input" id="delConfirmInput" placeholder="Escribe el nombre aquí" autocomplete="off"
                 data-accion="kanban.delCheck" data-on="input">
        </div>
        <div class="modal-footer">
          <button class="btn" data-accion="ui.cerrar">Cancelar</button>
          <button class="btn btn-danger" id="delConfirmBtn" disabled ${accionHTML('kanban.delConfirm', id)}>Eliminar definitivamente</button>
        </div>
      </div>
    </div>`;
}

export async function confirmDeleteProject(id) {
  const i = PROJECTS.findIndex(p => p.id === id);
  if (i === -1) { closeModal(); return; }
  const proj = PROJECTS[i];
  const name = proj.name;
  if (sb && PROJECTS_SOURCE === 'supabase' && DAL_KNOWN_PROJECT_IDS.has(id)) {
    const btn = document.getElementById('delConfirmBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Eliminando…'; }
    try {
      const now = new Date().toISOString();
      const { error } = await sb.from('projects')
        .update({ deleted_at: now, updated_at: now })
        .eq('id', id).eq('organization_id', ORG_ID);
      if (error) throw error;
    } catch (e) {
      console.error('[delete] no se pudo marcar deleted_at en Supabase:', e);
      const btn = document.getElementById('delConfirmBtn');
      if (btn) { btn.disabled = false; btn.textContent = 'Eliminar definitivamente'; }
      showToast({ kind: 'warning', title: 'No se pudo eliminar', body: 'No se pudo escribir el borrado en Supabase. El proyecto NO se eliminó. Revisa la conexión e inténtalo de nuevo.' });
      return;
    }
  }
  proj._deletedAt = new Date().toISOString();
  proj._deletedState = proj.state;
  TRASH.unshift(proj);
  PROJECTS.splice(i, 1);
  closeModal();
  STATE.currentProject = null;
  markDirty();
  navigateToControlRoom();
  renderMetrics();
  renderKanban();
  showToast({ kind: 'success', title: 'Proyecto movido a la papelera', body: `“${escapeHtml(name)}” se puede restaurar desde la Papelera en el Control Room.` });
}

// ── Puentes a window (el monolito clásico los busca como globales) ───────────

window.newProject              = newProject;

// D2 · acciones delegadas (panel/exportar llaman vía window: aristas diferidas de D1)
registrarAcciones('kanban', {
  panel: function () { gancho('irAlPanelPersonal')(); },
  controlRoom: function () { navigateToControlRoom(); },
  exportar: function (a) { gancho('exportSingleProject')(a[0]); },
  npDraft: function (a, el) { _npDraft[a[0]] = el.value; },
  npPersona: function (a, el, ev) {
    // I11b · combobox estrella de personas (mismo de Presupuesto): filtra la BD,
    // permite tipear libre y "+ Agregar a la BD". a[0] = pe | director | jp.
    if (ev.type === 'focus') comboboxOpen(el);
    else if (ev.type === 'blur') comboboxCloseDelayed(el);
    else { if (ev.type === 'input') comboboxFilter(el); _npDraft[a[0]] = el.value; }
  },
  delCheck: function (a, el) { document.getElementById('delConfirmBtn').disabled = (el.value.trim() !== _delExpected); },
  delConfirm: function (a) { confirmDeleteProject(a[0]); },
});

// D4b · ganchos definidos por este módulo (consumidos por módulos más tempranos)
define('_lastViewSave', _lastViewSave);
