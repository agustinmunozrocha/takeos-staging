// CTA productora + FRENTE D límites de plan (manejarErrorPlan, carteles de venta) — extraído de index.html (Etapa C4)

/* ════════════════════════════════════════════════════════════════════
   V11.8.0 · CTA "¿Tienes una productora?" (land-and-expand)
   Para usuarios persona natural SIN productora (cero membresías activas).
   Copy verbatim de Marketing (no editar). "Saber más" → LANDING pública en
   pestaña nueva (NO a crear cuenta ni a precios). Anti-cortisol: discreto,
   descartable por sesión, sin pop-up. Medición vía analytics_events.
   ════════════════════════════════════════════════════════════════════ */
export const TAKEOS_MARCA = 'TakeOS';                          // placeholder configurable (marca en standby)
const TAKEOS_LANDING_URL = 'https://agustinmunozrocha.github.io/takeos-landing/';   // landing real (Agustín, jun 2026)
const _CTA_PROD_DISMISS_KEY = 'takeos_cta_prod_dismissed';   // por sesión
export async function _ctaProdEvento(nombre, props) {
  try { if (sb) await sb.from('analytics_events').insert(Object.assign({ event_name: nombre }, props ? { props: props } : {})); } catch (e) {}
}
export function _ctaProdDescartado() {
  try { return sessionStorage.getItem(_CTA_PROD_DISMISS_KEY) === '1'; } catch (e) { return false; }
}
function ctaProdCerrar() {
  try { sessionStorage.setItem(_CTA_PROD_DISMISS_KEY, '1'); } catch (e) {}
  const el = document.getElementById('espCtaProd'); if (el) el.remove();
}
function ctaProdSaberMas() {
  _ctaProdEvento('cta_productora_click');
  try { window.open(TAKEOS_LANDING_URL, '_blank', 'noopener'); } catch (e) { window.location.href = TAKEOS_LANDING_URL; }
}

/* ════════════════════════════════════════════════════════════════════
   V11.16.0 · FRENTE D — Límites de plan como MOMENTO DE VENTA
   ════════════════════════════════════════════════════════════════════
   La base impone los topes y, al chocarlos, devuelve un código tipado
   (TAKEOS_PLAN_LIMITE:<recurso>:<máx> o TAKEOS_PLAN:<recurso>). El frontend
   los atrapa y muestra una invitación SOBRIA a cambiar de plan, nunca un
   portazo. Tono cerrado por Agustín: el hecho + la salida + el CTA, sin signos
   de exclamación ni venta agresiva. El CTA "Ver planes" lleva al selector de la
   landing (no se construye una pantalla de planes aparte). El número del tope se
   lee SIEMPRE del propio error: cambiarlo en la base no obliga a tocar esto. */
function _planVerPlanes() {
  try { window.open(TAKEOS_LANDING_URL, '_blank', 'noopener'); } catch (e) { window.location.href = TAKEOS_LANDING_URL; }
}
/* Modal sobrio reutilizable: hecho + salida + CTA "Ver planes". */
function _planModalVenta(titulo, cuerpo) {
  if (typeof showModal !== 'function') { try { showToast({ kind: 'info', title: titulo, body: cuerpo, duration: 8000 }); } catch (e) {} return; }
  showModal({
    title: titulo,
    body: '<p style="margin:0;font-size:13.5px;color:var(--ink-secondary);line-height:1.6;">' + escapeHtml(cuerpo) + '</p>',
    confirmLabel: 'Ver planes', cancelLabel: 'Cerrar',
    onConfirm: function () { _planVerPlanes(); }, onCancel: function () {}
  });
}
/* Piezas por módulo (TAKEOS_PLAN:<x>, sin tope). Los reservados ya quedan listos:
   cuando esas funciones existan y la base dispare el código, no hay que tocar nada. */
