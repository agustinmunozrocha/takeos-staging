// DAL — Capa de Acceso a Datos Supabase — extraído de index.html (Etapa B1)
// src/modules/dal.js
// Lectura/escritura remota de contactos, empresas, locaciones, legal, perfil,
// cargos y proyectos (+ manejo de conflictos de concurrencia). El guardado
// LOCAL (autosave/snapshots/undo) permanece en index.html hasta B2.
// Los flags *_SOURCE y _TOPE_COLAB* viven en window (declarados en lib/state.js);
// aquí se escriben via window.X. El resto del estado DAL (sets de IDs conocidos,
// timers de debounce, mapas label↔code) es interno del módulo.

// D1e · imports reales. CICLO DURO boot⇄dal resuelto por dirección: boot→dal
// es import (down-call); dal→boot QUEDA VÍA WINDOW (up-edge: _bootCoverHide,
// _setOrgActiva, aplicarMarcaOrg, applyPermisosUI, renderTopbarUser,
// setCurrentUser, orgNombre — mueren en D2/D3). También diferidos anti-ciclo:
// kanban (5), bd (2), cargos (3), gastos (goSavePresup), legal (renderLegal),
// locaciones (2).
import { escapeHtml, showToast } from '../lib/helpers.js';
import { BD_CONTACTOS, BD_EMPRESAS_BYID, BD_LEGAL, BD_LEGAL_TPL, BD_LOC, EMPRESA_PERFIL, ORG_SERVICIOS, PROJECTS, STATE, setUsuarioActual, setTopeColab, setTopeColabOrg, setSource, setTakeosPerfil, setTakeosAcceso, ORG_ID, CONTACTS_SOURCE, LEGAL_SOURCE, LOCATIONS_SOURCE, PERFIL_SOURCE, PROJECTS_SOURCE, TAKEOS_PERFIL, _TOPE_COLAB, _TOPE_COLAB_ORG } from '../lib/state.js';
import { _clearStore, _clientUuid, buildDefaultProjectData, syncLegacyFromContactos } from '../lib/modelo.js';
import { BANCOS_CHILE, DTE_LABEL } from '../lib/data.js';
import { _authBlockWriteToast, authPuedeGuardarOperaciones, authPuedeGuardarProyecto } from '../lib/auth.js';
import { fmtMoney } from '../lib/calc.js';
import { bancoCodigo, showModal } from '../lib/ui.js';
import { navigateToModule, renderModule } from '../lib/nav.js';
import { restoreLocalLocPhotos } from './persistencia-local.js';
import { _budgetFindRow, addRow } from './presupuesto-cotizacion.js';
import { manejarErrorPlan } from './plan-limites.js';

import { _lastViewLeer, navigateToControlRoom, navigateToProject, renderKanban, renderMetrics } from './kanban.js';
import { bdLocFind, renderLocaciones } from './locaciones.js';
import { openGlobalBDPersonas, renderBDPersonas } from './bd.js';
import { renderLegal } from './legal.js';
import { gancho, define } from '../lib/ganchos.js';
export async function dalCargarCargos(project) {
  if (!project || project.data._cargosOK) return;
  if (!sb || PROJECTS_SOURCE !== 'supabase') { project.data._cargosOK = true; return; }
  try {
    const r = await sb.from('project_cargos')
      .select('id, cargo, custom, persona_nombre, contact_id, tipo, perfil, estado, invited_user_id, posicion')
      .eq('project_id', project.id).order('posicion', { ascending: true });
    if (r.error) throw r.error;
    const rows = r.data || [];
    if (rows.length === 0) {
      let st = null;
      try { st = JSON.parse(localStorage.getItem(gancho('_cargosKey')(project)) || 'null'); } catch (e) { st = null; }
      if (Array.isArray(st) && st.length) {
        project.data.cargos = st;
        const ok = await dalGuardarCargos(project);
        if (ok) { try { localStorage.removeItem(gancho('_cargosKey')(project)); } catch (e) {} }
        project.data._cargosOK = true;
        return;
      }
      project.data.cargos = [];
    } else {
      project.data.cargos = rows.map(function (c) {
        return { id: c.id, cargo: c.cargo || '', custom: !!c.custom, personaNombre: c.persona_nombre || '',
                 contactId: c.contact_id || null, tipo: c.tipo || 'interno', perfil: c.perfil || '',
                 estado: c.estado || 'sin-asignar', invitedUserId: c.invited_user_id || null };
      });
    }
    project.data._cargosOK = true;
    gancho('_cargosDerivarRECI')(project);
  } catch (e) {
    console.error('[dal] cargar cargos', e);
    project.data._cargosOK = true;   // no bloquea el render; queda vacío en memoria
  }
}

export async function dalGuardarCargos(project) {
  if (!sb || PROJECTS_SOURCE !== 'supabase' || !project) return false;
  try {
    const payload = (project.data.cargos || []).map(function (c) {
      return { id: c.id, cargo: c.cargo, custom: !!c.custom, personaNombre: c.personaNombre || '',
               tipo: c.tipo, perfil: c.perfil || '', estado: c.estado,
               contactId: c.contactId || gancho('_cargoContactIdPorNombre')(c.personaNombre),
               invitedUserId: c.invitedUserId || null };
    });
    const { error } = await sb.rpc('guardar_cargos', { p_project_id: project.id, p_cargos: payload });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('[dal] guardar cargos', e);
    if (manejarErrorPlan(e)) return false;   // tope de colaboradores por proyecto -> cartel "sube de plan"
    try { showToast({ kind: 'warning', title: 'Cargos sin sincronizar', body: (e && e.message) ? String(e.message) : 'Reintenta el guardado.', duration: 7000 }); } catch (x) {}
    return false;
  }
}

// Tope de colaboradores por proyecto (handoff PR #2). Lee el max del plan de la
// org activa desde la base; cache por org. null = desconocido -> no bloquea
// proactivamente (el server-side en guardar_cargos sigue siendo la red de seguridad).
export async function dalCargarTopeColaboradores() {
  if (!sb || PROJECTS_SOURCE !== 'supabase') return null;
  if (_TOPE_COLAB != null && _TOPE_COLAB_ORG === ORG_ID) return _TOPE_COLAB;
  try {
    const { data: org, error: e1 } = await sb.from('organizations').select('plan').eq('id', ORG_ID).single();
    if (e1) throw e1;
    const plan = (org && org.plan) ? org.plan : null;
    if (!plan) return null;
    const { data: pc, error: e2 } = await sb.from('plan_catalog').select('max_colaboradores').eq('codigo', plan).single();
    if (e2) throw e2;
    setTopeColab((pc && pc.max_colaboradores != null) ? pc.max_colaboradores : null);
    setTopeColabOrg(ORG_ID);
    return _TOPE_COLAB;
  } catch (e) {
    console.warn('[plan] no se pudo leer el tope de colaboradores', e);
    return null;
  }
}

const DAL_KNOWN_LOC_IDS = new Set();
const DAL_KNOWN_LEGAL_DOC_IDS = new Set();
const DAL_KNOWN_LEGAL_TPL_IDS = new Set();

/* Mapeos codigo (Postgres) -> etiqueta de la app (lo que la UI ya espera). */
const _DAL_ROLE_LABEL = { crew: 'Crew', interno: 'Interno', talento: 'Talento', contacto_cliente: 'Contacto cliente', proveedor_individual: 'Proveedor individual' };
export const _DAL_TIPOCUENTA_LABEL = { corriente: 'Cuenta Corriente', vista: 'Cuenta Vista', ahorro: 'Cuenta de Ahorro', rut: 'Cuenta RUT', chequera_electronica: 'Chequera Electr\u00f3nica' };
const _DAL_TIPO_EMPRESA_LABEL = { cliente: 'Cliente', proveedor: 'Proveedor', agencia: 'Agencia', socio: 'Socio' };
export function _dalBancoNombre(codigo) { if (!codigo) return ''; const b = BANCOS_CHILE.find(x => x.codigo === String(codigo)); return b ? b.nombre : ''; }

/* Fila de Supabase (con satelites embebidos) -> contacto canonico BD_CONTACTOS[id]. */
function _dalContactoDesdeRow(r) {
  const roles = (r.contact_roles || []).filter(x => x.activo !== false)
    .map(x => _DAL_ROLE_LABEL[x.role] || null).filter(Boolean);
  if (!roles.length) roles.push('Crew');
  let rolHabitual = '';
  (r.contact_roles || []).forEach(x => { if (!rolHabitual && x.rol_habitual) rolHabitual = String(x.rol_habitual).trim(); });

  const cuentas = r.contact_bank_accounts || [];
  const cta = cuentas.find(x => x.es_principal) || cuentas[0] || null;
  let perfilPago = null;
  if (cta) {
    const ext = !!cta.es_extranjera;
    perfilPago = {
      banco: ext ? '' : _dalBancoNombre(cta.bank_codigo_sbif),
      codigoBanco: ext ? '' : (cta.bank_codigo_sbif || ''),
      tipoCuenta: ext ? '' : (_DAL_TIPOCUENTA_LABEL[cta.tipo_cuenta] || ''),
      nCuenta: ext ? '' : (cta.numero_cuenta || ''),
      tipoDTE: r.dte_habitual ? (DTE_LABEL[r.dte_habitual] || r.dte_habitual) : '',
      dteHabitual: r.dte_habitual || null,
      cuentaExtranjera: ext,
      datosExtranjeros: cta.datos_extra || ''
    };
  } else if (r.dte_habitual) {
    perfilPago = { banco: '', codigoBanco: '', tipoCuenta: '', nCuenta: '', tipoDTE: (DTE_LABEL[r.dte_habitual] || r.dte_habitual), dteHabitual: r.dte_habitual, cuentaExtranjera: false, datosExtranjeros: '' };
  }

  const tp = r.contact_talent_profiles || null;   // 1:1 (objeto o null)
  let perfilTalento = null;
  if (tp) {
    perfilTalento = {
      genero: tp.genero || '', fechaNacimiento: '',
      altura: (tp.altura_cm != null ? String(tp.altura_cm) : ''),
      apariencia: tp.apariencia_etnica || '',
      areas: Array.isArray(tp.areas_interes) ? tp.areas_interes.join(', ') : (tp.areas_interes || ''),
      tallaPolera: tp.talla_polera || '', tallaPantalon: tp.talla_pantalon || '', tallaCalzado: tp.talla_calzado || '',
      fotosLink: tp.fotos_link || '', reelLink: tp.reel_link || ''
    };
  }

  // El modelo actual de la UI soporta UNA empresa por contacto; tomamos la
  // principal (o la primera). El vinculo M:N completo se aprovecha en la V9.1.1+.
  const vincs = r.contact_companies || [];
  const vp = vincs[0] || null;   // V9.1.3: contact_companies ya no tiene es_principal (Sección 0)

  return {
    id: r.id, nombre: r.nombre || '', rut: r.rut || '', email: r.email || '', telefono: r.telefono || '',
    roles: roles, rolHabitual: rolHabitual,
    empresaId: vp ? vp.company_id : '', relacionEmpresa: vp ? (vp.cargo || vp.relacion || '') : '',
    direccion: r.direccion || '', direccionLinea2: r.direccion_linea2 || '',
    comuna: r.comuna || '', ciudad: r.ciudad || '', region: r.region || '',
    restriccion: r.restriccion_alimentaria || '', fechaNacimiento: (r.fecha_nacimiento || r.cumpleanos || ''), notas: r.notas || '',
    esSocio: vp ? !!vp.es_socio : false, esRepresentante: vp ? !!vp.es_representante : false,
    perfilPago: perfilPago, perfilTalento: perfilTalento
  };
}

/* Fila de Supabase -> empresa canonica BD_EMPRESAS_BYID[id]. */
function _dalEmpresaDesdeRow(e) {
  const tipos = (e.company_relationships || []).map(x => _DAL_TIPO_EMPRESA_LABEL[x.tipo] || x.tipo);
  return {
    id: e.id, rutEmpresa: e.rut || '', nombreFantasia: e.nombre_fantasia || '',
    razonSocial: e.razon_social || '', tipo: tipos.join(', '),
    giroSII: e.giro_sii || '', giroInformal: e.giro_informal || '',
    contactoPrincipal: '', contactoPrincipalId: '', emailContacto: '', telefonoContacto: '',
    representante: (e.representante && typeof e.representante === 'object') ? e.representante : { nombre: '', cargo: '', telefono: '', email: '' },
    duenos: Array.isArray(e.duenos) ? e.duenos : [],
    web: e.web || '', notas: e.notas || ''
  };
}

/* Lee Contactos + Empresas (Tanda 1) desde Supabase. Devuelve {contactos, empresas}
   o null si no hay cliente/sesion o si algo falla (el caller mantiene el estado actual). */
async function dalLoadTanda1() {
  if (!sb) return null;
  try {
    const { data: sess } = await sb.auth.getSession();
    if (!sess || !sess.session) return null;   // sin sesion valida, no leemos
    const cQ = sb.from('contacts')
      .select('*, contact_roles(*), contact_bank_accounts(*), contact_talent_profiles(*), contact_companies(*)')
      .eq('organization_id', ORG_ID).is('deleted_at', null);
    const eQ = sb.from('companies')
      .select('*, company_relationships(*)')
      .eq('organization_id', ORG_ID).is('deleted_at', null);
    const [cR, eR] = await Promise.all([cQ, eQ]);
    if (cR.error) { console.error('[dal] contacts', cR.error); return null; }
    if (eR.error) { console.error('[dal] companies', eR.error); return null; }
    const contactos = {}; (cR.data || []).forEach(r => { const c = _dalContactoDesdeRow(r); contactos[c.id] = c; });
    const empresas = {}; (eR.data || []).forEach(e => { const x = _dalEmpresaDesdeRow(e); empresas[x.id] = x; });
    return { contactos: contactos, empresas: empresas };
  } catch (e) { console.error('[dal] excepcion al leer Tanda 1', e); return null; }
}

/* Aplica los datos de Supabase a los stores en memoria y reconstruye las
   proyecciones que la UI ya usa. Marca la fuente como 'supabase'. */
function dalApplyTanda1(data) {
  _clearStore(BD_CONTACTOS); _clearStore(BD_EMPRESAS_BYID);
  Object.keys(data.empresas).forEach(id => { BD_EMPRESAS_BYID[id] = data.empresas[id]; });
  Object.keys(data.contactos).forEach(id => { BD_CONTACTOS[id] = data.contactos[id]; });
  syncLegacyFromContactos();
  DAL_KNOWN_CONTACT_IDS.clear(); Object.keys(data.contactos).forEach(function(id){ DAL_KNOWN_CONTACT_IDS.add(id); });
  DAL_KNOWN_COMPANY_IDS.clear(); Object.keys(data.empresas).forEach(function(id){ DAL_KNOWN_COMPANY_IDS.add(id); });
  setSource('contacts', 'supabase');
}

/* V9.6.18 · Carga las tasas tributarias vigentes desde tax_rates (catálogo
   GLOBAL, sin organization_id) y sobreescribe los defaults del cliente. Es
   fuente única de verdad: IVA y retenciones viven en la BD, no en el HTML.
   FAIL-SAFE: ante cualquier error o ausencia de datos, conserva los defaults
   (la app nunca se rompe por esto). Normaliza la tasa: si viene > 1 se asume
   porcentaje (19) y se divide por 100. */
/* dalBootTaxRates -> movida a src/lib/rates.js (Etapa 1); expuesta en window via src/main.js */

/* Orquestador de arranque: intenta leer de Supabase; si lo logra, reemplaza
   los contactos/empresas ya cargados y refresca la pantalla.
   Si falla, NO toca nada: la app sigue con el estado actual. */
export async function dalBootContactos() {
  const _ep = _dalEpoca();
  const data = await dalLoadTanda1();
  if (_ep !== _dalEpoca()) return false;   // cadena obsoleta: la org cambió durante la carga
  if (!data) { console.warn('[dal] sin datos de Supabase; la BD mantiene su estado actual'); return false; }
  dalApplyTanda1(data);
  const nC = Object.keys(data.contactos).length, nE = Object.keys(data.empresas).length;
  try { if (STATE.currentModule === 'bd-personas') renderBDPersonas(); } catch (e) {}
  try { renderMetrics(); renderKanban(); } catch (e) {}
  /* V10.5.1: notificación de boot de migración removida (obsoleta). */
  window.__TAKEOS_DATA_SOURCE = 'supabase';
  return true;
}

