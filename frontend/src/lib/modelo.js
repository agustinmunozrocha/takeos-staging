// Modelo de contactos (canónico↔legacy) + fábrica de proyectos — extraído de index.html (Etapa C5)
// ⚠ ORDEN: este módulo DEBE importarse ANTES que lib/data.js — el inicializador
// de DEMO_PROJECTS (data.js, eval-time) llama buildProjectData/_clientUuid vía window.

// D1e · imports reales (regla lib-precede: solo de libs anteriores en main.js)
import { BD_CONTACTOS, BD_EMPRESAS, BD_EMPRESAS_BYID, BD_LOC, BD_PERSONAS, BD_TALENTOS } from './state.js';

import { DEFAULT_DEPARTAMENTOS, DEFAULT_EQUIPOS, DEFAULT_GASTOS, DEFAULT_TALENTOS, COTIZACION_CONDICIONES_DEFAULTS, LOC_ESTADO_RANK, ROLES_OPERATIVOS } from './catalogos.js';
/* ── DTE: texto del Excel/Form ("Boleta de Honorarios") → código interno ── */
function _tipoDTEaCodigo(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (!t) return null;
  if (t.indexOf('terceros') !== -1) return 'boleta_terceros';
  if (t.indexOf('exenta') !== -1) return 'factura_exenta';
  if (t.indexOf('boleta') !== -1) return 'boleta';
  if (t.indexOf('factura') !== -1) return 'factura';
  return null;
}

/* ── Construcción de bloques de perfil ────────────────────────────────── */
export function _buildPerfilPago(o) {
  const banco = _norm(o.banco), codigoBanco = _norm(o.codigoBanco) || (typeof _codigoBancoSBIF === 'function' ? _codigoBancoSBIF(o.banco) : '');
  const tipoCuenta = _norm(o.tipoCuenta), nCuenta = _norm(o.nCuenta || o.numeroCuenta);
  const tipoDTE = _norm(o.tipoDTE), dteHabitual = o.dteHabitual || _tipoDTEaCodigo(tipoDTE) || null;
  const cuentaExtranjera = !!o.cuentaExtranjera, datosExtranjeros = _norm(o.datosExtranjeros);
  if (!banco && !nCuenta && !tipoCuenta && !tipoDTE && !dteHabitual && !cuentaExtranjera && !datosExtranjeros) return null;
  const bancoOf = banco && typeof _nombreBancoOficial === 'function' ? _nombreBancoOficial(banco) : banco;
  return { banco: bancoOf, codigoBanco, tipoCuenta, nCuenta, tipoDTE, dteHabitual, cuentaExtranjera, datosExtranjeros };
}
export function _buildPerfilTalento(o) {
  const f = ['genero','fechaNacimiento','altura','apariencia','areas','tallaPolera','tallaPantalon','tallaCalzado','fotosLink','reelLink'];
  const out = {}; let any = false;
  f.forEach(k => { out[k] = _norm(o[k]); if (out[k]) any = true; });
  return any ? out : null;
}

/* Normaliza un contacto que viene de un save nuevo (asegura forma). */
function normalizeContacto(c) {
  if (!c || typeof c !== 'object') return c;
  if (!c.id) c.id = _genId('ctk', BD_CONTACTOS);
  if (!Array.isArray(c.roles) || !c.roles.length) c.roles = ['Crew'];
  ['nombre','rut','email','telefono','rolHabitual','empresaId','relacionEmpresa',
   'direccion','direccionLinea2','comuna','ciudad','restriccion','fechaNacimiento','notas']
    .forEach(k => { if (typeof c[k] !== 'string') c[k] = _norm(c[k]); });
  if (c.perfilPago && typeof c.perfilPago !== 'object') c.perfilPago = null;
  if (c.perfilTalento && typeof c.perfilTalento !== 'object') c.perfilTalento = null;
  return c;
}

