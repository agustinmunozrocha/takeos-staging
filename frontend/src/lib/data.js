// Constantes de datos de TakeOS — extraídas de index.html (Etapa B3).
// Catálogos y presets puros + DEMO_PROJECTS (derivada: su inicializador ejecuta
// buildProjectData(), auto-global del script clásico, disponible al evaluar este
// módulo). Cada const se expone en window para el script clásico y los módulos
// que las leen como identificador desnudo (resuelven vía propiedad global).
// ORDEN INTERNO: los DEFAULT_* y COTIZACION_CONDICIONES_DEFAULTS deben preceder
// a DEMO_PROJECTS (su inicializador los lee).

const LOC_ORIENTACIONES = ['—', 'Norte', 'Sur', 'Oriente', 'Poniente', 'Nororiente', 'Norponiente', 'Suroriente', 'Surponiente'];
const LOC_ESTADOS = { candidata: 'Candidata', confirmada: 'Confirmada', descartada: 'Descartada' }; window.LOC_ESTADOS = LOC_ESTADOS;
/* V8.3.3 — Regiones de Chile (orden norte→sur). Ciudad y Comuna quedan libres
   porque aún no hay garantía de mantener un catálogo completo actualizado. */
const REGIONES_CHILE = ['Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo', 'Valparaíso', 'Metropolitana de Santiago', "Libertador General Bernardo O'Higgins", 'Maule', 'Ñuble', 'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén del General Carlos Ibáñez del Campo', 'Magallanes y de la Antártica Chilena'];

