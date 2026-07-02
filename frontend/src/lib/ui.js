// UI compartida: renderPersonSelect, modales, tooltip global, combobox, tema — extraído de index.html (Etapa C5)

/* ─── PERSON SELECT (sustituye datalist+input bugeado) ──────────────
   Bug original: el datalist+input no permitía cambiar ni borrar a una
   persona ya seleccionada. UX rota.
   Solución: select nativo + botón "×" explícito. Más simple, sin bug. */

function renderPersonSelect(field, currentValue) {
  // V6.4 (Nota 1): mismo combobox de búsqueda incremental que la columna
  // Nombre del Presupuesto. El usuario hace click, escribe, y la lista se
  // acota dinámicamente. Reutiliza comboboxOpen/Filter/CloseDelayed.
  return `
    <div class="combobox-wrap person-combobox">
      <input class="input combobox-input" value="${escapeHtml(currentValue || '')}"
             placeholder="Escribe para buscar en la Base de Datos…" autocomplete="off"
             onfocus="comboboxOpen(this)"
             oninput="comboboxFilter(this); updateInfoField('${field}', this.value);"
             onblur="comboboxCloseDelayed(this)"
             onchange="updateInfoField('${field}', this.value);">
      <div class="combobox-dropdown" hidden></div>
    </div>
  `;
}

/* ─── TOAST SYSTEM ─────────────────────────────────────────────────── */

/* showToast + _toastId -> movidos a src/lib/helpers.js (Etapa 1); showToast expuesto en window vía src/main.js */

/* ─── MODAL SYSTEM ─────────────────────────────────────────────────── */

