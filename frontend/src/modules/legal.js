// MÓDULO LEGAL (Etapa A1)
// Extraído de frontend/index.html L7772–8599 + outliers L1809–1810, L11859–11874
// Patrones de acceso a globals: BD_LEGAL, BD_LEGAL_TPL, BD_CONTACTOS, STATE,
// sb, ORG_ID, EMPRESA_PERFIL, LEGAL_SOURCE, escapeHtml, _normKey, showToast,
// showModal, openModal, closeModal, markDirty, autosaveNow, bdLocFind,
// _dalLegalDocSaveSoon, _dalLegalTplSaveSoon, dalEliminarLegalDoc,
// dalEliminarLegalTpl, printViaIframe, comboboxSelect, comboboxAddToBD,
// comboboxCloseDelayed, ensureLocShape, locPrimaryContact, locFullAddress,
// locMoney, montoNetoDesde, _fechaCorta, _toISODate

// D1c · imports reales. VETADOS: ORG_ID, LEGAL_SOURCE (window mutables),
// combobox* (solo strings). Hoists: plan-rodaje 21→20, bd-excel 23→20,
// dal 26→20 (top-levels inertes firmados). renderLegal sigue saliendo vía
// window para nav y dal — bridge intocable.
import { escapeHtml, showToast } from '../lib/helpers.js';
import { sb } from '../lib/supabase.js';
import { STATE, BD_CONTACTOS, BD_LEGAL, BD_LEGAL_TPL, BD_LOC, EMPRESA_PERFIL, ORG_ID, LEGAL_SOURCE } from '../lib/state.js';
import { montoNetoDesde } from '../lib/data.js';
import { showModal, closeModal, _toISODate, comboboxCloseDelayed } from '../lib/ui.js';
import { _fechaCorta } from './notificaciones.js';
import { bdLocFind, ensureLocShape, locPrimaryContact, locFullAddress, locMoney, locNombre } from './locaciones.js';
import { printViaIframe } from './plan-rodaje.js';
import { _normKey } from './bd-excel.js';
import { _dalLegalDocSaveSoon, _dalLegalTplSaveSoon, dalEliminarLegalDoc, dalEliminarLegalTpl } from './dal.js';
import { markDirty, autosaveNow } from './persistencia-local.js';

import { registrarAcciones, accionHTML } from '../lib/delegacion.js';
import { define } from '../lib/ganchos.js';
/* ════════════════════════════════════════════════════════════════════
   V8.3 · MÓDULO LEGAL
   Genera, versiona y archiva documentos legales (cesión de derechos,
   contrato de servicios, NDA, arriendo de locación) desde plantillas
   fijas + datos del sistema (BD Personas, Presupuesto, Info Proyecto,
   bloque Derechos). Los documentos viven en BD_LEGAL (transversal); el
   tab del proyecto es una vista filtrada. Ciclo Borrador→Generado→
   Enviado→Firmado, versionado, export a PDF con marca.
   ⚠ Contenido legal: la Cesión está basada en el contrato real de
   Primate; Servicios, NDA y Arriendo son BORRADORES y deben validarse
   con un abogado antes de usarse en producción.
   ════════════════════════════════════════════════════════════════════ */
const LEGAL_TPL = {
  servicios: { nombre: 'Contrato de prestación de servicios', desc: 'Crew y proveedores independientes', target: 'persona', draft: true, completar: 'sistema' },
  cesion: { nombre: 'Cesión de derechos / modelaje', desc: 'Talento — servicios + derechos de imagen', target: 'persona', draft: false, completar: 'sistema' },
  nda: { nombre: 'Acuerdo de confidencialidad (NDA)', desc: 'Cualquier contraparte', target: 'persona', draft: true, completar: 'sistema' },
  arriendo: { nombre: 'Arriendo de locación', desc: 'Dueño de la locación', target: 'locacion', draft: true, completar: 'sistema' }
};
const LEGAL_EST = { borrador: 'Borrador', generado: 'Generado', enviado: 'Enviado', firmado: 'Firmado' };
const LEGAL_FLOW = ['borrador', 'generado', 'enviado', 'firmado'];
/* ── V9.6.2 · PDF firmado a Storage (bucket privado 'documentos-legales') ─────
   Subir el PDF firmado es la UNICA forma de marcar un documento como "Firmado":
   el sistema obliga a archivar el contrato real (Biblia: forzar la tarea que se
   posterga). El export legal sigue siendo imprimir-a-PDF del navegador (no
   produce Blob); lo que se sube es el PDF que la persona descargo y consiguio
   firmar. La BD guarda solo la RUTA en legal_documents.pdf_path (pdfUrl en el
   cliente), que dalGuardarLegalDoc ya sincroniza. Se abre con URL firmada (1h).
   El bucket 'documentos-legales' ya existe (takeos_storage_setup.sql). */
const STORAGE_BUCKET_LEGAL = 'documentos-legales';
async function _uploadLegalPDF(docId, file) {
  if (!sb || !sb.storage || !file) return null;
  try {
    const safe = String(file.name || 'documento.pdf').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
    const path = ORG_ID + '/' + (docId || 'doc') + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safe;
    const { error } = await sb.storage.from(STORAGE_BUCKET_LEGAL).upload(path, file, { contentType: file.type || 'application/pdf', upsert: false });
    if (error) throw error;
    return { path: path };
  } catch (e) { console.warn('[storage] PDF legal no disponible', e); return null; }
}
async function _abrirLegalPDF(path) {
  if (!sb || !sb.storage || !path) { try { showToast({ kind: 'info', title: 'PDF en la nube', body: 'No hay conexión con Storage para abrirlo ahora.' }); } catch (e) {} return; }
  try { const { data, error } = await sb.storage.from(STORAGE_BUCKET_LEGAL).createSignedUrl(path, 3600); if (error) throw error; if (data && data.signedUrl) window.open(data.signedUrl, '_blank'); }
  catch (e) { try { showToast({ kind: 'warning', title: 'No disponible', body: 'No se pudo abrir el PDF firmado.' }); } catch (x) {} }
}

const LEGAL_CSS = `<style>
.lgl-kpi{display:flex;gap:1px;background:var(--border,#2a2a28);border:1px solid var(--border,#2a2a28);border-radius:10px;overflow:hidden;margin-bottom:16px;}
.lgl-kpi-cell{flex:1;background:var(--bg-elev,#1b1b19);padding:13px 16px;}
.lgl-kpi-label{font-size:10.5px;color:var(--ink-faint,#8a8a82);text-transform:uppercase;letter-spacing:.06em;}
.lgl-kpi-val{font-size:22px;font-weight:700;margin-top:3px;}
.lgl-kpi-sub{font-size:10.5px;color:var(--ink-faint,#8a8a82);margin-top:1px;}
.lgl-subtabs{display:flex;gap:6px;margin-bottom:16px;}
.lgl-subtab{padding:8px 16px;border-radius:8px;border:1px solid var(--border,#2a2a28);background:transparent;color:var(--ink-mut,#b5b5ad);cursor:pointer;font-size:13px;font-weight:600;}
.lgl-subtab.on{background:var(--accent,#c8a04a);color:#161410;border-color:var(--accent,#c8a04a);}
.lgl-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;}
.lgl-filtros select,.lgl-filtros input{background:var(--bg-elev,#1b1b19);border:1px solid var(--border,#2a2a28);border-radius:7px;color:var(--ink,#e9e9e2);padding:6px 9px;font-size:12.5px;}
.lgl-tbl{width:100%;border-collapse:collapse;font-size:13px;}
.lgl-tbl th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint,#8a8a82);padding:7px 9px;border-bottom:1px solid var(--border,#2a2a28);}
.lgl-tbl td{padding:8px 9px;border-bottom:1px solid var(--border,#222);vertical-align:middle;}
.lgl-pill{display:inline-block;background:rgba(200,160,74,.14);color:var(--accent,#c8a04a);border-radius:999px;padding:2px 10px;font-size:11.5px;font-weight:600;}
.lgl-est{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:2px 10px;}
.lgl-est.borrador{background:rgba(160,160,160,.16);color:#a8a89e;}
.lgl-est.generado{background:rgba(90,150,210,.16);color:#7fb2e0;}
.lgl-est.enviado{background:rgba(200,160,74,.16);color:#d9b256;}
.lgl-est.firmado{background:rgba(90,180,120,.16);color:#74c486;}
.lgl-tplcard{border:1px solid var(--border,#2a2a28);border-radius:10px;padding:13px 15px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:12px;}
.lgl-tplcard .nm{font-weight:700;font-size:14px;}
.lgl-tplcard .ds{font-size:12px;color:var(--ink-mut,#b5b5ad);margin-top:2px;}
.lgl-lock,.lgl-warn{display:flex;gap:9px;align-items:flex-start;border-radius:9px;padding:11px 13px;font-size:12.5px;line-height:1.5;margin-bottom:13px;}
.lgl-lock{background:rgba(120,120,200,.10);border:1px solid rgba(120,120,200,.3);color:#b9b9e0;}
.lgl-warn{background:rgba(210,150,40,.10);border:1px solid rgba(210,150,40,.35);color:#e0b66a;}
.lgl-gen-grid{display:grid;grid-template-columns:1fr 1.1fr;gap:16px;}
@media(max-width:820px){ .lgl-gen-grid{grid-template-columns:1fr;} }
.lgl-tplpick{display:flex;flex-direction:column;gap:7px;margin-bottom:12px;}
.lgl-tplbtn{text-align:left;border:1px solid var(--border,#2a2a28);background:transparent;border-radius:9px;padding:9px 11px;cursor:pointer;color:var(--ink,#e9e9e2);}
.lgl-tplbtn.on{border-color:var(--accent,#c8a04a);background:rgba(200,160,74,.08);}
.lgl-tplbtn .tn{font-weight:700;font-size:13px;}
.lgl-tplbtn .td{font-size:11px;color:var(--ink-mut,#b5b5ad);}
.lgl-tplbtn .draft{font-size:10.5px;color:#e0b66a;margin-top:3px;}
.lgl-tplbtn .vald{font-size:10.5px;color:#74c486;margin-top:3px;}
.lgl-field{margin-bottom:9px;}
.lgl-field label{display:block;font-size:11px;color:var(--ink-mut,#b5b5ad);margin-bottom:3px;}
.lgl-field .src{font-size:9.5px;border-radius:999px;padding:1px 7px;margin-left:6px;font-weight:700;}
.lgl-field .src.bd{background:rgba(200,160,74,.16);color:var(--accent,#c8a04a);}
.lgl-field .src.pres{background:rgba(90,180,120,.16);color:#74c486;}
.lgl-field .src.info{background:rgba(90,150,210,.16);color:#7fb2e0;}
.lgl-field .src.der{background:rgba(120,120,200,.16);color:#9a9ad0;}
.lgl-frow{display:flex;gap:8px;}
.lgl-frow .lgl-field{flex:1;}
.lgl-paper{background:#fbfaf7;color:#1a1a17;border-radius:8px;padding:26px 30px;font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.6;max-height:60vh;overflow:auto;border:1px solid var(--border,#2a2a28);}
.lgl-paper .logo{font-family:-apple-system,'Segoe UI',sans-serif;font-weight:800;letter-spacing:.04em;font-size:15px;color:#161410;margin-bottom:14px;}
.lgl-paper h4{font-size:13px;text-align:center;text-transform:uppercase;letter-spacing:.03em;margin:0 0 14px;}
.lgl-paper .cl{font-weight:700;margin-top:11px;}
.lgl-paper p{margin:5px 0;text-align:justify;}
.lgl-paper .firmas{display:flex;justify-content:space-around;margin-top:30px;text-align:center;font-family:-apple-system,'Segoe UI',sans-serif;font-size:10.5px;}
.lgl-paper .firmas .ln{border-top:1px solid #222;padding-top:5px;width:46%;}
.lgl-v{background:rgba(200,160,74,.28);border-radius:3px;padding:0 2px;}
</style>`;

