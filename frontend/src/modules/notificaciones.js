// Módulo Notificaciones — Etapa 2.
//
// Tres sistemas extraídos:
//   A. Bell / Panel de avisos (campanita topbar) — líneas originales ~24049
//   B. Motor de correos: plantillas, config, fill, recipients — líneas ~10734
//   C. ntf* rebuild (renderNotificaciones V7.13) — líneas ~17277
//
// Sistema D (Señales): ensureSenales, marcarSenal, userSenales, etc. — diferido.
// Depende de renderMetrics/renderKanban (kanban.js); se extrae cuando se
// unifique el grafo de dependencias entre módulos.
//
// Dependencias via window (classic script): markDirty, showModal, closeModal,
// navigateToModule, navigateToProject, fmtMoney, factorRetencionDte,
// IVA (rates.js), sb, PROJECTS, PROJECTS_SOURCE, EMPRESA_PERFIL, BD_PERSONAS,
// DTE_CON_RETENCION, DTE_LABEL_SHORT, authNivel.

import { STATE, PROJECTS, BD_PERSONAS, EMPRESA_PERFIL, PROJECTS_SOURCE } from '../lib/state.js';
// D1c · imports reales. VETADOS: IVA (tasa viva), PROJECTS_SOURCE, _notifCfg
// (el módulo lo escribe). Bridge DTE_CON_RETENCION se conserva (calc lo lee
// vía window). Hoist: persistencia-local 28→17 (top-level sin imports, inerte).
import { sb } from '../lib/supabase.js';
import { fmtMoney } from '../lib/calc.js';
import { factorRetencionDte, DTE_CON_RETENCION } from '../lib/data.js';
import { closeModal } from '../lib/ui.js';
import { navigateToModule } from '../lib/nav.js';
import { navigateToProject } from './kanban.js';
import { markDirty } from './persistencia-local.js';
import { escapeHtml, showToast } from '../lib/helpers.js';

// ── Sistema A · variables internas del panel ──────────────────────────────────

import { registrarAcciones, accionHTML } from '../lib/delegacion.js';
import { IVA } from '../lib/rates.js';
import { define } from '../lib/ganchos.js';
let _notifCfg;   // D4c: estado propio del módulo (antes window._notifCfg, era de los handlers inline)
let NOTIF = [];
let _NOTIF_TIMER = null;
let _NOTIF_OUTSIDE = false;

