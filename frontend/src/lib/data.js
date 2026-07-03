// Constantes de datos de TakeOS — extraídas de index.html (Etapa B3).
// Catálogos y presets puros + DEMO_PROJECTS (derivada: su inicializador ejecuta
// buildProjectData(), auto-global del script clásico, disponible al evaluar este
// módulo). Cada const se expone en window para el script clásico y los módulos
// que las leen como identificador desnudo (resuelven vía propiedad global).
// ORDEN INTERNO: los DEFAULT_* y COTIZACION_CONDICIONES_DEFAULTS deben preceder
// a DEMO_PROJECTS (su inicializador los lee).

// D1e · imports reales (regla lib-precede: solo de libs anteriores en main.js)
import { buildDefaultProjectData } from './modelo.js';

import { FACTOR_BOLETA, FACTOR_BTE } from './rates.js';
export const LOC_ORIENTACIONES = ['—', 'Norte', 'Sur', 'Oriente', 'Poniente', 'Nororiente', 'Norponiente', 'Suroriente', 'Surponiente'];
export const LOC_ESTADOS = { candidata: 'Candidata', confirmada: 'Confirmada', descartada: 'Descartada' }; window.LOC_ESTADOS = LOC_ESTADOS;
/* V8.3.3 — Regiones de Chile (orden norte→sur). Ciudad y Comuna quedan libres
   porque aún no hay garantía de mantener un catálogo completo actualizado. */
export const REGIONES_CHILE = ['Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo', 'Valparaíso', 'Metropolitana de Santiago', "Libertador General Bernardo O'Higgins", 'Maule', 'Ñuble', 'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén del General Carlos Ibáñez del Campo', 'Magallanes y de la Antártica Chilena'];

export const BANCOS_CHILE = [
  { nombre: 'Banco de Chile', codigo: '001' }, { nombre: 'Banco Internacional', codigo: '009' },
  { nombre: 'BancoEstado', codigo: '012' }, { nombre: 'Scotiabank Chile', codigo: '014' },
  { nombre: 'Banco BCI', codigo: '016' }, { nombre: 'Banco BICE', codigo: '028' },
  { nombre: 'Banco HSBC', codigo: '031' }, { nombre: 'Banco Santander', codigo: '037' },
  { nombre: 'Banco Ita\u00fa', codigo: '039' }, { nombre: 'Banco Security', codigo: '049' },
  { nombre: 'Banco Falabella', codigo: '051' }, { nombre: 'Banco Ripley', codigo: '053' },
  { nombre: 'Banco Consorcio', codigo: '055' }, { nombre: 'Scotiabank Azul (ex BBVA)', codigo: '504' },
  { nombre: 'Coopeuch', codigo: '672' }, { nombre: 'Prepago Los H\u00e9roes', codigo: '729' },
  { nombre: 'Tenpo', codigo: '730' }, { nombre: 'Tapp (Caja Los Andes)', codigo: '732' },
  { nombre: 'Global66', codigo: '738' }, { nombre: 'Mercado Pago', codigo: '875' }
];

export const DTE_OPTIONS = [
  { value: 'boleta',           label: 'Boleta de honorarios' },
  { value: 'factura',          label: 'Factura' },
  { value: 'factura_exenta',   label: 'Factura exenta' },
  { value: 'boleta_terceros',  label: 'Boleta a terceros' }
];
export const DTE_LABEL = Object.fromEntries(DTE_OPTIONS.map(o => [o.value, o.label])); window.DTE_LABEL = DTE_LABEL;
export const DTE_LABEL_SHORT = { boleta: 'Boleta', factura: 'Factura', factura_exenta: 'F. Exenta', boleta_terceros: 'B. Terceros' }; window.DTE_LABEL_SHORT = DTE_LABEL_SHORT;
export const DTE_CON_RETENCION = ['boleta', 'boleta_terceros']; window.DTE_CON_RETENCION = DTE_CON_RETENCION;

/* ════════════════════════════════════════════════════════════════════
   V8.3.1 · LÓGICA TRIBUTARIA CENTRAL (única fuente de verdad)
   Boleta de honorarios / boleta a terceros: retención 15,25% (2026) que la
   productora retiene y paga al SII; el líquido que recibe el proveedor es
   el bruto × (1 − 0,1525). Factura (afecta o exenta): sin retención, el
   monto neto coincide con el costo. Todos los módulos (Presupuesto, Gastos,
   Legal, calculadora) deben usar estas funciones — no recalcular aparte. */
export function dteTieneRetencion(dte) { return DTE_CON_RETENCION.indexOf(dte) !== -1; }
/* V9.6.18 · factor de retención según DTE (boleta=BHE, boleta_terceros=BTE).
   Antes ambos usaban FACTOR_BOLETA; ahora cada uno toma su propia tasa de
   tax_rates (BTE = BHE por defecto, así no cambia el cálculo si no hay dato). */
export function factorRetencionDte(dte) {
  if (dte === 'boleta_terceros') return FACTOR_BTE;
  if (dteTieneRetencion(dte)) return FACTOR_BOLETA;
  return 1;
}
export function montoNetoDesde(costoReal, dte) { const c = Number(costoReal) || 0; if (!c) return 0; return dteTieneRetencion(dte) ? Math.round(c * factorRetencionDte(dte)) : Math.round(c); }
export function montoBrutoDesde(liquido, dte) { const l = Number(liquido) || 0; if (!l) return 0; return dteTieneRetencion(dte) ? Math.round(l / factorRetencionDte(dte)) : Math.round(l); }
export const UNIDAD_OPTIONS = ['Tarifa Plana', 'Jornadas', 'Horas', 'Personas', 'Locaciones', 'Fotografías'];

// Fórmulas tributarias puras (viajaron con su data DTE; consumidas por el
// clásico calcCostoEmpresa y por notificaciones/gastos/legal):

// ── Window bridges — DEBEN preceder a DEMO_PROJECTS: su inicializador llama
// al builder CLÁSICO, que lee window.DEFAULT_* (lección del bug del 2-jul) ──

// D4b · catálogos compartidos movidos a lib/catalogos.js (hoja); re-export para compat
import { DEFAULT_DEPARTAMENTOS, DEFAULT_EQUIPOS, DEFAULT_GASTOS, DEFAULT_TALENTOS, COTIZACION_CONDICIONES_DEFAULTS, LOC_ESTADO_RANK, ROLES_OPERATIVOS } from './catalogos.js';
export { DEFAULT_DEPARTAMENTOS, DEFAULT_EQUIPOS, DEFAULT_GASTOS, DEFAULT_TALENTOS, COTIZACION_CONDICIONES_DEFAULTS, LOC_ESTADO_RANK, ROLES_OPERATIVOS };
