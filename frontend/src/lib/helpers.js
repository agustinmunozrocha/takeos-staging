// Helpers transversales de TakeOS — Etapa 1.
//
// Funciones puras reutilizables. Se exponen en window vía src/main.js (el
// "puente") para que el <script> clásico inline y los onclick inline las
// sigan encontrando como globales mientras dure la migración.

export function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