/* ── Catálogo de servicios de la productora (organization_services) ──
   Lista propia de la org, editable en el perfil de empresa (solo Administrador
   por RLS). Alimenta el desplegable "Servicio" de Info Proyecto. */
export async function dalBootServicios() {
  if (!sb || !ORG_ID) return false;
  const _ep = _dalEpoca();
  try {
    const { data, error } = await sb.from('organization_services')
      .select('id,nombre,orden').is('deleted_at', null)
      .eq('organization_id', ORG_ID).order('orden', { ascending: true });
    if (_ep !== _dalEpoca()) return false;   // la org cambió durante la carga
    if (error) { console.warn('[dal] organization_services no disponible', error); return false; }
    ORG_SERVICIOS.length = 0;
    (data || []).forEach(function (r) { ORG_SERVICIOS.push({ id: r.id, nombre: r.nombre, orden: r.orden }); });
    return true;
  } catch (e) { console.warn('[dal] boot servicios', e); return false; }
}
export async function dalGuardarServicio(s) {
  if (!sb || !ORG_ID || !s || !String(s.nombre || '').trim()) return { ok: false };
  const uid = DAL_SESSION_UID || null;
  const nombre = String(s.nombre).trim();
  try {
    if (s.id) {
      const { error } = await sb.from('organization_services')
        .update({ nombre: nombre, orden: s.orden || 0, updated_at: new Date().toISOString(), updated_by: uid }).eq('id', s.id);
      if (error) throw error;
      return { ok: true, id: s.id };
    }
    const { data, error } = await sb.from('organization_services')
      .insert({ organization_id: ORG_ID, nombre: nombre, orden: s.orden || 0, created_by: uid, updated_by: uid })
      .select('id').single();
    if (error) throw error;
    return { ok: true, id: data && data.id };
  } catch (e) {
    console.error('[dal] guardar servicio', e);
    try { showToast({ kind: 'warning', title: 'Servicio sin guardar', body: (e && e.message) ? String(e.message) : 'Reintenta.' }); } catch (x) {}
    return { ok: false, error: e };
  }
}
export async function dalRenombrarServicio(id, nombre) {
  // Renombra el servicio y propaga el nuevo nombre a los proyectos que lo usan
  // (RPC atómico, solo Administrador). Devuelve la cantidad de proyectos tocados.
  if (!sb || !id) return { ok: false };
  try {
    const { data, error } = await sb.rpc('renombrar_servicio', { p_id: id, p_nombre: String(nombre || '').trim() });
    if (error) throw error;
    return { ok: true, count: (typeof data === 'number' ? data : null) };
  } catch (e) {
    console.error('[dal] renombrar servicio', e);
    try { showToast({ kind: 'warning', title: 'No se pudo renombrar', body: (e && e.message) ? String(e.message) : 'Reintenta.' }); } catch (x) {}
    return { ok: false, error: e };
  }
}
export async function dalBorrarServicio(id) {
  if (!sb || !id) return { ok: false };
  try {
    const { error } = await sb.from('organization_services').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.error('[dal] borrar servicio', e);
    try { showToast({ kind: 'warning', title: 'Servicio sin borrar', body: (e && e.message) ? String(e.message) : 'Reintenta.' }); } catch (x) {}
    return { ok: false, error: e };
  }
}

/* V11.16.0 · Plan G §4 · Lente de personas para externos.
   Un externo NO puede leer la tabla contacts (RLS exige 'bd' E|L, que no tiene),
   así que BD_CONTACTOS llega vacío y las vistas del proyecto no mostrarían a
   nadie. Esta función trae, vía el RPC personas_de_mis_proyectos(), SOLO las
   personas de SUS proyectos con los 4 datos visibles (nombre, cargo, correo,
   celular) —sin RUT, dirección ni nada más— y las inyecta en BD_CONTACTOS para
   que el proyecto las muestre. Gateada estrictamente a tipo 'externo': no toca a
   los internos (que sí leen contacts por RLS). Apoya el Frente F. */
export async function dalBootPersonasExternos() {
  const _ep = _dalEpoca();
  try {
    if (!sb) return;
    if (typeof TAKEOS_PERFIL === 'undefined' || !TAKEOS_PERFIL || TAKEOS_PERFIL.tipo !== 'externo') return;
    var r = await sb.rpc('personas_de_mis_proyectos');
    if (_ep !== _dalEpoca()) return;   // cadena obsoleta
    if (r.error) throw r.error;
    var filas = Array.isArray(r.data) ? r.data : [];
    if (!filas.length) return;
    var vistos = {};
    Object.keys(BD_CONTACTOS).forEach(function (id) { var c = BD_CONTACTOS[id]; if (c) vistos[((c.nombre || '') + '|' + (c.email || '')).toLowerCase()] = true; });
    var nuevos = 0;
    filas.forEach(function (p) {
      var nombre = (p && p.nombre) ? String(p.nombre).trim() : '';
      if (!nombre) return;
      var clave = (nombre + '|' + (p.email || '')).toLowerCase();   // una persona puede venir en varios proyectos
      if (vistos[clave]) return;
      vistos[clave] = true;
      var id = 'lens_' + nuevos;
      BD_CONTACTOS[id] = {
        id: id, nombre: nombre, rut: '', email: (p.email || ''), telefono: (p.telefono || ''),
        roles: ['Crew'], rolHabitual: (p.cargo || ''),
        empresaId: '', relacionEmpresa: '',
        direccion: '', direccionLinea2: '', comuna: '', ciudad: '',
        restriccion: '', fechaNacimiento: '', notas: '',
        perfilPago: null, perfilTalento: null, _lente: true
      };
      nuevos++;
    });
    if (nuevos) {
      try { syncLegacyFromContactos(); } catch (e) {}
      try { if (STATE.currentModule === 'bd-personas') renderBDPersonas(); } catch (e) {}
    }
  } catch (e) { console.warn('[lente externos] personas_de_mis_proyectos no cargó', e); }
}

/* \u00bfLa escritura de la BD esta congelada? (porque ya leemos de Supabase pero
   la escritura no llegó a Supabase, y se perderia al recargar). La usan los
   editores de la Base de Datos para avisar y no guardar. */

/* ── V9.4.4 · BD de Locaciones (BD_LOC), transversal ──────────────────────
   Lectura desde la tabla `locations`. Las FOTOS no viven en Supabase todavía
   (siguen en localStorage por el blindaje de tamaño); por eso tras reemplazar
   BD_LOC se llama restoreLocalLocPhotos(). */
function _dalLocacionMap(row) {
  return {
    locId: row.loc_id,
    nombre: row.nombre || '', direccion: row.direccion || '', direccion2: row.direccion2 || '',
    comuna: row.comuna || '', ciudad: row.ciudad || '', region: row.region || '',
    maps: row.maps || '', orientacion: row.orientacion || '—', notas: row.notas || '',
    dueno: row.dueno || { nombre: '', mail: '', tel: '' },
    contactos: Array.isArray(row.contactos) ? row.contactos : [],
    fotos: Array.isArray(row.fotos) ? row.fotos : []
  };
}
async function dalLoadLocaciones() {
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('locations')
      .select('loc_id,nombre,direccion,direccion2,comuna,ciudad,region,maps,orientacion,notas,dueno,contactos,fotos,deleted_at')
      .eq('organization_id', ORG_ID).is('deleted_at', null);
    if (error) throw error;
    if (!Array.isArray(data)) return null;
    return data.map(_dalLocacionMap);
  } catch (e) { console.error('[dal] excepcion al leer locaciones', e); return null; }
}
function dalApplyLocaciones(locs) {
  BD_LOC.length = 0;
  locs.forEach(function(l){ BD_LOC.push(l); });
  DAL_KNOWN_LOC_IDS.clear();
  locs.forEach(function(l){ DAL_KNOWN_LOC_IDS.add(l.locId); });
  setSource('locations', 'supabase');
}
export async function dalBootLocaciones(opts) {
  const silent = opts && opts.silent;
  const _ep = _dalEpoca();
  const locs = await dalLoadLocaciones();
  if (_ep !== _dalEpoca()) return false;   // cadena obsoleta
  if (!locs) { if (!silent) console.warn('[dal] sin locaciones de Supabase; BD_LOC mantiene su estado actual'); return false; }
  dalApplyLocaciones(locs);
  try { restoreLocalLocPhotos(); } catch (e) {}   // reinyecta fotos de localStorage
  if (!silent) {
    try { if (typeof renderLocaciones === 'function') renderLocaciones(); } catch (e) {}
    /* V10.5.1: notificación de boot de migración removida (obsoleta). */
  }
  return true;
}

/* ── V9.4.7 · BD de Legal (documentos + plantillas), transversal ───────────
   Lectura desde legal_documents + legal_templates. Tablas planas (vars jsonb).
   El PDF no se almacena todavía (pdf_path NULL; Storage pendiente). */
function _dalLegalDocMap(r) {
  const doc = {
    docId: r.doc_id, tipo: r.tipo || '', plantillaId: r.plantilla_id || '',
    proyectoId: r.project_id || '', proyectoNombre: r.proyecto_nombre || '', cliente: r.cliente || '',
    estado: r.estado || '', version: (r.version != null ? Number(r.version) : 1),
    fechaGeneracion: r.fecha_generacion || '', fechaFirma: r.fecha_firma || '',
    monto: (r.monto != null ? Number(r.monto) : 0), vigencia: r.vigencia || '',
    responsable: r.responsable || '', pdfUrl: r.pdf_path || null,
    contraparteId: r.contraparte_id || '', contraparteNombre: r.contraparte_nombre || '',
    rut: r.rut || '', rolCalidad: r.rol_calidad || '',
    vars: (r.vars && typeof r.vars === 'object') ? r.vars : {},
    exported: !!r.exported
  };
  if (r.locacion_id) doc.locacionId = r.locacion_id;
  return doc;
}
function _dalLegalTplMap(r) {
  return { id: r.id, nombre: r.nombre || '', desc: r.descripcion || '', target: r.target || 'persona',
           completar: r.completar || 'sistema', cuerpo: r.cuerpo || '', custom: !!r.custom };
}
async function dalLoadLegal() {
  if (!sb) return null;
  try {
    const dq = await sb.from('legal_documents')
      .select('doc_id,tipo,plantilla_id,project_id,proyecto_nombre,cliente,estado,version,fecha_generacion,fecha_firma,monto,vigencia,responsable,pdf_path,contraparte_id,contraparte_nombre,rut,rol_calidad,vars,exported,locacion_id')
      .eq('organization_id', ORG_ID);
    if (dq.error) throw dq.error;
    const tq = await sb.from('legal_templates')
      .select('id,nombre,descripcion,target,completar,cuerpo,custom')
      .eq('organization_id', ORG_ID);
    if (tq.error) throw tq.error;
    if (!Array.isArray(dq.data) || !Array.isArray(tq.data)) return null;
    return { docs: dq.data.map(_dalLegalDocMap), tpls: tq.data.map(_dalLegalTplMap) };
  } catch (e) { console.error('[dal] excepcion al leer legal', e); return null; }
}
function dalApplyLegal(data) {
  BD_LEGAL.length = 0; data.docs.forEach(function(d){ BD_LEGAL.push(d); });
  BD_LEGAL_TPL.length = 0; data.tpls.forEach(function(t){ BD_LEGAL_TPL.push(t); });
  DAL_KNOWN_LEGAL_DOC_IDS.clear(); data.docs.forEach(function(d){ DAL_KNOWN_LEGAL_DOC_IDS.add(d.docId); });
  DAL_KNOWN_LEGAL_TPL_IDS.clear(); data.tpls.forEach(function(t){ DAL_KNOWN_LEGAL_TPL_IDS.add(t.id); });
  setSource('legal', 'supabase');
}
export async function dalBootLegal(opts) {
  const silent = opts && opts.silent;
  const _ep = _dalEpoca();
  const data = await dalLoadLegal();
  if (_ep !== _dalEpoca()) return false;   // cadena obsoleta
  if (!data) { if (!silent) console.warn('[dal] sin legal de Supabase; mantiene su estado actual'); return false; }
  dalApplyLegal(data);
  if (!silent) {
    try { if (typeof renderLegal === 'function' && STATE.currentModule === 'legal') renderLegal(); } catch (e) {}
    /* V10.5.1: notificación de boot de migración removida (obsoleta). */
  }
  return true;
}

/* ── V9.4.8 · Perfil de empresa (EMPRESA_PERFIL), singleton transversal ────
   organization_profile: 1 fila por organización, todo el bloque en `profile`
   jsonb (28 campos heterogéneos que el cliente lee/escribe como bloque). */
/* V11.1.0 · identidad de la organización y del usuario activos en la UI.
   El nombre de la organización sale del perfil de empresa cargado (EMPRESA_PERFIL),
   nunca cableado; el del usuario, del perfil personal. Todo con null-checks para
   que un DOM incompleto jamás rompa el arranque. */
/* USER_NOMBRE / USER_APELLIDO -> a src/lib/state.js (Etapa 1); en window */

async function dalLoadPerfil() {
  /* V11.0.0 · multi-tenant: devuelve { profile, nombreCanonico } de la
     organización ACTIVA. `profile` es el bloque jsonb de organization_profile
     (puede ser {} si la organización aún no lo completa); `nombreCanonico` es
     organizations.nombre (CHECK en BD: nunca vacío), el respaldo del nombre de
     fantasía. Una organización sin fila en organization_profile es un caso
     VÁLIDO (org recién aprovisionada), no un error: devuelve profile {}. */
  if (!sb) return null;
  try {
    const [perfilRes, orgRes, brandRes] = await Promise.all([
      sb.from('organization_profile').select('profile').eq('organization_id', ORG_ID).maybeSingle(),
      sb.from('organizations').select('nombre').eq('id', ORG_ID).maybeSingle(),
      /* V11.9.4 · branding público (logo + nombre + web): legible por CUALQUIER
         miembro activo (organization_branding). Un colaborador no-admin no puede
         leer organization_profile (datos sensibles), pero sí esto, así que su
         header ya muestra el logo y el nombre de la productora. */
      sb.from('organization_branding').select('logo_data_url, logos, nombre_ficticio, web').eq('organization_id', ORG_ID).maybeSingle()
    ]);
    if (perfilRes.error) throw perfilRes.error;
    const profile = (perfilRes.data && perfilRes.data.profile && typeof perfilRes.data.profile === 'object') ? perfilRes.data.profile : {};
    const nombreCanonico = (!orgRes.error && orgRes.data && orgRes.data.nombre) ? String(orgRes.data.nombre).trim() : '';
    /* El branding va de BASE y el perfil completo (Admin) lo sobreescribe si lo
       trae; así el Admin no pierde nada y el colaborador igual ve logo+nombre. */
    const b = (!brandRes.error && brandRes.data) ? brandRes.data : null;
    const branding = b ? {
      logoDataUrl: b.logo_data_url || '',
      logos: (b.logos != null ? b.logos : undefined),
      nombreFicticio: b.nombre_ficticio || '',
      web: b.web || ''
    } : {};
    const merged = Object.assign({}, branding, profile);
    return { profile: merged, nombreCanonico: nombreCanonico };
  } catch (e) { console.error('[dal] excepcion al leer perfil', e); return null; }
}
function dalApplyPerfil(profile, nombreCanonico) {
  if (profile && typeof profile === 'object') Object.assign(EMPRESA_PERFIL, profile);   // bloque sobre los valores actuales
  /* Respaldo del nombre de fantasía: si el perfil no lo trae, usa el nombre
     canónico de la organización (organizations.nombre). */
  if (!(String(EMPRESA_PERFIL.nombreFicticio || '').trim()) && nombreCanonico) EMPRESA_PERFIL.nombreFicticio = nombreCanonico;
  setSource('perfil', 'supabase');
  try { gancho('aplicarMarcaOrg')(); } catch (e) {}
}
export async function dalBootPerfil(opts) {
  const silent = opts && opts.silent;
  const _ep = _dalEpoca();
  const res = await dalLoadPerfil();
  if (_ep !== _dalEpoca()) return false;   // cadena obsoleta
  if (!res) { if (!silent) console.warn('[dal] sin perfil de Supabase; mantiene su estado actual'); return false; }
  dalApplyPerfil(res.profile, res.nombreCanonico);
  return true;
}

/* ════════════════════════════════════════════════════════════════════
   V9.1.1 — IDENTIDAD REAL + CAPA DE ESCRITURA (Contactos y Empresas)
   La identidad deja de simularse: currentUser() pasa a ser la persona cuyo
   correo coincide con el de la sesión de Supabase. La escritura descompone el
   modelo canónico en sus tablas relacionales y lo sincroniza a Supabase
   (fuente de verdad); el respaldo es el airbag en localStorage.
   ════════════════════════════════════════════════════════════════════ */

