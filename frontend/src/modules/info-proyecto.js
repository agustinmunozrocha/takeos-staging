// Info Proyecto + Gate de aprobación + Papelera de proyectos — extraído de index.html (Etapa C2)

// D1c · imports reales. VETADOS: PROJECTS_SOURCE, ORG_ID (window mutables);
// updateProjectState solo-string (importarlo hoistearía admin 37→32 — línea
// roja #2). Ciclo con presupu: _markRowDirty sigue saliendo vía window desde
// allá — este lado no se cierra.
import { escapeHtml, showToast } from '../lib/helpers.js';
import { sb } from '../lib/supabase.js';
import { STATE, BD_PERSONAS, PROJECTS, BD_EMPRESAS, BD_EMPRESAS_BYID, TRASH, ORG_ID, PROJECTS_SOURCE } from '../lib/state.js';
import { buildDefaultProjectData } from '../lib/modelo.js';
import { authNivel } from '../lib/auth.js';
import { fmtMoney, calcProjectTotals, fmtDelta, deltaClassCosto } from '../lib/calc.js';
import { showModal, closeModal, comboboxCloseDelayed, comboboxFilter, comboboxFilterEmpresas, comboboxOpen } from '../lib/ui.js';
import { STATES, navigateToControlRoom, renderMetrics, renderKanban, deleteProjectFlow } from './kanban.js';
import { calcSummaryFin } from './presupuesto-cotizacion.js';
import { _normKey, buildPersonasDatalist } from './bd-excel.js';
import { dalLoadProyectos, _dalProyectoPartes, _dalFusionarProyecto, DAL_KNOWN_PROJECT_IDS } from './dal.js';
import { markDirty } from './persistencia-local.js';

import { registrarAcciones, accionHTML } from '../lib/delegacion.js';
import { navigateToModule } from '../lib/nav.js';
import { gancho, define } from '../lib/ganchos.js';
/* ════════════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════
   MÓDULO: INFO PROYECTO
   ════════════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════

   Formulario con todos los datos del proyecto. Los campos que apuntan
   a personas (PE, Director, JP) tienen autocompletado desde BD y
   muestran teléfono/mail automáticamente al elegir.

   Resumen financiero: lee Presupuesto y muestra cotizado/real/delta.
   ════════════════════════════════════════════════════════════════════ */

/* V8.4.2 · vínculo proyecto↔empresa por ID (no por nombre). El proyecto guarda
   clienteEmpresaId; el texto "Cliente" queda como nombre visible. Habilita la
   ficha de la empresa (proyectos, pagado, margen). */
function empresaSelectInfoHTML(ip) {
  /* V11.3.1 · combobox estándar también aquí (era el último select rígido).
     Sigue vinculando por ID (no por texto): al elegir una empresa del
     desplegable se guarda su identificador; texto que no coincide con
     ninguna empresa no toca el vínculo y muestra la advertencia. */
  const cur = ip.clienteEmpresaId || '';
  const curNombre = (cur && BD_EMPRESAS_BYID[cur]) ? (BD_EMPRESAS_BYID[cur].nombreFantasia || '') : '';
  const cbx = `<span class="combobox-wrap cbx-anchored" style="display:block;">
    <input class="input combobox-input" value="${escapeHtml(curNombre)}" data-emp-rol="cliente" data-emp-add="1" placeholder="Escribe para buscar y vincular…" autocomplete="off"
           data-accion="info.vinculoCombo" data-on="focus input blur change">
    <div class="combobox-dropdown" hidden></div>
  </span>
  <div id="bdwarn-vinculo" style="display:none;align-items:center;gap:6px;font-size:10.5px;color:var(--warning);margin-top:6px;">⚠ Esa empresa no está en la BD: el vínculo no cambió. <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:1px 7px;" data-accion="info.irBD">+ Agregarla a la BD</button></div>`;
  let sugg = '';
  if (!cur && ip.cliente) {
    const ids = Object.keys(BD_EMPRESAS_BYID);
    const q = _normKey(ip.cliente);
    const match = ids.find(id => _normKey(BD_EMPRESAS_BYID[id].nombreFantasia || '') === q || _normKey(BD_EMPRESAS_BYID[id].razonSocial || '') === q);
    if (match) sugg = `<div style="margin-top:6px;"><button class="btn btn-secondary btn-sm" ${accionHTML('info.vincular', match)}>Vincular a «${escapeHtml(BD_EMPRESAS_BYID[match].nombreFantasia)}» (coincide con el nombre)</button></div>`;
  }
  return cbx + sugg;
}
function infoVincularEmpresaPorNombre(v) {
  const nombre = String(v || '').trim();
  const warn = document.getElementById('bdwarn-vinculo');
  if (!nombre) { updateInfoField('clienteEmpresaId', ''); renderInfoProyecto(); return; }
  const emp = BD_EMPRESAS[nombre];
  if (emp && emp._id) { if (warn) warn.style.display = 'none'; updateInfoField('clienteEmpresaId', emp._id); renderInfoProyecto(); return; }
  if (warn) warn.style.display = 'flex';
}
/* V11.3.0 · Cliente/Agencia con el combobox estándar de empresas + autofill.
   Si la empresa existe en la BD: al seleccionarla se completan mail y teléfono
   del contacto correspondiente (solo si están vacíos, nunca pisa lo escrito).
   Si no existe: aviso no bloqueante con acceso directo a la BD. */
