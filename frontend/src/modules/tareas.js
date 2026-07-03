// Tareas, Señales y Mis Tareas — extraído de index.html (Etapa C3)
// Incluye @menciones, adjuntos a Storage y el repositorio del Control Room.

// D1c · imports reales. VETADOS: currentUser (window mutable), PROJECTS_SOURCE,
// ORG_ID, closeModal (solo strings). Bridge window.MODULES INTOCABLE: el goWire
// de gastos lo lee en eval. Ciclo nav⇄tareas: refreshSidebarTaskCounters queda
// vía window hasta la tranche de nav.
import { escapeHtml, showToast } from '../lib/helpers.js';
import { sb } from '../lib/supabase.js';
import { STATE, PROJECTS } from '../lib/state.js';
import { _puedeEditarTareas } from '../lib/auth.js';
import { navigateToModule, MODULES, renderModule } from '../lib/nav.js';
import { navigateToProject, renderMetrics, renderKanban } from './kanban.js';
import { markDirty } from './persistencia-local.js';

import { registrarAcciones, accionHTML } from '../lib/delegacion.js';
function ensureTareas(project) { if (!project.data.tareas) project.data.tareas = []; return project.data.tareas; }
function ensureSenales(project) { if (!project.data.senales) project.data.senales = []; return project.data.senales; }
function _taskId() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function projectPeople(project) {
  const set = new Set(); if (!project) return [];
  const d = project.data || {};
  for (const dept in (d.servicios || {})) (d.servicios[dept] || []).forEach(r => { if (r.nombre && String(r.nombre).trim()) set.add(String(r.nombre).trim()); });
  ['gastos', 'equipos', 'talentos'].forEach(sec => (d[sec] || []).forEach(r => { if (r.nombre && String(r.nombre).trim()) set.add(String(r.nombre).trim()); }));
  const r = d.responsables || {}; Object.keys(r).forEach(k => { if (r[k] && String(r[k]).trim()) set.add(String(r[k]).trim()); });
  const ip = d.infoProyecto || {}; ['productorEjecutivo', 'jefeProduccion', 'director'].forEach(fld => { if (ip[fld] && String(ip[fld]).trim()) set.add(String(ip[fld]).trim()); });
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

function userOpenTasks(user) {
  const out = []; const u = user || currentUser();
  PROJECTS.forEach(p => (ensureTareas(p)).forEach(t => { if (t.estado !== 'completada' && t.asignadoA === u) out.push({ project: p, tarea: t }); }));
  return out;
}
function sectionTaskCount(project, seccion) { return (ensureTareas(project)).filter(t => t.seccion === seccion && t.estado !== 'completada').length; }

/* ── V9.6.16 · Sistema de COMUNICACIÓN (Mis tareas / Menciones / Requieren atención) ── */
// Mis tareas ABIERTAS asignadas a mí en una sección (para el contador de la barra lateral).
function userSectionTaskCount(project, seccion, user) {
  const u = user || currentUser();
  return (ensureTareas(project)).filter(t => t.seccion === seccion && t.estado !== 'completada' && t.asignadoA === u).length;
}
// Menciones: comentarios (y textos de tarea) donde me etiquetaron con @, en todos los proyectos.
function userMentions(user) {
  const u = user || currentUser();
  if (!u) return [];
  const tag = '@' + u;
  const out = [];
  PROJECTS.forEach(p => {
    (ensureTareas(p)).forEach(t => {
      (t.comentarios || []).forEach(c => {
        if (c.texto && c.texto.indexOf(tag) !== -1 && c.autor !== u) {
          out.push({ project: p, tarea: t, tipo: 'comentario', texto: c.texto, autor: c.autor || '\u2014', ts: Number(c.ts) || 0 });
        }
      });
      // Mención en el texto de la tarea, solo si NO está asignada a mí (si lo está, ya sale en Mis tareas).
      if (t.texto && t.texto.indexOf(tag) !== -1 && t.asignadoA !== u && t.creadoPor !== u) {
        out.push({ project: p, tarea: t, tipo: 'tarea', texto: t.texto, autor: t.creadoPor || '\u2014', ts: Number(t.creadaTs) || 0 });
      }
    });
  });
  out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return out;
}
// Inyecta/actualiza el badge de mis tareas abiertas junto a cada pestaña de la barra lateral.
function refreshSidebarTaskCounters() {
  const p = STATE.currentProject; if (!p) return;
  const u = currentUser();
  document.querySelectorAll('.sidebar-item[data-module]').forEach(el => {
    const mod = el.getAttribute('data-module');
    const n = userSectionTaskCount(p, mod, u);
    let badge = el.querySelector('.sidebar-task-badge');
    if (n > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'sidebar-task-badge'; el.appendChild(badge); }
      badge.textContent = n;
      badge.title = n + (n === 1 ? ' tarea tuya' : ' tareas tuyas') + ' abierta(s) en esta sección';
    } else if (badge) { badge.remove(); }
  });
}

