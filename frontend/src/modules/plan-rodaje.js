// Plan de Rodaje + Hoja de Llamado — extraído de index.html (Etapa A2)
// src/modules/plan-rodaje.js

// D1d · imports reales. DIFERIDA la arista a crew (getCrewForExport queda vía
// window): crew ya importa plan-rodaje — no cerrar el ciclo ESM.
import { escapeHtml, safeUrl, showToast } from '../lib/helpers.js';
import { BD_PERSONAS, EMPRESA_PERFIL, STATE } from '../lib/state.js';
import { ensureProjectLoc } from '../lib/modelo.js';
import { normalizeTime24 } from '../lib/calc.js';
import { closeModal, hideTooltip, comboboxCloseDelayed, comboboxFilter, comboboxOpen } from '../lib/ui.js';
import { CotPreview, _budgetColTh, _budgetColWGet } from './presupuesto-cotizacion.js';
import { bdLocFind, projLocConfirmadas, projLocList, locacionOptions } from './locaciones.js';
import { markDirty } from './persistencia-local.js';
import { fmtFechaLarga } from './rodajes.js';
import { marcarSenal } from './tareas.js';
import { orgNombre } from '../lib/boot.js';

import { registrarAcciones, accionHTML } from '../lib/delegacion.js';
import { _fechaCorta, ntfOpenFromHoja } from './notificaciones.js';
import { navigateToModule } from '../lib/nav.js';
import { gancho, define } from '../lib/ganchos.js';
var PR_DRAG_ID = null;
let HL_DRAG = null;
var _hlPrevMargen = 13;

/* ════════════════════════════════════════════════════════════════════
   V7.8 · PLAN DE RODAJE
   Jerarquía: Día → UNIDADES (equipos en simultáneo) → cada unidad tiene
   sus PLANES/variantes (Plan A principal + B, C… de contingencia).
   La duración manda; horas en cascada. Anclas fijan una fila sin reescribir
   lo previo: si lo anterior se PASA → CHOQUE (rojo); si queda CORTO → HUECO
   (ámbar). Filas paralelas no mueven el reloj. Columnas configurables.
   Arrastre de filas + inserción bajo la fila seleccionada. Tiempos HH:MM
   autoformateados. "Traer de…" copia un plan existente. El PDF llega después.
   ════════════════════════════════════════════════════════════════════ */


/* ── Tiempo ── */
function prParseHM(s) {
  if (s == null) return null;
  s = String(s).trim(); if (!s) return null;
  if (s.indexOf(':') >= 0) { const p = s.split(':'); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); }
  const n = parseInt(s, 10); return isNaN(n) ? null : n;
}
function prFmtDur(min) { if (min == null || isNaN(min)) return '—'; min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h + ':' + String(m).padStart(2, '0'); }
function prFmtClock(min) { if (min == null || isNaN(min)) return '—'; min = ((Math.round(min) % 1440) + 1440) % 1440; const h = Math.floor(min / 60), m = min % 60; return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); }
/* Autoformato: el usuario teclea libre, queda HH:MM. Últimos 2 dígitos = minutos. */
function prNormalizeDur(s) {
  s = String(s == null ? '' : s).trim(); if (!s) return '';
  let h, m;
  if (s.indexOf(':') >= 0) { const p = s.split(':'); h = parseInt(p[0] || '0', 10) || 0; m = parseInt(p[1] || '0', 10) || 0; }
  else { const d = s.replace(/\D/g, ''); if (!d) return ''; if (d.length <= 2) { h = 0; m = parseInt(d, 10); } else { m = parseInt(d.slice(-2), 10); h = parseInt(d.slice(0, -2), 10); } }
  h += Math.floor(m / 60); m = m % 60;
  return h + ':' + String(m).padStart(2, '0');
}
function prNormalizeClock(s) {
  s = String(s == null ? '' : s).trim(); if (!s) return '';
  let h, m;
  if (s.indexOf(':') >= 0) { const p = s.split(':'); h = parseInt(p[0] || '0', 10) || 0; m = parseInt(p[1] || '0', 10) || 0; }
  else { const d = s.replace(/\D/g, ''); if (!d) return ''; if (d.length <= 2) { h = parseInt(d, 10); m = 0; } else { m = parseInt(d.slice(-2), 10); h = parseInt(d.slice(0, -2), 10); } }
  if (m > 59) { h += Math.floor(m / 60); m = m % 60; }
  h = ((h % 24) + 24) % 24;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
function prFechaLarga(iso) {
  if (!iso) return '—';
  try { const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  catch (e) { return iso; }
}

/* ── Columnas ── */
function prDefaultColsCfg() {
  return { termino: true, escPlano: true, extra: [
    { id: 'guion', label: 'Guion / VO', tipo: 'texto', on: true },
    { id: 'cast', label: 'Cast', tipo: 'texto', on: true },
    { id: 'ref', label: 'Ref', tipo: 'mixto', on: true },
    { id: 'arte', label: 'Arte', tipo: 'mixto', on: true },
    { id: 'prod', label: 'Producción', tipo: 'texto', on: true },
    { id: 'notasSet', label: 'Notas en set', tipo: 'texto', on: true },
    { id: 'notas', label: 'Notas', tipo: 'texto', on: false },
    { id: 'locacion', label: 'Locación', tipo: 'texto', on: false },
    { id: 'check', label: '✓', tipo: 'check', on: true } ] };
}
function prNewColId() { return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4); }

/* ── Modelo: Día → unidades[] → variantes[] ── */
function prNewId(pfx) { return (pfx || 'pf_') + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5); }
function prNuevoVariante(label, datos) { const v = { id: prNewId('var_'), label: label, filas: [], banco: [], version: 1, lastExport: null }; if (datos) { v.filas = datos.filas || []; v.banco = datos.banco || []; v.version = datos.version || 1; v.lastExport = datos.lastExport || null; } return v; }
function prNuevaUnidad(label, varLabel, datos) { const u = { id: prNewId('uni_'), label: label, variantes: [prNuevoVariante(varLabel || 'Plan A', datos)], activoVarId: null }; u.activoVarId = u.variantes[0].id; return u; }

function ensurePlanRodaje(project) {
  const d = project.data;
  if (!d.planRodaje) d.planRodaje = { columnas: prDefaultColsCfg(), dias: {} };
  if (!d.planRodaje.columnas || d.planRodaje.columnas.extra === undefined) {
    const old = d.planRodaje.columnas || {}; const nuevo = prDefaultColsCfg();
    if (old.termino === false) nuevo.termino = false; if (old.escPlano === false) nuevo.escPlano = false;
    d.planRodaje.columnas = nuevo;
  }
  if (!Array.isArray(d.planRodaje.columnas.extra)) d.planRodaje.columnas.extra = prDefaultColsCfg().extra;
  if (!d.planRodaje.dias) d.planRodaje.dias = {};
  if (!d.planRodaje.orientacion) d.planRodaje.orientacion = 'horizontal';
  return d.planRodaje;
}
function prEnsureDia(project, diaId) {
  const pr = ensurePlanRodaje(project);
  if (!pr.dias[diaId]) pr.dias[diaId] = { header: { locacion: '', solUtilAmanecer: '', solUtilAtardecer: '' } };
  const dd = pr.dias[diaId];
  if (!dd.header) dd.header = { locacion: '', solUtilAmanecer: '', solUtilAtardecer: '' };
  if (dd.header.responsable === undefined) dd.header.responsable = '';
  if (dd.header.responsableContacto === undefined) dd.header.responsableContacto = '';

  if (!Array.isArray(dd.unidades)) {
    const unidades = [];
    if (Array.isArray(dd.planes)) {               // migración V7.7 → V7.8
      const vars = dd.planes.filter(p => p.kind !== 'unidad');
      const u1 = { id: prNewId('uni_'), label: 'Unidad 1', variantes: [], activoVarId: null };
      (vars.length ? vars : [{ label: 'Plan A', filas: [], banco: [] }]).forEach((p, i) => u1.variantes.push(prNuevoVariante(p.label || ('Plan ' + String.fromCharCode(65 + i)), p)));
      u1.activoVarId = u1.variantes[0].id; unidades.push(u1);
      dd.planes.filter(p => p.kind === 'unidad').forEach((p, i) => unidades.push(prNuevaUnidad('Unidad ' + (i + 2), 'Plan A', p)));
      delete dd.planes; delete dd.activoId;
    } else if (dd.variantes) {                     // migración V7.6 → V7.8
      const u1 = { id: prNewId('uni_'), label: 'Unidad 1', variantes: [], activoVarId: null };
      const A = dd.variantes.A || { filas: [], banco: [] }; u1.variantes.push(prNuevoVariante('Plan A', A));
      if (dd.variantes.B) u1.variantes.push(prNuevoVariante('Plan B', dd.variantes.B));
      u1.activoVarId = u1.variantes[0].id; unidades.push(u1); delete dd.variantes;
    } else {
      unidades.push(prNuevaUnidad('Unidad 1', 'Plan A'));
    }
    dd.unidades = unidades;
    dd.activoUnidadId = unidades[0].id;
  }
  if (!dd.activoUnidadId || !dd.unidades.find(u => u.id === dd.activoUnidadId)) dd.activoUnidadId = dd.unidades[0].id;
  dd.unidades.forEach(u => {
    if (!Array.isArray(u.variantes) || !u.variantes.length) u.variantes = [prNuevoVariante('Plan A')];
    if (!u.activoVarId || !u.variantes.find(v => v.id === u.activoVarId)) u.activoVarId = u.variantes[0].id;
    u.variantes.forEach(v => { if (!Array.isArray(v.filas)) v.filas = []; if (!Array.isArray(v.banco)) v.banco = []; if (v.version == null) v.version = 1; v.filas.forEach(prMigrateFila); v.banco.forEach(prMigrateFila); });
  });
  return dd;
}
function prMigrateFila(f) {
  if (!f.id) f.id = prNewId();
  if (!f.tipo) f.tipo = 'plano';
  if (f.dur === undefined) f.dur = '';
  if (f.anchor === undefined) f.anchor = null;
  if (f.paralelo === undefined) f.paralelo = false;
  if (f.escPlano === undefined) f.escPlano = '';
  if (f.accion === undefined) f.accion = '';
}
function prActiveDias(project) { return (project.data.rodajes || []).filter(r => r.activo && r.diaId); }
function prDiaInfo(project, diaId) {
  const dias = prActiveDias(project); const idx = dias.findIndex(d => d.diaId === diaId);
  const r = dias[idx] || (project.data.rodajes || []).find(x => x.diaId === diaId) || {};
  return { r: r, n: idx >= 0 ? idx + 1 : 1, total: dias.length || 1 };
}
function prStartMin(project, diaId) { const hd = ((project.data.hojaLlamado || {}).dias || {})[diaId]; const lg = hd && hd.infoGeneral ? hd.infoGeneral.llamadoGeneral : null; return prParseHM(lg); }
/* V8.1.1 (#2): la hora del primer plano es editable por plan. Si el plan tiene
   horaInicio propia, manda; si no, cae al Llamado General de la Hoja de Llamado. */
function prEffectiveStartMin(project, diaId, plan) {
  if (plan && plan.horaInicio) { const m = prParseHM(plan.horaInicio); if (m != null) return m; }
  return prStartMin(project, diaId);
}
function prSetHoraInicio(v) {
  const plan = prCurrentPlan(); if (!plan) return;
  const nv = (typeof normalizeTime24 === 'function') ? normalizeTime24(v) : (v || '');
  plan.horaInicio = (nv || '').trim();   // vacío = volver a heredar del Llamado General
  markDirty(); renderPlanRodaje();
}

function prActiveCols(project) {
  const c = ensurePlanRodaje(project).columnas; const out = [];
  out.push({ role: 'time', key: 'inicio', label: 'Inicio' });
  out.push({ role: 'time', key: 'dur', label: 'Dur.' });
  if (c.termino !== false) out.push({ role: 'time', key: 'termino', label: 'Término' });
  if (c.escPlano !== false) out.push({ role: 'content', key: 'escPlano', label: 'Esc / Plano', tipo: 'texto', narrow: true, struct: true });
  out.push({ role: 'content', key: 'accion', label: 'Acción / Situación', tipo: 'texto', struct: true });
  const checks = [];
  (c.extra || []).forEach(col => { if (!col.on) return; if (col.tipo === 'check') checks.push({ role: 'check', key: col.id, label: col.label, tipo: 'check', extra: true }); else out.push({ role: 'content', key: col.id, label: col.label, tipo: col.tipo || 'texto', extra: true }); });
  checks.forEach(d => out.push(d));
  return out;
}

/* ── Motor (puro) ── inicio = llamado general o ancla de cabecera; ancla a
   mitad de día solo fija su fila. cursor>anc → choque; cursor<anc → hueco. */
function prComputeTimes(filas, startMin) {
  if (startMin == null) {
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i]; if (f.tipo === 'seccion') continue;
      const a = prParseHM(f.anchor);
      if (f.tipo === 'marcador') { if (a != null) { startMin = a; break; } continue; }
      if (a != null) startMin = a; break;
    }
    if (startMin == null) startMin = 8 * 60;
  }
  let cursor = startMin, hostInicio = cursor; const out = [];
  for (const f of filas) {
    if (f.tipo === 'seccion') { out.push({ inicio: null, termino: null, collision: false, gap: 0 }); continue; }
    if (f.tipo === 'marcador') {
      const anc = prParseHM(f.anchor); let col = false, gap = 0, t;
      if (anc != null) { if (cursor > anc) col = true; else if (cursor < anc) gap = anc - cursor; t = anc; if (anc > cursor) cursor = anc; } else t = cursor;
      out.push({ inicio: t, termino: null, collision: col, gap: gap }); continue;
    }
    const durMin = prParseHM(f.dur);
    if (f.paralelo) { const ini = hostInicio; out.push({ inicio: ini, termino: (durMin != null ? ini + durMin : null), collision: false, gap: 0, paralelo: true }); continue; }
    const anc = prParseHM(f.anchor); let ini, col = false, gap = 0;
    if (anc != null) { if (cursor > anc) col = true; else if (cursor < anc) gap = anc - cursor; ini = anc; } else ini = cursor;
    const term = (durMin != null ? ini + durMin : ini);
    out.push({ inicio: ini, termino: term, collision: col, gap: gap });
    cursor = term; hostInicio = ini;
  }
  return out;
}
function prSpanDia(filas, times) {
  let first = null, last = null;
  filas.forEach((f, i) => { if ((f.tipo === 'plano' || f.tipo === 'situacion') && !f.paralelo) { const t = times[i]; if (t && t.inicio != null) { if (first == null) first = t.inicio; if (t.termino != null) last = t.termino; } } });
  if (first == null || last == null) return null; return last - first;
}

/* ── Imágenes ── */
function prCompressImage(file, maxPx, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = e => { const img = new Image(); img.onload = () => { let w = img.width, h = img.height; const m = maxPx || 1100; if (w > m || h > m) { const s = m / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); } try { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); resolve(cv.toDataURL('image/jpeg', quality || 0.72)); } catch (err) { resolve(e.target.result); } }; img.onerror = () => resolve(e.target.result); img.src = e.target.result; };
    reader.onerror = () => resolve(null); reader.readAsDataURL(file);
  });
}

/* ── Acceso al plan activo ── */
function prCurrentUnidad() { const p = STATE.currentProject; if (!p || !STATE.prDiaSel) return null; const dd = prEnsureDia(p, STATE.prDiaSel); let u = dd.unidades.find(x => x.id === STATE.prUnidadId); if (!u) { u = dd.unidades.find(x => x.id === dd.activoUnidadId) || dd.unidades[0]; STATE.prUnidadId = u.id; } return u; }
function prCurrentPlan() { const u = prCurrentUnidad(); if (!u) return null; let v = u.variantes.find(x => x.id === STATE.prVarId); if (!v) { v = u.variantes.find(x => x.id === u.activoVarId) || u.variantes[0]; STATE.prVarId = v.id; } return v; }
function prFindFila(id) { const plan = prCurrentPlan(); if (!plan) return null; return plan.filas.find(f => f.id === id) || plan.banco.find(f => f.id === id) || null; }