/* --- Identidad de la sesión --- */
/* DAL_SESSION_UID -> a src/lib/state.js (Etapa 1); en window */
/* DAL_SESSION_EMAIL -> a src/lib/state.js (Etapa 1); en window */
export async function dalResolveIdentidad() {
  if (!sb) return;
  try {
    const { data } = await sb.auth.getSession();
    const sess = data && data.session;
    if (!sess || !sess.user) return;
    DAL_SESSION_UID = sess.user.id || null;
    DAL_SESSION_EMAIL = (sess.user.email || '').toLowerCase();
    /* V11.9.3 · BUG-6 (refuerzo) · si el nombre cacheado en este navegador es de
       OTRA sesión (otro usuario lo usó antes), lo limpiamos de inmediato, para
       que no se vea ni un instante el nombre de otra persona mientras resolvemos
       la identidad real. Recomendación del BD Expert: no arrastrar al usuario
       anterior al cambiar de sesión. */
    try {
      const uidCache = localStorage.getItem('takeos_usuario_uid') || '';
      if (uidCache && uidCache !== DAL_SESSION_UID) {
        setUsuarioActual(''); window.__TAKEOS_USER = '';
        try { localStorage.removeItem('takeos_usuario_actual'); } catch (e) {}
        try { gancho('renderTopbarUser')(); } catch (e) {}
      }
    } catch (e) {}
    /* V11.9.2 · BUG-6 · la identidad del header sale del PROPIO perfil del
       usuario (user_profiles, siempre legible porque es su fila), NO de
       BD_CONTACTOS — que un Invitado sin proyectos no puede ver. Antes, si no
       había match en los contactos, no se actualizaba el nombre y quedaba el de
       la sesión anterior cacheado en el navegador (se veía el nombre de otra
       persona en el saludo/avatar). El match por contacto queda como respaldo. */
    let nombreReal = '';
    if (DAL_SESSION_UID) {
      try {
        const pr = await sb.from('user_profiles').select('nombre, apellido').eq('user_id', DAL_SESSION_UID).maybeSingle();
        if (pr && pr.data) nombreReal = ((pr.data.nombre || '') + ' ' + (pr.data.apellido || '')).trim();
      } catch (e) {}
    }
    if (!nombreReal && DAL_SESSION_EMAIL) {
      Object.keys(BD_CONTACTOS).forEach(id => { const c = BD_CONTACTOS[id]; if (c && (c.email || '').toLowerCase() === DAL_SESSION_EMAIL && c.nombre) nombreReal = c.nombre; });
    }
    if (nombreReal) { gancho('setCurrentUser')(nombreReal); window.__TAKEOS_USER = nombreReal; try { localStorage.setItem('takeos_usuario_uid', DAL_SESSION_UID || ''); } catch (e) {} try { gancho('renderTopbarUser')(); } catch (e) {} }
  } catch (e) { console.error('[dal] identidad', e); }
}

/* ════════════════════════════════════════════════════════════════════
   V10.4.0 · GATE B — PERMISOS POR PERFIL (capa de cliente)
   ════════════════════════════════════════════════════════════════════
   El RLS de Supabase protege los datos en lectura; los RPCs SECURITY
   DEFINER (escritura) bypasean RLS, así que el cliente agrega una guarda
   de UX: identidad real, ocultar módulos sin acceso, modo solo-lectura, y
   bloquear los RPCs de escritura para perfiles sin nivel 'E'. La seguridad
   REAL de escritura la cerrará el BD Expert dentro de los RPCs (Gate C).

   FAIL-CLOSED (V11.15.0): la VISIBILIDAD/LECTURA niega por defecto. Si la
   membresía/matriz no carga (sin sesión, sin membresía, error de red/RLS) o si
   un módulo no aparece en la matriz, authNivel/authNivelModulo devuelven 'none'
   y el módulo se esconde. La matriz se siembra densa: una fila ausente es
   anomalía, no un permiso legítimo => se niega por seguridad.
   Excepción deliberada: los GUARD de ESCRITURA (authPuedeGuardar*) siguen
   fail-open cuando TAKEOS_ACCESO es null, porque la seguridad real de escritura
   la cierra el RPC SECURITY DEFINER (Gate C); esa guarda de cliente es solo UX. */
/* TAKEOS_PERFIL / TAKEOS_ACCESO -> a src/lib/state.js (Etapa 1); en window */

/* Mapa: clave de módulo en la app -> código de módulo en profile_permissions */
/* Helpers de auth (MODULE_PERM_CODE, authNivel, authPuedeVer/Editar, authEsAdmin, ...) -> src/lib/auth.js (Etapa 1); expuestos en window via auth.js */

/* Carga la membresía (por user_id, más confiable que el email) y la matriz
   de permisos. Corre tras dalBootContactos -> dalResolveIdentidad. */
export async function dalLoadPermisos() {
  if (!sb || !DAL_SESSION_UID) return;
  const _ep = _dalEpoca();
  try {
    const { data: mem, error: e1 } = await sb
      .from('memberships')
      .select('tipo, profile_id, contact_id, permission_profiles(codigo, nombre)')
      .eq('user_id', DAL_SESSION_UID)
      .eq('organization_id', ORG_ID)
      .maybeSingle();
    if (_ep !== _dalEpoca()) return;   // cadena obsoleta
    if (e1) throw e1;
    if (!mem) { console.warn('[auth] sin membresía para el usuario (fail-open)'); return; }
    const pp = mem.permission_profiles || {};
    setTakeosPerfil({ codigo: pp.codigo || null, nombre: pp.nombre || '', tipo: mem.tipo || '', profileId: mem.profile_id || null, contactId: mem.contact_id || null });
    // Nombre real desde el contacto vinculado (más confiable que el email)
    if (mem.contact_id && BD_CONTACTOS[mem.contact_id] && BD_CONTACTOS[mem.contact_id].nombre) {
      gancho('setCurrentUser')(BD_CONTACTOS[mem.contact_id].nombre);
      window.__TAKEOS_USER = BD_CONTACTOS[mem.contact_id].nombre;
    }
    // Matriz de permisos del perfil
    const { data: perms, error: e2 } = await sb
      .from('profile_permissions')
      .select('modulo, nivel')
      .eq('profile_id', mem.profile_id);
    if (e2) throw e2;
    if (_ep !== _dalEpoca()) return;   // cadena obsoleta
    const acc = {};
    (perms || []).forEach(function (p) { acc[p.modulo] = p.nivel; });
    setTakeosAcceso(Object.keys(acc).length ? acc : null);
    gancho('renderTopbarUser')();
    gancho('applyPermisosUI')();
  } catch (e) {
    console.warn('[auth] permisos no cargados (fail-open):', e);
    // fail-open: no se restringe nada
  }
}

/* --- IDs ya conocidos en Supabase (para distinguir insert de update) --- */
const DAL_KNOWN_CONTACT_IDS = new Set();
const DAL_KNOWN_COMPANY_IDS = new Set();

/* --- Mapeos inversos etiqueta(app) -> código(Postgres) --- */
const _DAL_ROLE_CODE = Object.fromEntries(Object.entries(_DAL_ROLE_LABEL).map(function(e){return [e[1], e[0]];}));
const _DAL_TIPOCUENTA_CODE = Object.fromEntries(Object.entries(_DAL_TIPOCUENTA_LABEL).map(function(e){return [e[1], e[0]];}));
const _DAL_TIPO_EMPRESA_CODE = Object.fromEntries(Object.entries(_DAL_TIPO_EMPRESA_LABEL).map(function(e){return [e[1], e[0]];}));

/* --- Helpers de coerción --- */
function _dalNN(v) { const s = (v == null ? '' : String(v)).trim(); return s || null; }
function _dalAltura(s) { const n = parseInt(String(s == null ? '' : s).replace(/[^\d]/g, ''), 10); return (n >= 30 && n <= 260) ? n : null; }
function _dalAreasArr(s) { if (Array.isArray(s)) return s.length ? s : null; const a = String(s == null ? '' : s).split(',').map(function(x){return x.trim();}).filter(Boolean); return a.length ? a : null; }
function _dalFechaNacISO(c) {
  // V9.1.3: fecha de nacimiento COMPLETA o NULL. Sin centinelas (Agustín / Sección 0).
  const v = String(c.fechaNacimiento == null ? '' : c.fechaNacimiento).trim();
  const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const iso = m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime()) || ('0' + (d.getUTCMonth() + 1)).slice(-2) !== ('0' + m[2]).slice(-2) || ('0' + d.getUTCDate()).slice(-2) !== ('0' + m[3]).slice(-2)) return null;
  return iso;
}

/* --- Constructores de filas (puros, testeables sin red) --- */
function _dalContactRowPayload(c) {
  return {
    nombre: c.nombre || '',
    rut: _dalNN(c.rut), email: _dalNN(c.email), telefono: _dalNN(c.telefono),
    direccion: _dalNN(c.direccion), direccion_linea2: _dalNN(c.direccionLinea2),
    comuna: _dalNN(c.comuna), ciudad: _dalNN(c.ciudad), region: _dalNN(c.region),
    fecha_nacimiento: _dalFechaNacISO(c),
    restriccion_alimentaria: _dalNN(c.restriccion),
    notas: _dalNN(c.notas),
    dte_habitual: (c.perfilPago && c.perfilPago.dteHabitual) ? c.perfilPago.dteHabitual : null
  };
}
function _dalRoleRowsPayload(c) {
  const roles = (Array.isArray(c.roles) && c.roles.length) ? c.roles : ['Crew'];
  const codes = roles.map(function(l){return _DAL_ROLE_CODE[l];}).filter(Boolean);
  const uniq = Array.from(new Set(codes));
  if (!uniq.length) uniq.push('crew');
  const rh = _dalNN(c.rolHabitual);
  const target = uniq.indexOf('crew') !== -1 ? 'crew' : uniq[0];
  return uniq.map(function(code){ return { role: code, rol_habitual: (code === target ? rh : null), activo: true }; });
}
function _dalBankRowsPayload(c) {
  const p = c.perfilPago; if (!p) return [];
  const ext = !!p.cuentaExtranjera;
  if (ext) { const extra = _dalNN(p.datosExtranjeros); return extra ? [{ bank_codigo_sbif: null, tipo_cuenta: null, numero_cuenta: null, es_principal: true, es_extranjera: true, datos_extra: extra }] : []; }
  const tipo = _DAL_TIPOCUENTA_CODE[p.tipoCuenta] || null;     // texto libre no permitido por el CHECK -> null
  let cod = _dalNN(p.codigoBanco);
  if (!cod && p.banco) { const bc = (typeof bancoCodigo === 'function') ? bancoCodigo(p.banco) : ''; cod = bc || null; }
  const num = _dalNN(p.nCuenta);
  if (!cod && !tipo && !num) return [];                        // sólo DTE (va en contacts): sin fila bancaria
  return [{ bank_codigo_sbif: cod, tipo_cuenta: tipo, numero_cuenta: num, es_principal: true, es_extranjera: false, datos_extra: null }];
}
function _dalTalentRowPayload(c) {
  const t = c.perfilTalento; if (!t) return null;
  return {
    genero: _dalNN(t.genero), altura_cm: _dalAltura(t.altura), apariencia_etnica: _dalNN(t.apariencia),
    areas_interes: _dalAreasArr(t.areas),
    talla_polera: _dalNN(t.tallaPolera), talla_pantalon: _dalNN(t.tallaPantalon), talla_calzado: _dalNN(t.tallaCalzado),
    fotos_link: _dalNN(t.fotosLink), reel_link: _dalNN(t.reelLink)
  };
}
function _dalCompanyLinkRowsPayload(c) {
  if (!c.empresaId) return [];
  return [{ company_id: c.empresaId, es_socio: !!c.esSocio, es_representante: !!c.esRepresentante, cargo: _dalNN(c.relacionEmpresa) }];
}
/* Representante -> objeto solo si tiene algún dato; si está vacío, null (limpia). */
function _dalRepNN(o) {
  if (!o || typeof o !== 'object') return null;
  const has = ['nombre', 'cargo', 'telefono', 'email'].some(function (k) { return String(o[k] == null ? '' : o[k]).trim() !== ''; });
  return has ? { nombre: o.nombre || '', cargo: o.cargo || '', telefono: o.telefono || '', email: o.email || '' } : null;
}
/* Dueños/socios -> arreglo sin filas vacías; si no queda ninguna, null. */
function _dalDuenosNN(arr) {
  if (!Array.isArray(arr)) return null;
  const rows = arr.map(function (d) { return { nombre: (d && d.nombre) || '', telefono: (d && d.telefono) || '', email: (d && d.email) || '' }; })
    .filter(function (d) { return (d.nombre + d.telefono + d.email).trim() !== ''; });
  return rows.length ? rows : null;
}
function _dalCompanyRowPayload(e) {
  return {
    rut: _dalNN(e.rutEmpresa), nombre_fantasia: e.nombreFantasia || '',
    razon_social: _dalNN(e.razonSocial), giro_sii: _dalNN(e.giroSII), giro_informal: _dalNN(e.giroInformal),
    web: _dalNN(e.web), notas: _dalNN(e.notas),
    representante: _dalRepNN(e.representante), duenos: _dalDuenosNN(e.duenos)
  };
}
function _dalRelRowsPayload(e) {
  const tipos = String(e.tipo == null ? '' : e.tipo).split(',').map(function(x){return _DAL_TIPO_EMPRESA_CODE[x.trim()];}).filter(Boolean);
  return Array.from(new Set(tipos)).map(function(t){ return { tipo: t }; });
}

/* --- Reemplazo total de filas satélite por padre (doctrina "el origen manda") --- */
async function _dalReplaceChildren(table, fk, id, rows) {
  const del = await sb.from(table).delete().eq(fk, id);
  if (del.error) throw del.error;
  if (rows && rows.length) {
    const payload = rows.map(function(r){ const o = {}; o[fk] = id; return Object.assign(o, r); });
    const ins = await sb.from(table).insert(payload);
    if (ins.error) throw ins.error;
  }
}

/* --- Guardado de un contacto a Supabase --- */
export async function dalGuardarContacto(c, opts) {
  opts = opts || {};
  if (!sb || CONTACTS_SOURCE !== 'supabase' || !c || !c.id) return { ok: false, skipped: true };
  const uid = DAL_SESSION_UID || null;
  const isNew = !DAL_KNOWN_CONTACT_IDS.has(c.id);
  const row = _dalContactRowPayload(c);
  try {
    if (isNew) {
      // .select('id') fuerza a la base a devolver la fila creada. Si RLS la
      // rechaza sin lanzar error (0 filas), lo detectamos en vez de mentir éxito.
      const ins = await sb.from('contacts').insert(Object.assign({ id: c.id, organization_id: ORG_ID, created_by: uid, updated_by: uid }, row)).select('id');
      if (ins.error) throw ins.error;
      if (!ins.data || !ins.data.length) throw new Error('La base no aceptó crear el contacto (sin permiso de edición o rechazado).');
      DAL_KNOWN_CONTACT_IDS.add(c.id);
    } else {
      // Un UPDATE que no matchea filas por RLS devuelve { error: null, data: [] }.
      // Con .select('id') vemos cuántas filas cambiaron: 0 = no persistió → error.
      const upd = await sb.from('contacts').update(Object.assign({ updated_by: uid }, row)).eq('id', c.id).select('id');
      if (upd.error) throw upd.error;
      if (!upd.data || !upd.data.length) throw new Error('El guardado no modificó ninguna fila: sin permiso de edición o el registro no existe.');
    }
    await _dalReplaceChildren('contact_roles', 'contact_id', c.id, _dalRoleRowsPayload(c));
    await _dalReplaceChildren('contact_bank_accounts', 'contact_id', c.id, _dalBankRowsPayload(c));
    await _dalReplaceChildren('contact_companies', 'contact_id', c.id, _dalCompanyLinkRowsPayload(c));
    const tRow = _dalTalentRowPayload(c);
    if (tRow) { const up = await sb.from('contact_talent_profiles').upsert(Object.assign({ contact_id: c.id }, tRow)); if (up.error) throw up.error; }
    else { const dl = await sb.from('contact_talent_profiles').delete().eq('contact_id', c.id); if (dl.error) throw dl.error; }
    return { ok: true };
  } catch (e) {
    console.error('[dal] guardar contacto', c.id, e);
    // El caller (la ficha) puede pedir silent:true para mostrar él su propio
    // aviso claro y evitar dos toasts contradictorios. Sin silent, avisamos acá.
    if (!opts.silent) {
      try { showToast({ kind: 'warning', title: 'Sincronización parcial', body: '«' + (c.nombre || c.id) + '» quedó en el respaldo local pero no se pudo sincronizar con Supabase. Reintenta al editar.', duration: 7000 }); } catch (x) {}
    }
    return { ok: false, error: e };
  }
}

