// Estado global compartido de TakeOS — Etapa 1.
//
// STATE es un OBJETO que se comparte por REFERENCIA: el codigo clasico y los
// modulos apuntan al mismo objeto (STATE), asi que leer y mutar
// STATE.x (propiedades) propaga solo. Nunca se reasigna STATE entero (es
// const), por eso basta con compartir la referencia via el puente en main.js.
export const STATE = {
  currentView: 'control-room',  // 'control-room' | 'project'
  currentProject: null,
  currentModule: 'info-proyecto',
  currentFilter: 'all',
  currentViewMode: 'kanban',
  /* V5.3 (Nota 2): modo administrador de sesión. Stand-in del sistema
     de auth real que llega en V6. Cuando está activo, habilita acciones
     restringidas como devolver un proyecto de Preproducción a Venta.
     NO elimina la advertencia ni la filosofía de bloqueo: solo permite
     la excepción explícita, con confirmación grave. Vive en memoria de
     sesión (se pierde al recargar, como todo en el prototipo). */
  adminMode: false,
  /* UI STATE persistido: secciones colapsadas del Presupuesto.
     Key: projectId + ':' + dept (o 'gastos', 'equipos', 'talentos').
     Sin esto, el bug del Presupuesto reaparece al re-renderizar. */
  ui: {
    collapsed: {},          // ej: { 'P001:Dirección': false, 'P001:gastos': true }
    budgetSort: {},         // V10.1.0 (#1): orden por columna por tabla, solo presentación; NO persiste
    bdSearch: '',           // texto de búsqueda en BD Personas
    bdExpanded: null,       // nombre de persona expandida en BD
    hojaDiaSel: null,       // V5.3: diaId seleccionado en Hoja de Llamado
  prDiaSel: null,         // Plan de Rodaje: día seleccionado
  prUnidadId: null,       // Plan de Rodaje: unidad activa
  prVarId: null,          // Plan de Rodaje: plan/variante activa
  prSelFila: null         // Plan de Rodaje: fila seleccionada (inserción contextual)
  }
};

// Scalars de estado (mutables). Viven en window: el codigo clasico (no-estricto)
// los LEE y los ESCRIBE como globales sin cambios; aqui solo se fijan sus
// defaults al cargar el modulo. (Si en el futuro un modulo los escribe, debe
// hacerlo via window.X por el modo estricto.)
export let ORG_ID = '640ab1e0-011c-43fe-a5aa-5a636005f56f';   // organización activa (default: Primate Films)

export let USER_NOMBRE = '';
export let USER_APELLIDO = '';
export let TAKEOS_PERFIL = null;
export let TAKEOS_ACCESO = null;

// Identidad/sesion activa (scalars). Los escriben los cargadores
// (dalResolveIdentidad / dalLoadPermisos) y setCurrentUser desde el monolito
// (no-estricto -> escritura implicita a window). Aqui solo sus defaults.
// Las FUNCIONES cargadoras siguen en el monolito (acopladas a contactos/UI);
// se extraeran limpio en Etapa 2. Aqui dejamos el ESTADO coherente en state.js.
window.DAL_SESSION_UID = null;
window.DAL_SESSION_EMAIL = '';
export let USUARIO_ACTUAL = ('USUARIO_ACTUAL' in window) ? window.USUARIO_ACTUAL : '';

// Flags de origen de datos del DAL (Etapa B1). 'pending' → 'supabase' tras la
// primera lectura exitosa (fail-safe: sin lectura confirmada NO se escribe).
// Los ESCRIBE dal.js (via window.X); los LEEN dal.js, el monolito y varios
// modulos (gastos/kanban/notificaciones desnudo o window.; legal desnudo).
export let CONTACTS_SOURCE  = 'pending';
export let LOCATIONS_SOURCE = 'pending';
export let LEGAL_SOURCE     = 'pending';
export let PERFIL_SOURCE    = 'pending';
export let PROJECTS_SOURCE  = 'pending';
// (dalCargarTopeColaboradores); lo lee la UI de cargos del monolito.
export let _TOPE_COLAB = null;
export let _TOPE_COLAB_ORG = null;
/* ════════════════════════════════════════════════════════════════════
   ESTADO GLOBAL
   ════════════════════════════════════════════════════════════════════
   En producción real, esto vendrá del backend. Por ahora es un objeto
   en memoria. Las estructuras clave son:

   - STATES: estados posibles del proyecto (PRD V2 sección 04)
   - BD_PERSONAS: repositorio único transversal a todos los proyectos
   - PROJECTS: array de proyectos. Cada uno tiene `.data` con su info
     completa (infoProyecto, servicios, gastos, equipos, talentos).
   - STATE: estado de UI (vista actual, módulo, filtros, secciones
     colapsadas — sí, eso se persiste para que el bug del Presupuesto
     no aparezca al re-renderizar).

   NOTA: BD_PERSONAS es global. Las personas no "pertenecen" a un
   proyecto, son referenciadas desde múltiples proyectos. Esto sigue
   el principio de fuente única de verdad del PRD V2 (sección 02).
   ════════════════════════════════════════════════════════════════════ */

