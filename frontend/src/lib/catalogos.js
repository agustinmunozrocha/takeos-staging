// D4b · Catálogos compartidos — hoja sin dependencias (la consumen modelo y
// data sin ciclo). Movidos desde data.js; los bridges window viajan con ellos
// hasta la pasada de retiro.

export const DEFAULT_DEPARTAMENTOS = {
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
export const DEFAULT_EQUIPOS = [
  { item: 'Caja de arriendo de equipos', valor: 150000, unidad: 'Tarifa Plana' }
];
export const DEFAULT_GASTOS = [
  { item: 'Catering (no servicio)', valor: 18000, unidad: 'Personas' },
  { item: 'Caja de Producción', valor: 200000, unidad: 'Tarifa Plana' },
  { item: 'Caja de Transporte', valor: 80000, unidad: 'Tarifa Plana' },
  { item: 'Locación', valor: 800000, unidad: 'Tarifa Plana' },
  { item: 'Gastos de Locación', valor: 100000, unidad: 'Tarifa Plana' },
  { item: 'Gastos de Arte', valor: 200000, unidad: 'Tarifa Plana' },
  { item: 'Gastos de Vestuario', valor: 120000, unidad: 'Tarifa Plana' }
];
export const DEFAULT_TALENTOS = [
  { item: 'Talento principal', valor: 600000, unidad: 'Tarifa Plana' },
  { item: 'Talento secundario', valor: 150000, unidad: 'Tarifa Plana' }
];
export const COTIZACION_CONDICIONES_DEFAULTS = {
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
export const LOC_ESTADO_RANK = { confirmada: 3, candidata: 2, descartada: 1 };
export const ROLES_OPERATIVOS = ['Crew', 'Interno', 'Contacto cliente', 'Proveedor individual'];

// Espejos window (compat; se retiran en d4c cuando el último lector window muera)


