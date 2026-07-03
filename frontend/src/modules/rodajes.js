// Rodajes (días de rodaje) — extraído de index.html (Etapa C1)

// D1b · imports reales (bridges de productores intactos; ver Plan v1.1)
import { escapeHtml, showToast } from '../lib/helpers.js';
import { STATE } from '../lib/state.js';
import { showModal } from '../lib/ui.js';

import { registrarAcciones, accionHTML } from '../lib/delegacion.js';
/* ════════════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════
   V5.3 · CAPA 3 — MÓDULO: RODAJES
   ════════════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════

   Días reales de rodaje. Calca la pestaña RODAJES del Master Sheet:
   FECHA · ACTIVO · DESCRIPCIÓN · DIA ID. Diferencias con el Sheet:
   - No hay 150 filas vacías pre-generadas: solo existen los días que
     el usuario crea.
   - El ID se autogenera (DIA-01, DIA-02…) y es estable: no se renumera
     al desactivar/eliminar. Es la llave que referencia la Hoja de
     Llamado.
   - Principio operativo (PRD §5.6 / Manual §9.5): los días cancelados
     se DESACTIVAN (checkbox), no se borran. El botón × existe solo para
     corregir filas creadas por error, y pide confirmación.

   Render: estructura simple, onchange (no oninput) en los campos →
   sin pérdida de foco. Cambios estructurales (agregar/eliminar/activar)
   re-renderizan el módulo, que es barato.
   ════════════════════════════════════════════════════════════════════ */

