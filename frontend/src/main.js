// Punto de entrada de módulos de TakeOS — Etapa 2.
//
// Importa las piezas extraídas a src/lib/ y src/modules/ y las re-expone en
// window (el "puente") para que el <script> clásico inline y los onclick
// inline las sigan encontrando como globales mientras dure la migración.
import { escapeHtml, safeUrl, showToast } from './lib/helpers.js';
import { supabaseInit } from './lib/supabase.js';
import { dalBootTaxRates } from './lib/rates.js';
import { STATE } from './lib/state.js';
import './lib/auth.js';
import './modules/kanban.js'; // puentea STATES, renderKanban, navigateToControlRoom, etc.
import './modules/notificaciones.js'; // puentea bellToggle, notifInit, renderNotificaciones, ntf*, etc.
import './modules/presupuesto-cotizacion.js'; // puentea renderPresupuesto, renderCotizacion, calcSummaryFin, cot*, budget*, etc.
import './modules/locaciones.js'; // puentea bdLocFind, projLocList, renderLocaciones, openLocDetail, loc*, locScout*, scout*
import './modules/legal.js'; // puentea renderLegal, legalSetSub, legalSetFiltro, openLegalGen, legalDoGenerate, legalExportPDF, legal* (todas)
import './modules/plan-rodaje.js'; // puentea renderPlanRodaje, exportPlanRodajePDF, pr*, renderHojaLlamado, exportHojaLlamadoPDF, printViaIframe, hl* (todas)

window.escapeHtml = escapeHtml;
window.safeUrl = safeUrl;
window.showToast = showToast;
window.supabaseInit = supabaseInit; // al llamarse, setea window.sb
window.dalBootTaxRates = dalBootTaxRates;
window.STATE = STATE; // mismo objeto compartido (estado global)

console.info('[etapa1] puente listo · en window:',
  ['escapeHtml', 'safeUrl', 'showToast', 'supabaseInit', 'dalBootTaxRates', 'authNivel', 'authPuedeVer'].every((n) => typeof window[n] === 'function')
  && !!window.STATE);
