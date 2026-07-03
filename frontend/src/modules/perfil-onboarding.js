// Perfil personal del usuario + Onboarding — extraído de index.html (Etapa B2)
// src/modules/perfil-onboarding.js
// _PERFIL_CTX y todos los _perfil* son privados del módulo; solo se exponen
// abrirPerfilUsuario (espacio/config/invitaciones/iniciarSesión la llaman),
// _rutValido (config.js) y _regionCanonica (regionSelectHTML clásico).

// D1c · imports reales. VETADOS: USER_NOMBRE/USER_APELLIDO — este módulo LOS
// ESCRIBE (:553) igual que boot: import read-only = TypeError; quedan window.
// Hoist: boot 33→29 (cruza documentos/rodajes/info-proyecto/crew — inertes).
import { escapeHtml, showToast } from '../lib/helpers.js';
import { sb, supabaseInit } from '../lib/supabase.js';
import { REGIONES_CHILE } from '../lib/data.js';
import { regionSelectHTML, bancoSelectHTML, bancoCodigo } from '../lib/ui.js';
import { _DAL_TIPOCUENTA_LABEL, _dalBancoNombre } from './dal.js';
import { aplicarUsuario } from '../lib/boot.js';

import { setUserNombre, setUserApellido } from '../lib/state.js';
import { define } from '../lib/ganchos.js';
/* ════════════════════════════════════════════════════════════════════
   V10.8.0 · PERFIL PERSONAL DEL USUARIO + ONBOARDING
   ─────────────────────────────────────────────────────────────────────
   Datos personales de la PERSONA (no de la productora), ligados a auth.uid()
   en user_profiles + user_bank_accounts (RLS fila-propia). Son tuyos y viajan
   contigo entre productoras. Acceso: clic en tu nombre (espacio) y desde el
   panel de Configuración (app). Onboarding: tras el login, si aún no tienes
   perfil, se ofrece completarlo (posponible). Todo defensivo: si algo falla,
   no se bloquea el acceso. ════════════════════════════════════════════════ */
var _PERFIL_CTX = { email: '', cuentaId: null, onDone: null, onboarding: false };

function _perfilCerrar() { var o = document.getElementById('perfilUsuario'); if (o) o.remove(); }

function _perfilTipoCuentaOptions(cur) {
  var opts = '<option value="">\u2014 Sin especificar</option>';
  try { Object.keys(_DAL_TIPOCUENTA_LABEL).forEach(function (code) {
    opts += '<option value="' + code + '"' + (cur === code ? ' selected' : '') + '>' + escapeHtml(_DAL_TIPOCUENTA_LABEL[code]) + '</option>';
  }); } catch (e) {}
  return opts;
}

/* V11.4.0 · regiones de Chile (dropdown del perfil) + heurística provisional
   de extranjería: sin columna es_extranjero en la base (handoff a BD), se
   infiere de una región guardada que no es chilena. El país del extranjero
   se guarda en la columna `region` (text) hasta que exista `pais`. */
function _regionCanonica(valor) {
  /* Devuelve la región canónica de REGIONES_CHILE que coincide con `valor`
     ignorando mayúsculas/acentos/espacios. Esto sana el title-case del
     normalizador de BD ("Metropolitana De Santiago" → "Metropolitana de
     Santiago"). Si no hay match, devuelve null (es región extranjera/libre). */
  try {
    if (!valor || typeof REGIONES_CHILE === 'undefined') return null;
    var norm = function (s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); };
    var objetivo = norm(valor);
    for (var i = 0; i < REGIONES_CHILE.length; i++) { if (norm(REGIONES_CHILE[i]) === objetivo) return REGIONES_CHILE[i]; }
    return null;
  } catch (e) { return null; }
}
function _perfilEsExtranjero(prof) {
  /* Es extranjero solo si tiene región Y esa región NO matchea ninguna chilena
     (case/acentos-insensitive). El title-case de la BD ya no lo confunde. */
  try { return !!(prof && prof.region && _regionCanonica(prof.region) === null); } catch (e) { return false; }
}
export function _rutValido(s) {
  const x = String(s || '').toUpperCase().replace(/[^0-9K]/g, '');
  if (x.length < 2) return false;
  const cuerpo = x.slice(0, -1), dv = x.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0, mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) { suma += parseInt(cuerpo[i], 10) * mul; mul = mul === 7 ? 2 : mul + 1; }
  const res = 11 - (suma % 11);
  const dvCalc = res === 11 ? '0' : (res === 10 ? 'K' : String(res));
  return dv === dvCalc;
}
export async function abrirPerfilUsuario(modoOnboarding, onDone, faltaBanca, soloReqs, invBanner) {
  modoOnboarding = !!modoOnboarding;
  try {
    var client = (typeof sb !== 'undefined' && sb) ? sb : (typeof supabaseInit === 'function' ? supabaseInit() : null);
    var prof = {}, cuenta = {}, email = '';
    if (client) {
      try {
        var ures = await client.auth.getUser();
        var uid = (ures && ures.data && ures.data.user) ? ures.data.user.id : null;
        email = (ures && ures.data && ures.data.user) ? (ures.data.user.email || '') : '';
        if (uid) {
          var pr = await client.from('user_profiles').select('*').eq('user_id', uid).maybeSingle();
          if (pr && pr.data) prof = pr.data;
          var br = await client.from('user_bank_accounts').select('*').eq('user_id', uid).order('es_principal', { ascending: false }).limit(1);
          if (br && br.data && br.data.length) cuenta = br.data[0];
        }
      } catch (e) { /* sin datos: form vacío */ }
    }
    _PERFIL_CTX = { email: email, cuentaId: (cuenta && cuenta.id) || null, onDone: onDone || null, onboarding: modoOnboarding, faltaBanca: !!faltaBanca, soloReqs: (Array.isArray(soloReqs) && soloReqs.length) ? soloReqs : null, invBanner: invBanner || null, guardado: false };
    _perfilRender(prof, cuenta, email, modoOnboarding);
  } catch (e) {
    /* V11.0.0: reportar siempre el error real antes de continuar; un fallo
       silencioso aquí fue lo que ocultó el bug del onboarding en V10.8.0. */
    console.error('[perfil] abrirPerfilUsuario falló', e);
    if (modoOnboarding && typeof onDone === 'function') onDone();
  }
}