/* ════════════════════════════════════════════════════════════════════
   INGEST · proyecciones legacy (V7.2) → modelo canónico unificado
   Se usa al cargar un save VIEJO (sin bdContactos) o un .xlsx de 3 hojas.
   Espejo de migrate_bd.py. Dedup por RUT > email > nombre.
   ════════════════════════════════════════════════════════════════════ */
export function ingestLegacyIntoContactos() {
  _clearStore(BD_CONTACTOS);
  _clearStore(BD_EMPRESAS_BYID);
  const index = {};                // dedupKey → contactId
  const empresaByName = {};         // nombreFantasia.toLowerCase() → empresaId

  // 1) EMPRESAS primero (para poder enlazar)
  Object.keys(BD_EMPRESAS).forEach(k => {
    const e = BD_EMPRESAS[k] || {};
    const nf = _norm(e.nombreFantasia || k);
    if (!nf) return;
    const id = e.id && String(e.id).indexOf('emp_') === 0 ? e.id : _genId('emp', BD_EMPRESAS_BYID);
    BD_EMPRESAS_BYID[id] = {
      id, rutEmpresa: _norm(e.rutEmpresa), nombreFantasia: nf,
      razonSocial: _norm(e.razonSocial), tipo: _norm(e.tipo),
      giroSII: _norm(e.giroSII), giroInformal: _norm(e.giroInformal),
      contactoPrincipal: _norm(e.contactoPrincipal), contactoPrincipalId: _norm(e.contactoPrincipalId),
      emailContacto: _norm(e.emailContacto), telefonoContacto: _norm(e.telefonoContacto),
      web: _norm(e.web), notas: _norm(e.notas)
    };
    empresaByName[nf.toLowerCase()] = id;
  });

  const register = (cid, rut, email, nombre) =>
    _dedupKeys(rut, email, nombre).forEach(k => { if (!(k in index)) index[k] = cid; });
  const findExisting = (rut, email, nombre) => {
    for (const k of _dedupKeys(rut, email, nombre)) if (k in index) return index[k];
    return null;
  };

  // 2) PERSONAS → contactos
  Object.keys(BD_PERSONAS).forEach(k => {
    const p = BD_PERSONAS[k] || {};
    const nombre = _norm(p.nombre || k);
    if (!nombre) return;
    const rut = _norm(p.rut), email = _norm(p.email || p.mail);
    const id = _genId('ctk', BD_CONTACTOS);
    BD_CONTACTOS[id] = {
      id, nombre, rut, email, telefono: _norm(p.telefono),
      roles: Array.isArray(p.roles) && p.roles.length ? p.roles.slice() : ['Crew'],
      rolHabitual: _norm(p.rolHabitual),
      empresaId: empresaByName[_norm(p.empresaAsociada).toLowerCase()] || '',
      relacionEmpresa: _norm(p.relacionEmpresa),
      direccion: _norm(p.direccion), direccionLinea2: _norm(p.direccionLinea2 || p.direccion2),
      comuna: _norm(p.comuna), ciudad: _norm(p.ciudad),
      restriccion: _norm(p.restriccion), fechaNacimiento: _norm(p.fechaNacimiento), notas: _norm(p.notas),
      perfilPago: _buildPerfilPago(p),
      perfilTalento: null
    };
    register(id, rut, email, nombre);
  });

  // 3) TALENTOS → merge en contacto existente (por email/nombre) o nuevo
  Object.keys(BD_TALENTOS).forEach(k => {
    const t = BD_TALENTOS[k] || {};
    const nombre = _norm(t.nombre || k);
    if (!nombre) return;
    const email = _norm(t.email);
    const perfil = _buildPerfilTalento(t);
    const existing = findExisting('', email, nombre);
    if (existing) {
      const c = BD_CONTACTOS[existing];
      if (c.roles.indexOf('Talento') === -1) c.roles.push('Talento');
      if (perfil) c.perfilTalento = c.perfilTalento ? Object.assign({}, perfil, c.perfilTalento) : perfil;
      if (!c.email && email) c.email = email;
      if (!c.telefono) c.telefono = _norm(t.telefono);
      if (!c.ciudad) c.ciudad = _norm(t.ciudad);
    } else {
      const id = _genId('ctk', BD_CONTACTOS);
      BD_CONTACTOS[id] = {
        id, nombre, rut: '', email, telefono: _norm(t.telefono),
        roles: ['Talento'], rolHabitual: '',
        empresaId: '', relacionEmpresa: '',
        direccion: '', direccionLinea2: '', comuna: '', ciudad: _norm(t.ciudad),
        restriccion: '', fechaNacimiento: '', notas: _norm(t.notas),
        perfilPago: null, perfilTalento: perfil
      };
      register(id, '', email, nombre);
    }
  });

  // 4) Resolver contactoPrincipal de empresas → contactId (conservador: solo matches)
  Object.keys(BD_EMPRESAS_BYID).forEach(id => {
    const e = BD_EMPRESAS_BYID[id];
    if (!e.contactoPrincipal || e.contactoPrincipalId) return;
    const m = findExisting('', e.emailContacto, e.contactoPrincipal);
    if (m) {
      e.contactoPrincipalId = m;
      const c = BD_CONTACTOS[m];
      if (!c.empresaId) { c.empresaId = id; if (!c.relacionEmpresa) c.relacionEmpresa = 'Contacto'; }
    }
  });
}

