// Gastos (proyecto) + CFO (global) + Export Chipax — extraído de index.html (Etapa A4)
// src/modules/gastos.js
// Era el segundo <script id="go-cfo-script"> del monolito. goWire() se ejecuta al
// evaluar el módulo (post script clásico, pre primer render) y registra Gastos/CFO
// en window.MODULES.

/* ════════════════════════════════════════════════════════════════════
   MÓDULO GASTOS (proyecto) + MÓDULO CFO (global) + EXPORT CHIPAX  · V8.0.0
   ════════════════════════════════════════════════════════════════════
   Internaliza la función de Rinde Gastos, 100% proyecto-céntrico.
   - Espacio "Gastos del proyecto" (scope project) → renderGastos()
   - Módulo CFO (scope global, consolida todos los proyectos) → renderCFO()
   - Exportación a Chipax (.xlsx con SheetJS, ya cargado en TakeOS)

   MODELO (project.data.gastosOp):
     { cajaProd, presupuestos:[{id,nombre,linea,resp,asignado}],
       movimientos:[{id,pres,fecha,quien,registra,concepto,prov,monto,
                     medio,tipo,comp,estado,coment,fechaPago,objetivo,
                     fileName,fileUrl,datosPago}],
       lineasExtra:[String] }

   REGLA MADRE: el gasto solo escribe el "Real" (rollup). El Cotizado se
   LEE del Presupuesto vía calcSummaryFin(project).subtotal.cot — jamás se
   escribe desde aquí. La reflexión profunda del Real dentro de cada
   departamento del Presupuesto queda diferida (spec §5/§11 #4).
   ════════════════════════════════════════════════════════════════════ */

/* Mapa categoría/línea → cuenta Chipax. Editable; se persiste en
   EMPRESA_PERFIL.chipaxCuentas (que ya forma parte del save). */
let CHIPAX_CUENTA = {
  'Dirección': 'Gastos de Producción',
  'Producción': 'Gastos de Producción',
  'Arte': 'Gastos de Producción',
  'Locaciones': 'Gastos de Producción',
  'Talento': 'Gastos de Producción',
  'Caja de Producción': 'Gastos de Producción',
  'Cámara': 'Arriendo de Equipos',
  'Iluminación': 'Arriendo de Equipos',
  'Transporte': 'Combustible',
  'Catering': 'Catering (No Servicio de Catering)',
  'Postproducción': 'Servicios Para Proyecto',
  'Otros': 'Otros Costos Operacionales'
};
const CHIPAX_TIPODOC = {
  'Factura': 'Invoice', 'Factura exenta': 'Invoice',
  'Boleta': 'Boleta', 'Honorario': 'Boleta', 'Boleta de honorarios': 'Boleta',
  'Otro': 'Recibo'
};
const GO_LINEAS_BASE = ['Dirección', 'Producción', 'Arte', 'Cámara', 'Iluminación', 'Locaciones', 'Talento', 'Transporte', 'Catering', 'Postproducción', 'Caja de Producción', 'Otros'];
const GO_MEDIOS = ['Tarjeta empresa (débito)', 'Tarjeta empresa (crédito)', 'Transferencia cuenta empresa', 'Caja de producción', 'Reembolso a colaborador', 'Otro'];
const GO_TIPOS = ['Factura', 'Factura Exenta', 'Boleta', 'Invoice', 'Otro'];   // Pasada 4 (#6) · tipos de documento del gasto
const GO_ESTADOS = { pendiente: 'Pendiente', por_revisar: 'Por revisar', validado: 'Validado', en_observacion: 'En observación' };

const GO_STATE = { cfoTab: 'validacion' };
let GO_DRAFT = {};
let GO_EDIT_ID = null;   // V11.x · id del gasto en edición (null = se está creando uno nuevo)
let GO_SEQ = 0;
function goNewId(prefix) { GO_SEQ++; return prefix + Date.now().toString(36) + GO_SEQ.toString(36); }

/* ---------- datos / helpers ---------- */
function goData(project) {
  if (!project) return { cajaProd: 0, presupuestos: [], movimientos: [], lineasExtra: [] };
  if (!project.data.gastosOp || typeof project.data.gastosOp !== 'object') {
    project.data.gastosOp = { cajaProd: 0, presupuestos: [], movimientos: [], lineasExtra: [] };
  }
  const d = project.data.gastosOp;
  if (!Array.isArray(d.presupuestos)) d.presupuestos = [];
  if (!Array.isArray(d.movimientos)) d.movimientos = [];
  if (!Array.isArray(d.lineasExtra)) d.lineasExtra = [];
  if (typeof d.cajaProd !== 'number') d.cajaProd = 0;
  if (typeof d.cajaDevuelto !== 'number') d.cajaDevuelto = 0;   // Pasada 4 · devoluciones de caja (no persiste aún; ver handoff BD)
  if (!Array.isArray(d.cajaMovs)) d.cajaMovs = [];              // Pasada 4 · libreta de ingresos/devoluciones de caja (en memoria; persiste con el handoff BD)
  return d;
}
function goLineas(project) {
  const d = goData(project);
  return GO_LINEAS_BASE.concat(d.lineasExtra.filter(l => GO_LINEAS_BASE.indexOf(l) < 0));
}
function goPresById(project, id) { return goData(project).presupuestos.find(p => p.id === id) || null; }
function goPresList(project) { return goData(project).presupuestos; }
function goMovs(project) { return goData(project).movimientos; }
function goGastado(project, presId) { return goMovs(project).filter(m => m.pres === presId).reduce((s, m) => s + (m.monto || 0), 0); }
function goLineaOf(project, m) { const e = goPresById(project, m.pres); return e ? e.linea : 'Otros'; }
function goCuentaChipax(linea) { return CHIPAX_CUENTA[linea] || 'Otros Costos Operacionales'; }
function goTipoChipax(tipo) { return CHIPAX_TIPODOC[tipo] || 'Recibo'; }
function goRealTotal(project) { return goMovs(project).reduce((s, m) => s + (m.monto || 0), 0); }
/* goCotizadoTotal → movido a src/modules/presupuesto-cotizacion.js (Etapa 2) */
function goCajaGastado(project) { return goMovs(project).filter(m => m.medio === 'Caja de producción').reduce((s, m) => s + (m.monto || 0), 0); }
function goNeedsAction(m) { return m.estado === 'por_revisar' || m.estado === 'en_observacion'; }
function goReembPend(project) { return goMovs(project).filter(m => m.medio === 'Reembolso a colaborador' && !m.fechaPago); }
function goProjName(project) { return (project.data.infoProyecto && project.data.infoProyecto.nombreProyecto) || project.name || '(sin nombre)'; }
function goProjCliente(project) { return (project.data.infoProyecto && project.data.infoProyecto.cliente) || project.client || ''; }
/* Nomenclatura oficial para Chipax: "{{PROYECTO}} de {{CLIENTE}}" */
function goLineaNegocio(project) { const n = goProjName(project), c = goProjCliente(project); return c ? (n + ' de ' + c) : n; }
function goToday() { return new Date().toISOString().slice(0, 10); }

/* lista de contactos para comboboxes (BD + los ya usados en este proyecto) */
function goContactos(project) {
  const set = {};
  try { Object.keys(BD_PERSONAS || {}).forEach(n => { if (n) set[n] = 1; }); } catch (e) {}
  if (project) {
    goPresList(project).forEach(p => { if (p.resp) set[p.resp] = 1; });
    goMovs(project).forEach(m => { if (m.quien && m.quien !== '—') set[m.quien] = 1; if (m.registra) set[m.registra] = 1; });
  }
  return Object.keys(set).sort((a, b) => a.localeCompare(b, 'es'));
}

/* contraseña del jefe de producción = RUT (de la BD) sin puntos ni DV */
function goJefeProd(project) {
  const ip = project.data.infoProyecto || {};
  const nom = ip.jefeProduccion || '';
  let rut = '';
  try { const p = (typeof BD_PERSONAS !== 'undefined' && nom) ? BD_PERSONAS[nom] : null; if (p && p.rut) rut = p.rut; } catch (e) {}
  const limpio = String(rut).replace(/\./g, '').replace(/\s/g, '');
  const pass = limpio.split('-')[0];
  return { nombre: nom, rut: rut, pass: pass };
}

/* ---------- modal propio (usa #modalRoot + closeModal de TakeOS) ---------- */
function goModal(html) { document.getElementById('modalRoot').innerHTML = '<div class="go-modal" onclick="if(event.target===this)closeModal()">' + html + '</div>'; }

/* ════════════════════════════════════════════════════════════════════
   ESPACIO: GASTOS DEL PROYECTO
   ════════════════════════════════════════════════════════════════════ */
