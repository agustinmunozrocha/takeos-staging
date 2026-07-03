// Buscador Global (barra superior) — extraído de index.html (Etapa A5)
// src/modules/buscador.js

// D1a · imports reales. OJO: estos imports HOISTEAN la eval de config, gastos,
// persistencia-local y admin a la pos de buscador (19) — auditado seguro: sus
// top-levels son inertes y goWire (gastos) solo necesita state (pos 4) y nav
// (pos 10). Línea roja #2: nav JAMÁS debe importar de gastos.
import { escapeHtml, showToast } from '../lib/helpers.js';
import { STATE, BD_CONTACTOS, PROJECTS } from '../lib/state.js';
import { closeModal, toggleTheme } from '../lib/ui.js';
import { navigateToModule } from '../lib/nav.js';
import { navigateToControlRoom, navigateToProject } from './kanban.js';
import { openGlobalBDPersonas } from './bd.js';
import { openConfigPanel, openEmpresaPerfil } from './config.js';
import { openGlobalCFO } from './gastos.js';
import { exportSave, openSnapshotsModal } from './persistencia-local.js';
import { _applyAdminUI, requestAdminPassword, _puedeModoAdmin } from './admin.js';

/* ════════════════════════════════════════════════════════════════════
   V7.11 · BUSCADOR GLOBAL (barra superior)
   Busca proyectos, destinos de Configuración, módulos del proyecto abierto
   y contactos. Enter o click → navega. Si el destino requiere admin y no
   está activo, pide la contraseña al toque.
   ════════════════════════════════════════════════════════════════════ */
