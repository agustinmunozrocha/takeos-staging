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