/* ── RENDER ── */
function renderPlanRodaje() {
  const project = STATE.currentProject; if (!project) return;
  ensurePlanRodaje(project);
  const dias = prActiveDias(project);
  const actions = document.getElementById('moduleHeaderActions');
  const content = document.getElementById('moduleContent');
  if (!dias.length) { if (actions) actions.innerHTML = ''; content.innerHTML = `<div class="alert alert-info"><span class="alert-icon">◷</span><div>No hay días de rodaje activos. Crea un día en <strong>Rodajes</strong> y vuelve aquí para armar su Plan de Rodaje.</div></div>`; return; }
  if (!STATE.prDiaSel || !dias.find(d => d.diaId === STATE.prDiaSel)) { STATE.prDiaSel = dias[0].diaId; STATE.prUnidadId = null; STATE.prVarId = null; STATE.prSelFila = null; }
  const diaId = STATE.prDiaSel; const dd = prEnsureDia(project, diaId);
  if (!STATE.prUnidadId || !dd.unidades.find(u => u.id === STATE.prUnidadId)) STATE.prUnidadId = dd.activoUnidadId;
  const u = prCurrentUnidad(); if (!STATE.prVarId || !u.variantes.find(v => v.id === STATE.prVarId)) STATE.prVarId = u.activoVarId;
  const plan = prCurrentPlan();
  if (actions) { const _ori = (ensurePlanRodaje(project).orientacion || 'horizontal'); actions.innerHTML = `<select class="pr-orient-sel" data-accion="pr.d" data-args="[&quot;prSetOrientacion&quot;, &quot;\u00a7v\u00a7&quot;]" data-on="change" title="Orientación del PDF al exportar"><option value="horizontal" ${_ori === 'horizontal' ? 'selected' : ''}>↔ Horizontal</option><option value="vertical" ${_ori === 'vertical' ? 'selected' : ''}>↕ Vertical</option></select> <button class="btn btn-primary btn-sm" data-accion="pr.d" data-args="[&quot;exportPlanRodajePDF&quot;]" title="Exporta la Unidad·Plan activa a PDF. Avanza la versión del plan.">Exportar PDF</button> <button class="btn btn-secondary btn-sm" data-accion="pr.d" data-args="[&quot;prOpenCols&quot;]">Columnas</button>`; }
  content.innerHTML = `${prSwitcherHTML(project, dias, diaId, u, plan)}${prHeaderHTML(project, diaId)}${prTableHTML(project, plan)}${prBancoHTML(project, plan)}`;
}

function prSwitcherHTML(project, dias, diaId, u, plan) {
  const dd = project.data.planRodaje.dias[diaId];
  const diaChips = dias.map(d => `<button class="pr-chip ${d.diaId === diaId ? 'is-active' : ''}" ${accionHTML('pr.d', 'prSetDia', d.diaId)}><span class="pr-chip-id">${escapeHtml(d.diaId)}</span><span class="pr-chip-sub">${escapeHtml(_fechaCorta(d.fecha))}</span></button>`).join('');
  const uniChips = dd.unidades.map(x => `<button class="pr-chip pr-uni-chip ${x.id === u.id ? 'is-active' : ''}" ${accionHTML('pr.d', 'prSetUnidad', x.id)}><span class="pr-chip-id">${escapeHtml(x.label)}</span></button>`).join('');
  const varChips = u.variantes.map(v => `<button class="pr-chip pr-plan-chip ${v.id === plan.id ? 'is-active' : ''}" ${accionHTML('pr.d', 'prSetPlan', v.id)}><span class="pr-chip-id">${escapeHtml(v.label)}</span></button>`).join('');
  const tipUni = 'Equipos que ruedan en SIMULTÁNEO el mismo día, cada uno con su propio plan, llamados y tiempos. Ej.: Unidad 1 graba en exterior mientras la Unidad 2 graba en estudio a la misma hora. Cada unidad es independiente.';
  const tipVar = 'Alternativas de CONTINGENCIA dentro de esta unidad. El Plan A es el principal; los Planes B, C… son respaldos por si algo cambia (ej.: si llueve, se pasa al Plan B). Solo se ejecuta uno a la vez.';
  return `<div class="cot-card pr-switcher">
    <div class="pr-sw-line"><div class="pr-switcher-label">Día de rodaje</div><div class="pr-chips">${diaChips}</div></div>
    <div class="pr-sw-line"><div class="pr-switcher-label">Unidad <span class="tt" data-tip="${escapeHtml(tipUni)}">?</span></div>
      <div class="pr-chips">${uniChips}<button class="pr-ab-btn pr-ab-add" data-accion="pr.d" data-args="[&quot;prAddUnidad&quot;]" title="Equipo que rueda en simultáneo">+ Unidad</button>
      <button class="pr-tool" ${accionHTML('pr.d', 'prRenameUnidad', u.id)} title="Renombrar unidad">✎</button>${dd.unidades.length > 1 ? `<button class="pr-tool pr-tool-del" ${accionHTML('pr.d', 'prDelUnidad', u.id)} title="Eliminar unidad">✕</button>` : ''}</div></div>
    <div class="pr-sw-line"><div class="pr-switcher-label">Plan <span class="tt" data-tip="${escapeHtml(tipVar)}">?</span></div>
      <div class="pr-chips">${varChips}<button class="pr-ab-btn pr-ab-add" data-accion="pr.d" data-args="[&quot;prAddPlan&quot;]" title="Plan de contingencia de esta unidad">+ Plan</button>
      <button class="pr-ab-btn" data-accion="pr.d" data-args="[&quot;prOpenTraer&quot;]" title="Copiar el contenido de otro plan">Traer de…</button>
      <button class="pr-tool" ${accionHTML('pr.d', 'prRenamePlan', plan.id)} title="Renombrar plan">✎</button>${u.variantes.length > 1 ? `<button class="pr-tool pr-tool-del" ${accionHTML('pr.d', 'prDelPlan', plan.id)} title="Eliminar plan">✕</button>` : ''}
      <span class="pr-version">V.${plan.version || 1}</span><span class="pr-version-exp">${plan.lastExport ? ('exp. ' + escapeHtml(plan.lastExport.at)) : 'sin exportar'}</span></div></div>
  </div>`;
}

function prHeaderHTML(project, diaId) {
  const ip = project.data.infoProyecto || {}; const di = prDiaInfo(project, diaId); const dd = project.data.planRodaje.dias[diaId];
  const hd = ((project.data.hojaLlamado || {}).dias || {})[diaId]; const ig = (hd && hd.infoGeneral) ? hd.infoGeneral : {};
  const plan = prCurrentPlan() || {};
  const ro = (label, val) => `<div class="pr-h-field"><label>${label}</label><div class="pr-h-ro">${escapeHtml(val || '—')}</div></div>`;
  const roLlamado = (val) => `<div class="pr-h-field" style="cursor:pointer;" data-accion="pr.d" data-args="[&quot;navigateToModule&quot;,&quot;hoja-llamado&quot;]" title="Se edita en Hoja de Llamado (fuente única). Clic para ir."><label>Llamado general <span style="font-size:9px;color:var(--accent,#B03A2F);font-weight:700;letter-spacing:.03em;">EDITAR \u2197</span></label><div class="pr-h-ro" style="color:var(--accent,#B03A2F);text-decoration:underline dotted;">${escapeHtml(val || '—')}</div></div>`;
  return `<div class="cot-card pr-header"><div class="pr-header-grid">
    ${ro('Cliente', ip.cliente)}${ro('Proyecto', ip.nombreProyecto || project.name)}${ro('Pieza / formato', ip.servicio)}
    ${ro('Día', `Día ${di.n} de ${di.total} · ${di.r.fecha ? prFechaLarga(di.r.fecha) : ((di.r.diaId || '') + ' · sin fecha (ponla en Rodajes)')}`)}
    ${(() => {
      ensureProjectLoc(project);
      const confs = projLocConfirmadas(project);
      if (!confs.length) {
        return `<div class="pr-h-field"><label>Locación / campamento base</label><input class="cot-input" value="${escapeHtml(dd.header.locacion || '')}" placeholder="Confírmala en Locaciones" data-accion="pr.d" data-args="[&quot;prSetHeader&quot;, &quot;locacion&quot;, &quot;\u00a7v\u00a7&quot;]" data-on="change"></div>`;
      }
      const cur = dd.header.locacion || '';
      const opts = `<option value="">(sin asignar)</option>` + confs.map(u => { const l = bdLocFind(u.locId) || {}; return `<option value="${escapeHtml(u.locId)}" ${cur === u.locId ? 'selected' : ''}>${escapeHtml(u.locId)} · ${escapeHtml(l.nombre || 'sin nombre')}</option>`; }).join('');
      // si el valor guardado es texto legado (no un locId), lo mostramos como opción para no perderlo
      const legacy = (cur && !bdLocFind(cur)) ? `<option value="${escapeHtml(cur)}" selected>${escapeHtml(cur)} (texto)</option>` : '';
      return `<div class="pr-h-field"><label>Locación / campamento base</label><select class="cot-input" data-accion="pr.d" data-args="[&quot;prSetHeader&quot;, &quot;locacion&quot;, &quot;\u00a7v\u00a7&quot;]" data-on="change">${opts}${legacy}</select></div>`;
    })()}
    <div class="pr-h-field"><label>Salida del sol <span class="tt" data-tip="La hora real viene de la Hoja de Llamado. El 'útil en set' lo defines aquí.">?</span></label><div class="pr-h-sol"><span class="pr-h-ro pr-h-real">${escapeHtml(ig.amanecer || '—')}</span><input class="cot-input pr-h-util" value="${escapeHtml(dd.header.solUtilAmanecer || '')}" placeholder="útil ~" data-accion="pr.d" data-args="[&quot;prSetHeader&quot;, &quot;solUtilAmanecer&quot;, &quot;\u00a7v\u00a7&quot;]" data-on="change"></div></div>
    <div class="pr-h-field"><label>Puesta del sol</label><div class="pr-h-sol"><span class="pr-h-ro pr-h-real">${escapeHtml(ig.atardecer || '—')}</span><input class="cot-input pr-h-util" value="${escapeHtml(dd.header.solUtilAtardecer || '')}" placeholder="útil ~" data-accion="pr.d" data-args="[&quot;prSetHeader&quot;, &quot;solUtilAtardecer&quot;, &quot;\u00a7v\u00a7&quot;]" data-on="change"></div></div>
    ${roLlamado(ig.llamadoGeneral)}${ro('Wrap cámara (est.)', ig.wrapCamara)}${ro('Wrap locación (est.)', ig.wrapLocacion)}
    <div class="pr-h-field"><label>Responsable del plan (AD) <span class="tt" data-tip="Quién responde por este plan. Normalmente el Asistente de Dirección. Selecciónalo de la Base de Datos y se autocompletan su teléfono y mail. Aparece en el pie del PDF.">?</span>
      <div class="combobox-wrap person-combobox">
        <input class="input combobox-input" value="${escapeHtml(dd.header.responsable || '')}" placeholder="Escribe para buscar en la Base de Datos…" autocomplete="off" data-accion="pr.respCombo" data-on="focus input blur change">
        <div class="combobox-dropdown" hidden></div>
      </div></div>
    <div class="pr-h-field"><label>Contacto responsable</label><input class="cot-input" value="${escapeHtml(dd.header.responsableContacto || '')}" placeholder="Teléfono o mail" data-accion="pr.d" data-args="[&quot;prSetHeader&quot;, &quot;responsableContacto&quot;, &quot;\u00a7v\u00a7&quot;]" data-on="change"></div>
  </div><p class="config-hint">Cabecera alimentada de Info Proyecto, RODAJES y Hoja de Llamado. El responsable y la orientación del PDF se eligen aquí y en la barra del módulo.</p></div>`;
}