/* --- Guardado de una empresa a Supabase (campos núcleo + tipo) --- */
export async function dalGuardarEmpresa(e) {
  if (!sb || CONTACTS_SOURCE !== 'supabase' || !e || !e.id) return { ok: false, skipped: true };
  const uid = DAL_SESSION_UID || null;
  const isNew = !DAL_KNOWN_COMPANY_IDS.has(e.id);
  const row = _dalCompanyRowPayload(e);
  try {
    if (isNew) {
      const ins = await sb.from('companies').insert(Object.assign({ id: e.id, organization_id: ORG_ID, created_by: uid, updated_by: uid }, row));
      if (ins.error) throw ins.error;
      DAL_KNOWN_COMPANY_IDS.add(e.id);
    } else {
      const upd = await sb.from('companies').update(Object.assign({ updated_by: uid }, row)).eq('id', e.id);
      if (upd.error) throw upd.error;
    }
    await _dalReplaceChildren('company_relationships', 'company_id', e.id, _dalRelRowsPayload(e));
    return { ok: true };
  } catch (err) {
    console.error('[dal] guardar empresa', e.id, err);
    try { showToast({ kind: 'warning', title: 'Sincronización parcial', body: '«' + (e.nombreFantasia || e.id) + '» se guardó localmente pero no se pudo sincronizar con Supabase. Reintenta.', duration: 7000 }); } catch (x) {}
    return { ok: false, error: err };
  }
}

/* --- V9.6.3 · Sincronización masiva de la BD a Supabase (import .xlsx, fusión) ---
   Reutiliza los escritores por-registro probados (dalGuardarEmpresa/Contacto),
   en serie para no saturar. Empresas primero (los contactos referencian su id).
   Devuelve {okC, okE, fail}. NO borra nada (solo upsert): seguro para fusión.
   El "Reemplazar todo" NO usa esto — requiere una RPC de reemplazo atómico. */
async function dalBulkSyncBD(contactIds, companyIds) {
  if (!sb || CONTACTS_SOURCE !== 'supabase') return { skipped: true };
  let okC = 0, okE = 0, fail = 0;
  for (const id of (companyIds || [])) {
    const e = BD_EMPRESAS_BYID[id]; if (!e) continue;
    const r = await dalGuardarEmpresa(e);
    if (r && r.ok) okE++; else if (!(r && r.skipped)) fail++;
  }
  for (const id of (contactIds || [])) {
    const c = BD_CONTACTOS[id]; if (!c) continue;
    const r = await dalGuardarContacto(c);
    if (r && r.ok) okC++; else if (!(r && r.skipped)) fail++;
  }
  return { okC, okE, fail };
}

/* Cierra una importación .xlsx en modo fusión sincronizando lo tocado a Supabase
   (si la fuente es Supabase). Avisa progreso y resultado. */
export async function dalFinishBulkImport(contactIds, companyIds) {
  if (CONTACTS_SOURCE !== 'supabase') return;   // sin Supabase confirmado, basta el autosave local
  const nC = (contactIds || []).length, nE = (companyIds || []).length;
  if (!nC && !nE) return;
  try { showToast({ kind: 'info', title: 'Sincronizando con Supabase…', body: `Subiendo ${nC} contacto(s) y ${nE} empresa(s).`, duration: 4000 }); } catch (e) {}
  const res = await dalBulkSyncBD(contactIds, companyIds);
  if (res && !res.skipped) {
    if (res.fail > 0) {
      try { showToast({ kind: 'warning', title: 'Sincronización parcial', body: `${res.okC} contacto(s) y ${res.okE} empresa(s) en Supabase; ${res.fail} con problemas (quedaron solo en el respaldo local). Reintenta importando de nuevo o editando por ficha.`, duration: 8000 }); } catch (e) {}
    } else {
      try { showToast({ kind: 'success', title: 'BD sincronizada', body: `${res.okC} contacto(s) y ${res.okE} empresa(s) guardados en Supabase.` }); } catch (e) {}
    }
  }
}

/* --- Guardado diferido (debounce) para la edición inline de empresas --- */
const _dalSaveTimers = {};
export function _dalContactoSaveSoon(id) {
  if (CONTACTS_SOURCE !== 'supabase' || !id) return;
  clearTimeout(_dalSaveTimers['c:' + id]);
  _dalSaveTimers['c:' + id] = setTimeout(function(){ const c = BD_CONTACTOS[id]; if (c) dalGuardarContacto(c); }, 900);
}
export function _dalEmpresaSaveSoon(id) {
  if (CONTACTS_SOURCE !== 'supabase' || !id) return;
  clearTimeout(_dalSaveTimers['e:' + id]);
  _dalSaveTimers['e:' + id] = setTimeout(function(){ const e = BD_EMPRESAS_BYID[id]; if (e) dalGuardarEmpresa(e); }, 900);
}
/* Guardado inmediato de una empresa: cancela el autosave pendiente y persiste ya.
   Lo usa el botón "Guardar cambios" de la ficha para dar certeza al usuario.
   Devuelve una promesa con el resultado ({ok:...}); nunca lanza. */
export function _dalEmpresaFlush(id) {
  clearTimeout(_dalSaveTimers['e:' + id]);
  if (CONTACTS_SOURCE !== 'supabase' || !id) return Promise.resolve({ ok: true, skipped: true });
  const e = BD_EMPRESAS_BYID[id];
  return e ? Promise.resolve(dalGuardarEmpresa(e)) : Promise.resolve({ ok: false });
}

/* --- V9.4.4 · Escritura de una locación (BD_LOC) a Supabase --------------
   Tabla `locations` plana: dueno/contactos son columnas jsonb (sin tablas
   satélite). Las FOTOS NO se mandan (siguen en localStorage; su columna queda
   en su default hasta que se implemente Supabase Storage). Insert vs update por
   el set de IDs conocidos. La tabla no tiene columnas de auditoría. */
function _dalLocacionRowPayload(l) {
  return {
    nombre: l.nombre || null, direccion: l.direccion || null, direccion2: l.direccion2 || null,
    comuna: l.comuna || null, ciudad: l.ciudad || null, region: l.region || null,
    maps: l.maps || null, orientacion: l.orientacion || null, notas: l.notas || null,
    dueno: l.dueno || null,
    contactos: Array.isArray(l.contactos) ? l.contactos : [],
    fotos: (Array.isArray(l.fotos) ? l.fotos.filter(function(f){ return f && f.path; }).map(function(f){ return { path: f.path, nombre_original: f.nombre_original || '' }; }) : []),
    updated_at: new Date().toISOString()
  };
}
export async function dalGuardarLocacion(l) {
  if (!sb || LOCATIONS_SOURCE !== 'supabase' || !l || !l.locId) return { ok: false, skipped: true };
  const isNew = !DAL_KNOWN_LOC_IDS.has(l.locId);
  const row = _dalLocacionRowPayload(l);
  try {
    if (isNew) {
      const ins = await sb.from('locations').insert(Object.assign({ loc_id: l.locId, organization_id: ORG_ID }, row));
      if (ins.error) throw ins.error;
      DAL_KNOWN_LOC_IDS.add(l.locId);
    } else {
      const upd = await sb.from('locations').update(row).eq('loc_id', l.locId);
      if (upd.error) throw upd.error;
    }
    return { ok: true };
  } catch (e) {
    console.error('[dal] guardar locacion', l.locId, e);
    try { showToast({ kind: 'warning', title: 'Sincronización parcial', body: '«' + (l.nombre || l.locId) + '» se guardó localmente pero no se pudo sincronizar con Supabase. Reintenta al editar.', duration: 7000 }); } catch (x) {}
    return { ok: false, error: e };
  }
}
export function _dalLocacionSaveSoon(locId) {
  if (LOCATIONS_SOURCE !== 'supabase' || !locId) return;
  clearTimeout(_dalSaveTimers['loc:' + locId]);
  _dalSaveTimers['loc:' + locId] = setTimeout(function(){ const l = bdLocFind(locId); if (l) dalGuardarLocacion(l); }, 900);
}

/* --- V9.4.7 · Escritura/borrado de la BD de Legal a Supabase --------------
   Documentos y plantillas: upsert directo (tablas planas, vars jsonb). El PDF
   NO se manda (pdf_path queda como esté; binario de Storage pendiente). Las
   tablas no tienen columnas de auditoría. */
function _dalLegalDocRowPayload(d) {
  return {
    tipo: d.tipo || null, plantilla_id: d.plantillaId || null, project_id: d.proyectoId || null,
    proyecto_nombre: d.proyectoNombre || null, cliente: d.cliente || null, estado: d.estado || null,
    version: (d.version != null ? d.version : 1),
    fecha_generacion: d.fechaGeneracion || null, fecha_firma: d.fechaFirma || null,
    monto: (d.monto != null ? d.monto : null), vigencia: d.vigencia || null, responsable: d.responsable || null,
    pdf_path: d.pdfUrl || null, contraparte_id: d.contraparteId || null, contraparte_nombre: d.contraparteNombre || null,
    rut: d.rut || null, rol_calidad: d.rolCalidad || null,
    vars: (d.vars && typeof d.vars === 'object') ? d.vars : {},
    exported: !!d.exported, locacion_id: d.locacionId || null,
    updated_at: new Date().toISOString()
  };
}
async function dalGuardarLegalDoc(d) {
  if (!sb || LEGAL_SOURCE !== 'supabase' || !d || !d.docId) return { ok: false, skipped: true };
  const isNew = !DAL_KNOWN_LEGAL_DOC_IDS.has(d.docId);
  const row = _dalLegalDocRowPayload(d);
  try {
    if (isNew) {
      const ins = await sb.from('legal_documents').insert(Object.assign({ doc_id: d.docId, organization_id: ORG_ID }, row));
      if (ins.error) throw ins.error;
      DAL_KNOWN_LEGAL_DOC_IDS.add(d.docId);
    } else {
      const upd = await sb.from('legal_documents').update(row).eq('doc_id', d.docId);
      if (upd.error) throw upd.error;
    }
    return { ok: true };
  } catch (e) {
    console.error('[dal] guardar documento legal', d.docId, e);
    try { showToast({ kind: 'warning', title: 'Sincronización parcial', body: '«' + (d.docId) + '» se guardó localmente pero no se pudo sincronizar con Supabase. Reintenta.', duration: 7000 }); } catch (x) {}
    return { ok: false, error: e };
  }
}
export async function dalEliminarLegalDoc(docId) {
  if (!sb || LEGAL_SOURCE !== 'supabase' || !docId) return;
  try { const r = await sb.from('legal_documents').delete().eq('doc_id', docId); if (r.error) throw r.error; DAL_KNOWN_LEGAL_DOC_IDS.delete(docId); }
  catch (e) { console.error('[dal] eliminar documento legal', docId, e); }
}
function _dalLegalTplRowPayload(t) {
  return { nombre: t.nombre || null, descripcion: t.desc || null, target: t.target || null,
           completar: t.completar || null, cuerpo: t.cuerpo || null, custom: !!t.custom,
           updated_at: new Date().toISOString() };
}
async function dalGuardarLegalTpl(t) {
  if (!sb || LEGAL_SOURCE !== 'supabase' || !t || !t.id) return { ok: false, skipped: true };
  const isNew = !DAL_KNOWN_LEGAL_TPL_IDS.has(t.id);
  const row = _dalLegalTplRowPayload(t);
  try {
    if (isNew) {
      const ins = await sb.from('legal_templates').insert(Object.assign({ id: t.id, organization_id: ORG_ID }, row));
      if (ins.error) throw ins.error;
      DAL_KNOWN_LEGAL_TPL_IDS.add(t.id);
    } else {
      const upd = await sb.from('legal_templates').update(row).eq('id', t.id);
      if (upd.error) throw upd.error;
    }
    return { ok: true };
  } catch (e) {
    console.error('[dal] guardar plantilla legal', t.id, e);
    try { showToast({ kind: 'warning', title: 'Sincronización parcial', body: '«' + (t.nombre || t.id) + '» se guardó localmente pero no se pudo sincronizar con Supabase. Reintenta.', duration: 7000 }); } catch (x) {}
    return { ok: false, error: e };
  }
}
export async function dalEliminarLegalTpl(tplId) {
  if (!sb || LEGAL_SOURCE !== 'supabase' || !tplId) return;
  try { const r = await sb.from('legal_templates').delete().eq('id', tplId); if (r.error) throw r.error; DAL_KNOWN_LEGAL_TPL_IDS.delete(tplId); }
  catch (e) { console.error('[dal] eliminar plantilla legal', tplId, e); }
}
export function _dalLegalDocSaveSoon(docId) {
  if (LEGAL_SOURCE !== 'supabase' || !docId) return;
  clearTimeout(_dalSaveTimers['legaldoc:' + docId]);
  _dalSaveTimers['legaldoc:' + docId] = setTimeout(function(){ const d = BD_LEGAL.find(function(x){ return x.docId === docId; }); if (d) dalGuardarLegalDoc(d); }, 900);
}
export function _dalLegalTplSaveSoon(tplId) {
  if (LEGAL_SOURCE !== 'supabase' || !tplId) return;
  clearTimeout(_dalSaveTimers['legaltpl:' + tplId]);
  _dalSaveTimers['legaltpl:' + tplId] = setTimeout(function(){ const t = BD_LEGAL_TPL.find(function(x){ return x.id === tplId; }); if (t) dalGuardarLegalTpl(t); }, 900);
}

/* --- V9.4.8 · Escritura del perfil de empresa (singleton) -----------------
   Upsert de organization_profile (PK organization_id) con el bloque completo. */
async function dalGuardarPerfil() {
  if (!sb || PERFIL_SOURCE !== 'supabase') return { ok: false, skipped: true };
  try {
    const { error } = await sb.from('organization_profile').upsert({ organization_id: ORG_ID, profile: EMPRESA_PERFIL, updated_at: new Date().toISOString() });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.error('[dal] guardar perfil', e);
    try { showToast({ kind: 'warning', title: 'Sincronización parcial', body: 'El perfil de empresa se guardó localmente pero no se pudo sincronizar con Supabase. Reintenta.', duration: 7000 }); } catch (x) {}
    return { ok: false, error: e };
  }
}
export function _dalPerfilSaveSoon() {
  if (PERFIL_SOURCE !== 'supabase') return;
  clearTimeout(_dalSaveTimers['perfil']);
  _dalSaveTimers['perfil'] = setTimeout(function(){ dalGuardarPerfil(); }, 900);
}

/* ════════════════════════════════════════════════════════════════════
   V9.2.0 — LECTURA Y FUSIÓN DE PROYECTOS (Tanda 3): Proyecto + Presupuesto
   Un proyecto vive a medias entre los dos backends: cabecera, finanzas y
   presupuesto vienen de Supabase; rodajes, locaciones, hoja de llamado,
   cotización, tareas y señales aún no se migran a sus tablas. Por eso
   FUSIONAMOS las partes migradas sobre el proyecto en memoria (emparejando
   por id), sin tocar lo operativo. No destructivo: si un proyecto no está en
   Supabase, queda 100% como estaba.
   ════════════════════════════════════════════════════════════════════ */
export const DAL_KNOWN_PROJECT_IDS = new Set(); window.DAL_KNOWN_PROJECT_IDS = DAL_KNOWN_PROJECT_IDS; // puente para módulos

/* V10.6.0 · Flags SUPA_SOLE eliminados (Supabase es la única fuente, sin doble escritura). */

function _dalNum(v) { return (v == null || v === '') ? null : Number(v); }

