// Calculadoras tributarias + Costo Real + Horas Extra — extraído de index.html (Etapa C1)
// El estado de las calculadoras (_calc*, _crc*, _he*) vive en window: los
// handlers inline del HTML generado lo ESCRIBEN directamente (onchange="window._calcTipo=...").

// D1a · imports reales. NO importar jamás (línea roja #1): IVA / FACTOR_BOLETA
// (window-props puros de rates.js, reasignados por dalBootTaxRates — importarlos
// congelaría las tasas tributarias en silencio).
import { escapeHtml, showToast } from '../lib/helpers.js';
import { STATE } from '../lib/state.js';
import { DTE_OPTIONS, dteTieneRetencion, factorRetencionDte, montoNetoDesde, montoBrutoDesde } from '../lib/data.js';
import { authNivel } from '../lib/auth.js';
import { fmtMoney, parseMoneyCLP, displayMoneyInputValue } from '../lib/calc.js';
import { closeModal } from '../lib/ui.js';
import { renderPresupuesto, renderServiciosBody, renderSimpleSection, updateRowField, _rowNoteItem, afterRowChange, recalcAllDeptSummaries, renderSummaryFin, recalcKPIs } from './presupuesto-cotizacion.js';
import { markDirty } from './persistencia-local.js';
import { _markRowDirty } from './info-proyecto.js';

import { registrarAcciones } from '../lib/delegacion.js';
/* ─── CALCULADORA TRIBUTARIA ────────────────────────────────────────
   Recuperada del Master Sheet V2.4.1 (M2:O9 de la pestaña PRESUPUESTO).
   Convierte entre líquido y bruto según tipo de documento.
   - BHE (Boleta de Honorarios): retención 15.25%.
     Líquido = bruto × (1 − 0.1525)
     Bruto   = líquido / (1 − 0.1525)
   - IVA 19% (Factura): el IVA es agregado.
     Neto = bruto / 1.19
     Bruto = neto × 1.19  */

window._calcMonto = 100000;
window._calcTipo = 'bhe';
window._calcModo = 'liquido';  // 'liquido' = el monto ingresado es líquido/neto. 'bruto' = el monto ingresado es bruto.

function openCalculadoraTributaria() {
  const root = document.getElementById('modalRoot');

  const renderBody = () => {
    let liquido, bruto, impuesto;
    if (window._calcTipo === 'bhe') {
      if (window._calcModo === 'liquido') {
        liquido = window._calcMonto;
        bruto = montoBrutoDesde(window._calcMonto, 'boleta');
      } else {
        bruto = window._calcMonto;
        liquido = montoNetoDesde(window._calcMonto, 'boleta');
      }
      impuesto = bruto - liquido;
    } else { // IVA
      if (window._calcModo === 'liquido') {
        liquido = window._calcMonto;  // neto
        bruto = window._calcMonto * (1 + IVA);
      } else {
        bruto = window._calcMonto;
        liquido = window._calcMonto / (1 + IVA);
      }
      impuesto = bruto - liquido;
    }

    return `
      <div class="calc-body">
        <div class="calc-row">
          <div class="field">
            <label class="field-label">Tipo de documento</label>
            <select class="select" data-accion="calc.tipo" data-on="change">
              <option value="bhe" ${window._calcTipo === 'bhe' ? 'selected' : ''}>Boleta de honorarios (15.25%)</option>
              <option value="iva" ${window._calcTipo === 'iva' ? 'selected' : ''}>Factura con IVA (19%)</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label">El monto ingresado es…</label>
            <select class="select" data-accion="calc.modo" data-on="change">
              <option value="liquido" ${window._calcModo === 'liquido' ? 'selected' : ''}>${window._calcTipo === 'bhe' ? 'Líquido (lo que recibe el proveedor)' : 'Neto (sin IVA)'}</option>
              <option value="bruto" ${window._calcModo === 'bruto' ? 'selected' : ''}>${window._calcTipo === 'bhe' ? 'Bruto (lo que paga la empresa)' : 'Bruto (con IVA)'}</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="field-label">Monto</label>
          <input type="text" inputmode="numeric" class="input num" id="calcMontoInput"
                 value="${window._calcMonto ? displayMoneyInputValue(window._calcMonto) : ''}" placeholder="0"
                 data-accion="calc.monto" data-on="input">
        </div>

        <div class="calc-output">
          <div class="calc-output-row">
            <span class="calc-output-label">${window._calcTipo === 'bhe' ? 'Líquido (proveedor recibe)' : 'Neto (sin IVA)'}</span>
            <strong id="calcOutLiquido">${fmtMoney(liquido)}</strong>
          </div>
          <div class="calc-output-row">
            <span class="calc-output-label">${window._calcTipo === 'bhe' ? 'Retención (15.25%)' : 'IVA (19%)'}</span>
            <strong id="calcOutImpuesto">${fmtMoney(impuesto)}</strong>
          </div>
          <div class="calc-output-row">
            <span class="calc-output-label">${window._calcTipo === 'bhe' ? 'Bruto (costo empresa)' : 'Bruto (con IVA)'}</span>
            <strong id="calcOutBruto">${fmtMoney(bruto)}</strong>
          </div>
        </div>

        <div class="calc-note">
          ${window._calcTipo === 'bhe'
            ? 'La retención del 15.25% es pagada por la empresa al SII por cuenta del proveedor. El líquido es lo que efectivamente recibe el proveedor en su cuenta.'
            : 'El IVA del 19% es recaudado por la empresa y pagado al SII. El neto es el monto que efectivamente percibe el proveedor.'}
        </div>
      </div>
    `;
  };

  root.innerHTML = `
    <div class="modal-backdrop" data-accion="ui.backdrop">
      <div class="modal" style="max-width: 540px;">
        <div class="modal-header">
          <div class="modal-title">Calculadora tributaria</div>
          <div style="font-size: 12px; color: var(--ink-muted);">Conversión entre líquido y bruto según DTE</div>
        </div>
        ${renderBody()}
        <div class="modal-footer">
          <button class="btn btn-primary" data-accion="ui.cerrar">Cerrar</button>
        </div>
      </div>
    </div>
  `;
  // Mantener foco en input al re-renderizar
  const input = document.getElementById('calcMontoInput');
  if (input) input.focus();
}