function _legalState() { if (!STATE.legal) STATE.legal = { sub: 'docs', filtroTipo: '', filtroEstado: '', q: '', fDesde: '', fHasta: '', gen: null }; return STATE.legal; }
function legalSetSub(s) { _legalState().sub = s; renderLegal(); }
function legalSetFiltro(k, v) { _legalState()[k] = v; renderLegal(); }

function legalRep() {
  const e = EMPRESA_PERFIL || {};
  const dom = [e.direccion, e.comuna, e.ciudad].filter(Boolean).join(', ');   // V10.5.1: comuna y ciudad ahora son campos separados
  return {
    razon: e.razonSocial || '',
    rutEmp: e.rut || '',
    marca: e.nombreFicticio || '',
    rep: e.representante || '',
    rutRep: e.repRut || '',
    domEmp: dom || ''
  };
}
function legalFindContact(nombre) {
  if (!nombre) return null;
  const ids = Object.keys(BD_CONTACTOS);
  for (const id of ids) { const c = BD_CONTACTOS[id]; if (c && c.nombre === nombre) return c; }
  return null;
}
function legalAllContactNames() {
  return Array.from(new Set(Object.keys(BD_CONTACTOS).map(id => BD_CONTACTOS[id] && BD_CONTACTOS[id].nombre).filter(Boolean))).sort();
}
function legalPersonData(nombre) {
  // Resuelve desde la BD canónica (BD_CONTACTOS): tiene RUT y domicilio de
  // TODOS, incluidos los talentos (que en la proyección BD_TALENTOS no los traen).
  const c = legalFindContact(nombre);
  const roles = (c && Array.isArray(c.roles)) ? c.roles : [];
  let calidad = 'proveedor';
  if (roles.indexOf('Talento') !== -1) calidad = 'modelo';
  else if (roles.indexOf('Contacto cliente') !== -1) calidad = 'cliente';
  return {
    nombre: nombre || '',
    rut: (c && c.rut) || '',
    dom: c ? [c.direccion, c.comuna].filter(Boolean).join(', ') : '',
    rol: (c && (c.rolHabitual || (roles[0] || ''))) || '',
    email: (c && c.email) || '',
    calidad
  };
}
function legalFindBudgetRow(project, nombre) {
  if (!project || !nombre) return null;
  const d = project.data || {};
  const pools = [];
  if (d.servicios && typeof d.servicios === 'object') Object.keys(d.servicios).forEach(dep => { (d.servicios[dep] || []).forEach(r => pools.push(r)); });
  ['talentos', 'equipos', 'gastos'].forEach(k => { if (Array.isArray(d[k])) d[k].forEach(r => pools.push(r)); });
  return pools.find(r => r && r.nombre === nombre) || null;
}
function legalBudgetData(project, nombre) {
  const r = legalFindBudgetRow(project, nombre);
  if (!r) return { monto: null, jornadas: 1, dteReal: null };
  // Monto Neto = lo que recibe el proveedor: Costo Real ajustado por DTE Real
  // (boleta descuenta retención; factura no). Usa la lógica tributaria central.
  const dteR = (r.dteReal != null && r.dteReal !== '') ? r.dteReal : (r.dte || null);
  const base = (r.costoReal != null && r.costoReal !== '') ? r.costoReal : (r.valor != null ? r.valor : null);
  const neto = (base != null) ? montoNetoDesde(base, dteR) : null;
  return { monto: neto, jornadas: r.cantidad || 1, dteReal: dteR };
}
function legalDerechos(project) { return (project.data.infoProyecto || {}).derechos || { tiempo: '', plataformas: '', territorio: '' }; }
function legalHoyLargo() { return 'Santiago, ' + new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }); }

/* Reúne todas las variables del generador, con overrides del documento. */
function legalVars(gen) {
  const project = STATE.currentProject;
  const tpl = legalTplGet(gen.tpl) || {};
  const base = {};
  if (tpl.target === 'locacion') {
    const l = bdLocFind(gen.locId) || {};
    ensureLocShape(l); const _pc = locPrimaryContact(l) || {};
    base.locNombre = l.nombre || ''; base.locDir = locFullAddress(l);
    base.duenoNombre = _pc.nombre || ''; base.duenoRut = '';
  } else {
    const p = legalPersonData(gen.persName);
    const b = legalBudgetData(project, gen.persName);
    base.nombre = p.nombre; base.rut = p.rut; base.dom = p.dom; base.rol = p.rol; base.calidad = p.calidad; base.correo = p.email || '';
    base.monto = b.monto; base.jornadas = b.jornadas;
    base.horaExtra = '';   // V8.4.9: la hora extra ahora es un monto en pesos, no un %
    base.pago = gen.tpl === 'cesion' ? 60 : 30;
  }
  const ip = project.data.infoProyecto || {};
  const der = legalDerechos(project);
  base.cliente = ip.cliente || ''; base.proyecto = ip.nombreProyecto || project.name || ''; base.campaña = ip.campaña || ip.nombreProyecto || '';
  base.tiempo = der.tiempo || ''; base.plataformas = der.plataformas || ''; base.territorio = der.territorio || '';
  return Object.assign(base, gen.ov || {});
}

export function renderLegal() {
  const project = STATE.currentProject; if (!project) return;
  const st = _legalState();
  const content = document.getElementById('moduleContent');
  const banner = `<div class="lgl-warn" style="margin-bottom:14px;">⚠ <div><b>Documentos preliminares — no usar en producción real.</b> Por ahora las plantillas de TakeOS sirven para probar el flujo (UX) y <b>no están validadas legalmente</b>, salvo la estructura de la Cesión (basada en un contrato real de referencia). Cuando se carguen las versiones oficiales, se respetarán literalmente, sin resumir ni reinterpretar.</div></div>`;
  const subtabs = `<div class="lgl-subtabs">
    <button class="lgl-subtab ${st.sub === 'docs' ? 'on' : ''}" data-accion="lgl.sub" data-args="[&quot;docs&quot;]">Documentos</button>
    <button class="lgl-subtab ${st.sub === 'tpl' ? 'on' : ''}" data-accion="lgl.sub" data-args="[&quot;tpl&quot;]">Plantillas</button>
  </div>`;
  content.innerHTML = LEGAL_CSS + banner + subtabs + (st.sub === 'tpl' ? legalTplView() : legalDocsView(project));
}

