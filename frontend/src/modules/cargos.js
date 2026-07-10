// Cargos del proyecto (asignación, perfiles, tope de colaboradores) — extraído de index.html (Etapa C3)

// D1b · imports reales. VETADOS (línea roja #1): ORG_ID, PROJECTS_SOURCE,
// _TOPE_COLAB/_TOPE_COLAB_ORG (dal los escribe en window — lección #6),
// TAKEOS_PERFIL (dal lo reasigna). Ciclo cargos⇄dal: esta mitad ya es import;
// dal consume _cargosKey/_cargosDerivarRECI/_cargoContactIdPorNombre vía
// window hasta su tranche — bridges :405-420 INTOCABLES.
import { escapeHtml, showToast } from '../lib/helpers.js';
import { sb } from '../lib/supabase.js';
import { STATE, BD_CONTACTOS, BD_PERSONAS, ORG_ID, PROJECTS_SOURCE, TAKEOS_PERFIL, _TOPE_COLAB, _TOPE_COLAB_ORG } from '../lib/state.js';
import { closeModal, comboboxCloseDelayed, comboboxSelect } from '../lib/ui.js';
import { _normKey } from './bd-excel.js';
import { openEmpresaPerfil, _empShowSub, _empPerfilesOrg } from './config.js';
import { dalCargarCargos, dalGuardarCargos, dalCargarTopeColaboradores } from './dal.js';
import { markDirty } from './persistencia-local.js';
import { renderInfoProyecto } from './info-proyecto.js';
import { invitacionLink, dalInvitar, _invMostrarResultado, PERFIL_CODIGO_POR_NOMBRE } from './invitaciones.js';
import { _planModalVenta, manejarErrorPlan } from './plan-limites.js';

import { registrarAcciones, accionHTML } from '../lib/delegacion.js';
import { define, gancho } from '../lib/ganchos.js';
/* ════════════════════════════════════════════════════════════════════
   V11.2.0 · CARGOS DEL PROYECTO
   ════════════════════════════════════════════════════════════════════
   Capa de asignación sobre el Crew: define quién ocupa cada cargo del
   proyecto, si es interno o externo y con qué perfil de acceso.

   PERSISTENCIA PROVISIONAL: el RPC guardar_proyecto tiene un payload
   cerrado y no acepta claves nuevas, así que los cargos se guardan en
   localStorage por organización + proyecto hasta que el BD Expert
   extienda el modelo (handoff enviado). La invitación real a externos
   (correo + consentir_invitacion) está pendiente de Auth y Legal: aquí
   el externo queda registrado como «Invitación pendiente» sin envío. */
const CARGOS_PRESETS = ['Director/a', 'Productor/a Ejecutivo/a', 'Jefe/a de Producción', 'Director/a de Fotografía', 'Asistente de Dirección', 'Asistente de Producción', 'Director/a de Arte'];
/* V11.6.0 · Finanzas no se asigna por cargo de proyecto: queda reservado a
   la configuración de la empresa (Equipo). */
const CARGOS_PERFILES_INTERNO = ['Administrador', 'Ejecutivo', 'Producción', 'Asistencia de Producción', 'Coordinación', 'Creativo', 'Invitado'];
const CARGOS_PERFILES_EXTERNO = ['Producción', 'Asistencia de Producción', 'Coordinación', 'Creativo', 'Invitado'];   // Administrador y Finanzas no se ofrecen a externos
let _CARGO_EDIT = null;

function _puedeAsignarCargos() {
  if (!TAKEOS_PERFIL) return true;   // fail-open coherente con Gate B
  return TAKEOS_PERFIL.codigo === 1 || TAKEOS_PERFIL.codigo === 2;
}
function _cargosKey(project) { return 'takeos_cargos_' + ORG_ID + '_' + project.id; }
function ensureCargos(project) {
  if (!Array.isArray(project.data.cargos)) project.data.cargos = [];
  return project.data.cargos;
}
/* V11.3.0 · persistencia real en project_cargos (handoff BD resuelto).
   Lectura: select directo con RLS. Escritura: RPC guardar_cargos (estado
   completo). Migración one-shot: si la tabla está vacía y el localStorage
   provisional de V11.2 tiene cargos, se suben y la clave local se borra. */
// DAL CARGOS: dalCargarCargos → movido a src/modules/dal.js (Etapa B1)
function _cargoContactIdPorNombre(nombre) {
  try {
    const n = String(nombre || '').trim(); if (!n) return null;
    const ids = Object.keys(BD_CONTACTOS);
    for (let i = 0; i < ids.length; i++) { const c = BD_CONTACTOS[ids[i]]; if (c && c.nombre === n) return ids[i]; }
  } catch (e) {}
  return null;
}
// DAL CARGOS: dalGuardarCargos, dalCargarTopeColaboradores → movido a src/modules/dal.js (Etapa B1); _TOPE_COLAB* ahora en window (lib/state.js)
/* V11.4.0 · espejo RECI: los cargos PE / Director / JP alimentan los campos
   históricos de Info Proyecto (de los que se nutren hoja de llamado, plan de
   rodaje, gastos, exports). Fuente única = Cargos; ip.* es proyección. Si un
   cargo no está asignado, NO se borra el valor previo (registro anterior). */