/* V6.9 — Update granular de la calculadora tributaria: solo recalcula
   y actualiza las celdas de output, SIN re-renderizar el modal entero
   (eso destruía el input en cada tecla y movía el cursor). */
function calcUpdate(raw) {
  window._calcMonto = parseMoneyCLP(raw) || 0;
  let liquido, bruto;
  if (window._calcTipo === 'bhe') {
    if (window._calcModo === 'liquido') { liquido = window._calcMonto; bruto = window._calcMonto / FACTOR_BOLETA; }
    else                          { bruto = window._calcMonto;   liquido = window._calcMonto * FACTOR_BOLETA; }
  } else {
    if (window._calcModo === 'liquido') { liquido = window._calcMonto; bruto = window._calcMonto * (1 + IVA); }
    else                          { bruto = window._calcMonto;   liquido = window._calcMonto / (1 + IVA); }
  }
  const impuesto = bruto - liquido;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmtMoney(v); };
  set('calcOutLiquido', liquido); set('calcOutImpuesto', impuesto); set('calcOutBruto', bruto);
}

/* ─── V9.6.17 · CALCULADORA DE COSTO REAL (por fila, DTE real fijo) ────────
   Doble clic en la celda de Costo Real abre esta calculadora, ya cargada con
   el DTE real de la fila y SIN poder cambiarlo, para que nadie ingrese el
   costo empresa mal. El usuario ingresa el monto que conoce (lo líquido que
   acordó pagar, o el neto de la factura) y el sistema calcula el COSTO EMPRESA
   (lo que se guarda en costoReal):
     · boleta (con retención): costo real = bruto = líquido / 0.8475
     · factura con IVA marcado: costo real = neto = monto / 1.19
     · factura/exenta/sin retención: costo real = monto (el IVA no es costo)
   Así el costo real queda alineado con la lógica tributaria central. */