function legalDocsView(project) {
  const st = _legalState();
  const e = escapeHtml;
  let docs = legalDocsForProject(project.id);
  const firm = docs.filter(d => d.estado === 'firmado').length;
  const pend = docs.filter(d => d.estado !== 'firmado').length;
  if (st.filtroTipo) docs = docs.filter(d => d.tipo === st.filtroTipo);
  if (st.filtroEstado) docs = docs.filter(d => d.estado === st.filtroEstado);
  if (st.fDesde) docs = docs.filter(d => (d.fechaGeneracion || '') >= st.fDesde);
  if (st.fHasta) docs = docs.filter(d => (d.fechaGeneracion || '') <= st.fHasta);
  if (st.q) { const q = st.q.toLowerCase(); docs = docs.filter(d => (d.contraparteNombre || '').toLowerCase().includes(q) || (d.rut || '').toLowerCase().includes(q)); }
  const kpi = `<div class="lgl-kpi">
    <div class="lgl-kpi-cell"><div class="lgl-kpi-label">Documentos</div><div class="lgl-kpi-val">${legalDocsForProject(project.id).length}</div><div class="lgl-kpi-sub">en este proyecto</div></div>
    <div class="lgl-kpi-cell"><div class="lgl-kpi-label">Firmados</div><div class="lgl-kpi-val" style="color:#74c486;">${firm}</div><div class="lgl-kpi-sub">cerrados</div></div>
    <div class="lgl-kpi-cell"><div class="lgl-kpi-label">En proceso</div><div class="lgl-kpi-val" style="color:#d9b256;">${pend}</div><div class="lgl-kpi-sub">por enviar o firmar</div></div>
    <div class="lgl-kpi-cell"><div class="lgl-kpi-label">Plantillas</div><div class="lgl-kpi-val">${BD_LEGAL_TPL.length}</div><div class="lgl-kpi-sub">disponibles</div></div>
  </div>`;
  const filtros = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
    <div class="lgl-filtros">
      <input placeholder="Buscar nombre o RUT…" value="${e(st.q)}" data-accion="lgl.q" data-on="input">
      <select ${accionHTML('lgl.filtro', 'filtroTipo', { on: 'change' })}><option value="">Todos los tipos</option>${legalAllTplEntries().map(en => `<option value="${en.id}" ${st.filtroTipo === en.id ? 'selected' : ''}>${e(en.tpl.nombre)}</option>`).join('')}</select>
      <select ${accionHTML('lgl.filtro', 'filtroEstado', { on: 'change' })}><option value="">Todos los estados</option>${LEGAL_FLOW.map(s => `<option value="${s}" ${st.filtroEstado === s ? 'selected' : ''}>${LEGAL_EST[s]}</option>`).join('')}</select>
      <span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--ink-faint);">Generado entre <input type="date" value="${e(st.fDesde)}" ${accionHTML('lgl.filtro', 'fDesde', { on: 'change' })}> y <input type="date" value="${e(st.fHasta)}" ${accionHTML('lgl.filtro', 'fHasta', { on: 'change' })}></span>
    </div>
    <button class="btn btn-primary btn-sm" data-accion="lgl.gen">+ Generar documento</button>
  </div>`;
  let tabla;
  if (!docs.length) {
    tabla = `<div class="alert alert-info"><span class="alert-icon">ℹ</span><div>${legalDocsForProject(project.id).length ? 'Ningún documento con esos filtros.' : 'Aún no hay documentos en este proyecto. Genera el primero desde una plantilla con <strong>+ Generar documento</strong>.'}</div></div>`;
  } else {
    tabla = `<div class="cot-card" style="padding:6px 10px;overflow-x:auto;"><table class="lgl-tbl"><thead><tr><th>Documento</th><th>Contraparte</th><th>Estado</th><th>Versión</th><th>Fecha</th><th></th></tr></thead><tbody>${docs.map(d => `<tr>
      <td><span class="lgl-pill">${e((legalTplGet(d.tipo) || {}).nombre || d.tipo)}</span>${(legalTplGet(d.tipo) || {}).draft ? ' <span style="color:#e0b66a;font-size:10.5px;">· borrador</span>' : ''}</td>
      <td>${e(d.contraparteNombre || '—')}<div style="font-size:11px;color:var(--ink-faint);">${e(d.rolCalidad || '')}${d.rut ? ' · ' + e(d.rut) : ''}</div></td>
      <td><span class="lgl-est ${d.estado}">${LEGAL_EST[d.estado]}</span></td>
      <td style="color:var(--ink-faint);">v${d.version}</td>
      <td style="color:var(--ink-faint);white-space:nowrap;">${e(d.fechaGeneracion || '')}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn btn-secondary btn-sm" ${accionHTML('lgl.verDoc', d.docId)}>Ver</button>
        ${d.estado === 'generado' ? `<button class="btn btn-secondary btn-sm" ${accionHTML('lgl.avanzar', d.docId)}>Marcar enviado</button>` : ''}
        ${d.estado === 'enviado' ? `<label class="btn btn-secondary btn-sm" style="cursor:pointer;" title="Para marcar como firmado, sube el PDF firmado">📎 Marcar firmado (subir PDF)<input type="file" accept="application/pdf,.pdf" style="display:none" ${accionHTML('lgl.firmado', d.docId, { on: 'change' })}></label>` : ''}
        ${d.estado === 'firmado' && d.pdfUrl ? `<button class="btn btn-secondary btn-sm" ${accionHTML('lgl.pdf', d.pdfUrl)}>Ver PDF firmado ↗</button>` : ''}
        <button class="btn btn-secondary btn-sm" style="color:#d08;border-color:rgba(210,0,80,.4);" ${accionHTML('lgl.borrarDoc', d.docId)} title="Eliminar documento">Eliminar</button>
      </td></tr>`).join('')}</tbody></table></div>
    <div class="config-hint" style="margin-top:8px;">Cada documento queda archivado en la BD de Legal (transversal) y es trazable por persona: ves quién firmó qué y en qué versión. Ciclo: Borrador → Generado → Enviado → Firmado.</div>`;
  }
  return kpi + filtros + tabla;
}

function legalTplView() {
  const e = escapeHtml; const admin = !!STATE.adminMode;
  const entries = legalAllTplEntries();
  const customCards = entries.map(en => {
    const t = en.tpl;
    return `<div class="lgl-tplcard">
      <div><div class="nm">${e(t.nombre)} <span style="font-size:10px;color:var(--accent);border:1px solid var(--accent-soft, #cfcfc4);border-radius:4px;padding:1px 6px;margin-left:4px;text-transform:uppercase;letter-spacing:.04em;">personalizada</span></div><div class="ds">${e(t.desc || '')}</div></div>
      <div style="display:flex;gap:8px;align-items:center;white-space:nowrap;">
        <button class="btn btn-secondary btn-sm" ${accionHTML('lgl.usarTpl', en.id)}>Ver / usar</button>
        ${admin ? `<button class="btn btn-secondary btn-sm" ${accionHTML('lgl.editTpl', en.id)}>Editar</button><button class="btn btn-secondary btn-sm" style="color:#d08;border-color:rgba(210,0,80,.4);" ${accionHTML('lgl.borrarTpl', en.id)}>Eliminar</button>` : ''}
      </div></div>`;
  }).join('');
  const top = admin
    ? `<div class="lgl-warn">\u26a0 <div><b>Modo Administrador activo.</b> Puedes crear, editar y eliminar plantillas. <b>El contenido legal es tu responsabilidad:</b> rev\u00edsalo con un abogado antes de usarlo en producci\u00f3n.</div></div>`
    : `<div class="lgl-lock">\ud83d\udd12 <div>Solo un <b>Administrador</b> puede crear o editar plantillas (act\u00edvalo abajo en el men\u00fa lateral: "Modo admin"). El resto usa las plantillas para generar documentos.</div></div>`;
  return `${top}
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint);margin:16px 0 8px;">Plantillas</div>
    ${entries.length ? customCards : '<div class="config-hint" style="margin-bottom:8px;">A\u00fan no hay plantillas. Crea la primera con el bot\u00f3n de abajo.</div>'}
    ${admin ? `<button class="btn btn-primary btn-sm" style="margin-top:6px;" data-accion="lgl.nuevaTpl">+ Nueva plantilla</button>` : ''}`;
}
function _numeroALetras(num) {
  num = Math.floor(Math.abs(Number(num) || 0));
  if (num === 0) return 'cero';
  const U = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'diecis\u00e9is', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintid\u00f3s', 'veintitr\u00e9s', 'veinticuatro', 'veinticinco', 'veintis\u00e9is', 'veintisiete', 'veintiocho', 'veintinueve'];
  const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
  function dos(n) { if (n < 30) return U[n]; const d = Math.floor(n / 10), u = n % 10; return u === 0 ? D[d] : D[d] + ' y ' + U[u]; }
  function tres(n) { if (n === 100) return 'cien'; const c = Math.floor(n / 100), r = n % 100; return (c ? C[c] : '') + (c && r ? ' ' : '') + (r ? dos(r) : ''); }
  const millones = Math.floor(num / 1000000), miles = Math.floor((num % 1000000) / 1000), resto = num % 1000;
  let out = '';
  if (millones) out += (millones === 1) ? 'un mill\u00f3n' : (tres(millones) + ' millones');
  if (miles) { out += (out ? ' ' : ''); out += (miles === 1) ? 'mil' : (tres(miles) + ' mil'); }
  if (resto) out += (out ? ' ' : '') + tres(resto);
  return out.trim();
}
function _montoEnPalabras(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (!n) return '';
  const palabras = _numeroALetras(n);
  const de = /mill\u00f3n$|millones$/.test(palabras) ? 'de ' : '';
  let full = palabras + ' ' + de + (n === 1 ? 'peso chileno' : 'pesos chilenos');
  full = full.replace(/veintiuno(?=( mil| millones| de | pesos?))/g, 'veinti\u00fan').replace(/\buno(?=( mil| millones| de | pesos?))/g, 'un');
  return full;
}
function _fechaLargaES(iso) {
  if (!iso) return '';
  const s = String(iso).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  try { return new Date(s + 'T00:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return s; }
}
function _legalTextToHtml(text) {
  let s = escapeHtml(String(text || ''));
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\n/g, '<br>');
  return s;
}
function _htmlToLegalText(node) {
  if (!node || !node.childNodes) return '';
  let out = '';
  node.childNodes.forEach(function (n) {
    if (n.nodeType === 3) { out += n.nodeValue; return; }
    if (n.nodeType !== 1) return;
    const tag = (n.tagName || '').toLowerCase();
    if (tag === 'br') { out += '\n'; return; }
    const fw = n.style && n.style.fontWeight;
    const isBold = tag === 'b' || tag === 'strong' || fw === 'bold' || (fw && parseInt(fw, 10) >= 600);
    if (isBold) { const inner = _htmlToLegalText(n); out += /\S/.test(inner) ? '**' + inner.replace(/\*\*/g, '') + '**' : inner; return; }
    if (tag === 'div' || tag === 'p') { if (out && !/\n$/.test(out)) out += '\n'; out += _htmlToLegalText(n); if (!/\n$/.test(out)) out += '\n'; return; }
    out += _htmlToLegalText(n);
  });
  return out;
}
function legalTplPreviewHTML(text) {
  const e = escapeHtml; const R = legalRep();
  const nombre = ((document.getElementById('ltpl_nombre') || {}).value || '').trim() || 'Documento';
  let safe = e(String(text || ''));
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/\{\{\s*([a-zA-Z0-9_\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1]+)\s*\}\}/g, function (mm, k) { return '<span class="lgl-v">' + e('{{' + k + '}}') + '</span>'; });
  const html = safe.split(/\n{2,}/).map(function (p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; }).join('');
  return '<div class="logo">' + e(R.marca) + '</div><h4>' + e(nombre) + '</h4><div class="lgl-custom-body">' + html + '</div>';
}
function legalTplUpdatePreview() {
  const ed = document.getElementById('ltpl_cuerpo'); const pv = document.getElementById('ltplPreview');
  if (!ed || !pv) return;
  const text = _htmlToLegalText(ed).replace(/\n{3,}/g, '\n\n');
  pv.innerHTML = legalTplPreviewHTML(text);
}
function openLegalTplEditor(id) {
  if (!STATE.adminMode) { showToast({ kind: 'warning', title: 'Solo Administrador', body: 'Activa el Modo Administrador para crear o editar plantillas.' }); return; }
  const e = escapeHtml;
  const t = id ? (BD_LEGAL_TPL.find(x => x.id === id) || null) : null;
  const nombre = t ? (t.nombre || '') : ''; const desc = t ? (t.desc || '') : '';
  const target = t ? (t.target || 'persona') : 'persona'; const completar = t ? (t.completar || 'sistema') : 'sistema';
  const cuerpo = t ? (t.cuerpo || '') : '';
  const VARS = [
    ['Contraparte', ['nombre_contraparte', 'rut_contraparte', 'domicilio_contraparte', 'correo_contraparte', 'rol_contraparte']],
    ['Monto', ['monto_neto', 'monto_texto', 'cantidad_jornadas', 'hora_extra', 'pago_dias']],
    ['Proyecto', ['nombre_proyecto', 'nombre_cliente', 'nombre_campaña', 'tiempo_derechos', 'plataformas_derechos', 'territorio_derechos', 'fechas_rodaje']],
    ['Fechas (calendario)', ['fecha_firma', 'fecha_vigencia', 'fecha_termino']],
    ['Locación', ['nombre_locacion', 'direccion_locacion', 'nombre_dueno_locacion', 'rut_dueno_locacion']],
    ['Productora (fijas)', ['nombre_productora', 'razon_social_productora', 'rut_productora', 'representante_productora', 'rut_representante_productora', 'domicilio_productora', 'fecha_hoy']]
  ];
  const chips = VARS.map(grp => `<div style="margin-bottom:8px;"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint);margin-bottom:3px;">${grp[0]}</div><div style="display:flex;gap:5px;flex-wrap:wrap;">${grp[1].map(k => `<button type="button" class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:11px;" ${accionHTML('lgl.tplVar', k, { on: 'mousedown click' })}>${k}</button>`).join('')}</div></div>`).join('');
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal" style="max-width:900px;width:96vw;max-height:90vh;overflow:auto;">
    <div class="modal-header"><div class="modal-title">${id ? 'Editar plantilla' : 'Nueva plantilla'}</div><button class="go-x" data-accion="ui.cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--ink-mut);">\u00d7</button></div>
    <div class="modal-body">
      <div class="lgl-warn">\u26a0 <div>El contenido legal es tu responsabilidad. Val\u00eddalo con un abogado antes de usarlo en producci\u00f3n.</div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="form-row"><label class="form-label">Nombre</label><input class="input" id="ltpl_nombre" value="${e(nombre)}" placeholder="Cesión de Derechos de Imagen…" data-accion="lgl.tplPrev" data-on="input"><div class="config-hint" style="margin-top:3px;">Se usa como <b>título del documento exportado</b>.</div></div>
        <div class="form-row"><label class="form-label">Descripción</label><input class="input" id="ltpl_desc" value="${e(desc)}" placeholder="Para qué sirve (uso interno)"><div class="config-hint" style="margin-top:3px;">Información interna. <b>No aparece</b> en el documento final.</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="form-row"><label class="form-label">Contraparte</label><select class="input" id="ltpl_target"><option value="persona" ${target === 'persona' ? 'selected' : ''}>Persona (BD Personas)</option><option value="locacion" ${target === 'locacion' ? 'selected' : ''}>Locaci\u00f3n (BD Locaciones)</option></select></div>
        <div class="form-row"><label class="form-label">C\u00f3mo se completa por defecto</label><select class="input" id="ltpl_completar"><option value="sistema" ${completar === 'sistema' ? 'selected' : ''}>Desde el sistema (exige campos)</option><option value="posterior" ${completar === 'posterior' ? 'selected' : ''}>En set / posteriormente (permite blancos)</option></select></div>
      </div>
      <div style="margin-top:6px;">
        <label class="form-label">Variables</label>
        <div style="border:1px solid var(--rule);border-radius:var(--radius-sm);padding:8px 10px;max-height:150px;overflow:auto;">${chips}</div>
        <div class="config-hint" style="margin-top:4px;">Haz clic para insertarlas en el cuerpo, en la posición del cursor. Las "fijas" salen de la identidad de la productora; las de "Fechas" se eligen con calendario al generar el documento.</div>
      </div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;margin-top:10px;">
        <div class="form-row">
          <label class="form-label">Cuerpo del documento</label>
          <div style="margin-bottom:6px;display:flex;align-items:center;gap:8px;"><button type="button" class="btn btn-secondary btn-sm" style="font-weight:800;padding:2px 11px;" data-accion="lgl.tplBold" data-on="mousedown click">B</button><span class="config-hint">Selecciona texto y pulsa <b>B</b> (o <b>Cmd/Ctrl + B</b>) para negrita.</span></div>
          <div class="input lgl-rte" id="ltpl_cuerpo" contenteditable="true" data-placeholder="Escribe el texto del documento. Inserta variables con los botones de arriba, por ejemplo {{nombre_contraparte}}. Deja una línea en blanco entre párrafos." data-accion="lgl.tplPrev" data-on="input">${_legalTextToHtml(cuerpo)}</div>
        </div>
        <div class="form-row">
          <label class="form-label">Vista previa en vivo</label>
          <div class="lgl-paper" id="ltplPreview" style="max-height:460px;overflow:auto;"></div>
        </div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" data-accion="ui.cerrar">Cancelar</button><button class="btn btn-primary" ${accionHTML('lgl.tplSave', id || null)}>${id ? 'Guardar cambios' : 'Crear plantilla'}</button></div>
  </div></div>`;
  setTimeout(function () { legalTplUpdatePreview(); }, 0);
}
function legalTplInsertVar(token) {
  const ed = document.getElementById('ltpl_cuerpo'); if (!ed) return;
  ed.focus();
  let done = false;
  try { done = document.execCommand('insertText', false, token); } catch (e) {}
  if (!done) { ed.appendChild(document.createTextNode(token)); }
  legalTplUpdatePreview();
}
function legalTplWrapBold() {
  const ed = document.getElementById('ltpl_cuerpo'); if (!ed) return;
  ed.focus();
  try { document.execCommand('styleWithCSS', false, false); } catch (e) {}
  try { document.execCommand('bold', false, null); } catch (e) {}
  legalTplUpdatePreview();
}
function legalTplSave(id) {
  if (!STATE.adminMode) { showToast({ kind: 'warning', title: 'Solo Administrador', body: 'Activa el Modo Administrador.' }); return; }
  const v = x => ((document.getElementById(x) || {}).value || '').trim();
  const nombre = v('ltpl_nombre'); const _ed = document.getElementById('ltpl_cuerpo'); const cuerpo = _ed ? _htmlToLegalText(_ed).replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim() : '';
  if (!nombre) { showToast({ kind: 'warning', title: 'Falta el nombre', body: 'Ponle un nombre a la plantilla.' }); return; }
  if (!cuerpo.trim()) { showToast({ kind: 'warning', title: 'Falta el cuerpo', body: 'El documento no puede quedar vac\u00edo.' }); return; }
  const target = v('ltpl_target') === 'locacion' ? 'locacion' : 'persona';
  const completar = v('ltpl_completar') === 'posterior' ? 'posterior' : 'sistema';
  const desc = v('ltpl_desc');
  if (id) {
    const t = BD_LEGAL_TPL.find(x => x.id === id);
    if (t) { t.nombre = nombre; t.desc = desc; t.target = target; t.completar = completar; t.cuerpo = cuerpo; } _dalLegalTplSaveSoon(id);
    markDirty(); autosaveNow(); closeModal(); renderLegal();
    showToast({ kind: 'success', title: 'Plantilla actualizada', body: nombre });
    return;
  }
  const _ntid = legalTplNuevoId(); BD_LEGAL_TPL.push({ id: _ntid, nombre: nombre, desc: desc, target: target, completar: completar, cuerpo: cuerpo, custom: true }); _dalLegalTplSaveSoon(_ntid);
  markDirty(); autosaveNow(); closeModal(); renderLegal();
  showToast({ kind: 'success', title: 'Plantilla creada', body: nombre });
}
function legalTplDelete(id) {
  if (!STATE.adminMode) { showToast({ kind: 'warning', title: 'Solo Administrador', body: 'Activa el Modo Administrador.' }); return; }
  const t = BD_LEGAL_TPL.find(x => x.id === id); if (!t) return;
  showModal({ title: 'Eliminar plantilla', body: '\u00bfEliminar la plantilla personalizada "' + (t.nombre || id) + '"? Los documentos ya generados con ella se conservan, pero no podr\u00e1s generar nuevos.', confirmLabel: 'Eliminar', cancelLabel: 'Cancelar', danger: true, onConfirm: function () {
    const i = BD_LEGAL_TPL.findIndex(x => x.id === id); if (i >= 0) BD_LEGAL_TPL.splice(i, 1); dalEliminarLegalTpl(id);
    markDirty(); autosaveNow(); closeModal(); renderLegal();
    showToast({ kind: 'success', title: 'Plantilla eliminada', body: t.nombre || id });
  } });
}

/* ── Generador ── */
function openLegalGen() { if (!BD_LEGAL_TPL.length) { showToast({ kind: 'warning', title: 'No hay plantillas', body: 'Crea una plantilla en la pestaña Plantillas antes de generar un documento.' }); return; } const first = legalAllContactNames()[0] || ''; _legalState().gen = { tpl: BD_LEGAL_TPL[0].id, persName: first, locId: (BD_LOC[0] || {}).locId || '', docId: null, ov: {} }; drawLegalGen(); }
function openLegalGenTpl(tpl) { const first = legalAllContactNames()[0] || ''; _legalState().gen = { tpl: tpl, persName: first, locId: (BD_LOC[0] || {}).locId || '', docId: null, ov: {} }; drawLegalGen(); }
function openLegalGenDoc(docId) {
  const d = BD_LEGAL.find(x => x.docId === docId); if (!d) return;
  _legalState().gen = { tpl: d.tipo, persName: d.contraparteNombre, locId: d.locacionId || '', docId: docId, ov: Object.assign({}, d.vars || {}) };
  drawLegalGen();
}
function legalGenPickTpl(tpl) { const g = _legalState().gen; g.tpl = tpl; g.ov = {}; drawLegalGen(); }
function legalGenSetPers(name) { const g = _legalState().gen; g.persName = name; g.ov = {}; drawLegalGen(); }
function legalGenSetLoc(locId) { const g = _legalState().gen; g.locId = locId; g.ov = {}; drawLegalGen(); }
function _legalTextoVar(baseVal) {
  if (baseVal == null || baseVal === '') return '';
  const str = String(baseVal);
  const num = parseInt(str.replace(/[^0-9]/g, ''), 10) || 0;
  if (!num) return '';
  if (/%/.test(str)) return _numeroALetras(num) + ' por ciento';
  return _montoEnPalabras(num);
}
function legalMoneyFmt(raw) {
  const n = String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
  if (!n) return '';
  return '$' + Number(n).toLocaleString('es-CL') + ' CLP';
}
function legalMoneyInput(el, key) {
  const f = legalMoneyFmt(el.value);
  el.value = f;
  legalGenSetOv(key, f);
}
function legalGenSetOv(key, value) { const g = _legalState().gen; if (!g.ov) g.ov = {}; g.ov[key] = value; const pv = document.getElementById('lglPreview'); if (pv) pv.innerHTML = legalRenderBody(g, false); }

function drawLegalGen() {
  const g = _legalState().gen; const t = legalTplGet(g.tpl) || {}; const e = escapeHtml;
  const tplPick = `<div class="lgl-tplpick">${legalAllTplEntries().map(en => `<button class="lgl-tplbtn ${g.tpl === en.id ? 'on' : ''}" ${accionHTML('lgl.pickTpl', en.id)}><div class="tn">${e(en.tpl.nombre)}</div><div class="td">${e(en.tpl.desc || '')}</div>${en.oficial ? (en.tpl.draft ? '<div class="draft">preset · revisar</div>' : '<div class="vald">preset</div>') : '<div class="draft">personalizada</div>'}</button>`).join('')}</div>`;
  let contraparte;
  if (t.target === 'locacion') {
    const opts = BD_LOC.length ? BD_LOC.map(l => `<option value="${e(l.locId)}" ${g.locId === l.locId ? 'selected' : ''}>${e(l.nombre || l.locId)}</option>`).join('') : '<option value="">(no hay locaciones en la BD)</option>';
    contraparte = `<div class="lgl-field"><label>Locación (contraparte = dueño) <span class="src bd">BD Locaciones</span></label><select class="input" data-accion="lgl.setLoc" data-on="change">${opts}</select></div>`;
  } else {
    contraparte = `<div class="lgl-field"><label>Contraparte <span class="src bd">BD Personas</span></label><span class="combobox-wrap cbx-anchored" style="display:block;"><input class="input combobox-input" value="${e(g.persName || '')}" placeholder="Escribe para buscar en la Base de Datos…" autocomplete="off" data-accion="lgl.persCombo" data-on="focus input blur change"><div class="combobox-dropdown" hidden></div></span></div>`;
  }
  const body = `<div class="modal-backdrop"><div class="modal" style="max-width:960px;width:96vw;max-height:90vh;overflow:auto;">
    <div class="modal-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;"><div><div class="modal-title">${g.docId ? 'Ver / editar documento' : 'Generar documento'}</div><div style="font-size:12px;color:var(--ink-mut);margin-top:3px;">Variables autollenadas desde el sistema · exporta a PDF con marca</div></div><button class="go-x" data-accion="ui.cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--ink-mut);line-height:1;">×</button></div>
    <div class="modal-body">
      ${t.draft ? `<div class="lgl-warn">⚠ <div>Esta plantilla es un <b>borrador redactado por TakeOS</b>. Antes de usarla en producción, valídala con un abogado. El contenido legal es responsabilidad del usuario.</div></div>` : ''}
      <div class="lgl-gen-grid">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint);margin-bottom:7px;">Plantilla</div>
          ${tplPick}
          ${contraparte}
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint);margin:12px 0 7px;">Variables</div>
          ${legalGenFields(g)}
          <div class="config-hint" style="margin-top:8px;">Las variables se traen del sistema; puedes ajustarlas aquí para este documento sin tocar la fuente.</div>
          ${(() => { const modo = legalCompletarModo(g); return `<div style="margin-top:12px;border-top:1px solid var(--rule);padding-top:11px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint);margin-bottom:7px;">¿Cómo se completa este documento?</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-sm ${modo === 'sistema' ? 'btn-primary' : 'btn-secondary'}" data-accion="lgl.completar" data-args="[&quot;sistema&quot;]">Desde el sistema</button>
              <button class="btn btn-sm ${modo === 'posterior' ? 'btn-primary' : 'btn-secondary'}" data-accion="lgl.completar" data-args="[&quot;posterior&quot;]">En set / posteriormente</button>
            </div>
            <div class="config-hint" style="margin-top:6px;">${modo === 'sistema' ? 'Se exigen los datos obligatorios antes de exportar el PDF.' : 'Se exporta con campos en blanco para llenar a mano (ej. cesión para firmar en set o formulario para la contraparte).'}</div>
          </div>`; })()}
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint);margin-bottom:7px;">Vista previa</div>
          <div class="lgl-paper" id="lglPreview">${legalRenderBody(g, false)}</div>
        </div>
      </div>
    </div>
    <div class="modal-footer"><span class="config-hint" style="margin-right:auto;">Exporta a PDF con identidad de marca · se versiona al generar.</span>
      <button class="btn" data-accion="ui.cerrar">Cerrar</button>
      <button class="btn btn-secondary" data-accion="lgl.exportar">Exportar PDF</button>
      <button class="btn btn-primary" data-accion="lgl.generar">${g.docId ? 'Guardar nueva versión' : 'Generar'}</button>
    </div>
  </div></div>`;
  document.getElementById('modalRoot').innerHTML = body;
}

/* V8.3.3 — validación de datos obligatorios + modo de completado del documento.
   'sistema': se exige completar antes de exportar. 'posterior': se permite
   exportar con blancos (llenar a mano en set / por la contraparte). */
const LEGAL_REQUIRED = { servicios: ['nombre', 'rut', 'dom', 'monto', 'rol'], cesion: ['nombre', 'rut', 'dom', 'monto', 'cliente', 'campaña', 'tiempo', 'plataformas', 'territorio'], nda: ['nombre', 'rut', 'dom', 'cliente'], arriendo: ['locNombre', 'locDir', 'duenoNombre', 'duenoRut', 'proyecto'] };
const LEGAL_VAR_LABEL = { nombre: 'Nombre de la contraparte', rut: 'RUT', dom: 'Domicilio', monto: 'Monto Neto', rol: 'Rol / servicio', cliente: 'Cliente', 'campaña': 'Campaña', tiempo: 'Tiempo de derechos', plataformas: 'Plataformas', territorio: 'Territorio', locNombre: 'Locación', locDir: 'Dirección', duenoNombre: 'Contraparte (dueño/contacto)', duenoRut: 'RUT de la contraparte', proyecto: 'Proyecto', nombre_contraparte: 'Nombre de la contraparte', rut_contraparte: 'RUT de la contraparte', domicilio_contraparte: 'Domicilio de la contraparte', correo_contraparte: 'Correo de la contraparte', rol_contraparte: 'Rol / servicio', monto_neto: 'Monto neto', monto_texto: 'Monto (texto)', jornadas_trabajo: 'Jornadas', cantidad_jornadas: 'Jornadas', hora_extra_texto: 'Valor hora extra (texto)', hora_extra: 'Valor hora extra', pago_dias: 'Pago a (días)', nombre_cliente: 'Cliente', 'nombre_campaña': 'Campaña', nombre_proyecto: 'Proyecto', tiempo_derechos: 'Tiempo de derechos', plataformas_derechos: 'Plataformas', territorio_derechos: 'Territorio', nombre_locacion: 'Locación', direccion_locacion: 'Dirección de la locación', nombre_dueno_locacion: 'Dueño / contacto de la locación', rut_dueno_locacion: 'RUT del dueño', nombre_productora: 'Nombre de la productora', razon_social_productora: 'Razón social de la productora', rut_productora: 'RUT de la productora', representante_productora: 'Representante de la productora', rut_representante_productora: 'RUT del representante', domicilio_productora: 'Domicilio de la productora', fechas_rodaje: 'Fecha(s) de rodaje', fecha_firma: 'Fecha de firma', fecha_vigencia: 'Fecha de vigencia', fecha_termino: 'Fecha de término', fecha_hoy: 'Fecha' };
function legalCompletarModo(g) { return (g && g.completarModo) || (legalTplGet(g.tpl) || {}).completar || 'sistema'; }
function legalSetCompletar(modo) { const g = _legalState().gen; if (!g) return; g.completarModo = (modo === 'posterior') ? 'posterior' : 'sistema'; drawLegalGen(); }
function legalMissingRequired(g) {
  const _ct = legalTplGet(g.tpl);
  if (_ct && _ct.custom) {
    const map = legalVarMap(g);
    const skip = ['marca', 'razon', 'rutEmp', 'rep', 'rutRep', 'domEmp', 'hoy', 'nombre_productora', 'razon_social_productora', 'rut_productora', 'representante_productora', 'rut_representante_productora', 'domicilio_productora', 'monto_texto', 'fecha_hoy'];
    const vars = legalCustomVars(_ct).filter(k => skip.indexOf(k) === -1);
    const miss = [];
    vars.forEach(k => { const v = map[k]; const empty = (k === 'monto') ? !(Number(v) > 0) : !(v != null && String(v).trim()); if (empty) miss.push(LEGAL_VAR_LABEL[k] || k); });
    return miss;
  }
  const req = LEGAL_REQUIRED[g.tpl] || [];
  const vr = legalVars(g);
  const missing = [];
  req.forEach(k => {
    const v = vr[k];
    const empty = (k === 'monto') ? !(Number(v) > 0) : !(v != null && String(v).trim());
    if (empty) missing.push(LEGAL_VAR_LABEL[k] || k);
  });
  return missing;
}

/* V8.3.4 — modal de "faltan datos" reutilizable por export y por guardar.
   El backdrop/botón vuelve al generador (drawLegalGen) con g intacto. */
function legalShowMissing(miss) {
  const e = escapeHtml;
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-accion="lgl.volverBg"><div class="modal" style="max-width:470px;"><div class="modal-header"><div class="modal-title">Faltan datos obligatorios</div></div><div class="modal-body"><p style="margin:0 0 10px;">Este documento se completa <b>desde el sistema</b>, así que no se puede generar ni exportar con campos en blanco. Faltan:</p><ul style="margin:0 0 6px 18px;padding:0;">${miss.map(x => `<li>${e(x)}</li>`).join('')}</ul><p class="config-hint" style="margin:10px 0 0;">Complétalos arriba; o si es un documento para llenar a mano (en set o por la contraparte), cámbialo a <b>"En set / posteriormente"</b>.</p></div><div class="modal-footer"><button class="btn btn-primary" data-accion="lgl.volver">Volver a completar</button></div></div></div>`;
}

