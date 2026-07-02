// Modo Administrador + transición de estado del proyecto + respaldo Supabase — extraído de index.html (Etapa C4)

/* V11.3.0 · la contraseña compartida del Modo Admin fue eliminada. El permiso
   depende del perfil (solo Administrador); el modo se mantiene como barrera
   operacional consciente, con advertencia, no como autenticación. */
function _applyAdminUI() {
  const btn = document.getElementById('adminToggleBtn');
  const label = document.getElementById('adminToggleLabel');
  if (btn) btn.classList.toggle('is-on', STATE.adminMode);
  if (label) label.textContent = `Modo admin: ${STATE.adminMode ? 'ON' : 'OFF'}`;
  const badge = document.getElementById('adminBadge');
  if (badge) badge.style.display = STATE.adminMode ? 'inline-flex' : 'none';
}
function requestAdminPassword(onOk) {
  /* V11.3.0 · ya no hay contraseña: el permiso lo da el perfil (Administrador)
     y este modal es la barrera consciente que explica qué se habilita. */
  if (!_puedeModoAdmin()) {
    showToast({ kind: 'error', title: 'Modo administrador no disponible', body: 'Solo el perfil Administrador puede activarlo.' });
    return;
  }
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" onclick="closeModal()">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:460px;">
        <div class="modal-header"><div class="modal-title">Activar Modo administrador</div></div>
        <div class="modal-body">
          <p style="margin:0 0 10px;color:var(--ink-secondary);font-size:13px;line-height:1.55;">Vas a entrar a una zona delicada. Con el Modo Admin activo quedan disponibles acciones de alto impacto, por ejemplo:</p>
          <ul style="margin:0 0 12px;padding-left:18px;color:var(--ink-secondary);font-size:13px;line-height:1.7;">
            <li>Eliminar proyectos.</li>
            <li>Revertir estados (ej. devolver un proyecto a Venta).</li>
            <li>Editar configuraciones críticas y datos estructurales.</li>
            <li>Modificar el perfil de la empresa.</li>
          </ul>
          <p style="margin:0;color:var(--ink-faint);font-size:12px;line-height:1.5;">El modo queda activo solo en esta sesión y puedes desactivarlo desde el mismo botón. Tener permiso no reemplaza el criterio: estas acciones pueden ser irreversibles.</p>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-primary" id="adminPwBtn">Entiendo, activar</button>
        </div>
      </div>
    </div>`;
  document.getElementById('adminPwBtn').onclick = () => { closeModal(); onOk(); };
}
/* V10.5.1: el modo administrador queda reservado al perfil Administrador (1).
   Fail-open coherente con authNivel: si no hay perfil cargado, no se restringe. */
function _puedeModoAdmin() {
  if (!TAKEOS_PERFIL) return true;
  return authEsAdmin();
}
function toggleAdminMode() {
  if (!STATE.adminMode && !_puedeModoAdmin()) {
    showToast({ kind: 'error', title: 'Modo administrador no disponible', body: 'Solo el perfil Administrador puede activar el modo administrador.' });
    return;
  }
  if (!STATE.adminMode) {
    requestAdminPassword(() => {
      STATE.adminMode = true; _applyAdminUI();
      showToast({ kind: 'warning', title: 'Modo administrador activado', body: 'Acciones restringidas habilitadas (ej. revertir estados). Úsalo con criterio.' });
      if (typeof openConfigPanel === 'function') openConfigPanel();   // reabrir: el toggle muestra ON y se ve el cambio
    });
  } else {
    STATE.adminMode = false; _applyAdminUI();
    showToast({ kind: 'info', title: 'Modo administrador desactivado', body: 'Las acciones restringidas vuelven a estar bloqueadas.' });
  }
}

/* V5.6 (Nota 5): al aprobar (Venta→Preproducción) se sella la fecha de
   aprobación con la fecha de hoy, si está vacía. El PE puede editarla
   después manualmente en Info Proyecto. */
function stampApprovalDate(project) {
  const ip = project.data.infoProyecto;
  if (!ip.fechaAprobacion) {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    ip.fechaAprobacion = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
}

/* V5.11 (Nota 3): congela Gastos Admin y Contingencias al aprobar. Calcula el
   monto sobre el cotizado (ya purgado y bloqueado) y lo guarda fijo, para que
   no se recalcule con los costos reales. */
function freezeAdminAndContingencias(project) {
  const fin = project.data.finanzas;
  fin.frozen = null;
  const sfin = calcSummaryFin(project);
  fin.frozen = {
    admin: Math.round(sfin.admin.cot),
    riesgos: (sfin.riesgos || []).map(r => Math.round(r.cot))
  };
}

/* V5.6 (Nota 1): al aprobar se BORRAN las filas vacías de plantilla que
   quedaron sin usar. Una fila se elimina solo si NO aporta nada:
   sin nombre, sin confirmar, sin costo real, no es EXTRA, y su cotizado
   es $0 (valor o cantidad en 0). Si el PE necesita un rol nuevo después,
   lo agrega y queda marcado como EXTRA. Devuelve cuántas se eliminaron. */
/* isEmptyTemplateRow, purgeEmptyRows → movidos a src/modules/presupuesto-cotizacion.js (Etapa 2) */

function updateProjectState(newState) {
  const project = STATE.currentProject;
  const prevState = project.state;
  if (prevState === newState) return;

  // ── V5.2.2 + V5.3 (Nota 2): bloqueo de retroceso Preproducción → Venta.
  // Por defecto bloqueado. Con Modo Administrador activo (STATE.adminMode),
  // se permite la excepción explícita pero con confirmación grave. NO se
  // elimina la advertencia ni la filosofía: solo se habilita la salida.
  if (newState === 'venta' && STATES_WITH_LOCKED_BUDGET.includes(prevState)) {
    const sel = document.querySelector('select[data-state-selector]');
    if (sel) sel.value = prevState;

    if (!STATE.adminMode) {
      showModal({
        danger: true,
        title: 'Acción restringida',
        body: `Volver a <strong>Venta</strong> desde <strong>${escapeHtml(STATES[prevState].name)}</strong> requiere permisos de administrador.<br><br>Revertir un proyecto aprobado puede afectar la trazabilidad, los KPIs y los márgenes registrados.<br><br>Activa <strong>Modo administrador</strong> en la barra superior para habilitar esta acción. El sistema de permisos formal llega en V6.`,
        confirmLabel: 'Entendido',
        cancelLabel: 'Cerrar',
        onConfirm: () => {},
        onCancel: () => {}
      });
      return;
    }

    // Admin: permitir con confirmación grave.
    showModal({
      danger: true,
      title: 'Revertir a Venta (administrador)',
      body: `Estás a punto de devolver <strong>${escapeHtml(project.name)}</strong> de <strong>${escapeHtml(STATES[prevState].name)}</strong> a <strong>Venta</strong>.<br><br>Esto <strong>desbloquea la cotización</strong> (Rol, Valor, Cantidad vuelven a ser editables) y oculta la columna Costo Real. Los costos reales ya ingresados se conservan en el modelo, pero dejan de mostrarse hasta reaprobar.<br><br>Usa esto solo para corregir un error de aprobación, no como flujo normal.`,
      confirmLabel: 'Sí, revertir a Venta',
      cancelLabel: 'Cancelar',
      onConfirm: () => {
        project.state = newState;
        renderInfoProyecto();
        syncProjectStateUI(newState);
        showToast({
          kind: 'warning',
          title: 'Proyecto revertido a Venta',
          body: 'Cotización desbloqueada. Acción registrada como excepción de administrador.'
        });
      },
      onCancel: () => {}
    });
    return;
  }

  // ── V5.2.2 + V5.3 (Nota 1): aprobación con GATE DE VALIDACIÓN.
  // "Pasar a Preproducción" funciona como validación final de la
  // cotización. Si hay problemas críticos, NO deja aprobar y los lista.
  if (prevState === 'venta' && newState === 'preproduccion') {
    const sel = document.querySelector('select[data-state-selector]');
    if (sel) sel.value = prevState;

    const blockers = collectApprovalBlockers(project);
    if (blockers.length > 0) {
      showModal({
        danger: true,
        title: 'No se puede aprobar todavía',
        body: `Antes de pasar <strong>${escapeHtml(project.name)}</strong> a Preproducción, resuelve estos puntos en el Presupuesto. Aprobar congela la cotización, así que debe quedar limpia primero:<br><br>
          <ul style="padding-left: 18px; margin: 4px 0;">
            ${blockers.map(b => `<li style="margin-bottom: 4px;">${escapeHtml(b)}</li>`).join('')}
          </ul>
          <br>Corrige lo anterior y vuelve a intentar la aprobación.`,
        confirmLabel: 'Ir a corregir',
        cancelLabel: 'Cerrar',
        onConfirm: () => { navigateToModule('presupuesto'); },
        onCancel: () => {}
      });
      return;
    }

    // Sin bloqueadores: confirmación normal de aprobación.
    showModal({
      danger: false,
      title: '¿Aprobar este proyecto?',
      body: `Estás a punto de aprobar <strong>${escapeHtml(project.name)}</strong>. Al pasar a Preproducción:<br><br>
        <ul style="padding-left: 18px; margin: 4px 0;">
          <li><strong>Se bloquean los cotizados</strong>: Rol, Valor y Cantidad de cada fila quedan readonly. El DTE sigue editable.</li>
          <li><strong>Se congela el Presupuesto Cliente original</strong>. Para cobros adicionales, usa la sección de Extras / Ampliaciones del resumen financiero.</li>
          <li><strong>Se desbloquea la columna Costo Real</strong> en el Presupuesto.</li>
          <li>Las filas <strong>nuevas que agregues</strong> después de aprobar quedarán marcadas como "EXTRA" y serán editables.</li>
          <li>Solo con <strong>Modo administrador</strong> se puede revertir el proyecto a Venta.</li>
        </ul>
        <br>¿Confirmas la aprobación?`,
      confirmLabel: 'Sí, aprobar proyecto',
      cancelLabel: 'Cancelar',
      onConfirm: () => {
        project.state = newState;
        stampApprovalDate(project);              // V5.6 (Nota 5)
        const purged = purgeEmptyRows(project);  // V5.6 (Nota 1)
        freezeAdminAndContingencias(project);    // V5.11 (Nota 3)
        fireConfetti();
        renderInfoProyecto();
        syncProjectStateUI(newState);
        showToast({
          kind: 'success',
          title: '🎉 Proyecto aprobado',
          body: `Cotizados bloqueados. Costo Real desbloqueado.${purged > 0 ? ` Se limpiaron ${purged} fila(s) vacía(s).` : ''} Bienvenida la Preproducción.`
        });
      }
    });
    return;
  }

  // ── Confirmación al cerrar un proyecto (Cierre → Cerrado) ─────────
  if (newState === 'cerrado' && prevState !== 'cerrado') {
    const sel = document.querySelector('select[data-state-selector]');
    if (sel) sel.value = prevState;
    showModal({
      danger: true,
      title: '¿Cerrar este proyecto?',
      body: `Cerrar el proyecto <strong>${escapeHtml(project.name)}</strong> congela toda su información como histórica. Las versiones futuras del software pueden restringir aún más la edición de proyectos cerrados.<br><br>Reabrir un proyecto cerrado requiere intervención de un administrador y puede afectar la trazabilidad. Solo cierra cuando el proyecto esté realmente terminado.`,
      confirmLabel: 'Sí, cerrar definitivamente',
      cancelLabel: 'Cancelar',
      onConfirm: () => {
        project.state = newState;
        renderInfoProyecto();
        syncProjectStateUI(newState);
        showToast({
          kind: 'info',
          title: 'Proyecto cerrado',
          body: `${escapeHtml(project.name)} pasa a archivo histórico. Reabrir requiere administrador.`
        });
      }
    });
    return;
  }

  project.state = newState;
  renderInfoProyecto();
  syncProjectStateUI(newState);

  // ── Toasts contextuales para otros cambios ────────────────────────
  // Preproducción → Producción
  if (prevState === 'preproduccion' && newState === 'produccion') {
    showToast({
      kind: 'success',
      title: 'En rodaje',
      body: 'Hoja de Llamado y registro de gastos en tiempo real están priorizados desde aquí.'
    });
    return;
  }

  if (newState === 'postproduccion') {
    showToast({
      kind: 'info',
      title: 'Post-producción',
      body: 'Llegó el momento de las entregas y recolección de DTEs. El día siguiente al rodaje se debe enviar la solicitud de DTE (PRD V2 §08).'
    });
    return;
  }

  if (newState === 'cierre') {
    showToast({
      kind: 'info',
      title: 'Cierre contable',
      body: 'Última fase antes de cerrar el proyecto. Verifica DTEs, pagos y subida de material antes de marcar como cerrado.'
    });
    return;
  }

  if (newState === 'rechazado') {
    showToast({
      kind: 'warning',
      title: 'Proyecto rechazado',
      body: 'El proyecto queda archivado como rechazado. Si se reactiva en el futuro, se puede volver a Venta.'
    });
    return;
  }

  showToast({
    kind: 'info',
    title: `Estado: ${STATES[newState].name}`,
    body: 'Cambio registrado.'
  });
}

/* Helper: sincroniza el sidebar con el nuevo estado */
function syncProjectStateUI(newState) {
  if (STATE.currentProject) dalTouchProyecto(STATE.currentProject);   // V9.2.2: persiste el cambio de estado a Supabase
  const stateInfo = STATES[newState];
  const stateEl = document.querySelector('.sidebar-project-state');
  if (stateEl) {
    stateEl.innerHTML = `
      <div class="column-dot" style="background: ${stateInfo.color}"></div>
      ${stateInfo.name}
    `;
  }
}

/* ── V9.6.8 · Respaldo de Supabase a un solo JSON (Gate A, paso 3) ─────────
   Lee las tablas conocidas de Supabase (best-effort, paginado) y descarga UN
   archivo .json portable. Si una tabla no existe o no es accesible, se registra
   en _meta.omitidas y el respaldo sigue (no se rompe). Es un respaldo manual,
   independiente; el respaldo AUTORITATIVO (captura todo el
   esquema, incluso lo que el cliente no conoce) es el backup automático de
   Supabase Pro — ver handoff al BD Expert. Solo lectura. */
const SUPA_BACKUP_TABLES = [
  // Organización (datos propios de la org; catálogos globales como dte_types/tax_rates/bank_institutions y audit_log quedan fuera a propósito: son referencia/recreables y el backup automático de Pro los cubre)
  'organizations', 'organization_profile', 'departments', 'project_functions', 'cancellation_reasons',
  // Tanda 1 — contactos / empresas
  'contacts', 'contact_roles', 'contact_bank_accounts', 'contact_companies', 'contact_talent_profiles',
  'companies', 'company_relationships',
  // Tanda 3 — proyectos / finanzas / presupuesto / cotización
  'projects', 'project_assignments', 'project_financials', 'project_commissions', 'project_risks', 'project_income_extras',
  'budget_line_items', 'project_quotation', 'quotation_offers', 'quotation_versions',
  'project_cancellations', 'project_cancellation_reasons',
  // Tanda 4a — rodajes / plan / hoja
  'project_shoot_days', 'project_shooting_plan', 'project_call_sheet',
  // Tanda 4b — operaciones por proyecto
  'project_locations', 'project_crew_extra', 'project_external_crew', 'project_section_responsibles',
  'project_operations', 'project_op_budgets',
  // Tanda 4c — tareas / señales
  'project_tasks', 'task_comments', 'task_attachments', 'project_signals',
  // Tanda 4e — documentos
  'project_documents',
  // Transversales
  'locations', 'legal_documents', 'legal_templates'
];
async function _supaDumpTable(tabla) {
  const rows = [];
  let from = 0; const PAGE = 1000;
  for (let i = 0; i < 60; i++) {   // tope duro 60k filas por tabla
    const { data, error } = await sb.from(tabla).select('*').range(from, from + PAGE - 1);
    if (error) throw error;
    (data || []).forEach(r => rows.push(r));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}
async function exportSupabaseBackup() {
  if (!sb) { showToast({ kind: 'warning', title: 'Sin Supabase', body: 'No hay conexión con Supabase para respaldar.' }); return; }
  showToast({ kind: 'info', title: 'Respaldando Supabase…', body: 'Leyendo todas las tablas (solo lectura). Puede tardar unos segundos.', duration: 6000 });
  const tables = {};
  const capturadas = [], omitidas = [];
  let totalFilas = 0;
  for (const t of SUPA_BACKUP_TABLES) {
    try {
      const rows = await _supaDumpTable(t);
      tables[t] = rows; capturadas.push({ tabla: t, filas: rows.length }); totalFilas += rows.length;
    } catch (e) {
      omitidas.push({ tabla: t, error: (e && e.message) ? e.message : String(e) });
    }
  }
  const backup = {
    takeos_backup: true,
    source: 'supabase',
    formato: 1,
    exportadoEn: new Date().toISOString(),
    organization_id: (typeof ORG_ID !== 'undefined' ? ORG_ID : null),
    app_version: (typeof TAKEOS_VERSION !== 'undefined' ? TAKEOS_VERSION : null),
    _meta: { capturadas: capturadas, omitidas: omitidas, total_filas: totalFilas },
    tables: tables
  };
  try {
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const now = new Date(), pad = n => String(n).padStart(2, '0');
    const fname = `TakeOS_Supabase_Backup_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
    const a = document.createElement('a'); a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast({ kind: 'success', title: 'Respaldo de Supabase descargado',
      body: `${capturadas.length} tabla(s), ${totalFilas} fila(s) en <strong>${escapeHtml(fname)}</strong>.${omitidas.length ? ' ' + omitidas.length + ' tabla(s) omitida(s) — ver _meta.' : ''}` });
  } catch (e) {
    showToast({ kind: 'error', title: 'No se pudo descargar', body: 'Ocurrió un error al generar el archivo de respaldo.' });
  }
}

// ── Window bridges (3 barridos func+const) ──
window._applyAdminUI = _applyAdminUI;
window._puedeModoAdmin = _puedeModoAdmin;
window.exportSupabaseBackup = exportSupabaseBackup;
window.requestAdminPassword = requestAdminPassword;
window.toggleAdminMode = toggleAdminMode;
window.updateProjectState = updateProjectState;