function openCostoRealCalc(sectionKey, dept, idx) {
  if (authNivel('presupuesto') !== 'E') { showToast({ kind: 'info', title: 'Solo lectura', body: 'Tu perfil puede ver el presupuesto, pero no modificar el costo real.' }); return; }   // V10.5.1
  const item = _rowNoteItem(sectionKey, dept, idx);
  if (!item) return;
  const dte = item.dteReal || null;
  window._crc = { sectionKey: sectionKey, dept: dept, idx: idx, dte: dte, monto: 0, incluyeIVA: false };
  // semilla: si ya hay un costoReal, lo mostramos como punto de partida (en su forma de entrada)
  if (item.costoReal != null && item.costoReal !== '') {
    const cr = Number(item.costoReal) || 0;
    if (dteTieneRetencion(dte)) window._crc.monto = Math.round(cr * factorRetencionDte(dte));   // bruto guardado -> líquido de partida
    else window._crc.monto = cr;
  }
  renderCostoRealCalc();
}
function _crcDteLabel(dte) {
  if (!dte) return 'Sin DTE real';
  const o = (typeof DTE_OPTIONS !== 'undefined') ? DTE_OPTIONS.find(x => x.value === dte) : null;
  return o ? o.label : dte;
}
function _crcCostoReal() {
  const st = window._crc || {}; const m = Number(st.monto) || 0;
  if (!m) return 0;
  if (dteTieneRetencion(st.dte)) return Math.round(m / factorRetencionDte(st.dte));             // líquido -> bruto (costo empresa)
  if (st.dte === 'factura' && st.incluyeIVA) return Math.round(m / (1 + IVA));     // con IVA -> neto (costo empresa)
  return Math.round(m);                                                            // neto/exenta/sin dte
}
function renderCostoRealCalc() {
  const st = window._crc; if (!st) return;
  const item = _rowNoteItem(st.sectionKey, st.dept, st.idx) || {};
  const quien = item.nombre || item.rol || item.item || 'esta fila';
  const conReten = dteTieneRetencion(st.dte);
  const esFacturaIVA = (st.dte === 'factura');
  const costoReal = _crcCostoReal();
  const m = Number(st.monto) || 0;

  // etiqueta del input según DTE
  const inputLabel = conReten
    ? 'Monto líquido (lo que recibe el proveedor)'
    : (esFacturaIVA ? 'Monto de la factura' : 'Monto');

  // desglose de salida
  let breakdown = '';
  if (conReten) {
    breakdown = `
      <div class="calc-output-row"><span class="calc-output-label">Líquido (proveedor recibe)</span><strong>${fmtMoney(m)}</strong></div>
      <div class="calc-output-row"><span class="calc-output-label">Retención (15.25%)</span><strong>${fmtMoney(costoReal - m)}</strong></div>
      <div class="calc-output-row" style="border-top:1px solid var(--rule);padding-top:6px;margin-top:2px;"><span class="calc-output-label" style="font-weight:700;">Costo empresa (costo real)</span><strong style="color:var(--accent);">${fmtMoney(costoReal)}</strong></div>`;
  } else if (esFacturaIVA && st.incluyeIVA) {
    breakdown = `
      <div class="calc-output-row"><span class="calc-output-label">Neto (sin IVA)</span><strong>${fmtMoney(costoReal)}</strong></div>
      <div class="calc-output-row"><span class="calc-output-label">IVA (19%)</span><strong>${fmtMoney(m - costoReal)}</strong></div>
      <div class="calc-output-row" style="border-top:1px solid var(--rule);padding-top:6px;margin-top:2px;"><span class="calc-output-label" style="font-weight:700;">Costo empresa (costo real)</span><strong style="color:var(--accent);">${fmtMoney(costoReal)}</strong></div>`;
  } else {
    breakdown = `
      <div class="calc-output-row" style="border-top:1px solid var(--rule);padding-top:6px;margin-top:2px;"><span class="calc-output-label" style="font-weight:700;">Costo empresa (costo real)</span><strong style="color:var(--accent);">${fmtMoney(costoReal)}</strong></div>`;
  }

  const ivaToggle = esFacturaIVA ? `
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-secondary);margin-top:8px;cursor:pointer;">
      <input type="checkbox" ${st.incluyeIVA ? 'checked' : ''} data-accion="calc.crcIVA" data-on="change">
      El monto que ingresé incluye IVA (se descuenta para el costo real)
    </label>` : '';

  const sinDte = !st.dte ? `<div class="calc-note" style="color:var(--warning);">Esta fila no tiene DTE real. El monto se usa tal cual. Para el cálculo automático con retención o IVA, selecciona primero el DTE real de la fila.</div>` : '';

  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" data-accion="ui.backdrop">
      <div class="modal" style="max-width: 480px;">
        <div class="modal-header">
          <div class="modal-title">Costo real · ${escapeHtml(quien)}</div>
          <div style="font-size: 12px; color: var(--ink-muted); margin-top:4px;">DTE real: <strong>${escapeHtml(_crcDteLabel(st.dte))}</strong> <span style="opacity:.7;">(fijo — se toma de la fila)</span></div>
        </div>
        <div class="calc-body">
          <div class="field">
            <label class="field-label">${inputLabel}</label>
            <input type="text" inputmode="numeric" class="input num" id="crcMontoInput"
                   value="${m ? displayMoneyInputValue(m) : ''}" placeholder="0"
                   data-accion="calc.crcMonto" data-on="input">
            ${ivaToggle}
          </div>
          <div class="calc-output" id="crcOutput">${breakdown}</div>
          ${sinDte}
          <div class="calc-note">Se guardará el <strong>costo empresa</strong> (lo que efectivamente cuesta a la productora), no el líquido que recibe el proveedor.</div>
        </div>
        <div class="modal-footer">
          <button class="btn" data-accion="ui.cerrar">Cancelar</button>
          <button class="btn btn-primary" data-accion="calc.crcOk">Usar como costo real</button>
        </div>
      </div>
    </div>`;
  setTimeout(() => { const i = document.getElementById('crcMontoInput'); if (i) i.focus(); }, 50);
}
function _crcUpdateOut() {
  // recálculo granular del bloque de salida sin re-render del modal (no pierde foco/cursor)
  const out = document.getElementById('crcOutput'); if (!out) return;
  const st = window._crc; const m = Number(st.monto) || 0; const costoReal = _crcCostoReal();
  const conReten = dteTieneRetencion(st.dte); const esFacturaIVA = (st.dte === 'factura');
  let html;
  if (conReten) {
    html = `<div class="calc-output-row"><span class="calc-output-label">Líquido (proveedor recibe)</span><strong>${fmtMoney(m)}</strong></div>
      <div class="calc-output-row"><span class="calc-output-label">Retención (15.25%)</span><strong>${fmtMoney(costoReal - m)}</strong></div>
      <div class="calc-output-row" style="border-top:1px solid var(--rule);padding-top:6px;margin-top:2px;"><span class="calc-output-label" style="font-weight:700;">Costo empresa (costo real)</span><strong style="color:var(--accent);">${fmtMoney(costoReal)}</strong></div>`;
  } else if (esFacturaIVA && st.incluyeIVA) {
    html = `<div class="calc-output-row"><span class="calc-output-label">Neto (sin IVA)</span><strong>${fmtMoney(costoReal)}</strong></div>
      <div class="calc-output-row"><span class="calc-output-label">IVA (19%)</span><strong>${fmtMoney(m - costoReal)}</strong></div>
      <div class="calc-output-row" style="border-top:1px solid var(--rule);padding-top:6px;margin-top:2px;"><span class="calc-output-label" style="font-weight:700;">Costo empresa (costo real)</span><strong style="color:var(--accent);">${fmtMoney(costoReal)}</strong></div>`;
  } else {
    html = `<div class="calc-output-row" style="border-top:1px solid var(--rule);padding-top:6px;margin-top:2px;"><span class="calc-output-label" style="font-weight:700;">Costo empresa (costo real)</span><strong style="color:var(--accent);">${fmtMoney(costoReal)}</strong></div>`;
  }
  out.innerHTML = html;
}
function _crcConfirm() {
  const st = window._crc; if (!st) { closeModal(); return; }
  const costoReal = _crcCostoReal();
  updateRowField(st.sectionKey, st.dept, st.idx, 'costoReal', costoReal || null);
  markDirty();
  closeModal();
  afterRowChange(st.sectionKey, st.dept, st.idx);
}

/* ─── V10.5.0 (#3/#4) · HORAS EXTRA PERSISTENTES ─────────────────────────
   Rediseño de Horas Extra con persistencia real (BD Expert: columna jsonb
   budget_line_items.he_config + project_financials.he_recargo_default).

   Modelo por fila (item.heConfig, jsonb; null = sin HE):
     { horas, usaProyecto, modo('formula'|'plana'), montoPlano, recargo,
       valorHora, incluyeIVA }
   · usaProyecto=true  -> la fila usa el cálculo por defecto del proyecto:
       valor hora = valor de la fila / 10 (jornada = 10 h, Biblia §3.4.2),
       recargo = finanzas.heRecargoPct (default 150%), DTE efectivo de la fila.
   · usaProyecto=false -> override por fila:
       modo 'formula' -> recargo y/o valor hora propios × N° horas;
       modo 'plana'   -> monto fijo (a criterio del productor; ignora horas).
   El líquido resultante se convierte a COSTO EMPRESA con el MISMO primitivo
   tributario que Costo Real (boleta: líquido / factor; factura+IVA: monto /
   (1+IVA); resto: tal cual). El costo empresa se cachea en item.horaExtra
   (columna hora_extra) para totales y export. La celda tiene un spinner de
   horas (0,5) + costo + ⚙ (override); el encabezado tiene un ⚙ que fija el
   recargo por defecto del proyecto. La HE se suma al Costo de Producción real
   aparte del costo base. Solo lado real; el cotizado no la incluye.

   DTE EFECTIVO: se usa item.dteReal || item.dte (no solo dteReal). Como dteReal
   no persiste (gap conocido Tanda 3), caer al DTE cotizado —que SÍ persiste—
   hace que el cache de HE sobreviva correctamente a una recarga. */
function _heCostoEmpresa(liquido, dte, incluyeIVA) {
  const m = Number(liquido) || 0;
  if (!m) return 0;
  if (dteTieneRetencion(dte)) return Math.round(m / factorRetencionDte(dte));   // líquido -> bruto
  if (dte === 'factura' && incluyeIVA) return Math.round(m / (1 + IVA));          // con IVA -> neto
  return Math.round(m);                                                          // neto/exenta/sin dte
}
/* ─── Primitivos puros de HE ──────────────────────────────────────────── */
function _heDefaultConfig() {
  return { horas: 0, usaProyecto: true, modo: 'formula', montoPlano: 0, recargo: null, valorHora: null, incluyeIVA: false };
}
function _heProjRecargo() {
  const f = (STATE.currentProject && STATE.currentProject.data && STATE.currentProject.data.finanzas) || {};
  const v = Number(f.heRecargoPct);
  return (isNaN(v) || v < 0) ? 150 : v;
}
function _heEffDte(item) {
  // DTE efectivo: DTE real si está, si no el cotizado (que sí persiste).
  return (item && (item.dteReal || item.dte)) || null;
}
function _heValorHoraDefault(item) {
  // Biblia §3.4.2: jornada = 10 h -> valor hora = valor jornada / 10.
  if (item && item.unidad === 'Jornadas' && item.valor) return Math.round(Number(item.valor) / 10);
  return 0;
}
function _heResolveLiquido(cfg, item) {
  if (!cfg) return 0;
  const override = (cfg.usaProyecto === false);
  if (override && cfg.modo === 'plana') return Number(cfg.montoPlano) || 0;
  const horas = Number(cfg.horas) || 0;
  if (horas <= 0) return 0;
  const vh = override
    ? ((cfg.valorHora != null && Number(cfg.valorHora) > 0) ? Number(cfg.valorHora) : _heValorHoraDefault(item))
    : _heValorHoraDefault(item);
  const rec = override
    ? ((cfg.recargo != null && !isNaN(Number(cfg.recargo))) ? Number(cfg.recargo) : _heProjRecargo())
    : _heProjRecargo();
  return Math.round((Number(vh) || 0) * (rec / 100) * horas);
}
function _heComputeCosto(cfg, item) {
  if (!cfg) return 0;
  const liquido = _heResolveLiquido(cfg, item);
  if (!liquido) return 0;
  return _heCostoEmpresa(liquido, _heEffDte(item), !!cfg.incluyeIVA);
}
function _heRecalcProjectRows() {
  // Tras cambiar el recargo por defecto: recalcula solo las filas que usan
  // el cálculo del proyecto (las override mantienen su valor).
  const d = STATE.currentProject && STATE.currentProject.data;
  if (!d) return;
  const recalc = (item) => { const c = item.heConfig; if (c && c.usaProyecto !== false) { item.horaExtra = _heComputeCosto(c, item) || null; _markRowDirty(item); } };   // Pasada 1 · cambió el cache HE de la fila
  for (const dept in d.servicios) (d.servicios[dept] || []).forEach(recalc);
  ['gastos', 'equipos', 'talentos'].forEach(sk => (d[sk] || []).forEach(recalc));
}
function _heRefreshAll(sectionKey) {
  if (sectionKey === 'servicios') renderServiciosBody(); else renderSimpleSection(sectionKey);
  recalcAllDeptSummaries();
  renderSummaryFin();
  recalcKPIs();
}

/* ─── Celda: spinner de horas ─────────────────────────────────────────── */
function setHeHoras(sectionKey, dept, idx, raw) {
  const item = _rowNoteItem(sectionKey, dept, idx);
  if (!item) return;
  let horas = parseFloat(raw);
  if (isNaN(horas) || horas < 0) horas = 0;
  let cfg = item.heConfig;
  if (!cfg) {
    if (horas <= 0) { _heRefreshAll(sectionKey); return; }   // nada que configurar
    cfg = _heDefaultConfig();                                 // arranca con el cálculo del proyecto
  }
  cfg.horas = horas;
  const esPlana = (cfg.usaProyecto === false && cfg.modo === 'plana');
  if (!esPlana && horas <= 0) {
    item.heConfig = null;          // sin horas y por fórmula -> sin HE
    item.horaExtra = null;
  } else {
    item.heConfig = cfg;
    item.horaExtra = _heComputeCosto(cfg, item) || null;
  }
  _markRowDirty(item);   // Pasada 1 · HE escrita por fuera de updateRowField
  markDirty();
  _heRefreshAll(sectionKey);
}

/* ─── Modal de override por fila ──────────────────────────────────────── */
function openHorasExtraCalc(sectionKey, dept, idx) {
  if (authNivel('presupuesto') !== 'E') { showToast({ kind: 'info', title: 'Solo lectura', body: 'Tu perfil puede ver el presupuesto, pero no modificar las horas extra.' }); return; }   // V10.5.1
  const item = _rowNoteItem(sectionKey, dept, idx);
  if (!item) return;
  const cfg = item.heConfig || _heDefaultConfig();
  const vhDef = _heValorHoraDefault(item);
  window._hec = {
    sectionKey: sectionKey, dept: dept, idx: idx,
    dte: _heEffDte(item),
    usaProyecto: (cfg.usaProyecto !== false),
    modo: (cfg.modo === 'plana' ? 'plana' : 'formula'),
    horas: (Number(cfg.horas) || 0),
    valorHora: (cfg.valorHora != null && cfg.valorHora !== '' ? cfg.valorHora : vhDef),
    recargo: (cfg.recargo != null && cfg.recargo !== '' ? cfg.recargo : _heProjRecargo()),
    montoPlano: (cfg.montoPlano != null && cfg.montoPlano !== '' ? cfg.montoPlano : ''),
    incluyeIVA: !!cfg.incluyeIVA,
    valorHoraDefault: vhDef,
    projRecargo: _heProjRecargo(),
    esJornadas: (item.unidad === 'Jornadas')
  };
  renderHorasExtraCalc();
}
function _hecSetUsaProyecto(v) { if (window._hec) { window._hec.usaProyecto = !!v; renderHorasExtraCalc(); } }
function _hecSetModo(modo) { if (window._hec) { window._hec.modo = modo; renderHorasExtraCalc(); } }
function _hecLiquido() {
  const st = window._hec; if (!st) return 0;
  if (!st.usaProyecto && st.modo === 'plana') return Number(st.montoPlano) || 0;
  const horas = Number(st.horas) || 0;
  if (horas <= 0) return 0;
  const vh = st.usaProyecto ? st.valorHoraDefault : ((Number(st.valorHora) > 0) ? Number(st.valorHora) : st.valorHoraDefault);
  const rec = st.usaProyecto ? st.projRecargo : ((st.recargo != null && st.recargo !== '' && !isNaN(Number(st.recargo))) ? Number(st.recargo) : st.projRecargo);
  return Math.round((Number(vh) || 0) * (rec / 100) * horas);
}
function _hecCosto() { const st = window._hec; if (!st) return 0; return _heCostoEmpresa(_hecLiquido(), st.dte, st.incluyeIVA); }
function _hecOutHTML() {
  const st = window._hec; if (!st) return '';
  const liquido = _hecLiquido();
  const costo = _hecCosto();
  const conReten = dteTieneRetencion(st.dte);
  const esFacturaIVA = (st.dte === 'factura');
  let extra = '';
  if (conReten && liquido) extra = `<div class="calc-output-row"><span class="calc-output-label">Líquido (proveedor)</span><strong>${fmtMoney(liquido)}</strong></div><div class="calc-output-row"><span class="calc-output-label">Retención</span><strong>${fmtMoney(costo - liquido)}</strong></div>`;
  else if (esFacturaIVA && st.incluyeIVA && liquido) extra = `<div class="calc-output-row"><span class="calc-output-label">Neto (sin IVA)</span><strong>${fmtMoney(costo)}</strong></div><div class="calc-output-row"><span class="calc-output-label">IVA</span><strong>${fmtMoney(liquido - costo)}</strong></div>`;
  return `${extra}<div class="calc-output-row" style="border-top:1px solid var(--rule);padding-top:6px;margin-top:2px;"><span class="calc-output-label" style="font-weight:700;">Costo empresa (horas extra)</span><strong style="color:var(--accent);">${fmtMoney(costo)}</strong></div>`;
}
function _hecUpdateOut() { const out = document.getElementById('hecOutput'); if (out) out.innerHTML = _hecOutHTML(); }
function renderHorasExtraCalc() {
  const st = window._hec; if (!st) return;
  const item = _rowNoteItem(st.sectionKey, st.dept, st.idx) || {};
  const quien = item.nombre || item.rol || item.item || 'esta fila';
  const esFacturaIVA = (st.dte === 'factura');
  const actual = (item.horaExtra != null && item.horaExtra !== '') ? item.horaExtra : null;

  // Toggle: usar el cálculo del proyecto
  const usaToggle = `
    <label class="he-usa-proyecto">
      <input type="checkbox" ${st.usaProyecto ? 'checked' : ''} data-accion="calc.hecUsaProy" data-on="change">
      <span>Usar el cálculo por defecto del proyecto <span style="color:var(--ink-faint);font-weight:400;">(recargo ${st.projRecargo}% · valor hora = valor de la fila ÷ 10)</span></span>
    </label>`;

  let cuerpo;
  if (st.usaProyecto) {
    cuerpo = `
      <div class="field">
        <label class="field-label">N° de horas extra</label>
        <input type="number" step="0.5" min="0" class="input num" value="${st.horas || ''}" placeholder="0"
               data-accion="calc.hecHoras" data-on="input">
      </div>
      <div class="calc-note">Valor de la hora sugerido: <strong>${st.valorHoraDefault ? fmtMoney(st.valorHoraDefault) : '—'}</strong>${st.esJornadas ? '' : ' <span style="color:var(--warning);">(la unidad de la fila no es «Jornadas»; ingresa un valor hora propio desacoplando del proyecto)</span>'} · Recargo del proyecto: <strong>${st.projRecargo}%</strong>. Para fijar el recargo por defecto usa el ⚙ del encabezado «Horas extra».</div>`;
  } else {
    const tabs = `
      <div class="he-tabs">
        <button type="button" class="he-tab ${st.modo === 'formula' ? 'is-on' : ''}" data-accion="calc.hecModo" data-args='["formula"]'>Fórmula propia</button>
        <button type="button" class="he-tab ${st.modo === 'plana' ? 'is-on' : ''}" data-accion="calc.hecModo" data-args='["plana"]'>Tarifa plana</button>
      </div>`;
    let inputs;
    if (st.modo === 'formula') {
      inputs = `
        <div class="field">
          <label class="field-label">Valor de la hora <span style="color:var(--ink-faint);font-weight:400;">${st.esJornadas ? '(sugerido: valor de la fila ÷ 10)' : '(valor jornal designado)'}</span></label>
          <input type="text" inputmode="numeric" class="input num" value="${(st.valorHora !== '' && st.valorHora != null) ? displayMoneyInputValue(st.valorHora) : ''}" placeholder="${st.valorHoraDefault || 0}"
                 data-accion="calc.hecValor" data-on="input">
        </div>
        <div style="display:flex;gap:10px;">
          <div class="field" style="flex:1;">
            <label class="field-label">Recargo %</label>
            <input type="number" step="1" min="0" class="input num" value="${st.recargo}" placeholder="${st.projRecargo}"
                   data-accion="calc.hecRecargo" data-on="input">
          </div>
          <div class="field" style="flex:1;">
            <label class="field-label">N° de horas extra</label>
            <input type="number" step="0.5" min="0" class="input num" value="${st.horas || ''}" placeholder="0"
                   data-accion="calc.hecHoras" data-on="input">
          </div>
        </div>`;
    } else {
      inputs = `
        <div class="field">
          <label class="field-label">Monto de horas extra ${dteTieneRetencion(st.dte) ? '(líquido que recibe el proveedor)' : (esFacturaIVA ? '(monto de la factura)' : '')}</label>
          <input type="text" inputmode="numeric" class="input num" value="${(st.montoPlano !== '' && st.montoPlano != null) ? displayMoneyInputValue(st.montoPlano) : ''}" placeholder="0"
                 data-accion="calc.hecPlano" data-on="input">
        </div>`;
    }
    cuerpo = tabs + inputs;
  }

  const ivaToggle = esFacturaIVA ? `
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-secondary);margin-top:8px;cursor:pointer;">
      <input type="checkbox" ${st.incluyeIVA ? 'checked' : ''} data-accion="calc.hecIVA" data-on="change">
      El monto incluye IVA (se descuenta para el costo empresa)
    </label>` : '';

  const sinDte = !st.dte ? `<div class="calc-note" style="color:var(--warning);">Esta fila no tiene DTE (ni real ni cotizado). El monto se usa tal cual. Para la conversión con retención o IVA, selecciona primero el DTE de la fila.</div>` : '';

  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-backdrop" data-accion="ui.backdrop">
      <div class="modal" style="max-width: 480px;">
        <div class="modal-header">
          <div class="modal-title">Horas extra · ${escapeHtml(quien)}</div>
          <div style="font-size: 12px; color: var(--ink-muted); margin-top:4px;">DTE: <strong>${escapeHtml(_crcDteLabel(st.dte))}</strong> <span style="opacity:.7;">(se toma de la fila)</span>${actual != null ? ` · HE actual: <strong>${fmtMoney(actual)}</strong>` : ''}</div>
        </div>
        <div class="calc-body">
          ${usaToggle}
          ${cuerpo}
          ${ivaToggle}
          <div class="calc-output" id="hecOutput">${_hecOutHTML()}</div>
          ${sinDte}
          <div class="calc-note">Se guarda el <strong>costo empresa</strong> de las horas extra (cache) más la configuración. Se suma al Costo de Producción real, aparte del costo base.</div>
        </div>
        <div class="modal-footer">
          ${actual != null ? `<button class="btn" style="margin-right:auto;color:var(--negative);" data-accion="calc.hecClear">Quitar horas extra</button>` : ''}
          <button class="btn" data-accion="ui.cerrar">Cancelar</button>
          <button class="btn btn-primary" data-accion="calc.hecOk">Guardar horas extra</button>
        </div>
      </div>
    </div>`;
}
function _hecConfirm() {
  const st = window._hec; if (!st) { closeModal(); return; }
  const item = _rowNoteItem(st.sectionKey, st.dept, st.idx);
  if (!item) { closeModal(); return; }
  const override = !st.usaProyecto;
  const cfg = {
    horas: Number(st.horas) || 0,
    usaProyecto: !override,
    modo: (override && st.modo === 'plana') ? 'plana' : 'formula',
    montoPlano: (override && st.modo === 'plana') ? (Number(st.montoPlano) || 0) : null,
    recargo: (override && st.modo === 'formula' && st.recargo !== '' && st.recargo != null && !isNaN(Number(st.recargo))) ? Number(st.recargo) : null,
    valorHora: (override && st.modo === 'formula' && Number(st.valorHora) > 0) ? Number(st.valorHora) : null,
    incluyeIVA: !!st.incluyeIVA
  };
  const costo = _heComputeCosto(cfg, item) || null;
  const esPlana = (override && cfg.modo === 'plana');
  if (!costo && !(esPlana && cfg.montoPlano)) {
    item.heConfig = null; item.horaExtra = null;   // nada efectivo -> sin HE
  } else {
    item.heConfig = cfg; item.horaExtra = costo;
  }
  _markRowDirty(item);   // Pasada 1 · HE escrita por fuera de updateRowField
  markDirty();
  closeModal();
  _heRefreshAll(st.sectionKey);
}
function _hecClear() {
  const st = window._hec; if (!st) { closeModal(); return; }
  const item = _rowNoteItem(st.sectionKey, st.dept, st.idx);
  if (item) { item.heConfig = null; item.horaExtra = null; _markRowDirty(item); }   // Pasada 1
  markDirty();
  closeModal();
  _heRefreshAll(st.sectionKey);
}