export function marcarSenal(project, sig) {
  const arr = ensureSenales(project); const visto = [currentUser()];
  const ex = arr.find(x => x.tipo === sig.tipo && x.seccion === sig.seccion);
  if (ex) { ex.ts = Date.now(); ex.vistoPor = visto; ex.descripcion = sig.descripcion || ex.descripcion; }
  else arr.push({ id: _taskId(), tipo: sig.tipo, seccion: sig.seccion, rolObjetivo: sig.rolObjetivo || null, descripcion: sig.descripcion || '', ts: Date.now(), vistoPor: visto });
}
function senalAplica(project, sg, user) {
  if ((sg.vistoPor || []).indexOf(user) !== -1) return false;
  if (!sg.rolObjetivo) return true;
  const resp = (project.data.responsables || {})[sg.seccion];
  if (resp && resp === user) return true;
  const ip = project.data.infoProyecto || {};
  if (sg.rolObjetivo === 'AD') { const ad = (project.data.responsables || {})['plan-rodaje'] || (project.data.responsables || {})['hoja-llamado']; return ad === user; }
  if (sg.rolObjetivo === 'PE') return ip.productorEjecutivo === user;
  if (sg.rolObjetivo === 'JP') return ip.jefeProduccion === user;
  return false;
}
function userSenales(project, user) { const u = user || currentUser(); return (ensureSenales(project)).filter(sg => senalAplica(project, sg, u)); }
function marcarSenalVista(projId, sigId) { const p = PROJECTS.find(x => x.id === projId); if (!p) return; const sg = (ensureSenales(p)).find(x => x.id === sigId); if (sg) { if (!sg.vistoPor) sg.vistoPor = []; if (sg.vistoPor.indexOf(currentUser()) === -1) sg.vistoPor.push(currentUser()); markDirty(); try { renderMetrics(); renderKanban(); } catch (e) {} } }

/* projectAttentionCount, projectsNeedingAttention -> movidos a src/modules/kanban.js (Etapa 2) */

