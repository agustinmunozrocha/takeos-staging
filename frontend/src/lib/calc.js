// Fórmulas de costo/totales + formateadores CLP + helpers de input — extraído de index.html (Etapa C5)

// D1e · imports reales (regla lib-precede: solo de libs anteriores en main.js)
import { DTE_CON_RETENCION, factorRetencionDte } from './data.js';

/* Costo empresa cotizado de un ítem.
   Retorna { value: number|null, error: string|null }
   - value === null + error → mostrar error
   - value === 0 + error null → fila aún no usable (sin cantidad o sin valor)
   - value > 0 → costo válido

   V5.1.1: el parámetro sectionKey hace que DTE sea OPCIONAL en gastos
   y equipos (la mayoría son cajas, contingencias o facturas sin
   negociación de retención). Si no hay DTE en esas secciones, se
   calcula directo sin retención (asume factura). En servicios y
   talentos sigue siendo requerido. */
export function calcCostoEmpresa(valor, cantidad, dte, sectionKey) {
  if (!cantidad || cantidad === 0) return { value: 0, error: null };
  if (!valor) return { value: 0, error: null };
  // V9.6.13 (#4): el costo empresa se REDONDEA a peso entero en la fuente.
  // Antes el caso boleta (valor/0.8475) dejaba decimales, y el resumen sumaba
  // decimales mientras el desglose sumaba valores ya redondeados -> diferencias
  // de 1-2 pesos. Con montos enteros por línea, todas las sumas cuadran exactas.
  if (!dte) {
    if (sectionKey === 'gastos' || sectionKey === 'equipos') {
      // DTE opcional: asume cálculo directo
      return { value: Math.round(valor * cantidad), error: null };
    }
    return { value: null, error: 'FALTA DTE' };
  }
  if (DTE_CON_RETENCION.includes(dte)) {
    return { value: Math.round((valor / factorRetencionDte(dte)) * cantidad), error: null };
  }
  return { value: Math.round(valor * cantidad), error: null };
}

/* Costo real declarado de un ítem (input manual post-aprobación)
   V5.3 (Notas 4+5): el costo real es el valor LITERAL que el usuario
   declara — el DTE en el lado real es informativo, NO multiplica (a
   diferencia del cotizado, donde boleta sí infla por la retención).
   Por eso ya NO se exige DTE para computar el real: si lo exigíamos,
   una fila con costoReal pero sin DTE devolvía null y el subtotal real
   la ignoraba en silencio (ese era el bug de "subtotales reales no
   actualizan" de la Nota 4, causado por el bloqueo de DTE de V5.2.2).
   El aviso de "falta DTE" sigue vivo en recalcAlerts(), pero ya no
   rompe el cálculo. El parámetro sectionKey se mantiene por
   compatibilidad de firma con los 6 callsites. */
export function getCostoReal(item, sectionKey) {
  if (item.costoReal === null || item.costoReal === undefined) {
    return { value: 0, error: null };
  }
  return { value: Math.round(item.costoReal), error: null };   // V9.6.13: entero CLP, consistente con calcCostoEmpresa
}

/* Totales completos del proyecto: usado para KPI bar, alerts, Info Proyecto */
export function calcProjectTotals(project) {
  _syncGastosCostoReal(project);   // 4a · el real de Gastos sale de los movimientos, no de tipeo manual
  const d = project.data;
  let totalCot = 0, totalReal = 0;
  let hasReal = false;
  let alerts = 0;

  // Servicios
  for (const dept in d.servicios) {
    d.servicios[dept].forEach(r => {
      const c = calcCostoEmpresa(r.valor, r.cantidad, r.dte, 'servicios');
      totalCot += c.value || 0;
      const real = getCostoReal(r, 'servicios');
      if (r.costoReal !== null && r.costoReal !== undefined) {
        totalReal += real.value || 0;
        hasReal = true;
      }
      const he = Number(r.horaExtra) || 0;   // V10.3.0 (#4): HE es costo real adicional
      if (he) { totalReal += he; hasReal = true; }
      if (c.error) alerts++;
    });
  }
  // Gastos, equipos, talentos
  ['gastos', 'equipos', 'talentos'].forEach(section => {
    d[section].forEach(r => {
      const c = calcCostoEmpresa(r.valor, r.cantidad, r.dte, section);
      totalCot += c.value || 0;
      const real = getCostoReal(r, section);
      if (r.costoReal !== null && r.costoReal !== undefined) {
        totalReal += real.value || 0;
        hasReal = true;
      }
      const he = Number(r.horaExtra) || 0;   // V10.3.0 (#4): HE es costo real adicional
      if (he) { totalReal += he; hasReal = true; }
      if (c.error) alerts++;
    });
  });

  return { totalCot, totalReal, hasReal, alerts };
}