function _infoEmpresaBDHint(field, value) {
  const el = document.getElementById('bdwarn-' + field); if (!el) return;
  const v = String(value || '').trim();
  el.style.display = (v && !BD_EMPRESAS[v]) ? 'flex' : 'none';
}
function infoEmpresaChanged(field, value) {
  updateInfoField(field, value);
  if (field === 'cliente') { try { updateProjectHeader(); } catch (e) {} }
  const emp = BD_EMPRESAS[String(value || '').trim()];
  _infoEmpresaBDHint(field, value);
  if (!emp) return;
  const ip = STATE.currentProject && STATE.currentProject.data ? STATE.currentProject.data.infoProyecto : null;
  if (!ip) return;
  let lleno = false;
  if (field === 'cliente') {
    if (!String(ip.contactoCliente || '').trim() && emp.contactoPrincipal) { ip.contactoCliente = emp.contactoPrincipal; lleno = true; }
    if (!String(ip.mailContactoCliente || '').trim() && emp.emailContacto) { ip.mailContactoCliente = emp.emailContacto; lleno = true; }
    if (!String(ip.telefonoContactoCliente || '').trim() && emp.telefonoContacto) { ip.telefonoContactoCliente = emp.telefonoContacto; lleno = true; }
  } else if (field === 'agencia') {
    if (!String(ip.contactoAgencia || '').trim() && emp.contactoPrincipal) { ip.contactoAgencia = emp.contactoPrincipal; lleno = true; }
    if (!String(ip.mailContactoAgencia || '').trim() && emp.emailContacto) { ip.mailContactoAgencia = emp.emailContacto; lleno = true; }
    if (!String(ip.telefonoContactoAgencia || '').trim() && emp.telefonoContacto) { ip.telefonoContactoAgencia = emp.telefonoContacto; lleno = true; }
  }
  if (lleno) {
    markDirty();
    renderInfoProyecto();
    showToast({ kind: 'info', title: 'Datos completados desde la BD', body: 'Mail y teléfono de contacto se rellenaron solos (solo los campos vacíos).' });
  }
}
function infoContactoChanged(field, value) {
  updateInfoField(field, value);
  const p = BD_PERSONAS[String(value || '').trim()];
  if (!p) return;
  const ip = STATE.currentProject && STATE.currentProject.data ? STATE.currentProject.data.infoProyecto : null;
  if (!ip) return;
  let lleno = false;
  const mailF = field === 'contactoCliente' ? 'mailContactoCliente' : 'mailContactoAgencia';
  const telF = field === 'contactoCliente' ? 'telefonoContactoCliente' : 'telefonoContactoAgencia';
  if (!String(ip[mailF] || '').trim() && (p.mail || p.email)) { ip[mailF] = p.mail || p.email; lleno = true; }
  if (!String(ip[telF] || '').trim() && p.telefono) { ip[telF] = p.telefono; lleno = true; }
  if (lleno) {
    markDirty();
    renderInfoProyecto();
    showToast({ kind: 'info', title: 'Datos completados desde la BD', body: 'Mail y teléfono se rellenaron solos (solo los campos vacíos).' });
  }
}
function infoVincularEmpresa(id) { updateInfoField('clienteEmpresaId', id); renderInfoProyecto(); }