function _perfilRender(prof, cuenta, email, modoOnboarding) {
  try {
    prof = prof || {}; cuenta = cuenta || {};
    var v = function (x) { return escapeHtml(x == null ? '' : String(x)); };
    var ext = !!cuenta.es_extranjera;
    var faltaBanca = !!(_PERFIL_CTX && _PERFIL_CTX.faltaBanca);
    /* V11.8.1 · sana el title-case del normalizador: si la región guardada
       matchea una chilena (ignorando may/acentos), la reescribimos a su forma
       canónica para que el dropdown la re-seleccione y no se active el modo
       extranjero por una diferencia de capitalización. */
    try { var _rc = _regionCanonica(prof.region); if (_rc) prof.region = _rc; } catch (e) {}
    var EXTRANJERO = _perfilEsExtranjero(prof);
    /* V11.15.0 · asteriscos por REQUISITO separado (deben coincidir con lo que
       realmente se exige en _perfilToggleGuardar): fuera del gate, solo Nombre y
       Apellidos. En el gate, 'perfil' marca identidad/contacto/dirección y 'edad'
       marca solo la fecha de nacimiento — son requisitos distintos del servidor. */
    var _reqs = (_PERFIL_CTX && _PERFIL_CTX.soloReqs) || [];
    var _astTag = ' <span style="color:var(--negative,#c0392b);">*</span>';
    var astPerfil = (_reqs.indexOf('perfil') >= 0) ? _astTag : '';
    var astEdad = (_reqs.indexOf('edad') >= 0) ? _astTag : '';
    var bancoNombre = ext ? '' : (typeof _dalBancoNombre === 'function' ? _dalBancoNombre(cuenta.bank_codigo_sbif) : '');
    var bancoSel = (typeof bancoSelectHTML === 'function')
      ? bancoSelectHTML(bancoNombre, { id: 'perfilBanco' })
      : '<input class="input" id="perfilBanco" value="' + v(bancoNombre) + '">';
    var ov = document.createElement('div'); ov.id = 'perfilUsuario';
    var pubChip = '<span class="pf-chip pub" tabindex="0" role="note" aria-label="Información pública">Público<span class="pf-chip-tip">Público dentro de TakeOS: solo tu nombre y tu rol pueden ser visibles para otras productoras. Todo lo demás es privado.</span></span>';
    var privChip = '<span class="pf-chip priv" tabindex="0" role="note" aria-label="Información privada">Privado<span class="pf-chip-tip">Privado: solo tú ves estos datos. Otra productora puede verlos únicamente si tú lo autorizas de forma explícita al aceptar una invitación. Mientras tanto quedan completamente protegidos, y puedes revocar ese acceso cuando quieras.</span></span>';
    ov.innerHTML = `<style>
      #perfilUsuario{position:fixed;inset:0;z-index:99998;overflow-y:auto;background:var(--bg-page);color:var(--ink-primary);font-family:var(--font-sans),system-ui,sans-serif;}
      #perfilUsuario *{box-sizing:border-box;}
      #perfilUsuario .pf-top{position:sticky;top:0;background:var(--bg-surface);border-bottom:1px solid var(--rule);}
      #perfilUsuario .pf-top-in{max-width:760px;margin:0 auto;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px;}
      #perfilUsuario .pf-brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;}
      #perfilUsuario .pf-mark{width:30px;height:30px;border-radius:7px;background:var(--accent);color:var(--ink-onAccent);display:grid;place-items:center;font-weight:700;}
      #perfilUsuario .pf-wrap{max-width:760px;margin:0 auto;padding:30px 28px 90px;}
      #perfilUsuario .pf-eyebrow{text-transform:uppercase;letter-spacing:.18em;font-size:12px;color:var(--ink-faint);font-weight:600;}
      #perfilUsuario .pf-h1{font-size:30px;font-weight:700;margin:8px 0 6px;}
      #perfilUsuario .pf-lede{color:var(--ink-secondary);margin:0 0 26px;max-width:62ch;}
      #perfilUsuario .pf-sec{background:var(--bg-card);border:1px solid var(--rule);border-radius:var(--radius-md);padding:20px 22px;margin-bottom:16px;box-shadow:var(--shadow-sm);}
      #perfilUsuario .pf-sec-t{font-weight:700;font-size:15px;margin:0 0 14px;display:flex;align-items:center;gap:8px;}
      #perfilUsuario .pf-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px 16px;}
      #perfilUsuario .pf-f{display:flex;flex-direction:column;gap:5px;}
      #perfilUsuario .pf-f.full{grid-column:1 / -1;}
      #perfilUsuario .pf-f label{font-size:11.5px;color:var(--ink-faint);font-weight:600;letter-spacing:.02em;}
      #perfilUsuario .pf-f .input,#perfilUsuario .pf-f .select{width:100%;}
      #perfilUsuario .pf-check{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-secondary);margin-bottom:12px;cursor:pointer;}
      #perfilUsuario .pf-chip{position:relative;display:inline-flex;align-items:center;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-radius:999px;padding:2px 9px;cursor:help;outline:none;}
      #perfilUsuario .pf-chip.pub{background:var(--info,#3b82f6);color:#fff;border:1px solid #2f6fd1;}
      #perfilUsuario .pf-chip.priv{background:#c0392b;color:#fff;border:1px solid #a93226;}
      #perfilUsuario .pf-chip:focus-visible{box-shadow:0 0 0 3px rgba(0,0,0,.18);}
      #perfilUsuario .pf-chip-tip{position:absolute;top:calc(100% + 7px);left:0;z-index:50;width:max-content;max-width:272px;text-transform:none;letter-spacing:normal;font-weight:500;font-size:11.5px;line-height:1.5;color:#fff;padding:9px 11px;border-radius:8px;box-shadow:0 6px 22px rgba(0,0,0,.30);opacity:0;visibility:hidden;transform:translateY(-3px);transition:opacity .12s ease,transform .12s ease;pointer-events:none;}
      #perfilUsuario .pf-chip.pub .pf-chip-tip{background:#3b82f6;border:1px solid #2f6fd1;}
      #perfilUsuario .pf-chip.priv .pf-chip-tip{background:#c0392b;border:1px solid #a93226;}
      #perfilUsuario .pf-chip:hover .pf-chip-tip,#perfilUsuario .pf-chip:focus .pf-chip-tip,#perfilUsuario .pf-chip:focus-within .pf-chip-tip{opacity:1;visibility:visible;transform:translateY(0);}
      #perfilUsuario .pf-bar{position:fixed;left:0;right:0;bottom:0;background:var(--bg-surface);border-top:1px solid var(--rule);}
      #perfilUsuario .pf-bar-in{max-width:760px;margin:0 auto;padding:13px 28px;display:flex;align-items:center;justify-content:flex-end;gap:10px;}
      #perfilUsuario .pf-bar .spacer{flex:1;font-size:12px;color:var(--ink-faint);}
      @media (max-width:640px){ #perfilUsuario .pf-grid{grid-template-columns:1fr;} #perfilUsuario .pf-top-in,#perfilUsuario .pf-wrap,#perfilUsuario .pf-bar-in{padding-left:16px;padding-right:16px;} }
    </style>
      <div class="pf-top"><div class="pf-top-in">
        <div class="pf-brand"><div class="pf-mark">T</div><span>TakeOS</span></div>
        <span class="pf-eyebrow">${modoOnboarding ? 'Bienvenida/o' : 'Tu perfil'}</span>
      </div></div>
      <div class="pf-wrap">
        <span class="pf-eyebrow">Tu perfil personal</span>
        <h1 class="pf-h1">${modoOnboarding ? 'Cuéntanos quién eres' : 'Tus datos personales'}</h1>
        <p class="pf-lede">Tus datos como persona: te acompañan en cada productora donde colabores.</p>

        <div class="pf-sec" data-secgroup="explainer" style="border-left:3px solid var(--accent);">
          <p class="pf-sec-t">Privacidad de tus datos ${privChip}</p>
          <details style="font-size:12.5px;color:var(--ink-secondary);">
            <summary style="cursor:pointer;color:var(--ink-faint);font-weight:600;">Vista previa · términos de incorporación a una productora (v.0 provisional)</summary>
            <div style="margin-top:8px;padding:10px 12px;border:1px solid var(--rule);border-radius:8px;background:var(--bg-card);line-height:1.6;">Al aceptar una invitación, autorizas a la productora que te invita a incorporar tus datos personales (nombre, RUT, correo, teléfono, dirección y los datos bancarios que tengas en tu perfil) a su base de contactos, con el fin de gestionar tu participación en el proyecto: contratos, hojas de llamado, pagos y coordinación de producción. Esa productora será la responsable del tratamiento de esos datos, en los términos de la Ley 21.719. Puedes revocar esta autorización en cualquier momento desde tu perfil; la revocación no afecta los documentos ya emitidos.<br><span style="color:var(--ink-faint);">[Texto provisional v.0 — el definitivo lo fija Legal y quedará registrado con su versión y fecha.]</span></div>
          </details>
        </div>

        <div class="pf-sec" data-secgroup="perfil" style="border-left:3px solid var(--info, #3b82f6);">
          <p class="pf-sec-t" style="display:flex;align-items:center;gap:8px;">Identidad pública ${pubChip}</p>
          <label class="pf-check" style="margin-bottom:10px;"><input type="checkbox" id="pf_noCl" ${EXTRANJERO ? 'checked' : ''}> No soy chileno/a</label>
          <div class="pf-grid">
            <div class="pf-f"><label>Nombre <span style="color:var(--negative,#c0392b);">*</span></label><input class="input" id="pf_nombre" value="${v(prof.nombre)}"></div>
            <div class="pf-f"><label>Apellidos <span style="color:var(--negative,#c0392b);">*</span></label><input class="input" id="pf_apellido" value="${v(prof.apellido)}"></div>
            <div class="pf-f full"><label>Rol que normalmente desempeñas</label><input class="input" id="pf_rol" value="${v(prof.rol_publico)}" placeholder="Ej: Director de Fotografía, Productora, Gaffer…"><span style="font-size:11px;color:var(--ink-faint);">Tu carta de presentación dentro de TakeOS.</span></div>
          </div>
        </div>

        <div class="pf-sec" data-secgroup="perfil">
          <p class="pf-sec-t">Identidad privada y contacto ${privChip}</p>
          <div class="pf-grid">
            <div class="pf-f" id="pf_rutWrap" style="${EXTRANJERO ? 'display:none;' : ''}"><label>RUT${astPerfil}</label><input class="input" id="pf_rut" value="${v(prof.rut)}" placeholder="12.345.678-9" inputmode="text"><span id="pf_rutErr" style="display:none;font-size:11px;color:var(--negative,#c0392b);">RUT inválido: revisa el dígito verificador.</span></div>
            <div class="pf-f" id="pf_docWrap" style="${EXTRANJERO ? '' : 'display:none;'}"><label>Documento de identidad / pasaporte</label><input class="input" id="pf_doc" value="" disabled placeholder="Pasaporte u otro documento"><span style="font-size:11px;color:var(--ink-faint);">Se habilita con la próxima extensión de la base.</span></div>
            <div class="pf-f"><label>Correo${astPerfil}</label><input class="input" id="pf_email" value="${v(prof.email || email)}" data-original="${v(prof.email || email)}"><span id="pf_emailWarn" style="display:none;font-size:11px;color:var(--warning);line-height:1.45;">⚠ Cambiar este correo no cambia tu correo de acceso a TakeOS, pero sí el de notificaciones y documentos. Hazlo con cuidado.</span></div>
            <div class="pf-f"><label>Celular${astPerfil}</label><input class="input" id="pf_telefono" value="${v(prof.telefono)}" placeholder="+56 9 ..." inputmode="tel"></div>
            <div class="pf-f"><label>Fecha de nacimiento${astEdad}</label><input class="input" id="pf_fnac" type="date" value="${v(prof.fecha_nacimiento)}"></div>
          </div>
        </div>

        <div class="pf-sec" data-secgroup="perfil">
          <p class="pf-sec-t">Dirección ${privChip}</p>
          <p style="font-size:12px;color:var(--ink-faint);margin:-4px 0 12px;line-height:1.5;">La usamos para logística de producción y generación de contratos. Nadie puede ver esta información sin tu consentimiento explícito.</p>
          <div class="pf-grid">
            <div class="pf-f full"><label>Calle y número${astPerfil}</label><input class="input" id="pf_direccion" value="${v(prof.direccion)}"></div>
            <div class="pf-f full"><label>Departamento, oficina, etc. (opcional)</label><input class="input" id="pf_dir2" value="${v(prof.direccion_linea2)}"></div>
            <div class="pf-f" id="pf_comunaWrap" style="${EXTRANJERO ? 'display:none;' : ''}"><label>Comuna${astPerfil}</label><input class="input" id="pf_comuna" value="${v(prof.comuna)}"></div>
            <div class="pf-f"><label>Ciudad${astPerfil}</label><input class="input" id="pf_ciudad" value="${v(prof.ciudad)}"></div>
            <div class="pf-f full" id="pf_regionWrap"><label id="pf_regionLabel">${EXTRANJERO ? 'País' : 'Región'}${astPerfil}</label>${EXTRANJERO ? `<input class="input" id="pf_region" value="${v(prof.region)}" placeholder="Ej: Argentina, España…">` : regionSelectHTML(prof.region, { id: 'pf_region' })}</div>
          </div>
        </div>

        <div class="pf-sec" id="pf_secBanca" data-secgroup="banca">
          <p class="pf-sec-t">Cuenta bancaria ${privChip}</p>
          ${faltaBanca ? '<div id="pf_bancaAviso" style="border:1px solid var(--warning);border-radius:8px;padding:11px 13px;margin-bottom:12px;background:rgba(234,179,8,.08);font-size:12.5px;color:var(--ink-secondary);line-height:1.55;"><strong>Para incorporarte a la productora, completa tus datos bancarios.</strong><br>Es como la productora te paga. Al crear tu cuenta no es obligatorio, pero sí para aceptar una invitación.</div>' : ''}
          <label class="pf-check"><input type="checkbox" id="pf_ext" ${ext ? 'checked' : ''}> Cuenta en el extranjero</label>
          <div id="pf_bloqueCL" style="${ext ? 'display:none;' : ''}">
            <div class="pf-grid">
              <div class="pf-f"><label>Banco</label>${bancoSel}</div>
              <div class="pf-f"><label>Tipo de cuenta</label><select class="select" id="pf_tipocuenta">${_perfilTipoCuentaOptions(ext ? '' : cuenta.tipo_cuenta)}</select></div>
              <div class="pf-f full"><label>Número de cuenta</label><input class="input" id="pf_ncuenta" value="${ext ? '' : v(cuenta.numero_cuenta)}"></div>
            </div>
          </div>
          <div id="pf_bloqueEXT" class="pf-f full" style="${ext ? '' : 'display:none;'}">
            <label>Datos bancarios (banco, IBAN/SWIFT, titular, país…)</label>
            <textarea class="input" id="pf_extra" rows="3">${ext ? v(cuenta.datos_extra) : ''}</textarea>
          </div>
        </div>
      </div>
      <div class="pf-bar"><div class="pf-bar-in">
        <span class="spacer" id="pf_msg">Tus datos quedan guardados solo en tu cuenta.</span>
        <button class="btn btn-secondary" id="pf_btnOmitir">${modoOnboarding ? 'Completar después' : 'Cerrar'}</button>
        <button class="btn btn-primary" id="pf_btnGuardar">Guardar</button>
      </div></div>`;
    document.body.appendChild(ov);
    _perfilBind();
    if (faltaBanca) { try { setTimeout(function () { var s = document.getElementById('pf_secBanca'); if (s && s.scrollIntoView) s.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 250); } catch (e) {} }
  } catch (e) {
    /* V11.0.0: un fallo de render ya NO se traga el formulario en silencio.
       Se reporta el error real y se intenta el formulario de respaldo (DOM
       puro, sin innerHTML ni atributos on*: inmune a CSP estrictas). Solo si
       el respaldo también falla se continúa al arranque. */
    console.error('[perfil] el render principal falló; se usa el formulario de respaldo', e);
    _perfilCerrar();
    try {
      _perfilRenderFallback(prof, cuenta, email, modoOnboarding);
    } catch (e2) {
      console.error('[perfil] el formulario de respaldo también falló', e2);
      _perfilCerrar();
      if (modoOnboarding && _PERFIL_CTX && typeof _PERFIL_CTX.onDone === 'function') _PERFIL_CTX.onDone();
    }
  }
}

/* V11.0.0 · Enlace programático de los controles del perfil (sin atributos
   on* en el HTML: bajo una CSP estricta, los manejadores inline son código
   evaluado desde strings y el navegador los rechaza; addEventListener no). */
function _perfilBind() {
  var ext = document.getElementById('pf_ext');
  if (ext) { ext.addEventListener('change', _perfilToggleExt); ext.addEventListener('change', _perfilToggleGuardar); }
  var bo = document.getElementById('pf_btnOmitir');
  if (bo) bo.addEventListener('click', _perfilOmitir);
  var bg = document.getElementById('pf_btnGuardar');
  if (bg) bg.addEventListener('click', function () { _perfilGuardar(); });
  /* V11.3.1 · Guardar apagado hasta completar los obligatorios (nombre,
     apellido, RUT) — misma regla cosmética que el Aceptar de la invitación.
     V11.15.0 · "Completar después" también reactivo a nombre + apellidos. */
  /* V11.15.0 · el botón Guardar es reactivo a TODOS los campos que pueden ser
     obligatorios según el contexto (gate), no solo al RUT. */
  ['pf_nombre', 'pf_apellido', 'pf_rut', 'pf_email', 'pf_telefono', 'pf_direccion', 'pf_comuna', 'pf_ciudad', 'pf_fnac', 'pf_ncuenta', 'pf_extra'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', _perfilToggleGuardar);
  });
  var _rg = document.getElementById('pf_region');   // región: select (chileno) o input (extranjero)
  if (_rg) { _rg.addEventListener('change', _perfilToggleGuardar); _rg.addEventListener('input', _perfilToggleGuardar); }
  ['pf_nombre', 'pf_apellido'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', _perfilToggleOmitir);
  });
  /* V11.4.0 · filtros de tipeo: celular solo dígitos/+/espacios; RUT solo
     dígitos, K, puntos y guión. */
  var tel = document.getElementById('pf_telefono');
  if (tel) tel.addEventListener('input', function () { var v = this.value.replace(/[^0-9+\s]/g, ''); if (v !== this.value) this.value = v; });
  var rut = document.getElementById('pf_rut');
  if (rut) rut.addEventListener('input', function () {
    var v = this.value.toUpperCase().replace(/K/g, 'K').replace(/[^0-9K.\-]/gi, ''); if (v !== this.value) this.value = v;
    var err = document.getElementById('pf_rutErr');
    if (err) err.style.display = (this.value.trim() && !_rutValido(this.value)) ? 'block' : 'none';
  });
  var em = document.getElementById('pf_email');
  if (em) em.addEventListener('input', function () {
    var w = document.getElementById('pf_emailWarn');
    if (w) w.style.display = (this.value.trim() !== String(this.getAttribute('data-original') || '').trim()) ? 'block' : 'none';
  });
  var ncl = document.getElementById('pf_noCl');
  if (ncl) ncl.addEventListener('change', _perfilToggleNoCl);
  _perfilToggleGuardar();
  _perfilToggleOmitir();   // V11.15.0
  _perfilAplicarSoloFaltantes();
}
/* V11.12.0 · modo "solo lo que falta" para el onboarding de una invitación:
   oculta las secciones ya completas y antepone un banner de contexto. La
   granularidad la define el servidor: 'perfil' (datos personales) y/o 'banca'. */
