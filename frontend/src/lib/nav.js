// Navegación + registro MODULES + dispatcher renderModule — extraído de index.html (Etapa C5)
// ⚠ ORDEN: debe importarse ANTES que gastos.js — goWire() lee MODULES a pelo en su
// eval y resuelve vía MODULES (asignado aquí). Las entradas render son arrows
// diferidos (lección #7); jamás referencias directas.

// D1e · imports reales (regla lib-precede: solo de libs anteriores en main.js)
import { escapeHtml, showToast } from './helpers.js';
import { STATE } from './state.js';
import { authPuedeVer } from './auth.js';
import { sectionResponsableHTML } from './ui.js';

import { define, gancho, valor } from './ganchos.js';
export function navigateToModule(moduleKey) {
  // V10.4.0 (Gate B): no navegar a módulos sin acceso; caer al primero visible
  if (!authPuedeVer(moduleKey)) {
    const first = gancho('_firstVisibleModule')();
    showToast({ kind: 'warning', title: 'Sin acceso', body: 'Tu perfil no tiene acceso a este módulo.' });
    if (first && first !== moduleKey) return navigateToModule(first);
    return;
  }
  STATE.currentModule = moduleKey;

  // Update sidebar active state
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.classList.toggle('active', item.dataset.module === moduleKey);
  });

  // Render module
  renderModule(moduleKey);
  try { gancho('refreshSidebarTaskCounters')(); } catch (e) {}   // V9.6.16
  gancho('_lastViewSave')();   // V11.15.0 · FRENTE B (proyecto + pestaña)
  document.querySelector('.module-main').scrollTop = 0;
}

/* ════════════════════════════════════════════════════════════════════
   MÓDULOS — METADATOS + DISPATCHER
   ════════════════════════════════════════════════════════════════════
   Cada módulo tiene un campo `render` que apunta a la función específica
   que lo dibuja, o null si todavía es stub.

   Convención: las funciones render reciben (container, project) o
   (container) para módulos globales (como BD Personas).

   Para Capa 3 / V6 / V7, simplemente se agregan funciones reales y se
   conectan aquí. La arquitectura no cambia.
   ════════════════════════════════════════════════════════════════════ */