export function renderInfoProyecto() {
  const project = STATE.currentProject;
  if (!project) return;
  const ip = project.data.infoProyecto;
  const stateInfo = STATES[project.state];
  const totals = calcProjectTotals(project);

  const peData = BD_PERSONAS[ip.productorEjecutivo] || {};
  const dirData = BD_PERSONAS[ip.director] || {};
  const jpData = BD_PERSONAS[ip.jefeProduccion] || {};

  const content = document.getElementById('moduleContent');
  content.innerHTML = `
    <datalist id="dl-personas">${buildPersonasDatalist()}</datalist>

    <!-- IDENTIDAD -->
    <div class="form-section">
      <div class="form-section-title">Identidad del proyecto</div>
      <div class="form-section-subtitle">Datos del cliente y la pieza. Estos campos son fuente de verdad para correos, hoja de llamado y comunicaciones.</div>
      <div class="form-grid cols-3">
        <div class="field">
          <label class="field-label">Cliente</label>
          <span class="combobox-wrap cbx-anchored" style="display:block;">
            <input class="input combobox-input" value="${escapeHtml(ip.cliente)}" data-emp-rol="cliente" placeholder="Escribe para buscar en la BD de empresas…" autocomplete="off"
                   data-accion="info.clienteCombo" data-on="focus input blur change">
            <div class="combobox-dropdown" hidden></div>
          </span>
          <div id="bdwarn-cliente" style="display:${(ip.cliente && ip.cliente.trim() && !BD_EMPRESAS[ip.cliente.trim()]) ? 'flex' : 'none'};align-items:center;gap:6px;font-size:10.5px;color:var(--warning);margin-top:6px;">⚠ No está en la BD de empresas — puedes seguir igual. <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:1px 7px;" data-accion="info.irBD">+ Agregarla a la BD</button></div>
          <div id="cliente-warn" style="display:none; align-items:flex-start; gap:6px; font-size:10.5px; color:var(--warning); background:var(--warning-bg); border-radius:6px; padding:7px 9px; margin-top:6px; line-height:1.45;">
            <span style="flex:0 0 auto;">⚠</span>
            <span>Cambiar el cliente se propaga a todo el sistema y puede romper la coherencia con documentos (cotizaciones, hojas de llamado) ya generados con el nombre anterior.</span>
          </div>
        </div>
        <div class="field">
          <label class="field-label">Empresa cliente (BD) <span class="tt" data-tip="Vincula el proyecto a una empresa de la Base de Datos por su identificador (no por el nombre). Es lo que permite a la ficha de la empresa sumar sus proyectos, lo pagado y el margen.">?</span></label>
          ${empresaSelectInfoHTML(ip)}
          <div style="font-size:10.5px;color:var(--ink-faint);margin-top:6px;line-height:1.4;">Opcional pero recomendado. El nombre de "Cliente" es solo texto; este vínculo es el que cuenta para la ficha de la empresa.</div>
        </div>
        <div class="field">
          <label class="field-label">Agencia (opcional)</label>
          <span class="combobox-wrap cbx-anchored" style="display:block;">
            <input class="input combobox-input" value="${escapeHtml(ip.agencia)}" placeholder="Escribe para buscar en la BD de empresas…" autocomplete="off"
                   data-accion="info.agenciaCombo" data-on="focus input blur change">
            <div class="combobox-dropdown" hidden></div>
          </span>
          <div id="bdwarn-agencia" style="display:${(ip.agencia && ip.agencia.trim() && !BD_EMPRESAS[ip.agencia.trim()]) ? 'flex' : 'none'};align-items:center;gap:6px;font-size:10.5px;color:var(--warning);margin-top:6px;">⚠ No está en la BD de empresas — puedes seguir igual. <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:1px 7px;" data-accion="info.irBD">+ Agregarla a la BD</button></div>
        </div>
        <div class="field">
          <label class="field-label">Productora</label>
          <input class="input" value="${escapeHtml(ip.productora)}" ${accionHTML('info.campo', 'productora', { on: 'input' })}>
        </div>
        <div class="field" style="grid-column: span 2;">
          <label class="field-label">Nombre del proyecto</label>
          <input class="input" value="${escapeHtml(ip.nombreProyecto)}" ${accionHTML('info.nombre', { on: 'input' })} placeholder="Nombre comercial / interno">
        </div>
        <div class="field">
          <label class="field-label">Servicio</label>
          <input class="input" value="${escapeHtml(ip.servicio)}" ${accionHTML('info.campo', 'servicio', { on: 'input' })} placeholder="Ej: Spot + RRSS">
        </div>
      </div>
    </div>

    <!-- DERECHOS (V8.3) -->
    <div class="form-section">
      <div class="form-section-title">Derechos de uso del material</div>
      <div class="form-section-subtitle">Tiempo, plataformas y territorio de exhibición acordados. Fuente única para cesiones de derechos, contratos, cotización y futuras alertas de vencimiento. Se recopila en la entrevista de cotización.</div>
      <div class="form-grid cols-3">
        <div class="field">
          <label class="field-label">Tiempo de exhibición</label>
          <input class="input" value="${escapeHtml((ip.derechos || {}).tiempo || '')}" ${accionHTML('info.derechos', 'tiempo', { on: 'input' })} placeholder="Ej: 6 meses · 1 año · perpetuo">
        </div>
        <div class="field">
          <label class="field-label">Plataformas</label>
          <input class="input" value="${escapeHtml((ip.derechos || {}).plataformas || '')}" ${accionHTML('info.derechos', 'plataformas', { on: 'input' })} placeholder="Ej: Instagram, TikTok, YouTube, PoP, TV">
        </div>
        <div class="field">
          <label class="field-label">Países / territorio</label>
          <input class="input" value="${escapeHtml((ip.derechos || {}).territorio || '')}" ${accionHTML('info.derechos', 'territorio', { on: 'input' })} placeholder="Ej: Chile · Latam · Mundial">
        </div>
      </div>
    </div>

    <!-- CONTACTO CLIENTE -->
    <div class="form-section">
      <div class="form-section-title">Contacto del cliente</div>
      <div class="form-section-subtitle">Quién recibe los correos y aprueba el trabajo del lado del cliente.</div>
      <div class="form-grid cols-3">
        <div class="field">
          <label class="field-label">Contacto principal</label>
          <span class="combobox-wrap person-combobox cbx-anchored" style="display:block;">
            <input class="input combobox-input" value="${escapeHtml(ip.contactoCliente)}" placeholder="Escribe para buscar en la Base de Datos…" autocomplete="off"
                   ${accionHTML('info.contactoCombo', 'contactoCliente', { on: 'focus input blur change' })}>
            <div class="combobox-dropdown" hidden></div>
          </span>
        </div>
        <div class="field">
          <label class="field-label">Mail</label>
          <input class="input" type="email" value="${escapeHtml(ip.mailContactoCliente)}" ${accionHTML('info.campo', 'mailContactoCliente', { on: 'input' })} placeholder="—">
        </div>
        <div class="field">
          <label class="field-label">Teléfono</label>
          <input class="input" value="${escapeHtml(ip.telefonoContactoCliente)}" ${accionHTML('info.campo', 'telefonoContactoCliente', { on: 'input' })} placeholder="+56 …">
        </div>
        <div class="field">
          <label class="field-label">Contacto Agencia</label>
          <span class="combobox-wrap person-combobox cbx-anchored" style="display:block;">
            <input class="input combobox-input" value="${escapeHtml(ip.contactoAgencia || '')}" placeholder="Escribe para buscar en la Base de Datos…" autocomplete="off"
                   ${accionHTML('info.contactoCombo', 'contactoAgencia', { on: 'focus input blur change' })}>
            <div class="combobox-dropdown" hidden></div>
          </span>
        </div>
        <div class="field">
          <label class="field-label">Mail Agencia</label>
          <input class="input" type="email" value="${escapeHtml(ip.mailContactoAgencia || '')}" ${accionHTML('info.campo', 'mailContactoAgencia', { on: 'input' })} placeholder="—">
        </div>
        <div class="field">
          <label class="field-label">Teléfono Agencia</label>
          <input class="input" value="${escapeHtml(ip.telefonoContactoAgencia || '')}" ${accionHTML('info.campo', 'telefonoContactoAgencia', { on: 'input' })} placeholder="+56 …">
        </div>
      </div>
    </div>

    <!-- RESPONSABLES (RECI) · V11.4.0: fuente única = módulo Cargos.
         La regla madre: una misma información no vive en dos lugares aislados.
         Aquí solo se LEE la proyección derivada de Cargos (PE / Director / JP);
         se gestiona allá y se refleja acá (y en hoja de llamado, plan, gastos). -->
    <div class="form-section">
      <div class="form-section-title">Responsables (RECI) <span class="tt" data-tip="RECI = Responsable, Ejecutor, Consultado, Informado. Adaptación al español del framework RACI internacional.\n\n• R = Responsable final del proyecto. No delegable. Es quien responde por el resultado.\n• E = Ejecutor. Realiza el trabajo. Puede ser delegado por el Responsable.\n• C = Consultado. Aporta input durante la ejecución.\n• I = Informado. Recibe el resultado.">?</span></div>
      <div class="form-section-subtitle">Los responsables se gestionan en el módulo <strong>Cargos</strong> (fuente única) y se reflejan aquí y en todos los documentos. Asigna los cargos «Productor/a Ejecutivo/a», «Director/a» y «Jefe/a de Producción» allá.</div>
      <div class="form-grid cols-3">
        <div class="field">
          <label class="field-label">Productor Ejecutivo <span class="tt" data-tip="R — Responsable final del proyecto.">R</span></label>
          <div class="input" style="background:var(--bg-surface);cursor:default;">${escapeHtml(ip.productorEjecutivo || '—')}</div>
          ${renderPersonContactSub(peData)}
        </div>
        <div class="field">
          <label class="field-label">Director <span class="tt" data-tip="E — Ejecutor de la visión creativa.">E</span></label>
          <div class="input" style="background:var(--bg-surface);cursor:default;">${escapeHtml(ip.director || '—')}</div>
          ${renderPersonContactSub(dirData)}
        </div>
        <div class="field">
          <label class="field-label">Jefe de Producción <span class="tt" data-tip="E — Ejecutor operacional.">E</span></label>
          <div class="input" style="background:var(--bg-surface);cursor:default;">${escapeHtml(ip.jefeProduccion || '—')}</div>
          ${renderPersonContactSub(jpData)}
        </div>
      </div>
      <div style="margin-top:10px;"><button class="btn btn-secondary btn-sm" data-accion="info.irCargos">Gestionar en Cargos →</button></div>
    </div>

    <!-- ESTADO -->
    <div class="form-section">
      <div class="form-section-title">Estado del proyecto <span class="tt" data-tip="El estado controla qué columnas y módulos están disponibles.\n\n• Venta: solo cotización, sin Costo Real.\n• Preproducción: se desbloquea Costo Real en Presupuesto. Confeti al aprobar.\n• Producción: hoja de llamado y registro de gastos al día.\n• Postproducción: solicitudes de DTE, entregas.\n• Cierre: revisión final antes de cerrar.\n• Cerrado: bloqueado como histórico (requiere confirmación).\n• Rechazado: estado terminal alternativo.">?</span></div>
      <div class="form-section-subtitle">El estado controla qué columnas y módulos están disponibles. Por ejemplo, "Costo Real" en Presupuesto solo aparece desde Preproducción.</div>
      <div class="form-grid cols-3">
        <div class="field">
          <label class="field-label">Estado actual</label>
          <select class="select" data-state-selector data-accion="info.estado" data-on="change">
            ${Object.entries(STATES).sort((a,b) => a[1].order - b[1].order).map(([k, s]) =>
              `<option value="${k}" ${project.state === k ? 'selected' : ''}>${s.name}</option>`
            ).join('')}
          </select>
          <div class="state-badge mt-3" style="background: color-mix(in srgb, ${stateInfo.color} 15%, transparent); color: ${stateInfo.color};">
            <span class="dot"></span> ${stateInfo.name}
          </div>
        </div>
        <div class="field">
          <label class="field-label">Fecha de cotización</label>
          <input class="input" type="date" value="${escapeHtml(ip.fechaCotizacion)}" ${accionHTML('info.campo', 'fechaCotizacion', { on: 'change' })}>
        </div>
        <div class="field">
          <label class="field-label">Fecha de aprobación</label>
          <input class="input" type="date" value="${escapeHtml(ip.fechaAprobacion)}" ${accionHTML('info.campo', 'fechaAprobacion', { on: 'change' })}>
        </div>
        <div class="field">
          <label class="field-label">Fecha entrega final</label>
          <input class="input" type="date" value="${escapeHtml(ip.fechaEntregaFinal)}" ${accionHTML('info.campo', 'fechaEntregaFinal', { on: 'change' })}>
        </div>
        <div class="field">
          <label class="field-label">Fecha de pago</label>
          <input class="input" type="date" value="${escapeHtml(ip.fechaPago)}" ${accionHTML('info.campo', 'fechaPago', { on: 'change' })}>
        </div>
        <div class="field" style="grid-column: span 1;">
          <label class="field-label">Condiciones de pago</label>
          <input class="input" value="${escapeHtml(ip.condicionPago)}" ${accionHTML('info.campo', 'condicionPago', { on: 'input' })}>
        </div>
      </div>
    </div>

    <!-- RESUMEN FINANCIERO · V11.5.0: eliminado de Info Proyecto por decisión
         de Agustín — vive solo en Presupuesto (fuente única). Sección oculta;
         el HTML muerto se retira en la próxima pasada de este módulo. -->
    <div class="form-section" style="display:none;">
      <div class="form-section-title">Resumen financiero</div>
      <div class="form-section-subtitle">Alimentado automáticamente desde Presupuesto. No editable aquí.</div>
      <div class="kpi-bar">
        <div class="kpi-cell">
          <div class="kpi-label">Costo cotizado</div>
          <div class="kpi-value">${fmtMoney(totals.totalCot)}</div>
          <div class="kpi-sub">Total empresa según presupuesto</div>
        </div>
        <div class="kpi-cell">
          <div class="kpi-label">Costo real</div>
          <div class="kpi-value">${totals.hasReal ? fmtMoney(totals.totalReal) : '—'}</div>
          <div class="kpi-sub">${totals.hasReal ? 'En curso · puede cambiar' : 'Aún sin datos reales'}</div>
        </div>
        <div class="kpi-cell">
          <div class="kpi-label">Delta (real − cotizado)</div>
          <div class="kpi-value small ${deltaClassCosto(totals.totalReal - totals.totalCot) === 'positive' ? 'text-positive' : (deltaClassCosto(totals.totalReal - totals.totalCot) === 'negative' ? 'text-negative' : '')}" style="color: ${totals.hasReal ? (totals.totalReal < totals.totalCot ? 'var(--positive)' : (totals.totalReal > totals.totalCot ? 'var(--negative)' : 'var(--ink-faint)')) : 'var(--ink-faint)'};">
            ${totals.hasReal ? fmtDelta(totals.totalReal - totals.totalCot) : '—'}
          </div>
          <div class="kpi-sub">${totals.hasReal ? (totals.totalReal < totals.totalCot ? 'Bajo lo cotizado' : 'Sobre lo cotizado') : 'Calculado al ingresar reales'}</div>
        </div>
        <div class="kpi-cell">
          <div class="kpi-label">Alertas</div>
          <div class="kpi-value" style="color: ${totals.alerts > 0 ? 'var(--warning)' : 'var(--ink-faint)'};">${totals.alerts}</div>
          <div class="kpi-sub">${totals.alerts === 0 ? 'Sin datos faltantes' : 'Filas con DTE pendiente'}</div>
        </div>
      </div>
    </div>

    ${(STATE.adminMode && authNivel('eliminar_proyecto') === 'E') ? `
    <div class="form-section" style="border: 1px solid var(--negative); background: var(--negative-bg);">
      <div class="form-section-title" style="color: var(--negative);">⚠ Zona peligrosa</div>
      <div class="form-section-subtitle">Acción irreversible, solo administrador. Antes de eliminar, exporta un guardado con “Guardar” si quieres conservar el proyecto.</div>
      <button class="btn btn-danger" ${accionHTML('info.borrarProy', project.id)}>Eliminar este proyecto</button>
    </div>` : ''}
  `;
}