function _mentionPeople() { return projectPeople(STATE && STATE.currentProject); }
function _mentionDrop() {
  let d = document.getElementById('mentionDropdown');
  if (!d) { d = document.createElement('div'); d.id = 'mentionDropdown'; d.className = 'mention-dropdown'; d.hidden = true; document.body.appendChild(d); }
  return d;
}
function mentionInput(el) {
  const drop = _mentionDrop();
  const val = el.value || ''; const pos = el.selectionStart || 0;
  const m = val.slice(0, pos).match(/(^|\s)@([^\s@]*)$/);
  if (!m) { drop.hidden = true; return; }
  const q = (m[2] || '').toLowerCase();
  const people = _mentionPeople().filter(n => n.toLowerCase().indexOf(q) !== -1).slice(0, 8);
  if (!people.length) { drop.hidden = true; return; }
  window._mentionTarget = el; window._mentionStart = pos - m[2].length - 1; window._mentionEnd = pos;
  drop.innerHTML = people.map(n => '<div class="mention-opt" ' + accionHTML('tm.pick', n, { on: 'mousedown' }) + '>@' + escapeHtml(n) + '</div>').join('');
  const r = el.getBoundingClientRect();
  drop.style.left = (r.left + window.scrollX) + 'px';
  drop.style.top = (r.bottom + window.scrollY + 2) + 'px';
  drop.style.minWidth = Math.min(Math.max(r.width, 180), 300) + 'px';
  drop.hidden = false;
}
function mentionPick(name) {
  const el = window._mentionTarget; const drop = _mentionDrop(); drop.hidden = true;
  if (!el) return;
  const v = el.value || ''; const a = window._mentionStart, b = window._mentionEnd;
  const ins = '@' + name + ' ';
  el.value = v.slice(0, a) + ins + v.slice(b);
  const np = a + ins.length; el.focus(); try { el.setSelectionRange(np, np); } catch (e) {}
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
function mentionBlur() { setTimeout(() => { const d = document.getElementById('mentionDropdown'); if (d) d.hidden = true; }, 160); }
function highlightMentions(escapedText, people) {
  let out = String(escapedText || '');
  (people || []).slice().sort((a, b) => b.length - a.length).forEach(n => {
    const esc = escapeHtml(n);
    out = out.split('@' + esc).join('<span class="mention">@' + esc + '</span>');
  });
  return out;
}

function openTareasModal(seccion) { if (!STATE.currentProject) return; window._tmState = { seccion: seccion, expanded: null, asignado: '', adjuntos: [] }; renderTareasModal(); }
function _tm() { return window._tmState || { seccion: null, adjuntos: [] }; }
function _tmFind(id) { const p = STATE.currentProject; if (!p) return null; return ensureTareas(p).find(t => t.id === id); }
function _tmAssigneeSelect(people, current) {
  let list = people.slice(); const u = currentUser(); if (u && list.indexOf(u) === -1) list = [u].concat(list);
  const opts = ['<option value="">— elige a quién —</option>'].concat(list.map(n => '<option value="' + escapeHtml(n) + '"' + (n === current ? ' selected' : '') + '>' + escapeHtml(n) + (n === u ? ' (yo)' : '') + '</option>'));
  return '<select class="input" id="tmAsignado" data-accion="tm.asignado" data-on="change">' + opts.join('') + '</select>';
}
function _tmTaskHtml(project, t, people) {
  const st = _tm(); const done = t.estado === 'completada';
  const txt = highlightMentions(escapeHtml(t.texto), people);
  const atts = (t.adjuntos || []).length ? '<div class="tm-atts">' + t.adjuntos.map(a => '<span class="tm-att">📎 ' + (a.path ? ('<a href="#" data-accion="tm.adj" data-bk="' + STORAGE_BUCKET_ADJUNTOS + '" data-pt="' + escapeHtml(a.path) + '">' + escapeHtml(a.name) + '</a>') : escapeHtml(a.name)) + '</span>').join('') + '</div>' : '';
  const expanded = st.expanded === t.id; const coms = (t.comentarios || []);
  const comsHtml = expanded ? '<div class="tm-coms">' + (coms.length ? coms.map(c => '<div class="tm-com"><div class="tm-com-h">' + escapeHtml(c.autor) + ' <span class="tm-com-ts">' + escapeHtml(c.ts) + '</span></div><div class="tm-com-b">' + highlightMentions(escapeHtml(c.texto), people) + '</div></div>').join('') : '<div class="tm-hint">Sin comentarios todavía.</div>') +
    '<div class="tm-addcom"><textarea id="tmCom_' + t.id + '" class="input" rows="2" placeholder="Responder con un comentario… escribe @ para etiquetar" data-accion="tm.mention" data-on="input blur"></textarea><button class="btn btn-secondary btn-sm" ' + accionHTML('tm.comentar', t.id) + '>Comentar</button></div></div>' : '';
  return '<div class="tm-task' + (done ? ' done' : '') + '">' +
    '<div class="tm-task-top">' +
      '<label class="tm-check"><input type="checkbox" ' + (done ? 'checked' : '') + ' ' + accionHTML('tm.toggle', t.id, { on: 'change' }) + '></label>' +
      '<div class="tm-task-main"><div class="tm-task-text">' + txt + '</div>' +
        '<div class="tm-task-meta">Para <strong>' + escapeHtml(t.asignadoA || '\u2014') + '</strong> \u00b7 de ' + escapeHtml(t.creadoPor || '\u2014') + atts + '</div></div>' +
      '<button class="tm-com-toggle" ' + accionHTML('tm.expand', t.id) + '>' + (expanded ? 'Ocultar' : ('Comentar' + (coms.length ? ' · ' + coms.length : ''))) + '</button>' +
    '</div>' + comsHtml + '</div>';
}
function renderTareasModal() {
  const project = STATE.currentProject; if (!project) return;
  const st = _tm(); const seccion = st.seccion;
  const secLabel = (MODULES[seccion] && MODULES[seccion].title) || seccion;
  const people = projectPeople(project);
  const tareas = ensureTareas(project).filter(t => t.seccion === seccion)
    .sort((a, b) => (a.estado === b.estado ? 0 : (a.estado === 'completada' ? 1 : -1)) || (b.creadaTs - a.creadaTs));
  const createForm = (!_puedeEditarTareas())
    ? '<div class="tm-create"><div class="tm-create-h">Solo lectura</div><div class="tm-hint" style="margin-top:6px;">Tu perfil puede ver las tareas de esta sección, pero no crearlas ni editarlas.</div></div>'
    : ('<div class="tm-create"><div class="tm-create-h">Crear tarea</div>' +
    '<div class="tm-field"><label>Asignar a</label>' + _tmAssigneeSelect(people, st.asignado) + '</div>' +
    '<div class="tm-field"><label>Tarea</label><textarea id="tmNuevoTexto" class="input" rows="3" placeholder="Ej: toma todas las personas de esta base de datos y agrégalas como visitas externas. Escribe @ para etiquetar." data-accion="tm.mention" data-on="input blur"></textarea></div>' +
    '<div class="tm-field"><label>Adjuntos</label>' + ((st.adjuntos || []).length ? '<div class="tm-atts">' + st.adjuntos.map((a, i) => '<span class="tm-att">\ud83d\udcce ' + escapeHtml(a.name) + ' <button ' + accionHTML('tm.quitarAdj', i) + '>\u2715</button></span>').join('') + '</div>' : '<div class="tm-hint">Sin adjuntos.</div>') +
      '<input type="file" id="tmFile" multiple style="display:none;" data-accion="tm.files" data-on="change"><button class="btn btn-ghost btn-sm" data-accion="tm.filesBtn">+ Adjuntar archivo</button></div>' +
    '<div class="tm-create-actions"><button class="btn btn-ghost btn-sm" data-accion="tm.self">Auto-asignármela</button><button class="btn btn-primary btn-sm" data-accion="tm.crear">Crear tarea</button></div></div>');
  const list = tareas.length ? tareas.map(t => _tmTaskHtml(project, t, people)).join('') : '<div class="tm-empty">Sin tareas en esta sección todavía.</div>';
  const root = document.getElementById('modalRoot');
  root.innerHTML = '<div class="modal-backdrop"><div class="modal" style="max-width:640px;width:94vw;max-height:88vh;overflow:auto;">' +
    '<div class="modal-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;"><div><div class="modal-title">Tareas \u00b7 ' + escapeHtml(secLabel) + '</div><div style="font-size:12px;color:var(--ink-muted);margin-top:2px;">' + escapeHtml(project.name) + ' \u00b7 viendo como <strong>' + escapeHtml(currentUser()) + '</strong></div></div><button class="go-x" data-accion="ui.cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--ink-mut);">\u00d7</button></div>' +
    '<div class="modal-body">' + createForm + '<div class="tm-list">' + list + '</div></div>' +
    '<div class="modal-footer"><button class="btn" data-accion="ui.cerrar">Cerrar</button></div></div></div>';
}
/* ── V9.5.1 · Adjuntos de tareas en Supabase Storage (bucket privado) ─────
   El binario sí está disponible (el File del input): se sube directo. La BD
   guarda solo la ruta (task_attachments.storage_path) vía la RPC 4c v2.
   FAIL-SAFE: si Storage no está disponible, cae a solo-nombre (como hoy). */
const STORAGE_BUCKET_ADJUNTOS = 'adjuntos-tareas';
async function _uploadTareaAdjunto(file) {
  if (!sb || PROJECTS_SOURCE !== 'supabase' || !sb.storage || !file) return null;
  try {
    const safe = String(file.name || 'archivo').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
    const path = ORG_ID + '/tareas/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safe;
    const { error } = await sb.storage.from(STORAGE_BUCKET_ADJUNTOS).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (error) throw error;
    return { name: file.name, path: path };
  } catch (e) { console.warn('[storage] adjunto de tarea no disponible; se guarda solo el nombre', e); return null; }
}
async function _abrirAdjuntoTarea(bucket, path) {
  if (!sb || !sb.storage || !path) { try { showToast({ kind: 'info', title: 'Adjunto local', body: 'Este adjunto todavía no está en la nube.' }); } catch (e) {} return; }
  try { const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 3600); if (error) throw error; if (data && data.signedUrl) window.open(data.signedUrl, '_blank'); }
  catch (e) { try { showToast({ kind: 'warning', title: 'No disponible', body: 'No se pudo abrir el adjunto.' }); } catch (x) {} }
}
function _abrirAdjTarea(el) { try { _abrirAdjuntoTarea(el.getAttribute('data-bk'), el.getAttribute('data-pt')); } catch (e) {} return false; }
async function tmAddFiles(files) {
  const st = _tm(); let nube = 0, local = 0;
  for (let i = 0; i < files.length; i++) {
    const up = await _uploadTareaAdjunto(files[i]);
    if (up) { st.adjuntos.push({ name: up.name, path: up.path }); nube++; }
    else { st.adjuntos.push({ name: files[i].name, type: files[i].type || '' }); local++; }
  }
  renderTareasModal();
  try { if (nube && !local) showToast({ kind: 'success', title: 'Adjunto subido', body: nube + ' archivo(s) en la nube.' }); else if (local) showToast({ kind: 'info', title: 'Adjunto agregado', body: 'Se guardó el nombre; la subida se activa con Storage.' }); } catch (e) {}
}
function tmRemoveAtt(i) { const st = _tm(); const a = (st.adjuntos || [])[i]; if (a && a.path && sb && sb.storage) { try { sb.storage.from(STORAGE_BUCKET_ADJUNTOS).remove([a.path]); } catch (e) {} } (st.adjuntos || []).splice(i, 1); renderTareasModal(); }
function _tmPush(project, st, texto, asignado) {
  if (!_puedeEditarTareas()) { showToast({ kind: 'info', title: 'Solo lectura', body: 'Tu perfil no puede crear tareas en esta sección.' }); return; }   // V10.5.2
  ensureTareas(project).push({ id: _taskId(), seccion: st.seccion, texto: texto, asignadoA: asignado, creadoPor: currentUser(), estado: 'pendiente', adjuntos: (st.adjuntos || []).slice(), comentarios: [], creadaTs: Date.now() });
  st.asignado = ''; st.adjuntos = []; markDirty();
  showToast({ kind: 'success', title: 'Tarea creada', body: 'Asignada a ' + escapeHtml(asignado) + '. El aviso real a la persona llega con el backend.' });
  renderTareasModal(); refreshSectionTareasBadge();
}
function tmCrear() {
  const project = STATE.currentProject; const st = _tm();
  const txtEl = document.getElementById('tmNuevoTexto'); const texto = txtEl ? txtEl.value.trim() : '';
  const selEl = document.getElementById('tmAsignado'); const asignado = selEl ? selEl.value : '';
  if (!texto) { showToast({ kind: 'warning', title: 'Falta la tarea', body: 'Escribe en qué consiste la tarea.' }); return; }
  if (!asignado) { showToast({ kind: 'warning', title: '\u00bfPara qui\u00e9n?', body: 'Elige a qui\u00e9n asignar la tarea, o usa \u201cAuto-asign\u00e1rmela\u201d.' }); return; }
  _tmPush(project, st, texto, asignado);
}
function tmSelfAssign() {
  const project = STATE.currentProject; const st = _tm();
  const txtEl = document.getElementById('tmNuevoTexto'); const texto = txtEl ? txtEl.value.trim() : '';
  if (!texto) { showToast({ kind: 'warning', title: 'Falta la tarea', body: 'Escribe en qué consiste la tarea.' }); return; }
  _tmPush(project, st, texto, currentUser());
}
function tmToggle(id) { if (!_puedeEditarTareas()) return; const t = _tmFind(id); if (t) { t.estado = t.estado === 'completada' ? 'pendiente' : 'completada'; markDirty(); renderTareasModal(); refreshSectionTareasBadge(); } }
function tmToggleExpand(id) { const st = _tm(); st.expanded = st.expanded === id ? null : id; renderTareasModal(); }
function tmAddComentario(id) { if (!_puedeEditarTareas()) return; const t = _tmFind(id); if (!t) return; const el = document.getElementById('tmCom_' + id); const v = el ? el.value.trim() : ''; if (!v) return; if (!t.comentarios) t.comentarios = []; t.comentarios.push({ id: _taskId(), autor: currentUser(), texto: v, ts: new Date().toLocaleString('es-CL') }); markDirty(); renderTareasModal(); }
function refreshSectionTareasBadge() { if (STATE.currentView === 'project' && STATE.currentModule) { try { renderModule(STATE.currentModule); } catch (e) {} try { refreshSidebarTaskCounters(); } catch (e) {} } }
function renderMisTareas() {
  const el = document.getElementById('crTareasPanel'); if (!el) return;
  const u = currentUser();
  const e = escapeHtml;
  const modTitle = (sec) => e((MODULES[sec] && MODULES[sec].title) || sec);

  // 1) MIS TAREAS — todo lo asignado a mí, agrupado por proyecto
  const tasks = userOpenTasks(u);
  const byProj = {}; tasks.forEach(o => { (byProj[o.project.id] = byProj[o.project.id] || { project: o.project, items: [] }).items.push(o.tarea); });
  let misTareas = '';
  if (!tasks.length) {
    misTareas = '<div class="crt-empty">No tienes tareas asignadas.</div>';
  } else {
    Object.keys(byProj).forEach(pid => {
      const g = byProj[pid];
      misTareas += '<div class="crt-subgroup"><div class="crt-subgroup-h">' + e(g.project.name) + ' <span class="crt-count">' + g.items.length + '</span></div>' +
        g.items.map(t => '<div class="crt-item"><label class="tm-check"><input type="checkbox" ' + accionHTML('tm.crtToggle', g.project.id, t.id, { on: 'change' }) + '></label><div class="crt-item-main"><div class="crt-item-text">' + highlightMentions(e(t.texto), projectPeople(g.project)) + '</div><div class="crt-item-meta">' + modTitle(t.seccion) + ' \u00b7 de ' + e(t.creadoPor || '\u2014') + '</div></div><button class="btn btn-ghost btn-sm" ' + accionHTML('tm.crtGo', g.project.id, t.seccion) + '>Abrir</button></div>').join('') + '</div>';
    });
  }

  // 2) MENCIONES — comentarios/tareas donde me etiquetaron (aunque no sean mías)
  const menciones = userMentions(u);
  let mencionesHtml = '';
  if (!menciones.length) {
    mencionesHtml = '<div class="crt-empty">Nadie te ha mencionado todavía.</div>';
  } else {
    mencionesHtml = menciones.map(m => '<div class="crt-item crt-mencion"><div class="crt-item-main"><div class="crt-item-text">' + highlightMentions(e(m.texto), projectPeople(m.project)) + '</div><div class="crt-item-meta">' + e(m.project.name) + ' \u00b7 ' + modTitle(m.tarea.seccion) + ' \u00b7 ' + (m.tipo === 'comentario' ? 'comentario de ' : 'tarea de ') + e(m.autor) + '</div></div><button class="btn btn-ghost btn-sm" ' + accionHTML('tm.crtGo', m.project.id, m.tarea.seccion) + '>Ver</button></div>').join('');
  }

  // 3) REQUIEREN ATENCIÓN — señales del sistema dirigidas a mí
  const senalesRows = []; PROJECTS.forEach(p => userSenales(p, u).forEach(sg => senalesRows.push({ project: p, sg: sg })));
  let atencionHtml = '';
  if (!senalesRows.length) {
    atencionHtml = '<div class="crt-empty">Nada requiere tu atención.</div>';
  } else {
    atencionHtml = senalesRows.map(o => '<div class="crt-item crt-senal"><div class="crt-item-main"><div class="crt-item-text">' + e(o.sg.descripcion) + '</div><div class="crt-item-meta">' + e(o.project.name) + ' \u00b7 ' + modTitle(o.sg.seccion) + '</div></div><div class="crt-item-actions"><button class="btn btn-ghost btn-sm" ' + accionHTML('tm.crtSenal', o.project.id, o.sg.seccion) + '>Ir</button><button class="btn btn-secondary btn-sm" ' + accionHTML('tm.senalVista', o.project.id, o.sg.id) + '>Visto</button></div></div>').join('');
  }

  const group = (titulo, count, contenido) =>
    '<div class="crt-group"><div class="crt-group-h">' + titulo + ' <span class="crt-count">' + count + '</span></div>' + contenido + '</div>';

  el.innerHTML = '<div class="crt-card">' +
    '<div class="crt-head"><div class="crt-title">Comunicación <span class="crt-faint">\u00b7 lo que necesita tu atención: tareas, menciones y señales</span></div></div>' +
    '<div class="crt-body">' +
      group('Mis tareas', tasks.length, misTareas) +
      group('Menciones', menciones.length, mencionesHtml) +
      group('Requieren atención', senalesRows.length, atencionHtml) +
    '</div></div>';
}
function crtToggle(projId, taskId) { if (!_puedeEditarTareas()) return; const p = PROJECTS.find(x => x.id === projId); if (!p) return; const t = ensureTareas(p).find(x => x.id === taskId); if (t) { t.estado = t.estado === 'completada' ? 'pendiente' : 'completada'; markDirty(); try { renderMetrics(); renderKanban(); } catch (e) {} } }
function crtGoTask(projId, seccion) { if (!PROJECTS.find(x => x.id === projId)) return; navigateToProject(projId); setTimeout(() => { try { navigateToModule(seccion); } catch (e) {} setTimeout(() => { try { openTareasModal(seccion); } catch (e) {} }, 140); }, 70); }
function crtGoSenal(projId, seccion) { if (!PROJECTS.find(x => x.id === projId)) return; navigateToProject(projId); setTimeout(() => { try { navigateToModule(seccion); } catch (e) {} }, 90); }