function legalGenFields(g) {
  const e = escapeHtml; const t = legalTplGet(g.tpl) || {}; const vr = legalVars(g);
  const fld = (key, label, src, val) => `<div class="lgl-field"><label>${label} <span class="src ${src}">${src === 'bd' ? 'BD' : src === 'pres' ? 'Presupuesto' : src === 'info' ? 'Info Proyecto' : 'Derechos'}</span></label><input class="input" value="${e(val == null ? '' : String(val))}" ${accionHTML('lgl.ov', key, { on: 'change' })}></div>`;
  if (t.custom) {
    const map = legalVarMap(g);
    const skip = ['marca', 'razon', 'rutEmp', 'rep', 'rutRep', 'domEmp', 'hoy', 'nombre_productora', 'razon_social_productora', 'rut_productora', 'representante_productora', 'rut_representante_productora', 'domicilio_productora', 'monto_texto', 'fecha_hoy'];
    const vars = legalCustomVars(t).filter(k => skip.indexOf(k) === -1 && !/_texto$/.test(k));
    if (!vars.length) return '<div class="config-hint">Esta plantilla no usa variables editables (texto fijo, montos automáticos o datos de la productora).</div>';
    return vars.map(k => {
      const _lbl = `<label>${e(LEGAL_VAR_LABEL[k] || k)} <span class="src bd">${e(k)}</span></label>`;
      if (/monto/i.test(k) || k === 'hora_extra') {
        return `<div class="lgl-field">${_lbl}<input class="input" inputmode="numeric" value="${e(legalMoneyFmt(map[k]))}" ${accionHTML('lgl.money', k, { on: 'input' })}></div>`;
      }
      if (/fecha/i.test(k) && k !== 'fechas_rodaje') {
        return `<div class="lgl-field">${_lbl}<input class="input" type="date" value="${e(_toISODate((g.ov && g.ov[k]) || ''))}" ${accionHTML('lgl.ov', k, { on: 'change' })}></div>`;
      }
      return `<div class="lgl-field">${_lbl}<input class="input" value="${e(map[k] == null ? '' : String(map[k]))}" ${accionHTML('lgl.ov', k, { on: 'change' })}></div>`;
    }).join('');
  }
  if (t.target === 'locacion') {
    return fld('locNombre', 'Locación', 'bd', vr.locNombre) + fld('locDir', 'Dirección', 'bd', vr.locDir) + `<div class="lgl-frow">${fld('duenoNombre', 'Dueño', 'bd', vr.duenoNombre)}${fld('duenoRut', 'RUT dueño', 'bd', vr.duenoRut)}</div>` + fld('proyecto', 'Proyecto', 'info', vr.proyecto);
  }
  let f = `<div class="lgl-frow">${fld('nombre', 'Nombre', 'bd', vr.nombre)}${fld('rut', 'RUT', 'bd', vr.rut)}</div>` + fld('dom', 'Domicilio', 'bd', vr.dom);
  if (g.tpl === 'servicios' || g.tpl === 'cesion') {
    f += `<div class="lgl-frow">${fld('monto', 'Monto Neto', 'pres', vr.monto != null ? locMoney(vr.monto) : '')}${fld('jornadas', 'Jornadas', 'pres', vr.jornadas)}</div>`;
    f += `<div class="lgl-frow">${fld('horaExtra', 'Hora extra', 'pres', vr.horaExtra)}${fld('pago', 'Pago a (días)', 'pres', vr.pago)}</div>`;
  }
  if (g.tpl === 'cesion') {
    f += `<div class="lgl-frow">${fld('cliente', 'Cliente', 'info', vr.cliente)}${fld('campaña', 'Campaña', 'info', vr.campaña)}</div>`;
    f += `<div class="lgl-frow">${fld('tiempo', 'Tiempo derechos', 'der', vr.tiempo)}${fld('plataformas', 'Plataformas', 'der', vr.plataformas)}</div>` + fld('territorio', 'Territorio', 'der', vr.territorio);
  }
  if (g.tpl === 'nda') { f += fld('cliente', 'Cliente / proyecto', 'info', (vr.cliente || '') + (vr.proyecto ? ' — ' + vr.proyecto : '')); }
  if (g.tpl === 'servicios') { f += fld('rol', 'Rol / servicio', 'bd', vr.rol); }
  return f;
}