function prRowToolsHTML(f, i, n) {
  const esBloque = (f.tipo === 'plano' || f.tipo === 'situacion');
  return `<span class="pr-tools">
    <button class="pr-drag" draggable="true" ondragstart="prDragStart(event,'${f.id}')" ondragend="prDragEnd(event)" title="Arrastrar para reordenar">⠿</button>
    <button class="pr-tool" ${accionHTML('pr.d', 'prMoveFila', f.id, -1)} title="Subir" ${i === 0 ? 'disabled' : ''}>⌃</button>
    <button class="pr-tool" ${accionHTML('pr.d', 'prMoveFila', f.id, 1)} title="Bajar" ${i === n - 1 ? 'disabled' : ''}>⌄</button>
    ${esBloque ? `<button class="pr-tool ${f.anchor != null ? 'is-on' : ''}" ${accionHTML('pr.d', 'prToggleAnchor', f.id)} title="Clavar a hora fija (ancla)">⚓</button>` : ''}
    ${esBloque ? `<button class="pr-tool ${f.paralelo ? 'is-on' : ''}" ${accionHTML('pr.d', 'prToggleParalelo', f.id)} title="En paralelo (no mueve el reloj)">∥</button>` : ''}
    <button class="pr-tool pr-tool-del" ${accionHTML('pr.d', 'prDelFila', f.id)} title="Eliminar">✕</button></span>`;
}
function prImgAttachHTML(id, imgKey, arr) {
  arr = arr || [];
  const thumbs = arr.map((src, k) => `<span class="pr-thumb"><img src="${safeUrl(src)}" alt=""><button class="pr-thumb-x" ${accionHTML('pr.d', 'prDelImagen', id, imgKey, k)} title="Quitar">✕</button></span>`).join('');
  return `<div class="pr-imgrow" ondragover="prImgDragOver(event)" ondragleave="prImgDragLeave(event)" ondrop="prDropImagen(event,'${id}','${imgKey}')">${thumbs}${arr.length < 6 ? `<label class="pr-img-add" title="Agregar o arrastrar imagen aquí (se comprime sola)">+<input type="file" accept="image/*" multiple style="display:none" ${accionHTML('pr.d', 'prAddImagen', id, imgKey, '§el§', { on: 'change' })}></label>` : ''}</div>`;
}
function prTextareaHTML(id, key, value, ph) { return `<textarea class="pr-ta" rows="2" placeholder="${ph || ''}" ${accionHTML('pr.d', 'prSetFilaField', id, key, '§v§', { on: 'change' })}>${escapeHtml(value || '')}</textarea>`; }
function prCellHTML(f, c) {
  if (c.role === 'check') return `<td class="pr-cell pr-cell-check"><span class="pr-checkbox" title="Casilla para marcar a mano en la hoja"></span></td>`;
  const imgKey = 'img_' + c.key;
  if (c.tipo === 'imagen') return `<td class="pr-cell pr-cell-img pr-col-${c.key}">${prImgAttachHTML(f.id, imgKey, f[imgKey])}</td>`;
  if (c.tipo === 'mixto') return `<td class="pr-cell pr-cell-mixto pr-col-${c.key}">${prTextareaHTML(f.id, c.key, f[c.key], '')}${prImgAttachHTML(f.id, imgKey, f[imgKey])}</td>`;
  return `<td class="pr-cell pr-col-${c.key} ${c.narrow ? 'pr-cell-narrow' : ''}">${prTextareaHTML(f.id, c.key, f[c.key], '')}</td>`;
}
function prTimeCellHTML(f, c, t, isStart) {
  if (c.key === 'inicio') {
    const cls = 'pr-cell-time pr-cell-inicio' + (t.collision ? ' pr-collision' : (t.gap > 0 ? ' pr-gap' : '')) + (f.paralelo ? ' pr-paral-time' : '');
    if (f.anchor != null && !f.paralelo) return `<td class="${cls}"><span class="pr-anchor-tag">⚓</span><input class="pr-anchor-in" value="${escapeHtml(f.anchor || '')}" placeholder="HH:MM" ${accionHTML('pr.d', 'prSetAnchor', f.id, '§v§', { on: 'change' })}></td>`;
    // V8.3.4: solo el primer inicio es editable (recuadro rojo tipeable, igual que duración).
    if (isStart) return `<td class="${cls}"><input class="pr-dur-in" value="${t.inicio != null ? escapeHtml(prFmtClock(t.inicio)) : ''}" placeholder="HH:MM" data-accion="pr.d" data-args="[&quot;prSetHoraInicio&quot;, &quot;\u00a7v\u00a7&quot;]" data-on="change"></td>`;
    return `<td class="${cls}">${t.inicio != null ? prFmtClock(t.inicio) : '—'}</td>`;
  }
  if (c.key === 'dur') return `<td class="pr-cell-dur"><input class="pr-dur-in" value="${escapeHtml(f.dur || '')}" placeholder="0:00" ${accionHTML('pr.d', 'prSetDur', f.id, '§v§', { on: 'change' })}></td>`;
  return `<td class="pr-cell-time ${f.paralelo ? 'pr-paral-time' : ''}">${t.termino != null ? prFmtClock(t.termino) : '—'}</td>`;
}
function prRowHTML(f, i, cols, t, n, isStart) {
  const ncols = cols.length;
  const sel = (f.id === STATE.prSelFila) ? ' pr-selected' : '';
  const attrs = `data-fid="${f.id}" ${accionHTML('pr.d', 'prSelectFila', f.id)} ondragover="prDragOver(event,'${f.id}')" ondragleave="prDragLeave(event)" ondrop="prDrop(event,'${f.id}')"`;
  if (f.tipo === 'seccion') return `<tr class="pr-row pr-row-seccion${sel}" ${attrs}><td colspan="${ncols}"><input class="pr-seccion-in" value="${escapeHtml(f.accion || '')}" placeholder="NOMBRE DEL BLOQUE · LOCACIÓN" ${accionHTML('pr.d', 'prSetFilaField', f.id, 'accion', '§v§', { on: 'change' })}></td><td class="pr-cell-tools">${prRowToolsHTML(f, i, n)}</td></tr>`;
  if (f.tipo === 'marcador') {
    const clock = t.inicio != null ? prFmtClock(t.inicio) : '—';
    const tcls = t.collision ? 'pr-collision' : (t.gap > 0 ? 'pr-gap' : '');
    return `<tr class="pr-row pr-row-marcador ${tcls}${sel}" ${attrs}><td class="pr-cell-time pr-cell-clock">${clock}</td>
      <td colspan="${ncols - 1}" class="pr-marcador-band"><input class="pr-marcador-in" value="${escapeHtml(f.accion || '')}" placeholder="LLAMADO GENERAL · LLEGADA CLIENTE · WRAP…" ${accionHTML('pr.d', 'prSetFilaField', f.id, 'accion', '§v§', { on: 'change' })}>
        <span class="pr-marcador-anchor"><button class="pr-tool ${f.anchor != null ? 'is-on' : ''}" ${accionHTML('pr.d', 'prToggleAnchor', f.id)} title="Hora fija">⚓</button>${f.anchor != null ? `<input class="pr-anchor-in" value="${escapeHtml(f.anchor || '')}" placeholder="07:00" ${accionHTML('pr.d', 'prSetAnchor', f.id, '§v§', { on: 'change' })}>` : ''}</span></td>
      <td class="pr-cell-tools">${prRowToolsHTML(f, i, n)}</td></tr>`;
  }
  const esBanda = (f.tipo === 'situacion' || f.paralelo);
  const contentCount = cols.filter(c => c.role === 'content').length;
  const parts = []; let bandDone = false;
  cols.forEach(c => {
    if (c.role === 'time') { parts.push(prTimeCellHTML(f, c, t, isStart)); return; }
    if (c.role === 'check') { parts.push(`<td class="pr-cell pr-cell-check"><span class="pr-checkbox" title="Casilla para marcar a mano en la hoja"></span></td>`); return; }
    if (esBanda) { if (!bandDone) { const tag = f.paralelo ? `<span class="pr-paral-tag">EN PARALELO</span>` : ''; parts.push(`<td colspan="${contentCount}" class="pr-band-cell ${f.paralelo ? 'pr-band-paral' : 'pr-band-sit'}">${tag}<textarea class="pr-ta pr-band-ta" rows="2" placeholder="${f.paralelo ? 'Qué ocurre en paralelo (maquillaje, foto fija…)' : 'Comida, montaje, traslado, prep, pack up…'}" ${accionHTML('pr.d', 'prSetFilaField', f.id, 'accion', '§v§', { on: 'change' })}>${escapeHtml(f.accion || '')}</textarea></td>`); bandDone = true; } return; }
    parts.push(prCellHTML(f, c));
  });
  const cls = esBanda ? (f.paralelo ? 'pr-row-paral' : 'pr-row-sit') : 'pr-row-plano';
  return `<tr class="pr-row ${cls}${sel}" ${attrs}>${parts.join('')}<td class="pr-cell-tools">${prRowToolsHTML(f, i, n)}</td></tr>`;
}
function prTableHTML(project, plan) {
  const cols = prActiveCols(project);
  const ig = (((project.data.hojaLlamado || {}).dias || {})[STATE.prDiaSel] || {}).infoGeneral || {};
  const times = prComputeTimes(plan.filas, prEffectiveStartMin(project, STATE.prDiaSel, plan));
  const span = prSpanDia(plan.filas, times); const n = plan.filas.length;
  const head = `<tr>${cols.map(c => `<th class="pr-th pr-th-${c.key}">${c.key === 'dur' ? 'Dur. ✎' : escapeHtml(c.label)}</th>`).join('')}<th class="pr-th"></th></tr>`;
  // V8.3.4: la primera fila con tiempo "normal" lleva el inicio editable (celda roja).
  let prFirstStartIdx = -1;
  for (let k = 0; k < plan.filas.length; k++) { const ff = plan.filas[k]; if (ff.tipo !== 'seccion' && ff.tipo !== 'marcador' && ff.anchor == null && !ff.paralelo) { prFirstStartIdx = k; break; } }
  const body = plan.filas.map((f, i) => prRowHTML(f, i, cols, times[i], n, i === prFirstStartIdx)).join('');
  const lbl = (f) => escapeHtml((f.accion || (f.tipo === 'marcador' ? 'marcador' : 'fila') || '').slice(0, 26)) + (f.anchor ? (' (' + f.anchor + ')') : '');
  const choques = [], huecos = [];
  times.forEach((t, i) => { const f = plan.filas[i]; if (t.collision) choques.push(lbl(f)); else if (t.gap > 0) huecos.push(lbl(f) + ' +' + prFmtDur(t.gap)); });
  const bChoque = choques.length ? `<div class="pr-warn pr-choque"><strong>⚠ CHOQUE DE TIEMPOS</strong> · uno o más bloques se pasan de una hora fija. Acorta las duraciones anteriores al ancla o desáncla la fila. Afecta: ${choques.join(' · ')}.</div>` : '';
  const bHueco = huecos.length ? `<div class="pr-warn pr-hueco"><strong>⧖ HUECO DE TIEMPOS</strong> · queda tiempo sin asignar antes de un ancla. Rellena esa sección o ajusta el ancla. Afecta: ${huecos.join(' · ')}.</div>` : '';
  const dropEnd = n ? `<tr class="pr-drop-end" ondragover="prDragOver(event,'__end__')" ondragleave="prDragLeave(event)" ondrop="prDrop(event,'__end__')"><td colspan="${cols.length + 1}">soltar aquí para mover al final</td></tr>` : '';
  return `<div class="cot-card pr-table-card">${bChoque}${bHueco}
    <div class="pr-toolbar">
      <div class="pr-add-group"><span class="pr-add-label">Agregar fila${STATE.prSelFila ? ' (bajo la seleccionada)' : ''}:</span>
        <button class="btn btn-ghost btn-sm" data-accion="pr.d" data-args="[&quot;prAddFila&quot;, &quot;plano&quot;]">+ Plano</button>
        <button class="btn btn-ghost btn-sm" data-accion="pr.d" data-args="[&quot;prAddFila&quot;, &quot;situacion&quot;]">+ Situación</button>
        <button class="btn btn-ghost btn-sm" data-accion="pr.d" data-args="[&quot;prAddFila&quot;, &quot;marcador&quot;]">+ Marcador</button>
        <button class="btn btn-ghost btn-sm" data-accion="pr.d" data-args="[&quot;prAddFila&quot;, &quot;seccion&quot;]">+ Sección</button></div>
      <div class="pr-total">Total rodaje <strong>${span != null ? prFmtDur(span) : '—'}</strong> <span class="tt" data-tip="Duración del día: del inicio del primer bloque al término del último (carril principal). No suma los paralelos aparte.">?</span></div>
    </div>
    <div class="pr-table-wrap"><table class="pr-table"><thead>${head}</thead><tbody>${body}${dropEnd}</tbody></table></div>
    ${n ? '' : '<p class="config-hint">Aún no hay filas. Empieza con un Marcador para el llamado general (clávalo con ⚓) y agrega tus planos y situaciones. Haz clic en una fila para seleccionarla: lo nuevo se inserta debajo. Arrastra (⠿) para reordenar.</p>'}
  </div>`;
}
function prBancoHTML(project, plan) {
  const rows = plan.banco.map((f) => `<tr class="pr-banco-row">
    <td class="pr-banco-cod"><textarea class="pr-ta pr-cell-narrow" rows="2" placeholder="B1" ${accionHTML('pr.d', 'prSetFilaField', f.id, 'escPlano', '§v§', { on: 'change' })}>${escapeHtml(f.escPlano || '')}</textarea></td>
    <td>${prTextareaHTML(f.id, 'accion', f.accion, 'Plano si queda tiempo')}</td>
    <td class="pr-cell-mixto">${prTextareaHTML(f.id, 'ref', f.ref, '')}${prImgAttachHTML(f.id, 'img_ref', f.img_ref)}</td>
    <td>${prTextareaHTML(f.id, 'prod', f.prod, 'Nota')}</td>
    <td class="pr-cell-tools"><button class="pr-tool pr-tool-del" ${accionHTML('pr.d', 'prDelBanco', f.id)} title="Eliminar">✕</button></td></tr>`).join('');
  return `<div class="cot-card pr-banco-card"><div class="pr-toolbar"><div class="cot-card-title" style="margin:0;">Banco de planos <span class="tt" data-tip="Planos 'si queda tiempo'. Fuera de la línea de tiempo y NO suman al total del día.">?</span></div><button class="btn btn-ghost btn-sm" data-accion="pr.d" data-args="[&quot;prAddBanco&quot;]">+ Plano al banco</button></div>
    ${plan.banco.length ? `<div class="pr-table-wrap"><table class="pr-table pr-banco-table"><thead><tr><th class="pr-th">Cód.</th><th class="pr-th">Acción</th><th class="pr-th">Ref</th><th class="pr-th">Nota</th><th class="pr-th"></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="config-hint">Sin planos en el banco. Úsalo para tomas opcionales que no entran en el horario.</p>'}
  </div>`;
}

/* ── Panel de columnas ── */
function prOpenCols() {
  const c = ensurePlanRodaje(STATE.currentProject).columnas;
  const tipoSel = (col, idx) => `<select class="pr-col-tipo" ${accionHTML('pr.d', 'prSetColTipo', idx, '§v§', { on: 'change' })}><option value="texto" ${col.tipo === 'texto' ? 'selected' : ''}>Texto</option><option value="imagen" ${col.tipo === 'imagen' ? 'selected' : ''}>Imagen</option><option value="mixto" ${col.tipo === 'mixto' ? 'selected' : ''}>Texto + Imagen</option><option value="check" ${col.tipo === 'check' ? 'selected' : ''}>Casilla ✓</option></select>`;
  const extraRows = c.extra.map((col, idx) => `<div class="pr-colcfg ${col.on ? '' : 'is-off'}"><button class="pr-tool" ${accionHTML('pr.d', 'prMoveCol', idx, -1)} title="Subir" ${idx === 0 ? 'disabled' : ''}>⌃</button><button class="pr-tool" ${accionHTML('pr.d', 'prMoveCol', idx, 1)} title="Bajar" ${idx === c.extra.length - 1 ? 'disabled' : ''}>⌄</button><input class="pr-col-name" value="${escapeHtml(col.label)}" ${accionHTML('pr.d', 'prSetColLabel', idx, '§v§', { on: 'change' })}>${tipoSel(col, idx)}<label class="pr-col-on"><input type="checkbox" ${col.on ? 'checked' : ''} ${accionHTML('pr.d', 'prToggleColOn', idx, { on: 'change' })}> visible</label><button class="pr-tool pr-tool-del" ${accionHTML('pr.d', 'prDelColumna', idx)} title="Eliminar columna">✕</button></div>`).join('');
  const estructura = `<div class="pr-col-group"><div class="pr-col-group-t">Estructura <span class="pr-col-lock">orden y nombre fijos</span></div><div class="pr-struct-list"><span class="pr-struct-pill is-locked">Inicio</span><span class="pr-struct-pill is-locked">Duración</span><label class="pr-struct-pill"><input type="checkbox" ${c.termino !== false ? 'checked' : ''} data-accion="pr.d" data-args="[&quot;prToggleStruct&quot;, &quot;termino&quot;]" data-on="change"> Término</label><label class="pr-struct-pill"><input type="checkbox" ${c.escPlano !== false ? 'checked' : ''} data-accion="pr.d" data-args="[&quot;prToggleStruct&quot;, &quot;escPlano&quot;]" data-on="change"> Esc / Plano</label><span class="pr-struct-pill is-locked">Acción / Situación</span></div><p class="pr-col-note">Siempre van primero y en este orden. Lo de abajo es libre.</p></div>`;
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-accion="ui.backdrop"><div class="modal" style="max-width:640px;"><div class="modal-header"><div class="modal-title">Columnas del plan</div></div><div class="modal-body">${estructura}<div class="pr-col-group"><div class="pr-col-group-t">Columnas configurables</div><div class="pr-colcfg-list">${extraRows}</div><button class="btn btn-ghost btn-sm" style="margin-top:10px;" data-accion="pr.d" data-args="[&quot;prAddColumna&quot;]">+ Agregar columna personalizada</button></div></div><div class="modal-footer"><button class="btn" data-accion="pr.d" data-args="[&quot;prResetCols&quot;]">Volver al preset por defecto</button><button class="btn btn-primary" data-accion="pr.d" data-args="[&quot;closeModal&quot;]">Listo</button></div></div></div>`;
}
function prReopenCols() { renderPlanRodaje(); setTimeout(prOpenCols, 0); }
function prToggleStruct(key) { const c = ensurePlanRodaje(STATE.currentProject).columnas; c[key] = !(c[key] !== false); markDirty(); prReopenCols(); }
function prSetColLabel(idx, val) { const c = ensurePlanRodaje(STATE.currentProject).columnas; if (c.extra[idx]) { c.extra[idx].label = val; markDirty(); renderPlanRodaje(); } }
function prSetColTipo(idx, val) { const c = ensurePlanRodaje(STATE.currentProject).columnas; if (c.extra[idx]) { c.extra[idx].tipo = val; markDirty(); prReopenCols(); } }
function prToggleColOn(idx) { const c = ensurePlanRodaje(STATE.currentProject).columnas; if (c.extra[idx]) { c.extra[idx].on = !c.extra[idx].on; markDirty(); prReopenCols(); } }
function prMoveCol(idx, dir) { const c = ensurePlanRodaje(STATE.currentProject).columnas; const j = idx + dir; if (j < 0 || j >= c.extra.length) return; const t = c.extra[idx]; c.extra[idx] = c.extra[j]; c.extra[j] = t; markDirty(); prReopenCols(); }
function prDelColumna(idx) { const c = ensurePlanRodaje(STATE.currentProject).columnas; if (c.extra[idx]) { c.extra.splice(idx, 1); markDirty(); prReopenCols(); } }
function prAddColumna() { const c = ensurePlanRodaje(STATE.currentProject).columnas; c.extra.push({ id: prNewColId(), label: 'Nueva columna', tipo: 'texto', on: true }); markDirty(); prReopenCols(); }
function prResetCols() { ensurePlanRodaje(STATE.currentProject).columnas = prDefaultColsCfg(); markDirty(); prReopenCols(); }

/* ── Día / unidad / plan ── */
function prSetDia(diaId) { STATE.prDiaSel = diaId; STATE.prUnidadId = null; STATE.prVarId = null; STATE.prSelFila = null; renderPlanRodaje(); }
function prSetUnidad(id) { const dd = prEnsureDia(STATE.currentProject, STATE.prDiaSel); const u = dd.unidades.find(x => x.id === id); if (!u) return; dd.activoUnidadId = id; STATE.prUnidadId = id; STATE.prVarId = u.activoVarId; STATE.prSelFila = null; markDirty(); renderPlanRodaje(); }
function prSetPlan(id) { const u = prCurrentUnidad(); if (!u || !u.variantes.find(v => v.id === id)) return; u.activoVarId = id; STATE.prVarId = id; STATE.prSelFila = null; markDirty(); renderPlanRodaje(); }
function prAddUnidad() {
  const dd = prEnsureDia(STATE.currentProject, STATE.prDiaSel);
  const u = prNuevaUnidad('Unidad ' + (dd.unidades.length + 1), 'Plan A');
  dd.unidades.push(u); dd.activoUnidadId = u.id; STATE.prUnidadId = u.id; STATE.prVarId = u.activoVarId; STATE.prSelFila = null;
  markDirty(); renderPlanRodaje();
  showToast({ kind: 'success', title: u.label + ' creada', body: 'Equipo en simultáneo, con su propio plan en blanco. Puedes usar “Traer de…” para partir de otro.' });
}
function prAddPlan() {
  const u = prCurrentUnidad(); if (!u) return;
  const label = 'Plan ' + String.fromCharCode(65 + u.variantes.length);
  const base = JSON.parse(JSON.stringify(prCurrentPlan()));
  const v = prNuevoVariante(label, base); v.filas.forEach(f => f.id = prNewId()); v.banco.forEach(f => f.id = prNewId()); v.version = 1; v.lastExport = null;
  u.variantes.push(v); u.activoVarId = v.id; STATE.prVarId = v.id; STATE.prSelFila = null;
  markDirty(); renderPlanRodaje();
  showToast({ kind: 'success', title: label + ' creado', body: 'Copia del plan activo para contingencia de esta unidad.' });
}
function prRenameUnidad(id) { const dd = prEnsureDia(STATE.currentProject, STATE.prDiaSel); const u = dd.unidades.find(x => x.id === id); if (!u) return; const nv = window.prompt('Nombre de la unidad:', u.label); if (nv == null) return; u.label = nv.trim() || u.label; markDirty(); renderPlanRodaje(); }
function prDelUnidad(id) { const dd = prEnsureDia(STATE.currentProject, STATE.prDiaSel); if (dd.unidades.length <= 1) return; const u = dd.unidades.find(x => x.id === id); if (!u) return; if (!window.confirm('¿Eliminar "' + u.label + '" con todos sus planes? Se puede deshacer con Cmd+Z.')) return; dd.unidades = dd.unidades.filter(x => x.id !== id); if (dd.activoUnidadId === id) dd.activoUnidadId = dd.unidades[0].id; STATE.prUnidadId = dd.activoUnidadId; STATE.prVarId = null; STATE.prSelFila = null; markDirty(); renderPlanRodaje(); }
function prRenamePlan(id) { const u = prCurrentUnidad(); const v = u.variantes.find(x => x.id === id); if (!v) return; const nv = window.prompt('Nombre del plan:', v.label); if (nv == null) return; v.label = nv.trim() || v.label; markDirty(); renderPlanRodaje(); }
function prDelPlan(id) { const u = prCurrentUnidad(); if (u.variantes.length <= 1) return; const v = u.variantes.find(x => x.id === id); if (!v) return; if (!window.confirm('¿Eliminar "' + v.label + '"? Se puede deshacer con Cmd+Z.')) return; u.variantes = u.variantes.filter(x => x.id !== id); if (u.activoVarId === id) u.activoVarId = u.variantes[0].id; STATE.prVarId = u.activoVarId; STATE.prSelFila = null; markDirty(); renderPlanRodaje(); }