/* ─── Modal del recargo por defecto del proyecto (⚙ del encabezado) ────── */
function openHeProyectoDefault() {
  if (authNivel('presupuesto') !== 'E') { showToast({ kind: 'info', title: 'Solo lectura', body: 'Tu perfil puede ver el presupuesto, pero no configurar las horas extra.' }); return; }   // V10.5.1
  if (!STATE.currentProject) return;
  window._hep = { recargo: _heProjRecargo() };
  renderHeProyectoDefault();
}
function _hepContarFilas() {
  const d = STATE.currentProject && STATE.currentProject.data;
  if (!d) return 0;
  let n = 0;
  const cuenta = (item) => { const c = item.heConfig; if (c && c.usaProyecto !== false && (Number(c.horas) || 0) > 0) n++; };
  for (const dept in d.servicios) (d.servicios[dept] || []).forEach(cuenta);
  ['gastos', 'equipos', 'talentos'].forEach(sk => (d[sk] || []).forEach(cuenta));
  return n;
}
function renderHeProyectoDefault() {
  const st = window._hep; if (!st) return;
  const afectadas = _hepContarFilas();
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-backdrop" data-accion="ui.backdrop">
      <div class="modal" style="max-width: 440px;">
        <div class="modal-header">
          <div class="modal-title">Horas extra · cálculo del proyecto</div>
          <div style="font-size: 12px; color: var(--ink-muted); margin-top:4px;">Recargo por defecto para las filas que usan el cálculo del proyecto. El valor de la hora se toma de cada fila (valor ÷ 10) y la conversión usa el DTE de la fila.</div>
        </div>
        <div class="calc-body">
          <div class="field">
            <label class="field-label">Recargo por defecto %</label>
            <input type="number" step="1" min="0" class="input num" value="${st.recargo}" placeholder="150"
                   data-accion="calc.hepRecargo" data-on="input">
          </div>
          <div class="calc-note">Biblia §3.4.2: la hora extra es el 150% del valor de la hora por defecto. Al guardar se recalcula la HE de <strong>${afectadas}</strong> fila(s) que usan el cálculo del proyecto. Las filas con override propio no se tocan.</div>
        </div>
        <div class="modal-footer">
          <button class="btn" data-accion="ui.cerrar">Cancelar</button>
          <button class="btn btn-primary" data-accion="calc.hepOk">Guardar recargo</button>
        </div>
      </div>
    </div>`;
}
function _hepConfirm() {
  const st = window._hep; if (!st) { closeModal(); return; }
  const d = STATE.currentProject && STATE.currentProject.data;
  if (!d) { closeModal(); return; }
  if (!d.finanzas) d.finanzas = {};
  const rec = (st.recargo != null && st.recargo !== '' && !isNaN(Number(st.recargo)) && Number(st.recargo) >= 0) ? Number(st.recargo) : 150;
  d.finanzas.heRecargoPct = rec;
  _heRecalcProjectRows();
  markDirty();
  closeModal();
  renderPresupuesto();
}

// ── Window bridges (3 barridos: externos, auto-consumo, nombre-string) ──
window._crcConfirm = _crcConfirm;
window._crcUpdateOut = _crcUpdateOut;
window._heComputeCosto = _heComputeCosto;
window._hecClear = _hecClear;
window._hecConfirm = _hecConfirm;
window._hecSetModo = _hecSetModo;
window._hecSetUsaProyecto = _hecSetUsaProyecto;
window._hecUpdateOut = _hecUpdateOut;
window._hepConfirm = _hepConfirm;
window.calcUpdate = calcUpdate;
window.openCalculadoraTributaria = openCalculadoraTributaria;
window.openCostoRealCalc = openCostoRealCalc;
window.openHeProyectoDefault = openHeProyectoDefault;
window.openHorasExtraCalc = openHorasExtraCalc;
window.renderCostoRealCalc = renderCostoRealCalc;
window.setHeHoras = setHeHoras;

// D2 · acciones delegadas (el estado _calc*/_crc/_hec/_hep sigue en window:
// lección #6 — lo escriben estas acciones igual que antes los inline)
registrarAcciones('calc', {
  tipo: function (a, el) { window._calcTipo = el.value; openCalculadoraTributaria(); },
  modo: function (a, el) { window._calcModo = el.value; openCalculadoraTributaria(); },
  monto: function (a, el) { calcUpdate(el.value); },
  crcIVA: function (a, el) { window._crc.incluyeIVA = el.checked; renderCostoRealCalc(); },
  crcMonto: function (a, el) { window._crc.monto = parseMoneyCLP(el.value) || 0; _crcUpdateOut(); },
  crcOk: function () { _crcConfirm(); },
  hecUsaProy: function (a, el) { _hecSetUsaProyecto(el.checked); },
  hecHoras: function (a, el) { window._hec.horas = parseFloat(el.value) || 0; _hecUpdateOut(); },
  hecModo: function (a) { _hecSetModo(a[0]); },
  hecValor: function (a, el) { window._hec.valorHora = parseMoneyCLP(el.value) || 0; _hecUpdateOut(); },
  hecRecargo: function (a, el) { window._hec.recargo = (el.value === '' ? '' : parseFloat(el.value)); _hecUpdateOut(); },
  hecPlano: function (a, el) { window._hec.montoPlano = parseMoneyCLP(el.value) || 0; _hecUpdateOut(); },
  hecIVA: function (a, el) { window._hec.incluyeIVA = el.checked; _hecUpdateOut(); },
  hecClear: function () { _hecClear(); },
  hecOk: function () { _hecConfirm(); },
  hepRecargo: function (a, el) { window._hep.recargo = (el.value === '' ? 150 : parseFloat(el.value)); },
  hepOk: function () { _hepConfirm(); },
});
