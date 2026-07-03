// Módulo Locaciones + Scouting — Etapa 2 de modularización Vite.
// Fichas de locaciones (repo + fotos + estados), plan de scouting y
// funciones de utilidad compartidas (bdLocFind, projLocList, etc.).
// D1d · imports reales. DIFERIDAS las aristas a plan-rodaje (pr*, printViaIframe
// quedan vía window): plan-rodaje importará locaciones — no cerrar el ciclo.
// VETADO: LOCATIONS_SOURCE (dal lo escribe). Hoists: bd 22→19, boot 24→19.
import { escapeHtml, safeUrl, showToast } from '../lib/helpers.js';
import { BD_LOC, BD_PERSONAS, STATE, ORG_ID, LOCATIONS_SOURCE } from '../lib/state.js';
import { ensureProjectLoc, normLocName } from '../lib/modelo.js';
import { LOC_ESTADOS, LOC_ORIENTACIONES } from '../lib/data.js';
import { normalizeTime24 } from '../lib/calc.js';
import { _locThumbAsync, closeModal, positionComboboxDropdown, regionSelectHTML, comboboxCloseDelayed, comboboxOpen, comboboxFilter, showModal } from '../lib/ui.js';
import { CotPreview } from './presupuesto-cotizacion.js';
import { openPersonaByName } from './bd.js';
import { _normKey } from './bd-excel.js';
import { _dalLocacionSaveSoon, dalGuardarLocacion } from './dal.js';
import { autosaveNow, markDirty } from './persistencia-local.js';
import { fmtFechaLarga } from './rodajes.js';
import { orgNombre } from '../lib/boot.js';

// LOC_ORIENTACIONES: ahora en lib/data.js (window) — dedup B3
// REGIONES_CHILE local eliminada (estaba muerta) — dedup B3

import { registrarAcciones, accionHTML } from '../lib/delegacion.js';
import { gancho, define, valor } from '../lib/ganchos.js';
import { sb } from '../lib/supabase.js';
export function bdLocFind(locId) { return BD_LOC.find(l => l.locId === locId) || null; }
export function projLocList(project) { const d = project && project.data; if (!d) return []; if (!Array.isArray(d.locaciones)) d.locaciones = []; return d.locaciones; }
function projLocFind(project, locId) { return projLocList(project).find(u => u.locId === locId) || null; }
export function nextLocIdBD() { let m = 0; BD_LOC.forEach(l => { const x = /LOC-(\d+)/.exec(l.locId || ''); if (x) m = Math.max(m, +x[1]); }); return 'LOC-' + String(m + 1).padStart(2, '0'); }
export function locNombre(locId) { const l = bdLocFind(locId); return l ? (l.nombre || 'sin nombre') : (locId || '—'); }
/* V8.3.1 — normaliza una locación de la BD al esquema nuevo (idempotente):
   migra `dueno` → `contactos[]`, agrega direccion2/region/orientacion. */
export function ensureLocShape(l) {
  if (!l) return l;
  if (l.direccion2 === undefined) l.direccion2 = '';
  if (l.region === undefined) l.region = '';
  if (l.orientacion === undefined) l.orientacion = '—';
  if (!Array.isArray(l.contactos)) {
    const d = l.dueno || {};
    l.contactos = (d.nombre || d.mail || d.tel) ? [{ nombre: d.nombre || '', mail: d.mail || '', tel: d.tel || '', obs: '', relacion: 'Dueño' }] : [];
  }
  return l;
}
export function locPrimaryContact(l) { const cs = (l && Array.isArray(l.contactos)) ? l.contactos : []; return cs.find(c => /due/i.test(c.relacion || '')) || cs[0] || null; }
export function locFullAddress(l) { if (!l) return ''; return [l.direccion, l.direccion2, l.comuna, l.ciudad, l.region].filter(Boolean).join(', '); }
/* Locaciones del proyecto en estado Confirmada (las únicas que ofrecen
   Hoja de Llamado y Plan de Rodaje). */
export function projLocConfirmadas(project) { return projLocList(project).filter(u => u.estado === 'confirmada' && bdLocFind(u.locId)); }

export function locacionOptions(project, selectedId) {
  // V8.2: las opciones salen de las locaciones CONFIRMADAS del proyecto
  // (módulo Locaciones), no de una lista propia de la Hoja de Llamado.
  ensureProjectLoc(project);
  const confs = projLocConfirmadas(project);
  if (confs.length === 0) {
    return `<option value="" selected>Llamado General</option>`;
  }
  const ids = confs.map(u => u.locId);
  const effId = (selectedId && ids.indexOf(selectedId) !== -1) ? selectedId : ids[0];
  return confs.map(u => {
    const l = bdLocFind(u.locId) || {};
    return `<option value="${escapeHtml(u.locId)}" ${effId === u.locId ? 'selected' : ''}>${escapeHtml(u.locId)} · ${escapeHtml(l.nombre || 'sin nombre')}</option>`;
  }).join('');
}

/* ════════════════════════════════════════════════════════════════════
   V8.2 · MÓDULO LOCACIONES
   Repositorio (fichas + fotos + estados) y Plan de Scouting (motor de
   tiempos del Plan de Rodaje). Fuente de verdad: BD_LOC (canónico) +
   project.data.locaciones (uso). Hoja de Llamado y Plan de Rodaje
   consumen las locaciones Confirmadas de este módulo.
   ════════════════════════════════════════════════════════════════════ */
function _locState() { if (!STATE.loc) STATE.loc = { sub: 'repo', filtro: 'todas' }; return STATE.loc; }
function locSetSub(s) { _locState().sub = s; renderLocaciones(); }
function locSetFiltro(f) { _locState().filtro = f; renderLocaciones(); }
export function locMoney(n) { return '$' + Math.round(n || 0).toLocaleString('es-CL'); }
function locEnsureScout(project) {
  const d = project.data;
  if (!d.scouting || typeof d.scouting !== 'object') d.scouting = { fecha: '', inicio: '09:00', quienes: [], filas: [] };
  if (!Array.isArray(d.scouting.quienes)) d.scouting.quienes = [];
  if (!Array.isArray(d.scouting.filas)) d.scouting.filas = [];
  return d.scouting;
}

