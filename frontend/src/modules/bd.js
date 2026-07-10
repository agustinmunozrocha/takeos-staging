// Base de Datos (Admin + Personas Global) — extraído de index.html (Etapa A3)
// src/modules/bd.js
// El import/export XLSX de la BD vive en bd-excel.js (mismo dominio, archivo aparte).

// D1d · imports reales. renderBDPersonas sigue saliendo vía window para
// bd-excel/nav/dal (bridge intocable). Hoist: gastos 24→22 (goWire necesita
// nav 15 — seguro).
import { escapeHtml, safeUrl, showToast } from '../lib/helpers.js';
import { BD_CONTACTOS, BD_EMPRESAS, BD_EMPRESAS_BYID, BD_LOC, BD_PERSONAS, BD_TALENTOS, PROJECTS, STATE, ORG_ID } from '../lib/state.js';
import { _buildPerfilPago, _buildPerfilTalento, _genId, normLocName, syncLegacyFromContactos } from '../lib/modelo.js';
import { DTE_LABEL, DTE_LABEL_SHORT, DTE_OPTIONS } from '../lib/data.js';
import { authNivel } from '../lib/auth.js';
import { fmtMoney, initials } from '../lib/calc.js';
import { _edadDesde, _empTieneRol, _locThumbAsync, _toISODate, bancoSelectHTML, closeModal, comboboxAddToBD, pfBancoChange, regionSelectHTML, showModal, comboboxCloseDelayed, comboboxFilter, comboboxFilterEmpresas, comboboxOpen, togglePfCrew, togglePfExtranjera } from '../lib/ui.js';
import { renderModule } from '../lib/nav.js';
import { STATES, _lastViewSave } from './kanban.js';
import { calcSummaryFin } from './presupuesto-cotizacion.js';
import { bdLocFind, ensureLocShape, locFullAddress, locPrimaryContact, nextLocIdBD, openLocDetail } from './locaciones.js';
import { _normEmailBD, _normKey, _normNameBD, _normPhoneBD, _normRutBD } from './bd-excel.js';
import { _dalContactoSaveSoon, _dalEmpresaSaveSoon, _dalLocacionSaveSoon, dalBootContactos, dalBootLocaciones, dalGuardarContacto, dalGuardarEmpresa } from './dal.js';
import { goMovs } from './gastos.js';
import { autosaveNow, markDirty } from './persistencia-local.js';

import { registrarAcciones, accionHTML } from '../lib/delegacion.js';
import { gancho, define } from '../lib/ganchos.js';
/* ════════════════════════════════════════════════════════════════════
   V8.5 · TIPO DE CUENTA (desplegable estandarizado)
   ════════════════════════════════════════════════════════════════════ */
const TIPOS_CUENTA = ['Cuenta Corriente', 'Cuenta Vista', 'Cuenta de Ahorro', 'Cuenta RUT', 'Chequera Electrónica'];
function tipoCuentaSelectHTML(current, opts) {
  opts = opts || {};
  const cur = current || '';
  const inList = TIPOS_CUENTA.indexOf(cur) >= 0;
  let o = '<option value="">\u2014 Sin especificar</option>';
  if (cur && !inList) o += '<option value="' + escapeHtml(cur) + '" selected>' + escapeHtml(cur) + ' (texto)</option>';
  o += TIPOS_CUENTA.map(t => '<option' + (cur === t ? ' selected' : '') + '>' + escapeHtml(t) + '</option>').join('');
  return '<select class="select"' + (opts.id ? ' id="' + opts.id + '"' : '') + (opts.accion ? ' ' + opts.accion : '') + '>' + o + '</select>';
}

/* ════════════════════════════════════════════════════════════════════
   V8.5 · CUMPLEAÑOS (solo día y mes; el año no se guarda)
   ════════════════════════════════════════════════════════════════════ */

export function openPersonaByName(nombre) {
  if (!nombre) return;
  for (const id in BD_CONTACTOS) { if (BD_CONTACTOS[id] && BD_CONTACTOS[id].nombre === nombre) { openPersonaForm('edit', id); return; } }
  openPersonaForm('create', null); const el = document.getElementById('pf_nombre'); if (el) { el.value = nombre; el.focus(); }
}

export function renderBDPersonas() {
  const content = document.getElementById('moduleContent');
  const tab = STATE.ui.bdTab || 'personas';
  const tabStyle = (active) => `padding:8px 16px;background:${active?'var(--accent)':'transparent'};color:${active?'#fff':'var(--ink-secondary)'};border:1px solid ${active?'var(--accent)':'var(--border-soft)'};border-radius:6px;font-size:13px;cursor:pointer;font-family:inherit;font-weight:500;`;
  // V7.1: tabs entre Personas, Empresas, Talentos. Los botones de import/export
  // ahora operan sobre las 3 pestañas en simultáneo.
  content.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:var(--space-4);">
      <button data-accion="bd.tab" data-args="[&quot;personas&quot;]" style="${tabStyle(tab==='personas')}">
        Personas <span style="opacity:0.7;font-weight:400;">${Object.keys(BD_PERSONAS).length}</span>
      </button>
      <button data-accion="bd.tab" data-args="[&quot;empresas&quot;]" style="${tabStyle(tab==='empresas')}">
        Empresas <span style="opacity:0.7;font-weight:400;">${Object.keys(BD_EMPRESAS).length}</span>
      </button>
      <button data-accion="bd.tab" data-args="[&quot;talentos&quot;]" style="${tabStyle(tab==='talentos')}">
        Talentos <span style="opacity:0.7;font-weight:400;">${Object.keys(BD_TALENTOS).length}</span>
      </button>
      <button data-accion="bd.tab" data-args="[&quot;locaciones&quot;]" style="${tabStyle(tab==='locaciones')}">
        Locaciones <span style="opacity:0.7;font-weight:400;">${BD_LOC.length}</span>
      </button>
    </div>

    <div class="toolbar">
      <input
        type="text"
        class="search-input"
        id="bdSearchInput"
        placeholder="Buscar…"
        value="${escapeHtml(STATE.ui.bdSearch || '')}"
        data-accion="bd.buscar" data-on="input"
      >
      <button class="btn btn-secondary" data-accion="bd.exportar" title="Exporta toda la BD a un archivo .xlsx con dos pestañas: CONTACTOS y EMPRESAS (modelo unificado).">
        Exportar BD (.xlsx)
      </button>
      <button class="btn btn-secondary" data-accion="bd.plantilla" title="Descarga una planilla .xlsx vacía (pestañas CONTACTOS y EMPRESAS) con los encabezados correctos y una fila de ejemplo. Llénala con tus contactos y luego usa «Importar BD».">
        Descargar planilla
      </button>
      <button class="btn btn-secondary" data-accion="bd.importar" title="Importa una BD .xlsx (CONTACTOS + EMPRESAS, o el formato viejo de 3 pestañas). Fusiona por ID/RUT — actualiza lo existente y agrega lo nuevo. No borra lo que no esté en el Excel. Se crea snapshot antes.">
        Importar BD (.xlsx)
      </button>
      ${STATE.adminMode && authNivel('eliminar_proyecto') === 'E' ? `<button class="btn btn-secondary" data-accion="bd.archivados" title="Personas, empresas y locaciones archivadas (soft-delete). Restaurar. Solo Administrador.">🗄 Archivados</button>` : ''}
      <div style="flex:1 1 240px;min-width:220px;display:flex;align-items:center;gap:8px;">
        <label style="font-size:12px;color:var(--ink-secondary);white-space:nowrap;">Link del formulario</label>
        <button class="btn btn-primary btn-sm" data-accion="bd.linkInv" title="Genera el link para que la persona cree su cuenta (si no la tiene), llene sus datos UNA vez y autorice compartirlos con tu productora (Ley 21.719). No la incorpora a ningún proyecto ni cargo.">Link de invitación</button>
      </div>
      <input type="file" id="bdExcelImportInputV71" accept=".xlsx,.xls" style="display:none" data-accion="bd.importFile" data-on="change">
      ${tab === 'personas' ? `<button class="btn btn-primary" data-accion="bd.nuevaPersona">+ Nueva persona</button>` : ''}
      ${tab === 'empresas' ? `<button class="btn btn-primary" data-accion="bd.nuevaEmpresa">+ Nueva empresa</button>` : ''}
      ${tab === 'talentos' ? `<button class="btn btn-primary" data-accion="bd.nuevoTalento">+ Nuevo talento</button>` : ''}
      ${tab === 'locaciones' ? `<button class="btn btn-primary" data-accion="bd.nuevaLoc">+ Nueva locación</button>` : ''}
    </div>

    ${tab === 'personas' ? `
      <div class="alert alert-info" style="margin-bottom: var(--space-4);">
        <span class="alert-icon">ℹ</span>
        <div>
          Personas físicas que coordinas operativamente (crew, internos, contactos cliente, proveedores individuales). El <strong>autocompletado del Presupuesto</strong> filtra a quienes tengan rol <strong>Crew</strong> o <strong>Interno</strong>. Los talentos viven en su propia pestaña.
        </div>
      </div>
    ` : ''}
    ${tab === 'empresas' ? `
      <div class="alert alert-info" style="margin-bottom: var(--space-4);">
        <span class="alert-icon">ℹ</span>
        <div>
          Clientes y proveedores. Una empresa puede ser ambas — el campo Tipo admite "Cliente, Proveedor". Las personas asociadas viven en la pestaña Personas, vinculadas por <em>Empresa asociada</em> + <em>Relación</em>.
        </div>
      </div>
    ` : ''}
    ${tab === 'talentos' ? `
      <div class="alert alert-info" style="margin-bottom: var(--space-4);">
        <span class="alert-icon">ℹ</span>
        <div>
          Pool de casting. Separado de Personas para no contaminar el autocompletado del Presupuesto. Si un talento es contratado como crew/extra, también entra su data a Personas con el rol Talento.
        </div>
      </div>
    ` : ''}
    ${tab === 'locaciones' ? `
      <div class="alert alert-info" style="margin-bottom: var(--space-4);">
        <span class="alert-icon">ℹ</span>
        <div>
          Repositorio único de locaciones, transversal a todos los proyectos. Cada locación guarda dirección, región, contactos y fotos de scouting. Desde un proyecto, en su módulo <strong>Locaciones</strong>, defines el estado de cada una (candidata, confirmada, descartada) y su costo.
        </div>
      </div>
    ` : ''}

    <div id="personRows"></div>
    <div class="text-faint mt-4" id="personListFooter" style="font-size: 11px; text-align: center;"></div>
  `;
  renderBDListByTab();
  const inp = document.getElementById('bdSearchInput');
  if (inp && STATE.ui.bdSearch) inp.focus();
}

/* Router del listado según el tab activo */
function renderBDListByTab() {
  const tab = STATE.ui.bdTab || 'personas';
  if (tab === 'empresas') return renderBDEmpresasList();
  if (tab === 'talentos') return renderBDTalentosList();
  if (tab === 'locaciones') return renderBDLocacionesList();
  return renderBDPersonList();
}

/* V8.4 — Locaciones como categoría de la BD (transversal). Lista todas las
   locaciones canónicas (BD_LOC); cada una se abre con el detalle de siempre. */
function renderBDLocacionesList() {
  const cont = document.getElementById('personRows'); if (!cont) return;
  const e = escapeHtml;
  const q = normLocName(STATE.ui.bdSearch || '');
  let locs = BD_LOC.slice();
  if (q) locs = locs.filter(l => normLocName(l.nombre).indexOf(q) >= 0 || normLocName(locFullAddress(l)).indexOf(q) >= 0);
  locs.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  const foot = document.getElementById('personListFooter');
  if (foot) foot.textContent = BD_LOC.length ? (locs.length + ' de ' + BD_LOC.length + ' locaciones') : '';
  if (!BD_LOC.length) { cont.innerHTML = `<div class="alert alert-info"><span class="alert-icon">ℹ</span><div>Aún no hay locaciones en la BD. Crea la primera con <strong>+ Nueva locación</strong>, o agrégalas desde el módulo Locaciones de un proyecto.</div></div>`; return; }
  if (!locs.length) { cont.innerHTML = `<div class="alert alert-info"><span class="alert-icon">ℹ</span><div>Ninguna locación coincide con la búsqueda.</div></div>`; return; }
  cont.innerHTML = locs.map(l => {
    ensureLocShape(l);
    const dir = locFullAddress(l) || 'Sin dirección';
    const nc = (l.contactos || []).length; const nf = (l.fotos || []).length;
    const pc = locPrimaryContact(l);
    const _f0b = (l.fotos && l.fotos[0]) || null;
    const _s0b = _f0b ? (_f0b.url || _f0b.dataUrl || '') : '';
    let _thumb;
    if (_s0b) _thumb = '<img src="' + safeUrl(_s0b) + '" style="width:100%;height:100%;object-fit:cover;" alt="">';
    else if (_f0b && _f0b.path) { _thumb = '<span id="locThumb_' + l.locId + '">…</span>'; _locThumbAsync(l.locId, _f0b.path); }
    else _thumb = '<span>Sin fotos</span>';
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 15px;border:1px solid var(--border-soft);border-radius:var(--radius-sm);margin-bottom:8px;background:var(--bg-surface);">
      <div style="width:56px;height:56px;flex:0 0 56px;border-radius:8px;overflow:hidden;background:var(--bg-elev,#1b1b19);display:grid;place-items:center;font-size:9.5px;color:var(--ink-faint);text-align:center;">${_thumb}</div>
      <div style="min-width:0;flex:1;">
        <div style="font-weight:600;font-size:14px;color:var(--ink-primary);">${e(l.nombre || '')}</div>
        <div style="font-size:12px;color:var(--ink-secondary);margin-top:2px;">${e(dir)}</div>
        <div style="font-size:11px;color:var(--ink-faint);margin-top:4px;">${nc} contacto${nc === 1 ? '' : 's'}${pc ? ' (' + e(pc.nombre || '') + ')' : ''} · ${nf} foto${nf === 1 ? '' : 's'}</div>
      </div>
      <button class="btn btn-secondary btn-sm" style="white-space:nowrap;" ${accionHTML('bd.verLoc', l.locId)}>Ver / editar</button>
    </div>`;
  }).join('');
}