/* Cuerpo del documento. forPrint=true → sin resaltado de variables. */
function legalTplNuevoId() { let i = 1; while (BD_LEGAL_TPL.some(t => t.id === 'tpl_' + i)) i++; return 'tpl_' + i; }
function legalTplGet(id) {
  if (LEGAL_TPL[id]) return Object.assign({ oficial: true }, LEGAL_TPL[id]);
  return BD_LEGAL_TPL.find(t => t.id === id) || null;
}
function legalAllTplEntries() {
  return BD_LEGAL_TPL.map(t => ({ id: t.id, tpl: t, oficial: false }));
}
function legalCustomVars(tpl) {
  const set = []; const re = /\{\{\s*([a-zA-Z0-9_\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1]+)\s*\}\}/g; let m;
  while ((m = re.exec(String((tpl && tpl.cuerpo) || '')))) { if (set.indexOf(m[1]) === -1) set.push(m[1]); }
  return set;
}
function legalVarMap(g) {
  const vr = legalVars(g); const R = legalRep();
  const ov = (g && g.ov) || {};
  const hoy = legalHoyLargo();
  const _prRodajes = (STATE.currentProject && STATE.currentProject.data && STATE.currentProject.data.rodajes) || [];
  const fechasRodaje = _prRodajes.filter(x => x.activo && x.fecha).map(x => _fechaCorta(x.fecha)).join(', ');
  let montoTxt;
  const ovMT = (ov.montoTxt != null && String(ov.montoTxt).trim() !== '') ? ov.montoTxt
             : ((ov.monto_texto != null && String(ov.monto_texto).trim() !== '') ? ov.monto_texto : null);
  if (ovMT != null) { montoTxt = String(ovMT); }
  else { const monto = vr.monto; montoTxt = (monto != null && monto !== '') ? (typeof monto === 'number' ? locMoney(monto) : String(monto)) : ''; }
  const map = Object.assign({}, vr, {
    marca: R.marca, razon: R.razon, rutEmp: R.rutEmp, rep: R.rep, rutRep: R.rutRep, domEmp: R.domEmp, hoy: hoy, montoTxt: montoTxt,
    nombre_contraparte: vr.nombre, rut_contraparte: vr.rut, domicilio_contraparte: vr.dom, correo_contraparte: vr.correo, rol_contraparte: vr.rol,
    monto_neto: vr.monto, monto_texto: montoTxt, jornadas_trabajo: vr.jornadas, cantidad_jornadas: vr.jornadas, hora_extra: vr.horaExtra, pago_dias: vr.pago,
    nombre_cliente: vr.cliente, 'nombre_campaña': vr['campaña'], nombre_proyecto: vr.proyecto,
    tiempo_derechos: vr.tiempo, plataformas_derechos: vr.plataformas, territorio_derechos: vr.territorio,
    nombre_locacion: vr.locNombre, direccion_locacion: vr.locDir, nombre_dueno_locacion: vr.duenoNombre, rut_dueno_locacion: vr.duenoRut,
    nombre_productora: R.marca, razon_social_productora: R.razon, rut_productora: R.rutEmp, representante_productora: R.rep, rut_representante_productora: R.rutRep, domicilio_productora: R.domEmp,
    fechas_rodaje: fechasRodaje,
    fecha_hoy: hoy
  });
  const finalMap = Object.assign(map, ov);
  const _mn = (typeof finalMap.monto_neto === 'number') ? finalMap.monto_neto : (parseInt(String(finalMap.monto_neto == null ? '' : finalMap.monto_neto).replace(/[^0-9]/g, ''), 10) || 0);
  finalMap.monto_texto = _mn > 0 ? _montoEnPalabras(_mn) : '';
  finalMap.hora_extra_texto = _legalTextoVar(finalMap.hora_extra);
  Object.keys(finalMap).forEach(function (k) {
    if (/fecha/i.test(k) && k !== 'fechas_rodaje' && k !== 'fecha_hoy') {
      const vv = finalMap[k];
      if (vv && /^\d{4}-\d{2}-\d{2}$/.test(String(vv))) finalMap[k] = _fechaLargaES(String(vv));
    }
  });
  return finalMap;
}
function legalRenderCustomBody(g, tpl, forPrint) {
  const e = escapeHtml; const R = legalRep(); const map = legalVarMap(g);
  let safe = e(String(tpl.cuerpo || ''));
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');   // V8.4.1: **negrita**
  safe = safe.replace(/\{\{\s*([a-zA-Z0-9_\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1]+)\s*\}\}/g, function (mm, k) {
    let val = map[k];
    if ((val == null || String(val).trim() === '') && /_texto$/.test(k)) { val = _legalTextoVar(map[k.replace(/_texto$/, '')]); }
    const has = (val != null && String(val).trim() !== '');
    const txt = has ? String(val) : (forPrint ? '' : '____');
    return forPrint ? e(txt) : `<span class="lgl-v">${e(txt)}</span>`;
  });
  const html = safe.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  const head = `<div class="logo">${e(R.marca)}</div><h4>${e(tpl.nombre || 'Documento')}</h4>`;
  const parteA = map.nombre || map.nombre_contraparte || map.locNombre || map.nombre_locacion || ''; const rutA = map.rut || map.rut_contraparte || map.duenoRut || map.rut_dueno_locacion || '';
  const firmas = `<div style="display:flex;gap:40px;margin-top:46px;justify-content:space-between;"><div style="flex:1;text-align:center;"><div style="border-top:1px solid #1a1a17;padding-top:6px;font-size:11.5px;">${e(parteA)}${rutA ? '<br>RUT: ' + e(rutA) : ''}</div></div><div style="flex:1;text-align:center;"><div style="border-top:1px solid #1a1a17;padding-top:6px;font-size:11.5px;">${e(R.marca || R.razon || '')}${R.rutEmp ? '<br>RUT: ' + e(R.rutEmp) : ''}</div></div></div>`;
  return head + `<div class="lgl-custom-body">${html}</div>` + firmas;
}
function legalRenderBody(g, forPrint) {
  const R = legalRep(); const e = escapeHtml;
  const vv = (t) => forPrint ? e(t == null ? '' : String(t)) : `<span class="lgl-v">${e(t == null ? '' : String(t))}</span>`;
  const vr = legalVars(g);
  const _ctpl = legalTplGet(g.tpl);
  if (_ctpl && _ctpl.custom) return legalRenderCustomBody(g, _ctpl, forPrint);
  const head = `<div class="logo">${e(R.marca)}</div>`;
  const partes = `<p>En ${e(legalHoyLargo())}, entre <b>${e(R.razon)}</b>, RUT N° ${e(R.rutEmp)}, representada por don ${e(R.rep)}, RUT N° ${e(R.rutRep)}, domiciliado en ${e(R.domEmp)}, en adelante <b>${e(R.marca)}</b>, por una parte; y por la otra ${vv(vr.nombre)}, RUT N° ${vv(vr.rut)}, domiciliado en ${vv(vr.dom)}, en adelante "la Contraparte", se ha convenido el siguiente contrato:</p>`;
  const montoTxt = vr.monto != null && vr.monto !== '' ? (typeof vr.monto === 'number' ? locMoney(vr.monto) + ' neto' : String(vr.monto)) : '$___';
  const firmasPers = `<div class="firmas"><div class="ln">${e(vr.nombre || '')}<br>RUT: ${e(vr.rut || '')}</div><div class="ln">${e(R.marca)}<br>RUT: ${e(R.rutEmp)}</div></div>`;
  if (g.tpl === 'cesion') {
    return head + `<h4>Contrato de prestación de servicios de modelaje publicitario</h4>
    ${partes}
    <div class="cl">Primero: Antecedentes</div><p>El Modelo declara que ocasional o esporádicamente desarrolla actividades como modelo publicitario y que no tiene vigentes trabajos similares ni relativos a productos o servicios competitivos.</p>
    <div class="cl">Segundo: Servicios</div><p>${e(R.marca)} contrata al modelo para prestar servicios profesionales en ${vv(vr.campaña)} para el cliente ${vv(vr.cliente)}, coordinándose con quien ${e(R.marca)} designe, sin relación de subordinación ni dependencia.</p>
    <div class="cl">Tercero: Honorarios</div><p>${e(R.marca)} pagará al modelo la suma de ${vv(montoTxt)} por ${vv((vr.jornadas || 1) + ' jornada(s)')} de filmación de 10 horas más una de colación. La hora extra tendrá un valor del ${vv(vr.horaExtra || '10%')} del monto contratado. El pago se realizará dentro de ${vv((vr.pago || 60) + ' días')} desde la recepción conforme del documento tributario.</p>
    <div class="cl">Cuarto: Naturaleza de la relación</div><p>Las partes declaran que el Modelo no es trabajador dependiente de ${e(R.marca)}; presta servicios en calidad de independiente. ${e(R.marca)} actúa como intermediario entre el Modelo y el cliente final.</p>
    <div class="cl">Quinto · Sexto: Titularidad de derechos</div><p>Las producciones en que participe el Modelo son de propiedad exclusiva del cliente respectivo, con carácter de obra colectiva, con validez solo durante el período del presente contrato (el modelo no puede renunciar a los derechos de su imagen).</p>
    <div class="cl">Séptimo: Autorización</div><p>El Modelo autoriza expresamente la exhibición del comercial por ${vv(vr.tiempo || '___')} en ${vv(vr.plataformas || '___')} en territorio de ${vv(vr.territorio || '___')}, incluyendo reducciones y versiones, a contar de la salida al aire.</p>
    <div class="cl">Noveno: Confidencialidad · Décimo: Arbitraje (CCS) · Undécimo: Legislación chilena</div><p>Confidencialidad durante y después del contrato; arbitraje ante la Cámara de Comercio de Santiago; regido por las leyes de Chile. Se firma en tres ejemplares del mismo tenor.</p>
    ${firmasPers}`;
  }
  if (g.tpl === 'servicios') {
    return head + `<h4>Contrato de prestación de servicios profesionales (borrador)</h4>
    ${partes}
    <div class="cl">Primero: Objeto</div><p>${e(R.marca)} contrata a la Contraparte para prestar servicios de ${vv(vr.rol || 'servicios')} en el proyecto ${vv(vr.proyecto)} para el cliente ${vv(vr.cliente)}, en calidad de prestador independiente.</p>
    <div class="cl">Segundo: Honorarios</div><p>Se pagará la suma de ${vv(montoTxt)} por ${vv((vr.jornadas || 1) + ' jornada(s)')}. Hora extra al ${vv(vr.horaExtra || '150%')}. Pago dentro de ${vv((vr.pago || 30) + ' días')} desde la recepción conforme del documento tributario.</p>
    <div class="cl">Tercero: Naturaleza de la relación</div><p>No existe vínculo de subordinación ni dependencia. La Contraparte declara conocer y cumplir las disposiciones legales que regulan su actividad.</p>
    <div class="cl">Cuarto: Propiedad intelectual</div><p>Todo resultado del servicio es de propiedad del cliente respectivo; la Contraparte cede los derechos patrimoniales que correspondan para los fines del proyecto.</p>
    <div class="cl">Quinto: Confidencialidad · Sexto: Arbitraje (CCS) · Séptimo: Legislación chilena</div><p>Obligación de confidencialidad; arbitraje ante la Cámara de Comercio de Santiago; regido por las leyes de Chile. Se firma en dos ejemplares del mismo tenor.</p>
    ${firmasPers}`;
  }
  if (g.tpl === 'nda') {
    return head + `<h4>Acuerdo de confidencialidad (borrador)</h4>
    ${partes}
    <div class="cl">Primero: Información confidencial</div><p>Toda información técnica, comercial, creativa u operativa relativa al proyecto ${vv(vr.proyecto)} (cliente ${vv(vr.cliente)}) y a ${e(R.marca)}, en cualquier formato.</p>
    <div class="cl">Segundo: Obligaciones</div><p>La Contraparte se obliga a no divulgar ni utilizar la información salvo para los fines del proyecto, con la misma diligencia con que protege la propia, durante la vigencia y una vez finalizado el acuerdo.</p>
    <div class="cl">Tercero: Exclusiones · Cuarto: Devolución · Quinto: Plazo</div><p>Se excluye la información de dominio público. Al término, la Contraparte devolverá o destruirá la información. La obligación se mantiene por el plazo que las partes acuerden.</p>
    <div class="cl">Sexto: Arbitraje (CCS) · Séptimo: Legislación chilena</div><p>Arbitraje ante la Cámara de Comercio de Santiago; regido por las leyes de Chile.</p>
    ${firmasPers}`;
  }
  // arriendo
  return head + `<h4>Contrato de arriendo de locación (borrador)</h4>
  <p>En ${e(legalHoyLargo())}, entre ${vv(vr.duenoNombre || '___')}, RUT N° ${vv(vr.duenoRut || '___')}, en adelante "el Arrendador"; y <b>${e(R.razon)}</b>, RUT N° ${e(R.rutEmp)}, en adelante <b>${e(R.marca)}</b>, se conviene:</p>
  <div class="cl">Primero: Objeto</div><p>El Arrendador da en arriendo el inmueble ubicado en ${vv(vr.locDir || '___')} para su uso como locación de rodaje del proyecto ${vv(vr.proyecto)}.</p>
  <div class="cl">Segundo: Plazo y horarios</div><p>El uso se acuerda para la(s) fecha(s) y horarios que las partes definan, considerando montaje, rodaje y desmontaje.</p>
  <div class="cl">Tercero: Condiciones</div><p>${e(R.marca)} se hace cargo de cualquier daño ocasionado y del aseo posterior al rodaje, dejando la locación en igual o mejor estado.</p>
  <div class="cl">Cuarto: Precio · Quinto: Legislación chilena</div><p>El precio del arriendo será el acordado entre las partes. Regido por las leyes de Chile. Se firma en dos ejemplares.</p>
  <div class="firmas"><div class="ln">${e(vr.duenoNombre || '')}<br>RUT: ${e(vr.duenoRut || '')}</div><div class="ln">${e(R.marca)}<br>RUT: ${e(R.rutEmp)}</div></div>`;
}