export const MODULES = {   // MODULES se asigna al cierre de la definición (línea marcada A4)
  'info-proyecto': {
    title: 'Info Proyecto',
    subtitle: 'Identidad del proyecto, cliente, equipo, fechas y resumen financiero.',
    eyebrow: 'Identidad',
    layer: 'Implementado · V5 Capa 2',
    scope: 'project',  // necesita un proyecto activo
    render: () => gancho('renderInfoProyecto')(),
    description: 'Identidad del proyecto, cliente, agencia, equipo asignado y resumen financiero alimentado desde Presupuesto.'
  },
  'bd-personas': {
    title: 'Base de Datos',
    subtitle: 'Repositorio único de personas, empresas, talentos y locaciones, transversal a todos los proyectos.',
    eyebrow: 'Personas',
    layer: 'Implementado · V5 Capa 2',
    scope: 'global',  // BD es transversal a todos los proyectos
    render: () => gancho('renderBDPersonas')(),
    description: 'Repositorio único transversal a todos los proyectos: personas, empresas, talentos, locaciones y futuras entidades. Alimenta Info Proyecto, Presupuesto, Crew, Locaciones y Legal con datos básicos, tributarios y operativos.'
  },
  'presupuesto': {
    title: 'Presupuesto',
    subtitle: 'Construcción del equipo desde una lógica económica.',
    eyebrow: 'Presupuesto',
    layer: 'Implementado · V5 Capa 2 (bug del Enter corregido)',
    scope: 'project',
    render: () => gancho('renderPresupuesto')(),
    description: 'Roles, personas, valores, DTE, cantidades, confirmaciones. Aquí nace el equipo del proyecto. Renders granulares: los cambios numéricos NO disparan re-render completo.'
  },
  'crew': {
    title: 'Crew',
    subtitle: 'Lista oficial de personas confirmadas para el proyecto.',
    eyebrow: 'Equipo',
    layer: 'Implementado · V5 Capa 2',
    scope: 'project',
    render: () => gancho('renderCrew')(),
    description: 'Espejo automático del Presupuesto (solo confirmados con nombre asignado). Auto-lookup desde BD de Personas para datos operativos.'
  },
  'cargos': {
    title: 'Cargos',
    subtitle: 'Quién ocupa cada cargo del proyecto y con qué perfil de acceso.',
    eyebrow: 'Equipo',
    layer: 'Implementado · V11.2 Capa 1 (persistencia provisional)',
    scope: 'project',
    render: () => gancho('renderCargos')(),
    description: 'Capa de asignación sobre el Crew: cargo, persona, tipo (interno/externo) y perfil de acceso. El envío real de invitaciones a externos se activa con el sistema de invitaciones (Auth + Legal).'
  },
  'rodajes': {
    title: 'Rodajes',
    subtitle: 'Gestión de los días activos de rodaje del proyecto.',
    eyebrow: 'Producción',
    layer: 'Implementado · V5.3 Capa 3',
    scope: 'project',
    render: () => gancho('renderRodajes')(),
    description: 'Cada día tiene fecha, estado, descripción e identificador único. Soporta múltiples días, activación y desactivación sin eliminar. Vinculado con Hoja de Llamado.'
  },
  'locaciones': {
    title: 'Locaciones',
    subtitle: 'Perfiles, fotos de scouting y estados del proyecto.',
    eyebrow: 'Producción',
    layer: 'Implementado · V8.2 Capa 3',
    scope: 'project',
    render: () => gancho('renderLocaciones')(),
    description: 'Fuente de verdad de las locaciones del proyecto. Repositorio con galería de fotos comprimidas y estados (Candidata/Confirmada/Descartada), más un Plan de Scouting. Las locaciones canónicas viven en la BD de Locaciones (transversal); el proyecto guarda solo su uso.'
  },
  'hoja-llamado': {
    title: 'Hoja de Llamado',
    subtitle: 'Documento operativo del día de rodaje.',
    eyebrow: 'Producción',
    layer: 'Implementado · V5.3 Capa 3',
    scope: 'project',
    render: () => gancho('renderHojaLlamado')(),
    description: 'Combina datos automáticos (crew, contactos, fechas) con input manual (call times, locaciones, notas). Se exporta como PDF para distribución y se versiona cuando hay cambios.'
  },
  'plan-rodaje': {
    title: 'Plan de Rodaje',
    subtitle: 'Cronograma del día con motor de tiempo: la duración manda y las horas se recalculan en cascada.',
    eyebrow: 'Producción',
    layer: 'Implementado · V7.6 (editor y motor; export PDF en camino)',
    scope: 'project',
    render: () => gancho('renderPlanRodaje')(),
    description: 'Un plan por día de rodaje (Plan A / Plan B). Filas Plano · Situación · Marcador, anclas con detección de choque, paralelos que no mueven el reloj, columnas modulares, banco de planos y versión por documento. La cabecera se alimenta de Info Proyecto, RODAJES y Hoja de Llamado.'
  },
  'legal': {
    title: 'Legal',
    subtitle: 'Contratos, cesiones de derechos y NDAs del proyecto.',
    eyebrow: 'Legal',
    layer: 'Implementado · V8.3 Capa 3',
    scope: 'project',
    render: () => gancho('renderLegal')(),
    description: 'Genera documentos legales desde plantillas fijas, autollenando variables desde la BD de Personas, el Presupuesto, Info Proyecto y el bloque Derechos. Ciclo de vida Borrador→Generado→Enviado→Firmado, versionado, export a PDF con marca y archivo trazable. Los documentos viven en la BD de Legal (transversal).'
  },
  'correos': {
    title: 'Notificaciones',
    subtitle: 'Centro de comunicaciones del proyecto: crew, talentos, cliente, agencia, transporte y catering.',
    eyebrow: 'Comunicación',
    layer: 'Implementado · V6.7 (experiencia final, envío vía backend)',
    scope: 'project',
    render: function() { return gancho('renderNotificaciones')(); },
    description: 'Plantillas editables sin tocar código, variables dinámicas, multi-canal (mail + WhatsApp Business), sistema de confirmación de asistencia, recordatorios automáticos según el cronograma operativo definido en el PRD.'
  },
  'documentos': {
    title: 'Documentos',
    subtitle: 'Centro documental y creativo del proyecto: brief, tratamientos, referencias y contexto.',
    eyebrow: 'Creative Hub',
    layer: 'Implementado · V6.7 (registro por link)',
    scope: 'project',
    render: () => gancho('renderDocumentos')(),   // arrow diferido (C1): referencia directa evaluaba en parse-time y renderDocumentos ya vive en documentos.js
    description: 'Repositorio central que reemplaza el rol de Milanote/Excel para documentos creativos y estratégicos del proyecto.'
  },
  'gastos': {
    title: 'Gastos',
    subtitle: 'Registro y control financiero del proyecto.',
    eyebrow: 'Finanzas',
    layer: 'Pendiente V6',
    scope: 'project',
    render: null,
    description: 'Espejo de la cuenta bancaria de producción más detalle de cada movimiento. Convive con herramientas externas de rinde de gastos (ej. Rindegastos). Integración futura como meta de roadmap.'
  },
  'entregables': {
    title: 'Entregables',
    subtitle: 'Constructor + repositorio + feedback + aprobaciones del cliente.',
    eyebrow: 'Entregables',
    layer: 'Pendiente V7',
    scope: 'project',
    render: null,
    description: 'Módulo integral que combina cuatro funciones: (1) Constructor de Entregables — basado en el desarrollo previo del Deliverables Builder; (2) Repositorio de Archivos — versionado por proyecto; (3) Feedback de Video — tipo Frame.io con notas al timecode exacto; (4) Aprobaciones del Cliente — registro formal de validaciones.'
  },
  'cotizacion': {
    title: 'Cotización',
    subtitle: 'Ofertas al cliente, presupuesto alternativo y condiciones del servicio.',
    eyebrow: 'Venta',
    layer: 'Implementado · V6.5',
    scope: 'project',
    render: () => gancho('renderCotizacion')(),
    description: 'Una o varias ofertas (packs) por proyecto. Cada oferta tiene su valor, qué incluye / qué NO, entregables y, opcionalmente, un presupuesto alternativo costeable internamente para saber si es rentable. La Carta de Cotización en PDF llega en V6.1.'
  },
  'reporte-cierre': {
    title: 'Reporte Inteligente de Cierre',
    subtitle: 'El Spotify Wrapped del proyecto.',
    eyebrow: 'Inteligencia',
    layer: 'Visión estratégica · V6+',
    scope: 'project',
    render: null,
    description: 'PDF de business intelligence generado automáticamente al cerrar un proyecto. Métricas, gráficos, conclusiones por IA. Diferenciador estratégico de TakeOS como SaaS. Ver sección 14 del PRD V2.'
  }
};
define('MODULES', MODULES);   // ui.js lo consume vía valor() (ui→nav sería ciclo: nav importa sectionResponsableHTML de ui)