/* ════════════════════════════════════════════════════════════════════
   FORMATEADORES
   ════════════════════════════════════════════════════════════════════ */
export function formatCLP(amount) {
  if (amount === 0) return '$0';
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1).replace('.0', '') + 'M';
  return '$' + amount.toLocaleString('es-CL');
}

/* fmtMoney: formato completo con separadores de miles (sin abreviar)
   Para totales y celdas. formatCLP es para Control Room donde el
   espacio escasea. */
export function fmtMoney(n) {
  if (n === null || n === undefined) return '—';
  if (n === 0) return '$0';
  return '$' + Math.round(n).toLocaleString('es-CL');
}

export function fmtDelta(n) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  const r = Math.round(n);
  // V5.2.1: si el redondeo da 0, mostrar $0 limpio sin signo (evita
  // mostrar "+$0" o "-$0" cuando matemáticamente es prácticamente cero).
  if (r === 0) return '$0';
  const sign = r > 0 ? '+' : '−';  // signo real Unicode minus
  return sign + '$' + Math.abs(r).toLocaleString('es-CL');
}

/* V5.2.1: variante con Δ adelante. Usada en el delta inline de cada fila
   del Presupuesto, donde no hay header de columna que aclare el contexto. */
export function fmtDeltaWithSymbol(n) {
  const s = fmtDelta(n);
  if (s === '—') return s;
  return 'Δ ' + s;
}

export function fmtPct(n) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return (n * 100).toFixed(1) + '%';
}

/* deltaClassCosto: para filas tipo "Servicios", "Gastos", "Costo Producción" etc.
   Si real < cot → bueno (gasté menos) → positive (verde)
   Si real > cot → malo (gasté más) → negative (rojo)

   V5.2.1: aplica Math.round antes de elegir clase. Antes, deltas de
   fracciones (ej -0.20 por redondeo entre cotizado calculado con boleta
   y real entero) producían "$0" en pantalla pero pintado en verde — bug
   visual reportado por Agustín en V5.2. */
export function deltaClassCosto(n) {
  const r = Math.round(n || 0);
  if (r === 0) return 'neutral';
  return r < 0 ? 'positive' : 'negative';
}

/* V5.1.1: deltaClassGanancia INVERSO. Para filas "Ganancia parcial", "Ganancia final".
   Si real > cot → bueno (gané más) → positive (verde)
   Si real < cot → malo (gané menos) → negative (rojo) */
export function deltaClassGanancia(n) {
  const r = Math.round(n || 0);
  if (r === 0) return 'neutral';
  return r > 0 ? 'positive' : 'negative';
}

