// D4 · Ganchos — la inversión uniforme de TODAS las aristas hacia-arriba.
//
// Un módulo TEMPRANO (p.ej. nav, dal, ui) necesita invocar algo que define un
// módulo TARDÍO (p.ej. renderDocumentos). Importarlo crearía un ciclo ESM o un
// hoist peligroso; window era el viejo tablón de anuncios. El gancho es el
// reemplazo tipado y greppable:
//
//   productor (tardío):   define('renderDocumentos', renderDocumentos);
//   consumidor (temprano): gancho('renderDocumentos')(...args)   // en RUNTIME
//   valores no-función:    define('MODULES', MODULES); … valor('MODULES')
//
// Todos los define() corren al EVAL del productor (antes de DOMContentLoaded);
// toda invocación es runtime post-arranque — nunca hay carrera. Un gancho sin
// definir grita en consola con su nombre (jamás falla en silencio).

const REGISTRO = {};

export function define(nombre, fn) {
  if (REGISTRO[nombre] && REGISTRO[nombre] !== fn) console.warn('[ganchos] redefinición de', nombre);
  REGISTRO[nombre] = fn;
}

export function gancho(nombre) {
  return function () {
    const f = REGISTRO[nombre];
    if (typeof f !== 'function') { console.error('[ganchos] sin definir:', nombre); return undefined; }
    return f.apply(null, arguments);
  };
}

export function valor(nombre) {
  if (!(nombre in REGISTRO)) console.error('[ganchos] valor sin definir:', nombre);
  return REGISTRO[nombre];
}