/* ════════════════════════════════════════════════════════════════════
   SYNC · modelo canónico → proyecciones legacy (lo que lee la UI hoy)
   ════════════════════════════════════════════════════════════════════ */
function _empresaNombrePorId(eid) {
  const e = BD_EMPRESAS_BYID[eid];
  return e ? e.nombreFantasia : '';
}
function _legacyPersonaView(c) {
  const pago = c.perfilPago || {};
  const v = {
    _id: c.id, nombre: c.nombre, rut: c.rut,
    email: c.email, mail: c.email, telefono: c.telefono,
    roles: c.roles.slice(), rolHabitual: c.rolHabitual,
    empresaAsociada: _empresaNombrePorId(c.empresaId), relacionEmpresa: c.relacionEmpresa,
    direccion: c.direccion, direccionLinea2: c.direccionLinea2, direccion2: c.direccionLinea2,
    comuna: c.comuna, ciudad: c.ciudad,
    restriccion: c.restriccion, fechaNacimiento: c.fechaNacimiento, notas: c.notas,
    banco: pago.banco || '', codigoBanco: pago.codigoBanco || '',
    tipoCuenta: pago.tipoCuenta || '', nCuenta: pago.nCuenta || '', numeroCuenta: pago.nCuenta || '',
    tipoDTE: pago.tipoDTE || '', dteHabitual: pago.dteHabitual || null,
    cuentaExtranjera: !!pago.cuentaExtranjera, datosExtranjeros: pago.datosExtranjeros || ''
  };
  return v;
}
function _legacyTalentoView(c) {
  const t = c.perfilTalento || {};
  return {
    _id: c.id, nombre: c.nombre, email: c.email, telefono: c.telefono,
    genero: t.genero || '', edad: t.edad || '', altura: t.altura || '',
    apariencia: t.apariencia || '', ciudad: c.ciudad, areas: t.areas || '',
    tallaPolera: t.tallaPolera || '', tallaPantalon: t.tallaPantalon || '', tallaCalzado: t.tallaCalzado || '',
    fotosLink: t.fotosLink || '', reelLink: t.reelLink || '', notas: c.notas
  };
}
export function syncLegacyFromContactos() {
  _clearStore(BD_PERSONAS); _clearStore(BD_TALENTOS); _clearStore(BD_EMPRESAS);
  Object.keys(BD_CONTACTOS).forEach(id => {
    const c = BD_CONTACTOS[id];
    if (!c || !c.nombre) return;
    const esOperativo = c.roles.some(r => ROLES_OPERATIVOS.indexOf(r) !== -1);
    const esTalento = c.roles.indexOf('Talento') !== -1;
    if (esOperativo || !esTalento) BD_PERSONAS[c.nombre] = _legacyPersonaView(c);  // todo lo no-talento-puro
    if (esTalento) BD_TALENTOS[c.nombre] = _legacyTalentoView(c);
  });
  Object.keys(BD_EMPRESAS_BYID).forEach(id => {
    const e = BD_EMPRESAS_BYID[id];
    BD_EMPRESAS[e.nombreFantasia] = {
      _id: e.id, rutEmpresa: e.rutEmpresa, nombreFantasia: e.nombreFantasia,
      razonSocial: e.razonSocial, tipo: e.tipo, giroSII: e.giroSII, giroInformal: e.giroInformal,
      contactoPrincipal: e.contactoPrincipal, contactoPrincipalId: e.contactoPrincipalId,
      emailContacto: e.emailContacto, telefonoContacto: e.telefonoContacto, web: e.web, notas: e.notas
    };
  });
}