/* STATES -> movido a src/modules/kanban.js (Etapa 2); expuesto en window vía puente */

/* En estados ≥ preproducción se muestra columna "Costo Real" en el
   Presupuesto. Atado al estado del proyecto, no a un toggle manual.
   (Decisión tomada en la planificación de V5 Capa 2.) */
export const STATES_WITH_REAL_COST = ['preproduccion', 'produccion', 'postproduccion', 'cierre', 'cerrado']; window.STATES_WITH_REAL_COST = STATES_WITH_REAL_COST;

/* V5.2.2: estados donde el presupuesto cotizado queda bloqueado.
   Filas existentes (no extras) no se pueden editar en Rol/DTE/Valor/
   Cantidad. Filas marcadas como `extra` siempre son editables. */
export const STATES_WITH_LOCKED_BUDGET = ['preproduccion', 'produccion', 'postproduccion', 'cierre', 'cerrado']; window.STATES_WITH_LOCKED_BUDGET = STATES_WITH_LOCKED_BUDGET;

/* cotizadoLocked → movido a src/modules/presupuesto-cotizacion.js (Etapa 2) */

/* ════════════════════════════════════════════════════════════════════
   BASE DE DATOS — MODELO UNIFICADO DE CONTACTOS (V7.3)
   ════════════════════════════════════════════════════════════════════
   CAMBIO DE FONDO vs V7.2: la identidad de cada registro ya NO es el
   nombre (key del diccionario), sino un ID estable generado. Esto:
     - elimina la clase de bug de V7.2.1/V7.2.2 (keys contaminadas,
       choques de nombre) de raíz;
     - permite que una misma persona tenga varios roles (Crew + Talento,
       etc.) en UN solo registro — antes se duplicaba entre tablas;
     - mapea 1:1 a tablas relacionales cuando llegue el backend.

   ── CANÓNICO (lo que se persiste y manda) ────────────────────────────
   BD_CONTACTOS[id]      · toda persona física (id-keyed)
   BD_EMPRESAS_BYID[id]  · empresas clientes/proveedores (id-keyed)

   ── PROYECCIONES (solo lectura, derivadas — las consume la UI actual) ─
   BD_PERSONAS[nombre], BD_TALENTOS[nombre], BD_EMPRESAS[nombreFantasia]
   Se reconstruyen con syncLegacyFromContactos() tras cualquier cambio.
   La UI no se tocó en este incremento: sigue leyendo estas proyecciones
   name-keyed. El incremento 3 las convertirá en vistas directas.

   ── Schema de un contacto canónico ───────────────────────────────────
   {
     id,                       // 'ctk_xxxxxxxxxx' — identidad real
     nombre, rut, email, telefono,
     roles: [],                // Crew|Interno|Talento|Contacto cliente|Proveedor individual
     rolHabitual,
     empresaId, relacionEmpresa,
     direccion, direccionLinea2, comuna, ciudad,
     restriccion, cumpleanos, notas,
     perfilPago:    { banco, codigoBanco, tipoCuenta, nCuenta, tipoDTE, dteHabitual } | null,
     perfilTalento: { genero, edad, altura, apariencia, areas,
                      tallaPolera, tallaPantalon, tallaCalzado, fotosLink, reelLink } | null
   }
   ════════════════════════════════════════════════════════════════════ */