function _cargosDerivarRECI(project) {
  try {
    const ip = project && project.data ? project.data.infoProyecto : null; if (!ip) return;
    const cargos = (project.data.cargos || []).filter(function (c) { return (c.personaNombre || '').trim(); });
    const buscar = function (rx) { const c = cargos.find(function (c) { return rx.test(c.cargo || ''); }); return c ? c.personaNombre.trim() : null; };
    const pe = buscar(/productor(\/a)?\s+ejecutiv/i);
    const dir = buscar(/^\s*director(\/a)?\s*$/i);
    const jp = buscar(/jefe(\/a)?\s+de\s+producci/i);
    let cambio = false;
    if (pe && ip.productorEjecutivo !== pe) { ip.productorEjecutivo = pe; cambio = true; }
    if (dir && ip.director !== dir) { ip.director = dir; cambio = true; }
    if (jp && ip.jefeProduccion !== jp) { ip.jefeProduccion = jp; cambio = true; }
    if (cambio) { markDirty(); try { if (STATE.currentModule === 'info-proyecto') renderInfoProyecto(); } catch (e) {} }
  } catch (e) {}
}
function _cargosSave(project) {
  markDirty();
  _cargosDerivarRECI(project);
  dalGuardarCargos(project);
}
function _cargoPill(txt, tone) {
  const map = {
    ok:   'color:var(--positive);background:var(--positive-bg);border:1px solid var(--positive);',
    pend: 'color:var(--warning);background:var(--warning-bg);border:1px solid var(--warning);',
    no:   'color:var(--negative);background:var(--negative-bg);border:1px solid var(--negative);',
    int:  'color:var(--ink-secondary);border:1px solid var(--rule);',
    ext:  'color:var(--accent);border:1px solid var(--accent);'
  };
  return '<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;' + (map[tone] || map.int) + '">' + escapeHtml(txt) + '</span>';
}
function renderCargos() {
  const project = STATE.currentProject;
  if (!project) return;
  const content = document.getElementById('moduleContent');
  if (!content) return;
  if (!project.data._cargosOK && PROJECTS_SOURCE === 'supabase' && sb) {
    content.innerHTML = '<p style="color:var(--ink-faint);font-size:13px;padding:18px 4px;">Cargando cargos…</p>';
    dalCargarCargos(project).then(function () { if (STATE.currentModule === 'cargos') renderCargos(); });
    return;
  }
  const cargos = ensureCargos(project);
  const puede = _puedeAsignarCargos();
  // tope de colaboradores por proyecto (carga diferida + cache) — handoff PR #2
  if (_TOPE_COLAB == null || _TOPE_COLAB_ORG !== ORG_ID) {
    dalCargarTopeColaboradores().then(function (t) { if (t != null && STATE.currentModule === 'cargos') renderCargos(); });
  }
  const _topeColab = (_TOPE_COLAB != null && _TOPE_COLAB_ORG === ORG_ID) ? _TOPE_COLAB : null;
  const _nColab = cargos.length;
  const _enTope = (_topeColab != null && _nColab >= _topeColab);
  const _contadorColab = _topeColab != null
    ? '<span style="font-size:12px;font-weight:600;color:' + (_enTope ? '#A71E26' : 'var(--ink-faint)') + ';" title="Colaboradores de este proyecto (las personas en Cargos) contra el tope de tu plan.">' + _nColab + ' / ' + _topeColab + ' colaboradores</span>'
    : '<span style="font-size:12px;color:var(--ink-faint);">' + _nColab + (_nColab === 1 ? ' colaborador' : ' colaboradores') + '</span>';
  const th = (t) => '<th style="text-align:left;padding:8px 10px;border-bottom:1px solid var(--rule);color:var(--ink-faint);font-size:11px;text-transform:uppercase;letter-spacing:.05em;">' + t + '</th>';
  const td = (h) => '<td style="padding:9px 10px;border-bottom:1px solid var(--rule);font-size:13px;">' + h + '</td>';
  let rows = '';
  cargos.forEach(function (c) {
    const sinPersona = !(c.personaNombre || '').trim();
    const enBD = !!(BD_PERSONAS[c.personaNombre] && BD_PERSONAS[c.personaNombre].mail && BD_PERSONAS[c.personaNombre].telefono);
    const estLabel = sinPersona ? '—' : (c.estado === 'activo' ? 'Activo' : (c.estado === 'pendiente' ? 'Invitación pendiente' : (c.estado === 'rechazo' ? 'Rechazó' : (c.estado || '—'))));
    const estTone = c.estado === 'activo' ? 'ok' : (c.estado === 'pendiente' ? 'pend' : (c.estado === 'rechazo' ? 'no' : 'int'));
    // "Cambiar" solo si el slot está sin persona o la persona ya está en la BD.
    // Si está asignada pero NO en la BD, el único camino es "Agregar a la BD"
    // (columna Estado); "Quitar" se mantiene para poder soltar el slot.
    const _mostrarEditar = sinPersona || enBD;
    const acciones = puede
      ? ((_mostrarEditar ? '<button class="btn btn-ghost btn-sm" ' + accionHTML('cargo.editar', c.id) + '>' + (sinPersona ? 'Asignar' : (c.estado === 'rechazo' ? 'Reasignar' : 'Cambiar')) + '</button> ' : '')
        + '<button class="btn btn-ghost btn-sm" ' + accionHTML('cargo.quitar', c.id) + ' title="Eliminar este cargo del proyecto">Quitar</button>')
      : '';
    rows += '<tr>'
      + td('<strong>' + escapeHtml(c.cargo || '—') + '</strong>' + (c.custom ? ' <span style="color:var(--ink-faint);font-size:11px;">(personalizado)</span>' : ''))
      + td(sinPersona ? '<span style="color:var(--ink-faint);">— Sin asignar —</span>' : escapeHtml(c.personaNombre))
      + td(sinPersona ? '—' : _cargoPill(c.tipo === 'externo' ? 'Externo' : 'Interno', c.tipo === 'externo' ? 'ext' : 'int'))
      + td(sinPersona ? '—' : escapeHtml(c.perfil || '—'))
      + td(sinPersona ? '—' : (!enBD
          ? '<button class="btn btn-ghost btn-sm" style="color:var(--warning);" ' + accionHTML('cargo.agregarBD', c.personaNombre) + ' title="Para tener un cargo, la persona debe estar en la BD con mail y teléfono.">Agregar a la BD</button>'
          : (c.estado === 'pendiente'
              ? '<a style="cursor:pointer;text-decoration:none;" title="Copiar el link de invitación de esta persona" ' + accionHTML('cargo.copiarInv', c.id) + '>' + _cargoPill(estLabel + ' ⧉', estTone) + '</a>'
              : _cargoPill(estLabel, estTone))))
      + '<td style="padding:9px 10px;border-bottom:1px solid var(--rule);text-align:right;white-space:nowrap;">' + acciones + '</td>'
      + '</tr>';
  });
  content.innerHTML = ''
    + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap;">'
    +   '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' + _cargoPill('● interno', 'int') + ' ' + _cargoPill('● externo', 'ext') + ' ' + _contadorColab + '</div>'
    +   (puede ? '<button class="btn btn-primary btn-sm" data-accion="cargo.abrir">+ Asignar un cargo</button>' : '<span style="font-size:12px;color:var(--ink-faint);">Asignar cargos es facultad de Administrador y Ejecutivo.</span>')
    + '</div>'
    + '<div style="border:1px solid var(--rule);border-radius:10px;overflow:hidden;background:var(--bg-card);">'
    +   '<table style="width:100%;border-collapse:collapse;">'
    +     '<thead><tr>' + th('Cargo') + th('Persona') + th('Tipo') + th('Perfil de acceso') + th('Estado') + '<th></th></tr></thead>'
    +     '<tbody>' + (rows || '<tr><td colspan="6" style="padding:22px;text-align:center;color:var(--ink-faint);font-size:13px;">Aún no hay cargos asignados en este proyecto.</td></tr>') + '</tbody>'
    +   '</table>'
    + '</div>'
    + '<p style="margin:12px 0 0;font-size:12px;color:var(--ink-faint);line-height:1.55;">Asignar un cargo a alguien de tu equipo solo registra el rol que cumple en esta producción. Asignárselo a un externo con su correo genera la invitación (con consentimiento Ley 21.719): la pastilla «Invitación pendiente» copia el link al hacer click. La tabla logística del crew se sigue alimentando sola desde el Presupuesto; los cargos son la capa de arriba.</p>'
    + '<p style="margin:6px 0 0;font-size:11.5px;color:var(--ink-faint);">Los cargos se sincronizan con la base (tabla project_cargos). Asignar un cargo externo con correo genera la invitación con su link.</p>';
}
function _cargoOpcionesPerfil(tipo, sel) {
  const lista = tipo === 'externo' ? CARGOS_PERFILES_EXTERNO : CARGOS_PERFILES_INTERNO;
  return lista.map(function (p) { return '<option' + (p === sel ? ' selected' : '') + '>' + escapeHtml(p) + '</option>'; }).join('');
}
/* V11.3.1 · click en la pastilla «Invitación pendiente» = copiar su link.
   El token vive en org_invitations (SELECT de miembros); se busca por cargo. */