/* Dispatcher. Si el módulo tiene función render, la ejecuta.
   Si no, dibuja el stub de Capa 1.
   V5.1.1: ahora decide en qué container pintar según STATE.currentView.
   Esto evita el bug de los IDs duplicados de V5.1. */
export function renderModule(key) {
  const m = MODULES[key];
  // Container correcto según vista actual
  const mainId = STATE.currentView === 'bd-global' ? 'bdGlobalMain' : 'moduleMain';
  const main = document.getElementById(mainId);
  if (!main) {
    console.error('Container no encontrado:', mainId, '— STATE.currentView =', STATE.currentView);
    return;
  }

  main.innerHTML = `
    <div class="module-header">
      <div class="module-title-block">
        <span class="module-eyebrow">${m.eyebrow}</span>
        <h1 class="module-title">${m.title}</h1>
        <p class="module-subtitle">${m.subtitle}</p>
        ${sectionResponsableHTML(key)}
      </div>
      <div id="moduleHeaderActions"></div>
    </div>
    <div class="module-content" id="moduleContent"></div>
  `;

  const content = document.getElementById('moduleContent');

  if (m.render) {
    try {
      m.render();
    } catch (err) {
      console.error('Error al renderizar módulo', key, err);
      content.innerHTML = `
        <div class="alert alert-error">
          <span class="alert-icon">⚠</span>
          <div>Ocurrió un error al renderizar este módulo. Revisa la consola del navegador. Detalle: ${escapeHtml(err.message)}</div>
        </div>`;
    }
  } else {
    content.innerHTML = `
      <div class="stub">
        <div class="stub-icon">◐</div>
        <h2 class="stub-title">Módulo en construcción</h2>
        <p class="stub-text">${m.description}</p>
        <span class="stub-tag">${m.layer}</span>
      </div>`;
  }
  try { gancho('applyModuleReadonly')(key); } catch (e) {}   // V10.4.0 (Gate B): solo-lectura si nivel 'L'
}

// ── Window bridges (3 barridos func+const) ──

