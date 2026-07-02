// Estado global compartido de TakeOS — Etapa 1.
//
// STATE es un OBJETO que se comparte por REFERENCIA: el codigo clasico y los
// modulos apuntan al mismo objeto (window.STATE), asi que leer y mutar
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
window.ORG_ID = '640ab1e0-011c-43fe-a5aa-5a636005f56f';   // organización activa (default: Primate Films)
window.USER_NOMBRE = '';
window.USER_APELLIDO = '';
window.TAKEOS_PERFIL = null;      // { codigo, nombre, tipo, profileId, contactId }
window.TAKEOS_ACCESO = null;      // { modulo: 'E'|'L'|'none' } o null (no cargado => lectura fail-closed)

// Identidad/sesion activa (scalars). Los escriben los cargadores
// (dalResolveIdentidad / dalLoadPermisos) y setCurrentUser desde el monolito
// (no-estricto -> escritura implicita a window). Aqui solo sus defaults.
// Las FUNCIONES cargadoras siguen en el monolito (acopladas a contactos/UI);
// se extraeran limpio en Etapa 2. Aqui dejamos el ESTADO coherente en state.js.
window.DAL_SESSION_UID = null;
window.DAL_SESSION_EMAIL = '';
if (!('USUARIO_ACTUAL' in window)) window.USUARIO_ACTUAL = ''; // guard: una IIFE clásica lo restaura desde localStorage en parse-time, ANTES de este eval — no pisarlo (auditoría de cierre 2-jul)

// Flags de origen de datos del DAL (Etapa B1). 'pending' → 'supabase' tras la
// primera lectura exitosa (fail-safe: sin lectura confirmada NO se escribe).
// Los ESCRIBE dal.js (via window.X); los LEEN dal.js, el monolito y varios
// modulos (gastos/kanban/notificaciones desnudo o window.; legal desnudo).
window.CONTACTS_SOURCE  = 'pending';
window.LOCATIONS_SOURCE = 'pending';
window.LEGAL_SOURCE     = 'pending';
window.PERFIL_SOURCE    = 'pending';
window.PROJECTS_SOURCE  = 'pending';
// Tope de colaboradores por plan (cache por org). Lo escribe dal.js
// (dalCargarTopeColaboradores); lo lee la UI de cargos del monolito.
window._TOPE_COLAB     = null;
window._TOPE_COLAB_ORG = null;