/* Fila de budget_line_items -> fila canónica del cliente. */
function _dalBudgetRow(r, esServicio) {
  const nombre = (r.contact_id && BD_CONTACTOS[r.contact_id]) ? BD_CONTACTOS[r.contact_id].nombre : (r.nombre || '');
  const row = {
    nombre: nombre,
    valor: _dalNum(r.valor),
    cantidad: (r.cantidad != null ? Number(r.cantidad) : 0),
    unidad: r.unidad || '',
    dte: r.dte || null,
    dteReal: null,                         // gap: el esquema Tanda 3 no tiene columna de DTE real
    confirmado: !!r.confirmado,
    costoReal: _dalNum(r.costo_real),
    extra: !!r.es_extra,
    prontoPago: !!r.es_pp,   // V9.2.0: el campo real del cliente es 'prontoPago' (no 'pp')
    horaExtra: (r.hora_extra != null ? Number(r.hora_extra) : 0),
    heConfig: (r.he_config != null ? r.he_config : null),   // V10.5.0: inputs HE persistidos (jsonb); hora_extra es el cache del costo empresa
    clientUuid: r.client_uuid || null,   // Pasada 1 · identidad estable de fila (concurrencia por fila)
    version: (r.version != null ? r.version : null),   // Pasada 1 · sello de versión por fila (null = fila nueva sin guardar)
    _contactId: r.contact_id || '',
    departmentId: (r.department_id != null ? r.department_id : null),
    nota: r.nota || '', notaFecha: r.nota_fecha || '', notaAutor: r.nota_autor || '',   // P22 · releer la nota (la columna existe y el servidor la guarda)
    noVaRodaje: !!r.no_rodaje                                                            // P21b · releer "NO Rodaje"
  };
  if (esServicio) row.rol = r.concepto || ''; else row.item = r.concepto || '';
  return row;
}

/* Cotización Supabase -> {cotizacion(viva), cotizaciones(versiones)} o null si no hay. */
function _dalCotizacionPartes(p) {
  const pq = p.project_quotation || null;
  const offers = p.quotation_offers || [];
  const versions = p.quotation_versions || [];
  if (!pq && !offers.length && !versions.length) return null;   // sin cotización en Supabase -> estado actual intacto
  const meta = (pq && pq.meta) ? pq.meta : {};
  const ofertas = offers.slice().sort(function(a,b){ return (a.posicion||0)-(b.posicion||0); }).map(function(o){
    return {
      id: o.id_externo || '', esBase: !!o.es_base, nombre: o.nombre || '',
      valorCliente: (o.valor_cliente != null ? Number(o.valor_cliente) : null),
      descripcion: o.descripcion || '', incluye: o.incluye || [], noIncluye: o.no_incluye || [],
      entregables: (o.entregables != null ? o.entregables : { videos: [], fotografia: [], otros: [] }),
      presupuestoAlt: (o.presupuesto_alt != null ? o.presupuesto_alt : null)
    };
  });
  const cotizacion = {
    fechaEmision: (pq && pq.fecha_emision) || '', representanteCliente: (pq && pq.representante_cliente) || '',
    condiciones: (pq && pq.condiciones) ? pq.condiciones : {}, ofertas: ofertas,
    descripcionProyecto: (pq && pq.descripcion_proyecto) || '', jornadasRodaje: (pq && pq.jornadas_rodaje) || '',
    id: meta.id || '', numero: (meta.numero != null ? meta.numero : 1), label: meta.label || '',
    nota: meta.nota || '', createdAt: meta.createdAt || '', resumen: (meta.resumen != null ? meta.resumen : null)
  };
  let cotizaciones = null;
  if (versions.length) {
    let activoId = '';
    const vers = versions.slice().sort(function(a,b){ return (a.numero||0)-(b.numero||0); }).map(function(v){
      const snap = v.snapshot || {};
      if (v.es_activa && snap.id) activoId = snap.id;
      return snap;
    });
    cotizaciones = { activoId: activoId || (vers.length ? (vers[vers.length-1].id || '') : ''), versiones: vers };
  }
  return { cotizacion: cotizacion, cotizaciones: cotizaciones };
}

/* 1:1 embebido de PostgREST: puede venir como objeto o como arreglo de 1. */
function _dal1to1(v) { return Array.isArray(v) ? (v[0] || null) : (v || null); }

/* Operaciones 4a (rodajes + plan de rodaje + hoja de llamado) desde Supabase.
   rodajes es relacional; plan de rodaje y hoja de llamado son documentos JSONB
   que se devuelven completos. null si no hay nada -> estado actual intacto. */
function _dalOperaciones4aPartes(p) {
  const dias = p.project_shoot_days || [];
  const plan = _dal1to1(p.project_shooting_plan);
  const hoja = _dal1to1(p.project_call_sheet);
  const scout = _dal1to1(p.project_scouting);
  if (!dias.length && !plan && !hoja && !scout) return null;
  let rodajes = null;
  if (dias.length) {
    rodajes = dias.slice().sort(function(a,b){ return (a.posicion||0)-(b.posicion||0); }).map(function(d){
      return { diaId: d.dia_id, fecha: d.fecha || '', activo: !!d.activo, descripcion: d.descripcion || '' };
    });
  }
  return {
    rodajes: rodajes,
    planRodaje: (plan && plan.plan != null) ? plan.plan : null,
    hojaLlamado: (hoja && hoja.data != null) ? hoja.data : null,
    scouting: (scout && scout.scouting != null) ? scout.scouting : null
  };
}

/* Operaciones 4b (locaciones del proyecto + crew + responsables + asistentes +
   gastos operativos) desde Supabase. null si no hay nada -> estado actual intacto. */
function _dalOperaciones4bPartes(p) {
  const byPos = function(a,b){ return (a.posicion||0)-(b.posicion||0); };
  const locs   = p.project_locations || [];
  const crewX  = p.project_crew_extra || [];
  const extC   = p.project_external_crew || [];
  const resp   = p.project_section_responsibles || [];
  const ops    = _dal1to1(p.project_operations);
  const opBud  = p.project_op_budgets || [];
  if (!locs.length && !crewX.length && !extC.length && !resp.length && !ops && !opBud.length && !(p.gasto_comments || []).length) return null;

  let locaciones = null;
  if (locs.length) {
    locaciones = locs.slice().sort(byPos).map(function(l){
      return { locId: l.loc_id, estado: l.estado || '', costo: (l.costo != null ? Number(l.costo) : 0),
               contratacion: l.contratacion || '', notasProy: l.notas_proy || '' };
    });
  }
  let crewExtra = null;
  if (crewX.length) {
    crewExtra = {};
    crewX.forEach(function(c){ crewExtra[c.nombre] = { medioTransporte: c.medio_transporte || '' }; });
  }
  let crewExternos = null;
  if (extC.length) {
    crewExternos = extC.slice().sort(byPos).map(function(c){
      return { tipo: c.tipo || '', nombre: c.nombre || '', rol: c.rol || '', telefono: c.telefono || '',
               restriccion: c.restriccion || '', direccion: c.direccion || '', comuna: c.comuna || '' };
    });
  }
  let responsables = null;
  if (resp.length) {
    responsables = {};
    resp.forEach(function(r){ responsables[r.seccion] = r.nombre || ''; });
  }
  let asistentes = null, gastosOp = null;
  if (ops || opBud.length) {
    if (ops) asistentes = { cliente: ops.asistentes_cliente || 0, agencia: ops.asistentes_agencia || 0, externo: ops.asistentes_externo || 0 };
    const presupuestos = opBud.slice().sort(byPos).map(function(b){
      return { id: b.id, nombre: b.nombre || '', linea: b.linea || '', resp: b.resp || '', asignado: (b.asignado != null ? Number(b.asignado) : 0) };
    });
    gastosOp = {
      cajaProd: ops && ops.caja_prod != null ? Number(ops.caja_prod) : 0,
      cajaDevuelto: ops && ops.caja_devuelto != null ? Number(ops.caja_devuelto) : 0,
      cajaMovs: ops && Array.isArray(ops.caja_movimientos) ? ops.caja_movimientos : [],
      presupuestos: presupuestos,
      movimientos: ops && ops.op_movimientos ? ops.op_movimientos : [],
      lineasExtra: ops && ops.op_lineas_extra ? ops.op_lineas_extra : []
    };
  }
  // Hilo de "Observar" (gasto_comments): array plano por proyecto, con gastoId.
  let gastoComments = null;
  const gc = p.gasto_comments || [];
  if (gc.length) {
    gastoComments = gc.slice().sort(byPos).map(function(c){
      return { id: c.id, gastoId: c.gasto_id || '', autor: c.autor || '', texto: c.texto || '', ts: c.ts || '' };
    });
  }
  return { locaciones: locaciones, crewExtra: crewExtra, crewExternos: crewExternos,
           responsables: responsables, asistentes: asistentes, gastosOp: gastosOp,
           gastoComments: gastoComments };
}

/* Operaciones 4c (tareas + señales) desde Supabase. Las tareas traen sus
   comentarios y adjuntos anidados. Las señales guardan rolObjetivo en meta jsonb
   (la columna no existe). null si no hay nada -> estado actual intacto. */
function _dalOperaciones4cPartes(p) {
  const byPos = function(a,b){ return (a.posicion||0)-(b.posicion||0); };
  const tasks = p.project_tasks || [];
  const signals = p.project_signals || [];
  if (!tasks.length && !signals.length) return null;

  let tareas = null;
  if (tasks.length) {
    tareas = tasks.slice().sort(byPos).map(function(t){
      const coms = (t.task_comments || []).slice().sort(byPos).map(function(c){
        return { id: c.id, autor: c.autor || '', texto: c.texto || '', ts: c.ts || '' };
      });
      const adj = (t.task_attachments || []).slice().sort(byPos).map(function(a){
        return { name: a.nombre_original || '', path: a.storage_path || '', type: '' };   // path -> bucket adjuntos-tareas; type no se persiste
      });
      return { id: t.id, seccion: t.seccion || '', texto: t.texto || '', asignadoA: t.asignado_a || '',
               creadoPor: t.creado_por || '', estado: t.estado || 'pendiente',
               creadaTs: (t.creada_ts != null ? Number(t.creada_ts) : null),
               comentarios: coms, adjuntos: adj };
    });
  }
  let senales = null;
  if (signals.length) {
    senales = signals.slice().sort(byPos).map(function(s){
      const meta = s.meta || {};
      return { id: s.id, tipo: s.tipo || '', seccion: s.seccion || '', rolObjetivo: (meta.rolObjetivo != null ? meta.rolObjetivo : null),
               descripcion: s.descripcion || '', ts: (s.creada_ts != null ? Number(s.creada_ts) : null),
               vistoPor: Array.isArray(s.visto_por) ? s.visto_por : [] };
    });
  }
  return { tareas: tareas, senales: senales };
}

/* V9.6.0 — Documentos (Tanda 4e). project_documents -> data.documentos.items[].
   El binario vive en Storage (archivo_path -> bucket documentos-proyecto); acá
   se reconstruye archivo:{nombre,path,size}. Documentos legados con base64 (que
   nunca se migraron) se mantienen del estado actual vía la fusión. */
function _dalDocumentosPartes(p) {
  const rows = p.project_documents || [];
  if (!rows.length) return null;
  const byPos = function(a,b){ return (a.posicion||0)-(b.posicion||0); };
  const items = rows.slice().sort(byPos).map(function(r){
    const it = { id: r.id, categoria: r.categoria || 'otros', titulo: r.titulo || '', url: r.url || '', notas: r.notas || '', ts: r.ts || '' };
    if (r.archivo_path) it.archivo = { nombre: r.archivo_nombre || 'documento.pdf', path: r.archivo_path, size: (r.archivo_size != null ? Number(r.archivo_size) : 0) };
    return it;
  });
  return { items: items };
}
export function _dalProyectoPartes(p, deptList) {
  const asg = p.project_assignments || [];
  function porFuncion(fn) {
    const a = asg.find(x => x.project_functions && x.project_functions.nombre === fn);
    if (!a) return '';
    const c = BD_CONTACTOS[a.contact_id];
    return c ? c.nombre : '';
  }
  /* V11.9.1 · el detalle comercial vive en project_commercial (RLS aparte).
     Viene como objeto 1:1, o null/array vacío para perfiles sin info_proyecto
     (Creativo/Coordinación/Invitado) → en ese caso los campos quedan vacíos, que
     es el comportamiento correcto: ellos ven el proyecto pero no su comercial. */
  const _pcRaw = p.project_commercial;
  const com = Array.isArray(_pcRaw) ? (_pcRaw[0] || {}) : (_pcRaw || {});

  let cliente = com.cliente_texto || '';
  if (!cliente && com.cliente_empresa_id && BD_EMPRESAS_BYID[com.cliente_empresa_id]) cliente = BD_EMPRESAS_BYID[com.cliente_empresa_id].nombreFantasia || '';
  if (!cliente && com.cliente_contacto_id && BD_CONTACTOS[com.cliente_contacto_id]) cliente = BD_CONTACTOS[com.cliente_contacto_id].nombre || '';
  let agencia = com.agencia_texto || '';
  if (!agencia && com.agencia_empresa_id && BD_EMPRESAS_BYID[com.agencia_empresa_id]) agencia = BD_EMPRESAS_BYID[com.agencia_empresa_id].nombreFantasia || '';

  const info = {
    cliente: cliente, clienteEmpresaId: com.cliente_empresa_id || '', agencia: agencia,
    nombreProyecto: p.nombre_proyecto || '', servicio: p.servicio || 'Producción', productora: p.productora || gancho('orgNombre')(),
    derechos: { tiempo: com.derechos_tiempo || '', plataformas: com.derechos_plataformas || '', territorio: com.derechos_territorio || '' },
    contactoCliente: com.contacto_cliente || '', mailContactoCliente: com.mail_contacto_cliente || '', telefonoContactoCliente: com.telefono_contacto_cliente || '',
    contactoAgencia: com.contacto_agencia || '', mailContactoAgencia: com.mail_contacto_agencia || '', telefonoContactoAgencia: com.telefono_contacto_agencia || '',
    productorEjecutivo: porFuncion('Productor Ejecutivo'), director: porFuncion('Director'), jefeProduccion: porFuncion('Jefe de Producción'),
    condicionPago: com.condicion_pago || '', fechaCotizacion: com.fecha_cotizacion || '', fechaAprobacion: com.fecha_aprobacion || '',
    fechaEntregaFinal: p.fecha_entrega_final || '', fechaPago: com.fecha_pago || ''
  };

  const fin = p.project_financials || {};
  function sortPos(arr) { return (arr || []).slice().sort(function(a,b){ return (a.posicion||0)-(b.posicion||0); }); }
  const finanzas = {
    presupuestoCliente: (fin.presupuesto_cliente != null ? Number(fin.presupuesto_cliente) : 0),
    gastosAdminPct: (fin.gastos_admin_pct != null ? Number(fin.gastos_admin_pct) : 0.05),
    heRecargoPct: (fin.he_recargo_default != null ? Number(fin.he_recargo_default) : 150),   // V10.5.0: recargo HE por defecto del proyecto
    frozen: (fin.frozen != null ? fin.frozen : null),
    comisiones: sortPos(p.project_commissions).map(function(x){ return { label: x.label || 'Comisión', mode: x.mode || 'pct', value: Number(x.value) || 0 }; }),
    riesgos: sortPos(p.project_risks).map(function(x){ return { label: x.label || '', mode: x.mode || 'pct', value: Number(x.value) || 0 }; }),
    extras: sortPos(p.project_income_extras).map(function(x){ return { label: x.label || '', monto: Number(x.monto) || 0 }; })
  };

  const items = sortPos(p.budget_line_items);
  const servicios = {}, gastos = [], equipos = [], talentos = [];
  // Departamentos (opción a): el esqueleto de grupos se arma desde la lista REAL de
  // departamentos, no desde las filas → los custom vacíos sobreviven; los defaults
  // vacíos se ocultan (su grupo se crea recién si tiene filas). serviciosDeptIds mapea
  // nombre→{id,projectId} para guardar por id (department_id estable) en vez de por nombre.
  const projDepts = (deptList || []).filter(function(x){ return x.project_id == null || x.project_id === p.id; });
  const deptById = {}, serviciosDeptIds = {};
  projDepts.forEach(function(x){ deptById[x.id] = x; serviciosDeptIds[x.nombre] = { id: x.id, projectId: (x.project_id != null ? x.project_id : null) }; });
  // ¿qué departamentos tienen filas? (para ocultar los defaults vacíos)
  const _conFilas = {};
  items.forEach(function(r){ if (r.section === 'servicios' && r.department_id != null && deptById[r.department_id]) _conFilas[deptById[r.department_id].nombre] = true; });
  // esqueleto en orden 'orden' (defaults primero, luego custom): custom siempre; default solo si tiene filas
  projDepts.forEach(function(x){ if (x.project_id != null || _conFilas[x.nombre]) servicios[x.nombre] = servicios[x.nombre] || []; });
  items.forEach(function(r){
    if (r.section === 'servicios') {
      const dm = (r.department_id != null && deptById[r.department_id]) ? deptById[r.department_id] : null;
      const dep = dm ? dm.nombre : ((r.departments && r.departments.nombre) ? r.departments.nombre : 'Sin departamento');
      (servicios[dep] = servicios[dep] || []).push(_dalBudgetRow(r, true));
    } else if (r.section === 'gastos') gastos.push(_dalBudgetRow(r, false));
    else if (r.section === 'tecnica') equipos.push(_dalBudgetRow(r, false));   // 'tecnica' (BD) == 'equipos' (cliente)
    else if (r.section === 'talentos') talentos.push(_dalBudgetRow(r, false));
  });

  const cot = _dalCotizacionPartes(p);
  return {
    estado: p.estado || 'venta', nombre: p.nombre_proyecto || '', cliente: cliente, pe: info.productorEjecutivo,
    headerVersion: (p.version != null ? p.version : null),   // Pasada 1 · versión de cabecera (projects.version)
    cotizacion: cot ? cot.cotizacion : null, cotizaciones: cot ? cot.cotizaciones : null,
    operaciones4a: _dalOperaciones4aPartes(p),
    operaciones4b: _dalOperaciones4bPartes(p),
    operaciones4c: _dalOperaciones4cPartes(p),
    documentos: _dalDocumentosPartes(p),
    dataParcial: { infoProyecto: info, finanzas: finanzas, servicios: servicios, serviciosDeptIds: serviciosDeptIds, gastos: gastos, equipos: equipos, talentos: talentos }
  };
}

