// Crew del proyecto: render, externos y exports PDF (lista/catering/transporte) — extraído de index.html (Etapa C2)

// D1b · imports reales. getCrewForExport NO se exporta: plan-rodaje:1110 lo
// consume vía window (cerrar el ciclo ESM sin necesidad = prohibido).
// window._transportPeople/_transportSel: estado propio en window, no tocar.
// 2º paso del hoist de boot: →33 (cruza tareas/cargos/invitaciones, inertes).
import { escapeHtml, showToast } from '../lib/helpers.js';
import { STATE, BD_PERSONAS } from '../lib/state.js';
import { closeModal } from '../lib/ui.js';
import { getConfirmedCrew, printViaIframe } from './plan-rodaje.js';
import { markDirty } from './persistencia-local.js';
import { orgNombre } from '../lib/boot.js';

function renderCrew() {
  const project = STATE.currentProject;
  if (!project) return;
  const d = project.data;

  // Aggregar todas las personas confirmadas con nombre desde Presupuesto
  const confirmados = [];
  for (const dept in d.servicios) {
    d.servicios[dept].forEach(r => {
      if (r.confirmado && r.nombre && !r.noVaRodaje) {
        confirmados.push({ nombre: r.nombre, rol: r.rol, source: dept });
      }
    });
  }
  ['gastos', 'equipos', 'talentos'].forEach(section => {
    d[section].forEach(r => {
      if (r.confirmado && r.nombre && !r.noVaRodaje) {
        confirmados.push({ nombre: r.nombre, rol: r.item, source: section });
      }
    });
  });

  // Eliminar duplicados de nombre (una persona puede aparecer en varios roles)
  const seen = new Set();
  const unique = [];
  confirmados.forEach(c => {
    if (!seen.has(c.nombre)) {
      seen.add(c.nombre);
      unique.push(c);
    }
  });

  const transportOpts = ['', 'Auto propio', 'Uber / Cabify', 'Producción pasa a buscar', 'Transporte público', 'Otro'];

  const content = document.getElementById('moduleContent');

  // V5.10 (#12): ya no se retorna temprano sin crew, para que los Externos y
  // las exportaciones estén siempre disponibles.
  const emptyCrewNote = unique.length === 0
    ? '<div class="alert alert-info" style="margin-bottom: var(--space-4);"><span class="alert-icon">ℹ</span><div>Aún no hay crew confirmado. Asigna nombres y marca “Conf.” en <strong>Presupuesto</strong>. También puedes agregar externos (cliente, agencia, visitas) más abajo.</div></div>'
    : '';

  // Stats: cuántos en BD vs cuántos faltan
  const enBD = unique.filter(p => BD_PERSONAS[p.nombre]).length;
  const faltanEnBD = unique.length - enBD;

  content.innerHTML = `
    ${emptyCrewNote}
    <div class="kpi-bar mb-4">
      <div class="kpi-cell">
        <div class="kpi-label">Personas confirmadas</div>
        <div class="kpi-value">${unique.length}</div>
        <div class="kpi-sub">Espejo del Presupuesto</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-label">En base de datos</div>
        <div class="kpi-value">${enBD}</div>
        <div class="kpi-sub">${enBD === unique.length ? 'Todos con datos operativos' : 'Con datos de contacto'}</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-label">Faltan en BD</div>
        <div class="kpi-value" style="color: ${faltanEnBD > 0 ? 'var(--warning)' : 'var(--ink-faint)'};">${faltanEnBD}</div>
        <div class="kpi-sub">${faltanEnBD > 0 ? 'Sin teléfono/dirección' : '✓ Todos en BD'}</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-label">Acciones</div>
        <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
          <button class="btn btn-primary btn-sm" onclick="exportCrewListPDF()">Crew List (PDF)</button>
          <button class="btn btn-secondary btn-sm" onclick="exportCateringPDF()">Catering (PDF)</button>
          <button class="btn btn-secondary btn-sm" onclick="exportTransportePDF()">Transporte (PDF)</button>
        </div>
      </div>
    </div>

    <div style="overflow-x: auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Rol / Departamento</th>
            <th style="min-width: 158px; white-space: nowrap;">Teléfono</th>
            <th>Mail</th>
            <th>Restricción alimenticia</th>
            <th>Dirección / comuna</th>
            <th>Medio de transporte</th>
          </tr>
        </thead>
        <tbody>
          ${unique.map(p => renderCrewRow(p, transportOpts)).join('')}
        </tbody>
      </table>
    </div>

    ${renderCrewExternosSection(project)}

    <div class="text-faint mt-4" style="font-size: 11px;">
      El crew confirmado es una vista derivada del <strong>Presupuesto</strong>. Los externos (cliente, agencia, visitas) se agregan aquí: no están contratados, pero comen, pueden tener restricciones alimenticias y a veces requieren transporte.
    </div>
  `;
}