export function initials(name) {
  if (!name) return '··';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/* escapeHtml -> movido a src/lib/helpers.js (Etapa 1); expuesto en window vía src/main.js */

/* V10.7.1 · Seguridad (pen-test MEDIA #6): saneo de URLs en atributos src/href.
   Valida el esquema (permite http/https, blob: y data:image/; rechaza
   javascript:, data:text/html y similares, incluso ofuscados con caracteres
   de control) y luego escapa el resultado para cerrar el break-out del
   atributo. Un valor inseguro devuelve cadena vacía: el enlace/imagen no carga
   en lugar de ejecutar script. */
/* safeUrl -> movido a src/lib/helpers.js (Etapa 1); expuesto en window vía src/main.js */

/* V5.2: renderUnidadCell ahora es solo dispatcher entre las dos
   versiones (select vs input custom). Las funciones detalladas viven
   al final del JS junto a sus handlers. */
/* renderUnidadCell → movido a src/modules/presupuesto-cotizacion.js (Etapa 2) */

/* Lee un valor desde un input numérico, devolviendo null si vacío */
export function readNum(input) {
  const v = parseFloat(input.value);
  return isFinite(v) ? v : null;
}

/* V5.9 (Nota 5): parsing robusto de montos monetarios. En Chile el punto es
   separador de miles y la coma es decimal, pero la gente pega de todo. Esto
   interpreta inteligentemente: "$300.000", "300.000", "300000", "300000,00",
   "300.000,00" y "300,000.00" → 300000. Regla: si hay ambos separadores, el
   ÚLTIMO es el decimal; si hay uno solo, 1–2 dígitos finales = decimal, 3+ o
   repetido = miles. Antes los inputs eran type=number y "94.395" se leía como
   94,395 (94 pesos). Ahora son texto y se normalizan al perder foco. */
export function parseMoneyCLP(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/[^\d.,\-]/g, '');
  if (s === '' || s === '-' || s === '.' || s === ',') return null;
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let num;
  if (lastDot !== -1 && lastComma !== -1) {
    const decSep = lastDot > lastComma ? '.' : ',';
    const thoSep = decSep === '.' ? ',' : '.';
    num = parseFloat(s.split(thoSep).join('').replace(decSep, '.'));
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? '.' : ',';
    const parts = s.split(sep);
    if (parts.length > 2) {
      num = parseFloat(parts.join(''));            // 1.234.567 → miles
    } else {
      const after = parts[1].length;
      num = (after === 1 || after === 2)
        ? parseFloat(parts[0] + '.' + parts[1])    // 300000,00 → decimal
        : parseFloat(parts.join(''));              // 94.395 / 300.000 → miles
    }
  } else {
    num = parseFloat(s);
  }
  if (!isFinite(num)) return null;
  return neg ? -num : num;
}

/* Valor formateado para mostrar dentro de un input de texto monetario
   (separador de miles chileno, sin símbolo $). */
export function displayMoneyInputValue(n) {
  if (n == null || !isFinite(n)) return '';
  return Math.round(n).toLocaleString('es-CL');
}

/* Handler de inputs monetarios: parsea, actualiza el modelo, y re-formatea
   lo que ve el usuario en el mismo input. */
function onMoneyInput(input, sectionKey, dept, idx, field) {
  const parsed = parseMoneyCLP(input.value);
  updateRowField(sectionKey, dept, idx, field, parsed);
  input.value = parsed == null ? '' : displayMoneyInputValue(parsed);
}

/* V5.5 (Nota 3): normaliza cualquier entrada a hora 24h "HH:MM".
   Acepta "7"→07:00, "730"→07:30, "1845"→18:45, "13:0"→13:00.
   Devuelve '' si está vacío o es inválido (hora>23 o min>59). */
export function normalizeTime24(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  let h, mn;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  if (m) { h = +m[1]; mn = +m[2]; }
  else {
    const d = s.replace(/\D/g, '');
    if (!d) return '';
    if (d.length <= 2) { h = +d; mn = 0; }
    else if (d.length === 3) { h = +d.slice(0, 1); mn = +d.slice(1); }
    else { h = +d.slice(0, d.length - 2); mn = +d.slice(d.length - 2); }
  }
  if (!isFinite(h) || !isFinite(mn) || h > 23 || mn > 59) return '';
  return String(h).padStart(2, '0') + ':' + String(mn).padStart(2, '0');
}

// ── Window bridges (3 barridos func+const) ──
window.calcCostoEmpresa = calcCostoEmpresa;
window.calcProjectTotals = calcProjectTotals;
window.deltaClassCosto = deltaClassCosto;
window.deltaClassGanancia = deltaClassGanancia;
window.displayMoneyInputValue = displayMoneyInputValue;
window.fmtDelta = fmtDelta;
window.fmtMoney = fmtMoney;
window.fmtPct = fmtPct;
window.formatCLP = formatCLP;
window.getCostoReal = getCostoReal;
window.initials = initials;
window.normalizeTime24 = normalizeTime24;
window.onMoneyInput = onMoneyInput;
window.parseMoneyCLP = parseMoneyCLP;
window.readNum = readNum;