const LOC_CSS = `<style>
.loc-kpi{display:flex;gap:1px;background:var(--border,#2a2a28);border:1px solid var(--border,#2a2a28);border-radius:10px;overflow:hidden;margin-bottom:16px;}
.loc-kpi-cell{flex:1;background:var(--bg-elev,#1b1b19);padding:13px 16px;}
.loc-kpi-label{font-size:10.5px;color:var(--ink-faint,#8a8a82);text-transform:uppercase;letter-spacing:.06em;}
.loc-kpi-val{font-size:22px;font-weight:700;margin-top:3px;}
.loc-kpi-sub{font-size:10.5px;color:var(--ink-faint,#8a8a82);margin-top:1px;}
.loc-subtabs{display:flex;gap:6px;margin-bottom:16px;}
.loc-subtab{padding:8px 16px;border-radius:8px;border:1px solid var(--border,#2a2a28);background:transparent;color:var(--ink-mut,#b5b5ad);cursor:pointer;font-size:13px;font-weight:600;}
.loc-subtab.on{background:var(--accent,#c8a04a);color:#161410;border-color:var(--accent,#c8a04a);}
.loc-filters{display:flex;gap:6px;margin:6px 0 14px;flex-wrap:wrap;}
.loc-chip{padding:5px 12px;border-radius:999px;border:1px solid var(--border,#2a2a28);background:transparent;color:var(--ink-mut,#b5b5ad);cursor:pointer;font-size:12px;}
.loc-chip.on{background:var(--ink,#e9e9e2);color:#161410;border-color:var(--ink,#e9e9e2);}
.loc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:14px;}
.loc-card{background:var(--bg-elev,#1b1b19);border:1px solid var(--border,#2a2a28);border-radius:12px;overflow:hidden;cursor:pointer;transition:border-color .15s;}
.loc-card:hover{border-color:var(--accent,#c8a04a);}
.loc-card-img{height:138px;background:#22221f;position:relative;display:flex;align-items:center;justify-content:center;color:var(--ink-faint,#777);font-size:12px;}
.loc-card-img img{width:100%;height:100%;object-fit:cover;display:block;}
.loc-card-fotos{position:absolute;top:8px;right:8px;background:rgba(0,0,0,.6);color:#fff;border-radius:999px;padding:2px 9px;font-size:11px;}
.loc-card-body{padding:11px 13px 13px;}
.loc-card-name{font-weight:700;font-size:14.5px;margin-bottom:2px;}
.loc-card-place{font-size:12px;color:var(--ink-mut,#b5b5ad);}
.loc-card-badges{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap;align-items:center;}
.loc-est{font-size:11px;font-weight:700;border-radius:999px;padding:2px 9px;}
.loc-est.candidata{background:rgba(90,150,210,.16);color:#7fb2e0;}
.loc-est.confirmada{background:rgba(90,180,120,.16);color:#74c486;}
.loc-est.descartada{background:rgba(160,160,160,.14);color:#9a9a92;}
.loc-tag{font-size:11px;color:var(--ink-faint,#8a8a82);border:1px solid var(--border,#2a2a28);border-radius:999px;padding:1px 8px;}
.loc-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.loc-block{border:1px solid var(--border,#2a2a28);border-radius:10px;padding:13px;margin-bottom:13px;}
.loc-block-h{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint,#8a8a82);margin-bottom:9px;display:flex;justify-content:space-between;align-items:center;}
.loc-block-tag{font-size:10px;font-weight:700;border-radius:999px;padding:2px 8px;}
.loc-block-tag.bd{background:rgba(200,160,74,.16);color:var(--accent,#c8a04a);}
.loc-block-tag.proj{background:rgba(120,120,200,.16);color:#9a9ad0;}
.loc-field{margin-bottom:9px;}
.loc-field label{display:block;font-size:11px;color:var(--ink-mut,#b5b5ad);margin-bottom:3px;}
.loc-gallery{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;}
.loc-thumb{position:relative;width:100%;aspect-ratio:4/3;height:auto;border-radius:8px;overflow:hidden;border:1px solid var(--border,#2a2a28);cursor:grab;}
.loc-thumb.dragging{opacity:.4;}
.loc-thumb.dragover{outline:2px solid var(--accent,#c2410c);outline-offset:2px;}
.loc-thumb img{width:100%;height:100%;object-fit:cover;}
.loc-thumb-x{position:absolute;top:2px;right:2px;background:rgba(0,0,0,.65);color:#fff;border:none;border-radius:50%;width:18px;height:18px;cursor:pointer;font-size:12px;line-height:1;}
.loc-foto-add{width:84px;height:64px;border:1px dashed var(--border,#3a3a36);border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink-faint,#8a8a82);font-size:22px;}
.loc-scout-tbl{width:100%;border-collapse:collapse;font-size:13px;}
.loc-scout-tbl th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint,#8a8a82);padding:6px 8px;border-bottom:1px solid var(--border,#2a2a28);}
.loc-scout-tbl td{padding:5px 8px;border-bottom:1px solid var(--border,#222);vertical-align:top;}
.loc-scout-tbl tr.traslado td{background:rgba(255,255,255,.02);color:var(--ink-mut,#b5b5ad);}
.loc-time{font-variant-numeric:tabular-nums;font-weight:700;white-space:nowrap;}
.loc-quienes{display:flex;flex-wrap:wrap;gap:7px;align-items:center;}
.loc-quien-row{display:flex;align-items:center;gap:3px;}
/* V11.24 (Pasada 6) · Plan de Scouting · línea de tiempo + ruta entera */
.scout-route{margin-top:16px;border:2px solid var(--accent);border-radius:10px;background:var(--accent-bg);padding:13px 15px;}
.scout-route-top{display:flex;align-items:center;gap:9px;margin-bottom:6px;}
.scout-route-top .t{font-size:14px;font-weight:600;color:var(--ink-primary);}
.scout-route-sub{font-size:11.5px;color:var(--ink-muted);margin-bottom:11px;line-height:1.5;}
.scout-chips{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.scout-chip{display:inline-flex;align-items:center;gap:4px;background:var(--bg-elevated);border:1px solid var(--rule-strong);border-radius:20px;padding:3px 5px 3px 4px;font-size:12.5px;color:var(--ink-primary);}
.scout-chip .combobox-input{border:none;background:transparent;min-width:140px;padding:4px 6px;color:var(--ink-primary);}
.scout-chip .x{width:18px;height:18px;border-radius:50%;background:var(--rule-strong);color:var(--ink-muted);display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer;border:none;flex:0 0 auto;}
.scout-chip-add{background:transparent;border:1px dashed var(--rule-strong);color:var(--ink-muted);cursor:pointer;border-radius:20px;padding:6px 13px;font-size:12.5px;font-family:inherit;}
.scout-summary{font-size:12.5px;color:var(--ink-muted);margin:0 0 14px;}
.scout-summary b{color:var(--ink-secondary);}
.scout-node,.scout-trasl{display:grid;grid-template-columns:56px 24px 1fr;align-items:start;}
.scout-time{font-variant-numeric:tabular-nums;font-size:13px;font-weight:700;color:var(--ink-primary);padding-top:17px;text-align:right;padding-right:8px;white-space:nowrap;}
.scout-time-in{width:50px;font-variant-numeric:tabular-nums;font-weight:700;text-align:right;padding:2px 3px;background:transparent;border:1px solid transparent;border-radius:4px;color:var(--accent-deep);font-family:inherit;font-size:13px;cursor:text;}
.scout-time-in:hover,.scout-time-in:focus{border-color:var(--rule-strong);background:var(--bg-surface-soft);outline:none;}
.scout-rail{position:relative;display:flex;justify-content:center;}
.scout-rail .ln{position:absolute;top:0;bottom:-14px;width:2px;background:var(--rule-strong);}
.scout-rail .dot{width:13px;height:13px;border-radius:50%;background:var(--accent);border:3px solid var(--bg-surface);margin-top:17px;z-index:1;}
.scout-card{background:var(--bg-card);border:1px solid var(--rule);border-radius:10px;padding:11px 13px;margin:7px 0;}
.scout-p-top{display:flex;align-items:center;gap:9px;}
.scout-badge{font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 8px;border-radius:10px;white-space:nowrap;flex:0 0 auto;}
.scout-badge.loc{background:var(--accent-soft);color:var(--ink-primary);}
.scout-badge.libre{background:var(--positive-bg);color:var(--positive);}
.scout-p-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;}
.scout-p-row .input{font-size:12.5px;}
.scout-maps-link{font-size:12px;color:var(--accent-deep);text-decoration:none;white-space:nowrap;}
.scout-dir{font-size:12px;color:var(--ink-muted);}
.scout-trasl .scout-seg{display:flex;align-items:center;gap:8px;color:var(--ink-muted);font-size:12px;padding:7px 0;}
.scout-dur-in{width:60px;background:var(--bg-elevated);border:1px solid var(--rule);border-radius:14px;padding:3px 10px;color:var(--ink-secondary);font-weight:500;font-family:inherit;font-size:12px;text-align:center;}
.scout-del{border:none;background:none;cursor:pointer;color:var(--ink-faint);font-size:17px;padding:0 2px;line-height:1;flex:0 0 auto;}
.scout-del:hover{color:var(--accent-deep);}
.scout-drag{cursor:grab;border:none;background:none;color:var(--ink-faint);font-size:14px;padding:0 4px 0 0;line-height:1;flex:0 0 auto;user-select:none;}
.scout-drag:active{cursor:grabbing;}
.scout-node.scout-dragging{opacity:.45;}
.scout-node.scout-drag-over .scout-card{outline:2px dashed var(--accent);outline-offset:2px;}
.loc-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;}
.loc-lightbox img{max-width:92vw;max-height:92vh;border-radius:6px;}
.loc-lightbox-x{position:absolute;top:18px;right:24px;background:none;border:none;color:#fff;font-size:34px;cursor:pointer;}
</style>`;

export function renderLocaciones() {
  const project = STATE.currentProject; if (!project) return;
  ensureProjectLoc(project);
  BD_LOC.forEach(ensureLocShape);
  const st = _locState();
  const content = document.getElementById('moduleContent');
  const subtabs = `<div class="loc-subtabs">
    <button class="loc-subtab ${st.sub === 'repo' ? 'on' : ''}" data-accion="loc.sub" data-args="[&quot;repo&quot;]">Repositorio</button>
    <button class="loc-subtab ${st.sub === 'scout' ? 'on' : ''}" data-accion="loc.sub" data-args="[&quot;scout&quot;]">Plan de Scouting</button>
  </div>`;
  content.innerHTML = LOC_CSS + subtabs + (st.sub === 'scout' ? locScoutingHTML(project) : locRepoHTML(project));
}