async function notifCargar() {
  if (!sb || PROJECTS_SOURCE !== 'supabase') return;
  try {
    const { data, error } = await sb.from('user_notifications').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    NOTIF = data || [];
    notifPintarBadge();
    const p = document.getElementById('notifPanel');
    if (p && p.style.display !== 'none') notifRenderPanel();
  } catch (e) {}
}
function _notifNoLeidas() { return NOTIF.filter(function (n) { return !n.read_at; }).length; }
function notifPintarBadge() {
  const b = document.getElementById('notifBadge'); if (!b) return;
  const n = _notifNoLeidas();
  if (n > 0) { b.textContent = n > 9 ? '9+' : String(n); b.style.display = ''; }
  else b.style.display = 'none';
}
function _notifHace(ts) {
  if (!ts) return '';
  const d = new Date(ts), seg = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return 'hace un momento';
  if (seg < 3600) return 'hace ' + Math.floor(seg / 60) + ' min';
  if (seg < 86400) return 'hace ' + Math.floor(seg / 3600) + ' h';
  if (seg < 604800) return 'hace ' + Math.floor(seg / 86400) + ' día(s)';
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function notifRenderPanel() {
  const cont = document.getElementById('notifList'); if (!cont) return;
  if (!NOTIF.length) { cont.innerHTML = '<div style="padding:26px 16px;text-align:center;color:var(--ink-faint);font-size:13px;">No tienes avisos.</div>'; return; }
  cont.innerHTML = NOTIF.map(function (n) {
    const noLeido = !n.read_at;
    const esRebind = !!(n.data && n.data.request_id);
    const irA = esRebind ? (' ' + accionHTML('ntf.rebind', n.data.request_id) + ' style="cursor:pointer;"')
              : (n.project_id ? (' ' + accionHTML('ntf.abrir', n.project_id) + ' style="cursor:pointer;"') : '');
    return '<div' + irA + ' style="display:flex;gap:10px;padding:13px 18px;border-bottom:1px solid var(--rule,#2a2a28);' + (noLeido ? 'background:rgba(194,65,12,.06);' : '') + ((esRebind || n.project_id) ? 'cursor:pointer;' : '') + '">'
      + '<div style="flex:0 0 8px;">' + (noLeido ? '<div style="width:8px;height:8px;border-radius:50%;background:var(--accent,#c2410c);margin-top:5px;"></div>' : '') + '</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-weight:600;font-size:13px;color:var(--ink-primary);margin-bottom:2px;">' + escapeHtml(n.titulo || 'Aviso') + '</div>'
      + '<div style="font-size:12.5px;color:var(--ink-secondary);line-height:1.45;">' + escapeHtml(n.cuerpo || '') + '</div>'
      + '<div style="font-size:11px;color:var(--ink-faint);margin-top:4px;">' + _notifHace(n.created_at) + '</div>'
      + '</div></div>';
  }).join('');
}
export function bellToggle() {
  const p = document.getElementById('notifPanel'); if (!p) return;
  const abrir = (p.style.display === 'none' || !p.style.display);
  if (abrir) {
    notifRenderPanel(); p.style.display = 'flex';
    notifCargar();
    setTimeout(notifMarcarTodas, 1200);
  } else { p.style.display = 'none'; }
}
export async function notifMarcarTodas() {
  const ids = NOTIF.filter(function (n) { return !n.read_at; }).map(function (n) { return n.id; });
  if (!ids.length) return;
  const now = new Date().toISOString();
  NOTIF.forEach(function (n) { if (!n.read_at) n.read_at = now; });
  notifPintarBadge(); notifRenderPanel();
  try { if (sb) await sb.rpc('marcar_notificaciones_leidas', { p_ids: ids }); } catch (e) {}
}
function notifAbrir(projectId) {
  const p = document.getElementById('notifPanel'); if (p) p.style.display = 'none';
  if (PROJECTS.find(function (x) { return x.id === projectId; })) navigateToProject(projectId);
}
async function notifAbrirRebind(requestId) {
  const p = document.getElementById('notifPanel'); if (p) p.style.display = 'none';
  if (!sb) return;
  let req = null;
  try {
    const r = await sb.from('invitation_rebind_requests').select('*').eq('id', requestId).maybeSingle();
    if (r.error) throw r.error;
    req = r.data;
  } catch (e) {
    showToast({ kind: 'error', title: 'No se pudo abrir la solicitud', body: 'Puede que ya no tengas acceso o que haya sido resuelta.', duration: 8000 });
    return;
  }
  if (!req) { showToast({ kind: 'info', title: 'Solicitud no encontrada', body: 'Es posible que ya haya sido resuelta.' }); return; }
  if (req.estado && req.estado !== 'pendiente') {
    showToast({ kind: 'info', title: 'Solicitud ya resuelta', body: 'Estado: ' + escapeHtml(String(req.estado)) + (req.chosen_email ? ' · correo elegido: ' + escapeHtml(req.chosen_email) : '') });
    try { notifCargar(); } catch (e) {}
    return;
  }
  _rebindRenderModal(req);
}
function _rebindRenderModal(req) {
  const inv = escapeHtml(req.invited_email || '');
  const cla = escapeHtml(req.claiming_email || '');
  const root = document.getElementById('modalRoot'); if (!root) return;
  root.innerHTML = '<div class="modal-backdrop" data-accion="ui.backdrop"><div class="modal" style="max-width:520px;">'
    + '<div class="modal-header"><div class="modal-title">Aprobar acceso · cambio de correo</div></div>'
    + '<div class="modal-body">'
    +   '<p style="margin:0 0 12px;color:var(--ink-secondary);font-size:13px;line-height:1.55;">Una persona reclamó una invitación con un correo <strong>distinto</strong> al que se le envió. No tendrá acceso al proyecto hasta que lo apruebes. Elige cuál correo queda como el de esta persona.</p>'
    +   '<div style="display:flex;flex-direction:column;gap:8px;margin:14px 0 4px;">'
    +     '<label style="display:flex;align-items:center;gap:10px;border:1px solid var(--rule);border-radius:9px;padding:11px 13px;cursor:pointer;"><input type="radio" name="rebindEmail" value="' + cla + '" checked><div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-faint);font-weight:700;">Correo con que inició sesión</div><div style="font-size:13.5px;font-weight:600;color:var(--ink-primary);">' + (cla || '—') + '</div></div></label>'
    +     '<label style="display:flex;align-items:center;gap:10px;border:1px solid var(--rule);border-radius:9px;padding:11px 13px;cursor:pointer;"><input type="radio" name="rebindEmail" value="' + inv + '"><div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-faint);font-weight:700;">Correo originalmente invitado</div><div style="font-size:13.5px;font-weight:600;color:var(--ink-primary);">' + (inv || '—') + '</div></div></label>'
    +   '</div>'
    +   '<p style="margin:12px 0 0;font-size:11.5px;color:var(--ink-faint);line-height:1.5;">Si rechazas, se cancela la invitación y se <strong>libera el cupo del cargo</strong> (queda sin asignar). Si querías a la persona correcta, vuelve a invitar con el correo adecuado.</p>'
    + '</div>'
    + '<div class="modal-footer" style="justify-content:space-between;">'
    +   '<button class="btn btn-secondary" ' + accionHTML('ntf.rebindNo', req.id) + '>Rechazar y liberar cupo</button>'
    +   '<button class="btn btn-primary" ' + accionHTML('ntf.rebindSi', req.id) + '>Aprobar acceso</button>'
    + '</div>'
    + '</div></div>';
}
function _rebindAprobar(reqId) {
  const sel = document.querySelector('input[name="rebindEmail"]:checked');
  const correo = sel ? sel.value : '';
  if (!correo) { showToast({ kind: 'warning', title: 'Elige un correo', body: 'Selecciona cuál correo dejar para esta persona.' }); return; }
  _rebindResolver(reqId, true, correo);
}
async function _rebindResolver(reqId, aprobar, correo) {
  if (!sb) return;
  const btns = document.querySelectorAll('.modal-footer .btn');
  Array.prototype.forEach.call(btns, function (b) { b.disabled = true; });
  try {
    const r = await sb.rpc('resolver_rebind', { p_request_id: reqId, p_aprobar: !!aprobar, p_correo_elegido: aprobar ? (correo || null) : null });
    if (r.error) throw r.error;
    const res = (r.data && typeof r.data === 'object') ? r.data : {};
    closeModal();
    if (aprobar) showToast({ kind: 'success', title: 'Acceso aprobado', body: 'La persona quedó dentro del proyecto con el correo ' + escapeHtml(res.correo_elegido || correo || '') + '.', duration: 8000 });
    else showToast({ kind: 'info', title: 'Solicitud rechazada', body: 'Se canceló la invitación y se liberó el cupo del cargo.', duration: 8000 });
    try { notifCargar(); } catch (e) {}
    try { if (typeof _empCargarRebinds === 'function') _empCargarRebinds(); } catch (e) {}
  } catch (e) {
    const raw = (e && e.message) ? String(e.message) : '';
    showToast({ kind: 'error', title: 'No se pudo resolver', body: (raw.replace(/^resolver_rebind:\s*/i, '') || 'Reintenta en un momento.'), duration: 9000 });
    Array.prototype.forEach.call(btns, function (b) { b.disabled = false; });
  }
}
export async function _empCargarRebinds() {
  var box = document.getElementById('empRebindsBox'); if (!box || !sb) return;
  try {
    var r = await sb.from('invitation_rebind_requests').select('*').eq('estado', 'pendiente').order('requested_at', { ascending: false });
    if (r.error) throw r.error;
    var rows = r.data || [];
    if (!rows.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = '';
    box.innerHTML = '<div style="border:1px solid var(--warning);border-radius:10px;padding:12px 14px;background:rgba(234,179,8,.07);margin-bottom:14px;">'
      + '<div style="font-weight:700;font-size:13px;color:var(--ink-primary);margin-bottom:8px;">Solicitudes de cambio de correo pendientes (' + rows.length + ')</div>'
      + rows.map(function (q) {
          return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border-top:1px solid var(--rule);padding:8px 0;">'
            + '<div style="font-size:12.5px;color:var(--ink-secondary);line-height:1.4;">Invitado: <strong>' + escapeHtml(q.invited_email || '—') + '</strong><br>Reclamó como: <strong>' + escapeHtml(q.claiming_email || '—') + '</strong></div>'
            + '<button class="btn btn-sm" ' + accionHTML('ntf.rebind', q.id) + '>Revisar</button>'
            + '</div>';
        }).join('')
      + '</div>';
  } catch (e) { box.style.display = 'none'; }
}
export function notifInit() {
  notifCargar();
  if (_NOTIF_TIMER) clearInterval(_NOTIF_TIMER);
  _NOTIF_TIMER = setInterval(notifCargar, 60000);
  if (!_NOTIF_OUTSIDE) {
    _NOTIF_OUTSIDE = true;
    document.addEventListener('click', function (ev) {
      const p = document.getElementById('notifPanel'); if (!p || p.style.display === 'none') return;
      const w = ev.target.closest && ev.target.closest('.notif-wrap');
      if (!w) p.style.display = 'none';
    });
  }
}

// ── Sistema B · motor de correos ──────────────────────────────────────────────

const NOTIF_CFG_KEY = 'takeos_notif_config_v1';

function notifDefaultTemplates() {
  const firmaHTML = 'Saludos!<br>{{NOMBRE REMITENTE}}<br>{{NÚMERO REMITENTE}}<br>{{ROL REMITENTE}}';
  const empresaHTML = 'Emite tu {{BOLETA O FACTURA}} a:<br>{{RAZÓN SOCIAL}}<br>{{RUT EMPRESA}}<br>{{BANCO}}<br>{{TIPO DE CUENTA}}<br>{{N° DE CUENTA}}<br>{{MAIL EMPRESA}}';
  const prodPrefix = 'Hola {{NOMBRE}}!<br><br>Para poder pagarte, por favor llena el siguiente formulario: {{LINK FORMULARIO}}. Si ya has llenado el formulario antes, ignóralo.<br><br>En base a lo conversado por el proyecto <b>{{NOMBRE PROYECTO}}</b> de <b>{{NOMBRE CLIENTE}}</b>:<br><br>• Fecha/s de rodaje: <b>{{FECHA DE RODAJE}}</b><br>• Monto bruto: <b>{{MONTO BRUTO}} ({{MONTO NETO}} neto)</b><br>• DTE: <b>{{BOLETA O FACTURA}}</b><br><br><i>La hoja de llamado con el detalle de horarios será enviada entre 12 y 48 horas previo al rodaje.</i><br><br>';
  const prodSuffix = '<br><br>Adjunto los datos de la empresa:<br><br>' + empresaHTML + '<br><br>' + firmaHTML;
  const prodEstandar = prodPrefix + 'Una vez realizado el trabajo, envíame tu {{BOLETA O FACTURA}}. El pago está fijado para 30 días <b>después de la emisión</b> de tu {{BOLETA O FACTURA}}.' + prodSuffix;
  const prodPP = prodPrefix + 'Según lo conversado, <b>tienes pronto pago</b>. Una vez emitida tu {{BOLETA O FACTURA}}, la transferencia se realizará el <b>primer viernes después de la emisión</b> (si la emisión cae viernes, queda para el lunes siguiente).' + prodSuffix;
  return [
    { key: 'prod', nombre: 'Producción', asunto: 'Detalles de Rodaje {{NOMBRE PROYECTO}} de {{NOMBRE CLIENTE}}', subverBy: 'prontoPago', subvers: [{ key: 'estandar', label: 'Estándar' }, { key: 'pp', label: 'Pronto Pago' }], cuerpos: { estandar: prodEstandar, pp: prodPP }, cuerpo: prodEstandar },
    { key: 'dte1', nombre: 'Petición de DTE', asunto: 'Recuerda tu {{BOLETA O FACTURA}}', cuerpo: 'Hola {{NOMBRE}}!<br><br>Recuerda enviarme tu {{BOLETA O FACTURA}}. El pago se realizará 30 días <b>después de la emisión</b> de tu {{BOLETA O FACTURA}}. Mientras antes me la envíes, antes llegará el pago.<br><br>Los datos de la empresa son:<br><br>' + empresaHTML + '<br><br>Si aún no has llenado el formulario, debes llenarlo para poder depositarte. Te lo dejo aquí: {{LINK FORMULARIO}}. Si ya lo llenaste, ignóralo.<br><br>' + firmaHTML },
    { key: 'dte2', nombre: 'Insistencia de DTE', asunto: 'Recuerda tu {{BOLETA O FACTURA}}', cuerpo: 'Hola {{NOMBRE}},<br><br>Necesito que me envíes tu {{BOLETA O FACTURA}}. El pago se realizará 30 días <b>después de la emisión</b> de tu {{BOLETA O FACTURA}}.<br><br>Los datos de la empresa son:<br><br>' + empresaHTML + '<br><br>Si aún no has llenado el formulario, debes llenarlo para poder depositarte. Te lo dejo aquí: {{LINK FORMULARIO}}. Si ya lo llenaste, ignóralo.<br><br>' + firmaHTML },
    { key: 'confirmacion', nombre: 'Confirmación de Asistencia', asunto: 'Confirma tu asistencia · {{NOMBRE PROYECTO}} · {{FECHA DE RODAJE}}', cuerpo: 'Hola {{NOMBRE}}!<br><br>Se acerca el rodaje de <b>{{NOMBRE PROYECTO}}</b> de <b>{{NOMBRE CLIENTE}}</b>.<br><br>• Fecha/s de rodaje: <b>{{FECHA DE RODAJE}}</b><br>• Tu rol: <b>{{ROL}}</b><br><br>Por favor <b>confírmame tu asistencia</b> respondiendo este correo. La hoja de llamado con horarios y locación te llegará por separado, entre 12 y 48 horas antes.<br><br>Si surge cualquier imprevisto, avísame cuanto antes.<br><br>' + firmaHTML }
  ];
}
function notifEmpresaDefault() {
  var e = (typeof EMPRESA_PERFIL !== 'undefined' && EMPRESA_PERFIL) ? EMPRESA_PERFIL : {};
  var dir = [e.direccion, e.comuna, e.ciudad].filter(Boolean).join(', ');
  return { razonSocial: e.razonSocial || '', rut: e.rut || '', direccion: dir || '', giro: e.giro || '', mail: e.email || '', numero: e.telefono || '' };
}
function notifLoadConfig() {
  let cfg = null;
  try { cfg = JSON.parse(localStorage.getItem(NOTIF_CFG_KEY) || 'null'); } catch (e) { cfg = null; }
  if (!cfg) cfg = { empresa: notifEmpresaDefault(), remitente: { nombre: '', numero: '', rol: '' }, linkFormulario: '', templates: notifDefaultTemplates() };
  if (!cfg.empresa) cfg.empresa = { razonSocial: '', rut: '', direccion: '', giro: '', mail: '', numero: '' };
  (function(){ var d = notifEmpresaDefault(); Object.keys(d).forEach(function(k){ if (!cfg.empresa[k]) cfg.empresa[k] = d[k]; }); })();
  if (!cfg.remitente) cfg.remitente = { nombre: '', numero: '', rol: '' };
  if (cfg.linkFormulario === undefined) cfg.linkFormulario = '';
  if (!Array.isArray(cfg.templates) || !cfg.templates.length) cfg.templates = notifDefaultTemplates();
  notifDefaultTemplates().forEach(dt => { if (!cfg.templates.some(t => t.key === dt.key)) cfg.templates.push(dt); });
  notifDefaultTemplates().forEach(dt => {
    if (!dt.subvers || !dt.subvers.length) return;
    const t = cfg.templates.find(x => x.key === dt.key); if (!t) return;
    if (!t.subvers || !t.subvers.length) {
      t.subvers = dt.subvers.slice(); t.subverBy = dt.subverBy; t.cuerpos = {};
      dt.subvers.forEach((sv, i) => { t.cuerpos[sv.key] = (i === 0 && t.cuerpo) ? t.cuerpo : (dt.cuerpos ? dt.cuerpos[sv.key] : ''); });
      if (!t.cuerpo && t.cuerpos[dt.subvers[0].key]) t.cuerpo = t.cuerpos[dt.subvers[0].key];
    }
  });
  return cfg;
}
function getNotifConfig() { if (!_notifCfg) _notifCfg = notifLoadConfig(); return _notifCfg; }
function notifSaveConfig() { try { localStorage.setItem(NOTIF_CFG_KEY, JSON.stringify(getNotifConfig())); } catch (e) {} }

function ensureNotif(project) {
  if (!project.data.notificaciones) project.data.notificaciones = { log: [], status: {} };
  const n = project.data.notificaciones;
  if (!Array.isArray(n.log)) n.log = [];
  if (!n.status) n.status = {};
  return n;
}

function notifFill(str, vars) {
  return String(str || '').replace(/\{\{([^}]+)\}\}/g, (m, k) => {
    const key = k.trim(); const v = vars[key];
    return (v === undefined || v === null || v === '') ? ('[FALTA: ' + key + ']') : v;
  });
}
function _dteWord(dte) {
  return ({ boleta: 'boleta', factura: 'factura', factura_exenta: 'factura exenta', boleta_terceros: 'boleta de terceros' })[dte] || 'boleta o factura';
}
export function _fechaCorta(iso) {
  if (!iso) return ''; const p = String(iso).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}
function notifRecipients(project) {
  const d = project.data; const byName = {};
  const add = (nombre, rol, valor, cantidad, dte, prontoPago) => {
    if (!nombre) return;
    if (!byName[nombre]) byName[nombre] = { nombre, rol: rol || '', dte: dte || '', monto: 0, prontoPago: false };
    byName[nombre].monto += (valor || 0) * (cantidad || 0);
    if (!byName[nombre].dte && dte) byName[nombre].dte = dte;
    if (!byName[nombre].rol && rol) byName[nombre].rol = rol;
    if (prontoPago) byName[nombre].prontoPago = true;
  };
  for (const dept in d.servicios) d.servicios[dept].forEach(r => { if (r.confirmado && r.nombre && !r.noVaRodaje) add(r.nombre, r.rol, r.valor, r.cantidad, r.dte, r.prontoPago); });
  ['gastos', 'equipos', 'talentos'].forEach(sec => (d[sec] || []).forEach(r => { if (r.confirmado && r.nombre && !r.noVaRodaje) add(r.nombre, r.item, r.valor, r.cantidad, r.dte, r.prontoPago); }));
  return Object.values(byName).map(p => {
    const bd = BD_PERSONAS[p.nombre] || {};
    return Object.assign(p, { mail: bd.mail || '', enBD: !!BD_PERSONAS[p.nombre] });
  });
}
function notifVarsFor(project, rec) {
  const ip = project.data.infoProyecto || {};
  const EP = EMPRESA_PERFIL || {};
  const fechas = (project.data.rodajes || []).filter(x => x.activo && x.fecha).map(x => _fechaCorta(x.fecha)).join(', ');
  const neto = rec.monto || 0;
  let bruto;
  if (DTE_CON_RETENCION.includes(rec.dte)) bruto = Math.round(neto / factorRetencionDte(rec.dte));
  else if (rec.dte === 'factura')                  bruto = Math.round(neto * (1 + IVA));
  else                                             bruto = neto;
  const _dteW = _dteWord(rec.dte);
  const _condPago = rec.prontoPago
    ? ('Según lo conversado, tienes pronto pago. Una vez emitida tu ' + _dteW + ', la transferencia se realizará el primer viernes después de la emisión (si la emisión cae viernes, queda para el lunes siguiente).')
    : ('Una vez realizado el trabajo, envíame tu ' + _dteW + '. El pago está fijado para 30 días después de la emisión de tu ' + _dteW + '.');
  const _rem = getNotifConfig().remitente || {};
  return {
    'NOMBRE': rec.nombre, 'ROL': rec.rol,
    'NOMBRE PROYECTO': ip.nombreProyecto || project.name || '', 'NOMBRE CLIENTE': ip.cliente || '',
    'FECHA DE RODAJE': fechas, 'MONTO BRUTO': fmtMoney(bruto), 'MONTO NETO': fmtMoney(neto),
    'BOLETA O FACTURA': _dteWord(rec.dte), 'CONDICIÓN DE PAGO': _condPago,
    'RAZÓN SOCIAL': EP.razonSocial || '', 'RUT EMPRESA': EP.rut || '', 'DIRECCIÓN EMPRESA': EP.direccion || '',
    'GIRO EMPRESA': EP.giro || '', 'MAIL EMPRESA': EP.email || '', 'NÚMERO EMPRESA': EP.telefono || '',
    'BANCO': EP.bancoNombre || '', 'TIPO DE CUENTA': EP.bancoTipoCuenta || '', 'N° DE CUENTA': EP.bancoNumero || '',
    'LINK FORMULARIO': EP.linkFormularioPago || getNotifConfig().linkFormulario || '',
    'NOMBRE REMITENTE': _rem.nombre || EP.remitenteNombre || EP.representante || '',
    'NÚMERO REMITENTE': _rem.numero || EP.remitenteNumero || EP.repTelefono || '',
    'ROL REMITENTE': _rem.rol || EP.remitenteRol || ''
  };
}
const NOTIF_VAR_KEYS = ['NOMBRE', 'ROL', 'NOMBRE PROYECTO', 'NOMBRE CLIENTE', 'FECHA DE RODAJE', 'MONTO BRUTO', 'MONTO NETO', 'BOLETA O FACTURA', 'CONDICIÓN DE PAGO', 'RAZÓN SOCIAL', 'RUT EMPRESA', 'BANCO', 'TIPO DE CUENTA', 'N° DE CUENTA', 'DIRECCIÓN EMPRESA', 'GIRO EMPRESA', 'MAIL EMPRESA', 'NÚMERO EMPRESA', 'LINK FORMULARIO', 'NOMBRE REMITENTE', 'NÚMERO REMITENTE', 'ROL REMITENTE'];

function notifHtmlToPlain(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<li>/gi, '\n• ')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n').trim();
}
function notifSetCfg(path, val) {
  const cfg = getNotifConfig(); const parts = path.split('.');
  if (parts.length === 2) cfg[parts[0]][parts[1]] = val; else cfg[parts[0]] = val;
  notifSaveConfig();
}
function notifSetTpl(key, field, val) {
  const cfg = getNotifConfig(); const t = cfg.templates.find(x => x.key === key); if (t) { t[field] = val; notifSaveConfig(); }
}
// notifSelectedRecs eliminada (investigación ntf* 2-jul): código muerto — su único invocador era la vista legacy huérfana; usaba st.template, inexistente en ntfState()
// notifMarkSent eliminada (investigación ntf* 2-jul): código muerto — su único invocador era la vista legacy huérfana; usaba st.template, inexistente en ntfState()
// notifMarkAllSent eliminada (investigación ntf* 2-jul): código muerto — su único invocador era la vista legacy huérfana; usaba st.template, inexistente en ntfState()
function notifLogPush(project, templateKey, count) {
  const cfg = getNotifConfig(); const n = ensureNotif(project);
  const tpl = cfg.templates.find(t => t.key === templateKey);
  n.log.push({ ts: new Date().toLocaleString('es-CL'), template: tpl ? tpl.nombre : templateKey, count: count, by: cfg.remitente.nombre || '' });
}
function notifCopyTemplate() {
  const cfg = getNotifConfig(); const st = ntfState();
  const tpl = cfg.templates.find(t => t.key === st.tplKey) || ntfCurTpl();
  const txt = 'ASUNTO:\n' + tpl.asunto + '\n\nCUERPO (pega en el borrador en modo HTML o normal):\n' + tpl.cuerpo;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(
      () => showToast({ kind: 'success', title: 'Plantilla copiada', body: 'Pégala en un borrador nuevo de Gmail.' }),
      () => showToast({ kind: 'info', title: 'Copia manual', body: 'No se pudo copiar automáticamente. Usa el editor de plantilla.' })
    );
  } else { showToast({ kind: 'info', title: 'Copia manual', body: 'Tu navegador no permite copiar automático. Usa el editor de plantilla.' }); }
}
function notifGmailDraft(nombre) {
  const project = STATE.currentProject; const cfg = getNotifConfig(); const st = ntfState();
  const tpl = cfg.templates.find(t => t.key === st.tplKey) || ntfCurTpl();
  const rec = notifRecipients(project).find(r => r.nombre === nombre); if (!rec) return;
  const vars = notifVarsFor(project, rec);
  const su = encodeURIComponent(notifFill(tpl.asunto, vars));
  const body = encodeURIComponent(notifHtmlToPlain(notifFill(tpl.cuerpo, vars)));
  const to = encodeURIComponent(rec.mail || '');
  window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${su}&body=${body}`, '_blank');
}

// ── Sistema C · ntf* rebuild (renderNotificaciones V7.13) ────────────────────

const NTF_LABELS = {
  'NOMBRE': 'Nombre', 'ROL': 'Rol', 'MONTO BRUTO': 'Monto bruto', 'MONTO NETO': 'Monto neto', 'BOLETA O FACTURA': 'Boleta/Factura', 'CONDICIÓN DE PAGO': 'Condición de pago (auto)',
  'NOMBRE PROYECTO': 'Proyecto', 'NOMBRE CLIENTE': 'Cliente', 'FECHA DE RODAJE': 'Fecha de rodaje',
  'RAZÓN SOCIAL': 'Razón social', 'RUT EMPRESA': 'RUT empresa', 'BANCO': 'Banco', 'TIPO DE CUENTA': 'Tipo de cuenta', 'N° DE CUENTA': 'N° de cuenta',
  'DIRECCIÓN EMPRESA': 'Dirección', 'GIRO EMPRESA': 'Giro', 'MAIL EMPRESA': 'Mail empresa', 'NÚMERO EMPRESA': 'Número empresa', 'LINK FORMULARIO': 'Link formulario',
  'NOMBRE REMITENTE': 'Remitente', 'ROL REMITENTE': 'Rol remitente', 'NÚMERO REMITENTE': 'Número remitente'
};
const NTF_PERSON_VARS = ['NOMBRE', 'ROL', 'MONTO BRUTO', 'MONTO NETO', 'BOLETA O FACTURA', 'CONDICIÓN DE PAGO'];
const NTF_PROJ_VARS = ['NOMBRE PROYECTO', 'NOMBRE CLIENTE', 'FECHA DE RODAJE'];
const NTF_COMPANY_VARS = ['RAZÓN SOCIAL', 'RUT EMPRESA', 'BANCO', 'TIPO DE CUENTA', 'N° DE CUENTA', 'DIRECCIÓN EMPRESA', 'GIRO EMPRESA', 'MAIL EMPRESA', 'NÚMERO EMPRESA', 'LINK FORMULARIO'];
const NTF_SENDER_VARS = ['NOMBRE REMITENTE', 'ROL REMITENTE', 'NÚMERO REMITENTE'];
const NTF_EFX_LABEL = { calendar: '📅 Agenda en Google Calendar', adjuntaHoja: '📎 Adjunta Hoja de Llamado (PDF)', dteNext: '⏰ Inicia recordatorios de DTE', auto24: '⏰ Automático 24 h antes', satisf: '⏰ Automático tras la entrega' };
const NTF_TPL_META = {
  prod: { grupo: 'Rodaje', efx: ['calendar'] }, confirmacion: { grupo: 'Rodaje', efx: ['auto24'] },
  hoja: { grupo: 'Rodaje', efx: ['adjuntaHoja'] }, dte1: { grupo: 'Documentos · DTE', efx: ['dteNext'] }, dte2: { grupo: 'Documentos · DTE', efx: [] },
  cliente: { grupo: 'Cliente', efx: [] }, satisfaccion: { grupo: 'Cliente', efx: ['satisf'] }
};
const NTF_EXTRA_TPLS = [
  { key: 'hoja', nombre: 'Envío de Hoja de Llamado', asunto: 'Hoja de Llamado · {{NOMBRE PROYECTO}} · {{FECHA DE RODAJE}}', cuerpo: 'Hola {{NOMBRE}}!<br><br>Adjunto la <b>Hoja de Llamado</b> del rodaje de <b>{{NOMBRE PROYECTO}}</b> de <b>{{NOMBRE CLIENTE}}</b>.<br><br>• Fecha/s de rodaje: <b>{{FECHA DE RODAJE}}</b><br>• Tu rol: <b>{{ROL}}</b><br><br>Revisa tu horario de llamado y la locación en el documento adjunto. Cualquier duda, escríbeme.<br><br>Saludos!<br>{{NOMBRE REMITENTE}}<br>{{NÚMERO REMITENTE}}<br>{{ROL REMITENTE}}' },
  { key: 'cliente', nombre: 'Comunicación a Cliente / Agencia', asunto: '{{NOMBRE PROYECTO}} · actualización', cuerpo: 'Hola!<br><br>Te escribo respecto al proyecto <b>{{NOMBRE PROYECTO}}</b>.<br><br>[Escribe aquí la actualización para el cliente.]<br><br>Quedo atento a cualquier comentario.<br><br>Saludos!<br>{{NOMBRE REMITENTE}}<br>{{ROL REMITENTE}}<br>{{NÚMERO REMITENTE}}' },
  { key: 'satisfaccion', nombre: 'Formulario de Satisfacción', asunto: '¿Cómo lo hicimos? · {{NOMBRE PROYECTO}}', cuerpo: 'Hola!<br><br>Gracias por confiar en nosotros para <b>{{NOMBRE PROYECTO}}</b>. Nos ayudaría mucho que respondas este breve formulario sobre tu experiencia: {{LINK FORMULARIO}}<br><br>Tu opinión nos sirve para mejorar.<br><br>Saludos!<br>{{NOMBRE REMITENTE}}' }
];

function ntfState() {
  if (!STATE.ui.ntf) STATE.ui.ntf = { tab: 'enviar', tplKey: null, channel: 'email', editKey: null, editChannel: 'email', sel: {}, viewAs: null, override: false, overrides: {}, focusField: 'ntfEdBody', fromHoja: false, adjuntos: [], schedDate: '', histOpen: {} };
  const s = STATE.ui.ntf;
  if (!s.overrides) s.overrides = {}; if (!Array.isArray(s.adjuntos)) s.adjuntos = []; if (!s.histOpen) s.histOpen = {}; if (s.schedDate === undefined) s.schedDate = '';
  return s;
}
function ntfEnsureSched(project) { const n = ensureNotif(project); if (!Array.isArray(n.programados)) n.programados = []; if (!n.reglas) n.reglas = { confirm24: true, dteNext: true, dte2: true, dte3: false, satisf: true }; return n; }
function ntfTemplates() {
  const cfg = getNotifConfig();
  NTF_EXTRA_TPLS.forEach(et => { if (!cfg.templates.some(t => t.key === et.key)) cfg.templates.push(JSON.parse(JSON.stringify(et))); });
  cfg.templates.forEach(t => { const m = NTF_TPL_META[t.key] || { grupo: 'Otros', efx: [] }; if (!t.grupo) t.grupo = m.grupo; if (!Array.isArray(t.efx)) t.efx = (m.efx || []).slice(); if (t.distinguir === undefined) t.distinguir = false; if (t.privada === undefined) t.privada = false; });
  return cfg.templates;
}
function ntfTpl(key) { const ts = ntfTemplates(); return ts.find(t => t.key === key) || ts[0]; }
function ntfCurTpl() { const st = ntfState(); if (!st.tplKey) st.tplKey = ntfTemplates()[0].key; return ntfTpl(st.tplKey); }
function ntfCurEditTpl() { const st = ntfState(); if (!st.editKey) st.editKey = ntfTemplates()[0].key; return ntfTpl(st.editKey); }
function ntfSubverForRec(tpl, rec) {
  if (!tpl.subverBy || !tpl.subvers || !tpl.subvers.length) return null;
  const field = tpl.subverBy;
  if (field === 'prontoPago') return rec.prontoPago ? 'pp' : 'estandar';
  return null;
}
function ntfTplBody(tpl, rec) {
  const sv = ntfSubverForRec(tpl, rec);
  if (sv && tpl.cuerpos && tpl.cuerpos[sv]) return tpl.cuerpos[sv];
  return tpl.cuerpo || '';
}
function ntfCurSubver(tpl) {
  const st = ntfState();
  if (!tpl.subvers || !tpl.subvers.length) return null;
  return st.editSubver || (tpl.subvers[0] && tpl.subvers[0].key) || null;
}
function ntfSetEditSubver(k) { ntfState().editSubver = k; renderNotificaciones(); }
function ntfSampleRec(project) { const r = notifRecipients(project); return r[0] || { nombre: 'Nombre Apellido', rol: 'Crew', mail: 'persona@correo.com', monto: 0, dte: 'boleta', enBD: false }; }
function ntfIsAdmin() { return !!(STATE && STATE.adminMode); }
function ntfPillify(str) { return String(str || '').replace(/\{\{([^}]+)\}\}/g, (m, k) => { k = k.trim(); return '<span class="vpill" contenteditable="false" data-v="' + escapeHtml(k) + '">' + escapeHtml(NTF_LABELS[k] || k) + '</span>'; }); }
function ntfSerialize(node) {
  if (!node) return '';
  let out = '';
  node.childNodes.forEach(n => {
    if (n.nodeType === 3) { out += n.textContent; }
    else if (n.nodeName === 'BR') { out += '<br>'; }
    else if (n.nodeName === 'SPAN' && n.classList.contains('vpill')) { out += '{{' + (n.dataset.v || n.textContent) + '}}'; }
    else if (n.nodeName === 'DIV' || n.nodeName === 'P') { const inner = ntfSerialize(n); out += (out ? '<br>' : '') + inner; }
    else { out += ntfSerialize(n); }
  });
  return out;
}
function ntfMissingVars(project, tpl, channel, rec) {
  const body = channel === 'wsp' && tpl.wsp ? tpl.wsp : ntfTplBody(tpl, rec);
  const vars = notifVarsFor(project, rec);
  const used = []; String(tpl.asunto + ' ' + body).replace(/\{\{([^}]+)\}\}/g, (m, k) => used.push(k.trim()));
  return used.filter(k => { const v = vars[k]; return v === undefined || v === null || v === '' || (typeof v === 'string' && v.startsWith('[FALTA')); });
}
function ntfValidate(project, tpl, rec, channel) {
  if (!rec.mail && channel === 'email') return { ok: false, kind: 'sinmail' };
  const miss = ntfMissingVars(project, tpl, channel, rec);
  if (miss.length) return { ok: false, kind: 'missvar', miss };
  return { ok: true };
}
function ntfPreviewHtml(project, tpl, channel, rec, overrideBody) {
  const body = overrideBody != null ? overrideBody : (channel === 'wsp' && tpl.wsp ? tpl.wsp : ntfTplBody(tpl, rec));
  const vars = notifVarsFor(project, rec);
  return notifFill(body, vars);
}
function ntfChannelSeg(current, onclickPrefix) {
  const channels = [{ k: 'email', label: '✉ Email' }, { k: 'wsp', label: '💬 WhatsApp' }];
  return '<div style="display:flex;gap:6px;margin-bottom:12px;">' + channels.map(c => '<button class="btn btn-sm ' + (current === c.k ? 'btn-primary' : 'btn-secondary') + '" ' + accionHTML('ntf.canal', onclickPrefix, c.k) + '>' + c.label + '</button>').join('') + '</div>';
}
function ntfSetTab(t) { ntfState().tab = t; renderNotificaciones(); }
function ntfRecState(project) {
  const st = ntfState(); const tpl = ntfCurTpl();
  return notifRecipients(project).map(r => ({ rec: r, sel: st.sel[tpl.key + '::' + r.nombre] !== false }));
}
function ntfViewEnviar(project) {
  const st = ntfState(); const tpl = ntfCurTpl();
  const recs = ntfRecState(project); const selRecs = recs.filter(x => x.sel).map(x => x.rec);
  const val = r => ntfValidate(project, tpl, r, st.channel);
  const okRecs = selRecs.filter(r => val(r).ok); const okN = okRecs.length;
  const bloqueados = selRecs.filter(r => !val(r).ok);
  const n = ensureNotif(project);
  const gruposTpls = {};
  ntfTemplates().forEach(t => { const g = t.grupo || 'Otros'; if (!gruposTpls[g]) gruposTpls[g] = []; gruposTpls[g].push(t); });
  return '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;">'
    + '<div style="flex:0 0 180px;min-width:140px;">'
    + Object.entries(gruposTpls).map(([g, ts]) =>
        '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-faint);font-weight:700;margin:10px 0 4px;">' + escapeHtml(g) + '</div>'
        + ts.map(t => '<button class="btn btn-sm ' + (t.key === tpl.key ? 'btn-primary' : 'btn-ghost') + '" style="width:100%;text-align:left;margin-bottom:3px;" ' + accionHTML('ntf.tpl', t.key) + '>' + escapeHtml(t.nombre) + '</button>').join('')
      ).join('')
    + '</div>'
    + '<div style="flex:1;min-width:260px;">'
    + ntfChannelSeg(st.channel, 'ntfSetChannel')
    + '<div style="overflow-x:auto;margin-bottom:12px;"><table class="data-table"><thead><tr>'
    + '<th style="width:28px;"><input type="checkbox" ' + (selRecs.length === recs.length && recs.length ? 'checked' : '') + ' data-accion="ntf.selAll" data-on="change"></th>'
    + '<th>Nombre</th><th>Rol</th><th>Mail</th><th>Monto</th><th>Estado</th></tr></thead><tbody>'
    + recs.map(({ rec: r, sel }) => {
        const vr = val(r); const sent = (n.status || {})[tpl.key + '::' + r.nombre] === 'enviado';
        return '<tr ' + accionHTML('ntf.rec', r.nombre, !sel) + ' style="cursor:pointer;' + (!sel ? 'opacity:.45;' : '') + '">'
          + '<td data-accion="ui.stop"><input type="checkbox" ' + (sel ? 'checked' : '') + ' ' + accionHTML('ntf.recCk', r.nombre, { on: 'change' }) + '></td>'
          + '<td>' + escapeHtml(r.nombre) + (!r.enBD ? ' <span style="color:var(--warning);" title="Sin mail en BD">●</span>' : '') + '</td>'
          + '<td>' + escapeHtml(r.rol) + '</td>'
          + '<td>' + (r.mail ? escapeHtml(r.mail) : '<span style="color:var(--warning);">sin mail</span>') + '</td>'
          + '<td>' + fmtMoney(r.monto) + '</td>'
          + '<td>' + (sent ? '<span style="color:var(--positive);font-weight:600;">Enviado</span>' : '<span style="color:var(--ink-faint);">Pendiente</span>')
          + ' <button class="btn btn-ghost btn-sm" ' + accionHTML('ntf.verComo', r.nombre) + '>Vista previa</button>'
          + (r.mail && st.channel === 'email' ? ' <button class="btn btn-ghost btn-sm" ' + accionHTML('ntf.gmail', r.nombre) + '>✉</button>' : '')
          + '</td></tr>';
      }).join('')
    + '</tbody></table></div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">'
    + '<button class="btn btn-primary" ' + (okN ? '' : 'disabled') + ' data-accion="ntf.enviar">Enviar a ' + okN + ' ' + (st.channel === 'wsp' ? 'por WhatsApp' : 'por email') + '</button>'
    + '<button class="btn btn-secondary btn-sm" data-accion="ntf.programar">Programar</button>'
    + '<button class="btn btn-ghost btn-sm" data-accion="ntf.copiarTpl">⧉ Copiar plantilla</button>'
    + '</div>'
    + (bloqueados.length ? '<p style="margin:10px 0 0;font-size:12px;color:var(--warning);">No se puede enviar a ' + bloqueados.length + ' de ' + selRecs.length + ': ' + bloqueados.map(r => { const vr = val(r); return escapeHtml(r.nombre.split(' ')[0]) + ' (' + (vr.kind === 'sinmail' ? 'sin mail' : 'faltan datos: ' + vr.miss.map(k => NTF_LABELS[k] || k).join(', ')) + ')'; }).join(', ') + '.</p>' : (selRecs.length ? '<p style="margin:10px 0 0;font-size:12px;color:var(--positive);">Listo para enviar a ' + okN + ' persona(s).</p>' : ''))
    + (st.viewAs ? (function () {
        // Regresión restaurada (investigación ntf* 2-jul): el monolito V7.13 LEÍA
        // st.overrides[ovKey] y lo aplicaba al preview; la extracción conservó el
        // guardado (ntfSaveOverride) pero perdió esta lectura — el override se
        // guardaba y jamás se aplicaba ni se indicaba.
        const _ovKey = tpl.key + '::' + st.viewAs;
        const _ovStored = st.overrides[_ovKey];
        const _viewRec = notifRecipients(project).find(r => r.nombre === st.viewAs) || ntfSampleRec(project);
        return '<div style="margin-top:16px;border:1px solid var(--rule);border-radius:10px;padding:14px;background:var(--bg-surface);">'
        + '<div style="font-size:11px;color:var(--ink-faint);margin-bottom:8px;">Vista previa para <strong>' + escapeHtml(st.viewAs) + '</strong> · ' + escapeHtml(tpl.nombre) + (_ovStored != null ? ' · <span style="color:var(--positive);">✓ override guardado</span>' : '') + '</div>'
        + (!st.override
          ? ('<div style="font-size:12.5px;line-height:1.6;">' + ntfPreviewHtml(project, tpl, st.channel, _viewRec, _ovStored != null ? _ovStored : null) + '</div>'
            + '<button class="btn btn-ghost btn-sm" style="margin-top:8px;" data-accion="ntf.override">Editar solo para esta persona</button>')
          : ('<div id="ntfOverrideBody" contenteditable="true" spellcheck="false" style="font-size:12.5px;line-height:1.6;border:1px solid var(--accent);border-radius:6px;padding:10px;outline:none;min-height:80px;" data-accion="ntf.overrideIn" data-on="input">' + ntfPillify(_ovStored != null ? _ovStored : ntfPreviewHtml(project, tpl, st.channel, _viewRec)) + '</div>'
            + '<div style="display:flex;gap:6px;margin-top:8px;"><button class="btn btn-sm btn-primary" data-accion="ntf.overrideOk">Guardar override</button><button class="btn btn-sm btn-ghost" data-accion="ntf.overrideNo">Cancelar</button></div>'))
        + '</div>';
      })() : '')
    + '</div></div>';
}
function ntfPickTpl(k) { const st = ntfState(); st.tplKey = k; st.override = false; renderNotificaciones(); }
function ntfSetChannel(c) { ntfState().channel = c; renderNotificaciones(); }
function ntfSetViewAs(name) { ntfState().viewAs = name; ntfState().override = false; renderNotificaciones(); }
function ntfToggleRec(nombre, on) { const st = ntfState(); st.sel[ntfCurTpl().key + '::' + nombre] = on; renderNotificaciones(); }
function ntfSelAll(on) { const st = ntfState(); const tpl = ntfCurTpl(); notifRecipients(STATE.currentProject).forEach(r => st.sel[tpl.key + '::' + r.nombre] = on); renderNotificaciones(); }
function ntfStartOverride() { ntfState().override = true; renderNotificaciones(); }
function ntfOverrideInput() { const el = document.getElementById('ntfOverrideBody'); if (el) ntfState()._pendingOverride = ntfSerialize(el); }
function ntfSaveOverride() { const st = ntfState(); const tpl = ntfCurTpl(); const ovKey = tpl.key + '::' + st.viewAs; if (st._pendingOverride != null) st.overrides[ovKey] = st._pendingOverride; st.override = false; st._pendingOverride = null; markDirty(); showToast({ kind: 'success', title: 'Override guardado', body: 'Solo para ' + escapeHtml(String(st.viewAs).split(' ')[0]) + ' · no afecta la plantilla. (Persistencia entre sesiones con el backend.)' }); renderNotificaciones(); }
function ntfSend() {
  const project = STATE.currentProject; const st = ntfState(); const tpl = ntfCurTpl();
  const val = r => ntfValidate(project, tpl, r, st.channel);
  const selRecs = ntfRecState(project).filter(x => x.sel).map(x => x.rec);
  const okRecs = selRecs.filter(r => val(r).ok);
  if (!okRecs.length) { showToast({ kind: 'info', title: 'Sin destinatarios válidos', body: 'Selecciona personas con mail y datos completos.' }); return; }
  const n = ensureNotif(project);
  okRecs.forEach(r => n.status[tpl.key + '::' + r.nombre] = 'enviado');
  notifLogPush(project, tpl.key, okRecs.length);
  markDirty(); renderNotificaciones();
  showToast({ kind: 'success', title: 'Envío registrado', body: okRecs.length + ' correo(s) marcados. La transmisión real se activará con el backend.' });
}
function ntfProgramar() {
  const project = STATE.currentProject; const st = ntfState(); const tpl = ntfCurTpl();
  const when = prompt('¿Cuándo enviar? (fecha y hora, ej. 22/05/2026 09:00):', st.schedDate || '');
  if (!when) return;
  st.schedDate = when;
  const n = ntfEnsureSched(project);
  const selRecs = ntfRecState(project).filter(x => x.sel).map(x => x.rec);
  n.programados.push({ tpl: tpl.key, when, count: selRecs.length, by: getNotifConfig().remitente.nombre || '' });
  markDirty(); renderNotificaciones();
  showToast({ kind: 'success', title: 'Envío programado', body: tpl.nombre + ' · ' + selRecs.length + ' persona(s) para el ' + when + '. La automatización real requiere el backend.' });
}
function ntfViewProgramados(project) {
  const n = ntfEnsureSched(project);
  if (!n.programados.length && !Object.values(n.reglas || {}).some(Boolean)) return '<p style="font-size:12px;color:var(--ink-faint);">No hay envíos programados.</p>';
  return (n.programados.length ? '<div style="margin-bottom:14px;">'
    + '<div style="font-weight:600;font-size:13px;margin-bottom:8px;">Programados manualmente</div>'
    + n.programados.map((s, i) => '<div style="display:flex;align-items:center;gap:10px;border:1px solid var(--rule);border-radius:8px;padding:10px 12px;margin-bottom:6px;"><div style="flex:1;font-size:12.5px;">' + escapeHtml(ntfTpl(s.tpl)?.nombre || s.tpl) + ' · ' + escapeHtml(s.when) + ' · ' + s.count + ' persona(s)</div><button class="btn btn-ghost btn-sm" ' + accionHTML('ntf.reprog', i) + '>Editar</button><button class="btn btn-ghost btn-sm" style="color:var(--negative);" ' + accionHTML('ntf.cancelProg', i) + '>✕</button></div>').join('')
    + '</div>' : '')
    + '<div><div style="font-weight:600;font-size:13px;margin-bottom:8px;">Reglas automáticas <span style="font-size:11px;color:var(--ink-faint);">(requieren backend)</span></div>'
    + Object.entries(n.reglas).map(([id, on]) => '<label style="display:flex;align-items:center;gap:8px;font-size:12.5px;margin-bottom:6px;cursor:pointer;"><input type="checkbox" ' + (on ? 'checked' : '') + ' ' + accionHTML('ntf.regla', id, { on: 'change' }) + '>' + escapeHtml(NTF_EFX_LABEL[id] || id) + '</label>').join('')
    + '</div>';
}
function ntfCancelProg(i) { const n = STATE.currentProject.data.notificaciones; n.programados.splice(i, 1); markDirty(); showToast({ kind: 'info', title: 'Programación cancelada' }); renderNotificaciones(); }
function ntfReprogramar(i) { const n = STATE.currentProject.data.notificaciones; const s = n.programados[i]; if (!s) return; const v = prompt('Nueva fecha y hora (formato libre, ej. 22/05/2026 09:00):', s.when || ''); if (v != null && v.trim()) { s.when = v.trim(); markDirty(); showToast({ kind: 'info', title: 'Fecha actualizada' }); renderNotificaciones(); } }
function ntfToggleRegla(id) { const n = ntfEnsureSched(STATE.currentProject); n.reglas[id] = !n.reglas[id]; markDirty(); renderNotificaciones(); }
function ntfViewHistorial(project) {
  const n = ensureNotif(project); const st = ntfState();
  if (!n.log || !n.log.length) return '<p style="font-size:12px;color:var(--ink-faint);">Aún no hay envíos registrados.</p>';
  return n.log.slice().reverse().map((l, i) =>
    '<div style="border:1px solid var(--rule);border-radius:8px;margin-bottom:6px;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;cursor:pointer;" ' + accionHTML('ntf.hist', i) + '>'
    + '<div style="font-size:12.5px;"><strong>' + escapeHtml(l.template) + '</strong> · ' + l.count + ' destinatario(s) · ' + escapeHtml(l.ts) + (l.by ? ' · ' + escapeHtml(l.by) : '') + '</div>'
    + '<span style="font-size:11px;color:var(--ink-faint);">' + (st.histOpen[i] ? '▾' : '▸') + '</span>'
    + '</div>'
    + (st.histOpen[i] ? '<div style="padding:0 12px 10px;font-size:12px;color:var(--ink-secondary);">Registro guardado localmente. Detalle de destinatarios disponible con el backend.</div>' : '')
    + '</div>'
  ).join('');
}
function ntfToggleHist(i) { const st = ntfState(); st.histOpen[i] = !st.histOpen[i]; renderNotificaciones(); }
function ntfCanEdit(tpl) { return ntfIsAdmin() || !!tpl.privada; }
function ntfViewPlantillas(project) {
  const st = ntfState(); const tpl = ntfCurEditTpl(); const sv = ntfCurSubver(tpl);
  const canEdit = ntfCanEdit(tpl);
  const chip = v => '<span class="ntf-chip" ' + accionHTML('ntf.var', v, { on: 'mousedown' }) + '>' + escapeHtml(NTF_LABELS[v] || v) + '</span>';
  return '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;">'
    + '<div style="flex:0 0 180px;min-width:140px;">'
    + ntfTemplates().map(t => '<button class="btn btn-sm ' + (t.key === tpl.key ? 'btn-primary' : 'btn-ghost') + '" style="width:100%;text-align:left;margin-bottom:3px;" ' + accionHTML('ntf.editKey', t.key) + '>' + escapeHtml(t.nombre) + '</button>').join('')
    + '<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:6px;" data-accion="ntf.nuevaTpl">+ Nueva</button>'
    + '</div>'
    + '<div style="flex:1;min-width:260px;">'
    + '<div class="field" style="margin-bottom:10px;"><label class="field-label">Nombre de plantilla</label>'
    + '<input class="input" value="' + escapeHtml(tpl.nombre) + '" ' + (!canEdit ? 'disabled' : '') + ' data-accion="ntf.tplNombre" data-on="input"></div>'
    + (tpl.subvers && tpl.subvers.length ? '<div style="display:flex;gap:6px;margin-bottom:10px;">' + tpl.subvers.map(s => '<button class="btn btn-sm ' + (sv === s.key ? 'btn-primary' : 'btn-secondary') + '" ' + accionHTML('ntf.subver', s.key) + '>' + escapeHtml(s.label) + '</button>').join('') + '</div>' : '')
    + ntfChannelSeg(st.editChannel, 'ntfSetEditChannel')
    + '<div class="field" style="margin-bottom:8px;"><label class="field-label">Asunto</label>'
    + '<div id="ntfEdSubject" contenteditable="' + canEdit + '" spellcheck="false" style="border:1px solid var(--rule);border-radius:6px;padding:8px 10px;font-size:13px;outline:none;min-height:32px;" data-accion="ntf.editor" data-on="input">' + ntfPillify(tpl.asunto) + '</div></div>'
    + '<div class="field"><label class="field-label">Cuerpo</label>'
    + '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">'
    + '<button class="btn btn-ghost btn-sm" data-accion="ntf.fmt" data-args="[&quot;bold&quot;]"><b>B</b></button>'
    + '<button class="btn btn-ghost btn-sm" data-accion="ntf.fmt" data-args="[&quot;italic&quot;]"><i>I</i></button>'
    + '<button class="btn btn-ghost btn-sm" data-accion="ntf.fmt" data-args="[&quot;underline&quot;]"><u>U</u></button>'
    + '</div>'
    + '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">'
    + [NTF_PERSON_VARS, NTF_PROJ_VARS, NTF_COMPANY_VARS, NTF_SENDER_VARS].flat().map(chip).join('')
    + '</div>'
    + '<div id="ntfEdBody" contenteditable="' + canEdit + '" spellcheck="false" style="border:1px solid var(--rule);border-radius:6px;padding:10px;font-size:12.5px;line-height:1.6;outline:none;min-height:120px;" data-accion="ntf.editorBody" data-on="input">' + ntfPillify(sv && tpl.cuerpos ? (tpl.cuerpos[sv] || tpl.cuerpo) : (st.editChannel === 'wsp' && tpl.wsp ? tpl.wsp : tpl.cuerpo)) + '</div></div>'
    + '<div style="margin-top:16px;"><label class="field-label">Vista previa · ' + escapeHtml(ntfSampleRec(project).nombre) + '</label>'
    + '<div id="ntfPreview" style="border:1px solid var(--rule);border-radius:8px;padding:12px;background:var(--bg-surface);font-size:12.5px;line-height:1.6;">' + ntfPreviewHtml(project, tpl, st.editChannel, ntfSampleRec(project)) + '</div></div>'
    + '</div></div>';
}
function ntfSetEditChannel(c) { ntfState().editChannel = c; renderNotificaciones(); }
function ntfSetTplName(v) { if (!ntfCanEdit(ntfCurEditTpl())) return; ntfCurEditTpl().nombre = v; markDirty(); notifSaveConfig(); }
function ntfNewTemplate() {
  const key = 'custom_' + Date.now();
  const cfg = getNotifConfig();
  cfg.templates.push({ key, nombre: 'Nueva plantilla', grupo: 'Otros', asunto: '', cuerpo: '', efx: [], privada: true });
  notifSaveConfig(); ntfState().editKey = key; renderNotificaciones();
}
function ntfFmt(cmd) { if (!ntfCanEdit(ntfCurEditTpl())) return; try { document.execCommand(cmd, false, null); } catch (e) {} ntfSaveEditor(); ntfRefreshPreview(); }
function ntfInsertVar(v) {
  const el = document.getElementById('ntfEdBody'); if (!el) return;
  const span = document.createElement('span'); span.className = 'vpill'; span.contentEditable = 'false'; span.dataset.v = v; span.textContent = NTF_LABELS[v] || v;
  const sel = window.getSelection();
  if (sel && sel.rangeCount && el.contains(sel.anchorNode)) {
    const r = sel.getRangeAt(0); r.deleteContents(); r.insertNode(span);
    r.setStartAfter(span); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
  } else { el.appendChild(span); }
  ntfSaveEditor(); ntfRefreshPreview();
}
function ntfSaveEditor() {
  if (!ntfCanEdit(ntfCurEditTpl())) return;
  const tpl = ntfCurEditTpl(); const st = ntfState(); const sv = ntfCurSubver(tpl);
  const subj = document.getElementById('ntfEdSubject'); if (subj) tpl.asunto = ntfSerialize(subj);
  const body = document.getElementById('ntfEdBody'); if (!body) return;
  const serialized = ntfSerialize(body);
  if (sv && tpl.cuerpos) tpl.cuerpos[sv] = serialized; else if (st.editChannel === 'wsp') tpl.wsp = serialized; else tpl.cuerpo = serialized;
  notifSaveConfig();
}
function ntfRefreshPreview() {
  const prev = document.getElementById('ntfPreview'); if (!prev) return;
  const project = STATE.currentProject; if (!project) return;
  const tpl = ntfCurEditTpl(); const st = ntfState();
  prev.innerHTML = ntfPreviewHtml(project, tpl, st.editChannel, ntfSampleRec(project));
}
function ntfWireEditor() {
  setTimeout(() => {
    const el = document.getElementById('ntfEdBody'); if (!el) return;
    el.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); document.execCommand('insertHTML', false, '<br>'); ntfSaveEditor(); ntfRefreshPreview(); }
    });
  }, 60);
}
export function ntfOpenFromHoja() {
  const st = ntfState(); st.tab = 'enviar'; st.tplKey = 'hoja'; st.fromHoja = true; st.override = false;
  navigateToModule('correos');
}

export function renderNotificaciones() {
  const project = STATE.currentProject; if (!project) return;
  ensureNotif(project); ntfEnsureSched(project);
  const st = ntfState(); const n = project.data.notificaciones;
  const content = document.getElementById('moduleContent');
  const banner = st.fromHoja ? '<div class="ntf-ctxbanner">📎 Envío preparado desde Hoja de Llamado — plantilla y destinatarios cargados. <button class="ntf-x" data-accion="ntf.cerrarBanner">✕</button></div>' : '';
  const tabBtn = (id, label, badge) => '<button class="ntf-subtab ' + (st.tab === id ? 'on' : '') + '" ' + accionHTML('ntf.tab', id) + '>' + label + (badge != null ? ' <span class="ntf-badge">' + badge + '</span>' : '') + '</button>';
  const prog = (n.programados || []).length;
  content.innerHTML = banner
    + '<div class="ntf-tabs">'
    + tabBtn('enviar', 'Enviar')
    + tabBtn('programados', 'Programados', prog || null)
    + tabBtn('historial', 'Historial', n.log.length || null)
    + tabBtn('plantillas', 'Plantillas')
    + '</div>'
    + '<div class="ntf-body">'
    + (st.tab === 'enviar'      ? ntfViewEnviar(project)      : '')
    + (st.tab === 'programados' ? ntfViewProgramados(project)  : '')
    + (st.tab === 'historial'   ? ntfViewHistorial(project)    : '')
    + (st.tab === 'plantillas'  ? ntfViewPlantillas(project)   : '')
    + '</div>';
  document.getElementById('moduleHeaderActions').innerHTML = '';
  if (st.tab === 'plantillas') ntfWireEditor();
}

// ── Bridges a window ──────────────────────────────────────────────────────────
// Sistema A

// Sistema B

// Sistema C (ntf*)

window.ntfSetChannel       = ntfSetChannel;

window.ntfSetEditChannel   = ntfSetEditChannel;

// ── Bridges agregados por auditoría 2-jul (consumidos por index.html u otros módulos sin bridge) ──

// ── Bridges auditoría pre-B (onclick/oninput en HTML generado por el propio módulo) ──

// D2 · acciones delegadas
registrarAcciones('ntf', {
  rebind: function (a) { notifAbrirRebind(a[0]); },
  abrir: function (a) { notifAbrir(a[0]); },
  rebindNo: function (a) { _rebindResolver(a[0], false); },
  rebindSi: function (a) { _rebindAprobar(a[0]); },
  canal: function (a) { var f = { ntfSetChannel: ntfSetChannel, ntfSetEditChannel: ntfSetEditChannel }[a[0]]; if (f) f(a[1]); },
  tpl: function (a) { ntfPickTpl(a[0]); },
  selAll: function (a, el) { ntfSelAll(el.checked); },
  rec: function (a) { ntfToggleRec(a[0], a[1]); },
  recCk: function (a, el) { ntfToggleRec(a[0], el.checked); },
  verComo: function (a) { ntfSetViewAs(a[0]); },
  gmail: function (a) { notifGmailDraft(a[0]); },
  enviar: function () { ntfSend(); },
  programar: function () { ntfProgramar(); },
  copiarTpl: function () { notifCopyTemplate(); },
  override: function () { ntfStartOverride(); },
  overrideIn: function () { ntfOverrideInput(); },
  overrideOk: function () { ntfSaveOverride(); },
  overrideNo: function () { ntfState().override = false; renderNotificaciones(); },
  reprog: function (a) { ntfReprogramar(a[0]); },
  cancelProg: function (a) { ntfCancelProg(a[0]); },
  regla: function (a) { ntfToggleRegla(a[0]); },
  hist: function (a) { ntfToggleHist(a[0]); },
  var: function (a, el, ev) { ev.preventDefault(); ntfInsertVar(a[0]); },
  editKey: function (a) { ntfState().editKey = a[0]; renderNotificaciones(); },
  nuevaTpl: function () { ntfNewTemplate(); },
  tplNombre: function (a, el) { ntfSetTplName(el.value); },
  subver: function (a) { ntfSetEditSubver(a[0]); },
  editor: function () { ntfSaveEditor(); },
  editorBody: function () { ntfSaveEditor(); ntfRefreshPreview(); },
  fmt: function (a) { ntfFmt(a[0]); },
  cerrarBanner: function () { ntfState().fromHoja = false; renderNotificaciones(); },
  tab: function (a) { ntfSetTab(a[0]); },
});

define('renderNotificaciones', renderNotificaciones);