/* Reconstruye el modelo canónico desde un objeto de save (nuevo o viejo). */
export function hydrateContactStore(obj) {
  if (obj && obj.bdContactos && typeof obj.bdContactos === 'object') {
    _clearStore(BD_CONTACTOS); _clearStore(BD_EMPRESAS_BYID);
    Object.keys(obj.bdContactos).forEach(k => {
      const c = normalizeContacto(obj.bdContactos[k]);
      if (c && c.id) BD_CONTACTOS[c.id] = c;
    });
    if (obj.bdEmpresasById && typeof obj.bdEmpresasById === 'object') {
      Object.keys(obj.bdEmpresasById).forEach(k => {
        const e = obj.bdEmpresasById[k];
        if (e && e.id) BD_EMPRESAS_BYID[e.id] = e;
      });
    }
    syncLegacyFromContactos();
  } else {
    // Formato viejo: las proyecciones legacy ya fueron pobladas por el caller.
    ingestLegacyIntoContactos();
    syncLegacyFromContactos();
  }
}

/* Chokepoint histórico: cualquier ruta que antes llamaba migrateAllPersonas()
   ahora simplemente re-sincroniza las proyecciones desde el canónico. */

/* Vista del autocompletado del Presupuesto: solo Crew + Interno. */
/* getBDPresupuesto → movido a src/modules/presupuesto-cotizacion.js (Etapa 2) */
/* Vista de casting (incremento 2 la usará en UI). */

/* _clientUuid: necesaria en startup (buildDefaultProjectData / DEMO_PROJECTS).
   El módulo presupuesto-cotizacion.js tiene su propia copia y puentea window._clientUuid
   al cargar, pero ese puente llega después del classic script — este stub cubre el gap. */