function locRepoHTML(project) {
  const st = _locState();
  const usos = projLocList(project);
  const conf = usos.filter(u => u.estado === 'confirmada').length;
  const cand = usos.filter(u => u.estado === 'candidata').length;
  const fotos = usos.reduce((s, u) => { const l = bdLocFind(u.locId); return s + (l && Array.isArray(l.fotos) ? l.fotos.length : 0); }, 0);
  let list = usos.slice();
  if (st.filtro !== 'todas') list = list.filter(u => u.estado === st.filtro);
  const kpi = `<div class="loc-kpi">
    <div class="loc-kpi-cell"><div class="loc-kpi-label">Locaciones</div><div class="loc-kpi-val">${usos.length}</div><div class="loc-kpi-sub">en este proyecto</div></div>
    <div class="loc-kpi-cell"><div class="loc-kpi-label">Confirmadas</div><div class="loc-kpi-val" style="color:#74c486;">${conf}</div><div class="loc-kpi-sub">oficiales para rodaje</div></div>
    <div class="loc-kpi-cell"><div class="loc-kpi-label">Candidatas</div><div class="loc-kpi-val" style="color:#7fb2e0;">${cand}</div><div class="loc-kpi-sub">en scouting</div></div>
    <div class="loc-kpi-cell"><div class="loc-kpi-label">Fotos</div><div class="loc-kpi-val">${fotos}</div><div class="loc-kpi-sub">comprimidas en repo</div></div>
  </div>`;
  const filtros = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
    <div class="loc-filters">${['todas', 'confirmada', 'candidata', 'descartada'].map(f => `<button class="loc-chip ${st.filtro === f ? 'on' : ''}" ${accionHTML('loc.filtro', f)}>${f === 'todas' ? 'Todas' : LOC_ESTADOS[f]}</button>`).join('')}</div>
    <button class="btn btn-primary btn-sm" data-accion="loc.add">+ Agregar locación</button>
  </div>`;
  let grid;
  if (!list.length) {
    grid = `<div class="alert alert-info" style="margin-top:6px;"><span class="alert-icon">ℹ</span><div>${usos.length ? 'Ninguna locación con ese estado.' : 'Aún no hay locaciones en este proyecto. Usa <strong>+ Agregar locación</strong> para crear una nueva o reutilizar una de la Base de Datos.'}</div></div>`;
  } else {
    grid = `<div class="loc-grid">${list.map(u => locCardHTML(u)).join('')}</div>`;
  }
  return kpi + filtros + grid;
}

function locCardHTML(uso) {
  const l = bdLocFind(uso.locId); if (!l) return '';
  /* V11.4.0 · la portada soporta fotos con url directa, dataUrl legado y
     RUTA de Storage (las subidas nuevas viven en el bucket): para path se
     pinta un placeholder y la URL firmada llega async. */
  const _f0 = (l.fotos && l.fotos[0]) || null;
  const _src0 = _f0 ? (_f0.url || _f0.dataUrl || '') : '';
  let portada;
  if (_src0) portada = `<img src="${safeUrl(_src0)}" alt="">`;
  else if (_f0 && _f0.path) { portada = `<span id="locThumb_${l.locId}">…</span>`; _locThumbAsync(l.locId, _f0.path); }
  else portada = 'Sin fotos';
  const nFotos = (l.fotos || []).length;
  const orient = (l.orientacion && l.orientacion !== '—') ? `<span class="loc-tag">☉ ${escapeHtml(l.orientacion)}</span>` : '';
  return `<div class="loc-card" ${accionHTML('bd.verLoc', l.locId)}>
    <div class="loc-card-img">${portada}${nFotos ? `<span class="loc-card-fotos">${nFotos} 📷</span>` : ''}</div>
    <div class="loc-card-body">
      <div class="loc-card-name">${escapeHtml(l.nombre || 'sin nombre')}</div>
      <div class="loc-card-place">${escapeHtml([l.comuna, l.ciudad].filter(Boolean).join(', ') || '—')}</div>
      <div class="loc-card-badges"><span class="loc-est ${uso.estado}">${LOC_ESTADOS[uso.estado]}</span>${orient}<span class="loc-tag">${escapeHtml(l.locId)}</span></div>
    </div>
  </div>`;
}

export function openLocDetail(locId) {
  const project = STATE.currentProject;
  const l = bdLocFind(locId); const uso = projLocFind(project, locId);
  if (!l) return;   // V8.4.1: la locación puede abrirse desde la BD aunque no esté en este proyecto (uso = null)
  ensureLocShape(l);
  const e = escapeHtml;
  const orientOpts = LOC_ORIENTACIONES.map(o => `<option ${l.orientacion === o ? 'selected' : ''}>${o}</option>`).join('');
  const contactosHTML = (l.contactos || []).map((c, i) => `
            <div style="border:1px solid var(--border);border-radius:8px;padding:9px 10px;margin-bottom:8px;">
              <div style="display:flex;gap:8px;align-items:flex-end;">
                <span style="flex:1;"><label style="font-size:11px;color:var(--ink-mut);">Nombre</label><input class="input" value="${e(c.nombre || '')}" ${accionHTML('loc.contacto', locId, i, 'nombre', { on: 'change' })}></span>
                <button class="btn btn-secondary btn-sm" style="color:#d08;border-color:rgba(210,0,80,.4);" ${accionHTML('loc.contactoDel', locId, i)} title="Quitar contacto">×</button>
              </div>
              <div style="margin-top:7px;"><label style="font-size:11px;color:var(--ink-mut);">Relación con la locación</label><input class="input" value="${e(c.relacion || '')}" placeholder="Dueño · Gerente · Administrador · Encargado · Hijo del dueño · Recepcionista…" ${accionHTML('loc.contacto', locId, i, 'relacion', { on: 'change' })}></div>
              <div style="display:flex;gap:8px;margin-top:7px;"><span style="flex:1;"><label style="font-size:11px;color:var(--ink-mut);">Mail</label><input class="input" value="${e(c.mail || '')}" ${accionHTML('loc.contacto', locId, i, 'mail', { on: 'change' })}></span><span style="flex:1;"><label style="font-size:11px;color:var(--ink-mut);">Teléfono</label><input class="input" value="${e(c.tel || '')}" ${accionHTML('loc.contacto', locId, i, 'tel', { on: 'change' })}></span></div>
              <div style="margin-top:7px;"><label style="font-size:11px;color:var(--ink-mut);">Observaciones</label><input class="input" value="${e(c.obs || '')}" ${accionHTML('loc.contacto', locId, i, 'obs', { on: 'change' })}></div>
            </div>`).join('') || '<div style="font-size:12px;color:var(--ink-faint);margin-bottom:8px;">Sin contactos aún. Agrega a quien coordinas la locación.</div>';
  /* V11.6.1 · la primera foto es el thumbnail de la locación (cards de
     proyecto y BD): se reordena por drag & drop (la primera es la portada). */
  /* V11.7.0 · galería con DRAG & DROP: arrastras para reordenar y la primera
     foto es el thumbnail. Sin estrella ni flechas (se eliminaron). */
  const galeria = (l.fotos || []).map((f, i) => `<div class="loc-thumb" draggable="true"
      ondragstart="locFotoDragStart(event,'${locId}',${i})" ondragend="locFotoDragEnd(event)"
      ondragover="locFotoDragOver(event)" ondragleave="locFotoDragLeave(event)" ondrop="locFotoDrop(event,'${locId}',${i})">
      <img id="lf_${locId}_${i}" src="${safeUrl(f.url || f._signedUrl || _LOC_FOTO_PLACEHOLDER)}" ${accionHTML('loc.lightbox', locId, i)} style="pointer-events:none;">
      <button class="loc-thumb-x" ${accionHTML('loc.fotoDel', locId, i)} title="Quitar">×</button>
      ${i === 0 ? `<span style="position:absolute;left:5px;top:5px;font-size:9.5px;font-weight:700;background:rgba(0,0,0,.62);color:#ffd86b;border-radius:999px;padding:2px 8px;pointer-events:none;">★ Portada</span>` : ''}
    </div>`).join('');
  try { setTimeout(function(){ _resolveLocFotoUrls(locId); }, 0); } catch (e) {}
  const estadoChips = uso ? Object.keys(LOC_ESTADOS).map(s => `<button class="loc-chip ${uso.estado === s ? 'on' : ''}" ${accionHTML('loc.estado', locId, s)}>${LOC_ESTADOS[s]}</button>`).join('') : '';
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal" style="max-width:760px;width:94vw;max-height:88vh;overflow:auto;">
    <div class="modal-header"><div class="modal-title">${e(l.nombre || 'Locación')} · ${e(l.locId)}</div><button class="go-x" data-accion="ui.cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--ink-mut);">×</button></div>
    <div class="modal-body">
      ${uso ? `<div class="loc-block">
        <div class="loc-block-h">Estado en este proyecto</div>
        <div class="loc-filters" style="margin:0;">${estadoChips}</div>
      </div>` : ''}
      <div class="loc-modal-grid">
        <div>
          <div class="loc-block">
            <div class="loc-block-h">Datos de la locación <span class="loc-block-tag bd">BD · reutilizable</span></div>
            <div class="loc-field"><label>Nombre</label><input class="input" value="${e(l.nombre || '')}" ${accionHTML('loc.bd', locId, 'nombre', { on: 'change' })}></div>
            <div class="loc-field"><label>Dirección</label><input class="input" value="${e(l.direccion || '')}" placeholder="Calle 123" ${accionHTML('loc.bd', locId, 'direccion', { on: 'change' })}></div>
            <div class="loc-field"><label>Segunda línea (opcional)</label><input class="input" value="${e(l.direccion2 || '')}" placeholder="Torre B · Depto 302 · Casa 7 · Villa…" ${accionHTML('loc.bd', locId, 'direccion2', { on: 'change' })}></div>
            <div class="loc-field" style="display:flex;gap:8px;"><span style="flex:1;"><label>Comuna</label><input class="input" value="${e(l.comuna || '')}" ${accionHTML('loc.bd', locId, 'comuna', { on: 'change' })}></span><span style="flex:1;"><label>Ciudad</label><input class="input" value="${e(l.ciudad || '')}" ${accionHTML('loc.bd', locId, 'ciudad', { on: 'change' })}></span></div>
            <div class="loc-field"><label>Región</label>${regionSelectHTML(l.region, { accion: accionHTML('loc.bd', locId, 'region', { on: 'change' }) })}</div>
            <div class="loc-field"><label>Link Google Maps</label><input class="input" value="${e(l.maps || '')}" placeholder="https://maps.google.com/…" ${accionHTML('loc.bd', locId, 'maps', { on: 'change' })}></div>
            <div class="loc-field"><label>Notas generales</label><textarea class="input" rows="2" ${accionHTML('loc.bd', locId, 'notas', { on: 'change' })}>${e(l.notas || '')}</textarea></div>
          </div>
          <div class="loc-block">
            <div class="loc-block-h">Contactos de la locación <span class="loc-block-tag bd">BD · reutilizable</span></div>
            ${contactosHTML}
            <button class="btn btn-secondary btn-sm" ${accionHTML('loc.contactoAdd', locId)}>+ Agregar contacto</button>
            <div style="font-size:11px;color:var(--ink-faint);margin-top:7px;">No siempre se conoce al dueño; registra a quien coordinas (gerente, encargado, administrador, recepcionista…). El campo "Relación" es libre.</div>
          </div>
          <div class="loc-block">
            <div class="loc-block-h">Avanzado</div>
            <div class="loc-field"><label>Orientación</label><select class="input" ${accionHTML('loc.bd', locId, 'orientacion', { on: 'change' })}>${orientOpts}</select></div>
          </div>
        </div>
        <div>
          <div class="loc-block">
            <div class="loc-block-h">Galería de scouting <span class="loc-block-tag bd">BD · reutilizable</span></div>
            <div class="loc-gallery">${galeria}<label class="loc-foto-add" title="Agregar fotos (se comprimen solas)">+<input type="file" accept="image/*" multiple style="display:none" ${accionHTML('loc.fotos', locId, { on: 'change' })}></label></div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;flex-wrap:wrap;">
              <div style="font-size:11px;color:var(--ink-faint);">Arrastra para reordenar · la primera foto es la portada · máx. 1280 px · click para ampliar.</div>
              ${(l.fotos || []).length ? `<button class="btn btn-secondary btn-sm" ${accionHTML('loc.fotosZip', locId)}>⬇ Descargar todo</button>` : ''}
            </div>
          </div>
          ${uso ? `<div class="loc-block">
            <div class="loc-block-h">Uso en este proyecto <span class="loc-block-tag proj">solo de este proyecto</span></div>
            <div class="loc-field"><label>Costo negociado (CLP)</label><input class="input" inputmode="numeric" value="${uso.costo || 0}" ${accionHTML('loc.proj', locId, 'costo', { on: 'change' })}></div>
            <div class="loc-field"><label>Estado de contratación</label><input class="input" value="${e(uso.contratacion || '')}" placeholder="Contrato firmado / En conversación / Propia…" ${accionHTML('loc.proj', locId, 'contratacion', { on: 'change' })}></div>
            <div class="loc-field"><label>Notas del proyecto</label><textarea class="input" rows="2" ${accionHTML('loc.proj', locId, 'notasProy', { on: 'change' })}>${e(uso.notasProy || '')}</textarea></div>
          </div>` : ''}
        </div>
      </div>
      ${uso ? `<div style="margin-top:4px;"><button class="btn btn-secondary btn-sm" style="color:#d08;border-color:rgba(210,0,80,.4);" ${accionHTML('loc.quitarProy', locId)}>Quitar de este proyecto</button> <span style="font-size:11px;color:var(--ink-faint);">No se borra de la Base de Datos; solo deja de usarse en este proyecto.</span></div>` : ''}
    </div>
    <div class="modal-footer">${_bdPuedeArchivar() ? `<button class="btn btn-ghost btn-sm" style="color:var(--accent-deep);margin-right:auto;" ${accionHTML('loc.archivar', locId)}>Archivar</button>` : ''}<button class="btn btn-primary" data-accion="ui.cerrar">Listo</button></div>
  </div></div>`;
}