function showModal({ title, body, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false, onConfirm, onCancel }) {
  const root = document.getElementById('modalRoot');
  // V7.2: si cancelLabel viene null/vacío, no renderizamos el botón (antes mostraba "null" o un botón vacío)
  const cancelBtn = (cancelLabel != null && String(cancelLabel).trim() !== '')
    ? `<button class="btn" onclick="_modalCancel()">${cancelLabel}</button>`
    : '';
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal ${danger ? 'modal-danger' : ''}" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div class="modal-title">${title}</div>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-footer">
          ${cancelBtn}
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" onclick="_modalConfirm()" style="${danger ? 'background: var(--negative); color: #fff; border-color: var(--negative);' : ''}">${confirmLabel}</button>
        </div>
      </div>
    </div>
  `;
  window._modalOnConfirm = onConfirm || (() => {});
  window._modalOnCancel = onCancel || (() => {});
}

function _modalConfirm() {
  // V9.1.2: ejecutar el onConfirm ANTES de cerrar, para que pueda leer los <input> del modal.
  // Si devuelve false (validación fallida) el modal se mantiene abierto; y si el onConfirm
  // abrió otro modal encima, no lo borramos.
  const fn = window._modalOnConfirm;
  const root = document.getElementById('modalRoot');
  const before = root ? root.firstElementChild : null;
  const keepOpen = fn ? (fn() === false) : false;
  if (keepOpen) return;
  if (root && root.firstElementChild === before) root.innerHTML = '';
}

function _modalCancel() {
  const fn = window._modalOnCancel;
  closeModal();
  if (fn) fn();
}

function closeModal() {
  document.getElementById('modalRoot').innerHTML = '';
}

/* ════════════════════════════════════════════════════════════════════
   V5.2: TOOLTIP GLOBAL (delegado, position:fixed, z-index 9999)
   ════════════════════════════════════════════════════════════════════ */

let _activeTooltip = null;
let _tooltipHideTimer = null;

function showTooltip(triggerEl) {
  hideTooltip();
  clearTimeout(_tooltipHideTimer);
  const text = triggerEl.getAttribute('data-tip');
  if (!text) return;
  const tip = document.createElement('div');
  tip.className = 'tooltip-popover';
  tip.textContent = text;
  document.body.appendChild(tip);
  // Posicionar
  const rect = triggerEl.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let left = rect.left + rect.width / 2 - tw / 2;
  let top = rect.top - th - 10;
  let position = 'above';
  if (top < 10) {
    top = rect.bottom + 10;
    position = 'below';
  }
  if (left < 8) left = 8;
  if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
  tip.classList.add(position);
  requestAnimationFrame(() => tip.classList.add('visible'));
  _activeTooltip = tip;
}

function hideTooltip() {
  if (_activeTooltip) {
    _activeTooltip.remove();
    _activeTooltip = null;
  }
}

function setupTooltipListeners() {
  // Delegación: escucha mouseover/mouseout en body. Funciona aún con
  // contenido inyectado dinámicamente por innerHTML.
  document.body.addEventListener('mouseover', (e) => {
    const tip = e.target.closest?.('[data-tip]');
    if (tip) showTooltip(tip);
  });
  document.body.addEventListener('mouseout', (e) => {
    const tip = e.target.closest?.('[data-tip]');
    if (tip) {
      // Pequeño delay para evitar parpadeo entre triggers cercanos
      _tooltipHideTimer = setTimeout(hideTooltip, 50);
    }
  });
  // Ocultar al scrollear (la posición fija quedaría desfasada).
  // También cerrar comboboxes abiertos.
  window.addEventListener('scroll', (ev) => {
    hideTooltip();
    if (ev.target && ev.target.closest && ev.target.closest('.combobox-dropdown')) return;
    document.querySelectorAll('.combobox-dropdown:not([hidden])').forEach(d => { if (d.closest('.cbx-anchored')) return; d.hidden = true; });
  }, true);
}

/* ════════════════════════════════════════════════════════════════════
   V5.2: COMBOBOX PARA CAMPO NOMBRE EN PRESUPUESTO
   ════════════════════════════════════════════════════════════════════
   Patrón Google Sheets / Excel: input visible, dropdown filtrado al
   enfocar, click selecciona, escritura libre si no hay match.
   Reemplaza <input list="dl-personas"> que era frágil en algunos
   navegadores (Chrome a veces no permitía sobreescribir el valor).

   Uso:
   <div class="combobox-wrap">
     <input class="cell-input combobox-input"
            data-source="personas"
            value="..."
            onfocus="comboboxOpen(this)"
            oninput="comboboxFilter(this); ..."
            onblur="comboboxCloseDelayed(this)"
            onchange="...">
     <div class="combobox-dropdown" hidden></div>
   </div>
   ════════════════════════════════════════════════════════════════════ */

function comboboxAddToBD(btn) {
  const wrap = btn && btn.closest ? btn.closest('.combobox-wrap') : null;
  const inp = wrap ? wrap.querySelector('.combobox-input') : null;
  const nombre = inp ? (inp.value || '').trim() : '';
  if (typeof crewAddToBD === 'function') { crewAddToBD(nombre); }
  else if (typeof openPersonaForm === 'function') { openPersonaForm('create', null); setTimeout(function () { const el = document.getElementById('pf_nombre'); if (el) { el.value = nombre; el.focus(); } }, 30); }
}

/* V11.23 (Pasada 4.1) · Empresas como las personas: alta exprés solo con el
   nombre desde el combobox (Gastos→proveedor, Identidad→cliente). El rol sale
   del data-emp-rol del input. Si la empresa ya existe, NO se duplica: se le
   suma el rol que falta a su Tipo (p. ej. un Cliente pasa a "Cliente, Proveedor").
   Tras crear/actualizar, la deja seleccionada en el input. */
function _empTieneRol(tipo, rol) {
  if (!rol) return true;
  return String(tipo || '').toLowerCase().split(',').map(s => s.trim()).indexOf(String(rol).toLowerCase()) !== -1;
}
function _empAddRol(tipo, rolCap) {
  const roles = String(tipo || '').split(',').map(s => s.trim()).filter(Boolean);
  if (roles.map(s => s.toLowerCase()).indexOf(rolCap.toLowerCase()) !== -1) return tipo;
  roles.push(rolCap);
  const orden = ['cliente', 'proveedor', 'agencia'];
  roles.sort((a, b) => {
    const ia = orden.indexOf(a.toLowerCase()), ib = orden.indexOf(b.toLowerCase());
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return roles.join(', ');
}
function comboboxAddEmpresaToBD(btn) {
  const wrap = btn && btn.closest ? btn.closest('.combobox-wrap') : null;
  const inp = wrap ? wrap.querySelector('.combobox-input') : null;
  if (!inp) return;
  const rol = (inp.dataset.empRol || 'proveedor').trim().toLowerCase();
  const rolCap = rol.charAt(0).toUpperCase() + rol.slice(1);   // Proveedor | Cliente | Agencia
  const nombre = _normNameBD((inp.value || '').trim());
  if (!nombre) { showToast({ kind: 'error', title: 'Falta el nombre', body: 'Escribe el nombre de la empresa antes de agregarla.' }); return; }
  let eid;
  const existente = BD_EMPRESAS[nombre];
  if (existente && existente._id && BD_EMPRESAS_BYID[existente._id]) {
    // Ya existe: le sumamos el rol que falta, sin duplicar la empresa.
    eid = existente._id;
    const e = BD_EMPRESAS_BYID[eid];
    const nuevoTipo = _empAddRol(e.tipo, rolCap);
    if (nuevoTipo !== e.tipo) {
      e.tipo = nuevoTipo;
      syncLegacyFromContactos(); autosaveNow(); _dalEmpresaSaveSoon(eid);
      showToast({ kind: 'success', title: 'Empresa actualizada', body: `<strong>${escapeHtml(nombre)}</strong> ahora también es ${escapeHtml(rolCap)}.` });
    } else {
      showToast({ kind: 'info', title: 'Ya estaba en la BD', body: `<strong>${escapeHtml(nombre)}</strong> ya figura como ${escapeHtml(rolCap)}.` });
    }
  } else {
    // Empresa nueva: solo el nombre + el rol; lo demás se completa después en Empresas.
    eid = _genId('emp', BD_EMPRESAS_BYID);
    BD_EMPRESAS_BYID[eid] = {
      id: eid, nombreFantasia: nombre, rutEmpresa: '', razonSocial: '',
      tipo: rolCap, giroSII: '', giroInformal: '',
      contactoPrincipal: '', contactoPrincipalId: '', emailContacto: '', telefonoContacto: '', web: '', notas: ''
    };
    syncLegacyFromContactos(); autosaveNow(); dalGuardarEmpresa(BD_EMPRESAS_BYID[eid]);
    showToast({ kind: 'success', title: 'Empresa creada', body: `<strong>${escapeHtml(nombre)}</strong> agregada a la BD como ${escapeHtml(rolCap)}.` });
  }
  // Dejarla seleccionada en el input que disparó el alta.
  inp.value = BD_EMPRESAS_BYID[eid].nombreFantasia;
  if (dropdownDe(wrap)) dropdownDe(wrap).hidden = true;
  inp.dispatchEvent(new Event('change'));
}
function dropdownDe(wrap) { return wrap ? wrap.querySelector('.combobox-dropdown') : null; }
function comboboxOpen(inputEl) {
  comboboxFilter(inputEl);
}

function comboboxFilter(inputEl) {
  const wrap = inputEl.closest('.combobox-wrap');
  if (!wrap) return;
  const dropdown = wrap.querySelector('.combobox-dropdown');
  if (!dropdown) return;
  const q = _normKey(inputEl.value || '');  // V5.9 (Nota 3): sin tildes
  const personas = Object.keys(BD_PERSONAS).sort();
  // Si está vacío, mostrar todos. Si tipea, filtrar.
  const matched = q
    ? personas.filter(n => _normKey(n).includes(q) || _normKey(BD_PERSONAS[n].rolHabitual || '').includes(q))
    : personas;

  if (matched.length === 0) {
    dropdown.innerHTML = `<div class="combobox-empty"><button type="button" class="combobox-addbd" onmousedown="event.preventDefault()" onclick="comboboxAddToBD(this)">+ Agregar a la BD</button></div>`;
  } else {
    dropdown.innerHTML = matched.slice(0, 20).map(n => {
      const p = BD_PERSONAS[n];
      return `
        <div class="combobox-option" onmousedown="comboboxSelect(this, '${escapeHtml(n)}')">
          <div class="combobox-option-main">${escapeHtml(n)}</div>
          ${p.rolHabitual ? `<div class="combobox-option-meta">${escapeHtml(p.rolHabitual)}</div>` : ''}
        </div>
      `;
    }).join('') + (matched.length > 20 ? `<div class="combobox-more">+ ${matched.length - 20} más — sigue tipeando para filtrar</div>` : '');
  }
  dropdown.hidden = false;
  // V6.4 (Nota 2): al hacer mousedown dentro del dropdown que NO sea una opción
  // (p.ej. la barra de scroll o un área vacía), evitamos que el input pierda
  // foco — eso era lo que cerraba el popup al intentar hacer scroll.
  dropdown.onmousedown = function (e) { if (!e.target.closest('.combobox-option')) e.preventDefault(); };
  if (wrap.classList.contains('cbx-anchored')) { dropdown.style.left = ''; dropdown.style.top = ''; dropdown.style.width = ''; }
  else { positionComboboxDropdown(inputEl, dropdown); }
}

function positionComboboxDropdown(inputEl, dropdown) {
  // position:fixed + cálculo desde el rect del input para evitar clipping
  // por overflow de tablas o cualquier ancestor.
  const rect = inputEl.getBoundingClientRect();
  const dw = Math.max(rect.width, 220);
  let left = rect.left;
  let top = rect.bottom + 2;
  // Si no cabe abajo, abrir hacia arriba
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < 200) {
    top = rect.top - Math.min(240, dropdown.offsetHeight) - 4;
  }
  // Si no cabe a la derecha
  if (left + dw > window.innerWidth - 8) left = window.innerWidth - dw - 8;
  if (left < 8) left = 8;
  dropdown.style.left = left + 'px';
  dropdown.style.top = top + 'px';
  dropdown.style.width = dw + 'px';
}

function comboboxSelect(optEl, value) {
  // onmousedown se dispara ANTES de onblur, evitando que el dropdown se cierre primero
  const wrap = optEl.closest('.combobox-wrap');
  const input = wrap.querySelector('.combobox-input');
  const dropdown = wrap.querySelector('.combobox-dropdown');
  input.value = value;
  dropdown.hidden = true;
  // Disparar change para que el modelo se actualice
  input.dispatchEvent(new Event('change'));
}

// legalComboboxFilter → movido a src/modules/legal.js (Etapa A1)

/* ════════════════════════════════════════════════════════════════════════
   V7.13 · MÓDULO NOTIFICACIONES (rebuild) · Enviar · Programados · Historial · Plantillas
   Reusa el motor: notifRecipients, notifVarsFor, notifFill, getNotifConfig.
   Empresa/remitente/banco se leen de Configuración (EMPRESA_PERFIL).
   Editor con pills + preview en vivo. Envío real / persistencia override /
   adjuntos reales / ejecución de reglas → backend.
   ════════════════════════════════════════════════════════════════════════ */
/* NTF_LABELS, NTF_*_VARS, NTF_TPL_META, NTF_EXTRA_TPLS, ntfState, ntfEnsureSched,
   ntfTemplates, renderNotificaciones, ntfSend, ntfOpenFromHoja, y todas las ntf*
   → movidos a src/modules/notificaciones.js (Etapa 2) */
function comboboxCloseDelayed(inputEl) {
  // Delay para que onmousedown del option alcance a registrar
  setTimeout(() => {
    const wrap = inputEl.closest('.combobox-wrap');
    if (!wrap) return;
    const dropdown = wrap.querySelector('.combobox-dropdown');
    if (dropdown) dropdown.hidden = true;
  }, 180);
}

/* ═══ TEMA CLARO/OSCURO (V7.2) ═══════════════════════════════════════
   Persistido en localStorage. Por defecto: oscuro (la marca nació dark). */
const THEME_KEY = 'takeos_theme';
function getStoredTheme() {
  try { return window.localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { return 'dark'; }
}
function applyStoredTheme() {
  const theme = getStoredTheme();
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  updateThemeButton(theme);
}
function toggleTheme() {
  const next = getStoredTheme() === 'light' ? 'dark' : 'light';
  try { window.localStorage.setItem(THEME_KEY, next); } catch (e) {}
  applyStoredTheme();
  showToast({ kind: 'info', title: next === 'light' ? 'Modo claro activado' : 'Modo oscuro activado', body: 'Tu preferencia queda guardada en este navegador.' });
}
function updateThemeButton(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  // Sol cuando estás en oscuro (para pasar a claro); luna cuando estás en claro.
  if (theme === 'light') {
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Oscuro';
  } else {
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Claro';
  }
}

// ── Window bridges (3 barridos func+const) ──
window._empTieneRol = _empTieneRol;
window._modalCancel = _modalCancel;
window._modalConfirm = _modalConfirm;
window.applyStoredTheme = applyStoredTheme;
window.closeModal = closeModal;
window.comboboxAddEmpresaToBD = comboboxAddEmpresaToBD;
window.comboboxAddToBD = comboboxAddToBD;
window.comboboxCloseDelayed = comboboxCloseDelayed;
window.comboboxFilter = comboboxFilter;
window.comboboxOpen = comboboxOpen;
window.comboboxSelect = comboboxSelect;
window.getStoredTheme = getStoredTheme;
window.hideTooltip = hideTooltip;
window.positionComboboxDropdown = positionComboboxDropdown;
window.setupTooltipListeners = setupTooltipListeners;
window.showModal = showModal;
window.toggleTheme = toggleTheme;
window.updateThemeButton = updateThemeButton;

// ═══ Helpers de formularios BD + responsables por sección + confetti/slugify/demo (Etapa C6) ═══
function regionSelectHTML(current, opts) {
  opts = opts || {};
  /* V11.8.1 · si `current` matchea una región chilena ignorando may/acentos,
     usamos la forma canónica para que el <option> quede seleccionado. */
  let cur = current || '';
  try { const _c = (typeof _regionCanonica === 'function') ? _regionCanonica(cur) : null; if (_c) cur = _c; } catch (e) {}
  const inList = REGIONES_CHILE.indexOf(cur) !== -1;
  let o = '<option value=""' + (cur === '' ? ' selected' : '') + '>— Sin especificar</option>';
  if (cur && !inList) o += '<option value="' + escapeHtml(cur) + '" selected>' + escapeHtml(cur) + ' (texto)</option>';
  o += REGIONES_CHILE.map(r => '<option' + (cur === r ? ' selected' : '') + '>' + escapeHtml(r) + '</option>').join('');
  return '<select class="input"' + (opts.id ? ' id="' + opts.id + '"' : '') + (opts.onchange ? ' onchange="' + opts.onchange + '"' : '') + '>' + o + '</select>';
}

// BANCOS_CHILE → movido a src/lib/data.js (Etapa B3)
function bancoCodigo(nombre) { const b = BANCOS_CHILE.find(x => x.nombre === nombre); if (b) return b.codigo; return (typeof _codigoBancoSBIF === 'function') ? _codigoBancoSBIF(nombre) : ''; }
function bancoSelectHTML(current, opts) {
  opts = opts || {};
  const cur = current || '';
  const inList = BANCOS_CHILE.some(b => b.nombre === cur);
  let o = '<option value="">\u2014 Sin especificar</option>';
  if (cur && !inList) o += '<option value="' + escapeHtml(cur) + '" selected>' + escapeHtml(cur) + ' (texto)</option>';
  o += BANCOS_CHILE.map(b => '<option' + (cur === b.nombre ? ' selected' : '') + '>' + escapeHtml(b.nombre) + '</option>').join('');
  return '<select class="select"' + (opts.id ? ' id="' + opts.id + '"' : '') + (opts.onchange ? ' onchange="' + opts.onchange + '"' : '') + '>' + o + '</select>';
}
function pfBancoChange(nombre) { const cb = document.getElementById('pf_codigoBanco'); if (cb) cb.value = bancoCodigo(nombre); }

function _toISODate(v) {
  if (!v) return '';
  v = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}
function _edadDesde(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const b = new Date(iso + 'T00:00:00'); if (isNaN(b.getTime())) return '';
  const now = new Date(); let age = now.getFullYear() - b.getFullYear();
  const md = now.getMonth() - b.getMonth(); if (md < 0 || (md === 0 && now.getDate() < b.getDate())) age--;
  return (age >= 0 && age < 130) ? String(age) : '';
}

function togglePfCrew() {
  const cb = Array.from(document.querySelectorAll('.pf-role')).find(c => c.value === 'Crew');
  const sec = document.getElementById('pf_crew_section');
  if (sec) sec.style.display = (cb && cb.checked) ? '' : 'none';
}
function togglePfExtranjera() {
  const cb = document.getElementById('pf_cuentaExtranjera');
  const chile = document.getElementById('pf_pago_chile');
  const ext = document.getElementById('pf_pago_ext');
  const on = !!(cb && cb.checked);
  if (chile) chile.style.display = on ? 'none' : '';
  if (ext) ext.style.display = on ? '' : 'none';
}

function comboboxFilterEmpresas(inputEl) {
  const wrap = inputEl.closest('.combobox-wrap'); if (!wrap) return;
  const dropdown = wrap.querySelector('.combobox-dropdown'); if (!dropdown) return;
  // V11.23 (Pasada 4.1): el input puede declarar un rol (data-emp-rol = proveedor|
  // cliente|agencia) para filtrar las empresas por su Tipo, y data-emp-add="1" para
  // habilitar el alta exprés "+ Agregar…" (igual que el combobox de personas).
  // Sin esos atributos, comportamiento histórico: todas las empresas, sin alta.
  const rol = (inputEl.dataset.empRol || '').trim().toLowerCase();
  const puedeAgregar = inputEl.dataset.empAdd === '1';
  const q = _normKey(inputEl.value || '');
  let names = Object.keys(BD_EMPRESAS).sort();
  if (rol) names = names.filter(n => _empTieneRol(BD_EMPRESAS[n].tipo, rol));
  const matched = q ? names.filter(n => _normKey(n).includes(q)) : names;
  if (matched.length === 0) {
    if (puedeAgregar) {
      const lbl = rol === 'cliente' ? '+ Agregar empresa cliente a la BD'
                : rol === 'agencia' ? '+ Agregar agencia a la BD'
                : '+ Agregar empresa proveedora a la BD';
      dropdown.innerHTML = `<div class="combobox-empty"><button type="button" class="combobox-addbd" onmousedown="event.preventDefault()" onclick="comboboxAddEmpresaToBD(this)">${lbl}</button></div>`;
    } else {
      dropdown.innerHTML = '<div class="combobox-empty">Sin coincidencias en empresas.</div>';
    }
  } else {
    dropdown.innerHTML = matched.slice(0, 20).map(n => {
      const e = BD_EMPRESAS[n];
      return '<div class="combobox-option" onmousedown="comboboxSelect(this, \'' + escapeHtml(n) + '\')"><div class="combobox-option-main">' + escapeHtml(n) + '</div>' + (e.rutEmpresa ? '<div class="combobox-option-meta">' + escapeHtml(e.rutEmpresa) + '</div>' : '') + '</div>';
    }).join('') + (matched.length > 20 ? '<div class="combobox-more">+ ' + (matched.length - 20) + ' m\u00e1s \u2014 sigue tipeando</div>' : '');
  }
  dropdown.hidden = false;
  dropdown.onmousedown = function (e) { if (!e.target.closest('.combobox-option')) e.preventDefault(); };
  if (wrap.classList.contains('cbx-anchored')) { dropdown.style.left = ''; dropdown.style.top = ''; dropdown.style.width = ''; }
  else { positionComboboxDropdown(inputEl, dropdown); }
}

async function _locThumbAsync(locId, path) {
  try {
    if (!sb || !sb.storage) return;
    const { data, error } = await sb.storage.from('fotos-locaciones').createSignedUrl(path, 3600);
    if (error || !data || !data.signedUrl) return;
    const el = document.getElementById('locThumb_' + locId); if (!el) return;
    el.outerHTML = '<img src="' + safeUrl(data.signedUrl) + '" alt="">';
  } catch (e) {}
}
/* bdLocFind, projLocList, projLocFind, nextLocIdBD, locNombre, ensureLocShape, locPrimaryContact, locFullAddress, projLocConfirmadas → movido a src/modules/locaciones.js (Etapa 2) */

/* Migración V8.2: locaciones que vivían en hojaLlamado.locaciones (LOC-NN)
   pasan a BD_LOC (canónico) + project.data.locaciones (uso). Idempotente:
   se ejecuta al render y al cargar; conserva los LOC-NN existentes. */
/* V8.3.3 — anti-duplicados de locaciones por proyecto. Una misma locación debe
   existir una sola vez; su estado evoluciona sobre el mismo registro. Colapsa
   por locId y por nombre normalizado del registro BD subyacente, conservando el
   estado más avanzado (confirmada > candidata > descartada). No toca BD_LOC. */
const SECTION_RESP_DEFAULT = {
  'info-proyecto': 'PE', 'bd-personas': null, 'presupuesto': 'PE', 'cotizacion': 'PE',
  'crew': 'JP', 'documentos': null, 'rodajes': 'JP', 'locaciones': 'JP',
  'hoja-llamado': 'AD', 'plan-rodaje': 'AD', 'legal': 'JP', 'correos': 'JP', 'gastos': 'JP'
};
const RESP_ROLE_LABEL = { PE: 'Productor Ejecutivo', JP: 'Jefe de Producción', AD: 'Asistente de Dirección' };
function _projResp() { const p = STATE.currentProject; if (!p) return null; if (!p.data.responsables) p.data.responsables = {}; return p.data.responsables; }
function _respRoleField(role) { return role === 'PE' ? 'productorEjecutivo' : (role === 'JP' ? 'jefeProduccion' : ''); }
function sectionResponsableName(key) {
  const role = SECTION_RESP_DEFAULT[key];
  if (role === null || role === undefined) return null;
  const r = _projResp(); if (!r) return '';
  if (r[key] != null && String(r[key]).trim() !== '') return String(r[key]);
  const ip = (STATE.currentProject && STATE.currentProject.data.infoProyecto) || {};
  const fld = _respRoleField(role);
  return (fld && ip[fld]) ? String(ip[fld]) : '';
}
function setSectionResponsable(key, nombre) {
  if (!_puedeEditarResponsables()) return;   // V10.5.2: solo Administrador y Ejecutivo
  const r = _projResp(); if (!r) return;
  r[key] = (nombre || '').trim();
  markDirty();
  const box = document.getElementById('sectionRespBox');
  if (box) box.innerHTML = sectionResponsableInner(key);
}
// openPersonaByName → movido a src/modules/bd.js (Etapa A3)
function sectionResponsableInner(key) {
  const e = escapeHtml;
  const role = SECTION_RESP_DEFAULT[key];
  const name = sectionResponsableName(key);
  const roleLabel = RESP_ROLE_LABEL[role] || '';
  const p = (name && typeof BD_PERSONAS !== 'undefined') ? BD_PERSONAS[name] : null;
  let info = '';
  if (name) {
    const cargo = (p && p.rolHabitual) ? p.rolHabitual : roleLabel;
    const correo = p ? (p.email || p.mail || '') : '';
    const tel = p ? (p.telefono || '') : '';
    const meta = [cargo, correo, tel].filter(Boolean).map(e).join(' · ');
    info = '<button type="button" class="resp-card" onclick="openPersonaByName(\'' + e(name) + '\')" data-tip="Ver ficha en la Base de Datos">' + e(name) + (meta ? '<span class="resp-meta">' + meta + '</span>' : '') + '</button>';
  }
  // V10.5.2: editar responsables es exclusivo de Administrador y Ejecutivo.
  // El resto ve quién es el responsable, pero no el combobox para cambiarlo.
  if (!_puedeEditarResponsables()) {
    return info || '<span style="font-size:13px;color:var(--ink-faint);">Sin responsable asignado</span>';
  }
  return '<span class="resp-combo combobox-wrap cbx-anchored">' +
    '<input class="input combobox-input" value="' + e(name) + '" placeholder="' + e(roleLabel || 'Buscar en la Base de Datos…') + '" autocomplete="off" onfocus="comboboxOpen(this)" oninput="comboboxFilter(this)" onblur="comboboxCloseDelayed(this)" onchange="setSectionResponsable(\'' + key + '\', this.value)">' +
    '<div class="combobox-dropdown" hidden></div></span>' + info;
}
function sectionTareasBtnHTML(key) {
  if (!STATE.currentProject) return '';
  const n = sectionTaskCount(STATE.currentProject, key);
  return '<button type="button" class="module-tareas-btn" onclick="openTareasModal(\'' + key + '\')" data-tip="Tareas de esta sección — asigna trabajo a tu equipo"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>Tareas' + (n ? '<span class="module-tareas-badge">' + n + '</span>' : '') + '</button>';
}
function sectionResponsableHTML(key) {
  const m = MODULES[key];
  if (m && m.scope === 'project' && !STATE.currentProject) return '';
  if (!STATE.currentProject) return '';
  const role = SECTION_RESP_DEFAULT[key];
  const tareas = sectionTareasBtnHTML(key);
  if (role === null || role === undefined) return '<div class="module-resp">' + tareas + '</div>';
  return '<div class="module-resp"><span class="module-resp-label">Responsable</span><div id="sectionRespBox" class="module-resp-box">' + sectionResponsableInner(key) + '</div>' + tareas + '</div>';
}

// prDragStart, prDragEnd, prDragOver, prDragLeave, prDrop, prImgDragOver, prImgDragLeave, prDropImagen, prAddImagen, prAddImagenFiles, prDelImagen, prAddBanco, prDelBanco → movido a src/modules/plan-rodaje.js (Etapa A2)


// DISPATCHER: renderModule → movido a src/lib/nav.js (Etapa C5)

/* ════════════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════
   MÓDULO: BD PERSONAS (global, transversal a todos los proyectos)
   ════════════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════

   Vista: toolbar de búsqueda + lista de tarjetas (no tabla, porque las
   personas tienen varios campos y es más legible). Click en una tarjeta
   la expande mostrando todos los datos.

   No edita personas (eso vendría en V6 con formulario formal). Solo
   navega y muestra. La lectura de personas en otros módulos hace
   `BD_PERSONAS[nombre]` directamente.
   ════════════════════════════════════════════════════════════════════ */

// CHIPAX_LOGO, cfgSetUsaChipax, bdSetFormLink → movido a src/modules/config.js (Etapa A6)
// BD ADMIN: renderBD*, openBDLocAdd, saveBDLocAdd, bdTalentoEditar, openAdd*Quick, empresa*, openEmpresaEdit, openEmpresaProfile, renderBDPersonList, renderPersonRow, togglePersonExpand, debouncedBDRender → movido a src/modules/bd.js (Etapa A3)

// BD IMPORT/EXPORT XLSX: _normKey, _norm*BD, ensureXLSX, ensureExcelJS, BANCOS_SBIF, exportBDExcelV71, importBDExcelV71, downloadBDPlantilla, downloadBDTemplate, triggerBD*, importBDFromInput, processBDRows, showBDImportResult, buildPersonasDatalist → movido a src/modules/bd-excel.js (Etapa A3)

// INFO PROYECTO + GATE APROBACIÓN + PAPELERA: renderInfoProyecto, info*, update*, collectApprovalBlockers, dalCargarPapelera, openTrash, restoreFromTrash → movido a src/modules/info-proyecto.js (Etapa C2)

// ARCHIVAR/RESTAURAR BD: _bdPuedeArchivar, archivar*Modal, dalCargarArchivadosBD, openArchivadosBD, restaurar*BD → movido a src/modules/bd.js (Etapa A3)

/* V5.3 (Nota 2): activa/desactiva el modo administrador de sesión. */
// MODO ADMIN + ESTADO PROYECTO: _applyAdminUI, requestAdminPassword, _puedeModoAdmin, toggleAdminMode, stampApprovalDate, freezeAdminAndContingencias, updateProjectState, syncProjectStateUI → movido a src/modules/admin.js (Etapa C4)

/* ════════════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════
   MÓDULO: PRESUPUESTO  ← CORAZÓN DE LA CAPA 2
   ════════════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════

   Arquitectura:
   - renderPresupuesto() pinta el chasis: KPI bar, alerts panel, 4
     dept-sections (Servicios, Gastos, Equipos, Talentos).
   - renderServiciosDepts() pinta las sub-secciones de Servicios.
   - renderSimpleSection(key) pinta Gastos / Equipos / Talentos.
   - Cada fila tiene inputs con onchange que dispara:
       1) Actualiza el modelo en data.servicios[dept][idx] o data[key][idx]
       2) Llama recalcRowCost(rowEl, item)  ← solo esa fila
       3) Llama recalcSectionTotals(sectionEl, dept) ← solo ese depto
       4) Llama recalcKPIs() ← KPIs globales

   IMPORTANTE: NUNCA llamamos a renderPresupuesto() desde un onchange
   de input numérico. Eso era el bug del Enter en el V4: re-render
   completo perdía el estado de secciones colapsadas.

   Solo re-render completo:
   - Agregar fila (addRow)
   - Eliminar fila (deleteRow)
   - Cambio de estado del proyecto (entra/sale columna Costo Real)

   Y aún así, el estado de colapso se persiste en STATE.ui.collapsed,
   por lo que al re-renderizar, las secciones cerradas siguen cerradas.
   ════════════════════════════════════════════════════════════════════ */

/* V5.5 (Nota 1): alternar visibilidad del detalle cotizado en el Presupuesto. */
/* BLOQUE PRINCIPAL presupuesto+cotización: toggleBudgetCotizado → cotDesbloquearMisma → movido a src/modules/presupuesto-cotizacion.js (Etapa 2) */


/* ════════════════════════════════════════════════════════════════════
   V6.6 — MÓDULO NOTIFICACIONES (V1)
   Flujo: correos de Producción / DTE personalizados vía mail-merge.
   Arquitectura: el "Enviar" es semi-automático (CSV + complemento de Gmail).
   El módulo es agnóstico al canal: cuando exista backend, se reemplaza solo
   la capa de envío y el resto (plantillas, variables, destinatarios, log) queda.
   ════════════════════════════════════════════════════════════════════ */

/* NOTIF_CFG_KEY, notifDefaultTemplates, notifEmpresaDefault, notifLoadConfig,
   getNotifConfig, notifSaveConfig, ensureNotif, notifFill, notifRecipients,
   notifVarsFor, NOTIF_VAR_KEYS, notifHtmlToPlain, notifSetCfg, notifSetTpl,
   notifSelectedRecs, notifMarkSent, notifMarkAllSent, notifLogPush,
   notifCopyTemplate, notifGmailDraft, _dteWord, _fechaCorta
   → movidos a src/modules/notificaciones.js (Etapa 2) */

// MÓDULO DOCUMENTOS: DOC_CATEGORIES, ensureDocs, renderDocumentos, doc*, _docStoragePath, _uploadDocPDF, STORAGE_BUCKET_DOCS → movido a src/modules/documentos.js (Etapa C1)
// CARGOS: CARGOS_PRESETS/PERFILES, _puedeAsignarCargos, ensureCargos, _cargos*, renderCargos, cargo* → movido a src/modules/cargos.js (Etapa C3)

// CREW: renderCrew, renderCrewRow, renderCrewExternosSection, *CrewExterno, getCrewForExport, buildPrintDoc, exportCrewListPDF, exportCateringPDF, exportTransportePDF, doExportTransporte → movido a src/modules/crew.js (Etapa C2)

// HOJA DE LLAMADO: renderHojaLlamado, hl*, getConfirmedCrew, ensureHojaDia, nextLocId, buildHojaLlamadoPrintHTML, printViaIframe, hojaPreviewPDF, exportHojaLlamadoPDF, HL_DRAG, _hlPrevMargen → movido a src/modules/plan-rodaje.js (Etapa A2)
// PR PDF: _prPdfTimeCell, _prPdfContentCell, _prPdfRow, buildPlanRodajePrintHTML, exportPlanRodajePDF, _prExportConfirm, _prDoExportPDF, prSetOrientacion → movido a src/modules/plan-rodaje.js (Etapa A2)


/* ════════════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════
   V5.1 ADD-ONS: UI helpers + widgets nuevos
   ════════════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════ */

// renderPersonSelect, showModal, _modalConfirm, _modalCancel, closeModal → movido a src/lib/ui.js (Etapa C5)

// PANEL DE CONFIGURACIÓN: irAlPanelPersonal → movido a src/modules/config.js (Etapa A6)

// SWITCHER ESPACIO (topbar): _swData, _swToggle, _swCerrar, _swCargar, _swRender, _swPanel, _swControlRoom, _swProyecto → movido a src/modules/espacio.js (Etapa C4)
// RESPALDO SUPABASE: SUPA_BACKUP_TABLES, _supaDumpTable, exportSupabaseBackup → movido a src/modules/admin.js (Etapa C4)

/* V10.6.0 · Toggle de corte de doble escritura eliminado (ya no hay doble escritura). */

// BUSCADOR GLOBAL: GSEARCH_*, _gsNorm, _gsearchResults, globalSearchInput, globalSearchKey, _gsearchHide, _gsearchGo → movido a src/modules/buscador.js (Etapa A5)


// PERFIL DE PRODUCTORA: openEmpresaPerfil, saveEmpresaPerfil, _emp* (equipo/roles/invitaciones/logos/colores/tipos), _inv*, _orgLogos, orgLogo → movido a src/modules/config.js (Etapa A6)


/* ─── CONFETI ──────────────────────────────────────────────────────── */

function fireConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#8a6a3a', '#b89968', '#7a8a55', '#a87830', '#4a7a4a', '#c9a877'];
  const particles = [];
  for (let i = 0; i < 140; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height / 3,
      vx: (Math.random() - 0.5) * 18,
      vy: Math.random() * -16 - 4,
      g: 0.45 + Math.random() * 0.2,
      size: 6 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.3,
      life: 1
    });
  }
  let start = null;
  function step(ts) {
    if (!start) start = ts;
    const elapsed = ts - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g;
      p.rot += p.vrot;
      p.life = Math.max(0, 1 - elapsed / 2800);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    });
    if (elapsed < 3000) {
      requestAnimationFrame(step);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  requestAnimationFrame(step);
}

// CALCULADORAS: _calc* (ahora window), openCalculadoraTributaria, calcUpdate, _crc*, renderCostoRealCalc, he*/hec*/hep*, openHorasExtraCalc, openHeProyectoDefault → movido a src/modules/calculadoras.js (Etapa C1)

// BD PERSONAS GLOBAL: openGlobalBDPersonas, PF_ROLES, openAddPersonaQuick, crewAddToBD, requestEditPersona, openPersonaForm, togglePfTalento, submitPersonaForm → movido a src/modules/bd.js (Etapa A3)

/* ─── SLUGIFY (deuda V5.0 → resuelta) ───────────────────────────────
   IDs HTML con tildes y espacios eran frágiles. Esta función genera
   slugs limpios para usar como sufijos de id/data-attributes. Se mantiene
   el texto original con tildes para la UI visible. */
function slugify(str) {
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quita diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/* ════════════════════════════════════════════════════════════════════
   FILTROS Y BÚSQUEDA
   ════════════════════════════════════════════════════════════════════
   Capa 1: estructura visual lista, lógica pendiente para Capa 2.
   ════════════════════════════════════════════════════════════════════ */
document.querySelectorAll('.filter-chips .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    STATE.currentFilter = chip.dataset.filter;
    // TODO V5.2: aplicar filtro real al kanban
  });
});

document.querySelectorAll('.view-toggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-toggle button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    STATE.currentViewMode = btn.dataset.view;
    // TODO V5.2: cambiar a vista lista cuando aplique
  });
});

// listener placeholder de #globalSearch eliminado (auditoría pre-B): el buscador real vive en src/modules/buscador.js

/* ════════════════════════════════════════════════════════════════════
   ACCIONES PLACEHOLDER
   ════════════════════════════════════════════════════════════════════ */
/* V5.6 (Nota 3): creación real de proyecto. Modal con campos mínimos
   (cliente, nombre, PE). Usa un draft en memoria porque showModal cierra
   el modal antes de ejecutar onConfirm (los inputs del DOM ya no existen). */
/* newProject -> movido a src/modules/kanban.js (Etapa 2) */

/* V5.6 (Nota 3): carga los proyectos de ejemplo a demanda. */
function loadDemoData() {
  showModal({
    danger: PROJECTS.length > 0,
    title: 'Cargar datos de ejemplo',
    body: `Esto carga ${DEMO_PROJECTS.length} proyectos de ejemplo (Watt's, Falabella, Merrell) para explorar el sistema con datos realistas.${PROJECTS.length > 0 ? '<br><br><strong>Reemplazará los proyectos actuales.</strong> Lo que no hayas exportado con “Guardar” se perderá.' : ''}<br><br>¿Continuar?`,
    confirmLabel: 'Cargar ejemplos',
    cancelLabel: 'Cancelar',
    onConfirm: () => {
      PROJECTS.length = 0;
      JSON.parse(JSON.stringify(DEMO_PROJECTS)).forEach(p => PROJECTS.push(p));
      STATE.currentProject = null;
      navigateToControlRoom();
      renderMetrics();
      renderKanban();
      markDirty();
      showToast({ kind: 'success', title: 'Ejemplos cargados', body: `${DEMO_PROJECTS.length} proyectos de ejemplo en el Control Room.` });
    },
    onCancel: () => {}
  });
}