/* Mini-bloque debajo del select de persona: muestra mail y teléfono */
function renderPersonContactSub(personData) {
  if (!personData.mail && !personData.telefono) {
    return `<div class="field-value muted" style="font-size: 11px;">— Sin datos en BD</div>`;
  }
  return `
    <div style="font-size: 11px; color: var(--ink-muted); line-height: 1.5; margin-top: 2px;">
      ${personData.mail ? `<div>${escapeHtml(personData.mail)}</div>` : ''}
      ${personData.telefono ? `<div style="font-variant-numeric: tabular-nums;">${escapeHtml(personData.telefono)}</div>` : ''}
    </div>
  `;
}

/* ── Pasada 1 · marcas de cambio granulares (tracking para el diff por fila) ──
   El chokepoint de edición de campo es updateRowField; pero altas/bajas/arrastre/
   renombrar-depto/notas son onclick o escrituras directas que NO pasan por ahí,
   así que marcan el cambio explícitamente con estos helpers. _dirtySeq permite,
   al guardar OK, limpiar la marca solo si nadie volvió a editar durante el viaje
   del RPC (sin perder una segunda edición). */
export function _markRowDirty(row) {
  if (row) { row._dirty = true; row._dirtySeq = (row._dirtySeq || 0) + 1; }
  return row;
}
function _markHeaderDirty(project) {
  if (project) { project._headerDirty = true; project._headerDirtySeq = (project._headerDirtySeq || 0) + 1; }
}
/* _budgetQueueDeletes → movido a src/modules/presupuesto-cotizacion.js (Etapa 2) */