function nextDiaId(rodajes) {
  let max = 0;
  rodajes.forEach(r => {
    const m = /^DIA-(\d+)$/.exec(r.diaId || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'DIA-' + String(max + 1).padStart(2, '0');
}

export function fmtFechaLarga(iso) {
  if (!iso) return '';
  // iso = 'YYYY-MM-DD' del input date. Construir fecha local sin TZ shift.
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function renderRodajes() {
  const project = STATE.currentProject;
  if (!project) return;
  const rodajes = project.data.rodajes;
  const content = document.getElementById('moduleContent');

  const totalDias = rodajes.length;
  const activos = rodajes.filter(r => r.activo).length;
  const sinFecha = rodajes.filter(r => r.activo && !r.fecha).length;

  content.innerHTML = `
    <div class="kpi-bar mb-4">
      <div class="kpi-cell">
        <div class="kpi-label">Días registrados</div>
        <div class="kpi-value">${totalDias}</div>
        <div class="kpi-sub">Incluye cancelados</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-label">Días activos</div>
        <div class="kpi-value" style="color: var(--positive);">${activos}</div>
        <div class="kpi-sub">${activos === 0 ? 'Ninguno aún' : 'Cuentan para la Hoja de Llamado'}</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-label">Activos sin fecha</div>
        <div class="kpi-value" style="color: ${sinFecha > 0 ? 'var(--warning)' : 'var(--ink-faint)'};">${sinFecha}</div>
        <div class="kpi-sub">${sinFecha > 0 ? 'Asigna fecha real' : '✓ Todo con fecha'}</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-label">Acciones</div>
        <button class="btn btn-primary btn-sm" style="margin-top: 4px;" data-accion="rodajes.add">
          + Agregar día de rodaje
        </button>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-head">
        <div class="form-section-title">Días de rodaje</div>
        <div class="form-section-hint">La fecha no es oficial hasta que el día se marca como activo. Los días cancelados se desactivan, no se borran (así la Hoja de Llamado conserva su historia).</div>
      </div>

      ${rodajes.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">🎬</div>
          <p class="empty-state-text">Todavía no hay días de rodaje. Agrega el primero para poder construir la Hoja de Llamado.</p>
          <button class="btn btn-primary btn-sm" data-accion="rodajes.add">+ Agregar día de rodaje</button>
        </div>
      ` : `
        <div style="overflow-x: auto;">
          <table class="data-table" id="tbl-rodajes">
            <thead>
              <tr>
                <th style="width: 220px;">Fecha</th>
                <th style="width: 90px;" class="ctr">Activo</th>
                <th>Descripción</th>
                <th style="width: 110px;">Día ID</th>
                <th style="width: 40px;"></th>
              </tr>
            </thead>
            <tbody>
              ${rodajes.map((r, idx) => renderRodajeRow(r, idx)).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <div class="text-faint mt-4" style="font-size: 11px;">
      El <strong>Día ID</strong> se genera automáticamente y es estable. La <strong>Hoja de Llamado</strong> usa estos IDs para construir el documento operativo de cada día activo.
    </div>
  `;
}

function renderRodajeRow(r, idx) {
  return `
    <tr class="${r.activo ? '' : 'rodaje-inactivo'}" data-rodaje-idx="${idx}">
      <td>
        <input type="date" class="cell-input"
               value="${r.fecha || ''}"
               ${accionHTML('rodajes.campo', idx, 'fecha', { on: 'change' })}>
        ${r.activo && r.fecha ? `<div class="rodaje-fecha-larga">${escapeHtml(fmtFechaLarga(r.fecha))}</div>` : ''}
      </td>
      <td class="ctr">
        <input type="checkbox" ${r.activo ? 'checked' : ''}
               ${accionHTML('rodajes.activo', idx, { on: 'change' })}>
      </td>
      <td>
        <input class="cell-input ${r.descripcion ? '' : 'is-empty'}"
               value="${escapeHtml(r.descripcion || '')}"
               placeholder="Algo breve para dar contexto del día"
               ${accionHTML('rodajes.campo', idx, 'descripcion', { on: 'change' })}>
      </td>
      <td>
        <span class="dia-id-badge ${r.activo ? '' : 'muted'}">${escapeHtml(r.diaId)}</span>
      </td>
      <td>
        <button class="row-delete" title="Eliminar día (preferible desactivar)"
                ${accionHTML('rodajes.borrar', idx)}>×</button>
      </td>
    </tr>
  `;
}

function addRodaje() {
  const project = STATE.currentProject;
  const rodajes = project.data.rodajes;
  rodajes.push({
    fecha: '',
    activo: true,
    descripcion: '',
    diaId: nextDiaId(rodajes)
  });
  renderRodajes();
}

function updateRodajeField(idx, field, value) {
  STATE.currentProject.data.rodajes[idx][field] = value;
}

function toggleRodajeActivo(idx, checked) {
  STATE.currentProject.data.rodajes[idx].activo = checked;
  renderRodajes();  // refresca KPIs + estilo de fila
}

function recalcRodajesKPI() {
  // Update granular de los KPIs sin re-render completo (preserva foco
  // si el usuario salta entre campos de fecha). Re-render solo del bar.
  const project = STATE.currentProject;
  if (!project) return;
  const rodajes = project.data.rodajes;
  const activos = rodajes.filter(r => r.activo).length;
  const sinFecha = rodajes.filter(r => r.activo && !r.fecha).length;
  const cells = document.querySelectorAll('#moduleContent .kpi-bar .kpi-value');
  if (cells.length >= 3) {
    cells[1].textContent = activos;
    cells[2].textContent = sinFecha;
    cells[2].style.color = sinFecha > 0 ? 'var(--warning)' : 'var(--ink-faint)';
  }
}

function deleteRodaje(idx) {
  const project = STATE.currentProject;
  const r = project.data.rodajes[idx];
  showModal({
    danger: true,
    title: '¿Eliminar este día?',
    body: `Vas a eliminar <strong>${escapeHtml(r.diaId)}</strong> por completo. Si el día se canceló pero quieres conservar su registro, mejor <strong>desactívalo</strong> con el checkbox en vez de borrarlo.<br><br>Si este día tiene una Hoja de Llamado asociada, esa información también se perderá.`,
    confirmLabel: 'Sí, eliminar día',
    cancelLabel: 'Cancelar',
    onConfirm: () => {
      // Limpiar datos de Hoja de Llamado asociados a este día
      const hl = project.data.hojaLlamado;
      if (hl && hl.dias && hl.dias[r.diaId]) delete hl.dias[r.diaId];
      project.data.rodajes.splice(idx, 1);
      renderRodajes();
      showToast({ kind: 'info', title: 'Día eliminado', body: `${r.diaId} fue eliminado del proyecto.` });
    },
    onCancel: () => {}
  });
}


// ── Window bridges (3 barridos: externos, auto-consumo, nombre-string) ──
window.addRodaje = addRodaje;
window.deleteRodaje = deleteRodaje;
window.fmtFechaLarga = fmtFechaLarga;
window.renderRodajes = renderRodajes;
window.toggleRodajeActivo = toggleRodajeActivo;
window.updateRodajeField = updateRodajeField;

// D0 · puentes que faltaban desde la Etapa C (barrido 3 re-ejecutado): los
// handlers on* generados los invocan como globales.
window.recalcRodajesKPI = recalcRodajesKPI;

// D2 · acciones delegadas
registrarAcciones('rodajes', {
  add: function () { addRodaje(); },
  campo: function (a, el) { updateRodajeField(a[0], a[1], el.value); if (a[1] === 'fecha') recalcRodajesKPI(); },
  activo: function (a, el) { toggleRodajeActivo(a[0], el.checked); },
  borrar: function (a) { deleteRodaje(a[0]); },
});
