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

import { STATE } from '../lib/state.js';
import { escapeHtml, showToast } from '../lib/helpers.js';

// ── Sistema A · variables internas del panel ──────────────────────────────────

let NOTIF = [];
let _NOTIF_TIMER = null;
let _NOTIF_OUTSIDE = false;

async function notifCargar() {
  if (!window.sb || window.PROJECTS_SOURCE !== 'supabase') return;
  try {
    const { data, error } = await window.sb.from('user_notifications').select('*').order('created_at', { ascending: false }).limit(50);
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
    const irA = esRebind ? (' onclick="notifAbrirRebind(\'' + n.data.request_id + '\')" style="cursor:pointer;"')
              : (n.project_id ? (' onclick="notifAbrir(\'' + n.project_id + '\')" style="cursor:pointer;"') : '');
    return '<div' + irA + ' style="display:flex;gap:10px;padding:13px 18px;border-bottom:1px solid var(--rule,#2a2a28);' + (noLeido ? 'background:rgba(194,65,12,.06);' : '') + ((esRebind || n.project_id) ? 'cursor:pointer;' : '') + '">'
      + '<div style="flex:0 0 8px;">' + (noLeido ? '<div style="width:8px;height:8px;border-radius:50%;background:var(--accent,#c2410c);margin-top:5px;"></div>' : '') + '</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-weight:600;font-size:13px;color:var(--ink-primary);margin-bottom:2px;">' + escapeHtml(n.titulo || 'Aviso') + '</div>'
      + '<div style="font-size:12.5px;color:var(--ink-secondary);line-height:1.45;">' + escapeHtml(n.cuerpo || '') + '</div>'
      + '<div style="font-size:11px;color:var(--ink-faint);margin-top:4px;">' + _notifHace(n.created_at) + '</div>'
      + '</div></div>';
  }).join('');
}
function bellToggle() {
  const p = document.getElementById('notifPanel'); if (!p) return;
  const abrir = (p.style.display === 'none' || !p.style.display);
  if (abrir) {
    notifRenderPanel(); p.style.display = 'flex';
    notifCargar();
    setTimeout(notifMarcarTodas, 1200);
  } else { p.style.display = 'none'; }
}
async function notifMarcarTodas() {
  const ids = NOTIF.filter(function (n) { return !n.read_at; }).map(function (n) { return n.id; });
  if (!ids.length) return;
  const now = new Date().toISOString();
  NOTIF.forEach(function (n) { if (!n.read_at) n.read_at = now; });
  notifPintarBadge(); notifRenderPanel();
  try { if (window.sb) await window.sb.rpc('marcar_notificaciones_leidas', { p_ids: ids }); } catch (e) {}
}
function notifAbrir(projectId) {
  const p = document.getElementById('notifPanel'); if (p) p.style.display = 'none';
  if (window.PROJECTS.find(function (x) { return x.id === projectId; })) window.navigateToProject(projectId);
}
async function notifAbrirRebind(requestId) {
  const p = document.getElementById('notifPanel'); if (p) p.style.display = 'none';
  if (!window.sb) return;
  let req = null;
  try {
    const r = await window.sb.from('invitation_rebind_requests').select('*').eq('id', requestId).maybeSingle();
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
  root.innerHTML = '<div class="modal-backdrop" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()" style="max-width:520px;">'
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
    +   '<button class="btn btn-secondary" onclick="_rebindResolver(\'' + escapeHtml(req.id) + '\', false)">Rechazar y liberar cupo</button>'
    +   '<button class="btn btn-primary" onclick="_rebindAprobar(\'' + escapeHtml(req.id) + '\')">Aprobar acceso</button>'
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
  if (!window.sb) return;
  const btns = document.querySelectorAll('.modal-footer .btn');
  Array.prototype.forEach.call(btns, function (b) { b.disabled = true; });
  try {
    const r = await window.sb.rpc('resolver_rebind', { p_request_id: reqId, p_aprobar: !!aprobar, p_correo_elegido: aprobar ? (correo || null) : null });
    if (r.error) throw r.error;
    const res = (r.data && typeof r.data === 'object') ? r.data : {};
    window.closeModal();
    if (aprobar) showToast({ kind: 'success', title: 'Acceso aprobado', body: 'La persona quedó dentro del proyecto con el correo ' + escapeHtml(res.correo_elegido || correo || '') + '.', duration: 8000 });
    else showToast({ kind: 'info', title: 'Solicitud rechazada', body: 'Se canceló la invitación y se liberó el cupo del cargo.', duration: 8000 });
    try { notifCargar(); } catch (e) {}
    try { if (typeof window._empCargarRebinds === 'function') window._empCargarRebinds(); } catch (e) {}
  } catch (e) {
    const raw = (e && e.message) ? String(e.message) : '';
    showToast({ kind: 'error', title: 'No se pudo resolver', body: (raw.replace(/^resolver_rebind:\s*/i, '') || 'Reintenta en un momento.'), duration: 9000 });
    Array.prototype.forEach.call(btns, function (b) { b.disabled = false; });
  }
}
async function _empCargarRebinds() {
  var box = document.getElementById('empRebindsBox'); if (!box || !window.sb) return;
  try {
    var r = await window.sb.from('invitation_rebind_requests').select('*').eq('estado', 'pendiente').order('requested_at', { ascending: false });
    if (r.error) throw r.error;
    var rows = r.data || [];
    if (!rows.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = '';
    box.innerHTML = '<div style="border:1px solid var(--warning);border-radius:10px;padding:12px 14px;background:rgba(234,179,8,.07);margin-bottom:14px;">'
      + '<div style="font-weight:700;font-size:13px;color:var(--ink-primary);margin-bottom:8px;">Solicitudes de cambio de correo pendientes (' + rows.length + ')</div>'
      + rows.map(function (q) {
          return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border-top:1px solid var(--rule);padding:8px 0;">'
            + '<div style="font-size:12.5px;color:var(--ink-secondary);line-height:1.4;">Invitado: <strong>' + escapeHtml(q.invited_email || '—') + '</strong><br>Reclamó como: <strong>' + escapeHtml(q.claiming_email || '—') + '</strong></div>'
            + '<button class="btn btn-sm" onclick="notifAbrirRebind(\'' + escapeHtml(q.id) + '\')">Revisar</button>'
            + '</div>';
        }).join('')
      + '</div>';
  } catch (e) { box.style.display = 'none'; }
}
function notifInit() {
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
  var e = (typeof window.EMPRESA_PERFIL !== 'undefined' && window.EMPRESA_PERFIL) ? window.EMPRESA_PERFIL : {};
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
function getNotifConfig() { if (!window._notifCfg) window._notifCfg = notifLoadConfig(); return window._notifCfg; }
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
function _fechaCorta(iso) {
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
    const bd = window.BD_PERSONAS[p.nombre] || {};
    return Object.assign(p, { mail: bd.mail || '', enBD: !!window.BD_PERSONAS[p.nombre] });
  });
}
function notifVarsFor(project, rec) {
  const ip = project.data.infoProyecto || {};
  const EP = window.EMPRESA_PERFIL || {};
  const fechas = (project.data.rodajes || []).filter(x => x.activo && x.fecha).map(x => _fechaCorta(x.fecha)).join(', ');
  const neto = rec.monto || 0;
  let bruto;
  if (window.DTE_CON_RETENCION.includes(rec.dte)) bruto = Math.round(neto / window.factorRetencionDte(rec.dte));
  else if (rec.dte === 'factura')                  bruto = Math.round(neto * (1 + window.IVA));
  else                                             bruto = neto;
  const _dteW = _dteWord(rec.dte);
  const _condPago = rec.prontoPago
    ? ('Según lo conversado, tienes pronto pago. Una vez emitida tu ' + _dteW + ', la transferencia se realizará el primer viernes después de la emisión (si la emisión cae viernes, queda para el lunes siguiente).')
    : ('Una vez realizado el trabajo, envíame tu ' + _dteW + '. El pago está fijado para 30 días después de la emisión de tu ' + _dteW + '.');
  const _rem = getNotifConfig().remitente || {};
  return {
    'NOMBRE': rec.nombre, 'ROL': rec.rol,
    'NOMBRE PROYECTO': ip.nombreProyecto || project.name || '', 'NOMBRE CLIENTE': ip.cliente || '',
    'FECHA DE RODAJE': fechas, 'MONTO BRUTO': window.fmtMoney(bruto), 'MONTO NETO': window.fmtMoney(neto),
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
function notifSelectedRecs(project) {
  const st = ntfState();
  return notifRecipients(project).filter(r => st.sel[ntfCurTpl().key + '::' + r.nombre] !== false);
}
function notifMarkSent(nombre) {
  const project = STATE.currentProject; const n = ensureNotif(project); const st = ntfState();
  const key = st.template + '::' + nombre;
  if (n.status[key] === 'enviado') delete n.status[key];
  else { n.status[key] = 'enviado'; notifLogPush(project, st.template, 1); }
  window.markDirty(); renderNotificaciones();
}
function notifMarkAllSent() {
  const project = STATE.currentProject; const n = ensureNotif(project); const st = ntfState();
  const sel = notifSelectedRecs(project);
  if (!sel.length) { showToast({ kind: 'info', title: 'Nada seleccionado', body: 'Marca al menos un destinatario.' }); return; }
  sel.forEach(r => n.status[st.template + '::' + r.nombre] = 'enviado');
  notifLogPush(project, st.template, sel.length);
  window.markDirty(); renderNotificaciones();
  showToast({ kind: 'success', title: 'Marcados como enviados', body: `${sel.length} destinatario(s). Quedó registrado en el log.` });
}
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
  return '<div style="display:flex;gap:6px;margin-bottom:12px;">' + channels.map(c => '<button class="btn btn-sm ' + (current === c.k ? 'btn-primary' : 'btn-secondary') + '" onclick="' + onclickPrefix + '(\'' + c.k + '\')">' + c.label + '</button>').join('') + '</div>';
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
        + ts.map(t => '<button class="btn btn-sm ' + (t.key === tpl.key ? 'btn-primary' : 'btn-ghost') + '" style="width:100%;text-align:left;margin-bottom:3px;" onclick="ntfPickTpl(\'' + t.key + '\')">' + escapeHtml(t.nombre) + '</button>').join('')
      ).join('')
    + '</div>'
    + '<div style="flex:1;min-width:260px;">'
    + ntfChannelSeg(st.channel, 'ntfSetChannel')
    + '<div style="overflow-x:auto;margin-bottom:12px;"><table class="data-table"><thead><tr>'
    + '<th style="width:28px;"><input type="checkbox" ' + (selRecs.length === recs.length && recs.length ? 'checked' : '') + ' onchange="ntfSelAll(this.checked)"></th>'
    + '<th>Nombre</th><th>Rol</th><th>Mail</th><th>Monto</th><th>Estado</th></tr></thead><tbody>'
    + recs.map(({ rec: r, sel }) => {
        const vr = val(r); const sent = (n.status || {})[tpl.key + '::' + r.nombre] === 'enviado';
        return '<tr onclick="ntfToggleRec(\'' + escapeHtml(r.nombre) + '\',' + (!sel) + ')" style="cursor:pointer;' + (!sel ? 'opacity:.45;' : '') + '">'
          + '<td onclick="event.stopPropagation()"><input type="checkbox" ' + (sel ? 'checked' : '') + ' onchange="ntfToggleRec(\'' + escapeHtml(r.nombre) + '\',this.checked)"></td>'
          + '<td>' + escapeHtml(r.nombre) + (!r.enBD ? ' <span style="color:var(--warning);" title="Sin mail en BD">●</span>' : '') + '</td>'
          + '<td>' + escapeHtml(r.rol) + '</td>'
          + '<td>' + (r.mail ? escapeHtml(r.mail) : '<span style="color:var(--warning);">sin mail</span>') + '</td>'
          + '<td>' + window.fmtMoney(r.monto) + '</td>'
          + '<td>' + (sent ? '<span style="color:var(--positive);font-weight:600;">Enviado</span>' : '<span style="color:var(--ink-faint);">Pendiente</span>')
          + ' <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();ntfSetViewAs(\'' + escapeHtml(r.nombre) + '\')">Vista previa</button>'
          + (r.mail && st.channel === 'email' ? ' <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();notifGmailDraft(\'' + escapeHtml(r.nombre) + '\')">✉</button>' : '')
          + '</td></tr>';
      }).join('')
    + '</tbody></table></div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">'
    + '<button class="btn btn-primary" ' + (okN ? '' : 'disabled') + ' onclick="ntfSend()">Enviar a ' + okN + ' ' + (st.channel === 'wsp' ? 'por WhatsApp' : 'por email') + '</button>'
    + '<button class="btn btn-secondary btn-sm" onclick="ntfProgramar()">Programar</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="notifCopyTemplate()">⧉ Copiar plantilla</button>'
    + '</div>'
    + (bloqueados.length ? '<p style="margin:10px 0 0;font-size:12px;color:var(--warning);">No se puede enviar a ' + bloqueados.length + ' de ' + selRecs.length + ': ' + bloqueados.map(r => { const vr = val(r); return escapeHtml(r.nombre.split(' ')[0]) + ' (' + (vr.kind === 'sinmail' ? 'sin mail' : 'faltan datos: ' + vr.miss.map(k => NTF_LABELS[k] || k).join(', ')) + ')'; }).join(', ') + '.</p>' : (selRecs.length ? '<p style="margin:10px 0 0;font-size:12px;color:var(--positive);">Listo para enviar a ' + okN + ' persona(s).</p>' : ''))
    + (st.viewAs ? ('<div style="margin-top:16px;border:1px solid var(--rule);border-radius:10px;padding:14px;background:var(--bg-surface);">'
        + '<div style="font-size:11px;color:var(--ink-faint);margin-bottom:8px;">Vista previa para <strong>' + escapeHtml(st.viewAs) + '</strong> · ' + escapeHtml(tpl.nombre) + '</div>'
        + (!st.override
          ? ('<div style="font-size:12.5px;line-height:1.6;">' + ntfPreviewHtml(project, tpl, st.channel, notifRecipients(project).find(r => r.nombre === st.viewAs) || ntfSampleRec(project)) + '</div>'
            + '<button class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="ntfStartOverride()">Editar solo para esta persona</button>')
          : ('<div id="ntfOverrideBody" contenteditable="true" spellcheck="false" style="font-size:12.5px;line-height:1.6;border:1px solid var(--accent);border-radius:6px;padding:10px;outline:none;min-height:80px;" oninput="ntfOverrideInput()">' + ntfPillify(ntfPreviewHtml(project, tpl, st.channel, notifRecipients(project).find(r => r.nombre === st.viewAs) || ntfSampleRec(project))) + '</div>'
            + '<div style="display:flex;gap:6px;margin-top:8px;"><button class="btn btn-sm btn-primary" onclick="ntfSaveOverride()">Guardar override</button><button class="btn btn-sm btn-ghost" onclick="ntfState().override=false;renderNotificaciones()">Cancelar</button></div>'))
        + '</div>') : '')
    + '</div></div>';
}
function ntfPickTpl(k) { const st = ntfState(); st.tplKey = k; st.override = false; renderNotificaciones(); }
function ntfSetChannel(c) { ntfState().channel = c; renderNotificaciones(); }
function ntfSetViewAs(name) { ntfState().viewAs = name; ntfState().override = false; renderNotificaciones(); }
function ntfToggleRec(nombre, on) { const st = ntfState(); st.sel[ntfCurTpl().key + '::' + nombre] = on; renderNotificaciones(); }
function ntfSelAll(on) { const st = ntfState(); const tpl = ntfCurTpl(); notifRecipients(STATE.currentProject).forEach(r => st.sel[tpl.key + '::' + r.nombre] = on); renderNotificaciones(); }
function ntfAddFiles(files) { const st = ntfState(); for (let i = 0; i < files.length; i++) st.adjuntos.push(files[i].name); showToast({ kind: 'info', title: 'Adjunto agregado', body: 'El archivo se adjunta de verdad al conectar el backend.', duration: 2600 }); renderNotificaciones(); }
function ntfRemoveFile(i) { ntfState().adjuntos.splice(i, 1); renderNotificaciones(); }
function ntfStartOverride() { ntfState().override = true; renderNotificaciones(); }
function ntfOverrideInput() { const el = document.getElementById('ntfOverrideBody'); if (el) ntfState()._pendingOverride = ntfSerialize(el); }
function ntfSaveOverride() { const st = ntfState(); const tpl = ntfCurTpl(); const ovKey = tpl.key + '::' + st.viewAs; if (st._pendingOverride != null) st.overrides[ovKey] = st._pendingOverride; st.override = false; st._pendingOverride = null; window.markDirty(); showToast({ kind: 'success', title: 'Override guardado', body: 'Solo para ' + escapeHtml(String(st.viewAs).split(' ')[0]) + ' · no afecta la plantilla. (Persistencia entre sesiones con el backend.)' }); renderNotificaciones(); }
function ntfSend() {
  const project = STATE.currentProject; const st = ntfState(); const tpl = ntfCurTpl();
  const val = r => ntfValidate(project, tpl, r, st.channel);
  const selRecs = ntfRecState(project).filter(x => x.sel).map(x => x.rec);
  const okRecs = selRecs.filter(r => val(r).ok);
  if (!okRecs.length) { showToast({ kind: 'info', title: 'Sin destinatarios válidos', body: 'Selecciona personas con mail y datos completos.' }); return; }
  const n = ensureNotif(project);
  okRecs.forEach(r => n.status[tpl.key + '::' + r.nombre] = 'enviado');
  notifLogPush(project, tpl.key, okRecs.length);
  window.markDirty(); renderNotificaciones();
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
  window.markDirty(); renderNotificaciones();
  showToast({ kind: 'success', title: 'Envío programado', body: tpl.nombre + ' · ' + selRecs.length + ' persona(s) para el ' + when + '. La automatización real requiere el backend.' });
}
function ntfViewProgramados(project) {
  const n = ntfEnsureSched(project);
  if (!n.programados.length && !Object.values(n.reglas || {}).some(Boolean)) return '<p style="font-size:12px;color:var(--ink-faint);">No hay envíos programados.</p>';
  return (n.programados.length ? '<div style="margin-bottom:14px;">'
    + '<div style="font-weight:600;font-size:13px;margin-bottom:8px;">Programados manualmente</div>'
    + n.programados.map((s, i) => '<div style="display:flex;align-items:center;gap:10px;border:1px solid var(--rule);border-radius:8px;padding:10px 12px;margin-bottom:6px;"><div style="flex:1;font-size:12.5px;">' + escapeHtml(ntfTpl(s.tpl)?.nombre || s.tpl) + ' · ' + escapeHtml(s.when) + ' · ' + s.count + ' persona(s)</div><button class="btn btn-ghost btn-sm" onclick="ntfReprogramar(' + i + ')">Editar</button><button class="btn btn-ghost btn-sm" style="color:var(--negative);" onclick="ntfCancelProg(' + i + ')">✕</button></div>').join('')
    + '</div>' : '')
    + '<div><div style="font-weight:600;font-size:13px;margin-bottom:8px;">Reglas automáticas <span style="font-size:11px;color:var(--ink-faint);">(requieren backend)</span></div>'
    + Object.entries(n.reglas).map(([id, on]) => '<label style="display:flex;align-items:center;gap:8px;font-size:12.5px;margin-bottom:6px;cursor:pointer;"><input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="ntfToggleRegla(\'' + id + '\')">' + escapeHtml(NTF_EFX_LABEL[id] || id) + '</label>').join('')
    + '</div>';
}
function ntfCancelProg(i) { const n = STATE.currentProject.data.notificaciones; n.programados.splice(i, 1); window.markDirty(); showToast({ kind: 'info', title: 'Programación cancelada' }); renderNotificaciones(); }
function ntfReprogramar(i) { const n = STATE.currentProject.data.notificaciones; const s = n.programados[i]; if (!s) return; const v = prompt('Nueva fecha y hora (formato libre, ej. 22/05/2026 09:00):', s.when || ''); if (v != null && v.trim()) { s.when = v.trim(); window.markDirty(); showToast({ kind: 'info', title: 'Fecha actualizada' }); renderNotificaciones(); } }
function ntfToggleRegla(id) { const n = ntfEnsureSched(STATE.currentProject); n.reglas[id] = !n.reglas[id]; window.markDirty(); renderNotificaciones(); }
function ntfViewHistorial(project) {
  const n = ensureNotif(project); const st = ntfState();
  if (!n.log || !n.log.length) return '<p style="font-size:12px;color:var(--ink-faint);">Aún no hay envíos registrados.</p>';
  return n.log.slice().reverse().map((l, i) =>
    '<div style="border:1px solid var(--rule);border-radius:8px;margin-bottom:6px;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;cursor:pointer;" onclick="ntfToggleHist(' + i + ')">'
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
  const chip = v => '<span class="ntf-chip" onmousedown="event.preventDefault();ntfInsertVar(\'' + v.replace(/'/g, "\\'") + '\')">' + escapeHtml(NTF_LABELS[v] || v) + '</span>';
  return '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;">'
    + '<div style="flex:0 0 180px;min-width:140px;">'
    + ntfTemplates().map(t => '<button class="btn btn-sm ' + (t.key === tpl.key ? 'btn-primary' : 'btn-ghost') + '" style="width:100%;text-align:left;margin-bottom:3px;" onclick="ntfState().editKey=\'' + t.key + '\';renderNotificaciones()">' + escapeHtml(t.nombre) + '</button>').join('')
    + '<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:6px;" onclick="ntfNewTemplate()">+ Nueva</button>'
    + '</div>'
    + '<div style="flex:1;min-width:260px;">'
    + '<div class="field" style="margin-bottom:10px;"><label class="field-label">Nombre de plantilla</label>'
    + '<input class="input" value="' + escapeHtml(tpl.nombre) + '" ' + (!canEdit ? 'disabled' : '') + ' oninput="ntfSetTplName(this.value)"></div>'
    + (tpl.subvers && tpl.subvers.length ? '<div style="display:flex;gap:6px;margin-bottom:10px;">' + tpl.subvers.map(s => '<button class="btn btn-sm ' + (sv === s.key ? 'btn-primary' : 'btn-secondary') + '" onclick="ntfSetEditSubver(\'' + s.key + '\')">' + escapeHtml(s.label) + '</button>').join('') + '</div>' : '')
    + ntfChannelSeg(st.editChannel, 'ntfSetEditChannel')
    + '<div class="field" style="margin-bottom:8px;"><label class="field-label">Asunto</label>'
    + '<div id="ntfEdSubject" contenteditable="' + canEdit + '" spellcheck="false" style="border:1px solid var(--rule);border-radius:6px;padding:8px 10px;font-size:13px;outline:none;min-height:32px;" oninput="ntfSaveEditor()">' + ntfPillify(tpl.asunto) + '</div></div>'
    + '<div class="field"><label class="field-label">Cuerpo</label>'
    + '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">'
    + '<button class="btn btn-ghost btn-sm" onclick="ntfFmt(\'bold\')"><b>B</b></button>'
    + '<button class="btn btn-ghost btn-sm" onclick="ntfFmt(\'italic\')"><i>I</i></button>'
    + '<button class="btn btn-ghost btn-sm" onclick="ntfFmt(\'underline\')"><u>U</u></button>'
    + '</div>'
    + '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">'
    + [NTF_PERSON_VARS, NTF_PROJ_VARS, NTF_COMPANY_VARS, NTF_SENDER_VARS].flat().map(chip).join('')
    + '</div>'
    + '<div id="ntfEdBody" contenteditable="' + canEdit + '" spellcheck="false" style="border:1px solid var(--rule);border-radius:6px;padding:10px;font-size:12.5px;line-height:1.6;outline:none;min-height:120px;" oninput="ntfSaveEditor();ntfRefreshPreview()">' + ntfPillify(sv && tpl.cuerpos ? (tpl.cuerpos[sv] || tpl.cuerpo) : (st.editChannel === 'wsp' && tpl.wsp ? tpl.wsp : tpl.cuerpo)) + '</div></div>'
    + '<div style="margin-top:16px;"><label class="field-label">Vista previa · ' + escapeHtml(ntfSampleRec(project).nombre) + '</label>'
    + '<div id="ntfPreview" style="border:1px solid var(--rule);border-radius:8px;padding:12px;background:var(--bg-surface);font-size:12.5px;line-height:1.6;">' + ntfPreviewHtml(project, tpl, st.editChannel, ntfSampleRec(project)) + '</div></div>'
    + '</div></div>';
}
function ntfSetEditChannel(c) { ntfState().editChannel = c; renderNotificaciones(); }
function ntfSetTplName(v) { if (!ntfCanEdit(ntfCurEditTpl())) return; ntfCurEditTpl().nombre = v; window.markDirty(); notifSaveConfig(); }
function ntfToggleDist() { const t = ntfCurEditTpl(); if (!ntfCanEdit(t)) return; t.distinguir = !t.distinguir; if (t.distinguir && !t.wsp) t.wsp = t.cuerpo; window.markDirty(); notifSaveConfig(); renderNotificaciones(); }
function ntfTogglePublic() { if (!ntfIsAdmin()) { showToast({ kind: 'warning', title: 'Requiere admin', body: 'Hacer pública o privada una plantilla requiere modo administrador.' }); return; } const t = ntfCurEditTpl(); t.privada = !t.privada; window.markDirty(); notifSaveConfig(); renderNotificaciones(); }
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
function ntfOpenFromHoja() {
  const st = ntfState(); st.tab = 'enviar'; st.tplKey = 'hoja'; st.fromHoja = true; st.override = false;
  window.navigateToModule('correos');
}

export function renderNotificaciones() {
  const project = STATE.currentProject; if (!project) return;
  ensureNotif(project); ntfEnsureSched(project);
  const st = ntfState(); const n = project.data.notificaciones;
  const content = document.getElementById('moduleContent');
  const banner = st.fromHoja ? '<div class="ntf-ctxbanner">📎 Envío preparado desde Hoja de Llamado — plantilla y destinatarios cargados. <button class="ntf-x" onclick="ntfState().fromHoja=false;renderNotificaciones()">✕</button></div>' : '';
  const tabBtn = (id, label, badge) => '<button class="ntf-subtab ' + (st.tab === id ? 'on' : '') + '" onclick="ntfSetTab(\'' + id + '\')">' + label + (badge != null ? ' <span class="ntf-badge">' + badge + '</span>' : '') + '</button>';
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
window.bellToggle          = bellToggle;
window.notifInit           = notifInit;
window.notifCargar         = notifCargar;
window.notifPintarBadge    = notifPintarBadge;
window.notifMarcarTodas    = notifMarcarTodas;
window.notifAbrir          = notifAbrir;
window.notifAbrirRebind    = notifAbrirRebind;
window._rebindAprobar      = _rebindAprobar;
window._rebindResolver     = _rebindResolver;
window._empCargarRebinds   = _empCargarRebinds;
// Sistema B
window.getNotifConfig      = getNotifConfig;
window.notifSaveConfig     = notifSaveConfig;
window.ensureNotif         = ensureNotif;
window.notifFill           = notifFill;
window.notifRecipients     = notifRecipients;
window.notifVarsFor        = notifVarsFor;
window.notifHtmlToPlain    = notifHtmlToPlain;
window.notifSetCfg         = notifSetCfg;
window.notifSetTpl         = notifSetTpl;
window.notifMarkSent       = notifMarkSent;
window.notifMarkAllSent    = notifMarkAllSent;
window.notifLogPush        = notifLogPush;
window.notifCopyTemplate   = notifCopyTemplate;
window.notifGmailDraft     = notifGmailDraft;
window.notifSelectedRecs   = notifSelectedRecs;
// Sistema C (ntf*)
window.renderNotificaciones = renderNotificaciones;
window.ntfState            = ntfState;
window.ntfSetTab           = ntfSetTab;
window.ntfPickTpl          = ntfPickTpl;
window.ntfSetChannel       = ntfSetChannel;
window.ntfSetViewAs        = ntfSetViewAs;
window.ntfToggleRec        = ntfToggleRec;
window.ntfSelAll           = ntfSelAll;
window.ntfAddFiles         = ntfAddFiles;
window.ntfRemoveFile       = ntfRemoveFile;
window.ntfStartOverride    = ntfStartOverride;
window.ntfOverrideInput    = ntfOverrideInput;
window.ntfSaveOverride     = ntfSaveOverride;
window.ntfSend             = ntfSend;
window.ntfProgramar        = ntfProgramar;
window.ntfCancelProg       = ntfCancelProg;
window.ntfReprogramar      = ntfReprogramar;
window.ntfToggleRegla      = ntfToggleRegla;
window.ntfToggleHist       = ntfToggleHist;
window.ntfSetEditSubver    = ntfSetEditSubver;
window.ntfSetEditChannel   = ntfSetEditChannel;
window.ntfSetTplName       = ntfSetTplName;
window.ntfToggleDist       = ntfToggleDist;
window.ntfTogglePublic     = ntfTogglePublic;
window.ntfNewTemplate      = ntfNewTemplate;
window.ntfFmt              = ntfFmt;
window.ntfInsertVar        = ntfInsertVar;
window.ntfOpenFromHoja     = ntfOpenFromHoja;
window.NTF_LABELS          = NTF_LABELS;
window.NOTIF_VAR_KEYS      = NOTIF_VAR_KEYS;

// ── Bridges agregados por auditoría 2-jul (consumidos por index.html u otros módulos sin bridge) ──
window._dteWord = _dteWord;
window._fechaCorta = _fechaCorta;
window._rebindRenderModal = _rebindRenderModal;
window.notifDefaultTemplates = notifDefaultTemplates;
window.notifEmpresaDefault = notifEmpresaDefault;
window.notifLoadConfig = notifLoadConfig;
window.notifRenderPanel = notifRenderPanel;
window.ntfEnsureSched = ntfEnsureSched;
window.ntfTemplates = ntfTemplates;