function updateInfoField(field, value) {
  if (!STATE.currentProject) return;   // vista fantasma (p.ej. tras cambio de org): no hay proyecto que editar
  STATE.currentProject.data.infoProyecto[field] = value;
  _markHeaderDirty(STATE.currentProject);   // Pasada 1 · cabecera tocada (se versiona como unidad bajo info_proyecto)
  // Para campos que afectan el resumen financiero, re-render del KPI bar.
  // Para campos que no, ningún re-render (el usuario está tipeando).
}

/* V8.3: setter del bloque Derechos (objeto anidado en infoProyecto). */
function updateDerechos(field, value) {
  if (!STATE.currentProject) return;   // vista fantasma: ídem updateInfoField
  const ip = STATE.currentProject.data.infoProyecto;
  if (!ip.derechos || typeof ip.derechos !== 'object') ip.derechos = { tiempo: '', plataformas: '', territorio: '' };
  ip.derechos[field] = value;
  _markHeaderDirty(STATE.currentProject);   // Pasada 1 · derechos es parte de la cabecera comercial
  markDirty();
}

function updateProjectHeader() {
  // Sincroniza el header del proyecto en sidebar y breadcrumb cuando
  // cambia el nombre desde Info Proyecto.
  const p = STATE.currentProject;
  if (!p) return;
  const ip = p.data.infoProyecto;
  if (ip.nombreProyecto) p.name = ip.nombreProyecto;
  if (ip.cliente) p.client = ip.cliente;
  document.getElementById('breadcrumb').innerHTML = `
    <span class="breadcrumb-link" data-accion="kanban.controlRoom">Control Room</span>
    <span class="breadcrumb-sep">›</span>
    <span class="breadcrumb-current">${escapeHtml(p.client)} · ${escapeHtml(p.name)}</span>
  `;
  document.querySelector('.sidebar-project-client').textContent = p.client;
  document.querySelector('.sidebar-project-name').textContent = p.name;
}