function locSetEstado(locId, estado) { const u = projLocFind(STATE.currentProject, locId); if (!u) return; u.estado = estado; markDirty(); renderLocaciones(); openLocDetail(locId); showToast({ kind: 'info', title: 'Estado actualizado', body: 'Locación marcada como ' + LOC_ESTADOS[estado].toLowerCase() + '.' }); }
function locSetBD(locId, field, value) { const l = bdLocFind(locId); if (!l) return; l[field] = value; markDirty(); autosaveNow(); _dalLocacionSaveSoon(locId); }
function locAddContacto(locId) { const l = bdLocFind(locId); if (!l) return; if (!Array.isArray(l.contactos)) l.contactos = []; l.contactos.push({ nombre: '', mail: '', tel: '', obs: '', relacion: '' }); markDirty(); autosaveNow(); _dalLocacionSaveSoon(locId); openLocDetail(locId); }
function locSetContacto(locId, i, field, value) { const l = bdLocFind(locId); if (!l || !Array.isArray(l.contactos) || !l.contactos[i]) return; l.contactos[i][field] = value; markDirty(); autosaveNow(); _dalLocacionSaveSoon(locId); }
function locDelContacto(locId, i) { const l = bdLocFind(locId); if (!l || !Array.isArray(l.contactos)) return; l.contactos.splice(i, 1); markDirty(); autosaveNow(); _dalLocacionSaveSoon(locId); openLocDetail(locId); }
function locSetProj(locId, field, value) { const u = projLocFind(STATE.currentProject, locId); if (!u) return; u[field] = (field === 'costo') ? (parseInt(String(value).replace(/\D/g, ''), 10) || 0) : value; markDirty(); autosaveNow(); }
function locRemoveFromProject(locId) {
  const project = STATE.currentProject;
  showModal({
    title: 'Quitar locación del proyecto', body: 'La locación dejará de usarse en este proyecto. Sus datos y fotos se conservan en la Base de Datos de Locaciones. ¿Continuar?',
    confirmLabel: 'Quitar', cancelLabel: 'Cancelar', danger: true,
    onConfirm: () => {
      project.data.locaciones = projLocList(project).filter(u => u.locId !== locId);
      // limpiar referencias en citaciones de la Hoja de Llamado
      const dias = ((project.data.hojaLlamado || {}).dias) || {};
      Object.keys(dias).forEach(k => {
        const dd = dias[k];
        Object.keys(dd.crewOverrides || {}).forEach(nm => { if (dd.crewOverrides[nm].locacionId === locId) dd.crewOverrides[nm].locacionId = ''; });
        (dd.citacionesExternas || []).forEach(c => { if (c.locacionId === locId) c.locacionId = ''; });
      });
      markDirty(); closeModal(); renderLocaciones();
      showToast({ kind: 'info', title: 'Locación quitada', body: 'Sigue disponible en la BD de Locaciones.' });
    }
  });
}
/* ── V9.5.0 · Fotos de locaciones en Supabase Storage ─────────────────────
   Bucket PRIVADO 'fotos-locaciones'; la BD guarda la RUTA (no una URL), y al
   mostrar se pide una URL firmada. FAIL-SAFE: si el bucket no existe o Storage
   no está disponible, la subida cae al comportamiento previo (base64 en
   localStorage), así desplegar esto NO cambia nada hasta que el bucket exista. */
const STORAGE_BUCKET_FOTOS = 'fotos-locaciones';
const _LOC_FOTO_PLACEHOLDER = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="%23e6e3dd"/></svg>';
function _dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl).split(','); const mime = ((parts[0] || '').match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(parts[1] || ''); const len = bin.length; const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
function _locFotoStoragePath(locId, name) {
  const safe = String(name || 'foto').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  return ORG_ID + '/' + locId + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safe;
}
async function _uploadLocFoto(locId, dataUrl, name) {
  if (!sb || LOCATIONS_SOURCE !== 'supabase' || !sb.storage) return null;
  try {
    const blob = _dataUrlToBlob(dataUrl);
    const path = _locFotoStoragePath(locId, name);
    const { error } = await sb.storage.from(STORAGE_BUCKET_FOTOS).upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) throw error;
    return { path: path, nombre_original: name || '' };
  } catch (e) { console.warn('[storage] subida de foto no disponible; se guarda local', e); return null; }
}
/* Pinta las fotos {path} con URL firmada, post-render (las {url} base64 ya se ven). */
async function _resolveLocFotoUrls(locId) {
  if (!sb || !sb.storage) return;
  const l = bdLocFind(locId); if (!l || !Array.isArray(l.fotos)) return;
  for (let i = 0; i < l.fotos.length; i++) {
    const fto = l.fotos[i]; if (!fto || !fto.path) continue;
    try {
      let url = fto._signedUrl;
      if (!url) { const { data, error } = await sb.storage.from(STORAGE_BUCKET_FOTOS).createSignedUrl(fto.path, 3600); if (error) throw error; url = data && data.signedUrl; fto._signedUrl = url; }
      if (url) { const img = document.getElementById('lf_' + locId + '_' + i); if (img) img.src = url; }
    } catch (e) { /* deja el placeholder */ }
  }
}

async function locAddFotos(locId, inputEl) {
  const l = bdLocFind(locId); if (!l) return; if (!Array.isArray(l.fotos)) l.fotos = [];
  const files = Array.from(inputEl.files || []); if (!files.length) return;
  let nube = 0, local = 0;
  for (const f of files) {
    try {
      const url = await gancho('prCompressImage')(f, 1280, 0.6); if (!url) continue;
      const up = await _uploadLocFoto(locId, url, f.name);
      if (up) { up._signedUrl = url; l.fotos.push(up); nube++; }   // preview inmediato con el dataURL recién comprimido
      else { l.fotos.push({ url: url }); local++; }
    } catch (e) { /* omitir archivo problemático */ }
  }
  markDirty(); autosaveNow();
  if (nube) { try { _dalLocacionSaveSoon(locId); } catch (e) {} }   // sincroniza las RUTAS (no el binario)
  const msg = (nube && local) ? (nube + ' a la nube y ' + local + ' local(es)') : nube ? (nube + ' foto(s) en la nube') : (local + ' foto(s) (local, este navegador)');
  showToast({ kind: 'success', title: 'Fotos agregadas', body: msg + '.' });
  openLocDetail(locId);
}
let _LOC_DRAG = null;
function locFotoDragStart(ev, locId, i) { _LOC_DRAG = { locId: locId, i: i }; ev.currentTarget.classList.add('dragging'); try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(i)); } catch (e) {} }
function locFotoDragEnd(ev) { ev.currentTarget.classList.remove('dragging'); document.querySelectorAll('.loc-thumb.dragover').forEach(function (el) { el.classList.remove('dragover'); }); }
function locFotoDragOver(ev) { ev.preventDefault(); try { ev.dataTransfer.dropEffect = 'move'; } catch (e) {} ev.currentTarget.classList.add('dragover'); }
function locFotoDragLeave(ev) { ev.currentTarget.classList.remove('dragover'); }
function locFotoDrop(ev, locId, destino) {
  ev.preventDefault(); ev.currentTarget.classList.remove('dragover');
  if (!_LOC_DRAG || _LOC_DRAG.locId !== locId) return;
  const origen = _LOC_DRAG.i; _LOC_DRAG = null;
  if (origen === destino) return;
  const l = bdLocFind(locId); if (!l || !Array.isArray(l.fotos)) return;
  const f = l.fotos.splice(origen, 1)[0];
  l.fotos.splice(destino, 0, f);
  markDirty(); autosaveNow();
  try { _dalLocacionSaveSoon(locId); } catch (e) {}
  openLocDetail(locId);
}
async function locDescargarFotos(locId) {
  const l = bdLocFind(locId); if (!l || !Array.isArray(l.fotos) || !l.fotos.length) return;
  showToast({ kind: 'info', title: 'Preparando descarga', body: 'Bajando ' + l.fotos.length + ' foto(s)…' });
  for (let i = 0; i < l.fotos.length; i++) {
    const f = l.fotos[i];
    let url = f.url || f._signedUrl;
    if (!url && f.path && sb && sb.storage) {
      try { const { data } = await sb.storage.from(STORAGE_BUCKET_FOTOS).createSignedUrl(f.path, 600); url = data && data.signedUrl; } catch (e) {}
    }
    if (!url) continue;
    try {
      const resp = await fetch(url); const blob = await resp.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      const base = String(l.nombre || 'locacion').replace(/[^a-zA-Z0-9._-]/g, '_');
      a.download = base + '_' + String(i + 1).padStart(2, '0') + '.jpg';
      document.body.appendChild(a); a.click();
      setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 1500);
      await new Promise(function (r) { setTimeout(r, 350); });   // separa las descargas
    } catch (e) { /* omite la que falle */ }
  }
}
function locDelFoto(locId, i) {
  const l = bdLocFind(locId); if (!l || !Array.isArray(l.fotos)) return;
  const f = l.fotos[i];
  if (f && f.path && sb && sb.storage) { try { sb.storage.from(STORAGE_BUCKET_FOTOS).remove([f.path]); } catch (e) {} }
  l.fotos.splice(i, 1); markDirty(); autosaveNow();
  if (f && f.path) { try { _dalLocacionSaveSoon(locId); } catch (e) {} }
  openLocDetail(locId);
}
let _LOC_LB = null;
function locLightbox(locId, i) {
  const l = bdLocFind(locId); if (!l || !l.fotos || !l.fotos[i]) return;
  _LOC_LB = { locId: locId, i: i, n: l.fotos.length };
  _locLbRender();
  document.removeEventListener('keydown', _locLbKey);
  document.addEventListener('keydown', _locLbKey);
}
function _locLbSrc(locId, i) {
  const l = bdLocFind(locId); if (!l || !l.fotos[i]) return _LOC_FOTO_PLACEHOLDER;
  const f = l.fotos[i];
  if (!(f.url || f._signedUrl) && f.path && sb && sb.storage) {
    sb.storage.from(STORAGE_BUCKET_FOTOS).createSignedUrl(f.path, 3600).then(function (r) {
      if (r && r.data && r.data.signedUrl) { f._signedUrl = r.data.signedUrl; const img = document.getElementById('locLbImg'); if (img && _LOC_LB && _LOC_LB.i === i) img.src = r.data.signedUrl; }
    }).catch(function () {});
  }
  return f.url || f._signedUrl || _LOC_FOTO_PLACEHOLDER;
}
function _locLbRender() {
  if (!_LOC_LB) return;
  const old = document.getElementById('locLb'); if (old) old.remove();
  const div = document.createElement('div'); div.id = 'locLb'; div.className = 'loc-lightbox';
  div.onclick = (ev) => { if (ev.target === div) _locLbClose(); };
  const multi = _LOC_LB.n > 1;
  div.innerHTML = `<button class="loc-lightbox-x" data-accion="loc.lbCerrar">×</button>`
    + (multi ? `<button class="loc-lb-nav prev" data-accion="loc.lbMover" data-args="[-1]" style="position:fixed;left:18px;top:50%;transform:translateY(-50%);font-size:34px;background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:50%;width:52px;height:52px;cursor:pointer;z-index:2;">‹</button>` : '')
    + `<img id="locLbImg" src="${safeUrl(_locLbSrc(_LOC_LB.locId, _LOC_LB.i))}" alt="">`
    + (multi ? `<button class="loc-lb-nav next" data-accion="loc.lbMover" data-args="[1]" style="position:fixed;right:18px;top:50%;transform:translateY(-50%);font-size:34px;background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:50%;width:52px;height:52px;cursor:pointer;z-index:2;">›</button>` : '')
    + (multi ? `<div style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);color:#fff;font-size:12px;background:rgba(0,0,0,.5);padding:3px 12px;border-radius:999px;">${_LOC_LB.i + 1} / ${_LOC_LB.n}</div>` : '');
  document.body.appendChild(div);
}
function _locLbMove(dir) {
  if (!_LOC_LB) return;
  _LOC_LB.i = (_LOC_LB.i + dir + _LOC_LB.n) % _LOC_LB.n;
  const img = document.getElementById('locLbImg'); if (img) img.src = safeUrl(_locLbSrc(_LOC_LB.locId, _LOC_LB.i));
  const ind = document.querySelector('#locLb div'); if (ind) ind.textContent = (_LOC_LB.i + 1) + ' / ' + _LOC_LB.n;
}
function _locLbClose() {
  const d = document.getElementById('locLb'); if (d) d.remove();
  document.removeEventListener('keydown', _locLbKey); _LOC_LB = null;
}
function _locLbKey(ev) {
  if (!_LOC_LB) return;
  if (ev.key === 'ArrowLeft') { ev.preventDefault(); _locLbMove(-1); }
  else if (ev.key === 'ArrowRight') { ev.preventDefault(); _locLbMove(1); }
  else if (ev.key === 'Escape') { ev.preventDefault(); _locLbClose(); }
}