export function _clientUuid() {
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (window.crypto && crypto.getRandomValues) ? (crypto.getRandomValues(new Uint8Array(1))[0] % 16) : Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function buildDefaultProjectData() {
  const data = {
    infoProyecto: {
      cliente: '',
      clienteEmpresaId: '',
      agencia: '',
      nombreProyecto: '',
      servicio: 'Producción',
      productora: 'Primate Films',
      // V8.3: bloque DERECHOS (fuente única para Legal/cesiones, cotización, alertas de vencimiento, etc.)
      derechos: { tiempo: '', plataformas: '', territorio: '' },
      contactoCliente: '',
      mailContactoCliente: '',
      telefonoContactoCliente: '',
      contactoAgencia: '',
      mailContactoAgencia: '',
      telefonoContactoAgencia: '',
      productorEjecutivo: '',
      director: '',
      jefeProduccion: '',
      condicionPago: '50% contra aprobación, 50% contra entrega final',
      fechaCotizacion: '',
      fechaAprobacion: '',
      fechaEntregaFinal: '',
      fechaPago: ''
    },
    /* V5.1: campos financieros recuperados del Master Sheet V2.4.1
       (tabla resumen del Presupuesto, filas 9-18).
       - presupuestoCliente: monto NETO que se le cobra al cliente
       - gastosAdminPct: % sobre subtotal producción (default 5%)
       - comisiones: array dinámico editable
         V5.1.1: nombres ya no son fijos. Usuario puede renombrar y
         agregar/eliminar comisiones libremente.
       - riesgos (V5.2.1): array dinámico de riesgos/contingencias.
         Cada uno tiene label, mode ('monto' | 'pct'), value (monto fijo
         o porcentaje del subtotal producción). Pensado para fees de
         transferencia, comisiones de plataforma, contingencias
         climáticas, etc. Gastos Administrativos sigue siendo fijo y
         obligatorio; esto es adicional. */
    finanzas: {
      presupuestoCliente: 0,
      gastosAdminPct: 0.05,
      heRecargoPct: 150,   // V10.5.0: recargo HE por defecto del proyecto (Biblia §3.4.2)
      frozen: null,  // V5.11 (Nota 3): {admin, riesgos[]} congelados al aprobar
      comisiones: [
        { label: 'Comisión',   mode: 'pct', value: 0 },
        { label: 'Comisión',   mode: 'pct', value: 0 }
      ],
      riesgos: [],
      /* V5.3 (Nota 3): EXTRAS DE INGRESO post-aprobación.
         Son ampliaciones que se le COBRAN al cliente DESPUÉS de aprobar,
         sin tocar la cotización original (presupuestoCliente queda
         congelado). Cada extra: { label, monto }. Suman al "Presupuesto
         Cliente Efectivo" y por lo tanto a la Ganancia Parcial.
         OJO: esto es distinto a las filas EXTRA de costo (flag `extra`
         en las tablas del presupuesto, V5.2.2). Aquellas suman al COSTO;
         estas suman al INGRESO. Conviven sin pisarse. */
      extras: []
    },
    servicios: {},
    gastos: DEFAULT_GASTOS.map(g => ({ nombre: '', item: g.item, valor: g.valor, cantidad: 0, unidad: g.unidad, dte: null, confirmado: false, costoReal: null, clientUuid: _clientUuid(), version: null, _dirty: true, _dirtySeq: 1 })),
    equipos: DEFAULT_EQUIPOS.map(e => ({ nombre: '', item: e.item, valor: e.valor, cantidad: 0, unidad: e.unidad, dte: null, confirmado: false, costoReal: null, clientUuid: _clientUuid(), version: null, _dirty: true, _dirtySeq: 1 })),
    talentos: DEFAULT_TALENTOS.map(t => ({ nombre: '', item: t.item, valor: t.valor, cantidad: 0, unidad: t.unidad, dte: null, confirmado: false, costoReal: null, clientUuid: _clientUuid(), version: null, _dirty: true, _dirtySeq: 1 })),
    crewExtra: {},  // nombre → { medioTransporte }
    responsables: {},  // V8.5: responsable por sección (key de módulo → nombre BD)
    tareas: [],        // V8.6: tareas del proyecto (con sección, asignado, comentarios, adjuntos)
    senales: [],       // V8.6: señales de atención más allá de tareas (ej. cambió el guion técnico)
    asistentes: { cliente: 0, agencia: 0, externo: 0 },  // V5.9 (Nota 4): conteo para catering/logística
    crewExternos: [],  // V5.10 (#12): cliente/agencia/visitas en el Crew (comen, transporte, etc.)

    /* ════════════════════════════════════════════════════════════════
       V6.0: COTIZACIÓN + SISTEMA DE OFERTAS
       ════════════════════════════════════════════════════════════════
       Un proyecto puede presentar al cliente VARIAS ofertas (packs). Cada
       oferta tiene su contenido de cara al cliente (descripción, valor,
       qué incluye / qué NO, entregables) y, opcionalmente, un PRESUPUESTO
       ALTERNATIVO interno: una copia liviana y costeable del presupuesto
       (sin nombres ni datos operativos) que existe SOLO para saber si esa
       oferta es rentable. No es un presupuesto real del proyecto.

       Las CONDICIONES del servicio viven a nivel de proyecto (las comparten
       todas las ofertas, que es el caso real: una cotización = un set de
       condiciones). El override por-oferta se difiere a propósito hasta que
       un caso real lo exija (PRD V2 §10.6: no diseñar para la excepción
       antes de validar el caso común).

       Esto es el dato de la V6.0. La Carta de Cotización en PDF (V6.1) solo
       RENDERIZA esta estructura; no hay lógica de negocio en el papel. */
    cotizacion: {
      fechaEmision: '',          // se autocompleta a hoy al abrir el módulo
      representanteCliente: '',   // "Representante Cliente" de la carta actual
      condiciones: Object.assign({}, COTIZACION_CONDICIONES_DEFAULTS),
      ofertas: []                 // [{ id, nombre, valorCliente, descripcion, incluye[], noIncluye[], entregables{}, presupuestoAlt|null }]
    },

    /* ════════════════════════════════════════════════════════════════
       V5.3 · CAPA 3 — RODAJES Y HOJA DE LLAMADO
       ════════════════════════════════════════════════════════════════
       RODAJES: días reales de rodaje. Cada día tiene fecha, estado
       activo/cancelado (NUNCA se elimina, se desactiva — PRD §5.6 y
       Manual §9.5), descripción breve e ID autogenerado (DIA-01...).
       El ID es el identificador estable que referencia la Hoja de
       Llamado. Replica la pestaña RODAJES del Master Sheet pero
       dinámico: solo existen las filas que el usuario crea.

       HOJA DE LLAMADO: vista operativa POR DÍA (no fuente de verdad,
       PRD §06 / Manual §4.7). Estructura calcada del Master Sheet:
         - locaciones: tabla a nivel proyecto (LOC-01, LOC-02...),
           referenciadas por las citaciones.
         - dias[diaId]: datos propios de cada día de rodaje.
             · infoGeneral: llamado, almuerzo, amanecer, atardecer,
               wrap cámara, wrap locación, hospital, clima.
             · citacionesExternas: personas fuera del Crew (cliente,
               agencia, visitas) — input 100% manual (PRD §7.1).
             · crewOverrides: ajustes por persona del crew confirmado
               (call/locación/notas). El crew base se deriva del
               Presupuesto (supuesto del Sheet: crew asociado al
               proyecto completo; la precisión diaria vive aquí — §7.2).
         - version: se incrementa al marcar cambios relevantes (§5.9).
       ════════════════════════════════════════════════════════════════ */
    rodajes: [],
    // V8.2: uso por-proyecto de locaciones (PROJ_LOC). Lo canónico vive en BD_LOC.
    // [{ locId:'LOC-NN', estado:'candidata|confirmada|descartada', costo, contratacion, notasProy }]
    locaciones: [],
    hojaLlamado: {
      version: 1,
      locaciones: [],          // LEGADO V8.1- (migrado a BD_LOC/PROJ_LOC en V8.2; ya no se edita aquí)
      dias: {}                 // diaId → { infoGeneral, citacionesExternas:[], crewOverrides:{} }
    }
  };
  for (const dept in DEFAULT_DEPARTAMENTOS) {
    data.servicios[dept] = DEFAULT_DEPARTAMENTOS[dept].map(r => ({
      nombre: '', rol: r.rol, valor: r.valor, unidad: r.unidad,
      dte: null, cantidad: 0, confirmado: false, costoReal: null
    }));
  }
  return data;
}

/* Helper para hidratar datos demo: aplica overrides sobre el default */
export function buildProjectData(overrides) {
  const data = buildDefaultProjectData();
  if (overrides.infoProyecto) Object.assign(data.infoProyecto, overrides.infoProyecto);
  if (overrides.finanzas) Object.assign(data.finanzas, overrides.finanzas);
  if (overrides.serviciosOverrides) {
    overrides.serviciosOverrides.forEach(o => {
      const row = data.servicios[o.dept]?.find(r => r.rol === o.rol);
      if (row) Object.assign(row, o.values);
    });
  }
  if (overrides.gastosOverrides) {
    overrides.gastosOverrides.forEach(o => {
      const row = data.gastos.find(r => r.item === o.item);
      if (row) Object.assign(row, o.values);
    });
  }
  if (overrides.equiposOverrides) {
    overrides.equiposOverrides.forEach(o => {
      const row = data.equipos.find(r => r.item === o.item);
      if (row) Object.assign(row, o.values);
    });
  }
  if (overrides.talentosOverrides) {
    overrides.talentosOverrides.forEach(o => {
      const row = data.talentos.find(r => r.item === o.item);
      if (row) Object.assign(row, o.values);
    });
  }
  // V5.3: hidratación de Capa 3 para proyectos demo
  if (overrides.rodajes) data.rodajes = overrides.rodajes;
  if (overrides.hojaLlamado) {
    if (overrides.hojaLlamado.locaciones) data.hojaLlamado.locaciones = overrides.hojaLlamado.locaciones;
    if (overrides.hojaLlamado.dias) data.hojaLlamado.dias = overrides.hojaLlamado.dias;
    if (overrides.hojaLlamado.version) data.hojaLlamado.version = overrides.hojaLlamado.version;
  }
  return data;
}

// ── Window bridges (3 barridos func+const) ──
window._clientUuid = _clientUuid;
window.buildProjectData = buildProjectData;
window.syncLegacyFromContactos = syncLegacyFromContactos;

// ═══ Helpers de stores + modelo de locaciones de proyecto (Etapa C6) ═══
export function normLocName(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' '); }
// LOC_ESTADO_RANK → movido a src/lib/data.js (Etapa B3)
function dedupeProjectLocaciones(project) {
  const d = project && project.data;
  if (!d || !Array.isArray(d.locaciones) || d.locaciones.length < 2) return;
  const rank = e => LOC_ESTADO_RANK[e] || 0;
  const fold = (keep, u) => {
    if (rank(u.estado) > rank(keep.estado)) keep.estado = u.estado;
    if (!keep.costo && u.costo) keep.costo = u.costo;
    if (!keep.contratacion && u.contratacion) keep.contratacion = u.contratacion;
    if (!keep.notasProy && u.notasProy) keep.notasProy = u.notasProy;
  };
  const byId = {}; const pass1 = [];
  d.locaciones.forEach(u => { if (!u || !u.locId) return; if (byId[u.locId]) fold(byId[u.locId], u); else { byId[u.locId] = u; pass1.push(u); } });
  const byName = {}; const result = [];
  pass1.forEach(u => {
    const nm = normLocName((bdLocFind(u.locId) || {}).nombre);
    if (!nm) { result.push(u); return; }
    if (byName[nm]) fold(byName[nm], u); else { byName[nm] = u; result.push(u); }
  });
  if (result.length !== d.locaciones.length) { d.locaciones.length = 0; result.forEach(u => d.locaciones.push(u)); }
}