/* ════════════════════════════════════════════════════════════════════
   V5.3 (Nota 1): GATE DE VALIDACIÓN DE APROBACIÓN
   ════════════════════════════════════════════════════════════════════
   Devuelve la lista de problemas que IMPIDEN aprobar (Venta →
   Preproducción). Si está vacía, el proyecto puede aprobarse.
   Bloqueadores definidos con Agustín:
     1. Filas de Servicios/Talentos con Valor + Cantidad pero sin DTE
        (el cotizado no se puede calcular sin DTE → 'FALTA DTE').
     2. Presupuesto Cliente en $0 (no hay nada cotizado al cliente).
     3. Margen cotizado negativo (el proyecto pierde plata según
        cotización).
   NO bloquea (queda como aviso suave en recalcAlerts): "confirmado sin
   nombre". Eso no compromete la integridad de la cotización congelada.
   ════════════════════════════════════════════════════════════════════ */
export function collectApprovalBlockers(project) {
  const blockers = [];
  const d = project.data;

  // 1. DTE faltante en Servicios/Talentos con valor y cantidad
  const faltaDTE = [];
  const scanDTE = (items, label) => {
    items.forEach(r => {
      if (r.valor && r.cantidad > 0 && !r.dte) {
        faltaDTE.push(`${label} · ${r.nombre || r.rol || r.item || '(sin nombre)'}`);
      }
    });
  };
  for (const dept in d.servicios) scanDTE(d.servicios[dept], `Servicios > ${dept}`);
  scanDTE(d.talentos, 'Talentos');
  if (faltaDTE.length > 0) {
    blockers.push(`Falta seleccionar DTE en ${faltaDTE.length} ${faltaDTE.length === 1 ? 'fila' : 'filas'}: ${faltaDTE.slice(0, 4).join('; ')}${faltaDTE.length > 4 ? `; y ${faltaDTE.length - 4} más` : ''}.`);
  }

  // 2. Presupuesto Cliente en $0
  const s = calcSummaryFin(project);
  if (!s.presupCliente || s.presupCliente <= 0) {
    blockers.push('El Presupuesto Cliente (NETO) está en $0. Ingresa el monto cotizado al cliente en el resumen financiero.');
  }

  // 3. Margen cotizado negativo
  if (s.presupCliente > 0 && s.gananciaFinal.cot < 0) {
    blockers.push(`El margen cotizado es negativo (${fmtMoney(s.gananciaFinal.cot)}). Revisa costos, comisiones o el precio al cliente: el proyecto pierde plata según la cotización.`);
  }

  return blockers;
}