function openLocAdd() {
  const project = STATE.currentProject;
  const libres = BD_LOC.filter(l => !projLocFind(project, l.locId));
  const e = escapeHtml;
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-accion="ui.backdrop"><div class="modal" style="max-width:520px;">
    <div class="modal-header"><div class="modal-title">Agregar locación</div><button class="go-x" data-accion="ui.cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--ink-mut);">×</button></div>
    <div class="modal-body">
      <div class="loc-filters" style="margin:0 0 12px;"><button class="loc-chip on" id="lam_new" data-accion="loc.addModo" data-args="[&quot;new&quot;]">Crear nueva</button><button class="loc-chip" id="lam_bd" data-accion="loc.addModo" data-args="[&quot;bd&quot;]">Reutilizar de la BD</button></div>
      <div id="locAddNew">
        <div class="loc-field"><label>Nombre</label><input class="input" id="la_nombre" placeholder="ej. Casa Vitacura"></div>
        <div class="loc-field"><label>Dirección</label><input class="input" id="la_dir" placeholder="Calle 123"></div>
        <div class="loc-field"><label>Segunda línea (opcional)</label><input class="input" id="la_dir2" placeholder="Torre B · Depto 302 · Casa 7 · Villa Los Alerces"></div>
        <div class="loc-field" style="display:flex;gap:8px;"><span style="flex:1;"><label>Comuna</label><input class="input" id="la_comuna"></span><span style="flex:1;"><label>Ciudad</label><input class="input" id="la_ciudad" value="Santiago"></span></div>
        <div class="loc-field"><label>Región</label>${regionSelectHTML('', {id:'la_region'})}</div>
        <div style="font-size:11px;color:var(--ink-faint);">Se crea en la BD de Locaciones con estado <b>Candidata</b>. Orientación, contactos y fotos se completan después en la ficha.</div>
      </div>
      <div id="locAddBD" style="display:none;">
        <div class="loc-field"><label>Elige una locación existente</label><select class="input" id="la_bd">${libres.length ? libres.map(l => `<option value="${e(l.locId)}">${e(l.nombre || l.locId)} — ${e(l.comuna || '')}</option>`).join('') : '<option value="">(todas las locaciones de la BD ya están en este proyecto)</option>'}</select></div>
        <div style="font-size:11px;color:var(--ink-faint);">Trae la locación con sus datos y fotos. Aquí solo defines su uso (entra como Candidata).</div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" data-accion="ui.cerrar">Cancelar</button><button class="btn btn-primary" data-accion="loc.guardarAdd">Agregar</button></div>
  </div></div>`;
  STATE.loc._addMode = 'new';
}
function locAddMode(m) {
  STATE.loc._addMode = m;
  document.getElementById('lam_new').classList.toggle('on', m === 'new');
  document.getElementById('lam_bd').classList.toggle('on', m === 'bd');
  document.getElementById('locAddNew').style.display = m === 'new' ? 'block' : 'none';
  document.getElementById('locAddBD').style.display = m === 'bd' ? 'block' : 'none';
}
function saveLocAdd() {
  const project = STATE.currentProject;
  const v = id => (document.getElementById(id) || {}).value || '';
  if (STATE.loc._addMode === 'bd') {
    const id = v('la_bd'); if (!id) { showToast({ kind: 'warning', title: 'Sin locaciones libres', body: 'No hay locaciones en la BD que no estén ya en este proyecto.' }); return; }
    project.data.locaciones.push({ locId: id, estado: 'candidata', costo: 0, contratacion: '', notasProy: '' });
    markDirty(); closeModal(); renderLocaciones(); showToast({ kind: 'success', title: 'Locación traída de la BD', body: locNombre(id) + ' agregada como candidata.' });
    return;
  }
  // V8.3.3: si ya existe una locación con el mismo nombre en la BD, se reutiliza
  // (no se crea un duplicado). Su estado evoluciona sobre el registro existente.
  const _nm = normLocName(v('la_nombre'));
  const _dup = _nm ? BD_LOC.find(l => normLocName(l.nombre) === _nm) : null;
  if (_dup) {
    if (!projLocFind(project, _dup.locId)) project.data.locaciones.push({ locId: _dup.locId, estado: 'candidata', costo: 0, contratacion: '', notasProy: '' });
    markDirty(); closeModal(); renderLocaciones(); openLocDetail(_dup.locId);
    showToast({ kind: 'info', title: 'Ya existía en la BD', body: _dup.locId + ' · ' + (_dup.nombre || '') + ' — se reutilizó en vez de crear un duplicado.' });
    return;
  }
  const id = nextLocIdBD();
  BD_LOC.push({ locId: id, nombre: v('la_nombre') || '(sin nombre)', direccion: v('la_dir'), direccion2: v('la_dir2'), comuna: v('la_comuna'), ciudad: v('la_ciudad') || 'Santiago', region: v('la_region'), maps: '', orientacion: '—', contactos: [], notas: '', fotos: [] });
  project.data.locaciones.push({ locId: id, estado: 'candidata', costo: 0, contratacion: '', notasProy: '' });
  markDirty(); autosaveNow(); _dalLocacionSaveSoon(id); closeModal(); renderLocaciones(); openLocDetail(id);
  showToast({ kind: 'success', title: 'Locación creada', body: id + ' agregada a la BD y al proyecto.' });
}

/* ── Plan de Scouting ── motor de tiempos del Plan de Rodaje (cascada) ── */
function locScoutTimes(project) {
  const s = locEnsureScout(project);
  // V11.24 (Pasada 5): solo los traslados aportan tiempo; la parada ya no tiene
  // duración (se ignora aunque venga en datos antiguos). La cascada calcula las
  // horas con los traslados y el "término aprox." sigue funcionando.
  const filas = s.filas.map(f => ({ tipo: f.tipo, dur: f.tipo === 'traslado' ? f.dur : null, anchor: null }));
  return gancho('prComputeTimes')(filas, gancho('prParseHM')(s.inicio));
}
function locScoutSet(field, value) { const s = locEnsureScout(STATE.currentProject); s[field] = (field === 'inicio') ? (normalizeTime24 ? normalizeTime24(value) : value) : value; markDirty(); if (field === 'inicio') renderLocaciones(); }
function locScoutSetFila(i, field, value, reflow) { const s = locEnsureScout(STATE.currentProject); if (!s.filas[i]) return; s.filas[i][field] = (field === 'dur') ? gancho('prNormalizeDur')(value) : value; markDirty(); if (reflow) renderLocaciones(); }
/* V11.24 (Pasada 5): traslados automáticos. Al agregar una parada después de
   otra se inserta solo el traslado conector, así nunca quedan dos paradas ni dos
   traslados seguidos y el plan siempre empieza en parada. */
function locScoutAddParada() {
  const s = locEnsureScout(STATE.currentProject);
  if (s.filas.length > 0) s.filas.push({ tipo: 'traslado', dur: '0:20' });
  const first = projLocList(STATE.currentProject)[0];
  s.filas.push({ tipo: 'parada', locId: first ? first.locId : '', nombreLibre: '', maps: '', revisar: '', resp: '', respTel: '' });
  markDirty(); renderLocaciones();
}
/* Borrar una parada se lleva su traslado conector (el anterior; si es la primera,
   el siguiente). El traslado no se borra por separado: mantiene la alternancia. */
function locScoutDelParada(i) {
  const s = locEnsureScout(STATE.currentProject);
  if (!s.filas[i] || s.filas[i].tipo !== 'parada') return;
  if (i > 0 && s.filas[i - 1] && s.filas[i - 1].tipo === 'traslado') s.filas.splice(i - 1, 2);
  else if (s.filas[i + 1] && s.filas[i + 1].tipo === 'traslado') s.filas.splice(i, 2);
  else s.filas.splice(i, 1);
  markDirty(); renderLocaciones();
}
/* El campo Locación admite una locación del proyecto (se vincula por locId) o
   texto libre (nombreLibre, sin dirección/contacto derivados). */
function locScoutSetParadaLoc(i, value) {
  const s = locEnsureScout(STATE.currentProject); const f = s.filas[i]; if (!f) return;
  const v = String(value == null ? '' : value).trim();
  const match = BD_LOC.find(l => _normKey(l.nombre || '') === _normKey(v));
  if (match) { f.locId = match.locId; f.nombreLibre = ''; }
  else { f.locId = ''; f.nombreLibre = v; }
  markDirty(); renderLocaciones();
}
/* V11.24 (Pasada 6): link de Google Maps por parada (corrección) y de la ruta
   entera. "Buscar en Maps" abre Maps con el texto de la parada para que el
   usuario verifique la ubicación antes de pegar el link de vuelta. */
function locScoutBuscarMaps(i) {
  const s = locEnsureScout(STATE.currentProject); const f = s.filas[i]; if (!f) return;
  let txt = f.locId ? (function () { const l = bdLocFind(f.locId) || {}; return l.direccion || l.nombre || locNombre(f.locId) || ''; })() : (f.nombreLibre || '');
  txt = String(txt).trim();
  if (!txt) { showToast({ kind: 'warning', title: 'Sin texto', body: 'Escribe primero el nombre o la dirección de la parada.' }); return; }
  window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(txt), '_blank', 'noopener');
}
function locScoutSetParadaMaps(i, value) {
  const s = locEnsureScout(STATE.currentProject); const f = s.filas[i]; if (!f) return;
  f.maps = String(value == null ? '' : value).trim();
  markDirty(); renderLocaciones();
}
function locScoutRutaEntera() {
  const s = locEnsureScout(STATE.currentProject);
  const pts = s.filas.filter(f => f.tipo === 'parada').map(f => {
    if (f.locId) { const l = bdLocFind(f.locId) || {}; return String(l.direccion || l.nombre || locNombre(f.locId) || '').trim(); }
    return String(f.nombreLibre || '').trim();
  }).filter(Boolean);
  if (pts.length < 2) { showToast({ kind: 'warning', title: 'Ruta incompleta', body: 'Necesitas al menos dos paradas con nombre o dirección para armar la ruta en Maps.' }); return; }
  window.open('https://www.google.com/maps/dir/' + pts.map(p => encodeURIComponent(p)).join('/'), '_blank', 'noopener');
}

/* V11.24 (correcciones) · reordenar paradas con drag&drop (patrón del Plan de
   Rodaje). Se arrastran PARADAS por índice de parada; los traslados se mantienen
   y el array se reconstruye intercalado para conservar la alternancia. */
let SCOUT_DRAG = null;
function locScoutDragStart(ev, pIdx) { SCOUT_DRAG = pIdx; try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(pIdx)); } catch (e) {} try { const node = ev.currentTarget.closest('.scout-node'); if (node) node.classList.add('scout-dragging'); } catch (e) {} }
function locScoutDragEnd(ev) { SCOUT_DRAG = null; try { document.querySelectorAll('.scout-drag-over,.scout-dragging').forEach(el => el.classList.remove('scout-drag-over', 'scout-dragging')); } catch (e) {} }
function locScoutDragOver(ev, pIdx) { if (SCOUT_DRAG == null || SCOUT_DRAG === pIdx) return; ev.preventDefault(); const node = ev.currentTarget; if (node && node.classList) node.classList.add('scout-drag-over'); }
function locScoutDragLeave(ev) { const node = ev.currentTarget; if (node && node.classList) node.classList.remove('scout-drag-over'); }
function locScoutDrop(ev, pIdx) { ev.preventDefault(); const from = SCOUT_DRAG; SCOUT_DRAG = null; try { document.querySelectorAll('.scout-drag-over,.scout-dragging').forEach(el => el.classList.remove('scout-drag-over', 'scout-dragging')); } catch (e) {} if (from == null || from === pIdx) return; locScoutMoverParada(from, pIdx); }
function locScoutMoverParada(fromIdx, toIdx) {
  const s = locEnsureScout(STATE.currentProject);
  const paradas = s.filas.filter(f => f.tipo === 'parada');
  const traslados = s.filas.filter(f => f.tipo === 'traslado');
  if (fromIdx < 0 || fromIdx >= paradas.length || toIdx < 0 || toIdx >= paradas.length || fromIdx === toIdx) return;
  const moved = paradas.splice(fromIdx, 1)[0];
  paradas.splice(toIdx, 0, moved);
  const nuevas = [];
  paradas.forEach((p, k) => { if (k > 0) nuevas.push(traslados[k - 1] || { tipo: 'traslado', dur: '0:20' }); nuevas.push(p); });
  s.filas = nuevas;
  markDirty(); renderLocaciones();
}
/* Bola naranja: agrega la parada libre (texto a mano) a la BD de locaciones y al
   proyecto, y la deja vinculada. Igual que "+ Agregar a la BD" de personas. */
function locScoutAddLocBD(pIdx) {
  const s = locEnsureScout(STATE.currentProject);
  const f = s.filas.filter(x => x.tipo === 'parada')[pIdx]; if (!f) return;
  const nombre = (f.nombreLibre || '').trim();
  if (!nombre) { showToast({ kind: 'warning', title: 'Sin nombre', body: 'Escribe el nombre de la parada antes de agregarla a la BD.' }); return; }
  const id = nextLocIdBD();
  BD_LOC.push({ locId: id, nombre: nombre, direccion: '', direccion2: '', comuna: '', ciudad: 'Santiago', region: '', maps: f.maps || '', orientacion: '—', contactos: [], notas: '', fotos: [] });
  const d = STATE.currentProject.data;
  if (!Array.isArray(d.locaciones)) d.locaciones = [];
  d.locaciones.push({ locId: id, estado: 'candidata', costo: 0, contratacion: '', notasProy: '' });
  f.locId = id; f.nombreLibre = '';
  markDirty(); autosaveNow();
  try { if (typeof dalGuardarLocacion === 'function') dalGuardarLocacion(bdLocFind(id)); } catch (e) {}
  showToast({ kind: 'success', title: 'Locación creada', body: `<strong>${escapeHtml(nombre)}</strong> se agregó a la BD y al proyecto. Complétala en el módulo Locaciones.` });
  renderLocaciones();
}
/* Combobox de locaciones, igual al de personas: typeahead sobre BD_LOC. */
function comboboxFilterLocScout(inputEl) {
  const wrap = inputEl.closest('.combobox-wrap'); if (!wrap) return;
  const dropdown = wrap.querySelector('.combobox-dropdown'); if (!dropdown) return;
  const q = _normKey(inputEl.value || '');
  const locs = BD_LOC.slice().sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
  const matched = q ? locs.filter(l => _normKey(l.nombre || '').includes(q) || _normKey(l.direccion || '').includes(q)) : locs;
  if (matched.length === 0) {
    dropdown.innerHTML = `<div class="combobox-empty" style="font-size:11.5px;color:var(--ink-faint);padding:7px 9px;line-height:1.4;">Sin coincidencias. Escríbela libre y usa la bola naranja para agregarla a la BD.</div>`;
  } else {
    dropdown.innerHTML = matched.slice(0, 20).map(l => `<div class="combobox-option" ${accionHTML('ui.cbSel', l.nombre || '', { on: 'mousedown' })}><div class="combobox-option-main">${escapeHtml(l.nombre || '(sin nombre)')}</div>${l.direccion ? `<div class="combobox-option-meta">${escapeHtml(l.direccion)}</div>` : ''}</div>`).join('') + (matched.length > 20 ? `<div class="combobox-more">+ ${matched.length - 20} más — sigue tipeando</div>` : '');
  }
  dropdown.hidden = false;
  dropdown.onmousedown = function (ev) { if (!ev.target.closest('.combobox-option')) ev.preventDefault(); };
  if (wrap.classList.contains('cbx-anchored')) { dropdown.style.left = ''; dropdown.style.top = ''; dropdown.style.width = ''; }
  else { positionComboboxDropdown(inputEl, dropdown); }
}
function locScoutAddQuien() { const s = locEnsureScout(STATE.currentProject); s.quienes.push(''); markDirty(); renderLocaciones(); }
function locScoutSetQuien(i, value) { const s = locEnsureScout(STATE.currentProject); s.quienes[i] = value; markDirty(); }
function locScoutDelQuien(i) { const s = locEnsureScout(STATE.currentProject); s.quienes.splice(i, 1); markDirty(); renderLocaciones(); }
/* V11.x · desde la pelota ámbar del contacto: abre la ficha (o el alta) en la BD. */
function locScoutAddContactoBD(enc) { try { openPersonaByName(decodeURIComponent(enc)); } catch (e) {} }

function locScoutingHTML(project) {
  const s = locEnsureScout(project);
  const e = escapeHtml;
  const usos = projLocList(project);
  const times = locScoutTimes(project);
  const fin = times.length ? gancho('prFmtClock')(times[times.length - 1].termino != null ? times[times.length - 1].termino : times[times.length - 1].inicio) : (s.inicio || '—');
  const nParadas = s.filas.filter(f => f.tipo === 'parada').length;
  const totalMin = (gancho('prParseHM')(fin) != null && gancho('prParseHM')(s.inicio) != null) ? (gancho('prParseHM')(fin) - gancho('prParseHM')(s.inicio)) : null;
  const quienes = s.quienes.map((q, i) => `<span class="scout-chip"><span class="combobox-wrap person-combobox cbx-anchored" style="min-width:150px;"><input class="combobox-input" value="${e(q)}" placeholder="Buscar persona…" autocomplete="off" ${accionHTML('loc.scoutQuien', i, { on: 'focus input blur change' })}><div class="combobox-dropdown" hidden></div></span><button class="x" ${accionHTML('loc.scoutQuienDel', i)} title="Quitar">×</button></span>`).join('');
  const nFilas = s.filas.length;
  let _pIdx = -1;
  const filasHTML = s.filas.map((f, i) => {
    const ln = (i === nFilas - 1) ? '' : '<span class="ln"></span>';
    if (f.tipo === 'traslado') {
      return `<div class="scout-trasl"><div></div><div class="scout-rail">${ln}</div><div class="scout-seg">⤷ Traslado <input class="scout-dur-in" value="${e(f.dur || '')}" title="HHMM: 100 = 1 hora · tiempo de viaje" ${accionHTML('loc.scoutFila', i, 'dur', true, { on: 'change' })}> <span style="font-size:11px;color:var(--ink-faint);">de viaje</span></div></div>`;
    }
    _pIdx++; const pIdx = _pIdx;
    const clock = times[i] && times[i].inicio != null ? gancho('prFmtClock')(times[i].inicio) : '—';
    const horaCell = (i === 0)
      ? `<input class="scout-time-in" value="${e(s.inicio || '')}" inputmode="numeric" maxlength="5" title="Hora de inicio del plan (editable)" ${accionHTML('loc.scoutSet', 'inicio', { on: 'change' })}>`
      : `<span>${clock}</span>`;
    const l = bdLocFind(f.locId) || {};
    const esLibre = !f.locId;
    const _nomParada = f.locId ? locNombre(f.locId) : (f.nombreLibre || '');
    const dirTexto = (f.locId && l.direccion) ? `<span class="scout-dir">${e(l.direccion)}</span>` : '';
    const linkMaps = f.maps || (f.locId ? (l.maps || '') : '');
    const verMaps = linkMaps ? `<a class="scout-maps-link" href="${safeUrl(linkMaps)}" target="_blank" rel="noopener">Ver en Maps ↗</a>` : '';
    const _c0 = locPrimaryContact(l) || {};
    const respName = f.resp || (_c0.nombre || '');   /* default: contacto registrado de la locación, si hay */
    const _bdP = (f.resp && typeof BD_PERSONAS !== 'undefined') ? BD_PERSONAS[f.resp] : null;
    let respTel = f.respTel || '';
    if (!respTel) { respTel = _bdP ? (_bdP.telefono || '') : (!f.resp ? (_c0.tel || '') : ''); }   /* celular auto: de la BD si el nombre está, o de la locación por defecto */
    const dotNoBD = (f.resp && !_bdP) ? `<button type="button" title="No está en la Base de Datos · clic para agregarla" ${accionHTML('loc.scoutContactoBD', encodeURIComponent(f.resp))} style="border:none;background:none;cursor:pointer;color:var(--warning);font-weight:700;font-size:13px;padding:0 3px;">●</button>` : '';
    return `<div class="scout-node" ondragover="locScoutDragOver(event,${pIdx})" ondragleave="locScoutDragLeave(event)" ondrop="locScoutDrop(event,${pIdx})">
      <div class="scout-time">${horaCell}</div>
      <div class="scout-rail">${ln}<span class="dot"></span></div>
      <div class="scout-card">
        <div class="scout-p-top">
          <button class="scout-drag" draggable="true" ondragstart="locScoutDragStart(event,${pIdx})" ondragend="locScoutDragEnd(event)" title="Arrastrar para reordenar">⠿</button>
          <span class="combobox-wrap person-combobox" style="flex:1;min-width:0;"><input class="input combobox-input" value="${e(_nomParada)}" placeholder="Locación o texto libre…" autocomplete="off" style="font-weight:600;width:100%;" ${accionHTML('loc.scoutParada', i, { on: 'focus input blur change' })}><div class="combobox-dropdown" hidden></div></span>
          ${(esLibre && _nomParada) ? `<button type="button" title="No está en la BD de locaciones · clic para agregarla" ${accionHTML('loc.scoutLocBD', pIdx)} style="border:none;background:none;cursor:pointer;color:var(--warning);font-weight:700;font-size:14px;padding:0 2px;flex:0 0 auto;">●</button>` : ''}
          <span class="scout-badge ${esLibre ? 'libre' : 'loc'}">${esLibre ? 'Parada libre' : 'Locación'}</span>
          <button class="scout-del" ${accionHTML('loc.scoutParadaDel', i)} title="Quitar parada (y su traslado)">×</button>
        </div>
        <div class="scout-p-row">${dirTexto}${verMaps}<button class="btn btn-secondary btn-sm" ${accionHTML('loc.scoutMaps', i)} title="Abre Google Maps con este texto para que verifiques la ubicación; luego pega el link aquí">Buscar en Maps</button><input class="input" style="flex:1;min-width:150px;" value="${e(f.maps || '')}" placeholder="Pega aquí el link de Google Maps…" ${accionHTML('loc.scoutParadaMaps', i, { on: 'change' })}></div>
        <div class="scout-p-row"><span class="combobox-wrap person-combobox" style="min-width:150px;"><input class="input combobox-input" value="${e(respName)}" placeholder="Contacto…" autocomplete="off" ${accionHTML('loc.scoutResp', i, { on: 'focus input blur change' })}><div class="combobox-dropdown" hidden></div></span>${dotNoBD}<input class="input" style="width:130px;" value="${e(respTel)}" placeholder="Celular" ${accionHTML('loc.scoutFila', i, 'respTel', false, { on: 'change' })}><input class="input" style="flex:1;min-width:160px;" value="${e(f.revisar || '')}" placeholder="Notas (ej.: tocar el timbre dos veces)" ${accionHTML('loc.scoutFila', i, 'revisar', false, { on: 'change' })}></div>
      </div>
    </div>`;
  }).join('');
  return `<div class="cot-card" style="padding:16px;margin-bottom:14px;">
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">
      <div class="loc-field" style="margin:0;"><label>Fecha de scouting</label><input type="date" class="input" value="${e(s.fecha || '')}" ${accionHTML('loc.scoutSet', 'fecha', { on: 'change' })}></div>
      <div class="loc-field" style="margin:0;"><label>Hora de inicio</label><input class="input" style="width:90px;" inputmode="numeric" maxlength="5" value="${e(s.inicio || '')}" placeholder="09:00" ${accionHTML('loc.scoutSet', 'inicio', { on: 'change' })}></div>
    </div>
    <div class="scout-route">
      <div class="scout-route-top"><span style="font-size:15px;">🔗</span><span class="t">Ruta completa en Google Maps</span></div>
      <div class="scout-route-sub">Abre todas las paradas en orden como una ruta de Google Maps, usando el nombre o la dirección de cada una. Revisa el orden antes de compartirla.</div>
      <button class="btn btn-primary btn-sm" data-accion="loc.scoutRuta">Crear ruta en Maps ↗</button>
    </div>
  </div>
  <div class="cot-card" style="padding:14px 16px;margin-bottom:14px;">
    <div class="loc-field" style="margin:0;"><label>Quiénes van</label>
      <div class="scout-chips" style="margin-top:6px;">${quienes}<button class="scout-chip-add" data-accion="loc.scoutQuienAdd">+ Persona</button></div>
    </div>
  </div>
  <div class="cot-card" style="padding:14px 16px;">
    <div class="scout-summary"><b>${nParadas} parada(s)</b> · ${totalMin != null ? gancho('prFmtDur')(totalMin) + ' total' : 'duración —'} · término aprox. <b>${fin}</b></div>
    <div class="scout-tl">${filasHTML || `<div style="color:var(--ink-faint);padding:8px 2px;font-size:13px;">Sin paradas todavía. Agrega tu primera parada.</div>`}</div>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <button class="btn btn-secondary btn-sm" data-accion="loc.scoutParadaAdd">+ Parada</button>
      <span style="flex:1;"></span>
      <button class="btn btn-primary btn-sm" data-accion="loc.scoutPDF">Exportar PDF</button>
    </div>
  </div>`;
}

function scoutBuildPDFHTML(project) {
  const s = locEnsureScout(project); const e = escapeHtml;
  const ip = project.data.infoProyecto || {};
  const times = locScoutTimes(project);
  const rows = s.filas.map((f, i) => {
    const clock = times[i] && times[i].inicio != null ? gancho('prFmtClock')(times[i].inicio) : '—';
    if (f.tipo === 'traslado') return `<tr class="tr"><td>${clock}</td><td>${e(gancho('prFmtDur')(gancho('prParseHM')(f.dur)))}</td><td colspan="3">⤷ Traslado</td></tr>`;
    const l = bdLocFind(f.locId) || {};
    const _c0 = locPrimaryContact(l) || {};
    const _bdP = (f.resp && typeof BD_PERSONAS !== 'undefined') ? BD_PERSONAS[f.resp] : null;
    const _nom = f.resp || (_c0.nombre || '');
    const _tel = f.respTel || (_bdP ? (_bdP.telefono || '') : (!f.resp ? (_c0.tel || '') : ''));
    const _contacto = [_nom, _tel].filter(Boolean).join(' · ');
    const _nomP = f.locId ? (l.nombre || '—') : (f.nombreLibre || '—');
    const _mapsP = f.maps || (f.locId ? (l.maps || '') : '');
    const _mapsLink = _mapsP ? `<br><a href="${safeUrl(_mapsP)}" style="color:#1a5fb4;font-size:11px;">Ver en Maps</a>` : '';
    return `<tr><td>${clock}</td><td></td><td><b>${e(_nomP)}</b><br><span class="mut">${e(l.direccion || '')}</span>${_mapsLink}</td><td>${e(_contacto)}</td><td>${e(f.revisar || '')}</td></tr>`;
  }).join('');
  const fin = times.length ? gancho('prFmtClock')(times[times.length - 1].termino != null ? times[times.length - 1].termino : times[times.length - 1].inicio) : '';
  const _ptsRuta = s.filas.filter(x => x.tipo === 'parada').map(x => { if (x.locId) { const ll = bdLocFind(x.locId) || {}; return String(ll.direccion || ll.nombre || locNombre(x.locId) || '').trim(); } return String(x.nombreLibre || '').trim(); }).filter(Boolean);
  const _rutaUrl = _ptsRuta.length >= 2 ? 'https://www.google.com/maps/dir/' + _ptsRuta.map(p => encodeURIComponent(p)).join('/') : '';
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Plan de Scouting</title>
  <style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a17;margin:32px;}h1{font-size:19px;margin:0 0 2px;}.sub{color:#666;font-size:12px;margin-bottom:14px;}
  .meta{font-size:12.5px;margin-bottom:14px;}.meta b{color:#000;}
  table{width:100%;border-collapse:collapse;font-size:12px;}th{text-align:left;background:#f3f1ec;padding:6px 8px;border:1px solid #ddd;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;}
  td{padding:6px 8px;border:1px solid #e3e3df;vertical-align:top;}tr.tr td{background:#faf9f6;color:#555;}.mut{color:#777;}
  .foot{margin-top:22px;font-size:10.5px;color:#888;display:flex;justify-content:space-between;}</style></head>
  <body><h1>Plan de Scouting</h1><div class="sub">${e(ip.cliente || '')}${ip.nombreProyecto ? ' · ' + e(ip.nombreProyecto) : ''}</div>
  <div class="meta">Fecha: <b>${e(s.fecha ? fmtFechaLarga(s.fecha) : '—')}</b> · Inicio: <b>${e(s.inicio || '—')}</b> · Término aprox.: <b>${e(fin)}</b><br>Quiénes van: <b>${e((s.quienes || []).filter(Boolean).join(', ') || '—')}</b>${_rutaUrl ? `<br>Ruta completa: <a href="${_rutaUrl}" style="color:#1a5fb4;">abrir en Google Maps</a>` : ''}</div>
  <table><thead><tr><th>Hora</th><th>Dur.</th><th>Locación</th><th>Contacto</th><th>Notas</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="foot"><span>${e(orgNombre())}${orgNombre() ? ' · ' : ''}Plan de Scouting</span><span>${e(new Date().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span></div>
  </body></html>`;
  return html;
}
/* V11.24 (corrección) · Exportar = previsualizador: reutiliza el motor CotPreview
   y el shell de cotPreviewPDF(), alimentado por el builder propio del Scouting, y
   exporta con gancho('printViaIframe')(mismo patrón que cotPreviewGenerar). */