/* Alta de locación a nivel BD: crea SOLO el registro canónico (no la liga a
   ningún proyecto). El detalle posterior permite vincularla a proyectos. */
function openBDLocAdd() {
  const regSel = (typeof regionSelectHTML === 'function') ? regionSelectHTML('', { id: 'bla_region' }) : `<input class="input" id="bla_region" placeholder="Región">`;
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-accion="ui.backdrop"><div class="modal" style="max-width:560px;">
    <div class="modal-header"><div class="modal-title">Nueva locación</div><button class="go-x" data-accion="ui.cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--ink-mut);">×</button></div>
    <div class="modal-body">
      <div class="form-row"><label class="form-label">Nombre</label><input class="input" id="bla_nombre" placeholder="Casa Ñuñoa, Bodega Quilicura…" autofocus></div>
      <div class="form-row"><label class="form-label">Dirección</label><input class="input" id="bla_dir" placeholder="Calle y número"></div>
      <div class="form-row"><label class="form-label">Complemento</label><input class="input" id="bla_dir2" placeholder="Depto, oficina, referencia (opcional)"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div class="form-row" style="flex:1;min-width:150px;"><label class="form-label">Comuna</label><input class="input" id="bla_comuna" placeholder="Comuna"></div>
        <div class="form-row" style="flex:1;min-width:150px;"><label class="form-label">Ciudad</label><input class="input" id="bla_ciudad" placeholder="Santiago" value="Santiago"></div>
      </div>
      <div class="form-row"><label class="form-label">Región</label>${regSel}</div>
      <p class="config-hint" style="margin:4px 0 0;">Se crea en la Base de Datos. Para usarla en un proyecto, agrégala desde el módulo Locaciones de ese proyecto.</p>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" data-accion="ui.cerrar">Cancelar</button><button class="btn btn-primary" data-accion="bd.crearLoc">Crear locación</button></div>
  </div></div>`;
}
function saveBDLocAdd() {
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  const nombre = v('bla_nombre');
  if (!nombre) { showToast({ kind: 'warning', title: 'Falta el nombre', body: 'Ponle un nombre a la locación.' }); return; }
  const _nm = normLocName(nombre);
  const dup = BD_LOC.find(l => normLocName(l.nombre) === _nm);
  if (dup) { closeModal(); openLocDetail(dup.locId); showToast({ kind: 'info', title: 'Ya existía en la BD', body: dup.locId + ' · ' + (dup.nombre || '') + ' — se abrió en vez de crear un duplicado.' }); return; }
  const id = nextLocIdBD();
  BD_LOC.push({ locId: id, nombre: nombre, direccion: v('bla_dir'), direccion2: v('bla_dir2'), comuna: v('bla_comuna'), ciudad: v('bla_ciudad') || 'Santiago', region: v('bla_region'), maps: '', orientacion: '—', contactos: [], notas: '', fotos: [] });
  markDirty(); autosaveNow(); _dalLocacionSaveSoon(id); closeModal(); openLocDetail(id);
  showToast({ kind: 'success', title: 'Locación creada', body: id + ' agregada a la Base de Datos.' });
}

/* Listado de Empresas (V7.1) */
function renderBDEmpresasList() {
  const container = document.getElementById('personRows');
  const footer = document.getElementById('personListFooter');
  if (!container) return;
  const q = _normKey(STATE.ui.bdSearch || '');
  const nombres = Object.keys(BD_EMPRESAS).sort();
  const filtrados = q
    ? nombres.filter(n => {
        const e = BD_EMPRESAS[n];
        return _normKey(n).includes(q)
          || _normKey(e.razonSocial || '').includes(q)
          || _normKey(e.giroInformal || '').includes(q)
          || _normKey(e.rutEmpresa || '').includes(q)
          || _normKey(e.tipo || '').includes(q);
      })
    : nombres;

  if (filtrados.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:48px 24px;color:var(--ink-faint);">
      ${nombres.length === 0
        ? 'No hay empresas en la BD todavía. Importá la planilla con "Importar BD (.xlsx)" o agregá una con el botón "+ Nueva empresa".'
        : 'No hay empresas que coincidan con tu búsqueda.'}
    </div>`;
    if (footer) footer.textContent = '';
    return;
  }

  container.innerHTML = filtrados.map(k => {
    const e = BD_EMPRESAS[k];
    const tipos = (e.tipo || '').split(',').map(s => s.trim()).filter(Boolean);
    const tipoBadges = tipos.map(t => {
      const color = t === 'Cliente' ? '#2563eb' : (t === 'Proveedor' ? '#7c3aed' : '#6b7280');
      return `<span style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500;">${escapeHtml(t)}</span>`;
    }).join(' ');
    return `<div style="background:var(--bg-surface);border:1px solid var(--border-soft);border-radius:8px;padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;gap:16px;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;color:var(--ink-primary);font-size:14px;">${escapeHtml(e.nombreFantasia || k)}</div>
        <div style="color:var(--ink-secondary);font-size:12px;margin-top:2px;">
          ${e.razonSocial ? escapeHtml(e.razonSocial) + ' · ' : ''}${e.rutEmpresa ? escapeHtml(e.rutEmpresa) + ' · ' : ''}${escapeHtml(e.giroInformal || e.giroSII || '')}
        </div>
        <div style="color:var(--ink-faint);font-size:11px;margin-top:4px;">
          ${e.contactoPrincipal ? escapeHtml(e.contactoPrincipal) : ''}${e.emailContacto ? ' · ' + escapeHtml(e.emailContacto) : ''}${e.telefonoContacto ? ' · ' + escapeHtml(e.telefonoContacto) : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
        ${tipoBadges}
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" ${accionHTML('bd.verEmp', e._id)}>Ver ficha</button>
          <button class="btn btn-secondary btn-sm" ${accionHTML('bd.editEmp', e._id)}>Editar</button>
        </div>
      </div>
    </div>`;
  }).join('');
  if (footer) footer.textContent = `${filtrados.length} empresa(s) — ${nombres.length} total`;
}