function legalDoGenerate() {
  const project = STATE.currentProject; const g = _legalState().gen; if (!g) return;
  // V8.3.4: no guardar/generar documentos incompletos en modo "desde el sistema".
  if (legalCompletarModo(g) === 'sistema') {
    const _miss = legalMissingRequired(g);
    if (_miss.length) { legalShowMissing(_miss); return; }
  }
  const t = legalTplGet(g.tpl) || {};
  const vr = legalVars(g);
  const hoy = new Date().toISOString().slice(0, 10);
  const monto = (typeof vr.monto === 'number') ? vr.monto : (parseInt(String(vr.monto || '').replace(/\D/g, ''), 10) || null);
  const vigencia = g.tpl === 'cesion' ? [vr.tiempo, vr.plataformas, vr.territorio].filter(Boolean).join(' · ') : '';
  if (g.docId) {
    const d = BD_LEGAL.find(x => x.docId === g.docId);
    if (d) {
      if (!Array.isArray(d.historial)) d.historial = [];
      d.historial.push({ version: d.version, at: d.fechaGeneracion, vars: d.vars });
      d.version = (d.version || 1) + 1;
      d.fechaGeneracion = hoy;
      d.vars = Object.assign({}, g.ov);
      d.monto = monto; d.vigencia = vigencia;
      if (t.target === 'persona') { d.contraparteNombre = vr.nombre; d.rut = vr.rut; }
      markDirty(); autosaveNow(); _dalLegalDocSaveSoon(d.docId); closeModal(); renderLegal();
      showToast({ kind: 'success', title: 'Nueva versión guardada', body: 'Documento ' + d.docId + ' · v' + d.version + '.' });
    }
    return;
  }
  const rec = {
    docId: nextLegalId(),
    tipo: g.tpl,
    plantillaId: g.tpl + (t.draft ? ' (borrador)' : ' (validada)'),
    proyectoId: project.id,
    proyectoNombre: (project.data.infoProyecto || {}).nombreProyecto || project.name || '',
    cliente: (project.data.infoProyecto || {}).cliente || '',
    estado: 'generado',
    version: 1,
    fechaGeneracion: hoy,
    fechaFirma: '',
    monto: monto,
    vigencia: vigencia,
    responsable: (project.data.infoProyecto || {}).productorEjecutivo || '',
    pdfUrl: null,
    vars: Object.assign({}, g.ov)
  };
  if (t.target === 'locacion') {
    rec.locacionId = g.locId; const l = bdLocFind(g.locId) || {};
    rec.contraparteId = g.locId; rec.contraparteNombre = (vr.duenoNombre || l.nombre || 'Locación'); rec.rut = vr.duenoRut || ''; rec.rolCalidad = 'Dueño de locación';
  } else {
    rec.contraparteId = (legalFindContact(g.persName) || {}).id || ''; rec.contraparteNombre = vr.nombre; rec.rut = vr.rut; rec.rolCalidad = vr.calidad;
  }
  BD_LEGAL.unshift(rec); _dalLegalDocSaveSoon(rec.docId);
  markDirty(); autosaveNow(); closeModal(); renderLegal();
  showToast({ kind: 'success', title: 'Documento generado', body: rec.docId + ' · ' + (legalTplGet(rec.tipo) || {}).nombre + ' · v1 (Generado).' });
}

