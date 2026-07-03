// D2 · Delegación de eventos — el reemplazo de los ~991 handlers on*= inline.
//
// UN listener por tipo de evento a nivel documento; los módulos registran
// acciones con registrarAcciones(ns, mapa) y el HTML generado las invoca con
// data-accion="ns.nombre" + data-args (JSON) + data-on (tipos, default click).
// Mata la familia de escaping de comillas de on*= (los data-* llegan ya
// decodificados vía dataset, sin re-parseo de JS) y es el camino a una CSP
// sin 'unsafe-inline' (D3).
//
// Firma de toda acción: (args, el, ev) — args del JSON, el = elemento con
// data-accion, ev = evento nativo (los handlers que usaban this/event).
import { escapeHtml } from './helpers.js';
import { closeModal } from './ui.js';

const ACCIONES = {};

export function registrarAcciones(ns, mapa) {
  ACCIONES[ns] = Object.assign(ACCIONES[ns] || {}, mapa);
}

/* Atributos para HTML generado:
   `<button ${accionHTML('snap.revertir', i)}>`                → click
   `<input ${accionHTML('bd.filtro', id, { on: 'input' })}>`   → otro evento
   El último argumento {on:'...'} (objeto plano) define el/los tipos. */
export function accionHTML(accion) {
  var args = Array.prototype.slice.call(arguments, 1);
  var on = 'click';
  var ult = args[args.length - 1];
  if (ult && typeof ult === 'object' && !Array.isArray(ult) && ult.on) { on = ult.on; args.pop(); }
  var a = 'data-accion="' + accion + '"';
  if (args.length) a += ' data-args="' + escapeHtml(JSON.stringify(args)) + '"';
  if (on !== 'click') a += ' data-on="' + on + '"';
  return a;
}

function despachar(ev) {
  var el = ev.target && ev.target.closest ? ev.target.closest('[data-accion]') : null;
  if (!el) return;
  var tipos = (el.dataset.on || 'click').split(/\s+/);
  if (tipos.indexOf(ev.type) < 0) return;
  var punto = el.dataset.accion.indexOf('.');
  var fn = ACCIONES[el.dataset.accion.slice(0, punto)] && ACCIONES[el.dataset.accion.slice(0, punto)][el.dataset.accion.slice(punto + 1)];
  if (!fn) { console.error('[delegacion] acción sin registrar:', el.dataset.accion); return; }
  var args = [];
  if (el.dataset.args) {
    try { args = JSON.parse(el.dataset.args); } catch (e) { console.error('[delegacion] data-args inválido en', el.dataset.accion, e); return; }
  }
  try { fn(args, el, ev); } catch (e) { console.error('[delegacion] acción', el.dataset.accion, e); }
}

/* Fase burbuja (paridad con los on*= inline durante la convivencia de la
   migración: un stopPropagation inline aguas abajo sigue frenando esto).
   Tipos que no burbujean (blur/focus/toggle) se agregan con captura cuando
   una tranche los necesite. */
['click', 'input', 'change', 'keydown', 'dblclick', 'mousedown', 'paste', 'submit', 'dragover', 'dragleave', 'drop'].forEach(function (t) {
  document.addEventListener(t, despachar);
});

/* Acciones universales compartidas (el patrón modal aparece en TODOS los
   módulos): backdrop cierra SOLO si el click fue directo sobre él — la
   traducción delegada del par onclick="closeModal()" +
   onclick="event.stopPropagation()" del hijo, que queda obsoleto. */
registrarAcciones('ui', {
  cerrar: function () { closeModal(); },
  backdrop: function (args, el, ev) { if (ev.target === el) closeModal(); },
});