/* ── Traer de… ── */
function prOpenTraer() {
  const dd = prEnsureDia(STATE.currentProject, STATE.prDiaSel); const cur = prCurrentPlan();
  const ops = [];
  dd.unidades.forEach(u => u.variantes.forEach(v => { if (v.id === cur.id) return; ops.push(`<button class="pr-traer-op" ${accionHTML('pr.d', 'prTraerDe', u.id, v.id)}><span class="pr-traer-op-lbl">${escapeHtml(u.label)} · ${escapeHtml(v.label)}</span><span class="pr-traer-op-sub">${v.filas.length} fila(s)</span></button>`); }));
  const body = ops.length ? `<p class="pr-col-note">Copia las filas y el banco del plan elegido sobre <strong>${escapeHtml(cur.label)}</strong>. Lo que tengas ahora se reemplaza (puedes deshacer con Cmd+Z).</p><div class="pr-traer-list">${ops.join('')}</div>` : '<p class="config-hint">No hay otros planes en este día desde los cuales copiar.</p>';
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-accion="ui.backdrop"><div class="modal" style="max-width:520px;"><div class="modal-header"><div class="modal-title">Traer contenido de otro plan</div></div><div class="modal-body">${body}</div><div class="modal-footer"><button class="btn" data-accion="pr.d" data-args="[&quot;closeModal&quot;]">Cancelar</button></div></div></div>`;
}
function prTraerDe(unidadId, varId) {
  const dd = prEnsureDia(STATE.currentProject, STATE.prDiaSel); const u = dd.unidades.find(x => x.id === unidadId); const src = u && u.variantes.find(v => v.id === varId); const cur = prCurrentPlan();
  if (!src || !cur) return;
  if ((cur.filas.length || cur.banco.length) && !window.confirm('Esto reemplaza el contenido actual de "' + cur.label + '" con el de "' + u.label + ' · ' + src.label + '". ¿Continuar?')) return;
  cur.filas = JSON.parse(JSON.stringify(src.filas)); cur.filas.forEach(f => f.id = prNewId());
  cur.banco = JSON.parse(JSON.stringify(src.banco)); cur.banco.forEach(f => f.id = prNewId());
  STATE.prSelFila = null; closeModal(); markDirty(); renderPlanRodaje();
  showToast({ kind: 'success', title: 'Contenido traído', body: 'Se copió desde ' + u.label + ' · ' + src.label + '.' });
}

/* ── Filas ── */
function prSelectFila(id) {
  STATE.prSelFila = id;
  try { document.querySelectorAll('.pr-row.pr-selected').forEach(el => el.classList.remove('pr-selected')); const tr = document.querySelector('tr[data-fid="' + id + '"]'); if (tr) tr.classList.add('pr-selected'); } catch (e) {}
}
function prAddFila(tipo) {
  const plan = prCurrentPlan(); if (!plan) return;
  const f = { id: prNewId(), tipo: tipo, dur: (tipo === 'plano' || tipo === 'situacion') ? '0:30' : '', anchor: null, paralelo: false, escPlano: '', accion: '' };
  const si = STATE.prSelFila ? plan.filas.findIndex(x => x.id === STATE.prSelFila) : -1;
  if (si >= 0) plan.filas.splice(si + 1, 0, f); else plan.filas.push(f);
  STATE.prSelFila = f.id; markDirty(); renderPlanRodaje();
}
function prDelFila(id) { const plan = prCurrentPlan(); if (!plan) return; plan.filas = plan.filas.filter(f => f.id !== id); if (STATE.prSelFila === id) STATE.prSelFila = null; markDirty(); renderPlanRodaje(); }
function prMoveFila(id, dir) { const plan = prCurrentPlan(); if (!plan) return; const i = plan.filas.findIndex(f => f.id === id); if (i < 0) return; const j = i + dir; if (j < 0 || j >= plan.filas.length) return; const t = plan.filas[i]; plan.filas[i] = plan.filas[j]; plan.filas[j] = t; markDirty(); renderPlanRodaje(); }
function prSetFilaField(id, field, value) { const f = prFindFila(id); if (f) { f[field] = value; markDirty(); try { marcarSenal(STATE.currentProject, { tipo: 'guion', seccion: 'plan-rodaje', rolObjetivo: 'AD', descripcion: 'El guion técnico / plan de rodaje cambió desde tu última revisión' }); } catch (e) {} } }
function prSetDur(id, value) { const f = prFindFila(id); if (f) { f.dur = prNormalizeDur(value); markDirty(); renderPlanRodaje(); } }
function prToggleAnchor(id) {
  const f = prFindFila(id); if (!f) return;
  if (f.anchor != null) f.anchor = null;
  else { const plan = prCurrentPlan(); const times = prComputeTimes(plan.filas, prEffectiveStartMin(STATE.currentProject, STATE.prDiaSel, plan)); const idx = plan.filas.findIndex(x => x.id === id); const t = times[idx]; f.anchor = (t && t.inicio != null) ? prFmtClock(t.inicio) : '08:00'; }
  markDirty(); renderPlanRodaje();
}
function prSetAnchor(id, value) { const f = prFindFila(id); if (f) { f.anchor = prNormalizeClock(value); markDirty(); renderPlanRodaje(); } }
function prToggleParalelo(id) { const f = prFindFila(id); if (f) { f.paralelo = !f.paralelo; if (f.paralelo) f.anchor = null; markDirty(); renderPlanRodaje(); } }
function prSetHeader(field, value) { const dd = prEnsureDia(STATE.currentProject, STATE.prDiaSel); dd.header[field] = value; markDirty(); }
function prSetResponsable(nombre) {
  const dd = prEnsureDia(STATE.currentProject, STATE.prDiaSel);
  dd.header.responsable = nombre || '';
  const p = (typeof BD_PERSONAS !== 'undefined' && nombre) ? BD_PERSONAS[nombre] : null;
  if (p) { const tel = p.telefono || ''; const mail = p.email || p.mail || ''; const c = [tel, mail].filter(Boolean).join(' · '); if (c) dd.header.responsableContacto = c; }
  markDirty(); renderPlanRodaje();
}


function prDragStart(ev, id) { PR_DRAG_ID = id; try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', id); } catch (e) {} try { const tr = document.querySelector('tr[data-fid="' + id + '"]'); if (tr) tr.classList.add('pr-dragging'); } catch (e) {} }
function prDragEnd(ev) { PR_DRAG_ID = null; try { document.querySelectorAll('.pr-drag-over,.pr-dragging').forEach(el => el.classList.remove('pr-drag-over', 'pr-dragging')); } catch (e) {} }
function prDragOver(ev, id) { if (!PR_DRAG_ID || PR_DRAG_ID === id) return; ev.preventDefault(); const tr = ev.currentTarget; if (tr && tr.classList) tr.classList.add('pr-drag-over'); }
function prDragLeave(ev) { const tr = ev.currentTarget; if (tr && tr.classList) tr.classList.remove('pr-drag-over'); }
function prDrop(ev, id) {
  ev.preventDefault(); const plan = prCurrentPlan(); const from = PR_DRAG_ID; PR_DRAG_ID = null;
  try { document.querySelectorAll('.pr-drag-over,.pr-dragging').forEach(el => el.classList.remove('pr-drag-over', 'pr-dragging')); } catch (e) {}
  if (!plan || !from || from === id) return;
  const fi = plan.filas.findIndex(f => f.id === from); if (fi < 0) return;
  const moved = plan.filas.splice(fi, 1)[0];
  if (id === '__end__') plan.filas.push(moved);
  else { let ti = plan.filas.findIndex(f => f.id === id); if (ti < 0) ti = plan.filas.length; plan.filas.splice(ti, 0, moved); }
  markDirty(); renderPlanRodaje();
}

/* ── Imágenes ── */
function prImgDragOver(ev) { ev.preventDefault(); ev.stopPropagation(); const z = ev.currentTarget; if (z && z.classList) z.classList.add('pr-img-drop'); }
function prImgDragLeave(ev) { const z = ev.currentTarget; if (z && z.classList) z.classList.remove('pr-img-drop'); }
function prDropImagen(ev, id, imgKey) {
  ev.preventDefault(); ev.stopPropagation();
  const z = ev.currentTarget; if (z && z.classList) z.classList.remove('pr-img-drop');
  const files = (ev.dataTransfer && ev.dataTransfer.files) ? Array.prototype.slice.call(ev.dataTransfer.files) : [];
  const imgs = files.filter(f => /^image\//.test(f.type)); if (!imgs.length) return;
  prAddImagenFiles(id, imgKey, imgs);
}
function prAddImagen(id, imgKey, input) { prAddImagenFiles(id, imgKey, Array.prototype.slice.call(input.files || [])); }
function prAddImagenFiles(id, imgKey, files) {
  if (!files || !files.length) return; const f = prFindFila(id); if (!f) return;
  if (!Array.isArray(f[imgKey])) f[imgKey] = [];
  const room = Math.max(0, 6 - f[imgKey].length);
  Promise.all(files.slice(0, room).map(file => prCompressImage(file))).then(urls => { urls.filter(Boolean).forEach(u => f[imgKey].push(u)); markDirty(); renderPlanRodaje(); });
}
function prDelImagen(id, imgKey, k) { const f = prFindFila(id); if (f && Array.isArray(f[imgKey])) { f[imgKey].splice(k, 1); markDirty(); renderPlanRodaje(); } }

/* ── Banco ── */
function prAddBanco() { const plan = prCurrentPlan(); if (!plan) return; plan.banco.push({ id: prNewId(), tipo: 'plano', escPlano: '', accion: '', ref: '', prod: '' }); markDirty(); renderPlanRodaje(); }
function prDelBanco(id) { const plan = prCurrentPlan(); if (!plan) return; plan.banco = plan.banco.filter(f => f.id !== id); markDirty(); renderPlanRodaje(); }

export function getConfirmedCrew(project) {
  const d = project.data;
  const out = [];
  const seen = new Set();
  const push = (nombre, rol, source) => {
    if (!nombre || seen.has(nombre)) return;
    seen.add(nombre);
    out.push({ nombre, rol, source });
  };
  for (const dept in d.servicios) {
    d.servicios[dept].forEach(r => { if (r.confirmado && r.nombre && !r.noVaRodaje) push(r.nombre, r.rol, dept); });
  }
  ['gastos', 'equipos', 'talentos'].forEach(section => {
    d[section].forEach(r => { if (r.confirmado && r.nombre && !r.noVaRodaje) push(r.nombre, r.item, section); });
  });
  return out;
}

/* Inicializa la estructura de un día de Hoja de Llamado si no existe.
   V5.3.1 (Notas 3+4): el versionado y el timestamp de exportación son
   POR DÍA, porque cada día se exporta y distribuye como un PDF aparte.
     - version: 0 = borrador (nunca exportado). Cada export hace +1.
     - lastExport: { version, at } del último PDF generado, o null. */
function ensureHojaDia(diaId) {
  const hl = STATE.currentProject.data.hojaLlamado;
  if (!hl.dias[diaId]) {
    hl.dias[diaId] = {
      infoGeneral: {
        llamadoGeneral: '', almuerzo: '', amanecer: '', atardecer: '',
        wrapCamara: '', wrapLocacion: '', hospital: '', clima: ''
      },
      citacionesExternas: [],
      crewOverrides: {},   // nombre → { call, locacionId, notas, presente, rol, numero }
      crewOrden: [],       // V11.25 (Pasada 7): orden manual del crew por día (nombres)
      version: 0,
      lastExport: null     // { version, at } | null
    };
  }
  // Backfill para días hidratados antes de V5.3.1
  const dia = hl.dias[diaId];
  if (dia.version === undefined) dia.version = 0;
  if (dia.lastExport === undefined) dia.lastExport = null;
  if (!Array.isArray(dia.crewOrden)) dia.crewOrden = [];
  return dia;
}


function renderHojaLlamado() {
  const project = STATE.currentProject;
  if (!project) return;
  if (!project.data.hojaLlamado) {
    project.data.hojaLlamado = { version: 1, locaciones: [], dias: {} };
  }
  const content = document.getElementById('moduleContent');
  const ip = project.data.infoProyecto;
  const hl = project.data.hojaLlamado;

  const diasActivos = project.data.rodajes.filter(r => r.activo);

  // Sin días activos → no se puede armar la hoja
  if (diasActivos.length === 0) {
    content.innerHTML = `
      <div class="alert alert-info">
        <span class="alert-icon">ℹ</span>
        <div>
          No hay días de rodaje activos todavía. Ve al módulo <strong>Rodajes</strong>, agrega al menos un día y márcalo como <strong>activo</strong> para poder construir la Hoja de Llamado.
          <div style="margin-top: 10px;"><button class="btn btn-primary btn-sm" data-accion="pr.d" data-args="[&quot;navigateToModule&quot;,&quot;rodajes&quot;]">Ir a Rodajes</button></div>
        </div>
      </div>
    `;
    return;
  }

  // Validar / fijar el día seleccionado
  let sel = STATE.ui.hojaDiaSel;
  if (!sel || !diasActivos.some(r => r.diaId === sel)) {
    sel = diasActivos[0].diaId;
    STATE.ui.hojaDiaSel = sel;
  }
  const rodajeSel = diasActivos.find(r => r.diaId === sel);
  const dia = ensureHojaDia(sel);
  const ig = dia.infoGeneral;
  // V5.3.1 (Notas 3+4): versión y timestamp de exportación POR DÍA.
  const verLabel = dia.version > 0 ? `V.${dia.version}` : 'Borrador';
  const exportInfo = dia.lastExport
    ? `Exportada ${ 'V.' + dia.lastExport.version } · ${escapeHtml(dia.lastExport.at)}`
    : 'Sin exportar aún';
  const crew = getCrewOrdenado(project, dia);
  const _hlCols = ['hl_rol', 'hl_nombre', 'hl_numero', 'hl_call', 'hl_loc', 'hl_notas'];
  const _hlCrewW = 26 + 54 + _hlCols.reduce((s, c) => s + _budgetColWGet('hlCrew', c), 0);
  const _hlExtW = 26 + _hlCols.reduce((s, c) => s + _budgetColWGet('hlExt', c), 0) + 40;

  // V5.5 (Nota 3): horas en 24h SIEMPRE. Los <input type="time"> muestran
  // 12h/24h según el SO del usuario, así que no son confiables. Usamos
  // texto con normalización: "700"→07:00, "1300"→13:00, "1845"→18:45.
  const igField = (field, label, type = 'time') => {
    if (type === 'time') {
      return `
        <div class="hl-ig-cell">
          <label>${label}</label>
          <input type="text" inputmode="numeric" class="time24" maxlength="5" placeholder="HH:MM"
                 value="${escapeHtml(ig[field] || '')}"
                 ${accionHTML('pr.hojaInfoT', sel, field, { on: 'change' })}>
        </div>
      `;
    }
    return `
      <div class="hl-ig-cell">
        <label>${label}</label>
        <input type="text" value="${escapeHtml(ig[field] || '')}" placeholder="—"
               ${accionHTML('pr.d', 'updateHojaInfoGeneral', sel, field, '§v§', { on: 'change' })}>
      </div>
    `;
  };

  content.innerHTML = `
    <!-- BARRA DE CONTROL: selector de día + versión + export -->
    <div class="hl-controls">
      <div class="hl-day-select">
        <label>Día de rodaje</label>
        <select data-accion="pr.d" data-args="[&quot;selectHojaDia&quot;,&quot;§v§&quot;]" data-on="change">
          ${diasActivos.map(r => `
            <option value="${escapeHtml(r.diaId)}" ${r.diaId === sel ? 'selected' : ''}>
              ${escapeHtml(r.diaId)}${r.fecha ? ' · ' + escapeHtml(fmtFechaLarga(r.fecha)) : ' · (sin fecha)'}
            </option>
          `).join('')}
        </select>
      </div>
      <div class="hl-version-block">
        <div class="hl-version-stack">
          <span class="hl-version-badge">${verLabel}</span>
          <span class="hl-export-stamp">${exportInfo}</span>
        </div>
        <button class="btn btn-primary btn-sm" data-accion="pr.d" data-args="[&quot;hojaPreviewPDF&quot;]" data-tip="Abre el previsualizador. Al exportar desde ahí se genera el PDF y AVANZA la versión automáticamente: cada export es una versión oficial distribuible.">Exportar PDF</button>
        <button class="btn btn-secondary btn-sm" data-accion="pr.d" data-args="[&quot;ntfOpenFromHoja&quot;]" data-tip="Abre Notificaciones › Enviar con la plantilla «Envío de Hoja de Llamado» y los destinatarios ya cargados. El PDF adjunto real llega con el backend.">Exportar y Enviar</button>
      </div>
    </div>

    <!-- DOCUMENTO -->
    <div class="hl-doc">
      <div class="hl-doc-header">
        <div>
          <div class="hl-doc-title">HOJA DE LLAMADO</div>
          <div class="hl-doc-sub">${escapeHtml(ip.nombreProyecto || project.name || '')} · ${escapeHtml(rodajeSel.diaId)}${rodajeSel.fecha ? ' · ' + escapeHtml(fmtFechaLarga(rodajeSel.fecha)) : ''}</div>
          ${rodajeSel.descripcion ? `<div class="hl-doc-desc">${escapeHtml(rodajeSel.descripcion)}</div>` : ''}
        </div>
        <div class="hl-doc-version-block">
          <div class="hl-doc-version">${verLabel}</div>
          <div class="hl-doc-export">${exportInfo}</div>
        </div>
      </div>

      <!-- INFORMACIÓN GENERAL (auto desde Info Proyecto) -->
      <div class="hl-block">
        <div class="hl-block-title">Información general</div>
        <div class="hl-info-grid">
          <div><span class="hl-k">Cliente</span><span class="hl-v">${escapeHtml(ip.cliente || '—')}</span></div>
          <div><span class="hl-k">Agencia</span><span class="hl-v">${escapeHtml(ip.agencia || 'No aplica')}</span></div>
          <div><span class="hl-k">Productora</span><span class="hl-v">${escapeHtml(ip.productora || orgNombre())}</span></div>
          <div><span class="hl-k">Productor(a) Ejecutivo(a)</span><span class="hl-v">${escapeHtml(ip.productorEjecutivo || '—')}</span></div>
          <div><span class="hl-k">Director(a)</span><span class="hl-v">${escapeHtml(ip.director || '—')}</span></div>
          <div><span class="hl-k">Jefe de Producción</span><span class="hl-v">${escapeHtml(ip.jefeProduccion || '—')}</span></div>
          <div><span class="hl-k">Contacto Cliente</span><span class="hl-v">${escapeHtml(ip.contactoCliente || '—')}</span></div>
          ${ip.contactoAgencia ? `<div><span class="hl-k">Contacto Agencia</span><span class="hl-v">${escapeHtml(ip.contactoAgencia)}</span></div>` : ''}
        </div>
        <div class="hl-auto-note">Estos datos vienen de <strong>Info Proyecto</strong>. Para cambiarlos, edítalos allá.</div>
      </div>

      <!-- INFO DEL DÍA (manual) -->
      <div class="hl-block">
        <div class="hl-block-title">Horarios y referencias del día</div>
        <div class="hl-ig-grid">
          ${igField('llamadoGeneral', 'Llamado general')}
          ${igField('almuerzo', 'Almuerzo')}
          ${igField('amanecer', 'Amanecer')}
          ${igField('atardecer', 'Atardecer')}
          ${igField('wrapCamara', 'Wrap cámara')}
          ${igField('wrapLocacion', 'Wrap locación')}
          ${igField('hospital', 'Hospital cercano', 'text')}
          ${igField('clima', 'Clima', 'text')}
        </div>
      </div>

      <!-- LOCACIONES (V8.2: gestionadas en el módulo Locaciones) -->
      <div class="hl-block">
        <div class="hl-block-title">Locaciones
          <button class="hl-add-inline" data-accion="pr.d" data-args="[&quot;navigateToModule&quot;,&quot;locaciones&quot;]">Gestionar en Locaciones →</button>
        </div>
        ${(() => {
          const confs = projLocConfirmadas(project);
          if (!confs.length) {
            const total = projLocList(project).length;
            return `<div class="hl-empty">${total ? 'Hay locaciones en el proyecto, pero ninguna está <strong>Confirmada</strong>. Solo las confirmadas se pueden asignar a las citaciones.' : 'Sin locaciones confirmadas.'} Gestiónalas en el módulo <strong>Locaciones</strong>.</div>`;
          }
          return `<div style="overflow-x:auto;"><table class="data-table hl-loc-table"><thead><tr><th style="width:80px;">ID</th><th>Nombre</th><th>Dirección</th><th>Comuna</th></tr></thead><tbody>${confs.map(u => { const l = bdLocFind(u.locId) || {}; return `<tr><td><span class="dia-id-badge">${escapeHtml(u.locId)}</span></td><td>${escapeHtml(l.nombre || 'sin nombre')}</td><td>${escapeHtml(l.direccion || '—')}</td><td>${escapeHtml(l.comuna || '—')}</td></tr>`; }).join('')}</tbody></table></div><div class="config-hint" style="margin-top:6px;">Solo lectura. Las locaciones (datos, fotos, estado) se editan en el módulo <strong>Locaciones</strong>. Aquí se asignan a cada citación abajo.</div>`;
        })()}
      </div>

      <!-- CITACIONES CREW (auto desde Presupuesto) -->
      <div class="hl-block">
        <div class="hl-block-title">Citaciones · Crew confirmado${crew.length ? ` <span class="hl-cit-count">${crew.filter(c => isCrewPresente(dia, c.nombre)).length}/${crew.length} citados</span>` : ''}</div>
        ${crew.length === 0 ? `
          <div class="hl-empty">No hay crew confirmado todavía. Marca personas como confirmadas en <strong>Presupuesto</strong> para que aparezcan aquí.</div>
        ` : `
          <div style="overflow-x: auto;">
            <table class="data-table hl-cit-table budget-table" data-bsec-table="hlCrew" style="width:${_hlCrewW}px;">
              <thead>
                <tr><th style="width:26px;"></th><th class="ctr" style="width:54px;">Citar</th>${_budgetColTh('hlCrew', 'hl_rol', '', 'Cargo / Rol')}${_budgetColTh('hlCrew', 'hl_nombre', '', 'Nombre')}${_budgetColTh('hlCrew', 'hl_numero', '', 'Número')}${_budgetColTh('hlCrew', 'hl_call', '', 'Call <span class="th-24h">24h</span>')}${_budgetColTh('hlCrew', 'hl_loc', '', 'Locación')}${_budgetColTh('hlCrew', 'hl_notas', '', 'Notas')}</tr>
              </thead>
              <tbody>
                ${crew.map((c, _vi) => {
                  const ov = dia.crewOverrides[c.nombre] || {};
                  const bd = BD_PERSONAS[c.nombre] || null;
                  const nm = escapeHtml(c.nombre);
                  const presente = isCrewPresente(dia, c.nombre);
                  const rolOrig = c.rol || '';
                  const rolEd = (ov.rol != null && String(ov.rol) !== '' && ov.rol !== rolOrig);
                  const numOrig = bd?.telefono || '';
                  const numEd = (ov.numero != null && String(ov.numero) !== '' && ov.numero !== numOrig);
                  const nomOrig = c.nombre || '';
                  const nomEd = (ov.nombre != null && String(ov.nombre) !== '' && ov.nombre !== nomOrig);
                  return `
                  <tr class="${presente ? '' : 'crew-no-citado'}" ondragover="hlDragOver(event)" ondragleave="hlDragLeave(event)" ondrop="hlDrop(event,'crew',${_vi})">
                    <td class="hl-drag-cell"><button class="hl-drag" draggable="true" ondragstart="hlDragStart(event,'crew',${_vi})" ondragend="hlDragEnd(event)" title="Arrastrar para reordenar">⠿</button></td>
                    <td class="ctr"><input type="checkbox" ${presente ? 'checked' : ''} title="Citar a esta persona este día" ${accionHTML('pr.d', 'toggleCrewPresente', sel, nm, '§c§', { on: 'change' })}></td>
                    <td><div class="hl-ovwrap"><input class="cell-input" value="${escapeHtml(_hlOvVal(ov.rol, rolOrig))}" placeholder="${escapeHtml(rolOrig || 'Rol')}" ${presente ? '' : 'disabled'} ${accionHTML('pr.d', 'updateCrewOverride', sel, nm, 'rol', '§v§', { on: 'change' })}>${rolEd ? `<button class="hl-revert" data-tip="Restablecer al valor del Presupuesto${rolOrig ? ' («' + escapeHtml(rolOrig) + '»)' : ''}" ${accionHTML('pr.d', 'revertCrewOverride', sel, nm, 'rol')}>↺</button>` : ''}</div></td>
                    <td><div class="hl-ovwrap"><input class="cell-input hl-name-input" value="${escapeHtml(_hlOvVal(ov.nombre, nomOrig))}" placeholder="${escapeHtml(nomOrig)}" ${presente ? '' : 'disabled'} ${accionHTML('pr.d', 'updateCrewOverride', sel, nm, 'nombre', '§v§', { on: 'change' })}>${bd ? '' : '<span class="cell-name-warn" data-tip="No está en la BD: escribe el número a mano en la columna Número.">●</span>'}${nomEd ? `<button class="hl-revert" data-tip="Restablecer al valor del Presupuesto${nomOrig ? ' («' + escapeHtml(nomOrig) + '»)' : ''}" ${accionHTML('pr.d', 'revertCrewOverride', sel, nm, 'nombre')}>↺</button>` : ''}</div></td>
                    <td><div class="hl-ovwrap"><input class="cell-input" value="${escapeHtml(_hlOvVal(ov.numero, numOrig))}" placeholder="${escapeHtml(numOrig || '+56 9…')}" ${presente ? '' : 'disabled'} ${accionHTML('pr.d', 'updateCrewOverride', sel, nm, 'numero', '§v§', { on: 'change' })}>${numEd ? `<button class="hl-revert" data-tip="Restablecer al valor de la Base de Datos${numOrig ? ' («' + escapeHtml(numOrig) + '»)' : ''}" ${accionHTML('pr.d', 'revertCrewOverride', sel, nm, 'numero')}>↺</button>` : ''}</div></td>
                    <td><input type="text" inputmode="numeric" class="cell-input time24" maxlength="5" value="${escapeHtml(ov.call || '')}" placeholder="${escapeHtml(ig.llamadoGeneral || 'HH:MM')}" ${presente ? '' : 'disabled'} ${accionHTML('pr.ovCall', sel, nm, { on: 'change' })}></td>
                    <td><select class="cell-select" ${presente ? '' : 'disabled'} ${accionHTML('pr.d', 'updateCrewOverride', sel, nm, 'locacionId', '§v§', { on: 'change' })}>${locacionOptions(project, ov.locacionId)}</select></td>
                    <td><input class="cell-input" value="${escapeHtml(ov.notas || '')}" placeholder="—" ${presente ? '' : 'disabled'} ${accionHTML('pr.d', 'updateCrewOverride', sel, nm, 'notas', '§v§', { on: 'change' })}></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="hl-auto-note">El crew viene de <strong>Presupuesto</strong> (confirmados) y por defecto queda citado a todos los días. Desmarca <em>Citar</em> para sacar a alguien de este día específico. El <em>Call</em> vacío usa el llamado general por defecto.</div>
        `}
      </div>

      <!-- CITACIONES EXTERNAS (manual) -->
      <div class="hl-block">
        <div class="hl-block-title">Citaciones · Externas
          <button class="hl-add-inline" ${accionHTML('pr.d', 'addCitacionExterna', sel)}>+ Agregar persona externa</button>
        </div>
        ${dia.citacionesExternas.length === 0 ? `
          <div class="hl-empty">Personas fuera del crew contratado: cliente, agencia, visitas, invitados. Se ingresan a mano (no afectan el Presupuesto).</div>
        ` : `
          <div style="overflow-x: auto;">
            <table class="data-table hl-cit-table budget-table" data-bsec-table="hlExt" style="width:${_hlExtW}px;">
              <thead>
                <tr><th style="width:26px;"></th>${_budgetColTh('hlExt', 'hl_rol', '', 'Cargo / Rol')}${_budgetColTh('hlExt', 'hl_nombre', '', 'Nombre')}${_budgetColTh('hlExt', 'hl_numero', '', 'Número')}${_budgetColTh('hlExt', 'hl_call', '', 'Call <span class="th-24h">24h</span>')}${_budgetColTh('hlExt', 'hl_loc', '', 'Locación')}${_budgetColTh('hlExt', 'hl_notas', '', 'Notas')}<th style="width:40px;"></th></tr>
              </thead>
              <tbody>
                ${dia.citacionesExternas.map((e, idx) => `
                  <tr ondragover="hlDragOver(event)" ondragleave="hlDragLeave(event)" ondrop="hlDrop(event,'ext',${idx})">
                    <td class="hl-drag-cell"><button class="hl-drag" draggable="true" ondragstart="hlDragStart(event,'ext',${idx})" ondragend="hlDragEnd(event)" title="Arrastrar para reordenar">⠿</button></td>
                    <td><input class="cell-input" value="${escapeHtml(e.rol || '')}" placeholder="Cargo / Rol" ${accionHTML('pr.d', 'updateCitExterna', sel, idx, 'rol', '§v§', { on: 'change' })}></td>
                    <td><input class="cell-input" value="${escapeHtml(e.nombre || '')}" placeholder="Nombre" ${accionHTML('pr.d', 'updateCitExterna', sel, idx, 'nombre', '§v§', { on: 'change' })}></td>
                    <td><input class="cell-input" value="${escapeHtml(e.numero || '')}" placeholder="+56 9…" ${accionHTML('pr.d', 'updateCitExterna', sel, idx, 'numero', '§v§', { on: 'change' })}></td>
                    <td><input type="text" inputmode="numeric" class="cell-input time24" maxlength="5" value="${escapeHtml(e.call || '')}" placeholder="HH:MM" ${accionHTML('pr.citCall', sel, idx, { on: 'change' })}></td>
                    <td><select class="cell-select" ${accionHTML('pr.d', 'updateCitExterna', sel, idx, 'locacionId', '§v§', { on: 'change' })}>${locacionOptions(project, e.locacionId)}</select></td>
                    <td><input class="cell-input" value="${escapeHtml(e.notas || '')}" placeholder="—" ${accionHTML('pr.d', 'updateCitExterna', sel, idx, 'notas', '§v§', { on: 'change' })}></td>
                    <td><button class="row-delete" title="Eliminar" ${accionHTML('pr.d', 'deleteCitExterna', sel, idx)}>×</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </div>

    <div class="text-faint mt-4" style="font-size: 11px;">
      La Hoja de Llamado es una <strong>vista operativa</strong>, no una fuente de datos. Corrige cliente, equipo o fechas en sus módulos de origen; aquí solo se ingresa lo propio del día (horarios, locaciones, citaciones).
    </div>
  `;
}

function selectHojaDia(diaId) {
  STATE.ui.hojaDiaSel = diaId;
  renderHojaLlamado();
}

function updateHojaInfoGeneral(diaId, field, value) {
  ensureHojaDia(diaId).infoGeneral[field] = value;
}

function updateCrewOverride(diaId, nombre, field, value) {
  const dia = ensureHojaDia(diaId);
  if (!dia.crewOverrides[nombre]) dia.crewOverrides[nombre] = { call: '', locacionId: '', notas: '' };
  dia.crewOverrides[nombre][field] = value;
  // V11.25: los campos con indicador (pelota + ↺) se re-renderizan para mostrarlo/ocultarlo al instante
  if (field === 'rol' || field === 'numero' || field === 'nombre') renderHojaLlamado();
}

/* V11.25 (Pasada 7) · Hoja de Llamado: override de campos del crew (Rol/Número)
   y reordenar filas de citaciones. */
/* Valor efectivo: el override no vacío manda; si no, el valor de origen (Presupuesto/BD). */
function _hlOvVal(ovVal, origen) { return (ovVal != null && String(ovVal) !== '') ? ovVal : (origen || ''); }
function revertCrewOverride(diaId, nombre, field) {
  const dia = ensureHojaDia(diaId);
  if (dia.crewOverrides[nombre]) delete dia.crewOverrides[nombre][field];
  // El ↺ desaparece al re-renderizar y no llega a disparar su mouseout: ocultamos
  // el tooltip a mano para que no quede pegado.
  if (typeof hideTooltip === 'function') hideTooltip();
  renderHojaLlamado();
}
/* Crew ordenado según dia.crewOrden; los nuevos (no listados aún) van al final. */
function getCrewOrdenado(project, dia) {
  const crew = getConfirmedCrew(project);
  const orden = Array.isArray(dia.crewOrden) ? dia.crewOrden : [];
  const byName = {}; crew.forEach(c => { byName[c.nombre] = c; });
  const out = [];
  orden.forEach(n => { if (byName[n]) { out.push(byName[n]); delete byName[n]; } });
  crew.forEach(c => { if (byName[c.nombre]) out.push(c); });
  return out;
}
function hlMoverCrew(diaId, from, to) {
  const project = STATE.currentProject; const dia = ensureHojaDia(diaId);
  const nombres = getCrewOrdenado(project, dia).map(c => c.nombre);
  if (from < 0 || from >= nombres.length || to < 0 || to >= nombres.length || from === to) return;
  const moved = nombres.splice(from, 1)[0];
  nombres.splice(to, 0, moved);
  dia.crewOrden = nombres;
  renderHojaLlamado();
}
function hlMoverExterna(diaId, from, to) {
  const arr = ensureHojaDia(diaId).citacionesExternas;
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return;
  const moved = arr.splice(from, 1)[0];
  arr.splice(to, 0, moved);
  renderHojaLlamado();
}
function hlDragStart(ev, tabla, idx) { HL_DRAG = { tabla: tabla, idx: idx }; try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(idx)); } catch (e) {} try { const tr = ev.currentTarget.closest('tr'); if (tr) tr.classList.add('hl-dragging'); } catch (e) {} }
function hlDragEnd(ev) { HL_DRAG = null; try { document.querySelectorAll('.hl-drag-over,.hl-dragging').forEach(el => el.classList.remove('hl-drag-over', 'hl-dragging')); } catch (e) {} }
function hlDragOver(ev) { if (!HL_DRAG) return; ev.preventDefault(); const tr = ev.currentTarget; if (tr && tr.classList) tr.classList.add('hl-drag-over'); }
function hlDragLeave(ev) { const tr = ev.currentTarget; if (tr && tr.classList) tr.classList.remove('hl-drag-over'); }
function hlDrop(ev, tabla, idx) {
  ev.preventDefault();
  const d = HL_DRAG; HL_DRAG = null;
  try { document.querySelectorAll('.hl-drag-over,.hl-dragging').forEach(el => el.classList.remove('hl-drag-over', 'hl-dragging')); } catch (e) {}
  if (!d || d.tabla !== tabla || d.idx === idx) return;
  const diaId = STATE.ui.hojaDiaSel;
  if (tabla === 'crew') hlMoverCrew(diaId, d.idx, idx);
  else if (tabla === 'ext') hlMoverExterna(diaId, d.idx, idx);
}

/* V5.4: asignación de crew por día. Por defecto TODO el crew confirmado
   queda citado a TODOS los días (presencia total). El usuario solo
   desmarca a quien no corresponde en un día puntual. `presente` se
   guarda en el override del día; ausencia de valor = presente (true). */
function isCrewPresente(dia, nombre) {
  const ov = dia.crewOverrides[nombre];
  return !ov || ov.presente !== false;
}
function toggleCrewPresente(diaId, nombre, checked) {
  const dia = ensureHojaDia(diaId);
  if (!dia.crewOverrides[nombre]) dia.crewOverrides[nombre] = { call: '', locacionId: '', notas: '' };
  dia.crewOverrides[nombre].presente = checked;
  renderHojaLlamado();
}

function addCitacionExterna(diaId) {
  ensureHojaDia(diaId).citacionesExternas.push({ rol: '', nombre: '', numero: '', call: '', locacionId: '', notas: '' });
  renderHojaLlamado();
}

function updateCitExterna(diaId, idx, field, value) {
  ensureHojaDia(diaId).citacionesExternas[idx][field] = value;
}

function deleteCitExterna(diaId, idx) {
  ensureHojaDia(diaId).citacionesExternas.splice(idx, 1);
  renderHojaLlamado();
}




/* V5.3.1 (Notas 3+4): exportar a PDF AVANZA la versión automáticamente
   (obligatorio, sin bypass) y registra el timestamp del momento exacto
   de exportación, no de la última edición. Versionado y timestamp son
   por día. El stub del PDF queda como punto de entrada para Fase 2.
   Ya NO existe botón manual de "nueva versión": la versión solo avanza
   al exportar, de modo que el número de versión = export oficial. */
/* V5.7 (Nota 7): exportación REAL a PDF, opción A — window.print() sobre un
   iframe aislado con hoja de estilo de impresión. El usuario elige "Guardar
   como PDF" en el diálogo del navegador. Cero dependencias, funciona offline.
   Mantiene el versionado automático por día (V5.3.1): exportar AVANZA la
   versión y sella el timestamp. Solo se incluyen las personas CITADAS. */

function resolveLocName(project, locacionId) {
  // V8.2: resuelve contra las locaciones CONFIRMADAS del proyecto (BD_LOC).
  ensureProjectLoc(project);
  const confs = projLocConfirmadas(project);
  if (!confs.length) return 'Llamado General';
  const ids = confs.map(u => u.locId);
  const eff = (locacionId && ids.indexOf(locacionId) !== -1) ? locacionId : ids[0];
  const l = bdLocFind(eff);
  return l ? `${eff} · ${l.nombre || 'sin nombre'}` : (locacionId || '—');
}

function buildHojaLlamadoPrintHTML(project, sel, margenMm) {
  const mar = (typeof margenMm === 'number' && margenMm >= 4 && margenMm <= 40) ? margenMm : 13;
  const ip = project.data.infoProyecto;
  const hl = project.data.hojaLlamado;
  const rodaje = project.data.rodajes.find(r => r.diaId === sel) || { diaId: sel };
  const dia = ensureHojaDia(sel);
  const ig = dia.infoGeneral || {};
  const e = escapeHtml;
  const verLabel = dia.version > 0 ? `V.${dia.version}` : 'Borrador';
  const stamp = dia.lastExport ? dia.lastExport.at : '';
  const fecha = rodaje.fecha ? fmtFechaLarga(rodaje.fecha) : '';

  const igRow = (label, val) => val ? `<div class="ig"><span class="k">${e(label)}</span><span class="v">${e(val)}</span></div>` : '';

  // V8.1.1 (#3): los campos vacíos NO aparecen (sin "No aplica", "N/A" ni "—").
  // Si un bloque completo queda sin datos, se oculta junto a su encabezado.
  const infoGeneralRows = [
    igRow('Cliente', ip.cliente),
    igRow('Agencia', ip.agencia),
    igRow('Productora', ip.productora),
    igRow('Productor(a) Ejecutivo(a)', ip.productorEjecutivo),
    igRow('Director(a)', ip.director),
    igRow('Jefe de Producción', ip.jefeProduccion),
    igRow('Contacto Cliente', ip.contactoCliente),
    igRow('Contacto Agencia', ip.contactoAgencia)
  ].join('');
  const horariosRows = [
    igRow('Llamado general', ig.llamadoGeneral),
    igRow('Almuerzo', ig.almuerzo),
    igRow('Amanecer', ig.amanecer),
    igRow('Atardecer', ig.atardecer),
    igRow('Wrap cámara', ig.wrapCamara),
    igRow('Wrap locación', ig.wrapLocacion),
    igRow('Hospital cercano', ig.hospital),
    igRow('Clima', ig.clima)
  ].join('');

  // Crew: solo citados
  const crew = getCrewOrdenado(project, dia).filter(c => isCrewPresente(dia, c.nombre));
  const crewRows = crew.map(c => {
    const ov = dia.crewOverrides[c.nombre] || {};
    const bd = BD_PERSONAS[c.nombre] || null;
    return `<tr>
      <td>${e(_hlOvVal(ov.rol, c.rol) || '—')}</td>
      <td><strong>${e(_hlOvVal(ov.nombre, c.nombre))}</strong></td>
      <td>${e(_hlOvVal(ov.numero, bd?.telefono) || '—')}</td>
      <td class="ctr">${e(ov.call || ig.llamadoGeneral || '—')}</td>
      <td>${e(resolveLocName(project, ov.locacionId))}</td>
      <td>${e(ov.notas || '')}</td>
    </tr>`;
  }).join('');

  const extCitadas = (dia.citacionesExternas || []).filter(x => ((x.nombre||'').trim() !== '') || ((x.rol||'').trim() !== ''));
  const extRows = extCitadas.map(x => `<tr>
      <td>${e(x.rol || '—')}</td>
      <td><strong>${e(x.nombre || '—')}</strong></td>
      <td>${e(x.numero || '—')}</td>
      <td class="ctr">${e(x.call || '—')}</td>
      <td>${e(resolveLocName(project, x.locacionId))}</td>
      <td>${e(x.notas || '')}</td>
    </tr>`).join('');

  const mapsHref = (l) => l.maps && l.maps.trim()
    ? l.maps.trim()
    : (l.direccion ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(l.direccion) : '');
  // V8.2: las locaciones del PDF salen de las CONFIRMADAS del proyecto (BD_LOC).
  ensureProjectLoc(project);
  const _printLocs = projLocConfirmadas(project).map(u => Object.assign({ _proy: u }, bdLocFind(u.locId) || {}));
  const locRows = _printLocs.map(l => `<tr>
      <td><strong>${e(l.locId)}</strong></td>
      <td>${e(l.nombre || '—')}</td>
      <td>${l.direccion ? `<a href="${safeUrl(mapsHref(l))}" class="maplink">${e([l.direccion, l.comuna].filter(Boolean).join(', '))}</a>` : '—'}</td>
      <td>${e(((l._proy && l._proy.notasProy) || l.notas || ''))}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>CALL SHEET · ${e(ip.nombreProyecto || project.name || '')} · ${e(rodaje.diaId)} · ${e(verLabel)}</title>
  <style>
    @page { size: A4; margin: ${mar}mm; }
    @media screen { body { padding: ${mar}mm; } }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #222221; margin: 0; font-size: 11px; line-height: 1.4; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; background: #222221; color: #FDFEED; padding: 14px 16px; border-radius: 6px; }
    .head .title { font-size: 20px; font-weight: 800; letter-spacing: .04em; }
    .head .sub { font-size: 12px; margin-top: 3px; opacity: .9; }
    .head .desc { font-size: 11px; margin-top: 2px; opacity: .7; }
    .head .ver { text-align: right; }
    .head .ver .badge { display: inline-block; background: #B03A2F; color: #fff; font-weight: 700; padding: 3px 9px; border-radius: 4px; font-size: 12px; }
    .head .ver .stamp { font-size: 10px; opacity: .8; margin-top: 4px; }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #B03A2F; border-bottom: 1.5px solid #222221; padding-bottom: 3px; margin: 18px 0 8px; }
    .info { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
    .ig { display: flex; justify-content: space-between; border-bottom: 1px dotted #c9c9c2; padding: 2px 0; }
    .ig .k { color: #6b6b66; }
    .ig .v { font-weight: 600; text-align: right; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { background: #ecede7; text-align: left; padding: 5px 7px; font-size: 9.5px; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1.5px solid #222221; }
    td { padding: 5px 7px; border-bottom: 1px solid #e2e2db; vertical-align: top; }
    .ctr { text-align: center; }
    .maplink { color: #1a56c4; text-decoration: underline; }
    tr { break-inside: avoid; }
    .foot { margin-top: 22px; padding-top: 8px; border-top: 1px solid #c9c9c2; font-size: 9.5px; color: #6b6b66; display: flex; justify-content: space-between; }
  </style></head>
  <body>
    <div class="head">
      <div>
        <div class="title">HOJA DE LLAMADO</div>
        <div class="sub">${e(ip.nombreProyecto || project.name || '')} · ${e(ip.cliente || '')}</div>
        <div class="sub">${e(rodaje.diaId)}${fecha ? ' · ' + e(fecha) : ''}</div>
        ${rodaje.descripcion ? `<div class="desc">${e(rodaje.descripcion)}</div>` : ''}
      </div>
      <div class="ver">
        <div class="badge">${e(verLabel)}</div>
        ${stamp ? `<div class="stamp">Exportada ${e(stamp)}</div>` : ''}
      </div>
    </div>

    ${infoGeneralRows ? `<h2>Información general</h2>
    <div class="info">${infoGeneralRows}</div>` : ''}

    ${horariosRows ? `<h2>Horarios y referencias del día</h2>
    <div class="info">${horariosRows}</div>` : ''}

    ${_printLocs.length ? `<h2>Locaciones</h2>
    <table><thead><tr><th style="width:60px;">ID</th><th>Nombre</th><th>Dirección</th><th>Notas</th></tr></thead>
    <tbody>${locRows}</tbody></table>` : ''}

    <h2>Citaciones · Crew citado (${crew.length})</h2>
    ${crew.length ? `<table><thead><tr><th>Cargo / Rol</th><th>Nombre</th><th>Número</th><th class="ctr" style="width:60px;">Call</th><th>Locación</th><th>Notas</th></tr></thead>
    <tbody>${crewRows}</tbody></table>` : '<div style="color:#6b6b66;">Sin crew citado para este día.</div>'}

    ${extCitadas.length ? `<h2>Citaciones · Externas</h2>
    <table><thead><tr><th>Cargo / Rol</th><th>Nombre</th><th>Número</th><th class="ctr" style="width:60px;">Call</th><th>Locación</th><th>Notas</th></tr></thead>
    <tbody>${extRows}</tbody></table>` : ''}

    <div class="foot">
      <span>${e(orgNombre())}${orgNombre() ? ' · ' : ''}Documento operativo del día de rodaje</span>
      <span>${e(verLabel)}${stamp ? ' · ' + e(stamp) : ''}</span>
    </div>
  </body></html>`;
}

export function printViaIframe(html, docTitle) {
  const old = document.getElementById('printFrame');
  if (old) old.remove();
  const frame = document.createElement('iframe');
  frame.id = 'printFrame';
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  // V5.10 (Nota 2): el navegador usa el título de la PÁGINA para el nombre por
  // defecto del PDF. Cambiamos temporalmente document.title y lo restauramos.
  const prevTitle = document.title;
  const restore = () => { document.title = prevTitle; };
  if (docTitle) document.title = docTitle;
  try { frame.contentWindow.onafterprint = restore; } catch (e) {}
  setTimeout(() => {
    if (docTitle) document.title = docTitle;  // V5.11 (Nota 2): re-asegurar justo antes de imprimir, por si algo pisó el título en los 300ms previos
    try { frame.contentWindow.focus(); frame.contentWindow.print(); }
    catch (e) { showToast({ kind: 'error', title: 'No se pudo abrir la impresión', body: 'Tu navegador bloqueó la ventana de impresión.' }); }
    setTimeout(restore, 1500);
  }, 300);
}

/* ─── V8.1 (#1): VERSIONADO DE HOJA DE LLAMADO POR CAMBIO REAL ───────
   La versión de un día solo avanza cuando cambió algo que el documento
   refleja: datos del día (info general, citaciones, overrides de crew),
   locaciones del proyecto, el crew confirmado (que sale del Presupuesto y
   la BD) o los datos de proyecto/rodaje. Si no cambió nada, re-exportar
   mantiene la versión (no se inflan versiones por reimprimir lo mismo). */
function _hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h |= 0; }
  return (h >>> 0).toString(36);
}
function _callSheetSignature(project, diaId) {
  const d = project.data;
  ensureProjectLoc(project);   // V8.2: garantizar migración antes de firmar
  const hl = d.hojaLlamado || {};
  const dia = (hl.dias && hl.dias[diaId]) || {};
  const ip = d.infoProyecto || {};
  const rodaje = (d.rodajes || []).find(r => r.diaId === diaId) || null;
  const sig = {
    diaId: diaId,
    infoGeneral: dia.infoGeneral || null,
    citacionesExternas: dia.citacionesExternas || [],
    crewOverrides: dia.crewOverrides || {},
    crewOrden: dia.crewOrden || [],
    // V8.2: la firma usa las locaciones CONFIRMADAS del proyecto (BD_LOC + uso),
    // para que un cambio de locación siga avanzando la versión tras la migración.
    locaciones: projLocConfirmadas(project).map(u => { const l = bdLocFind(u.locId) || {}; return { locId: u.locId, nombre: l.nombre, direccion: l.direccion, comuna: l.comuna, maps: l.maps, costo: u.costo, contratacion: u.contratacion, notasProy: u.notasProy }; }),
    crew: gancho('getCrewForExport')(project),   // captura cambios de Crew, Presupuesto y BD
    rodaje: rodaje ? { fecha: rodaje.fecha, descripcion: rodaje.descripcion, activo: rodaje.activo } : null,
    ip: {
      cliente: ip.cliente, agencia: ip.agencia, nombreProyecto: ip.nombreProyecto, productora: ip.productora,
      contactoCliente: ip.contactoCliente, mailContactoCliente: ip.mailContactoCliente, telefonoContactoCliente: ip.telefonoContactoCliente,
      contactoAgencia: ip.contactoAgencia, mailContactoAgencia: ip.mailContactoAgencia, telefonoContactoAgencia: ip.telefonoContactoAgencia,
      productorEjecutivo: ip.productorEjecutivo, director: ip.director, jefeProduccion: ip.jefeProduccion
    }
  };
  return _hashStr(JSON.stringify(sig));
}

