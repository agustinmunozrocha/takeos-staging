// Cliente Supabase de TakeOS — Etapa 1.
//
// La URL/KEY se inyectan por entorno vía import.meta.env (Vite las reemplaza
// en build/dev): producción usa la base real, staging la de staging. Mismos
// .env que antes (VITE_SUPABASE_URL / VITE_SUPABASE_KEY), solo cambia que aquí
// se leen como módulo en vez del marcador %VITE_% del HTML.
//
// Se expone en window vía src/main.js (puente):
//   - window.supabaseInit  (lo llama el código clásico al arrancar)
//   - window.sb            (lo setea supabaseInit; el clásico lo usa como sb.*)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
console.info('[supabase] base:', SUPABASE_URL);

let sb = null;
if (!('sb' in window)) window.sb = null; // la propiedad existe desde el eval del módulo: los guards `if (!sb)` del DAL nunca pueden lanzar ReferenceError
export function supabaseInit() {
  if (sb) return sb;
  try {
    if (typeof supabase === 'undefined') { console.error('[supabase] librería no cargada'); return null; }
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    window.sb = sb;   // también disponible en la consola para pruebas
    return sb;
  } catch (e) { console.error('[supabase] init falló', e); return null; }
}