async function cargoCopiarInvitacion(cargoId) {
  try {
    const r = await sb.from('org_invitations').select('id')
      .eq('cargo_id', cargoId).eq('estado', 'pendiente')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1);
    if (r.error) throw r.error;
    const inv = (r.data && r.data[0]) || null;
    if (!inv) { showToast({ kind: 'info', title: 'Sin invitación activa', body: 'Este cargo no tiene una invitación vigente. Usa «Cambiar» y agrega su correo para generar una.' }); return; }
    const link = invitacionLink(inv.id);
    try { await navigator.clipboard.writeText(link); showToast({ kind: 'success', title: 'Link copiado', body: link }); }
    catch (e) { window.prompt('Copia el link de invitación:', link); }
  } catch (e) {
    showToast({ kind: 'error', title: 'No se pudo obtener el link', body: (e && e.message) ? String(e.message) : 'Reintenta.', duration: 7000 });
  }
}
function _cargoTipoChanged(v) {
  const ew = document.getElementById('cg_emailWrap'); if (ew) ew.style.display = v === 'externo' ? 'block' : 'none';
  const pin = document.getElementById('cg_persona'); if (pin && !pin.matches(':focus')) { /* el filtro se rehace al enfocar */ }
  const ps = document.getElementById('cg_perfil'); if (ps) _cargoPerfilChecklist(ps.value);
  const sel = document.getElementById('cg_perfil');
  if (sel) sel.innerHTML = _cargoOpcionesPerfil(v, v === 'externo' ? 'Creativo' : 'Producción');
  const hint = document.getElementById('cg_tipoHint');
  if (hint) hint.textContent = v === 'externo'
    ? 'Externo: queda como «Invitación pendiente». Administrador y Finanzas no se ofrecen a externos.'
    : 'Interno: ya tiene acceso por su membresía; aquí solo registras el cargo que cumple en este proyecto.';
}
function _cargoSelChanged(v) {
  const otro = document.getElementById('cg_otro');
  if (otro) otro.style.display = v === '__otro' ? '' : 'none';
}
function cargoAbrirModal(editId) {
  const project = STATE.currentProject; if (!project) return;
  if (!_puedeAsignarCargos()) { showToast({ kind: 'warning', title: 'Sin permiso', body: 'Asignar cargos es facultad de Administrador y Ejecutivo.' }); return; }
  const cargos = ensureCargos(project);
  const edit = editId ? cargos.find(function (c) { return c.id === editId; }) : null;
  // bloqueo proactivo del tope por proyecto (solo al AGREGAR, no al editar) — handoff PR #2
  if (!edit && _TOPE_COLAB != null && _TOPE_COLAB_ORG === ORG_ID && cargos.length >= _TOPE_COLAB) {
    _planModalVenta('Tope de colaboradores de tu plan', 'Este proyecto ya tiene ' + cargos.length + ' personas en Cargos, el máximo de tu plan. Quita a alguien de Cargos para liberar un cupo, o cambia de plan para subir el tope.');
    return;
  }
  _CARGO_EDIT = edit ? edit.id : null;
  const esPreset = edit && CARGOS_PRESETS.indexOf(edit.cargo) >= 0;
  const selCargoVal = edit ? (esPreset ? edit.cargo : '__otro') : '';
  let optsCargo = CARGOS_PRESETS.map(function (p) { return '<option' + (p === selCargoVal ? ' selected' : '') + '>' + escapeHtml(p) + '</option>'; }).join('');
  optsCargo += '<option value="__otro"' + (selCargoVal === '__otro' ? ' selected' : '') + '>Otro (especificar)…</option>';
  let optsCargo2 = '<option value="">— Sin rol secundario</option>' + CARGOS_PRESETS.map(function (p) { return '<option>' + escapeHtml(p) + '</option>'; }).join('') + '<option value="__otro">Otro (especificar)…</option>';
  const tipo = edit ? (edit.tipo || 'interno') : 'interno';
  /* V11.5.0: el backdrop ya no cierra el modal (se perdía lo escrito con un
     click accidental); solo Cancelar o guardar. */
  document.getElementById('modalRoot').innerHTML = '<div class="modal-backdrop"><div class="modal" style="max-width:560px;">'
    + '<div class="modal-header"><div class="modal-title">' + (edit ? 'Editar cargo' : 'Asignar un cargo') + '</div></div>'
    + '<div class="modal-body">'
    /* V11.4.0 · Tipo va PRIMERO: determina qué personas se ofrecen abajo. */
    +   '<div class="emp-field" style="margin-bottom:12px;"><label>Tipo</label><select class="select" id="cg_tipo" data-accion="cargo.tipo" data-on="change">'
    +     '<option value="interno"' + (tipo !== 'externo' ? ' selected' : '') + '>Interno (de mi equipo)</option>'
    +     '<option value="externo"' + (tipo === 'externo' ? ' selected' : '') + '>Externo (freelance / invitado)</option>'
    +   '</select><div id="cg_tipoHint" style="font-size:11.5px;color:var(--ink-faint);margin-top:5px;line-height:1.5;"></div></div>'
    +   '<div class="emp-field" style="margin-bottom:12px;"><label>Cargo</label><select class="select" id="cg_cargo" data-accion="cargo.sel" data-on="change">' + optsCargo + '</select>'
    +     '<input class="input" id="cg_otro" placeholder="Escribe el cargo (ej. Gaffer, Sonidista, Entrevistador)" style="display:' + (selCargoVal === '__otro' ? 'block' : 'none') + ';margin-top:8px;" value="' + (edit && !esPreset ? escapeHtml(edit.cargo || '') : '') + '">'
    +     (edit ? '' : '<button class="btn btn-ghost btn-sm" id="cg_addRol2" style="margin-top:8px;" data-accion="cargo.rol2">+ Agregar rol secundario</button>'
    +       '<div id="cg_rol2Wrap" style="display:none;margin-top:8px;"><label style="font-size:11.5px;color:var(--ink-faint);">Rol secundario (misma persona, mismo perfil)</label>'
    +         '<select class="select" id="cg_cargo2" data-accion="cargo.otro2" data-on="change">' + optsCargo2 + '</select>'
    +         '<input class="input" id="cg_otro2" placeholder="Escribe el rol secundario" style="display:none;margin-top:8px;"></div>')
    +   '</div>'
    +   '<div class="emp-field" style="margin-bottom:12px;"><label>Persona</label>'
    +     '<span class="combobox-wrap cbx-anchored" style="display:block;">'
    +       '<input class="input combobox-input" id="cg_persona" placeholder="Escribe para buscar…" autocomplete="off" value="' + (edit ? escapeHtml(edit.personaNombre || '') : '') + '"'
    +         ' data-accion="cargo.persona" data-on="focus input blur change">'
    +       '<div class="combobox-dropdown" hidden></div>'
    +     '</span></div>'
    +   '<div class="emp-field" style="margin-bottom:12px;"><label>Perfil de acceso</label><select class="select" id="cg_perfil" data-accion="cargo.perfil" data-on="change">' + _cargoOpcionesPerfil(tipo, edit ? edit.perfil : 'Producción') + '</select>'
    +     '<div id="cg_permGlosario" style="font-size:11px;color:var(--ink-faint);margin-top:8px;line-height:1.5;"><strong>E</strong> = puede editar · <strong>L</strong> = solo lectura · <strong>—</strong> = oculto</div>'
    +     '<div id="cg_permList" style="margin-top:6px;border:1px solid var(--rule);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--ink-secondary);max-height:170px;overflow-y:auto;">Cargando permisos…</div></div>'
    +   '<div class="emp-field" id="cg_emailWrap" style="display:' + (tipo === 'externo' ? 'block' : 'none') + ';"><label>Correo del externo (para invitarle a colaborar)</label><input class="input" id="cg_email" type="email" placeholder="persona@correo.cl"><span class="hint" style="font-size:11.5px;color:var(--ink-faint);">Opcional. Si lo ingresas, se genera la invitación a este cargo con link copiable.</span></div>'
    + '</div>'
    + '<div class="modal-footer"><button class="btn" data-accion="ui.cerrar">Cancelar</button><button class="btn btn-primary" data-accion="cargo.guardar">' + (edit ? 'Guardar cambios' : 'Asignar') + '</button></div>'
    + '</div></div>';
  _cargoTipoChanged(document.getElementById('cg_tipo').value);
  if (edit && edit.perfil) { const s = document.getElementById('cg_perfil'); if (s) s.value = edit.perfil; }
  _cargoPerfilChecklist((document.getElementById('cg_perfil') || {}).value || '');
  _cargoCargarInternos();
}
/* V11.4.0 · combobox estándar del modal de cargos. Interno: SOLO las personas
   del equipo interno de la productora (membresías activas), con acceso directo
   a invitar si falta alguien. Externo: toda la BD de contactos. */
