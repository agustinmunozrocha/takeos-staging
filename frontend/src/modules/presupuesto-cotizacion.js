// ════════════════════════════════════════════════════════════════════════════
// MOD PRESUPUESTO + COTIZACIÓN — Etapa 2 de modularización con Vite
// Extraído de frontend/index.html (V5 → V10, ~200 funciones).
// Acoplamiento bidireccional: presupuesto llama a cot*, cot* llama a calcSummaryFin.
// ════════════════════════════════════════════════════════════════════════════
import { STATE } from '../lib/state.js';
import { escapeHtml, showToast, safeUrl } from '../lib/helpers.js';

// UNIDAD_OPTIONS: ahora en lib/data.js (window) — dedup B3

// ── A0: cotizadoLocked (disperso, línea 1583)
function cotizadoLocked(project) {
  if (!project) return false;
  return window.STATES_WITH_LOCKED_BUDGET.includes(project.state);
}

// ── A1: getBDPresupuesto (disperso, línea 2085)
function getBDPresupuesto() {
  const out = {};
  Object.keys(window.BD_PERSONAS).forEach(k => {
    const p = window.BD_PERSONAS[k];
    const roles = (p && Array.isArray(p.roles)) ? p.roles : ['Crew'];
    if (roles.indexOf('Crew') !== -1 || roles.indexOf('Interno') !== -1) out[k] = p;
  });
  return out;
}