function legalAdvance(docId) {
  const d = BD_LEGAL.find(x => x.docId === docId); if (!d) return;
  const i = LEGAL_FLOW.indexOf(d.estado);
  if (i < 0 || i >= LEGAL_FLOW.length - 1) return;
  const next = LEGAL_FLOW[i + 1];
  if (next === 'firmado') {   // V9.6.2: a "firmado" solo se llega subiendo el PDF firmado
    showToast({ kind: 'info', title: 'Sube el PDF firmado', body: 'Para marcar como firmado, usa "Marcar firmado (subir PDF)" y adjunta el documento firmado.' });
    return;
  }
  d.estado = next; markDirty(); autosaveNow(); _dalLegalDocSaveSoon(docId); renderLegal();
  showToast({ kind: 'info', title: 'Documento actualizado', body: 'Estado: ' + LEGAL_EST[d.estado] + '.' });
}

/* V9.6.2 — Marcar firmado = subir el PDF firmado. Es la ÚNICA vía a "firmado":
   si la subida a Storage falla, el documento NO avanza (queda en Enviado) y se
   avisa claro. Así el sistema obliga a archivar el contrato firmado. */
function legalMarcarFirmado(docId, input) {
  const file = input && input.files && input.files[0]; if (!file) return;
  const d = BD_LEGAL.find(x => x.docId === docId); if (!d) { input.value = ''; return; }
  const isPdf = /pdf$/i.test(file.type || '') || /\.pdf$/i.test(file.name || '');
  if (!isPdf) { showToast({ kind: 'warning', title: 'Solo PDF', body: 'El documento firmado debe ser un PDF.' }); input.value = ''; return; }
  if (file.size > 15 * 1024 * 1024) { showToast({ kind: 'warning', title: 'Archivo muy grande', body: 'El PDF firmado supera los 15 MB. Comprímelo o reduce su tamaño.' }); input.value = ''; return; }
  if (!sb || !sb.storage || LEGAL_SOURCE !== 'supabase') {
    showToast({ kind: 'warning', title: 'Sin nube disponible', body: 'No hay conexión con Storage para archivar el PDF firmado. El documento queda en Enviado; reintenta cuando la nube esté disponible.' });
    input.value = ''; return;
  }
  showToast({ kind: 'info', title: 'Subiendo PDF firmado…', body: 'Archivando ' + (file.name || 'el documento') + '.' });
  _uploadLegalPDF(docId, file).then(function (up) {
    if (!up || !up.path) {
      showToast({ kind: 'error', title: 'No se pudo archivar', body: 'Falló la subida del PDF firmado. El documento queda en Enviado; reintenta.' });
      return;
    }
    d.pdfUrl = up.path; d.estado = 'firmado'; d.fechaFirma = new Date().toISOString().slice(0, 10);
    markDirty(); autosaveNow(); _dalLegalDocSaveSoon(docId); renderLegal();
    showToast({ kind: 'success', title: 'Documento firmado', body: docId + ' archivado en la nube y marcado como Firmado.' });
  });
  input.value = '';
}