function migrateProjectLocaciones(project) {
  if (!project || !project.data) return;
  const d = project.data;
  if (!Array.isArray(d.locaciones)) d.locaciones = [];
  const hl = d.hojaLlamado;
  const legacy = hl && Array.isArray(hl.locaciones) ? hl.locaciones : [];
  if (!legacy.length || d._locMigrated) { d._locMigrated = true; return; }
  legacy.forEach(old => {
    const locId = old.id || nextLocIdBD();
    if (!bdLocFind(locId)) {
      BD_LOC.push({ locId: locId, nombre: old.nombre || '', direccion: old.direccion || '', direccion2: old.direccion2 || '', comuna: old.comuna || '', ciudad: old.ciudad || 'Santiago', region: old.region || '', maps: old.maps || '', orientacion: old.orientacion || '—', contactos: [], notas: old.notas || '', fotos: [] });
    }
    if (!projLocFind(project, locId)) {
      d.locaciones.push({ locId: locId, estado: 'confirmada', costo: 0, contratacion: '', notasProy: '' });
    }
  });
  d._locMigrated = true;
  // hl.locaciones queda como campo legado (ya no se renderiza ni edita).
}
export function ensureProjectLoc(project) { if (project && project.data) { if (!Array.isArray(project.data.locaciones)) project.data.locaciones = []; if (!project.data._locMigrated) migrateProjectLocaciones(project); dedupeProjectLocaciones(project); } return project ? project.data.locaciones : []; }