/* V5.9 (Nota 14): eliminar proyecto. Solo administrador. Acción grave e
   irreversible: exige escribir el nombre EXACTO del proyecto para habilitar
   el botón de borrado. No hay "deshacer" (salvo restaurar un guardado previo). */
/* deleteProjectFlow, confirmDeleteProject -> movidos a src/modules/kanban.js (Etapa 2) */

/* V11.9.0 · trae de la base los proyectos borrados (deleted_at IS NOT NULL) y
   los ensambla a TRASH, para que la Papelera muestre también los eliminados en
   sesiones anteriores (antes solo veía los borrados en la sesión actual). */
async function dalCargarPapelera() {
  if (!sb || PROJECTS_SOURCE !== 'supabase') return;
  let rows = null;
  try { rows = await dalLoadProyectos(true); } catch (e) { return; }
  if (!rows || !rows.length) return;
  rows.forEach(function (p) {
    if (TRASH.find(function (x) { return x.id === p.id; })) return;   // ya está en memoria
    const partes = _dalProyectoPartes(p);
    const proj = { id: p.id, name: partes.nombre, client: partes.cliente, state: partes.estado, pe: partes.pe || '—', amount: 0, currency: 'CLP', alerts: 0, lastActivity: '', date: '—', data: buildDefaultProjectData() };
    try { _dalFusionarProyecto(proj, partes); } catch (e) {}
    proj._deletedAt = p.deleted_at || new Date().toISOString();
    proj._deletedState = partes.estado;
    DAL_KNOWN_PROJECT_IDS.add(p.id);
    TRASH.push(proj);
  });
}
/* V5.10 (Respuesta 1): Papelera — listar, restaurar. */
export async function openTrash() {
  await dalCargarPapelera();
  if (TRASH.length === 0) {
    showModal({ title: 'Papelera vacía', body: 'No hay proyectos eliminados. Cuando elimines un proyecto, queda aquí por si necesitas recuperarlo.', confirmLabel: 'Cerrar', cancelLabel: '', onConfirm: () => {} });
    return;
  }
  const rows = TRASH.map(p => {
    const when = p._deletedAt ? new Date(p._deletedAt).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    return `<div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; border-bottom:1px solid var(--rule);">
      <div>
        <div style="font-weight:600;">${escapeHtml(p.name)}</div>
        <div style="font-size:11px; color:var(--ink-muted);">${escapeHtml(p.client || '')} · eliminado ${escapeHtml(when)}</div>
      </div>
      <button class="btn btn-secondary" ${accionHTML('info.restaurar', p.id)}>Restaurar</button>
    </div>`;
  }).join('');
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" data-accion="ui.backdrop">
      <div class="modal" style="max-width: 560px;">
        <div class="modal-header">
          <div class="modal-title">Papelera</div>
          <div style="font-size:12px; color:var(--ink-muted); margin-top:4px;">${TRASH.length} proyecto(s) eliminado(s). Se conservan indefinidamente. Puedes restaurarlos al Control Room.</div>
        </div>
        <div class="modal-body" style="max-height:50vh; overflow:auto;">${rows}</div>
        <div class="modal-footer"><button class="btn" data-accion="ui.cerrar">Cerrar</button></div>
      </div>
    </div>`;
}
async function restoreFromTrash(id) {
  const i = TRASH.findIndex(p => p.id === id);
  if (i === -1) return;
  const proj = TRASH[i];
  // V10.5.0: contraparte del fix de borrado. El load filtra deleted_at IS NULL,
  // así que restaurar debe LIMPIAR deleted_at en Supabase ANTES de devolver el
  // proyecto a memoria; si no, la restauración no sobrevive a una recarga.
  // Si el UPDATE falla, el proyecto se queda en la papelera.
  if (sb && PROJECTS_SOURCE === 'supabase' && DAL_KNOWN_PROJECT_IDS.has(id)) {
    try {
      const { error } = await sb.from('projects')
        .update({ deleted_at: null, updated_at: new Date().toISOString() })
        .eq('id', id).eq('organization_id', ORG_ID);
      if (error) throw error;
    } catch (e) {
      console.error('[restore] no se pudo limpiar deleted_at en Supabase:', e);
      showToast({ kind: 'warning', title: 'No se pudo restaurar', body: 'No se pudo limpiar el borrado en Supabase. El proyecto sigue en la papelera. Revisa la conexión e inténtalo de nuevo.' });
      return;   // no devolver a memoria
    }
  }
  if (proj._deletedState) proj.state = proj._deletedState;
  delete proj._deletedAt; delete proj._deletedState;
  TRASH.splice(i, 1);
  PROJECTS.push(proj);
  markDirty();
  closeModal();
  navigateToControlRoom();
  renderMetrics();
  renderKanban();
  showToast({ kind: 'success', title: 'Proyecto restaurado', body: `“${escapeHtml(proj.name)}” volvió al Control Room.` });
}

// ── Window bridges (3 barridos func+const) ──

window.updateInfoField = updateInfoField;

// D0 · puentes que faltaban desde la Etapa C (barrido 3 re-ejecutado): los
// handlers on* generados los invocan como globales.

// D2 · acciones delegadas (comboboxes de 4 eventos → una acción por combobox)
registrarAcciones('info', {
  vinculoCombo: function (a, el, ev) {
    if (ev.type === 'focus' || ev.type === 'input') comboboxFilterEmpresas(el);
    else if (ev.type === 'blur') comboboxCloseDelayed(el);
    else infoVincularEmpresaPorNombre(el.value);
  },
  irBD: function () { navigateToModule('bd-personas'); },
  vincular: function (a) { infoVincularEmpresa(a[0]); },
  clienteCombo: function (a, el, ev) {
    var w = document.getElementById('cliente-warn');
    if (ev.type === 'focus') { comboboxFilterEmpresas(el); if (w) w.style.display = 'flex'; }
    else if (ev.type === 'input') { comboboxFilterEmpresas(el); updateInfoField('cliente', el.value); updateProjectHeader(); _infoEmpresaBDHint('cliente', el.value); }
    else if (ev.type === 'blur') { comboboxCloseDelayed(el); if (w) w.style.display = 'none'; }
    else infoEmpresaChanged('cliente', el.value);
  },
  agenciaCombo: function (a, el, ev) {
    if (ev.type === 'focus') comboboxFilterEmpresas(el);
    else if (ev.type === 'input') { comboboxFilterEmpresas(el); updateInfoField('agencia', el.value); _infoEmpresaBDHint('agencia', el.value); }
    else if (ev.type === 'blur') comboboxCloseDelayed(el);
    else infoEmpresaChanged('agencia', el.value);
  },
  contactoCombo: function (a, el, ev) {
    if (ev.type === 'focus') comboboxOpen(el);
    else if (ev.type === 'input') { comboboxFilter(el); updateInfoField(a[0], el.value); }
    else if (ev.type === 'blur') comboboxCloseDelayed(el);
    else infoContactoChanged(a[0], el.value);
  },
  campo: function (a, el) { updateInfoField(a[0], el.value); },
  nombre: function (a, el) { updateInfoField('nombreProyecto', el.value); updateProjectHeader(); },
  derechos: function (a, el) { updateDerechos(a[0], el.value); },
  irCargos: function () { navigateToModule('cargos'); },
  estado: function (a, el) { gancho('updateProjectState')(el.value); },
  borrarProy: function (a) { deleteProjectFlow(a[0]); },
  restaurar: function (a) { restoreFromTrash(a[0]); },
});

// D4b · ganchos definidos por este módulo (consumidos por módulos más tempranos)
define('_markRowDirty', _markRowDirty);
define('renderInfoProyecto', renderInfoProyecto);
define('updateInfoField', updateInfoField);