let GO_REG_FILTER = '';   // Pasada 4 · filtro del buscador del Registro de gastos (persiste entre re-renders)
let GO_REG_SORT = null;   // Pasada 4 (#4) · orden del registro por 'fecha'/'monto' (asc/desc); null = orden natural
function renderGastos() {
  const project = STATE.currentProject;
  const cont = document.getElementById('moduleContent');
  if (!cont) return;
  if (!project) { cont.innerHTML = '<div class="go-empty">Abre un proyecto para registrar sus gastos.</div>'; return; }

  const _bScroll = (typeof _budgetCaptureScroll === 'function') ? _budgetCaptureScroll() : null;

  const d = goData(project);
  const envs = goPresList(project);
  const gs = goMovs(project);
  const cajaUsed = goCajaGastado(project);
  const cajaEntregado = d.cajaProd || 0;
  const cajaDev = d.cajaDevuelto || 0;
  const cajaSaldo = cajaEntregado - cajaUsed - cajaDev;
  const realTot = goRealTotal(project);                 // gastado real (todos los movimientos)
  const gastosPresup = goGastosCotizadoTotal(project);  // total PRESUPUESTADO de la sección Gastos

  const presStrip = envs.map(e => {
    const gastado = goGastado(project, e.id);
    const rest = (e.asignado || 0) - gastado;
    const pct = e.asignado ? gastado / e.asignado * 100 : (gastado > 0 ? 101 : 0);
    const cls = pct > 100 ? 'over' : (pct >= 85 ? 'mid' : '');
    return `<div class="go-pcard">
      <div class="go-pl">→ ${escapeHtml(e.linea)}</div>
      <div class="go-pn">${escapeHtml(e.nombre)}</div>
      <div class="go-pr">resp · ${escapeHtml(e.resp || '—')}</div>
      <div class="go-pq ${rest < 0 ? 'neg' : ''}">${fmtMoney(rest)}</div>
      <div class="go-pr">disponible de ${fmtMoney(e.asignado || 0)}</div>
      <div class="go-pbar"><div class="go-fill ${cls}" style="width:${Math.min(100, pct)}%"></div></div>
      <div class="go-presp">gastado <b>${fmtMoney(gastado)}</b></div>
    </div>`;
  }).join('');

  // Pasada 4 · encabezados redimensionables (reusa la maquinaria del Presupuesto:
  // la tabla lleva la clase budget-table + data-bsec-table='gastosReg').
  const GR_COLIDS = ['gr_fecha', 'gr_concepto', 'gr_quien', 'gr_medio', 'gr_monto', 'gr_doc', 'gr_comp', 'gr_estado', 'gr_acc'];
  let grW = 0; GR_COLIDS.forEach(id => { grW += _budgetColWGet('gastosReg', id); });
  const grHead = [
    goRegTh('gr_fecha', 'Fecha', 'fecha'),
    goRegTh('gr_concepto', 'Concepto'),
    goRegTh('gr_quien', 'Quién gastó'),
    goRegTh('gr_medio', 'Medio de pago'),
    goRegTh('gr_monto', 'Monto', 'monto', 'go-num'),
    goRegTh('gr_doc', 'Doc'),
    goRegTh('gr_comp', 'Comp.'),
    goRegTh('gr_estado', 'Estado'),
    goRegTh('gr_acc', 'Acciones')
  ].join('');

  cont.innerHTML = `
  <div class="go-wrap">
    <div class="go-note">Bitácora operativa de gastos por proyecto (reemplaza a Rinde Gastos). El <b>Cotizado</b> se lee del Presupuesto y no se toca desde aquí (<i>regla madre</i>); los gastos solo suben el <b>Real</b>.</div>

    <div class="go-card">
      <div class="go-card-h"><h3>Presupuestos <span class="go-faint">· asignaciones (sobres) creadas para este proyecto</span></h3>
        <button class="btn btn-secondary btn-sm" onclick="goOpenPresup()">+ Crear presupuesto</button></div>
      <div class="go-card-b">
        <div class="go-strip">
          ${presStrip}
          <div class="go-pcard add" onclick="goOpenPresup()"><div style="font-size:24px;">+</div>Crear<br>presupuesto</div>
        </div>
      </div>
    </div>

    <div class="go-row">
      <div class="go-card go-grow">
        <div class="go-card-h"><h3>Registro de gastos <span class="go-faint">· ${gs.length} gastos</span></h3>
          <div class="go-actions">
            <input class="go-inp" id="goRegSearch" placeholder="Buscar: concepto, monto, quién, medio…" value="${escapeHtml(GO_REG_FILTER)}" oninput="goRegFilter(this.value)" style="max-width:230px;">
            ${_usaChipax() ? `<button class="btn btn-secondary btn-sm" onclick="goOpenExport('${project.id}')">⬇ Exportar a Chipax</button>` : ''}
            <button class="btn btn-secondary btn-sm" onclick="goOpenQuick()">⚡ Captura rápida</button>
            <button class="btn btn-primary btn-sm" onclick="goOpenGasto()">+ Agregar gasto</button>
          </div></div>
        <div class="go-card-b go-tablewrap" data-budget-scroll="gastosReg">
          <table class="go-tbl budget-table" data-bsec-table="gastosReg" style="width:${grW}px;">
            <thead><tr>${grHead}</tr></thead>
            <tbody id="goRegTbody">${goRegRows(project)}</tbody>
          </table>
        </div>
      </div>

      <div class="go-side">
        <div class="go-card">
          <div class="go-card-h"><h3 class="go-sm">Caja de producción</h3><button class="go-mini" onclick="goCajaHistorial()" title="Ver el registro de ingresos y egresos de la caja chica.">Historial</button></div>
          <div class="go-card-b">
            <div class="go-kpi-l">Saldo a devolver</div>
            <div class="go-kpi-v ${cajaSaldo < 0 ? 'acc' : ''}">${fmtMoney(cajaSaldo)}</div>
            <div class="go-kpi-s">Entregado ${fmtMoney(cajaEntregado)} · gastado ${fmtMoney(cajaUsed)}${cajaDev ? ' · devuelto ' + fmtMoney(cajaDev) : ''}</div>
            <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
              <button class="btn btn-secondary btn-sm" onclick="goCajaIngreso()" title="Registrar dinero entregado a la caja chica de producción (sube lo entregado).">+ Registrar ingreso</button>
              <button class="btn btn-secondary btn-sm" onclick="goCajaDevolucion()" title="Registrar dinero que producción devuelve (baja el saldo a devolver).">↩ Registrar devolución</button>
            </div>
          </div>
        </div>
        <div class="go-card">
          <div class="go-card-h"><h3 class="go-sm">Gastos del proyecto</h3></div>
          <div class="go-card-b">
            <div class="go-kpi-l">Gastado (real)</div>
            <div class="go-kpi-v">${fmtMoney(realTot)}</div>
            <div class="go-kpi-s">Presupuestado (Gastos) ${fmtMoney(gastosPresup)}${gastosPresup ? ' · ' + (realTot <= gastosPresup ? '<span class="go-ok">dentro</span>' : '<span class="go-bad">se pasó ' + fmtMoney(realTot - gastosPresup) + '</span>') : ''}</div>
            <div class="go-kpi-note">Compara lo gastado contra el total presupuestado de la sección <b>Gastos</b> del Presupuesto (no el total del proyecto).</div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  if (_bScroll && typeof _budgetRestoreScroll === 'function') _budgetRestoreScroll(_bScroll);
}
/* Pasada 4 · total PRESUPUESTADO (costo empresa cotizado) de la sección Gastos. */
function goGastosCotizadoTotal(project) {
  const gastos = (project && project.data && Array.isArray(project.data.gastos)) ? project.data.gastos : [];
  let total = 0;
  gastos.forEach(r => { const c = calcCostoEmpresa(r.valor, r.cantidad, r.dte, 'gastos'); total += c.value || 0; });
  return Math.round(total);
}
/* Pasada 4 · buscador: re-pinta SOLO el cuerpo de la tabla (mantiene foco del
   buscador y el scroll horizontal, que viven fuera del <tbody>). */
function goRegFilter(v) {
  GO_REG_FILTER = v || '';
  const tb = document.getElementById('goRegTbody');
  if (tb && STATE.currentProject) tb.innerHTML = goRegRows(STATE.currentProject);
}
/* Pasada 4 (#4) · ordenar el registro por fecha o monto (asc/desc), igual que en
   Presupuesto. Re-pinta solo el cuerpo (mantiene el encabezado y el scroll). */
function goRegSortBy(key) {
  if (!GO_REG_SORT || GO_REG_SORT.col !== key) GO_REG_SORT = { col: key, dir: 'desc' };
  else GO_REG_SORT = { col: key, dir: GO_REG_SORT.dir === 'desc' ? 'asc' : 'desc' };
  if (STATE.currentProject) renderGastos();   // re-render: el encabezado refleja la flecha ▲/▼ y el cuerpo se reordena
}
/* Encabezado redimensionable del registro; con sortKey además es ordenable. */
function goRegTh(colId, label, sortKey, cls) {
  const w = _budgetColWGet('gastosReg', colId);
  let ind = '', onclick = '', sortCls = '';
  if (sortKey) {
    const on = GO_REG_SORT && GO_REG_SORT.col === sortKey;
    ind = on ? '<span class="sort-ind on">' + (GO_REG_SORT.dir === 'asc' ? '▲' : '▼') + '</span>' : '<span class="sort-ind"></span>';
    onclick = ' onclick="goRegSortBy(\'' + sortKey + '\')"';
    sortCls = ' sortable';
  }
  return '<th class="bcol-resizable' + sortCls + (cls ? ' ' + cls : '') + '" data-bsec="gastosReg" data-bcol="' + colId + '" style="width:' + w + 'px;"' + onclick + '>' + escapeHtml(label) + ind + _budgetColGrip('gastosReg', colId) + '</th>';
}
/* Pasada 4 · filas del registro AGRUPADAS por presupuesto (caja) y filtradas por
   el buscador. Cada grupo es un presupuesto; al final, "Sin presupuesto". */
function goRegRows(project) {
  const COLS = 9;
  const gs = goMovs(project);
  const envs = goPresList(project);
  if (!gs.length) return `<tr><td colspan="${COLS}" class="go-faint" style="padding:18px;">Aún no hay gastos. Agrega el primero con “+ Agregar gasto”.</td></tr>`;
  const q = _normLinea(GO_REG_FILTER);
  const match = (x) => {
    if (!q) return true;
    const hay = [x.concepto, x.prov, x.quien, x.registra, x.medio, x.tipo, x.coment, String(x.monto || ''), (GO_ESTADOS[x.estado] || x.estado || '')].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  };
  const visibles = gs.filter(match);
  if (!visibles.length) return `<tr><td colspan="${COLS}" class="go-faint" style="padding:18px;">Ningún gasto coincide con “${escapeHtml(GO_REG_FILTER)}”.</td></tr>`;
  const grupos = [];
  envs.forEach(e => { const arr = visibles.filter(x => x.pres === e.id); if (arr.length) grupos.push({ env: e, arr: arr }); });
  const sinPres = visibles.filter(x => !goPresById(project, x.pres));
  if (sinPres.length) grupos.push({ env: null, arr: sinPres });
  if (GO_REG_SORT) {
    const dir = GO_REG_SORT.dir === 'asc' ? 1 : -1;
    const cmp = GO_REG_SORT.col === 'monto'
      ? (a, b) => ((a.monto || 0) - (b.monto || 0)) * dir
      : (a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) * dir;
    grupos.forEach(g => g.arr.sort(cmp));
  }
  let html = '';
  grupos.forEach(g => {
    const e = g.env;
    const tot = g.arr.reduce((s, m) => s + (m.monto || 0), 0);
    const titulo = e
      ? `${escapeHtml(e.nombre)} <span class="go-faint" style="font-weight:400;text-transform:none;letter-spacing:0;">· línea ${escapeHtml(e.linea)} · ${g.arr.length} gasto${g.arr.length === 1 ? '' : 's'}</span>`
      : `<span class="go-faint" style="text-transform:none;letter-spacing:0;">Sin presupuesto asignado · ${g.arr.length}</span>`;
    html += `<tr class="go-grp"><td colspan="${COLS}" style="background:var(--bg-surface-soft);font-weight:700;font-size:11.5px;padding:8px;border-bottom:1px solid var(--rule);white-space:normal;">📁 ${titulo}<span style="float:right;color:var(--ink-secondary);">${fmtMoney(tot)}</span></td></tr>`;
    g.arr.forEach(x => { html += goRegFilaHTML(project, x); });
  });
  return html;
}
function goRegFilaHTML(project, x) {
  const comp = goCompCell(x, 'goVerComprobante', '—');
  const est = x.estado === 'pendiente'
    ? `<span class="go-est pendiente" title="el productor sabe que falta info">Pendiente</span> <button class="go-mini" onclick="goMarcarListo('${x.id}')">marcar listo</button>`
    : (x.estado === 'por_revisar'
      ? `<span class="go-est por_revisar">${GO_ESTADOS.por_revisar}</span> <button class="go-mini" onclick="goRevertirPendiente('${x.id}')">revertir a pendiente</button>`
      : `<span class="go-est ${x.estado}">${GO_ESTADOS[x.estado] || escapeHtml(x.estado)}</span>`);
  return `<tr>
    <td class="go-sub">${escapeHtml((x.fecha || '').slice(5))}</td>
    <td>${escapeHtml(x.concepto)}<div class="go-sub">${escapeHtml(x.prov)}</div>${goComentCell(project, x)}</td>
    <td>${escapeHtml(x.quien)}</td>
    <td class="go-sub">${escapeHtml(x.medio || '')}</td>
    <td class="go-num">${fmtMoney(x.monto)}</td>
    <td class="go-sub">${escapeHtml(x.tipo)}</td>
    <td>${comp}</td>
    <td>${est}</td>
    <td>${(x.estado === 'en_observacion' || goHiloDe(project, x.id).length) ? `<button class="go-mini" onclick="goResponderHilo('${x.id}')">💬 responder</button> ` : ''}<button class="go-mini" onclick="goOpenGasto('${x.id}')">editar</button></td></tr>`;
}
/* ── Pasada 4 · Caja de producción: ingreso / devolución ──────────────────────
   "Registrar ingreso" sube lo ENTREGADO (d.cajaProd) y "Registrar devolución"
   baja el saldo a devolver (d.cajaDevuelto). Ambos, más la libreta d.cajaMovs,
   PERSISTEN vía guardar_operaciones_4b (columnas caja_devuelto / caja_movimientos,
   PR8 · migración 20260628120000). Antes la devolución vivía solo en memoria. */
function goCajaIngreso() {
  if (!STATE.currentProject) return;
  goModal(`<div class="go-mc narrow"><div class="go-mh"><h3>Registrar ingreso a Caja de producción</h3><button class="go-x" onclick="closeModal()">×</button></div>
    <div class="go-mb">
      <div class="go-help" style="margin-bottom:10px;line-height:1.55;">Dinero <b>entregado</b> a la caja chica con la que opera producción. Aumenta lo entregado y, por lo tanto, el saldo a devolver.</div>
      <div class="go-frow">
        <div class="go-field half"><label>Monto (CLP)</label><input class="go-inp" id="ci_monto" placeholder="0" inputmode="numeric"></div>
        <div class="go-field half"><label>Fecha de ingreso</label><input class="go-inp" type="date" id="ci_fecha" value="${goToday()}"></div>
      </div>
      <div class="go-field"><label>Nota (opcional)</label><input class="go-inp" id="ci_nota" placeholder="ej. adelanto al productor"></div>
    </div>
    <div class="go-mf"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="goCajaIngresoSave()">Registrar ingreso</button></div></div>`);
}
function goCajaIngresoSave() {
  const project = STATE.currentProject; const d = goData(project);
  const monto = parseInt(((document.getElementById('ci_monto') || {}).value || '0').replace(/\D/g, '')) || 0;
  if (monto <= 0) { showToast({ kind: 'warning', title: 'Monto inválido', body: 'Ingresa un monto mayor a 0.' }); return; }
  const fecha = ((document.getElementById('ci_fecha') || {}).value) || goToday();
  const nota = ((document.getElementById('ci_nota') || {}).value || '').trim();
  d.cajaProd = (d.cajaProd || 0) + monto;
  if (!Array.isArray(d.cajaMovs)) d.cajaMovs = [];
  d.cajaMovs.push({ id: goNewId('c'), tipo: 'ingreso', monto: monto, fecha: fecha, nota: nota });
  markDirty(); closeModal(); renderGastos();
  showToast({ kind: 'success', title: 'Ingreso registrado', body: 'Se sumaron ' + fmtMoney(monto) + ' (' + fecha + ') a lo entregado a la caja.' });
}
function goCajaDevolucion() {
  if (!STATE.currentProject) return;
  goModal(`<div class="go-mc narrow"><div class="go-mh"><h3>Registrar devolución de Caja de producción</h3><button class="go-x" onclick="closeModal()">×</button></div>
    <div class="go-mb">
      <div class="go-help" style="margin-bottom:10px;line-height:1.55;">Efectivo que producción <b>devuelve</b> de la caja chica. Baja el saldo a devolver. <i>Nota: la devolución aún no persiste al recargar; eso se cierra con la parte de base de datos del handoff.</i></div>
      <div class="go-frow">
        <div class="go-field half"><label>Monto (CLP)</label><input class="go-inp" id="cd_monto" placeholder="0" inputmode="numeric"></div>
        <div class="go-field half"><label>Fecha de devolución</label><input class="go-inp" type="date" id="cd_fecha" value="${goToday()}"></div>
      </div>
      <div class="go-field"><label>Nota (opcional)</label><input class="go-inp" id="cd_nota" placeholder="ej. vuelto de caja al cierre"></div>
    </div>
    <div class="go-mf"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="goCajaDevolucionSave()">Registrar devolución</button></div></div>`);
}
function goCajaDevolucionSave() {
  const project = STATE.currentProject; const d = goData(project);
  const monto = parseInt(((document.getElementById('cd_monto') || {}).value || '0').replace(/\D/g, '')) || 0;
  if (monto <= 0) { showToast({ kind: 'warning', title: 'Monto inválido', body: 'Ingresa un monto mayor a 0.' }); return; }
  const fecha = ((document.getElementById('cd_fecha') || {}).value) || goToday();
  const nota = ((document.getElementById('cd_nota') || {}).value || '').trim();
  d.cajaDevuelto = (d.cajaDevuelto || 0) + monto;
  if (!Array.isArray(d.cajaMovs)) d.cajaMovs = [];
  d.cajaMovs.push({ id: goNewId('c'), tipo: 'devolucion', monto: monto, fecha: fecha, nota: nota });
  markDirty(); closeModal(); renderGastos();
  showToast({ kind: 'success', title: 'Devolución registrada', body: 'Se descontaron ' + fmtMoney(monto) + ' (' + fecha + ') del saldo a devolver.' });
}
/* Pasada 4 (#1) · Historial de Caja de producción: ingresos (+), devoluciones (−)
   y gastos pagados con caja (−), ordenados por fecha. Todo persiste: los gastos
   por sus movimientos, y los ingresos/devoluciones por caja_devuelto /
   caja_movimientos (PR8). */
function goCajaHistorial() {
  const project = STATE.currentProject; if (!project) return;
  const d = goData(project);
  const rows = [];
  (d.cajaMovs || []).forEach(c => rows.push({
    fecha: c.fecha || '', tipo: c.tipo === 'ingreso' ? 'Ingreso' : 'Devolución',
    detalle: c.nota || (c.tipo === 'ingreso' ? 'Ingreso a caja' : 'Devolución de caja'),
    monto: (c.tipo === 'ingreso' ? 1 : -1) * (c.monto || 0)
  }));
  goMovs(project).filter(m => m.medio === 'Caja de producción').forEach(m => rows.push({
    fecha: m.fecha || '', tipo: 'Gasto', detalle: m.concepto || '(sin concepto)', monto: -(m.monto || 0)
  }));
  rows.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const entregado = d.cajaProd || 0, gastado = goCajaGastado(project), devuelto = d.cajaDevuelto || 0;
  const saldo = entregado - gastado - devuelto;
  const body = rows.length
    ? '<table class="go-tbl" style="width:100%;"><thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th class="go-num">Monto</th></tr></thead><tbody>'
      + rows.map(r => '<tr><td class="go-sub">' + escapeHtml((r.fecha || '').slice(5) || '—') + '</td><td>' + escapeHtml(r.tipo) + '</td><td>' + escapeHtml(r.detalle) + '</td><td class="go-num" style="color:' + (r.monto >= 0 ? 'var(--positive)' : 'var(--accent-deep)') + ';white-space:nowrap;">' + (r.monto >= 0 ? '+' : '−') + fmtMoney(Math.abs(r.monto)) + '</td></tr>').join('')
      + '</tbody></table>'
    : '<div class="go-faint" style="padding:14px;">Sin movimientos de caja todavía. Registra un ingreso para empezar.</div>';
  goModal('<div class="go-mc"><div class="go-mh"><h3>Historial · Caja de producción</h3><button class="go-x" onclick="closeModal()">×</button></div>'
    + '<div class="go-mb">'
    + '<div class="go-kpi-s" style="margin-bottom:10px;line-height:1.6;">Entregado <b>' + fmtMoney(entregado) + '</b> · gastado <b>' + fmtMoney(gastado) + '</b>' + (devuelto ? ' · devuelto <b>' + fmtMoney(devuelto) + '</b>' : '') + ' · saldo a devolver <b>' + fmtMoney(saldo) + '</b></div>'
    + body
    + '<div class="go-help" style="margin-top:10px;">Los <b>ingresos</b> y <b>devoluciones</b> de esta sesión aún no persisten al recargar (van en el handoff de BD). Los <b>gastos</b> pagados con caja sí persisten.</div>'
    + '</div>'
    + '<div class="go-mf"><button class="btn btn-secondary" onclick="closeModal()">Cerrar</button></div></div>');
}

/* ---------- acciones proyecto ---------- */
function goEditCaja() {
  const project = STATE.currentProject; const d = goData(project);
  const v = window.prompt('Monto entregado a la Caja de Producción (CLP):', String(d.cajaProd || 0));
  if (v === null) return;
  d.cajaProd = parseInt(String(v).replace(/\D/g, '')) || 0;
  markDirty(); renderGastos();
}
function goMarcarListo(id) {
  const project = STATE.currentProject; const m = goMovs(project).find(x => x.id === id);
  if (m) { m.estado = 'por_revisar'; markDirty(); renderGastos(); showToast({ kind: 'success', title: 'Gasto listo', body: 'Pasó a la cola de validación de Finanzas.' }); }
}
/* Pasada 4 (#8) · devolver un gasto "Por revisar" al estado "Pendiente" (simétrico
   a "marcar listo"). Lo saca de la cola del CFO. */
function goRevertirPendiente(id) {
  const project = STATE.currentProject; const m = goMovs(project).find(x => x.id === id);
  if (m) { m.estado = 'pendiente'; markDirty(); renderGastos(); showToast({ kind: 'info', title: 'Vuelto a Pendiente', body: 'Salió de la cola de validación de Finanzas.' }); }
}
/* ── V11.x · comprobantes de gasto en Supabase Storage (bucket privado
   `adjuntos-gastos`). Antes el cliente guardaba una blob: URL efímera que moría
   al cerrar la pestaña (el archivo nunca se subía). Ahora se sube el File real y
   se persiste el PATH; para ver/descargar se pide una URL firmada temporal.
   Mismo patrón que documentos-proyecto / adjuntos-tareas. La RLS exige que el
   primer segmento del path sea el ORG_ID. ── */
function _gastoStoragePath(projId, name) {
  const safe = String(name || 'comprobante').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  return ORG_ID + '/' + (projId || 'proyecto') + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safe;
}
async function _uploadGastoComprobante(projId, file) {
  if (!sb || PROJECTS_SOURCE !== 'supabase' || !sb.storage || !file) return null;
  try {
    const path = _gastoStoragePath(projId, file.name);
    const { error } = await sb.storage.from('adjuntos-gastos').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (error) throw error;
    return { path: path };
  } catch (e) { console.warn('[storage] comprobante de gasto no disponible', e); return null; }
}
/* Estado del comprobante de un movimiento: 'ok' = subido a Storage (tiene
   filePath) · 'roto' = marca de comprobante de una versión vieja (blob muerto,
   nunca subido) · 'none' = sin comprobante. */
function goCompEstado(m) {
  if (m && m.filePath) return 'ok';
  if (m && (m.comp || m.fileName || (m.fileUrl && String(m.fileUrl).indexOf('blob:') === 0))) return 'roto';
  return 'none';
}
function goCompCell(x, onclickFn, faltaLabel) {
  const st = goCompEstado(x);
  if (st === 'ok') return '<button class="go-cmp ok" onclick="' + onclickFn + '(\'' + x.id + '\')">✓ ver</button>';
  if (st === 'roto') return '<button class="go-cmp no" title="El archivo no llegó a guardarse (referencia de una versión anterior). Edita el gasto y vuelve a adjuntar el comprobante." onclick="' + onclickFn + '(\'' + x.id + '\')">⚠ re-subir</button>';
  return '<span class="go-cmp no">' + (faltaLabel || '—') + '</span>';
}
async function goVerComprobante(id) {
  const project = STATE.currentProject || (goFindMov(id) || {}).project;
  const x = (project ? goMovs(project).find(g => g.id === id) : null) || (goFindMov(id) || {}).m;
  if (!x) return;
  /* Legado roto: tenía comprobante pero nunca llegó a Storage (blob muerto). El
     archivo no existe; hay que re-adjuntarlo desde el dispositivo original. */
  if (!x.filePath) {
    goModal(`<div class="go-mc narrow"><div class="go-mh"><h3>Comprobante no disponible</h3><button class="go-x" onclick="closeModal()">×</button></div>
      <div class="go-mb"><div class="go-help" style="line-height:1.6;">El comprobante de <b>${escapeHtml(x.concepto || '')}</b> no quedó guardado en la nube: era una referencia temporal de una versión anterior y se perdió al cerrar la pestaña. No se puede recuperar desde acá.<br><br>Para arreglarlo, <b>edita este gasto</b> y vuelve a adjuntar el comprobante desde el dispositivo donde está la foto o el PDF original.</div></div>
      <div class="go-mf"><button class="btn btn-primary btn-sm" onclick="closeModal();goOpenGasto('${x.id}')">Editar y re-adjuntar</button><button class="btn btn-secondary" onclick="closeModal()">Cerrar</button></div></div>`);
    return;
  }
  goModal(`<div class="go-mc narrow"><div class="go-mh"><h3>Comprobante · ${escapeHtml(x.concepto || '')}</h3><button class="go-x" onclick="closeModal()">×</button></div><div class="go-mb"><div class="go-help">Cargando comprobante…</div></div></div>`);
  try {
    const { data, error } = await sb.storage.from('adjuntos-gastos').createSignedUrl(x.filePath, 3600);
    if (error || !data || !data.signedUrl) throw (error || new Error('sin url'));
    const url = data.signedUrl;
    const nombre = x.fileName || x.filePath.split('/').pop() || 'comprobante';
    const esImg = /\.(jpe?g|png|gif|webp|bmp)$/i.test(nombre);
    const body = esImg
      ? `<img src="${safeUrl(url)}" style="max-width:100%;border-radius:8px;">`
      : `<div class="go-help" style="line-height:1.6;">No hay vista previa para este archivo (<b>${escapeHtml(nombre)}</b>). Las fotos de iPhone (.HEIC) y los PDF no se previsualizan en el navegador, pero puedes <b>descargarlos</b>.</div>`;
    goModal(`<div class="go-mc narrow"><div class="go-mh"><h3>Comprobante · ${escapeHtml(x.concepto || '')}</h3><button class="go-x" onclick="closeModal()">×</button></div>
      <div class="go-mb">${body}</div>
      <div class="go-mf"><a class="btn btn-secondary btn-sm" href="${safeUrl(url)}" target="_blank" rel="noopener" download="${escapeHtml(nombre)}">⬇ Descargar / abrir</a><button class="btn btn-secondary" onclick="closeModal()">Cerrar</button></div></div>`);
  } catch (e) {
    console.warn('[storage] no se pudo abrir el comprobante', e);
    goModal(`<div class="go-mc narrow"><div class="go-mh"><h3>Comprobante</h3><button class="go-x" onclick="closeModal()">×</button></div>
      <div class="go-mb"><div class="go-help">No se pudo abrir el comprobante (problema de red o permisos). Reinténtalo en un momento.</div></div>
      <div class="go-mf"><button class="btn btn-secondary" onclick="closeModal()">Cerrar</button></div></div>`);
  }
}

/* ---------- modal: crear presupuesto (sobre) ---------- */
/* V8.1 (#9): las líneas de presupuesto disponibles son las filas dentro de
   "Gastos de producción" del Presupuesto (project.data.gastos): ahí van los
   fondos reales (Gastos de Arte, Gastos de Locación, Gastos de Vestuario…).
   También sembramos el mapeo a Chipax ("Gastos de Producción") para no romper
   la exportación. */
function goGastosLineas(project) {
  const gastos = (project && project.data && Array.isArray(project.data.gastos)) ? project.data.gastos : [];
  const out = [];
  gastos.forEach(r => {
    const name = (r.item || '').trim();
    if (name && out.indexOf(name) < 0) {
      out.push(name);
      if (!CHIPAX_CUENTA[name]) CHIPAX_CUENTA[name] = 'Gastos de Producción';
    }
  });
  return out;
}
/* V11.22 (Pasada 4) · helpers de vínculo Gastos ↔ Presupuesto.
   La línea del Presupuesto (fila de project.data.gastos, campo `item`) se vincula
   a las cajas de Gastos por NOMBRE (presupuesto.linea === item). Los movimientos
   cuelgan de su caja (m.pres). Normalizamos a minúsculas/trim para tolerar
   diferencias de mayúsculas/espacios. */
function _normLinea(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
/* Cotizado (costo empresa) de una línea de Gastos: suma de las filas con ese item. */
function goLineaCotizado(project, lineName) {
  const gastos = (project && project.data && Array.isArray(project.data.gastos)) ? project.data.gastos : [];
  const ln = _normLinea(lineName);
  let total = 0;
  gastos.forEach(r => { if (_normLinea(r.item) === ln && ln) { const c = calcCostoEmpresa(r.valor, r.cantidad, r.dte, 'gastos'); total += c.value || 0; } });
  return Math.round(total);
}
/* 4a · escribe en cada fila de "Gastos de producción" su Costo Real = suma de los
   movimientos asociados (vía su caja). Solo en ejecución (estados con costo real);
   antes de aprobar el costo real no aplica y se deja como estaba. Sin markDirty: es
   un valor DERIVADO que se recalcula en cada lectura/render desde los movimientos. */
function _syncGastosCostoReal(project) {
  if (!project || !project.data || !Array.isArray(project.data.gastos)) return;
  if (!STATES_WITH_REAL_COST.includes(project.state)) return;
  const d = goData(project);
  const porLinea = {};
  d.movimientos.forEach(m => { const k = _normLinea(goLineaOf(project, m)); porLinea[k] = (porLinea[k] || 0) + (m.monto || 0); });
  /* #7 (decisión final) · una línea solo queda DERIVADA (bloqueada) si tiene al
     menos una caja vinculada. Sin caja vinculada, su Costo Real se edita a mano
     (ej. "Arriendo de camión de lluvia": un gasto puntual, un proveedor, sin
     sentido crear un presupuesto). Esas líneas conservan su valor manual. */
  const conCaja = {};
  d.presupuestos.forEach(e => { const k = _normLinea(e.linea); if (k) conCaja[k] = true; });
  project.data.gastos.forEach(r => { const k = _normLinea(r.item); if (r.item && conCaja[k]) r.costoReal = porLinea[k] || 0; });
}
/* #7 · ¿la línea de "Gastos" del Presupuesto tiene al menos una caja vinculada? */
function goLineaTieneCaja(project, lineName) {
  const ln = _normLinea(lineName); if (!ln) return false;
  return goPresList(project).some(e => _normLinea(e.linea) === ln);
}
/* #3 · real efectivamente gastado en una línea (suma de movimientos). Si es 0, el
   Costo Real vuelve a ser editable aunque haya una caja vinculada. */
function goLineaRealGastado(project, lineName) {
  const ln = _normLinea(lineName); if (!ln) return 0;
  return goMovs(project).filter(m => _normLinea(goLineaOf(project, m)) === ln).reduce((s, m) => s + (m.monto || 0), 0);
}
/* V11.3.0 · crear presupuestos en Gastos es facultad de Administrador (1),
   Ejecutivo (2) y Producción (3). Fail-open coherente con Gate B. */
function _puedeCrearPresupuestoGastos() {
  if (!TAKEOS_PERFIL) return true;
  return TAKEOS_PERFIL.codigo === 1 || TAKEOS_PERFIL.codigo === 2 || TAKEOS_PERFIL.codigo === 3;
}
function goOpenPresup() {
  if (!_puedeCrearPresupuestoGastos()) { showToast({ kind: 'warning', title: 'Sin permiso', body: 'Crear presupuestos es facultad de Administrador, Ejecutivo y Producción.' }); return; }
  const project = STATE.currentProject; const jp = goJefeProd(project);
  const lineas = goGastosLineas(project);
  const contactos = goContactos(project);

  goModal(`<div class="go-mc narrow"><div class="go-mh"><h3>Crear presupuesto · ${escapeHtml(goProjName(project))}</h3><button class="go-x" onclick="closeModal()">×</button></div>
    <div class="go-mb">
      <div class="go-field"><label>Nombre del presupuesto</label><input class="go-inp" id="pp_nombre" placeholder="ej. Compras Súper día 3"></div>
      <div class="go-field"><label>Asociar a línea del Presupuesto</label>
        <select class="go-inp" id="pp_linea" onchange="goPpLineaChange()"><option value="">— elige una línea —</option>${lineas.map(l => '<option>' + escapeHtml(l) + '</option>').join('')}<option value="__new__">+ Crear nueva línea (parte en $0)…</option></select>
        <div class="go-field" id="pp_newWrap" style="display:none;margin-top:10px;"><label>Nombre de la nueva línea</label><input class="go-inp" id="pp_newName" placeholder="ej. Maquillaje"></div>
        <div class="go-help">Estas son las filas de <b>Gastos de producción</b> del Presupuesto. Si falta una, crea una nueva: se agrega al Presupuesto (parte en $0, marcada como EXTRA) y verás cuánto se pasa el proyecto.</div>
      </div>
      <div class="go-frow">
        <div class="go-field half"><label>Responsable</label><input class="go-inp" id="pp_resp" list="go_dl_contactos" placeholder="nombre"></div>
        <div class="go-field half"><label>Monto asignado (CLP)</label><input class="go-inp" id="pp_monto" placeholder="0" inputmode="numeric"></div>
      </div>
      <div class="go-help" id="pp_iguala" style="display:none;margin-top:2px;color:var(--ink-secondary);"></div>
      <div class="go-help" style="margin-top:2px;">Crear presupuestos es facultad de los perfiles Administrador, Ejecutivo y Producción${jp.nombre ? (' · Jefe de producción del proyecto: <b>' + escapeHtml(jp.nombre) + '</b>') : ''}.</div>
      <datalist id="go_dl_contactos">${contactos.map(c => '<option value="' + escapeHtml(c) + '">').join('')}</datalist>
    </div>
    <div class="go-mf"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="goSavePresup()">Crear presupuesto</button></div></div>`);
}
function goPpLineaChange() {
  const el = document.getElementById('pp_linea'); if (!el) return;
  const v = el.value;
  const nw = document.getElementById('pp_newWrap'); if (nw) nw.style.display = (v === '__new__') ? 'block' : 'none';
  /* V11.22 (Pasada 4b) · "Igualar monto de una línea": al elegir una línea
     existente del Presupuesto, prellenar el Monto asignado con el cotizado de esa
     línea, para no tener que retipear el mismo número. Queda editable. */
  const igu = document.getElementById('pp_iguala');
  const montoEl = document.getElementById('pp_monto');
  if (v && v !== '__new__') {
    const cot = goLineaCotizado(STATE.currentProject, v);
    if (montoEl) montoEl.value = cot ? String(cot) : '';
    if (igu) { igu.style.display = 'block'; igu.innerHTML = 'Monto igualado al cotizado de la línea <b>“' + escapeHtml(v) + '”</b>: <b>' + fmtMoney(cot) + '</b>. Puedes ajustarlo.'; }
  } else if (igu) { igu.style.display = 'none'; }
}
function goSavePresup() {
  const project = STATE.currentProject; const d = goData(project); const jp = goJefeProd(project);
  const val = id => (document.getElementById(id) || {}).value || '';
  // V11.3.0: la clave por RUT del jefe de producción fue eliminada. La
  // autorización depende del perfil de acceso (Administrador/Ejecutivo/Producción).
  if (!_puedeCrearPresupuestoGastos()) { showToast({ kind: 'error', title: 'Sin permiso', body: 'Crear presupuestos es facultad de Administrador, Ejecutivo y Producción.' }); return; }
  let linea = val('pp_linea');
  if (linea === '__new__') {
    linea = (val('pp_newName') || '').trim() || 'Nueva línea';
    // V8.1 (#9): crear una línea nueva = crear una fila dentro de "Gastos de
    // producción" del Presupuesto (project.data.gastos). Parte en $0 y se
    // marca como EXTRA: editable y sin tocar el cotizado congelado (regla madre).
    const gastos = project.data.gastos = Array.isArray(project.data.gastos) ? project.data.gastos : [];
    const existe = gastos.some(r => (r.item || '').trim().toLowerCase() === linea.toLowerCase());
    if (!existe) {
      gastos.push({ nombre: '', item: linea, valor: 0, cantidad: 0, unidad: 'Tarifa Plana', dte: null, dteReal: null, confirmado: false, costoReal: null, extra: true, clientUuid: _clientUuid(), version: null, _dirty: true, _dirtySeq: 1 });
    }
    if (!CHIPAX_CUENTA[linea]) CHIPAX_CUENTA[linea] = 'Gastos de Producción';
  }
  if (!linea) { showToast({ kind: 'warning', title: 'Elige o crea una línea', body: 'Cada presupuesto se asocia a una línea del Presupuesto.' }); return; }
  const monto = parseInt((val('pp_monto') || '0').replace(/\D/g, '')) || 0;
  d.presupuestos.push({ id: goNewId('e'), nombre: (val('pp_nombre') || '').trim() || '(sin nombre)', linea: linea, resp: (val('pp_resp') || '').trim() || '—', asignado: monto });
  markDirty(); closeModal(); renderGastos();
  showToast({ kind: 'success', title: 'Presupuesto creado', body: 'Asociado a la línea “' + linea + '”.' });
}

/* ---------- modal: agregar gasto ---------- */
function goOpenGasto(editId) {
  const project = STATE.currentProject;
  const envs = goPresList(project); const contactos = goContactos(project);
  if (!envs.length) { showToast({ kind: 'warning', title: 'Primero crea un presupuesto', body: 'Cada gasto se carga a un presupuesto (sobre). Crea uno con “+ Crear presupuesto”.' }); return; }
  /* V11.x · si viene editId, precargamos el gasto para modificarlo; si no, se
     crea uno nuevo (comportamiento de siempre). El comprobante existente se
     conserva en GO_DRAFT salvo que se adjunte otro. */
  const g = editId ? goMovs(project).find(x => x.id === editId) : null;
  GO_EDIT_ID = g ? g.id : null;
  GO_DRAFT = g ? { filePath: g.filePath || null, fileName: g.fileName || null, fileUrl: null } : { filePath: null, fileName: null, fileUrl: null };
  const esEd = !!g;
  const dp = (g && g.datosPago) ? g.datosPago : null;
  const sel = (a, b) => (String(a) === String(b) ? ' selected' : '');
  const compBox = (g && g.filePath)
    ? '<div class="go-attached"><div class="go-thumb">📄</div><div style="flex:1;">' + escapeHtml(g.fileName || 'comprobante') + '<div class="go-sub">comprobante actual · adjunta otro para reemplazarlo</div></div></div>'
    : ((g && (g.comp || g.fileName)) ? '<div class="go-sub" style="color:var(--accent-deep);">⚠ El comprobante anterior no quedó guardado (versión vieja). Adjúntalo de nuevo.</div>' : '');
  goModal(`<div class="go-mc"><div class="go-mh"><h3>${esEd ? 'Editar' : 'Agregar'} gasto · ${escapeHtml(goProjName(project))}</h3><button class="go-x" onclick="closeModal()">×</button></div>
    <div class="go-mb">
      <div class="go-frow">
        <div class="go-field half"><label>Fecha</label><input class="go-inp" type="date" id="f_fecha" value="${g ? escapeHtml(g.fecha) : goToday()}"></div>
        <div class="go-field half"><label>Monto (CLP)</label><input class="go-inp" id="f_monto" placeholder="0" inputmode="numeric" value="${g ? (g.monto || '') : ''}"></div>
      </div>
      <div class="go-field"><label>Presupuesto · a qué se carga</label>
        <select class="go-inp" id="f_pres" onchange="goGastoHint()"><option value="">— elige un presupuesto —</option>${envs.map(e => '<option value="' + e.id + '"' + sel(e.id, g ? g.pres : '') + '>' + escapeHtml(e.nombre) + ' (→ ' + escapeHtml(e.linea) + ')</option>').join('')}</select>
        <div class="go-hintbox" id="goGastoHint"></div>
      </div>
      <div class="go-frow">
        <div class="go-field half"><label>Concepto</label><input class="go-inp" id="f_concepto" placeholder="¿En qué se gastó?" value="${g ? escapeHtml(g.concepto) : ''}"></div>
        <div class="go-field half"><label>Proveedor <span class="go-faint" style="font-weight:400;">· empresa</span></label>
          <span class="combobox-wrap person-combobox" style="display:block;">
            <input class="go-inp combobox-input" id="f_prov" data-emp-rol="proveedor" data-emp-add="1" placeholder="Empresa proveedora — escribe para buscar en la BD…" autocomplete="off" value="${g ? escapeHtml(g.prov) : ''}" onfocus="comboboxFilterEmpresas(this)" oninput="comboboxFilterEmpresas(this)" onblur="comboboxCloseDelayed(this)">
            <div class="combobox-dropdown" hidden></div>
          </span>
        </div>
      </div>
      <div class="go-frow">
        <div class="go-field half"><label>Quién gastó</label>
          <span class="combobox-wrap person-combobox" style="display:block;">
            <input class="go-inp combobox-input" id="f_quien" placeholder="Buscar persona en la BD…" autocomplete="off" value="${g ? escapeHtml(g.quien === '—' ? '' : g.quien) : ''}" onfocus="comboboxOpen(this)" oninput="comboboxFilter(this); goCheckPersona();" onblur="comboboxCloseDelayed(this)" onchange="goCheckPersona()">
            <div class="combobox-dropdown" hidden></div>
          </span>
        </div>
        <div class="go-field half"><label>Quién registra</label>
          <span class="combobox-wrap person-combobox" style="display:block;">
            <input class="go-inp combobox-input" id="f_registra" placeholder="Buscar persona en la BD…" autocomplete="off" value="${g ? escapeHtml(g.registra === '—' ? '' : g.registra) : ''}" onfocus="comboboxOpen(this)" oninput="comboboxFilter(this)" onblur="comboboxCloseDelayed(this)">
            <div class="combobox-dropdown" hidden></div>
          </span>
        </div>
      </div>
      <div class="go-newperson${dp ? ' show' : ''}" id="f_newperson"><div class="go-np-t">⚠ Esta persona no está en la base de datos · agrega sus datos de pago</div>
        <div class="go-frow"><div class="go-field half"><label>RUT</label><input class="go-inp" id="np_rut" placeholder="12.345.678-9" value="${dp ? escapeHtml(dp.rut || '') : ''}"></div><div class="go-field half"><label>Email</label><input class="go-inp" id="np_email" placeholder="correo@…" value="${dp ? escapeHtml(dp.email || '') : ''}"></div></div>
        <div class="go-frow"><div class="go-field half"><label>Banco</label><input class="go-inp" id="np_banco" placeholder="Banco" value="${dp ? escapeHtml(dp.banco || '') : ''}"></div><div class="go-field half"><label>Tipo de cuenta</label><input class="go-inp" id="np_tcuenta" placeholder="Cuenta corriente / vista" value="${dp ? escapeHtml(dp.tipoCuenta || '') : ''}"></div></div>
        <div class="go-field"><label>N° de cuenta</label><input class="go-inp" id="np_ncuenta" placeholder="0-000-0000000-0" value="${dp ? escapeHtml(dp.nCuenta || '') : ''}"></div>
      </div>
      <div class="go-frow">
        <div class="go-field half"><label>Medio de pago</label><select class="go-inp" id="f_medio">${GO_MEDIOS.map(m => '<option' + sel(m, g ? g.medio : '') + '>' + escapeHtml(m) + '</option>').join('')}</select></div>
        <div class="go-field half"><label>Tipo de documento</label><select class="go-inp" id="f_tipo">${GO_TIPOS.map(t => '<option' + sel(t, g ? g.tipo : '') + '>' + escapeHtml(t) + '</option>').join('')}</select></div>
      </div>
      <div class="go-field"><label>Comprobante</label>
        <div class="go-dz" onclick="document.getElementById('f_file').click()"><span class="go-big">📎</span>Adjunta foto o PDF de la boleta/factura</div>
        <input type="file" id="f_file" accept="image/*,application/pdf" style="display:none" onchange="goOnFile(this)"><div id="f_fileBox">${compBox}</div>
      </div>
      <div class="go-field"><label>Comentario (opcional)</label><textarea class="go-inp" id="f_coment" placeholder="Nota para el equipo o Finanzas… (ej. falta la boleta, llega mañana)">${g ? escapeHtml(g.coment || '') : ''}</textarea></div>
      <datalist id="go_dl_contactos">${contactos.map(c => '<option value="' + escapeHtml(c) + '">').join('')}</datalist>
    </div>
    <div class="go-mf">${esEd ? `<button class="btn btn-ghost btn-sm" style="color:var(--accent-deep);" onclick="goDeleteGasto('${GO_EDIT_ID}')">Eliminar gasto</button>` : ''}<span class="go-help" style="margin-right:auto;margin-left:${esEd ? '12px' : '0'};">Si falta info (comprobante, concepto…) queda <b>Pendiente</b> y no molesta a Finanzas.</span>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="goSaveGasto()">${esEd ? 'Guardar cambios' : 'Guardar gasto'}</button></div></div>`);
  if (esEd) { try { goGastoHint(); } catch (e) {} }
}
function goCheckPersona() {
  const v = (document.getElementById('f_quien').value || '').trim();
  const box = document.getElementById('f_newperson');
  const known = goContactos(STATE.currentProject);
  box.classList.toggle('show', v.length > 1 && known.indexOf(v) < 0);
}
function goGastoHint() {
  const project = STATE.currentProject;
  const id = document.getElementById('f_pres').value; const box = document.getElementById('goGastoHint');
  if (!id) { box.classList.remove('show'); return; }
  const e = goPresById(project, id); const gastado = goGastado(project, id);
  box.classList.add('show');
  box.innerHTML = 'Sube el <b>gastado</b> de «' + escapeHtml(e.nombre) + '» (gastado ' + fmtMoney(gastado) + ' de ' + fmtMoney(e.asignado || 0) + ' → quedan <b>' + fmtMoney((e.asignado || 0) - gastado) + '</b>) y el <b>Real</b> de la línea <b>' + escapeHtml(e.linea) + '</b>. El cotizado no se toca.';
}
async function goOnFile(inp) {
  const f = inp.files[0]; if (!f) return;
  const box = document.getElementById('f_fileBox');
  if (box) box.innerHTML = '<div class="go-sub">Subiendo comprobante a la nube…</div>';
  const up = await _uploadGastoComprobante(STATE.currentProject ? STATE.currentProject.id : '', f);
  if (!up || !up.path) {
    if (box) box.innerHTML = '<div class="go-sub" style="color:var(--accent-deep);">No se pudo subir el comprobante. Revisa tu conexión y reintenta.</div>';
    showToast({ kind: 'error', title: 'No se subió el comprobante', body: 'No se pudo guardar el archivo en la nube. Reintenta.', duration: 7000 });
    return;
  }
  GO_DRAFT.filePath = up.path; GO_DRAFT.fileName = f.name;
  GO_DRAFT.fileUrl = URL.createObjectURL(f);   // solo preview en esta sesión; NO se persiste
  const isImg = (f.type || '').indexOf('image/') === 0;
  if (box) box.innerHTML = `<div class="go-attached"><div class="go-thumb">${isImg ? '<img src="' + safeUrl(GO_DRAFT.fileUrl) + '">' : '📄'}</div><div style="flex:1;">${escapeHtml(f.name)}<div class="go-sub">${(f.size / 1024).toFixed(0)} KB · subido ✓</div></div></div>`;
}
function goSaveGasto() {
  const project = STATE.currentProject; const d = goData(project);
  const val = id => (document.getElementById(id) || {}).value || '';
  const monto = parseInt((val('f_monto') || '0').replace(/\D/g, '')) || 0;
  const pres = val('f_pres');
  const concepto = (val('f_concepto') || '').trim(); const prov = (val('f_prov') || '').trim();
  const completo = monto > 0 && !!pres && !!concepto && !!prov && !!GO_DRAFT.filePath;
  let datosPago = null;
  const npRut = val('np_rut');
  if (document.getElementById('f_newperson') && document.getElementById('f_newperson').classList.contains('show') && npRut) {
    datosPago = { rut: npRut, email: val('np_email'), banco: val('np_banco'), tipoCuenta: val('np_tcuenta'), nCuenta: val('np_ncuenta') };
  }
  const campos = {
    pres: pres, fecha: val('f_fecha') || goToday(),
    quien: (val('f_quien') || '').trim() || '—', registra: (val('f_registra') || '').trim() || '—',
    concepto: concepto || '(sin concepto)', prov: prov || '—', monto: monto,
    medio: val('f_medio'), tipo: val('f_tipo'), comp: !!GO_DRAFT.filePath,
    estado: completo ? 'por_revisar' : 'pendiente', coment: (val('f_coment') || '').trim(),
    fileName: GO_DRAFT.fileName, filePath: GO_DRAFT.filePath || null, fileUrl: null
  };
  if (GO_EDIT_ID) {
    /* V11.x · EDICIÓN de un gasto existente: se actualizan sus campos en su
       lugar (mismo id). Como cambió, el estado se recalcula y vuelve a la cola
       del CFO si está completo —una validación previa queda obsoleta—. Se
       conservan fechaPago/objetivo y los datos de pago si no se reingresaron. */
    const m = d.movimientos.find(x => x.id === GO_EDIT_ID);
    if (!m) { GO_EDIT_ID = null; closeModal(); return; }
    const oldFilePath = m.filePath || null;
    Object.assign(m, campos);
    if (datosPago) m.datosPago = datosPago;
    /* si se reemplazó el comprobante, borra el objeto viejo de Storage */
    if (oldFilePath && oldFilePath !== m.filePath && sb && sb.storage) { try { sb.storage.from('adjuntos-gastos').remove([oldFilePath]); } catch (e) {} }
    GO_EDIT_ID = null;
    markDirty(); closeModal(); renderGastos();
    showToast({ kind: 'success', title: 'Gasto actualizado', body: completo ? 'Como cambió, vuelve a la cola de validación de Finanzas.' : 'Quedó Pendiente: falta info por completar.' });
    return;
  }
  /* #1 · aviso de choque de Costo Real: si la línea de "Gastos" del Presupuesto
     tiene un Costo Real cargado a mano (línea con caja y aún sin movimientos),
     asignar este gasto lo vuelve un valor DERIVADO y reemplaza el manual. Avisamos
     antes de sobrescribir (confirm nativo, coherente con prDelUnidad/prDelPlan). */
  if (pres) {
    const filaPres = (project.data.gastos || []).find(r => _normLinea(r.item) === _normLinea(pres));
    if (filaPres && (filaPres.costoReal || 0) > 0 && goLineaTieneCaja(project, pres) && goLineaRealGastado(project, pres) === 0) {
      if (!window.confirm('La línea «' + pres + '» ya tiene un Costo Real de ' + fmtMoney(filaPres.costoReal) + ' cargado a mano.\n\nAl asignar este gasto, el Costo Real pasará a calcularse automáticamente desde los gastos y ese valor manual se reemplazará.\n\n¿Quieres continuar?')) return;
    }
  }
  const m = Object.assign({ id: goNewId('m') }, campos, { fechaPago: null, objetivo: null, datosPago: datosPago });
  d.movimientos.push(m); markDirty(); closeModal(); renderGastos();
  showToast({ kind: 'success', title: completo ? 'Gasto agregado · Por revisar' : 'Gasto agregado · queda Pendiente', body: completo ? 'Pasó a la cola de Finanzas.' : 'Falta info: complétalo y marca “listo”.' });
}
/* Pasada 4 (#2) · eliminar un gasto desde el modal de edición, con confirmación
   (modal propio del software). Borra también el comprobante del Storage. */
function goDeleteGasto(id) {
  const project = STATE.currentProject; if (!project) return;
  const d = goData(project);
  const m = d.movimientos.find(x => x.id === id);
  if (!m) return;
  showModal({
    title: 'Eliminar gasto',
    body: '¿Estás seguro de que quieres eliminar este gasto?<br><br><b>' + escapeHtml(m.concepto || '(sin concepto)') + '</b> · ' + fmtMoney(m.monto || 0) + '<br><br>Esta acción no se puede deshacer.',
    confirmLabel: 'Eliminar gasto', cancelLabel: 'Cancelar', danger: true,
    onConfirm: function () {
      const i = d.movimientos.findIndex(x => x.id === id);
      if (i >= 0) {
        const fp = d.movimientos[i].filePath;
        d.movimientos.splice(i, 1);
        if (fp && sb && sb.storage) { try { sb.storage.from('adjuntos-gastos').remove([fp]); } catch (e) {} }
      }
      GO_EDIT_ID = null;
      markDirty(); closeModal(); renderGastos();
      showToast({ kind: 'success', title: 'Gasto eliminado', body: 'Se quitó del registro.' });
    }
  });
}

/* ---------- modal: captura rápida ---------- */
function goOpenQuick() {
  const project = STATE.currentProject; GO_DRAFT = { filePath: null, fileName: null, fileUrl: null }; GO_EDIT_ID = null;
  const envs = goPresList(project);
  goModal(`<div class="go-mc narrow"><div class="go-mh"><h3>⚡ Captura rápida</h3><button class="go-x" onclick="closeModal()">×</button></div>
    <div class="go-mb"><div class="go-phone">
      <div class="go-field"><label>Comprobante</label>
        <div class="go-dz" onclick="document.getElementById('q_file').click()"><span class="go-big">📷</span>Saca la foto a la boleta</div>
        <input type="file" id="q_file" accept="image/*" capture="environment" style="display:none" onchange="goOnFileQ(this)"><div id="q_fileBox"></div></div>
      <div class="go-field"><label>Monto (CLP)</label><input class="go-inp" id="q_monto" placeholder="0" inputmode="numeric"></div>
      <div class="go-field"><label>Presupuesto (opcional ahora)</label><select class="go-inp" id="q_pres"><option value="">— completar después —</option>${envs.map(e => '<option value="' + e.id + '">' + escapeHtml(e.nombre) + '</option>').join('')}</select></div>
      <div class="go-field"><label>Proyecto</label><input class="go-inp" value="${escapeHtml(goProjName(project))}" disabled></div>
      <div class="go-help">Lo demás (concepto, proveedor…) lo completas después. Queda <b>Pendiente</b>.</div>
    </div></div>
    <div class="go-mf"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="goSaveQuick()">Guardar y completar después</button></div></div>`);
}
async function goOnFileQ(inp) {
  const f = inp.files[0]; if (!f) return;
  const box = document.getElementById('q_fileBox');
  if (box) box.innerHTML = '<div class="go-sub">Subiendo…</div>';
  const up = await _uploadGastoComprobante(STATE.currentProject ? STATE.currentProject.id : '', f);
  if (!up || !up.path) {
    if (box) box.innerHTML = '<div class="go-sub" style="color:var(--accent-deep);">No se pudo subir. Reintenta.</div>';
    showToast({ kind: 'error', title: 'No se subió el comprobante', body: 'Revisa tu conexión y reintenta.' });
    return;
  }
  GO_DRAFT.filePath = up.path; GO_DRAFT.fileName = f.name;
  GO_DRAFT.fileUrl = URL.createObjectURL(f);
  if (box) box.innerHTML = `<div class="go-attached"><div class="go-thumb"><img src="${safeUrl(GO_DRAFT.fileUrl)}"></div><div style="flex:1;">${escapeHtml(f.name)}<div class="go-sub">subido ✓</div></div></div>`;
}
function goSaveQuick() {
  const project = STATE.currentProject; const d = goData(project);
  const monto = parseInt((document.getElementById('q_monto').value || '0').replace(/\D/g, '')) || 0;
  const pres = (document.getElementById('q_pres') || {}).value || (goPresList(project)[0] ? goPresList(project)[0].id : '');
  const m = {
    id: goNewId('m'), pres: pres, fecha: goToday(), quien: '—', registra: '—',
    concepto: '(completar)', prov: '—', monto: monto, medio: 'Tarjeta empresa (débito)', tipo: 'Boleta',
    comp: !!GO_DRAFT.filePath, estado: 'pendiente', coment: '', fechaPago: null, objetivo: null,
    fileName: GO_DRAFT.fileName, filePath: GO_DRAFT.filePath || null, datosPago: null
  };
  d.movimientos.push(m); markDirty(); closeModal(); renderGastos();
  showToast({ kind: 'success', title: 'Capturado · queda Pendiente', body: 'Complétalo más tarde y márcalo listo.' });
}

/* ════════════════════════════════════════════════════════════════════
   MÓDULO CFO (global, consolida todos los proyectos)
   ════════════════════════════════════════════════════════════════════ */
function goAllMovs() {
  const out = [];
  PROJECTS.forEach(p => { goMovs(p).forEach(m => out.push({ project: p, m: m })); });
  return out;
}
function goFindMov(id) {
  for (const p of PROJECTS) { const m = goMovs(p).find(x => x.id === id); if (m) return { project: p, m: m }; }
  return null;
}
function openGlobalCFO() {
  STATE.currentView = 'bd-global';
  STATE.currentProject = null;
  STATE.currentModule = 'cfo';
  document.getElementById('controlRoomView').classList.add('hidden');
  document.getElementById('projectView').classList.add('hidden');
  document.getElementById('bdGlobalView').classList.remove('hidden');
  const mm = document.getElementById('moduleMain'); if (mm) mm.innerHTML = '';
  document.getElementById('breadcrumb').innerHTML = `<span class="breadcrumb-link" onclick="navigateToControlRoom()">Control Room</span><span class="breadcrumb-sep">›</span><span class="breadcrumb-current">Finanzas</span>`;
  renderModule('cfo');
  window.scrollTo(0, 0);
  /* V11.7.1 · precarga los pagos de cliente desde la base y re-renderiza el
     Bird View cuando llegan (evita parpadeo: si ya estaban en memoria, no hace nada). */
  if (sb && PROJECTS_SOURCE === 'supabase') {
    dalCargarPagosClienteTodos().then(function () { if (STATE.currentModule === 'cfo') { try { renderCFO(); } catch (e) {} } });
  }
}
/* V11.7.0 · Chipax solo se muestra si la productora declara que lo usa
   (config de empresa → Enlaces e integraciones). */
function _usaChipax() { try { return !!(EMPRESA_PERFIL && EMPRESA_PERFIL.usaChipax); } catch (e) { return false; } }
/* ════════════════════════════════════════════════════════════════════
   V11.9.0 · CAMPANITA DE AVISOS IN-APP
   Lee de user_notifications (RLS filtra a los del usuario) y marca leídos con
   marcar_notificaciones_leidas. Es el buzón inmediato dentro de la app, distinto
   de la cola de emails (Resend, pendiente). Los avisos los crean RPCs del
   servidor (p. ej. asignar_cargo_a_miembro); el cliente solo lee y marca leído.
   ════════════════════════════════════════════════════════════════════ */
/* NOTIF, _NOTIF_TIMER, _NOTIF_OUTSIDE, notifCargar, notifPintarBadge, notifRenderPanel,
   bellToggle, notifMarcarTodas, notifAbrir, notifAbrirRebind, _rebindRenderModal,
   _rebindAprobar, _rebindResolver, _empCargarRebinds, notifInit
   → movidos a src/modules/notificaciones.js (Etapa 2) */
/* ════════════════════════════════════════════════════════════════════
   V11.7.1 · PAGOS DE CLIENTE EN SUPABASE (handoff BD resuelto)
   Tabla project_client_payments (SELECT directo, RLS por finanzas_consolidada
   E|L + auth_ve_proyecto) y RPC guardar_pagos_cliente(project_id, pagos[])
   con contrato de estado completo (mismo patrón que guardar_cargos).
   El Bird View es síncrono y lee de p.data.finanzas.pagosCliente en memoria:
   precargamos esa memoria desde la base antes de pintar el CFO, y cada
   registro de pago escribe por el RPC y recarga ese proyecto.
   ════════════════════════════════════════════════════════════════════ */
const _PAGOS_CLIENTE_BACKEND = true;
async function dalCargarPagosCliente(project) {
  if (!project) return;
  if (!sb || PROJECTS_SOURCE !== 'supabase') { if (!project.data.finanzas) project.data.finanzas = {}; if (!Array.isArray(project.data.finanzas.pagosCliente)) project.data.finanzas.pagosCliente = []; return; }
  try {
    const r = await sb.from('project_client_payments')
      .select('monto, nota, fecha, posicion')
      .eq('project_id', project.id).order('posicion', { ascending: true });
    if (r.error) throw r.error;
    if (!project.data.finanzas) project.data.finanzas = {};
    project.data.finanzas.pagosCliente = (r.data || []).map(function (x) {
      return { monto: Number(x.monto) || 0, nota: x.nota || '', fecha: x.fecha || '' };
    });
    project.data.finanzas._pagosOK = true;
  } catch (e) {
    console.warn('[dal] cargar pagos cliente', e);
    if (!project.data.finanzas) project.data.finanzas = {};
    if (!Array.isArray(project.data.finanzas.pagosCliente)) project.data.finanzas.pagosCliente = [];
  }
}
async function dalCargarPagosClienteTodos() {
  /* precarga los pagos de todos los proyectos activos (los que muestra el
     Bird View) antes de renderizar el CFO. */
  if (!sb || PROJECTS_SOURCE !== 'supabase') return;
  const activos = PROJECTS.filter(function (p) { return !['cerrado', 'rechazado'].includes(p.state); });
  for (const p of activos) {
    if (!p.data.finanzas || !p.data.finanzas._pagosOK) { try { await dalCargarPagosCliente(p); } catch (e) {} }
  }
}
async function dalGuardarPagosCliente(project) {
  if (!sb || PROJECTS_SOURCE !== 'supabase' || !project) return false;
  try {
    const payload = (project.data.finanzas.pagosCliente || []).map(function (x) {
      return { monto: Number(x.monto) || 0, nota: x.nota || '', fecha: x.fecha || new Date().toISOString().slice(0, 10) };
    });
    const { error } = await sb.rpc('guardar_pagos_cliente', { p_project_id: project.id, p_pagos: payload });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('[dal] guardar pagos cliente', e);
    if (manejarErrorPlan(e)) return false;   // V11.16.0 · Frente D: finanzas fuera del plan → módulo bloqueado
    try { showToast({ kind: 'error', title: 'No se pudo guardar el pago', body: (e && e.message) ? String(e.message).replace(/^[a-z_]+:\s*/i, '') : 'Reintenta.', duration: 8000 }); } catch (x) {}
    return false;
  }
}
/* ════════════════════════════════════════════════════════════════════
   V11.7.0 · BIRD VIEW FINANCIERO DE LA PRODUCTORA
   Vista macro: proyectos en curso, cuánto facturarán (valor a cliente),
   cuánto se ha cobrado (abonos/cuotas, registrado por el CFO) y el saldo
   por cobrar. El detalle vive en el presupuesto de cada proyecto: un click
   en la fila lleva allá. Montos macro, nada de micro-detalle.
   ════════════════════════════════════════════════════════════════════ */
function _projValorCliente(p) {
  try { const f = p.data.finanzas || {}; return (f.presupuestoCliente != null && f.presupuestoCliente > 0) ? f.presupuestoCliente : (typeof cotRealPresup === 'function' ? cotRealPresup(p) : 0); } catch (e) { return 0; }
}
function _projCobrado(p) {
  try { const f = p.data.finanzas || {}; if (Array.isArray(f.pagosCliente)) return f.pagosCliente.reduce(function (s, x) { return s + (Number(x.monto) || 0); }, 0); return Number(f.cobradoCliente) || 0; } catch (e) { return 0; }
}
function cfoBirdView() {
  const activos = PROJECTS.filter(p => !['cerrado', 'rechazado'].includes(p.state));
  let totVal = 0, totCob = 0;
  const filas = activos.map(function (p) {
    const val = _projValorCliente(p), cob = _projCobrado(p), saldo = Math.max(0, val - cob);
    totVal += val; totCob += cob;
    const pct = val > 0 ? Math.min(100, Math.round(cob / val * 100)) : 0;
    return `<tr style="cursor:pointer;" onclick="cfoIrAPresupuesto('${p.id}')" title="Ver el presupuesto de este proyecto">
      <td>${escapeHtml(goProjName(p))}<div class="go-sub">${escapeHtml((STATES[p.state] && STATES[p.state].name) || p.state || '')}</div></td>
      <td class="go-num">${fmtMoney(val)}</td>
      <td class="go-num" style="color:var(--positive);">${fmtMoney(cob)}</td>
      <td class="go-num" style="color:${saldo > 0 ? 'var(--accent-deep,#c2410c)' : 'var(--ink-faint)'};">${fmtMoney(saldo)}</td>
      <td style="min-width:90px;"><div style="background:var(--rule);border-radius:999px;height:7px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:var(--positive);"></div></div><div class="go-sub" style="text-align:right;">${pct}%</div></td>
      <td><button class="go-mini" onclick="event.stopPropagation();cfoRegistrarPago('${p.id}')">+ Registrar pago</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="go-faint" style="padding:16px;">Sin proyectos activos.</td></tr>';
  const saldoTot = Math.max(0, totVal - totCob);
  return `<div class="go-card" style="margin-bottom:14px;">
    <div class="go-card-h"><h3>Vista general de la productora <span class="go-faint">· ${activos.length} proyecto(s) en curso · macro · el detalle vive en cada presupuesto</span></h3></div>
    ${(typeof _PAGOS_CLIENTE_BACKEND === 'undefined' || !_PAGOS_CLIENTE_BACKEND) ? '<div style="font-size:11px;color:var(--ink-faint);padding:0 14px 8px;">Los pagos registrados se guardan en este navegador por ahora; la sincronización entre dispositivos llega con la próxima extensión de la base.</div>' : ''}
    <div class="go-card-b go-tablewrap">
      <table class="go-tbl"><thead><tr><th>Proyecto</th><th class="go-num">Ingreso</th><th class="go-num">Cobrado</th><th class="go-num">Por cobrar</th><th>Avance cobro</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr style="font-weight:700;border-top:2px solid var(--rule);"><td>Total productora</td><td class="go-num">${fmtMoney(totVal)}</td><td class="go-num" style="color:var(--positive);">${fmtMoney(totCob)}</td><td class="go-num" style="color:var(--accent-deep,#c2410c);">${fmtMoney(saldoTot)}</td><td colspan="2"></td></tr></tfoot>
      </table>
    </div>
  </div>`;
}
function cfoIrAPresupuesto(projId) {
  if (!PROJECTS.find(x => x.id === projId)) return;
  closeModalGlobalIfAny();
  navigateToProject(projId);
  setTimeout(function () { try { navigateToModule('presupuesto'); } catch (e) {} }, 90);
}
function closeModalGlobalIfAny() { try { const m = document.getElementById('moduleContent'); } catch (e) {} }
function cfoRegistrarPago(projId) {
  const p = PROJECTS.find(x => x.id === projId); if (!p) return;
  const val = _projValorCliente(p), cob = _projCobrado(p), saldo = Math.max(0, val - cob);
  document.getElementById('modalRoot').innerHTML = '<div class="modal-backdrop"><div class="modal" onclick="event.stopPropagation()" style="max-width:420px;">'
    + '<div class="modal-header"><div class="modal-title">Registrar pago de cliente</div></div>'
    + '<div class="modal-body">'
    + '<p style="margin:0 0 12px;font-size:12.5px;color:var(--ink-secondary);line-height:1.5;"><strong>' + escapeHtml(goProjName(p)) + '</strong><br>Ingreso ' + fmtMoney(val) + ' · cobrado ' + fmtMoney(cob) + ' · por cobrar <strong>' + fmtMoney(saldo) + '</strong></p>'
    + '<div class="emp-field" style="margin-bottom:10px;"><label>Monto recibido (CLP)</label><input class="input" id="cfoPagoMonto" type="number" inputmode="numeric" placeholder="0"></div>'
    + '<div class="emp-field"><label>Nota (opcional)</label><input class="input" id="cfoPagoNota" placeholder="Ej. Abono 50%, cuota 1 de 3…"></div>'
    + '</div>'
    + '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="cfoGuardarPago(\'' + projId + '\')">Registrar</button></div>'
    + '</div></div>';
}
async function cfoGuardarPago(projId) {
  const p = PROJECTS.find(x => x.id === projId); if (!p) return;
  const monto = Number((document.getElementById('cfoPagoMonto') || {}).value || 0);
  if (!monto || monto <= 0) { showToast({ kind: 'warning', title: 'Monto inválido', body: 'Ingresa un monto mayor a 0.' }); return; }
  const nota = String((document.getElementById('cfoPagoNota') || {}).value || '').trim();
  if (!p.data.finanzas) p.data.finanzas = {};
  if (!Array.isArray(p.data.finanzas.pagosCliente)) p.data.finanzas.pagosCliente = [];
  /* V11.7.1 · optimista en memoria + persistencia por RPC (estado completo). */
  const nuevo = { monto: monto, nota: nota, fecha: new Date().toISOString().slice(0, 10) };
  p.data.finanzas.pagosCliente.push(nuevo);
  const btn = document.querySelector('#modalRoot .btn-primary'); if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  const ok = await dalGuardarPagosCliente(p);
  if (!ok) {
    // revertir el optimismo si la base lo rechazó
    const idx = p.data.finanzas.pagosCliente.indexOf(nuevo); if (idx >= 0) p.data.finanzas.pagosCliente.splice(idx, 1);
    if (btn) { btn.disabled = false; btn.textContent = 'Registrar'; }
    return;
  }
  closeModal(); renderCFO();
  showToast({ kind: 'success', title: 'Pago registrado', body: fmtMoney(monto) + ' en ' + goProjName(p) + '.' });
}
function renderCFO() {
  const cont = document.getElementById('moduleContent');
  if (!cont) return;
  const all = goAllMovs();
  const pend = all.filter(o => goNeedsAction(o.m));
  const reemb = []; PROJECTS.forEach(p => goReembPend(p).forEach(m => reemb.push({ project: p, m: m })));
  const totalMes = all.reduce((s, o) => s + (o.m.monto || 0), 0);
  const validados = all.filter(o => o.m.estado === 'validado').length;
  const reembMonto = reemb.reduce((s, o) => s + (o.m.monto || 0), 0);
  const pp = goPPPend(); const ppMonto = pp.reduce((s, o) => s + o.monto, 0);

  cont.innerHTML = `
  <div class="go-wrap">
    ${cfoBirdView()}
    <div class="go-note">Consolida los gastos de <b>todos los proyectos</b>. Finanzas valida los gastos, administra los <b>pagos pendientes</b> (reembolsos y prontos pagos)${_usaChipax() ? ' y exporta a Chipax' : ''} y genera las nóminas de transferencias sin entrar proyecto por proyecto.</div>
    <div class="go-card"><div class="go-card-b"><div class="go-kpis">
      <div class="go-kpi"><div class="l">Gasto del mes</div><div class="v">${fmtMoney(totalMes)}</div><div class="s">${all.length} gastos · ${PROJECTS.length} proyectos</div></div>
      <div class="go-kpi warn"><div class="l">Por validar</div><div class="v">${pend.length}</div><div class="s">listos, esperando validación</div></div>
      <div class="go-kpi acc"><div class="l">Reembolsos por pagar</div><div class="v">${reemb.length}</div><div class="s">${fmtMoney(reembMonto)} a transferir</div></div>
      <div class="go-kpi acc"><div class="l">Prontos pagos</div><div class="v">${pp.length}</div><div class="s">${fmtMoney(ppMonto)} a transferir</div></div>
      <div class="go-kpi pos"><div class="l">Validado</div><div class="v">${validados}</div><div class="s">${_usaChipax() ? 'listo para Chipax' : 'gastos validados'}</div></div>
    </div></div></div>
    <div class="go-tabs">
      <button class="go-tab ${GO_STATE.cfoTab === 'validacion' ? 'on' : ''}" onclick="goSetCfoTab('validacion')">Validación${pend.length ? '<span class="b">' + pend.length + '</span>' : ''}</button>
      <button class="go-tab ${GO_STATE.cfoTab === 'reembolsos' ? 'on' : ''}" onclick="goSetCfoTab('reembolsos')">Reembolsos${reemb.length ? '<span class="b">' + reemb.length + '</span>' : ''}</button>
      <button class="go-tab ${GO_STATE.cfoTab === 'prontospagos' ? 'on' : ''}" onclick="goSetCfoTab('prontospagos')">Prontos Pagos${pp.length ? '<span class="b">' + pp.length + '</span>' : ''}</button>
      <button class="go-tab ${GO_STATE.cfoTab === 'proyectos' ? 'on' : ''}" onclick="goSetCfoTab('proyectos')">Por proyecto</button>
      ${_usaChipax() ? `<button class="go-tab ${GO_STATE.cfoTab === 'export' ? 'on' : ''}" onclick="goSetCfoTab('export')">Exportar a Chipax</button>` : ''}
    </div>
    <div id="go-cfo-body">${goCfoBody()}</div>
  </div>`;
}
function goSetCfoTab(t) { GO_STATE.cfoTab = t; renderCFO(); }
function goCfoBody() {
  if (GO_STATE.cfoTab === 'export' && !_usaChipax()) GO_STATE.cfoTab = 'validacion';
  if (GO_STATE.cfoTab === 'validacion') return goCfoValidacion();
  if (GO_STATE.cfoTab === 'reembolsos') return goCfoReembolsos();
  if (GO_STATE.cfoTab === 'prontospagos') return goCfoProntosPagos();
  if (GO_STATE.cfoTab === 'proyectos') return goCfoProyectos();
  return goCfoExportPanel();
}
function goCfoValidacion() {
  const pend = goAllMovs().filter(o => goNeedsAction(o.m));
  const rows = pend.length ? pend.map(o => {
    const x = o.m; const e = goPresById(o.project, x.pres);
    const comp = goCompCell(x, 'goCfoVer', 'falta');
    return `<tr>
      <td class="go-sub">${escapeHtml(x.fecha.slice(5))}</td><td>${escapeHtml(goProjName(o.project))}</td>
      <td>${escapeHtml(x.concepto)}<div class="go-sub">${escapeHtml(x.prov)}</div>${goComentCell(o.project, x)}</td>
      <td><span class="go-tag">${escapeHtml(e ? e.nombre : '—')}</span></td><td>${escapeHtml(x.quien)}</td>
      <td class="go-num">${fmtMoney(x.monto)}</td><td>${comp}</td>
      <td><span class="go-est ${x.estado}">${GO_ESTADOS[x.estado]}</span></td>
      <td style="white-space:nowrap;"><button class="btn btn-secondary btn-sm go-btn-pos" onclick="goValidar('${x.id}')">Validar</button> <button class="btn btn-secondary btn-sm go-btn-warn" onclick="goObservar('${x.id}')">Observar</button></td></tr>`;
  }).join('') : '<tr><td colspan="9" class="go-faint" style="padding:18px;">Nada pendiente. Todo validado ✓</td></tr>';
  return `<div class="go-card"><div class="go-card-h"><h3>Cola de validación <span class="go-faint">· solo gastos listos, de todos los proyectos (los “Pendiente” no aparecen)</span></h3></div>
    <div class="go-card-b go-tablewrap"><table class="go-tbl"><thead><tr><th>Fecha</th><th>Proyecto</th><th>Concepto</th><th>Presupuesto</th><th>Quién gastó</th><th class="go-num">Monto</th><th>Comp.</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function goCfoReembolsos() {
  const pend = []; PROJECTS.forEach(p => goReembPend(p).forEach(m => pend.push({ project: p, m: m })));
  const pagados = []; PROJECTS.forEach(p => goMovs(p).forEach(m => { if (m.medio === 'Reembolso a colaborador' && m.fechaPago) pagados.push({ project: p, m: m }); }));
  const hoy = goToday();
  const pendRows = pend.length ? pend.map(o => {
    const x = o.m; const st = x.objetivo ? (x.objetivo < hoy ? 'venc' : (x.objetivo === hoy ? 'hoy' : '')) : '';
    const badge = st === 'venc' ? ' · <span class="go-paybadge venc">⚠ vencido</span>' : (st === 'hoy' ? ' · <span class="go-paybadge hoy">● pagar hoy</span>' : '');
    return `<tr class="${st}"><td>${escapeHtml(x.concepto)}<div class="go-sub">${escapeHtml(x.fecha.slice(5))}${badge}</div></td><td><b>${escapeHtml(x.quien)}</b></td><td class="go-sub">${escapeHtml(goProjName(o.project))}</td><td class="go-num">${fmtMoney(x.monto)}</td>
      <td><input type="date" class="go-dateinp" id="rp_${x.id}" value="${x.objetivo || hoy}" onchange="goSetObjetivo('${x.id}',this.value)"></td>
      <td><button class="btn btn-secondary btn-sm go-btn-pos" onclick="goPagarReemb('${x.id}')">Marcar pagado</button></td></tr>`;
  }).join('') : '<tr><td colspan="6" class="go-faint" style="padding:18px;">Sin reembolsos pendientes.</td></tr>';
  const pagBlock = pagados.length ? `<div class="go-card"><div class="go-card-h"><h3 class="go-sm">Pagados <span class="go-faint">· para conciliar con Chipax · fecha editable</span></h3></div>
    <div class="go-card-b go-tablewrap"><table class="go-tbl"><thead><tr><th>Fecha pago</th><th>A quién</th><th>Proyecto</th><th class="go-num">Monto</th><th></th></tr></thead><tbody>
    ${pagados.map(o => `<tr><td><input type="date" class="go-dateinp" value="${o.m.fechaPago}" onchange="goSetFechaPago('${o.m.id}',this.value)"></td><td>${escapeHtml(o.m.quien)}</td><td class="go-sub">${escapeHtml(goProjName(o.project))}</td><td class="go-num">${fmtMoney(o.m.monto)}</td><td><button class="go-mini" onclick="goSetFechaPago('${o.m.id}','')">deshacer</button></td></tr>`).join('')}
    </tbody></table></div></div>` : '';
  return `<div class="go-card"><div class="go-card-h"><h3>Reembolsos pendientes <span class="go-faint">· fecha de pago editable · se avisa lo que vence hoy o está vencido</span></h3>
      ${pend.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-secondary btn-sm" onclick="goExportSantander()">⬇ Exportar transferencias (Santander)</button><button class="btn btn-primary btn-sm" onclick="goPagarTodos()">Marcar todos pagados (hoy)</button></div>' : ''}</div>
    <div class="go-card-b go-tablewrap"><table class="go-tbl"><thead><tr><th>Gasto</th><th>A quién pagar</th><th>Proyecto</th><th class="go-num">Monto</th><th>Fecha de pago</th><th></th></tr></thead><tbody>${pendRows}</tbody></table></div></div>${pagBlock}`;
}
/* ════════════════════════════════════════════════════════════════════
   V8.1 (#8) · EXPORTAR NÓMINA DE TRANSFERENCIAS MASIVAS (SANTANDER)
   ════════════════════════════════════════════════════════════════════
   Toma los reembolsos PENDIENTES (de todos los proyectos) y arma el Excel
   con el formato exacto del Office Banking de Santander (13 columnas).
   Datos bancarios del beneficiario: primero la Base de Datos (perfil de
   pago), luego los datosPago capturados en el gasto. El código de banco
   es el SBIF de 3 dígitos (037 Santander, 012 BancoEstado, etc.).
   La cuenta de ORIGEN sale del Perfil de empresa (bancoNumero); si falta,
   se pide y se guarda.
   ════════════════════════════════════════════════════════════════════ */
function goSantanderBankFor(project, m) {
  const nombre = (m.quien || '').trim();
  const bd = (typeof BD_PERSONAS !== 'undefined' && nombre) ? BD_PERSONAS[nombre] : null;
  const dp = m.datosPago || {};
  const banco = (bd && bd.banco) || dp.banco || '';
  const codigoBanco = (bd && bd.codigoBanco) || _codigoBancoSBIF(banco) || '';
  const tipoCuenta = (bd && bd.tipoCuenta) || dp.tipoCuenta || '';
  const nCuenta = (bd && (bd.nCuenta || bd.numeroCuenta)) || dp.nCuenta || '';
  const rut = (bd && bd.rut) || dp.rut || '';
  const email = (bd && (bd.mail || bd.email)) || dp.email || '';
  return { nombre, banco, codigoBanco, tipoCuenta, nCuenta, rut, email };
}
/* ════════════════════════════════════════════════════════════════════
   SANEO DE CAMPOS · NÓMINA OFFICE BANKING SANTANDER
   Santander valida cuentas y RUT como strings numéricos SIN separadores
   ni caracteres invisibles. Estas funciones se aplican SIEMPRE en la
   serialización a Excel (no como postproceso), para que cualquier origen
   del dato (tipeado, importado, copiado desde PDF/web/campo RTL) quede
   normalizado al exportar.
   ──────────────────────────────────────────────────────────────────── */
// Número de cuenta → solo dígitos [0-9]. El replace elimina de un saque
// guiones (incluido U+2011 NON-BREAKING HYPHEN), puntos, espacios y TODO
// carácter de formato/control Unicode (categoría Cf: U+202A LEFT-TO-RIGHT
// EMBEDDING, U+202C POP DIRECTIONAL FORMATTING, marcas RTL, etc.).
function _sanCuenta(v) {
  return String(v == null ? '' : v).replace(/[^0-9]/g, '');
}
// RUT → cuerpo + dígito verificador concatenados, sin puntos ni guión.
// Conserva el DV 'K' (RUT chileno) en mayúscula; descarta todo lo demás
// (incluidos los caracteres Cf invisibles).
function _sanRut(v) {
  return String(v == null ? '' : v).replace(/[^0-9kK]/g, '').toUpperCase();
}
// Código SBIF de Santander. RUT del beneficiario es obligatorio cuando el
// banco destino NO es Santander (regla del formato de pagos masivos).
const _COD_SANTANDER = '037';
function _esBancoSantander(cod) { return _sanCuenta(cod) === _COD_SANTANDER; }
function goExportSantander() {
  const pend = []; PROJECTS.forEach(p => goReembPend(p).forEach(m => pend.push({ project: p, m: m })));
  if (!pend.length) { showToast({ kind: 'warning', title: 'Sin reembolsos', body: 'No hay reembolsos pendientes para exportar.' }); return; }

  // Cuenta de ORIGEN (cuenta Santander de la empresa). Solo dígitos.
  let cuentaOrigen = (typeof EMPRESA_PERFIL !== 'undefined' && EMPRESA_PERFIL.bancoNumero) ? _sanCuenta(EMPRESA_PERFIL.bancoNumero) : '';
  if (!cuentaOrigen) {
    const v = window.prompt('N° de cuenta de ORIGEN (cuenta Santander de la empresa desde donde se transfiere):', '');
    if (v === null) return;
    cuentaOrigen = _sanCuenta(v);
    if (cuentaOrigen && typeof EMPRESA_PERFIL !== 'undefined') { EMPRESA_PERFIL.bancoNumero = cuentaOrigen; markDirty(); _dalPerfilSaveSoon(); }
  }
  if (!cuentaOrigen) { showToast({ kind: 'error', title: 'Falta cuenta de origen', body: 'Sin la cuenta de origen no se puede generar la nómina. Configúrala en el Perfil de empresa.' }); return; }

  const rows = []; const skipped = []; const faltaRut = [];
  pend.forEach(o => {
    const b = goSantanderBankFor(o.project, o.m);
    /* V11.4.0 · cuentas extranjeras NO entran a la nómina bancaria (el
       formato de pagos masivos no las soporta): se omiten con aviso al CFO. */
    const _pl = (typeof BD_PERSONAS !== 'undefined' && BD_PERSONAS[b.nombre]) || {};
    if (_pl.cuentaExtranjera || b.cuentaExtranjera) { skipped.push((b.nombre || '(sin nombre)') + ' (CUENTA EXTRANJERA: transferir por banca internacional)'); return; }
    const cuentaDestino = _sanCuenta(b.nCuenta);
    if (!cuentaDestino) { skipped.push(b.nombre || '(sin nombre)'); return; }
    const codigoBanco = _sanCuenta(b.codigoBanco);
    const rut = _sanRut(b.rut);   // cuerpo + DV concatenados, sin puntos ni guión
    // RUT obligatorio si el banco destino NO es Santander: abortar antes de generar.
    if (!_esBancoSantander(codigoBanco) && !rut) { faltaRut.push(b.nombre || '(sin nombre)'); return; }
    const glosa = ('Reembolso ' + goProjName(o.project)).slice(0, 40);
    rows.push([
      cuentaOrigen, 'CLP', cuentaDestino, 'CLP',
      codigoBanco, rut, b.nombre || '',
      o.m.monto || 0, glosa, b.email || '', '', glosa, ''
    ]);
  });
  if (faltaRut.length) { showToast({ kind: 'error', title: 'Falta RUT de beneficiario', body: 'El RUT es obligatorio cuando el banco destino no es Santander. Completa el RUT en la Base de Datos de: ' + faltaRut.join(', ') + '. No se generó el archivo.' }); return; }
  if (!rows.length) { showToast({ kind: 'error', title: 'Sin datos bancarios', body: 'Ningún reembolso pendiente tiene cuenta de destino. Completa los datos de pago de los beneficiarios en la Base de Datos.' }); return; }

  const header = [
    'Cuenta origen\n(obligatorio)',
    'Moneda origen\n(obligatorio)',
    'Cuenta destino\n(obligatorio)',
    'Moneda destino\n(obligatorio)',
    'Código banco destino\n(obligatorio solo si banco destino no es Santander)',
    'RUT beneficiario\n(obligatorio solo si banco destino no es Santander)',
    'Nombre beneficiario\n(obligatorio solo si banco destino no es Santander)',
    'Monto transferencia\n(obligatorio)',
    'Glosa personalizada transferencia\n(opcional)',
    'Correo beneficiario\n(opcional)',
    'Mensaje correo beneficiario\n(opcional)',
    'Glosa cartola originador\n(opcional)',
    'Glosa cartola beneficiario\n(opcional, solo aplica si cuenta destino es Santander)'
  ];
  try {
    if (typeof XLSX === 'undefined') throw new Error('SheetJS no disponible');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header].concat(rows));
    XLSX.utils.book_append_sheet(wb, ws, 'Transferencias');
    XLSX.writeFile(wb, 'Transferencias Santander - ' + goToday() + '.xlsx');
    let body = rows.length + ' transferencia(s) en el archivo.';
    if (skipped.length) body += ' ⚠ Omitidos por falta de cuenta de destino: ' + skipped.join(', ') + '. Completa sus datos de pago y vuelve a exportar.';
    showToast({ kind: skipped.length ? 'warning' : 'success', title: 'Nómina Santander generada', body: body });
  } catch (e) {
    showToast({ kind: 'error', title: 'No se pudo generar', body: 'La descarga necesita la librería de planillas (SheetJS). Revisa tu conexión y reintenta.' });
  }
}
/* ════════════════════════════════════════════════════════════════════
   V8.5.1 · PAGOS PENDIENTES · PRONTOS PAGOS
   Los prontos pagos se derivan del Presupuesto: filas confirmadas marcadas
   con Pronto Pago (PP), agregadas por persona y proyecto. Se transfieren con
   el mismo formato Office Banking de Santander (13 columnas) que los reembolsos.
   ════════════════════════════════════════════════════════════════════ */
function goPPPend() {
  // El monto a transferir es el NETO del COSTO REAL según el DTE REAL (misma
  // lógica tributaria que los contratos: boleta retiene, factura no), NUNCA el
  // cotizado. Si una fila aún no tiene costo real, queda como Proforma.
  const out = [];
  PROJECTS.forEach(p => {
    const d = p.data || {}; const byName = {};
    const add = (nombre, costoReal, dteReal, dte) => {
      if (!nombre) return;
      if (!byName[nombre]) byName[nombre] = { monto: 0, conReal: 0, sinReal: 0 };
      const real = Number(costoReal) || 0;
      if (real > 0) {
        const dteR = (dteReal != null && dteReal !== '') ? dteReal : dte;
        byName[nombre].monto += montoNetoDesde(real, dteR);
        byName[nombre].conReal++;
      } else { byName[nombre].sinReal++; }
    };
    for (const dept in (d.servicios || {})) (d.servicios[dept] || []).forEach(r => { if (r.confirmado && r.prontoPago && r.nombre) add(r.nombre, r.costoReal, r.dteReal, r.dte); });
    ['gastos', 'equipos', 'talentos'].forEach(sec => (d[sec] || []).forEach(r => { if (r.confirmado && r.prontoPago && r.nombre) add(r.nombre, r.costoReal, r.dteReal, r.dte); }));
    Object.keys(byName).forEach(n => { const e = byName[n]; out.push({ project: p, nombre: n, monto: e.monto, tieneReal: e.conReal > 0, completo: e.sinReal === 0 }); });
  });
  return out;
}
function _ppRodajeFechasISO(project) { return (((project || {}).data || {}).rodajes || []).filter(x => x.activo && x.fecha).map(x => x.fecha).sort(); }
function _ppRodajeFechasStr(project) { return (((project || {}).data || {}).rodajes || []).filter(x => x.activo && x.fecha).map(x => _fechaCorta(x.fecha)).join(', '); }
function _ppPagos(project) { if (!project.data.ppPagos) project.data.ppPagos = {}; return project.data.ppPagos; }
function goSetPPFechaPago(projId, nombre, v) { const p = PROJECTS.find(x => x.id === projId); if (!p) return; const m = _ppPagos(p); if (!m[nombre]) m[nombre] = {}; m[nombre].fechaPago = v || ''; markDirty(); renderCFO(); }
/* #12 · ¿este pronto pago ya está marcado como pagado? (tiene fechaPago guardada) */
function _ppPagado(o) { return !!((_ppPagos(o.project)[o.nombre] || {}).fechaPago); }
/* #12 · marcar un pronto pago como pagado: lee la fecha del input (default hoy). */
function goPagarPP(projId, nombre, inpId) {
  const inp = inpId && document.getElementById(inpId);
  const fecha = (inp && inp.value) || goToday();
  goSetPPFechaPago(projId, nombre, fecha);   // ya hace markDirty + renderCFO
  showToast({ kind: 'success', title: 'Pronto pago pagado', body: 'Pagado el ' + fecha + '.' });
}
const _SANTANDER_HEADER = [
  'Cuenta origen\n(obligatorio)', 'Moneda origen\n(obligatorio)', 'Cuenta destino\n(obligatorio)', 'Moneda destino\n(obligatorio)',
  'Código banco destino\n(obligatorio solo si banco destino no es Santander)', 'RUT beneficiario\n(obligatorio solo si banco destino no es Santander)',
  'Nombre beneficiario\n(obligatorio solo si banco destino no es Santander)', 'Monto transferencia\n(obligatorio)',
  'Glosa personalizada transferencia\n(opcional)', 'Correo beneficiario\n(opcional)', 'Mensaje correo beneficiario\n(opcional)',
  'Glosa cartola originador\n(opcional)', 'Glosa cartola beneficiario\n(opcional, solo aplica si cuenta destino es Santander)'
];
function _santanderOrigin() {
  let cuentaOrigen = (typeof EMPRESA_PERFIL !== 'undefined' && EMPRESA_PERFIL.bancoNumero) ? _sanCuenta(EMPRESA_PERFIL.bancoNumero) : '';
  if (!cuentaOrigen) {
    const v = window.prompt('N° de cuenta de ORIGEN (cuenta Santander de la empresa desde donde se transfiere):', '');
    if (v === null) return null;
    cuentaOrigen = _sanCuenta(v);
    if (cuentaOrigen && typeof EMPRESA_PERFIL !== 'undefined') { EMPRESA_PERFIL.bancoNumero = cuentaOrigen; markDirty(); _dalPerfilSaveSoon(); }
  }
  if (!cuentaOrigen) { showToast({ kind: 'error', title: 'Falta cuenta de origen', body: 'Sin la cuenta de origen no se puede generar la nómina. Configúrala en el Perfil de empresa.' }); return null; }
  return cuentaOrigen;
}
function _santanderExport(items, fname, label) {
  if (!items.length) { showToast({ kind: 'warning', title: 'Sin ' + label, body: 'No hay ' + label + ' para exportar.' }); return; }
  const cuentaOrigen = _santanderOrigin(); if (cuentaOrigen === null) return;
  const rows = []; const skipped = []; const faltaRut = [];
  items.forEach(o => {
    const b = goSantanderBankFor(o.project, o.mov || { quien: o.nombre, datosPago: {} });
    const cuentaDestino = _sanCuenta(b.nCuenta);
    if (!cuentaDestino) { skipped.push(b.nombre || '(sin nombre)'); return; }
    const codigoBanco = _sanCuenta(b.codigoBanco);
    const rut = _sanRut(b.rut);
    // RUT obligatorio si el banco destino NO es Santander: abortar antes de generar.
    if (!_esBancoSantander(codigoBanco) && !rut) { faltaRut.push(b.nombre || '(sin nombre)'); return; }
    const glosa = ((o.glosaPrefix || 'Pago') + ' ' + goProjName(o.project)).slice(0, 40);
    rows.push([cuentaOrigen, 'CLP', cuentaDestino, 'CLP', codigoBanco, rut, b.nombre || '', o.monto || 0, glosa, b.email || '', '', glosa, '']);
  });
  if (faltaRut.length) { showToast({ kind: 'error', title: 'Falta RUT de beneficiario', body: 'El RUT es obligatorio cuando el banco destino no es Santander. Completa el RUT en la Base de Datos de: ' + faltaRut.join(', ') + '. No se generó el archivo.' }); return; }
  if (!rows.length) { showToast({ kind: 'error', title: 'Sin datos bancarios', body: 'Ninguno tiene cuenta de destino. Completa los datos de pago de los beneficiarios en la Base de Datos.' }); return; }
  try {
    if (typeof XLSX === 'undefined') throw new Error('SheetJS no disponible');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([_SANTANDER_HEADER].concat(rows));
    XLSX.utils.book_append_sheet(wb, ws, 'Transferencias');
    XLSX.writeFile(wb, fname);
    let body = rows.length + ' transferencia(s) en el archivo.';
    if (skipped.length) body += ' \u26a0 Omitidos por falta de cuenta de destino: ' + skipped.join(', ') + '. Completa sus datos de pago y vuelve a exportar.';
    showToast({ kind: skipped.length ? 'warning' : 'success', title: 'Nómina Santander generada', body: body });
  } catch (e) {
    showToast({ kind: 'error', title: 'No se pudo generar', body: 'La descarga necesita la librería de planillas (SheetJS). Revisa tu conexión y reintenta.' });
  }
}
function goExportSantanderPP() {
  const items = goPPPend().filter(o => o.tieneReal && !_ppPagado(o)).map(o => ({ project: o.project, nombre: o.nombre, monto: o.monto, glosaPrefix: 'Pronto pago' }));
  _santanderExport(items, 'Prontos Pagos Santander - ' + goToday() + '.xlsx', 'prontos pagos');
}
function goExportSantanderConsolidado() {
  const items = [];
  PROJECTS.forEach(p => goReembPend(p).forEach(m => items.push({ project: p, nombre: m.quien, monto: m.monto, glosaPrefix: 'Reembolso', mov: m })));
  goPPPend().filter(o => o.tieneReal && !_ppPagado(o)).forEach(o => items.push({ project: o.project, nombre: o.nombre, monto: o.monto, glosaPrefix: 'Pronto pago' }));
  _santanderExport(items, 'Pagos Pendientes Santander - ' + goToday() + '.xlsx', 'pagos pendientes');
}
/* #13 · export de la nómina Santander SOLO de un proyecto (prontos pagos pendientes con costo real). */
function goExportSantanderPPProyecto(projId) {
  const p = PROJECTS.find(x => x.id === projId); if (!p) return;
  const items = goPPPend().filter(o => o.project.id === projId && o.tieneReal && !_ppPagado(o))
    .map(o => ({ project: o.project, nombre: o.nombre, monto: o.monto, glosaPrefix: 'Pronto pago' }));
  _santanderExport(items, 'Prontos Pagos ' + goProjName(p) + ' - ' + goToday() + '.xlsx', 'prontos pagos de ' + goProjName(p));
}
function goCfoProntosPagos() {
  const pp = goPPPend();
  const pend = pp.filter(o => !_ppPagado(o));
  const pagados = pp.filter(_ppPagado);

  /* argumentos (proyecto, nombre) escapados para los onclick/onchange */
  const ppArgs = o => '\'' + escapeHtml(o.project.id) + '\',\'' + escapeHtml(o.nombre).replace(/'/g, "\\'") + '\'';
  const montoCellOf = o => o.tieneReal
    ? (fmtMoney(o.monto) + (o.completo ? '' : '<div class="go-sub" data-tip="Algunas filas de esta persona aún no tienen costo real; el monto es parcial.">parcial · faltan costos reales</div>'))
    : '<span class="go-proforma" data-tip="Aún no hay costo real ingresado. El monto se calcula desde el costo real y su DTE real, no desde el cotizado.">Proforma</span>';
  const datosEstado = o => {
    const b = goSantanderBankFor(o.project, { quien: o.nombre, datosPago: {} });
    const tieneCuenta = !!_sanCuenta(b.nCuenta);
    const faltaRut = !_esBancoSantander(b.codigoBanco) && !_sanRut(b.rut);
    const _f = []; if (!tieneCuenta) _f.push('falta cuenta'); if (faltaRut) _f.push('falta RUT');
    const html = _f.length
      ? '<span class="go-est en_observacion" data-tip="El RUT es obligatorio cuando el banco destino no es Santander.">' + _f.join(' · ') + '</span>'
      : '<span class="go-est validado">✓ datos OK</span>';
    return { banco: b.banco, html: html };
  };

  let _idx = 0;
  /* fila PENDIENTE (dentro de la subsección de un proyecto: sin columna proyecto) */
  const pendRow = o => {
    const d = datosEstado(o);
    const fechasRod = _ppRodajeFechasStr(o.project);
    const inpId = 'ppd_' + (_idx++);
    return '<tr>' +
      '<td><b>' + escapeHtml(o.nombre) + '</b><div class="go-sub">' + escapeHtml(d.banco || 'sin banco en BD') + '</div></td>' +
      '<td class="go-num">' + montoCellOf(o) + '</td>' +
      '<td class="go-sub">' + (fechasRod ? escapeHtml(fechasRod) : '<span class="go-faint">sin fecha</span>') + '</td>' +
      '<td>' + d.html + '</td>' +
      '<td style="white-space:nowrap;"><input type="date" class="go-dateinp" id="' + inpId + '" value="' + goToday() + '"> ' +
        '<button class="btn btn-secondary btn-sm go-btn-pos" onclick="goPagarPP(' + ppArgs(o) + ',\'' + inpId + '\')">Marcar pagado</button></td>' +
      '</tr>';
  };
  /* fila PAGADA (bloque global: con proyecto + alerta si se pagó antes del rodaje) */
  const pagRow = o => {
    const pago = (_ppPagos(o.project)[o.nombre] || {}).fechaPago || '';
    const minRod = _ppRodajeFechasISO(o.project)[0] || '';
    const alerta = (pago && minRod && pago < minRod) ? ' <span class="go-paybadge venc" data-tip="La fecha de pago es ANTES del rodaje. No transfieras antes de que la persona trabaje.">⚠ antes del rodaje</span>' : '';
    return '<tr>' +
      '<td style="white-space:nowrap;"><input type="date" class="go-dateinp" value="' + escapeHtml(pago) + '" onchange="goSetPPFechaPago(' + ppArgs(o) + ',this.value)">' + alerta + '</td>' +
      '<td><b>' + escapeHtml(o.nombre) + '</b></td>' +
      '<td class="go-sub">' + escapeHtml(goProjName(o.project)) + '</td>' +
      '<td class="go-num">' + montoCellOf(o) + '</td>' +
      '<td><button class="go-mini" onclick="goSetPPFechaPago(' + ppArgs(o) + ',\'\')">deshacer</button></td>' +
      '</tr>';
  };

  /* #13 · agrupar los pendientes por proyecto (subsecciones) */
  const byProj = {};
  pend.forEach(o => { const k = o.project.id; (byProj[k] = byProj[k] || { project: o.project, items: [] }).items.push(o); });
  const projKeys = Object.keys(byProj);

  const head = '<div class="go-card"><div class="go-card-h"><h3>Prontos pagos pendientes <span class="go-faint">· filas del Presupuesto marcadas con PP (confirmadas) · separados por proyecto · monto = neto del costo real según DTE real</span></h3>' +
    (pend.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-secondary btn-sm" onclick="goExportSantanderPP()">⬇ Exportar TODOS (Santander)</button><button class="btn btn-secondary btn-sm" onclick="goExportSantanderConsolidado()">⬇ Consolidado (reembolsos + prontos pagos)</button></div>' : '') + '</div>' +
    '<div class="go-card-b"><div class="go-help" style="margin:0;">El <b>monto neto</b> sale del costo real de cada fila y su DTE real (boleta retiene; factura no), no del cotizado. <b>Proforma</b> = aún sin costo real (no se exporta). Cada proyecto tiene su propio botón para exportar la nómina Santander solo de ese proyecto. Revisa la <b>fecha de rodaje</b>: no transfieras antes de que la persona trabaje.</div></div></div>';

  const thead = '<thead><tr><th>A quién pagar</th><th class="go-num">Monto neto</th><th>Fecha de rodaje</th><th>Datos de transferencia</th><th>Marcar pagado</th></tr></thead>';
  const secciones = projKeys.length ? projKeys.map(k => {
    const g = byProj[k];
    return '<div class="go-card"><div class="go-card-h"><h3 class="go-sm">' + escapeHtml(goProjName(g.project)) + ' <span class="go-faint">· ' + g.items.length + ' por pagar</span></h3>' +
      '<button class="btn btn-secondary btn-sm" onclick="goExportSantanderPPProyecto(\'' + escapeHtml(g.project.id) + '\')">⬇ Exportar Santander de este proyecto</button></div>' +
      '<div class="go-card-b go-tablewrap"><table class="go-tbl">' + thead + '<tbody>' + g.items.map(pendRow).join('') + '</tbody></table></div></div>';
  }).join('') : '<div class="go-card"><div class="go-card-b go-faint" style="padding:18px;">Sin prontos pagos pendientes. Marca la píldora <b>PP</b> en las filas del Presupuesto (confirmadas) para que aparezcan aquí.</div></div>';

  const pagBlock = pagados.length ? '<div class="go-card"><div class="go-card-h"><h3 class="go-sm">Pagados <span class="go-faint">· fecha editable · para conciliar</span></h3></div>' +
    '<div class="go-card-b go-tablewrap"><table class="go-tbl"><thead><tr><th>Fecha pago</th><th>A quién</th><th>Proyecto</th><th class="go-num">Monto neto</th><th></th></tr></thead><tbody>' +
    pagados.map(pagRow).join('') + '</tbody></table></div></div>' : '';

  return head + secciones + pagBlock;
}
function goCfoProyectos() {
  const expandido = GO_STATE.cfoProyVal || null;
  const rows = PROJECTS.length ? PROJECTS.map(p => {
    const gs = goMovs(p); const real = gs.reduce((s, m) => s + (m.monto || 0), 0);
    const cot = goCotizadoTotal(p); const pv = gs.filter(goNeedsAction).length; const disp = cot - real;
    const val = gs.filter(m => m.estado === 'validado');
    const abierto = expandido === p.id;
    let tr = `<tr><td><b>${escapeHtml(goProjName(p))}</b><div class="go-sub">${escapeHtml(goProjCliente(p))}</div></td><td class="go-num">${fmtMoney(cot)}</td><td class="go-num">${fmtMoney(real)}</td>` +
      `<td class="go-num" style="${disp < 0 ? 'color:var(--accent-deep)' : ''}">${fmtMoney(disp)}</td><td class="go-num">${gs.length}</td><td class="go-num">${pv || '—'}</td>` +
      `<td>${val.length ? `<button class="btn btn-secondary btn-sm" onclick="goToggleProyVal('${p.id}')">${abierto ? 'Ocultar' : ('Ver validados (' + val.length + ')')}</button>` : '<span class="go-faint">—</span>'}</td></tr>`;
    if (abierto && val.length) {
      const sub = val.map(m => {
        const e = goPresById(p, m.pres);
        const comp = goCompCell(m, 'goCfoVer', 'falta');
        return `<tr><td class="go-sub">${escapeHtml((m.fecha || '').slice(5))}</td><td><span class="go-tag">${escapeHtml(e ? e.nombre : '—')}</span></td><td>${escapeHtml(m.concepto || '')}<div class="go-sub">${escapeHtml(m.prov || '')}</div></td><td>${escapeHtml(m.quien || '')}</td><td class="go-num">${fmtMoney(m.monto || 0)}</td><td>${comp}</td></tr>`;
      }).join('');
      tr += `<tr><td colspan="7" style="padding:0;"><div style="padding:6px 12px 14px;border-left:3px solid var(--accent);background:rgba(0,0,0,.02);"><div class="go-sub" style="margin:6px 0 8px;font-weight:600;">Gastos validados de ${escapeHtml(goProjName(p))} · descarga el comprobante o revisa el detalle sin entrar al proyecto</div>` +
        `<table class="go-tbl"><thead><tr><th>Fecha</th><th>Presupuesto</th><th>Concepto</th><th>Quién gastó</th><th class="go-num">Monto</th><th>Comprobante</th></tr></thead><tbody>${sub}</tbody></table></div></td></tr>`;
    }
    return tr;
  }).join('') : '<tr><td colspan="7" class="go-faint" style="padding:18px;">No hay proyectos todavía.</td></tr>';
  return `<div class="go-card"><div class="go-card-h"><h3>Resumen por proyecto <span class="go-faint">· abre “Ver validados” para revisar los gastos ya validados y sus comprobantes, sin entrar al proyecto</span></h3></div><div class="go-card-b go-tablewrap">` +
    `<table class="go-tbl"><thead><tr><th>Proyecto</th><th class="go-num">Cotizado</th><th class="go-num">Real</th><th class="go-num">Disponible</th><th class="go-num"># gastos</th><th class="go-num">Por validar</th><th>Validados</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function goToggleProyVal(projId) { GO_STATE.cfoProyVal = (GO_STATE.cfoProyVal === projId) ? null : projId; renderCFO(); }
function goCfoExportPanel() {
  return `<div class="go-card"><div class="go-card-b">
    <div class="go-sectitle">Exportar a Chipax · consolidado</div>
    <p class="go-muted" style="font-size:12.5px;margin-top:0;">Genera el .xlsx de importación masiva con los gastos <b>validados</b> de todos los proyectos.</p>
    <button class="btn btn-primary" onclick="goOpenExport(null)">⬇ Preparar exportación consolidada</button>
    <span class="btn btn-secondary" onclick="goOpenMapeo()" style="margin-left:8px;cursor:pointer;">⚙ Editar mapeo de cuentas</span>
    <div class="go-help" style="margin-top:10px;">También puedes exportar un proyecto individual desde su Vista de Gastos. Máx. 100 registros por archivo; si hay más, se generan varios lotes.</div>
  </div></div>`;
}

/* ---------- acciones CFO ---------- */
function goValidar(id) { const r = goFindMov(id); if (r) { r.m.estado = 'validado'; markDirty(); renderCFO(); showToast({ kind: 'success', title: 'Gasto validado', body: 'Listo para exportar a Chipax.' }); } }
/* ── Hilo de "Observar" un gasto (gasto_comments · PR8) ────────────────────────
   Antes la observación era un único campo (m.coment) que rendidor y CFO se
   pisaban por turnos. Ahora es un HILO: lista de mensajes {autor, texto, ts} por
   gasto, en project.data.gastoComments (plano, con gastoId), espejo de la tabla
   gasto_comments del backend. m.coment se conserva como "nota del registro"
   (legado / nota del rendidor) y se muestra como primer globo del hilo. */
function goComentarios(project) {
  if (!project) return [];
  if (!Array.isArray(project.data.gastoComments)) project.data.gastoComments = [];
  return project.data.gastoComments;
}
function goHiloDe(project, gastoId) {
  return goComentarios(project).filter(function(c){ return c.gastoId === gastoId; });
}
function goPushComentario(project, gastoId, texto) {
  const t = (texto || '').trim(); if (!t || !project) return false;
  goComentarios(project).push({ id: goNewId('gcm'), gastoId: gastoId, autor: currentUser(), texto: t, ts: new Date().toLocaleString('es-CL') });
  return true;
}
/* Indicador para la celda del registro / cola CFO: nota del rendidor + nº de comentarios. */
function goComentCell(project, x) {
  let out = '';
  if (x && x.coment) out += '<div class="go-coment">💬 ' + escapeHtml(x.coment) + '</div>';
  const n = project ? goHiloDe(project, x.id).length : 0;
  if (n) out += '<div class="go-coment go-coment-hilo">🧵 ' + n + (n === 1 ? ' comentario' : ' comentarios') + '</div>';
  return out;
}
/* Globos del hilo para el modal (nota del rendidor primero, luego la conversación). */
function _goHiloHTML(project, x) {
  let html = '';
  if (x && x.coment) {
    html += '<div class="go-hilo-msg go-hilo-nota"><div class="go-hilo-meta">Nota del registro</div><div class="go-hilo-txt">' + escapeHtml(x.coment) + '</div></div>';
  }
  goHiloDe(project, x.id).forEach(function(c){
    html += '<div class="go-hilo-msg"><div class="go-hilo-meta"><b>' + escapeHtml(c.autor || '—') + '</b> · ' + escapeHtml(c.ts || '') + '</div><div class="go-hilo-txt">' + escapeHtml(c.texto || '') + '</div></div>';
  });
  if (!html) html = '<div class="go-faint" style="padding:8px 2px;">Aún no hay comentarios. Escribe el primero abajo.</div>';
  return '<div class="go-hilo">' + html + '</div>';
}
function _goAbrirHilo(project, m, esObservar) {
  if (!project || !m) return;
  showModal({
    title: esObservar ? 'Observar gasto · comentar' : 'Conversación del gasto',
    body: _goHiloHTML(project, m)
        + '<p style="margin:12px 0 6px;font-size:12.5px;color:var(--ink-secondary);line-height:1.5;">'
        + (esObservar ? 'Deja un comentario: qué hay que revisar o corregir.' : 'Responde al hilo.')
        + '</p><textarea class="input" id="goObsNota" rows="3" placeholder="Escribe un comentario…"></textarea>',
    confirmLabel: esObservar ? 'Comentar y observar' : 'Enviar',
    cancelLabel: 'Cerrar',
    onConfirm: function () {
      var nota = ((document.getElementById('goObsNota') || {}).value || '').trim();
      var hubo = nota ? goPushComentario(project, m.id, nota) : false;
      if (esObservar) m.estado = 'en_observacion';
      if (!hubo && !esObservar) return;                         // responder vacío: nada que hacer
      markDirty();
      if (typeof dalTouchProyecto === 'function') dalTouchProyecto(project);   // persiste ESTE proyecto (el CFO es vista global)
      if (STATE.currentModule === 'cfo') { try { renderCFO(); } catch (e) {} }
      else { try { renderGastos(); } catch (e) {} }
      if (esObservar) showToast({ kind: 'warning', title: 'Marcado en observación', body: hubo ? 'El equipo verá tu comentario.' : 'Gasto en observación.' });
      else if (hubo) showToast({ kind: 'info', title: 'Comentario agregado', body: 'Tu respuesta quedó en el hilo.' });
    }
  });
}
function goObservar(id) {
  const r = goFindMov(id); if (!r) return;
  _goAbrirHilo(r.project, r.m, true);
}
function goResponderHilo(id) {
  const r = goFindMov(id); if (!r) return;
  _goAbrirHilo(r.project, r.m, false);
}
function goCfoVer(id) { const r = goFindMov(id); if (!r) return; const prev = STATE.currentProject; STATE.currentProject = r.project; goVerComprobante(id); STATE.currentProject = prev; }
function goPagarReemb(id) { const r = goFindMov(id); if (!r) return; const inp = document.getElementById('rp_' + id); r.m.fechaPago = (inp && inp.value) || goToday(); markDirty(); renderCFO(); showToast({ kind: 'success', title: 'Reembolso pagado', body: 'Pagado el ' + r.m.fechaPago + '.' }); }
function goPagarTodos() { const d = goToday(); PROJECTS.forEach(p => goReembPend(p).forEach(m => m.fechaPago = d)); markDirty(); renderCFO(); showToast({ kind: 'success', title: 'Lote pagado', body: 'Fecha editable después para conciliar.' }); }
function goSetFechaPago(id, v) { const r = goFindMov(id); if (r) { r.m.fechaPago = v || null; markDirty(); renderCFO(); } }
function goSetObjetivo(id, v) { const r = goFindMov(id); if (r) { r.m.objetivo = v || null; markDirty(); } }

/* ---------- editor de mapeo de cuentas Chipax ---------- */
function goOpenMapeo() {
  const lineas = Object.keys(CHIPAX_CUENTA);
  goModal(`<div class="go-mc"><div class="go-mh"><h3>Mapeo línea → cuenta Chipax</h3><button class="go-x" onclick="closeModal()">×</button></div>
    <div class="go-mb"><p class="go-help" style="margin-top:0;">Edita la cuenta de Chipax a la que se asigna cada línea. Se guarda con el OS.</p>
      ${lineas.map(l => `<div class="go-frow" style="align-items:center;margin-bottom:8px;"><div style="width:160px;font-size:12.5px;">${escapeHtml(l)}</div><input class="go-inp" id="cx_${escapeHtml(l).replace(/[^a-zA-Z]/g, '')}" data-linea="${escapeHtml(l)}" value="${escapeHtml(CHIPAX_CUENTA[l])}" style="flex:1;"></div>`).join('')}
    </div>
    <div class="go-mf"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="goSaveMapeo()">Guardar mapeo</button></div></div>`);
}
function goSaveMapeo() {
  document.querySelectorAll('#modalRoot [data-linea]').forEach(inp => { const l = inp.getAttribute('data-linea'); if (l) CHIPAX_CUENTA[l] = inp.value.trim() || CHIPAX_CUENTA[l]; });
  try { if (typeof EMPRESA_PERFIL !== 'undefined') { EMPRESA_PERFIL.chipaxCuentas = Object.assign({}, CHIPAX_CUENTA); } } catch (e) {}
  markDirty(); _dalPerfilSaveSoon(); closeModal(); showToast({ kind: 'success', title: 'Mapeo guardado', body: 'Las próximas exportaciones lo usan.' });
}

/* ════════════════════════════════════════════════════════════════════
   EXPORT CHIPAX
   ════════════════════════════════════════════════════════════════════ */
function goChipaxRows(projId) {
  let src = goAllMovs().filter(o => o.m.estado === 'validado');
  if (projId) src = src.filter(o => o.project.id === projId);
  return src.map(o => {
    const x = o.m; const linea = goLineaOf(o.project, x); const e = goPresById(o.project, x.pres);
    return {
      Fecha: x.fecha, Periodo: (x.fecha || '').slice(0, 7), Cuenta: goCuentaChipax(linea),
      Linea: goLineaNegocio(o.project), Responsable: e ? e.resp : x.registra, TipoDoc: goTipoChipax(x.tipo),
      Proveedor: x.prov, NumDoc: '', Descripcion: x.concepto, Monto: x.monto, Moneda: 'CLP'
    };
  });
}
function goOpenExport(projId) {
  const project = projId ? PROJECTS.find(p => p.id === projId) : null;
  const rows = goChipaxRows(projId);
  const title = project ? ('Exportar a Chipax · ' + goProjName(project)) : 'Exportar a Chipax · consolidado (todos los proyectos)';
  const lotes = Math.ceil(rows.length / 100) || 1;
  const body = rows.length ? rows.map(r => `<tr><td>${escapeHtml(r.Fecha)}</td><td>${escapeHtml(r.Periodo)}</td><td class="go-cuenta">${escapeHtml(r.Cuenta)}</td><td>${escapeHtml(r.Linea)}</td><td>${escapeHtml(r.Responsable)}</td><td>${escapeHtml(r.TipoDoc)}</td><td>${escapeHtml(r.Proveedor)}</td><td></td><td>${escapeHtml(r.Descripcion)}</td><td class="go-num">${r.Monto}</td><td>${r.Moneda}</td></tr>`).join('') : '<tr><td colspan="11" class="go-faint" style="padding:18px;">No hay gastos validados para exportar. Valida gastos en la pestaña Validación de Finanzas.</td></tr>';
  goModal(`<div class="go-mc wide"><div class="go-mh"><h3>${escapeHtml(title)}</h3><button class="go-x" onclick="closeModal()">×</button></div>
    <div class="go-mb">
      <div class="go-expbar"><button class="btn btn-primary" onclick='goDescargarXlsx(${projId ? ('"' + projId + '"') : 'null'})' ${rows.length ? '' : 'disabled'}>⬇ Descargar .xlsx</button>
        <span class="go-batchnote">${rows.length} gastos validados · ${lotes} ${lotes > 1 ? 'lotes de 100' : 'lote'} · formato de importación masiva de Chipax</span></div>
      <div class="go-help" style="margin-bottom:10px;">Solo gastos <b>validados</b>. <b>Línea de Negocio</b> = “${escapeHtml(project ? goLineaNegocio(project) : 'Proyecto de Cliente')}”. <b>Tipo Doc</b>: Factura/Exenta→Invoice · Boleta/Honorario→Boleta · Otro→Recibo. Montos sin formato.</div>
      <div class="go-expscroll"><table class="go-tbl"><thead><tr><th>Fecha</th><th>Periodo</th><th>Cuenta</th><th>Línea de Negocio</th><th>Responsable</th><th>Tipo Doc</th><th>Proveedor</th><th>N° Doc</th><th>Descripción</th><th class="go-num">Monto</th><th>Moneda</th></tr></thead><tbody>${body}</tbody></table></div>
    </div>
    <div class="go-mf"><button class="btn btn-secondary" onclick="closeModal()">Cerrar</button></div></div>`);
}
function goDescargarXlsx(projId) {
  const rows = goChipaxRows(projId);
  if (!rows.length) { showToast({ kind: 'warning', title: 'Nada que exportar', body: 'No hay gastos validados.' }); return; }
  const project = projId ? PROJECTS.find(p => p.id === projId) : null;
  const header = ['Fecha (AAAA-MM-DD) *', 'Periodo Clasificación (AAAA-MM) *', 'Cuenta *', 'Línea de Negocio *', 'Responsable *', 'Tipo de Documento *', 'Proveedor *', 'Número de Documento', 'Descripción *', 'Monto *', 'Moneda *'];
  const baseName = (project ? goProjName(project) : 'Consolidado') + ' · Chipax';
  try {
    if (typeof XLSX === 'undefined') throw new Error('SheetJS no disponible');
    const wb = XLSX.utils.book_new();
    const lotes = Math.ceil(rows.length / 100) || 1;
    for (let i = 0; i < lotes; i++) {
      const chunk = rows.slice(i * 100, i * 100 + 100);
      const aoa = [header].concat(chunk.map(r => [r.Fecha, r.Periodo, r.Cuenta, r.Linea, r.Responsable, r.TipoDoc, r.Proveedor, r.NumDoc, r.Descripcion, r.Monto, r.Moneda]));
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, lotes > 1 ? ('Lote ' + (i + 1)) : 'Gastos Chipax');
    }
    XLSX.writeFile(wb, baseName + '.xlsx');
    showToast({ kind: 'success', title: 'Archivo generado', body: baseName + '.xlsx (' + rows.length + ' gastos).' });
  } catch (e) {
    showToast({ kind: 'error', title: 'No se pudo generar', body: 'La descarga necesita SheetJS. El preview ya muestra el formato exacto.' });
  }
}

/* ════════════════════════════════════════════════════════════════════
   WIRING: conectar al sistema de módulos de TakeOS
   ════════════════════════════════════════════════════════════════════ */
(function goWire() {
  try {
    // merge mapeo persistido (si existe en EMPRESA_PERFIL)
    if (typeof EMPRESA_PERFIL !== 'undefined' && EMPRESA_PERFIL.chipaxCuentas) Object.assign(CHIPAX_CUENTA, EMPRESA_PERFIL.chipaxCuentas);
  } catch (e) {}
  if (typeof MODULES !== 'undefined') {
    if (MODULES['gastos']) {
      MODULES['gastos'].render = renderGastos;
      MODULES['gastos'].layer = 'Implementado · V8 (rastreador operativo + reconciliación)';
      MODULES['gastos'].subtitle = 'Bitácora operativa de gastos del proyecto: presupuestos, comprobantes y reconciliación. Reemplaza a Rinde Gastos.';
    }
    MODULES['cfo'] = {
      title: 'Finanzas',
      subtitle: 'Consolida los gastos de todos los proyectos: validar, reembolsos y exportar a Chipax.',
      eyebrow: 'Finanzas',
      layer: 'Implementado · V8',
      scope: 'global',
      render: renderCFO,
      description: 'Vista de Finanzas transversal a todos los proyectos. Cola de validación consolidada, reembolsos con avisos de vencimiento y exportación a Chipax (.xlsx).'
    };
  }
})();


// ── Window bridges Gastos/CFO ──────────────────────────────────────
// Lista generada cruzando definiciones con consumidores (index, módulos, HTML generado).
window._sanCuenta = _sanCuenta;
window._syncGastosCostoReal = _syncGastosCostoReal;
window._usaChipax = _usaChipax;
window.cfoGuardarPago = cfoGuardarPago;
window.cfoIrAPresupuesto = cfoIrAPresupuesto;
window.cfoRegistrarPago = cfoRegistrarPago;
window.goCajaDevolucion = goCajaDevolucion;
window.goCajaDevolucionSave = goCajaDevolucionSave;
window.goCajaHistorial = goCajaHistorial;
window.goCajaIngreso = goCajaIngreso;
window.goCajaIngresoSave = goCajaIngresoSave;
window.goCfoBody = goCfoBody;
window.goCfoProntosPagos = goCfoProntosPagos;
window.goCfoProyectos = goCfoProyectos;
window.goCfoReembolsos = goCfoReembolsos;
window.goCfoValidacion = goCfoValidacion;
window.goCheckPersona = goCheckPersona;
window.goComentCell = goComentCell;
window.goCuentaChipax = goCuentaChipax;
window.goDeleteGasto = goDeleteGasto;
window.goDescargarXlsx = goDescargarXlsx;
window.goExportSantander = goExportSantander;
window.goExportSantanderConsolidado = goExportSantanderConsolidado;
window.goExportSantanderPP = goExportSantanderPP;
window.goExportSantanderPPProyecto = goExportSantanderPPProyecto;
window.goGastoHint = goGastoHint;
window.goHiloDe = goHiloDe;
window.goLineaNegocio = goLineaNegocio;
window.goLineaRealGastado = goLineaRealGastado;
window.goLineaTieneCaja = goLineaTieneCaja;
window.goMarcarListo = goMarcarListo;
window.goMovs = goMovs;
window.goObservar = goObservar;
window.goOnFile = goOnFile;
window.goOnFileQ = goOnFileQ;
window.goOpenExport = goOpenExport;
window.goOpenGasto = goOpenGasto;
window.goOpenMapeo = goOpenMapeo;
window.goOpenPresup = goOpenPresup;
window.goOpenQuick = goOpenQuick;
window.goPagarPP = goPagarPP;
window.goPagarReemb = goPagarReemb;
window.goPagarTodos = goPagarTodos;
window.goPpLineaChange = goPpLineaChange;
window.goPresList = goPresList;
window.goProjCliente = goProjCliente;
window.goProjName = goProjName;
window.goRegFilter = goRegFilter;
window.goRegRows = goRegRows;
window.goRegSortBy = goRegSortBy;
window.goResponderHilo = goResponderHilo;
window.goRevertirPendiente = goRevertirPendiente;
window.goSaveGasto = goSaveGasto;
window.goSaveMapeo = goSaveMapeo;
window.goSavePresup = goSavePresup;
window.goSaveQuick = goSaveQuick;
window.goSetCfoTab = goSetCfoTab;
window.goSetFechaPago = goSetFechaPago;
window.goSetObjetivo = goSetObjetivo;
window.goSetPPFechaPago = goSetPPFechaPago;
window.goToday = goToday;
window.goToggleProyVal = goToggleProyVal;
window.goValidar = goValidar;
window.openGlobalCFO = openGlobalCFO;
window.renderCFO = renderCFO;
window.renderGastos = renderGastos;

// ── Bridges auditoría pre-B (nombres pasados como string a goCompCell → onclick generado) ──
window.goVerComprobante = goVerComprobante;
window.goCfoVer         = goCfoVer;