export const BD_CONTACTOS = {}; window.BD_CONTACTOS = BD_CONTACTOS;             // CANÓNICO (id-keyed)
export const BD_EMPRESAS_BYID = {}; window.BD_EMPRESAS_BYID = BD_EMPRESAS_BYID; // CANÓNICO (id-keyed)
export const BD_PERSONAS = {}; window.BD_PERSONAS = BD_PERSONAS; // proyección name-keyed (UI)
export const BD_TALENTOS = {}; window.BD_TALENTOS = BD_TALENTOS;                // proyección name-keyed (UI)
export const BD_EMPRESAS = {}; window.BD_EMPRESAS = BD_EMPRESAS;                // proyección name-keyed por nombreFantasia (UI)
export const ORG_SERVICIOS = []; window.ORG_SERVICIOS = ORG_SERVICIOS;         // catálogo de servicios de la productora ({id,nombre,orden}); lo carga dalBootServicios

/* V8.2 — BD DE LOCACIONES (transversal, canónica). Misma jerarquía que
   Personas/Empresas: vive en el store global y sobrevive al cierre del
   proyecto. El uso por-proyecto vive en project.data.locaciones (PROJ_LOC).
   Esquema BD_LOC (V8.3.1): { locId:'LOC-NN', nombre, direccion, direccion2,
   comuna, ciudad, region, maps, orientacion, contactos:[{nombre,mail,tel,obs,
   relacion}], notas, fotos:[{url}] }. (Antes había un único `dueno`; ahora
   son varios contactos con su relación, p.ej. Dueño/Gerente/Encargado.) */
export const BD_LOC = []; window.BD_LOC = BD_LOC;
// LOC_ORIENTACIONES, LOC_ESTADOS, REGIONES_CHILE → movido a src/lib/data.js (Etapa B3)
export const BD_LEGAL = [];
export const BD_LEGAL_TPL = [];   // V8.4: plantillas legales personalizadas (las oficiales viven en LEGAL_TPL, en código)
// nextLegalId, legalDocsForProject → movidos a src/modules/legal.js (Etapa A1)

// ROLES_OPERATIVOS → movido a src/lib/data.js (Etapa B3)

export const PROJECTS = []; window.PROJECTS = PROJECTS; // puente para src/modules/kanban.js
/* V5.10 (Respuesta 1): papelera. Eliminar un proyecto NO lo destruye: lo mueve
   aquí. Se conserva indefinidamente (pesa poco) y se respalda en el guardado.
   Desde la papelera se puede restaurar. */
export const TRASH = []; window.TRASH = TRASH; // puente para src/modules/kanban.js
/* V7.9: perfil de la empresa/productora emisora (datos para documentos). Global, persiste en save y nube. NO vive en Notificaciones. */
export let EMPRESA_PERFIL = {
  /* V11.0.0 · multi-tenant: el perfil nace VACÍO. Los datos de la organización
     activa se cargan desde Supabase (organization_profile.profile) y el nombre
     de fantasía cae al nombre canónico de organizations.nombre si falta.
     Nunca volver a cablear aquí datos de una organización concreta. */
  nombreFicticio: '', razonSocial: '', rut: '', giro: '',
  direccion: '', comuna: '', ciudad: '', telefono: '', email: '', web: '',
  representante: '', repRut: '', repTelefono: '', repEmail: '',
  // V7.10: datos bancarios (para futuras transferencias) y enlaces/integraciones (para futuros botones: subir a Drive, abrir Milanote/Chipax, agendar en Calendar)
  bancoNombre: '', bancoTipoCuenta: '', bancoNumero: '', bancoTitular: '', bancoRut: '', bancoEmailPagos: '',
  driveLink: '', milanoteLink: '', chipaxLink: '', googleCalendarId: '', usaChipax: false,
  // V7.13: remitente para correos + link del formulario de pago (los lee Notificaciones)
  linkFormularioPago: '', remitenteNombre: '', remitenteRol: '', remitenteNumero: ''
}; window.EMPRESA_PERFIL = EMPRESA_PERFIL; // puente para src/modules/notificaciones.js
/* V5.11 (Nota 1): undo básico de un nivel por acción. */
// UNDO_STACK, UNDO_BASELINE, UNDO_MAX, REDO_STACK → movido a src/modules/persistencia-local.js (Etapa B2)

/* STATE -> movido a src/lib/state.js (Etapa 1); mismo objeto compartido en STATE via src/main.js */

