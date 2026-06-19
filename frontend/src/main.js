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

window.escapeHtml = escapeHtml;
window.safeUrl = safeUrl;
window.showToast = showToast;
window.supabaseInit = supabaseInit; // al llamarse, setea window.sb

console.info('[etapa1] puente listo · en window:',
  ['escapeHtml', 'safeUrl', 'showToast', 'supabaseInit'].every((n) => typeof window[n] === 'function'));
