// Punto de entrada de módulos de TakeOS — Etapa 1.
//
// Por ahora NO mueve lógica: solo confirma que un módulo ES (type="module")
// convive con el gran <script> clásico inline dentro del build de Vite.
//
// A medida que extraigamos piezas a src/lib/, aquí irán sus imports y sus
// "puentes" a window para no romper los onclick inline. Ejemplo futuro:
//   import { escapeHtml } from './lib/helpers.js';
//   window.escapeHtml = escapeHtml;   // ← el puente
console.info('[etapa1] módulo de entrada cargado ✓');
window.__TAKEOS_ETAPA1__ = true; // marcador temporal para verificar en consola