function scoutPreviewPDF() {
  const project = STATE.currentProject; if (!project) return;
  const s = locEnsureScout(project);
  if (!s.filas.length) { showToast({ kind: 'warning', title: 'Plan vacío', body: 'Agrega al menos una parada antes de exportar.' }); return; }
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal" style="max-width:1000px;width:96vw;padding:0;overflow:hidden;">
    <div class="modal-header" style="padding:13px 18px;"><div class="modal-title">Previsualizar y exportar · Plan de Scouting</div></div>
    <div style="display:flex;flex-direction:column;min-height:60vh;max-height:74vh;">
      <div style="flex:1;display:flex;flex-direction:column;min-width:0;background:#2a2a27;">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--bg-surface,#222);border-bottom:1px solid var(--rule,#34342f);flex-wrap:wrap;">
          <button class="btn btn-sm" data-accion="loc.prevZoom" data-args="[-10]" title="Alejar">−</button>
          <span id="cotPrevZoom" style="font-size:12px;color:var(--ink-secondary,#d3d6cb);min-width:44px;text-align:center;font-variant-numeric:tabular-nums;">100%</span>
          <button class="btn btn-sm" data-accion="loc.prevZoom" data-args="[10]" title="Acercar">+</button>
          <span style="width:1px;height:18px;background:var(--rule,#34342f);margin:0 3px;"></span>
          <button class="btn btn-sm" id="cotPrevFitPage" data-accion="loc.prevModo" data-args="[&quot;page&quot;]">Ajustar</button>
          <button class="btn btn-sm" id="cotPrevFitWidth" data-accion="loc.prevModo" data-args="[&quot;width&quot;]">Ancho</button>
          <span style="font-size:10.5px;color:var(--ink-faint,#71736a);margin-left:auto;">Pellizca el trackpad o Ctrl/⌘ + rueda para zoom</span>
        </div>
        <div id="cotPrevCanvas" style="flex:1;overflow:auto;background:#2a2a27;padding:24px;">
          <div id="cotPrevWrap" style="margin:0 auto;position:relative;"><iframe id="cotPrevFrame" title="preview" style="position:absolute;top:0;left:0;border:0;transform-origin:top left;background:#fff;"></iframe></div>
        </div>
      </div>
    </div>
    <div class="modal-footer" style="padding:12px 18px;justify-content:flex-end;gap:8px;"><button class="btn" data-accion="ui.cerrar">Cerrar</button><button class="btn btn-primary" data-accion="loc.scoutPDFGen">Exportar PDF</button></div>
  </div></div>`;
  CotPreview.init(document.getElementById('cotPrevCanvas'), document.getElementById('cotPrevWrap'), document.getElementById('cotPrevFrame'));
  CotPreview.load(scoutBuildPDFHTML(project), 794, 1123);
  CotPreview.setMode('page');
}
function scoutPreviewGenerar() {
  const project = STATE.currentProject; if (!project) return;
  const ip = project.data.infoProyecto || {};
  const html = scoutBuildPDFHTML(project);
  const fname = `Plan de Scouting - ${ip.nombreProyecto || project.name || 'Proyecto'}${ip.cliente ? ' - ' + ip.cliente : ''}`;
  closeModal();
  gancho('printViaIframe')(html, fname);
  showToast({ kind: 'success', title: 'Plan listo para PDF', body: 'Se abrió el diálogo de impresión. Elige <strong>"Guardar como PDF"</strong>.' });
}

// ── Puentes a window ─────────────────────────────────────────────────────────
// Helpers de utilidad — usados por Legal, Hoja de Llamado, Plan de Rodaje, BD

window.locNombre             = locNombre;

// Módulo Locaciones — entry points y utilidades

// Gestión de fichas de locación

// Scouting

// ── Bridges auditoría pre-B (onclick en HTML generado por el propio módulo) ──

// D2 · acciones delegadas
registrarAcciones('loc', {
  sub: function (a) { locSetSub(a[0]); },
  filtro: function (a) { locSetFiltro(a[0]); },
  add: function () { openLocAdd(); },
  contacto: function (a, el) { locSetContacto(a[0], a[1], a[2], el.value); },
  contactoDel: function (a) { locDelContacto(a[0], a[1]); },
  contactoAdd: function (a) { locAddContacto(a[0]); },
  lightbox: function (a) { locLightbox(a[0], a[1]); },
  fotoDel: function (a) { locDelFoto(a[0], a[1]); },
  estado: function (a) { locSetEstado(a[0], a[1]); },
  bd: function (a, el) { locSetBD(a[0], a[1], el.value); },
  fotos: function (a, el) { locAddFotos(a[0], el); },
  fotosZip: function (a) { locDescargarFotos(a[0]); },
  proj: function (a, el) { locSetProj(a[0], a[1], el.value); },
  quitarProy: function (a) { locRemoveFromProject(a[0]); },
  archivar: function (a) { gancho('archivarLocacionModal')(a[0]); },
  lbCerrar: function () { _locLbClose(); },
  lbMover: function (a) { _locLbMove(a[0]); },
  addModo: function (a) { locAddMode(a[0]); },
  guardarAdd: function () { saveLocAdd(); },
  scoutQuien: function (a, el, ev) {
    if (ev.type === 'focus') comboboxOpen(el);
    else if (ev.type === 'input') comboboxFilter(el);
    else if (ev.type === 'blur') comboboxCloseDelayed(el);
    else locScoutSetQuien(a[0], el.value);
  },
  scoutQuienDel: function (a) { locScoutDelQuien(a[0]); },
  scoutQuienAdd: function () { locScoutAddQuien(); },
  scoutFila: function (a, el) { locScoutSetFila(a[0], a[1], el.value, a[2]); },
  scoutSet: function (a, el) { locScoutSet(a[0], el.value); },
  scoutContactoBD: function (a) { locScoutAddContactoBD(a[0]); },
  scoutParada: function (a, el, ev) {
    if (ev.type === 'focus' || ev.type === 'input') comboboxFilterLocScout(el);
    else if (ev.type === 'blur') comboboxCloseDelayed(el);
    else locScoutSetParadaLoc(a[0], el.value);
  },
  scoutLocBD: function (a) { locScoutAddLocBD(a[0]); },
  scoutParadaDel: function (a) { locScoutDelParada(a[0]); },
  scoutParadaAdd: function () { locScoutAddParada(); },
  scoutMaps: function (a) { locScoutBuscarMaps(a[0]); },
  scoutParadaMaps: function (a, el) { locScoutSetParadaMaps(a[0], el.value); },
  scoutResp: function (a, el, ev) {
    if (ev.type === 'focus') comboboxOpen(el);
    else if (ev.type === 'input') comboboxFilter(el);
    else if (ev.type === 'blur') comboboxCloseDelayed(el);
    else locScoutSetFila(a[0], 'resp', el.value, true);
  },
  scoutRuta: function () { locScoutRutaEntera(); },
  scoutPDF: function () { scoutPreviewPDF(); },
  scoutPDFGen: function () { scoutPreviewGenerar(); },
  prevZoom: function (a) { CotPreview.setZoom(CotPreview.zoom + a[0]); },
  prevModo: function (a) { CotPreview.setMode(a[0]); },
});

// D4b · ganchos definidos por este módulo (consumidos por módulos más tempranos)
define('bdLocFind', bdLocFind);
define('nextLocIdBD', nextLocIdBD);
define('projLocFind', projLocFind);
define('renderLocaciones', renderLocaciones);