function renderCrewRow(p, transportOpts) {
  const bd = BD_PERSONAS[p.nombre] || null;
  const project = STATE.currentProject;
  if (!project.data.crewExtra[p.nombre]) {
    project.data.crewExtra[p.nombre] = { medioTransporte: '' };
  }
  const extra = project.data.crewExtra[p.nombre];

  return `
    <tr>
      <td><strong>${escapeHtml(p.nombre)}</strong></td>
      <td class="auto">${escapeHtml(p.rol || '—')} · ${escapeHtml(p.source)}</td>
      <td class="auto" style="white-space: nowrap;">${bd?.telefono || `<a role="button" tabindex="0" class="crew-bd-link" style="color: var(--negative); cursor: pointer; text-decoration: underline dotted;" onclick="crewAddToBD('${escapeHtml(p.nombre)}')" title="Agregar a la Base de Datos">⚠ Sin BD</a>`}</td>
      <td class="auto">${bd?.mail || '—'}</td>
      <td class="auto">${bd?.restriccion || '—'}</td>
      <td class="auto">${bd ? `${escapeHtml(bd.direccion)}<br><span style="color: var(--ink-faint); font-size: 11px;">${escapeHtml(bd.comuna)}</span>` : `<a role="button" tabindex="0" class="crew-bd-link" style="color: var(--negative); font-size: 11px; cursor: pointer; text-decoration: underline dotted;" onclick="crewAddToBD('${escapeHtml(p.nombre)}')" title="Crear ficha en la Base de Datos">+ Agregar persona a la BD</a>`}</td>
      <td>
        <select class="cell-select" onchange="STATE.currentProject.data.crewExtra['${escapeHtml(p.nombre)}'].medioTransporte = this.value;">
          ${transportOpts.map(t =>
            `<option value="${t}" ${extra.medioTransporte === t ? 'selected' : ''}>${t || '— Seleccionar —'}</option>`
          ).join('')}
        </select>
      </td>
    </tr>
  `;
}

// MÓDULO RODAJES: nextDiaId, fmtFechaLarga, renderRodajes, renderRodajeRow, addRodaje, updateRodajeField, toggleRodajeActivo, recalcRodajesKPI, deleteRodaje → movido a src/modules/rodajes.js (Etapa C1)
/* ════════════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════
   V5.3 · CAPA 3 — MÓDULO: HOJA DE LLAMADO
   ════════════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════

   Vista operativa POR DÍA. NO es fuente de verdad (PRD §06 / Manual
   §4.7): combina datos automáticos del sistema con input manual.
   Estructura calcada del Master Sheet (pestaña HOJA DE LLAMADO):
     - Cabecera: cliente / PE / contactos / versión (auto desde Info
       Proyecto; versión desde hojaLlamado.version).
     - Selector de día: solo días ACTIVOS de RODAJES.
     - Info general del día: llamado, almuerzo, amanecer, atardecer,
       wrap cámara, wrap locación, hospital, clima (manual).
     - Locaciones: tabla a nivel proyecto (LOC-01…), referenciadas por
       las citaciones (manual).
     - Citaciones Crew: derivadas del Presupuesto (confirmados). Call
       por defecto = llamado general; editable por persona. (§7.2: el
       crew se asocia al proyecto; la precisión diaria vive aquí.)
     - Citaciones Externas: personas fuera del Crew (cliente, agencia,
       visitas) — 100% manual (PRD §7.1).

   Versionado (§5.9): botón para incrementar versión al hacer cambios
   relevantes. Export PDF queda como stub (Fase 2 / desarrollador).

   Render: onchange (blur-safe) en campos → sin re-render. Cambios
   estructurales (cambiar día, agregar/eliminar locación o citación
   externa, subir versión, editar nombre de locación) re-renderizan.
   ════════════════════════════════════════════════════════════════════ */

/* Deriva el crew confirmado del Presupuesto (mismo criterio que el
   módulo Crew: confirmados con nombre, deduplicados). */