let _CARGO_INTERNOS = null;
async function _cargoCargarInternos() {
  if (_CARGO_INTERNOS) return _CARGO_INTERNOS;
  try {
    const r = await sb.from('memberships').select('contact_id, tipo, estado').eq('organization_id', ORG_ID).eq('estado', 'activo').eq('tipo', 'interno');
    if (!r.error && Array.isArray(r.data)) {
      _CARGO_INTERNOS = r.data.map(function (m) { return (m.contact_id && typeof BD_CONTACTOS !== 'undefined' && BD_CONTACTOS[m.contact_id]) ? BD_CONTACTOS[m.contact_id].nombre : null; }).filter(Boolean);
    }
  } catch (e) {}
  if (!_CARGO_INTERNOS) _CARGO_INTERNOS = [];
  return _CARGO_INTERNOS;
}
function cargoComboboxFilter(inputEl) {
  const wrap = inputEl.closest('.combobox-wrap'); if (!wrap) return;
  const dropdown = wrap.querySelector('.combobox-dropdown'); if (!dropdown) return;
  const tipo = (document.getElementById('cg_tipo') || {}).value || 'interno';
  const q = _normKey(inputEl.value || '');
  let nombres;
  if (tipo === 'interno') { nombres = (_CARGO_INTERNOS || []).slice().sort(); }
  else { nombres = Object.keys(BD_PERSONAS).sort(); }
  const matched = q ? nombres.filter(function (n) { return _normKey(n).includes(q); }) : nombres;
  let html = matched.slice(0, 20).map(function (n) {
    const meta = tipo === 'externo' && BD_PERSONAS[n] && BD_PERSONAS[n].rolHabitual ? '<div class="combobox-option-meta">' + escapeHtml(BD_PERSONAS[n].rolHabitual) + '</div>' : '';
    return '<div class="combobox-option" ' + accionHTML('cargo.cbSel', n, { on: 'mousedown' }) + '><div class="combobox-option-main">' + escapeHtml(n) + '</div>' + meta + '</div>';
  }).join('');
  if (!matched.length) html += '<div class="combobox-empty">' + (tipo === 'interno' ? 'Nadie con ese nombre en tu equipo interno.' : 'Sin coincidencias en la Base de Datos.') + '</div>';
  if (matched.length > 20) html += '<div class="combobox-more">+ ' + (matched.length - 20) + ' más — sigue tipeando</div>';
  if (tipo === 'interno') html += '<div class="combobox-option" style="border-top:1px solid var(--rule);color:var(--accent);font-weight:600;" data-accion="cargo.invitar" data-on="mousedown">+ Invitar a alguien a la productora…</div>';
  dropdown.innerHTML = html;
  dropdown.hidden = false;
  dropdown.onmousedown = function (e) { if (!e.target.closest('.combobox-option')) e.preventDefault(); };
  if (wrap.classList.contains('cbx-anchored')) { dropdown.style.left = ''; dropdown.style.top = ''; dropdown.style.width = ''; }
}
function cargoPersonaChanged(v) {
  /* V11.5.0 · si la persona existe en la BD y tiene mail, el campo de correo
     del externo se completa solo (modificable). */
  try {
    const em = document.getElementById('cg_email'); if (!em || em.value.trim()) return;
    const p = BD_PERSONAS[String(v || '').trim()];
    if (p && (p.mail || p.email)) em.value = p.mail || p.email;
  } catch (e) {}
}
function _cargoAgregarRol2() {
  var w = document.getElementById('cg_rol2Wrap'); var b = document.getElementById('cg_addRol2');
  if (w) w.style.display = 'block'; if (b) b.style.display = 'none';
}
function cargoIrAInvitar() {
  closeModal();
  try { openEmpresaPerfil(); setTimeout(function () { try { _empShowSub('equipo'); } catch (e) {} }, 120); }
  catch (e) { showToast({ kind: 'info', title: 'Equipo', body: 'Abre Configuración → Empresa / Productora → Equipo para invitar.' }); }
}
/* Checklist de permisos del perfil elegido (lee profile_permissions, cacheado). */
const _CARGO_PERM_CACHE = {};
const _PERM_MOD_LABELS = {
  info_proyecto: 'Info Proyecto', bd: 'Base de Datos', presupuesto: 'Presupuesto', cotizacion: 'Cotización',
  operacion_creatividad: 'Operación y creatividad (Crew, Cargos, Documentos, Rodajes, Locaciones, Hoja de Llamado, Plan de Rodaje, Entregables)',
  gastos_legal_notificaciones: 'Gastos, Legal y Notificaciones', tareas: 'Tareas', reporte_cierre: 'Reporte de cierre',
  gestion_permisos: 'Gestión de permisos', finanzas: 'Finanzas'
};
async function _cargoPerfilChecklist(perfilNombre) {
  const box = document.getElementById('cg_permList'); if (!box) return;
  box.textContent = 'Cargando permisos…';
  try {
    const codigo = PERFIL_CODIGO_POR_NOMBRE[perfilNombre];
    const perfiles = await _empPerfilesOrg();
    const p = perfiles.find(function (x) { return x.codigo === codigo; });
    if (!p) { box.textContent = 'Permisos no disponibles.'; return; }
    if (!_CARGO_PERM_CACHE[p.id]) {
      const r = await sb.from('profile_permissions').select('modulo, nivel').eq('profile_id', p.id);
      if (r.error) throw r.error;
      _CARGO_PERM_CACHE[p.id] = r.data || [];
    }
    const perms = _CARGO_PERM_CACHE[p.id];
    if (!perms.length) { box.textContent = 'Permisos no disponibles.'; return; }
    /* V11.6.0 · este checklist describe el PROYECTO: los módulos de ámbito
       empresa (crear/eliminar proyecto, datos de empresa, finanzas
       consolidada, gestión de permisos) no se listan aquí. */
    const ocultos = ['crear_proyecto', 'datos_empresa', 'eliminar_proyecto', 'finanzas_consolidada', 'gestion_permisos'];
    const nivHtml = function (n) { return (n === 'E') ? '<strong style="color:var(--positive);">E</strong>' : (n === 'L' ? '<strong style="color:var(--warning);">L</strong>' : '<span style="color:var(--ink-faint);">—</span>'); };
    box.innerHTML = perms.filter(function (pr) { return ocultos.indexOf(pr.modulo) === -1; }).map(function (pr) {
      let fila = '<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px dashed var(--rule);"><span>' + escapeHtml(_PERM_MOD_LABELS[pr.modulo] || pr.modulo) + '</span><span>' + nivHtml(pr.nivel) + '</span></div>';
      /* Subcampos: restricciones DENTRO de una pestaña. El Resumen financiero
         del Presupuesto está oculto a Producción (3) y Asistencia (4). */
      if (pr.modulo === 'presupuesto' && pr.nivel && pr.nivel !== '—') {
        const subNiv = (codigo === 3 || codigo === 4) ? '—' : pr.nivel;
        fila += '<div style="display:flex;justify-content:space-between;gap:10px;padding:2px 0 3px 16px;border-bottom:1px dashed var(--rule);font-size:11px;color:var(--ink-faint);"><span>└ Resumen financiero</span><span>' + nivHtml(subNiv) + '</span></div>';
      }
      return fila;
    }).join('');
  } catch (e) { box.textContent = 'Permisos no disponibles (lectura restringida).'; }
}
function cargoEditar(id) { cargoAbrirModal(id); }
function cargoGuardarModal() {
  const project = STATE.currentProject; if (!project) return;
  const g = function (id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
  const selCargo = g('cg_cargo');
  const cargoNombre = selCargo === '__otro' ? g('cg_otro') : selCargo;
  if (!cargoNombre) { showToast({ kind: 'warning', title: 'Falta el cargo', body: 'Elige un cargo o escribe uno personalizado.' }); return; }
  const persona = g('cg_persona');
  const tipo = g('cg_tipo') === 'externo' ? 'externo' : 'interno';
  const perfil = g('cg_perfil');
  const cargos = ensureCargos(project);
  const row = {
    id: _CARGO_EDIT || ('CG-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    cargo: cargoNombre,
    custom: CARGOS_PRESETS.indexOf(cargoNombre) < 0,
    personaNombre: persona,
    tipo: tipo,
    perfil: persona ? perfil : '',
    estado: !persona ? 'sin-asignar' : (tipo === 'externo' ? 'pendiente' : 'activo')
  };
  const idx = cargos.findIndex(function (c) { return c.id === row.id; });
  if (idx >= 0) cargos[idx] = row; else cargos.push(row);
  /* V11.5.0 · rol secundario = segunda fila (misma persona/tipo/perfil).
     Decisión: filas separadas y no texto concatenado, para que RECI, la
     invitación y los conteos sigan operando por rol. */
  const sel2 = g('cg_cargo2');
  const rol2 = sel2 === '__otro' ? g('cg_otro2') : sel2;
  if (!_CARGO_EDIT && rol2 && rol2 !== cargoNombre) {
    cargos.push({ id: 'CG-' + Math.random().toString(36).slice(2, 10), cargo: rol2, custom: sel2 === '__otro', personaNombre: persona, contactId: row.contactId || null, tipo: tipo, perfil: perfil, estado: row.estado, invitedUserId: null });
  }
  _CARGO_EDIT = null;
  const email = (document.getElementById('cg_email') ? String(document.getElementById('cg_email').value || '').trim() : '');
  closeModal();
  /* V11.3.0: el guardado va a la base; si es externo con correo, ENCADENA la
     invitación real (el RPC necesita el cargo ya persistido para vincularlo). */
  dalGuardarCargos(project).then(function (ok) {
    markDirty();
    _cargosDerivarRECI(project);   // I11a · proyectar PE/Director/JP a Info Proyecto al asignar/cambiar un cargo (la ruta normal no lo hacía)
    renderCargos();
    if (tipo === 'externo' && persona && email && ok) {
      const codigo = PERFIL_CODIGO_POR_NOMBRE[perfil] || 6;
      dalInvitar(email, 'externo', codigo, row.id, project.id)
        .then(function (res) { renderCargos(); _invMostrarResultado(res); })
        .catch(function (e) {
          if (manejarErrorPlan(e)) return;   // V11.16.0 · Frente D: tope de colaboradores → momento de venta
          const msg = ((e && e.message) || '');
          if (/ya pertenece/i.test(msg)) {
            /* V11.9.0 · ya es miembro activo → se suma DIRECTO al proyecto
               (decisión b: ya consintió a nivel organización), con aviso in-app.
               El RPC pone el cargo en activo y le stampa el usuario. */
            sb.rpc('asignar_cargo_a_miembro', { p_project_id: project.id, p_cargo_id: row.id, p_email: email })
              .then(function (r) {
                if (r.error) throw r.error;
                const cc = ensureCargos(project).find(function (x) { return x.id === row.id; });
                if (cc) { cc.estado = 'activo'; cc.invitedUserId = (r.data && r.data.user_id) || cc.invitedUserId || null; }
                renderCargos();
                showToast({ kind: 'success', title: 'Sumado al proyecto', body: persona + ' ya es parte de tu productora, así que se sumó directo a este proyecto y le llegó un aviso.', duration: 9000 });
              })
              .catch(function (e2) {
                /* No es miembro activo / sin cuenta → quitamos el huérfano y avisamos. */
                project.data.cargos = ensureCargos(project).filter(function (x) { return x.id !== row.id; });
                _cargosSave(project); renderCargos();
                showToast({ kind: 'warning', title: 'No se pudo sumar', body: ((e2 && e2.message) || '').replace(/^[a-z_]+:\s*/i, '') || 'Esta persona no es un miembro activo. Usa la invitación normal con su correo.', duration: 9000 });
              });
          } else {
            showToast({ kind: 'error', title: 'No se pudo invitar', body: msg.replace(/^invitar:\s*/i, '') || 'Reintenta.', duration: 8000 });
          }
        });
    } else if (tipo === 'externo' && persona) {
      showToast({ kind: 'info', title: 'Cargo registrado', body: 'Quedó como invitación pendiente. Agrega su correo (Cambiar) para generar el link de invitación.' });
    } else {
      showToast({ kind: 'success', title: 'Cargo guardado', body: cargoNombre + (persona ? (' → ' + persona) : ' (sin asignar)') + '.' });
    }
  });
}
function cargoQuitar(id) {
  const project = STATE.currentProject; if (!project) return;
  const cargos = ensureCargos(project);
  const c = cargos.find(function (x) { return x.id === id; });
  if (!c) return;
  if (!confirm('¿Quitar el cargo «' + (c.cargo || '') + '» de este proyecto?')) return;
  project.data.cargos = cargos.filter(function (x) { return x.id !== id; });
  _cargosSave(project);
  renderCargos();
}

// ── Window bridges (3 barridos func+const) ──

// D2 · acciones delegadas (comboboxSelect/comboboxCloseDelayed vía window: ui)
registrarAcciones('cargo', {
  editar: function (a) { cargoEditar(a[0]); },
  quitar: function (a) { cargoQuitar(a[0]); },
  copiarInv: function (a) { cargoCopiarInvitacion(a[0]); },
  abrir: function () { cargoAbrirModal(); },
  tipo: function (a, el) { _cargoTipoChanged(el.value); },
  sel: function (a, el) { _cargoSelChanged(el.value); },
  rol2: function () { _cargoAgregarRol2(); },
  otro2: function (a, el) { var o = document.getElementById('cg_otro2'); if (o) o.style.display = el.value === '__otro' ? 'block' : 'none'; },
  persona: function (a, el, ev) {
    if (ev.type === 'blur') comboboxCloseDelayed(el);
    else if (ev.type === 'change') cargoPersonaChanged(el.value);
    else cargoComboboxFilter(el);
  },
  perfil: function (a, el) { _cargoPerfilChecklist(el.value); },
  guardar: function () { cargoGuardarModal(); },
  cbSel: function (a, el) { comboboxSelect(el, a[0]); },
  invitar: function (a, el, ev) { ev.preventDefault(); cargoIrAInvitar(); },
  agregarBD: function (a) { gancho('openPersonaByName')(a[0]); },   // I11b · un cargo exige que la persona esté en la BD (con mail y teléfono)
});

// D4b · ganchos definidos por este módulo (consumidos por módulos más tempranos)
define('_cargoContactIdPorNombre', _cargoContactIdPorNombre);
define('_cargoCargarInternos', _cargoCargarInternos);   // I11b · kanban.js decide interno/externo al crear proyecto según los internos reales
define('_cargosDerivarRECI', _cargosDerivarRECI);
define('_cargosKey', _cargosKey);
define('renderCargos', renderCargos);