// ── Window bridges (3 barridos func+const) ──
window._tm = _tm;
window.crtGoSenal = crtGoSenal;
window.crtGoTask = crtGoTask;
window.crtToggle = crtToggle;
window.ensureSenales = ensureSenales;
window.ensureTareas = ensureTareas;
window.marcarSenal = marcarSenal;
window.mentionBlur = mentionBlur;
window.mentionInput = mentionInput;
window.openTareasModal = openTareasModal;
window.refreshSidebarTaskCounters = refreshSidebarTaskCounters;
window.renderMisTareas = renderMisTareas;
window.sectionTaskCount = sectionTaskCount;
window.userSenales = userSenales;

// D2 · acciones delegadas
registrarAcciones('tm', {
  pick: function (a, el, ev) { ev.preventDefault(); mentionPick(a[0]); },
  asignado: function (a, el) { _tm().asignado = el.value; },
  adj: function (a, el, ev) { ev.preventDefault(); _abrirAdjTarea(el); },
  mention: function (a, el, ev) { if (ev.type === 'input') mentionInput(el); else mentionBlur(); },
  comentar: function (a) { tmAddComentario(a[0]); },
  toggle: function (a) { tmToggle(a[0]); },
  expand: function (a) { tmToggleExpand(a[0]); },
  quitarAdj: function (a) { tmRemoveAtt(a[0]); },
  files: function (a, el) { tmAddFiles(el.files); },
  filesBtn: function () { document.getElementById('tmFile').click(); },
  self: function () { tmSelfAssign(); },
  crear: function () { tmCrear(); },
  crtToggle: function (a) { crtToggle(a[0], a[1]); },
  crtGo: function (a) { crtGoTask(a[0], a[1]); },
  crtSenal: function (a) { crtGoSenal(a[0], a[1]); },
  senalVista: function (a) { marcarSenalVista(a[0], a[1]); },
});