const BANCOS_CHILE = [
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

const LOC_ESTADO_RANK = { confirmada: 3, candidata: 2, descartada: 1 };
const ROLES_OPERATIVOS = ['Crew', 'Interno', 'Contacto cliente', 'Proveedor individual'];

const DEFAULT_DEPARTAMENTOS = {
  'Dirección': [
    { rol: 'Director', valor: 1000000, unidad: 'Tarifa Plana' },
    { rol: 'Primer AD', valor: 200000, unidad: 'Jornadas' },
    { rol: 'Segundo AD', valor: 120000, unidad: 'Jornadas' },
    { rol: 'Continuista', valor: null, unidad: 'Jornadas' }
  ],
  'Producción': [
    { rol: 'Productor Ejecutivo', valor: 200000, unidad: 'Tarifa Plana' },
    { rol: 'Jefe de Producción', valor: 150000, unidad: 'Tarifa Plana' },
    { rol: 'Asistente de Producción', valor: 120000, unidad: 'Tarifa Plana' },
    { rol: 'Runner Producción', valor: 80000, unidad: 'Jornadas' },
    { rol: 'Productor Técnico', valor: 100000, unidad: 'Tarifa Plana' }
  ],
  'Dirección de Fotografía': [
    { rol: 'Director de Fotografía', valor: 500000, unidad: 'Tarifa Plana' },
    { rol: 'Primer AC', valor: 120000, unidad: 'Jornadas' },
    { rol: 'Segundo AC', valor: 100000, unidad: 'Jornadas' },
    { rol: 'Gaffer', valor: 180000, unidad: 'Jornadas' },
    { rol: 'Primer Eléctrico', valor: 120000, unidad: 'Jornadas' },
    { rol: 'Segundo Eléctrico', valor: 100000, unidad: 'Jornadas' },
    { rol: 'DIT / Data Manager', valor: 100000, unidad: 'Jornadas' }
  ],
  'Arte': [
    { rol: 'Directora de Arte', valor: 500000, unidad: 'Tarifa Plana' },
    { rol: 'Ambientadora', valor: 150000, unidad: 'Jornadas' },
    { rol: 'Runner Arte', valor: 100000, unidad: 'Jornadas' },
    { rol: 'Maquilladora', valor: 150000, unidad: 'Jornadas' },
    { rol: 'Vestuarista', valor: 200000, unidad: 'Tarifa Plana' },
    { rol: 'Asistente de Vestuario', valor: 100000, unidad: 'Jornadas' }
  ],
  /* V5.2.1: Foto Fija como departamento propio (feedback Agustín §8). */
  'Foto Fija': [
    { rol: 'Fotógrafo/a', valor: 400000, unidad: 'Tarifa Plana' },
    { rol: 'Asistente de Foto', valor: 100000, unidad: 'Jornadas' },
    { rol: 'Retoque', valor: null, unidad: 'Fotografías' }
  ],
  'Locaciones': [
    { rol: 'Locacionista', valor: 600000, unidad: 'Tarifa Plana' }
  ],
  'Catering': [
    { rol: 'Servicio de Catering', valor: 22000, unidad: 'Personas' }
  ],
  'Postproducción': [
    { rol: 'VFX', valor: null, unidad: 'Tarifa Plana' },
    { rol: 'Color', valor: null, unidad: 'Tarifa Plana' },
    { rol: 'Mezcla de Sonido', valor: null, unidad: 'Tarifa Plana' },
    { rol: 'Motion Graphics', valor: null, unidad: 'Tarifa Plana' }
  ]
};

const DEFAULT_GASTOS = [
  { item: 'Catering (no servicio)', valor: 18000, unidad: 'Personas' },
  { item: 'Caja de Producción', valor: 200000, unidad: 'Tarifa Plana' },
  { item: 'Caja de Transporte', valor: 80000, unidad: 'Tarifa Plana' },
  { item: 'Locación', valor: 800000, unidad: 'Tarifa Plana' },
  { item: 'Gastos de Locación', valor: 100000, unidad: 'Tarifa Plana' },
  { item: 'Gastos de Arte', valor: 200000, unidad: 'Tarifa Plana' },
  { item: 'Gastos de Vestuario', valor: 120000, unidad: 'Tarifa Plana' }
];

const DEFAULT_EQUIPOS = [
  { item: 'Caja de arriendo de equipos', valor: 150000, unidad: 'Tarifa Plana' }
];

const DEFAULT_TALENTOS = [
  { item: 'Talento principal', valor: 600000, unidad: 'Tarifa Plana' },
  { item: 'Talento secundario', valor: 150000, unidad: 'Tarifa Plana' }
];

const COTIZACION_CONDICIONES_DEFAULTS = {
  validezDiasHabiles: 5,
  abonoPct: 50,
  abonoPlazoDiasHabiles: 5,      // tras aprobación
  saldoPct: 50,
  saldoPlazoDias: 30,            // tras entrega final satisfactoria
  primeraEntregaDiasHabiles: 3,  // post rodaje
  correccionesPlazoDiasHabiles: 3,
  rondasIncluidas: 2,
  valorRondaExtra: 50000,
  valorCambioMusica: 50000,
  cancelacionAntesPct: 50,       // antes del rodaje: retención mínima
  cancelacionDespuesPct: 80,     // después del rodaje
  reprogramacionPct: 20,
  reprogramacionAvisoDiasHabiles: 5,
  montosMasIVA: true
};
window.COTIZACION_CONDICIONES_DEFAULTS = COTIZACION_CONDICIONES_DEFAULTS;

export const DTE_OPTIONS = [
  { value: 'boleta',           label: 'Boleta de honorarios' },
  { value: 'factura',          label: 'Factura' },
  { value: 'factura_exenta',   label: 'Factura exenta' },
  { value: 'boleta_terceros',  label: 'Boleta a terceros' }
];
const DTE_LABEL = Object.fromEntries(DTE_OPTIONS.map(o => [o.value, o.label])); window.DTE_LABEL = DTE_LABEL;
const DTE_LABEL_SHORT = { boleta: 'Boleta', factura: 'Factura', factura_exenta: 'F. Exenta', boleta_terceros: 'B. Terceros' }; window.DTE_LABEL_SHORT = DTE_LABEL_SHORT;
const DTE_CON_RETENCION = ['boleta', 'boleta_terceros']; window.DTE_CON_RETENCION = DTE_CON_RETENCION;

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
const UNIDAD_OPTIONS = ['Tarifa Plana', 'Jornadas', 'Horas', 'Personas', 'Locaciones', 'Fotografías'];

// Fórmulas tributarias puras (viajaron con su data DTE; consumidas por el
// clásico calcCostoEmpresa y por notificaciones/gastos/legal):
window.dteTieneRetencion  = dteTieneRetencion;
window.factorRetencionDte = factorRetencionDte;
window.montoNetoDesde     = montoNetoDesde;
window.montoBrutoDesde    = montoBrutoDesde;

// ── Window bridges — DEBEN preceder a DEMO_PROJECTS: su inicializador llama
// al builder CLÁSICO, que lee window.DEFAULT_* (lección del bug del 2-jul) ──
window.LOC_ORIENTACIONES     = LOC_ORIENTACIONES;     // locaciones.js (tras dedup)
window.REGIONES_CHILE        = REGIONES_CHILE;        // perfil-onboarding.js la lee a pelo
window.BANCOS_CHILE          = BANCOS_CHILE;          // dal.js:95 a pelo
window.LOC_ESTADO_RANK       = LOC_ESTADO_RANK;
window.ROLES_OPERATIVOS      = ROLES_OPERATIVOS;
window.DEFAULT_DEPARTAMENTOS = DEFAULT_DEPARTAMENTOS; // buildDefaultProjectData (clásico) los lee a pelo
window.DEFAULT_GASTOS        = DEFAULT_GASTOS;
window.DEFAULT_EQUIPOS       = DEFAULT_EQUIPOS;
window.DEFAULT_TALENTOS      = DEFAULT_TALENTOS;
window.DTE_OPTIONS           = DTE_OPTIONS;           // bd.js y presupuesto-cotizacion.js a pelo
window.UNIDAD_OPTIONS        = UNIDAD_OPTIONS;        // presupuesto-cotizacion.js (tras dedup)

