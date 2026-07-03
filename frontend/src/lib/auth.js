// Helpers de autenticacion / permisos — Etapa 1.
//
// Funciones que deciden que puede VER/EDITAR el usuario, segun su perfil y la
// matriz de permisos. Leen el estado (TAKEOS_ACCESO/PERFIL) y showToast desde
// window (puenteados en Etapa 1). MODULE_PERM_CODE y _authBlockToastAt quedan
// internos del modulo. Al final se auto-puentean a window (el codigo clasico
// los llama como globales).

// D1e · imports reales (regla lib-precede: solo de libs anteriores en main.js)
import { showToast } from './helpers.js';

import { TAKEOS_PERFIL, TAKEOS_ACCESO } from './state.js';
const MODULE_PERM_CODE = {
  'info-proyecto': 'info_proyecto',
  'bd-personas': 'bd',
  'presupuesto': 'presupuesto',
  'cotizacion': 'cotizacion',
  'crew': 'operacion_creatividad',
  'cargos': 'operacion_creatividad',
  'documentos': 'operacion_creatividad',
  'rodajes': 'operacion_creatividad',
  'locaciones': 'operacion_creatividad',
  'hoja-llamado': 'operacion_creatividad',
  'plan-rodaje': 'operacion_creatividad',
  'legal': 'gastos_legal_notificaciones',
  'correos': 'gastos_legal_notificaciones',
  'gastos': 'gastos_legal_notificaciones',
  'entregables': 'operacion_creatividad',
  'tareas': 'tareas',
  'reporte-cierre': 'reporte_cierre'
};
/* Nivel para un código de módulo de BD. Fail-closed: null (no cargado) => 'none';
   código ausente en la matriz cargada => 'none' (la matriz se siembra densa: si
   falta una fila es anomalía, no un permiso legítimo => se niega por seguridad). */
export function authNivel(modCode) {
  if (!TAKEOS_ACCESO) return 'none';
  const n = TAKEOS_ACCESO[modCode];
  return n || 'none';
}
/* V11.15.0 · Gate B (fail-closed): si la appKey no está mapeada a un código de
   módulo, se NIEGA por defecto ('none'), no se concede acceso total. Una appKey
   sin mapear es una anomalía (módulo nuevo sin registrar en MODULE_PERM_CODE),
   no un permiso legítimo => se esconde por seguridad. Todas las claves vivas del
   registro MODULES y del sidebar están en MODULE_PERM_CODE. */
export function authNivelModulo(appKey) {
  const code = MODULE_PERM_CODE[appKey];
  if (!code) return 'none';
  return authNivel(code);
}
export function authPuedeVer(appKey) { return authNivelModulo(appKey) !== 'none'; }
export function authEsAdmin() { return TAKEOS_PERFIL && (TAKEOS_PERFIL.codigo === 1 || TAKEOS_PERFIL.nombre === 'Administrador'); }
/* V10.5.2: editar responsables de sección es exclusivo de Administrador (1) y Ejecutivo (2).
   El servidor (RPC 4b) ya ignora los responsables para el resto; esto alinea la UI.
   Fail-open coherente: sin perfil cargado, no restringe. */
export function _puedeEditarResponsables() {
  if (!TAKEOS_PERFIL) return true;
  return TAKEOS_PERFIL.codigo === 1 || TAKEOS_PERFIL.codigo === 2;
}
/* V10.5.2: la escritura de tareas se gobierna por el módulo 'tareas' (no por
   operacion_creatividad), para que Finanzas pueda crear/editar tareas. */
export function _puedeEditarTareas() { return authNivel('tareas') === 'E'; }
/* Guardas de los RPCs de escritura: el proyecto-core (guardar_proyecto) toca
   varios módulos, así que se permite si hay 'E' en alguno de ellos; las
   operaciones usan 'operacion_creatividad'. */
export function authPuedeGuardarProyecto() {
  if (!TAKEOS_ACCESO) return true;
  return ['presupuesto', 'cotizacion', 'info_proyecto', 'reporte_cierre'].some(function (m) { return authNivel(m) === 'E'; });
}
export function authPuedeGuardarOperaciones() {
  if (!TAKEOS_ACCESO) return true;
  return authNivel('operacion_creatividad') === 'E';
}
let _authBlockToastAt = 0;
export function _authBlockWriteToast() {
  const now = Date.now();
  if (now - _authBlockToastAt < 4000) return;   // un solo aviso, no spam
  _authBlockToastAt = now;
  showToast({ kind: 'error', title: 'Sin permiso para editar', body: 'Tu perfil' + (TAKEOS_PERFIL ? ' (' + TAKEOS_PERFIL.nombre + ')' : '') + ' puede ver esto pero no guardar cambios. Los cambios no se enviaron.' });
}

// Puentes a window (el codigo clasico llama a estos como globales):
window.authNivel = authNivel;
window.authNivelModulo = authNivelModulo;
window.authPuedeVer = authPuedeVer;
window.authEsAdmin = authEsAdmin;
window._authBlockWriteToast = _authBlockWriteToast;