/* V8.3 — BD DE LEGAL (transversal, canónica). Cuarta categoría de la BD,
   junto a Personas/Empresas/Locaciones. Los documentos legales no mueren
   con el proyecto: viven en este archivo global y consultable. Cada
   registro referencia un proyecto y una contraparte (persona o locación).
   El tab Legal de un proyecto es una vista filtrada de BD_LEGAL. */
export function _genId(prefix, store) {
  let id;
  do { id = prefix + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
  while (store[id]);
  return id;
}
export function _clearStore(s) { Object.keys(s).forEach(k => delete s[k]); }
function _norm(v) { return (v == null) ? '' : String(v).trim(); }
export function _dedupKeys(rut, email, nombre) {
  const k = [];
  if (rut) k.push('rut::' + rut);
  if (email) k.push('email::' + email);
  if (nombre) k.push('name::' + nombre.toLowerCase());
  return k;
}

// MODELO CONTACTOS: _tipoDTEaCodigo, _buildPerfilPago/Talento, normalizeContacto, ingestLegacyIntoContactos, _legacyPersonaView, _legacyTalentoView, syncLegacyFromContactos, hydrateContactStore, migratePersona(s), getBDCasting → movido a src/lib/modelo.js (Etapa C5)


/* ════════════════════════════════════════════════════════════════════
   ESTRUCTURA POR DEFECTO DE DEPARTAMENTOS (Presupuesto)
   ════════════════════════════════════════════════════════════════════
   Rescatado del V4. Define los roles iniciales que tiene un proyecto
   nuevo al crearse. La idea es que el usuario rara vez agregue roles
   nuevos: edita los que vienen por defecto.
   ════════════════════════════════════════════════════════════════════ */
// DEFAULT_DEPARTAMENTOS, DEFAULT_GASTOS, DEFAULT_EQUIPOS, DEFAULT_TALENTOS → movido a src/lib/data.js (Etapa B3)

/* ════════════════════════════════════════════════════════════════════
   FÁBRICA: data por defecto de un proyecto vacío
   ════════════════════════════════════════════════════════════════════
   Cuando un proyecto se crea, esta fábrica le da estructura inicial.
   Aquí no se piensa en presentación, solo en estructura del dato.
   ════════════════════════════════════════════════════════════════════ */
/* V6.0: valores por defecto de las condiciones del servicio, tomados de la
   carta de cotización real de Primate Films (caso Carpintero Negro). Son
   variables editables: la Carta de Cotización (V6.1) las inyecta en el texto.
   Montos en CLP; porcentajes como enteros (50 = 50%). */
// COTIZACION_CONDICIONES_DEFAULTS → movido a src/lib/data.js (Etapa B3)

// FÁBRICA PROYECTOS: _clientUuid, buildDefaultProjectData, buildProjectData → movido a src/lib/modelo.js (Etapa C5)

/* ════════════════════════════════════════════════════════════════════
   V5.6 (Nota 3): DATOS DE EJEMPLO.
   El Control Room arranca VACÍO para uso real. Estos proyectos demo solo
   se cargan con el botón "Cargar datos de ejemplo". Siguen la spec de
   Agustín: nomenclatura "Proyecto de Cliente", 5–15M cobrados a cliente,
   5–15 personas de crew, margen 20–40%, e invitados de cliente en la
   hoja de llamado. Montos verificados por script.
   ════════════════════════════════════════════════════════════════════ */
// DEMO_PROJECTS (su inicializador corre al evaluar data.js; builders clásicos ya globales) → movido a src/lib/data.js (Etapa B3)

/* V5.6 (Nota 3): el Control Room arranca vacío para uso operacional real.
   Los proyectos demo se cargan a demanda con "Cargar datos de ejemplo". */

// ── Bridges C6 (barrido final) ──
window._norm = _norm;
window.ensureProjectLoc = ensureProjectLoc;