/* Listado de Talentos (V7.1) */
/* V11.5.0 · los talentos son personas: su ficha se edita desde aquí también. */
function bdTalentoEditar(nombre) {
  for (const id in BD_CONTACTOS) { if (BD_CONTACTOS[id] && BD_CONTACTOS[id].nombre === nombre) { openPersonaForm('edit', id); return; } }
  showToast({ kind: 'info', title: 'Ficha no encontrada', body: 'Este talento no tiene ficha de persona en la BD.' });
}
function renderBDTalentosList() {
  const container = document.getElementById('personRows');
  const footer = document.getElementById('personListFooter');
  if (!container) return;
  const q = _normKey(STATE.ui.bdSearch || '');
  const nombres = Object.keys(BD_TALENTOS).sort();
  const filtrados = q
    ? nombres.filter(n => {
        const t = BD_TALENTOS[n];
        return _normKey(n).includes(q)
          || _normKey(t.areas || '').includes(q)
          || _normKey(t.ciudad || '').includes(q)
          || _normKey(t.apariencia || '').includes(q)
          || _normKey(t.genero || '').includes(q);
      })
    : nombres;

  if (filtrados.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:48px 24px;color:var(--ink-faint);">
      ${nombres.length === 0
        ? 'No hay talentos en la BD todavía. Importá la planilla con "Importar BD (.xlsx)".'
        : 'No hay talentos que coincidan con tu búsqueda.'}
    </div>`;
    if (footer) footer.textContent = '';
    return;
  }

  container.innerHTML = filtrados.map(k => {
    const t = BD_TALENTOS[k];
    const _edadT = _edadDesde(t.fechaNacimiento) || t.edad || '';
    const meta = [_edadT ? _edadT + ' años' : '', t.altura ? t.altura + 'm' : '', t.genero || '', t.apariencia || ''].filter(Boolean).join(' · ');
    return `<div style="background:var(--bg-surface);border:1px solid var(--border-soft);border-radius:8px;padding:12px 16px;margin-bottom:8px;cursor:pointer;" title="Editar ficha" ${accionHTML('bd.editTalento', k)}>
      <div style="display:flex;align-items:flex-start;gap:16px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;color:var(--ink-primary);font-size:14px;">${escapeHtml(t.nombre || k)}</div>
          <div style="color:var(--ink-secondary);font-size:12px;margin-top:2px;">${escapeHtml(meta)}</div>
          ${t.areas ? `<div style="color:var(--ink-faint);font-size:11px;margin-top:4px;">${escapeHtml(t.areas)}</div>` : ''}
          ${(t.email || t.telefono) ? `<div style="color:var(--ink-faint);font-size:11px;margin-top:4px;">${escapeHtml(t.email || '')}${t.email && t.telefono ? ' · ' : ''}${escapeHtml(t.telefono || '')}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          ${t.fotosLink ? `<a href="${safeUrl(t.fotosLink.split(',')[0].trim())}" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent);text-decoration:none;padding:4px 8px;border:1px solid var(--border-soft);border-radius:4px;">Fotos</a>` : ''}
          ${t.reelLink ? `<a href="${safeUrl(t.reelLink)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent);text-decoration:none;padding:4px 8px;border:1px solid var(--border-soft);border-radius:4px;">Reel</a>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
  if (footer) footer.textContent = `${filtrados.length} talento(s) — ${nombres.length} total`;
}

/* Quick-add stubs para Empresas y Talentos (mínimo viable V7.1) */
function openAddEmpresaQuick() {
  showModal({
    title: 'Nueva empresa',
    body: `<div style="display:flex;flex-direction:column;gap:10px;">
      <input id="newEmpNombre" placeholder="Nombre de fantasía *" style="padding:8px;background:#1a1a1c;border:1px solid #2a2a2e;color:#e8e8ea;border-radius:6px;font-family:inherit;">
      <input id="newEmpRut" placeholder="RUT empresa (opcional)" style="padding:8px;background:#1a1a1c;border:1px solid #2a2a2e;color:#e8e8ea;border-radius:6px;font-family:inherit;">
      <select id="newEmpTipo" style="padding:8px;background:#1a1a1c;border:1px solid #2a2a2e;color:#e8e8ea;border-radius:6px;font-family:inherit;">
        <option value="Cliente">Cliente</option>
        <option value="Proveedor">Proveedor</option>
        <option value="Agencia">Agencia</option>
        <option value="Cliente, Proveedor">Cliente y Proveedor</option>
      </select>
      <input id="newEmpGiro" placeholder="Giro informal (qué hacen)" style="padding:8px;background:#1a1a1c;border:1px solid #2a2a2e;color:#e8e8ea;border-radius:6px;font-family:inherit;">
    </div>`,
    confirmLabel: 'Crear',
    cancelLabel: 'Cancelar',
    onConfirm: () => {
      const nombre = _normNameBD(document.getElementById('newEmpNombre')?.value || '');
      if (!nombre) { showToast({ kind:'error', title:'Falta nombre', body:'El nombre de fantasía es obligatorio.' }); return false; }
      if (BD_EMPRESAS[nombre]) { showToast({ kind:'warning', title:'Ya existe', body:`Ya hay una empresa "${escapeHtml(nombre)}". Edítala desde la lista.` }); return false; }
      const _eid = _genId('emp', BD_EMPRESAS_BYID);
      BD_EMPRESAS_BYID[_eid] = {
        id: _eid, nombreFantasia: nombre,
        rutEmpresa: _normRutBD(document.getElementById('newEmpRut')?.value || ''),
        razonSocial: '',
        tipo: document.getElementById('newEmpTipo')?.value || 'Cliente',
        giroSII: '',
        giroInformal: (document.getElementById('newEmpGiro')?.value || '').trim(),
        contactoPrincipal: '', contactoPrincipalId: '', emailContacto: '', telefonoContacto: '', web: '', notas: ''
      };
      syncLegacyFromContactos();
      autosaveNow();
      dalGuardarEmpresa(BD_EMPRESAS_BYID[_eid]);   // V9.1.1: alta de empresa a Supabase
      renderBDPersonas();
      showToast({ kind:'success', title:'Empresa creada', body:`<strong>${escapeHtml(nombre)}</strong> agregada a la BD.` });
    },
    onCancel: () => {}
  });
}

/* ════════ V8.4.2 · EDICIÓN COMPLETA DE EMPRESAS (punto 7) ════════
   Edita el modelo canónico BD_EMPRESAS_BYID (se persiste entero). Campos nuevos:
   dueno{nombre,telefono,email}, representante{nombre,cargo,telefono,email},
   observaciones. Los contactos NO son una lista propia: son contactos de la BD
   (BD_CONTACTOS) vinculados por empresaId. Al agregar uno que no está en la BD,
   se crea un registro mínimo (solo nombre) y se vincula — la data no se pierde. */
function _empContactos(empId) {
  return Object.keys(BD_CONTACTOS).map(id => BD_CONTACTOS[id]).filter(c => c && c.empresaId === empId && c.nombre);
}
function empresaSet(empId, field, value) {
  const e = BD_EMPRESAS_BYID[empId]; if (!e) return;
  e[field] = value;
  syncLegacyFromContactos(); markDirty(); autosaveNow(); _dalEmpresaSaveSoon(empId);
}
function empresaSetSub(empId, obj, field, value) {
  const e = BD_EMPRESAS_BYID[empId]; if (!e) return;
  if (!e[obj] || typeof e[obj] !== 'object') e[obj] = {};
  e[obj][field] = value; markDirty(); autosaveNow(); _dalEmpresaSaveSoon(empId);
}
function empresaSetDuenoField(empId, idx, field, value) { const e = BD_EMPRESAS_BYID[empId]; if (!e || !Array.isArray(e.duenos) || !e.duenos[idx]) return; e.duenos[idx][field] = value; markDirty(); autosaveNow(); _dalEmpresaSaveSoon(empId); }
function empresaAddDueno(empId) { const e = BD_EMPRESAS_BYID[empId]; if (!e) return; if (!Array.isArray(e.duenos)) e.duenos = []; e.duenos.push({ nombre: '', telefono: '', email: '' }); markDirty(); autosaveNow(); _dalEmpresaSaveSoon(empId); openEmpresaEdit(empId); }
function empresaRemoveDueno(empId, idx) { const e = BD_EMPRESAS_BYID[empId]; if (!e || !Array.isArray(e.duenos)) return; e.duenos.splice(idx, 1); markDirty(); autosaveNow(); _dalEmpresaSaveSoon(empId); openEmpresaEdit(empId); }
function empresaSetContactoRel(contactId, value) {
  const c = BD_CONTACTOS[contactId]; if (!c) return; c.relacionEmpresa = value; markDirty(); autosaveNow(); _dalContactoSaveSoon(contactId);
}
function empresaUnlinkContacto(empId, contactId) {
  const c = BD_CONTACTOS[contactId]; if (!c) return;
  c.empresaId = ''; c.relacionEmpresa = '';
  syncLegacyFromContactos(); markDirty(); autosaveNow(); _dalContactoSaveSoon(contactId); openEmpresaEdit(empId);
}
function empresaAddContacto(empId, nombre) {
  nombre = (nombre || '').trim(); if (!nombre) return;
  let existing = null;
  Object.keys(BD_CONTACTOS).forEach(id => { const c = BD_CONTACTOS[id]; if (c && c.nombre === nombre) existing = c; });
  if (!existing) { showToast({ kind: 'info', title: 'No está en la BD', body: '«' + escapeHtml(nombre) + '» no está en la Base de Datos. Usa «+ Agregar a la BD» en el desplegable para crear su ficha.' }); return; }
  existing.empresaId = empId; if (!existing.relacionEmpresa) existing.relacionEmpresa = 'Contacto';
  syncLegacyFromContactos(); markDirty(); autosaveNow(); _dalContactoSaveSoon(existing.id);
  showToast({ kind: 'success', title: 'Contacto vinculado', body: escapeHtml(nombre) + ' quedó asociado a la empresa.' });
  openEmpresaEdit(empId);
}
/* I1a · crear (o reutilizar) una empresa por nombre + rol y abrir su ficha
   (editor) ahí mismo. Lo usa Info Proyecto: el botón "+ Agregar a la BD" del
   aviso crea la empresa y abre el editor para completar sus datos, sin sacar al
   usuario del módulo. Devuelve el id de la empresa. */
function crearEmpresaYEditar(nombre, rol) {
  nombre = _normNameBD((nombre || '').trim());
  if (!nombre) { showToast({ kind: 'error', title: 'Falta el nombre', body: 'Escribe el nombre de la empresa antes de agregarla.' }); return null; }
  const rolCap = (String(rol || '').toLowerCase() === 'agencia') ? 'Agencia' : 'Cliente';
  const existente = BD_EMPRESAS[nombre];
  let eid;
  if (existente && existente._id && BD_EMPRESAS_BYID[existente._id]) {
    eid = existente._id;   // ya existe: se abre su ficha tal cual
  } else {
    eid = _genId('emp', BD_EMPRESAS_BYID);
    BD_EMPRESAS_BYID[eid] = { id: eid, nombreFantasia: nombre, rutEmpresa: '', razonSocial: '', tipo: rolCap, giroSII: '', giroInformal: '', contactoPrincipal: '', contactoPrincipalId: '', emailContacto: '', telefonoContacto: '', web: '', notas: '' };
    syncLegacyFromContactos(); autosaveNow(); dalGuardarEmpresa(BD_EMPRESAS_BYID[eid]);
    showToast({ kind: 'success', title: 'Empresa creada', body: escapeHtml(nombre) + ' se agregó a la BD. Completa sus datos.' });
  }
  openEmpresaEdit(eid);
  return eid;
}
function openEmpresaEdit(empId) {
  const e = BD_EMPRESAS_BYID[empId]; if (!e) { showToast({ kind: 'error', title: 'No encontrada', body: 'No se encontró la empresa.' }); return; }
  if (!e.dueno || typeof e.dueno !== 'object') e.dueno = { nombre: '', telefono: '', email: '' };
  if (!e.representante || typeof e.representante !== 'object') e.representante = { nombre: '', cargo: '', telefono: '', email: '' };
  if (!Array.isArray(e.duenos)) { e.duenos = []; if (e.dueno && (e.dueno.nombre || e.dueno.telefono || e.dueno.email)) e.duenos.push({ nombre: e.dueno.nombre || '', telefono: e.dueno.telefono || '', email: e.dueno.email || '' }); }
  const esc = escapeHtml;
  const tipos = ['Cliente', 'Proveedor', 'Agencia', 'Cliente, Proveedor'];
  const tipoSel = tipos.map(t => `<option ${e.tipo === t ? 'selected' : ''}>${t}</option>`).join('');
  const contactos = _empContactos(empId);
  const contactosHTML = contactos.length ? contactos.map(c => `
    <div style="border:1px solid var(--rule);border-radius:8px;padding:9px 10px;margin-bottom:8px;">
      <div style="display:flex;gap:8px;align-items:center;">
        <span style="flex:1;font-weight:600;">${esc(c.nombre)}</span>
        <button class="btn btn-secondary btn-sm" style="color:#d08;border-color:rgba(210,0,80,.4);" ${accionHTML('bd.empUnlink', empId, c.id)} title="Desvincular (no se borra de la BD)">Desvincular</button>
      </div>
      <div style="font-size:11.5px;color:var(--ink-faint);margin-top:4px;">${[c.rolHabitual, c.email, c.telefono].filter(Boolean).map(esc).join(' · ') || 'Sin más datos en la BD aún'}</div>
      <div style="margin-top:7px;"><label style="font-size:11px;color:var(--ink-mut);">Cargo / relación</label><input class="input" value="${esc(c.relacionEmpresa || '')}" placeholder="Contacto · Gerente · Encargado…" ${accionHTML('bd.empRel', c.id, { on: 'change' })}></div>
    </div>`).join('') : '<div style="font-size:12px;color:var(--ink-faint);margin-bottom:8px;">Sin contactos vinculados todavía.</div>';
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal" style="max-width:720px;width:94vw;max-height:88vh;overflow:auto;">
    <div class="modal-header"><div class="modal-title">${esc(e.nombreFantasia || 'Empresa')}</div><button class="go-x" data-accion="ui.cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--ink-mut);">×</button></div>
    <div class="modal-body">
      <div class="form-grid cols-2" style="gap:12px;">
        <div class="field"><label class="field-label">Nombre de fantasía</label><input class="input" value="${esc(e.nombreFantasia || '')}" ${accionHTML('bd.empSet', empId, 'nombreFantasia', { on: 'change' })}></div>
        <div class="field"><label class="field-label">Razón social</label><input class="input" value="${esc(e.razonSocial || '')}" ${accionHTML('bd.empSet', empId, 'razonSocial', { on: 'change' })}></div>
        <div class="field"><label class="field-label">RUT</label><input class="input" value="${esc(e.rutEmpresa || '')}" ${accionHTML('bd.empSet', empId, 'rutEmpresa', { on: 'change' })}></div>
        <div class="field"><label class="field-label">Tipo</label><select class="input" ${accionHTML('bd.empSet', empId, 'tipo', { on: 'change' })}>${tipoSel}</select></div>
        <div class="field"><label class="field-label">Giro informal</label><input class="input" value="${esc(e.giroInformal || '')}" placeholder="Qué hacen, en simple" ${accionHTML('bd.empSet', empId, 'giroInformal', { on: 'change' })}></div>
        <div class="field"><label class="field-label">Giro SII</label><input class="input" value="${esc(e.giroSII || '')}" ${accionHTML('bd.empSet', empId, 'giroSII', { on: 'change' })}></div>
      </div>
      <div class="loc-block" style="margin-top:8px;"><div class="loc-block-h">Dueños / socios</div>
        ${e.duenos.length ? e.duenos.map((du, di) => `
          <div style="border:1px solid var(--rule);border-radius:8px;padding:9px 10px;margin-bottom:8px;">
            <div class="form-grid cols-3" style="gap:8px;">
              <div class="field"><label class="field-label">Nombre</label>
                <span class="combobox-wrap person-combobox cbx-anchored" style="display:block;">
                  <input class="input combobox-input" value="${esc(du.nombre || '')}" placeholder="Buscar en la BD…" autocomplete="off" ${accionHTML('bd.duenoCombo', empId, di, { on: 'focus input blur change' })}>
                  <div class="combobox-dropdown" hidden></div>
                </span>
              </div>
              <div class="field"><label class="field-label">Teléfono</label><input class="input" value="${esc(du.telefono || '')}" ${accionHTML('bd.dueno', empId, di, 'telefono', { on: 'change' })}></div>
              <div class="field"><label class="field-label">Mail</label><input class="input" value="${esc(du.email || '')}" ${accionHTML('bd.dueno', empId, di, 'email', { on: 'change' })}></div>
            </div>
            <div style="text-align:right;margin-top:4px;"><button class="btn btn-secondary btn-sm" style="color:#d08;border-color:rgba(210,0,80,.4);" ${accionHTML('bd.duenoQuitar', empId, di)}>Quitar</button></div>
          </div>`).join('') : '<div style="font-size:12px;color:var(--ink-faint);margin-bottom:8px;">Sin dueños/socios todavía.</div>'}
        <button class="btn btn-secondary btn-sm" ${accionHTML('bd.duenoAdd', empId)}>+ Agregar dueño / socio</button>
      </div>
      <div class="loc-block"><div class="loc-block-h">Representante</div>
        <div class="form-grid cols-2" style="gap:10px;">
          <div class="field"><label class="field-label">Nombre</label>
            <span class="combobox-wrap person-combobox cbx-anchored" style="display:block;">
              <input class="input combobox-input" value="${esc(e.representante.nombre || '')}" placeholder="Buscar en la BD…" autocomplete="off" ${accionHTML('bd.repCombo', empId, { on: 'focus input blur change' })}>
              <div class="combobox-dropdown" hidden></div>
            </span>
          </div>
          <div class="field"><label class="field-label">Cargo</label><input class="input" value="${esc(e.representante.cargo || '')}" ${accionHTML('bd.rep', empId, 'cargo', { on: 'change' })}></div>
          <div class="field"><label class="field-label">Teléfono</label><input class="input" value="${esc(e.representante.telefono || '')}" ${accionHTML('bd.rep', empId, 'telefono', { on: 'change' })}></div>
          <div class="field"><label class="field-label">Mail</label><input class="input" value="${esc(e.representante.email || '')}" ${accionHTML('bd.rep', empId, 'email', { on: 'change' })}></div>
        </div>
      </div>
      <div class="loc-block"><div class="loc-block-h">Contactos de la empresa <span class="loc-block-tag bd">desde la Base de Datos</span></div>
        ${contactosHTML}
        <label style="font-size:11px;color:var(--ink-mut);">Agregar contacto</label>
        <span class="combobox-wrap person-combobox cbx-anchored" style="display:block;margin-top:3px;">
          <input class="input combobox-input" placeholder="Buscar en la Base de Datos…" autocomplete="off" ${accionHTML('bd.empAddContacto', empId, { on: 'focus input blur change' })}>
          <div class="combobox-dropdown" hidden></div>
        </span>
      </div>
      <div class="field" style="margin-top:8px;"><label class="field-label">Observaciones</label><textarea class="input" rows="3" ${accionHTML('bd.empSet', empId, 'observaciones', { on: 'change' })}>${esc(e.observaciones || e.notas || '')}</textarea></div>
    </div>
    <div class="modal-footer">${_bdPuedeArchivar() ? `<button class="btn btn-ghost btn-sm" style="color:var(--accent-deep);margin-right:auto;" ${accionHTML('bd.archivarEmp', empId)}>Archivar</button>` : ''}<button class="btn btn-primary" data-accion="bd.listo">Listo</button></div>
  </div></div>`;
}
/* ════════ V8.4.2 · FICHA CONTROL ROOM POR EMPRESA (punto 8) ════════
   Vincula proyectos por infoProyecto.clienteEmpresaId. Pagado y margen SOLO
   sobre proyectos CERRADOS y desde finanzas reales (gananciaFinal.real); los no
   cerrados se muestran aparte como "en curso/proforma". Días de pago: aún no hay
   fecha de pago del cliente en el modelo, así que se muestra honesto como "—". */
function openEmpresaProfile(empId) {
  const e = BD_EMPRESAS_BYID[empId]; if (!e) { showToast({ kind: 'error', title: 'No encontrada', body: 'No se encontró la empresa.' }); return; }
  const esc = escapeHtml;
  const linked = PROJECTS.filter(p => p && p.data && p.data.infoProyecto && p.data.infoProyecto.clienteEmpresaId === empId);
  const cerrados = linked.filter(p => p.state === 'cerrado');
  const activos = linked.filter(p => ['cerrado', 'rechazado'].indexOf(p.state) === -1);
  let pagado = 0, margen = 0;
  cerrados.forEach(p => { try { const sx = calcSummaryFin(p); pagado += sx.presupClienteEfectivo || 0; margen += (sx.gananciaFinal && sx.gananciaFinal.real) || 0; } catch (err) {} });
  const ticket = cerrados.length ? Math.round(pagado / cerrados.length) : 0;
  const fechas = linked.map(p => (p.data.infoProyecto.fechaAprobacion || '')).filter(Boolean).sort();
  const primera = fechas.length ? fechas[0] : null;
  const ultima = fechas.length ? fechas[fechas.length - 1] : null;
  const fmtF = (d) => { if (!d) return '—'; const pr = String(d).split('-'); return pr.length === 3 ? (pr[2] + '-' + pr[1] + '-' + pr[0]) : d; };
  const stateName = (st) => (STATES[st] && STATES[st].name) || st;
  const contactos = _empContactos(empId);
  /* #3 · ficha distinta para proveedores: total histórico en gastos + proyectos donde
     se usó, cruzando el nombre del proveedor escrito en cada gasto (m.prov) con el de
     la empresa. Match best-effort (texto libre en el gasto). */
  const esProveedor = _empTieneRol(e.tipo, 'proveedor');
  const esCliente = _empTieneRol(e.tipo, 'cliente') || linked.length > 0;
  const mostrarCliente = esCliente || !esProveedor;
  let provTotal = 0, provGastos = 0, provUltima = ''; const provProy = new Set();
  if (esProveedor) {
    const provNames = [e.nombreFantasia, e.razonSocial].filter(Boolean).map(_normKey);
    PROJECTS.forEach(p => {
      (goMovs(p) || []).forEach(m => {
        if (m && m.prov && provNames.indexOf(_normKey(m.prov)) !== -1) {
          provTotal += (m.monto || 0); provGastos++; provProy.add(p.id);
          if (m.fecha && m.fecha > provUltima) provUltima = m.fecha;
        }
      });
    });
  }
  const tile = (label, val, sub) => `<div style="border:1px solid var(--rule);border-radius:10px;padding:12px 14px;min-width:0;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-faint);">${label}</div>
    <div style="font-size:20px;font-weight:700;color:var(--ink-primary);margin-top:3px;">${val}</div>
    ${sub ? `<div style="font-size:11px;color:var(--ink-faint);margin-top:2px;">${sub}</div>` : ''}
  </div>`;
  const tiles = [
    tile('Proyectos vinculados', linked.length, ''),
    tile('Cerrados', cerrados.length, ''),
    tile('Activos / en curso', activos.length, ''),
    tile('Total pagado', fmtMoney(pagado), 'solo cerrados · finanzas reales'),
    tile('Margen histórico', fmtMoney(margen), 'solo cerrados · finanzas reales'),
    tile('Ticket promedio', cerrados.length ? fmtMoney(ticket) : '—', 'por proyecto cerrado'),
    tile('Primer proyecto', fmtF(primera), ''),
    tile('Último proyecto', fmtF(ultima), ''),
    tile('Días de pago (prom.)', '—', 'no registrado aún')
  ].join('');
  const provTiles = esProveedor ? [
    tile('Total a este proveedor', fmtMoney(provTotal), 'gastos en todos los proyectos'),
    tile('Proyectos', provProy.size, 'usaron este proveedor'),
    tile('Gastos registrados', provGastos, ''),
    tile('Último gasto', fmtF(provUltima), '')
  ].join('') : '';
  const proveedorHTML = esProveedor ? `<div class="loc-block"><div class="loc-block-h">Como proveedor <span class="loc-block-tag proj">total histórico en gastos</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:6px 0;">${provTiles}</div>
    <div style="font-size:11px;color:var(--ink-faint);line-height:1.5;">El total cruza el nombre del proveedor escrito en cada gasto (texto libre) con el nombre de esta empresa; si en algún gasto se escribió distinto, puede no sumarlo.</div></div>` : '';
  const infoLine = [e.razonSocial, e.rutEmpresa, e.tipo].filter(Boolean).map(esc).join(' · ');
  const activosHTML = activos.length ? `<div class="loc-block"><div class="loc-block-h">Activos / en curso <span class="loc-block-tag proj">proforma · no suma a pagado/margen</span></div>
    ${activos.map(p => { let v = 0; try { v = calcSummaryFin(p).presupClienteEfectivo || 0; } catch (err) {} return `<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--rule);"><span>${esc(p.name || '(sin nombre)')} <span style="color:var(--ink-faint);font-size:11px;">· ${esc(stateName(p.state))}</span></span><span style="color:var(--ink-faint);">${fmtMoney(v)} <span style="font-size:11px;">proforma</span></span></div>`; }).join('')}
  </div>` : '';
  const cerradosHTML = cerrados.length ? `<div class="loc-block"><div class="loc-block-h">Proyectos cerrados</div>
    ${cerrados.map(p => { let sx = null; try { sx = calcSummaryFin(p); } catch (err) {} const pg = sx ? (sx.presupClienteEfectivo || 0) : 0; const mg = (sx && sx.gananciaFinal) ? (sx.gananciaFinal.real || 0) : 0; return `<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--rule);"><span>${esc(p.name || '(sin nombre)')}</span><span style="color:var(--ink-faint);">${fmtMoney(pg)} · margen ${fmtMoney(mg)}</span></div>`; }).join('')}
  </div>` : '';
  const contactosHTML = contactos.length ? `<div class="loc-block"><div class="loc-block-h">Contactos de la empresa</div>${contactos.map(c => `<div style="padding:4px 0;">${esc(c.nombre)}${c.relacionEmpresa ? ` <span style="color:var(--ink-faint);font-size:11px;">· ${esc(c.relacionEmpresa)}</span>` : ''}</div>`).join('')}</div>` : '';
  const vacio = linked.length === 0 ? `<div style="font-size:12.5px;color:var(--ink-secondary);background:var(--bg-surface);border:1px solid var(--rule);border-radius:8px;padding:12px;">Esta empresa no tiene proyectos vinculados todavía. Vincúlalos desde cada proyecto en <b>Info Proyecto → Empresa cliente (BD)</b>.</div>` : '';
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-accion="ui.backdrop"><div class="modal" style="max-width:760px;width:94vw;max-height:88vh;overflow:auto;">
    <div class="modal-header"><div class="modal-title">${esc(e.nombreFantasia || 'Empresa')}${infoLine ? ` <span style="font-weight:400;font-size:12px;color:var(--ink-faint);">· ${infoLine}</span>` : ''}</div><button class="go-x" data-accion="ui.cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--ink-mut);">×</button></div>
    <div class="modal-body">
      ${mostrarCliente ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:6px;">${tiles}</div>
      ${vacio}
      ${activosHTML}
      ${cerradosHTML}` : ''}
      ${proveedorHTML}
      ${contactosHTML}
      ${mostrarCliente ? `<div style="font-size:11px;color:var(--ink-faint);margin-top:8px;line-height:1.5;">El "total pagado" y el "margen histórico" se calculan solo sobre proyectos <b>cerrados</b>, desde sus finanzas reales. Los proyectos en curso se muestran como proforma y no suman. El promedio de días de pago requiere registrar la fecha de pago del cliente (aún no existe en el modelo).</div>` : ''}
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" ${accionHTML('bd.editEmp', empId)}>Editar empresa</button><button class="btn btn-primary" data-accion="ui.cerrar">Listo</button></div>
  </div></div>`;
}
function openAddTalentoQuick() {
  showModal({
    title: 'Nuevo talento',
    body: `<div style="display:flex;flex-direction:column;gap:10px;">
      <input id="newTalNombre" placeholder="Nombre completo *" style="padding:8px;background:#1a1a1c;border:1px solid #2a2a2e;color:#e8e8ea;border-radius:6px;font-family:inherit;">
      <input id="newTalEmail" placeholder="Email" style="padding:8px;background:#1a1a1c;border:1px solid #2a2a2e;color:#e8e8ea;border-radius:6px;font-family:inherit;">
      <input id="newTalTel" placeholder="Teléfono" style="padding:8px;background:#1a1a1c;border:1px solid #2a2a2e;color:#e8e8ea;border-radius:6px;font-family:inherit;">
      <div style="display:flex;gap:8px;">
        <input id="newTalEdad" placeholder="Edad" style="flex:1;padding:8px;background:#1a1a1c;border:1px solid #2a2a2e;color:#e8e8ea;border-radius:6px;font-family:inherit;">
        <input id="newTalAltura" placeholder="Altura (1.XX)" style="flex:1;padding:8px;background:#1a1a1c;border:1px solid #2a2a2e;color:#e8e8ea;border-radius:6px;font-family:inherit;">
      </div>
      <input id="newTalCiudad" placeholder="Ciudad" style="padding:8px;background:#1a1a1c;border:1px solid #2a2a2e;color:#e8e8ea;border-radius:6px;font-family:inherit;">
    </div>`,
    confirmLabel: 'Crear',
    cancelLabel: 'Cancelar',
    onConfirm: () => {
      const nombre = _normNameBD(document.getElementById('newTalNombre')?.value || '');
      if (!nombre) { showToast({ kind:'error', title:'Falta nombre', body:'El nombre es obligatorio.' }); return; }
      if (BD_TALENTOS[nombre]) { showToast({ kind:'warning', title:'Ya existe', body:`Ya hay un talento "${escapeHtml(nombre)}".` }); return; }
      const _tid = _genId('ctk', BD_CONTACTOS);
      BD_CONTACTOS[_tid] = {
        id: _tid, nombre, rut: '',
        email: _normEmailBD(document.getElementById('newTalEmail')?.value || ''),
        telefono: _normPhoneBD(document.getElementById('newTalTel')?.value || ''),
        roles: ['Talento'], rolHabitual: '', empresaId: '', relacionEmpresa: '',
        direccion: '', direccionLinea2: '', comuna: '',
        ciudad: _normNameBD(document.getElementById('newTalCiudad')?.value || ''),
        restriccion: '', fechaNacimiento: '', notas: '',
        perfilPago: null,
        perfilTalento: _buildPerfilTalento({
          edad: (document.getElementById('newTalEdad')?.value || '').trim(),
          altura: (document.getElementById('newTalAltura')?.value || '').trim()
        })
      };
      syncLegacyFromContactos();
      autosaveNow();
      renderBDPersonas();
      showToast({ kind:'success', title:'Talento creado', body:`<strong>${escapeHtml(nombre)}</strong> agregado al pool.` });
    },
    onCancel: () => {}
  });
}

/* V5.2.1: render granular de la lista. Solo toca #personRows y el footer.
   El input de búsqueda permanece intacto, conservando foco. */
function renderBDPersonList() {
  const q = _normKey(STATE.ui.bdSearch || '');  // V5.9 (Nota 3): sin tildes
  const nombres = Object.keys(BD_PERSONAS).sort();
  const filtrados = q
    ? nombres.filter(n => {
        const p = BD_PERSONAS[n];
        return _normKey(n).includes(q)
          || _normKey(p.rolHabitual || '').includes(q)
          || _normKey(p.mail || '').includes(q);
      })
    : nombres;

  const rowsEl = document.getElementById('personRows');
  if (!rowsEl) return;
  if (filtrados.length === 0) {
    rowsEl.innerHTML = `<div class="alert alert-warning"><span class="alert-icon">⚠</span><div>No se encontraron personas con "${escapeHtml(STATE.ui.bdSearch)}".</div></div>`;
  } else {
    rowsEl.innerHTML = filtrados.map(nombre => renderPersonRow(nombre)).join('');
  }
  const footer = document.getElementById('personListFooter');
  if (footer) {
    footer.textContent = `${nombres.length} personas en la base de datos · ${filtrados.length} mostrando`;
  }
}

function renderPersonRow(nombre) {
  const p = BD_PERSONAS[nombre];
  const isExpanded = STATE.ui.bdExpanded === nombre;
  const dteShort = DTE_LABEL_SHORT[p.dteHabitual] || '—';

  return `
    <div class="person-row" ${accionHTML('bd.expandir', nombre)} style="cursor: pointer;">
      <div class="person-avatar">${initials(nombre)}</div>
      <div>
        <div class="person-name">${escapeHtml(nombre)}</div>
        <div class="person-meta">${escapeHtml(p.rolHabitual || '—')}</div>
      </div>
      <div class="person-mail">${escapeHtml(p.mail || '—')}</div>
      <div class="person-phone">${escapeHtml(p.telefono || '—')}</div>
      <div class="person-meta">${escapeHtml(p.comuna || '—')}</div>
      <div class="person-meta">${dteShort}</div>
      <div style="color: var(--ink-faint); font-size: 14px;">${isExpanded ? '▾' : '▸'}</div>
    </div>
    ${isExpanded ? `
      <div style="background: var(--bg-surface-soft); border: 1px solid var(--rule); border-radius: var(--radius-sm); padding: 16px 20px; margin: -4px 0 8px;">
        <div class="form-grid cols-3">
          <div class="field"><div class="field-label">RUT</div><div class="field-value">${escapeHtml(p.rut || '—')}</div></div>
          <div class="field"><div class="field-label">DTE habitual</div><div class="field-value">${escapeHtml(DTE_LABEL[p.dteHabitual] || p.tipoDTE || '—')}</div></div>
          <div class="field"><div class="field-label">Restricción alimenticia</div><div class="field-value">${escapeHtml(p.restriccion || '—')}</div></div>
          <div class="field" style="grid-column: span 2;"><div class="field-label">Dirección</div><div class="field-value">${escapeHtml(p.direccion || '—')}${(p.direccion2 || p.direccionLinea2) ? ', ' + escapeHtml(p.direccion2 || p.direccionLinea2) : ''}</div></div>
          <div class="field"><div class="field-label">Comuna</div><div class="field-value">${escapeHtml(p.comuna || '—')}</div></div>
          ${(p.banco || p.numeroCuenta || p.nCuenta || p.tipoCuenta) ? `
          <div class="field"><div class="field-label">Banco</div><div class="field-value">${escapeHtml(p.banco || '—')}${(p.codigoBanco) ? ' <span style="color:var(--ink-faint);">(cód. ' + escapeHtml(p.codigoBanco) + ')</span>' : ''}</div></div>
          <div class="field"><div class="field-label">Tipo de cuenta</div><div class="field-value">${escapeHtml(p.tipoCuenta || '—')}</div></div>
          <div class="field"><div class="field-label">N° de cuenta</div><div class="field-value">${escapeHtml(p.numeroCuenta || p.nCuenta || '—')}</div></div>` : ''}
        </div>
        <div style="margin-top: 14px; display: flex; justify-content: flex-end;">
          <button class="btn btn-secondary btn-sm" ${accionHTML('bd.editPersona', p._id || '')}>✎ Editar ficha</button>
        </div>
      </div>
    ` : ''}
  `;
}

function togglePersonExpand(nombre) {
  STATE.ui.bdExpanded = STATE.ui.bdExpanded === nombre ? null : nombre;
  renderBDPersonList();  // V5.2.1: render granular para no perder foco
}

/* Debounce ligero para evitar render en cada keystroke */

/* ════════════════════════════════════════════════════════════════════
   ARCHIVAR / RESTAURAR la Base de Datos (soft-delete, solo Administrador)
   Usa los RPC SECURITY DEFINER de archivar/restaurar (admin-only, prod). La
   carga de la BD ya filtra deleted_at IS NULL, así que archivar oculta el
   registro; "Archivados" lo lista (deleted_at NOT NULL) para restaurarlo. No
   borra: no rompe gastos/proyectos históricos. Talentos = contactos.
   ════════════════════════════════════════════════════════════════════ */
export function _bdPuedeArchivar() { return !!(STATE.adminMode && authNivel('eliminar_proyecto') === 'E'); }

function archivarContactoModal(contactId) {
  const c = BD_CONTACTOS[contactId];
  showModal({
    title: 'Archivar persona',
    body: '¿Archivar a <b>' + escapeHtml((c && c.nombre) || contactId) + '</b>?<br><br>Desaparece de la Base de Datos (no se elimina) y queda en <b>Archivados</b> por si la necesitas de vuelta. No afecta gastos ni proyectos históricos.',
    confirmLabel: 'Archivar', cancelLabel: 'Cancelar', danger: true,
    onConfirm: async function () {
      try {
        const r = await sb.rpc('archivar_contacto', { p_id: contactId });
        if (r.error) throw r.error;
        delete BD_CONTACTOS[contactId]; syncLegacyFromContactos(); markDirty();
        closeModal();
        if (STATE.currentModule === 'bd-personas') renderBDPersonas();
        showToast({ kind: 'success', title: 'Persona archivada', body: 'Se quitó de la BD. Recuperable en «Archivados».' });
      } catch (e) { console.error('[archivar] contacto', e); showToast({ kind: 'error', title: 'No se pudo archivar', body: 'Necesitas perfil Administrador. Revisa también la conexión.' }); }
    }
  });
}

function archivarEmpresaModal(empId) {
  const em = BD_EMPRESAS_BYID[empId];
  showModal({
    title: 'Archivar empresa',
    body: '¿Archivar a <b>' + escapeHtml((em && (em.nombreFantasia || em.nombre)) || empId) + '</b>?<br><br>Desaparece de la Base de Datos (no se elimina) y queda en <b>Archivados</b> por si la necesitas de vuelta. No afecta gastos ni proyectos históricos.',
    confirmLabel: 'Archivar', cancelLabel: 'Cancelar', danger: true,
    onConfirm: async function () {
      try {
        const r = await sb.rpc('archivar_empresa', { p_id: empId });
        if (r.error) throw r.error;
        delete BD_EMPRESAS_BYID[empId]; syncLegacyFromContactos(); markDirty();
        closeModal();
        if (STATE.currentModule === 'bd-personas') renderBDPersonas();
        showToast({ kind: 'success', title: 'Empresa archivada', body: 'Se quitó de la BD. Recuperable en «Archivados».' });
      } catch (e) { console.error('[archivar] empresa', e); showToast({ kind: 'error', title: 'No se pudo archivar', body: 'Necesitas perfil Administrador. Revisa también la conexión.' }); }
    }
  });
}

function archivarLocacionModal(locId) {
  const l = bdLocFind(locId);
  showModal({
    title: 'Archivar locación',
    body: '¿Archivar <b>' + escapeHtml((l && l.nombre) || locId) + '</b>?<br><br>Desaparece de la Base de Datos (no se elimina) y queda en <b>Archivados</b> por si la necesitas de vuelta. No afecta proyectos históricos.',
    confirmLabel: 'Archivar', cancelLabel: 'Cancelar', danger: true,
    onConfirm: async function () {
      try {
        const r = await sb.rpc('archivar_locacion', { p_loc_id: locId });
        if (r.error) throw r.error;
        const i = BD_LOC.findIndex(x => x.locId === locId); if (i >= 0) BD_LOC.splice(i, 1);
        markDirty(); closeModal();
        if (STATE.currentModule === 'bd-personas') renderBDPersonas();
        showToast({ kind: 'success', title: 'Locación archivada', body: 'Se quitó de la BD. Recuperable en «Archivados».' });
      } catch (e) { console.error('[archivar] locacion', e); showToast({ kind: 'error', title: 'No se pudo archivar', body: 'Necesitas perfil Administrador. Revisa también la conexión.' }); }
    }
  });
}

async function dalCargarArchivadosBD() {
  if (!sb) return { contactos: [], empresas: [], locaciones: [] };
  try {
    const [cR, eR, lR] = await Promise.all([
      sb.from('contacts').select('id,nombre,email,telefono').eq('organization_id', ORG_ID).not('deleted_at', 'is', null),
      sb.from('companies').select('id,nombre_fantasia,rut').eq('organization_id', ORG_ID).not('deleted_at', 'is', null),
      sb.from('locations').select('loc_id,nombre,comuna').eq('organization_id', ORG_ID).not('deleted_at', 'is', null)
    ]);
    return { contactos: (cR && cR.data) || [], empresas: (eR && eR.data) || [], locaciones: (lR && lR.data) || [] };
  } catch (e) { console.error('[archivados] no se pudieron cargar', e); return { contactos: [], empresas: [], locaciones: [] }; }
}

async function openArchivadosBD() {
  const a = await dalCargarArchivadosBD();
  const total = a.contactos.length + a.empresas.length + a.locaciones.length;
  if (total === 0) {
    showModal({ title: 'Sin archivados', body: 'No hay personas, empresas ni locaciones archivadas.', confirmLabel: 'Cerrar', cancelLabel: '', onConfirm: function () {} });
    return;
  }
  const fila = function (titulo, sub, fn, arg) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--rule);">' +
      '<div style="min-width:0;"><div style="font-weight:600;">' + escapeHtml(titulo) + '</div>' + (sub ? '<div style="font-size:11px;color:var(--ink-muted);">' + escapeHtml(sub) + '</div>' : '') + '</div>' +
      '<button class="btn btn-secondary btn-sm" ' + accionHTML('bd.restaurarArch', fn, String(arg)) + '>Restaurar</button></div>';
  };
  const seccion = function (label, filas) { return filas.length ? '<div style="margin-bottom:14px;"><h4 style="margin:0 0 6px;font-size:12px;color:var(--ink-secondary);text-transform:uppercase;letter-spacing:.04em;">' + label + ' (' + filas.length + ')</h4>' + filas.join('') + '</div>' : ''; };
  const body =
    seccion('Personas', a.contactos.map(function (c) { return fila(c.nombre || c.id, [c.email, c.telefono].filter(Boolean).join(' · '), 'restaurarContactoBD', c.id); })) +
    seccion('Empresas', a.empresas.map(function (e) { return fila(e.nombre_fantasia || e.id, e.rut || '', 'restaurarEmpresaBD', e.id); })) +
    seccion('Locaciones', a.locaciones.map(function (l) { return fila(l.nombre || l.loc_id, l.comuna || '', 'restaurarLocacionBD', l.loc_id); }));
  document.getElementById('modalRoot').innerHTML =
    '<div class="modal-backdrop" data-accion="ui.backdrop"><div class="modal" style="max-width:600px;">' +
    '<div class="modal-header"><div class="modal-title">Archivados</div><div style="font-size:12px;color:var(--ink-muted);margin-top:4px;">Personas, empresas y locaciones archivadas. Se conservan hasta que las restaures.</div></div>' +
    '<div class="modal-body" style="max-height:60vh;overflow:auto;">' + body + '</div>' +
    '<div class="modal-footer"><button class="btn" data-accion="ui.cerrar">Cerrar</button></div></div></div>';
}

async function restaurarContactoBD(id) {
  try { const r = await sb.rpc('restaurar_contacto', { p_id: id }); if (r.error) throw r.error;
    await dalBootContactos(); showToast({ kind: 'success', title: 'Persona restaurada', body: 'Volvió a la Base de Datos.' }); openArchivadosBD();
  } catch (e) { console.error('[restaurar] contacto', e); showToast({ kind: 'error', title: 'No se pudo restaurar', body: 'Necesitas perfil Administrador. Revisa la conexión.' }); }
}
async function restaurarEmpresaBD(id) {
  try { const r = await sb.rpc('restaurar_empresa', { p_id: id }); if (r.error) throw r.error;
    await dalBootContactos(); showToast({ kind: 'success', title: 'Empresa restaurada', body: 'Volvió a la Base de Datos.' }); openArchivadosBD();
  } catch (e) { console.error('[restaurar] empresa', e); showToast({ kind: 'error', title: 'No se pudo restaurar', body: 'Necesitas perfil Administrador. Revisa la conexión.' }); }
}
async function restaurarLocacionBD(locId) {
  try { const r = await sb.rpc('restaurar_locacion', { p_loc_id: locId }); if (r.error) throw r.error;
    await dalBootLocaciones(); if (STATE.currentModule === 'bd-personas') renderBDPersonas(); showToast({ kind: 'success', title: 'Locación restaurada', body: 'Volvió a la Base de Datos.' }); openArchivadosBD();
  } catch (e) { console.error('[restaurar] locacion', e); showToast({ kind: 'error', title: 'No se pudo restaurar', body: 'Necesitas perfil Administrador. Revisa la conexión.' }); }
}

/* ─── BD PERSONAS GLOBAL (acceso desde topbar) ─────────────────────── */
/* V5.1.1: rediseñado. Antes movíamos #moduleMain entre vistas creando
   dos elementos con el mismo ID. Ahora #bdGlobalMain es un container
   DEDICADO que vive separado en el DOM desde el inicio. */
export function openGlobalBDPersonas() {
  STATE.currentView = 'bd-global';
  STATE.currentProject = null;
  STATE.currentModule = 'bd-personas';

  document.getElementById('controlRoomView').classList.add('hidden');
  document.getElementById('projectView').classList.add('hidden');
  document.getElementById('bdGlobalView').classList.remove('hidden');
  // V5.1.1: vaciar container de proyecto para evitar IDs duplicados
  const mm = document.getElementById('moduleMain'); if (mm) mm.innerHTML = '';

  document.getElementById('breadcrumb').innerHTML = `
    <span class="breadcrumb-link" data-accion="kanban.controlRoom">Control Room</span>
    <span class="breadcrumb-sep">›</span>
    <span class="breadcrumb-current">Base de Datos de Personas</span>
  `;

  renderModule('bd-personas');
  _lastViewSave();   // V11.15.0 · FRENTE B
  window.scrollTo(0, 0);
}

/* ─── INGRESO MANUAL DE EMERGENCIA EN BD ───────────────────────────── */

/* ════════════════════════════════════════════════════════════════════
   V8.1 (#6 y #7) · FORMULARIO COMPLETO DE PERSONAS (CREAR / EDITAR)
   ════════════════════════════════════════════════════════════════════
   Cubre TODO el esquema canónico de un contacto (identidad, roles,
   empresa, ubicación, datos de pago y perfil de talento). Escribe al
   modelo canónico BD_CONTACTOS y re-sincroniza las proyecciones.
   - Crear: botón "+ Nueva persona".
   - Editar: botón ✎ de la ficha, SOLO con Modo Administrador activo (#7).
   ════════════════════════════════════════════════════════════════════ */
const PF_ROLES = ['Crew', 'Interno', 'Talento', 'Contacto cliente', 'Proveedor individual'];

/* Wrapper de compatibilidad: el botón "+ Nueva persona" sigue llamando esto. */
function openAddPersonaQuick() { openPersonaForm('create', null); }
/* V8.2 (#2): desde Crew, las advertencias "Sin BD"/"Agregar a BD" abren el
   formulario de Nueva persona con el nombre ya rellenado. */
export function crewAddToBD(nombre) { openPersonaForm('create', null); const el = document.getElementById('pf_nombre'); if (el) { el.value = nombre || ''; el.focus(); } }

/* V10.5.1: editar fichas de BD requiere permiso de módulo BD en nivel E
   (Administrador, Ejecutivo, Producción, Asistencia, Coordinación). Reemplaza el
   antiguo gate de Modo Administrador: el sistema de permisos formal ya está activo. */
function requestEditPersona(contactId) {
  if (authNivel('bd') !== 'E') {
    showModal({
      title: 'Sin permiso para editar fichas',
      body: 'Modificar un registro de la Base de Datos requiere permiso de edición en el módulo BD. Tu perfil puede consultarlo, pero no editarlo.',
      confirmLabel: 'Entendido',
      cancelLabel: null
    });
    return;
  }
  openPersonaForm('edit', contactId);
}

function _pfField(label, id, value, opts) {
  opts = opts || {};
  const ph = opts.placeholder ? ` placeholder="${escapeHtml(opts.placeholder)}"` : '';
  const span = opts.span ? ` style="grid-column: span ${opts.span};"` : '';
  const type = opts.type || 'text';
  return `<div class="field"${span}>
    <label class="field-label">${escapeHtml(label)}</label>
    <input class="input" type="${type}" id="${id}" value="${escapeHtml(value || '')}"${ph}>
  </div>`;
}
function _pfHeader(t) {
  return `<div style="grid-column: 1 / -1; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-secondary); font-weight: 700; border-bottom: 1px solid var(--rule); padding-bottom: 4px; margin-top: 6px;">${escapeHtml(t)}</div>`;
}

function openPersonaForm(mode, contactId) {
  const isEdit = mode === 'edit';
  const src = (isEdit && BD_CONTACTOS[contactId]) ? BD_CONTACTOS[contactId] : {};
  const roles = Array.isArray(src.roles) && src.roles.length ? src.roles : (isEdit ? [] : ['Crew']);
  const pago = src.perfilPago || {};
  const tal = src.perfilTalento || {};

  const empNameInit = Object.keys(BD_EMPRESAS).find(n => BD_EMPRESAS[n]._id === src.empresaId) || '';

  const rolesHTML = PF_ROLES.map(r => `
    <label style="display: inline-flex; align-items: center; gap: 5px; margin-right: 16px; font-size: 13px; white-space: nowrap;">
      <input type="checkbox" class="pf-role" value="${escapeHtml(r)}" ${roles.indexOf(r) !== -1 ? 'checked' : ''} ${r === 'Talento' ? 'data-accion="bd.pfTalento" data-on="change"' : (r === 'Crew' ? 'data-accion="bd.pfCrew" data-on="change"' : '')}> ${escapeHtml(r)}
    </label>`).join('');

  const dteHTML = `<select class="select" id="pf_dte">
    <option value="">—</option>
    ${DTE_OPTIONS.map(o => `<option value="${o.value}" ${pago.dteHabitual === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
  </select>`;

  const talHidden = roles.indexOf('Talento') !== -1 ? '' : 'display: none;';
  const crewHidden = roles.indexOf('Crew') !== -1 ? '' : 'display: none;';

  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" data-accion="ui.backdrop">
      <div class="modal" style="max-width: 640px;">
        <div class="modal-header">
          <div class="modal-title">${isEdit ? 'Editar persona' : 'Nueva persona'}</div>
          <div style="font-size: 12px; color: var(--ink-muted); margin-top: 4px;">${isEdit ? 'Editas el registro de la Base de Datos. Los cambios se reflejan en todos los proyectos que lo usan.' : 'Ficha completa. Solo el nombre es obligatorio; el resto puedes completarlo cuando lo tengas.'}</div>
        </div>
        <div class="modal-body" style="max-height: 68vh; overflow: auto;">
          <div class="form-grid cols-2">
            ${_pfHeader('Identidad')}
            <div style="grid-column:1/-1;border:1px solid var(--accent);border-radius:10px;padding:12px 14px;background:var(--bg-card);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
              <div style="font-size:12.5px;color:var(--ink-secondary);line-height:1.5;"><strong>¿Prefieres que la persona ingrese sus propios datos?</strong><br>Invítala con un link: crea su cuenta, llena su perfil una sola vez y autoriza compartirlo contigo (Ley 21.719).</div>
              <button class="btn btn-primary btn-sm" data-accion="bd.invitarLink">Invitar con link</button>
            </div>
            ${_pfField('Nombre completo *', 'pf_nombre', src.nombre, { placeholder: 'Nombre y apellido', span: 2 })}
            ${_pfField('RUT', 'pf_rut', src.rut, { placeholder: '12.345.678-9' })}
            ${_pfField('Teléfono', 'pf_tel', src.telefono, { placeholder: '+56 9 …' })}
            ${_pfField('Email *', 'pf_email', src.email, { placeholder: 'correo@dominio.cl', type: 'email', span: 2 })}

            ${_pfHeader('Clasificación')}
            <div class="field" style="grid-column: 1 / -1;">
              <label class="field-label">Roles</label>
              <div style="display: flex; flex-wrap: wrap; gap: 4px 0; padding: 4px 0;">${rolesHTML}</div>
            </div>
            <div id="pf_crew_section" style="${crewHidden} grid-column: 1 / -1;">
              <div class="form-grid cols-2">
                ${_pfField('Rol habitual', 'pf_rolHabitual', src.rolHabitual, { placeholder: 'Ej: Gaffer, Directora de Arte…' })}
                <div class="field">
                  <label class="field-label">DTE habitual</label>
                  ${dteHTML}
                </div>
              </div>
            </div>

            ${_pfHeader('Empresa')}
            <div class="field">
              <label class="field-label">Empresa asociada</label>
              <span class="combobox-wrap cbx-anchored" style="display:block;">
                <input class="input combobox-input" id="pf_empresa" value="${escapeHtml(empNameInit)}" placeholder="Buscar empresa en la BD…" autocomplete="off" data-accion="bd.pfEmpresa" data-on="focus input blur">
                <div class="combobox-dropdown" hidden></div>
              </span>
            </div>
            ${_pfField('Relación con la empresa', 'pf_relacionEmpresa', src.relacionEmpresa, { placeholder: 'Ej: Contacto, Empleado, Proveedor' })}

            ${_pfHeader('Ubicación')}
            ${_pfField('Dirección', 'pf_direccion', src.direccion, { placeholder: 'Calle y número', span: 2 })}
            ${_pfField('Dirección (línea 2)', 'pf_direccionLinea2', src.direccionLinea2, { placeholder: 'Depto, block, referencia', span: 2 })}
            ${_pfField('Comuna', 'pf_comuna', src.comuna)}
            ${_pfField('Ciudad', 'pf_ciudad', src.ciudad)}
            <div class="field" style="grid-column: 1 / -1;">
              <label class="field-label">Región</label>
              ${regionSelectHTML(src.region, { id: 'pf_region' })}
            </div>

            ${_pfHeader('Otros datos')}
            ${_pfField('Restricción alimentaria', 'pf_restriccion', src.restriccion, { placeholder: 'Ninguna / Vegetariano / Sin gluten…' })}
            <div class="field">
              <label class="field-label">Fecha de nacimiento <span class="tt" data-tip="Fecha completa o nada. El saludo de cumpleaños usa el día y el mes.">?</span></label>
              <input class="input" type="date" id="pf_fechaNac" value="${_toISODate(src.fechaNacimiento || '')}">
            </div>
            <div class="field" style="grid-column: 1 / -1;">
              <label class="field-label">Notas</label>
              <textarea class="input" id="pf_notas" rows="2" style="width: 100%; resize: vertical;" placeholder="Notas internas">${escapeHtml(src.notas || '')}</textarea>
            </div>

            ${_pfHeader('Datos de pago')}
            <div class="field" style="grid-column: 1 / -1;">
              <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
                <input type="checkbox" id="pf_cuentaExtranjera" ${pago.cuentaExtranjera ? 'checked' : ''} data-accion="bd.pfExtranjera" data-on="change"> Cuenta extranjera / otro medio (texto libre)
              </label>
            </div>
            <div id="pf_pago_chile" style="${pago.cuentaExtranjera ? 'display: none;' : ''} grid-column: 1 / -1;">
              <div class="form-grid cols-2">
                <div class="field">
                  <label class="field-label">Banco</label>
                  ${bancoSelectHTML(pago.banco, { id: 'pf_banco', accion: accionHTML('bd.pfBanco', { on: 'change' }) })}
                </div>
                <div class="field">
                  <label class="field-label">Código banco (SBIF) <span class="tt" data-tip="Se completa automáticamente según el banco. No es editable.">?</span></label>
                  <input class="input" id="pf_codigoBanco" value="${escapeHtml(pago.codigoBanco || '')}" readonly style="background: var(--bg-surface-soft); color: var(--ink-mut);">
                </div>
                <div class="field"><label class="field-label">Tipo de cuenta</label>${tipoCuentaSelectHTML(pago.tipoCuenta, { id: 'pf_tipoCuenta' })}</div>
                ${_pfField('N° de cuenta', 'pf_nCuenta', pago.nCuenta, { placeholder: 'Número de cuenta' })}
              </div>
            </div>
            <div id="pf_pago_ext" style="${pago.cuentaExtranjera ? '' : 'display: none;'} grid-column: 1 / -1;">
              <div class="field">
                <label class="field-label">Datos de la cuenta extranjera / otro medio</label>
                <textarea class="input" id="pf_datosExtranjeros" rows="3" style="width: 100%; resize: vertical;" placeholder="Ej: Global66, IBAN/SWIFT, cuenta bancaria extranjera con código SIF, efectivo, etc.">${escapeHtml(pago.datosExtranjeros || '')}</textarea>
              </div>
            </div>

            <div id="pf_talento_section" style="${talHidden} grid-column: 1 / -1;">
              <div class="form-grid cols-2">
                ${_pfHeader('Perfil de talento')}
                ${_pfField('Género', 'pf_genero', tal.genero)}
                <div class="field">
                  <label class="field-label">Fecha de nacimiento</label>
                  <input class="input" type="date" id="pf_fechaNacimiento" value="${_toISODate(tal.fechaNacimiento || '')}">
                </div>
                ${_pfField('Altura', 'pf_altura', tal.altura, { placeholder: 'Ej: 1,75 m' })}
                ${_pfField('Apariencia étnica', 'pf_apariencia', tal.apariencia)}
                ${_pfField('Áreas de interés / habilidad', 'pf_areas', tal.areas, { span: 2 })}
                ${_pfField('Talla polera', 'pf_tallaPolera', tal.tallaPolera)}
                ${_pfField('Talla pantalón', 'pf_tallaPantalon', tal.tallaPantalon)}
                ${_pfField('Talla calzado', 'pf_tallaCalzado', tal.tallaCalzado)}
                ${_pfField('Fotos (link)', 'pf_fotosLink', tal.fotosLink, { placeholder: 'Drive / Dropbox', span: 2 })}
                ${_pfField('Reel (link)', 'pf_reelLink', tal.reelLink, { placeholder: 'Vimeo / YouTube', span: 2 })}
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          ${isEdit && _bdPuedeArchivar() ? `<button class="btn btn-ghost btn-sm" style="color:var(--accent-deep);margin-right:auto;" ${accionHTML('bd.archivarContacto', contactId)}>Archivar</button>` : ''}
          <button class="btn" data-accion="ui.cerrar">Cancelar</button>
          <button class="btn btn-primary" ${accionHTML('bd.guardarPersona', mode, isEdit ? contactId : null)}>${isEdit ? 'Guardar cambios' : 'Crear persona'}</button>
        </div>
      </div>
    </div>
  `;
  setTimeout(() => { const n = document.getElementById('pf_nombre'); if (n && !isEdit) n.focus(); }, 50);
}

function togglePfTalento() {
  const talentoCb = Array.from(document.querySelectorAll('.pf-role')).find(c => c.value === 'Talento');
  const sec = document.getElementById('pf_talento_section');
  if (sec) sec.style.display = (talentoCb && talentoCb.checked) ? '' : 'none';
}

function submitPersonaForm(mode, contactId) {
  const isEdit = mode === 'edit';
  const val = id => (document.getElementById(id) || {}).value || '';
  const nombre = val('pf_nombre').trim();
  if (!nombre) {
    showToast({ kind: 'warning', title: 'Falta el nombre', body: 'El nombre completo es obligatorio.' });
    return;
  }
  // El mínimo para guardar una persona es nombre + correo: sin correo no se puede
  // invitar ni asignarla bien a un cargo (quedaría el correo del cargo en blanco).
  if (!val('pf_email').trim()) {
    showToast({ kind: 'warning', title: 'Falta el correo', body: 'El correo es obligatorio para guardar a una persona (se usa para invitaciones y para asignarla a un cargo).' });
    return;
  }
  // En creación, evitamos un duplicado exacto de nombre (las proyecciones
  // de la UI son por nombre). En edición se permite mantener/cambiar el nombre.
  if (!isEdit && BD_PERSONAS[nombre]) {
    showToast({ kind: 'warning', title: 'Persona ya existe', body: `${nombre} ya está en la BD. Ábrela y usa el botón Editar (con Modo administrador) para modificarla.` });
    return;
  }

  const roles = Array.from(document.querySelectorAll('.pf-role')).filter(c => c.checked).map(c => c.value);
  if (!roles.length) roles.push('Crew');
  const dte = val('pf_dte');

  const cuentaExt = !!(document.getElementById('pf_cuentaExtranjera') && document.getElementById('pf_cuentaExtranjera').checked);
  const perfilPago = _buildPerfilPago({
    banco: cuentaExt ? '' : val('pf_banco').trim(),
    codigoBanco: cuentaExt ? '' : val('pf_codigoBanco').trim(),
    tipoCuenta: cuentaExt ? '' : val('pf_tipoCuenta').trim(),
    nCuenta: cuentaExt ? '' : val('pf_nCuenta').trim(),
    tipoDTE: dte ? (DTE_LABEL[dte] || dte) : '',
    dteHabitual: dte || null,
    cuentaExtranjera: cuentaExt,
    datosExtranjeros: cuentaExt ? val('pf_datosExtranjeros').trim() : ''
  });

  let perfilTalento = null;
  if (roles.indexOf('Talento') !== -1) {
    perfilTalento = _buildPerfilTalento({
      genero: val('pf_genero').trim(), fechaNacimiento: val('pf_fechaNacimiento').trim(), altura: val('pf_altura').trim(),
      apariencia: val('pf_apariencia').trim(), areas: val('pf_areas').trim(),
      tallaPolera: val('pf_tallaPolera').trim(), tallaPantalon: val('pf_tallaPantalon').trim(),
      tallaCalzado: val('pf_tallaCalzado').trim(), fotosLink: val('pf_fotosLink').trim(), reelLink: val('pf_reelLink').trim()
    });
  }

  const base = {
    nombre: nombre,
    rut: val('pf_rut').trim(),
    email: val('pf_email').trim(),
    telefono: val('pf_tel').trim(),
    roles: roles,
    rolHabitual: val('pf_rolHabitual').trim(),
    empresaId: (BD_EMPRESAS[val('pf_empresa').trim()] || {})._id || '',
    relacionEmpresa: val('pf_relacionEmpresa').trim(),
    direccion: val('pf_direccion').trim(),
    direccionLinea2: val('pf_direccionLinea2').trim(),
    comuna: val('pf_comuna').trim(),
    ciudad: val('pf_ciudad').trim(),
    region: val('pf_region').trim(),
    restriccion: val('pf_restriccion').trim() || 'Ninguna',
    fechaNacimiento: val('pf_fechaNac').trim(),
    notas: val('pf_notas').trim(),
    perfilPago: perfilPago,
    perfilTalento: perfilTalento
  };

  if (isEdit && BD_CONTACTOS[contactId]) {
    base.id = contactId;
    base.esSocio = BD_CONTACTOS[contactId].esSocio || false;            // V9.1.3: facetas persona↔empresa se conservan (aún sin UI)
    base.esRepresentante = BD_CONTACTOS[contactId].esRepresentante || false;
    BD_CONTACTOS[contactId] = base;
  } else {
    const _id = _genId('ctk', BD_CONTACTOS);
    base.id = _id;
    BD_CONTACTOS[_id] = base;
  }
  syncLegacyFromContactos();
  autosaveNow();
  dalGuardarContacto(base);   // V9.1.1: sincroniza el contacto a Supabase (fuente de verdad)
  closeModal();
  STATE.ui.bdExpanded = nombre;
  showToast({
    kind: 'success',
    title: isEdit ? 'Persona actualizada' : 'Persona agregada',
    body: `${nombre} ${isEdit ? 'fue actualizada' : 'fue ingresada'} en la base de datos.`
  });
  if (STATE.currentModule === 'bd-personas') {
    renderBDPersonas();
  } else if (STATE.currentModule) {
    renderModule(STATE.currentModule);   // p.ej. si se agregó desde Cargos, refresca para que reaparezca "Cambiar" con el correo listo
  }
}

// ── Window bridges BD ──────────────────────────────────────────────

window.restaurarContactoBD    = restaurarContactoBD;
window.restaurarEmpresaBD     = restaurarEmpresaBD;
window.restaurarLocacionBD    = restaurarLocacionBD;

window.crewAddToBD            = crewAddToBD;   // presupuesto-cotizacion.js y comboboxAddToBD (index) la llaman

window.openPersonaForm        = openPersonaForm;

// D2 · acciones delegadas
registrarAcciones('bd', {
  tab: function (a) { STATE.ui.bdTab = a[0]; renderBDPersonas(); },
  buscar: function (a, el) { STATE.ui.bdSearch = el.value; renderBDListByTab(); },
  exportar: function () { gancho('exportBDExcelV71')(); },
  plantilla: function () { gancho('downloadBDPlantilla')(); },
  importar: function () { gancho('triggerBDExcelImport')(); },
  archivados: function () { openArchivadosBD(); },
  linkInv: function () { gancho('_invAbrirDatos')(); },
  importFile: function (a, el) { gancho('importBDExcelV71')(el); },
  nuevaPersona: function () { openAddPersonaQuick(); },
  nuevaEmpresa: function () { openAddEmpresaQuick(); },
  nuevoTalento: function () { openAddTalentoQuick(); },
  nuevaLoc: function () { openBDLocAdd(); },
  verLoc: function (a) { openLocDetail(a[0]); },
  crearLoc: function () { saveBDLocAdd(); },
  verEmp: function (a) { openEmpresaProfile(a[0]); },
  editEmp: function (a) { openEmpresaEdit(a[0]); },
  editTalento: function (a) { bdTalentoEditar(a[0]); },
  empUnlink: function (a) { empresaUnlinkContacto(a[0], a[1]); },
  empRel: function (a, el) { empresaSetContactoRel(a[0], el.value); },
  empSet: function (a, el) { empresaSet(a[0], a[1], el.value); },
  duenoCombo: function (a, el, ev) {
    if (ev.type === 'focus') comboboxOpen(el);
    else if (ev.type === 'input') comboboxFilter(el);
    else if (ev.type === 'blur') comboboxCloseDelayed(el);
    else empresaSetDuenoField(a[0], a[1], 'nombre', el.value);
  },
  dueno: function (a, el) { empresaSetDuenoField(a[0], a[1], a[2], el.value); },
  duenoQuitar: function (a) { empresaRemoveDueno(a[0], a[1]); },
  duenoAdd: function (a) { empresaAddDueno(a[0]); },
  repCombo: function (a, el, ev) {
    if (ev.type === 'focus') comboboxOpen(el);
    else if (ev.type === 'input') comboboxFilter(el);
    else if (ev.type === 'blur') comboboxCloseDelayed(el);
    else empresaSetSub(a[0], 'representante', 'nombre', el.value);
  },
  rep: function (a, el) { empresaSetSub(a[0], 'representante', a[1], el.value); },
  empAddContacto: function (a, el, ev) {
    if (ev.type === 'focus') comboboxOpen(el);
    else if (ev.type === 'input') comboboxFilter(el);
    else if (ev.type === 'blur') comboboxCloseDelayed(el);
    else empresaAddContacto(a[0], el.value);
  },
  archivarEmp: function (a) { archivarEmpresaModal(a[0]); },
  listo: function () { closeModal(); if (STATE.currentModule === 'bd-personas') renderBDPersonas(); else if (STATE.currentModule) renderModule(STATE.currentModule); },
  expandir: function (a) { togglePersonExpand(a[0]); },
  editPersona: function (a) { requestEditPersona(a[0]); },
  restaurarArch: function (a) { var f = { restaurarContactoBD: restaurarContactoBD, restaurarEmpresaBD: restaurarEmpresaBD, restaurarLocacionBD: restaurarLocacionBD }[a[0]]; if (f) f(a[1]); },
  pfTalento: function () { togglePfTalento(); },
  pfCrew: function () { togglePfCrew(); },
  invitarLink: function () { closeModal(); gancho('_invAbrirDatos')(); },
  pfEmpresa: function (a, el, ev) { if (ev.type === 'blur') comboboxCloseDelayed(el); else comboboxFilterEmpresas(el); },
  pfExtranjera: function () { togglePfExtranjera(); },
  pfBanco: function (a, el) { pfBancoChange(el.value); },
  archivarContacto: function (a) { archivarContactoModal(a[0]); },
  guardarPersona: function (a) { submitPersonaForm(a[0], a[1]); },
});

// D4b · ganchos definidos por este módulo (consumidos por módulos más tempranos)
define('crewAddToBD', crewAddToBD);
define('crearEmpresaYEditar', crearEmpresaYEditar);   // I1a · ficha inline de empresa desde Info Proyecto
define('openPersonaByName', openPersonaByName);
define('openPersonaForm', openPersonaForm);
define('renderBDPersonas', renderBDPersonas);

define('archivarLocacionModal', archivarLocacionModal);