// ── B: renderUnidadCell dispatcher (disperso, línea 2834)
function renderUnidadCell(ref, currentUnidad) {
  // ref viene como string tipo "'servicios','Dirección',5" o "'gastos',null,2"
  // Parsearlo de vuelta para los handlers nuevos. Más limpio: parsing simple.
  const parts = ref.split(',').map(s => s.trim());
  const sectionKey = parts[0].replace(/'/g, '');
  const dept = parts[1] === 'null' ? null : parts[1].replace(/'/g, '');
  const idx = parseInt(parts[2]);
  const inPreset = UNIDAD_OPTIONS.includes(currentUnidad);
  if (currentUnidad && !inPreset) {
    return renderUnidadCellInput(sectionKey, dept, idx, currentUnidad);
  }
  return renderUnidadCellSelect(sectionKey, dept, idx, currentUnidad);
}

// ── _budgetQueueDeletes (disperso, línea 5921)
function _budgetQueueDeletes(project, rows) {
  if (!project) return;
  if (!project._budgetPendingDeletes) project._budgetPendingDeletes = [];
  (rows || []).forEach(function (r) {
    if (r && r.version != null && r.clientUuid) project._budgetPendingDeletes.push({ clientUuid: r.clientUuid, version: r.version });
  });
}

// ── isEmptyTemplateRow + purgeEmptyRows (dispersos, líneas 6308-6329)
function isEmptyTemplateRow(item) {
  const hasNombre = item.nombre && String(item.nombre).trim() !== '';
  const hasReal = item.costoReal !== null && item.costoReal !== undefined && item.costoReal !== '';
  const cotizadoZero = !(Number(item.valor) > 0) || !(Number(item.cantidad) > 0);
  return !hasNombre && !item.confirmado && !hasReal && !item.extra && cotizadoZero;
}
function purgeEmptyRows(project) {
  let removed = 0;
  const d = project.data;
  Object.keys(d.servicios).forEach(dept => {
    const before = d.servicios[dept].length;
    d.servicios[dept] = d.servicios[dept].filter(r => !isEmptyTemplateRow(r));
    removed += before - d.servicios[dept].length;
  });
  ['gastos', 'equipos', 'talentos'].forEach(key => {
    if (!Array.isArray(d[key])) return;
    const before = d[key].length;
    d[key] = d[key].filter(r => !isEmptyTemplateRow(r));
    removed += before - d[key].length;
  });
  return removed;
}

// ── BLOQUE PRINCIPAL: toggleBudgetCotizado → cotDesbloquearMisma (6554-10723) ──
function toggleBudgetCotizado() {
  STATE.ui.budgetCollapseCotizado = !(STATE.ui.budgetCollapseCotizado !== false);
  renderPresupuesto();
}

/* V5.9 (Nota 4): conteo automático de personas que físicamente asisten al
   rodaje, para dimensionar catering, craft, transporte y logística.
   Cuenta PERSONAS (no jornadas): cada fila activa de servicios/talentos = 1.
   Excluye Postproducción (no van a rodaje) y la propia línea de Catering
   (es el consumo que se quiere dimensionar, no un asistente). Suma además
   los asistentes externos ingresados a mano: cliente, agencia y visitas. */
function rowCountsAsPerson(item) {
  return (item.nombre && String(item.nombre).trim() !== '')
    || item.confirmado
    || (Number(item.valor) > 0 && Number(item.cantidad) > 0);
}
function calcHeadcount(project) {
  const d = project.data;
  let crew = 0;
  Object.keys(d.servicios).forEach(dept => {
    const dk = _normKey(dept);
    if (dk.includes('postprod') || dk.includes('catering')) return;
    d.servicios[dept].forEach(r => { if (rowCountsAsPerson(r)) crew++; });
  });
  let talentos = 0;
  (d.talentos || []).forEach(r => { if (rowCountsAsPerson(r)) talentos++; });
  const a = d.asistentes || { cliente: 0, agencia: 0, externo: 0 };
  const cliente = Math.max(0, Number(a.cliente) || 0);
  const agencia = Math.max(0, Number(a.agencia) || 0);
  const externo = Math.max(0, Number(a.externo) || 0);
  return { crew, talentos, cliente, agencia, externo, total: crew + talentos + cliente + agencia + externo };
}
function headcountPanelHTML(project) {
  const h = calcHeadcount(project);
  const a = project.data.asistentes || { cliente: 0, agencia: 0, externo: 0 };
  return `
    <div class="headcount">
      <div class="headcount-total">
        <div class="headcount-num">≈ ${h.total}</div>
        <div class="headcount-lbl">personas en rodaje (aprox.)
          <span class="tt" data-tip="Es una APROXIMACIÓN para dimensionar catering, craft, transporte y logística. No puede ser exacta porque:

• En proyectos de varios días, no todos asisten todos los días.
• La cantidad de jornadas (ej. 3) no es lo mismo que personas (sigue siendo 1).
• Roles a tarifa plana (ej. director) cuentan como 1, aunque su trabajo abarque todo el proyecto.

Suma crew de servicios (excluye Postproducción y la línea de catering), talentos y asistentes. Cuenta personas, no jornadas. Úsalo como referencia, no como número cerrado.">?</span>
        </div>
        <div class="headcount-break">Crew ${h.crew} · Talentos ${h.talentos} · Cliente ${h.cliente} · Agencia ${h.agencia} · Visitas ${h.externo}</div>
      </div>
      <div class="headcount-inputs">
        <div class="hc-field"><label>Cliente</label><input type="number" min="0" class="input num" value="${a.cliente || 0}" onchange="updateAsistentes('cliente', window.readNum(this) ?? 0)"></div>
        <div class="hc-field"><label>Agencia</label><input type="number" min="0" class="input num" value="${a.agencia || 0}" onchange="updateAsistentes('agencia', window.readNum(this) ?? 0)"></div>
        <div class="hc-field"><label>Visitas externas</label><input type="number" min="0" class="input num" value="${a.externo || 0}" onchange="updateAsistentes('externo', window.readNum(this) ?? 0)"></div>
      </div>
    </div>`;
}
function renderHeadcountPanel() {
  const el = document.getElementById('headcountPanel');
  if (el && STATE.currentProject) el.innerHTML = headcountPanelHTML(STATE.currentProject);
}
function updateAsistentes(field, value) {
  const d = STATE.currentProject.data;
  if (!d.asistentes) d.asistentes = { cliente: 0, agencia: 0, externo: 0 };
  d.asistentes[field] = Math.max(0, Number(value) || 0);
  renderHeadcountPanel();
  window.markDirty();
}

/* ════════════════════════════════════════════════════════════════════
   V8.3.2 · Indicador + navegación de versión de cotización dentro de
   Presupuesto. El presupuesto es ÚNICO y en vivo: alimenta la ÚLTIMA versión;
   las anteriores guardan su resumen congelado. La barra deja claro en qué
   versión estás parado y, si es histórica, advierte que lo que edites aquí
   afecta a la última versión, no a esa. Cambiar de versión solo mueve el
   puntero activo (no altera el cotizado). */
function presupCotVersionBarHTML(project) {
  const cs = ensureCotizaciones(project);
  if (!cs || !Array.isArray(cs.versiones) || !cs.versiones.length) return '';
  const vs = cs.versiones.slice().sort((a, b) => (a.numero || 0) - (b.numero || 0));
  const latest = cotUltimaNum(cs);
  const activa = cs.versiones.find(v => v.id === cs.activoId) || vs[vs.length - 1];
  const activaEsUltima = (activa.numero || 0) === latest;
  // Caso simple: una sola versión → línea slim, sin chips.
  if (vs.length < 2) {
    return `<div class="cot-card cotver-card" style="margin-bottom:14px;padding:11px 14px;">
      <div class="cot-card-title" style="margin:0;font-size:13px;">Presupuesto · <strong>${escapeHtml(activa.label)}</strong> <span style="color:var(--ink-faint);font-weight:400;">· presupuesto en vivo</span></div>
    </div>`;
  }
  const chips = vs.map(v => {
    const act = v.id === cs.activoId;
    const r = v.resumen;
    const sub = r ? `${window.fmtMoney(r.valor)} · ${window.fmtPct(r.margenPct)}` : 'sin datos';
    return `<button class="cotver-chip ${act ? 'is-active' : ''}" onclick="presupSetCotVersion('${v.id}')" title="${escapeHtml(v.nota || v.label)}">
       <span class="cotver-chip-label">${escapeHtml(v.label)}${act ? ' · activa' : ''}</span>
       <span class="cotver-chip-sub">${sub}</span>
     </button>`;
  }).join('');
  const nota = activaEsUltima
    ? 'El presupuesto en vivo alimenta esta versión (la última). Las versiones anteriores guardan su resumen congelado.'
    : `Estás en una versión <strong>histórica</strong>. El presupuesto en vivo —lo que edites aquí— alimenta la <strong>última versión (V${latest})</strong>, no esta. Cambia a la última para que coincidan.`;
  return `<div class="cot-card cotver-card" style="margin-bottom:14px;">
    <div class="cotver-head">
      <div class="cot-card-title" style="margin:0;">Presupuesto · <strong>${escapeHtml(activa.label)}</strong>${activaEsUltima ? '' : ' <span style="color:var(--accent,#c2410c);font-weight:600;">(versión histórica)</span>'}</div>
      <div class="cotver-actions"><button class="btn btn-secondary btn-sm" onclick="cotAbrirComparador()">Comparar versiones</button><button class="btn btn-secondary btn-sm" onclick="window.navigateToModule('cotizacion')">Ir a Cotización</button></div>
    </div>
    <div class="cotver-chips">${chips}</div>
    <p class="config-hint" style="margin:10px 0 0;">${nota}</p>
  </div>`;
}
function presupSetCotVersion(id) {
  const project = STATE.currentProject; if (!project) return;
  const cs = ensureCotizaciones(project);
  if (!cs.versiones.find(v => v.id === id)) return;
  cs.activoId = id;
  ensureCotizaciones(project);   // sincroniza el espejo d.cotizacion
  window.markDirty();
  renderPresupuesto();
}

/* V8.3.4 — snapshot COMPLETO del presupuesto de una versión (deep copy). Se
   congela al crear la versión siguiente, para que las versiones históricas
   muestren su presupuesto real bloqueado y no el de la última. */
function snapshotFullBudget(project) {
  const d = project.data;
  return JSON.parse(JSON.stringify({
    servicios: d.servicios || {}, gastos: d.gastos || [], equipos: d.equipos || [], talentos: d.talentos || [], finanzas: d.finanzas || {}
  }));
}
function presupHistSummaryHTML(fin) {
  const cliente = fin.presupCliente || 0;
  const costo = fin.costoProd ? fin.costoProd.cot : 0;
  const gan = fin.gananciaFinal ? fin.gananciaFinal.cot : 0;
  const margen = cliente > 0 ? (gan / cliente) : 0;
  const card = (label, val, color) => `<div style="flex:1;min-width:130px;background:var(--bg-surface-soft);border:1px solid var(--rule);border-radius:var(--radius-sm);padding:11px 13px;"><div style="font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.05em;">${label}</div><div style="font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;${color ? ('color:' + color + ';') : ''}">${val}</div></div>`;
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">${card('Presupuesto cliente', window.fmtMoney(cliente))}${card('Costo de producción', window.fmtMoney(costo))}${card('Ganancia', window.fmtMoney(gan), gan >= 0 ? '#15803d' : '#b91c1c')}${card('Margen', window.fmtPct(margen))}</div>`;
}
function presupHistDetailHTML(snap) {
  const e = escapeHtml;
  const numTd = 'style="text-align:right;font-variant-numeric:tabular-nums;"';
  /* V11.10.0 · BUG-8: la columna por línea ahora aplica el tratamiento del DTE
     cotizado (boleta infla por retención; factura no, porque el IVA es crédito)
     usando la MISMA lógica que el presupuesto en vivo (calcCostoEmpresa). Antes
     mostraba valor×cantidad y lo llamaba "Subtotal", ignorando el impuesto del
     DTE en las versiones históricas. Ahora se llama "Costo Cotizado" y refleja
     el costo real para la empresa, consistente con el resto del sistema. */
  const fmtRow = (label, valor, cant, unidad, dte, sectionKey) => {
    const cc = calcCostoEmpresa(Number(valor) || 0, Number(cant) || 0, dte, sectionKey);
    const costoCel = cc.error
      ? `<span style="color:var(--ink-faint);">${e(cc.error)}</span>`
      : window.fmtMoney(Math.round(cc.value || 0));
    return `<tr><td>${e(label || '—')}</td><td ${numTd}>${window.fmtMoney(Number(valor) || 0)}</td><td ${numTd}>${cant != null ? e(String(cant)) : '1'}${unidad ? (' ' + e(unidad)) : ''}</td><td>${e(dte || '—')}</td><td ${numTd}>${costoCel}</td></tr>`;
  };
  const sect = (titulo, rows) => rows.length ? `<div class="cot-card" style="margin-bottom:12px;"><div class="cot-card-title" style="margin:0 0 8px;">${e(titulo)}</div><div class="cotcmp-wrap"><table class="cotcmp-table"><thead><tr><th>Ítem</th><th ${numTd}>Valor</th><th ${numTd}>Cant.</th><th>DTE</th><th ${numTd}>Costo Cotizado</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></div>` : '';
  const serv = snap.servicios || {}; const serviciosRows = [];
  Object.keys(serv).forEach(dept => { (serv[dept] || []).forEach(r => serviciosRows.push(fmtRow(r.rol || dept, r.valor, r.cantidad, r.unidad, r.dte, 'servicios'))); });
  const out = sect('Servicios — Personal contratado', serviciosRows)
    + sect('Gastos de producción', (snap.gastos || []).map(r => fmtRow(r.item, r.valor, r.cantidad, r.unidad, r.dte, 'gastos')))
    + sect('Técnica', (snap.equipos || []).map(r => fmtRow(r.item, r.valor, r.cantidad, r.unidad, r.dte, 'equipos')))
    + sect('Talentos', (snap.talentos || []).map(r => fmtRow(r.item, r.valor, r.cantidad, r.unidad, r.dte, 'talentos')));
  return out || '<div class="cot-card"><p style="margin:0;font-size:12.5px;color:var(--ink-faint);">Esta versión no tenía filas de presupuesto.</p></div>';
}
function renderPresupuestoHistorico(project, version) {
  document.getElementById('moduleHeaderActions').innerHTML = `<div style="font-size:11px;color:var(--ink-muted);">Versión histórica · <strong style="color:var(--ink-secondary);">solo lectura</strong></div>`;
  const snap = version.presupSnap;
  let detalle;
  if (!snap) {
    const r = version.resumen;
    detalle = `<div class="cot-card" style="margin-bottom:12px;"><p style="margin:0;font-size:12.5px;color:var(--ink-secondary);line-height:1.5;">Esta versión se creó antes de que TakeOS guardara el detalle completo del presupuesto por versión, así que solo se conserva su <strong>resumen</strong>. Las versiones que crees de ahora en adelante guardarán el detalle bloqueado.</p></div>` + (r ? presupHistSummaryHTML({ presupCliente: r.valor || 0, costoProd: { cot: r.costo || 0 }, gananciaFinal: { cot: r.ganancia || 0 } }) : '');
  } else {
    let fin = null;
    try { fin = calcSummaryFin({ state: 'venta', data: { servicios: snap.servicios || {}, gastos: snap.gastos || [], equipos: snap.equipos || [], talentos: snap.talentos || [], finanzas: snap.finanzas || {} } }); } catch (e) { fin = null; }
    detalle = (fin ? presupHistSummaryHTML(fin) : '') + presupHistDetailHTML(snap);
  }
  document.getElementById('moduleContent').innerHTML = `
    ${presupCotVersionBarHTML(project)}
    <div class="cot-card" style="border-left:3px solid var(--accent,#c2410c);margin-bottom:14px;">
      <p style="margin:0;font-size:12.5px;color:var(--ink-secondary);line-height:1.5;">Presupuesto de <strong>${escapeHtml(version.label)}</strong> · versión <strong>histórica</strong>, <strong>bloqueada</strong> (solo lectura). Es el snapshot de esa etapa de la negociación. El presupuesto editable en vivo vive en la última versión.</p>
    </div>
    ${detalle}`;
}

function renderPresupuesto() {
  const project = STATE.currentProject;
  if (!project) return;
  // V8.3.4: si la versión de cotización activa es histórica, mostrar SU presupuesto bloqueado.
  const _cs = ensureCotizaciones(project);
  const _activa = _cs.versiones.find(v => v.id === _cs.activoId);
  if (_activa && (_activa.numero || 0) !== cotUltimaNum(_cs)) { renderPresupuestoHistorico(project, _activa); return; }
  const showReal = window.STATES_WITH_REAL_COST.includes(project.state);
  // Header actions: calculadora tributaria + indicador de modo
  document.getElementById('moduleHeaderActions').innerHTML = `
    <div style="display: flex; gap: 12px; align-items: center;">
      <button class="calc-trigger" onclick="window.openCalculadoraTributaria()" title="Abrir calculadora tributaria">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="13" y1="10" x2="14" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="13" y1="14" x2="14" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="13" y1="18" x2="14" y2="18"/></svg>
        Calculadora tributaria
      </button>
      <button class="calc-trigger" onclick="exportPresupuestoExcel()" title="Exporta el presupuesto a Excel (.xlsx): todas las versiones, una pestaña por versión, con resumen financiero y detalle. Formato moneda chilena, solo lectura.">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Exportar Presupuesto
      </button>
      <button class="calc-trigger" onclick="openVisualizacionPanel()" title="Reordenar y renombrar las sub-secciones de Servicios. El renombrar es estructural (migra las filas a la nueva sub-sección); reordenar es solo el orden en que se muestran.">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        Visualización
      </button>
      <div style="font-size: 11px; color: var(--ink-muted);">
        Modo: <strong style="color: var(--ink-secondary);">${showReal ? 'Cotizado + Real' : 'Solo cotización'}</strong>
        ${!showReal ? '<span style="color: var(--ink-faint);"> · se activa en Preproducción</span>' : ''}
      </div>
      ${showReal ? `<button class="calc-trigger" onclick="toggleBudgetCotizado()" title="Mostrar u ocultar las columnas del cotizado (DTE cotizado, Valor, Cantidad). Tras aprobar quedan congeladas, así que por defecto se ocultan para dar aire al resto.">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="${STATE.ui.budgetCollapseCotizado !== false ? '9 18 15 12 9 6' : '15 18 9 12 15 6'}"/></svg>
        ${STATE.ui.budgetCollapseCotizado !== false ? 'Mostrar detalle cotizado' : 'Ocultar detalle cotizado'}
      </button>` : ''}
    </div>
  `;

  const content = document.getElementById('moduleContent');
  content.innerHTML = `
    <datalist id="dl-personas">${window.buildPersonasDatalist()}</datalist>

    <!-- V8.3.2: indicador + navegación de versión de cotización -->
    ${presupCotVersionBarHTML(project)}

    <!-- TABLA RESUMEN FINANCIERO (recuperada del Master Sheet V2.4.1) -->
    <div class="summary-fin" id="summaryFin"></div>

    <!-- ALERTS PANEL -->
    <div id="presupuestoAlerts"></div>

    <!-- V5.9 (Nota 4): CONTEO DE PERSONAS / ASISTENTES A RODAJE -->
    <div class="headcount-panel" id="headcountPanel">${headcountPanelHTML(project)}</div>

    <!-- SERVICIOS -->
    <div class="dept ${isCollapsed('servicios') ? 'collapsed' : ''}" data-dept-key="servicios">
      <div class="dept-header" onclick="toggleDept('servicios')">
        <div class="dept-title"><span class="dept-chevron">▾</span> Servicios — Personal contratado</div>
        <div class="dept-summary" id="dept-summary-servicios"></div>
      </div>
      <div class="dept-body" id="dept-body-servicios"></div>
    </div>

    <!-- GASTOS -->
    <div class="dept ${isCollapsed('gastos') ? 'collapsed' : ''}" data-dept-key="gastos">
      <div class="dept-header" onclick="toggleDept('gastos')">
        <div class="dept-title"><span class="dept-chevron">▾</span> Gastos <span style="font-style:italic;font-weight:400;color:var(--ink-faint);font-size:11.5px;letter-spacing:0;text-transform:none;">· vinculado con la pestaña Gastos</span></div>
        <div class="dept-summary" id="dept-summary-gastos"></div>
      </div>
      <div class="dept-body" id="dept-body-gastos"></div>
    </div>

    <!-- TÉCNICA (antes "Equipos") -->
    <div class="dept ${isCollapsed('equipos') ? 'collapsed' : ''}" data-dept-key="equipos">
      <div class="dept-header" onclick="toggleDept('equipos')">
        <div class="dept-title"><span class="dept-chevron">▾</span> Técnica</div>
        <div class="dept-summary" id="dept-summary-equipos"></div>
      </div>
      <div class="dept-body" id="dept-body-equipos"></div>
    </div>

    <!-- TALENTOS -->
    <div class="dept ${isCollapsed('talentos') ? 'collapsed' : ''}" data-dept-key="talentos">
      <div class="dept-header" onclick="toggleDept('talentos')">
        <div class="dept-title"><span class="dept-chevron">▾</span> Talentos</div>
        <div class="dept-summary" id="dept-summary-talentos"></div>
      </div>
      <div class="dept-body" id="dept-body-talentos"></div>
    </div>
  `;

  // Pintar contenidos
  renderServiciosBody();
  renderSimpleSection('gastos');
  renderSimpleSection('equipos');
  renderSimpleSection('talentos');
  renderSummaryFin();
  recalcAlerts();
  recalcAllDeptSummaries();
}

function isCollapsed(key) {
  const projectId = STATE.currentProject?.id;
  if (!projectId) return false;
  return STATE.ui.collapsed[`${projectId}:${key}`] === true;
}

function toggleDept(key) {
  const projectId = STATE.currentProject.id;
  const fullKey = `${projectId}:${key}`;
  STATE.ui.collapsed[fullKey] = !STATE.ui.collapsed[fullKey];
  const el = document.querySelector(`.dept[data-dept-key="${key}"]`);
  if (el) el.classList.toggle('collapsed', STATE.ui.collapsed[fullKey]);
}

/* ─── SERVICIOS (con sub-departamentos) ────────────────────────────── */

function renderServiciosBody() {
  const project = STATE.currentProject;
  const d = project.data.servicios;
  const showReal = window.STATES_WITH_REAL_COST.includes(project.state);
  const _bScroll = _budgetCaptureScroll();   // V11.22 · preservar scroll horizontal

  let html = '';
  let _deptIdx = 0;
  for (const dept in d) {
    const di = _deptIdx;
    html += `
      <div class="subdept" data-subdept="${escapeHtml(dept)}">
        <div class="subdept-name">${escapeHtml(dept)}
          <button type="button" class="subdept-ctl" title="Renombrar sub-sección" onclick="renameServiceDept(${di})">✎</button>
          <button type="button" class="subdept-ctl danger" title="Eliminar sub-sección" onclick="deleteServiceDept(${di})">×</button>
        </div>
        <div class="subdept-totals" id="subdept-totals-${escapeHtml(dept)}"></div>
      </div>
      <div style="overflow-x: auto;" data-budget-scroll="servicios:${escapeHtml(dept)}">
        ${renderRoleTable('servicios', dept, d[dept], showReal)}
      </div>
      <div class="row-add" onclick="addRow('servicios', '${escapeHtml(dept)}')" style="margin: 0 12px 12px;">
        + Agregar rol a ${escapeHtml(dept)}
      </div>
    `;
    _deptIdx++;
  }
  // V8.1 (#5): crear nuevas sub-secciones dinámicamente.
  html += `
    <div class="row-add subdept-add-row" onclick="addServiceDept()" style="margin: 6px 12px 14px;">
      + Agregar sub-sección
    </div>
  `;
  document.getElementById('dept-body-servicios').innerHTML = html;
  _budgetRestoreScroll(_bScroll);   // V11.22 · devolver el scroll horizontal a su sitio

  // Calcular subtotales de cada sub-depto
  for (const dept in d) {
    recalcSubdeptTotals(dept);
  }
}

/* ─── V8.1 (#5): SUB-SECCIONES DINÁMICAS DE SERVICIOS ────────────────
   Crear / renombrar / eliminar sub-secciones. Se referencian por índice
   (no por nombre) en los controles para evitar problemas con caracteres
   especiales. Los nombres se sanitizan (sin comillas ni < > para no
   romper los handlers basados en nombre del resto de la tabla). */
function _sanitizeDeptName(s) {
  return String(s == null ? '' : s).replace(/[<>"'`\\]/g, '').replace(/\s+/g, ' ').trim();
}
function addServiceDept() {
  const project = STATE.currentProject;
  const d = project.data.servicios;
  const raw = window.prompt('Nombre de la nueva sub-sección (ej: Sonido, Grip, Maquillaje):', '');
  if (raw === null) return;
  const name = _sanitizeDeptName(raw);
  if (!name) { showToast({ kind: 'warning', title: 'Nombre inválido', body: 'Escribe un nombre para la sub-sección.' }); return; }
  if (d[name]) { showToast({ kind: 'warning', title: 'Ya existe', body: `Ya hay una sub-sección llamada «${name}».` }); return; }
  d[name] = [];
  window.markDirty();
  renderServiciosBody();
  recalcAllDeptSummaries();
  showToast({ kind: 'success', title: 'Sub-sección creada', body: `«${name}» agregada a Servicios. Usa "+ Agregar rol" para sumarle filas.` });
}
function _renameServiceDeptCore(idx, rawNew) {
  const project = STATE.currentProject;
  const d = project.data.servicios;
  const names = Object.keys(d);
  const oldName = names[idx];
  if (!oldName) return false;
  const newName = _sanitizeDeptName(rawNew);
  if (!newName) { showToast({ kind: 'warning', title: 'Nombre inválido', body: 'El nombre no puede quedar vacío.' }); return false; }
  if (newName === oldName) return false;
  if (d[newName]) { showToast({ kind: 'warning', title: 'Ya existe', body: `Ya hay una sub-sección llamada «${newName}».` }); return false; }
  // Reconstruir preservando el orden (renombrar solo cambia la etiqueta;
  // los montos cotizados de las filas no se tocan → respeta la regla madre).
  const rebuilt = {};
  names.forEach(n => { rebuilt[n === oldName ? newName : n] = d[n]; });
  project.data.servicios = rebuilt;
  (rebuilt[newName] || []).forEach(_markRowDirty);   // Pasada 1 · cambió el departamento de estas filas → re-enviarlas (su department_id se resuelve por nombre en el RPC)
  window.markDirty();
  return { oldName, newName };
}
function renameServiceDept(idx) {
  const names = Object.keys(STATE.currentProject.data.servicios);
  const oldName = names[idx];
  if (!oldName) return;
  const raw = window.prompt('Nuevo nombre de la sub-sección:', oldName);
  if (raw === null) return;
  const r = _renameServiceDeptCore(idx, raw);
  if (!r) return;
  renderServiciosBody();
  recalcAllDeptSummaries();
  showToast({ kind: 'success', title: 'Sub-sección renombrada', body: `«${r.oldName}» → «${r.newName}».` });
}
function deleteServiceDept(idx) {
  const project = STATE.currentProject;
  const d = project.data.servicios;
  const names = Object.keys(d);
  const dept = names[idx];
  if (!dept) return;
  const rows = d[dept] || [];
  const hasCotizadoRows = rows.some(r => !r.extra);
  // Regla madre: tras aprobar, no se puede borrar una sub-sección con filas
  // cotizadas (cambiaría el cotizado congelado).
  if (cotizadoLocked(project) && hasCotizadoRows) {
    showToast({ kind: 'error', title: 'No se puede eliminar', body: 'Tras aprobar, una sub-sección con filas cotizadas no se puede eliminar (regla madre: el cotizado no cambia). Renómbrala si necesitas reorganizar.' });
    return;
  }
  const doDelete = () => {
    _budgetQueueDeletes(project, project.data.servicios[dept]);   // Pasada 1 · borrar en el servidor las filas existentes del depto (si no, reaparecen al recargar)
    delete project.data.servicios[dept];
    window.markDirty();
    renderServiciosBody();
    recalcAllDeptSummaries();
    showToast({ kind: 'success', title: 'Sub-sección eliminada', body: `«${dept}» fue eliminada.` });
  };
  if (rows.length === 0) { doDelete(); return; }
  window.showModal({
    title: 'Eliminar sub-sección',
    body: `«${escapeHtml(dept)}» tiene ${rows.length} fila(s). Si la eliminas, se borran junto con la sub-sección. ¿Continuar?`,
    confirmLabel: 'Eliminar',
    danger: true,
    onConfirm: doDelete
  });
}

/* ─── V10.2.0 (#2) · PANEL "VISUALIZACIÓN" ───────────────────────────────
   Reordena y renombra las sub-secciones de Servicios desde un panel dedicado.
   Reordenar es solo el orden de pintado (reconstruye el objeto con las llaves
   en otro orden; los montos cotizados no se tocan → seguro incluso tras
   aprobar). Renombrar reusa _renameServiceDeptCore (migración estructural de
   la llave vieja a la nueva). Este botón es además el punto de entrada
   forward-compatible para el selector de vista (SMB / pestañas por
   departamento) de la nota de horizonte H2 — que NO se implementa aquí. Las 4
   secciones de nivel superior (Servicios/Gastos/Técnica/Talentos) tienen llave
   fija y quedan fuera de este panel a propósito. */
function moveServiceDept(idx, dir) {
  const project = STATE.currentProject;
  const d = project.data.servicios;
  const names = Object.keys(d);
  const j = idx + dir;
  if (j < 0 || j >= names.length) return;
  const order = names.slice();
  const t = order[idx]; order[idx] = order[j]; order[j] = t;
  const rebuilt = {};
  order.forEach(n => { rebuilt[n] = d[n]; });   // solo cambia el orden de las llaves, no los datos
  project.data.servicios = rebuilt;
  window.markDirty();
  renderServiciosBody();
  recalcAllDeptSummaries();
  openVisualizacionPanel();   // re-pintar el panel con el nuevo orden
}
function vizRenameInput(idx, value) {
  const r = _renameServiceDeptCore(idx, value);
  if (!r) { openVisualizacionPanel(); return; }   // inválido/duplicado/igual: restaurar el panel
  renderServiciosBody();
  recalcAllDeptSummaries();
  openVisualizacionPanel();
  showToast({ kind: 'success', title: 'Sub-sección renombrada', body: `«${r.oldName}» → «${r.newName}».` });
}
function openVisualizacionPanel() {
  const project = STATE.currentProject;
  if (!project) return;
  const d = project.data.servicios || {};
  const names = Object.keys(d);
  const list = names.length
    ? names.map((n, i) => {
        const count = (d[n] || []).length;
        return `<div class="viz-dept-row">
          <div class="viz-dept-ord">
            <button type="button" class="pr-tool" title="Subir" onclick="moveServiceDept(${i}, -1)" ${i === 0 ? 'disabled' : ''}>⌃</button>
            <button type="button" class="pr-tool" title="Bajar" onclick="moveServiceDept(${i}, 1)" ${i === names.length - 1 ? 'disabled' : ''}>⌄</button>
          </div>
          <input class="input viz-dept-name" value="${escapeHtml(n)}" onchange="vizRenameInput(${i}, this.value)" title="Renombrar: migra las filas a la nueva sub-sección. Los montos cotizados no cambian.">
          <span class="viz-dept-count">${count} fila${count === 1 ? '' : 's'}</span>
        </div>`;
      }).join('')
    : '<p class="config-hint" style="margin:4px 0;">Servicios aún no tiene sub-secciones. Créalas con «+ Agregar sub-sección» en la tabla de Servicios.</p>';
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-backdrop" onclick="window.closeModal()">
      <div class="modal" onclick="event.stopPropagation()" style="max-width: 560px;">
        <div class="modal-header">
          <div class="modal-title">Visualización · Sub-secciones de Servicios</div>
          <div style="font-size: 12px; color: var(--ink-muted); margin-top: 4px;">Reordena con ⌃⌄ y renombra editando el nombre. Renombrar migra las filas a la nueva sub-sección; reordenar solo cambia el orden en pantalla. Los montos cotizados no se tocan.</div>
        </div>
        <div class="modal-body">
          <div class="viz-dept-list">${list}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" onclick="window.closeModal()">Listo</button>
        </div>
      </div>
    </div>`;
}

/* ─── GASTOS / EQUIPOS / TALENTOS (sin sub-departamentos) ──────────── */

function renderSimpleSection(sectionKey) {
  const project = STATE.currentProject;
  if (sectionKey === 'gastos') _syncGastosCostoReal(project);   // 4a · Costo Real derivado de los gastos
  const items = project.data[sectionKey];
  const showReal = window.STATES_WITH_REAL_COST.includes(project.state);

  const labels = {
    gastos:   { firstCol: 'Ítem',  addLabel: '+ Agregar gasto' },
    equipos:  { firstCol: 'Ítem',  addLabel: '+ Agregar ítem técnico' },
    talentos: { firstCol: 'Rol',   addLabel: '+ Agregar talento' }
  };
  const cfg = labels[sectionKey];

  const _bScroll = _budgetCaptureScroll();   // V11.22 · preservar scroll horizontal
  document.getElementById(`dept-body-${sectionKey}`).innerHTML = `
    <div style="overflow-x: auto;" data-budget-scroll="${sectionKey}">
      ${renderRoleTable(sectionKey, null, items, showReal, cfg.firstCol)}
    </div>
    <div class="row-add" onclick="addRow('${sectionKey}', null)" style="margin: 0 12px 12px;">
      ${cfg.addLabel}
    </div>
  `;
  _budgetRestoreScroll(_bScroll);   // V11.22 · devolver el scroll horizontal a su sitio
}

/* ─── TABLA DE ROLES (compartida) ───────────────────────────────────── */

function renderRoleTable(sectionKey, dept, items, showReal, firstColLabel) {
  // V5.1.1: nombres de columnas según contexto
  const firstCol = sectionKey === 'servicios' ? 'Rol' : (firstColLabel || 'Ítem');
  const nameColLabel = sectionKey === 'gastos'   ? 'Proveedor'
                     : sectionKey === 'equipos'  ? 'Rental / Proveedor'
                     : 'Nombre';
  const dteOptional = sectionKey === 'gastos' || sectionKey === 'equipos';
  const tableId = sectionKey === 'servicios' ? `tbl-servicios-${escapeHtml(dept)}` : `tbl-${sectionKey}`;

  // V5.5 (Nota 1): post-aprobación, el detalle del cotizado (DTE cotizado,
  // Valor, Cantidad) ya está congelado y estorba. Por defecto se colapsa;
  // el usuario lo expande con el botón "Detalle cotizado" de la barra.
  let budgetStateClass = '';
  if (showReal) budgetStateClass = (STATE.ui.budgetCollapseCotizado !== false) ? 'collapse-cot' : 'cot-expanded';

  // V8.1 (#3): la columna "Confirmado" solo existe después de aprobar el
  // proyecto (Preproducción+). En etapa Venta no hay nada que confirmar.
  const showConfirmado = cotizadoLocked(STATE.currentProject);
  const confHeaderHTML = showConfirmado
    ? _budgetColTh(sectionKey, 'conf', 'ctr', `Conf. <span class="tt" data-tip="Marcar como confirmado significa que esta persona/ítem está cerrado en su negociación. Al marcar:\n\n• Aparece en el módulo Crew.\n• Entra en los correos automáticos de producción.\n• Cuenta en el KPI de personas confirmadas.">?</span>`)
    : '';

  // V10.1.0 (#1): orden por columnas (solo presentación). data-row-idx sigue
  // siendo el índice REAL del array; aquí solo cambia el orden de pintado.
  const _sortActive = _budgetSortState(sectionKey, dept);
  const _order = _budgetDisplayOrder(items, sectionKey, dept);
  const _deptArg = sectionKey === 'servicios' ? ("'" + escapeHtml(dept) + "'") : 'null';
  const _sortBar = _sortActive
    ? `<div class="budget-sort-bar">Orden por columna activo (solo en pantalla; no altera el orden guardado) <button type="button" class="budget-sort-restore" onclick="budgetSortClear('${sectionKey}', ${_deptArg})">↺ Restaurar orden</button></div>`
    : '';
  const _costoRealTip = '<span class="tt" data-tip="Ingresa el costo EFECTIVO para la empresa, no el líquido que recibe el proveedor.\n\n• Boleta de honorarios: ingresa el monto BRUTO (con retención incluida). Ese es el costo real para la empresa.\n• Factura: ingresa el monto NETO (sin IVA). El IVA no es costo real porque se recupera contra el crédito fiscal.\n\nPara convertir entre líquido y bruto, usa la Calculadora tributaria en la barra superior.">?</span>';
  // V11.22 · cada columna sale por un helper redimensionable; rTh = ordenable + grip.
  const rTh = (label, colId, cls, tip) => _budgetSortTh(label, sectionKey, dept, colId, 'bcol-resizable' + (cls ? ' ' + cls : ''), ' style="width:' + _budgetColWGet(sectionKey, colId) + 'px;"', tip || '', _budgetColGrip(sectionKey, colId));
  // Ancho total de la tabla = suma de columnas VISIBLES (las de detalle cotizado se
  // ocultan al colapsar). table-layout:fixed lo respeta exacto y, al crecer, scrollea.
  const _cotVisible = budgetStateClass !== 'collapse-cot';
  let _tw = _budgetColWGet(sectionKey, 'nombre') + _budgetColWGet(sectionKey, 'rolItem');
  if (_cotVisible) _tw += _budgetColWGet(sectionKey, 'dte') + _budgetColWGet(sectionKey, 'valor') + _budgetColWGet(sectionKey, 'cantidad');
  _tw += _budgetColWGet(sectionKey, 'unidad') + _budgetColWGet(sectionKey, 'costoCotizado');
  if (showReal) _tw += _budgetColWGet(sectionKey, 'costoReal') + _budgetColWGet(sectionKey, 'dteReal') + _budgetColWGet(sectionKey, 'horaExtra');
  if (showConfirmado) _tw += _budgetColWGet(sectionKey, 'conf');
  _tw += BUDGET_MENU_W;
  return `
    ${_sortBar}
    <table class="data-table budget-table ${budgetStateClass}" id="${tableId}" data-bsec-table="${sectionKey}" style="width:${_tw}px;">
      <thead>
        <tr>
          ${rTh(nameColLabel, 'nombre', '', '')}
          ${rTh(firstCol, 'rolItem', '', '')}
          ${_budgetColTh(sectionKey, 'dte', 'col-cot-detail', `DTE${dteOptional ? ' <span style="color: var(--ink-faint); font-weight: 400;">(opc.)</span> <span class="tt" data-tip="En Gastos y Equipos el DTE es opcional porque muchos ítems son contingencias, cajas de producción, estimaciones abiertas o gastos aún sin proveedor confirmado.\n\nSi no seleccionas DTE, el costo se calcula como valor × cantidad sin retención (asumiendo factura).\n\nLlénalo cuando sepas el documento — eso permite que la conversión a costo empresa sea exacta.">?</span>' : ''}`)}
          ${rTh('Valor', 'valor', 'num col-cot-detail', '')}
          ${rTh('Cant.', 'cantidad', 'num col-cot-detail', '')}
          ${_budgetColTh(sectionKey, 'unidad', '', 'Unidad')}
          ${rTh('Costo cotizado', 'costoCotizado', 'num', '')}
          ${showReal ? rTh('Costo real ', 'costoReal', 'num', _costoRealTip) : ''}
          ${showReal ? _budgetColTh(sectionKey, 'dteReal', '', 'DTE real <span class="tt" data-tip="Documento tributario realmente emitido por el proveedor. Por defecto coincide con el DTE cotizado. Cambiarlo NO altera el cotizado (congelado al aprobar); es declarativo, para pagos y trazabilidad.">?</span>') : ''}
          ${showReal ? rTh('Horas extra ', 'horaExtra', 'num', '<span class="tt" data-tip="Horas extra de la fila como costo empresa (ya con la conversión por DTE). Ingresa el N° de horas en la celda; la HE usa el valor hora (valor de la fila ÷ 10) y el recargo del proyecto. El ⚙ de la fila permite tarifa plana o fórmula propia; este ⚙ fija el recargo por defecto del proyecto. Se suma al Costo de Producción real, aparte del costo base.">?</span><button type="button" class="he-head-cog" title="Fijar el recargo por defecto de las horas extra del proyecto" onclick="event.stopPropagation(); openHeProyectoDefault();">⚙</button>') : ''}
          ${confHeaderHTML}
          <th style="width: ${BUDGET_MENU_W}px;"></th>
        </tr>
      </thead>
      <tbody>
        ${_order.map(idx => renderRoleRow(sectionKey, dept, items[idx], idx, showReal)).join('')}
      </tbody>
    </table>
  `;
}

function renderRoleRow(sectionKey, dept, item, idx, showReal) {
  const ref = sectionKey === 'servicios' ? `'servicios','${escapeHtml(dept)}',${idx}` : `'${sectionKey}',null,${idx}`;
  // V10.1.0 (#1): con un orden por columna activo, el arrastre manual se desactiva
  // en esta tabla (la vista ordenada no mapea a posiciones del array sin corromper
  // el orden curado). "Restaurar orden" vuelve a habilitarlo.
  const _dragHandle = _budgetSortState(sectionKey, dept)
    ? '<span class="row-drag-handle is-disabled" title="Reordenar a mano está desactivado mientras haya un orden por columna activo. Usa «Restaurar orden» para volver a arrastrar.">⋮⋮</span>'
    : '<span class="row-drag-handle" title="Arrastra para reordenar (dentro del mismo departamento)" onmousedown="rowHandleDown(this)">⋮⋮</span>';
  const calc = calcCostoEmpresa(item.valor, item.cantidad, item.dte, sectionKey);
  const isConfirmed = item.confirmado;
  const roleOrItemField = sectionKey === 'servicios' ? 'rol' : 'item';
  const roleOrItemValue = sectionKey === 'servicios' ? item.rol : item.item;
  // V5.1.1: indicador visual cuando el nombre ingresado no está en BD
  const nameInBD = item.nombre && window.BD_PERSONAS[item.nombre];
  const nameNotInBD = item.nombre && !window.BD_PERSONAS[item.nombre];
  // V5.2.2: bloqueo de cotizados después de aprobación.
  // Filas marcadas como `extra` (agregadas post-aprobación) son siempre editables.
  // V5.3.1 (Nota 1 — REGLA MADRE): el DTE cotizado vuelve a quedar
  // bloqueado al aprobar, junto con Rol/Ítem, Valor y Cantidad. El
  // cotizado NUNCA puede cambiar después de aprobar. La editabilidad
  // post-aprobación que pedía la antigua Nota 5 se traslada al nuevo
  // campo `dteReal` (columna DTE Real, editable en Preproducción+), que
  // es declarativo y NO toca el cotizado.
  const locked = cotizadoLocked(STATE.currentProject) && !item.extra;
  const isExtra = item.extra === true;
  // V8.1 (#3): la celda "Confirmado" solo se muestra post-aprobación.
  const showConfirmado = cotizadoLocked(STATE.currentProject);
  // V5.10 (Nota 1): el delta del ítem se calcula también cuando el cotizado
  // es $0 (ej. un rol que iba gratis y al final se paga). Antes solo se
  // mostraba si el cotizado era > 0, ocultando deltas reales válidos.
  let deltaInitText = '', deltaInitClass = '';
  if (showReal && item.costoReal !== null && item.costoReal !== undefined && calc.value !== null) {
    const realInit = getCostoReal(item, sectionKey).value || 0;
    const deltaInit = realInit - calc.value;
    if (Math.round(deltaInit) !== 0) {
      deltaInitText = fmtDeltaWithSymbol(deltaInit);
      deltaInitClass = deltaClassCosto(deltaInit);
    }
  }
  const disabledAttr = locked ? 'disabled' : '';
  const readonlyAttr = locked ? 'readonly' : '';
  // V10.5.0: estado de Horas Extra de la fila (heConfig persistido).
  const heCfg = item.heConfig || null;
  const hePlana = !!(heCfg && heCfg.usaProyecto === false && heCfg.modo === 'plana');
  const heOverride = !!(heCfg && heCfg.usaProyecto === false);
  const heHoras = (heCfg && Number(heCfg.horas) > 0) ? heCfg.horas : '';
  // Síntoma 1 (HE Tarifa Plana): hay config de HE pero el costo dio 0 (p.ej. unidad ≠ «Jornadas»,
  // sin valor hora del cual calcular). Avisar y ofrecer el ⚙ en vez del «—» silencioso.
  const heNeedsCfg = !!(heCfg && !item.horaExtra);
  const dteRealVal = (item.dteReal !== undefined && item.dteReal !== null) ? item.dteReal : (item.dte || '');
  /* V11.22 (Pasada 4a) · en la sección "Gastos de producción" el Costo Real ya no
     se tipea a mano: es la SUMA de los gastos registrados en el módulo Gastos
     asociados a esta línea (vía _syncGastosCostoReal, que escribe item.costoReal).
     La celda pasa a solo lectura; las demás secciones siguen editables. */
  const _esGastosSec = sectionKey === 'gastos';
  /* 4a/#7/#3 · en "Gastos" el Costo Real es DERIVADO (suma de los gastos del
     módulo) y de solo lectura SOLO si la línea tiene una caja vinculada Y hay
     gastos reales (> $0). Sin caja vinculada, o con caja pero $0 gastado, se edita
     libremente (un gasto puntual con un único proveedor no necesita un presupuesto;
     y si el real cae a $0 vuelve a ser editable). */
  const _gastosDerivado = _esGastosSec && (typeof goLineaTieneCaja === 'function')
    && goLineaTieneCaja(STATE.currentProject, item.item)
    && goLineaRealGastado(STATE.currentProject, item.item) > 0;
  const _crShow = (item.costoReal ? window.displayMoneyInputValue(item.costoReal) : '0');
  const costoRealCell = _gastosDerivado
    ? `<td class="num go-cr-derivado" onclick="window.navigateToModule('gastos')" title="Costo real = suma de los gastos registrados en el módulo Gastos asociados a esta línea («${escapeHtml(item.item || '')}»). Clic para ir a la pestaña Gastos. No se edita a mano." style="cursor:pointer;">
          <span class="cr-money-wrap"><span class="cr-money-sign">$</span><span style="font-variant-numeric:tabular-nums;">${_crShow}</span></span>
          <span class="delta-inline ${deltaInitClass}">${deltaInitText}</span>
        </td>`
    : `<td class="num" ondblclick="openCostoRealCalc(${ref})" title="Doble clic para calcular el costo real (costo empresa) con el DTE de la fila">
          <span class="cr-money-wrap"><span class="cr-money-sign">$</span><input type="text" inputmode="numeric" class="cell-input num cr-money-input" data-costo-real
                 value="${window.displayMoneyInputValue(item.costoReal)}"
                 placeholder="—"
                 onchange="onMoneyInput(this, ${ref}, 'costoReal'); afterRowChange(${ref});"></span>
          <span class="delta-inline ${deltaInitClass}" data-delta-inline>${deltaInitText}</span>
        </td>`;

  return `
    <tr class="${isConfirmed ? 'confirmed' : ''} ${isExtra ? 'is-extra' : ''} ${locked ? 'is-locked' : ''}" data-row-idx="${idx}" data-sec="${sectionKey}" data-dept="${sectionKey === 'servicios' ? escapeHtml(dept) : ''}" ondragstart="rowDragStart(event)" ondragover="rowDragOver(event)" ondrop="rowDrop(event)" ondragend="rowDragEnd(event)">
      <td>
        <div class="cell-name-row">
          ${_dragHandle}
          <div class="cell-name-wrap" style="flex:1;min-width:0;">
          <div class="combobox-wrap">
            <input class="cell-input combobox-input ${item.nombre ? '' : 'is-empty'}"
                   value="${escapeHtml(item.nombre || '')}"
                   placeholder="—"
                   autocomplete="off"
                   onfocus="comboboxOpen(this)"
                   oninput="comboboxFilter(this); updateRowField(${ref}, 'nombre', this.value); afterRowChange(${ref});"
                   onblur="comboboxCloseDelayed(this)"
                   onchange="updateRowField(${ref}, 'nombre', this.value); afterRowChange(${ref});">
            <div class="combobox-dropdown" hidden></div>
          </div>
          <div class="cell-name-meta">
            ${nameNotInBD ? `<span class="cell-name-warn" data-tip="+ Agregar a la BD" style="cursor:pointer;" onclick="crewAddToBD('${escapeHtml(item.nombre || '')}')">●</span>` : ''}
            ${isExtra ? '<span class="extra-badge" data-tip="Ítem agregado después de la aprobación del proyecto. Editable libremente. No afecta la cotización original.">EXTRA</span>' : ''}
            <button type="button" class="row-note-btn ${item.nota ? 'has-note' : ''}" data-tip="${item.nota ? escapeHtml(_noteTip(item.nota, item.notaFecha, item.notaAutor)) : 'Agregar nota a esta fila (contexto interno, no aparece en cotización)'}" onclick="openRowNote(${ref})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/></svg></button>
            <label class="row-pp" data-tip="Pronto pago negociado para esta fila"><input type="checkbox" ${item.prontoPago ? 'checked' : ''} onchange="updateRowField(${ref}, 'prontoPago', this.checked); afterRowChange(${ref});">PP</label>
          </div>
          </div>
        </div>
      </td>
      <td>
        <input class="cell-input cell-rol ${roleOrItemValue ? '' : 'is-empty'}"
               value="${escapeHtml(roleOrItemValue || '')}"
               placeholder="${escapeHtml(sectionKey === 'servicios' ? 'Rol' : 'Ítem')}"
               ${readonlyAttr}
               onchange="updateRowField(${ref}, '${roleOrItemField}', this.value);">
      </td>
      <td class="col-cot-detail">
        <select class="cell-select ${item.dte ? '' : (sectionKey === 'servicios' || sectionKey === 'talentos' ? 'is-empty' : '')}"
                ${disabledAttr}
                onchange="updateRowField(${ref}, 'dte', this.value || null); afterRowChange(${ref});">
          <option value="">${sectionKey === 'gastos' || sectionKey === 'equipos' ? '— Opcional —' : '— DTE —'}</option>
          ${DTE_OPTIONS.map(o =>
            `<option value="${o.value}" ${item.dte === o.value ? 'selected' : ''}>${o.label}</option>`
          ).join('')}
        </select>
      </td>
      <td class="num col-cot-detail">
        <input type="text" inputmode="numeric" class="cell-input num"
               value="${window.displayMoneyInputValue(item.valor)}"
               placeholder="—"
               ${readonlyAttr}
               onchange="onMoneyInput(this, ${ref}, 'valor'); afterRowChange(${ref});">
      </td>
      <td class="num col-cot-detail">
        <input type="number" step="0.5" class="cell-input num"
               value="${item.cantidad ?? ''}"
               placeholder="0"
               ${readonlyAttr}
               onchange="updateRowField(${ref}, 'cantidad', window.readNum(this) ?? 0); afterRowChange(${ref});">
      </td>
      <td>
        ${renderUnidadCell(ref, item.unidad)}
      </td>
      <td class="num">
        <span class="cost-cell ${calc.error ? 'error' : (calc.value === 0 ? 'zero' : '')}" data-cost-cotizado>
          ${calc.error ? calc.error : window.fmtMoney(calc.value)}
        </span>
      </td>
      ${showReal ? `
        ${costoRealCell}
        <td>
          <select class="cell-select ${dteRealVal ? '' : 'is-empty'}"
                  onchange="updateRowField(${ref}, 'dteReal', this.value || null);">
            <option value="">— DTE real —</option>
            ${DTE_OPTIONS.map(o =>
              `<option value="${o.value}" ${dteRealVal === o.value ? 'selected' : ''}>${o.label}</option>`
            ).join('')}
          </select>
        </td>
        <td class="num">
          <div class="he-cell-wrap">
            <input type="number" step="0.5" min="0" class="he-horas-input ${hePlana ? 'is-disabled' : ''}"
                   value="${heHoras}" placeholder="0" ${hePlana ? 'disabled' : ''}
                   title="N° de horas extra. La HE se calcula con el valor hora (valor de la fila ÷ 10) y el recargo del proyecto. Usa el ⚙ para una tarifa plana o una fórmula propia."
                   onchange="setHeHoras(${ref}, this.value)">
            <span class="he-cost ${item.horaExtra ? 'he-on' : (heNeedsCfg ? 'needs-cfg' : 'zero')}" data-he-cell${heNeedsCfg ? ` onclick="openHorasExtraCalc(${ref})" style="color:var(--warning);cursor:pointer;text-decoration:underline dotted;white-space:nowrap;" title="Ingresaste horas, pero esta fila no es «Jornadas»: no hay un valor hora del cual calcular la HE. Haz clic para fijar un valor hora propio o un monto plano."` : ''}>${item.horaExtra ? window.fmtMoney(item.horaExtra) : (heNeedsCfg ? '⚠ definir' : '—')}</span>
            <button type="button" class="he-cog ${heOverride ? 'is-override' : ''}" title="Ajustar las horas extra de esta fila (tarifa plana, fórmula propia, IVA)" onclick="openHorasExtraCalc(${ref})">⚙</button>
          </div>
        </td>
      ` : ''}
      ${showConfirmado ? `<td class="ctr">
        <input type="checkbox" ${isConfirmed ? 'checked' : ''}
               onchange="updateRowField(${ref}, 'confirmado', this.checked); afterRowConfirmToggle(${ref});">
        <label class="row-no-rodaje" data-tip="Confirmado pero NO va al rodaje: lo deja fuera de la Hoja de Llamado y del correo de Producción. Sigue contando para pagos."><input type="checkbox" ${item.noVaRodaje ? 'checked' : ''} onchange="updateRowField(${ref}, 'noVaRodaje', this.checked); afterRowConfirmToggle(${ref});">no rodaje</label>
      </td>` : ''}
      <td>
        ${locked ? '' : `<button class="row-delete" title="Eliminar"
                onclick="deleteRow(${ref})">×</button>`}
      </td>
    </tr>
  `;
}

/* ─── MUTACIONES DEL MODELO ─────────────────────────────────────────── */

function updateRowField(sectionKey, dept, idx, field, value) {
  const project = STATE.currentProject;
  if (sectionKey === 'servicios') {
    project.data.servicios[dept][idx][field] = value;
    window._markRowDirty(project.data.servicios[dept][idx]);   // Pasada 1 · chokepoint de edición de campo de fila
  } else {
    project.data[sectionKey][idx][field] = value;
    window._markRowDirty(project.data[sectionKey][idx]);
  }
}

/* ─── V9.6.18 · DRAG & DROP DE FILAS DEL PRESUPUESTO ──────────────────────
   Reordena filas DENTRO de su mismo departamento (servicios) o sección
   (gastos/equipos/talentos). NO permite mover entre departamentos (decisión
   de diseño: para eso se elimina y recrea). HTML5 nativo, sin librería, igual
   que Plan de Rodaje / Entregables. El orden vive en el array -> markDirty lo
   guarda. El agarre (⋮⋮) activa draggable solo al tomarlo, para no interferir
   con la selección de texto en los inputs. */
let _budgetDrag = null;
function rowHandleDown(el) { const tr = el.closest('tr'); if (tr) tr.setAttribute('draggable', 'true'); }
function rowDragStart(ev) {
  const tr = ev.currentTarget;
  if (_budgetSortState(tr.dataset.sec, tr.dataset.dept || '')) { ev.preventDefault(); return; }  // V10.1.0: sin drag con sort activo
  _budgetDrag = { sec: tr.dataset.sec, dept: tr.dataset.dept || '', idx: Number(tr.dataset.rowIdx) };
  ev.dataTransfer.effectAllowed = 'move';
  try { ev.dataTransfer.setData('text/plain', tr.dataset.rowIdx); } catch (e) {}
  tr.classList.add('row-dragging');
}
function _budgetDragMismatch(tr) {
  return !_budgetDrag || tr.dataset.sec !== _budgetDrag.sec || (tr.dataset.dept || '') !== _budgetDrag.dept;
}
function rowDragOver(ev) {
  const tr = ev.currentTarget;
  if (_budgetDragMismatch(tr)) return;   // sin cruce de departamento/sección
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'move';
  // V10.3.1 (#6): línea roja de destino (antes/después según la mitad del cursor)
  const tbody = tr.parentNode;
  if (tbody) tbody.querySelectorAll('.row-drop-before,.row-drop-after').forEach(x => x.classList.remove('row-drop-before', 'row-drop-after'));
  const rect = tr.getBoundingClientRect();
  const after = (ev.clientY - rect.top) > rect.height / 2;
  tr.classList.add(after ? 'row-drop-after' : 'row-drop-before');
}
function rowDrop(ev) {
  const tr = ev.currentTarget;
  if (_budgetDragMismatch(tr)) { rowDragEnd(ev); return; }
  ev.preventDefault();
  const sec = _budgetDrag.sec;
  const dept = _budgetDrag.dept === '' ? null : _budgetDrag.dept;
  const from = _budgetDrag.idx;
  const overIdx = Number(tr.dataset.rowIdx);
  const rect = tr.getBoundingClientRect();
  const after = (ev.clientY - rect.top) > rect.height / 2;   // mitad inferior -> soltar después
  let to = overIdx + (after ? 1 : 0);
  const arr = (sec === 'servicios') ? (STATE.currentProject.data.servicios[dept] || []) : (STATE.currentProject.data[sec] || []);
  if (!arr.length) { rowDragEnd(ev); return; }
  if (from < to) to--;                 // ajuste por el elemento removido
  if (to < 0) to = 0; if (to > arr.length - 1) to = arr.length - 1;
  if (from !== to) {
    const moved = arr.splice(from, 1)[0];
    arr.splice(to, 0, moved);
    arr.forEach(_markRowDirty);   // Pasada 1 · cambió la posición de las filas → re-enviarlas para persistir el orden
    window.markDirty();
  }
  _budgetDrag = null;
  if (sec === 'servicios') renderServiciosBody(); else renderSimpleSection(sec);
}
function rowDragEnd(ev) {
  _budgetDrag = null;
  document.querySelectorAll('tr.row-dragging,tr.row-drop-before,tr.row-drop-after').forEach(x => x.classList.remove('row-dragging', 'row-drop-before', 'row-drop-after'));
  document.querySelectorAll('tr[draggable]').forEach(x => x.removeAttribute('draggable'));
}

/* ─── V10.1.0 (#1) · ORDEN POR COLUMNAS DEL PRESUPUESTO ───────────────────
   Ordenamiento SOLO de presentación y TRANSITORIO. NO toca el array
   (project.data...[]) ni el orden manual del drag, y NO persiste (vive en
   STATE.ui.budgetSort, jamás en project.data, nunca llama markDirty). En
   render se calcula un orden de visualización (índices reales reordenados);
   las filas se pintan en ese orden pero data-row-idx sigue siendo el índice
   REAL del array, así updateRowField / afterRowChange / etc. escriben a la
   fila correcta. Mientras hay sort activo el arrastre manual se desactiva en
   esa tabla (arrastrar en vista ordenada no puede mapear a posiciones del
   array sin corromper el orden curado); "Restaurar orden" limpia el sort y
   reactiva el drag. Por tabla: clave = sectionKey + '|' + (dept||''). */
function _budgetSortKey(sectionKey, dept) { return sectionKey + '|' + (dept || ''); }
function _budgetSortState(sectionKey, dept) { return (STATE.ui.budgetSort || {})[_budgetSortKey(sectionKey, dept)] || null; }
function _budgetSortValue(item, sectionKey, colKey) {
  switch (colKey) {
    case 'nombre':        return { t: 'text', v: item.nombre || '' };
    case 'rolItem':       return { t: 'text', v: (sectionKey === 'servicios' ? (item.rol || '') : (item.item || '')) };
    case 'valor':         return { t: 'num',  v: item.valor };
    case 'cantidad':      return { t: 'num',  v: item.cantidad };
    case 'costoCotizado': return { t: 'num',  v: (calcCostoEmpresa(item.valor, item.cantidad, item.dte, sectionKey) || {}).value };
    case 'costoReal':     return { t: 'num',  v: (getCostoReal(item, sectionKey) || {}).value };
    case 'horaExtra':    return { t: 'num',  v: item.horaExtra };
    default:              return { t: 'text', v: '' };
  }
}
function _budgetSortEmpty(sv) {
  if (sv.v === null || sv.v === undefined) return true;
  if (sv.t === 'text') return String(sv.v).trim() === '';
  return isNaN(Number(sv.v));
}
function _budgetDisplayOrder(items, sectionKey, dept) {
  // Índices REALES del array, en el orden visual a renderizar.
  const order = items.map((_, i) => i);
  const s = _budgetSortState(sectionKey, dept);
  if (!s) return order;                                  // sin sort: orden del array (manual / drag)
  const dir = s.dir === 'asc' ? 1 : -1;
  order.sort((a, b) => {
    const sa = _budgetSortValue(items[a], sectionKey, s.col);
    const sb = _budgetSortValue(items[b], sectionKey, s.col);
    const ea = _budgetSortEmpty(sa), eb = _budgetSortEmpty(sb);
    if (ea && eb) return a - b;                           // ambos vacíos: estable por índice real
    if (ea) return 1;                                     // vacíos siempre al final (en ambas direcciones)
    if (eb) return -1;
    let cmp;
    if (sa.t === 'num') cmp = Number(sa.v) - Number(sb.v);
    else cmp = String(sa.v).localeCompare(String(sb.v), 'es', { sensitivity: 'base', numeric: true });
    if (cmp === 0) return a - b;                          // empate: estable por índice real
    return cmp * dir;
  });
  return order;
}
function budgetSortBy(sectionKey, dept, colKey) {
  if (!STATE.ui.budgetSort) STATE.ui.budgetSort = {};
  const k = _budgetSortKey(sectionKey, dept);
  const cur = STATE.ui.budgetSort[k];
  // toggle desc <-> asc; para volver al orden manual se usa "Restaurar orden".
  if (!cur || cur.col !== colKey) STATE.ui.budgetSort[k] = { col: colKey, dir: 'desc' };
  else STATE.ui.budgetSort[k] = { col: colKey, dir: cur.dir === 'desc' ? 'asc' : 'desc' };
  if (sectionKey === 'servicios') renderServiciosBody(); else renderSimpleSection(sectionKey);
}
function budgetSortClear(sectionKey, dept) {
  if (STATE.ui.budgetSort) delete STATE.ui.budgetSort[_budgetSortKey(sectionKey, dept)];
  if (sectionKey === 'servicios') renderServiciosBody(); else renderSimpleSection(sectionKey);
}
function _budgetSortTh(label, sectionKey, dept, colKey, extraClass, styleAttr, tipHTML, tailHTML) {
  const deptArg = sectionKey === 'servicios' ? ("'" + escapeHtml(dept) + "'") : 'null';
  const s = _budgetSortState(sectionKey, dept);
  const on = s && s.col === colKey;
  const ind = on ? ('<span class="sort-ind on">' + (s.dir === 'asc' ? '▲' : '▼') + '</span>') : '<span class="sort-ind"></span>';
  const cls = 'sortable' + (extraClass ? ' ' + extraClass : '');
  return '<th class="' + cls + '" data-bsec="' + sectionKey + '" data-bcol="' + colKey + '"' + (styleAttr || '') + ' onclick="budgetSortBy(\'' + sectionKey + '\', ' + deptArg + ', \'' + colKey + '\')">' + label + (tipHTML || '') + ind + (tailHTML || '') + '</th>';
}

/* ─── V11.22 · ancho de columna redimensionable a mano (TODAS las columnas) ───
   Excel real: la tabla usa table-layout:fixed y su ancho TOTAL = suma de columnas
   (seteado inline al renderizar). Al arrastrar el borde de un encabezado, esa
   columna crece y la tabla crece con ella: las de la derecha se empujan y aparece
   scroll horizontal (no se reparten un ancho fijo). El arrastre es 1:1 con el
   cursor, con tope de 300px por columna. Se guarda por (sección, columna) en
   localStorage y se reaplica en cada render; doble clic restablece. */
var _BUDGET_COL_CFG = {
  nombre:        { min: 120, def: 220, max: 300 },
  rolItem:       { min: 120, def: 180, max: 300 },
  dte:           { min: 100, def: 180, max: 180 },   // DTE y DTE real: MISMAS medidas (mismo desglose de opciones)
  dteReal:       { min: 100, def: 180, max: 180 },
  horaExtra:     { min: 90,  def: 150, max: 150 },
  costoReal:     { min: 110, def: 120, max: 150 },   // Costo real y Valor comparten medidas
  costoCotizado: { min: 110, def: 130, max: 150 },   // +10 que las otras: con 120 el texto tapaba la flecha de orden
  valor:         { min: 110, def: 120, max: 150 },
  cantidad:      { min: 60,  def: 70,  max: 100 },
  unidad:        { min: 90,  def: 140, max: 170 },
  conf:          { min: 60,  def: 60,  max: 300 },    // sin restricción específica → máx general 300
  /* Pasada 4 · columnas del Registro de gastos (pestaña Gastos), prefijo gr_. */
  gr_fecha:      { min: 60,  def: 72,  max: 120 },
  gr_concepto:   { min: 140, def: 240, max: 420 },
  gr_quien:      { min: 90,  def: 130, max: 240 },
  gr_medio:      { min: 90,  def: 150, max: 240 },
  gr_monto:      { min: 90,  def: 110, max: 170 },
  gr_doc:        { min: 70,  def: 95,  max: 150 },
  gr_comp:       { min: 60,  def: 80,  max: 140 },
  gr_estado:     { min: 100, def: 150, max: 260 },
  gr_acc:        { min: 70,  def: 90,  max: 150 },
  /* Pasada 7 · columnas de las tablas de citaciones (Hoja de Llamado), prefijo hl_. */
  hl_rol:        { min: 90,  def: 150, max: 280 },
  hl_nombre:     { min: 110, def: 180, max: 320 },
  hl_numero:     { min: 90,  def: 120, max: 200 },
  hl_call:       { min: 80,  def: 110, max: 160 },
  hl_loc:        { min: 110, def: 160, max: 300 },
  hl_notas:      { min: 110, def: 180, max: 420 }
};
var BUDGET_MENU_W = 36;
function _budgetColCfg(colId) { return _BUDGET_COL_CFG[colId] || { min: 60, def: 120, max: 300 }; }
function _budgetColWStore() {
  if (!window._BUDGET_COLW) {
    try { window._BUDGET_COLW = JSON.parse(localStorage.getItem('takeos_budget_colw') || '{}') || {}; }
    catch (e) { window._BUDGET_COLW = {}; }
  }
  return window._BUDGET_COLW;
}
function _budgetColWGet(sectionKey, colId, def) {
  var cfg = _budgetColCfg(colId);
  var s = _budgetColWStore()[sectionKey]; var v = s && s[colId];
  if (typeof v !== 'number' || !(v > 0)) return (typeof def === 'number' ? def : cfg.def);
  return Math.max(cfg.min, Math.min(cfg.max, v));
}
function _budgetColWSet(sectionKey, colId, px) {
  var all = _budgetColWStore(); if (!all[sectionKey]) all[sectionKey] = {};
  all[sectionKey][colId] = Math.round(px);
  try { localStorage.setItem('takeos_budget_colw', JSON.stringify(all)); } catch (e) {}
}
function _budgetColGrip(sectionKey, colId) {
  return '<span class="col-resize-grip" title="Arrastra para ajustar el ancho · doble clic para restablecer"'
    + ' onmousedown="budgetColResizeDown(event, \'' + sectionKey + '\', \'' + colId + '\')"'
    + ' onclick="event.stopPropagation();"'
    + ' ondblclick="budgetColResizeReset(event, \'' + sectionKey + '\', \'' + colId + '\')"></span>';
}
/* <th> redimensionable NO ordenable (DTE, Unidad, DTE real, Conf.). Los ordenables
   ya salen por _budgetSortTh con su mismo grip. */
function _budgetColTh(sectionKey, colId, extraClass, innerHTML, styleExtra) {
  var cls = 'bcol-resizable' + (extraClass ? ' ' + extraClass : '');
  return '<th class="' + cls + '" data-bsec="' + sectionKey + '" data-bcol="' + colId + '"'
    + ' style="width:' + _budgetColWGet(sectionKey, colId) + 'px;' + (styleExtra || '') + '">'
    + innerHTML + _budgetColGrip(sectionKey, colId) + '</th>';
}
function budgetColResizeDown(ev, sectionKey, colId) {
  ev.preventDefault(); ev.stopPropagation();
  var grip = ev.currentTarget || ev.target;
  var th = grip.closest ? grip.closest('th') : grip.parentNode;
  if (!th) return;
  grip.classList.add('dragging');
  var startX = ev.clientX;
  var startW = th.getBoundingClientRect().width;
  var thSel = '.budget-table th[data-bsec="' + sectionKey + '"][data-bcol="' + colId + '"]';
  /* todas las tablas de la sección (servicios tiene una por departamento): se
     mueven juntas para mantener las columnas alineadas entre departamentos. */
  var tables = [];
  document.querySelectorAll('.budget-table[data-bsec-table="' + sectionKey + '"]').forEach(function (t) {
    tables.push({ el: t, startW: parseFloat(t.style.width) || t.getBoundingClientRect().width });
  });
  var cfg = _budgetColCfg(colId);
  var lastW = startW;
  function mm(e) {
    lastW = Math.max(cfg.min, Math.min(cfg.max, Math.round(startW + (e.clientX - startX))));
    var delta = lastW - startW;
    document.querySelectorAll(thSel).forEach(function (t) { t.style.width = lastW + 'px'; });
    tables.forEach(function (o) { o.el.style.width = (o.startW + delta) + 'px'; });
  }
  function mu() {
    document.removeEventListener('mousemove', mm);
    document.removeEventListener('mouseup', mu);
    grip.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    _budgetColWSet(sectionKey, colId, lastW);
  }
  document.addEventListener('mousemove', mm);
  document.addEventListener('mouseup', mu);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}
function budgetColResizeReset(ev, sectionKey, colId) {
  ev.preventDefault(); ev.stopPropagation();
  var all = _budgetColWStore();
  if (all[sectionKey]) { delete all[sectionKey][colId]; try { localStorage.setItem('takeos_budget_colw', JSON.stringify(all)); } catch (e) {} }
  /* re-render SOLO de la sección afectada (no toda la página): renderServiciosBody /
     renderSimpleSection / renderGastos preservan el scroll horizontal, así la columna
     vuelve a su ancho por defecto sin que la vista salte a la izquierda. */
  if (sectionKey === 'gastosReg') { if (typeof renderGastos === 'function') renderGastos(); }
  else if (sectionKey === 'hlCrew' || sectionKey === 'hlExt') { if (typeof renderHojaLlamado === 'function') renderHojaLlamado(); }
  else if (sectionKey === 'servicios') { if (typeof renderServiciosBody === 'function') renderServiciosBody(); }
  else if (typeof renderSimpleSection === 'function') renderSimpleSection(sectionKey);
}
/* ─── V11.22 · preservar el scroll horizontal de cada sección al re-renderizar ──
   (ordenar por columna, restablecer ancho, editar una fila, etc.). Sin esto,
   reconstruir el innerHTML deja el wrapper en scrollLeft=0 y la vista "salta" a la
   izquierda. Se capturan los scrollLeft por clave estable (data-budget-scroll) y se
   restauran tras rearmar el DOM. */
function _budgetCaptureScroll() {
  var m = {};
  document.querySelectorAll('[data-budget-scroll]').forEach(function (el) { m[el.getAttribute('data-budget-scroll')] = el.scrollLeft; });
  return m;
}
function _budgetRestoreScroll(m) {
  if (!m) return;
  document.querySelectorAll('[data-budget-scroll]').forEach(function (el) {
    var k = el.getAttribute('data-budget-scroll');
    if (m[k] != null && el.scrollLeft !== m[k]) el.scrollLeft = m[k];
  });
}

/* ─── V8.1 (#2): NOTAS CONTEXTUALES POR FILA DEL PRESUPUESTO ──────────
   Cada fila puede llevar una nota interna (item.nota). No es una columna
   permanente: se accede con el botón ✎ de la fila. Sirve para explicar
   decisiones (ej. "va en $0 porque el cliente provee el recurso"). No
   aparece en la cotización ni en documentos al cliente. */
function _rowNoteItem(sectionKey, dept, idx) {
  const project = STATE.currentProject;
  if (!project) return null;
  return sectionKey === 'servicios'
    ? (project.data.servicios[dept] || [])[idx]
    : (project.data[sectionKey] || [])[idx];
}
function _noteTip(nota, fecha, autor) {
  let s = String(nota || '');
  if (s.length > 180) s = s.slice(0, 180) + '… (clic para ver completo)';
  const meta = [autor || 'Tú', fecha].filter(Boolean).join(', ');
  if (meta) s += '  ·  ' + meta;
  return s;
}
function openRowNote(sectionKey, dept, idx) {
  const item = _rowNoteItem(sectionKey, dept, idx);
  if (!item) return;
  const nombre = item.nombre || item.rol || item.item || 'esta fila';
  const deptArg = dept === null || dept === undefined ? 'null' : `'${escapeHtml(dept)}'`;
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" onclick="window.closeModal()">
      <div class="modal" onclick="event.stopPropagation()" style="max-width: 480px;">
        <div class="modal-header">
          <div class="modal-title">Nota de fila</div>
          <div style="font-size: 12px; color: var(--ink-muted); margin-top: 4px;">Contexto interno para «${escapeHtml(nombre)}». No aparece en la cotización ni en documentos al cliente.</div>
        </div>
        <div class="modal-body">
          <div style="font-size:11px;color:var(--ink-faint);margin-bottom:8px;line-height:1.4;">Autor: <strong>Tú</strong> <span style="opacity:.7;">(se registrará automáticamente al activar cuentas)</span>${item.notaFecha ? ' · Última edición: ' + escapeHtml(item.notaFecha) : ''}</div>
          <textarea id="rowNoteText" class="input" rows="4" style="width: 100%; resize: vertical;" oninput="mentionInput(this)" onblur="mentionBlur()" placeholder="Ej: va en $0 porque el cliente provee este recurso. Escribe @ para etiquetar.">${escapeHtml(item.nota || '')}</textarea>
        </div>
        <div class="modal-footer">
          ${item.nota ? `<button class="btn" style="margin-right: auto; color: var(--negative);" onclick="saveRowNote('${sectionKey}', ${deptArg}, ${idx}, true)">Borrar nota</button>` : ''}
          <button class="btn" onclick="window.closeModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="saveRowNote('${sectionKey}', ${deptArg}, ${idx}, false)">Guardar nota</button>
        </div>
      </div>
    </div>`;
  setTimeout(() => { const t = document.getElementById('rowNoteText'); if (t) t.focus(); }, 50);
}
function saveRowNote(sectionKey, dept, idx, clear) {
  const item = _rowNoteItem(sectionKey, dept, idx);
  if (!item) { window.closeModal(); return; }
  if (clear) {
    delete item.nota; delete item.notaFecha; delete item.notaAutor;
  } else {
    const t = document.getElementById('rowNoteText');
    const v = t ? t.value.trim() : '';
    if (v) { item.nota = v; item.notaFecha = new Date().toLocaleDateString('es-CL'); item.notaAutor = 'Tú'; } else { delete item.nota; delete item.notaFecha; delete item.notaAutor; }
  }
  window._markRowDirty(item);   // Pasada 1 · la nota se escribe por fuera de updateRowField → marcar la fila
  window.markDirty();
  window.closeModal();
  if (sectionKey === 'servicios') renderServiciosBody(); else renderSimpleSection(sectionKey);
}

/* CORE DEL BUG FIX: en lugar de renderPresupuesto(), hacemos updates
   granulares al DOM. Esto preserva el estado de inputs, scroll, foco y
   secciones colapsadas. */
function afterRowChange(sectionKey, dept, idx) {
  const project = STATE.currentProject;
  const item = sectionKey === 'servicios'
    ? project.data.servicios[dept][idx]
    : project.data[sectionKey][idx];

  // Update visual de la celda de costo cotizado y el delta
  const tableId = sectionKey === 'servicios' ? `tbl-servicios-${dept}` : `tbl-${sectionKey}`;
  const tableEl = document.getElementById(tableId);
  if (!tableEl) return;
  const rowEl = tableEl.querySelector(`tr[data-row-idx="${idx}"]`);
  if (!rowEl) return;

  const calc = calcCostoEmpresa(item.valor, item.cantidad, item.dte, sectionKey);
  const costCell = rowEl.querySelector('[data-cost-cotizado]');
  if (costCell) {
    costCell.className = 'cost-cell ' + (calc.error ? 'error' : (calc.value === 0 ? 'zero' : ''));
    costCell.textContent = calc.error ? calc.error : window.fmtMoney(calc.value);
  }

  // Update del delta si existe
  const deltaEl = rowEl.querySelector('[data-delta-inline]');
  if (deltaEl) {
    if (item.costoReal !== null && item.costoReal !== undefined && calc.value !== null) {
      const real = getCostoReal(item, sectionKey).value || 0;
      const delta = real - calc.value;
      if (Math.round(delta) !== 0) {
        // V5.10 (Nota 1): mostrar delta también con cotizado $0.
        deltaEl.textContent = fmtDeltaWithSymbol(delta);
        deltaEl.className = 'delta-inline ' + deltaClassCosto(delta);
      } else {
        deltaEl.textContent = '';
        deltaEl.className = 'delta-inline';
      }
    } else {
      deltaEl.textContent = '';
    }
  }

  // Update "is-empty" en inputs que ahora tienen valor o no
  rowEl.querySelectorAll('input.cell-input, select.cell-select').forEach(el => {
    if (el.type === 'checkbox') return;
    const val = el.value;
    el.classList.toggle('is-empty', !val);
  });

  // V10.3.1 (#1): la celda de costo real SIEMPRE muestra el costo empresa
  // (bruto) guardado. La calculadora guarda el bruto y llega por aquí; sin
  // este refresco el input quedaba mostrando el líquido tipeado al abrirla.
  const crInput = rowEl.querySelector('[data-costo-real]');
  if (crInput && document.activeElement !== crInput) {
    crInput.value = (item.costoReal != null) ? window.displayMoneyInputValue(item.costoReal) : '';
    crInput.classList.toggle('is-empty', item.costoReal == null);
  }

  // V5.2.1: actualizar indicador "● no en BD" en vivo (antes solo aparecía
  // al re-renderizar toda la tabla, ej al agregar/eliminar fila)
  const nameWrap = rowEl.querySelector('.cell-name-wrap');
  if (nameWrap) {
    const existingWarn = nameWrap.querySelector('.cell-name-warn');
    const nameNotInBD = item.nombre && !window.BD_PERSONAS[item.nombre];
    if (nameNotInBD && !existingWarn) {
      const span = document.createElement('span');
      span.className = 'cell-name-warn';
      span.setAttribute('data-tip', '+ Agregar a la BD');
      span.style.cursor = 'pointer';
      span.onclick = function () { crewAddToBD(item.nombre); };
      span.textContent = '●';
      nameWrap.appendChild(span);
    } else if (!nameNotInBD && existingWarn) {
      existingWarn.remove();
    }
  }

  // V10.5.0: la HE de las filas que usan el cálculo del proyecto depende del
  // valor (valor ÷ 10) y del DTE efectivo de la fila. Al editar valor/DTE,
  // recomputar el cache (item.horaExtra) y refrescar la celda. Las filas con
  // override propio (tarifa plana / fórmula con valor hora fijo) no se tocan.
  if (item.heConfig && item.heConfig.usaProyecto !== false) {
    item.horaExtra = _heComputeCosto(item.heConfig, item) || null;
  }
  const heCostEl = rowEl.querySelector('[data-he-cell]');
  if (heCostEl) {
    const heNeedsCfg = !!(item.heConfig && !item.horaExtra);   // Síntoma 1: config de HE sin costo calculable -> aviso
    heCostEl.className = 'he-cost ' + (item.horaExtra ? 'he-on' : (heNeedsCfg ? 'needs-cfg' : 'zero'));
    heCostEl.textContent = item.horaExtra ? window.fmtMoney(item.horaExtra) : (heNeedsCfg ? '⚠ definir' : '—');
    if (heNeedsCfg) {
      const refHe = sectionKey === 'servicios' ? `'servicios','${escapeHtml(dept)}',${idx}` : `'${sectionKey}',null,${idx}`;
      heCostEl.style.cssText = 'color:var(--warning);cursor:pointer;text-decoration:underline dotted;white-space:nowrap;';
      heCostEl.setAttribute('onclick', `openHorasExtraCalc(${refHe})`);
      heCostEl.setAttribute('title', 'Ingresaste horas, pero esta fila no es «Jornadas»: no hay un valor hora del cual calcular la HE. Haz clic para fijar un valor hora propio o un monto plano.');
    } else {
      heCostEl.style.cssText = '';
      heCostEl.removeAttribute('onclick');
      heCostEl.removeAttribute('title');
    }
  }

  // Recalcular totales del subdepto / depto
  if (sectionKey === 'servicios') {
    recalcSubdeptTotals(dept);
  }
  recalcDeptSummary(sectionKey);
  recalcKPIs();
  recalcAlerts();
  renderHeadcountPanel();  // V5.9 (Nota 4)
  // V10.5.0: si la fila tiene HE, el Resumen financiero incluye su línea de
  // horas extra (nivel proyecto); refrescarlo para que no quede desfasado.
  if (item.heConfig) renderSummaryFin();
}

function afterRowConfirmToggle(sectionKey, dept, idx) {
  // Toggle de checkbox solo cambia la clase visual de la fila + recompute
  // de KPIs (no afecta cálculo de costo, pero sí cuántos confirmados).
  const project = STATE.currentProject;
  const item = sectionKey === 'servicios'
    ? project.data.servicios[dept][idx]
    : project.data[sectionKey][idx];
  // V5.2.2: getElementById tolera tildes y espacios; querySelector no.
  // Antes, "Foto Fija" y "Dirección de Fotografía" fallaban silenciosamente.
  const tableId = sectionKey === 'servicios' ? `tbl-servicios-${dept}` : `tbl-${sectionKey}`;
  const table = document.getElementById(tableId);
  const rowEl = table ? table.querySelector(`tr[data-row-idx="${idx}"]`) : null;
  if (rowEl) rowEl.classList.toggle('confirmed', item.confirmado);
  recalcKPIs();
  renderHeadcountPanel();  // V5.9 (Nota 4)
}

/* ─── AGREGAR / ELIMINAR (sí requieren re-render limitado) ──────────── */

/* Pasada 1 · id estable de fila puesto por el cliente. crypto.randomUUID exige
   contexto seguro (https/localhost) — staging y prod lo cumplen; el fallback
   evita un crash en entornos sin él. Es un id de correlación/idempotencia, no
   una clave de seguridad (la autoridad es el RPC + organization_id + RLS). */
function _clientUuid() {
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (window.crypto && crypto.getRandomValues) ? (crypto.getRandomValues(new Uint8Array(1))[0] % 16) : Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function addRow(sectionKey, dept) {
  const project = STATE.currentProject;
  // V5.2.2: si el proyecto ya está aprobado, las nuevas filas son
  // "extras" — editables, no afectan la cotización original.
  const isExtra = cotizadoLocked(project);
  // Pasada 1 · la fila nueva nace con identidad estable (clientUuid), version=null
  // (marca de "nueva, nunca guardada") y sucia. El RPC le asigna version:1 al guardar.
  const ident = { clientUuid: _clientUuid(), version: null, _dirty: true, _dirtySeq: 1 };
  const blank = sectionKey === 'servicios'
    ? { nombre: '', rol: '', valor: null, cantidad: 0, unidad: 'Tarifa Plana', dte: null, dteReal: null, confirmado: false, costoReal: null, extra: isExtra, ...ident }
    : { nombre: '', item: '', valor: null, cantidad: 0, unidad: 'Tarifa Plana', dte: null, dteReal: null, confirmado: false, costoReal: null, extra: isExtra, ...ident };

  if (sectionKey === 'servicios') {
    project.data.servicios[dept].push(blank);
    renderServiciosBody();
  } else {
    project.data[sectionKey].push(blank);
    renderSimpleSection(sectionKey);
  }
  recalcDeptSummary(sectionKey);
  recalcKPIs();
  recalcAlerts();

  if (isExtra) {
    showToast({
      kind: 'info',
      title: 'Ítem extra agregado',
      body: 'Este ítem está marcado como EXTRA y no afecta la cotización original del proyecto.'
    });
  }
}

function deleteRow(sectionKey, dept, idx) {
  const project = STATE.currentProject;
  if (sectionKey === 'servicios') {
    _budgetQueueDeletes(project, [project.data.servicios[dept][idx]]);   // Pasada 1 · encolar baja en el servidor (solo si la fila ya existía)
    project.data.servicios[dept].splice(idx, 1);
    renderServiciosBody();
  } else {
    _budgetQueueDeletes(project, [project.data[sectionKey][idx]]);
    project.data[sectionKey].splice(idx, 1);
    renderSimpleSection(sectionKey);
  }
  window.markDirty();   // Pasada 1 · la baja debe disparar el guardado (antes deleteRow no lo hacía)
  recalcDeptSummary(sectionKey);
  recalcKPIs();
  recalcAlerts();
}

/* ─── RECALCULADORES GRANULARES ─────────────────────────────────────── */

function recalcSubdeptTotals(dept) {
  const project = STATE.currentProject;
  const items = project.data.servicios[dept];
  const showReal = window.STATES_WITH_REAL_COST.includes(project.state);
  let totCot = 0, totReal = 0, totHE = 0, hasReal = false;
  items.forEach(r => {
    const c = calcCostoEmpresa(r.valor, r.cantidad, r.dte, 'servicios');
    totCot += c.value || 0;
    if (r.costoReal !== null && r.costoReal !== undefined) {
      const real = getCostoReal(r, 'servicios');
      totReal += real.value || 0;
      hasReal = true;
    }
    totHE += Number(r.horaExtra) || 0;   // Síntoma 2: HE del departamento, se muestra aparte
  });
  const el = document.getElementById(`subdept-totals-${dept}`);
  if (!el) return;
  const delta = totReal - totCot;
  el.innerHTML = `
    <span>Cot: <strong>${window.fmtMoney(totCot)}</strong></span>
    ${showReal && hasReal ? `<span>Real: <strong>${window.fmtMoney(totReal)}</strong></span>` : ''}
    ${showReal && hasReal && totCot > 0 ? `<span class="delta ${deltaClassCosto(delta)}">${fmtDelta(delta)}</span>` : ''}
    ${showReal && totHE > 0 ? `<span style="color:var(--accent);white-space:nowrap;" title="Horas extra de este departamento (costo real adicional). No entra al subtotal; se suma al Costo de Producción real en el Resumen Financiero.">+ HE ${window.fmtMoney(totHE)}</span>` : ''}
  `;
}

function recalcDeptSummary(sectionKey) {
  const project = STATE.currentProject;
  const showReal = window.STATES_WITH_REAL_COST.includes(project.state);
  let totCot = 0, totReal = 0, totHE = 0, hasReal = false;

  if (sectionKey === 'servicios') {
    for (const dept in project.data.servicios) {
      project.data.servicios[dept].forEach(r => {
        const c = calcCostoEmpresa(r.valor, r.cantidad, r.dte, 'servicios');
        totCot += c.value || 0;
        if (r.costoReal !== null && r.costoReal !== undefined) {
          totReal += getCostoReal(r, 'servicios').value || 0;
          hasReal = true;
        }
        totHE += Number(r.horaExtra) || 0;   // Síntoma 2: HE de la sección, se muestra aparte (no infla el subtotal)
      });
    }
  } else {
    project.data[sectionKey].forEach(r => {
      const c = calcCostoEmpresa(r.valor, r.cantidad, r.dte, sectionKey);
      totCot += c.value || 0;
      if (r.costoReal !== null && r.costoReal !== undefined) {
        totReal += getCostoReal(r, sectionKey).value || 0;
        hasReal = true;
      }
      totHE += Number(r.horaExtra) || 0;   // Síntoma 2: HE de la sección, se muestra aparte (no infla el subtotal)
    });
  }

  const el = document.getElementById(`dept-summary-${sectionKey}`);
  if (!el) return;
  const delta = totReal - totCot;
  el.innerHTML = `
    <span>Cotizado: <strong>${window.fmtMoney(totCot)}</strong></span>
    ${showReal && hasReal ? `<span>Real: <strong>${window.fmtMoney(totReal)}</strong></span>` : ''}
    ${showReal && hasReal && totCot > 0 ? `<span class="delta ${deltaClassCosto(delta)}">${fmtDelta(delta)}</span>` : ''}
    ${showReal && totHE > 0 ? `<span style="color:var(--accent);white-space:nowrap;" title="Horas extra de esta sección (costo real adicional, ya con conversión por DTE). No se incluye en el subtotal para no inflar gastos administrativos ni contingencias; se suma al Costo de Producción real en el Resumen Financiero.">+ HE ${window.fmtMoney(totHE)}</span>` : ''}
  `;
}

function recalcAllDeptSummaries() {
  recalcDeptSummary('servicios');
  recalcDeptSummary('gastos');
  recalcDeptSummary('equipos');
  recalcDeptSummary('talentos');
}

/* ════════════════════════════════════════════════════════════════════
   V5.1: TABLA RESUMEN FINANCIERO DEL PRESUPUESTO
   ════════════════════════════════════════════════════════════════════
   Recuperada del Master Sheet V2.4.1 (pestaña PRESUPUESTO, filas 3-18).
   Lógica:
     Servicios + Gastos + Equipos + Talentos = Subtotal Producción
     Subtotal Producción × (1 + gastosAdminPct) = Costo de Producción
     Presupuesto Cliente (NETO) − Costo de Producción = Ganancia parcial
     Ganancia parcial × (1 − suma de comisiones %) = GANANCIA FINAL NETO

   Aparece arriba del Presupuesto como vista financiera del proyecto.
   Antes vivía solo en hoja de cálculo, perdida en V5.0 Capa 2.
   ════════════════════════════════════════════════════════════════════ */

function calcSummaryFin(project) {
  _syncGastosCostoReal(project);   // 4a · el real de Gastos sale de los movimientos, no de tipeo manual
  const d = project.data;
  const fin = d.finanzas;

  // Por sección: cotizado y real (suma de costo empresa)
  const sumSection = (items, sectionKey) => {
    let cot = 0, real = 0, hasReal = false;
    items.forEach(r => {
      const c = calcCostoEmpresa(r.valor, r.cantidad, r.dte, sectionKey);
      cot += c.value || 0;
      if (r.costoReal !== null && r.costoReal !== undefined) {
        real += getCostoReal(r, sectionKey).value || 0;
        hasReal = true;
      }
    });
    return { cot, real, hasReal };
  };

  let servCot = 0, servReal = 0, anyReal = false;
  const serviciosPorDepto = [];   // V9.6.10: desglose por departamento para el resumen
  for (const dept in d.servicios) {
    const s = sumSection(d.servicios[dept], 'servicios');
    servCot += s.cot; servReal += s.real; if (s.hasReal) anyReal = true;
    serviciosPorDepto.push({ label: dept, cot: s.cot, real: s.real });
  }
  const g = sumSection(d.gastos, 'gastos');
  const e = sumSection(d.equipos, 'equipos');
  const t = sumSection(d.talentos, 'talentos');
  anyReal = anyReal || g.hasReal || e.hasReal || t.hasReal;

  // V10.3.0 (#4): horas extra. Costo real adicional, sin equivalente cotizado.
  // Se suma al Costo de Producción real DESPUÉS de admin y contingencias (no
  // infla esas bases → no se aplica overhead ni contingencia sobre la HE).
  let totalHE = 0;
  for (const dept in d.servicios) d.servicios[dept].forEach(r => { totalHE += Number(r.horaExtra) || 0; });
  ['gastos', 'equipos', 'talentos'].forEach(sk => d[sk].forEach(r => { totalHE += Number(r.horaExtra) || 0; }));
  if (totalHE > 0) anyReal = true;

  const subtotalCot = servCot + g.cot + e.cot + t.cot;
  const subtotalReal = servReal + g.real + e.real + t.real;

  // V5.11 (Nota 3): tras aprobar, Gastos Admin y Contingencias se CONGELAN al
  // monto calculado sobre el cotizado. Dejan de recalcularse con los reales:
  // son parte del presupuesto aprobado / margen protegido, no de la ejecución.
  const frozen = (cotizadoLocked(project) && fin.frozen) ? fin.frozen : null;
  const adminCot = frozen ? frozen.admin : subtotalCot * fin.gastosAdminPct;
  const adminReal = frozen ? frozen.admin : subtotalReal * fin.gastosAdminPct;

  /* V5.2.1: riesgos/contingencias. Cada uno aporta a costo de producción.
     Pueden ser monto fijo o % del subtotal producción. */
  const riesgos = fin.riesgos || [];
  const riesgosCalc = riesgos.map((r, i) => {
    if (frozen && frozen.riesgos && frozen.riesgos[i] != null) {
      const v = frozen.riesgos[i];   // congelado al aprobar
      return { label: r.label, mode: r.mode, value: r.value, cot: v, real: v };
    }
    const cot = r.mode === 'pct' ? (subtotalCot * (r.value || 0)) : (r.value || 0);
    const real = r.mode === 'pct' ? (subtotalReal * (r.value || 0)) : (r.value || 0);
    return { label: r.label, mode: r.mode, value: r.value, cot, real };
  });
  const totalRiesgosCot = riesgosCalc.reduce((s, r) => s + r.cot, 0);
  const totalRiesgosReal = riesgosCalc.reduce((s, r) => s + r.real, 0);

  const costoProdCot = subtotalCot + adminCot + totalRiesgosCot;
  const costoProdReal = subtotalReal + adminReal + totalRiesgosReal + totalHE;   // V10.3.0 (#4): + horas extra

  const presupCliente = fin.presupuestoCliente || 0;

  /* V5.3 (Nota 3): EXTRAS DE INGRESO. Ampliaciones cobradas al cliente
     después de aprobar, sin tocar la cotización original. Suman al
     "Presupuesto Cliente Efectivo", que es la base real de la ganancia.
     Son ingreso puro, así que no tienen distinción cot/real. */
  const extras = fin.extras || [];
  const totalExtras = extras.reduce((s, x) => s + (x.monto || 0), 0);
  const presupClienteEfectivo = presupCliente + totalExtras;

  /* V6.1 (Nota 1): los extras/ampliaciones son posteriores y NO tocan el
     cotizado original (baseline histórico). Solo afectan el lado Real/efectivo.
     Cotizado = presupuesto original; Real = original + extras. */
  const gananciaParcialCot = presupCliente - costoProdCot;
  const gananciaParcialReal = presupClienteEfectivo - costoProdReal;

  /* V8.1: comisiones pueden ser % (sobre ganancia parcial) o monto fijo,
     igual que riesgos. Lectura tolerante: saves antiguos traen {label, pct}
     y se interpretan como modo '%'. */
  const comisionesCalc = fin.comisiones.map(c => {
    const mode = c.mode || 'pct';
    const value = (c.value != null) ? c.value : (c.pct || 0);
    const cot = mode === 'pct' ? (gananciaParcialCot * value) : value;
    const real = mode === 'pct' ? (gananciaParcialReal * value) : value;
    return { label: c.label, mode: mode, value: value, cot: cot, real: real };
  });

  const totalComisionesCot = comisionesCalc.reduce((s, c) => s + c.cot, 0);
  const totalComisionesReal = comisionesCalc.reduce((s, c) => s + c.real, 0);

  const gananciaFinalCot = gananciaParcialCot - totalComisionesCot;
  const gananciaFinalReal = gananciaParcialReal - totalComisionesReal;

  return {
    rows: [
      { label: 'Servicios',                     cot: servCot,           real: servReal,         hasReal: anyReal },
      { label: 'Gastos de producción',          cot: g.cot,             real: g.real,           hasReal: anyReal },
      { label: 'Técnica',                       cot: e.cot,             real: e.real,           hasReal: anyReal },
      { label: 'Talentos',                      cot: t.cot,             real: t.real,           hasReal: anyReal }
    ],
    subtotal: { cot: subtotalCot, real: subtotalReal },
    admin:    { cot: adminCot,    real: adminReal, pct: fin.gastosAdminPct },
    riesgos:  riesgosCalc,
    totalRiesgos: { cot: totalRiesgosCot, real: totalRiesgosReal },
    horasExtra: { cot: 0, real: totalHE },
    costoProd:{ cot: costoProdCot, real: costoProdReal },
    presupCliente,
    extras,
    totalExtras,
    presupClienteEfectivo,
    gananciaParcial: { cot: gananciaParcialCot, real: gananciaParcialReal },
    comisiones: comisionesCalc,
    gananciaFinal: { cot: gananciaFinalCot, real: gananciaFinalReal },
    serviciosPorDepto,
    anyReal
  };
}

/* ── V9.6.5 · EXPORT del Presupuesto a Excel ───────────────────────────────
   Una sola hoja: RESUMEN financiero arriba (subtotal por sección, gastos
   administrativos, contingencias, costo de producción, presupuesto cliente,
   extras, comisiones y ganancia) y DETALLE abajo (todas las filas con valor;
   se omiten las filas en cero — puro ruido). Si el proyecto tiene costos
   reales (estados de Preproducción en adelante), suma columnas Real. */
/* V9.6.15 (#6) · ¿esta fila merece exportarse? Antes bastaba con que tuviera
   valor unitario != 0, lo que dejaba pasar filas NO cotizadas (ej. valor
   $120.000 con cantidad 0 -> costo 0, pero valor!=0 -> aparecía como ruido).
   Nuevo criterio (único, para todas las secciones): exporta la fila solo si
   tiene costo cotizado, o costo real, o nombre, o comentario, o pronto pago.
   Así una fila en $0 con una nota importante (ej. "lo provee el cliente") SÍ
   aparece, pero una fila vacía/no cotizada no. */
function debeExportarseFilaPresupuesto(r, sectionKey) {
  const cot = (calcCostoEmpresa(r.valor, r.cantidad, r.dte, sectionKey).value) || 0;
  const real = (r.costoReal != null) ? (r.costoReal || 0) : 0;
  const nombre = (r.nombre || '').trim();
  const nota = (r.nota || '').trim();
  return cot !== 0 || real !== 0 || !!nombre || !!nota || !!r.prontoPago;
}
/* ════════════════════════════════════════════════════════════════════
   V9.6.13 · EXPORT DEL PRESUPUESTO A EXCEL (ExcelJS, con estilo)
   - Una pestaña por VERSIÓN de presupuesto (todas, automáticamente).
   - Formato moneda chilena ($1.000), colores, encabezado por hoja.
   - Cartel de "solo lectura" (sin fórmulas).
   - Costos enteros (el redondeo vive en calcCostoEmpresa) -> sumas exactas.
   ═══════════════════════════════════════════════════════════════════════ */
const _XL = {
  ink:      'FF1F2937',   // texto oscuro
  headBg:   'FF1F2937',   // barra de encabezado (slate)
  headTx:   'FFFFFFFF',
  sectBg:   'FFE5E7EB',   // gris suave para títulos de sección
  totBg:    'FFF3F4F6',   // gris muy suave para filas de total
  ganBg:    'FFFDF6E3',   // ámbar muy claro para Ganancia Final
  rule:     'FFD1D5DB',
  faint:    'FF6B7280',
  neg:      'FFB91C1C',
  colCot:   'FFF0F4F8',   // V9.6.15 (#5): tinte sutil columna Costo Cotizado (azul muy claro)
  colReal:  'FFF0F6F0'    // V9.6.15 (#5): tinte sutil columna Costo Real (verde muy claro)
};
const _XL_MONEY = '"$"#,##0;[Red]-"$"#,##0';   // moneda chilena, negativos en rojo

function _xlBorder() { return { bottom: { style: 'thin', color: { argb: _XL.rule } } }; }
function _xlMoneyCell(cell, n, opts) {
  opts = opts || {};
  cell.value = (n == null || n === '') ? null : Math.round(n);
  cell.numFmt = _XL_MONEY;
  cell.alignment = { horizontal: 'right' };
  if (opts.bold) cell.font = Object.assign({ bold: true }, opts.font || {});
  else if (opts.font) cell.font = opts.font;
}

/* Rellena UNA hoja (ExcelJS worksheet) con el presupuesto de una versión.
   budget = {servicios,gastos,equipos,talentos,finanzas}; meta = {nombreProy,
   cliente, versionLabel, estado, fecha}. */
function _presupFillSheetExcelJS(ws, pseudoProject, meta) {
  const s = calcSummaryFin(pseudoProject);
  const anyReal = !!s.anyReal;
  const d = pseudoProject.data;
  const nCols = anyReal ? 12 : 11;
  const lastCol = String.fromCharCode(64 + nCols);   // 'K' u 'L'

  // Anchos
  ws.columns = (anyReal
    ? [24, 18, 22, 22, 14, 9, 10, 9, 15, 15, 11, 30]
    : [24, 18, 22, 22, 14, 9, 10, 9, 15, 11, 30]).map(w => ({ width: w }));

  let r = 1;
  const mergeRow = (text, style) => {
    ws.mergeCells(`A${r}:${lastCol}${r}`);
    const c = ws.getCell(`A${r}`); c.value = text;
    if (style) Object.assign(c, style);
    r++;
    return c;
  };

  // Título
  mergeRow('PRESUPUESTO · ' + (meta.nombreProy || ''), { font: { bold: true, size: 15, color: { argb: _XL.ink } } });
  // Subencabezado (cliente · versión · estado · fecha)
  const sub = [];
  if (meta.cliente) sub.push('Cliente: ' + meta.cliente);
  if (meta.versionLabel) sub.push(meta.versionLabel);
  if (meta.estado) sub.push(meta.estado);
  sub.push('Exportado: ' + meta.fecha);
  mergeRow(sub.join('   ·   '), { font: { size: 10, color: { argb: _XL.faint } } });
  // Cartel solo-lectura
  const aviso = mergeRow('Información solo para lectura. Este archivo no contiene fórmulas y no está diseñado para ser manipulado como planilla viva.',
    { font: { italic: true, size: 9.5, color: { argb: _XL.faint } } });
  aviso.alignment = { wrapText: true };
  r++; // fila en blanco

  // ── RESUMEN ──
  const sectTitle = (text) => {
    ws.mergeCells(`A${r}:${lastCol}${r}`);
    const c = ws.getCell(`A${r}`); c.value = text;
    c.font = { bold: true, size: 11, color: { argb: _XL.ink } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: _XL.sectBg } };
    r++;
  };
  sectTitle('RESUMEN FINANCIERO');
  // header de columnas del resumen
  const resHead = anyReal ? ['Concepto', 'Cotizado', 'Real'] : ['Concepto', 'Cotizado'];
  resHead.forEach((h, i) => {
    const c = ws.getCell(r, i + 1); c.value = h;
    c.font = { bold: true, color: { argb: _XL.headTx } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: _XL.headBg } };
    c.alignment = { horizontal: i === 0 ? 'left' : 'right' };
  });
  r++;
  const sumRow = (label, cot, real, opts) => {
    opts = opts || {};
    const cL = ws.getCell(r, 1); cL.value = label;
    if (opts.bold) cL.font = { bold: true, color: { argb: opts.neg ? _XL.neg : _XL.ink } };
    _xlMoneyCell(ws.getCell(r, 2), cot, { bold: opts.bold, font: opts.neg ? { color: { argb: _XL.neg } } : undefined });
    if (anyReal) _xlMoneyCell(ws.getCell(r, 3), real, { bold: opts.bold, font: opts.neg ? { color: { argb: _XL.neg } } : undefined });
    if (opts.fill) { for (let k = 1; k <= (anyReal ? 3 : 2); k++) ws.getCell(r, k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } }; }
    r++;
  };
  s.rows.forEach(row => sumRow(row.label, row.cot, row.real));
  sumRow('Subtotal de producción', s.subtotal.cot, s.subtotal.real, { bold: true, fill: _XL.totBg });
  sumRow('Gastos administrativos (' + Math.round((s.admin.pct || 0) * 100) + '%)', s.admin.cot, s.admin.real);
  (s.riesgos || []).forEach(x => sumRow('Contingencia · ' + (x.label || ''), x.cot, x.real));
  if (s.horasExtra && s.horasExtra.real) sumRow('Horas extra', null, s.horasExtra.real);   // V10.3.0 (#4)
  sumRow('Costo de producción', s.costoProd.cot, s.costoProd.real, { bold: true, fill: _XL.totBg });
  sumRow('Presupuesto cliente', s.presupCliente, anyReal ? s.presupCliente : null);
  if (anyReal && s.totalExtras) {
    (s.extras || []).forEach(x => sumRow('Extra · ' + (x.label || x.nombre || ''), null, x.monto));
    sumRow('Presupuesto cliente efectivo', s.presupCliente, s.presupClienteEfectivo);
  }
  sumRow('Ganancia parcial', s.gananciaParcial.cot, s.gananciaParcial.real);
  (s.comisiones || []).forEach(c => {
    const etq = c.mode === 'pct' ? (c.label || 'Comisión') + ' (' + Math.round((c.value || 0) * 100) + '%)' : (c.label || 'Comisión');
    sumRow(etq, -c.cot, -c.real, { neg: true });
  });
  sumRow('GANANCIA FINAL', s.gananciaFinal.cot, s.gananciaFinal.real, { bold: true, fill: _XL.ganBg });
  // Margen (porcentaje)
  {
    const margen = (s.presupCliente ? (s.gananciaFinal.cot / s.presupCliente) : 0);
    const cL = ws.getCell(r, 1); cL.value = 'Margen'; cL.font = { color: { argb: _XL.faint } };
    const cV = ws.getCell(r, 2); cV.value = margen; cV.numFmt = '0.0%'; cV.alignment = { horizontal: 'right' }; cV.font = { color: { argb: _XL.faint } };
    r++;
  }
  r++; // blanco

  // ── DETALLE ──
  sectTitle('DETALLE (filas con valor)');
  const detHead = ['Sección', 'Departamento', 'Rol / Ítem', 'Nombre', 'Valor unitario', 'Cantidad', 'Unidad', 'DTE', 'Costo cotizado'];
  if (anyReal) detHead.push('Costo real');
  detHead.push('Pronto Pago'); detHead.push('Comentario');
  detHead.forEach((h, i) => {
    const c = ws.getCell(r, i + 1); c.value = h;
    c.font = { bold: true, color: { argb: _XL.headTx } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: _XL.headBg } };
    c.alignment = { horizontal: 'left', wrapText: true };
  });
  r++;
  const colCot = 9;                  // índice de la columna "Costo cotizado"
  const colReal = anyReal ? 10 : -1; // índice de "Costo real" (si aplica)
  const pushDetail = (sectionLabel, sectionKey, row, dept) => {
    const cot = (calcCostoEmpresa(row.valor, row.cantidad, row.dte, sectionKey).value) || 0;
    let col = 1;
    ws.getCell(r, col++).value = sectionLabel;
    ws.getCell(r, col++).value = dept || '';
    ws.getCell(r, col++).value = (row.rol || row.item || '');
    ws.getCell(r, col++).value = (row.nombre || '');
    _xlMoneyCell(ws.getCell(r, col++), row.valor || 0);
    ws.getCell(r, col++).value = (row.cantidad || 0);
    ws.getCell(r, col++).value = (row.unidad || '');
    ws.getCell(r, col++).value = (row.dte || '');
    _xlMoneyCell(ws.getCell(r, col++), cot);
    if (anyReal) _xlMoneyCell(ws.getCell(r, col++), row.costoReal != null ? row.costoReal : '');
    ws.getCell(r, col++).value = row.prontoPago ? 'Sí' : '';   // #6: Sí / vacío
    ws.getCell(r, col++).value = row.nota || '';                // #5: comentario interno
    // borde inferior sutil en toda la fila + tinte sutil de las columnas de costo (#5)
    for (let k = 1; k <= nCols; k++) ws.getCell(r, k).border = _xlBorder();
    ws.getCell(r, colCot).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: _XL.colCot } };
    if (colReal > 0) ws.getCell(r, colReal).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: _XL.colReal } };
    r++;
  };
  let hubo = false;
  for (const dept in (d.servicios || {})) {
    (d.servicios[dept] || []).forEach(row => { if (debeExportarseFilaPresupuesto(row, 'servicios')) { pushDetail('Servicios', 'servicios', row, dept); hubo = true; } });
  }
  [['Gastos de producción', 'gastos', d.gastos], ['Técnica', 'equipos', d.equipos], ['Talentos', 'talentos', d.talentos]].forEach(([label, key, arr]) => {
    (arr || []).forEach(row => { if (debeExportarseFilaPresupuesto(row, key)) { pushDetail(label, key, row, ''); hubo = true; } });
  });
  if (!hubo) mergeRow('(sin filas con valor)', { font: { italic: true, color: { argb: _XL.faint } } });

  ws.views = [{ state: 'frozen', ySplit: 0 }];
}

