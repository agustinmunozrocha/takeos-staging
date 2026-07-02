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

const DTE_OPTIONS = [
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
function dteTieneRetencion(dte) { return DTE_CON_RETENCION.indexOf(dte) !== -1; }
/* V9.6.18 · factor de retención según DTE (boleta=BHE, boleta_terceros=BTE).
   Antes ambos usaban FACTOR_BOLETA; ahora cada uno toma su propia tasa de
   tax_rates (BTE = BHE por defecto, así no cambia el cálculo si no hay dato). */
function factorRetencionDte(dte) {
  if (dte === 'boleta_terceros') return FACTOR_BTE;
  if (dteTieneRetencion(dte)) return FACTOR_BOLETA;
  return 1;
}
function montoNetoDesde(costoReal, dte) { const c = Number(costoReal) || 0; if (!c) return 0; return dteTieneRetencion(dte) ? Math.round(c * factorRetencionDte(dte)) : Math.round(c); }
function montoBrutoDesde(liquido, dte) { const l = Number(liquido) || 0; if (!l) return 0; return dteTieneRetencion(dte) ? Math.round(l / factorRetencionDte(dte)) : Math.round(l); }
const UNIDAD_OPTIONS = ['Tarifa Plana', 'Jornadas', 'Horas', 'Personas', 'Locaciones', 'Fotografías'];

const DEMO_PROJECTS = [
  {
    id: 'DEMO-1', client: "Watt's", name: 'Lanzamiento Yogurt Griego de Watt\'s',
    state: 'postproduccion', pe: 'Agustín Muñoz', amount: 8600000, currency: 'CLP',
    alerts: 0, lastActivity: 'Hace 30 min', date: 'Entrega 10.06',
    data: buildProjectData({
      infoProyecto: {
        cliente: "Watt's",
        nombreProyecto: 'Lanzamiento Yogurt Griego de Watt\'s',
        servicio: 'Spot 30s + 6s para RRSS',
        derechos: { tiempo: '6 meses', plataformas: 'Full Digital (Instagram, TikTok, YouTube) y PoP', territorio: 'Chile' },
        contactoCliente: 'Rodrigo Salinas',
        mailContactoCliente: 'rsalinas@watts.cl',
        telefonoContactoCliente: '+56 2 2380 4400',
        productorEjecutivo: 'Agustín Muñoz',
        director: 'Agustín Muñoz',
        jefeProduccion: 'Hugo Bravo',
        condicionPago: '50% contra aprobación, 50% contra entrega final',
        fechaCotizacion: '2026-04-10',
        fechaAprobacion: '2026-04-25',
        fechaEntregaFinal: '2026-06-10'
      },
      finanzas: {
        presupuestoCliente: 8600000,
        gastosAdminPct: 0.05,
        comisiones: [
          { label: 'Comisión Productor Ejecutivo', pct: 0.10 },
          { label: 'Comisión', pct: 0 }
        ]
      },
      serviciosOverrides: [
        { dept: 'Dirección', rol: 'Director', values: { nombre: 'Agustín Muñoz', cantidad: 1, dte: 'factura', confirmado: true, costoReal: 1000000 }},
        { dept: 'Dirección', rol: 'Primer AD', values: { nombre: 'Teresita Sehers', cantidad: 2, dte: 'factura', confirmado: true, costoReal: 400000 }},
        { dept: 'Producción', rol: 'Jefe de Producción', values: { nombre: 'Hugo Bravo', cantidad: 1, dte: 'boleta', confirmado: true, costoReal: 150000 }},
        { dept: 'Dirección de Fotografía', rol: 'Director de Fotografía', values: { nombre: 'Cristóbal Doroso', cantidad: 1, dte: 'factura', confirmado: true, costoReal: 500000 }},
        { dept: 'Dirección de Fotografía', rol: 'Gaffer', values: { nombre: 'Daniel Pérez', cantidad: 2, dte: 'boleta', confirmado: true, costoReal: 360000 }},
        { dept: 'Arte', rol: 'Directora de Arte', values: { nombre: 'Javiera Lamasa', cantidad: 1, dte: 'boleta', confirmado: true, costoReal: 500000 }},
        { dept: 'Arte', rol: 'Vestuarista', values: { nombre: 'Camila Rojas', cantidad: 1, dte: 'boleta', confirmado: true, costoReal: 200000 }},
        { dept: 'Catering', rol: 'Servicio de Catering', values: { cantidad: 18, dte: 'factura', confirmado: true, costoReal: 22000 }}
      ],
      gastosOverrides: [
        { item: 'Caja de Producción', values: { cantidad: 1, confirmado: true, costoReal: 195000 }},
        { item: 'Locación', values: { cantidad: 1, dte: 'factura', confirmado: true, costoReal: 800000 }}
      ],
      talentosOverrides: [
        { item: 'Talento principal', values: { nombre: 'Andrea Bowen', cantidad: 1, valor: 600000, dte: 'boleta', confirmado: true, costoReal: 600000 }}
      ],
      rodajes: [
        { fecha: '2026-05-26', activo: true,  descripcion: 'Interiores — set cocina y comedor', diaId: 'DIA-01' },
        { fecha: '2026-05-27', activo: true,  descripcion: 'Exteriores — terraza y producto', diaId: 'DIA-02' },
        { fecha: '2026-05-28', activo: false, descripcion: 'Día buffer (cancelado)',           diaId: 'DIA-03' }
      ],
      hojaLlamado: {
        version: 1,
        locaciones: [
          { id: 'LOC-01', nombre: 'Casa Vitacura', direccion: 'Av. Vitacura 5200, Vitacura', maps: 'https://maps.google.com/?q=Av+Vitacura+5200', notas: 'Estacionamiento para 4 vehículos. Ingreso producción por portón lateral.' },
          { id: 'LOC-02', nombre: 'Estudio Primate', direccion: 'San Pablo 3400, Quinta Normal', maps: '', notas: 'Set de comedor montado el día anterior.' }
        ],
        dias: {
          'DIA-01': {
            version: 1,
            lastExport: { version: 1, at: '20-05-2026 18:42' },
            infoGeneral: {
              llamadoGeneral: '08:00', almuerzo: '13:00', amanecer: '07:42', atardecer: '18:05',
              wrapCamara: '18:00', wrapLocacion: '19:30', hospital: 'Clínica Alemana — Av. Vitacura 5951', clima: 'Parcialmente nublado · Min 9° Max 19°'
            },
            citacionesExternas: [
              { rol: 'Cliente', nombre: 'Rodrigo Salinas', numero: '+56 2 2380 4400', call: '11:00', locacionId: 'LOC-01', notas: 'Llega para revisión de set principal.' },
              { rol: 'Cliente — Marketing', nombre: 'Daniela Fuentes', numero: '+56 9 7654 3210', call: '11:00', locacionId: 'LOC-01', notas: 'Acompaña a Rodrigo.' }
            ],
            crewOverrides: {
              'Cristóbal Doroso': { call: '07:00', locacionId: 'LOC-01', notas: 'Prelight con gaffer.' },
              'Daniel Pérez': { call: '07:00', locacionId: 'LOC-01', notas: '' }
            }
          }
        }
      }
    })
  },
  {
    id: 'DEMO-2', client: 'Falabella', name: 'Spot Día del Padre de Falabella',
    state: 'venta', pe: 'Teresita Sehers', amount: 5500000, currency: 'CLP',
    alerts: 1, lastActivity: 'Hace 2 horas', date: 'Cotización 20.05',
    data: buildProjectData({
      infoProyecto: {
        cliente: 'Falabella',
        agencia: 'McCann',
        nombreProyecto: 'Spot Día del Padre de Falabella',
        servicio: 'Spot 20s para RRSS',
        contactoCliente: 'Paula Vera',
        productorEjecutivo: 'Teresita Sehers',
        director: 'Agustín Muñoz',
        condicionPago: '50% contra aprobación, 50% contra entrega final',
        fechaCotizacion: '2026-05-18'
      },
      finanzas: {
        presupuestoCliente: 5500000,
        gastosAdminPct: 0.05,
        comisiones: [ { label: 'Comisión', pct: 0 }, { label: 'Comisión', pct: 0 } ]
      },
      serviciosOverrides: [
        { dept: 'Dirección', rol: 'Director', values: { nombre: 'Agustín Muñoz', valor: 700000, cantidad: 1, dte: 'factura' }},
        { dept: 'Dirección', rol: 'Primer AD', values: { valor: 150000, cantidad: 1, dte: 'boleta' }},
        { dept: 'Producción', rol: 'Jefe de Producción', values: { nombre: 'Hugo Bravo', cantidad: 1, dte: 'boleta' }},
        { dept: 'Dirección de Fotografía', rol: 'Director de Fotografía', values: { nombre: 'Cristóbal Doroso', valor: 450000, cantidad: 1, dte: 'factura' }},
        { dept: 'Dirección de Fotografía', rol: 'Gaffer', values: { valor: 150000, cantidad: 1, dte: 'boleta' }},
        { dept: 'Dirección de Fotografía', rol: 'Primer AC', values: { cantidad: 1, dte: 'boleta' }},
        { dept: 'Catering', rol: 'Servicio de Catering', values: { cantidad: 12, dte: 'factura' }}
      ],
      gastosOverrides: [
        { item: 'Locación', values: { valor: 500000, cantidad: 1, dte: 'factura' }},
        { item: 'Caja de Producción', values: { cantidad: 1 }}
      ],
      equiposOverrides: [
        { item: 'Caja de arriendo de equipos', values: { cantidad: 1, dte: 'factura' }}
      ],
      talentosOverrides: [
        { item: 'Talento principal', values: { valor: 400000, cantidad: 1, dte: 'boleta' }},
        { item: 'Talento secundario', values: { valor: 150000, cantidad: 1, dte: 'boleta' }}
      ]
    })
  },
  {
    id: 'DEMO-3', client: 'Merrell', name: 'Campaña Trail Running de Merrell',
    state: 'preproduccion', pe: 'Josefina Cofré', amount: 13000000, currency: 'CLP',
    alerts: 2, lastActivity: 'Hace 1 día', date: 'Rodaje 02.06',
    data: buildProjectData({
      infoProyecto: {
        cliente: 'Merrell',
        nombreProyecto: 'Campaña Trail Running de Merrell',
        servicio: 'Video madre 60s + 4 cápsulas RRSS',
        contactoCliente: 'Ignacio Tapia',
        productorEjecutivo: 'Josefina Cofré',
        director: 'Agustín Muñoz',
        jefeProduccion: 'Hugo Bravo',
        condicionPago: '50% contra aprobación, 50% contra entrega final',
        fechaCotizacion: '2026-05-02',
        fechaAprobacion: '2026-05-12'
      },
      finanzas: {
        presupuestoCliente: 13000000,
        gastosAdminPct: 0.05,
        comisiones: [
          { label: 'Comisión Productora Ejecutiva', pct: 0.08 },
          { label: 'Comisión', pct: 0 }
        ]
      },
      serviciosOverrides: [
        { dept: 'Dirección', rol: 'Director', values: { nombre: 'Agustín Muñoz', valor: 800000, cantidad: 1, dte: 'factura', confirmado: true }},
        { dept: 'Dirección', rol: 'Primer AD', values: { cantidad: 2, dte: 'boleta', confirmado: true }},
        { dept: 'Dirección', rol: 'Segundo AD', values: { cantidad: 2, dte: 'boleta', confirmado: true }},
        { dept: 'Producción', rol: 'Productor Ejecutivo', values: { nombre: 'Josefina Cofré', cantidad: 1, dte: 'factura', confirmado: true }},
        { dept: 'Producción', rol: 'Jefe de Producción', values: { nombre: 'Hugo Bravo', cantidad: 1, dte: 'boleta', confirmado: true }},
        { dept: 'Dirección de Fotografía', rol: 'Director de Fotografía', values: { nombre: 'Cristóbal Doroso', cantidad: 1, dte: 'factura', confirmado: true }},
        { dept: 'Dirección de Fotografía', rol: 'Primer AC', values: { cantidad: 2, dte: 'boleta', confirmado: true }},
        { dept: 'Dirección de Fotografía', rol: 'Gaffer', values: { nombre: 'Daniel Pérez', cantidad: 2, dte: 'boleta', confirmado: true }},
        { dept: 'Dirección de Fotografía', rol: 'Segundo Eléctrico', values: { cantidad: 2, dte: 'boleta', confirmado: true }},
        { dept: 'Dirección de Fotografía', rol: 'DIT / Data Manager', values: { cantidad: 2, dte: 'boleta', confirmado: true }},
        { dept: 'Arte', rol: 'Directora de Arte', values: { nombre: 'Javiera Lamasa', cantidad: 1, dte: 'boleta', confirmado: true }},
        { dept: 'Arte', rol: 'Ambientadora', values: { cantidad: 2, dte: 'boleta', confirmado: true }},
        { dept: 'Arte', rol: 'Maquilladora', values: { cantidad: 2, dte: 'boleta', confirmado: true }},
        { dept: 'Catering', rol: 'Servicio de Catering', values: { cantidad: 14, dte: 'factura', confirmado: true }}
      ],
      gastosOverrides: [
        { item: 'Locación', values: { valor: 800000, cantidad: 1, dte: 'factura', confirmado: true }},
        { item: 'Caja de Producción', values: { cantidad: 1, confirmado: true }},
        { item: 'Gastos de Arte', values: { cantidad: 1, dte: 'factura', confirmado: true }},
        { item: 'Caja de Transporte', values: { cantidad: 1, confirmado: true }}
      ],
      equiposOverrides: [
        { item: 'Caja de arriendo de equipos', values: { valor: 600000, cantidad: 1, dte: 'factura', confirmado: true }}
      ],
      talentosOverrides: [
        { item: 'Talento principal', values: { valor: 600000, cantidad: 1, dte: 'boleta', confirmado: true }},
        { item: 'Talento secundario', values: { valor: 150000, cantidad: 1, dte: 'boleta', confirmado: true }}
      ]
    })
  }
];

// ── Window bridges (los que no venían inline de index.html) ──
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
window.DEMO_PROJECTS         = DEMO_PROJECTS;         // loadDemoData (clásico)