// TOOLTIP GLOBAL: _activeTooltip, showTooltip, hideTooltip, setupTooltipListeners → movido a src/lib/ui.js (Etapa C5)

// COMBOBOX: comboboxAddToBD, _empTieneRol, _empAddRol, comboboxAddEmpresaToBD, dropdownDe, comboboxOpen, comboboxFilter, positionComboboxDropdown, comboboxSelect, comboboxCloseDelayed → movido a src/lib/ui.js (Etapa C5)

/* ════════════════════════════════════════════════════════════════════
   V5.2: HANDLERS UNIDAD CUSTOM (fix Otra…)
   ════════════════════════════════════════════════════════════════════
   Antes: seleccionar "Otra…" no permitía escribir. La celda no se
   re-renderizaba al input editable.
   Ahora: al seleccionar Otra…, la celda se transforma inmediatamente
   en input de texto con foco automático.
   ════════════════════════════════════════════════════════════════════ */

/* onUnidadSelectChange, onUnidadInputChange, onUnidadReset
   → movidos a src/modules/presupuesto-cotizacion.js (Etapa 2) */

/* renderUnidadCellSelect, renderUnidadCellInput → movidos a src/modules/presupuesto-cotizacion.js (Etapa 2) */

// PERSISTENCIA LOCAL: SAVE_FORMAT_VERSION, LS_KEY, buildSaveObject, applyLoadedState, exportSave, importSaveFromInput, snapshots (pushSnapshot, openSnapshotsModal...), exportSingleProject, importSingleProjectFromInput, autosaveNow, markDirty, clearDirty, undoLast, redoLast → movido a src/modules/persistencia-local.js (Etapa B2)