/* Nombre de archivo: {tipo} - {proyecto} de {cliente} - {aaaa-mm-dd}.xlsx (#7) */
function _xlFileName(tipo, nombreProy, cliente) {
  const now = new Date(), pad = n => String(n).padStart(2, '0');
  const limpia = (t) => String(t || '').replace(/[^\wÀ-ÿ .,&()-]/g, '').trim();
  const proy = limpia(nombreProy) || 'Proyecto';
  const cli = limpia(cliente);
  const fecha = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${tipo} - ${proy}${cli ? ' de ' + cli : ''} - ${fecha}.xlsx`;
}
function _xlDownload(buffer, fname) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportPresupuestoExcel() {
  const project = STATE.currentProject;
  if (!project) return;
  let ExcelJSlib;
  try { ExcelJSlib = await ensureExcelJS(); }
  catch (e) { showToast({ kind: 'error', title: 'No se pudo exportar', body: e.message }); return; }

  const ip = project.data.infoProyecto || {};
  const nombreProy = ip.nombreProyecto || project.name || 'Proyecto';
  const cliente = ip.cliente || '';
  const fecha = new Date().toLocaleString('es-CL');

  // Reúne TODAS las versiones de presupuesto (#8): la última sigue el presupuesto
  // en vivo; las anteriores usan su snapshot (presupSnap). Las muy antiguas sin
  // snapshot quedan con solo su resumen.
  const cs = ensureCotizaciones(project);
  const ultima = cotUltimaNum(cs);
  const versiones = (cs.versiones || []).slice().sort((a, b) => (a.numero || 0) - (b.numero || 0));

  const wb = new ExcelJSlib.Workbook();
  wb.creator = 'TakeOS';
  const usados = {};
  const nombreHoja = (v) => {
    let base = ('Presupuesto V' + (v.numero || '?')).slice(0, 28);
    let n = base, k = 2; while (usados[n.toLowerCase()]) { n = base.slice(0, 24) + ' (' + k + ')'; k++; }
    usados[n.toLowerCase()] = true; return n;
  };

  let hojas = 0;
  versiones.forEach(v => {
    const esUltima = (v.numero || 0) === ultima;
    const estado = esUltima ? 'Versión vigente' : 'Versión histórica';
    const verLabel = v.label || ('Versión ' + (v.numero || '?'));
    const ws = wb.addWorksheet(nombreHoja(v));
    if (esUltima) {
      // presupuesto en vivo: usa el proyecto real
      _presupFillSheetExcelJS(ws, project, { nombreProy, cliente, versionLabel: verLabel, estado, fecha });
      hojas++;
    } else if (v.presupSnap) {
      const snap = v.presupSnap;
      const pseudo = { state: 'venta', data: { servicios: snap.servicios || {}, gastos: snap.gastos || [], equipos: snap.equipos || [], talentos: snap.talentos || [], finanzas: snap.finanzas || {} } };
      _presupFillSheetExcelJS(ws, pseudo, { nombreProy, cliente, versionLabel: verLabel, estado, fecha });
      hojas++;
    } else {
      // sin snapshot: solo resumen conservado
      ws.columns = [{ width: 28 }, { width: 18 }];
      ws.getCell('A1').value = 'PRESUPUESTO · ' + nombreProy; ws.getCell('A1').font = { bold: true, size: 15 };
      ws.getCell('A2').value = `${verLabel}   ·   ${estado}   ·   Exportado: ${fecha}`; ws.getCell('A2').font = { size: 10, color: { argb: _XL.faint } };
      ws.getCell('A4').value = 'Esta versión se creó antes de que TakeOS guardara el detalle completo del presupuesto. Solo se conserva su resumen.';
      ws.getCell('A4').font = { italic: true, color: { argb: _XL.faint } };
      const rsum = v.resumen || {};
      let rr = 6;
      const put = (l, val) => { ws.getCell(rr, 1).value = l; _xlMoneyCell(ws.getCell(rr, 2), val); rr++; };
      put('Presupuesto cliente', rsum.valor || 0);
      put('Costo de producción', rsum.costo || 0);
      put('Ganancia', rsum.ganancia || 0);
      hojas++;
    }
  });
  if (!hojas) { wb.addWorksheet('Presupuesto'); }

  let buf;
  try { buf = await wb.xlsx.writeBuffer(); }
  catch (e) { showToast({ kind: 'error', title: 'No se pudo generar el Excel', body: 'Ocurrió un error al construir el archivo.' }); return; }
  const fname = _xlFileName('Presupuesto', nombreProy, cliente);
  _xlDownload(buf, fname);
  showToast({ kind: 'success', title: 'Presupuesto exportado', body: `${versiones.length} versión(es), una por pestaña, en <strong>${escapeHtml(fname)}</strong>.` });
}

/* V9.6.10 · Desglose por departamento de la línea "Servicios" del resumen.
   Estado de sesión; el resumen lo lee al renderizar. */
let _budgetServiciosExpanded = false;
function toggleBudgetServiciosBreakdown() {
  _budgetServiciosExpanded = !_budgetServiciosExpanded;
  renderSummaryFin();
}

function renderSummaryFin() {
  const project = STATE.currentProject;
  if (!project) return;
  const showReal = window.STATES_WITH_REAL_COST.includes(project.state);
  const locked = cotizadoLocked(project);
  const lockedAttr = locked ? 'readonly' : '';
  const lockedSelectAttr = locked ? 'disabled' : '';
  const s = calcSummaryFin(project);
  const fin = project.data.finanzas;
  // V8.1: normaliza comisiones al esquema {label, mode, value} (idempotente).
  // Migra en sitio cualquier comisión antigua {label, pct} sin perder datos.
  if (Array.isArray(fin.comisiones)) {
    fin.comisiones = fin.comisiones.map(c => ({
      label: c.label,
      mode: c.mode || 'pct',
      value: (c.value != null) ? c.value : (c.pct || 0)
    }));
  }

  // V5.3 (Nota 3): el denominador del margen es el Presupuesto Cliente
  // EFECTIVO (original + extras de ingreso), no solo el original.
  const baseCliente = s.presupClienteEfectivo;
  const margenPctCot = s.presupCliente > 0 ? (s.gananciaFinal.cot / s.presupCliente) : 0;
  const margenPctReal = s.presupClienteEfectivo > 0 ? (s.gananciaFinal.real / s.presupClienteEfectivo) : 0;

  const fmtDeltaInRowGasto = (cot, real) => {
    if (!showReal || !s.anyReal) return '';
    const delta = real - cot;
    const cls = deltaClassCosto(delta);
    return `<td class="num delta-cell ${cls}">${fmtDelta(delta)}</td>`;
  };
  const fmtDeltaInRowGanancia = (cot, real) => {
    if (!showReal || !s.anyReal) return '';
    const delta = real - cot;
    const cls = deltaClassGanancia(delta);
    return `<td class="num delta-cell ${cls}">${fmtDelta(delta)}</td>`;
  };

  const fmtPctRowGasto = (cot, real) => {
    if (!showReal || !s.anyReal || cot === 0) return '<td class="pct">—</td>';
    const dpct = (real - cot) / Math.abs(cot);
    const cls = deltaClassCosto(dpct);
    return `<td class="pct delta-cell ${cls}">${(dpct > 0 ? '+' : '') + (dpct * 100).toFixed(1)}%</td>`;
  };
  const fmtPctRowGanancia = (cot, real) => {
    if (!showReal || !s.anyReal || cot === 0) return '<td class="pct">—</td>';
    const dpct = (real - cot) / Math.abs(cot);
    const cls = deltaClassGanancia(dpct);
    return `<td class="pct delta-cell ${cls}">${(dpct > 0 ? '+' : '') + (dpct * 100).toFixed(1)}%</td>`;
  };

  // Para Costo de Producción: % del presupuesto cliente efectivo
  const pctOfClient = (n) => baseCliente > 0 ? ((n / baseCliente) * 100).toFixed(1) + '%' : '—';

  const el = document.getElementById('summaryFin');
  if (!el) return;

  // V5.1.1: spotlight de Ganancia Final Real cuando hay datos
  const showSpotlight = showReal && s.anyReal && s.presupCliente > 0;
  const gfReal = s.gananciaFinal.real;
  const gfCot = s.gananciaFinal.cot;
  const gfDelta = gfReal - gfCot;
  const gfPctDelta = gfCot !== 0 ? (gfDelta / Math.abs(gfCot)) : 0;
  const gfClass = gfReal >= 0 ? 'positive' : 'negative';
  const gfDeltaClass = deltaClassGanancia(gfDelta);

  const spotlightHtml = showSpotlight ? `
    <div class="ganancia-spotlight ${gfClass}">
      <div class="spotlight-row">
        <div>
          <div class="spotlight-label">Ganancia Final Real <span class="tt" data-tip="Presupuesto Cliente − Costo de Producción real − Suma de comisiones.\n\nEs lo que efectivamente queda para la empresa después de pagar todo y repartir comisiones. El número más importante del proyecto desde el punto de vista financiero." style="background: rgba(255,255,255,0.2); color: rgba(255,255,255,0.9); border-color: rgba(255,255,255,0.3);">?</span></div>
          <div class="spotlight-value">${window.fmtMoney(gfReal)}</div>
          <div class="spotlight-sub">${(margenPctReal * 100).toFixed(1)}% del presupuesto cliente</div>
        </div>
        <div class="spotlight-delta-block">
          <div class="spotlight-delta-label">vs cotizado</div>
          <div class="spotlight-delta ${gfDeltaClass}">
            ${fmtDelta(gfDelta)}
            <span style="font-size: 12px; opacity: 0.8; margin-left: 6px;">(${gfPctDelta > 0 ? '+' : ''}${(gfPctDelta * 100).toFixed(1)}%)</span>
          </div>
        </div>
      </div>
    </div>
  ` : '';

  /* V11.5.0 · el Resumen financiero contiene la ganancia: oculto a los
     perfiles Producción (3) y Asistencia (4) por decisión de Agustín. */
  if (TAKEOS_PERFIL && (TAKEOS_PERFIL.codigo === 3 || TAKEOS_PERFIL.codigo === 4)) { el.innerHTML = ''; return; }
  el.innerHTML = `
    ${spotlightHtml}
    <div class="summary-fin-header">
      <div class="summary-fin-title">Resumen financiero</div>
      <div style="font-size: 11px; color: var(--ink-muted); display: flex; gap: 12px; align-items: center;">
        <span>Margen cotizado <span class="tt" data-tip="(Ganancia Final / Presupuesto Cliente) × 100. Es la rentabilidad del proyecto según presupuesto. Sin descontar gastos no presupuestados.">?</span>: <strong style="color: ${margenPctCot > 0 ? 'var(--positive)' : (margenPctCot < 0 ? 'var(--negative)' : 'var(--ink-faint)')}; font-variant-numeric: tabular-nums;">${(margenPctCot * 100).toFixed(1)}%</strong></span>
        ${showReal && s.anyReal ? `<span>Margen real <span class="tt" data-tip="(Ganancia Final Real / Presupuesto Cliente) × 100. Rentabilidad efectiva con los costos reales hasta el momento.">?</span>: <strong style="color: ${margenPctReal > 0 ? 'var(--positive)' : (margenPctReal < 0 ? 'var(--negative)' : 'var(--ink-faint)')}; font-variant-numeric: tabular-nums;">${(margenPctReal * 100).toFixed(1)}%</strong></span>` : ''}
      </div>
    </div>
    <table class="summary-fin-table">
      <thead>
        <tr>
          <th style="text-align: left;">Ítem</th>
          <th>% Cliente</th>
          <th>Cotizado</th>
          ${showReal ? '<th>Real</th>' : ''}
          ${showReal ? '<th>Δ%</th>' : ''}
          ${showReal ? '<th>Δ$</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${s.rows.map(r => {
          if (r.label === 'Servicios') {
            const deptos = s.serviciosPorDepto || [];
            const expandable = deptos.length > 0;
            const open = expandable && _budgetServiciosExpanded;
            const chevron = expandable ? `<span class="dept-chevron" style="display:inline-block;width:14px;transition:transform .15s;${open ? '' : 'transform:rotate(-90deg);'}">▾</span> ` : '';
            const head = `
          <tr${expandable ? ' style="cursor:pointer;" onclick="toggleBudgetServiciosBreakdown()" title="Ver desglose por departamento"' : ''}>
            <td>${chevron}${r.label}${expandable ? ` <span style="color:var(--ink-faint);font-size:11px;">(${deptos.length} ${deptos.length === 1 ? 'depto.' : 'deptos.'})</span>` : ''}</td>
            <td class="pct">${pctOfClient(r.cot)}</td>
            <td class="num">${window.fmtMoney(r.cot)}</td>
            ${showReal ? `<td class="num">${r.hasReal && s.anyReal ? window.fmtMoney(r.real) : '—'}</td>` : ''}
            ${showReal ? fmtPctRowGasto(r.cot, r.real) : ''}
            ${showReal ? fmtDeltaInRowGasto(r.cot, r.real) : ''}
          </tr>`;
            const subs = open ? deptos.map((dp, di) => `
          <tr class="summary-subrow" style="background:var(--accent-bg);">
            <td style="padding-left:30px;color:var(--ink-secondary);font-size:13px;border-left:3px solid var(--accent-soft);">${escapeHtml(dp.label)}</td>
            <td class="pct">${pctOfClient(dp.cot)}</td>
            <td class="num" style="color:var(--ink-secondary);">${window.fmtMoney(dp.cot)}</td>
            ${showReal ? `<td class="num" style="color:var(--ink-secondary);">${s.anyReal ? window.fmtMoney(dp.real) : '—'}</td>` : ''}
            ${showReal ? fmtPctRowGasto(dp.cot, dp.real) : ''}
            ${showReal ? fmtDeltaInRowGasto(dp.cot, dp.real) : ''}
          </tr>`).join('') : '';
            return head + subs;
          }
          return `
          <tr>
            <td>${r.label}</td>
            <td class="pct">${pctOfClient(r.cot)}</td>
            <td class="num">${window.fmtMoney(r.cot)}</td>
            ${showReal ? `<td class="num">${r.hasReal && s.anyReal ? window.fmtMoney(r.real) : '—'}</td>` : ''}
            ${showReal ? fmtPctRowGasto(r.cot, r.real) : ''}
            ${showReal ? fmtDeltaInRowGasto(r.cot, r.real) : ''}
          </tr>`;
        }).join('')}

        <tr class="summary-row">
          <td>Subtotal Producción</td>
          <td class="pct">${pctOfClient(s.subtotal.cot)}</td>
          <td class="num">${window.fmtMoney(s.subtotal.cot)}</td>
          ${showReal ? `<td class="num">${s.anyReal ? window.fmtMoney(s.subtotal.real) : '—'}</td>` : ''}
          ${showReal ? fmtPctRowGasto(s.subtotal.cot, s.subtotal.real) : ''}
          ${showReal ? fmtDeltaInRowGasto(s.subtotal.cot, s.subtotal.real) : ''}
        </tr>

        <tr>
          <td>Gastos administrativos
            <span class="tt" data-tip="% sobre subtotal producción. Cubre el overhead operativo de la empresa (oficina, herramientas, contadora, etc.). Default: 5%.">?</span>
          </td>
          <td class="input-cell-narrow">
            <input type="number" step="0.5" min="0" max="100"
                   value="${(fin.gastosAdminPct * 100).toFixed(1)}"
                   ${lockedAttr}
                   onchange="updateFinanzasField('gastosAdminPct', (parseFloat(this.value)||0)/100); renderSummaryFin();">%
          </td>
          <td class="num">${window.fmtMoney(s.admin.cot)}</td>
          ${showReal ? `<td class="num">${s.anyReal ? window.fmtMoney(s.admin.real) : '—'}</td>` : ''}
          ${showReal ? '<td class="pct">—</td>' : ''}
          ${showReal ? fmtDeltaInRowGasto(s.admin.cot, s.admin.real) : ''}
        </tr>

        ${s.riesgos.map((r, idx) => `
          <tr class="riesgo-row">
            <td>
              <input type="text" class="riesgo-name-input"
                     value="${escapeHtml(r.label)}"
                     placeholder="Nombre del riesgo"
                     ${lockedAttr}
                     onchange="updateRiesgoLabel(${idx}, this.value);">
              ${locked ? '' : `<button class="riesgo-del-btn" title="Eliminar riesgo"
                      onclick="deleteRiesgo(${idx}); renderSummaryFin();">×</button>`}
            </td>
            <td class="input-cell-narrow">
              <select class="riesgo-mode-select"
                      ${lockedSelectAttr}
                      onchange="updateRiesgoMode(${idx}, this.value); renderSummaryFin();">
                <option value="monto" ${r.mode === 'monto' ? 'selected' : ''}>$</option>
                <option value="pct" ${r.mode === 'pct' ? 'selected' : ''}>%</option>
              </select>
              <input type="${r.mode === 'pct' ? 'number' : 'text'}" ${r.mode === 'pct' ? 'step="0.5"' : 'inputmode="numeric"'} min="0"
                     value="${r.mode === 'pct' ? ((r.value || 0) * 100).toFixed(1) : window.displayMoneyInputValue(r.value)}"
                     ${lockedAttr}
                     onchange="updateRiesgoValue(${idx}, ${r.mode === 'pct' ? '(parseFloat(this.value)||0)/100' : 'window.parseMoneyCLP(this.value)||0'}); renderSummaryFin();">
              ${r.mode === 'pct' ? '%' : ''}
            </td>
            <td class="num">${window.fmtMoney(r.cot)}</td>
            ${showReal ? `<td class="num">${s.anyReal ? window.fmtMoney(r.real) : '—'}</td>` : ''}
            ${showReal ? '<td class="pct">—</td>' : ''}
            ${showReal ? fmtDeltaInRowGasto(r.cot, r.real) : ''}
          </tr>
        `).join('')}

        ${locked ? '' : `
        <tr class="riesgo-add-row">
          <td colspan="${showReal ? 6 : 3}">
            <button class="row-add-riesgo" onclick="addRiesgo(); renderSummaryFin();">
              + Agregar riesgo / contingencia
            </button>
            <span class="tt" data-tip="Riesgos y contingencias adicionales: fees de transferencia internacional (Stripe, Wise), conversión de moneda, riesgo climático, contingencia de locación, etc.\n\nGastos administrativos sigue fijo; esto se agrega encima." style="margin-left: 6px;">?</span>
          </td>
        </tr>
        `}

        ${showReal && s.horasExtra && s.horasExtra.real > 0 ? `
        <tr>
          <td>Horas extra <span class="tt" data-tip="Horas extra reales (costo empresa, ya con la conversión por DTE real). Es un costo del lado real: no tiene equivalente cotizado y se suma al Costo de Producción real, después de Gastos administrativos y Contingencias. Cárgalas por fila con doble clic en la columna «Horas extra».">?</span></td>
          <td class="pct">—</td>
          <td class="num">—</td>
          <td class="num">${window.fmtMoney(s.horasExtra.real)}</td>
          ${fmtPctRowGasto(0, s.horasExtra.real)}
          ${fmtDeltaInRowGasto(0, s.horasExtra.real)}
        </tr>` : ''}

        <tr class="summary-row">
          <td>Costo de Producción</td>
          <td class="pct">${pctOfClient(s.costoProd.cot)}</td>
          <td class="num">${window.fmtMoney(s.costoProd.cot)}</td>
          ${showReal ? `<td class="num">${s.anyReal ? window.fmtMoney(s.costoProd.real) : '—'}</td>` : ''}
          ${showReal ? fmtPctRowGasto(s.costoProd.cot, s.costoProd.real) : ''}
          ${showReal ? fmtDeltaInRowGasto(s.costoProd.cot, s.costoProd.real) : ''}
        </tr>

        <tr>
          <td><strong style="color: var(--ink-primary);">Presupuesto Cliente (NETO)</strong>
            <span class="tt" data-tip="Lo que se le cobra al cliente sin IVA. Si tu cliente paga con factura, el IVA se suma encima de este valor. Si paga con boleta exenta o como persona natural, este es el valor total.">?</span>
            ${locked ? '<span class="locked-badge" data-tip="Bloqueado: el presupuesto cliente original queda congelado al aprobar el proyecto. Para cobros adicionales, agrega ítems extras en las secciones correspondientes.">🔒</span>' : ''}
          </td>
          <td class="pct">—</td>
          <td class="num editable-cell" colspan="${showReal ? 4 : 1}">
            <input type="text" inputmode="numeric"
                   value="${window.displayMoneyInputValue(s.presupCliente)}"
                   placeholder="Ingresa monto cotizado al cliente"
                   ${lockedAttr}
                   onchange="updateFinanzasField('presupuestoCliente', window.parseMoneyCLP(this.value)||0); renderSummaryFin();">
          </td>
        </tr>

        ${/* V5.3 (Nota 3): EXTRAS DE INGRESO — ampliaciones cobradas al
             cliente sin tocar la cotización original. Siempre editables
             (incluso con el proyecto bloqueado: ese es justamente su
             propósito). Estilo idéntico a riesgos/comisiones. */''}
        ${s.extras.map((x, idx) => `
          <tr class="extra-ingreso-row">
            <td>
              <input type="text" class="riesgo-name-input"
                     value="${escapeHtml(x.label || '')}"
                     placeholder="Nombre del extra / ampliación"
                     onchange="updateExtraIngresoLabel(${idx}, this.value);">
              <button class="riesgo-del-btn" title="Eliminar extra"
                      onclick="deleteExtraIngreso(${idx}); renderSummaryFin();">×</button>
            </td>
            <td class="pct">+${baseCliente > 0 ? ((x.monto || 0) / baseCliente * 100).toFixed(1) : '0.0'}%</td>
            <td class="num editable-cell" colspan="${showReal ? 4 : 1}">
              <input type="text" inputmode="numeric"
                     value="${window.displayMoneyInputValue(x.monto || 0)}"
                     placeholder="Monto extra al cliente"
                     onchange="updateExtraIngresoMonto(${idx}, window.parseMoneyCLP(this.value)||0); renderSummaryFin();">
            </td>
          </tr>
        `).join('')}

        <tr class="extra-ingreso-add-row">
          <td colspan="${showReal ? 6 : 3}">
            <button class="row-add-extra-ingreso" onclick="addExtraIngreso(); renderSummaryFin();">
              + Agregar extra / ampliación al cliente
            </button>
            <span class="tt" data-tip="Ingresos adicionales que se le cobran al cliente DESPUÉS de aprobar (ampliaciones de alcance, días extra de rodaje, entregables adicionales, etc.).&#10;&#10;No tocan la cotización original (que queda congelada): se suman aparte para mantener la trazabilidad de cuánto creció el proyecto." style="margin-left: 6px;">?</span>
          </td>
        </tr>

        ${s.totalExtras > 0 ? `
        <tr class="summary-row efectivo-row">
          <td><strong>Presupuesto Cliente Efectivo (NETO)</strong>
            <span class="tt" data-tip="Presupuesto Cliente original + suma de extras / ampliaciones. Es la base real (en neto, sin IVA) sobre la que se calcula la ganancia y los márgenes.">?</span>
          </td>
          <td class="pct">100%</td>
          <td class="num"><strong>${window.fmtMoney(s.presupCliente)}</strong></td>
          ${showReal ? `<td class="num"><strong>${window.fmtMoney(s.presupClienteEfectivo)}</strong></td>` : ''}
          ${showReal ? '<td class="pct">—</td>' : ''}
          ${showReal ? '<td class="num">—</td>' : ''}
        </tr>
        ` : ''}

        <tr class="summary-row">
          <td>Ganancia parcial</td>
          <td class="pct">${s.presupCliente > 0 ? ((s.gananciaParcial.cot / s.presupCliente) * 100).toFixed(1) + '%' : '—'}</td>
          <td class="num" style="color: ${s.gananciaParcial.cot >= 0 ? 'var(--positive)' : 'var(--negative)'};">${window.fmtMoney(s.gananciaParcial.cot)}</td>
          ${showReal ? `<td class="num" style="color: ${s.gananciaParcial.real >= 0 ? 'var(--positive)' : 'var(--negative)'};">${s.anyReal ? window.fmtMoney(s.gananciaParcial.real) : '—'}</td>` : ''}
          ${showReal ? fmtPctRowGanancia(s.gananciaParcial.cot, s.gananciaParcial.real) : ''}
          ${showReal ? fmtDeltaInRowGanancia(s.gananciaParcial.cot, s.gananciaParcial.real) : ''}
        </tr>

        ${s.comisiones.map((c, idx) => `
          <tr class="commission-row">
            <td>
              <input type="text" class="comission-name-input"
                     value="${escapeHtml(c.label)}"
                     placeholder="Nombre de la comisión"
                     ${lockedAttr}
                     onchange="updateComisionLabel(${idx}, this.value);">
              ${locked ? '' : `<button class="comission-del-btn" title="Eliminar comisión"
                      onclick="deleteComision(${idx}); renderSummaryFin();">×</button>`}
            </td>
            <td class="input-cell-narrow">
              <select class="riesgo-mode-select"
                      ${lockedSelectAttr}
                      onchange="updateComisionMode(${idx}, this.value); renderSummaryFin();">
                <option value="monto" ${c.mode === 'monto' ? 'selected' : ''}>$</option>
                <option value="pct" ${c.mode === 'pct' ? 'selected' : ''}>%</option>
              </select>
              <input type="${c.mode === 'pct' ? 'number' : 'text'}" ${c.mode === 'pct' ? 'step="0.5"' : 'inputmode="numeric"'} min="0"
                     value="${c.mode === 'pct' ? ((c.value || 0) * 100).toFixed(1) : window.displayMoneyInputValue(c.value)}"
                     ${lockedAttr}
                     onchange="updateComisionValue(${idx}, ${c.mode === 'pct' ? '(parseFloat(this.value)||0)/100' : 'window.parseMoneyCLP(this.value)||0'}); renderSummaryFin();">
              ${c.mode === 'pct' ? '%' : ''}
            </td>
            <td class="num">${window.fmtMoney(c.cot)}</td>
            ${showReal ? `<td class="num">${s.anyReal ? window.fmtMoney(c.real) : '—'}</td>` : ''}
            ${showReal ? '<td class="pct">—</td>' : ''}
            ${showReal ? fmtDeltaInRowGasto(c.cot, c.real) : ''}
          </tr>
        `).join('')}

        ${locked ? '' : `
        <tr class="commission-add-row">
          <td colspan="${showReal ? 6 : 3}">
            <button class="row-add-comision" onclick="addComision(); renderSummaryFin();">
              + Agregar comisión
            </button>
          </td>
        </tr>
        `}

        <tr class="final-row">
          <td>GANANCIA FINAL PRIMATE (NETO)</td>
          <td class="pct">${(margenPctCot * 100).toFixed(1)}%</td>
          <td class="num">${window.fmtMoney(s.gananciaFinal.cot)}</td>
          ${showReal ? `<td class="num">${s.anyReal ? window.fmtMoney(s.gananciaFinal.real) : '—'}</td>` : ''}
          ${showReal ? fmtPctRowGanancia(s.gananciaFinal.cot, s.gananciaFinal.real) : ''}
          ${showReal ? fmtDeltaInRowGanancia(s.gananciaFinal.cot, s.gananciaFinal.real) : ''}
        </tr>
      </tbody>
    </table>
  `;
}

function updateFinanzasField(field, value) {
  STATE.currentProject.data.finanzas[field] = value;
}

/* V8.1: comisiones soportan modo % (sobre ganancia parcial) o monto fijo. */
function updateComisionMode(idx, mode) {
  const c = STATE.currentProject.data.finanzas.comisiones[idx];
  c.mode = mode;
  c.value = 0;            // reset al cambiar modo (% y $ tienen magnitudes distintas)
  if ('pct' in c) delete c.pct;
}
function updateComisionValue(idx, value) {
  const c = STATE.currentProject.data.finanzas.comisiones[idx];
  c.value = value;
  if ('pct' in c) delete c.pct;
}

/* V5.1.1: comisiones dinámicas */
function updateComisionLabel(idx, value) {
  STATE.currentProject.data.finanzas.comisiones[idx].label = value || 'Comisión';
}
function addComision() {
  STATE.currentProject.data.finanzas.comisiones.push({ label: 'Comisión', mode: 'pct', value: 0 });
}
function deleteComision(idx) {
  STATE.currentProject.data.finanzas.comisiones.splice(idx, 1);
}

/* V5.2.1: riesgos / contingencias dinámicos */
function updateRiesgoLabel(idx, value) {
  STATE.currentProject.data.finanzas.riesgos[idx].label = value || 'Riesgo';
}
function updateRiesgoMode(idx, mode) {
  STATE.currentProject.data.finanzas.riesgos[idx].mode = mode;
  // Reset value cuando cambia modo (% a $ tendría magnitudes muy distintas)
  STATE.currentProject.data.finanzas.riesgos[idx].value = 0;
}
function updateRiesgoValue(idx, value) {
  STATE.currentProject.data.finanzas.riesgos[idx].value = value;
}
function addRiesgo() {
  if (!STATE.currentProject.data.finanzas.riesgos) {
    STATE.currentProject.data.finanzas.riesgos = [];
  }
  STATE.currentProject.data.finanzas.riesgos.push({ label: 'Riesgo / contingencia', mode: 'monto', value: 0 });
}
function deleteRiesgo(idx) {
  STATE.currentProject.data.finanzas.riesgos.splice(idx, 1);
}

/* ─── V5.3 (Nota 3): EXTRAS DE INGRESO ──────────────────────────────
   Ampliaciones cobradas al cliente post-aprobación. No tocan la
   cotización original; suman al Presupuesto Cliente Efectivo. */
function addExtraIngreso() {
  const fin = STATE.currentProject.data.finanzas;
  if (!fin.extras) fin.extras = [];
  fin.extras.push({ label: '', monto: 0 });
}
function updateExtraIngresoLabel(idx, value) {
  STATE.currentProject.data.finanzas.extras[idx].label = value;
}
function updateExtraIngresoMonto(idx, value) {
  STATE.currentProject.data.finanzas.extras[idx].monto = value;
}
function deleteExtraIngreso(idx) {
  STATE.currentProject.data.finanzas.extras.splice(idx, 1);
}
function recalcKPIs() {
  renderSummaryFin();
}

function recalcAlerts() {
  const project = STATE.currentProject;
  if (!project) return;
  const alerts = [];

  // Filas con valor o cantidad pero sin DTE — solo en secciones donde DTE es requerido
  const checkSection = (items, sectionLabel, dteRequired) => {
    items.forEach((r, idx) => {
      const label = r.nombre || r.rol || r.item || '(sin nombre)';
      if (dteRequired && (r.cantidad > 0 && r.valor) && !r.dte) {
        alerts.push({ kind: 'warning', text: `${sectionLabel} · ${label}: falta seleccionar DTE` });
      }
      if (r.confirmado && !r.nombre) {
        alerts.push({ kind: 'info', text: `${sectionLabel} · ${r.rol || r.item}: marcado confirmado sin nombre asignado` });
      }
    });
  };
  for (const dept in project.data.servicios) {
    checkSection(project.data.servicios[dept], `Servicios > ${dept}`, true);
  }
  checkSection(project.data.gastos,   'Gastos',   false);  // V5.1.1: DTE opcional
  checkSection(project.data.equipos,  'Técnica',  false);  // V5.1.1: DTE opcional
  checkSection(project.data.talentos, 'Talentos', true);

  const el = document.getElementById('presupuestoAlerts');
  if (!el) return;
  if (alerts.length === 0) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `
    <div class="form-section" style="padding: var(--space-4); border-color: var(--warning-bg);">
      <div style="font-size: 11px; color: var(--ink-muted); margin-bottom: 8px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;">
        Advertencias del sistema · ${alerts.length}
      </div>
      ${alerts.slice(0, 8).map(a => `
        <div class="alert alert-${a.kind === 'warning' ? 'warning' : 'info'}" style="margin-bottom: 6px; padding: 7px 12px; font-size: 12px;">
          <span class="alert-icon">${a.kind === 'warning' ? '⚠' : 'ℹ'}</span>
          <div>${escapeHtml(a.text)}</div>
        </div>
      `).join('')}
      ${alerts.length > 8 ? `<div style="font-size: 11px; color: var(--ink-muted); margin-top: 6px;">… y ${alerts.length - 8} alertas más</div>` : ''}
    </div>
  `;
}

/* ════════════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════
   MÓDULO: CREW (vista derivada del Presupuesto)
   ════════════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════

   El Crew NO es una tabla editable libre. Es el espejo de las personas
   confirmadas en el Presupuesto, con datos operativos auto-completados
   desde window.BD_PERSONAS. El único campo editable aquí es "medio de transporte"
   (vive en project.data.crewExtra).

   Si una persona aparece en Presupuesto como confirmada pero su nombre
   no está en BD, se muestra una advertencia visual para invitar a
   agregarla a la BD.
   ════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════
   V6.0 · MÓDULO COTIZACIÓN / OFERTAS
   ════════════════════════════════════════════════════════════════════
   Un proyecto presenta al cliente una o varias OFERTAS (packs). Cada oferta
   tiene su contenido de cara al cliente (valor, descripción, qué incluye /
   qué NO, entregables) y, opcionalmente, un PRESUPUESTO ALTERNATIVO interno:
   una copia liviana y costeable del presupuesto real (sin nombres ni datos
   operativos) que existe SOLO para saber si la oferta es rentable.

   El costeo NO duplica lógica: reutiliza calcSummaryFin() envolviendo el
   snapshot en un proyecto-fantasma en estado 'venta'.

   window.markDirty(undo + autosave) se dispara solo en los onchange/oninput por los
   listeners globales del documento; las mutaciones por click (agregar/quitar
   oferta o fila, crear/eliminar presupuesto alternativo) llaman window.markDirty()
   explícitamente porque un 'click' no es un evento 'change'.
   ════════════════════════════════════════════════════════════════════ */

function jsq(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

/* Monto del Presupuesto real del proyecto (NETO al cliente). */
function cotRealPresup(project) {
  const f = project.data.finanzas || {};
  return f.presupuestoCliente || 0;
}

/* "Incluye" por defecto = lo realmente considerado en el presupuesto:
   ítems con cantidad >= 1 (tener un valor de tarifa NO basta; un proyecto
   nuevo trae tarifas de referencia con cantidad 0 que no deben aparecer). */
function cotDefaultIncluye(project) {
  const d = project.data, out = [], seen = new Set();
  for (const dept in d.servicios) {
    d.servicios[dept].forEach(r => {
      const rol = (r.rol || '').trim();
      if (rol && (r.cantidad || 0) >= 1 && !seen.has(rol.toLowerCase())) { seen.add(rol.toLowerCase()); out.push(rol); }
    });
  }
  if ((d.gastos || []).some(r => (r.cantidad || 0) >= 1)) out.push('Gastos de producción');
  if ((d.talentos || []).some(r => (r.cantidad || 0) >= 1)) out.push('Talentos y derechos');
  return out;
}

/* V6.1 (Nota 5c): "NO incluye" pasa a ser MANUAL. Automatizarlo arriesga
   decir que NO se incluye algo que en realidad sí (error comercial), así que
   ya no se autogenera; el usuario lo redacta. Función eliminada a propósito. */

function cotVerId() { return 'cv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6); }

/* ════════════════════════════════════════════════════════════════════
   V7.5 · VERSIONES DE COTIZACIÓN (solo etapa Venta)
   Cada versión es una cotización completa (ofertas + condiciones + meta).
   ensureCotizacion() devuelve la versión ACTIVA, así toda la UI de
   Cotización sigue operando igual. d.cotizacion se mantiene como espejo
   de la activa (compat con clientes V7.4.x durante la transición en nube).
   La oferta base sigue al Presupuesto en vivo SOLO en la última versión;
   las anteriores conservan su resumen congelado (historial de negociación).
   ════════════════════════════════════════════════════════════════════ */
function ensureCotizaciones(project) {
  const d = project.data;
  if (!d.cotizaciones || !Array.isArray(d.cotizaciones.versiones) || !d.cotizaciones.versiones.length) {
    const base = d.cotizacion || { fechaEmision: '', representanteCliente: '', condiciones: Object.assign({}, window.COTIZACION_CONDICIONES_DEFAULTS), ofertas: [] };
    const v = Object.assign({}, base, { id: cotVerId(), numero: 1, label: 'Versión 1', nota: '', createdAt: new Date().toISOString(), resumen: (base.resumen || null) });
    d.cotizaciones = { activoId: v.id, versiones: [v] };
  }
  const cs = d.cotizaciones;
  cs.versiones.forEach((v, i) => {
    if (!v.id) v.id = cotVerId();
    if (v.numero === undefined) v.numero = i + 1;
    if (!v.label) v.label = 'Versión ' + v.numero;
    if (v.nota === undefined) v.nota = '';
    if (!v.createdAt) v.createdAt = new Date().toISOString();
    if (v.resumen === undefined) v.resumen = null;
  });
  if (!cs.versiones.find(v => v.id === cs.activoId)) cs.activoId = cs.versiones[cs.versiones.length - 1].id;
  d.cotizacion = cs.versiones.find(v => v.id === cs.activoId);   // espejo back-compat
  return cs;
}

function ensureCotizacion(project) {
  const cs = ensureCotizaciones(project);
  const c = cs.versiones.find(v => v.id === cs.activoId);
  if (!c.condiciones) c.condiciones = Object.assign({}, window.COTIZACION_CONDICIONES_DEFAULTS);
  else for (const k in window.COTIZACION_CONDICIONES_DEFAULTS) if (c.condiciones[k] === undefined) c.condiciones[k] = window.COTIZACION_CONDICIONES_DEFAULTS[k];
  if (!Array.isArray(c.ofertas)) c.ofertas = [];
  if (c.descripcionProyecto === undefined) {
    const wd = c.ofertas.find(o => (o.descripcion || '').trim());
    c.descripcionProyecto = wd ? wd.descripcion : '';
  }
  if (c.jornadasRodaje === undefined) c.jornadasRodaje = '';
  c.ofertas.forEach(o => {
    if (!Array.isArray(o.incluye)) o.incluye = [];
    if (!Array.isArray(o.noIncluye)) o.noIncluye = [];
    if (!o.entregables) o.entregables = { videos: [], fotografia: [], otros: [] };
    if (!Array.isArray(o.entregables.fotografia)) o.entregables.fotografia = [];
    if (!Array.isArray(o.entregables.otros)) o.entregables.otros = [];
    if (!Array.isArray(o.entregables.videos)) o.entregables.videos = [];
    o.entregables.videos = o.entregables.videos.map(v =>
      (typeof v === 'string') ? { nombre: v, variables: [] }
      : (v && typeof v === 'object') ? { nombre: v.nombre || '', variables: Array.isArray(v.variables) ? v.variables : [] }
      : { nombre: '', variables: [] });
    if (o.esBase === undefined) o.esBase = false;
    if (o.presupuestoAlt === undefined) o.presupuestoAlt = null;
  });
  return c;
}

function cotContarEntregables(c) {
  const o = (c.ofertas || []).find(x => x.esBase) || (c.ofertas || [])[0];
  if (!o || !o.entregables) return 0;
  const e = o.entregables;
  return (e.videos || []).length + (e.fotografia || []).length + (e.otros || []).length;
}

/* Congela el resumen financiero/comercial de una versión. Para la última
   versión se llama en cada render (en vivo); para las anteriores queda
   congelado al momento en que dejaron de ser la última. */
function cotCaptureResumen(project, c) {
  const fin = calcSummaryFin(project);
  const valor = fin.presupCliente || 0;
  const base = (c.ofertas || []).find(o => o.esBase);
  c.resumen = {
    valor: valor,
    costo: fin.costoProd.cot,
    ganancia: fin.gananciaFinal.cot,
    margenPct: valor ? (fin.gananciaFinal.cot / valor) : 0,
    nOfertas: (c.ofertas || []).length,
    nEntregables: cotContarEntregables(c),
    jornadas: c.jornadasRodaje || '',
    nIncluye: (base && base.incluye ? base.incluye.length : 0)
  };
}

function cotUltimaNum(cs) { return Math.max.apply(null, cs.versiones.map(v => v.numero || 0)); }

function cotVersionSwitcherHTML(project) {
  const cs = ensureCotizaciones(project);
  const locked = cotizadoLocked(project);
  const chips = cs.versiones.slice().sort((a, b) => (a.numero || 0) - (b.numero || 0)).map(v => {
    const act = v.id === cs.activoId;
    const r = v.resumen;
    const sub = r ? `${window.fmtMoney(r.valor)} · ${window.fmtPct(r.margenPct)}` : 'sin datos';
    return `<button class="cotver-chip ${act ? 'is-active' : ''}" onclick="cotSetActiveVersion('${v.id}')" title="${escapeHtml(v.nota || v.label)}">
       <span class="cotver-chip-label">${escapeHtml(v.label)}${act ? ' · activa' : ''}</span>
       <span class="cotver-chip-sub">${sub}</span>
     </button>`;
  }).join('');
  const activa = cs.versiones.find(v => v.id === cs.activoId) || {};
  return `<div class="cot-card cotver-card">
    <div class="cotver-head">
      <div class="cot-card-title" style="margin:0;">Versiones de cotización <span class="tt" data-tip="Iteraciones de la negociación durante la etapa Venta. Cada versión es una copia completa (ofertas, precios, alcance). La anterior se preserva como historial.">?</span></div>
      <div class="cotver-actions">
        <button class="btn btn-secondary btn-sm" onclick="cotAbrirComparador()" ${cs.versiones.length < 2 ? 'disabled title="Crea una segunda versión para comparar"' : ''}>Comparar</button>
        <button class="btn btn-primary btn-sm" onclick="cotCrearVersion()" ${locked ? 'disabled title="El versionado es solo de la etapa Venta. El proyecto ya está aprobado."' : ''}>+ Nueva versión</button>
      </div>
    </div>
    <div class="cotver-chips">${chips}</div>
    <div class="cot-field" style="margin-top:12px;">
      <label>Nota de esta versión <span class="tt" data-tip="Ej: 'más económica', 'sin día 2', 'reducción de alcance'. Aparece en el comparador.">?</span></label>
      <input class="cot-input" value="${escapeHtml(activa.nota || '')}" placeholder="¿Qué cambia en esta versión respecto a la anterior?" onchange="cotSetVersionNota(this.value)">
    </div>
  </div>`;
}

function cotVersionHistBanner() {
  return `<div class="cot-card" style="border-left:3px solid var(--accent,#c2410c);">
    <p style="margin:0;font-size:12.5px;color:var(--ink-secondary);line-height:1.5;">Estás viendo una <strong>versión anterior</strong> (histórica). La última versión es la que manda y la que sigue al Presupuesto en vivo. Aquí los datos quedan como referencia de negociación; para seguir avanzando, vuelve a la última versión o crea una nueva.</p>
  </div>`;
}

function cotSetVersionNota(value) {
  const cs = ensureCotizaciones(STATE.currentProject);
  const v = cs.versiones.find(x => x.id === cs.activoId);
  if (v) { v.nota = value; window.markDirty(); }
}

function cotCrearVersion() {
  const project = STATE.currentProject;
  if (cotizadoLocked(project)) {
    showToast({ kind: 'warning', title: 'Solo en etapa Venta', body: 'El versionado de cotización es una herramienta de negociación previa a la aprobación. Después de aprobado, los cambios son extras, no una nueva versión.' });
    return;
  }
  const cs = ensureCotizaciones(project);
  const activo = cs.versiones.find(v => v.id === cs.activoId);
  cotCaptureResumen(project, activo);   // congelar el resumen de la versión saliente
  activo.presupSnap = snapshotFullBudget(project);   // V8.3.4: congelar el presupuesto COMPLETO de la versión saliente
  const copia = JSON.parse(JSON.stringify(activo));
  copia.id = cotVerId();
  copia.numero = cotUltimaNum(cs) + 1;
  copia.label = 'Versión ' + copia.numero;
  copia.nota = '';
  copia.createdAt = new Date().toISOString();
  delete copia.presupSnap;   // la nueva (última) sigue el presupuesto en vivo, no un snapshot
  cs.versiones.push(copia);
  cs.activoId = copia.id;
  window.markDirty();
  renderCotizacion();
  showToast({ kind: 'success', title: `Versión ${copia.numero} creada`, body: 'Es una copia de la anterior, lista para editar. La versión previa quedó preservada como historial.' });
}

function cotSetActiveVersion(id) {
  const project = STATE.currentProject;
  const cs = ensureCotizaciones(project);
  if (!cs.versiones.find(v => v.id === id)) return;
  cs.activoId = id;
  window.markDirty();
  renderCotizacion();
}

let _cotCmpOffer = null;   // V8.3.2 — oferta seleccionada en el comparador

/* V8.3.2 — nombres de oferta presentes en alguna versión (base primero). */
function cmpOfferNames(cs) {
  const out = [];
  cs.versiones.slice().sort((a, b) => (a.numero || 0) - (b.numero || 0)).forEach(v => {
    (v.ofertas || []).forEach(o => { const n = o.nombre || 'Oferta'; if (out.indexOf(n) === -1) out.push(n); });
  });
  return out;
}

/* V8.3.2 — financiero de UNA oferta en UNA versión. La base de la última usa
   el presupuesto en vivo (ofertaCosteo); las alternativas usan su snapshot;
   la base de una versión histórica usa el resumen congelado de esa versión. */
function cmpOfferFin(project, cs, v, o) {
  if (!o) return null;
  const esUltima = (v.numero || 0) === cotUltimaNum(cs);
  if (o.esBase && !esUltima) {
    const r = v.resumen || {};
    return { valor: (r.valor != null ? r.valor : null), costo: (r.costo != null ? r.costo : null), ganancia: (r.ganancia != null ? r.ganancia : null), margen: (r.margenPct != null ? r.margenPct : null) };
  }
  const fin = ofertaCosteo(project, o);
  if (!fin) return { valor: (o.valorCliente != null ? o.valorCliente : null), costo: null, ganancia: null, margen: null };
  const valor = (fin.presupCliente != null && fin.presupCliente > 0) ? fin.presupCliente : (o.valorCliente || 0);
  const costo = fin.costoProd ? fin.costoProd.cot : null;
  const ganancia = fin.gananciaFinal ? fin.gananciaFinal.cot : null;
  const margen = (valor > 0 && ganancia != null) ? (ganancia / valor) : null;
  return { valor: valor, costo: costo, ganancia: ganancia, margen: margen };
}

function cotCmpSelectOffer(name) {
  _cotCmpOffer = name;
  const el = document.getElementById('cotCmpBody');
  if (el) el.innerHTML = cotCmpBodyHTML(STATE.currentProject);
}

function cotCmpBodyHTML(project) {
  const cs = ensureCotizaciones(project);
  const vs = cs.versiones.slice().sort((a, b) => (a.numero || 0) - (b.numero || 0));
  const names = cmpOfferNames(cs);
  if (names.indexOf(_cotCmpOffer) === -1) {
    const ultima = cs.versiones.find(v => (v.numero || 0) === cotUltimaNum(cs)) || vs[vs.length - 1];
    const base = (ultima.ofertas || []).find(o => o.esBase);
    _cotCmpOffer = (base && base.nombre) || names[0];
  }
  const sel = _cotCmpOffer;
  const cols = vs.map(v => { const o = (v.ofertas || []).find(x => (x.nombre || 'Oferta') === sel) || null; return { v: v, o: o, fin: cmpOfferFin(project, cs, v, o) }; });
  const baseCol = cols.find(c => c.fin) || null;
  const presentes = cols.filter(c => c.fin).length;

  const selector = `<div class="cot-field" style="margin:0 0 12px;max-width:340px;">
    <label>Oferta a comparar <span class="tt" data-tip="El comparador trabaja una oferta a la vez (ej: Oferta base, Oferta Full). Si una versión no tiene esa oferta, aparece como no comparable.">?</span></label>
    <select class="cot-input" onchange="cotCmpSelectOffer(this.value)">${names.map(n => `<option ${n === sel ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}</select>
  </div>`;
  const comparando = `<p style="margin:0 0 12px;font-size:13px;color:var(--ink-secondary);">Comparando: <strong style="color:var(--ink-primary,#222);">${escapeHtml(sel)}</strong></p>`;

  let kpi = '';
  const conOferta = cols.filter(c => c.fin && c.fin.valor != null);
  if (conOferta.length >= 2) {
    const a = conOferta[0], b = conOferta[conOferta.length - 1];
    const d = (b.fin.valor || 0) - (a.fin.valor || 0);
    const color = (Math.round(d) === 0) ? 'var(--ink-faint)' : (d >= 0 ? '#15803d' : '#b91c1c');
    kpi = `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:var(--bg-surface-soft);border:1px solid var(--rule);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:14px;">
      <div><div style="font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.05em;">${escapeHtml(a.v.label)}</div><div style="font-size:17px;font-weight:700;font-variant-numeric:tabular-nums;">${window.fmtMoney(a.fin.valor)}</div></div>
      <div style="font-size:20px;color:var(--ink-faint);">&rarr;</div>
      <div><div style="font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.05em;">${escapeHtml(b.v.label)}</div><div style="font-size:17px;font-weight:700;font-variant-numeric:tabular-nums;">${window.fmtMoney(b.fin.valor)}</div></div>
      <div style="margin-left:auto;text-align:right;"><div style="font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.05em;">&Delta; valor cotizado</div><div style="font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;color:${color};">${fmtDelta(d)}</div></div>
    </div>`;
  }

  const ppDelta = (d) => { if (d == null || !isFinite(d)) return '—'; const r = (d * 100); if (Math.abs(r) < 0.05) return '0,0 pp'; return (r > 0 ? '+' : '−') + Math.abs(r).toFixed(1) + ' pp'; };
  function row(label, key, fmt, goodUp, isPct) {
    return `<tr><th>${label}</th>${cols.map(c => {
      if (!c.fin) return `<td><span style="color:var(--ink-faint)">no comparable</span></td>`;
      const val = c.fin[key];
      if (val == null) return `<td>—</td>`;
      const isBase = (c === baseCol);
      let sub = '';
      if (isBase) {
        sub = `<div style="font-size:11px;color:var(--ink-faint);margin-top:2px;">base</div>`;
      } else if (baseCol && baseCol.fin[key] != null) {
        const d = val - baseCol.fin[key];
        const good = goodUp ? d >= 0 : d <= 0;
        const color = ((isPct ? Math.abs(d * 100) < 0.05 : Math.round(d) === 0)) ? 'var(--ink-faint)' : (good ? '#15803d' : '#b91c1c');
        sub = `<div style="font-size:11px;color:${color};margin-top:2px;">${isPct ? ppDelta(d) : fmtDelta(d)}</div>`;
      }
      return `<td>${fmt(val)}${sub}</td>`;
    }).join('')}</tr>`;
  }

  const tabla = `<div class="cotcmp-wrap"><table class="cotcmp-table">
    <thead><tr><th></th>${cols.map(c => `<th>${escapeHtml(c.v.label)}${c.v.id === cs.activoId ? ' ·activa' : ''}${c.o ? '' : ' <span style="color:var(--ink-faint);font-weight:400;">(sin esta oferta)</span>'}${c.v.nota ? `<span class="cotcmp-nota">${escapeHtml(c.v.nota)}</span>` : ''}</th>`).join('')}</tr></thead>
    <tbody>
      <tr class="cotcmp-group"><td colspan="${cols.length + 1}">Financiero · ${escapeHtml(sel)}</td></tr>
      ${row('Valor cotizado', 'valor', window.fmtMoney, true, false)}
      ${row('Costo de producción', 'costo', window.fmtMoney, false, false)}
      ${row('Ganancia proyectada', 'ganancia', window.fmtMoney, true, false)}
      ${row('Margen', 'margen', window.fmtPct, true, true)}
    </tbody></table></div>`;

  const nota = `<p class="config-hint" style="margin-top:12px;">El delta se calcula contra la primera versión que tiene esta oferta. La base de la última versión sigue el presupuesto en vivo; las alternativas y versiones anteriores usan su snapshot/resumen congelado.</p>`;
  return selector + comparando + kpi + tabla + nota;
}

function cotAbrirComparador() {
  const project = STATE.currentProject;
  const cs = ensureCotizaciones(project);
  if (cs.versiones.length < 2) { showToast({ kind: 'info', title: 'Necesitas 2 versiones', body: 'Crea una segunda versión para poder comparar.' }); return; }
  const ultima = cs.versiones.find(v => (v.numero || 0) === cotUltimaNum(cs));
  if (ultima) cotCaptureResumen(project, ultima);   // la última, al día
  _cotCmpOffer = null;   // cotCmpBodyHTML elige la oferta base por defecto
  const body = `<div id="cotCmpBody">${cotCmpBodyHTML(project)}</div>`;
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" onclick="window.closeModal()"><div class="modal" onclick="event.stopPropagation()" style="max-width:820px;"><div class="modal-header"><div class="modal-title">Comparador de versiones</div></div><div class="modal-body">${body}</div><div class="modal-footer"><button class="btn btn-primary" onclick="window.closeModal()">Cerrar</button></div></div></div>`;
}

function cotFindOferta(project, id) {
  const c = ensureCotizacion(project);
  return c.ofertas.find(o => o.id === id) || null;
}

function cotResolveList(o, listKey) {
  if (listKey === 'incluye') return o.incluye;
  if (listKey === 'noIncluye') return o.noIncluye;
  if (listKey === 'ent:fotografia') return o.entregables.fotografia;
  if (listKey === 'ent:otros') return o.entregables.otros;
  if (listKey === 'ent:videos') return o.entregables.videos;
  return null;
}

function cotNewId() { return 'of_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6); }

function cotNewBaseOferta(project) {
  return {
    id: cotNewId(), esBase: true, nombre: 'Oferta base',
    valorCliente: cotRealPresup(project), descripcion: '',
    incluye: cotDefaultIncluye(project), noIncluye: [],   // V6.1 (Nota 5c): NO incluye es manual (decisión comercial)
    entregables: { videos: [], fotografia: [], otros: [] }, presupuestoAlt: null
  };
}

function cotNewAltOferta(project, n) {
  return {
    id: cotNewId(), esBase: false, nombre: 'Oferta ' + n,
    valorCliente: cotRealPresup(project), descripcion: '',
    incluye: cotDefaultIncluye(project), noIncluye: [],   // V6.1 (Nota 5c): NO incluye es manual (decisión comercial)
    entregables: { videos: [], fotografia: [], otros: [] }, presupuestoAlt: snapshotFromBudget(project)
  };
}

/* Copia liviana del presupuesto real: sin nombres ni datos operativos. */
function snapshotFromBudget(project) {
  const d = project.data;
  const stripServ = {};
  for (const dept in d.servicios) {
    stripServ[dept] = d.servicios[dept].map(r => ({ rol: r.rol, valor: r.valor, cantidad: r.cantidad, unidad: r.unidad, dte: r.dte }));
  }
  const arr = a => (a || []).map(r => ({ item: r.item, valor: r.valor, cantidad: r.cantidad, unidad: r.unidad, dte: r.dte }));
  return {
    servicios: stripServ, gastos: arr(d.gastos), equipos: arr(d.equipos), talentos: arr(d.talentos),
    gastosAdminPct: (d.finanzas.gastosAdminPct != null) ? d.finanzas.gastosAdminPct : 0.05,
    comisiones: (d.finanzas.comisiones || []).map(c => ({ label: c.label, mode: c.mode || 'pct', value: (c.value != null) ? c.value : (c.pct || 0) })),
    riesgos: (d.finanzas.riesgos || []).map(r => ({ label: r.label, mode: r.mode, value: r.value }))
  };
}

/* Costeo de una oferta. Base = presupuesto real. Alternativa = su snapshot.
   En ambos casos reutiliza calcSummaryFin (no se duplica lógica de costo). */
function ofertaCosteo(project, o) {
  if (o.esBase) return calcSummaryFin(project);
  const snap = o.presupuestoAlt;
  if (!snap) return null;
  const fake = {
    state: 'venta',
    data: {
      servicios: snap.servicios || {}, gastos: snap.gastos || [], equipos: snap.equipos || [], talentos: snap.talentos || [],
      finanzas: {
        presupuestoCliente: o.valorCliente || 0,
        gastosAdminPct: (snap.gastosAdminPct != null) ? snap.gastosAdminPct : 0.05,
        frozen: null, comisiones: snap.comisiones || [], riesgos: snap.riesgos || [], extras: []
      }
    }
  };
  return calcSummaryFin(fake);
}

/* ─── RENDER ───────────────────────────────────────────────────────── */
function renderCotizacion() {
  const project = STATE.currentProject;
  if (!project) return;
  const cs = ensureCotizaciones(project);
  const c = ensureCotizacion(project);
  const esUltima = (c.numero || 0) === cotUltimaNum(cs);   // solo la última sigue el presupuesto en vivo
  // La oferta base siempre existe (es el Presupuesto real surfaceado como oferta).
  if (c.ofertas.length === 0) { c.ofertas.push(cotNewBaseOferta(project)); window.markDirty(); }
  const base = c.ofertas.find(o => o.esBase);
  if (esUltima && base) base.valorCliente = cotRealPresup(project);
  if (esUltima) cotCaptureResumen(project, c);

  const ip = project.data.infoProyecto;
  document.getElementById('moduleHeaderActions').innerHTML =
    `<div style="display:flex;gap:8px;">
       <button class="btn btn-secondary btn-sm" onclick="cotPreviewPDF()">Previsualizar PDF</button>
       <button class="btn btn-primary btn-sm" onclick="cotAddOferta()">+ Nueva oferta</button>
     </div>`;

  const todayISO = new Date().toISOString().slice(0, 10);
  const fechaVal = c.fechaEmision || todayISO;

  document.getElementById('moduleContent').innerHTML = `
    ${cotVersionSwitcherHTML(project)}
    ${esUltima ? '' : cotVersionHistBanner()}
    ${cotMetaCardHTML(project, c, ip, fechaVal)}
    ${cotCondicionesCardHTML(project, c)}
    <div id="cotOfertasWrap">
      ${c.ofertas.map((o, i) => cotOfertaCardHTML(project, o, i)).join('')}
    </div>`;
  // V10.5.1: el innerHTML de arriba borra el banner de solo-lectura; re-aplicarlo tras cada render.
  try { window.applyModuleReadonly('cotizacion'); } catch (e) {}
}

function cotMetaCardHTML(project, c, ip, fechaVal) {
  return `<div class="cot-card">
    <div class="cot-card-title">Datos de la cotización</div>
    <div class="cot-meta-grid">
      <div class="cot-field"><label>Cliente</label><div class="ro">${escapeHtml(ip.cliente || '—')}</div></div>
      <div class="cot-field"><label>Proyecto</label><div class="ro">${escapeHtml(ip.nombreProyecto || project.name || '—')}</div></div>
      <div class="cot-field"><label>Dirección</label><div class="ro">${escapeHtml(ip.director || '—')}</div></div>
      <div class="cot-field"><label>Producción Ejecutiva</label><div class="ro">${escapeHtml(ip.productorEjecutivo || '—')}</div></div>
      <div class="cot-field"><label>Representante del cliente <span class="tt" data-tip="Se autocompleta desde el Contacto Cliente de Info Proyecto. Puedes reemplazarlo si la carta requiere otro nombre.">?</span></label>
        <input class="cot-input" value="${escapeHtml(c.representanteCliente || ip.contactoCliente || '')}" placeholder="Nombre del contacto"
               onchange="cotSetMeta('representanteCliente', this.value)"></div>
      <div class="cot-field"><label>Fecha de cotización</label>
        <input type="date" class="cot-input" value="${escapeHtml(ip.fechaCotizacion || fechaVal)}"
               onchange="updateInfoField('fechaCotizacion', this.value)"></div>
      <div class="cot-field"><label>Jornadas de rodaje <span class="tt" data-tip="Cantidad de días de rodaje de esta cotización. Es un dato de alcance: no es un entregable ni va en Incluye / No incluye.">?</span></label>
        <input type="number" min="0" step="1" class="cot-input" value="${escapeHtml(c.jornadasRodaje || '')}" placeholder="Ej: 2"
               onchange="cotSetMeta('jornadasRodaje', this.value)"></div>
      <div class="cot-field"><label>Tiempo de derechos <span class="tt" data-tip="Viene de Info Proyecto › Derechos. Se edita allá; aquí solo se muestra.">?</span></label><div class="ro">${escapeHtml((ip.derechos || {}).tiempo || '—')}</div></div>
      <div class="cot-field"><label>Plataformas</label><div class="ro">${escapeHtml((ip.derechos || {}).plataformas || '—')}</div></div>
      <div class="cot-field"><label>Países / territorio</label><div class="ro">${escapeHtml((ip.derechos || {}).territorio || '—')}</div></div>
    </div>
    <div class="cot-field" style="margin-top:14px;">
      <label>Descripción del proyecto <span class="tt" data-tip="Es única y compartida por todas las ofertas: describe el proyecto, no cada alternativa comercial. Aparece una vez en la Carta.">?</span></label>
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <button class="btn btn-ghost btn-sm" style="font-weight:800;min-width:30px;" title="Negrita (envuelve la selección en **)" onclick="cotDescWrap('**')">B</button>
        <button class="btn btn-ghost btn-sm" style="font-style:italic;min-width:30px;" title="Cursiva (envuelve la selección en *)" onclick="cotDescWrap('*')">I</button>
        <span style="font-size:10.5px;color:var(--ink-faint);align-self:center;">**negrita** · *cursiva* — se aplican en el PDF</span>
      </div>
      <textarea class="cot-input" id="cotDescTa" placeholder="Describe el proyecto (concepto, alcance general)…"
                style="min-height:160px;${c.descAlto ? 'height:' + c.descAlto + 'px;' : ''}"
                onmouseup="cotDescGuardarAlto(this)"
                onchange="cotSetMeta('descripcionProyecto', this.value)">${escapeHtml(c.descripcionProyecto || '')}</textarea>
    </div>
    <p style="font-size:11.5px;color:var(--ink-faint);margin:12px 0 0;line-height:1.5;">
      Cliente, proyecto y equipo se leen de <strong>Info Proyecto</strong> (fuente única de verdad). La Carta de Cotización en PDF (V6.1) tomará todo esto automáticamente.</p>
    <div class="cot-field" style="margin-top:22px;">
      <label>Condiciones de Servicio — plantilla de la productora <span class="tt" data-tip="El texto legal/comercial del final de la carta. Es transversal: editarlo afecta TODAS las cotizaciones de la productora. Las variables {{X}} se llenan solas con los valores de cada cotización (plazos, porcentajes, montos). «## Título» abre una sección; cada línea es un punto.">?</span></label>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin:4px 0 6px;">
        ${['PRODUCTORA','CLIENTE','PROYECTO','ABONO_PCT','ABONO_PLAZO','SALDO_PCT','SALDO_PLAZO','IVA_NOTA','PRIMERA_ENTREGA','CORRECCIONES_PLAZO','RONDAS','VALOR_RONDA_EXTRA','VALOR_CAMBIO_MUSICA','CANCELACION_ANTES_PCT','CANCELACION_DESPUES_PCT','REPROGRAMACION_AVISO','REPROGRAMACION_PCT','VALIDEZ_DIAS'].map(v => `<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 7px;font-family:monospace;" onclick="cotCondInsertarVar('${v}')">{{${v}}}</button>`).join('')}
        <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 7px;color:var(--warning);" onclick="cotCondRestaurar()">↺ Restaurar texto original</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start;">
        <textarea class="cot-input" id="cotCondTa" style="min-height:300px;font-size:11.5px;line-height:1.55;font-family:monospace;" oninput="cotCondTplSet(this.value)">${escapeHtml(cotCondTplActual())}</textarea>
        <div id="cotCondPrev" style="border:1px solid var(--rule);border-radius:8px;padding:12px 14px;max-height:300px;overflow-y:auto;background:var(--bg-surface);"></div>
      </div>
    </div>
  </div>`;
}

function cotCondCollapsed(project) {
  const v = STATE.ui.collapsed[project.id + ':cot-cond'];
  return v === undefined ? true : v;   // por defecto, minimizadas
}
function cotToggleCondiciones() {
  const p = STATE.currentProject;
  STATE.ui.collapsed[p.id + ':cot-cond'] = !cotCondCollapsed(p);
  renderCotizacion();
}

function cotCondicionesCardHTML(project, c) {
  const k = c.condiciones;
  const collapsed = cotCondCollapsed(project);
  const num = (key, label, suffix, min) => `<div class="cond-field"><label>${escapeHtml(label)}</label>
    <div class="cond-inline"><input type="number" class="cot-input num" min="${min == null ? 0 : min}" value="${k[key]}"
      onchange="cotSetCondicion('${key}', window.readNum(this) ?? 0)"><span class="cond-suffix">${escapeHtml(suffix)}</span></div></div>`;
  const money = (key, label) => `<div class="cond-field"><label>${escapeHtml(label)}</label>
    <div class="cond-inline"><input type="text" inputmode="numeric" class="cot-input num" value="${window.displayMoneyInputValue(k[key])}"
      onchange="cotSetCondicionMoney(this, '${key}')"><span class="cond-suffix">CLP</span></div></div>`;
  return `<div class="cot-card">
    <div class="cot-card-title cot-collapse-head ${collapsed ? '' : 'open'}" onclick="cotToggleCondiciones()">
      <span class="chev">▶</span> Condiciones del servicio
      <span class="hint">${collapsed ? 'normalmente no se tocan · clic para editar' : 'clic para minimizar'}</span>
    </div>
    <div class="cot-collapse-body" ${collapsed ? 'hidden' : ''}>
      <div class="cond-grid" style="margin-top:12px;">
        ${num('validezDiasHabiles', 'Validez de la cotización', 'días hábiles')}
        ${num('abonoPct', 'Abono inicial', '%')}
        ${num('abonoPlazoDiasHabiles', 'Plazo del abono (tras aprobación)', 'días hábiles')}
        ${num('saldoPct', 'Saldo final', '%')}
        ${num('saldoPlazoDias', 'Plazo del saldo (tras entrega final)', 'días')}
        ${num('primeraEntregaDiasHabiles', 'Primera entrega (post rodaje)', 'días hábiles')}
        ${num('correccionesPlazoDiasHabiles', 'Plazo del cliente para correcciones', 'días hábiles')}
        ${num('rondasIncluidas', 'Rondas de corrección incluidas', 'rondas')}
        ${money('valorRondaExtra', 'Valor ronda de corrección extra')}
        ${money('valorCambioMusica', 'Cambio de música posterior')}
        ${num('cancelacionAntesPct', 'Cancelación antes del rodaje (retención)', '%')}
        ${num('cancelacionDespuesPct', 'Cancelación después del rodaje', '%')}
        ${num('reprogramacionPct', 'Recargo por reprogramación', '%')}
        ${num('reprogramacionAvisoDiasHabiles', 'Aviso mínimo de reprogramación', 'días hábiles')}
        <div class="cond-field"><label>Presentación de montos</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-secondary);font-weight:400;text-transform:none;padding:6px 0;cursor:pointer;">
            <input type="checkbox" ${k.montosMasIVA ? 'checked' : ''} onchange="cotSetCondicion('montosMasIVA', this.checked)"> Mostrar montos como “+ IVA”</label></div>
      </div>
      <p style="font-size:11.5px;color:var(--ink-faint);margin:14px 0 0;line-height:1.5;">
        Se comparten entre todas las ofertas del proyecto y alimentan el bloque “Condiciones del Servicio” de la Carta. El override por oferta se difiere hasta que un caso real lo pida.</p>
    </div>
  </div>`;
}

function cotOfertaCardHTML(project, o, i) {
  const id = o.id, base = !!o.esBase;
  const valorBlock = base
    ? `<div class="cot-field" style="margin-bottom:16px;">
         <label>Valor al cliente (neto, sin IVA)</label>
         <div class="ro" style="font-size:18px;font-weight:700;color:var(--ink-primary);padding:2px 0;">${window.fmtMoney(o.valorCliente)}</div>
         <span style="font-size:11px;color:var(--ink-faint);">Viene del Presupuesto. Para cambiarlo, edita el Presupuesto del proyecto.</span>
       </div>`
    : `<div class="cot-field" style="margin-bottom:16px;">
         <label>Valor al cliente (neto, sin IVA)</label>
         <input type="text" inputmode="numeric" class="cot-input num" style="max-width:220px;"
                value="${window.displayMoneyInputValue(o.valorCliente)}" placeholder="$0"
                onchange="cotMoneyOferta(this,'${id}')">
         <span style="font-size:11px;color:var(--ink-faint);margin-top:4px;">Parte del valor del Presupuesto. Ajústalo para esta oferta.</span>
       </div>`;

  const bottom = base
    ? `<div class="cot-card" style="margin-top:4px;">
         <div class="cot-card-title">Presupuesto</div>
         <p style="font-size:12.5px;color:var(--ink-muted);line-height:1.55;margin:0;">Esta oferta usa el <strong>Presupuesto real</strong> del proyecto. Para presentar una variante con otro presupuesto (más barata o más cara), crea una <strong>nueva oferta</strong> con el botón de arriba — vendrá con su propio presupuesto alternativo.</p>
       </div>`
    : cotSnapEditorHTML(project, o);

  return `<div class="cot-offer" id="oferta-card-${id}">
    <div class="cot-offer-head">
      <input class="cot-offer-name" value="${escapeHtml(o.nombre || '')}" placeholder="Nombre de la oferta"
             onchange="cotSetOfertaField('${id}','nombre',this.value)">
      <div style="margin-left:auto; display:flex; gap:8px; align-items:center; flex:0 0 auto;">
        <button class="btn btn-secondary btn-sm" onclick="cotExportPresupuestoCSV('${id}')" title="Descarga el detalle del presupuesto de esta oferta en CSV (se abre en Excel o Google Sheets).">⬇ Presupuesto (Excel)</button>
        ${base ? '<span class="cot-base-tag">Base · Presupuesto real</span>' : `<button class="btn btn-danger btn-sm" onclick="cotDeleteOferta('${id}')">Eliminar oferta</button>`}
      </div>
    </div>
    <div class="cot-offer-body">
      <div class="cot-offer-grid">
        <div>
          ${valorBlock}
          ${cotBulletsHTML(id, 'incluye', 'Incluye', o.incluye, false, null,
            `<button class="cot-pull-btn" onclick="cotRegenIncluye('${id}')" title="Reemplaza el Incluye con los ítems actuales del Presupuesto (cantidad ≥ 1). Sobrescribe ediciones manuales.">↻ Traer de Presupuesto</button>`)}
          ${cotBulletsHTML(id, 'noIncluye', 'NO incluye', o.noIncluye, true, 'Esta sección es manual: la redactas tú. Se deja así a propósito — automatizarla podría declarar como excluido algo que en realidad sí incluyes, lo que sería un error comercial.')}
          <span class="lbl" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-muted);font-weight:600;display:block;margin:18px 0 8px;">Entregables</span>
          ${cotVideosHTML(id, o.entregables.videos)}
          ${cotBulletsHTML(id, 'ent:fotografia', 'Fotografía', o.entregables.fotografia, false)}
          ${cotBulletsHTML(id, 'ent:otros', 'Otros', o.entregables.otros, false)}
        </div>
        <div>
          <div class="cot-margin">
            <h4>Costeo interno · no se muestra al cliente</h4>
            <div id="costeo-${id}">${cotCosteoInnerHTML(project, o)}</div>
          </div>
        </div>
      </div>
      <div id="snap-${id}">${bottom}</div>
    </div>
  </div>`;
}

function cotCosteoInnerHTML(project, o) {
  const s = ofertaCosteo(project, o);
  if (!s) return `<div class="cot-margin-empty">No se pudo calcular la rentabilidad de esta oferta.</div>`;
  const valor = o.valorCliente || 0;
  const subtotal = s.subtotal.cot;
  const admin = s.admin.cot;
  const adminPct = Math.round((s.admin.pct || 0) * 100);
  const conting = s.totalRiesgos.cot;
  const costo = s.costoProd.cot;
  const comis = (s.comisiones || []).reduce((a, c) => a + (c.cot || 0), 0);
  const gan = valor - costo - comis;   // V8.4.2: ganancia final = valor − costo − comisiones (consistente con lo mostrado)
  const pct = valor > 0 ? (gan / valor * 100) : null;
  const cls = gan >= 0 ? 'pos' : 'neg';
  return `
    <div class="cot-margin-row"><span class="lbl">Subtotal de producción</span><span class="val">${window.fmtMoney(subtotal)}</span></div>
    <div class="cot-margin-row" style="opacity:.8;font-size:12px;"><span class="lbl">+ Gastos administrativos (${adminPct}%)</span><span class="val">${window.fmtMoney(admin)}</span></div>
    <div class="cot-margin-row" style="opacity:.8;font-size:12px;"><span class="lbl">+ Contingencias</span><span class="val">${window.fmtMoney(conting)}</span></div>
    <div class="cot-margin-row"><span class="lbl">= Costo de producción</span><span class="val">${window.fmtMoney(costo)}</span></div>
    <div class="cot-margin-row"><span class="lbl">− Comisiones</span><span class="val">${window.fmtMoney(comis)}</span></div>
    <div class="cot-margin-row"><span class="lbl">Valor al cliente (neto)</span><span class="val">${window.fmtMoney(valor)}</span></div>
    <div class="cot-margin-row total"><span class="lbl">Ganancia</span><span class="val ${cls}">${window.fmtMoney(gan)}${pct !== null ? `<span class="cot-margin-pct ${cls}">${pct.toFixed(1)}%</span>` : ''}</span></div>`;
}

/* ─── Listas simples (Incluye / NO incluye / Fotografía / Otros) ─────── */
function cotBulletsHTML(ofId, listKey, title, arr, isNo, tip, action) {
  const tipHtml = tip ? ` <span class="tt" data-tip="${escapeHtml(tip)}">?</span>` : '';
  const actionHtml = action || '';
  return `<div class="cot-bullets">
    <div class="cot-bullets-head"><span class="lbl">${escapeHtml(title)}${tipHtml}</span>${actionHtml}</div>
    <div id="blist-${ofId}-${listKey.replace(':', '-')}">
      ${arr.map((v, idx) => cotBulletRowHTML(ofId, listKey, idx, v, isNo)).join('')}
    </div>
    <div class="row-add" style="margin-top:2px;" onclick="cotBulletAdd('${ofId}','${listKey}')">+ Agregar</div>
  </div>`;
}
function cotBulletRowHTML(ofId, listKey, idx, v, isNo) {
  return `<div class="bullet-row" ondragover="cotDragOver(event,'${ofId}','${listKey}',${idx})" ondragleave="cotDragLeave(event)" ondrop="cotDrop(event,'${ofId}','${listKey}',${idx})">
    <span class="cot-drag-handle" draggable="true" ondragstart="cotDragStart(event,'${ofId}','${listKey}',${idx})" ondragend="cotDragEnd(event)" title="Arrastrar para reordenar" style="cursor:grab;color:var(--ink-faint);user-select:none;padding:0 3px;font-size:13px;">⠿</span>
    <span class="dot ${isNo ? 'no' : ''}">${isNo ? '✕' : '•'}</span>
    <input class="cot-input" value="${escapeHtml(v || '')}" placeholder="…"
           onchange="cotBulletEdit('${ofId}','${listKey}',${idx},this.value)">
    <button class="bullet-del" title="Quitar" onclick="cotBulletDel('${ofId}','${listKey}',${idx})">×</button>
  </div>`;
}

/* ─── Videos con variables anidadas ─────────────────────────────────── */
function cotVideosHTML(ofId, videos) {
  return `<div class="cot-bullets">
    <span class="lbl">Videos</span>
    <div id="vlist-${ofId}">
      ${videos.map((v, idx) => cotVideoRowHTML(ofId, idx, v)).join('')}
    </div>
    <div class="row-add" style="margin-top:2px;" onclick="cotVideoAdd('${ofId}')">+ Agregar video</div>
  </div>`;
}
function cotVideoRowHTML(ofId, idx, v) {
  const vars = Array.isArray(v.variables) ? v.variables : [];
  return `<div class="cot-video" ondragover="cotDragOver(event,'${ofId}','ent:videos',${idx})" ondragleave="cotDragLeave(event)" ondrop="cotDrop(event,'${ofId}','ent:videos',${idx})">
    <div class="bullet-row">
      <span class="cot-drag-handle" draggable="true" ondragstart="cotDragStart(event,'${ofId}','ent:videos',${idx})" ondragend="cotDragEnd(event)" title="Arrastrar para reordenar" style="cursor:grab;color:var(--ink-faint);user-select:none;padding:0 3px;font-size:13px;">⠿</span>
      <span class="dot">▸</span>
      <input class="cot-input" value="${escapeHtml(v.nombre || '')}" placeholder="Nombre del video (ej: Spot Madre)"
             onchange="cotVideoName('${ofId}',${idx},this.value)">
      <button class="bullet-del" title="Quitar video" onclick="cotVideoDel('${ofId}',${idx})">×</button>
    </div>
    <div class="cot-vars">
      ${vars.map((vv, j) => cotVarRowHTML(ofId, idx, j, vv)).join('')}
      <div class="row-add cot-var-add" onclick="cotVarAdd('${ofId}',${idx})">+ Variable (ej: 4K, HD horizontal, HD vertical…)</div>
    </div>
  </div>`;
}
function cotVarRowHTML(ofId, vidIdx, j, val) {
  return `<div class="bullet-row cot-var-row">
    <span class="dot sub">└</span>
    <input class="cot-input" value="${escapeHtml(val || '')}" placeholder="Variable"
           onchange="cotVarEdit('${ofId}',${vidIdx},${j},this.value)">
    <button class="bullet-del" title="Quitar variable" onclick="cotVarDel('${ofId}',${vidIdx},${j})">×</button>
  </div>`;
}
function cotRerenderVideos(ofId) {
  const o = cotFindOferta(STATE.currentProject, ofId);
  if (!o) return;
  const wrap = document.getElementById('vlist-' + ofId);
  if (wrap) wrap.innerHTML = o.entregables.videos.map((v, idx) => cotVideoRowHTML(ofId, idx, v)).join('');
}
function cotVideoAdd(ofId) {
  const o = cotFindOferta(STATE.currentProject, ofId); if (!o) return;
  o.entregables.videos.push({ nombre: '', variables: [] });
  window.markDirty(); cotRerenderVideos(ofId);
}
function cotVideoDel(ofId, idx) {
  const o = cotFindOferta(STATE.currentProject, ofId); if (!o) return;
  o.entregables.videos.splice(idx, 1);
  window.markDirty(); cotRerenderVideos(ofId);
}
function cotVideoName(ofId, idx, val) {
  const o = cotFindOferta(STATE.currentProject, ofId); if (!o) return;
  if (o.entregables.videos[idx]) o.entregables.videos[idx].nombre = val;
}
function cotVarAdd(ofId, vidIdx) {
  const o = cotFindOferta(STATE.currentProject, ofId); if (!o) return;
  const v = o.entregables.videos[vidIdx]; if (!v) return;
  if (!Array.isArray(v.variables)) v.variables = [];
  v.variables.push('');
  window.markDirty(); cotRerenderVideos(ofId);
}
function cotVarEdit(ofId, vidIdx, j, val) {
  const o = cotFindOferta(STATE.currentProject, ofId); if (!o) return;
  const v = o.entregables.videos[vidIdx]; if (v && v.variables) v.variables[j] = val;
}
function cotVarDel(ofId, vidIdx, j) {
  const o = cotFindOferta(STATE.currentProject, ofId); if (!o) return;
  const v = o.entregables.videos[vidIdx]; if (!v) return;
  v.variables.splice(j, 1);
  window.markDirty(); cotRerenderVideos(ofId);
}

/* ─── Editor del presupuesto alternativo (solo ofertas no-base) ─────── */
function cotSnapEditorHTML(project, o) {
  const snap = o.presupuestoAlt;
  if (!snap) return '';
  let serv = '';
  for (const dept in snap.servicios) {
    serv += `<div class="cot-snap-section-name">Servicios — ${escapeHtml(dept)}</div>`
      + cotSnapTableHTML(o.id, 'servicios', dept, snap.servicios[dept], 'Rol')
      + `<div class="row-add" style="margin:0 0 8px;" onclick="cotSnapAdd('${o.id}','servicios','${jsq(dept)}')">+ Agregar rol a ${escapeHtml(dept)}</div>`;
  }
  return `<div class="cot-card" style="margin-top:4px;">
    <div class="cot-card-title">Presupuesto alternativo · copia del real, editable en ambos sentidos</div>
    ${serv}
    <div class="cot-snap-section-name">Gastos de producción</div>
    ${cotSnapTableHTML(o.id, 'gastos', '', snap.gastos, 'Ítem')}
    <div class="row-add" style="margin:0 0 8px;" onclick="cotSnapAdd('${o.id}','gastos','')">+ Agregar gasto</div>
    <div class="cot-snap-section-name">Técnica</div>
    ${cotSnapTableHTML(o.id, 'equipos', '', snap.equipos, 'Ítem')}
    <div class="row-add" style="margin:0 0 8px;" onclick="cotSnapAdd('${o.id}','equipos','')">+ Agregar equipo</div>
    <div class="cot-snap-section-name">Talentos</div>
    ${cotSnapTableHTML(o.id, 'talentos', '', snap.talentos, 'Rol')}
    <div class="row-add" style="margin:0 0 8px;" onclick="cotSnapAdd('${o.id}','talentos','')">+ Agregar talento</div>
  </div>`;
}

function cotSnapTableHTML(ofId, section, dept, rows, firstCol) {
  return `<table class="cot-snaptable"><thead><tr>
      <th style="width:24%;">${escapeHtml(firstCol)}</th><th style="width:16%;">DTE</th>
      <th class="num" style="width:15%;">Valor</th><th class="num" style="width:9%;">Cant.</th>
      <th style="width:16%;">Unidad</th><th class="num" style="width:14%;">Costo</th><th style="width:6%;"></th>
    </tr></thead><tbody>
      ${rows.map((r, idx) => cotSnapRowHTML(ofId, section, dept, r, idx)).join('')}
    </tbody></table>`;
}
function cotSnapRowHTML(ofId, section, dept, r, idx) {
  const isServ = section === 'servicios';
  const dq = jsq(dept || '');
  const ref = `this,'${ofId}','${section}','${dq}',${idx}`;
  const firstVal = isServ ? r.rol : r.item;
  const firstField = isServ ? 'rol' : 'item';
  const calc = calcCostoEmpresa(r.valor, r.cantidad, r.dte, section);
  const unidades = UNIDAD_OPTIONS.slice();
  if (r.unidad && unidades.indexOf(r.unidad) === -1) unidades.push(r.unidad);
  return `<tr>
    <td><input class="cot-input" value="${escapeHtml(firstVal || '')}" placeholder="${isServ ? 'Rol' : 'Ítem'}"
        onchange="cotSnapEdit(${ref},'${firstField}')"></td>
    <td><select class="cot-input" onchange="cotSnapEdit(${ref},'dte')">
        <option value="">— DTE —</option>
        ${DTE_OPTIONS.map(d => `<option value="${d.value}" ${r.dte === d.value ? 'selected' : ''}>${d.label}</option>`).join('')}
      </select></td>
    <td class="num"><input type="text" inputmode="numeric" class="cot-input num" value="${window.displayMoneyInputValue(r.valor)}" placeholder="—"
        onchange="cotSnapEdit(${ref},'valor')"></td>
    <td class="num"><input type="number" step="0.5" class="cot-input num" value="${r.cantidad ?? ''}" placeholder="0"
        onchange="cotSnapEdit(${ref},'cantidad')"></td>
    <td><select class="cot-input" onchange="cotSnapEdit(${ref},'unidad')">
        ${unidades.map(u => `<option value="${escapeHtml(u)}" ${r.unidad === u ? 'selected' : ''}>${escapeHtml(u)}</option>`).join('')}
      </select></td>
    <td class="num"><span class="cot-snapcost ${calc.error ? 'error' : ''}">${calc.error ? escapeHtml(calc.error) : window.fmtMoney(calc.value)}</span></td>
    <td><button class="bullet-del" title="Quitar" onclick="cotSnapDel('${ofId}','${section}','${dq}',${idx})">×</button></td>
  </tr>`;
}

/* ─── HANDLERS ─────────────────────────────────────────────────────── */
function cotSetMeta(k0) { if (_cotBloqueada(k0)) { try { renderCotizacion(); } catch (e) {} return; } return _cotSetMetaReal.apply(null, arguments); }
function _cotSetMetaReal(field, value) { ensureCotizacion(STATE.currentProject)[field] = value; }
function cotSetCondicion(key, value) { ensureCotizacion(STATE.currentProject).condiciones[key] = value; }
function cotSetCondicionMoney(el, key) {
  const c = ensureCotizacion(STATE.currentProject);
  c.condiciones[key] = window.parseMoneyCLP(el.value);
  el.value = window.displayMoneyInputValue(c.condiciones[key]);
}
function cotSetOfertaField(ofId, field, value) { const o = cotFindOferta(STATE.currentProject, ofId); if (o) o[field] = value; }
function cotMoneyOferta(el, ofId) {
  const o = cotFindOferta(STATE.currentProject, ofId); if (!o) return;
  o.valorCliente = window.parseMoneyCLP(el.value);
  el.value = window.displayMoneyInputValue(o.valorCliente);
  refreshCosteo(ofId);
}
function refreshCosteo(ofId) {
  const project = STATE.currentProject;
  const o = cotFindOferta(project, ofId);
  const el = document.getElementById('costeo-' + ofId);
  if (o && el) el.innerHTML = cotCosteoInnerHTML(project, o);
}
function rerenderOfertaCard(ofId) {
  const project = STATE.currentProject;
  const c = ensureCotizacion(project);
  const i = c.ofertas.findIndex(o => o.id === ofId);
  if (i < 0) return;
  const el = document.getElementById('oferta-card-' + ofId);
  if (el) el.outerHTML = cotOfertaCardHTML(project, c.ofertas[i], i);
}

function cotAddOferta() {
  const project = STATE.currentProject;
  const c = ensureCotizacion(project);
  const base = c.ofertas.find(o => o.esBase) || c.ofertas[0];
  const nAlt = c.ofertas.filter(o => !o.esBase).length + 1;
  let nueva;
  if (base) {
    // V6.4 (Nota 5): copia exacta de la oferta base; el usuario edita encima.
    nueva = JSON.parse(JSON.stringify(base));
    nueva.id = cotNewId();
    nueva.esBase = false;
    nueva.nombre = 'Opción ' + String(nAlt + 1).padStart(2, '0');
    nueva.presupuestoAlt = snapshotFromBudget(project);  // su propio presupuesto (copia del real)
  } else {
    nueva = cotNewAltOferta(project, nAlt);
  }
  c.ofertas.push(nueva);
  window.markDirty();
  renderCotizacion();
  showToast({ kind: 'success', title: 'Oferta creada', body: 'Es una copia de la oferta base (entregables, incluye, no incluye) con su propio presupuesto alternativo. Edítala libremente para esta opción.' });
}
function cotDeleteOferta(ofId) {
  const c = ensureCotizacion(STATE.currentProject);
  const o = c.ofertas.find(x => x.id === ofId);
  if (!o) return;
  if (o.esBase) {
    showToast({ kind: 'info', title: 'No se puede eliminar', body: 'La oferta base usa el Presupuesto real y siempre existe. Puedes eliminar las ofertas alternativas.' });
    return;
  }
  window.showModal({
    danger: true, title: 'Eliminar oferta',
    body: `¿Eliminar <strong>${escapeHtml(o.nombre || 'esta oferta')}</strong>? Se borra su contenido y su presupuesto alternativo. Se puede deshacer con el botón Deshacer.`,
    confirmLabel: 'Eliminar oferta', cancelLabel: 'Cancelar',
    onConfirm: () => {
      const idx = c.ofertas.findIndex(x => x.id === ofId);
      if (idx > -1) c.ofertas.splice(idx, 1);
      window.markDirty(); renderCotizacion();
    },
    onCancel: () => {}
  });
}

/* V8.4.2 · drag & drop para reordenar listas de la cotización (mismo patrón
   que el Plan de Rodaje). Reordena el array subyacente y re-renderiza. */
let COT_DRAG = null;
function cotDragStart(ev, ofId, listKey, idx) { COT_DRAG = { ofId: ofId, listKey: listKey, idx: idx }; try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(idx)); } catch (e) {} }
function cotDragEnd(ev) { COT_DRAG = null; try { document.querySelectorAll('.cot-drag-over').forEach(el => el.classList.remove('cot-drag-over')); } catch (e) {} }
function cotDragOver(ev, ofId, listKey, idx) { if (!COT_DRAG || COT_DRAG.ofId !== ofId || COT_DRAG.listKey !== listKey || COT_DRAG.idx === idx) return; ev.preventDefault(); const r = ev.currentTarget; if (r && r.classList) r.classList.add('cot-drag-over'); }
function cotDragLeave(ev) { const r = ev.currentTarget; if (r && r.classList) r.classList.remove('cot-drag-over'); }
function cotDrop(ev, ofId, listKey, idx) {
  if (!COT_DRAG || COT_DRAG.ofId !== ofId || COT_DRAG.listKey !== listKey) { COT_DRAG = null; return; }
  ev.preventDefault();
  const from = COT_DRAG.idx; COT_DRAG = null;
  const o = cotFindOferta(STATE.currentProject, ofId); if (!o) { renderCotizacion(); return; }
  const list = cotResolveList(o, listKey);
  if (!list || from < 0 || from >= list.length || from === idx) { renderCotizacion(); return; }
  const item = list.splice(from, 1)[0];
  list.splice(idx, 0, item);
  window.markDirty(); renderCotizacion();
}
function cotBulletEdit(ofId, listKey, idx, value) {
  const o = cotFindOferta(STATE.currentProject, ofId); if (!o) return;
  const list = cotResolveList(o, listKey);
  if (list && idx >= 0 && idx < list.length) list[idx] = value;
}
function cotBulletAdd(ofId, listKey) {
  const o = cotFindOferta(STATE.currentProject, ofId); if (!o) return;
  const list = cotResolveList(o, listKey); if (!list) return;
  list.push(''); window.markDirty(); cotRerenderBullets(ofId, listKey);
}
function cotRegenIncluye(ofId) {
  // V6.4 (Nota 4): refresco manual del Incluye desde el Presupuesto actual.
  // No es en vivo (no pisa ediciones sin avisar): el usuario decide cuándo traer.
  const project = STATE.currentProject;
  const o = cotFindOferta(project, ofId); if (!o) return;
  o.incluye = cotDefaultIncluye(project);
  window.markDirty();
  cotRerenderBullets(ofId, 'incluye');
  showToast({ kind: 'info', title: 'Incluye actualizado', body: o.incluye.length
    ? 'Se trajo desde el Presupuesto (ítems con cantidad ≥ 1).'
    : 'El Presupuesto no tiene ítems con cantidad ≥ 1, así que el Incluye quedó vacío.' });
}
function cotBulletDel(ofId, listKey, idx) {
  const o = cotFindOferta(STATE.currentProject, ofId); if (!o) return;
  const list = cotResolveList(o, listKey); if (!list) return;
  list.splice(idx, 1); window.markDirty(); cotRerenderBullets(ofId, listKey);
}
function cotRerenderBullets(ofId, listKey) {
  const o = cotFindOferta(STATE.currentProject, ofId); if (!o) return;
  const list = cotResolveList(o, listKey);
  const isNo = listKey === 'noIncluye';
  const wrap = document.getElementById('blist-' + ofId + '-' + listKey.replace(':', '-'));
  if (wrap) wrap.innerHTML = list.map((v, idx) => cotBulletRowHTML(ofId, listKey, idx, v, isNo)).join('');
}

function cotSnapRows(o, section, dept) {
  if (!o.presupuestoAlt) return null;
  return section === 'servicios' ? (o.presupuestoAlt.servicios[dept] || null) : (o.presupuestoAlt[section] || null);
}
function cotSnapEdit(el, ofId, section, dept, idx, field) {
  const o = cotFindOferta(STATE.currentProject, ofId); if (!o) return;
  const rows = cotSnapRows(o, section, dept);
  if (!rows || !rows[idx]) return;
  const row = rows[idx];
  if (field === 'valor') row.valor = window.parseMoneyCLP(el.value);
  else if (field === 'cantidad') row.cantidad = window.readNum(el) ?? 0;
  else if (field === 'dte') row.dte = el.value || null;
  else row[field] = el.value;
  const tr = el.closest('tr');
  const costCell = tr && tr.querySelector('.cot-snapcost');
  if (costCell) {
    const calc = calcCostoEmpresa(row.valor, row.cantidad, row.dte, section);
    costCell.textContent = calc.error ? calc.error : window.fmtMoney(calc.value);
    costCell.classList.toggle('error', !!calc.error);
  }
  refreshCosteo(ofId);
}
function cotSnapAdd(ofId, section, dept) {
  const o = cotFindOferta(STATE.currentProject, ofId); if (!o) return;
  const rows = cotSnapRows(o, section, dept); if (!rows) return;
  const isServ = section === 'servicios';
  const blank = { valor: 0, cantidad: 0, unidad: isServ ? 'Jornadas' : 'Tarifa Plana', dte: null };
  if (isServ) blank.rol = ''; else blank.item = '';
  rows.push(blank); window.markDirty(); rerenderOfertaCard(ofId);
}
function cotSnapDel(ofId, section, dept, idx) {
  const o = cotFindOferta(STATE.currentProject, ofId); if (!o) return;
  const rows = cotSnapRows(o, section, dept); if (!rows) return;
  rows.splice(idx, 1); window.markDirty(); rerenderOfertaCard(ofId);
}

/* ════════════════════════════════════════════════════════════════════
   V6.2 (Notas 5+6) · CARTA DE COTIZACIÓN — vista previa + exportación PDF
   Renderiza la estructura de Cotización a un documento A4 imprimible.
   Logo provisional (AMR) embebido hasta que llegue el Manual de Primate.
   ════════════════════════════════════════════════════════════════════ */

function cotFechaFmt(iso) {
  if (!iso) return '';
  const p = String(iso).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

function cotCartaOfertaSection(o, cond, i, total) {
  const ent = o.entregables || { videos: [], fotografia: [], otros: [] };
  const incluye = (o.incluye || []).filter(x => (x || '').trim());
  const noIncluye = (o.noIncluye || []).filter(x => (x || '').trim());
  const videos = (ent.videos || []).filter(v => (v.nombre || '').trim() || (v.variables || []).some(x => (x || '').trim()));
  const fotos = (ent.fotografia || []).filter(x => (x || '').trim());
  const otros = (ent.otros || []).filter(x => (x || '').trim());

  const packHead = total > 1 ? `
    <div class="pack-head">
      <div class="eyebrow accent">${i === 0 && o.esBase ? 'Opción base' : 'Opción ' + String(i + 1).padStart(2, '0')}</div>
      <div class="pack-name">${escapeHtml(o.nombre || '')}</div>
    </div>` : '';

  const videosHTML = videos.length ? `
    <div class="ent-group">
      <div class="ent-sub">Videos</div>
      ${videos.map(v => {
        const vars = (v.variables || []).filter(x => (x || '').trim());
        return `<div class="video">
          <div class="video-name">${escapeHtml(v.nombre || '—')}</div>
          ${vars.length ? `<div class="pills">${vars.map(x => `<span class="pill">${escapeHtml(x)}</span>`).join('')}</div>` : ''}
        </div>`;
      }).join('')}
    </div>` : '';
  const listGroup = (label, items) => items.length ? `
    <div class="ent-group">
      <div class="ent-sub">${escapeHtml(label)}</div>
      <ul class="ent-list">${items.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
    </div>` : '';

  const entregablesHTML = (videos.length || fotos.length || otros.length) ? `
    <div class="eyebrow accent">Entregables</div>
    <div class="ent-wrap">
      ${videosHTML}
      ${listGroup('Fotografía', fotos)}
      ${listGroup('Otros', otros)}
    </div>` : '';

  return `<section class="offer">
    ${packHead}
    ${entregablesHTML}
    <div class="offer-commercial">
      <div class="valor-band">
        <span class="valor-label">Valor</span>
        <span class="valor-num">${window.fmtMoney(o.valorCliente || 0)}${cond.montosMasIVA ? ' <span class="valor-iva">+ IVA</span>' : ''}</span>
      </div>
      <div class="incl-grid">
        <div>
          <div class="eyebrow accent">Incluye</div>
          ${incluye.length ? `<ul class="mark-list incl">${incluye.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<p class="muted">—</p>'}
        </div>
        <div>
          <div class="eyebrow dim">No incluye</div>
          ${noIncluye.length ? `<ul class="mark-list excl">${noIncluye.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<p class="muted">—</p>'}
        </div>
      </div>
    </div>
  </section>`;
}

function cotCartaCondiciones(cond, project) {
  const block = (title, items) => `<div class="cond-block">
    <div class="eyebrow accent">${escapeHtml(title)}</div>
    <ul class="cond-list">${items.map(x => `<li>${x}</li>`).join('')}</ul>
  </div>`;
  return `<section class="conditions">
    <div class="cond-title">Condiciones del Servicio</div>
    ${cotCondBloques(project).map(b => block(b.titulo, b.items)).join('')}
  </section>`;
}

function cotBuildCartaHTML(project, opts) {
  opts = opts || cotPrevSettings();
  const c = ensureCotizacion(project);
  const ip = project.data.infoProyecto;
  const cond = c.condiciones;
  /* V11.5.0 · la portada muestra fecha/hora de GENERACIÓN + versión del documento. */
  const _gen = new Date();
  const _hhmm = String(_gen.getHours()).padStart(2, '0') + ':' + String(_gen.getMinutes()).padStart(2, '0');
  const fecha = cotFechaFmt(_gen.toISOString().slice(0, 10)) + ' · ' + _hhmm + ' hrs · V.' + ((c.exportNum || 0) + (c.exportada ? 0 : 1));
  const rep = c.representanteCliente || ip.contactoCliente || '';
  const ofertas = c.ofertas || [];
  const desc = (c.descripcionProyecto || '').trim();
  const jornadasTxt = (c.jornadasRodaje !== undefined && String(c.jornadasRodaje).trim())
    ? (String(c.jornadasRodaje).trim() + (String(c.jornadasRodaje).trim() === '1' ? ' jornada' : ' jornadas')) : '';
  const metaRows = [
    ['Cliente', ip.cliente],
    ['Representante', rep],
    ['Dirección', ip.director],
    ['Producción Ejecutiva', ip.productorEjecutivo],
    ['Proyecto', ip.nombreProyecto || project.name],
    ['Jornadas de rodaje', jornadasTxt]
  ].filter(r => (r[1] || '').trim());
  const _der = ip.derechos || {};
  [['Derechos · tiempo', _der.tiempo], ['Derechos · plataformas', _der.plataformas], ['Derechos · territorio', _der.territorio]]
    .filter(r => (r[1] || '').trim()).forEach(r => metaRows.push(r));
  const logoData = cotPrevLogoData(opts);
  const logoH = cotPrevLogoH(opts.logoSize);

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Cotización — ${escapeHtml(ip.nombreProyecto || project.name || '')}</title>
  ${cotPrevFontLink(opts.font)}
  <style>
    ${cotPrevBaseCSS(opts)}
    .eyebrow{ font-size:9px; text-transform:uppercase; letter-spacing:.2em; color:var(--ink3); font-weight:600; margin:0 0 7px; }
    .eyebrow.accent{ color:var(--acc); }
    .eyebrow.dim{ color:var(--ink3); }
    .cover{ display:flex; justify-content:space-between; align-items:flex-start; gap:30px; }
    .cover .left{ flex:1; }
    .cover .kicker{ font-size:9px; letter-spacing:.28em; text-transform:uppercase; color:var(--ink3); margin-bottom:14px; }
    .cover h1{ font-size:44px; line-height:.97; font-weight:800; letter-spacing:.01em; margin:0; text-transform:uppercase; color:var(--ink); }
    .cover h1 .a{ color:var(--acc); display:block; }
    .org{ text-align:right; min-width:140px; }
    .org .logo{ display:block; margin-left:auto; margin-bottom:9px; object-fit:contain; }
    .org .name{ font-weight:700; font-size:12px; color:var(--ink); }
    .org .role{ font-size:10px; color:var(--ink3); }
    .org .date{ font-size:10px; color:var(--ink2); margin-top:7px; font-variant-numeric:tabular-nums; }
    .meta{ margin:24px 0 0; padding-top:16px; border-top:1px solid var(--line); display:grid; grid-template-columns:1fr 1fr; gap:10px 40px; }
    .meta .row{ display:flex; flex-direction:column; gap:2px; }
    .meta .k{ font-size:8.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink3); }
    .meta .v{ font-size:13px; color:var(--ink); font-weight:500; }
    .project-desc{ margin:24px 0 4px; }
    .project-desc p{ color:var(--ink2); font-size:11.5px; line-height:1.7; margin:0; white-space:pre-wrap; }
    .pack-head{ margin-bottom:16px; padding-bottom:11px; border-bottom:1px solid var(--line); }
    .pack-head .pack-name{ font-size:23px; font-weight:800; text-transform:uppercase; letter-spacing:.02em; color:var(--ink); }
    .ent-wrap{ margin:0 0 22px; }
    .ent-group{ margin:0 0 15px; }
    .ent-sub{ font-size:12.5px; font-weight:700; color:var(--ink); margin:0 0 7px; }
    .video{ margin:0 0 10px; padding-left:13px; border-left:2px solid var(--acc); }
    .video-name{ font-size:12px; font-weight:600; color:var(--ink); }
    .pills{ margin-top:5px; }
    .pill{ display:inline-block; border:1px solid var(--line); color:var(--ink2); font-size:9px; letter-spacing:.05em; text-transform:uppercase; padding:3px 9px; border-radius:999px; margin:0 5px 5px 0; }
    .ent-list{ list-style:none; margin:0; padding:0; }
    .ent-list li{ font-size:11.5px; color:var(--ink2); padding:2.5px 0 2.5px 15px; position:relative; }
    .ent-list li::before{ content:'—'; position:absolute; left:0; color:var(--acc); }
    .offer-commercial{ }
    .valor-band{ margin:4px 0 24px; padding:16px 20px; background:var(--band); border:1px solid var(--line); border-left:3px solid var(--acc); border-radius:9px; display:flex; align-items:baseline; gap:18px; }
    .valor-label{ font-size:10px; letter-spacing:.22em; text-transform:uppercase; color:var(--ink3); }
    .valor-num{ font-size:28px; font-weight:800; color:var(--ink); margin-left:auto; }
    .valor-iva{ font-size:13px; font-weight:600; color:var(--acc); letter-spacing:.04em; }
    .incl-grid{ display:grid; grid-template-columns:1fr 1fr; gap:40px; }
    .mark-list{ list-style:none; margin:0; padding:0; }
    .mark-list li{ font-size:11.5px; padding:3px 0 3px 19px; position:relative; }
    .mark-list.incl li{ color:var(--ink); }
    .mark-list.incl li::before{ content:'✓'; position:absolute; left:0; color:var(--acc); font-weight:700; }
    .mark-list.excl li{ color:var(--ink3); }
    .mark-list.excl li::before{ content:'✕'; position:absolute; left:0; color:var(--ink3); }
    .muted{ color:var(--ink3); font-size:11px; }
    .offer{ padding:0; }
    .cond-title{ font-size:21px; font-weight:800; text-transform:uppercase; letter-spacing:.02em; margin:0 0 20px; padding-bottom:11px; border-bottom:1px solid var(--line); color:var(--ink); }
    .cond-block{ margin:0 0 15px; }
    .cond-block .eyebrow{ margin-bottom:6px; }
    .cond-list{ list-style:none; margin:0; padding:0; }
    .cond-list li{ font-size:10.5px; color:var(--ink2); line-height:1.6; padding:2px 0 2px 14px; position:relative; }
    .cond-list li::before{ content:''; position:absolute; left:0; top:8px; width:4px; height:4px; border-radius:50%; background:var(--acc); }
  </style></head>
  <body>
    <div class="sheet">
      <div class="cover">
        <div class="left">
          <div class="kicker">${escapeHtml(window.orgNombre())}${window.orgNombre() ? ' · ' : ''}Productora Audiovisual</div>
          <h1>Cotización<span class="a">Audiovisual</span></h1>
        </div>
        <div class="org">
          ${logoData ? ('<img class="logo" style="height:' + Math.round(logoH * 1.35) + 'px;max-width:240px;width:auto;" src="' + safeUrl(logoData) + '" alt="">') : ''}
          <div class="name">${escapeHtml(window.orgNombre() || 'Productora')}</div>
          <div class="role">Productora Audiovisual</div>
          <div class="date">${escapeHtml(fecha)}</div>
        </div>
      </div>
      <div class="meta">
        ${metaRows.map(r => `<div class="row"><span class="k">${escapeHtml(r[0])}</span><span class="v">${escapeHtml(r[1])}</span></div>`).join('')}
      </div>
      ${desc ? `<div class="project-desc"><div class="eyebrow accent">Descripción del proyecto</div><p>${cotDescHtml(desc)}</p></div>` : ''}
    </div>
    ${ofertas.map((o, i) => `<div class="sheet">${cotCartaOfertaSection(o, cond, i, ofertas.length)}</div>`).join('')}
    <div class="sheet">${cotCartaCondiciones(cond, project)}
      <div class="foot">${escapeHtml(window.orgNombre())}${window.orgNombre() ? ' · ' : ''}Generado ${escapeHtml(new Date().toLocaleString('es-CL', { hour12: false }))} · Documento de cotización confidencial</div>
    </div>
  </body></html>`;
}

/* ─── Exportación PDF ───────────────────────────────────────────────── */


/* ─── V6.5 (Nota 2): export del detalle de presupuesto a CSV (abre en Excel) ──
   Sin dependencias ni backend: CSV con separador ';' (Excel es-CL) y BOM UTF-8
   para que las tildes se lean bien. Base/overall = presupuesto real (con
   nombres). Alternativa = su snapshot (sin nombres operativos). */
function cotBudgetRows(project, o) {
  const d = project.data;
  const useSnap = o && !o.esBase && o.presupuestoAlt;
  const src = useSnap ? o.presupuestoAlt : d;
  const rows = [];
  const serv = src.servicios || {};
  for (const dept in serv) {
    (serv[dept] || []).forEach(r => rows.push({
      seccion: 'Servicios', dept: dept, concepto: r.rol || '', nombre: useSnap ? '' : (r.nombre || ''),
      valor: r.valor, cantidad: r.cantidad, unidad: r.unidad || '', dte: r.dte || '', sectionKey: 'servicios'
    }));
  }
  const pushArr = (key, label) => (src[key] || []).forEach(r => rows.push({
    seccion: label, dept: '', concepto: r.item || '', nombre: useSnap ? '' : (r.nombre || ''),
    valor: r.valor, cantidad: r.cantidad, unidad: r.unidad || '', dte: r.dte || '', sectionKey: key
  }));
  pushArr('gastos', 'Gastos'); pushArr('equipos', 'Técnica'); pushArr('talentos', 'Talentos');
  return rows;
}
function _csvCell(v) {
  const s = (v === null || v === undefined) ? '' : String(v);
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 200);
}
function cotExportPresupuestoCSV(ofId) {
  const project = STATE.currentProject;
  const c = ensureCotizacion(project);
  const o = c.ofertas.find(x => x.id === ofId);
  if (!o) return;
  const all = cotBudgetRows(project, o);
  const used = all.filter(r => (r.cantidad || 0) >= 1 || (r.valor || 0) > 0);
  const data = used.length ? used : all;
  const header = ['Sección', 'Departamento', 'Rol / Ítem', 'Nombre', 'Valor unitario (CLP)', 'Cantidad', 'Unidad', 'DTE', 'Costo empresa (CLP)'];
  const lines = [header.map(_csvCell).join(';')];
  let total = 0;
  data.forEach(r => {
    const cc = calcCostoEmpresa(r.valor, r.cantidad, r.dte, r.sectionKey);
    const costo = cc.error ? cc.error : Math.round(cc.value || 0);
    if (!cc.error) total += (cc.value || 0);
    lines.push([r.seccion, r.dept, r.concepto, r.nombre,
      (r.valor != null ? r.valor : ''), (r.cantidad != null ? r.cantidad : ''),
      r.unidad, (r.dte ? (window.DTE_LABEL[r.dte] || r.dte) : ''), costo].map(_csvCell).join(';'));
  });
  lines.push(['', '', '', '', '', '', '', 'TOTAL COSTO EMPRESA', Math.round(total)].map(_csvCell).join(';'));
  const ip = project.data.infoProyecto;
  const meta = [
    'Cotización — Detalle de presupuesto',
    'Proyecto;' + _csvCell(ip.nombreProyecto || project.name || ''),
    'Cliente;' + _csvCell(ip.cliente || ''),
    'Oferta;' + _csvCell(o.nombre || ''),
    'Valor al cliente (neto, sin IVA);' + (o.valorCliente || 0),
    ''
  ].join('\n');
  const csv = '\uFEFF' + meta + '\n' + lines.join('\n');
  const safe = s => (s || '').replace(/[\\/:*?"<>|]/g, '-').trim();
  const fname = `Presupuesto - ${safe(ip.nombreProyecto || project.name)} - ${safe(o.nombre)}.csv`;
  downloadBlob(csv, fname, 'text/csv;charset=utf-8;');
  showToast({ kind: 'success', title: 'Presupuesto exportado', body: `Se descargó <strong>${escapeHtml(fname)}</strong>. Ábrelo en Excel o Google Sheets.` });
}

/* V11.5.0 · markdown-lite de la descripción: **negrita**, *cursiva*, saltos. */
function cotDescGuardarAlto(ta) {
  /* V11.5.0 · el alto que el usuario estira queda persistido (sin re-render):
     antes, cualquier click fuera devolvía el campo al tamaño default. */
  try {
    const project = STATE.currentProject; if (!project || !ta) return;
    const c = ensureCotizacion(project);
    const h = Math.round(ta.getBoundingClientRect().height);
    if (h && Math.abs((c.descAlto || 0) - h) > 4) { c.descAlto = h; window.markDirty(); }
  } catch (e) {}
}
function cotDescWrap(mark) {
  const ta = document.getElementById('cotDescTa'); if (!ta) return;
  const s = ta.selectionStart, e0 = ta.selectionEnd;
  const sel = ta.value.slice(s, e0) || 'texto';
  ta.value = ta.value.slice(0, s) + mark + sel + mark + ta.value.slice(e0);
  ta.focus(); ta.setSelectionRange(s + mark.length, s + mark.length + sel.length);
  cotSetMeta('descripcionProyecto', ta.value);
}
function cotDescHtml(t) {
  return escapeHtml(String(t || ''))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}
/* V11.5.0 · Previsualizar PDF: elegir logo (de la galería del perfil de
   empresa) y orientación antes de exportar. Las 3 plantillas y la paleta de
   colores (cuando Diseño la capture) llegan sobre este mismo motor. */
/* ════════════════════════════════════════════════════════════════════
   V11.6.0 · CONDICIONES DE SERVICIO COMO PLANTILLA EDITABLE (estilo Legal)
   La plantilla es de la PRODUCTORA (transversal, vive en el perfil de la
   organización). Formato: líneas "## Título" abren bloque; las demás líneas
   son puntos. Variables {{X}} autollenadas desde la cotización del proyecto.
   Sin plantilla guardada se usa el texto original de siempre (default). */
function cotCondTplDefault() {
  return [
    '## Condiciones de Pago',
    '{{ABONO_PCT}}% del monto total hasta {{ABONO_PLAZO}} días hábiles después de la aprobación del proyecto.',
    '{{SALDO_PCT}}% restante hasta {{SALDO_PLAZO}} días después de la entrega final satisfactoria.',
    'El incumplimiento de pagos autoriza a {{PRODUCTORA}} a suspender los trabajos y/o retener la entrega de material.',
    '{{IVA_NOTA}}',
    '## Entregas y Correcciones',
    'La primera entrega se realizará en un plazo de {{PRIMERA_ENTREGA}} días hábiles posteriores al rodaje.',
    'El cliente dispone de {{CORRECCIONES_PLAZO}} días hábiles para enviar correcciones. Pasado este plazo, el proyecto se dará por concluido.',
    'Se incluyen {{RONDAS}} rondas de corrección.',
    'Rondas adicionales: {{VALOR_RONDA_EXTRA}} CLP cada una.',
    'La música debe ser seleccionada y aprobada previo al rodaje.',
    'Cambios posteriores de música: {{VALOR_CAMBIO_MUSICA}} CLP adicionales.',
    '## Derechos de Uso y Propiedad Intelectual',
    'El proyecto final se entrega con derechos de uso limitados a las plataformas, territorios y plazos definidos en la cotización.',
    'El material crudo es propiedad exclusiva de {{PRODUCTORA}}, salvo compra expresa de derechos.',
    '{{PRODUCTORA}} podrá utilizar el material final en su portafolio y canales promocionales.',
    'Los guiones, conceptos creativos y tratamientos desarrollados son propiedad de {{PRODUCTORA}}, incluso si el proyecto no se ejecuta.',
    '## Responsabilidad y Limitaciones',
    '{{PRODUCTORA}} no se responsabiliza por condiciones climáticas adversas o fuerza mayor, negligencia o incumplimiento del cliente en entrega de insumos o aprobaciones, ni arrepentimiento del cliente respecto a guiones o lineamientos aprobados en preproducción.',
    'Cancelación antes del rodaje: {{PRODUCTORA}} retendrá lo ya pagado (mínimo el {{CANCELACION_ANTES_PCT}}%).',
    'Cancelación después del rodaje: el cliente deberá pagar el {{CANCELACION_DESPUES_PCT}}% del valor total.',
    '## Reprogramaciones',
    'Si el cliente solicita reprogramar el rodaje con menos de {{REPROGRAMACION_AVISO}} días hábiles de anticipación, se aplicará un cargo adicional del {{REPROGRAMACION_PCT}}% del valor total.',
    '## Confidencialidad',
    '{{PRODUCTORA}} no divulgará información sensible o estratégica del cliente obtenida durante la ejecución del proyecto.',
    'Esta obligación no aplica a información pública o de libre acceso.',
    '## Validez de la Cotización',
    'La presente cotización es válida por {{VALIDEZ_DIAS}} días hábiles desde su emisión.',
    'La aceptación de este presupuesto implica la aceptación plena y sin reservas de todas las condiciones aquí descritas.'
  ].join('\n');
}
function cotCondVars(project) {
  const c = ensureCotizacion(project);
  const cond = c.condiciones || {};
  const ip = project.data.infoProyecto || {};
  return {
    PRODUCTORA: window.orgNombre() || 'la Productora',
    CLIENTE: ip.cliente || '', PROYECTO: ip.nombreProyecto || project.name || '',
    ABONO_PCT: cond.abonoPct, ABONO_PLAZO: cond.abonoPlazoDiasHabiles,
    SALDO_PCT: cond.saldoPct, SALDO_PLAZO: cond.saldoPlazoDias,
    IVA_NOTA: cond.montosMasIVA ? 'Todos los montos están sujetos a IVA.' : '',
    PRIMERA_ENTREGA: cond.primeraEntregaDiasHabiles, CORRECCIONES_PLAZO: cond.correccionesPlazoDiasHabiles,
    RONDAS: cond.rondasIncluidas, VALOR_RONDA_EXTRA: window.fmtMoney(cond.valorRondaExtra), VALOR_CAMBIO_MUSICA: window.fmtMoney(cond.valorCambioMusica),
    CANCELACION_ANTES_PCT: cond.cancelacionAntesPct, CANCELACION_DESPUES_PCT: cond.cancelacionDespuesPct,
    REPROGRAMACION_AVISO: cond.reprogramacionAvisoDiasHabiles, REPROGRAMACION_PCT: cond.reprogramacionPct,
    VALIDEZ_DIAS: cond.validezDiasHabiles
  };
}
function cotCondTplActual() {
  const t = (typeof window.EMPRESA_PERFIL !== 'undefined' && window.EMPRESA_PERFIL && typeof window.EMPRESA_PERFIL.condCotTpl === 'string') ? window.EMPRESA_PERFIL.condCotTpl : '';
  return t.trim() ? t : cotCondTplDefault();
}
function cotCondBloques(project) {
  const vars = cotCondVars(project);
  const texto = cotCondTplActual().replace(/\{\{([A-Z_]+)\}\}/g, function (m, k) {
    return (vars[k] === undefined || vars[k] === null) ? m : String(vars[k]);
  });
  const bloques = [];
  let cur = null;
  texto.split('\n').forEach(function (ln) {
    const l = ln.trim();
    if (!l) return;
    if (l.startsWith('## ')) { cur = { titulo: l.slice(3).trim(), items: [] }; bloques.push(cur); return; }
    if (!cur) { cur = { titulo: 'Condiciones', items: [] }; bloques.push(cur); }
    cur.items.push(escapeHtml(l));
  });
  return bloques.filter(function (b) { return b.items.length; });
}
/* Editor con vista previa en vivo (pestaña Cotización). El primer pintado lo
   hace este vigía: cuando el panel aparece en el DOM, pinta una vez. */
setInterval(function () {
  try {
    var b = document.getElementById('cotCondPrev');
    if (b && !b._pintado && STATE.currentProject) { b._pintado = true; cotCondPreviewVivo(); }
  } catch (e) {}
}, 600);

function cotCondTplSet(v) {
  window.EMPRESA_PERFIL.condCotTpl = String(v || '');
  window.markDirty(); _dalPerfilSaveSoon();
  cotCondPreviewVivo();
}
function cotCondRestaurar() {
  window.EMPRESA_PERFIL.condCotTpl = '';
  window.markDirty(); _dalPerfilSaveSoon();
  const ta = document.getElementById('cotCondTa'); if (ta) ta.value = cotCondTplDefault();
  cotCondPreviewVivo();
  showToast({ kind: 'info', title: 'Texto original restaurado', body: 'Las condiciones vuelven al estándar de TakeOS.' });
}
function cotCondInsertarVar(v) {
  const ta = document.getElementById('cotCondTa'); if (!ta) return;
  const s = ta.selectionStart;
  ta.value = ta.value.slice(0, s) + '{{' + v + '}}' + ta.value.slice(ta.selectionEnd);
  ta.focus(); ta.setSelectionRange(s + v.length + 4, s + v.length + 4);
  cotCondTplSet(ta.value);
}
function cotCondPreviewVivo() {
  const box = document.getElementById('cotCondPrev'); if (!box) return;
  const project = STATE.currentProject; if (!project) return;
  box.innerHTML = cotCondBloques(project).map(function (b) {
    return '<div style="margin:0 0 12px;"><div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:4px;">' + escapeHtml(b.titulo) + '</div>'
      + '<ul style="margin:0;padding-left:16px;">' + b.items.map(function (i) { return '<li style="font-size:11.5px;color:var(--ink-secondary);line-height:1.55;margin:2px 0;">' + i + '</li>'; }).join('') + '</ul></div>';
  }).join('');
}
/* ════════════════════════════════════════════════════════════════════
   V11.10.0 — MOTOR DE PREVISUALIZACIÓN DE DOCUMENTOS (transversal)
   Reemplaza el previsualizador + export anteriores de la Cotización.
   Pensado como DEFAULT para todos los documentos: el motor (CotPreview) es
   document-agnostic; cada documento aporta solo su buildHTML. Geometría única
   en mm → lo que se ve en pantalla es exactamente lo que sale en el PDF.
   3 plantillas estructurales: Editorial / Carta formal / Manifiesto.
   Personalización (plantilla, color, logo, tamaño de logo, tipografía,
   orientación, formato, márgenes) persiste como default de la productora.
   Sin literales de marca: nombre por window.orgNombre(), logo por _orgLogos(),
   contacto por legalRep()/window.EMPRESA_PERFIL con fallback vacío.
   ════════════════════════════════════════════════════════════════════ */

/* ── Geometría única (mm → px y @page) ── */
const COTPREV_MM2PX = 96 / 25.4;
function cotPrevPageMm(fmt, orient) { const base = (fmt === 'carta') ? [215.9, 279.4] : [210, 297]; return orient === 'landscape' ? [base[1], base[0]] : base; }
function cotPrevPagePx(fmt, orient) { const mm = cotPrevPageMm(fmt, orient); return [Math.round(mm[0] * COTPREV_MM2PX), Math.round(mm[1] * COTPREV_MM2PX)]; }
function cotPrevLogoH(size) { return ({ s: 34, m: 52, l: 72 })[size] || 52; }

/* ── Tipografías · V11.11.0: dos del sistema + el repositorio tipográfico de
   la marca (Configuración → Diseño, window.EMPRESA_PERFIL.tipografias). Las de marca
   se cargan desde Google Fonts por nombre de familia (peso regular; la negrita
   se sintetiza). Archivos de fuente propios (p. ej. Gotham licenciada) llegan
   cuando se resuelva el almacenamiento. ── */
const COTPREV_FONTS_SISTEMA = [
  { id: 'poppins', n: 'Poppins', css: "'Poppins',-apple-system,'Segoe UI',Roboto,Arial,sans-serif", link: 'Poppins:wght@300;400;500;600;700;800' },
  { id: 'serif', n: 'Serif', css: "'Source Serif 4',Georgia,'Times New Roman',serif", link: 'Source+Serif+4:ital,wght@0,400;0,600;0,700;1,400' }
];
function _cotPrevFamiliaGF(family) { return String(family || '').trim().replace(/\s+/g, '+'); }
function cotPrevFonts() {
  let org = [];
  try {
    org = ((window.EMPRESA_PERFIL && Array.isArray(window.EMPRESA_PERFIL.tipografias)) ? window.EMPRESA_PERFIL.tipografias : [])
      .filter(t => t && String(t.family || '').trim())
      .map(t => {
        const fam = String(t.family).trim().replace(/['"<>]/g, '');
        return { id: 'org_' + (t.id || fam), n: (t.nombre || fam), css: "'" + fam + "',-apple-system,'Segoe UI',sans-serif", link: _cotPrevFamiliaGF(fam) };
      });
  } catch (e) { org = []; }
  return COTPREV_FONTS_SISTEMA.concat(org);
}
function cotPrevFont(id) { const all = cotPrevFonts(); return all.find(f => f.id === id) || all[0]; }
function cotPrevFontLink(id) {
  const f = cotPrevFont(id);
  return '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=' + f.link + '&display=swap" rel="stylesheet">';
}

const COTPREV_PLANTILLAS = [
  { id: 'editorial', n: 'Editorial', d: 'Portada de ficha + descripción; una plana por oferta con incluye/no incluye.' },
  { id: 'carta', n: 'Carta formal', d: 'Membrete y carta firmada; presupuesto desglosado por departamento.' },
  { id: 'manifiesto', n: 'Manifiesto', d: 'Portada statement con franja de color; el valor protagonista.' }
];
/* V11.11.0 · los colores de énfasis salen de la paleta de marca definida en
   Configuración → Diseño (window.EMPRESA_PERFIL.coloresMarca). Si la productora aún
   no define paleta, presets del sistema. */
function _cotPrevHexValido(h) { return /^#[0-9a-fA-F]{6}$/.test(String(h || '')); }
function cotPrevColores() {
  try {
    const m = (typeof window.EMPRESA_PERFIL !== 'undefined' && window.EMPRESA_PERFIL && Array.isArray(window.EMPRESA_PERFIL.coloresMarca))
      ? window.EMPRESA_PERFIL.coloresMarca.filter(_cotPrevHexValido) : [];
    if (m.length) return m.slice(0, 10);
  } catch (e) {}
  return ['#B03A2F', '#23231F', '#2E5B8A', '#3F7A52', '#7A4FB0', '#A6792B'];
}
function cotPrevPaletaEsMarca() {
  try { return !!(window.EMPRESA_PERFIL && Array.isArray(window.EMPRESA_PERFIL.coloresMarca) && window.EMPRESA_PERFIL.coloresMarca.filter(_cotPrevHexValido).length); } catch (e) { return false; }
}

/* ── Settings de documento por productora (personalización persistente) ── */
function cotPrevSettings() {
  let s = {};
  try { s = (typeof window.EMPRESA_PERFIL !== 'undefined' && window.EMPRESA_PERFIL && window.EMPRESA_PERFIL.cotDoc) ? window.EMPRESA_PERFIL.cotDoc : {}; } catch (e) { s = {}; }
  let pl = s.plantilla;
  if (!pl) { try { pl = window.EMPRESA_PERFIL && window.EMPRESA_PERFIL.cotPlantilla; } catch (e) {} }   // migra el viejo cotPlantilla (clasica/sobria/bloque → editorial)
  if (pl !== 'editorial' && pl !== 'carta' && pl !== 'manifiesto') pl = 'editorial';
  return {
    plantilla: pl,
    acc: s.acc || '#B03A2F',
    font: s.font || 'poppins',   // V11.11.0: ids dinámicos (sistema + marca); cotPrevFont() ya cae a Poppins si el id no existe
    formato: (s.formato === 'carta') ? 'carta' : 'a4',
    orientacion: (s.orientacion === 'landscape') ? 'landscape' : 'portrait',
    margenMm: (typeof s.margenMm === 'number' && s.margenMm >= 8 && s.margenMm <= 34) ? s.margenMm : 16,
    logoSize: (s.logoSize === 's' || s.logoSize === 'l') ? s.logoSize : 'm',
    logoId: s.logoId || ''
  };
}
function cotPrevSaveSettings(patch) {
  try {
    if (!window.EMPRESA_PERFIL.cotDoc) window.EMPRESA_PERFIL.cotDoc = {};
    Object.assign(window.EMPRESA_PERFIL.cotDoc, patch);
    window.EMPRESA_PERFIL.cotPlantilla = window.EMPRESA_PERFIL.cotDoc.plantilla;   // compat con lecturas previas
    window.markDirty(); _dalPerfilSaveSoon();
  } catch (e) {}
}

/* ── Logo seleccionado (default = principal) ── */
function cotPrevLogoData(opts) {
  try {
    const logos = _orgLogos().filter(l => l && l.dataUrl);
    if (opts && opts.logoId) { const f = logos.find(l => l.id === opts.logoId); if (f) return f.dataUrl; }
    return orgLogo();
  } catch (e) { return ''; }
}

/* ── CSS base compartido: tokens + @page + modelo de hojas (.sheet) ──
   .sheet usa min-height (no alto fijo) + overflow visible: el contenido real
   nunca se recorta; si una plana excede, crece. En impresión, cada .sheet
   parte en página nueva. La geometría sale de la misma fuente que el PDF. */
function cotPrevBaseCSS(opts) {
  const px = cotPrevPagePx(opts.formato, opts.orientacion);
  const mm = cotPrevPageMm(opts.formato, opts.orientacion);
  const mar = Math.round(opts.margenMm * COTPREV_MM2PX);
  return `
    :root{ --acc:${opts.acc}; --ink:#222221; --ink2:#555350; --ink3:#8a8780; --line:#e4e2db; --line-soft:#efede7; --band:#f7f6f2; }
    @page{ size:${mm[0]}mm ${mm[1]}mm; margin:0; }
    *{ box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    html,body{ background:transparent; }
    body{ font-family:${cotPrevFont(opts.font).css}; color:var(--ink); font-size:11px; line-height:1.55; -webkit-font-smoothing:antialiased; }
    .sheet{ width:${px[0]}px; min-height:${px[1]}px; background:#fff; margin:0 auto 22px; padding:${mar}px; position:relative; overflow:visible; box-shadow:0 3px 18px rgba(0,0,0,.28); }
    .sheet:first-child{ margin-top:0; }
    /* V11.11.0 · BUG paridad preview↔PDF: en print la hoja DEBE re-afirmar la
       altura real de página (en mm, con 1mm de margen anti-derrame). Antes era
       min-height:0 y la hoja colapsaba a la altura del contenido, rompiendo
       cualquier layout vertical (flex/centrado) en el PDF aunque en pantalla
       se viera bien. INVARIANTE para todo previsualizador futuro sobre este
       motor: nunca colapsar la altura de hoja en @media print. */
    @media print{ .sheet{ box-shadow:none; margin:0; break-before:page; width:${mm[0]}mm; min-height:${(mm[1] - 1)}mm; } .sheet:first-child{ break-before:auto; } }
    .foot{ margin-top:26px; padding-top:12px; border-top:1px solid var(--line-soft); font-size:8.5px; color:var(--ink3); letter-spacing:.03em; }
  `;
}

/* ── Servicios agrupados por departamento (base = real; alt = snapshot) ── */
function cotPrevDepartamentos(project, o) {
  const src = (o && !o.esBase && o.presupuestoAlt) ? o.presupuestoAlt : project.data;
  const serv = (src && src.servicios) ? src.servicios : {};
  const out = [];
  Object.keys(serv).forEach(dept => {
    const items = (serv[dept] || []).map(r => (r.rol || '').trim()).filter(Boolean);
    if (items.length) out.push([dept, items]);
  });
  return out;
}

/* ── Modelo normalizado del documento desde el proyecto real (Carta/Manifiesto) ── */
function cotPrevDocModel(project) {
  const c = ensureCotizacion(project);
  const ip = project.data.infoProyecto || {};
  const cond = c.condiciones || {};
  const _gen = new Date();
  const _hhmm = String(_gen.getHours()).padStart(2, '0') + ':' + String(_gen.getMinutes()).padStart(2, '0');
  const masIVA = !!cond.montosMasIVA;
  const jornadasTxt = (c.jornadasRodaje !== undefined && String(c.jornadasRodaje).trim())
    ? (String(c.jornadasRodaje).trim() + (String(c.jornadasRodaje).trim() === '1' ? ' jornada' : ' jornadas')) : '';
  const der = ip.derechos || {};
  const ofertas = (c.ofertas || []).map((o, i) => {
    const ent = o.entregables || { videos: [], fotografia: [], otros: [] };
    const videos = (ent.videos || []).filter(v => (v.nombre || '').trim() || (v.variables || []).some(x => (x || '').trim()))
      .map(v => ({ nombre: (v.nombre || '').trim() || '—', formatos: (v.variables || []).filter(x => (x || '').trim()) }));
    return {
      nombre: o.nombre || '',
      etiqueta: (i === 0 && o.esBase) ? 'Opción base' : 'Opción ' + String(i + 1).padStart(2, '0'),
      sub: (o.descripcion || '').trim(),
      valor: window.fmtMoney(o.valorCliente || 0),
      videos: videos,
      fotos: (ent.fotografia || []).filter(x => (x || '').trim()),
      otros: (ent.otros || []).filter(x => (x || '').trim()),
      incluye: (o.incluye || []).filter(x => (x || '').trim()),
      noIncluye: (o.noIncluye || []).filter(x => (x || '').trim()),
      departamentos: cotPrevDepartamentos(project, o)
    };
  });
  return {
    org: window.orgNombre(), fecha: cotFechaFmt(_gen.toISOString().slice(0, 10)) + ' · ' + _hhmm + ' hrs',
    fechaCorta: cotFechaFmt(_gen.toISOString().slice(0, 10)),
    cliente: ip.cliente || '', rep: c.representanteCliente || ip.contactoCliente || '',
    dir: ip.director || '', pe: ip.productorEjecutivo || '',
    proyecto: ip.nombreProyecto || project.name || '',
    jornadas: jornadasTxt,
    dTiempo: der.tiempo || '', dPlat: der.plataformas || '', dTerr: der.territorio || '',
    desc: (c.descripcionProyecto || '').trim(),
    ofertas: ofertas,
    condiciones: cotCondBloques(project),   // [{titulo, items:[]}] (items ya escapados)
    multi: ofertas.length > 1, masIVA: masIVA
  };
}

/* ── PLANTILLA 2 · CARTA FORMAL (membrete + carta firmada + desglose por depto) ── */
function cotTplCarta(M, opts) {
  const E = escapeHtml;
  const iva = M.masIVA ? ' + IVA' : '';
  const logo = cotPrevLogoData(opts), logoH = cotPrevLogoH(opts.logoSize);
  const lr = (typeof legalRep === 'function') ? legalRep() : {};
  const ep = (typeof window.EMPRESA_PERFIL !== 'undefined' && window.EMPRESA_PERFIL) ? window.EMPRESA_PERFIL : {};
  const contacto = [lr.domEmp, ep.web, ep.telefono, ep.email].filter(x => x && String(x).trim()).map(E).join(' · ');
  const repNom = M.rep || '';
  const saludo = repNom ? ('Estimado/a ' + E(repNom.split(' ')[0]) + ':') : 'Estimado/a:';
  const ficha = [['Cliente', M.cliente], ['Proyecto', M.proyecto], ['Dirección', M.dir], ['Jornadas', M.jornadas],
    ['Derechos', [M.dTiempo, M.dPlat, M.dTerr].filter(Boolean).join(' · ')]].filter(r => (r[1] || '').trim());
  const deptoOf = (of) => of.departamentos.length
    ? of.departamentos.map(d => `<div class="dep"><div class="dep-h">§ ${E(d[0])}</div><ul>${d[1].map(i => '<li>' + E(i) + '</li>').join('')}</ul></div>`).join('')
    : (of.incluye.length ? `<div class="dep"><div class="dep-h">§ Incluye</div><ul>${of.incluye.map(i => '<li>' + E(i) + '</li>').join('')}</ul></div>` : '');
  const entOf = (of) => {
    const items = [].concat(
      of.videos.map(v => v.nombre + (v.formatos.length ? ' — ' + v.formatos.join(' · ') : '')),
      of.fotos, of.otros
    );
    return items.length ? `<div class="dep"><div class="dep-h">§ Entregables</div><ul>${items.map(i => '<li>' + E(i) + '</li>').join('')}</ul></div>` : '';
  };

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Cotización — ${E(M.proyecto)}</title>
  ${cotPrevFontLink(opts.font)}
  <style>${cotPrevBaseCSS(opts)}
    .membrete{ display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--acc); padding-bottom:14px; margin-bottom:28px; gap:20px; }
    .membrete .addr{ font-size:8.5px; letter-spacing:.12em; color:var(--ink3); text-transform:uppercase; text-align:right; max-width:55%; }
    .fecha{ text-align:right; font-size:11.5px; color:var(--ink2); margin-bottom:24px; }
    .dest{ font-size:12.5px; line-height:1.55; margin-bottom:22px; }
    .dest b{ font-weight:700; }
    .saludo,.cuerpo{ font-size:12.5px; line-height:1.8; margin-bottom:15px; }
    .ficha{ margin:20px 0; border-left:3px solid var(--acc); padding-left:16px; }
    .ficha div{ font-size:12.5px; line-height:2; }
    .ficha b{ display:inline-block; width:120px; font-size:9.5px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink3); }
    .valorbox{ margin:24px 0; font-size:14px; }
    .valorbox .vrow{ margin-bottom:6px; }
    .valorbox b{ font-weight:800; color:var(--acc); }
    .notas{ font-size:10.5px; color:var(--ink2); line-height:1.8; margin-top:18px; }
    .firma{ margin-top:48px; font-size:12.5px; line-height:1.5; }
    .firma .nm{ font-weight:700; }
    .firma .rl{ color:var(--ink3); font-size:11px; }
    .h2{ font-size:15px; font-weight:800; letter-spacing:.04em; margin-bottom:16px; }
    .h2 .acc{ color:var(--acc); }
    .dep{ margin-bottom:16px; }
    .dep-h{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; font-weight:700; color:var(--acc); border-bottom:1px solid var(--line); padding-bottom:5px; margin-bottom:8px; }
    .dep li{ font-size:11.5px; line-height:1.8; color:var(--ink2); margin-left:16px; }
    .nolist li{ font-size:11.5px; line-height:1.9; color:var(--ink2); margin-left:16px; }
    .condmini .dep-h{ color:var(--ink); }
    .condmini p,.condmini li{ font-size:10.5px; line-height:1.7; color:var(--ink2); margin-bottom:6px; }
    .condmini ul{ margin:0 0 8px 16px; }
  </style></head>
  <body>
    <div class="sheet">
      <div class="membrete">${logo ? '<img src="' + safeUrl(logo) + '" style="height:' + Math.round(logoH * 1.1) + 'px;max-width:240px;object-fit:contain;" alt="">' : '<div style="font-weight:800;font-size:18px;">' + E(M.org || 'Productora') + '</div>'}${contacto ? '<div class="addr">' + contacto + '</div>' : ''}</div>
      <div class="fecha">${M.org ? E(M.org) + ' · ' : ''}${E(M.fechaCorta)}</div>
      <div class="dest">${repNom ? '<b>' + E(repNom) + '</b><br>' : ''}${E(M.cliente)}<br>Presente</div>
      <div class="saludo">${saludo}</div>
      <div class="cuerpo">Junto con saludar, adjunto presupuesto por la realización y producción audiovisual del proyecto que se detalla a continuación.</div>
      ${ficha.length ? `<div class="ficha">${ficha.map(r => `<div><b>${E(r[0])}</b> ${E(r[1])}</div>`).join('')}</div>` : ''}
      <div class="valorbox">${M.ofertas.map(of => `<div class="vrow">${E(of.etiqueta)}${of.sub ? ' — ' + E(of.sub) : ''} &nbsp; <b>${E(of.valor)}${iva}</b></div>`).join('')}</div>
      <div class="notas">* En caso de suspensión o cancelación del proyecto, se cobrará lo producido hasta la fecha.<br>* Presupuesto válido por 5 días hábiles.${M.masIVA ? '<br>* Los valores no incluyen IVA.' : ''}</div>
      ${M.pe ? `<div class="firma"><div class="nm">${E(M.pe)}</div><div class="rl">Producción Ejecutiva${M.org ? ' · ' + E(M.org) : ''}</div></div>` : ''}
      <div class="foot">${M.org ? E(M.org) + ' · ' : ''}${E(M.proyecto)} · Cotización confidencial</div>
    </div>
    ${M.ofertas.map(of => `<div class="sheet">
      <div class="h2">${E(of.etiqueta)}${of.sub ? ' — ' + E(of.sub.toUpperCase()) : ''} <span class="acc">· ${E(of.valor)}${iva}</span></div>
      ${deptoOf(of)}
      ${entOf(of)}
      ${of.noIncluye.length ? `<div class="dep"><div class="dep-h">§ No incluye</div><ul class="nolist">${of.noIncluye.map(x => '<li>' + E(x) + '</li>').join('')}</ul></div>` : ''}
    </div>`).join('')}
    <div class="sheet">
      <div class="h2">CONDICIONES DEL SERVICIO</div>
      <div class="condmini">${M.condiciones.map(b => `<div class="dep-h" style="margin-top:14px;">${E(b.titulo)}</div><ul>${b.items.map(i => '<li>' + i + '</li>').join('')}</ul>`).join('')}</div>
      <div class="foot">${M.org ? E(M.org) + ' · ' : ''}${E(M.proyecto)} · Cotización confidencial</div>
    </div>
  </body></html>`;
}

/* ── PLANTILLA 3 · MANIFIESTO (portada statement, valor protagonista, bloques) ── */
function cotTplManifiesto(M, opts) {
  const E = escapeHtml;
  const iva = M.masIVA ? ' <span style="font-size:14px;font-weight:600;color:#888;">+ IVA</span>' : '';
  const logo = cotPrevLogoData(opts), logoH = cotPrevLogoH(opts.logoSize);
  const mar = Math.round(opts.margenMm * COTPREV_MM2PX);
  const tags = [['Derechos · tiempo', M.dTiempo], ['Plataformas', M.dPlat], ['Territorio', M.dTerr]].filter(t => (t[1] || '').trim());
  const incluyeOf = (of) => of.departamentos.length
    ? of.departamentos.map(d => `<div class="depm"><div class="colh acc">§ ${E(d[0])}</div>${d[1].map(i => '<div class="li">' + E(i) + '</div>').join('')}</div>`).join('')
    : of.incluye.map(i => '<div class="li">✓ ' + E(i) + '</div>').join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Cotización — ${E(M.proyecto)}</title>
  ${cotPrevFontLink(opts.font)}
  <style>${cotPrevBaseCSS(opts)}
    .sheet.cover{ display:flex; flex-direction:column; }
    .brand{ display:flex; align-items:center; gap:12px; font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:var(--ink3); }
    .mid{ flex:1; display:flex; flex-direction:column; justify-content:center; }
    .banda{ background:var(--acc); color:#fff; margin-left:-${mar}px; margin-right:-${mar}px; padding:46px ${mar}px; }
    .banda .proj{ font-size:12px; letter-spacing:.28em; text-transform:uppercase; font-weight:700; margin-bottom:14px; opacity:.92; }
    .banda h1{ font-size:50px; font-weight:800; line-height:1.04; letter-spacing:-.5px; }
    .banda .cliente{ font-size:14px; margin-top:16px; opacity:.94; }
    .pie{ font-size:10px; letter-spacing:.22em; text-transform:uppercase; color:var(--ink3); text-align:right; }
    .blk{ margin-bottom:22px; }
    .blk-h{ font-size:22px; font-weight:800; letter-spacing:-.3px; margin-bottom:10px; }
    .blk-h span{ color:var(--acc); }
    .bigp{ font-size:12.5px; line-height:1.85; color:var(--ink2); }
    .gridtags{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:14px; }
    .gt{ background:#f4f4ee; border-radius:9px; padding:12px; }
    .gt .l{ font-size:8.5px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink3); }
    .gt .v{ font-size:13px; font-weight:700; margin-top:3px; }
    .valorpag{ display:flex; justify-content:space-between; align-items:flex-end; border-top:2px solid var(--acc); padding-top:16px; margin-bottom:24px; gap:18px; }
    .valorpag .lbl{ font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:var(--ink3); }
    .valorpag .v{ font-size:30px; font-weight:800; color:var(--acc); white-space:nowrap; }
    .twocol{ display:grid; grid-template-columns:1.4fr 1fr; gap:26px; }
    .colh{ font-size:11px; letter-spacing:.16em; text-transform:uppercase; font-weight:800; margin-bottom:8px; }
    .colh.acc{ color:var(--acc); }
    .colh.no{ color:var(--ink3); }
    .depm{ margin-bottom:11px; }
    .li{ font-size:11px; line-height:1.7; color:var(--ink2); }
    .entbig{ margin-bottom:13px; border-left:4px solid var(--acc); padding:3px 0 3px 14px; }
    .entbig .n{ font-size:13.5px; font-weight:700; color:var(--ink); }
    .entbig .f{ font-size:10.5px; color:var(--ink3); margin-top:2px; }
    .condrow{ margin-bottom:11px; }
    .condrow .t{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; font-weight:800; color:var(--acc); }
    .condrow li{ font-size:10.5px; line-height:1.7; color:var(--ink2); margin-left:16px; }
  </style></head>
  <body>
    <div class="sheet cover">
      <div class="brand">${logo ? '<img src="' + safeUrl(logo) + '" style="height:' + Math.round(logoH * 0.9) + 'px;max-width:160px;object-fit:contain;" alt="">' : ''}<span>${E(M.org || 'Productora')}</span></div>
      <div class="mid"><div class="banda">
        <div class="proj">Cotización audiovisual · ${E(M.fechaCorta)}</div>
        <h1>${E((M.proyecto || 'Proyecto').toUpperCase())}</h1>
        <div class="cliente">${M.cliente ? 'Para ' + E(M.cliente) : ''}${M.dir ? ' · Dirección: ' + E(M.dir) : ''}</div>
      </div></div>
      <div class="pie">${E(M.org || '')}${M.org ? ' · ' : ''}Productora Audiovisual</div>
    </div>
    ${(M.desc || tags.length) ? `<div class="sheet">
      <div class="blk"><div class="blk-h">El proyecto<span>.</span></div>${M.desc ? '<p class="bigp">' + cotDescHtml(M.desc) + '</p>' : ''}
      ${tags.length ? `<div class="gridtags">${tags.map(t => `<div class="gt"><div class="l">${E(t[0])}</div><div class="v">${E(t[1])}</div></div>`).join('')}</div>` : ''}</div>
    </div>` : ''}
    ${M.ofertas.map(of => `<div class="sheet">
      <div class="valorpag"><span class="lbl">${E(of.etiqueta)}${of.sub ? ' · ' + E(of.sub) : ''}</span><span class="v">${E(of.valor)}${iva}</span></div>
      <div class="blk"><div class="twocol">
        <div><div class="blk-h">Qué incluye<span>.</span></div>${incluyeOf(of)}</div>
        <div><div class="blk-h">No incluye<span>.</span></div>${of.noIncluye.length ? of.noIncluye.map(x => '<div class="li">✕ ' + E(x) + '</div>').join('') : '<div class="li" style="color:#aaa;">—</div>'}</div>
      </div></div>
      ${(of.videos.length || of.fotos.length || of.otros.length) ? `<div class="blk"><div class="blk-h">Entregables<span>.</span></div>
        ${of.videos.map(v => `<div class="entbig"><div class="n">${E(v.nombre)}</div>${v.formatos.length ? '<div class="f">' + E(v.formatos.join(' · ')) + '</div>' : ''}</div>`).join('')}
        ${of.fotos.map(x => `<div class="entbig"><div class="n">${E(x)}</div></div>`).join('')}
        ${of.otros.map(x => `<div class="entbig"><div class="n">${E(x)}</div></div>`).join('')}</div>` : ''}
    </div>`).join('')}
    <div class="sheet">
      <div class="blk-h" style="margin-bottom:18px;">Condiciones del servicio<span>.</span></div>
      ${M.condiciones.map(b => `<div class="condrow"><div class="t">${E(b.titulo)}</div><ul>${b.items.map(i => '<li>' + i + '</li>').join('')}</ul></div>`).join('')}
      <div class="foot">${M.org ? E(M.org) + ' · ' : ''}${E(M.proyecto)} · Documento confidencial</div>
    </div>
  </body></html>`;
}

/* ── Dispatcher: cada documento aporta su buildHTML; el motor es agnóstico ── */
function cotDocBuildHTML(project, opts) {
  if (opts.plantilla === 'carta') return cotTplCarta(cotPrevDocModel(project), opts);
  if (opts.plantilla === 'manifiesto') return cotTplManifiesto(cotPrevDocModel(project), opts);
  return cotBuildCartaHTML(project, opts);   // editorial (render real, parametrizado)
}

/* ════ MOTOR DE PREVISUALIZACIÓN (document-agnostic, trasplantable) ════
   Encuadra un HTML sin cortarlo: transform:scale() + wrapper redimensionado al
   tamaño escalado. Pinch-zoom de trackpad (wheel+ctrlKey y gestos de Safari) sin
   frenar el scroll nativo. Misma geometría que el PDF → fidelidad 1:1. */
let _cotPrevOpts = null;
const CotPreview = {
  canvas: null, wrap: null, frame: null, pageW: 794, pageH: 1123, contentH: 1123, mode: 'page', zoom: 100, scale: 1, _bindInner: null, _onResize: null,
  init(canvas, wrap, frame) {
    this.canvas = canvas; this.wrap = wrap; this.frame = frame; this.mode = 'page'; this.zoom = 100;
    const self = this;
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this._onResize = function () { self.fit(); };
    window.addEventListener('resize', this._onResize);
    this.frame.addEventListener('load', function () { self._afterLoad(); });
    const onWheel = function (e, inner) {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); const d = Math.max(-30, Math.min(30, e.deltaY)); self.setZoom(Math.round(self.zoom * Math.exp(-d * 0.006))); return; }
      if (inner) { self.canvas.scrollBy({ left: e.deltaX, top: e.deltaY, behavior: 'instant' }); }
    };
    this.canvas.addEventListener('wheel', function (e) { onWheel(e, false); }, { passive: false });
    this._bindInner = function () { try { self.frame.contentDocument.addEventListener('wheel', function (e) { onWheel(e, true); }, { passive: false }); } catch (e) {} };
    let gz = 100;
    this.canvas.addEventListener('gesturestart', function (e) { e.preventDefault(); gz = self.zoom; });
    this.canvas.addEventListener('gesturechange', function (e) { e.preventDefault(); self.setZoom(Math.round(gz * e.scale)); });
  },
  load(html, pageW, pageH) { this.pageW = pageW; this.pageH = pageH; this.contentH = pageH; this.frame.srcdoc = html; },
  _afterLoad() {
    try { this.contentH = Math.max(this.frame.contentDocument.body.scrollHeight, this.pageH); } catch (e) { this.contentH = this.pageH; }
    this.frame.style.width = this.pageW + 'px'; this.frame.style.height = this.contentH + 'px';
    if (this._bindInner) this._bindInner();
    this.fit();
  },
  setMode(m) { this.mode = m; this.fit(); this._syncUI(); },
  setZoom(z) { this.mode = 'manual'; this.zoom = Math.max(25, Math.min(300, z)); this.fit(); this._syncUI(); },
  fit() {
    if (!this.canvas || !this.frame) return;
    const pad = 48; const cw = this.canvas.clientWidth - pad, ch = this.canvas.clientHeight - pad; let s;
    if (this.mode === 'page') s = Math.min(cw / this.pageW, ch / this.pageH);
    else if (this.mode === 'width') s = cw / this.pageW;
    else s = this.zoom / 100;
    s = Math.max(0.1, s); this.scale = s;
    this.frame.style.transform = 'scale(' + s + ')';
    this.wrap.style.width = (this.pageW * s) + 'px';
    this.wrap.style.height = (this.contentH * s) + 'px';
    if (this.mode !== 'manual') this.zoom = Math.round(s * 100);
    const zl = document.getElementById('cotPrevZoom'); if (zl) zl.textContent = Math.round(s * 100) + '%';
  },
  _syncUI() {
    const p = document.getElementById('cotPrevFitPage'), w = document.getElementById('cotPrevFitWidth');
    if (p) p.classList.toggle('on', this.mode === 'page'); if (w) w.classList.toggle('on', this.mode === 'width');
  }
};

/* ── Panel de controles (transversal). Cada control actualiza _cotPrevOpts,
   persiste como default de la productora y reconstruye el documento. ── */
function _cotPrevOptBtn(label, onclick, on) {
  return `<button onclick="${onclick}" style="flex:1;min-width:0;background:${on ? 'var(--accent,#B03A2F)' : 'var(--bg-surface-soft,#262624)'};border:1px solid ${on ? 'var(--accent,#B03A2F)' : 'var(--rule,#34342f)'};border-radius:7px;padding:7px 6px;color:${on ? '#fff' : 'var(--ink-secondary,#d3d6cb)'};font-size:11.5px;font-weight:${on ? '600' : '500'};cursor:pointer;text-align:center;">${label}</button>`;
}
function cotPrevPanelHTML() {
  const o = _cotPrevOpts || cotPrevSettings();
  const E = escapeHtml;
  const grp = (title, inner, hint) => `<div style="padding:14px 16px;border-bottom:1px solid var(--rule,#34342f);"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-faint,#71736a);font-weight:700;margin:0 0 10px;">${title}</div>${inner}${hint ? '<div style="font-size:10.5px;color:var(--ink-faint,#71736a);margin-top:8px;line-height:1.4;">' + hint + '</div>' : ''}</div>`;

  const pl = COTPREV_PLANTILLAS.map(t => {
    const on = o.plantilla === t.id;
    return `<button onclick="cotPrevSetOpt('plantilla','${t.id}')" style="display:block;width:100%;text-align:left;margin-bottom:7px;background:${on ? 'var(--bg-elevated,#2e2e2b)' : 'var(--bg-surface-soft,#262624)'};border:1px solid ${on ? 'var(--accent,#B03A2F)' : 'var(--rule,#34342f)'};border-radius:8px;padding:9px 11px;color:var(--ink,#FDFEED);cursor:pointer;"><div style="font-size:12.5px;font-weight:600;">${t.n}</div><div style="font-size:10px;color:var(--ink-muted,#a0a399);line-height:1.35;margin-top:2px;">${t.d}</div></button>`;
  }).join('');

  const fo = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;">${cotPrevFonts().map(f => _cotPrevOptBtn(escapeHtml(f.n), "cotPrevSetOpt('font','" + f.id + "')", o.font === f.id)).join('')}</div>`;

  const colorSw = cotPrevColores().map(hex => {
    const on = (o.acc || '').toLowerCase() === hex.toLowerCase();
    return `<button onclick="cotPrevSetOpt('acc','${hex}')" title="${hex}" style="width:30px;height:30px;border-radius:8px;background:${hex};border:2px solid ${on ? 'var(--ink,#fff)' : 'transparent'};box-shadow:${on ? '0 0 0 2px var(--bg-surface,#222),0 0 0 4px var(--ink,#fff)' : 'none'};cursor:pointer;"></button>`;
  }).join('');
  const colorCtl = `<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;">${colorSw}<label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--ink-muted,#a0a399);cursor:pointer;">Otro <input type="color" value="${o.acc || '#B03A2F'}" oninput="cotPrevSetOptLive('acc',this.value)" style="width:28px;height:28px;border:none;background:none;padding:0;cursor:pointer;"></label></div>`;

  let logos = [];
  try { logos = (typeof _orgLogos === 'function') ? _orgLogos().filter(l => l && l.dataUrl) : []; } catch (e) { logos = []; }
  const logoCtl = logos.length
    ? logos.map(l => { const on = o.logoId ? (o.logoId === l.id) : !!l.principal; return `<label style="display:flex;align-items:center;gap:7px;border:1px solid ${on ? 'var(--accent,#B03A2F)' : 'var(--rule,#34342f)'};border-radius:8px;padding:5px 8px;cursor:pointer;margin-bottom:6px;background:var(--bg-surface-soft,#262624);"><input type="radio" name="cotPrevLogo" ${on ? 'checked' : ''} onchange="cotPrevSetOpt('logoId','${l.id}')"><img src="${safeUrl(l.dataUrl)}" style="height:22px;max-width:64px;object-fit:contain;"><span style="font-size:11px;color:var(--ink-secondary,#d3d6cb);">${E(l.nombre || 'Logo')}</span></label>`; }).join('')
    : '<div style="font-size:10.5px;color:var(--ink-faint,#71736a);line-height:1.4;">Carga el logo de la productora en Configuración → Diseño para que aparezca en los documentos.</div>';

  const logoSz = `<div style="display:flex;gap:7px;">${[['s', 'Pequeño'], ['m', 'Mediano'], ['l', 'Grande']].map(z => _cotPrevOptBtn(z[1], "cotPrevSetOpt('logoSize','" + z[0] + "')", o.logoSize === z[0])).join('')}</div>`;
  const orient = `<div style="display:flex;gap:7px;">${[['portrait', 'Vertical'], ['landscape', 'Horizontal']].map(x => _cotPrevOptBtn(x[1], "cotPrevSetOpt('orientacion','" + x[0] + "')", o.orientacion === x[0])).join('')}</div>`;
  const formato = `<div style="display:flex;gap:7px;">${[['carta', 'Carta'], ['a4', 'A4']].map(x => _cotPrevOptBtn(x[1], "cotPrevSetOpt('formato','" + x[0] + "')", o.formato === x[0])).join('')}</div>`;
  const marg = `<div style="display:flex;align-items:center;gap:10px;"><input type="range" min="8" max="34" value="${o.margenMm}" oninput="cotPrevSetOptLive('margenMm',+this.value);document.getElementById('cotPrevMargLbl').textContent=this.value+' mm';" style="flex:1;accent-color:var(--accent,#B03A2F);"><span id="cotPrevMargLbl" style="font-size:11.5px;color:var(--ink-secondary,#d3d6cb);min-width:44px;text-align:right;">${o.margenMm} mm</span></div>`;

  return grp('Plantilla', pl)
    + grp('Tipografía', fo, cotPrevFonts().length > COTPREV_FONTS_SISTEMA.length ? 'Poppins y Serif son del sistema; el resto es el repositorio de tu marca (Configuración → Diseño).' : 'Poppins y Serif son del sistema. Agrega las tipografías de tu marca en Configuración → Diseño.')
    + grp('Color de énfasis', colorCtl, cotPrevPaletaEsMarca() ? 'Paleta de la marca, definida en Configuración → Diseño.' : 'Aún no hay paleta de marca: defínela en Configuración → Diseño. Mientras tanto, presets del sistema.')
    + grp('Logo', logoCtl)
    + grp('Tamaño del logo', logoSz)
    + grp('Orientación', orient)
    + grp('Formato', formato)
    + grp('Márgenes', marg, 'Cambia el margen real del documento (afecta el PDF) y reflujan los contenidos.');
}
function cotPrevRenderPanel() { const p = document.getElementById('cotPrevPanel'); if (p) p.innerHTML = cotPrevPanelHTML(); }
function cotPrevBuildAndLoad() {
  const project = STATE.currentProject; if (!project || !_cotPrevOpts) return;
  const px = cotPrevPagePx(_cotPrevOpts.formato, _cotPrevOpts.orientacion);
  CotPreview.load(cotDocBuildHTML(project, _cotPrevOpts), px[0], px[1]);
  const lbl = document.getElementById('cotPrevPageLbl');
  if (lbl) lbl.textContent = (_cotPrevOpts.formato === 'carta' ? 'Carta' : 'A4') + ' · ' + (_cotPrevOpts.orientacion === 'portrait' ? 'vertical' : 'horizontal');
}
function cotPrevSetOpt(k, v) {
  if (!_cotPrevOpts) return;
  _cotPrevOpts[k] = v; const p = {}; p[k] = v; cotPrevSaveSettings(p);
  cotPrevRenderPanel(); cotPrevBuildAndLoad();
}
function cotPrevSetOptLive(k, v) {
  if (!_cotPrevOpts) return;
  _cotPrevOpts[k] = v; const p = {}; p[k] = v; cotPrevSaveSettings(p);
  cotPrevBuildAndLoad();
}

/* ── Abrir el previsualizador (estilo "Imprimir") ── */
function cotPreviewPDF() {
  const project = STATE.currentProject; if (!project) return;
  _cotPrevOpts = cotPrevSettings();
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal" onclick="event.stopPropagation()" style="max-width:1120px;width:96vw;padding:0;overflow:hidden;">
    <div class="modal-header" style="padding:13px 18px;"><div class="modal-title">Previsualizar y exportar · Cotización</div></div>
    <div style="display:flex;min-height:60vh;max-height:74vh;">
      <div style="flex:1;display:flex;flex-direction:column;min-width:0;background:#2a2a27;">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--bg-surface,#222);border-bottom:1px solid var(--rule,#34342f);flex-wrap:wrap;">
          <button class="btn btn-sm" onclick="CotPreview.setZoom(CotPreview.zoom-10)" title="Alejar">−</button>
          <span id="cotPrevZoom" style="font-size:12px;color:var(--ink-secondary,#d3d6cb);min-width:44px;text-align:center;font-variant-numeric:tabular-nums;">100%</span>
          <button class="btn btn-sm" onclick="CotPreview.setZoom(CotPreview.zoom+10)" title="Acercar">+</button>
          <span style="width:1px;height:18px;background:var(--rule,#34342f);margin:0 3px;"></span>
          <button class="btn btn-sm" id="cotPrevFitPage" onclick="CotPreview.setMode('page')">Ajustar</button>
          <button class="btn btn-sm" id="cotPrevFitWidth" onclick="CotPreview.setMode('width')">Ancho</button>
          <span id="cotPrevPageLbl" style="font-size:11px;color:var(--ink-faint,#71736a);margin-left:6px;"></span>
          <span style="font-size:10.5px;color:var(--ink-faint,#71736a);margin-left:auto;">Pellizca el trackpad o Ctrl/⌘ + rueda para zoom</span>
        </div>
        <div id="cotPrevCanvas" style="flex:1;overflow:auto;background:#2a2a27;padding:24px;">
          <div id="cotPrevWrap" style="margin:0 auto;position:relative;"><iframe id="cotPrevFrame" title="preview" style="position:absolute;top:0;left:0;border:0;transform-origin:top left;background:transparent;"></iframe></div>
        </div>
      </div>
      <div id="cotPrevPanel" style="width:266px;flex-shrink:0;border-left:1px solid var(--rule,#34342f);overflow-y:auto;background:var(--bg-surface,#222);">${cotPrevPanelHTML()}</div>
    </div>
    <div class="modal-footer" style="padding:12px 18px;justify-content:flex-end;gap:8px;flex-wrap:wrap;"><button class="btn" onclick="window.closeModal()">Cerrar</button><button class="btn btn-primary" onclick="cotPreviewGenerar()">Exportar PDF</button></div>
  </div></div>`;
  CotPreview.init(document.getElementById('cotPrevCanvas'), document.getElementById('cotPrevWrap'), document.getElementById('cotPrevFrame'));
  cotPrevBuildAndLoad();
  CotPreview.setMode('page');
}

/* ── Exportar PDF: mismo HTML del preview vía printViaIframe (geometría 1:1).
   Mantiene el bloqueo de versión exportada. ── */
function cotPreviewGenerar() {
  const project = STATE.currentProject; if (!project || !_cotPrevOpts) return;
  const ip = project.data.infoProyecto;
  const c = ensureCotizacion(project);
  const html = cotDocBuildHTML(project, _cotPrevOpts);
  if (!c.exportada) { c.exportNum = (c.exportNum || 0) + 1; c.exportada = true; window.markDirty(); }
  const vTxt = 'V.' + (c.exportNum || 1);
  const fname = `Cotización - ${ip.nombreProyecto || project.name || 'Proyecto'}${ip.cliente ? ' - ' + ip.cliente : ''} - ${vTxt}`;
  window.closeModal();
  printViaIframe(html, fname);
  showToast({ kind: 'success', title: 'Carta lista para PDF (' + vTxt + ')', body: 'Se abrió el diálogo de impresión. Elige <strong>“Guardar como PDF”</strong>. Esta versión queda bloqueada: cualquier edición pedirá confirmación.' });
}

/* Guard de versión exportada: avisa y ofrece nueva versión o edición consciente. */
function _cotBloqueada(k) {
  if (k === 'descAlto') return false;
  const project = STATE.currentProject; if (!project) return false;
  const c = ensureCotizacion(project);
  if (!c.exportada) return false;
  document.getElementById('modalRoot').innerHTML = '<div class="modal-backdrop"><div class="modal" onclick="event.stopPropagation()" style="max-width:480px;">'
    + '<div class="modal-header"><div class="modal-title">Esta versión ya se exportó</div></div>'
    + '<div class="modal-body"><p style="margin:0;font-size:13px;color:var(--ink-secondary);line-height:1.6;">La <strong>V.' + (c.exportNum || 1) + '</strong> de esta cotización ya fue exportada. Solo deberías modificar una versión ya exportada si no llegó a cliente.</p></div>'
    + '<div class="modal-footer" style="flex-wrap:wrap;gap:8px;justify-content:flex-end;">'
    + '<button class="btn" onclick="window.closeModal()">Cancelar</button>'
    + '<button class="btn btn-secondary" onclick="cotDesbloquearMisma()">Quiero modificar esta versión de todas formas</button>'
    + '<button class="btn btn-primary" onclick="cotNuevaVersion()">Crear nueva versión</button>'
    + '</div></div></div>';
  return true;
}
function cotNuevaVersion() {
  const c = ensureCotizacion(STATE.currentProject);
  c.exportada = false;   // el próximo export incrementa a V.(n+1)
  window.markDirty(); window.closeModal();
  showToast({ kind: 'success', title: 'Versión nueva abierta', body: 'Estás editando la V.' + ((c.exportNum || 0) + 1) + '. Se fija al exportarla.' });
}
function cotDesbloquearMisma() {
  const c = ensureCotizacion(STATE.currentProject);
  c.exportada = false; c.exportNum = Math.max(0, (c.exportNum || 1) - 1);   // re-exportar mantiene el número
  window.markDirty(); window.closeModal();
  showToast({ kind: 'warning', title: 'Editando una versión ya exportada', body: 'Sigues en la V.' + ((c.exportNum || 0) + 1) + '. El PDF anterior con ese número queda obsoleto.' });
}

// ── D: renderUnidadCellSelect + renderUnidadCellInput (dispersos, 16963-16989)
function renderUnidadCellSelect(sectionKey, dept, idx, currentUnidad) {
  const deptStr = dept ? `'${escapeHtml(dept)}'` : 'null';
  return `
    <select class="cell-select"
            onchange="onUnidadSelectChange(this, '${sectionKey}', ${deptStr}, ${idx})">
      ${UNIDAD_OPTIONS.map(u =>
        `<option value="${u}" ${currentUnidad === u ? 'selected' : ''}>${u}</option>`
      ).join('')}
      <option value="__custom__">Otra…</option>
    </select>
  `;
}

function renderUnidadCellInput(sectionKey, dept, idx, currentUnidad) {
  const deptStr = dept ? `'${escapeHtml(dept)}'` : 'null';
  return `
    <div style="display: flex; gap: 2px; align-items: center;">
      <input class="cell-input" type="text"
             value="${escapeHtml(currentUnidad)}"
             placeholder="Unidad personalizada…"
             style="font-size: 12px;"
             oninput="onUnidadInputChange(this, '${sectionKey}', ${deptStr}, ${idx})">
      <button class="unidad-reset" title="Volver a presets"
              onclick="onUnidadReset(this, '${sectionKey}', ${deptStr}, ${idx})">↺</button>
    </div>
  `;
}

function onUnidadSelectChange(selectEl, sectionKey, dept, idx) {
  const project = STATE.currentProject;
  const item = sectionKey === 'servicios'
    ? project.data.servicios[dept][idx]
    : project.data[sectionKey][idx];
  _markRowDirty(item);
  if (selectEl.value === '__custom__') {
    item.unidad = '';
    const td = selectEl.closest('td');
    td.innerHTML = renderUnidadCellInput(sectionKey, dept, idx, '');
    const input = td.querySelector('input');
    if (input) { input.focus(); input.select(); }
  } else {
    item.unidad = selectEl.value;
  }
}
function onUnidadInputChange(inputEl, sectionKey, dept, idx) {
  const project = STATE.currentProject;
  const item = sectionKey === 'servicios'
    ? project.data.servicios[dept][idx]
    : project.data[sectionKey][idx];
  item.unidad = inputEl.value;
  _markRowDirty(item);
}
function onUnidadReset(btnEl, sectionKey, dept, idx) {
  const project = STATE.currentProject;
  const item = sectionKey === 'servicios'
    ? project.data.servicios[dept][idx]
    : project.data[sectionKey][idx];
  item.unidad = 'Tarifa Plana';
  _markRowDirty(item); window.markDirty();
  const td = btnEl.closest('td');
  td.innerHTML = renderUnidadCellSelect(sectionKey, dept, idx, 'Tarifa Plana');
}

// ── E: _budgetFindRow (disperso, línea 19359)
function _budgetFindRow(project, clientUuid) {
  const d = (project && project.data) || {}; let found = null;
  function scan(arr) { (arr || []).forEach(function (r) { if (r && r.clientUuid === clientUuid) found = r; }); }
  for (const dep in (d.servicios || {})) scan(d.servicios[dep]);
  scan(d.gastos); scan(d.equipos); scan(d.talentos);
  return found;
}

// ── F: goCotizadoTotal (disperso, línea 22501)
function goCotizadoTotal(project) { try { const f = calcSummaryFin(project); return (f && f.subtotal) ? f.subtotal.cot : 0; } catch (e) { return 0; } }



// ── Puentes a window (para que el classic script y los onclick inline sigan funcionando) ──
// Constantes de módulo
window._BUDGET_COL_CFG             = _BUDGET_COL_CFG;
window.BUDGET_MENU_W               = BUDGET_MENU_W;
window.COTPREV_MM2PX               = COTPREV_MM2PX;
// Helpers compartidos
window.cotizadoLocked              = cotizadoLocked;
window.getBDPresupuesto            = getBDPresupuesto;
window.isEmptyTemplateRow          = isEmptyTemplateRow;
window.purgeEmptyRows              = purgeEmptyRows;
window._clientUuid                 = _clientUuid;
window._budgetQueueDeletes         = _budgetQueueDeletes;
window.renderUnidadCell            = renderUnidadCell;
window.renderUnidadCellSelect      = renderUnidadCellSelect;
window.renderUnidadCellInput       = renderUnidadCellInput;
// Presupuesto — render
window.renderPresupuesto           = renderPresupuesto;
window.renderPresupuestoHistorico  = renderPresupuestoHistorico;
window.renderSummaryFin            = renderSummaryFin;
window.renderServiciosBody         = renderServiciosBody;
window.renderSimpleSection         = renderSimpleSection;
window.renderRoleTable             = renderRoleTable;
window.renderRoleRow               = renderRoleRow;
window.renderHeadcountPanel        = renderHeadcountPanel;
// Presupuesto — cálculo
window.calcSummaryFin              = calcSummaryFin;   // kanban.js lo usa
window.recalcAlerts                = recalcAlerts;
window.recalcAllDeptSummaries      = recalcAllDeptSummaries;  // llamado desde fuera del bloque (~línea 16009)
window.recalcKPIs                  = recalcKPIs;
window.recalcSubdeptTotals         = recalcSubdeptTotals;
window.recalcDeptSummary           = recalcDeptSummary;
// Presupuesto — acciones
window.toggleBudgetCotizado        = toggleBudgetCotizado;
window.toggleBudgetServiciosBreakdown = toggleBudgetServiciosBreakdown;
window.snapshotFullBudget          = snapshotFullBudget;
window.presupCotVersionBarHTML     = presupCotVersionBarHTML;
window.presupSetCotVersion         = presupSetCotVersion;
window.exportPresupuestoExcel      = exportPresupuestoExcel;
window.debeExportarseFilaPresupuesto = debeExportarseFilaPresupuesto;
window.budgetSortBy                = budgetSortBy;
window.budgetSortClear             = budgetSortClear;
window.budgetColResizeDown         = budgetColResizeDown;
window.budgetColResizeReset        = budgetColResizeReset;
window._budgetFindRow              = _budgetFindRow;
window.openVisualizacionPanel      = openVisualizacionPanel;
// Presupuesto — filas y departamentos
window.addRow                      = addRow;
window.deleteRow                   = deleteRow;
window.updateRowField              = updateRowField;
window.afterRowChange              = afterRowChange;
window.afterRowConfirmToggle       = afterRowConfirmToggle;
window.openRowNote                 = openRowNote;
window.saveRowNote                 = saveRowNote;
window.addServiceDept              = addServiceDept;
window.renameServiceDept           = renameServiceDept;
window.deleteServiceDept           = deleteServiceDept;
window.moveServiceDept             = moveServiceDept;
window.vizRenameInput              = vizRenameInput;
window.rowHandleDown               = rowHandleDown;
window.rowDragStart                = rowDragStart;
window.rowDragOver                 = rowDragOver;
window.rowDrop                     = rowDrop;
window.rowDragEnd                  = rowDragEnd;
window.isCollapsed                 = isCollapsed;
window.toggleDept                  = toggleDept;
// Presupuesto — finanzas/comisiones/riesgos
window.updateFinanzasField         = updateFinanzasField;
window.updateComisionMode          = updateComisionMode;
window.updateComisionValue         = updateComisionValue;
window.updateComisionLabel         = updateComisionLabel;
window.addComision                 = addComision;
window.deleteComision              = deleteComision;
window.updateRiesgoLabel           = updateRiesgoLabel;
window.updateRiesgoMode            = updateRiesgoMode;
window.updateRiesgoValue           = updateRiesgoValue;
window.addRiesgo                   = addRiesgo;
window.deleteRiesgo                = deleteRiesgo;
window.addExtraIngreso             = addExtraIngreso;
window.updateExtraIngresoLabel     = updateExtraIngresoLabel;
window.updateExtraIngresoMonto     = updateExtraIngresoMonto;
window.deleteExtraIngreso          = deleteExtraIngreso;
window.updateAsistentes            = updateAsistentes;
window.headcountPanelHTML          = headcountPanelHTML;
window.calcHeadcount               = calcHeadcount;
window.rowCountsAsPerson           = rowCountsAsPerson;
// Presupuesto — unidad
window.onUnidadSelectChange        = onUnidadSelectChange;
window.onUnidadInputChange         = onUnidadInputChange;
window.onUnidadReset               = onUnidadReset;
window.goCotizadoTotal             = goCotizadoTotal;
// Cotización — render y CRUD
window.renderCotizacion            = renderCotizacion;
window.ensureCotizaciones          = ensureCotizaciones;
window.ensureCotizacion            = ensureCotizacion;
window.cotUltimaNum                = cotUltimaNum;
window.cotCrearVersion             = cotCrearVersion;
window.cotSetActiveVersion         = cotSetActiveVersion;
window.cotNuevaVersion             = cotNuevaVersion;
window.cotDesbloquearMisma         = cotDesbloquearMisma;
window.cotAbrirComparador          = cotAbrirComparador;
window.cotCmpSelectOffer           = cotCmpSelectOffer;
window.cotAddOferta                = cotAddOferta;
window.cotDeleteOferta             = cotDeleteOferta;
window.cotSetMeta                  = cotSetMeta;
window.cotSetCondicion             = cotSetCondicion;
window.cotSetCondicionMoney        = cotSetCondicionMoney;
window.cotSetOfertaField           = cotSetOfertaField;
window.cotMoneyOferta              = cotMoneyOferta;
window.cotSetVersionNota           = cotSetVersionNota;
window.cotRealPresup               = cotRealPresup;
window.cotBudgetRows               = cotBudgetRows;
window.cotContarEntregables        = cotContarEntregables;
// Cotización — drag
window.cotDragStart                = cotDragStart;
window.cotDragEnd                  = cotDragEnd;
window.cotDragOver                 = cotDragOver;
window.cotDragLeave                = cotDragLeave;
window.cotDrop                     = cotDrop;
// Cotización — bullets
window.cotBulletEdit               = cotBulletEdit;
window.cotBulletAdd                = cotBulletAdd;
window.cotBulletDel                = cotBulletDel;
window.cotRegenIncluye             = cotRegenIncluye;
window.cotRerenderBullets          = cotRerenderBullets;
// Cotización — videos y variables
window.cotRerenderVideos           = cotRerenderVideos;
window.cotVideoAdd                 = cotVideoAdd;
window.cotVideoDel                 = cotVideoDel;
window.cotVideoName                = cotVideoName;
window.cotVarAdd                   = cotVarAdd;
window.cotVarEdit                  = cotVarEdit;
window.cotVarDel                   = cotVarDel;
// Cotización — snaps
window.cotSnapEdit                 = cotSnapEdit;
window.cotSnapAdd                  = cotSnapAdd;
window.cotSnapDel                  = cotSnapDel;
// Cotización — descripción
window.cotDescGuardarAlto          = cotDescGuardarAlto;
window.cotDescWrap                 = cotDescWrap;
// Cotización — condiciones
window.cotCondTplSet               = cotCondTplSet;
window.cotCondRestaurar            = cotCondRestaurar;
window.cotCondInsertarVar          = cotCondInsertarVar;
window.cotCondPreviewVivo          = cotCondPreviewVivo;
window.cotToggleCondiciones        = cotToggleCondiciones;
// Cotización — export
window.cotExportPresupuestoCSV     = cotExportPresupuestoCSV;
// Cotización — preview PDF
window.cotPreviewPDF               = cotPreviewPDF;
window.cotPreviewGenerar           = cotPreviewGenerar;
window.cotPrevSetOpt               = cotPrevSetOpt;
window.cotPrevSetOptLive           = cotPrevSetOptLive;
window.cotPrevBuildAndLoad         = cotPrevBuildAndLoad;
window.cotPrevRenderPanel          = cotPrevRenderPanel;
window.cotPrevSaveSettings         = cotPrevSaveSettings;
window.CotPreview                  = CotPreview;

// ── Bridges agregados por auditoría 2-jul (consumidos por index.html u otros módulos sin bridge) ──
window._budgetCaptureScroll = _budgetCaptureScroll;
window._budgetColGrip = _budgetColGrip;
window._budgetColTh = _budgetColTh;
window._budgetColWGet = _budgetColWGet;
window._budgetRestoreScroll = _budgetRestoreScroll;
window._cotPrevFamiliaGF = _cotPrevFamiliaGF;
window._cotPrevHexValido = _cotPrevHexValido;
window._rowNoteItem = _rowNoteItem;
window.cotPrevColores = cotPrevColores;
window.cotPrevFontLink = cotPrevFontLink;
window.cotPrevFonts = cotPrevFonts;
window.ofertaCosteo = ofertaCosteo;