/* Fusiona partes migradas (Supabase) sobre un proyecto, sin tocar lo operativo. */
export function _dalFusionarProyecto(target, partes) {
  if (!target.data) target.data = buildDefaultProjectData();
  target.state = partes.estado;
  if (partes.nombre) target.name = partes.nombre;
  if (partes.cliente) target.client = partes.cliente;
  if (partes.pe) target.pe = partes.pe;
  const d = target.data;
  d.infoProyecto = partes.dataParcial.infoProyecto;
  d.finanzas = partes.dataParcial.finanzas;
  d.servicios = partes.dataParcial.servicios;
  d.serviciosDeptIds = partes.dataParcial.serviciosDeptIds || {};
  d.gastos = partes.dataParcial.gastos;
  d.equipos = partes.dataParcial.equipos;
  d.talentos = partes.dataParcial.talentos;
  if (partes.cotizacion) d.cotizacion = partes.cotizacion;          // V9.2.1: cotización viva desde Supabase
  if (partes.cotizaciones) d.cotizaciones = partes.cotizaciones;    // V9.2.1: versiones de cotización desde Supabase
  if (partes.operaciones4a) {                                       // V9.4.0: operaciones 4a desde Supabase
    const o4 = partes.operaciones4a;
    if (o4.rodajes) d.rodajes = o4.rodajes;
    if (o4.planRodaje) d.planRodaje = o4.planRodaje;
    if (o4.hojaLlamado) d.hojaLlamado = o4.hojaLlamado;
    if (o4.scouting) d.scouting = o4.scouting;
  }
  if (partes.operaciones4b) {                                       // V9.4.2: operaciones 4b desde Supabase
    const ob = partes.operaciones4b;
    if (ob.locaciones) d.locaciones = ob.locaciones;
    if (ob.crewExtra) d.crewExtra = ob.crewExtra;
    if (ob.crewExternos) d.crewExternos = ob.crewExternos;
    if (ob.responsables) d.responsables = ob.responsables;
    if (ob.asistentes) d.asistentes = ob.asistentes;
    if (ob.gastosOp) d.gastosOp = ob.gastosOp;
    if (ob.gastoComments) d.gastoComments = ob.gastoComments;
  }
  if (partes.operaciones4c) {                                       // V9.4.5: operaciones 4c desde Supabase
    const oc = partes.operaciones4c;
    if (oc.tareas) d.tareas = oc.tareas;
    if (oc.senales) d.senales = oc.senales;
  }
  if (partes.documentos && partes.documentos.items) {               // V9.6.0: Documentos (4e) desde Supabase
    d.documentos = { items: partes.documentos.items };
  }
  // ── Pasada 1 · concurrencia por fila: línea base tras (re)cargar de Supabase ──
  target._headerVersion = (partes.headerVersion != null ? partes.headerVersion : null);   // versión de cabecera cargada
  target._headerDirty = false; target._headerDirtySeq = 0;
  target._budgetPendingDeletes = [];   // las filas vienen frescas del servidor → nada pendiente de borrar
  target._snap = _snapSecciones(target);   // línea base de las secciones no migradas (snapshot-diff)
  // locaciones/tareas/senales/crewExtra/responsables/asistentes/crewExternos/gastosOp: intactos (estado actual). rodajes/planRodaje/hojaLlamado: desde Supabase (4a).
}

/* Select compartido para cargar/recargar proyectos (incluye las columnas de
   concurrencia: projects.version y budget_line_items.client_uuid/version). */
function _dalProyectoSelect() {
  return 'id,nombre_proyecto,categoria,es_remunerado,servicio,productora,fecha_entrega_final,estado,version,aprobado_at,cerrado_at,deleted_at,'
    + 'project_commercial(cliente_empresa_id,cliente_contacto_id,agencia_empresa_id,cliente_texto,agencia_texto,derechos_tiempo,derechos_plataformas,derechos_territorio,contacto_cliente,mail_contacto_cliente,telefono_contacto_cliente,contacto_agencia,mail_contacto_agencia,telefono_contacto_agencia,condicion_pago,fecha_cotizacion,fecha_aprobacion,fecha_pago),'
    + 'project_assignments(contact_id,function_id,project_functions(nombre)),'
    + 'project_financials(presupuesto_cliente,gastos_admin_pct,he_recargo_default,frozen),'
    + 'project_commissions(label,mode,value,posicion),'
    + 'project_risks(label,mode,value,posicion),'
    + 'project_income_extras(label,monto,posicion),'
    + 'budget_line_items(client_uuid,version,section,department_id,contact_id,nombre,concepto,valor,cantidad,unidad,dte,confirmado,costo_real,es_extra,es_pp,hora_extra,he_config,nota,nota_fecha,nota_autor,no_rodaje,posicion,departments(nombre)),'
    + 'project_quotation(fecha_emision,representante_cliente,condiciones,descripcion_proyecto,jornadas_rodaje,meta),'
    + 'quotation_offers(id_externo,es_base,nombre,valor_cliente,descripcion,incluye,no_incluye,entregables,presupuesto_alt,posicion),'
    + 'quotation_versions(numero,es_activa,snapshot,nota),'
    + 'project_shoot_days(dia_id,fecha,activo,descripcion,posicion),'
    + 'project_shooting_plan(plan),'
    + 'project_call_sheet(data),'
    + 'project_scouting(scouting),'
    + 'project_locations(loc_id,estado,costo,contratacion,notas_proy,posicion),'
    + 'project_crew_extra(nombre,contact_id,medio_transporte),'
    + 'project_external_crew(tipo,nombre,rol,telefono,restriccion,direccion,comuna,posicion),'
    + 'project_section_responsibles(seccion,nombre,contact_id),'
    + 'project_operations(asistentes_cliente,asistentes_agencia,asistentes_externo,caja_prod,caja_devuelto,caja_movimientos,op_movimientos,op_lineas_extra),'
    + 'project_op_budgets(id,nombre,linea,resp,asignado,posicion),'
    + 'project_tasks(id,seccion,texto,asignado_a,creado_por,estado,creada_ts,posicion,task_comments(id,autor,texto,ts,posicion),task_attachments(nombre_original,storage_path,posicion)),'
    + 'project_signals(id,tipo,seccion,descripcion,creada_ts,visto_por,meta,posicion),'
    + 'project_documents(id,categoria,titulo,url,notas,archivo_nombre,archivo_path,archivo_size,ts,posicion),'
    + 'gasto_comments(id,gasto_id,autor,texto,ts,posicion)';
}