function _perfilAplicarSoloFaltantes() {
  try {
    var reqs = _PERFIL_CTX && _PERFIL_CTX.soloReqs;
    if (!reqs || !reqs.length) return;
    var wantEdad = reqs.indexOf('edad') >= 0;
    var wantPerfil = reqs.indexOf('perfil') >= 0 || wantEdad;   // 'edad' (fecha nac.) vive en la sección perfil
    var wantBanca = reqs.indexOf('banca') >= 0;
    var ov = document.getElementById('perfilUsuario'); if (!ov) return;
    var secs = ov.querySelectorAll('.pf-sec');
    var algunaVisible = false;
    Array.prototype.forEach.call(secs, function (sec) {
      var grp = sec.getAttribute('data-secgroup') || '';
      var show = (grp === 'perfil' && wantPerfil) || (grp === 'banca' && wantBanca);
      if (!show) sec.style.display = 'none'; else algunaVisible = true;
    });
    /* Anti-callejón-sin-salida: si ninguna sección con campos quedó visible
       (p. ej. un req inesperado), no ocultamos nada — mejor de más que un gate vacío. */
    if (!algunaVisible) { Array.prototype.forEach.call(secs, function (sec) { sec.style.display = ''; }); }
    var wrap = ov.querySelector('.pf-wrap'); if (!wrap) return;
    var b = _PERFIL_CTX.invBanner || {};
    var faltanTxt = [
      (reqs.indexOf('perfil') >= 0) ? 'tus datos personales' : (wantEdad ? 'tu fecha de nacimiento' : null),
      wantBanca ? 'tus datos bancarios' : null
    ].filter(Boolean).join(' y ');
    var ctxLinea = '';
    if (b.proyecto || b.persona || b.cargo) {
      ctxLinea = '<div style="font-size:12.5px;color:var(--ink-secondary);margin-top:6px;line-height:1.5;">'
        + (b.persona ? 'Te invitan como <strong>' + escapeHtml(b.persona) + '</strong>' : 'Te invitaron a colaborar')
        + (b.cargo ? ' (' + escapeHtml(b.cargo) + ')' : '')
        + (b.proyecto ? ' en <strong>' + escapeHtml(b.proyecto) + '</strong>' : '') + '.</div>';
    }
    var banner = document.createElement('div');
    banner.id = 'pf_invBanner';
    banner.style.cssText = 'max-width:none;margin:0 0 22px;border:1px solid var(--accent);border-left:4px solid var(--accent);border-radius:12px;padding:16px 18px;background:var(--accent-bg, rgba(176,58,47,.08));';
    /* V11.15.0 · intro/volver configurables: el mismo modo "solo lo que falta"
       sirve para aceptar invitación (default) y para crear productora (b.intro/b.volver). */
    var _intro = b.intro || ('Para colaborar' + (b.proyecto ? ' en ' + escapeHtml(b.proyecto) : ''));
    var _volver = b.volver || 'volverás a la invitación para aceptar';
    banner.innerHTML = '<div style="font-weight:700;font-size:16px;color:var(--ink-primary);">' + _intro + ', completa ' + (faltanTxt || 'estos datos') + '.</div>'
      + ctxLinea
      + '<div style="font-size:12px;color:var(--ink-faint);margin-top:8px;line-height:1.5;">Solo te mostramos lo que falta. Apenas lo completes y guardes, ' + _volver + '.</div>';
    var firstSec = wrap.querySelector('.pf-sec');
    if (firstSec) wrap.insertBefore(banner, firstSec); else wrap.appendChild(banner);
  } catch (e) { console.warn('[perfil] solo-faltantes', e); }
}
function _perfilToggleNoCl() {
  var on = !!(document.getElementById('pf_noCl') || {}).checked;
  var show = function (id, s) { var el = document.getElementById(id); if (el) el.style.display = s ? '' : 'none'; };
  show('pf_rutWrap', !on); show('pf_docWrap', on); show('pf_comunaWrap', !on);
  var lbl = document.getElementById('pf_regionLabel');
  var _astNoCl = (_PERFIL_CTX && _PERFIL_CTX.soloReqs && _PERFIL_CTX.soloReqs.indexOf('perfil') >= 0) ? ' <span style="color:var(--negative,#c0392b);">*</span>' : '';
  if (lbl) lbl.innerHTML = (on ? 'País' : 'Región') + _astNoCl;
  /* Región: dropdown chileno ↔ texto libre (país). Se reemplaza el control. */
  var wrap = document.getElementById('pf_regionWrap');
  var cur = (document.getElementById('pf_region') || {}).value || '';
  if (wrap) {
    var old = document.getElementById('pf_region'); if (old) old.remove();
    if (on) { wrap.insertAdjacentHTML('beforeend', '<input class="input" id="pf_region" value="' + String(cur).replace(/"/g, '&quot;') + '" placeholder="Ej: Argentina, España…">'); }
    else { wrap.insertAdjacentHTML('beforeend', regionSelectHTML(REGIONES_CHILE.indexOf(cur) >= 0 ? cur : '', { id: 'pf_region' })); }
  }
  /* V11.15.0 · el control de región se recreó: re-enganchar su reactividad al botón Guardar. */
  var _r = document.getElementById('pf_region');
  if (_r) { _r.addEventListener('change', _perfilToggleGuardar); _r.addEventListener('input', _perfilToggleGuardar); }
  _perfilToggleGuardar();
}
/* V11.15.0 · Guardar sensible al CONTEXTO (auditoría obligatoriedad).
   - Fuera del gate (onboarding/edición): basta nombre+apellido. El RUT es OPCIONAL
     (se puede borrar), pero si se escribe debe ser válido.
   - En el gate (soloReqs: aceptar invitación / crear productora): se exigen todos
     los campos obligatorios del contexto (perfil/edad/banca), excepto la línea 2
     de dirección. Así no se guarda incompleto y el servidor no rebota en loop. */
function _perfilToggleGuardar() {
  var g = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
  var noCl = !!(document.getElementById('pf_noCl') || {}).checked;
  var reqs = (_PERFIL_CTX && _PERFIL_CTX.soloReqs) || [];
  var rutEscritoOk = !g('pf_rut') || _rutValido(g('pf_rut'));                   // validez: si hay RUT, debe ser válido
  /* presencia de RUT: exigida SOLO bajo el requisito 'perfil' y para chilenos.
     Se condiciona a 'perfil' (NO a 'edad') para coincidir EXACTAMENTE con el
     asterisco (astPerfil): un gate solo-'edad' no exige ni marca el RUT. */
  var rutPresenteOk = (reqs.indexOf('perfil') >= 0 && !noCl) ? !!g('pf_rut') : true;
  var ok = !!(g('pf_nombre') && g('pf_apellido')) && rutEscritoOk && rutPresenteOk;
  if (reqs.length) {
    if (reqs.indexOf('perfil') >= 0) {
      ok = ok && !!(g('pf_email') && g('pf_telefono') && g('pf_direccion') && g('pf_ciudad') && g('pf_region'));
      if (!noCl) ok = ok && !!g('pf_comuna');
    }
    if (reqs.indexOf('edad') >= 0) ok = ok && !!g('pf_fnac');   // presencia; la mayoría de edad la reimpone el servidor
    if (reqs.indexOf('banca') >= 0) {
      var ext = !!(document.getElementById('pf_ext') || {}).checked;
      ok = ok && (ext ? !!g('pf_extra') : !!g('pf_ncuenta'));
    }
  }
  var bg = document.getElementById('pf_btnGuardar');
  if (bg) {
    bg.disabled = !ok;
    bg.title = ok ? '' : (
      !(g('pf_nombre') && g('pf_apellido')) ? 'Completa nombre y apellidos para guardar.'
      : !rutEscritoOk ? 'El RUT ingresado no es válido: revisa el dígito verificador.'
      : 'Completa los datos obligatorios para continuar.'
    );
  }
}
/* V11.15.0 · "Completar después" solo disponible una vez que el usuario llenó
   nombre + apellidos (los mínimos que identifican a la persona). Solo aplica en
   modoOnboarding; en modo edición el botón siempre dice "Cerrar" y está activo. */
function _perfilToggleOmitir() {
  var bo = document.getElementById('pf_btnOmitir');
  if (!bo) return;
  if (!(_PERFIL_CTX && _PERFIL_CTX.onboarding)) return;
  var g = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
  var ok = !!(g('pf_nombre') && g('pf_apellido'));
  bo.disabled = !ok;
  bo.title = ok ? '' : 'Ingresa al menos tu nombre y apellidos para continuar.';
}
function _perfilMsg(texto, esError) {
  var el = document.getElementById('pf_msg');
  if (el) { el.textContent = texto; el.style.color = esError ? 'var(--negative, #c0392b)' : 'var(--positive, #2e7d32)'; el.style.fontWeight = '600'; }
  else if (esError) { try { showToast({ kind: 'error', title: 'Revisa los datos', body: texto, duration: 7000 }); } catch (e) {} }   // V11.15.0 · feedback en el formulario de respaldo (sin pf_msg)
}

/* V11.0.0 · Formulario de respaldo del perfil personal. Construido SOLO con
   API de DOM (createElement / textContent / addEventListener): cero innerHTML,
   cero manejadores inline, cero evaluación de strings. Si el render principal
   falla por la razón que sea (CSP, Trusted Types, una extensión), este
   formulario mínimo igual aparece y guarda con el mismo _perfilGuardar()
   (usa los mismos ids de campo). */
function _perfilRenderFallback(prof, cuenta, email, modoOnboarding) {
  prof = prof || {}; cuenta = cuenta || {};
  var ext = !!cuenta.es_extranjera;
  var ov = document.createElement('div'); ov.id = 'perfilUsuario';
  var s = ov.style;
  s.position = 'fixed'; s.top = '0'; s.left = '0'; s.right = '0'; s.bottom = '0';
  s.zIndex = '99998'; s.overflowY = 'auto'; s.background = '#16171c'; s.color = '#eceae6';
  s.fontFamily = 'system-ui, sans-serif'; s.padding = '34px 18px 80px';

  var box = document.createElement('div');
  box.style.maxWidth = '560px'; box.style.margin = '0 auto';

  var h = document.createElement('h1');
  h.textContent = modoOnboarding ? 'Cuéntanos quién eres' : 'Tus datos personales';
  h.style.fontSize = '24px'; h.style.margin = '0 0 6px';
  var lede = document.createElement('p');
  lede.textContent = 'Estos son tus datos como persona, no los de una productora. Te acompañan en cada productora donde colabores.' + (modoOnboarding ? ' Puedes completarlos ahora o más tarde desde tu perfil.' : '');
  lede.style.color = '#a9a69f'; lede.style.margin = '0 0 22px'; lede.style.fontSize = '14px';
  box.appendChild(h); box.appendChild(lede);

  function campo(id, label, valor, tipo) {
    var w = document.createElement('div'); w.style.margin = '0 0 12px';
    var l = document.createElement('label');
    l.textContent = label; l.style.display = 'block'; l.style.fontSize = '12px';
    l.style.color = '#8d8a84'; l.style.marginBottom = '4px'; l.htmlFor = id;
    var inp = document.createElement(tipo === 'textarea' ? 'textarea' : 'input');
    inp.id = id; inp.value = (valor == null ? '' : String(valor));
    if (tipo === 'textarea') inp.rows = 3;
    inp.style.width = '100%'; inp.style.boxSizing = 'border-box'; inp.style.padding = '9px 11px';
    inp.style.border = '1px solid #3a3c44'; inp.style.borderRadius = '7px';
    inp.style.background = '#1e2026'; inp.style.color = '#eceae6'; inp.style.fontSize = '14px';
    w.appendChild(l); w.appendChild(inp); box.appendChild(w);
    return inp;
  }

  campo('pf_nombre', 'Nombre', prof.nombre);
  campo('pf_apellido', 'Apellidos', prof.apellido);
  campo('pf_rut', 'RUT', prof.rut);
  campo('pf_email', 'Correo', prof.email || email);
  campo('pf_telefono', 'Celular', prof.telefono);
  campo('pf_direccion', 'Calle y número', prof.direccion);
  campo('pf_dir2', 'Departamento, oficina, etc. (opcional)', prof.direccion_linea2);
  campo('pf_comuna', 'Comuna', prof.comuna);
  campo('pf_ciudad', 'Ciudad', prof.ciudad);
  campo('pf_region', 'Región', prof.region);
  campo('pf_fnac', 'Fecha de nacimiento', prof.fecha_nacimiento, 'date');

  var chkW = document.createElement('label');
  chkW.style.display = 'flex'; chkW.style.alignItems = 'center'; chkW.style.gap = '8px';
  chkW.style.fontSize = '13px'; chkW.style.color = '#a9a69f'; chkW.style.margin = '0 0 12px'; chkW.style.cursor = 'pointer';
  var chk = document.createElement('input'); chk.type = 'checkbox'; chk.id = 'pf_ext'; chk.checked = ext;
  chkW.appendChild(chk); chkW.appendChild(document.createTextNode(' Cuenta en el extranjero'));
  box.appendChild(chkW);

  var bloqueCL = document.createElement('div'); bloqueCL.id = 'pf_bloqueCL';
  box.appendChild(bloqueCL);
  var keep = box; // los campos se agregan a `box` vía campo(); redirigimos temporalmente
  box = bloqueCL;
  var bancoNombre = ext ? '' : (typeof _dalBancoNombre === 'function' ? _dalBancoNombre(cuenta.bank_codigo_sbif) : '');
  campo('perfilBanco', 'Banco', bancoNombre);
  campo('pf_tipocuenta', 'Tipo de cuenta (corriente, vista, ahorro, RUT)', ext ? '' : (cuenta.tipo_cuenta || ''));
  campo('pf_ncuenta', 'Número de cuenta', ext ? '' : cuenta.numero_cuenta);
  box = keep;
  var bloqueEXT = document.createElement('div'); bloqueEXT.id = 'pf_bloqueEXT';
  box.appendChild(bloqueEXT);
  box = bloqueEXT;
  campo('pf_extra', 'Datos bancarios (banco, IBAN/SWIFT, titular, país…)', ext ? cuenta.datos_extra : '', 'textarea');
  box = keep;
  bloqueCL.style.display = ext ? 'none' : '';
  bloqueEXT.style.display = ext ? '' : 'none';
  chk.addEventListener('change', _perfilToggleExt);

  var bar = document.createElement('div');
  bar.style.display = 'flex'; bar.style.justifyContent = 'flex-end'; bar.style.gap = '10px'; bar.style.marginTop = '18px';
  function boton(txt, primario, fn) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = txt;
    b.style.padding = '10px 16px'; b.style.borderRadius = '7px'; b.style.fontSize = '14px';
    b.style.fontWeight = '600'; b.style.cursor = 'pointer';
    b.style.border = primario ? 'none' : '1px solid #3a3c44';
    b.style.background = primario ? '#b9573d' : 'transparent';
    b.style.color = primario ? '#fff' : '#eceae6';
    b.addEventListener('click', fn);
    bar.appendChild(b);
  }
  boton(modoOnboarding ? 'Completar después' : 'Cerrar', false, _perfilOmitir);
  boton('Guardar', true, function () { _perfilGuardar(); });
  box.appendChild(bar);

  ov.appendChild(box);
  document.body.appendChild(ov);
}

function _perfilToggleExt() {
  var ext = document.getElementById('pf_ext'); if (!ext) return;
  var cl = document.getElementById('pf_bloqueCL'), ex = document.getElementById('pf_bloqueEXT');
  if (cl) cl.style.display = ext.checked ? 'none' : '';
  if (ex) ex.style.display = ext.checked ? '' : 'none';
}

function _perfilOmitir() {
  var onb = _PERFIL_CTX && _PERFIL_CTX.onboarding;
  var cb = _PERFIL_CTX && _PERFIL_CTX.onDone;
  var guardado = !!(_PERFIL_CTX && _PERFIL_CTX.guardado);   /* V11.12.0 · distingue guardó vs. se arrepintió */
  _perfilCerrar();
  if (onb && typeof cb === 'function') cb(guardado);
}

async function _perfilGuardar() {
  var g = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
  var client = (typeof sb !== 'undefined' && sb) ? sb : (typeof supabaseInit === 'function' ? supabaseInit() : null);
  if (!client) { _perfilOmitir(); return; }
  try {
    var ures = await client.auth.getUser();
    var uid = (ures && ures.data && ures.data.user) ? ures.data.user.id : null;
    if (!uid) { _perfilOmitir(); return; }
    var prof = {
      user_id: uid, nombre: g('pf_nombre'), apellido: g('pf_apellido'), rut: g('pf_rut'),
      email: g('pf_email') || (_PERFIL_CTX && _PERFIL_CTX.email) || '', telefono: g('pf_telefono'),
      direccion: g('pf_direccion'), direccion_linea2: g('pf_dir2'), comuna: g('pf_comuna'),
      ciudad: g('pf_ciudad'), region: g('pf_region'), rol_publico: g('pf_rol'), fecha_nacimiento: g('pf_fnac') || null
    };
    /* V11.2.0 · semáforo del perfil (handoff BD §A.3): completado_at se marca
       solo cuando la identidad mínima está completa (nombre + apellido + RUT).
       Si falta algo, la clave se omite y el valor existente no se pisa:
       NULL = perfil incompleto, que es lo que lee el muro post-pago. */
    /* V11.4.0 · completado_at = cuestionario completo (handoff BD §A.3):
       identidad + contacto + dirección. Para no-chilenos no se exige RUT
       (documento extranjero pendiente de columna en BD) ni comuna. */
    var noCl = !!(document.getElementById('pf_noCl') || {}).checked;
    /* V11.15.0 · defensa real (no solo el botón): nunca persistir un RUT mal
       formado. Vacío es válido (el RUT es opcional fuera del gate). Cubre también
       el formulario de respaldo, que conecta Guardar directo a _perfilGuardar. */
    if (!noCl && prof.rut && !_rutValido(prof.rut)) { _perfilMsg('RUT inválido: revisa el dígito verificador.', true); return; }
    var completo = prof.nombre && prof.apellido && prof.email && prof.telefono && prof.direccion && prof.ciudad && prof.region
      && (noCl ? true : (prof.rut && _rutValido(prof.rut) && prof.comuna));
    if (completo) prof.completado_at = new Date().toISOString();
    var up = await client.from('user_profiles').upsert(prof, { onConflict: 'user_id' });
    if (up.error) throw up.error;
    setUserNombre(prof.nombre || ''); setUserApellido(prof.apellido || ''); try { aplicarUsuario(); } catch (e) {}

    var extEl = document.getElementById('pf_ext'); var ext = extEl ? extEl.checked : false;
    var bancoNombre = g('perfilBanco'), tipo = g('pf_tipocuenta'), num = g('pf_ncuenta'), datosExtra = g('pf_extra');
    /* V11.9.7 · una cuenta bancaria solo se guarda si tiene CONTENIDO real:
       número de cuenta (chilena) o datos (extranjera). Antes bastaba el valor
       por defecto del dropdown del banco para crear una fila vacía, que luego
       engañaba al freno de la invitación (caso Teresita). */
    var hayCuenta = ext ? !!(datosExtra && datosExtra.trim()) : !!(num && num.trim());
    if (hayCuenta) {
      var ctaRow = {
        user_id: uid, es_principal: true, es_extranjera: ext,
        bank_codigo_sbif: ext ? null : (bancoNombre && typeof bancoCodigo === 'function' ? (bancoCodigo(bancoNombre) || null) : null),
        tipo_cuenta: ext ? null : (tipo || null),
        numero_cuenta: ext ? null : (num || null),
        datos_extra: ext ? (datosExtra || null) : null
      };
      if (_PERFIL_CTX && _PERFIL_CTX.cuentaId) ctaRow.id = _PERFIL_CTX.cuentaId;
      var cu = await client.from('user_bank_accounts').upsert(ctaRow);
      if (cu.error) throw cu.error;
    }
    try { showToast({ kind: 'success', title: 'Perfil guardado', body: 'Tus datos personales quedaron guardados.' }); } catch (e) {}
    _perfilMsg('Guardado ✓', false);
    if (_PERFIL_CTX) _PERFIL_CTX.guardado = true;
    _perfilOmitir();
  } catch (e) {
    /* V11.3.1: el error se muestra DENTRO del overlay (el toast quedaba
       tapado por el propio formulario) y con el mensaje real del backend. */
    console.error('[perfil] guardado falló', e);
    var det = (e && (e.message || e.error_description || e.hint)) ? String(e.message || e.error_description || e.hint) : 'Error desconocido.';
    _perfilMsg('No se pudo guardar: ' + det, true);
    try { showToast({ kind: 'error', title: 'No se pudo guardar tu perfil', body: det, duration: 9000 }); } catch (_) {}
  }
}

// ── Window bridges Perfil/Onboarding ──
window.abrirPerfilUsuario = abrirPerfilUsuario;
window._rutValido         = _rutValido;
window._regionCanonica    = _regionCanonica;

// D4b · ganchos definidos por este módulo (consumidos por módulos más tempranos)
define('_regionCanonica', _regionCanonica);
define('abrirPerfilUsuario', abrirPerfilUsuario);