/* ════════════════════════════════════════════════════════════════════
   CONSTANTES TRIBUTARIAS (Chile)
   ════════════════════════════════════════════════════════════════════
   Estas constantes rigen el cálculo del "Costo Empresa" según el tipo
   de DTE. Rescatado del V4 sin cambios — son reglas tributarias
   chilenas que no deben editarse arbitrariamente.

   - Boletas de honorarios y boletas a terceros tienen retención del
     15.25% que la productora paga al SII. El líquido que recibe el
     proveedor es el valor cotizado; el costo para la empresa es el
     bruto = valor / (1 - 0.1525).
   - Facturas (afectas o exentas) no tienen retención; el costo
     empresa es el valor neto. El IVA se carga al cliente, no al costo.
   ════════════════════════════════════════════════════════════════════ */
/* V9.6.18 · FUENTE ÚNICA DE VERDAD TRIBUTARIA: estas tasas son SOLO valores
   por defecto (red de seguridad). Al arrancar, dalBootTaxRates() las
   sobreescribe con la fila vigente de la tabla tax_rates en Supabase. Si el
   IVA o una retención cambia, el fix es un dato en la BD, no un deploy. Si
   Supabase no responde, la app sigue con estos defaults (nunca se rompe). */
/* Tasas (IVA, IMPUESTO_HONORARIOS, FACTOR_BOLETA, ...) -> movidas a src/lib/rates.js (Etapa 1); viven en window */

// DTE_OPTIONS, DTE_LABEL, DTE_LABEL_SHORT, DTE_CON_RETENCION, UNIDAD_OPTIONS → movido a src/lib/data.js (Etapa B3)

/* ════════════════════════════════════════════════════════════════════
   FÓRMULAS PURAS (sin side effects, sin dependencia de DOM)
   ════════════════════════════════════════════════════════════════════ */

// CÁLCULO/FORMATO: calcCostoEmpresa, getCostoReal, calcProjectTotals, formatCLP, fmtMoney, fmtDelta*, fmtPct, deltaClass*, initials, readNum, parseMoneyCLP, displayMoneyInputValue, onMoneyInput, normalizeTime24 → movido a src/lib/calc.js (Etapa C5)

/* ════════════════════════════════════════════════════════════════════
   CONTROL ROOM — RENDERIZADO
   ════════════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════════════
   V8.6 · SISTEMA DE TAREAS, COMENTARIOS Y RESPONSABILIDADES
   Sin backend de auth todavía: el "usuario actual" se simula y se puede
   cambiar desde el Control Room. Cuando exista login real, currentUser()
   pasará a leer la sesión y todo lo demás funciona igual.
   ════════════════════════════════════════════════════════════════════ */
/* USUARIO_ACTUAL -> a src/lib/state.js (Etapa 1); en window */
export let _TIENE_EMPRESA = false; // D3a: binding canónico; espejo window abajo
export const TAKEOS_VERSION = 'V11.14.0';   // Versión actual del cliente TakeOS. El historial de cambios vive en los changelogs (.md), no aquí.
// Bridges C6 (BD_LEGAL/TPL eran léxicas: los módulos las leen a pelo → ahora resuelven vía window)

// ── Bridges C6 (barrido final) ──
window.STATE = STATE;

/* ═══ D3a · SETTERS del estado global — la ÚNICA vía de escritura. Actualizan
   el binding vivo (los imports ven el cambio) Y el espejo window (los lectores
   window.X explícitos aún no migrados). ═══ */
export function setOrgId(v) { ORG_ID = v; }
export function setUserNombre(v) { USER_NOMBRE = v; }
export function setUserApellido(v) { USER_APELLIDO = v; }
export function setTakeosPerfil(v) { TAKEOS_PERFIL = v; }
export function setTakeosAcceso(v) { TAKEOS_ACCESO = v; }
export function setUsuarioActual(v) { USUARIO_ACTUAL = v; }
export function setSource(cual, v) {
  if (cual === 'contacts') { CONTACTS_SOURCE = v; }
  else if (cual === 'locations') { LOCATIONS_SOURCE = v; }
  else if (cual === 'legal') { LEGAL_SOURCE = v; }
  else if (cual === 'perfil') { PERFIL_SOURCE = v; }
  else if (cual === 'projects') { PROJECTS_SOURCE = v; }
}
export function setTieneEmpresa(v) { _TIENE_EMPRESA = v; }
export function setTopeColab(v) { _TOPE_COLAB = v; }
export function setTopeColabOrg(v) { _TOPE_COLAB_ORG = v; }