/* ════════════════════════════════════════════════════════════════════
   V5.10 (#12) · EXTERNOS EN CREW + EXPORTACIONES CONTEXTUALES
   Decisión (Agustín lo dejó a criterio): los externos del Crew son una
   lista propia (crewExternos), independiente de las citaciones externas
   de la Hoja de Llamado, porque sirven a cosas distintas y cada una puede
   requerir añadidos por separado.
   ════════════════════════════════════════════════════════════════════ */
function renderCrewExternosSection(project) {
  const ext = project.data.crewExternos || [];
  const tipoOpts = ['cliente', 'agencia', 'visita'];
  const rows = ext.map((x, i) => `
    <tr>
      <td><select class="cell-select" onchange="updateCrewExterno(${i},'tipo',this.value)">
        ${tipoOpts.map(t => `<option value="${t}" ${x.tipo === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
      </select></td>
      <td><input class="cell-input" value="${escapeHtml(x.nombre || '')}" placeholder="Nombre" onchange="updateCrewExterno(${i},'nombre',this.value)"></td>
      <td><input class="cell-input" value="${escapeHtml(x.rol || '')}" placeholder="Rol / empresa" onchange="updateCrewExterno(${i},'rol',this.value)"></td>
      <td><input class="cell-input" value="${escapeHtml(x.telefono || '')}" placeholder="+56 …" onchange="updateCrewExterno(${i},'telefono',this.value)"></td>
      <td><input class="cell-input" value="${escapeHtml(x.restriccion || '')}" placeholder="—" onchange="updateCrewExterno(${i},'restriccion',this.value)"></td>
      <td><input class="cell-input" value="${escapeHtml(x.direccion || '')}" placeholder="Dirección" onchange="updateCrewExterno(${i},'direccion',this.value)"></td>
      <td><input class="cell-input" value="${escapeHtml(x.comuna || '')}" placeholder="Comuna" onchange="updateCrewExterno(${i},'comuna',this.value)"></td>
      <td><button class="row-delete" title="Quitar" onclick="removeCrewExterno(${i})">×</button></td>
    </tr>`).join('');
  return `
    <div class="dept" style="margin-top: var(--space-5);">
      <div class="dept-header" style="cursor: default;">
        <div class="dept-title">Externos — cliente, agencia, visitas</div>
        <button class="btn btn-secondary btn-sm" onclick="addCrewExterno()">+ Agregar externo</button>
      </div>
      <div class="dept-body">
        <div style="overflow-x: auto;">
          <table class="data-table">
            <thead><tr><th style="width:120px;">Tipo</th><th>Nombre</th><th>Rol / empresa</th><th>Teléfono</th><th>Restricción</th><th>Dirección</th><th>Comuna</th><th style="width:40px;"></th></tr></thead>
            <tbody>${rows || '<tr><td colspan="8" class="text-faint" style="padding:10px;">Sin externos. Agrega cliente, agencia o visitas que asistirán al rodaje.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}
function addCrewExterno() {
  const d = STATE.currentProject.data;
  if (!d.crewExternos) d.crewExternos = [];
  d.crewExternos.push({ tipo: 'cliente', nombre: '', rol: '', telefono: '', restriccion: '', direccion: '', comuna: '' });
  markDirty();
  renderCrew();
}
function updateCrewExterno(i, field, value) {
  const d = STATE.currentProject.data;
  if (d.crewExternos && d.crewExternos[i]) { d.crewExternos[i][field] = value; markDirty(); }
}
function removeCrewExterno(i) {
  const d = STATE.currentProject.data;
  if (d.crewExternos) { d.crewExternos.splice(i, 1); markDirty(); renderCrew(); }
}

/* Lista unificada para exportar: crew confirmado (enriquecido con BD) + externos. */
function getCrewForExport(project) {
  const people = [];
  getConfirmedCrew(project).forEach(c => {
    const bd = BD_PERSONAS[c.nombre] || {};
    people.push({ nombre: c.nombre, rol: c.rol || bd.rolHabitual || '', telefono: bd.telefono || '', mail: bd.mail || '', restriccion: bd.restriccion || '', direccion: bd.direccion || '', direccion2: bd.direccion2 || '', comuna: bd.comuna || '', tipo: 'crew' });
  });
  (project.data.crewExternos || []).forEach(x => {
    people.push({ nombre: x.nombre || '', rol: x.rol || '', telefono: x.telefono || '', mail: '', restriccion: x.restriccion || '', direccion: x.direccion || '', direccion2: '', comuna: x.comuna || '', tipo: x.tipo || 'externo' });
  });
  return people.filter(p => (p.nombre || '').trim() !== '');
}

/* Documento de impresión genérico (mismo estilo que la Hoja de Llamado). */
function buildPrintDoc(titleText, subtitle, bodyHTML) {
  const e = escapeHtml;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${e(titleText)}</title>
  <style>
    @page { size: A4; margin: 13mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: -apple-system,"Segoe UI",Roboto,Arial,sans-serif; color:#222221; margin:0; font-size:11px; line-height:1.4; }
    .head { background:#222221; color:#FDFEED; padding:14px 16px; border-radius:6px; }
    .head .title { font-size:20px; font-weight:800; letter-spacing:.04em; }
    .head .sub { font-size:12px; margin-top:3px; opacity:.9; }
    h2 { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:#B03A2F; border-bottom:1.5px solid #222221; padding-bottom:3px; margin:18px 0 8px; }
    table { width:100%; border-collapse:collapse; margin-top:4px; }
    th { background:#ecede7; text-align:left; padding:5px 7px; font-size:9.5px; text-transform:uppercase; letter-spacing:.04em; border-bottom:1.5px solid #222221; }
    td { padding:5px 7px; border-bottom:1px solid #e2e2db; vertical-align:top; }
    tr { break-inside:avoid; }
    .tag { font-size:8.5px; font-weight:700; text-transform:uppercase; padding:1px 5px; border-radius:3px; background:#ecede7; }
    .maplink { color:#1a56c4; text-decoration:underline; }
    .foot { margin-top:22px; padding-top:8px; border-top:1px solid #c9c9c2; font-size:9.5px; color:#6b6b66; }
  </style></head>
  <body>
    <div class="head"><div class="title">${e(titleText)}</div>${subtitle ? `<div class="sub">${e(subtitle)}</div>` : ''}</div>
    ${bodyHTML}
    <div class="foot">${e(orgNombre())}${orgNombre() ? ' · ' : ''}Generado ${e(new Date().toLocaleString('es-CL'))}</div>
  </body></html>`;
}

function exportCrewListPDF() {
  const project = STATE.currentProject; const ip = project.data.infoProyecto;
  const people = getCrewForExport(project);
  if (!people.length) { showToast({ kind: 'warning', title: 'Sin personas', body: 'No hay crew ni externos para exportar.' }); return; }
  const rows = people.map(p => `<tr>
    <td>${escapeHtml(p.rol || '—')}</td>
    <td><strong>${escapeHtml(p.nombre)}</strong>${p.tipo !== 'crew' ? ` <span class="tag">${escapeHtml(p.tipo)}</span>` : ''}</td>
    <td>${escapeHtml(p.telefono || '—')}</td>
    <td>${escapeHtml(p.mail || '—')}</td>
    <td>${escapeHtml(p.restriccion || '—')}</td></tr>`).join('');
  const body = `<h2>Crew List — ${escapeHtml(ip.nombreProyecto || project.name || '')}</h2>
    <table><thead><tr><th>Rol</th><th>Nombre</th><th>Teléfono</th><th>Mail</th><th>Restricción</th></tr></thead><tbody>${rows}</tbody></table>`;
  printViaIframe(buildPrintDoc('CREW LIST', `${ip.nombreProyecto || project.name || ''} · ${ip.cliente || ''} · ${people.length} personas`, body), `Crew List - ${ip.nombreProyecto || project.name || 'Proyecto'}`);
}

function exportCateringPDF() {
  const project = STATE.currentProject; const ip = project.data.infoProyecto;
  const people = getCrewForExport(project);
  if (!people.length) { showToast({ kind: 'warning', title: 'Sin personas', body: 'No hay crew ni externos para exportar.' }); return; }
  const rows = people.map(p => `<tr>
    <td>${escapeHtml(p.rol || '—')}</td>
    <td><strong>${escapeHtml(p.nombre)}</strong>${p.tipo !== 'crew' ? ` <span class="tag">${escapeHtml(p.tipo)}</span>` : ''}</td>
    <td>${p.restriccion && p.restriccion !== 'Ninguna' ? `<strong style="color:#B03A2F;">${escapeHtml(p.restriccion)}</strong>` : escapeHtml(p.restriccion || '—')}</td></tr>`).join('');
  const body = `<h2>Catering — ${escapeHtml(ip.nombreProyecto || project.name || '')} (${people.length} personas)</h2>
    <table><thead><tr><th>Rol</th><th>Nombre</th><th>Restricción alimenticia</th></tr></thead><tbody>${rows}</tbody></table>
    <p style="font-size:10px;color:#6b6b66;margin-top:10px;">Documento para catering: sin direcciones ni datos de contacto.</p>`;
  printViaIframe(buildPrintDoc('CATERING', `${ip.nombreProyecto || project.name || ''} · ${people.length} personas · sin direcciones`, body), `Catering - ${ip.nombreProyecto || project.name || 'Proyecto'}`);
}

function exportTransportePDF() {
  const project = STATE.currentProject;
  const people = getCrewForExport(project);
  if (!people.length) { showToast({ kind: 'warning', title: 'Sin personas', body: 'No hay crew ni externos para exportar.' }); return; }
  window._transportPeople = people;
  window._transportSel = new Set(people.map((_, i) => i));
  const list = people.map((p, i) => `
    <label style="display:flex; align-items:flex-start; gap:8px; padding:7px 0; border-bottom:1px solid var(--rule);">
      <input type="checkbox" checked onchange="if(this.checked)window._transportSel.add(${i}); else window._transportSel.delete(${i});">
      <span style="flex:1;"><strong>${escapeHtml(p.nombre)}</strong> <span style="color:var(--ink-muted);">· ${escapeHtml(p.rol || '')}</span><br>
        <span style="font-size:11px; color:var(--ink-muted);">${p.direccion ? escapeHtml(p.direccion) : '(sin dirección)'}${p.comuna ? ', ' + escapeHtml(p.comuna) : ''}</span></span>
    </label>`).join('');
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" onclick="closeModal()">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:560px;">
        <div class="modal-header"><div class="modal-title">Exportar Transporte</div><div style="font-size:12px;color:var(--ink-muted);margin-top:4px;">Elige quiénes van en el PDF. Incluye dirección y comuna (datos sensibles).</div></div>
        <div class="modal-body" style="max-height:50vh; overflow:auto;">${list}</div>
        <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="doExportTransporte()">Exportar seleccionados</button></div>
      </div>
    </div>`;
}
function doExportTransporte() {
  const project = STATE.currentProject; const ip = project.data.infoProyecto;
  const people = window._transportPeople || [];
  const sel = window._transportSel || new Set();
  const chosen = people.filter((_, i) => sel.has(i));
  if (!chosen.length) { showToast({ kind: 'warning', title: 'Nadie seleccionado', body: 'Marca al menos una persona.' }); return; }
  const rows = chosen.map(p => `<tr>
    <td><strong>${escapeHtml(p.nombre)}</strong></td>
    <td>${escapeHtml(p.rol || '—')}</td>
    <td>${escapeHtml(p.telefono || '—')}</td>
    <td>${p.direccion ? `<a class="maplink" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((p.direccion || '') + ' ' + (p.comuna || ''))}">${escapeHtml(p.direccion)}${p.direccion2 ? ', ' + escapeHtml(p.direccion2) : ''}</a>` : '—'}</td>
    <td>${escapeHtml(p.comuna || '—')}</td></tr>`).join('');
  const body = `<h2>Transporte — ${escapeHtml(ip.nombreProyecto || project.name || '')}</h2>
    <table><thead><tr><th>Nombre</th><th>Rol</th><th>Teléfono</th><th>Dirección</th><th>Comuna</th></tr></thead><tbody>${rows}</tbody></table>`;
  closeModal();
  printViaIframe(buildPrintDoc('TRANSPORTE', `${ip.nombreProyecto || project.name || ''} · ${ip.cliente || ''} · ${chosen.length} personas`, body), `Transporte - ${ip.nombreProyecto || project.name || 'Proyecto'}`);
}

// ── Window bridges (3 barridos func+const) ──
window.addCrewExterno = addCrewExterno;
window.doExportTransporte = doExportTransporte;
window.exportCateringPDF = exportCateringPDF;
window.exportCrewListPDF = exportCrewListPDF;
window.exportTransportePDF = exportTransportePDF;
window.getCrewForExport = getCrewForExport;
window.removeCrewExterno = removeCrewExterno;
window.renderCrew = renderCrew;
window.updateCrewExterno = updateCrewExterno;