/* ════════════════════════════════════════════════════════════════════
   V6.10 — CAPA DE NUBE (histórica)
   Esta capa fue la sincronización en la nube original. Quedó retirada: la
   persistencia es 100% Supabase. Se conserva el contexto para referencia. Si la nube no
   carga o no está configurado, TakeOS sigue funcionando en modo local
   (localStorage) — FAIL-SAFE, nunca se rompe.

   v1 deliberadamente simple: estado completo en un solo documento
   (last-write-wins). Si dos personas editan EL MISMO instante, gana el
   último. Para equipo chico que se coordina, es seguro. El guardado por
   proyecto es la siguiente iteración, una vez validada la sincronización.
   ════════════════════════════════════════════════════════════════════ */

/* ── V10.6.0 · Capa de nube anterior retirada del cliente ────────────────
   La sincronización en la nube original quedó retirada por completo: no se
   carga ningún SDK, no hay credenciales en el código y no se lee ni escribe en
   esa nube. Supabase es la única fuente de datos. Los datos en el servicio
   anterior quedan intactos como respaldo externo hasta que se decida borrarlos
   por separado, fuera de esta app. */

/* ── Supabase (V8.6: login real + base de datos PostgreSQL) ───────────
   La publishable key es SEGURA de exponer aquí porque el RLS protege los
   datos: sin sesión válida, no se ve nada. La URL también es pública.
   Lo único secreto (email/contraseña) lo escribe el usuario en el login;
   nunca vive en este archivo. */
/* V11.2.1 · señal de regreso fresco del OAuth. Se captura al cargar la
   página, ANTES de que el cliente de Supabase procese y limpie la URL.
   Es la única vía por la que una sesión puede entrar sin pasar por el
   botón de login: porque la autenticación acaba de ocurrir. */

// ── Bridges C6 (barrido final) ──
window.THEME_KEY = THEME_KEY;
window._edadDesde = _edadDesde;
window._locThumbAsync = _locThumbAsync;
window._toISODate = _toISODate;
window.bancoCodigo = bancoCodigo;
window.bancoSelectHTML = bancoSelectHTML;
window.comboboxFilterEmpresas = comboboxFilterEmpresas;
window.fireConfetti = fireConfetti;
window.loadDemoData = loadDemoData;
window.pfBancoChange = pfBancoChange;
window.regionSelectHTML = regionSelectHTML;
window.sectionResponsableHTML = sectionResponsableHTML;
window.setSectionResponsable = setSectionResponsable;
window.slugify = slugify;
window.togglePfCrew = togglePfCrew;
window.togglePfExtranjera = togglePfExtranjera;