export async function dalLoadProyectos(soloBorrados) {
  if (!sb) return null;
  const sel = _dalProyectoSelect();
  try {
    let q = sb.from('projects').select(sel).eq('organization_id', ORG_ID);
    q = soloBorrados ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (e) { console.error('[dal] cargar proyectos', e); return null; }
}

/* Pasada 1 · recarga UN solo proyecto desde Supabase y lo re-fusiona. La fusión
   trae versiones frescas (cabecera y por fila) y reinicia la línea base (_snap,
   _headerVersion, _budgetPendingDeletes y marcas de sucio). Usado por "Recargar
   ahora" al resolver un conflicto. */
async function _dalCargarDepartamentos() {
  if (!sb || !ORG_ID) return [];
  try {
    const { data, error } = await sb.from('departments')
      .select('id,nombre,orden,project_id').eq('organization_id', ORG_ID).order('orden', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (e) { console.error('[dal] cargar departamentos', e); return []; }
}

async function dalReloadProyecto(id) {
  if (!sb || !id) return false;
  try {
    const { data, error } = await sb.from('projects').select(_dalProyectoSelect())
      .eq('organization_id', ORG_ID).eq('id', id).is('deleted_at', null).limit(1);
    if (error) throw error;
    const row = (data && data[0]) || null;
    if (!row) return false;
    const tgt = PROJECTS.find(function (x) { return x.id === id; });
    if (!tgt) return false;
    const _depsR = await _dalCargarDepartamentos();
    _dalFusionarProyecto(tgt, _dalProyectoPartes(row, _depsR));
    DAL_KNOWN_PROJECT_IDS.add(id);
    return true;
  } catch (e) { console.error('[dal] recargar proyecto', id, e); return false; }
}

export async function dalBootProyectos() {
  const _ep = _dalEpoca();
  const rows = await dalLoadProyectos();
  if (_ep !== _dalEpoca()) return;                    // cadena obsoleta: no aplica ni toca el veil (la cadena vigente lo cierra)
  if (!rows) { try { renderMetrics(); renderKanban(); } catch (e) {} gancho('_bootCoverHide')(); return; }   // error o sin red -> se pinta el estado actual (post-reset: tablero vacío honesto, no fantasmas de la org anterior)
  if (!rows.length) { setSource('projects', 'supabase'); try { renderMetrics(); renderKanban(); } catch (e) {} gancho('_bootCoverHide')(); return; }   // org sin proyectos: la nube respondió -> escritura habilitada y tablero vacío real (sin esto el flag quedaba 'pending' y nada sincronizaba)
  let aplicados = 0;
  const _depsB = await _dalCargarDepartamentos();
  rows.forEach(function(p){
    const partes = _dalProyectoPartes(p, _depsB);
    let tgt = PROJECTS.find(function(x){ return x.id === p.id; });
    if (!tgt) {
      tgt = { id: p.id, name: partes.nombre, client: partes.cliente, state: partes.estado, pe: partes.pe || '—', amount: 0, currency: 'CLP', alerts: 0, lastActivity: '', date: '—', data: buildDefaultProjectData() };
      PROJECTS.push(tgt);
    }
    _dalFusionarProyecto(tgt, partes);
    DAL_KNOWN_PROJECT_IDS.add(p.id);
    aplicados++;
  });
  setSource('projects', 'supabase');
  try { renderMetrics(); renderKanban(); } catch (e) {}
  /* V11.9.7 · salto directo a un proyecto (click desde el Panel Personal de un
     externo): entra al proyecto sin pasar por el Control Room. */
  try {
    var _irA = sessionStorage.getItem('takeos_ir_proyecto');
    if (_irA) {
      sessionStorage.removeItem('takeos_ir_proyecto');
      if (PROJECTS.find(function (x) { return x.id === _irA; })) { setTimeout(function () { try { navigateToProject(_irA); } catch (e) {} try { gancho('_bootCoverHide')(); } catch (e) {} }, 60); }
      else { gancho('_bootCoverHide')(); }
    } else {
      /* V11.15.0 · B2: restaurar la vista donde estaba el usuario antes de recargar.
         takeos_ir_proyecto (entrada desde Panel) tiene prioridad y ya se procesó arriba.
         Validamos que la org guardada coincida con la activa: no cruzamos cuentas. */
      var _lv = null; try { _lv = _lastViewLeer(); } catch (_e) {}
      if (_lv && _lv.org === ORG_ID && _lv.view === 'project' && _lv.projectId
          && PROJECTS.find(function (x) { return x.id === _lv.projectId; })) {
        setTimeout(function () {
          try { navigateToProject(_lv.projectId); } catch (e) {}
          /* navigateToProject ya aterrizó en info-proyecto (o el primer módulo visible);
             si el módulo guardado es otro, navegamos a él encima (las guardas de
             authPuedeVer en navigateToModule manejan el caso de permisos cambiados). */
          if (_lv.module && _lv.module !== 'info-proyecto') {
            try { navigateToModule(_lv.module); } catch (e2) {}
          }
          try { gancho('_bootCoverHide')(); } catch (e) {}
        }, 60);
      } else if (_lv && _lv.org === ORG_ID && _lv.view === 'bd-global') {
        setTimeout(function () {
          try { openGlobalBDPersonas(); } catch (e) {}
          try { gancho('_bootCoverHide')(); } catch (e) {}
        }, 60);
      } else {
        /* D0 · la vista guardada viene de OTRA organización (cambio de org desde
           dentro de un proyecto o de la BD global): no hay nada que restaurar y
           la vista activa en pantalla es un fantasma de la org anterior (con sus
           nombres). Navegamos al Control Room de la org nueva. */
        try { if (_lv && _lv.org !== ORG_ID) navigateToControlRoom(); } catch (_e2) {}
        gancho('_bootCoverHide')();
      }
    }
  } catch (e) { try { gancho('_bootCoverHide')(); } catch (_) {} }
}

/* ════════════════════════════════════════════════════════════════════
   V9.2.2 — ESCRITURA DE PROYECTOS (Tanda 3) vía RPC guardar_proyecto.
   Doble escritura durante la transición: el blob completo sigue yendo a
   el estado local y, además, las partes migradas (cabecera +
   asignaciones + finanzas + presupuesto + cotización) se mandan a Supabase
   en un payload que la RPC descompone en sus tablas (reemplazo total de
   filas hijas, atómico). El id del cliente se preserva como projects.id.
   ════════════════════════════════════════════════════════════════════ */

/* contactId: usa el hint si existe en BD; si no, resuelve por nombre; si no, ''. */
function _dalResolveContactId(nombre, hintId) {
  const n = (nombre || '').trim().toLowerCase();
  // P21a · el hint (vínculo previo) solo vale si su nombre AÚN coincide con el
  // nombre actual. Si el usuario eligió otra persona del listado o escribió un
  // nombre distinto, no se conserva el vínculo viejo (antes revertía al anterior).
  if (hintId && BD_CONTACTOS[hintId] && (BD_CONTACTOS[hintId].nombre || '').trim().toLowerCase() === n) return hintId;
  if (!n) return '';
  for (const id in BD_CONTACTOS) { const c = BD_CONTACTOS[id]; if (c && (c.nombre || '').trim().toLowerCase() === n) return id; }
  return '';
}

/* ── Pasada 1 · secciones aún NO migradas a por-fila (asignaciones, finanzas,
   cotización, versiones): se arman igual que antes, pero ahora se reusan tanto
   para el payload como para el snapshot-diff que decide si la sección cambió (y
   por ende si su clave se envía). El RPC, por presencia de clave, no toca lo que
   no se manda → un autosave de presupuesto ya no reescribe estas secciones. ── */
function _payloadAsignaciones(d) {
  const ip = d.infoProyecto || {};
  const asign = [];
  [['Productor Ejecutivo', ip.productorEjecutivo], ['Director', ip.director], ['Jefe de Producción', ip.jefeProduccion]].forEach(function(par){
    const nom = (par[1] || '').trim();
    if (nom) asign.push({ funcion: par[0], contactId: _dalResolveContactId(nom, ''), nombre: nom });
  });
  return asign;
}
function _payloadFinanzas(d) {
  const fin = d.finanzas || {};
  return {
    presupuestoCliente: (fin.presupuestoCliente != null ? fin.presupuestoCliente : 0),
    gastosAdminPct: (fin.gastosAdminPct != null ? fin.gastosAdminPct : 0.05),
    heRecargoPct: (fin.heRecargoPct != null ? fin.heRecargoPct : 150),
    frozen: (fin.frozen != null ? fin.frozen : null),
    comisiones: fin.comisiones || [], riesgos: fin.riesgos || [], extras: fin.extras || []
  };
}
function _payloadCotizacion(d) {
  const c = d.cotizacion;
  if (c && Array.isArray(c.ofertas) && c.ofertas.length) {
    return {
      fechaEmision: c.fechaEmision || '', representanteCliente: c.representanteCliente || '',
      condiciones: c.condiciones || {}, descripcionProyecto: c.descripcionProyecto || '', jornadasRodaje: c.jornadasRodaje || '',
      meta: { id: c.id || '', numero: (c.numero != null ? c.numero : 1), label: c.label || '', nota: c.nota || '', createdAt: c.createdAt || '', resumen: (c.resumen != null ? c.resumen : null) },
      ofertas: c.ofertas.map(function(o,i){ return {
        idExterno: o.id || '', esBase: !!o.esBase, nombre: o.nombre || '', valorCliente: (o.valorCliente != null ? o.valorCliente : null),
        descripcion: o.descripcion || '', incluye: o.incluye || [], noIncluye: o.noIncluye || [],
        entregables: o.entregables || { videos: [], fotografia: [], otros: [] }, presupuestoAlt: (o.presupuestoAlt != null ? o.presupuestoAlt : null), posicion: i }; })
    };
  }
  return undefined;
}
function _payloadVersiones(d) {
  const cs = d.cotizaciones;
  if (cs && Array.isArray(cs.versiones) && cs.versiones.length) {
    return cs.versiones.map(function(v){ return { numero: (v.numero != null ? v.numero : 1), esActiva: (v.id === cs.activoId), snapshot: v, nota: v.nota || '' }; });
  }
  return undefined;
}
/* Snapshot normalizado de las secciones no migradas: el JSON contra el que se
   compara al armar el payload. Si difiere → la sección cambió → se manda. Se
   toma al cargar (línea base) y se re-toma tras cada guardado exitoso. */
function _snapSecciones(project) {
  const d = (project && project.data) || {};
  return {
    asignaciones: JSON.stringify(_payloadAsignaciones(d)),
    finanzas: JSON.stringify(_payloadFinanzas(d)),
    cotizacion: JSON.stringify(_payloadCotizacion(d) || null),
    versiones: JSON.stringify(_payloadVersiones(d) || null)
  };
}

/* Proyecto canónico -> payload para la RPC (inverso de la lectura). */
/* Proyecto canónico -> payload DIFF para la RPC (Pasada 1). Devuelve
   { payload, meta } o null si no hay nada que mandar (no-op: el autosave no
   dispara el RPC). meta registra LO QUE SE ENVIÓ (seq por fila, seq de cabecera,
   deletes, snapshots) para que el guardado exitoso limpie las marcas SOLO de lo
   enviado, sin pisar una edición hecha durante el viaje del RPC. */
function _dalProyectoPayload(project) {
  const d = project.data || {};
  const ip = d.infoProyecto || {};
  const payload = { id: project.id, organizationId: ORG_ID };
  const meta = { headerSent: false, headerSeq: 0, rowsSent: [], deletesSent: [], snapSent: {} };
  let hayAlgo = false;

  // ── CABECERA (projects + project_commercial, versionada como unidad). Se manda
  // si está sucia, o si el proyecto aún no existe en el servidor (el RPC exige
  // header para crearlo). ──
  const esNuevo = !DAL_KNOWN_PROJECT_IDS.has(project.id);
  if (project._headerDirty || esNuevo) {
    payload.header = {
      version: (project._headerVersion != null ? project._headerVersion : null),
      nombreProyecto: ip.nombreProyecto || project.name || '', categoria: 'publicidad', esRemunerado: true,
      estado: project.state || 'venta',
      clienteEmpresaId: ip.clienteEmpresaId || null, clienteContactoId: null, agenciaEmpresaId: null,
      clienteTexto: ip.cliente || '', agenciaTexto: ip.agencia || '',
      servicio: ip.servicio || '', productora: ip.productora || '',
      derechosTiempo: (ip.derechos && ip.derechos.tiempo) || '', derechosPlataformas: (ip.derechos && ip.derechos.plataformas) || '', derechosTerritorio: (ip.derechos && ip.derechos.territorio) || '',
      contactoCliente: ip.contactoCliente || '', mailContactoCliente: ip.mailContactoCliente || '', telefonoContactoCliente: ip.telefonoContactoCliente || '',
      contactoAgencia: ip.contactoAgencia || '', mailContactoAgencia: ip.mailContactoAgencia || '', telefonoContactoAgencia: ip.telefonoContactoAgencia || '',
      condicionPago: ip.condicionPago || '', fechaCotizacion: ip.fechaCotizacion || '', fechaAprobacion: ip.fechaAprobacion || '',
      fechaEntregaFinal: ip.fechaEntregaFinal || '', fechaPago: ip.fechaPago || ''
    };
    meta.headerSent = true; meta.headerSeq = (project._headerDirtySeq || 0);
    hayAlgo = true;
  }

  // ── PRESUPUESTO POR FILA (diff): upserts (filas sucias o nuevas no vacías) +
  // deletes (filas existentes ya removidas de memoria). ──
  const upserts = [];
  function considerRow(section, r, pos, dep) {
    if (!r) return;
    const esFilaNueva = (r.version == null);
    if (!r._dirty && !esFilaNueva) return;   // sin cambios → no se envía
    const concepto = (section === 'servicios') ? (r.rol || '') : (r.item || '');
    // No insertar filas nuevas totalmente vacías (placeholder sin contenido).
    if (esFilaNueva && !(r.nombre || '').trim() && !concepto.trim() && r.valor == null && r.costoReal == null) return;
    if (!r.clientUuid) r.clientUuid = _clientUuid();   // Pasada 1 · red de seguridad: nunca enviar una fila sin id estable (filas no creadas por addRow: defaults del proyecto nuevo, goSavePresup, importadas…)
    upserts.push({
      clientUuid: r.clientUuid, version: (r.version != null ? r.version : null),
      section: section, departamento: dep || null,
      departamentoId: (section === 'servicios' && d.serviciosDeptIds && d.serviciosDeptIds[dep] && d.serviciosDeptIds[dep].id != null) ? d.serviciosDeptIds[dep].id : null,
      contactId: _dalResolveContactId(r.nombre, r._contactId), nombre: r.nombre || '',
      concepto: concepto, valor: (r.valor != null ? r.valor : null), cantidad: (r.cantidad != null ? r.cantidad : 0),
      unidad: r.unidad || '', dte: r.dte || null, confirmado: !!r.confirmado, costoReal: (r.costoReal != null ? r.costoReal : null),
      esExtra: !!r.extra, esPp: !!r.prontoPago, horaExtra: (r.horaExtra != null ? r.horaExtra : 0),
      heConfig: (r.heConfig != null ? r.heConfig : null),   // se manda aunque el RPC aún no la persista (futuro-proof; ver handoff)
      dteReal: r.dteReal || null, nota: r.nota || null, notaFecha: r.notaFecha || null, notaAutor: r.notaAutor || null, noRodaje: !!r.noVaRodaje, posicion: pos
    });
    meta.rowsSent.push({ row: r, clientUuid: r.clientUuid, seq: (r._dirtySeq || 0) });
  }
  const serv = d.servicios || {};
  for (const dep in serv) (serv[dep] || []).forEach(function (r, i) { considerRow('servicios', r, i, dep); });
  (d.gastos   || []).forEach(function (r, i) { considerRow('gastos',   r, i); });
  (d.equipos  || []).forEach(function (r, i) { considerRow('tecnica',  r, i); });   // equipos(cliente)==tecnica(BD)
  (d.talentos || []).forEach(function (r, i) { considerRow('talentos', r, i); });
  const deletes = (project._budgetPendingDeletes || []).slice();
  if (upserts.length || deletes.length) {
    payload.presupuestoDiff = { upserts: upserts, deletes: deletes };
    meta.deletesSent = deletes;
    hayAlgo = true;
  }

  // ── SECCIONES AÚN NO MIGRADAS (asignaciones/finanzas/cotización/versiones):
  // se incluye la clave SOLO si su snapshot cambió. Sin la clave, el RPC no toca
  // la sección (un autosave de presupuesto ya no la reescribe). ──
  const snap = project._snap || {};
  const curAsig = _payloadAsignaciones(d), sAsig = JSON.stringify(curAsig);
  if (sAsig !== snap.asignaciones) { payload.asignaciones = curAsig; meta.snapSent.asignaciones = sAsig; hayAlgo = true; }
  const curFin = _payloadFinanzas(d), sFin = JSON.stringify(curFin);
  if (sFin !== snap.finanzas) { payload.finanzas = curFin; meta.snapSent.finanzas = sFin; hayAlgo = true; }
  const curCot = _payloadCotizacion(d), sCot = JSON.stringify(curCot || null);
  if (curCot !== undefined && sCot !== snap.cotizacion) { payload.cotizacion = curCot; meta.snapSent.cotizacion = sCot; hayAlgo = true; }
  const curVer = _payloadVersiones(d), sVer = JSON.stringify(curVer || null);
  if (curVer !== undefined && sVer !== snap.versiones) { payload.versiones = curVer; meta.snapSent.versiones = sVer; hayAlgo = true; }

  if (!hayAlgo) return null;   // no-op: nada cambió → no se llama al RPC
  return { payload: payload, meta: meta };
}

async function dalGuardarProyecto(project) {
  if (!sb || !project || PROJECTS_SOURCE !== 'supabase') return true;
  if (!authPuedeGuardarProyecto()) { _authBlockWriteToast(); return false; }   // V10.4.0 (Gate B)
  // Pasada 1 · mutex por proyecto: si ya hay un guardado en vuelo, no se solapa
  // (evita chocar contra la propia escritura anterior y generar un conflicto falso);
  // se reintenta al terminar.
  if (project._saving) { project._resaveQueued = true; return true; }
  const built = _dalProyectoPayload(project);
  if (!built) return true;   // Pasada 1 · no-op: nada cambió → no se llama al RPC
  project._saving = true;
  try {
    const _epRPC = _dalEpoca();
    const { data, error } = await sb.rpc('guardar_proyecto', { p: built.payload });
    if (error) throw error;
    if (_epRPC !== _dalEpoca()) return true;   // la org cambió durante el RPC: el write ya aterrizó en la org saliente; no re-contaminar DAL_KNOWN_* ni adoptar sobre un objeto muerto
    _dalAdoptarRespuesta(project, built.meta, data);   // adopta versiones nuevas + limpia las marcas de lo enviado
    DAL_KNOWN_PROJECT_IDS.add(project.id);
    return true;
  } catch (e) {
    console.error('[dal] guardar proyecto', project && project.id, e);
    if (manejarErrorPlan(e)) {   // V11.16.0 · Frente D: tope de proyectos del plan
      /* La base rechazó por tope (proyecto nuevo, nunca guardado): revertimos el
         proyecto optimista local y volvemos al Control Room. El modal ya se mostró.
         Solo se revierte si NUNCA se guardó (no tocamos proyectos ya persistidos). */
      try {
        if (!DAL_KNOWN_PROJECT_IDS.has(project.id)) {
          var _ix = PROJECTS.findIndex(function (x) { return x.id === project.id; });
          if (_ix >= 0) PROJECTS.splice(_ix, 1);
          if (STATE.currentProject && STATE.currentProject.id === project.id) { try { navigateToControlRoom(); } catch (x) {} }
          try { renderMetrics(); renderKanban(); } catch (x) {}
        }
      } catch (x) {}
      return 'plan';   // señal: manejado por Frente D (no es fallo de sync genérico)
    }
    if (manejarConflicto(e, project)) return 'conflict';   // Pasada 1 · choque de versión (cabecera o presupuesto)
    return false;   // el aviso lo coordina dalFlushProyectos (un solo toast)
  } finally {
    project._saving = false;
    if (project._resaveQueued) {
      project._resaveQueued = false;
      if (!project._autosaveSuspendedByConflict) dalTouchProyecto(project);   // re-disparar el guardado encolado
    }
  }
}

/* Pasada 1 · adopta la respuesta de guardar_proyecto. La versión (cabecera y por
   fila) se adopta SIEMPRE; la marca de "sucio" se limpia SOLO si la fila/cabecera
   no se volvió a editar durante el viaje del RPC (seq sin cambios), para no perder
   esa segunda edición. Snapshots de secciones: se re-baselinan con LO ENVIADO. */
function _dalAdoptarRespuesta(project, meta, data) {
  data = data || {};
  if (data.headerVersion != null) project._headerVersion = data.headerVersion;
  if (meta.headerSent && (project._headerDirtySeq || 0) === meta.headerSeq) project._headerDirty = false;
  const vers = (data.budget && data.budget.versions) || {};
  (meta.rowsSent || []).forEach(function (s) {
    const r = s.row; if (!r) return;
    if (vers[s.clientUuid] != null) {
      r.version = vers[s.clientUuid];                       // adopción incondicional de la versión nueva
      if ((r._dirtySeq || 0) === s.seq) r._dirty = false;   // limpieza condicional de la marca de sucio
    }
  });
  if (meta.deletesSent && meta.deletesSent.length && project._budgetPendingDeletes) {
    const enviados = new Set(meta.deletesSent.map(function (x) { return x.clientUuid + '@' + x.version; }));
    project._budgetPendingDeletes = project._budgetPendingDeletes.filter(function (x) { return !enviados.has(x.clientUuid + '@' + x.version); });
  }
  if (!project._snap) project._snap = {};
  Object.keys(meta.snapSent || {}).forEach(function (k) { project._snap[k] = meta.snapSent[k]; });
}

/* Pasada 1 · choque de versión: el RPC lanza 'TAKEOS_CONFLICT:{seccion,ids}'.
   Suspende el autosave del proyecto (para no reabrir el aviso cada 1,5 s) y muestra
   UNA sola vez el modal apuntando a las filas/cabecera en conflicto. Hermano de
   manejarErrorPlan. Devuelve true si manejó un conflicto. */
function manejarConflicto(e, project) {
  var raw = (e && e.message) ? String(e.message) : String(e || '');
  var m = raw.match(/TAKEOS_CONFLICT:\s*(\{[\s\S]*\})/);
  if (!m) return false;
  var info; try { info = JSON.parse(m[1]); } catch (x) { info = { seccion: '', ids: [] }; }
  if (!project) return true;
  project._autosaveSuspendedByConflict = true;        // no reintentar hasta que el usuario recargue
  if (project._conflictoModalAbierto) return true;    // ya se mostró: una sola vez por conflicto
  project._conflictoModalAbierto = true;
  _mostrarModalConflicto(project, info);
  return true;
}

/* _budgetFindRow → movido a src/modules/presupuesto-cotizacion.js (Etapa 2) */

function _mostrarModalConflicto(project, info) {
  var esCabecera = (info && info.seccion === 'cabecera');
  var cuerpo;
  if (esCabecera) {
    cuerpo = '<p style="margin:0;font-size:13.5px;color:var(--ink-secondary);line-height:1.6;">Otra sesión guardó cambios en la <strong>información del proyecto</strong> (cliente, agencia, derechos, fechas…) mientras la editabas. Para no pisar su trabajo, recarga la versión más nueva y vuelve a aplicar tu cambio.</p>';
  } else {
    var ids = (info && Array.isArray(info.ids)) ? info.ids : [];
    var li = ids.map(function (cu) {
      var r = _budgetFindRow(project, cu); if (!r) return null;
      var concepto = escapeHtml(r.rol || r.item || r.nombre || '(sin concepto)');
      var val = (r.valor != null) ? escapeHtml(fmtMoney(r.valor)) : '—';
      return '<li style="margin:3px 0;"><strong>' + concepto + '</strong> — intentabas guardar: ' + val + '</li>';
    }).filter(Boolean);
    cuerpo = '<p style="margin:0 0 8px;font-size:13.5px;color:var(--ink-secondary);line-height:1.6;">Otra sesión guardó cambios en estas filas del presupuesto mientras las editabas:</p>'
      + '<ul style="margin:0 0 10px;padding-left:18px;font-size:13px;color:var(--ink-primary);">' + (li.length ? li.join('') : '<li>(no se pudieron ubicar las filas)</li>') + '</ul>'
      + '<p style="margin:0;font-size:12.5px;color:var(--ink-faint);line-height:1.55;">Al recargar se trae la versión del servidor y se descartan tus cambios sin guardar de este presupuesto. Anota lo que necesites antes de recargar.</p>';
  }
  showModal({
    title: esCabecera ? 'Hay una versión más nueva (cabecera)' : 'Hay una versión más nueva (presupuesto)',
    body: cuerpo,
    confirmLabel: 'Recargar ahora',
    cancelLabel: 'Recargar en un momento',
    onConfirm: function () { _conflictoRecargarAhora(project); },
    onCancel: function () { _conflictoMasTarde(project); }
  });
}

async function _conflictoRecargarAhora(project) {
  project._conflictoModalAbierto = false;
  _conflictoBannerHide();
  var ok = await dalReloadProyecto(project.id);   // re-fusión: versiones frescas + línea base limpia
  if (ok) {
    project._autosaveSuspendedByConflict = false;   // reanuda el autosave
    try { if (STATE.currentView === 'project' && STATE.currentModule && STATE.currentProject && STATE.currentProject.id === project.id) renderModule(STATE.currentModule); } catch (x) {}
    try { showToast({ kind: 'success', title: 'Proyecto recargado', body: 'Trajimos la versión más nueva. Vuelve a aplicar tu cambio.', duration: 6000 }); } catch (x) {}
  } else {
    try { showToast({ kind: 'error', title: 'No se pudo recargar', body: 'Revisa tu conexión e inténtalo de nuevo.', duration: 6000 }); } catch (x) {}
    _conflictoBannerShow(project);   // sigue pendiente
  }
}

function _conflictoMasTarde(project) {
  project._conflictoModalAbierto = false;
  _conflictoBannerShow(project);   // autosave sigue suspendido + banner persistente
}

function _conflictoBannerShow(project) {
  _conflictoBannerHide();
  var b = document.createElement('div');
  b.id = 'conflictoBanner';
  b.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:9999;max-width:92vw;background:var(--bg-card,#1a1a1c);border:1px solid var(--accent,#B03A2F);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 6px 24px rgba(0,0,0,.28);font-size:13px;color:var(--ink-secondary);';
  b.innerHTML = '<span>Tienes una versión más nueva sin cargar. <strong>Tus cambios no se están guardando</strong> hasta que recargues.</span>'
    + '<button class="btn btn-primary btn-sm" id="conflictoBannerBtn" style="white-space:nowrap;">Recargar ahora</button>';
  document.body.appendChild(b);
  var btn = document.getElementById('conflictoBannerBtn');
  if (btn) btn.onclick = function () { _conflictoRecargarAhora(project); };
}
export function _conflictoBannerHide() {
  var b = document.getElementById('conflictoBanner');
  if (b && b.parentNode) b.parentNode.removeChild(b);
}

/* Operaciones 4a (rodajes + plan de rodaje + hoja de llamado) -> payload para
   guardar_operaciones_4a. rodajes relacional; plan/hoja son JSONB 1:1 (null si vacíos). */
function _dalOperaciones4aPayload(project) {
  const d = project.data || {};
  const rodajes = (d.rodajes || []).map(function(r){
    return { diaId: r.diaId || '', fecha: r.fecha || '', activo: !!r.activo, descripcion: r.descripcion || '' };
  });
  const plan = (d.planRodaje && typeof d.planRodaje === 'object' && Object.keys(d.planRodaje).length) ? d.planRodaje : null;
  const hoja = (d.hojaLlamado && typeof d.hojaLlamado === 'object' && Object.keys(d.hojaLlamado).length) ? d.hojaLlamado : null;
  // Plan de Scouting: se manda como documento JSONB si tiene contenido real
  // (paradas, fecha o gente). Si está vacío/default, va null y la RPC borra el
  // documento del proyecto (mismo trato que plan de rodaje / hoja de llamado).
  const sc = d.scouting;
  const scoutTieneContenido = !!(sc && typeof sc === 'object' && (
    (Array.isArray(sc.filas) && sc.filas.length) ||
    (sc.fecha && String(sc.fecha).trim()) ||
    (Array.isArray(sc.quienes) && sc.quienes.some(function (q) { return q && String(q).trim(); }))
  ));
  const scouting = scoutTieneContenido ? sc : null;
  return { id: project.id, rodajes: rodajes, planRodaje: plan, hojaLlamado: hoja, scouting: scouting };
}

async function dalGuardarOperaciones4a(project) {
  if (!sb || !project || PROJECTS_SOURCE !== 'supabase') return true;
  if (!authPuedeGuardarOperaciones()) { _authBlockWriteToast(); return false; }   // V10.4.0 (Gate B)
  try {
    const { error } = await sb.rpc('guardar_operaciones_4a', { p: _dalOperaciones4aPayload(project) });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('[dal] guardar operaciones 4a', project && project.id, e);
    return false;
  }
}

/* Operaciones 4b (locaciones + crew + responsables + asistentes + gastos op) ->
   payload para guardar_operaciones_4b. CONTRATO: se manda el estado COMPLETO de
   todas las piezas en cada llamada (la RPC reemplaza todo; lo que no se manda, se
   borra). Los dicts crewExtra/responsables se aplanan a arreglos para la RPC. */
function _dalOperaciones4bPayload(project) {
  const d = project.data || {};
  const locaciones = (d.locaciones || []).map(function(l){
    return { locId: l.locId || '', estado: l.estado || '', costo: (l.costo != null ? l.costo : 0),
             contratacion: l.contratacion || '', notasProy: l.notasProy || '' };
  });
  const crewExtra = Object.keys(d.crewExtra || {}).map(function(nombre){
    const info = (d.crewExtra[nombre]) || {};
    return { nombre: nombre, medioTransporte: info.medioTransporte || '' };
  });
  const crewExternos = (d.crewExternos || []).map(function(c){
    return { tipo: c.tipo || '', nombre: c.nombre || '', rol: c.rol || '', telefono: c.telefono || '',
             restriccion: c.restriccion || '', direccion: c.direccion || '', comuna: c.comuna || '' };
  });
  const responsables = Object.keys(d.responsables || {}).map(function(seccion){
    return { seccion: seccion, nombre: d.responsables[seccion] || '' };
  });
  const a = d.asistentes || {};
  const asistentes = { cliente: a.cliente || 0, agencia: a.agencia || 0, externo: a.externo || 0 };
  const g = d.gastosOp || {};
  const gastosOp = {
    cajaProd: (g.cajaProd != null ? g.cajaProd : 0),
    cajaDevuelto: (g.cajaDevuelto != null ? g.cajaDevuelto : 0),
    cajaMovs: (Array.isArray(g.cajaMovs) ? g.cajaMovs : []),
    presupuestos: (g.presupuestos || []).map(function(b){
      return { id: b.id || '', nombre: b.nombre || '', linea: b.linea || '', resp: b.resp || '', asignado: (b.asignado != null ? b.asignado : 0) };
    }),
    movimientos: g.movimientos || [],
    lineasExtra: g.lineasExtra || []
  };
  const out = { id: project.id, locaciones: locaciones, crewExtra: crewExtra, crewExternos: crewExternos,
                responsables: responsables, asistentes: asistentes, gastosOp: gastosOp };
  // Hilo de "Observar" (gasto_comments): solo se manda si YA está cargado en
  // memoria (array). Si nunca se cargó (undefined), se OMITE la clave para que la
  // RPC preserve el hilo existente y no lo borre (ver migración 20260628130000).
  if (Array.isArray(d.gastoComments)) {
    out.gastoComments = d.gastoComments.map(function(c){
      return { id: c.id || '', gastoId: c.gastoId || '', autor: c.autor || '', texto: c.texto || '', ts: c.ts || '' };
    });
  }
  return out;
}

async function dalGuardarOperaciones4b(project) {
  if (!sb || !project || PROJECTS_SOURCE !== 'supabase') return true;
  if (!authPuedeGuardarOperaciones()) { _authBlockWriteToast(); return false; }   // V10.4.0 (Gate B)
  try {
    const { error } = await sb.rpc('guardar_operaciones_4b', { p: _dalOperaciones4bPayload(project) });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('[dal] guardar operaciones 4b', project && project.id, e);
    return false;
  }
}

/* Operaciones 4c (tareas + señales) -> payload para guardar_operaciones_4c.
   CONTRATO (igual que 4a/4b): se manda el ESTADO COMPLETO de tareas y señales en
   cada llamada; la RPC reemplaza todo. Las tareas llevan sus comentarios y
   adjuntos anidados (adjuntos solo-nombre; el binario es de Storage, pendiente). */
function _dalOperaciones4cPayload(project) {
  const d = project.data || {};
  const tareas = (d.tareas || []).map(function(t){
    return {
      id: t.id || '', seccion: t.seccion || '', texto: t.texto || '', asignadoA: t.asignadoA || '',
      creadoPor: t.creadoPor || '', estado: t.estado || 'pendiente',
      creadaTs: (t.creadaTs != null ? t.creadaTs : null),
      comentarios: (t.comentarios || []).map(function(c){
        return { id: c.id || '', autor: c.autor || '', texto: c.texto || '', ts: c.ts || '' };
      }),
      adjuntos: (t.adjuntos || []).map(function(a){ return { name: a.name || '', path: a.path || '' }; })
    };
  });
  const senales = (d.senales || []).map(function(s){
    return { id: s.id || '', tipo: s.tipo || '', seccion: s.seccion || '',
             rolObjetivo: (s.rolObjetivo != null ? s.rolObjetivo : null),
             descripcion: s.descripcion || '', ts: (s.ts != null ? s.ts : null),
             vistoPor: Array.isArray(s.vistoPor) ? s.vistoPor : [] };
  });
  return { id: project.id, tareas: tareas, senales: senales };
}

async function dalGuardarOperaciones4c(project) {
  if (!sb || !project || PROJECTS_SOURCE !== 'supabase') return true;
  if (!authPuedeGuardarOperaciones()) { _authBlockWriteToast(); return false; }   // V10.4.0 (Gate B)
  try {
    const { error } = await sb.rpc('guardar_operaciones_4c', { p: _dalOperaciones4cPayload(project) });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('[dal] guardar operaciones 4c', project && project.id, e);
    return false;
  }
}

/* V9.6.1 — Documentos (4e). Inverso exacto de _dalDocumentosPartes. Manda el
   ESTADO COMPLETO (la RPC borra+reinserta). Solo persiste la RUTA del archivo
   (archivo_path); un documento legado con base64 (sin path) viaja con path null
   y conserva su binario en el estado local. */
function _dalOperaciones4ePayload(project) {
  const d = project.data || {};
  const items = ((d.documentos && d.documentos.items) || []).map(function(it){
    const a = it.archivo || {};
    return {
      id: it.id || '', categoria: it.categoria || 'otros', titulo: it.titulo || '', url: it.url || '', notas: it.notas || '', ts: it.ts || '',
      archivoNombre: (a.path ? (a.nombre || '') : ''),                 // solo si está en Storage
      archivoPath: (a.path || ''),
      archivoSize: (a.path && a.size != null ? a.size : null)
    };
  });
  return { id: project.id, documentos: items };
}
async function dalGuardarOperaciones4e(project) {
  if (!sb || !project || PROJECTS_SOURCE !== 'supabase') return true;
  if (!authPuedeGuardarOperaciones()) { _authBlockWriteToast(); return false; }   // V10.4.0 (Gate B)
  try {
    const { error } = await sb.rpc('guardar_operaciones_4e', { p: _dalOperaciones4ePayload(project) });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('[dal] guardar operaciones 4e (documentos)', project && project.id, e);
    return false;
  }
}

/* Debounce por proyecto: junta ediciones y escribe los proyectos tocados. */
const _dalDirtyProjects = new Set();
let _dalProyFlushTimer = null;

/* D0 · Reset del estado interno del DAL al cambiar de organización activa.
   Sin esto, los sets de IDs conocidos y los timers de guardado pendientes
   sobreviven al cambio de org → fusiones contra IDs ajenos y writes tardíos
   contra la org equivocada. Lo invoca _setOrgActiva (boot.js) vía window. */
function _dalEpoca() { return window._ORG_EPOCA || 0; }
/* Las cadenas de boot capturan la época al entrar y abortan tras cada await si
   cambió: una cadena obsoleta no puede re-poblar los stores recién reseteados
   con datos de la org anterior (hallazgo de la auditoría adversarial de D0). */
export function dalResetOrg() {
  try {
    window._ORG_EPOCA = _dalEpoca() + 1;   // invalida toda cadena de boot en vuelo
    [DAL_KNOWN_LOC_IDS, DAL_KNOWN_LEGAL_DOC_IDS, DAL_KNOWN_LEGAL_TPL_IDS,
     DAL_KNOWN_CONTACT_IDS, DAL_KNOWN_COMPANY_IDS, DAL_KNOWN_PROJECT_IDS,
     _dalDirtyProjects].forEach(function (s) { s.clear(); });
    Object.keys(_dalSaveTimers).forEach(function (k) { clearTimeout(_dalSaveTimers[k]); delete _dalSaveTimers[k]; });
    clearTimeout(_dalProyFlushTimer); _dalProyFlushTimer = null;
  } catch (e) { console.error('[dal] reset de org', e); }
}
export function dalTouchProyecto(project) {
  if (PROJECTS_SOURCE !== 'supabase' || !project || !project.id) return;
  if (project._autosaveSuspendedByConflict) return;   // Pasada 1 · autosave suspendido por conflicto (hasta recargar)
  _dalDirtyProjects.add(project.id);
  clearTimeout(_dalProyFlushTimer);
  _dalProyFlushTimer = setTimeout(dalFlushProyectos, 1500);
}
export async function dalFlushProyectos() {
  const _ep = _dalEpoca();
  const ids = Array.from(_dalDirtyProjects); _dalDirtyProjects.clear();
  for (const id of ids) {
    if (_ep !== _dalEpoca()) return;   // la org cambió a mitad del flush: lo ya despachado aterriza bien; no seguir con estado ajeno
    const p = PROJECTS.find(function(x){ return x.id === id; });
    if (!p) continue;
    if (p._autosaveSuspendedByConflict) continue;        // Pasada 1 · proyecto con conflicto pendiente: no autosalvar
    const okCore = await dalGuardarProyecto(p);          // núcleo: cabecera+finanzas+presupuesto+cotización
    if (okCore === 'plan' || okCore === 'conflict') continue;   // ya manejado (plan: modal+rollback; conflict: aviso+suspensión)
    const okOps  = await dalGuardarOperaciones4a(p);     // operaciones 4a: rodajes+plan+hoja
    const okOps2 = await dalGuardarOperaciones4b(p);     // operaciones 4b: locaciones+crew+responsables+asistentes+gastos op
    const okOps3 = await dalGuardarOperaciones4c(p);     // operaciones 4c: tareas+señales
    const okOps4 = await dalGuardarOperaciones4e(p);     // operaciones 4e: documentos (rutas; binario en Storage)
    if (okCore === false || okOps === false || okOps2 === false || okOps3 === false || okOps4 === false) {
      try { showToast({ kind: 'warning', title: 'Sincronización parcial', body: 'Se guardó en el respaldo local, pero falló la sincronización con Supabase. Vuelve a guardar para reintentar.', duration: 6000 }); } catch (x) {}
    }
  }
}

/* Banner visible dentro del modulo Base de Datos (claridad sobre comodidad). */

// ── Window bridges DAL (3 barridos: consumo externo, auto-consumo, nombre-string) ──

// D4b · ganchos definidos por este módulo (consumidos por módulos más tempranos)
async function dalCrearDepartamento(projectId, nombre) {
  if (!sb) throw new Error('sin conexión');
  const { data, error } = await sb.rpc('crear_departamento', { p_project_id: projectId, p_nombre: nombre });
  if (error) throw error;
  return data;   // int id (nuevo, o el default/custom existente reusado)
}
async function dalRenombrarDepartamento(departmentId, nombre) {
  if (!sb) throw new Error('sin conexión');
  const { error } = await sb.rpc('renombrar_departamento', { p_department_id: departmentId, p_nombre: nombre });
  if (error) throw error;
}
async function dalReordenarDepartamentos(projectId, ids) {
  if (!sb) throw new Error('sin conexión');
  const { error } = await sb.rpc('reordenar_departamentos', { p_project_id: projectId, p_ids: ids });
  if (error) throw error;
}
define('_dalEmpresaSaveSoon', _dalEmpresaSaveSoon);
define('_dalPerfilSaveSoon', _dalPerfilSaveSoon);
define('dalGuardarEmpresa', dalGuardarEmpresa);
define('dalCrearDepartamento', dalCrearDepartamento);
define('dalRenombrarDepartamento', dalRenombrarDepartamento);
define('dalReordenarDepartamentos', dalReordenarDepartamentos);