/* V8.3.1 — eliminar documento. No exportado: se borra directo. Exportado:
   pide confirmación (ya salió como PDF y figura en el archivo del proyecto). */
function legalDeleteDoc(docId) {
  const d = BD_LEGAL.find(x => x.docId === docId); if (!d) return;
  const doDelete = () => { if (d.pdfUrl && sb && sb.storage) { try { sb.storage.from(STORAGE_BUCKET_LEGAL).remove([d.pdfUrl]); } catch (e) {} } const i = BD_LEGAL.findIndex(x => x.docId === docId); if (i !== -1) BD_LEGAL.splice(i, 1); dalEliminarLegalDoc(docId); markDirty(); autosaveNow(); closeModal(); renderLegal(); showToast({ kind: 'info', title: 'Documento eliminado', body: docId + ' fue eliminado.' }); };
  if (d.exported) {
    showModal({ title: 'Eliminar documento exportado', body: 'El documento ' + docId + ' (' + ((legalTplGet(d.tipo) || {}).nombre || d.tipo) + ', ' + (d.contraparteNombre || '') + ') ya fue exportado a PDF. Si lo eliminas, desaparece del archivo de este proyecto y de la BD de Legal. ¿Eliminar de todas formas?', confirmLabel: 'Eliminar', cancelLabel: 'Cancelar', danger: true, onConfirm: doDelete });
  } else {
    doDelete();
  }
}

function legalExportPDF() {
  const g = _legalState().gen; if (!g) return; const e = escapeHtml;
  // V8.3.3: si el documento se completa "desde el sistema", no exportar con blancos.
  if (legalCompletarModo(g) === 'sistema') {
    const _miss = legalMissingRequired(g);
    if (_miss.length) { legalShowMissing(_miss); return; }
  }
  if (g.docId) { const _d = BD_LEGAL.find(x => x.docId === g.docId); if (_d && !_d.exported) { _d.exported = true; markDirty(); autosaveNow(); _dalLegalDocSaveSoon(g.docId); } }
  const R = legalRep();
  const inner = legalRenderBody(g, true);
  const ip = (STATE.currentProject.data.infoProyecto) || {};
  const tplNombre = (legalTplGet(g.tpl) || {}).nombre || 'Documento';
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${e(tplNombre)}</title>
  <style>@page{size:A4;margin:20mm;} *{box-sizing:border-box;} body{font-family:Georgia,'Times New Roman',serif;color:#1a1a17;margin:0;font-size:12.5px;line-height:1.65;}
  .logo{font-family:-apple-system,'Segoe UI',Arial,sans-serif;font-weight:800;letter-spacing:.04em;font-size:17px;color:#161410;margin-bottom:18px;}
  h4{font-size:14px;text-align:center;text-transform:uppercase;letter-spacing:.03em;margin:0 0 16px;}
  .cl{font-weight:700;margin-top:13px;} p{margin:6px 0;text-align:justify;}
  .firmas{display:flex;justify-content:space-around;margin-top:48px;text-align:center;font-family:-apple-system,'Segoe UI',Arial,sans-serif;font-size:11px;}
  .firmas .ln{border-top:1px solid #222;padding-top:6px;width:44%;}
  .foot{margin-top:26px;font-size:9.5px;color:#888;font-family:-apple-system,'Segoe UI',Arial,sans-serif;border-top:1px solid #ccc;padding-top:8px;display:flex;justify-content:space-between;}</style></head>
  <body>${inner}
  <div class="foot"><span>${e(R.marca)} · ${e(ip.nombreProyecto || '')}${ip.cliente ? ' · ' + e(ip.cliente) : ''}</span><span>${e(new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }))}</span></div>
  </body></html>`;
  const _doc = g.docId ? (BD_LEGAL.find(x => x.docId === g.docId) || {}) : {};
  const _ver = _doc.version || 1;
  const _cp = ((legalTplGet(g.tpl) || {}).target === 'locacion') ? ((bdLocFind(g.locId) || {}).nombre || 'Locación') : (g.persName || '');
  const _fname = [tplNombre, _cp, 'S-F', 'v' + _ver].filter(Boolean).join(' - ').replace(/[\\/]/g, '-');
  printViaIframe(html, _fname);
}


// ── Outliers de L1809–1810 (junto a BD_LEGAL, su contexto natural) ──
function nextLegalId() { let m = 0; BD_LEGAL.forEach(d => { const x = /LEG-(\d+)/.exec(d.docId || ''); if (x) m = Math.max(m, +x[1]); }); return 'LEG-' + String(m + 1).padStart(4, '0'); }
function legalDocsForProject(projectId) { return BD_LEGAL.filter(d => d.proyectoId === projectId); }

// ── Outlier de L11859 (combobox del modal de generación) ──
function legalComboboxFilter(inputEl) {
  const wrap = inputEl.closest('.combobox-wrap'); if (!wrap) return;
  const dropdown = wrap.querySelector('.combobox-dropdown'); if (!dropdown) return;
  const q = _normKey(inputEl.value || '');
  const all = legalAllContactNames();
  const matched = q ? all.filter(n => _normKey(n).includes(q)) : all;
  if (matched.length === 0) {
    dropdown.innerHTML = `<div class="combobox-empty"><button type="button" class="combobox-addbd" data-accion="ui.cbAddBD" data-on="mousedown click">+ Agregar a la BD</button></div>`;
  } else {
    dropdown.innerHTML = matched.slice(0, 20).map(n => { const d = legalPersonData(n); return `<div class="combobox-option" ${accionHTML('ui.cbSel', n, { on: 'mousedown' })}><div class="combobox-option-main">${escapeHtml(n)}</div>${d.rol ? `<div class="combobox-option-meta">${escapeHtml(d.rol)}</div>` : ''}</div>`; }).join('') + (matched.length > 20 ? `<div class="combobox-more">+ ${matched.length - 20} más — sigue tipeando para filtrar</div>` : '');
  }
  dropdown.hidden = false;
  dropdown.onmousedown = function (ev) { if (!ev.target.closest('.combobox-option')) ev.preventDefault(); };
  // V8.3.3: el dropdown se ancla por CSS (.cbx-anchored, position:absolute);
  // no se posiciona como fixed para no quedar corrido dentro del modal.
}

// ── Window bridges (24) ──
window.renderLegal          = renderLegal;
window.legalSetSub          = legalSetSub;
window.legalSetFiltro       = legalSetFiltro;
window.openLegalGen         = openLegalGen;
window.openLegalGenDoc      = openLegalGenDoc;
window.legalAdvance         = legalAdvance;
window.legalMarcarFirmado   = legalMarcarFirmado;
window._abrirLegalPDF       = _abrirLegalPDF;
window.legalDeleteDoc       = legalDeleteDoc;
window.openLegalTplEditor   = openLegalTplEditor;
window.legalTplSave         = legalTplSave;
window.legalTplDelete       = legalTplDelete;
window.legalTplInsertVar    = legalTplInsertVar;
window.legalTplWrapBold     = legalTplWrapBold;
window.legalGenPickTpl      = legalGenPickTpl;
window.legalGenSetPers      = legalGenSetPers;
window.legalGenSetLoc       = legalGenSetLoc;
window.legalGenSetOv        = legalGenSetOv;
window.legalSetCompletar    = legalSetCompletar;
window.drawLegalGen         = drawLegalGen;
window.legalDoGenerate      = legalDoGenerate;
window.legalExportPDF       = legalExportPDF;
window.legalComboboxFilter  = legalComboboxFilter;
window.legalMoneyInput      = legalMoneyInput;

// ── Bridges agregados por auditoría 2-jul (consumidos por index.html u otros módulos sin bridge) ──
window.legalAllTplEntries = legalAllTplEntries;
window.legalPersonData = legalPersonData;
window.legalRep = legalRep;
window.legalTplGet = legalTplGet;
window.legalVarMap = legalVarMap;

// ── Bridges auditoría pre-B (onclick/oninput en HTML generado por el propio módulo) ──
window.openLegalGenTpl       = openLegalGenTpl;

// D2 · acciones delegadas
registrarAcciones('lgl', {
  sub: function (a) { legalSetSub(a[0]); },
  q: function (a, el) { clearTimeout(window._lglQT); window._lglQT = setTimeout(function () { legalSetFiltro('q', el.value); }, 250); },
  filtro: function (a, el) { legalSetFiltro(a[0], el.value); },
  gen: function () { openLegalGen(); },
  verDoc: function (a) { openLegalGenDoc(a[0]); },
  avanzar: function (a) { legalAdvance(a[0]); },
  firmado: function (a, el) { legalMarcarFirmado(a[0], el); },
  pdf: function (a) { _abrirLegalPDF(a[0]); },
  borrarDoc: function (a) { legalDeleteDoc(a[0]); },
  usarTpl: function (a) { openLegalGenTpl(a[0]); },
  editTpl: function (a) { openLegalTplEditor(a[0]); },
  borrarTpl: function (a) { legalTplDelete(a[0]); },
  nuevaTpl: function () { openLegalTplEditor(); },
  tplVar: function (a, el, ev) { if (ev.type === 'mousedown') ev.preventDefault(); else legalTplInsertVar('{{' + a[0] + '}}'); },
  tplPrev: function () { legalTplUpdatePreview(); },
  tplBold: function (a, el, ev) { if (ev.type === 'mousedown') ev.preventDefault(); else legalTplWrapBold(); },
  tplSave: function (a) { legalTplSave(a[0]); },
  pickTpl: function (a) { legalGenPickTpl(a[0]); },
  setLoc: function (a, el) { legalGenSetLoc(el.value); },
  persCombo: function (a, el, ev) {
    if (ev.type === 'focus' || ev.type === 'input') legalComboboxFilter(el);
    else if (ev.type === 'blur') comboboxCloseDelayed(el);
    else legalGenSetPers(el.value);
  },
  completar: function (a) { legalSetCompletar(a[0]); },
  exportar: function () { legalExportPDF(); },
  generar: function () { legalDoGenerate(); },
  volverBg: function (a, el, ev) { if (ev.target === el) drawLegalGen(); },
  volver: function () { drawLegalGen(); },
  ov: function (a, el) { legalGenSetOv(a[0], el.value); },
  money: function (a, el) { legalMoneyInput(el, a[0]); },
});

// D4b · ganchos definidos por este módulo (consumidos por módulos más tempranos)
define('legalRep', legalRep);
define('renderLegal', renderLegal);