var _PLAN_MOD = {
  finanzas:       { titulo: 'Finanzas está en el plan Producción', frase: 'Finanzas está disponible en el plan Producción. Te permite registrar cobranzas a clientes, llevar el flujo de caja y la facturación.', bloqueo: true },
  reporte_cierre: { titulo: 'El reporte de cierre está en el plan Producción', frase: 'El reporte de cierre está disponible en el plan Producción.' },
  notificaciones: { titulo: 'Las notificaciones están en el plan Producción', frase: 'Las notificaciones están disponibles en el plan Producción.' }
};
/* Pantalla de "módulo bloqueado" (estado vacío con gancho), NO modal — para Finanzas. */
function _planModuloBloqueado(recurso) {
  var info = _PLAN_MOD[recurso] || { titulo: 'Disponible en el plan Producción', frase: 'Esta función está disponible en el plan Producción.' };
  var cont = document.getElementById('moduleMain') || document.getElementById('bdGlobalMain');
  if (!cont) { _planModalVenta(info.titulo, info.frase); return; }
  cont.innerHTML = '<div style="max-width:480px;margin:56px auto;text-align:center;padding:34px 30px;border:1px solid var(--rule);border-radius:14px;background:var(--bg-card);">'
    + '<div style="font-size:30px;margin-bottom:14px;opacity:.65;">🔒</div>'
    + '<h2 style="font-size:19px;font-weight:700;margin:0 0 10px;color:var(--ink-primary);">' + escapeHtml(info.titulo) + '</h2>'
    + '<p style="font-size:13.5px;color:var(--ink-secondary);line-height:1.6;margin:0 0 22px;">' + escapeHtml(info.frase) + '</p>'
    + '<button class="btn btn-primary" onclick="_planVerPlanes()">Ver planes</button>'
    + '</div>';
}
/* D.1 · MANEJADOR CENTRAL. Dado un error de la base: si trae un código de plan,
   muestra la pieza correspondiente y devuelve true (lo manejó). Si no, false
   (para que el caller siga con su manejo de error normal). */
function manejarErrorPlan(err) {
  var raw = (err && err.message) ? String(err.message) : String(err || '');
  var mLim = raw.match(/TAKEOS_PLAN_LIMITE:\s*([a-z_]+)\s*:\s*(\d+)/i);   // recurso + tope
  if (mLim) {
    var rec = mLim[1].toLowerCase(), max = mLim[2], uno = (max === '1');
    if (rec === 'proyectos') _planModalVenta('Tope de proyectos de tu plan', 'Tu plan permite ' + max + (uno ? ' proyecto activo' : ' proyectos activos') + '. Cierra un proyecto para liberar el cupo, o cambia de plan para tenerlos ilimitados.');
    else if (rec === 'colaboradores') _planModalVenta('Tope de colaboradores de tu plan', 'Tu plan permite hasta ' + max + ' personas en la pestaña Cargos de un proyecto. Quita a alguien de Cargos para liberar un cupo, o cambia de plan para subir el tope.');
    else _planModalVenta('Tope de tu plan', 'Alcanzaste un límite de tu plan actual. Para ampliarlo, cambia de plan.');
    return true;
  }
  var mMod = raw.match(/TAKEOS_PLAN:\s*([a-z_]+)/i);   // módulo no incluido (sin tope)
  if (mMod) {
    var r = mMod[1].toLowerCase(), info = _PLAN_MOD[r];
    if (info && info.bloqueo) _planModuloBloqueado(r);
    else _planModalVenta((info && info.titulo) || 'Disponible en el plan Producción', (info && info.frase) || 'Esta función está disponible en el plan Producción.');
    return true;
  }
  return false;
}

// ── Window bridges (3 barridos func+const) ──
window._planModalVenta = _planModalVenta;
window._planVerPlanes = _planVerPlanes;
window.manejarErrorPlan = manejarErrorPlan;

// D0 · puentes que faltaban desde la Etapa C (barrido 3 re-ejecutado): los
// handlers on* generados los invocan como globales.
window.ctaProdCerrar = ctaProdCerrar;
window.ctaProdSaberMas = ctaProdSaberMas;
