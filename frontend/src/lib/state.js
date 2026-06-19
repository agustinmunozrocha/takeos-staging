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