/* V11.25 (Pasada 7): previsualizador de la Hoja de Llamado. Reutiliza el motor
   CotPreview y el shell de cotPreviewPDF, alimentado por el MISMO
   buildHojaLlamadoPrintHTML de siempre (el PDF NO cambia). Exportar desde el modal
   llama al export real (exportHojaLlamadoPDF): valida, avanza la versión y usa
   printViaIframe, exactamente como hasta hoy. */
function hojaPreviewPDF() {
  const project = STATE.currentProject; if (!project) return;
  const sel = STATE.ui.hojaDiaSel; if (!sel) return;
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal" style="max-width:1000px;width:96vw;padding:0;overflow:hidden;">
    <div class="modal-header" style="padding:13px 18px;"><div class="modal-title">Previsualizar y exportar · Hoja de Llamado</div></div>
    <div style="display:flex;min-height:60vh;max-height:74vh;">
      <div style="flex:1;display:flex;flex-direction:column;min-width:0;background:#2a2a27;">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--bg-surface,#222);border-bottom:1px solid var(--rule,#34342f);flex-wrap:wrap;">
          <button class="btn btn-sm" data-accion="pr.zoom" data-args="[-10]" title="Alejar">−</button>
          <span id="cotPrevZoom" style="font-size:12px;color:var(--ink-secondary,#d3d6cb);min-width:44px;text-align:center;font-variant-numeric:tabular-nums;">100%</span>
          <button class="btn btn-sm" data-accion="pr.zoom" data-args="[10]" title="Acercar">+</button>
          <span style="width:1px;height:18px;background:var(--rule,#34342f);margin:0 3px;"></span>
          <button class="btn btn-sm" id="cotPrevFitPage" data-accion="pr.modo" data-args="[&quot;page&quot;]">Ajustar</button>
          <button class="btn btn-sm" id="cotPrevFitWidth" data-accion="pr.modo" data-args="[&quot;width&quot;]">Ancho</button>
          <span style="font-size:10.5px;color:var(--ink-faint,#71736a);margin-left:auto;">Pellizca el trackpad o Ctrl/⌘ + rueda para zoom</span>
        </div>
        <div id="cotPrevCanvas" style="flex:1;overflow:auto;background:#2a2a27;padding:24px;">
          <div id="cotPrevWrap" style="margin:0 auto;position:relative;"><iframe id="cotPrevFrame" title="preview" style="position:absolute;top:0;left:0;border:0;transform-origin:top left;background:#fff;"></iframe></div>
        </div>
      </div>
      <div id="hlPrevPanel" style="width:266px;flex-shrink:0;border-left:1px solid var(--rule,#34342f);overflow-y:auto;background:var(--bg-surface,#222);">${_hlPrevPanelHTML()}</div>
    </div>
    <div class="modal-footer" style="padding:12px 18px;justify-content:flex-end;gap:8px;"><button class="btn" data-accion="pr.d" data-args="[&quot;closeModal&quot;]">Cerrar</button><button class="btn btn-primary" data-accion="pr.d" data-args="[&quot;hojaPreviewGenerar&quot;]">Exportar PDF</button></div>
  </div></div>`;
  CotPreview.init(document.getElementById('cotPrevCanvas'), document.getElementById('cotPrevWrap'), document.getElementById('cotPrevFrame'));
  CotPreview.load(buildHojaLlamadoPrintHTML(project, sel, _hlPrevMargen), 794, 1123);
  CotPreview.setMode('page');
}
/* Panel lateral del preview de la Hoja de Llamado. Por ahora solo Márgenes está
   activo; el resto queda como placeholder para ir poblándolo (ver nota
   previsualizador-pdf-universal-pendiente). */
function _hlPrevPanelHTML() {
  const grp = (title, inner, hint) => `<div style="padding:14px 16px;border-bottom:1px solid var(--rule,#34342f);"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-faint,#71736a);font-weight:700;margin:0 0 10px;">${title}</div>${inner}${hint ? '<div style="font-size:10.5px;color:var(--ink-faint,#71736a);margin-top:8px;line-height:1.4;">' + hint + '</div>' : ''}</div>`;
  const marg = `<div style="display:flex;align-items:center;gap:10px;"><input type="range" min="6" max="30" value="${_hlPrevMargen}" data-accion="pr.margen" data-on="input" style="flex:1;accent-color:var(--accent,#B03A2F);"><span id="hlPrevMargLbl" style="font-size:11.5px;color:var(--ink-secondary,#d3d6cb);min-width:44px;text-align:right;">${_hlPrevMargen} mm</span></div>`;
  const soon = '<div style="font-size:11px;color:var(--ink-faint,#71736a);line-height:1.5;">Próximamente. Por ahora se toma del estilo estándar del documento.</div>';
  return grp('Márgenes', marg, 'Cambia el margen del documento; se refleja en el preview y en el PDF.')
    + grp('Color de énfasis', soon)
    + grp('Tipografía', soon)
    + grp('Logo', soon);
}
function hlPrevSetMargen(mm) {
  _hlPrevMargen = mm;
  const lbl = document.getElementById('hlPrevMargLbl'); if (lbl) lbl.textContent = mm + ' mm';
  const project = STATE.currentProject; const sel = STATE.ui.hojaDiaSel;
  if (project && sel) CotPreview.load(buildHojaLlamadoPrintHTML(project, sel, mm), 794, 1123);
}
function hojaPreviewGenerar() { closeModal(); exportHojaLlamadoPDF(); }

