// Punto de entrada de módulos de TakeOS — Etapa 2.
//
// Importa las piezas extraídas a src/lib/ y src/modules/ y las re-expone en
// window (el "puente") para que el <script> clásico inline y los onclick
// inline las sigan encontrando como globales mientras dure la migración.
import { escapeHtml, safeUrl, showToast } from './lib/helpers.js';
import { supabaseInit } from './lib/supabase.js';
import { dalBootTaxRates } from './lib/rates.js';
import { STATE } from './lib/state.js';
import './lib/data.js'; // catálogos y presets en window (LOC_*, REGIONES, BANCOS, DEFAULT_*, DTE_*, UNIDAD, DEMO_PROJECTS)
import './lib/auth.js';
import './modules/kanban.js'; // puentea STATES, renderKanban, navigateToControlRoom, etc.
import './modules/notificaciones.js'; // puentea bellToggle, notifInit, renderNotificaciones, ntf*, etc.
import './modules/presupuesto-cotizacion.js'; // puentea renderPresupuesto, renderCotizacion, calcSummaryFin, cot*, budget*, etc.
import './modules/locaciones.js'; // puentea bdLocFind, projLocList, renderLocaciones, openLocDetail, loc*, locScout*, scout*
import './modules/legal.js'; // puentea renderLegal, legalSetSub, legalSetFiltro, openLegalGen, legalDoGenerate, legalExportPDF, legal* (todas)
import './modules/plan-rodaje.js'; // puentea renderPlanRodaje, exportPlanRodajePDF, pr*, renderHojaLlamado, exportHojaLlamadoPDF, printViaIframe, hl* (todas)
import './modules/bd.js'; // puentea renderBD*, openEmpresa*, empresa*, archivar*, openPersonaForm, openGlobalBDPersonas, crewAddToBD, openPersonaByName, etc.
import './modules/bd-excel.js'; // puentea _normKey, _norm*BD, ensureXLSX, exportBDExcelV71, importBDExcelV71, buildPersonasDatalist, etc.
import './modules/buscador.js'; // puentea globalSearchInput, globalSearchKey, _gsearchHide, _gsearchGo
import './modules/config.js'; // puentea openConfigPanel, openEmpresaPerfil, orgLogo, _orgLogos, _emp*, _cp*, _pd*, abrirFlujoCrearProductora, abrirPrivacidadDatos
import './modules/dal.js'; // puentea dalBoot*, dalGuardar*, _dal*SaveSoon, dalTouchProyecto, dal* (Supabase DAL completo)
import './modules/gastos.js';
import './modules/persistencia-local.js'; // puentea markDirty, autosaveNow, undoLast/redoLast, exportSave, snapshots, import*
import './modules/perfil-onboarding.js';
import './modules/documentos.js'; // C1: Creative Hub del proyecto
import './modules/rodajes.js'; // C1: días de rodaje
import './modules/calculadoras.js'; // C1: tributaria + costo real + horas extra (estado _calc* en window) // puentea abrirPerfilUsuario, _rutValido, _regionCanonica // puentea renderGastos, renderCFO, openGlobalCFO, go*, cfo*, chipax* — goWire registra Gastos/CFO en window.MODULES

window.escapeHtml = escapeHtml;
window.safeUrl = safeUrl;
window.showToast = showToast;
window.supabaseInit = supabaseInit; // al llamarse, setea window.sb
window.dalBootTaxRates = dalBootTaxRates;
window.STATE = STATE; // mismo objeto compartido (estado global)

console.info('[etapa1] puente listo · en window:',
  ['escapeHtml', 'safeUrl', 'showToast', 'supabaseInit', 'dalBootTaxRates', 'authNivel', 'authPuedeVer'].every((n) => typeof window[n] === 'function')
  && !!window.STATE);