var GSEARCH_CUR = [];
function _gsNorm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
var GSEARCH_DESTS = [
  { icon: '⚙', label: 'Configuración', kw: 'configuracion ajustes settings preferencias opciones', sub: 'Abrir', run: () => openConfigPanel() },
  { icon: '🏢', label: 'Empresa / Productora (datos)', kw: 'empresa productora razon social rut giro direccion banco bancarios cuenta titular drive milanote chipax calendar perfil datos remitente representante', sub: 'Configuración', run: () => openEmpresaPerfil() },
  { icon: '👥', label: 'Base de Datos de Contactos', kw: 'base de datos contactos personas talentos proveedores clientes bd', sub: 'Abrir', run: () => openGlobalBDPersonas() },
  { icon: '📊', label: 'Finanzas', kw: 'cfo finanzas gastos consolidado validacion reembolsos chipax exportar contador caja', sub: 'Abrir', run: () => openGlobalCFO() },
  { icon: '🛡', label: 'Modo administrador', kw: 'modo administrador admin permisos clave contrasena password revertir', sub: 'Activar permisos', adminRequired: true, run: () => { if (!_puedeModoAdmin()) { showToast({ kind: 'error', title: 'Modo administrador no disponible', body: 'Solo el perfil Administrador puede activarlo.' }); return; } if (!STATE.adminMode) { STATE.adminMode = true; _applyAdminUI(); showToast({ kind: 'warning', title: 'Modo administrador activado', body: 'Acciones restringidas habilitadas. Úsalo con criterio.' }); } else { openConfigPanel(); } } },
  { icon: '🎨', label: 'Cambiar tema (claro / oscuro)', kw: 'tema theme claro oscuro dark light apariencia', sub: 'Preferencias', run: () => toggleTheme() },
  { icon: '💾', label: 'Guardar OS', kw: 'guardar respaldo backup exportar os json', sub: 'Datos del OS', run: () => { closeModal(); exportSave(); } },
  { icon: '📂', label: 'Cargar OS', kw: 'cargar importar abrir os respaldo json', sub: 'Datos del OS', run: () => { closeModal(); const i = document.getElementById('loadFileInput'); if (i) i.click(); } },
  { icon: '🕘', label: 'Snapshots', kw: 'snapshots historial respaldos automaticos versiones', sub: 'Datos del OS', run: () => openSnapshotsModal() },
  { icon: '▦', label: 'Control Room', kw: 'control room inicio dashboard panel proyectos', sub: 'Ir', run: () => navigateToControlRoom() }
];
var GSEARCH_MODULES = [
  { id: 'info-proyecto', label: 'Info Proyecto', kw: 'info proyecto identidad cliente datos generales agencia' },
  { id: 'presupuesto', label: 'Presupuesto', kw: 'presupuesto costos cotizacion equipo roles dte margen' },
  { id: 'crew', label: 'Crew', kw: 'crew equipo confirmado personas contratados' },
  { id: 'rodajes', label: 'Rodajes', kw: 'rodajes dias fechas dia calendario' },
  { id: 'plan-rodaje', label: 'Plan de Rodaje', kw: 'plan de rodaje shooting board tiempos planos unidades' },
  { id: 'correos', label: 'Notificaciones', kw: 'notificaciones correos mails comunicacion plantillas envios whatsapp' },
  { id: 'gastos', label: 'Gastos', kw: 'gastos rendicion movimientos caja presupuestos sobres reembolso comprobante boleta factura chipax rinde proveedor' },
  { id: 'hoja-llamado', label: 'Hoja de Llamado', kw: 'hoja de llamado call sheet citaciones llamado' },
  { id: 'entregables', label: 'Entregables', kw: 'entregables deliverables piezas variaciones' },
  { id: 'reporte-cierre', label: 'Reporte de Cierre', kw: 'reporte de cierre inteligente business intelligence' }
];
function _gsearchResults(q) {
  const nq = _gsNorm(q).trim(); if (!nq) return [];
  const terms = nq.split(/\s+/);
  const test = (hay) => { const h = _gsNorm(hay); return terms.every(t => h.indexOf(t) >= 0); };
  const out = [];
  // Proyectos
  (PROJECTS || []).forEach(p => { const ip = (p.data && p.data.infoProyecto) || {}; if (test((p.name || '') + ' ' + (ip.cliente || '') + ' ' + (ip.nombreProyecto || '') + ' proyecto')) out.push({ icon: '🎬', label: p.name || ip.nombreProyecto || 'Proyecto', sub: 'Proyecto' + (ip.cliente ? (' · ' + ip.cliente) : ''), run: () => navigateToProject(p.id) }); });
  // Destinos globales
  GSEARCH_DESTS.forEach(d => { if (test(d.label + ' ' + d.kw)) out.push(d); });
  // Módulos (solo con un proyecto abierto)
  if (STATE.currentView === 'project' && STATE.currentProject) { const pn = STATE.currentProject.name || ''; GSEARCH_MODULES.forEach(m => { if (test(m.label + ' ' + m.kw)) out.push({ icon: '›', label: m.label, sub: 'Módulo · ' + pn, run: () => navigateToModule(m.id) }); }); }
  // Contactos
  try { const seen = {}; Object.keys(BD_CONTACTOS || {}).forEach(k => { const c = BD_CONTACTOS[k] || {}; const nom = c.nombre || ''; if (!nom || seen[_gsNorm(nom)]) return; if (test(nom + ' contacto persona')) { seen[_gsNorm(nom)] = 1; out.push({ icon: '👤', label: nom, sub: 'Contacto · Base de Datos', run: () => openGlobalBDPersonas() }); } }); } catch (e) {}
  return out.slice(0, 8);
}
function globalSearchInput(q) {
  GSEARCH_CUR = _gsearchResults(q);
  const box = document.getElementById('gsearchResults'); if (!box) return;
  if (!q || !q.trim()) { box.hidden = true; box.innerHTML = ''; return; }
  if (!GSEARCH_CUR.length) { box.innerHTML = `<div class="gsearch-empty">Sin resultados para “${escapeHtml(q)}”.</div>`; box.hidden = false; return; }
  box.innerHTML = GSEARCH_CUR.map((r, i) => `<div class="gsearch-item ${i === 0 ? 'sel' : ''}" onmousedown="event.preventDefault(); _gsearchGo(${i})"><span class="gsearch-ic">${r.icon || '•'}</span><span class="gsearch-tx"><span class="gsearch-lb">${escapeHtml(r.label)}${r.adminRequired ? ' <span class="gsearch-lock">🔒</span>' : ''}</span><span class="gsearch-sb">${escapeHtml(r.sub || '')}</span></span></div>`).join('');
  box.hidden = false;
}
function globalSearchKey(ev) {
  if (ev.key === 'Enter') { if (GSEARCH_CUR.length) { ev.preventDefault(); _gsearchGo(0); } }
  else if (ev.key === 'Escape') { const inp = document.getElementById('globalSearch'); if (inp) inp.value = ''; _gsearchHide(); }
}
function _gsearchHide() { const box = document.getElementById('gsearchResults'); if (box) { box.hidden = true; box.innerHTML = ''; } }
function _gsearchGo(i) {
  const r = GSEARCH_CUR[i]; if (!r) return;
  const inp = document.getElementById('globalSearch'); if (inp) inp.value = '';
  _gsearchHide();
  if (r.adminRequired && !(STATE && STATE.adminMode)) { requestAdminPassword(() => r.run()); return; }
  r.run();
}

// ── Window bridges Buscador ────────────────────────────────────────
window.globalSearchInput = globalSearchInput;  // topbar oninput/onfocus
window.globalSearchKey   = globalSearchKey;    // topbar onkeydown
window._gsearchHide      = _gsearchHide;       // topbar onblur
window._gsearchGo        = _gsearchGo;         // onmousedown en resultados generados