function exportHojaLlamadoPDF() {
  // V8.2 (#1): advertencia NO bloqueante si faltan datos clave (mismo patrón
  // visual que el Plan de Rodaje). Solo advierte; nunca impide exportar.
  const sel = STATE.ui.hojaDiaSel;
  const project = STATE.currentProject;
  const ip = project.data.infoProyecto || {};
  const dia = ensureHojaDia(sel);
  const ig = dia.infoGeneral || {};
  const v = x => (x == null ? '' : String(x)).trim();
  const faltan = [];
  if (!v(ip.productorEjecutivo)) faltan.push('Productor Ejecutivo (PE)');
  if (!v(ip.director)) faltan.push('Director');
  if (!v(ip.jefeProduccion)) faltan.push('Jefe de Producción');
  if (!v(ip.cliente)) faltan.push('Cliente');
  if (!v(ip.productora)) faltan.push('Productora');
  if (!v(ig.llamadoGeneral)) faltan.push('Llamado General');
  if (!v(ig.hospital)) faltan.push('Hospital Cercano');
  if (faltan.length) { _hlExportConfirm(faltan); return; }
  _hlDoExportPDF();
}
function _hlExportConfirm(faltan) {
  const items = faltan.map(f => `<li style="margin:4px 0;"><strong>${escapeHtml(f)}</strong></li>`).join('');
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-accion="ui.backdrop"><div class="modal" style="max-width:470px;"><div class="modal-header"><div class="modal-title">Faltan datos de la Hoja de Llamado</div></div><div class="modal-body"><p style="margin:0 0 10px;">Antes de exportar conviene completar:</p><ul style="margin:0 0 6px 18px;padding:0;">${items}</ul><p style="margin:10px 0 0;color:var(--ink-faint);font-size:12.5px;">Puedes corregirlos primero o exportar igual (no es obligatorio).</p></div><div class="modal-footer"><button class="btn" data-accion="pr.d" data-args="[&quot;closeModal&quot;]">Corregir</button><button class="btn btn-primary" data-accion="pr.exportIgual" data-args="[&quot;hl&quot;]">Exportar de todas formas</button></div></div></div>`;
}
function _hlDoExportPDF() {
  const sel = STATE.ui.hojaDiaSel;
  const project = STATE.currentProject;
  const dia = ensureHojaDia(sel);

  // V8.1 (#1): solo avanza la versión si el contenido del documento cambió
  // respecto a la última exportación (o si nunca se ha exportado).
  const newSig = _callSheetSignature(project, sel);
  const changed = (dia.exportHash !== newSig) || !((dia.version || 0) > 0);
  if (changed) {
    dia.version = (dia.version || 0) + 1;
    dia.exportHash = newSig;
  }

  const stamp = new Date().toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  dia.lastExport = { version: dia.version, at: stamp };
  renderHojaLlamado();
  markDirty();

  const html = buildHojaLlamadoPrintHTML(project, sel, _hlPrevMargen);
  const ip = project.data.infoProyecto;
  const rodaje = project.data.rodajes.find(r => r.diaId === sel) || { diaId: sel };
  const diaLabel = (rodaje.diaId || sel || '').replace('-', ' ');
  const fileName = `Call Sheet - ${ip.nombreProyecto || project.name || 'Proyecto'} - ${diaLabel} - V${dia.version}`;
  printViaIframe(html, fileName);

  showToast({
    kind: 'success',
    title: `Hoja de Llamado · V.${dia.version}`,
    body: changed
      ? `Se abrió el diálogo de impresión. Elige <strong>“Guardar como PDF”</strong> como destino. La versión avanzó a V.${dia.version} (sellada ${escapeHtml(stamp)}).`
      : `Se abrió el diálogo de impresión. <strong>Sin cambios</strong> desde la última versión: se mantiene en V.${dia.version}.`
  });
}


/* ════════════════════════════════════════════════════════════════════
   V7.11 · EXPORT PDF · PLAN DE RODAJE
   Día con FECHA. Filas (no texto) coloreadas, texto normal. Sin mayúsculas
   forzadas (refleja lo tipeado). Imágenes algo más grandes. Si faltan datos
   clave, un modal BLOQUEA: "Corregir" / "Exportar de todas formas".
   Orientación elegible. Reutiliza printViaIframe.
   ════════════════════════════════════════════════════════════════════ */
function _prPdfTimeCell(f, c, t) {
  if (c.key === 'inicio') {
    const cls = 'c-time' + (t.collision ? ' c-col' : (t.gap > 0 ? ' c-gap' : ''));
    return `<td class="${cls}">${t.inicio != null ? prFmtClock(t.inicio) : '—'}</td>`;
  }
  if (c.key === 'dur') return `<td class="c-time">${f.dur ? escapeHtml(f.dur) : '—'}</td>`;
  return `<td class="c-time">${t.termino != null ? prFmtClock(t.termino) : '—'}</td>`;
}
function _prPdfContentCell(f, c) {
  const imgKey = 'img_' + c.key;
  const imgs = (Array.isArray(f[imgKey]) ? f[imgKey] : []).map(s => `<img src="${safeUrl(s)}">`).join('');
  const txt = escapeHtml(f[c.key] || '');
  return `<td class="cc-${c.key}">${txt ? ('<div>' + txt.replace(/\n/g, '<br>') + '</div>') : ''}${imgs ? ('<div class="c-imgs">' + imgs + '</div>') : ''}</td>`;
}
function _prPdfRow(f, cols, t) {
  const ncols = cols.length;
  if (f.tipo === 'seccion') return `<tr class="r-sec"><td colspan="${ncols}">${escapeHtml(f.accion || '') || '—'}</td></tr>`;
  if (f.tipo === 'marcador') return `<tr class="r-mark"><td class="c-time c-mark-time">${t.inicio != null ? prFmtClock(t.inicio) : '—'}</td><td colspan="${ncols - 1}">${escapeHtml(f.accion || '')}</td></tr>`;
  const banda = (f.tipo === 'situacion' || f.paralelo);
  const contentCount = cols.filter(c => c.role === 'content').length;
  const parts = []; let bandDone = false;
  cols.forEach(c => {
    if (c.role === 'time') { parts.push(_prPdfTimeCell(f, c, t)); return; }
    if (c.role === 'check') { parts.push('<td class="c-chk">☐</td>'); return; }
    if (banda) { if (!bandDone) { const tag = f.paralelo ? '<span class="tagp">EN PARALELO</span> ' : ''; parts.push(`<td colspan="${contentCount}" class="c-band${f.paralelo ? ' c-bandp' : ''}">${tag}${escapeHtml(f.accion || '').replace(/\n/g, '<br>')}</td>`); bandDone = true; } return; }
    parts.push(_prPdfContentCell(f, c));
  });
  return `<tr class="${f.paralelo ? 'r-paral' : (f.tipo === 'situacion' ? 'r-sit' : 'r-plano')}">${parts.join('')}</tr>`;
}
function buildPlanRodajePrintHTML(project, diaId) {
  const e = escapeHtml; const EP = EMPRESA_PERFIL || {};
  const ip = project.data.infoProyecto || {};
  const pr = ensurePlanRodaje(project);
  const orient = (pr.orientacion === 'vertical') ? 'portrait' : 'landscape';
  const dd = prEnsureDia(project, diaId);
  const u = prCurrentUnidad(); const plan = prCurrentPlan();
  const di = prDiaInfo(project, diaId);
  const hd = ((project.data.hojaLlamado || {}).dias || {})[diaId]; const ig = (hd && hd.infoGeneral) ? hd.infoGeneral : {};
  const cols = prActiveCols(project);
  const times = prComputeTimes(plan.filas, prEffectiveStartMin(project, diaId, plan));
  const span = prSpanDia(plan.filas, times);
  const head = `<tr>${cols.map(c => `<th>${c.key === 'dur' ? 'Dur.' : e(c.label)}</th>`).join('')}</tr>`;
  const body = plan.filas.map((f, i) => _prPdfRow(f, cols, times[i])).join('');
  const bancoRows = plan.banco.map(f => `<tr><td class="c-time">${e(f.escPlano || '')}</td><td>${e(f.accion || '').replace(/\n/g, '<br>')}</td><td>${e(f.ref || '').replace(/\n/g, '<br>')}${(Array.isArray(f.img_ref) ? f.img_ref : []).map(s => `<img src="${safeUrl(s)}" style="max-height:66px;max-width:108px;margin-left:3px;border:1px solid #ccc;border-radius:2px;">`).join('')}</td><td>${e(f.prod || '').replace(/\n/g, '<br>')}</td></tr>`).join('');
  const bancoTable = plan.banco.length ? `<h2>Banco de planos (si queda tiempo · fuera del horario)</h2><table class="banco"><thead><tr><th style="width:8%;">Cód.</th><th style="width:40%;">Acción</th><th style="width:36%;">Ref</th><th style="width:16%;">Nota</th></tr></thead><tbody>${bancoRows}</tbody></table>` : '';
  // Cabecera: solo campos con valor (los vacíos no se muestran). La FECHA va en "Día".
  const solStr = (real, util) => { const a = []; if (real && String(real).trim()) a.push(String(real).trim()); if (util && String(util).trim()) a.push('útil ' + String(util).trim()); return a.join(' · '); };
  const flds = [];
  const add = (k, v) => { if (v && String(v).trim()) flds.push([k, String(v).trim()]); };
  add('Cliente', ip.cliente); add('Proyecto', ip.nombreProyecto || project.name); add('Pieza / formato', ip.servicio);
  flds.push(['Unidad · Plan', (u.label || '') + ' · ' + (plan.label || '')]);
  const diaStr = 'Día ' + di.n + ' de ' + di.total + ' · ' + (di.r.fecha ? prFechaLarga(di.r.fecha) : ((di.r.diaId || '') + ' (sin fecha)'));
  flds.push(['Día', diaStr]);
  add('Llamado general', ig.llamadoGeneral); add('Locación / base', dd.header.locacion);
  add('Salida del sol', solStr(ig.amanecer, dd.header.solUtilAmanecer)); add('Puesta del sol', solStr(ig.atardecer, dd.header.solUtilAtardecer));
  add('Wrap cámara (est.)', ig.wrapCamara); add('Wrap locación (est.)', ig.wrapLocacion);
  const gridHTML = flds.map(([k, v]) => `<div><div class="k">${e(k)}</div><div class="v">${e(v)}</div></div>`).join('');
  const verLabel = 'V.' + (plan.version || 1);
  const stamp = plan.lastExport ? plan.lastExport.at : new Date().toLocaleString('es-CL');
  const resp = (dd.header.responsable || '').trim();
  const respC = (dd.header.responsableContacto || '').trim();
  const footLeft = resp ? ('Responsable del plan: ' + e(resp) + (respC ? (' · ' + e(respC)) : '')) : e(EP.nombreFicticio || '');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Plan de Rodaje</title>
  <style>
    @page { size: letter ${orient}; margin: 10mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: -apple-system,"Segoe UI",Roboto,Arial,sans-serif; color:#222221; margin:0; font-size:9px; line-height:1.35; }
    .ph-top { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #222221; padding-bottom:6px; }
    .ph-prod { font-size:14px; font-weight:800; letter-spacing:.02em; }
    .ph-title { font-size:18px; font-weight:800; letter-spacing:.06em; }
    .ph-ver { text-align:right; font-size:9.5px; color:#444; }
    .ph-ver b { font-size:11px; color:#222221; }
    .ph-grid { display:grid; grid-template-columns: repeat(${orient === 'portrait' ? 3 : 4},1fr); gap:5px 16px; margin:8px 0 2px; }
    .ph-grid .k { color:#6b6b66; text-transform:uppercase; font-size:7px; letter-spacing:.05em; }
    .ph-grid .v { font-weight:600; font-size:9.5px; }
    .ph-total { text-align:right; font-size:11px; font-weight:700; margin:2px 0 7px; color:#B03A2F; }
    h2 { font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:#B03A2F; border-bottom:1.5px solid #222221; padding-bottom:3px; margin:14px 0 6px; }
    table { width:100%; border-collapse:collapse; }
    th { background:#222221; color:#FDFEED; padding:4px 5px; font-size:7.5px; text-transform:uppercase; letter-spacing:.03em; text-align:center; }
    td { padding:3px 5px; border:1px solid #d5d5cf; vertical-align:middle; text-align:center; font-size:8.5px; }
    .cc-guion { text-align:left; vertical-align:top; }
    tr { break-inside:avoid; }
    .c-time { text-align:center; font-variant-numeric:tabular-nums; white-space:nowrap; font-weight:600; width:1%; }
    .c-col { background:#f3c9c4; color:#8a2018; font-weight:700; }
    .c-gap { background:#f6e3b8; color:#7a5a12; }
    .c-chk { text-align:center; width:1%; color:#999; }
    /* Filas (no texto) coloreadas. Texto en color normal. */
    .r-sec td { background:#e7d6d1; color:#222221; font-weight:800; text-align:center; font-size:11.5px; padding:6px; letter-spacing:.02em; }
    .r-mark td { background:#262626; color:#FDFEED; font-weight:800; text-align:center; font-size:11.5px; padding:6px; }
    .r-mark .c-mark-time { background:#262626; color:#FDFEED; font-size:10.5px; }
    .c-band { background:#d6e8d6; color:#222221; text-align:center; font-weight:700; font-size:11.5px; padding:6px; }
    .c-bandp { background:#d3e3ef; color:#222221; }
    .tagp { display:inline-block; font-weight:700; font-size:7.5px; background:#2f7b95; color:#fff; padding:1px 5px; border-radius:3px; vertical-align:middle; margin-right:5px; letter-spacing:.03em; }
    .c-imgs { display:flex; gap:4px; flex-wrap:wrap; margin-top:2px; justify-content:center; }
    .c-imgs img { max-height:76px; max-width:128px; border:1px solid #ccc; border-radius:2px; }
    .pfoot { margin-top:12px; padding-top:5px; border-top:1px solid #c9c9c2; font-size:7.5px; color:#6b6b66; display:flex; justify-content:space-between; }
  </style></head>
  <body>
    <div class="ph-top">
      <div class="ph-prod">${e(EP.nombreFicticio || '')}</div>
      <div class="ph-title">PLAN DE RODAJE</div>
      <div class="ph-ver"><b>${e(verLabel)}</b><br>${e(stamp)}</div>
    </div>
    <div class="ph-grid">${gridHTML}</div>
    <div class="ph-total">Total rodaje: ${span != null ? prFmtDur(span) : '—'}</div>
    <table><thead>${head}</thead><tbody>${body || `<tr><td colspan="${cols.length}" style="text-align:center;color:#999;padding:14px;">Plan sin filas.</td></tr>`}</tbody></table>
    ${bancoTable}
    <div class="pfoot"><span>${footLeft}</span><span>Generado ${e(new Date().toLocaleString('es-CL'))} · TakeOS</span></div>
  </body></html>`;
}
function exportPlanRodajePDF() {
  const project = STATE.currentProject; if (!project || !STATE.prDiaSel) { showToast({ kind: 'warning', title: 'Sin día', body: 'Selecciona un día de rodaje antes de exportar.' }); return; }
  const plan = prCurrentPlan(); if (!plan) return;
  if (!plan.filas.length && !plan.banco.length) { showToast({ kind: 'warning', title: 'Plan vacío', body: 'Agrega al menos una fila antes de exportar el PDF.' }); return; }
  const dd = prEnsureDia(project, STATE.prDiaSel);
  const di = prDiaInfo(project, STATE.prDiaSel);
  const ig = (((project.data.hojaLlamado || {}).dias || {})[STATE.prDiaSel] || {}).infoGeneral || {};
  const faltan = [];
  if (!ig.llamadoGeneral && !plan.horaInicio) faltan.push('Hora de inicio (Llamado general en Hoja de Llamado, o "Inicio del plan")');
  if (!di.r.fecha) faltan.push('Fecha del día (en Rodajes)');
  if (!(dd.header.locacion || '').trim()) faltan.push('Locación / base');
  if (!(dd.header.responsable || '').trim()) faltan.push('Responsable del plan (AD)');
  if (faltan.length) { _prExportConfirm(faltan); return; }   // bloquea con modal
  _prDoExportPDF();
}
function _prExportConfirm(faltan) {
  const items = faltan.map(f => `<li style="margin:4px 0;"><strong>${escapeHtml(f)}</strong></li>`).join('');
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-accion="ui.backdrop"><div class="modal" style="max-width:470px;"><div class="modal-header"><div class="modal-title">Faltan datos del plan</div></div><div class="modal-body"><p style="margin:0 0 10px;">Antes de exportar conviene completar:</p><ul style="margin:0 0 6px 18px;padding:0;">${items}</ul><p style="margin:10px 0 0;color:var(--ink-faint);font-size:12.5px;">Puedes corregirlos primero o exportar igual (no es obligatorio).</p></div><div class="modal-footer"><button class="btn" data-accion="pr.d" data-args="[&quot;closeModal&quot;]">Corregir</button><button class="btn btn-primary" data-accion="pr.exportIgual" data-args="[&quot;pr&quot;]">Exportar de todas formas</button></div></div></div>`;
}
function _prDoExportPDF() {
  const project = STATE.currentProject; const plan = prCurrentPlan(); if (!project || !plan) return;
  const u = prCurrentUnidad();
  plan.version = (plan.version || 0) + 1;
  const stamp = new Date().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  plan.lastExport = { version: plan.version, at: stamp };
  markDirty(); renderPlanRodaje();
  const html = buildPlanRodajePrintHTML(project, STATE.prDiaSel);
  const ip = project.data.infoProyecto || {};
  const fileName = `Plan de Rodaje - ${ip.nombreProyecto || project.name || 'Proyecto'} - ${(STATE.prDiaSel || '').replace('-', ' ')} - ${u.label} ${plan.label} - V${plan.version}`;
  printViaIframe(html, fileName);
  showToast({ kind: 'success', title: `Plan de Rodaje · V.${plan.version}`, body: `Se abrió el diálogo de impresión. Elige <strong>“Guardar como PDF”</strong>. La versión avanzó a V.${plan.version} (sellada ${escapeHtml(stamp)}).` });
}
function prSetOrientacion(v) { const pr = ensurePlanRodaje(STATE.currentProject); pr.orientacion = (v === 'vertical') ? 'vertical' : 'horizontal'; markDirty(); }

// ── Window bridges Plan de Rodaje ──────────────────────────────────
window.renderPlanRodaje      = renderPlanRodaje;
window.exportPlanRodajePDF   = exportPlanRodajePDF;
window._prDoExportPDF        = _prDoExportPDF;
window.prSetOrientacion      = prSetOrientacion;
window.prSetDia              = prSetDia;
window.prSetUnidad           = prSetUnidad;
window.prSetPlan             = prSetPlan;
window.prAddUnidad           = prAddUnidad;
window.prAddPlan             = prAddPlan;
window.prRenameUnidad        = prRenameUnidad;
window.prDelUnidad           = prDelUnidad;
window.prRenamePlan          = prRenamePlan;
window.prDelPlan             = prDelPlan;
window.prOpenTraer           = prOpenTraer;
window.prTraerDe             = prTraerDe;
window.prSelectFila          = prSelectFila;
window.prAddFila             = prAddFila;
window.prDelFila             = prDelFila;
window.prMoveFila            = prMoveFila;
window.prSetFilaField        = prSetFilaField;
window.prSetDur              = prSetDur;
window.prToggleAnchor        = prToggleAnchor;
window.prSetAnchor           = prSetAnchor;
window.prToggleParalelo      = prToggleParalelo;
window.prSetHeader           = prSetHeader;
window.prSetResponsable      = prSetResponsable;
window.prSetHoraInicio       = prSetHoraInicio;
window.prAddBanco            = prAddBanco;
window.prDelBanco            = prDelBanco;
window.prDragStart           = prDragStart;
window.prDragEnd             = prDragEnd;
window.prDragOver            = prDragOver;
window.prDragLeave           = prDragLeave;
window.prDrop                = prDrop;
window.prImgDragOver         = prImgDragOver;
window.prImgDragLeave        = prImgDragLeave;
window.prDropImagen          = prDropImagen;
window.prAddImagen           = prAddImagen;
window.prDelImagen           = prDelImagen;
window.prOpenCols            = prOpenCols;
window.prToggleStruct        = prToggleStruct;
window.prSetColLabel         = prSetColLabel;
window.prSetColTipo          = prSetColTipo;
window.prToggleColOn         = prToggleColOn;
window.prMoveCol             = prMoveCol;
window.prDelColumna          = prDelColumna;
window.prAddColumna          = prAddColumna;
window.prResetCols           = prResetCols;
window.prNormalizeDur        = prNormalizeDur;   // locaciones.js lo llama como window.prNormalizeDur

// ── Window bridges Hoja de Llamado ─────────────────────────────────
window.renderHojaLlamado     = renderHojaLlamado;
window.selectHojaDia         = selectHojaDia;
window.updateHojaInfoGeneral = updateHojaInfoGeneral;
window.updateCrewOverride    = updateCrewOverride;
window.revertCrewOverride    = revertCrewOverride;
window.hlMoverCrew           = hlMoverCrew;
window.hlMoverExterna        = hlMoverExterna;
window.hlDragStart           = hlDragStart;
window.hlDragEnd             = hlDragEnd;
window.hlDragOver            = hlDragOver;
window.hlDragLeave           = hlDragLeave;
window.hlDrop                = hlDrop;
window.toggleCrewPresente    = toggleCrewPresente;
window.addCitacionExterna    = addCitacionExterna;
window.updateCitExterna      = updateCitExterna;
window.deleteCitExterna      = deleteCitExterna;
window.hojaPreviewPDF        = hojaPreviewPDF;
window.hojaPreviewGenerar    = hojaPreviewGenerar;
window.hlPrevSetMargen       = hlPrevSetMargen;
window.exportHojaLlamadoPDF  = exportHojaLlamadoPDF;
window.printViaIframe        = printViaIframe;   // legal.js lo llama como global

// ── Bridges agregados por auditoría 2-jul (consumidos por index.html u otros módulos sin bridge) ──
window._callSheetSignature = _callSheetSignature;
window._hashStr = _hashStr;
window.getConfirmedCrew = getConfirmedCrew;
window.prEffectiveStartMin = prEffectiveStartMin;

// ── Bridge auditoría pre-B (botón «Exportar de todas formas» del modal HL) ──

// D2 · despachador pr.d con centinelas de runtime (§v§=el.value, §c§=el.checked)
var _PR_FN = {
  addCitacionExterna: function () { return addCitacionExterna.apply(null, arguments); },
  closeModal: function () { return closeModal.apply(null, arguments); },
  deleteCitExterna: function () { return deleteCitExterna.apply(null, arguments); },
  exportPlanRodajePDF: function () { return exportPlanRodajePDF.apply(null, arguments); },
  hojaPreviewGenerar: function () { return hojaPreviewGenerar.apply(null, arguments); },
  hojaPreviewPDF: function () { return hojaPreviewPDF.apply(null, arguments); },
  navigateToModule: function () { return navigateToModule.apply(null, arguments); },
  ntfOpenFromHoja: function () { return ntfOpenFromHoja.apply(null, arguments); },
  prAddBanco: function () { return prAddBanco.apply(null, arguments); },
  prAddColumna: function () { return prAddColumna.apply(null, arguments); },
  prAddFila: function () { return prAddFila.apply(null, arguments); },
  prAddImagen: function () { return prAddImagen.apply(null, arguments); },
  prAddPlan: function () { return prAddPlan.apply(null, arguments); },
  prAddUnidad: function () { return prAddUnidad.apply(null, arguments); },
  prDelBanco: function () { return prDelBanco.apply(null, arguments); },
  prDelColumna: function () { return prDelColumna.apply(null, arguments); },
  prDelFila: function () { return prDelFila.apply(null, arguments); },
  prDelImagen: function () { return prDelImagen.apply(null, arguments); },
  prDelPlan: function () { return prDelPlan.apply(null, arguments); },
  prDelUnidad: function () { return prDelUnidad.apply(null, arguments); },
  prMoveCol: function () { return prMoveCol.apply(null, arguments); },
  prMoveFila: function () { return prMoveFila.apply(null, arguments); },
  prOpenCols: function () { return prOpenCols.apply(null, arguments); },
  prOpenTraer: function () { return prOpenTraer.apply(null, arguments); },
  prRenamePlan: function () { return prRenamePlan.apply(null, arguments); },
  prRenameUnidad: function () { return prRenameUnidad.apply(null, arguments); },
  prResetCols: function () { return prResetCols.apply(null, arguments); },
  prSelectFila: function () { return prSelectFila.apply(null, arguments); },
  prSetAnchor: function () { return prSetAnchor.apply(null, arguments); },
  prSetColLabel: function () { return prSetColLabel.apply(null, arguments); },
  prSetColTipo: function () { return prSetColTipo.apply(null, arguments); },
  prSetDia: function () { return prSetDia.apply(null, arguments); },
  prSetDur: function () { return prSetDur.apply(null, arguments); },
  prSetFilaField: function () { return prSetFilaField.apply(null, arguments); },
  prSetHeader: function () { return prSetHeader.apply(null, arguments); },
  prSetHoraInicio: function () { return prSetHoraInicio.apply(null, arguments); },
  prSetOrientacion: function () { return prSetOrientacion.apply(null, arguments); },
  prSetPlan: function () { return prSetPlan.apply(null, arguments); },
  prSetUnidad: function () { return prSetUnidad.apply(null, arguments); },
  prToggleAnchor: function () { return prToggleAnchor.apply(null, arguments); },
  prToggleColOn: function () { return prToggleColOn.apply(null, arguments); },
  prToggleParalelo: function () { return prToggleParalelo.apply(null, arguments); },
  prToggleStruct: function () { return prToggleStruct.apply(null, arguments); },
  prTraerDe: function () { return prTraerDe.apply(null, arguments); },
  revertCrewOverride: function () { return revertCrewOverride.apply(null, arguments); },
  selectHojaDia: function () { return selectHojaDia.apply(null, arguments); },
  toggleCrewPresente: function () { return toggleCrewPresente.apply(null, arguments); },
  updateCitExterna: function () { return updateCitExterna.apply(null, arguments); },
  updateCrewOverride: function () { return updateCrewOverride.apply(null, arguments); },
  updateHojaInfoGeneral: function () { return updateHojaInfoGeneral.apply(null, arguments); },
};
function _prSent(x, el, ev) { return x === '§v§' ? el.value : x === '§c§' ? el.checked : x === '§el§' ? el : x === '§ev§' ? ev : x; }
registrarAcciones('pr', {
  d: function (a, el, ev) { var f = _PR_FN[a[0]]; if (!f) { console.error('[pr] fn sin mapear:', a[0]); return; } f.apply(null, a.slice(1).map(function (x) { return _prSent(x, el, ev); })); },
  respCombo: function (a, el, ev) {
    if (ev.type === 'focus') comboboxOpen(el);
    else if (ev.type === 'input') { comboboxFilter(el); prSetHeader('responsable', el.value); }
    else if (ev.type === 'blur') comboboxCloseDelayed(el);
    else prSetResponsable(el.value);
  },
  hojaInfoT: function (a, el) { el.value = normalizeTime24(el.value); updateHojaInfoGeneral(a[0], a[1], el.value); },
  ovCall: function (a, el) { el.value = normalizeTime24(el.value); updateCrewOverride(a[0], a[1], 'call', el.value); },
  citCall: function (a, el) { el.value = normalizeTime24(el.value); updateCitExterna(a[0], a[1], 'call', el.value); },
  zoom: function (a) { CotPreview.setZoom(CotPreview.zoom + a[0]); },
  modo: function (a) { CotPreview.setMode(a[0]); },
  exportIgual: function (a) { closeModal(); if (a[0] === 'hl') _hlDoExportPDF(); else _prDoExportPDF(); },
  margen: function (a, el) { hlPrevSetMargen(+el.value); },
});

// D4b · ganchos definidos por este módulo (consumidos por módulos más tempranos)
define('prCompressImage', prCompressImage);
define('prComputeTimes', prComputeTimes);
define('prFmtClock', prFmtClock);
define('prFmtDur', prFmtDur);
define('prParseHM', prParseHM);
define('printViaIframe', printViaIframe);
define('renderHojaLlamado', renderHojaLlamado);
define('renderPlanRodaje', renderPlanRodaje);
