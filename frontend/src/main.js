// Punto de entrada de módulos de TakeOS — Etapa 1.
//
// Importa las piezas extraídas a src/lib/ y las re-expone en window (el
// "puente") para que el <script> clásico inline y los onclick inline las
// sigan encontrando como globales mientras dure la migración.
//
// Patrón por cada pieza extraída:
//   import { fn } from './lib/...';
//   window.fn = fn;   // ← puente
import { escapeHtml, safeUrl, showToast } from './lib/helpers.js';
import { supabaseInit } from './lib/supabase.js';
import { dalBootTaxRates } from './lib/rates.js'; // su import ya setea las tasas default en window
import { STATE } from './lib/state.js';

window.escapeHtml = escapeHtml;
window.safeUrl = safeUrl;
window.showToast = showToast;
window.supabaseInit = supabaseInit; // al llamarse, setea window.sb
window.dalBootTaxRates = dalBootTaxRates;
window.STATE = STATE; // mismo objeto compartido (estado global)

console.info('[etapa1] puente listo · en window:',
  ['escapeHtml', 'safeUrl', 'showToast', 'supabaseInit', 'dalBootTaxRates'].every((n) => typeof window[n] === 'function')
  && !!window.STATE);
