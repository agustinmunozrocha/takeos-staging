// Configuración — extraído de index.html (Etapa A6)
// src/modules/config.js
// Panel de configuración, perfil de productora (equipo/roles/logos), FRENTE A
// (crear productora) y FRENTE B (privacidad y datos). El buscador global vive
// en buscador.js; tema, espacio de usuario y cloudGate quedan en index.html.

// D1d · imports reales. VETADO: _TIENE_EMPRESA (window mutable). Sin aristas a
// espacio (verificado: renderEspacioUsuario lo consume boot, no config).
// Hoists: boot 29→24, invitaciones 36→24, perfil-onboarding 29→24 (inertes).
import { escapeHtml, safeUrl, showToast } from '../lib/helpers.js';
import { BD_CONTACTOS, EMPRESA_PERFIL, ORG_SERVICIOS, PROJECTS, STATE, setTieneEmpresa, ORG_ID, USER_NOMBRE, USER_APELLIDO, TAKEOS_PERFIL } from '../lib/state.js';
import { authEsAdmin } from '../lib/auth.js';
import { fmtMoney } from '../lib/calc.js';
import { closeModal, getStoredTheme, showModal, slugify, updateThemeButton, toggleTheme } from '../lib/ui.js';
import { STATES } from './kanban.js';
import { _empCargarRebinds } from './notificaciones.js';
import { _dalPerfilSaveSoon, dalCargarCargos, dalGuardarServicio, dalBorrarServicio, dalRenombrarServicio } from './dal.js';
import { markDirty } from './persistencia-local.js';
import { _rutValido, abrirPerfilUsuario } from './perfil-onboarding.js';
import { PERFIL_NOMBRE_POR_CODIGO, _invMostrarResultado, dalInvitar, invitacionLink } from './invitaciones.js';
import { _applyAdminUI, _puedeModoAdmin, requestAdminPassword } from './admin.js';
import { manejarErrorPlan } from './plan-limites.js';
import { _bootCoverHide, _bootCoverShow, _setOrgActiva, arrancarTakeOS, cloudGate, orgNombre, resolverEspacioYArrancar } from '../lib/boot.js';

import { registrarAcciones, accionHTML } from '../lib/delegacion.js';
import { IVA } from '../lib/rates.js';
import { _cotPrevFamiliaGF, _cotPrevHexValido } from './presupuesto-cotizacion.js';
import { openGlobalBDPersonas } from './bd.js';
import { gancho, define, valor } from '../lib/ganchos.js';
const CHIPAX_LOGO = 'data:image/png;base64,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';
function cfgSetUsaChipax(on) {
  try { EMPRESA_PERFIL.usaChipax = !!on; markDirty(); _dalPerfilSaveSoon(); } catch (e) {}
}

/* ─── PANEL DE CONFIGURACIÓN (V7.4) ────────────────────────────────────
   Casa de las herramientas globales que antes saturaban la barra superior.
   Deshacer se queda en la barra (uso frecuente). Atajo: ⌘ , / Ctrl , */
/* V11.3.1 · vuelta al «panel personal» (Tu espacio) desde el Control Room.
   Recarga con ?espacio=1: con la sesión vigente (TTL) no pide login. */
export function irAlPanelPersonal() {
  /* V11.4.1 · sin cortina al ir al panel personal: es navegación interna,
     no un arranque frío. La marca sobrevive a la recarga (sessionStorage). */
  try { sessionStorage.setItem('takeos_sin_veil', '1'); } catch (e) {}
  window.location.href = window.location.pathname + '?espacio=1';
}

export function openConfigPanel() {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" data-accion="ui.backdrop">
      <div class="modal config-panel">
        <div class="modal-header"><div class="modal-title">Configuración</div></div>
        <div class="modal-body">
          <div class="config-section">
            <p class="config-section-title">Datos del OS</p>
            <div class="config-grid">
              <button class="topbar-save-btn" id="saveBtn" data-accion="cfg.guardarOS" title="Guardar TODO el OS (proyectos + BD) en un archivo .json. Es tu respaldo durable.">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Guardar OS
              </button>
              <button class="topbar-save-btn" data-accion="cfg.cargarOS" title="⚠️ Cargar un respaldo COMPLETO del OS. Reemplaza TODO. Se crea un snapshot automático antes.">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><polyline points="9 15 12 12 15 15"/></svg>
                Cargar OS
              </button>
              <button class="topbar-save-btn" id="snapshotsBtn" data-accion="cfg.fn" data-args="[&quot;openSnapshotsModal&quot;]" title="Historial de snapshots automáticos. Antes de cualquier carga destructiva, TakeOS guarda uno — puedes revertir.">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Snapshots
              </button>
              <button class="topbar-save-btn" data-accion="cfg.bd" title="Base de Datos de Contactos (global).">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Base de Datos
              </button>
            </div>
          </div>
          ${(STATE && STATE.adminMode) ? `
          <div class="config-section">
            <p class="config-section-title">Diagnóstico</p>
            <div class="config-grid">
              <button class="topbar-save-btn" data-accion="cfg.fn" data-args="[&quot;exportSupabaseBackup&quot;]" title="Descarga un respaldo manual de Supabase en un solo archivo .json (todas las tablas conocidas). Solo lectura. El respaldo autoritativo es el backup automático de Supabase Pro.">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>
                Respaldar Supabase (.json)
              </button>
            </div>
            <p class="config-hint" style="margin-top:6px;">Supabase es la única fuente de datos. El respaldo autoritativo es el backup automático diario de Supabase Pro; este botón descarga una copia manual en <code>.json</code>.</p>
          </div>` : ''}
          <div class="config-section">
            <p class="config-section-title">Mi perfil</p>
            <div class="config-grid">
              <button class="topbar-save-btn" data-accion="cfg.miPerfil" title="Tus datos personales (nombre, correo, celular, dirección, cuenta bancaria). Son tuyos y te acompañan en cada productora donde colabores.">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>
                Mis datos personales
              </button>
              <button class="topbar-save-btn" data-accion="cfg.fn" data-args="[&quot;irAlPanelPersonal&quot;]" title="Tu espacio: las productoras donde eres interno y los proyectos donde colaboras como externo, más tus invitaciones pendientes.">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                Panel personal
              </button>
            </div>
          </div>
          <div class="config-section">
            <p class="config-section-title">Perfil de la empresa</p>
            <div class="config-grid">
              <button class="topbar-save-btn" data-accion="cfg.fn" data-args="[&quot;openEmpresaPerfil&quot;]" title="Datos de tu empresa/productora (razón social, RUT, giro, representante). Se usan en documentos: hojas de llamado, plan de rodaje, cotizaciones y contratos.">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/></svg>
                Empresa / Productora
              </button>
            </div>
          </div>
          <div class="config-section">
            <p class="config-section-title">Preferencias</p>
            <div class="config-grid">
              <button class="topbar-save-btn" id="themeToggleBtn" data-accion="cfg.fn" data-args="[&quot;toggleTheme&quot;]" title="Cambiar entre modo claro y oscuro. Tu preferencia queda guardada en este navegador.">Tema</button>
              <button class="topbar-admin-toggle ${(STATE && STATE.adminMode) ? 'is-on' : ''}" id="adminToggleBtn" data-accion="cfg.fn" data-args="[&quot;toggleAdminMode&quot;]" title="Modo administrador: habilita acciones restringidas (ej. devolver un proyecto a Venta).">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span id="adminToggleLabel">${(STATE && STATE.adminMode) ? 'Modo Admin · ON' : 'Modo admin: OFF'}</span>
              </button>
            </div>
          </div>
          <p class="config-hint">Deshacer queda en la barra superior por ser de uso frecuente. Atajo del panel: ⌘ , (Mac) o Ctrl , (Windows).</p>
        </div>
        <div class="modal-footer"><button class="btn btn-primary" data-accion="cfg.fn" data-args="[&quot;closeConfigPanel&quot;]">Cerrar</button></div>
      </div>
    </div>`;
  if (typeof updateThemeButton === 'function') updateThemeButton(getStoredTheme());
  const ab = document.getElementById('adminToggleBtn'), al = document.getElementById('adminToggleLabel');
  if (ab) ab.classList.toggle('is-on', !!(STATE && STATE.adminMode));
  if (al) al.textContent = `Modo admin: ${(STATE && STATE.adminMode) ? 'ON' : 'OFF'}`;
  if (ab && !_puedeModoAdmin()) ab.style.display = 'none';   // V10.5.1: modo admin solo para perfil Administrador
}
export function closeConfigPanel() { closeModal(); }
export function _configPanelOpen() { return !!document.querySelector('.config-panel'); }

/* V7.9: perfil de la empresa/productora emisora (datos para documentos). */
export function openEmpresaPerfil(subInicial) {
  /* V11.11.0 · el panel es PÚBLICO para todo el equipo de la productora:
     Equipo y Diseño son visibles para cualquier perfil (solo lectura para
     quien no es Administrador). "Datos de la empresa" sigue siendo exclusivo
     del Administrador y mantiene la barrera de Modo admin (protege datos
     societarios y bancarios): para el resto de perfiles, esa pestaña
     simplemente no existe. */
  const esAdmin = _puedeModoAdmin();
  const datosOK = esAdmin && !!(STATE && STATE.adminMode);
  const E = EMPRESA_PERFIL;
  const field = (id, label, val, ph) => `<div class="emp-field"><label>${label}</label><input id="emp_${id}" class="cot-input" value="${escapeHtml(val || '')}" placeholder="${ph || ''}"></div>`;
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-backdrop" data-accion="ui.backdrop">
      <div class="modal" style="max-width:640px;max-height:88vh;display:flex;flex-direction:column;">
        <div class="modal-header"><div class="modal-title">Perfil de la empresa / productora</div></div>
        <div class="modal-body" style="overflow-y:auto;flex:1 1 auto;">
          <div style="display:flex;gap:6px;margin:0 0 14px;border-bottom:1px solid var(--rule);padding-bottom:10px;">
            ${esAdmin ? `<button class="btn btn-ghost btn-sm" id="empTabdatos" ${datosOK ? accionHTML('cfg.fn', '_empShowSub', 'datos') : accionHTML('cfg.fn', '_empDatosConClave')}>Datos de la empresa${datosOK ? '' : ' 🔒'}</button>` : ''}
            <button class="btn btn-ghost btn-sm" id="empTabequipo" data-accion="cfg.fn" data-args="[&quot;_empShowSub&quot;,&quot;equipo&quot;]">Equipo</button>
            <button class="btn btn-ghost btn-sm" id="empTabdiseno" data-accion="cfg.fn" data-args="[&quot;_empShowSub&quot;,&quot;diseno&quot;]">Diseño</button>
            <button class="btn btn-ghost btn-sm" id="empTabservicios" data-accion="cfg.fn" data-args="[&quot;_empShowSub&quot;,&quot;servicios&quot;]">Servicios</button>
          </div>
          ${datosOK ? `<div id="empSubDatos">
          <p style="margin:0 0 14px;color:var(--ink-secondary);font-size:13px;line-height:1.5;">Estos datos se usan como <strong>empresa emisora</strong> en los documentos (hojas de llamado, plan de rodaje, cotizaciones y, a futuro, contratos). Quedan guardados con el OS.</p>
          <div class="config-section-title" style="margin-bottom:8px;">Empresa</div>
          <div class="emp-grid">
            ${field('nombreFicticio','Nombre de fantasía', E.nombreFicticio, 'Nombre comercial de la productora')}
            ${field('razonSocial','Razón social', E.razonSocial, 'Razón social (SpA, Ltda…)')}
            ${field('rut','RUT empresa', E.rut, '76.123.456-7')}
            ${field('giro','Giro', E.giro, 'Producción audiovisual')}
            ${field('direccion','Dirección', E.direccion, 'Calle, número, oficina')}
            ${field('comuna','Comuna', E.comuna, 'Providencia')}
            ${field('ciudad','Ciudad', E.ciudad, 'Santiago')}
            ${field('telefono','Teléfono empresa', E.telefono, '+56 9 ...')}
            ${field('email','Email empresa', E.email, 'contacto@...')}
            ${field('web','Sitio web', E.web, 'www...')}
          </div>
          <div class="config-section-title" style="margin:18px 0 8px;">Representante legal</div>
          <div class="emp-grid">
            ${field('representante','Nombre', E.representante, 'Nombre completo')}
            ${field('repRut','RUT representante', E.repRut, '12.345.678-9')}
            ${field('repTelefono','Teléfono', E.repTelefono, '+56 9 ...')}
            ${field('repEmail','Email', E.repEmail, 'persona@...')}
          </div>
          <div class="config-section-title" style="margin:18px 0 8px;">Datos bancarios <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--ink-faint);">· para futuras transferencias</span></div>
          <div class="emp-grid">
            ${field('bancoNombre','Banco', E.bancoNombre, 'Banco de Chile...')}
            ${field('bancoTipoCuenta','Tipo de cuenta', E.bancoTipoCuenta, 'Cuenta corriente / vista')}
            ${field('bancoNumero','N° de cuenta', E.bancoNumero, '')}
            ${field('bancoTitular','Titular', E.bancoTitular, 'Nombre o razón social')}
            ${field('bancoRut','RUT titular', E.bancoRut, '')}
            ${field('bancoEmailPagos','Email de pagos', E.bancoEmailPagos, 'pagos@...')}
          </div>
          <div class="config-section-title" style="margin:18px 0 8px;">Enlaces e integraciones <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--ink-faint);">· para automatizaciones futuras</span></div>
          <div class="emp-grid">
            ${field('driveLink','Link al Drive', E.driveLink, 'https://drive.google.com/...')}
            ${field('milanoteLink','Link a Milanote', E.milanoteLink, 'https://app.milanote.com/...')}
            <div style="grid-column:1/-1;border:1px solid var(--rule);border-radius:10px;padding:12px 14px;background:var(--bg-surface);display:flex;align-items:flex-start;gap:12px;margin-top:4px;">
              <img src="${CHIPAX_LOGO}" alt="Chipax" style="width:42px;height:42px;border-radius:8px;flex:0 0 42px;object-fit:contain;background:#fff;border:1px solid var(--rule);">
              <div style="flex:1;min-width:0;">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;font-size:13.5px;color:var(--ink-primary);">
                  <input type="checkbox" id="cfgUsaChipax" ${E.usaChipax ? 'checked' : ''} data-accion="cfg.chipax" data-on="change"> Usamos Chipax
                </label>
                <div style="font-size:11.5px;color:var(--ink-faint);margin-top:4px;line-height:1.5;">Chipax es un sistema de gestión financiera y conciliación bancaria. Al activarlo, TakeOS habilita la <strong>exportación masiva de gastos validados</strong> en el formato que Chipax importa, para registrar la contabilidad sin digitar gasto por gasto.</div>
              </div>
            </div>
            ${field('googleCalendarId','ID Google Calendar', E.googleCalendarId, 'xxxx@group.calendar.google.com')}
            ${field('linkFormularioPago','Link del formulario de pago', E.linkFormularioPago, 'https://forms.gle/…')}
          </div>
          </div>` : ''}
          <div id="empSubEquipo" style="display:none;">
            <div id="empRebindsBox" style="display:none;"></div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 14px;flex-wrap:wrap;">
              <p style="margin:0;color:var(--ink-secondary);font-size:13px;line-height:1.5;">Las personas de tu planta. Ven los proyectos de la productora según su perfil de acceso.</p>
              ${esAdmin ? `<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-sm" data-accion="cfg.fn" data-args="[&quot;_empAbrirTransferir&quot;]">Transferir administración</button><button class="btn btn-primary btn-sm" data-accion="cfg.fn" data-args="[&quot;_empAbrirInvitar&quot;]">+ Incorporar a alguien</button></div>` : ''}
            </div>
            <div id="empEquipoTabla" style="border:1px solid var(--rule);border-radius:8px;padding:12px;font-size:13px;color:var(--ink-secondary);">Cargando equipo…</div>
            <div id="empInvitacionesLista" style="margin-top:14px;"></div>
            ${esAdmin ? `<p style="margin:12px 0 0;font-size:12px;color:var(--ink-faint);line-height:1.5;">Incorporar internos es facultad del Administrador. La invitación se entrega por link copiable (y en la bandeja interna si la persona ya tiene cuenta); el envío automático por correo se activa cuando esté listo el canal de email.<br>Desde la tabla puedes cambiar el <strong>perfil de acceso</strong> de cada persona, alternar entre <strong>interno y externo</strong> (define qué proyectos ve), y <strong>quitarla del equipo</strong> (pierde todo acceso y desaparece de la lista; queda registro en la auditoría).</p>` : `<p style="margin:12px 0 0;font-size:12px;color:var(--ink-faint);line-height:1.5;">Incorporar personas y cambiar perfiles de acceso es facultad del Administrador. Aquí puedes ver quién compone el equipo, su perfil de acceso y su estado.</p>`}
          </div>
          <div id="empSubDiseno" style="display:none;">
            <p style="margin:0 0 14px;color:var(--ink-secondary);font-size:13px;line-height:1.5;">La identidad de la marca, a la vista de todo el equipo: descarga los logos, copia los colores y revisa las tipografías.${esAdmin ? '' : ' Editar la identidad es facultad del Administrador.'}</p>
            <div class="config-section-title" style="margin:0 0 8px;">Logos</div>
            <div id="empLogosGaleria" style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;"></div>
            <input type="file" id="empLogoInput" accept="image/png,image/jpeg,image/svg+xml" style="display:none;" data-accion="cfg.logoPick" data-on="change">
            ${esAdmin ? `<div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-sm" data-accion="cfg.subirLogo">+ Subir variación</button>
            </div>` : ''}
            <p style="margin:10px 0 0;font-size:12px;color:var(--ink-faint);line-height:1.5;">La variación marcada como <strong>principal</strong> es la que usan los documentos por defecto. Hasta 8 variaciones de ~350 KB cada una; todas descargables para el equipo.</p>
            <div class="config-section-title" style="margin:20px 0 8px;">Colores de la marca</div>
            <p style="margin:0 0 10px;color:var(--ink-secondary);font-size:12.5px;line-height:1.5;">La paleta oficial de la productora. Los previsualizadores de documentos la ofrecen como <strong>color de énfasis</strong>. Haz clic en un color para copiar su código hex.</p>
            <div id="empColoresGaleria" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-bottom:10px;"></div>
            ${esAdmin ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <input type="color" id="empColorPick" value="#B03A2F" style="width:34px;height:34px;border:none;background:none;padding:0;cursor:pointer;" data-accion="cfg.colorSync" data-on="input">
              <input class="cot-input" id="empColorHex" placeholder="#B03A2F" style="width:130px;" data-accion="cfg.enter" data-args="[&quot;_empColorAgregar&quot;]" data-on="keydown">
              <button class="btn btn-sm" data-accion="cfg.fn" data-args="[&quot;_empColorAgregar&quot;]">+ Agregar color</button>
            </div>` : ''}
            <div class="config-section-title" style="margin:20px 0 8px;">Tipografías</div>
            <p style="margin:0 0 10px;color:var(--ink-secondary);font-size:12.5px;line-height:1.5;">El repositorio tipográfico de la marca. Los previsualizadores de documentos las ofrecen junto a las dos del sistema (<strong>Poppins</strong> y <strong>Serif</strong>). Se cargan desde Google Fonts por el nombre exacto de la familia (p. ej. <strong>Oswald</strong>). La carga de archivos de fuente propios (p. ej. una Gotham licenciada) llega cuando se resuelva su almacenamiento.</p>
            <div id="empTiposLista" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;"></div>
            ${esAdmin ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <input class="cot-input" id="empTipoNombre" placeholder="Nombre visible (opcional)" style="width:190px;">
              <input class="cot-input" id="empTipoFamilia" placeholder="Familia en Google Fonts" style="width:190px;" data-accion="cfg.enter" data-args="[&quot;_empTipoAgregar&quot;]" data-on="keydown">
              <button class="btn btn-sm" data-accion="cfg.fn" data-args="[&quot;_empTipoAgregar&quot;]">+ Agregar tipografía</button>
            </div>` : ''}
          </div>
          <div id="empSubServicios" style="display:none;">
            <p style="margin:0 0 14px;color:var(--ink-secondary);font-size:13px;line-height:1.5;">Los servicios que ofrece tu productora. Cada proyecto elige uno en <strong>Info Proyecto</strong> (y a futuro alimentan el reporte por tipo de servicio).${esAdmin ? '' : ' Editar es facultad del Administrador.'}</p>
            <div id="empServiciosLista" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>
            ${esAdmin ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <input class="cot-input" id="empServicioNombre" placeholder="Nombre del servicio (ej. Dirección de Fotografía)" style="flex:1;min-width:220px;" data-accion="cfg.enter" data-args="[&quot;_empServicioAgregar&quot;]" data-on="keydown">
              <button class="btn btn-sm" data-accion="cfg.fn" data-args="[&quot;_empServicioAgregar&quot;]">+ Agregar servicio</button>
            </div>` : ''}
          </div>
        </div>
        <div class="modal-footer"><button class="btn" data-accion="cfg.volver">Volver</button>${datosOK ? `<button class="btn btn-primary" data-accion="cfg.fn" data-args="[&quot;saveEmpresaPerfil&quot;]">Guardar perfil</button>` : ''}</div>
      </div>
    </div>`;
  _empShowSub(subInicial || (datosOK ? 'datos' : 'equipo'));
  try { _empCargarEquipo(); } catch (e) {}
  try { _empCargarRebinds(); } catch (e) {}
  try { _empLogoRefresh(); } catch (e) {}
  try { _empDisenoRefresh(); } catch (e) {}
  try { _empServiciosRefresh(); } catch (e) {}
}
/* Pestaña Servicios del perfil de empresa: catálogo editable (solo Administrador
   por RLS). Alimenta el desplegable "Servicio" de Info Proyecto. */
function _empServiciosRefresh() {
  const box = document.getElementById('empServiciosLista'); if (!box) return;
  const esAdmin = _puedeModoAdmin();
  const items = ORG_SERVICIOS.slice().sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });
  if (!items.length) { box.innerHTML = '<div style="font-size:13px;color:var(--ink-faint);">Aún no hay servicios. Agrega el primero abajo.</div>'; return; }
  box.innerHTML = items.map(function (s) {
    return '<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--rule);border-radius:8px;padding:8px 10px;">'
      + (esAdmin
          ? '<input class="cot-input" style="flex:1;" id="svc-in-' + escapeHtml(s.id) + '" value="' + escapeHtml(s.nombre) + '" data-orig="' + escapeHtml(s.nombre) + '" ' + accionHTML('cfg.servicioEdit', s.id, { on: 'input' }) + '>'
            + '<button class="btn btn-primary btn-sm" id="svc-save-' + escapeHtml(s.id) + '" style="display:none;" ' + accionHTML('cfg.servicioGuardar', s.id) + '>Guardar</button>'
            + '<button class="btn btn-ghost btn-sm" ' + accionHTML('cfg.servicioDel', s.id, s.nombre) + ' title="Quitar servicio">Quitar</button>'
          : '<div style="flex:1;font-size:13px;color:var(--ink-secondary);">' + escapeHtml(s.nombre) + '</div>')
      + '</div>';
  }).join('');
}
function _empServicioAgregar() {
  const el = document.getElementById('empServicioNombre'); if (!el) return;
  const nombre = String(el.value || '').trim(); if (!nombre) return;
  if (ORG_SERVICIOS.some(function (s) { return String(s.nombre).toLowerCase() === nombre.toLowerCase(); })) { showToast({ kind: 'info', title: 'Ya existe', body: 'Ese servicio ya está en la lista.' }); return; }
  dalGuardarServicio({ nombre: nombre, orden: ORG_SERVICIOS.length }).then(function (r) {
    if (r && r.ok) { ORG_SERVICIOS.push({ id: r.id, nombre: nombre, orden: ORG_SERVICIOS.length }); el.value = ''; _empServiciosRefresh(); showToast({ kind: 'success', title: 'Servicio agregado', body: '«' + nombre + '» quedó en tus servicios.' }); }
  });
}
/* Renombrar tiene fricción: aparece "Guardar" al editar, y al guardar se avisa
   que TODOS los proyectos con ese servicio se renombran (coherencia del reporte).
   El RPC renombra + propaga a los proyectos, atómico. */
function _empServicioEditToggle(id, el) {
  const btn = document.getElementById('svc-save-' + id); if (!btn) return;
  const v = String(el.value || '').trim();
  btn.style.display = (v && v !== (el.dataset.orig || '')) ? '' : 'none';
}
function _empServicioGuardarNombre(id) {
  const inp = document.getElementById('svc-in-' + id); if (!inp) return;
  const nombre = String(inp.value || '').trim();
  const s = ORG_SERVICIOS.find(function (x) { return x.id === id; });
  if (!s) return;
  if (!nombre || nombre === s.nombre) { _empServiciosRefresh(); return; }
  if (ORG_SERVICIOS.some(function (x) { return x.id !== id && String(x.nombre).toLowerCase() === nombre.toLowerCase(); })) { showToast({ kind: 'warning', title: 'Ya existe', body: 'Ya tienes un servicio con ese nombre.' }); return; }
  const old = s.nombre;
  const nProy = PROJECTS.filter(function (p) { return p && p.data && p.data.infoProyecto && p.data.infoProyecto.servicio === old; }).length;
  showModal({
    title: 'Renombrar servicio', danger: true,
    body: 'Vas a renombrar «<b>' + escapeHtml(old) + '</b>» a «<b>' + escapeHtml(nombre) + '</b>».<br><br>Se actualizarán <b>' + nProy + ' proyecto(s)</b> que hoy usan «' + escapeHtml(old) + '»: su servicio pasará al nombre nuevo. Esto mantiene la coherencia para el reporte por tipo de servicio.',
    confirmLabel: 'Sí, renombrar', cancelLabel: 'Cancelar',
    onConfirm: function () {
      dalRenombrarServicio(id, nombre).then(function (r) {
        if (r && r.ok) {
          s.nombre = nombre;
          PROJECTS.forEach(function (p) { if (p && p.data && p.data.infoProyecto && p.data.infoProyecto.servicio === old) p.data.infoProyecto.servicio = nombre; });
          _empServiciosRefresh();
          showToast({ kind: 'success', title: 'Servicio renombrado', body: (r.count != null ? r.count : nProy) + ' proyecto(s) actualizados.' });
        } else { _empServiciosRefresh(); }
      });
    }
  });
}
function _empServicioBorrar(id, nombre) {
  showModal({
    title: 'Quitar servicio', danger: true,
    body: '¿Quitar «' + escapeHtml(nombre || '') + '» de tus servicios? Los proyectos que ya lo tengan conservan su texto.',
    confirmLabel: 'Quitar', cancelLabel: 'Cancelar',
    onConfirm: function () {
      dalBorrarServicio(id).then(function (r) {
        if (r && r.ok) { const i = ORG_SERVICIOS.findIndex(function (x) { return x.id === id; }); if (i >= 0) ORG_SERVICIOS.splice(i, 1); _empServiciosRefresh(); showToast({ kind: 'success', title: 'Servicio quitado', body: '«' + (nombre || '') + '» ya no está en la lista.' }); }
      });
    }
  });
}
function saveEmpresaPerfil() {
  const keys = ['nombreFicticio','razonSocial','rut','giro','direccion','comuna','ciudad','telefono','email','web','representante','repRut','repTelefono','repEmail','bancoNombre','bancoTipoCuenta','bancoNumero','bancoTitular','bancoRut','bancoEmailPagos','driveLink','milanoteLink','googleCalendarId','usaChipax','linkFormularioPago'];
  keys.forEach(k => { const el = document.getElementById('emp_' + k); if (el) EMPRESA_PERFIL[k] = el.value.trim(); });
  markDirty(); _dalPerfilSaveSoon();
  showToast({ kind: 'success', title: 'Perfil guardado', body: 'Los datos de la empresa se aplicarán a los documentos. Recuerda Guardar OS para respaldarlo.' });
  openConfigPanel();
}

/* ═══ V11.2.0 · Configuración de la productora: subtabs, equipo y diseño ═══ */
export function _empShowSub(k) {
  var map = { datos: 'empSubDatos', equipo: 'empSubEquipo', diseno: 'empSubDiseno', servicios: 'empSubServicios' };
  Object.keys(map).forEach(function (key) {
    var el = document.getElementById(map[key]); if (el) el.style.display = (key === k) ? '' : 'none';
    var btn = document.getElementById('empTab' + key);
    if (btn) { btn.classList.toggle('btn-ghost', key !== k); }
  });
}
let _EMP_PERFILES = null;   // V11.3.0 · perfiles de la org activa: [{id,codigo,nombre}]
export async function _empPerfilesOrg() {
  if (_EMP_PERFILES) return _EMP_PERFILES;
  try {
    const r = await sb.from('permission_profiles').select('id, codigo, nombre').eq('organization_id', ORG_ID).order('codigo');
    if (!r.error && Array.isArray(r.data)) _EMP_PERFILES = r.data;
  } catch (e) {}
  return _EMP_PERFILES || [];
}
/* V11.x · código de perfil a partir de su id (lee el cache _EMP_PERFILES). */
function _empCodigoDePerfil(profileId) {
  var arr = _EMP_PERFILES || [];
  var p = arr.find(function (x) { return String(x.id) === String(profileId); });
  return p ? p.codigo : null;
}
async function _empCambiarPerfil(memId, profileId, tipoActual) {
  /* Invariante tipo×perfil: un externo no puede ser Administrador (1) ni
     Finanzas (8) —misma regla que el RPC de invitación impone server-side—. */
  var cod = _empCodigoDePerfil(profileId);
  if (String(tipoActual) === 'externo' && (cod === 1 || cod === 8)) {
    showToast({ kind: 'warning', title: 'Perfil no válido para un externo', body: 'Un colaborador externo no puede tener perfil Administrador ni Finanzas. Pásalo primero a interno si necesita ese perfil.', duration: 8000 });
    _empCargarEquipo();
    return;
  }
  try {
    const r = await sb.from('memberships').update({ profile_id: profileId }).eq('id', memId);
    if (r.error) throw r.error;
    showToast({ kind: 'success', title: 'Perfil actualizado', body: 'El cambio rige desde su próxima sesión.' });
  } catch (e) {
    var det = (e && e.message) ? String(e.message).replace(/^memberships:\s*/i, '') : 'Cambiar perfiles es facultad del Administrador.';
    showToast({ kind: 'error', title: 'No se pudo cambiar', body: det, duration: 8000 });
    _empCargarEquipo();
  }
}
/* V11.x · cambiar el tipo de relación (interno ↔ externo) de un miembro ya
   existente. Mismo patrón que el cambio de perfil: UPDATE directo a memberships
   protegido por la RLS (solo Administrador) + trigger del último admin. El tipo
   define qué proyectos ve la persona (ADR-004): interno → todos; externo → solo
   los asignados. */
async function _empCambiarTipo(memId, nuevoTipo, perfilCodigo) {
  nuevoTipo = (nuevoTipo === 'externo') ? 'externo' : 'interno';
  if (nuevoTipo === 'externo' && (perfilCodigo === 1 || perfilCodigo === 8)) {
    showToast({ kind: 'warning', title: 'No se puede pasar a externo', body: 'Esta persona tiene perfil Administrador o Finanzas, que solo pueden ser internos. Cambia primero su perfil de acceso.', duration: 8000 });
    _empCargarEquipo();
    return;
  }
  var cuerpo = (nuevoTipo === 'externo')
    ? 'Al pasar a <strong>externo</strong>, la persona dejará de ver todos los proyectos de la productora y solo verá aquellos a los que la asignes explícitamente.'
    : 'Al pasar a <strong>interno</strong>, la persona pasará a ver todos los proyectos de la productora.';
  showModal({
    title: 'Cambiar tipo de relación',
    body: cuerpo + '<br><br>¿Continuar?',
    confirmLabel: 'Sí, cambiar',
    cancelLabel: 'Cancelar',
    onCancel: function () { _empCargarEquipo(); },   // el select ya mostraba el valor nuevo: recargar lo revierte
    onConfirm: async function () {
      try {
        const r = await sb.from('memberships').update({ tipo: nuevoTipo }).eq('id', memId);
        if (r.error) throw r.error;
        showToast({ kind: 'success', title: 'Tipo actualizado', body: 'El cambio rige desde su próxima sesión.' });
      } catch (e) {
        var det = (e && e.message) ? String(e.message).replace(/^memberships:\s*/i, '') : 'Cambiar el tipo de relación es facultad del Administrador.';
        showToast({ kind: 'error', title: 'No se pudo cambiar', body: det, duration: 8000 });
      }
      _empCargarEquipo();
    }
  });
}
/* V11.x · quitar a alguien del equipo (cortar toda relación con la productora).
   No es borrado físico (la doctrina lo prohíbe): pasa la membresía a
   estado='inactivo' —el estado canónico de "revocada" del ADR-004—, con lo que
   pierde de inmediato todo acceso (los helpers de autorización filtran por
   estado='activo') y desaparece de la vista del equipo. Queda registro en la
   auditoría. La RLS exige Administrador y el trigger impide quitar al único
   Administrador activo. */
async function _empEcharMiembro(memId, nombreEnc) {
  var quien = 'esta persona';
  try { var d = decodeURIComponent(nombreEnc || ''); if (d) quien = d; } catch (e) {}
  showModal({
    title: 'Quitar del equipo',
    body: '¿Quitar a <strong>' + escapeHtml(quien) + '</strong> del equipo?<br><br>Perderá de inmediato todo acceso a la productora y desaparecerá de la lista del equipo. Queda un registro en la auditoría (no es un borrado físico). Para reincorporarla habrá que volver a invitarla.',
    confirmLabel: 'Quitar del equipo',
    cancelLabel: 'Cancelar',
    danger: true,
    onConfirm: async function () {
      try {
        const r = await sb.from('memberships').update({ estado: 'inactivo' }).eq('id', memId);
        if (r.error) throw r.error;
        showToast({ kind: 'success', title: 'Persona quitada del equipo', body: quien + ' perdió el acceso a la productora. Su historial queda registrado en la auditoría.' });
      } catch (e) {
        var det = (e && e.message) ? String(e.message).replace(/^memberships:\s*/i, '') : 'Quitar personas del equipo es facultad del Administrador.';
        showToast({ kind: 'error', title: 'No se pudo quitar', body: det, duration: 8000 });
      }
      _empCargarEquipo();
    }
  });
}
/* V11.6.0 · invitación de DATOS (la de las fichas de personas): pide a la
   persona crear cuenta (si no tiene) y consentir que la productora importe
   sus datos. NO la incorpora a ningún cargo ni proyecto (membresía externa
   sin cargos = no ve nada; solo queda como contacto con datos consentidos).
   Distinta de la invitación por cargo (esa sí incorpora al proyecto). */
function _invAbrirDatos(emailPrellenado) {
  document.getElementById('modalRoot').innerHTML = '<div class="modal-backdrop"><div class="modal" style="max-width:460px;">'
    + '<div class="modal-header"><div class="modal-title">Link de invitación (datos de la persona)</div></div>'
    + '<div class="modal-body">'
    + '<p style="margin:0 0 10px;font-size:12.5px;color:var(--ink-secondary);line-height:1.55;">La persona crea su cuenta (si no la tiene), llena sus datos una sola vez y autoriza compartirlos con tu productora. <strong>No</strong> la incorpora a ningún proyecto ni cargo: para eso está la invitación desde Cargos.</p>'
    + '<div class="emp-field"><label>Correo</label><input class="input" id="invDatosEmail" type="email" placeholder="persona@correo.cl" value="' + escapeHtml(emailPrellenado || '') + '"></div>'
    + '</div>'
    + '<div class="modal-footer"><button class="btn" data-accion="ui.cerrar">Cancelar</button><button class="btn btn-primary" data-accion="cfg.fn" data-args="[&quot;_invEnviarDatos&quot;]">Crear invitación</button></div>'
    + '</div></div>';
}
async function _invEnviarDatos() {
  const email = String((document.getElementById('invDatosEmail') || {}).value || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showToast({ kind: 'warning', title: 'Correo inválido', body: 'Revisa el correo e inténtalo de nuevo.' }); return; }
  try {
    const res = await dalInvitar(email, 'externo', 7, null, null);
    _invMostrarResultado(res);
  } catch (e) {
    if (manejarErrorPlan(e)) return;   // V11.16.0 · Frente D
    showToast({ kind: 'error', title: 'No se pudo invitar', body: ((e && e.message) || '').replace(/^invitar:\s*/i, '') || 'Reintenta.', duration: 8000 });
  }
}
function _empAbrirInvitar() {
  _empPerfilesOrg().then(function (perfiles) {
    const opts = (perfiles.length ? perfiles : Object.keys(PERFIL_NOMBRE_POR_CODIGO).map(function (c) { return { codigo: +c, nombre: PERFIL_NOMBRE_POR_CODIGO[c] }; }))
      .map(function (p) { return '<option value="' + p.codigo + '"' + (p.codigo === 3 ? ' selected' : '') + '>' + escapeHtml(p.nombre) + '</option>'; }).join('');
    document.getElementById('modalRoot').innerHTML = '<div class="modal-backdrop" data-accion="ui.backdrop"><div class="modal" style="max-width:480px;">'
      + '<div class="modal-header"><div class="modal-title">Incorporar a alguien al equipo</div></div>'
      + '<div class="modal-body">'
      +   '<div class="emp-field" style="margin-bottom:12px;"><label>Correo</label><input class="input" id="empInvEmail" type="email" placeholder="persona@correo.cl"><span class="hint" style="font-size:11.5px;color:var(--ink-faint);">Solo el correo: por privacidad no se busca entre los usuarios de TakeOS. Si ya tiene cuenta, la invitación le aparece adentro; si no, el link la lleva a crearla.</span></div>'
      +   '<div class="emp-field"><label>Perfil de acceso</label><select class="select" id="empInvPerfil">' + opts + '</select></div>'
      + '</div>'
      + '<div class="modal-footer"><button class="btn" data-accion="cfg.volver">Cancelar</button><button class="btn btn-primary" data-accion="cfg.fn" data-args="[&quot;_empEnviarInvitacion&quot;]">Crear invitación</button></div>'
      + '</div></div>';
  });
}
async function _empEnviarInvitacion() {
  const email = String((document.getElementById('empInvEmail') || {}).value || '').trim();
  const codigo = parseInt((document.getElementById('empInvPerfil') || {}).value || '0', 10);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showToast({ kind: 'warning', title: 'Correo inválido', body: 'Revisa el correo e inténtalo de nuevo.' }); return; }
  try {
    const res = await dalInvitar(email, 'interno', codigo, null, null);
    _invMostrarResultado(res);
    _empCargarEquipo();
  } catch (e) {
    if (manejarErrorPlan(e)) return;   // V11.16.0 · Frente D: tope de colaboradores → momento de venta
    showToast({ kind: 'error', title: 'No se pudo invitar', body: ((e && e.message) || '').replace(/^invitar:\s*/i, '') || 'Reintenta.', duration: 8000 });
  }
}
async function _empCancelarInvitacion(token) {
  try {
    const { error } = await sb.rpc('cancelar_invitacion', { p_token: token });
    if (error) throw error;
    showToast({ kind: 'info', title: 'Invitación cancelada', body: 'El link dejó de ser válido.' });
  } catch (e) {
    showToast({ kind: 'error', title: 'No se pudo cancelar', body: ((e && e.message) || '').replace(/^invitacion:\s*/i, '') || 'Reintenta.', duration: 7000 });
  }
  _empCargarEquipo();
}
function _empCopiarInv(token) {
  const link = invitacionLink(token);
  try { navigator.clipboard.writeText(link); showToast({ kind: 'success', title: 'Link copiado', body: link }); }
  catch (e) { window.prompt('Copia el link de invitación:', link); }
}
async function _empCargarEquipo() {
  var box = document.getElementById('empEquipoTabla'); if (!box) return;
  if (!sb) { box.textContent = 'Sin conexión a la base.'; return; }
  try {
    var perfiles = await _empPerfilesOrg();
    var res = await sb.from('memberships')
      .select('id, user_id, tipo, estado, contact_id, profile_id, permission_profiles(nombre)')
      .eq('organization_id', ORG_ID);
    if (res.error) throw res.error;
    /* V11.x · se ocultan las membresías inactivas (personas "quitadas" del
       equipo): siguen en la base por auditoría, pero desaparecen de la vista. */
    var rows = (res.data || []).filter(function (r) { return r.estado !== 'inactivo'; });
    if (!rows.length) { box.textContent = 'Sin membresías visibles. (El RLS puede limitar esta vista a tu propio registro.)'; return; }
    var soyAdmin = (typeof authEsAdmin === 'function') ? (!TAKEOS_PERFIL || authEsAdmin()) : true;
    /* mapa perfil_id → código, para imponer la regla "un externo no puede ser
       Administrador (1) ni Finanzas (8)" del lado del cliente (UX; el RPC de
       invitación ya la impone server-side). */
    var perfilCodPorId = {};
    perfiles.forEach(function (p) { perfilCodPorId[String(p.id)] = p.codigo; });
    /* V11.3.1 · candado de último Administrador: si la org tiene un solo
       admin activo, su perfil no se puede cambiar desde aquí (la base además
       lo rechaza con trigger; esto evita siquiera ofrecerlo). */
    var adminIds = perfiles.filter(function (p) { return p.codigo === 1; }).map(function (p) { return p.id; });
    var adminsActivos = rows.filter(function (r) { return r.estado === 'activo' && adminIds.indexOf(r.profile_id) >= 0; });
    var thBase = 'text-align:left;padding:6px 8px;border-bottom:1px solid var(--rule);color:var(--ink-faint);font-size:11px;text-transform:uppercase;letter-spacing:.05em;';
    /* V11.21 · construye la fila <tr> de un miembro. `contexto` es 'interno' o
       'externo' y decide el botón de convertir; la etiqueta de tipo ya no se
       repite por fila (la da la sección). Se reusa en ambas secciones. */
    function _empFilaHTML(m, contexto) {
      var nom = (m.contact_id && typeof BD_CONTACTOS !== 'undefined' && BD_CONTACTOS[m.contact_id] && BD_CONTACTOS[m.contact_id].nombre) ? BD_CONTACTOS[m.contact_id].nombre : '';
      if (!nom && typeof DAL_SESSION_UID !== 'undefined' && m.user_id === DAL_SESSION_UID) nom = ((typeof USER_NOMBRE !== 'undefined' ? USER_NOMBRE : '') + ' ' + (typeof USER_APELLIDO !== 'undefined' ? USER_APELLIDO : '')).trim();
      var perfilNom = (m.permission_profiles && m.permission_profiles.nombre) ? m.permission_profiles.nombre : '—';
      var perfilCell;
      var esUnicoAdmin = adminsActivos.length === 1 && adminsActivos[0].id === m.id;
      var perfilCod = perfilCodPorId[String(m.profile_id)];
      var esYo = (typeof DAL_SESSION_UID !== 'undefined' && m.user_id === DAL_SESSION_UID);
      if (soyAdmin && perfiles.length && !esUnicoAdmin) {
        perfilCell = '<select class="select" style="font-size:12.5px;padding:4px 8px;" ' + accionHTML('cfg.perfilSel', m.id, m.tipo || '', { on: 'change' }) + '>'
          + perfiles.map(function (p) { return '<option value="' + p.id + '"' + (p.id === m.profile_id ? ' selected' : '') + '>' + escapeHtml(p.nombre) + '</option>'; }).join('')
          + '</select>';
      } else if (esUnicoAdmin) {
        perfilCell = escapeHtml(perfilNom) + ' <span style="font-size:10px;color:var(--ink-faint);" title="Única persona con perfil Administrador: asigna otro Administrador antes de poder cambiar este perfil.">🔒 único admin</span>';
      } else { perfilCell = escapeHtml(perfilNom); }
      var est = String(m.estado || '');
      var estLabel = est === 'activo' ? 'Activo' : (est === 'pendiente' ? 'Invitación pendiente' : (est || '—'));
      var estColor = est === 'activo' ? 'var(--positive)' : 'var(--warning)';
      /* Acciones: convertir interno↔externo + quitar. El único Admin queda
         bloqueado; a ti mismo no te ofreces acciones; un interno con perfil
         Admin/Finanzas no puede pasar a externo (la guardia vive además en
         _empCambiarTipo, que reimpone la regla y la base la respalda). */
      var convBtn = '';
      if (soyAdmin && !esUnicoAdmin && !esYo) {
        if (contexto === 'externo') {
          convBtn = '<button class="btn btn-ghost btn-sm" title="Pasar a interno: verá todos los proyectos de la productora." ' + accionHTML('cfg.fn', '_empCambiarTipo', m.id, 'interno', perfilCod || 0) + '>Hacer interno</button>';
        } else if (perfilCod === 1 || perfilCod === 8) {
          convBtn = '<span style="font-size:10.5px;color:var(--ink-faint);" title="Administrador y Finanzas solo pueden ser internos. Cambia primero su perfil de acceso para poder pasarlo a externo.">Solo interno</span>';
        } else {
          convBtn = '<button class="btn btn-ghost btn-sm" title="Pasar a externo: dejará de ver todos los proyectos y solo verá los que le asignes." ' + accionHTML('cfg.fn', '_empCambiarTipo', m.id, 'externo', perfilCod || 0) + '>Hacer externo</button>';
        }
      }
      var quitarCell = '';
      if (soyAdmin) {
        if (esUnicoAdmin) quitarCell = '<span style="font-size:10px;color:var(--ink-faint);" title="No puedes quitar a la única persona con perfil Administrador. Transfiere la administración primero.">🔒 único admin</span>';
        else if (esYo) quitarCell = '<span style="font-size:10px;color:var(--ink-faint);">tú</span>';
        else quitarCell = '<button class="btn btn-ghost btn-sm" style="color:var(--accent-deep);" ' + accionHTML('cfg.fn', '_empEcharMiembro', m.id, encodeURIComponent(nom || '')) + '>Quitar</button>';
      }
      var accCell = [convBtn, quitarCell].filter(Boolean).join(' <span style="color:var(--rule);">·</span> ');
      return '<tr>'
        + '<td style="padding:7px 8px;border-bottom:1px solid var(--rule);">' + escapeHtml(nom || '—') + '</td>'
        + '<td style="padding:7px 8px;border-bottom:1px solid var(--rule);">' + perfilCell + '</td>'
        + '<td style="padding:7px 8px;border-bottom:1px solid var(--rule);color:' + estColor + ';font-weight:600;">' + escapeHtml(estLabel) + '</td>'
        + (soyAdmin ? '<td style="padding:7px 8px;border-bottom:1px solid var(--rule);text-align:right;white-space:nowrap;">' + accCell + '</td>' : '')
        + '</tr>';
    }
    /* V11.21 · arma una tabla completa para una lista (sin columna "Tipo": la
       sección/subsección ya dice si son internos o externos). */
    function _empTablaHTML(lista, contexto) {
      if (!lista.length) return '<div style="color:var(--ink-faint);font-size:12.5px;padding:6px 2px 2px;">— nadie por ahora —</div>';
      return '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
        + '<thead><tr>'
        + '<th style="' + thBase + '">Persona</th>'
        + '<th style="' + thBase + '">Perfil de acceso</th>'
        + '<th style="' + thBase + '">Estado</th>'
        + (soyAdmin ? '<th style="' + thBase + 'text-align:right;">Acciones</th>' : '')
        + '</tr></thead><tbody>'
        + lista.map(function (m) { return _empFilaHTML(m, contexto); }).join('')
        + '</tbody></table>';
    }
    /* V11.21 · externos agrupados por PROYECTO (subsecciones). Solo proyectos
       activos (no cerrado/rechazado) y con al menos un externo asignado; el resto
       no aparece, para no meter ruido. Un externo en varios proyectos sale en cada
       uno (así se ve "de qué proyecto es externo"). Los que no tienen proyecto
       activo van a un grupo aparte para no desaparecer de la vista. El vínculo
       externo↔proyecto se lee de project_cargos (cargo asignado al user_id o al
       contacto del miembro); por eso se cargan los cargos de los activos. */
    async function _empExternosHTML(externos) {
      if (!externos.length) return '<div style="color:var(--ink-faint);font-size:12.5px;padding:6px 2px 2px;">— nadie por ahora —</div>';
      var activos = (typeof PROJECTS !== 'undefined' && Array.isArray(PROJECTS))
        ? PROJECTS.filter(function (p) { return ['cerrado', 'rechazado'].indexOf(p.state) === -1; })
        : [];
      try {
        if (typeof dalCargarCargos === 'function') {
          await Promise.all(activos.map(function (p) { try { return Promise.resolve(dalCargarCargos(p)).catch(function () {}); } catch (e) { return null; } }));
        }
      } catch (e) {}
      var asignados = {};
      var bloques = [];
      activos.forEach(function (p) {
        var cargos = (p.data && Array.isArray(p.data.cargos)) ? p.data.cargos : [];
        if (!cargos.length) return;
        var enProy = externos.filter(function (m) {
          return cargos.some(function (c) {
            return (m.user_id && c.invitedUserId && String(c.invitedUserId) === String(m.user_id))
                || (m.contact_id && c.contactId && String(c.contactId) === String(m.contact_id));
          });
        });
        if (enProy.length) {
          enProy.forEach(function (m) { asignados[m.id] = true; });
          bloques.push({ nombre: (p.name || '(sin nombre)'), lista: enProy });
        }
      });
      bloques.sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre), 'es'); });
      var sinProy = externos.filter(function (m) { return !asignados[m.id]; });
      var subH = 'font-size:11.5px;font-weight:600;color:var(--ink-secondary);margin:14px 0 6px;';
      var chip = 'font-weight:400;color:var(--ink-faint);font-size:11px;';
      var out = '';
      bloques.forEach(function (b) {
        out += '<div style="' + subH + '">📁 ' + escapeHtml(b.nombre) + ' <span style="' + chip + '">· ' + b.lista.length + ' externo' + (b.lista.length === 1 ? '' : 's') + '</span></div>'
          + _empTablaHTML(b.lista, 'externo');
      });
      if (sinProy.length) {
        out += '<div style="' + subH + 'color:var(--ink-faint);">Sin proyecto activo asignado <span style="' + chip + '">· ' + sinProy.length + '</span></div>'
          + _empTablaHTML(sinProy, 'externo');
      }
      return out;
    }
    /* V11.21 · internos arriba (lista simple), externos abajo (por proyecto). El
       tipo se cambia con el botón "Hacer interno/externo" de cada fila; al
       cambiarlo, la persona salta de sección/subsección al recargar. */
    var internos = rows.filter(function (r) { return r.tipo === 'interno'; });
    var externos = rows.filter(function (r) { return r.tipo === 'externo'; });
    var secStyle = 'font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-secondary);margin:0 0 8px;';
    var subNota = 'font-weight:400;text-transform:none;letter-spacing:0;color:var(--ink-faint);';
    var html = '<div style="margin-bottom:18px;">'
      + '<div style="' + secStyle + '">Internos · ' + internos.length + ' <span style="' + subNota + '">ven todos los proyectos de la productora</span></div>'
      + _empTablaHTML(internos, 'interno')
      + '</div>'
      + '<div>'
      + '<div style="' + secStyle + '">Externos · ' + externos.length + ' <span style="' + subNota + '">por proyecto · solo ven los proyectos a los que se les asigna</span></div>'
      + (await _empExternosHTML(externos))
      + '</div>';
    box.innerHTML = html;
    _empCargarInvitaciones();
  } catch (e) {
    console.warn('[empresa] no se pudo cargar el equipo', e);
    box.textContent = 'No se pudo cargar el equipo (puede ser una restricción de lectura del RLS).';
  }
}
/* ── V11.15.0 · Plan G (1.6) · Transferir administración ─────────────────────
   Asciende a otro miembro INTERNO ACTIVO a Administrador, vía el RPC
   transferir_administracion(p_org_id, p_target_user_id). El servidor reimpone
   la regla (solo un Administrador transfiere; el destino debe ser interno
   activo); el cliente solo ofrece candidatos válidos y refleja el resultado.
   Resuelve el bloqueo "no puedes borrarte si eres el único admin". */
function _empNombreMiembro(m) {
  var nom = (m.contact_id && typeof BD_CONTACTOS !== 'undefined' && BD_CONTACTOS[m.contact_id] && BD_CONTACTOS[m.contact_id].nombre) ? BD_CONTACTOS[m.contact_id].nombre : '';
  if (!nom && typeof DAL_SESSION_UID !== 'undefined' && m.user_id === DAL_SESSION_UID) nom = ((typeof USER_NOMBRE !== 'undefined' ? USER_NOMBRE : '') + ' ' + (typeof USER_APELLIDO !== 'undefined' ? USER_APELLIDO : '')).trim();
  return nom || '(sin nombre)';
}
async function _empAbrirTransferir() {
  var cuerpo = '<div class="pd-ph" style="color:var(--ink-faint);font-size:13px;">Cargando miembros…</div>';
  document.getElementById('modalRoot').innerHTML = '<div class="modal-backdrop" data-accion="ui.backdrop"><div class="modal" style="max-width:480px;">'
    + '<div class="modal-header"><div class="modal-title">Transferir administración</div></div>'
    + '<div class="modal-body" id="empTransBody">' + cuerpo + '</div>'
    + '<div class="modal-footer" id="empTransFooter"><button class="btn" data-accion="cfg.volver">Cancelar</button></div>'
    + '</div></div>';
  try {
    var res = await sb.from('memberships')
      .select('id, user_id, tipo, estado, contact_id')
      .eq('organization_id', ORG_ID).eq('estado', 'activo').eq('tipo', 'interno');
    if (res.error) throw res.error;
    var cands = (res.data || []).filter(function (m) { return m.user_id && m.user_id !== DAL_SESSION_UID; });
    var body = document.getElementById('empTransBody'); if (!body) return;
    if (!cands.length) {
      body.innerHTML = '<p style="margin:0;font-size:13px;color:var(--ink-secondary);line-height:1.55;">No hay otro miembro interno activo a quien transferir la administración. Primero incorpora a alguien como interno (y que acepte la invitación), o cambia su perfil a interno activo.</p>';
      return;
    }
    var opts = cands.map(function (m) { return '<option value="' + escapeHtml(m.user_id) + '">' + escapeHtml(_empNombreMiembro(m)) + '</option>'; }).join('');
    body.innerHTML = '<p style="margin:0 0 12px;font-size:13px;color:var(--ink-secondary);line-height:1.55;">La persona que elijas pasará a ser <strong>Administrador</strong> de la productora. <strong>Tú dejarás de ser Administrador</strong> en cuanto confirmes; el cambio rige desde la próxima sesión.</p>'
      + '<div class="emp-field"><label>Nuevo Administrador</label><select class="select" id="empTransTarget">' + opts + '</select></div>';
    var footer = document.getElementById('empTransFooter');
    if (footer) footer.innerHTML = '<button class="btn" data-accion="cfg.volver">Cancelar</button><button class="btn btn-danger" data-accion="cfg.fn" data-args="[&quot;_empConfirmarTransferir&quot;]">Transferir administración</button>';
  } catch (e) {
    var b = document.getElementById('empTransBody');
    if (b) b.innerHTML = '<p style="margin:0;font-size:13px;color:var(--accent-deep);">No se pudo cargar la lista de miembros. Reintenta.</p>';
  }
}
async function _empConfirmarTransferir() {
  var sel = document.getElementById('empTransTarget');
  var targetUid = sel ? sel.value : '';
  if (!targetUid) return;
  try {
    var r = await sb.rpc('transferir_administracion', { p_org_id: ORG_ID, p_target_user_id: targetUid });
    if (r.error) throw r.error;
    closeModal();
    showToast({ kind: 'success', title: 'Administración transferida', body: 'La persona elegida es la nueva Administradora. Tu cambio de perfil rige desde tu próxima sesión.' });
    try { openEmpresaPerfil('equipo'); } catch (e) {}
  } catch (e) {
    var det = (e && e.message) ? String(e.message).replace(/^[a-z_]+:\s*/i, '') : 'Reintenta.';
    showToast({ kind: 'error', title: 'No se pudo transferir', body: det, duration: 8000 });
  }
}
async function _empCargarInvitaciones() {
  var box = document.getElementById('empInvitacionesLista'); if (!box) return;
  try {
    /* V11.4.1 · vía RPC invitaciones_de_organizacion (recomendación BD Expert):
       resuelve perfil/cargo/proyecto server-side y comparte el gate
       Administrador/Ejecutivo de cancelar_invitacion. */
    var r = await sb.rpc('invitaciones_de_organizacion', { p_org_id: ORG_ID });
    if (r.error) throw r.error;
    var invs = Array.isArray(r.data) ? r.data : [];
    if (!invs.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div style="font-weight:700;font-size:13px;margin-bottom:8px;">Invitaciones pendientes</div>'
      + invs.map(function (i) {
          var meta = (i.perfil_nombre || PERFIL_NOMBRE_POR_CODIGO[i.perfil_codigo] || '');
          if (i.persona_nombre || i.persona) meta = (i.persona_nombre || i.persona) + ' · ' + meta;
          if (i.cargo_nombre) meta += ' · ' + i.cargo_nombre;
          if (i.proyecto_nombre) meta += ' · ' + i.proyecto_nombre;
          meta += ' · ' + (i.tipo || '');
          return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 0;border-top:1px solid var(--rule);font-size:12.5px;">'
            + '<div>' + escapeHtml(i.email) + ' <span style="color:var(--ink-faint);">· ' + escapeHtml(meta) + '</span></div>'
            + '<div style="display:flex;gap:6px;">'
            +   '<button class="btn btn-ghost btn-sm" ' + accionHTML('cfg.fn', '_empCopiarInv', i.token) + '>Copiar link</button>'
            +   '<button class="btn btn-ghost btn-sm" ' + accionHTML('cfg.fn', '_empCancelarInvitacion', i.token) + '>Cancelar</button>'
            + '</div></div>';
        }).join('');
  } catch (e) { box.innerHTML = ''; }
}
function _orgLogos() {
  var e = (typeof EMPRESA_PERFIL !== 'undefined' && EMPRESA_PERFIL) ? EMPRESA_PERFIL : {};
  if (!Array.isArray(e.logos)) {
    e.logos = [];
    /* migración suave desde el logo único de V11.2 */
    if (e.logoDataUrl && String(e.logoDataUrl).indexOf('data:image/') === 0) {
      e.logos.push({ id: 'lg-mig', nombre: 'Principal', dataUrl: e.logoDataUrl, principal: true });
    }
  }
  return e.logos;
}
function orgLogo() {
  var logos = _orgLogos();
  var p = logos.find(function (l) { return l && l.principal && l.dataUrl; }) || logos.find(function (l) { return l && l.dataUrl; });
  return p ? p.dataUrl : '';
}
function _empLogoSync() {
  /* compat: logoDataUrl espeja siempre el principal (los documentos leen orgLogo()) */
  EMPRESA_PERFIL.logoDataUrl = orgLogo();
  markDirty(); _dalPerfilSaveSoon(); _empLogoRefresh();
}
function _empLogoRefresh() {
  var box = document.getElementById('empLogosGaleria'); if (!box) return;
  var adm = _puedeModoAdmin();   /* V11.11.0 · no-admins: ver y descargar; editar es del Administrador */
  var logos = _orgLogos();
  if (!logos.length) { box.innerHTML = '<div style="width:120px;height:120px;border:1px dashed var(--rule);border-radius:10px;display:grid;place-items:center;color:var(--ink-faint);font-size:12px;">Sin logos</div>'; return; }
  box.innerHTML = logos.map(function (l) {
    return '<div style="width:160px;border:1px solid ' + (l.principal ? 'var(--accent)' : 'var(--rule)') + ';border-radius:10px;padding:8px;background:var(--bg-card);">'
      + '<div style="height:90px;display:grid;place-items:center;overflow:hidden;margin-bottom:6px;"><img src="' + safeUrl(l.dataUrl) + '" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>'
      + '<input class="input" style="font-size:11.5px;padding:4px 6px;margin-bottom:6px;" value="' + escapeHtml(l.nombre || '') + '" placeholder="Nombre (ej. Horizontal claro)"' + (adm ? ' ' + accionHTML('cfg.logoNombre', l.id, { on: 'change' }) : ' readonly') + '>'
      + '<div style="display:flex;gap:4px;flex-wrap:wrap;">'
      + '<button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:2px 7px;" ' + accionHTML('cfg.fn', '_empLogoDescargar', l.id) + '>↓ Descargar</button>'
      + (l.principal ? '<span style="font-size:10.5px;font-weight:700;color:var(--accent);align-self:center;">★ Principal</span>' : (adm ? '<button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:2px 7px;" ' + accionHTML('cfg.fn', '_empLogoPrincipal', l.id) + '>Hacer principal</button>' : ''))
      + (adm ? '<button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:2px 7px;" ' + accionHTML('cfg.fn', '_empLogoQuitar', l.id) + '>Quitar</button>' : '')
      + '</div></div>';
  }).join('');
}

/* ═══ V11.11.0 · Diseño: descarga de logos, paleta de colores y repositorio
   tipográfico de la marca. Todo persiste en EMPRESA_PERFIL (organization_profile
   en Supabase, objeto completo): coloresMarca = ['#RRGGBB', ...] y
   tipografias = [{id, nombre, family}]. Los previsualizadores los leen vía
   cotPrevColores() y cotPrevFonts(). ═══ */
function _empDatosConClave() {
  requestAdminPassword(function () { STATE.adminMode = true; try { _applyAdminUI(); } catch (e) {} openEmpresaPerfil('datos'); });
}
function _empLogoDescargar(id) {
  var l = _orgLogos().find(function (x) { return x.id === id; });
  if (!l || !l.dataUrl) { showToast({ kind: 'error', title: 'Logo no disponible', body: 'Esta variación no tiene archivo guardado.' }); return; }
  var ext = l.dataUrl.indexOf('image/svg') >= 0 ? 'svg' : (l.dataUrl.indexOf('image/jpeg') >= 0 ? 'jpg' : (l.dataUrl.indexOf('image/webp') >= 0 ? 'webp' : 'png'));
  var base = ((orgNombre() || 'Logo') + (l.nombre ? ' - ' + l.nombre : '')).replace(/[\\/:*?"<>|]/g, '').trim() || 'logo';
  var a = document.createElement('a');
  a.href = l.dataUrl; a.download = base + '.' + ext;
  document.body.appendChild(a); a.click();
  setTimeout(function () { a.remove(); }, 150);
}
function _empColores() {
  if (!Array.isArray(EMPRESA_PERFIL.coloresMarca)) EMPRESA_PERFIL.coloresMarca = [];
  return EMPRESA_PERFIL.coloresMarca;
}
function _empColorAgregar() {
  var inp = document.getElementById('empColorHex');
  var pick = document.getElementById('empColorPick');
  /* #8 · saneo robusto: tolera el '#', espacios y caracteres invisibles del
     copy-paste (NBSP/zero-width) y acepta el shorthand de 3 dígitos. */
  var raw = String((inp && inp.value) || (pick && pick.value) || '');
  var hex = raw.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
  if (hex.length !== 6) { showToast({ kind: 'error', title: 'Color inválido', body: 'Usa un código hex de 6 dígitos, por ejemplo <strong>#B03A2F</strong>.' }); return; }
  var v = '#' + hex.toUpperCase();
  var cols = _empColores();
  if (cols.indexOf(v) >= 0) { showToast({ kind: 'info', title: 'Ya está en la paleta', body: v }); return; }
  if (cols.length >= 10) { showToast({ kind: 'error', title: 'Paleta llena', body: 'Máximo 10 colores. Quita uno para agregar otro.' }); return; }
  cols.push(v);
  if (inp) inp.value = '';
  markDirty(); _dalPerfilSaveSoon(); _empDisenoRefresh();
}
function _empColorQuitar(i) {
  var cols = _empColores();
  if (i < 0 || i >= cols.length) return;
  cols.splice(i, 1);
  markDirty(); _dalPerfilSaveSoon(); _empDisenoRefresh();
}
function _empColorCopiar(hex) {
  try { navigator.clipboard.writeText(hex); showToast({ kind: 'success', title: 'Copiado', body: hex }); }
  catch (e) { showToast({ kind: 'info', title: hex, body: 'Cópialo manualmente.' }); }
}
function _empTipos() {
  if (!Array.isArray(EMPRESA_PERFIL.tipografias)) EMPRESA_PERFIL.tipografias = [];
  return EMPRESA_PERFIL.tipografias;
}
function _empTipoLinkApp(family) {
  /* Carga la familia en la app para que la muestra del repositorio se vea con
     la tipografía real (los documentos cargan la suya aparte, vía cotPrevFontLink). */
  try {
    var fam = String(family || '').trim(); if (!fam) return;
    var id = 'gfTipo_' + fam.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (document.getElementById(id)) return;
    var l = document.createElement('link'); l.id = id; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + _cotPrevFamiliaGF(fam) + '&display=swap';
    document.head.appendChild(l);
  } catch (e) {}
}
function _empTipoAgregar() {
  var nomEl = document.getElementById('empTipoNombre'), famEl = document.getElementById('empTipoFamilia');
  var fam = String((famEl && famEl.value) || '').trim().replace(/['"<>]/g, '');
  if (!fam) { showToast({ kind: 'error', title: 'Falta la familia', body: 'Indica el nombre exacto de la familia en Google Fonts, por ejemplo <strong>Oswald</strong>.' }); return; }
  var tipos = _empTipos();
  if (tipos.some(function (t) { return String(t.family || '').toLowerCase() === fam.toLowerCase(); })) { showToast({ kind: 'info', title: 'Ya está en el repositorio', body: fam }); return; }
  if (tipos.length >= 6) { showToast({ kind: 'error', title: 'Repositorio lleno', body: 'Máximo 6 tipografías de marca.' }); return; }
  tipos.push({ id: 'tf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nombre: String((nomEl && nomEl.value) || '').trim(), family: fam });
  if (nomEl) nomEl.value = '';
  if (famEl) famEl.value = '';
  _empTipoLinkApp(fam);
  markDirty(); _dalPerfilSaveSoon(); _empDisenoRefresh();
  showToast({ kind: 'success', title: 'Tipografía agregada', body: 'Si la muestra se ve genérica, revisa que el nombre coincida exactamente con el de Google Fonts.' });
}
function _empTipoQuitar(id) {
  EMPRESA_PERFIL.tipografias = _empTipos().filter(function (t) { return t.id !== id; });
  markDirty(); _dalPerfilSaveSoon(); _empDisenoRefresh();
}
function _empDisenoRefresh() {
  var adm = _puedeModoAdmin();
  var cbox = document.getElementById('empColoresGaleria');
  if (cbox) {
    var cols = _empColores().filter(_cotPrevHexValido);
    cbox.innerHTML = cols.length ? cols.map(function (hex, i) {
      return '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">'
        + '<button title="Copiar ' + hex + '" ' + accionHTML('cfg.fn', '_empColorCopiar', hex) + ' style="width:46px;height:46px;border-radius:10px;background:' + hex + ';border:1px solid var(--rule);cursor:pointer;"></button>'
        + '<span style="font-size:10px;color:var(--ink-muted);font-variant-numeric:tabular-nums;">' + hex + '</span>'
        + (adm ? '<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:1px 6px;" ' + accionHTML('cfg.fn', '_empColorQuitar', i) + '>Quitar</button>' : '')
        + '</div>';
    }).join('') : '<div style="font-size:12px;color:var(--ink-faint);">Sin paleta aún. Los previsualizadores ofrecen presets del sistema mientras tanto.</div>';
  }
  var tbox = document.getElementById('empTiposLista');
  if (tbox) {
    var tipos = _empTipos().filter(function (t) { return t && String(t.family || '').trim(); });
    tipos.forEach(function (t) { _empTipoLinkApp(t.family); });
    tbox.innerHTML = tipos.length ? tipos.map(function (t) {
      var fam = String(t.family).replace(/['"<>]/g, '');
      return '<div style="display:flex;align-items:center;gap:12px;border:1px solid var(--rule);border-radius:9px;padding:9px 12px;background:var(--bg-card);">'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:12.5px;font-weight:600;">' + escapeHtml(t.nombre || fam) + ' <span style="font-weight:400;color:var(--ink-faint);font-size:11px;">· ' + escapeHtml(fam) + '</span></div>'
        + '<div style="font-family:\'' + fam + '\',sans-serif;font-size:15px;color:var(--ink-secondary);margin-top:2px;">Cotización Audiovisual · 0123456789</div>'
        + '</div>'
        + (adm ? '<button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:2px 8px;" ' + accionHTML('cfg.fn', '_empTipoQuitar', t.id || '') + '>Quitar</button>' : '')
        + '</div>';
    }).join('') : '<div style="font-size:12px;color:var(--ink-faint);">Sin tipografías de marca. Los documentos usan las del sistema (Poppins y Serif).</div>';
  }
}
function _empLogoNombre(id, v) { var l = _orgLogos().find(function (x) { return x.id === id; }); if (l) { l.nombre = String(v || '').trim(); markDirty(); _dalPerfilSaveSoon(); } }
function _empLogoPrincipal(id) { _orgLogos().forEach(function (l) { l.principal = (l.id === id); }); _empLogoSync(); }
function _empLogoSet(dataUrl, nombre) {
  var logos = _orgLogos();
  if (logos.length >= 8) { showToast({ kind: 'warning', title: 'Límite de variaciones', body: 'Máximo 8 logos. Quita alguno para subir otro.' }); return; }
  var l = { id: 'lg-' + Date.now().toString(36), nombre: nombre || ('Variación ' + (logos.length + 1)), dataUrl: dataUrl || '', principal: logos.length === 0 };
  logos.push(l);
  _empLogoSync();
}
function _empLogoPick(input) {
  var f = input && input.files && input.files[0]; if (!f) return;
  input.value = '';
  var MAX_BYTES = 350 * 1024;
  var reader = new FileReader();
  reader.onload = function () {
    var dataUrl = String(reader.result || '');
    if (f.type === 'image/svg+xml') {
      if (f.size > MAX_BYTES) { showToast({ kind: 'warning', title: 'SVG muy pesado', body: 'Usa un SVG de menos de 350 KB o súbelo como PNG/JPG.' }); return; }
      _empLogoSet(dataUrl);
      showToast({ kind: 'success', title: 'Logo guardado', body: 'Se aplicará a los documentos de la productora.' });
      return;
    }
    var img = new Image();
    img.onload = function () {
      try {
        var MAXD = 480;
        var w = img.width, h = img.height;
        if (w > MAXD || h > MAXD) { var k = Math.min(MAXD / w, MAXD / h); w = Math.round(w * k); h = Math.round(h * k); }
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        var out = cv.toDataURL('image/png');
        if (out.length > MAX_BYTES * 1.37) out = cv.toDataURL('image/jpeg', 0.85);   // base64 ≈ +37%
        if (out.length > MAX_BYTES * 1.37) { showToast({ kind: 'warning', title: 'Logo muy pesado', body: 'Incluso reducido supera 350 KB. Usa una imagen más simple.' }); return; }
        _empLogoSet(out);
        showToast({ kind: 'success', title: 'Logo guardado', body: 'Se aplicará a los documentos de la productora.' });
      } catch (e) { showToast({ kind: 'error', title: 'No se pudo procesar la imagen', body: 'Intenta con otro archivo.' }); }
    };
    img.onerror = function () { showToast({ kind: 'error', title: 'Archivo no válido', body: 'Usa PNG, JPG o SVG.' }); };
    img.src = dataUrl;
  };
  reader.readAsDataURL(f);
}
function _empLogoQuitar(id) {
  var e = EMPRESA_PERFIL; if (!Array.isArray(e.logos)) return;
  var era = e.logos.find(function (x) { return x.id === id; });
  e.logos = e.logos.filter(function (x) { return x.id !== id; });
  if (era && era.principal && e.logos.length) e.logos[0].principal = true;
  _empLogoSync();
  showToast({ kind: 'info', title: 'Variación quitada', body: e.logos.length ? 'Los documentos usan la variación principal.' : 'Los documentos saldrán sin logo.' });
}

/* ════════════════════════════════════════════════════════════════════
   FRENTE A · CREAR PRODUCTORA — Paso A1: ESQUELETO del flujo
   ─────────────────────────────────────────────────────────────────────
   Overlay full-screen que guía la creación de una productora paso a paso,
   con la estética aprobada (tarjeta + stepper, sobre los botones/inputs
   reales del monolito). En A1 está SOLO el esqueleto: estado + router +
   pasos como placeholders. El contenido de cada paso (cuenta, facturación
   con RUT, términos, pago, cableado a la base y tour) llega en A2…A8.

   DISPARADOR: la app abre este flujo cuando arranca con ?plan=<valor> en la
   URL (valor ∈ {gratis, rodaje, produccion}). El plan NO se elige dentro de
   la app: llega ya elegido desde la landing. La organización SIEMPRE nace
   'free'; el plan se usa para la experiencia (mostrarlo) y, en A6, para el
   pago tras un feature flag apagado.

   CERO backend en A1: ninguna llamada a la base. El cableado real
   (provisionar_organizacion y, aparte, organization_profile) es el Paso A7.
   ════════════════════════════════════════════════════════════════════ */

/* Catálogo de planes para mostrar. Los PRECIOS son la referencia GTM congelada
   del mockup (CONFIRMAR con producto). El IVA NO va acá: se lee de la global
   `IVA` (tax_rates) en el resumen de pago. La organización nace 'free' igual;
   estos montos son solo para el resumen de A6, que vive tras un feature flag
   apagado mientras no exista proveedor de pago. */
const _CP_PLANES = {
  gratis:     { id: 'gratis',     nombre: 'Gratis',     precio: 0 },
  rodaje:     { id: 'rodaje',     nombre: 'Rodaje',     precio: 106800 },
  produccion: { id: 'produccion', nombre: 'Producción', precio: 214800 }
};
const _CP_EARLY_BIRD = 0.50;   // −50% (ventana Early Bird); aplica a planes de pago

/* Estado del flujo (en memoria; se reinicia cada vez que se abre). La
   estructura está pensada para que el cableado de A7 calce limpio: separa
   (a) lo que va a provisionar_organizacion(p_nombre, p_slug) de (b) lo que
   va DESPUÉS y aparte a organization_profile (upsert, gateado por
   datos_empresa = E). */
let _cpEstado = null;
function _cpEstadoInicial(planId) {
  return {
    plan: (planId && _CP_PLANES[planId]) ? planId : null,   // de la URL; la org nace 'free' igual
    paso: 0,                                                 // índice del paso actual

    // (a) → provisionar_organizacion(p_nombre, p_slug). El slug se deriva del
    //     nombre (slugify) recién en A7; acá solo se recolecta el nombre.
    organizacion: { nombre: '', slug: '' },

    // (b) → organization_profile DESPUÉS y aparte (upsert). El nombre ficticio,
    //     la web y el logo se derivan solos a organization_branding por trigger.
    perfilEmpresa: { razonSocial: '', rut: '', giro: '', direccion: '', nombreFicticio: '', web: '' },

    // (c) cuenta personal — solo para la entrada desde la landing (persona
    //     nueva). En A3 esto reusa el OAuth/onboarding existente; no se reinventa.
    persona: { nombre: '', apellido: '', email: '' },

    aceptoTerminos: false,   // A5
    pagado: false,           // A6 (tras feature flag apagado)
    orgCreadaId: null        // A7: id de la organización creada (para entrar a su Control Room)
  };
}

/* Secuencia de pasos. 'pago' solo aparece en planes de pago (la org nace
   'free' de todos modos). El paso 'datos' ya tiene contenido (A2); el resto
   son placeholders por ahora. No hay paso de cuenta: el login y el perfil ya
   ocurren ANTES de abrir el flujo (cloudGate + iniciarSesionTakeOS). */
function _cpPasos() {
  const dePago = !!(_cpEstado && _cpEstado.plan && _cpEstado.plan !== 'gratis');
  const pasos = [
    { id: 'datos',    titulo: 'Datos de tu productora' },
    { id: 'terminos', titulo: 'Términos y condiciones' }
  ];
  if (dePago) pasos.push({ id: 'pago', titulo: 'Pago' });
  pasos.push({ id: 'creada', titulo: 'Productora creada' });
  return pasos;
}

/* CSS del overlay, scopeado a #crearProductora. Los controles (botones,
   inputs) son los componentes GLOBALES del monolito; acá solo el layout. */
const _CP_CSS = `
  #crearProductora{position:fixed;inset:0;z-index:99998;overflow-y:auto;background:var(--bg-page);color:var(--ink-primary);font-family:var(--font-sans),system-ui,sans-serif;}
  #crearProductora *{box-sizing:border-box;}
  #crearProductora .cp-top{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 28px;background:var(--bg-surface);border-bottom:1px solid var(--rule);}
  #crearProductora .cp-brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;}
  #crearProductora .cp-mark{width:30px;height:30px;border-radius:7px;background:var(--accent);color:var(--ink-onAccent);display:grid;place-items:center;font-weight:700;font-size:16px;}
  #crearProductora .cp-plan{font-size:12.5px;color:var(--ink-secondary);border:1px solid var(--rule);border-radius:999px;padding:6px 13px;background:var(--bg-card);}
  #crearProductora .cp-plan b{color:var(--ink-primary);font-weight:600;}
  #crearProductora .cp-wrap{max-width:560px;margin:0 auto;padding:34px 24px 70px;}
  #crearProductora .cp-stepper{display:flex;align-items:center;gap:6px;margin-bottom:24px;}
  #crearProductora .cp-step{display:flex;align-items:center;gap:8px;}
  #crearProductora .cp-num{width:26px;height:26px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:600;background:var(--bg-surface);border:1px solid var(--rule-strong);color:var(--ink-muted);}
  #crearProductora .cp-txt{font-size:12px;color:var(--ink-muted);white-space:nowrap;}
  #crearProductora .cp-step.active .cp-num{background:var(--accent);border-color:var(--accent);color:var(--ink-onAccent);}
  #crearProductora .cp-step.active .cp-txt{color:var(--ink-primary);font-weight:500;}
  #crearProductora .cp-step.done .cp-num{background:var(--accent-soft);border-color:var(--accent-soft);color:var(--ink-primary);}
  #crearProductora .cp-sep{flex:1;height:1px;min-width:10px;background:var(--rule);}
  #crearProductora .cp-card{background:var(--bg-card);border:1px solid var(--rule);border-radius:var(--radius-lg);padding:30px 28px;box-shadow:var(--shadow-sm);}
  #crearProductora .cp-h{margin:0 0 6px;font-size:20px;font-weight:600;}
  #crearProductora .cp-ph{margin:0 0 24px;font-size:13px;color:var(--ink-faint);line-height:1.6;}
  #crearProductora .cp-acts{display:flex;align-items:center;gap:12px;margin-top:26px;}
  #crearProductora .cp-sub{color:var(--ink-muted);font-size:13px;margin:0 0 22px;}
  #crearProductora .cp-field{margin-bottom:16px;}
  #crearProductora .cp-field label{display:block;font-size:12px;color:var(--ink-secondary);margin-bottom:6px;font-weight:500;}
  #crearProductora .cp-field .cp-opt{color:var(--ink-faint);font-weight:400;}
  #crearProductora .cp-field .cp-err{font-size:11px;color:var(--accent-deep);margin-top:5px;display:none;}
  #crearProductora .cp-field.cp-show-err .cp-err{display:block;}
  #crearProductora .cp-field.cp-show-err .input{border-color:var(--accent-deep);}
  #crearProductora .cp-ok{font-size:11px;color:var(--state-prep);margin-top:5px;display:none;}
  #crearProductora .cp-ok.on{display:block;}
  #crearProductora .cp-provisional{font-size:11px;color:var(--state-sale);background:var(--accent-bg);border:1px dashed var(--accent-soft);border-radius:var(--radius-sm);padding:8px 12px;margin-bottom:16px;}
  #crearProductora .cp-tyc{background:var(--bg-surface-soft);border:1px solid var(--rule);border-radius:var(--radius-md);padding:14px 18px;max-height:300px;overflow:auto;font-size:13px;color:var(--ink-secondary);}
  #crearProductora .cp-tyc h4{margin:0 0 4px;font-size:13px;color:var(--ink-primary);}
  #crearProductora .cp-tyc p{margin:0 0 14px;}
  #crearProductora .cp-tyc p:last-child{margin-bottom:0;}
  #crearProductora .cp-check{display:flex;align-items:flex-start;gap:11px;margin-top:22px;cursor:pointer;}
  #crearProductora .cp-check input{width:18px;height:18px;margin-top:1px;accent-color:var(--accent);cursor:pointer;flex:none;}
  #crearProductora .cp-check span{font-size:13px;color:var(--ink-secondary);}
  #crearProductora .cp-pay{background:var(--bg-surface-soft);border:1px solid var(--rule);border-radius:var(--radius-md);padding:4px 18px;margin-top:4px;}
  #crearProductora .cp-pay-line{display:flex;justify-content:space-between;gap:12px;padding:8px 0;font-size:13px;color:var(--ink-secondary);}
  #crearProductora .cp-pay-line.disc{color:var(--state-sale);}
  #crearProductora .cp-pay-line.total{border-top:1px solid var(--rule);margin-top:4px;padding-top:12px;font-size:16px;font-weight:600;color:var(--ink-primary);}
  #crearProductora .cp-exito{text-align:center;padding:10px 0 6px;}
  #crearProductora .cp-ring{width:72px;height:72px;border-radius:50%;margin:0 auto 18px;background:var(--accent-bg);border:2px solid var(--accent);display:grid;place-items:center;color:var(--accent-deep);font-size:32px;}
  #crearProductora .cp-rol{display:inline-flex;gap:8px;align-items:center;font-size:12px;background:var(--bg-surface-soft);border:1px solid var(--rule);border-radius:999px;padding:7px 14px;margin-top:10px;color:var(--ink-secondary);}
  @media (max-width:600px){#crearProductora .cp-top{padding:12px 16px;}#crearProductora .cp-wrap{padding:24px 16px 60px;}#crearProductora .cp-txt{display:none;}}
`;

/* Abre el overlay del flujo de creación. Se llama desde resolverEspacioYArrancar
   cuando la URL trae ?plan=. Reabrir reinicia el flujo (no duplica el overlay). */
export function abrirFlujoCrearProductora(planId) {
  _cpEstado = _cpEstadoInicial(planId);
  try { _bootCoverHide(); } catch (e) {}
  var prev = document.getElementById('crearProductora'); if (prev) prev.remove();
  var ov = document.createElement('div');
  ov.id = 'crearProductora';
  ov.innerHTML = '<style>' + _CP_CSS + '</style>'
    + '<div class="cp-top">'
    +   '<div class="cp-brand"><div class="cp-mark">T</div><span>Crear productora</span></div>'
    +   '<div id="cpPlanChip"></div>'
    + '</div>'
    + '<div class="cp-wrap">'
    +   '<div id="cpStepper" class="cp-stepper"></div>'
    +   '<div id="cpBody" class="cp-card"></div>'
    + '</div>';
  document.body.appendChild(ov);
  _cpRender();
}

/* Pinta el paso actual: chip del plan, stepper y cuerpo. El paso 'datos' ya
   tiene contenido real (A2); el resto son placeholders por ahora. */
function _cpRender() {
  if (!_cpEstado) return;
  var pasos = _cpPasos();
  var i = Math.max(0, Math.min(_cpEstado.paso, pasos.length - 1));
  _cpEstado.paso = i;
  var paso = pasos[i];

  var planNom = (_cpEstado.plan && _CP_PLANES[_cpEstado.plan]) ? _CP_PLANES[_cpEstado.plan].nombre : null;
  var chip = document.getElementById('cpPlanChip');
  if (chip) chip.innerHTML = planNom ? ('<span class="cp-plan">Plan <b>' + planNom + '</b></span>') : '';

  var stp = document.getElementById('cpStepper');
  if (stp) stp.innerHTML = pasos.map(function (p, idx) {
    var cls = idx < i ? 'done' : (idx === i ? 'active' : '');
    var marca = idx < i ? '✓' : (idx + 1);
    return '<div class="cp-step ' + cls + '"><span class="cp-num">' + marca + '</span><span class="cp-txt">' + p.titulo + '</span></div>';
  }).join('<span class="cp-sep"></span>');

  var body = document.getElementById('cpBody');
  if (!body) return;
  if (paso.id === 'datos') { body.innerHTML = _cpDatosHTML(); _cpWireDatos(); return; }
  if (paso.id === 'terminos') { body.innerHTML = _cpTerminosHTML(); return; }
  if (paso.id === 'pago') { body.innerHTML = _cpPagoHTML(); return; }
  if (paso.id === 'creada') { body.innerHTML = _cpCreadaHTML(); return; }

  // Fallback defensivo (no debería alcanzarse: todos los pasos tienen vista).
  var primero = (i === 0);
  var ultimo = (paso.id === 'creada');
  body.innerHTML =
      '<h3 class="cp-h">' + paso.titulo + '</h3>'
    + '<p class="cp-ph">Este paso aún no tiene contenido — se construye en un paso siguiente.</p>'
    + '<div class="cp-acts">'
    +   '<button class="btn" ' + accionHTML('cfg.fn', primero ? '_cpCerrar' : '_cpAtras') + '>' + (primero ? 'Cancelar' : '← Atrás') + '</button>'
    +   '<div style="flex:1"></div>'
    +   '<button class="btn btn-primary" ' + accionHTML('cfg.fn', ultimo ? '_cpCerrar' : '_cpSiguiente') + '>' + (ultimo ? 'Cerrar' : 'Siguiente →') + '</button>'
    + '</div>';
}

function _cpSiguiente() { if (!_cpEstado) return; _cpEstado.paso++; _cpRender(); try { var o = document.getElementById('crearProductora'); if (o) o.scrollTo(0, 0); } catch (e) {} }
function _cpAtras() { if (!_cpEstado) return; if (_cpEstado.paso > 0) _cpEstado.paso--; _cpRender(); }
/* Cierra el flujo y vuelve al Panel Personal (sin crear nada: el cableado real
   a la base recién ocurre en A7). */
function _cpCerrar() {
  var o = document.getElementById('crearProductora'); if (o) o.remove();
  _cpEstado = null;
  try { resolverEspacioYArrancar(); } catch (e) {}
}

/* ── A2 · Paso «Datos de tu productora» ────────────────────────────────────
   Recolecta el nombre visible (→ _cpEstado.organizacion.nombre, lo único que
   recibe provisionar_organizacion en A7) y, SOLO en planes de pago, los datos
   de empresa (→ _cpEstado.perfilEmpresa, que en A7 va aparte a un upsert sobre
   organization_profile). Rama Gratis: solo el nombre, sin facturación.
   Validación: solo UX. El servidor revalida y manda (doctrina 1/7). */

/* Formatea un RUT válido a 12.345.678-9. (En el monolito no hay formateador;
   la validación SÍ se reusa: _rutValido, módulo 11.) */
function _cpFormatearRut(s) {
  var x = String(s || '').toUpperCase().replace(/[^0-9K]/g, '');
  if (x.length < 2) return String(s || '');
  return x.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + x.slice(-1);
}
function _cpVal(id) { var el = document.getElementById(id); return el ? el.value : ''; }
function _cpMarcar(fieldId, ok) { var f = document.getElementById(fieldId); if (f) f.classList.toggle('cp-show-err', !ok); return ok; }
function _cpField(id, label, opt, ph, val, err) {
  return '<div class="cp-field" id="' + id + '_f">'
    + '<label for="' + id + '">' + label + (opt ? ' <span class="cp-opt">' + opt + '</span>' : '') + '</label>'
    + '<input class="input" id="' + id + '" placeholder="' + escapeHtml(ph) + '" value="' + escapeHtml(val || '') + '">'
    + '<div class="cp-err">' + err + '</div>'
    + '</div>';
}
function _cpDatosHTML() {
  var e = _cpEstado;
  var gratis = !(e.plan && e.plan !== 'gratis');   // 'gratis' o sin plan → solo el nombre
  var pe = e.perfilEmpresa, primero = (e.paso === 0);
  var html =
      '<h3 class="cp-h">Datos de tu productora</h3>'
    + (gratis
        ? '<p class="cp-sub">Ponle un nombre y empiezas. Los datos de facturación se piden cuando subas a un plan de pago.</p>'
        : '<p class="cp-sub">Estos son los datos de tu empresa, para facturación y documentos legales.</p>')
    + _cpField('cpNombre', 'Nombre de la productora', '(visible en el sistema)', 'Ej: Filmes del Sur', e.organizacion.nombre, 'Ingresa el nombre de tu productora.');
  if (!gratis) {
    html += _cpField('cpRazon', 'Razón social', '', 'Ej: Filmes del Sur SpA', pe.razonSocial, 'Ingresa la razón social.')
      + '<div class="cp-field" id="cpRut_f">'
      +   '<label for="cpRut">RUT de la empresa</label>'
      +   '<input class="input" id="cpRut" placeholder="76.123.456-7" value="' + escapeHtml(pe.rut || '') + '">'
      +   '<div class="cp-ok" id="cpRut_ok">✓ RUT válido</div>'
      +   '<div class="cp-err">RUT inválido. Revisa el número y el dígito verificador.</div>'
      + '</div>'
      + _cpField('cpGiro', 'Giro', '', 'Ej: Producción audiovisual', pe.giro, 'Ingresa el giro.')
      + _cpField('cpDir', 'Dirección', '', 'Calle, número, comuna, ciudad', pe.direccion, 'Ingresa la dirección.');
  }
  html += '<div class="cp-acts">'
    +   '<button class="btn" ' + accionHTML('cfg.fn', primero ? '_cpCerrar' : '_cpAtras') + '>' + (primero ? 'Cancelar' : '← Atrás') + '</button>'
    +   '<div style="flex:1"></div>'
    +   '<button class="btn btn-primary" data-accion="cfg.fn" data-args="[&quot;_cpGuardarDatos&quot;]">Continuar →</button>'
    + '</div>';
  return html;
}
function _cpWireDatos() {
  var nombre = document.getElementById('cpNombre');
  if (nombre) setTimeout(function () { try { nombre.focus(); } catch (e) {} }, 30);
  var rut = document.getElementById('cpRut');
  if (rut) {
    rut.addEventListener('input', function () {
      var v = this.value.toUpperCase().replace(/[^0-9K.\-]/g, ''); if (v !== this.value) this.value = v;
      _cpMarcarRut();
    });
    rut.addEventListener('blur', function () {
      var v = this.value.trim();
      if (v && _rutValido(v)) this.value = _cpFormatearRut(v);
      _cpMarcarRut();
    });
  }
}
/* Marca/limpia el estado visual del RUT (error vs ✓). Vacío = sin marca. */
function _cpMarcarRut() {
  var rut = document.getElementById('cpRut'); if (!rut) return false;
  var v = rut.value.trim(), valido = !!v && _rutValido(v);
  var f = document.getElementById('cpRut_f'); if (f) f.classList.toggle('cp-show-err', !!v && !valido);
  var ok = document.getElementById('cpRut_ok'); if (ok) ok.classList.toggle('on', valido);
  return valido;
}
/* Valida (solo UX) y, si pasa, guarda en el estado y avanza al siguiente paso. */
function _cpGuardarDatos() {
  var e = _cpEstado; if (!e) return;
  var gratis = !(e.plan && e.plan !== 'gratis');
  var nombre = _cpVal('cpNombre');
  var ok = _cpMarcar('cpNombre_f', nombre.trim().length > 0);
  if (!gratis) {
    var rut = _cpVal('cpRut'), rutOk = !!rut.trim() && _rutValido(rut);
    ok = _cpMarcar('cpRazon_f', _cpVal('cpRazon').trim().length > 0) && ok;
    ok = _cpMarcar('cpRut_f', rutOk) && ok;
    var okPill = document.getElementById('cpRut_ok'); if (okPill) okPill.classList.toggle('on', rutOk);
    ok = _cpMarcar('cpGiro_f', _cpVal('cpGiro').trim().length > 0) && ok;
    ok = _cpMarcar('cpDir_f', _cpVal('cpDir').trim().length > 0) && ok;
  }
  if (!ok) return;
  e.organizacion.nombre = nombre.trim();
  if (gratis) {
    e.perfilEmpresa = { razonSocial: '', rut: '', giro: '', direccion: '', nombreFicticio: '', web: '' };
  } else {
    e.perfilEmpresa.razonSocial = _cpVal('cpRazon').trim();
    e.perfilEmpresa.rut = _cpFormatearRut(_cpVal('cpRut').trim());
    e.perfilEmpresa.giro = _cpVal('cpGiro').trim();
    e.perfilEmpresa.direccion = _cpVal('cpDir').trim();
  }
  _cpSiguiente();
}

/* ── A3 · Paso «Términos y condiciones» ────────────────────────────────────
   Contrato de prestación de servicios entre la sociedad desarrolladora de
   TakeOS y la productora. TEXTO PROVISIONAL (v0): el área legal fija el
   definitivo cuando la sociedad esté constituida; aquí NO se redactan cláusulas
   reales. No se avanza sin marcar el checkbox. El registro/versionado del
   consentimiento es server-side y se verá en el cableado (A7), no acá. */
const _CP_TYC_TEXTO = [
  ['1. Objeto', 'La sociedad desarrolladora pone a disposición de la productora la plataforma TakeOS para la gestión de su producción audiovisual, según el plan contratado.'],
  ['2. Plan y pago', 'La productora contrata el plan seleccionado y autoriza su cobro según el ciclo elegido. Los precios se expresan en pesos chilenos más IVA.'],
  ['3. Datos y privacidad', 'El tratamiento de datos personales se rige por la normativa vigente, incluida la Ley 21.719. La productora es responsable de los datos que carga a la plataforma.'],
  ['4. Administración', 'Quien crea la productora queda como administrador. La productora no puede quedar sin al menos un administrador.'],
  ['5. Vigencia y término', 'El servicio se mantiene vigente mientras el plan esté activo. Cualquiera de las partes puede terminarlo según las condiciones del plan.']
];
function _cpTerminosHTML() {
  var e = _cpEstado;
  var dePago = !!(e.plan && e.plan !== 'gratis');
  var aceptado = !!e.aceptoTerminos;
  var cuerpo = _CP_TYC_TEXTO.map(function (s) { return '<h4>' + s[0] + '</h4><p>' + s[1] + '</p>'; }).join('');
  return ''
    + '<h3 class="cp-h">Términos y condiciones de servicio</h3>'
    + '<p class="cp-sub">Equivalen a un contrato de prestación de servicios entre la sociedad desarrolladora de TakeOS y tu productora.</p>'
    + '<div class="cp-provisional">Texto provisional, solo para demostrar el flujo. El definitivo lo define el área legal cuando la sociedad desarrolladora esté constituida.</div>'
    + '<div class="cp-tyc">' + cuerpo + '</div>'
    + '<label class="cp-check">'
    +   '<input type="checkbox" id="cpTycCk"' + (aceptado ? ' checked' : '') + ' data-accion="cfg.tyc" data-on="change">'
    +   '<span>He leído y acepto los términos y condiciones de servicio.</span>'
    + '</label>'
    + '<div class="cp-acts">'
    +   '<button class="btn" data-accion="cfg.fn" data-args="[&quot;_cpAtras&quot;]">← Atrás</button>'
    +   '<div style="flex:1"></div>'
    +   '<button class="btn btn-primary" id="cpBtnTyc"' + (aceptado ? '' : ' disabled') + ' data-accion="cfg.fn" data-args="[&quot;_cpAceptarTerminos&quot;]">'
    +     (dePago ? 'Continuar al pago' : 'Activar plan gratis')
    +   '</button>'
    + '</div>';
}
/* Sincroniza el checkbox con el estado y habilita/deshabilita el botón. */
function _cpToggleTyc(cb) {
  if (_cpEstado) _cpEstado.aceptoTerminos = !!cb.checked;
  var btn = document.getElementById('cpBtnTyc'); if (btn) btn.disabled = !cb.checked;
}
function _cpAceptarTerminos() {
  if (!_cpEstado || !_cpEstado.aceptoTerminos) return;
  var dePago = !!(_cpEstado.plan && _cpEstado.plan !== 'gratis');
  if (dePago) _cpSiguiente();        // planes de pago → pantalla de pago
  else _cpCrearProductora();          // Gratis → crea directo (sin pago)
}

/* ── A6 · Paso «Pago» (placeholder tras feature flag) ──────────────────────
   El sistema de pago NO existe aún (handoff §9): este paso vive tras un flag
   apagado y NO procesa nada ni pide datos de tarjeta. Muestra el resumen del
   plan con el IVA leído de la global `IVA` (tax_rates), NUNCA hardcodeado
   (doctrina 4). La organización nace 'free'; activar el plan de pago es aparte
   y se conecta cuando exista proveedor (no encender el flag antes). */
const _CP_PAGO_ACTIVO = false;   // feature flag: true solo cuando exista proveedor de pago
function _cpMontos(planId) {
  var p = _CP_PLANES[planId] || { precio: 0 };
  var lista = p.precio;
  var neto = Math.round(lista * (1 - _CP_EARLY_BIRD));
  var iva = Math.round(neto * IVA);   // IVA = global desde tax_rates (no hardcode)
  return { lista: lista, neto: neto, iva: iva, total: neto + iva };
}
function _cpPayLine(label, valor, cls) {
  return '<div class="cp-pay-line' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><span>' + valor + '</span></div>';
}
function _cpPagoHTML() {
  var e = _cpEstado;
  var planNom = (_CP_PLANES[e.plan] || {}).nombre || '';
  var m = _cpMontos(e.plan);
  var ivaPct = Math.round(IVA * 100);
  var banner = _CP_PAGO_ACTIVO
    ? 'Revisa el resumen y confirma para activar tu plan.'
    : 'El sistema de pago aún no está disponible. Por ahora creas tu productora y el cobro del plan se activa más adelante. No se procesa ningún pago ni se piden datos de tarjeta.';
  var btnLabel = _CP_PAGO_ACTIVO ? 'Pagar y crear productora' : 'Crear mi productora';
  /* Cuando _CP_PAGO_ACTIVO sea true (existe proveedor) acá va el formulario de
     pago real. Hoy NO se captura ningún dato de tarjeta (handoff §3/§4). */
  return ''
    + '<h3 class="cp-h">Pago</h3>'
    + '<p class="cp-sub">Plan ' + planNom + ' · cobro mensual.</p>'
    + '<div class="cp-provisional">' + banner + '</div>'
    + '<div class="cp-pay">'
    +   _cpPayLine('Plan ' + planNom + ' (mensual)', fmtMoney(m.lista), '')
    +   _cpPayLine('Descuento Early Bird (−50%)', '−' + fmtMoney(m.lista - m.neto), 'disc')
    +   _cpPayLine('Neto', fmtMoney(m.neto), '')
    +   _cpPayLine('IVA (' + ivaPct + '%)', fmtMoney(m.iva), '')
    +   _cpPayLine('Total a pagar al activar', fmtMoney(m.total), 'total')
    + '</div>'
    + '<div class="cp-acts">'
    +   '<button class="btn" data-accion="cfg.fn" data-args="[&quot;_cpAtras&quot;]">← Atrás</button>'
    +   '<div style="flex:1"></div>'
    +   '<button class="btn btn-primary" id="cpBtnPago" data-accion="cfg.fn" data-args="[&quot;_cpCrearProductora&quot;]">' + btnLabel + '</button>'
    + '</div>';
}

/* ── A7 · Crear la productora (cableado real a la base) ─────────────────────
   Llama al RPC provisionar_organizacion(nombre, slug) — confirmado contra la
   base: crea la org (plan 'free'), siembra los 8 perfiles + matriz, clona los
   catálogos del template, inserta organization_profile vacío y deja al creador
   como Administrador interno activo. Devuelve el uuid de la org. NO se llama
   seed_permisos_organizacion aparte (ya va adentro).
   Para planes de pago, después se completa organization_profile (columna jsonb
   `profile`) con un upsert; la RLS lo permite porque el creador tiene
   datos_empresa = 'E' en esa org (auth_nivel, server-side). La creación es
   server-side y atómica (doctrina 2); el cliente solo envía y refleja. */

/* Llama al RPC reintentando con sufijo si el slug ya existe (la RPC lanza
   'El slug "x" ya está en uso'). Cualquier otro error se propaga de inmediato. */
async function _cpProvisionar(nombre) {
  var base = ((typeof slugify === 'function' ? slugify(nombre) : '') || 'productora');
  var ultimo = null;
  for (var n = 0; n < 8; n++) {
    var slug = (n === 0) ? base : (base + '-' + (n + 1));
    var r = await sb.rpc('provisionar_organizacion', { p_nombre: nombre, p_slug: slug });
    if (!r.error) {
      var d = r.data;
      return (d && typeof d === 'object') ? (d.organization_id || d.id || d) : d;   // retorna uuid escalar
    }
    ultimo = r.error;
    var msg = String(r.error.message || '').toLowerCase();
    var colision = (msg.indexOf('ya está en uso') >= 0) || (msg.indexOf('slug') >= 0) || (r.error.code === '23505');
    if (!colision) throw r.error;   // error real (no es colisión de slug) → propagar
  }
  throw (ultimo || new Error('No se pudo generar un identificador único para la productora.'));
}
function _cpBtnAccion() { return document.getElementById('cpBtnPago') || document.getElementById('cpBtnTyc'); }
/* Crea la productora y, si hay datos de empresa (planes de pago), completa su
   perfil. Al terminar, muestra la pantalla «Productora creada». */
async function _cpCrearProductora() {
  var e = _cpEstado; if (!e || e._creando) return;
  var btn = _cpBtnAccion(); var lblPrev = btn ? btn.textContent : '';
  e._creando = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Creando tu productora…'; }
  try {
    if (typeof sb === 'undefined' || !sb) throw new Error('Sin conexión a la base.');
    var orgId = await _cpProvisionar(e.organizacion.nombre);
    e.orgCreadaId = orgId;
    /* Perfil de empresa: solo planes de pago traen estos datos. La org ya nació
       con organization_profile vacío; acá lo completamos (no bloquea si falla:
       la org ya existe). */
    var pe = e.perfilEmpresa || {};
    if (pe.razonSocial || pe.rut || pe.giro || pe.direccion) {
      try {
        var profile = {
          razonSocial: pe.razonSocial || '', rut: pe.rut || '', giro: pe.giro || '',
          direccion: pe.direccion || '', nombreFicticio: pe.nombreFicticio || '', web: pe.web || ''
        };
        var up = await sb.from('organization_profile').upsert({ organization_id: orgId, profile: profile, updated_at: new Date().toISOString() });
        if (up && up.error) console.warn('[crear] organization_profile', up.error);
      } catch (pErr) { console.warn('[crear] organization_profile', pErr); }
    }
    e._creando = false;
    _cpSiguiente();   // → pantalla «Productora creada»
  } catch (err) {
    e._creando = false;
    if (btn) { btn.disabled = false; btn.textContent = lblPrev; }
    var raw = (err && err.message) ? String(err.message) : '';
    /* V11.15.0 · Plan G: requisitos del titular para crear productora. Igual que al
       aceptar una invitación, abrimos el perfil en modo gate (asteriscos + campos
       obligatorios por contexto) y reintentamos la creación al guardar. El overlay
       de crear-productora queda DEBAJO (mismo z-index) con su estado intacto, así
       no se pierde el nombre ni el plan ya ingresados. */
    var mReq = raw.match(/TAKEOS_REQUISITOS:\s*([a-z,\s]+)/i);
    if (mReq) {
      var faltan = mReq[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      try { showToast({ kind: 'warning', title: 'Completa tu perfil para crear tu productora', body: 'Faltan algunos datos obligatorios.', duration: 8000 }); } catch (e2) {}
      abrirPerfilUsuario(true, function (guardado) { if (guardado) { _cpCrearProductora(); } }, faltan.indexOf('banca') >= 0, faltan, { intro: 'Para crear tu productora', volver: 'volverás a crear tu productora' });
      return;
    }
    if (/TAKEOS_MENOR_EDAD/i.test(raw)) {
      try { showToast({ kind: 'error', title: 'No puedes crear una productora', body: 'Para crear una productora debes ser mayor de 18 años.', duration: 9000 }); } catch (e2) {}
      return;   // sin reintento: la edad mínima es un bloqueo, no un dato por completar
    }
    var msg = raw ? raw.replace(/^[a-z_]+:\s*/i, '') : 'No se pudo crear la productora.';
    try { showToast({ kind: 'error', title: 'No se pudo crear la productora', body: msg, duration: 9000 }); } catch (e2) {}
  }
}
/* Pantalla final: productora creada. */
function _cpCreadaHTML() {
  var e = _cpEstado;
  var nom = (e && e.organizacion && e.organizacion.nombre) || 'Tu productora';
  return ''
    + '<div class="cp-exito">'
    +   '<div class="cp-ring">✓</div>'
    +   '<h3 class="cp-h" style="margin-bottom:8px;">Tu productora está lista</h3>'
    +   '<p class="cp-sub" style="margin:0 0 4px;"><b>' + escapeHtml(nom) + '</b> ya está creada.</p>'
    +   '<div class="cp-rol">👑 Eres Administrador interno de ' + escapeHtml(nom) + '</div>'
    + '</div>'
    + '<div class="cp-acts">'
    +   '<div style="flex:1"></div>'
    +   '<button class="btn btn-primary" data-accion="cfg.fn" data-args="[&quot;_cpEntrarProductora&quot;]">Entrar a mi productora →</button>'
    + '</div>';
}
/* Cierra el flujo y entra al Control Room de la productora recién creada (mismo
   mecanismo que «entrar» desde el Panel Personal). El tour inicial va en A8. */
function _cpEntrarProductora() {
  var e = _cpEstado; var orgId = e && e.orgCreadaId;
  var ov = document.getElementById('crearProductora'); if (ov) ov.remove();
  _cpEstado = null;
  try { if (orgId && typeof _setOrgActiva === 'function') _setOrgActiva(orgId); } catch (x) {}
  try { setTieneEmpresa(true); } catch (x) {}
  try { _cpTourPendiente = true; } catch (x) {}   // A8: dispara el tour inicial al cargar el Control Room
  try { if (typeof _bootCoverShow === 'function') _bootCoverShow('Entrando a tu productora…'); } catch (x) {}
  try { if (typeof arrancarTakeOS === 'function') arrancarTakeOS(); } catch (x) {}
}

/* ── A8 · Tour inicial sobre el Control Room real ───────────────────────────
   Tras crear la productora y entrar (_cpEntrarProductora), un recorrido breve
   resalta las piezas clave del Control Room REAL. Se dispara UNA vez, justo
   después de crear: _cpEntrarProductora enciende _cpTourPendiente y la cadena de
   arrancarTakeOS la consume al terminar de cargar. Robusto: si un elemento no
   está, salta ese paso; si no hay ninguno, no muestra nada. */
var _cpTourPendiente = false;
var _cpTourPaso = 0;
var _CP_TOUR = [
  { sel: '#controlRoomView', top: true,                                  titulo: 'Este es tu Control Room',   texto: 'Todo esto es tu Control Room: desde acá ves y manejas los proyectos de tu productora. Está casi vacío porque recién la creaste.' },
  { sel: '#controlRoomView .cr-actions .btn-primary', center: true, titulo: 'Crea tu primer proyecto', texto: 'Con «Nuevo proyecto» partes una producción: presupuesto, plan de rodaje, legal y más, todo dentro del proyecto.' },
  { sel: '#controlRoomView .cr-metrics', top: true,                      titulo: 'El pulso de tu productora', texto: 'Acá ves de un vistazo cuántos proyectos están activos, cuáles cerraste y qué requiere tu atención.' },
  { sel: '#kanbanContainer', samples: true, cardTop: true,             titulo: 'Tus proyectos, por estado', texto: 'Acá viven tus proyectos: cada uno aparece en la columna de su etapa y avanza a medida que progresa. Estos son de ejemplo.' },
  { sel: '#notifBtn', center: true,                                        titulo: 'Tus notificaciones', texto: 'Acá el sistema te avisa lo que necesita tu atención: cuando te asignan una tarea, te mencionan o aparece una señal de un proyecto.' },
  { sel: '.topbar-config-btn', center: true,                               titulo: 'Tu cuenta y tu productora', texto: 'Desde acá configuras tu productora —equipo, marca y datos— y tu cuenta personal.' }
];
var _CP_TOUR_CSS = ''
  + '@property --cpang{syntax:"<angle>";inherits:false;initial-value:0deg;}'
  + '.cp-tour-backdrop{position:fixed;inset:0;background:rgba(10,10,9,.62);z-index:100000;}'
  + '.cp-tour-target{position:relative;z-index:100001;border-radius:10px;box-shadow:0 0 0 2px var(--accent-deep),0 0 20px rgba(208,90,77,.45);}'
  + '.cp-tour-target::after{content:"";position:absolute;inset:-3px;border-radius:13px;padding:2px;background:conic-gradient(from var(--cpang),rgba(208,90,77,0) 0deg,rgba(208,90,77,0) 250deg,var(--accent-deep) 305deg,#ffd9d0 333deg,var(--accent-deep) 360deg);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;animation:cpBorderLight 5s linear infinite;pointer-events:none;}'
  + '@keyframes cpBorderLight{to{--cpang:360deg;}}'
  + '#cpTourStage{position:fixed;left:50%;top:42%;transform:translate(-50%,-50%) scale(1.5);z-index:100002;pointer-events:none;background:var(--bg-elevated);border-radius:12px;padding:18px 24px;box-shadow:var(--shadow-lg);}'
  + '.cp-tour-card{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);width:min(440px,calc(100vw - 36px));z-index:100003;background:var(--bg-elevated);border:1px solid var(--rule-strong);border-radius:var(--radius-md);box-shadow:var(--shadow-lg);padding:22px 24px;font-family:var(--font-sans),system-ui,sans-serif;color:var(--ink-primary);}'
  + '.cp-tour-card.cp-card-top{bottom:auto;top:24px;}'
  + '.cp-tour-card .cp-tstep{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent-deep);font-weight:700;margin-bottom:7px;}'
  + '.cp-tour-card h4{margin:0 0 6px;font-size:16px;font-weight:600;}'
  + '.cp-tour-card p{margin:0 0 16px;font-size:13px;color:var(--ink-secondary);line-height:1.55;}'
  + '.cp-tour-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;}'
  + '.cp-tdots{display:flex;gap:6px;}'
  + '.cp-tdot{width:7px;height:7px;border-radius:50%;background:var(--rule-strong);display:inline-block;}'
  + '.cp-tdot.on{background:var(--accent);}'
  + '.cp-tour-btns{display:flex;gap:8px;}'
  + '@media (prefers-reduced-motion:reduce){.cp-tour-target::after{animation:none;}}';
export function _cpTourInicialQuizas() {
  if (!_cpTourPendiente) return;
  _cpTourPendiente = false;
  setTimeout(function () { try { _cpTourIniciar(); } catch (e) {} }, 450);   // deja pintar el Control Room
}
function _cpTourEnsureCss() {
  if (document.getElementById('cpTourStyle')) return;
  var st = document.createElement('style'); st.id = 'cpTourStyle'; st.textContent = _CP_TOUR_CSS;
  document.head.appendChild(st);
}
function _cpTourIniciar() {
  var cr = document.getElementById('controlRoomView');
  if (!cr || cr.classList.contains('hidden')) return;   // solo en el home del Control Room
  if (!_cpTourPasoUltimo()) return;                      // no hay ningún elemento que resaltar
  _cpTourEnsureCss();
  _cpTourPaso = 1;
  _cpTourRender();
}
function _cpTourPasoValido(i) { for (var k = i; k <= _CP_TOUR.length; k++) { if (document.querySelector(_CP_TOUR[k - 1].sel)) return k; } return 0; }
function _cpTourPasoUltimo() { for (var k = _CP_TOUR.length; k >= 1; k--) { if (document.querySelector(_CP_TOUR[k - 1].sel)) return k; } return 0; }
/* Mueve el elemento REAL a un escenario central (sobre el fondo), agrandado y con
   el borde de luz. Guarda su lugar original para devolverlo al salir. Así el
   propio botón —no un clon— se ve grande y al centro, sin importar si su barra
   queda atrapada en un contexto de apilamiento. */
var _cpTourMoved = null;
function _cpTourCentrar(el) {
  if (!el) return;
  var stage = document.getElementById('cpTourStage');
  if (!stage) { stage = document.createElement('div'); stage.id = 'cpTourStage'; stage.className = 'cp-tour-target'; document.body.appendChild(stage); }
  _cpTourMoved = { el: el, parent: el.parentNode, next: el.nextSibling };
  stage.appendChild(el);
}
function _cpTourRestaurarMovido() {
  if (_cpTourMoved) {
    var m = _cpTourMoved; _cpTourMoved = null;
    try { if (m.next && m.next.parentNode === m.parent) m.parent.insertBefore(m.el, m.next); else if (m.parent) m.parent.appendChild(m.el); } catch (e) {}
  }
  var stage = document.getElementById('cpTourStage'); if (stage) stage.remove();
}
function _cpTourLimpiar() {
  var ov = document.getElementById('cpTour'); if (ov) ov.remove();
  _cpTourRestaurarMovido();
  var t = document.querySelector('.cp-tour-target'); if (t) t.classList.remove('cp-tour-target');
  _cpTourSamplesOff();
}
function _cpTourRender() {
  _cpTourLimpiar();
  var paso = _cpTourPasoValido(_cpTourPaso);
  if (!paso) { _cpTourCerrar(); return; }
  _cpTourPaso = paso;
  var def = _CP_TOUR[paso - 1];
  if (def.samples) _cpTourSamplesOn();          // proyectos de muestra (mundo LOTR) en el kanban
  var el = document.querySelector(def.sel);
  var ultimo = (paso === _cpTourPasoUltimo());
  var dots = _CP_TOUR.map(function (_, idx) { return '<i class="cp-tdot' + (idx === paso - 1 ? ' on' : '') + '"></i>'; }).join('');
  var ov = document.createElement('div'); ov.id = 'cpTour';
  ov.innerHTML = '<div class="cp-tour-backdrop"></div>'    // el fondo NO cierra el tour (solo Saltar / Listo)
    + '<div class="cp-tour-card' + (def.cardTop ? ' cp-card-top' : '') + '">'
    +   '<div class="cp-tstep">Paso ' + paso + ' de ' + _CP_TOUR.length + '</div>'
    +   '<h4>' + def.titulo + '</h4><p>' + def.texto + '</p>'
    +   '<div class="cp-tour-foot"><div class="cp-tdots">' + dots + '</div>'
    +     '<div class="cp-tour-btns">'
    +       '<button class="btn btn-ghost btn-sm" data-accion="cfg.fn" data-args="[&quot;_cpTourCerrar&quot;]">Saltar</button>'
    +       (paso > 1 ? '<button class="btn btn-sm" data-accion="cfg.fn" data-args="[&quot;_cpTourPrev&quot;]">Anterior</button>' : '')
    +       '<button class="btn btn-primary btn-sm" ' + accionHTML('cfg.fn', ultimo ? '_cpTourCerrar' : '_cpTourNext') + '>' + (ultimo ? 'Listo' : 'Siguiente') + '</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';
  document.body.appendChild(ov);
  if (def.center && el) _cpTourCentrar(el);       // botones chicos: el real se mueve al centro, agrandado
  else if (el) el.classList.add('cp-tour-target'); // secciones grandes: se resaltan en su lugar
  if (def.center || def.top) { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (x) { try { window.scrollTo(0, 0); } catch (y) {} } }
  else if (el) { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) {} }
}
function _cpTourNext() { _cpTourPaso = _cpTourPaso + 1; _cpTourRender(); }
function _cpTourPrev() { if (_cpTourPaso > 1) _cpTourPaso = _cpTourPaso - 1; _cpTourRender(); }
function _cpTourCerrar() { _cpTourLimpiar(); _cpTourPaso = 0; }

/* Proyectos de muestra (mundo de El Señor de los Anillos) para que el kanban no
   se vea vacío durante el tour. Guarda el contenido real del kanban y lo
   restaura al salir; NO toca PROJECTS ni la base — es solo visual. */
var _cpKanbanBackup = null;
function _cpTourSamplesOn() {
  var k = document.getElementById('kanbanContainer'); if (!k) return;
  if (_cpKanbanBackup === null) _cpKanbanBackup = k.innerHTML;
  try { k.innerHTML = _cpTourKanbanSample(); } catch (e) {}
}
function _cpTourSamplesOff() {
  if (_cpKanbanBackup === null) return;
  var k = document.getElementById('kanbanContainer'); if (k) k.innerHTML = _cpKanbanBackup;
  _cpKanbanBackup = null;
}
function _cpTourKanbanSample() {
  var SAMP = {
    venta:          [{ client: 'New Line Cinema', name: 'El Hobbit — Spot',        pe: 'A. Muñoz',   dlabel: 'Fecha',  dval: 'Cotización enviada', monto: '$6.400.000' }],
    preproduccion:  [{ client: 'WingNut Films',   name: 'Las Dos Torres',          pe: 'P. Jackson', dlabel: 'Fecha',  dval: '12 jornadas',        monto: '$28.000.000' }],
    produccion:     [{ client: 'WingNut Films',   name: 'La Comunidad del Anillo', pe: 'P. Jackson', dlabel: 'Estado', dval: 'En rodaje',          monto: '$38.000.000' }],
    postproduccion: [{ client: 'WETA Workshop',   name: 'El Retorno del Rey',      pe: 'F. Walsh',   dlabel: 'Estado', dval: 'Montaje',            monto: '$24.000.000' }]
  };
  function card(p) {
    return '<div class="project-card">'
      + '<div class="project-card-header"><div>'
      +   '<div class="project-client">' + p.client + '</div>'
      +   '<div class="project-name">' + p.name + '</div>'
      + '</div></div>'
      + '<div class="project-meta">'
      +   '<div class="project-meta-row"><span class="project-meta-label">PE</span><span class="project-meta-value">' + p.pe + '</span></div>'
      +   '<div class="project-meta-row"><span class="project-meta-label">' + p.dlabel + '</span><span class="project-meta-value">' + p.dval + '</span></div>'
      +   '<div class="project-meta-row"><span class="project-meta-label">Monto</span><span class="project-amount">' + p.monto + '</span></div>'
      + '</div></div>';
  }
  return Object.keys(STATES).sort(function (a, b) { return STATES[a].order - STATES[b].order; }).map(function (key) {
    var st = STATES[key], list = SAMP[key] || [];
    return '<div class="column"><div class="column-header"><div class="column-title">'
      + '<div class="column-dot" style="background:' + st.color + '"></div><span class="column-name">' + st.name + '</span></div>'
      + '<span class="column-count">' + list.length + '</span></div>'
      + '<div class="column-body">' + (list.length ? list.map(card).join('') : '<div class="empty-column">Sin proyectos</div>') + '</div></div>';
  }).join('');
}

/* ════════════════════════════════════════════════════════════════════
   FRENTE B · B1 · CENTRO DE PRIVACIDAD Y DATOS (hub + ruteo)
   ─────────────────────────────────────────────────────────────────────
   Estos derechos son de IDENTIDAD GLOBAL por usuario (Ley 21.719), por eso
   viven en el Panel Personal, no dentro de una productora. B1 arma el hub con
   las 5 tarjetas y el ruteo a cada flujo; el contenido de cada flujo llega en
   B2…B6 (algunos son UI-contra-contrato del BD Expert; eliminar y edad tienen
   decisiones de Agustín). En B1 cada flujo es un placeholder. */
var _pdVista = 'hub';
var _pdExportEstado = 'idle';   // B2: idle | descargada
var _pdConsents = [];           // B3: consentimientos cargados de data_consents
var _pdRevocarId = null;
var _pdElimSole = [];           // B4: productoras donde el usuario es ÚNICO admin
var _pdElimFecha = null;        // Plan G (1.3): fecha real de ejecución que devuelve el servidor
var _pdEdadVerif = false;       // B5: edad declarada en esta sesión (condicional, no gate)
var _pdCookies = { decidido: false, analitica: false, marketing: false };   // B6 (esenciales siempre on)
var _pdCkGuardado = false;       // B6: muestra "Preferencias guardadas"
/* V11.15.0 · Plan G §2 · versión vigente de la política de cookies (vive en el
   cliente: no hay fuente server-side). "Ya decidió" = existe una fila en
   cookie_consents con ESTA versión. Al subir la política, se bumpea esta
   constante y el banner vuelve a aparecer para re-consentir. */
var COOKIES_VERSION = 'v1.0';
var _pdCookiesBootHecho = false;   // el chequeo de primera visita corre una vez por sesión
var _PD_CSS = `
  #privacidadDatos{position:fixed;inset:0;z-index:99998;overflow-y:auto;background:var(--bg-page);color:var(--ink-primary);font-family:var(--font-sans),system-ui,sans-serif;}
  #privacidadDatos *{box-sizing:border-box;}
  #privacidadDatos .pd-top{position:sticky;top:0;display:flex;align-items:center;gap:14px;padding:13px 24px;background:var(--bg-surface);border-bottom:1px solid var(--rule);}
  #privacidadDatos .pd-back{background:transparent;border:1px solid var(--rule);border-radius:var(--radius-sm);padding:7px 13px;font-size:12px;color:var(--ink-secondary);cursor:pointer;font-family:inherit;}
  #privacidadDatos .pd-back:hover{background:var(--bg-card);}
  #privacidadDatos .pd-brand{font-weight:700;font-size:15px;}
  #privacidadDatos .pd-wrap{max-width:760px;margin:0 auto;padding:30px 24px 80px;}
  #privacidadDatos .pd-acct{display:flex;align-items:center;gap:12px;margin-bottom:24px;}
  #privacidadDatos .pd-av{width:40px;height:40px;border-radius:50%;background:var(--accent-soft);color:var(--ink-primary);display:grid;place-items:center;font-size:15px;font-weight:600;text-transform:uppercase;}
  #privacidadDatos .pd-acct .who b{font-size:15px;font-weight:600;display:block;}
  #privacidadDatos .pd-acct .who span{font-size:12px;color:var(--ink-muted);}
  #privacidadDatos .pd-title{margin:0 0 4px;font-size:24px;font-weight:700;letter-spacing:-.01em;}
  #privacidadDatos .pd-sub{color:var(--ink-muted);font-size:14px;margin:0 0 20px;}
  #privacidadDatos .pd-legal{font-size:12px;color:var(--state-sale);background:var(--accent-bg);border:1px dashed var(--accent-soft);border-radius:var(--radius-sm);padding:10px 13px;margin-bottom:24px;}
  #privacidadDatos .pd-rights{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
  #privacidadDatos .pd-card{background:var(--bg-card);border:1px solid var(--rule);border-radius:var(--radius-md);padding:22px;cursor:pointer;transition:border-color .12s,transform .12s;display:flex;flex-direction:column;gap:10px;text-align:left;width:100%;font-family:inherit;color:inherit;}
  #privacidadDatos .pd-card:hover{border-color:var(--rule-strong);transform:translateY(-2px);}
  #privacidadDatos .pd-ico{font-size:22px;}
  #privacidadDatos .pd-rt{font-size:15px;font-weight:600;}
  #privacidadDatos .pd-rd{font-size:12px;color:var(--ink-muted);flex:1;}
  #privacidadDatos .pd-tag{align-self:flex-start;font-size:9px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-secondary);border:1px solid var(--rule-strong);border-radius:999px;padding:3px 9px;}
  #privacidadDatos .pd-tag.warn{color:var(--state-sale);border-color:#5a4a2a;}
  #privacidadDatos .pd-tag.danger{color:var(--accent-deep);border-color:var(--accent-soft);}
  #privacidadDatos .pd-card.full{grid-column:1/-1;}
  #privacidadDatos .pd-flow{background:var(--bg-card);border:1px solid var(--rule);border-radius:var(--radius-lg);padding:30px 28px;}
  #privacidadDatos .pd-flow h3{margin:0 0 6px;font-size:20px;font-weight:600;}
  #privacidadDatos .pd-flow .pd-ph{font-size:13px;color:var(--ink-faint);line-height:1.6;}
  #privacidadDatos .pd-flow .pd-sub{color:var(--ink-muted);font-size:13px;margin:0 0 14px;}
  #privacidadDatos .pd-eyebrow2{font-size:12px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;}
  #privacidadDatos .pd-list{display:flex;flex-direction:column;gap:9px;margin:0 0 14px;padding:0;list-style:none;}
  #privacidadDatos .pd-list li{font-size:13px;color:var(--ink-secondary);display:flex;gap:9px;align-items:flex-start;}
  #privacidadDatos .pd-list li::before{content:"\\203A";color:var(--accent-deep);font-weight:700;}
  #privacidadDatos .pd-acts{display:flex;gap:12px;margin-top:20px;flex-wrap:wrap;}
  #privacidadDatos .pd-consent{display:flex;align-items:center;gap:14px;padding:14px 16px;border:1px solid var(--rule);border-radius:var(--radius-md);background:var(--bg-surface-soft);margin-bottom:11px;}
  #privacidadDatos .pd-consent.rev{opacity:.7;}
  #privacidadDatos .pd-c-ico{width:38px;height:38px;border-radius:var(--radius-sm);background:var(--bg-elevated);display:grid;place-items:center;font-size:16px;flex:none;}
  #privacidadDatos .pd-c-meta{flex:1;min-width:0;}
  #privacidadDatos .pd-c-meta b{font-size:14px;font-weight:600;display:block;}
  #privacidadDatos .pd-c-meta span{font-size:12px;color:var(--ink-muted);}
  #privacidadDatos .pd-badge{font-size:10px;letter-spacing:.04em;text-transform:uppercase;padding:3px 9px;border-radius:999px;border:1px solid var(--rule-strong);color:var(--ink-muted);}
  #privacidadDatos .pd-badge.rev{color:var(--accent-deep);border-color:var(--accent-soft);}
  #privacidadDatos .pd-empty{font-size:13px;color:var(--ink-faint);padding:16px;border:1px dashed var(--rule-strong);border-radius:var(--radius-md);text-align:center;}
  #privacidadDatos .pd-danger{border:1px solid var(--accent-soft);border-radius:var(--radius-md);background:var(--accent-bg);padding:20px 22px;}
  #privacidadDatos .pd-check{display:flex;align-items:flex-start;gap:11px;margin:16px 0 0;cursor:pointer;font-size:13px;color:var(--ink-secondary);}
  #privacidadDatos .pd-check input{width:18px;height:18px;margin-top:1px;accent-color:var(--accent);cursor:pointer;flex:none;}
  #privacidadDatos .pd-field{margin-bottom:6px;}
  #privacidadDatos .pd-flabel{display:block;font-size:12px;color:var(--ink-secondary);margin-bottom:6px;font-weight:500;}
  #privacidadDatos .pd-ferr{font-size:11px;color:var(--accent-deep);margin-top:5px;display:none;}
  #privacidadDatos .pd-exito-mini{width:56px;height:56px;border-radius:50%;margin:0 0 14px;background:var(--accent-bg);border:2px solid var(--accent);display:grid;place-items:center;color:var(--accent-deep);font-size:26px;}
  #privacidadDatos .pd-sw-row{display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-bottom:1px solid var(--rule-soft);}
  #privacidadDatos .pd-sw-info{flex:1;}
  #privacidadDatos .pd-sw-info b{font-size:13px;font-weight:600;display:block;}
  #privacidadDatos .pd-sw-info span{font-size:12px;color:var(--ink-muted);}
  #privacidadDatos .pd-switch{position:relative;width:42px;height:24px;flex:none;cursor:pointer;}
  #privacidadDatos .pd-switch input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;}
  #privacidadDatos .pd-switch .track{position:absolute;inset:0;background:var(--bg-elevated);border:1px solid var(--rule-strong);border-radius:999px;transition:all .15s;}
  #privacidadDatos .pd-switch .knob{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--ink-muted);transition:all .15s;}
  #privacidadDatos .pd-switch input:checked + .track{background:var(--accent);border-color:var(--accent);}
  #privacidadDatos .pd-switch input:checked ~ .knob{left:21px;background:var(--ink-onAccent);}
  #privacidadDatos .pd-switch.locked .track{background:var(--accent-soft);border-color:var(--accent-soft);}
  #privacidadDatos .pd-switch.locked .knob{left:21px;background:var(--ink-primary);}
  #privacidadDatos .pd-ok{font-size:11px;color:var(--state-prep);margin-top:12px;display:none;}
  #privacidadDatos .pd-ok.on{display:block;}
  @media (max-width:640px){#privacidadDatos .pd-rights{grid-template-columns:1fr;}#privacidadDatos .pd-wrap{padding:24px 16px 60px;}}
`;
/* Lee el nombre/correo de la cuenta desde el Panel Personal ya renderizado. */
function _pdUserInfo() {
  var info = { nombre: 'Tu cuenta', email: '', iniciales: 'U' };
  try {
    var b = document.querySelector('#espacioUsuario .esp-acct .who b'); if (b && b.textContent) info.nombre = b.textContent;
    var s = document.querySelector('#espacioUsuario .esp-acct .who span'); if (s) info.email = s.textContent;
    var av = document.querySelector('#espacioUsuario .esp-av'); if (av && av.textContent) info.iniciales = av.textContent;
  } catch (e) {}
  return info;
}
export function abrirPrivacidadDatos() {
  _pdVista = 'hub';
  _pdExportEstado = 'idle';
  var prev = document.getElementById('privacidadDatos'); if (prev) prev.remove();
  var ov = document.createElement('div'); ov.id = 'privacidadDatos';
  ov.innerHTML = '<style>' + _PD_CSS + '</style>'
    + '<div class="pd-top"><button class="pd-back" data-accion="cfg.fn" data-args="[&quot;_pdCerrar&quot;]">← Volver</button><span class="pd-brand">TakeOS · Privacidad y datos</span></div>'
    + '<div class="pd-wrap" id="pdWrap"></div>';
  document.body.appendChild(ov);
  _pdRender();
}
/* Hub (5 tarjetas) o el placeholder del flujo elegido (B2…B6 llegan después). */
function _pdRender() {
  var w = document.getElementById('pdWrap'); if (!w) return;
  if (_pdVista === 'hub') { w.innerHTML = _pdHubHTML(); return; }
  if (_pdVista === 'export') { w.innerHTML = _pdExportHTML(); return; }
  if (_pdVista === 'consentimientos') { w.innerHTML = _pdConsentShell(); _pdConsentCargar(); return; }
  if (_pdVista === 'revocar') { w.innerHTML = _pdRevocarHTML(); return; }
  if (_pdVista === 'revocado') { w.innerHTML = _pdRevocadoHTML(); return; }
  if (_pdVista === 'eliminar') { w.innerHTML = _pdElimShell(); _pdElimCargar(); return; }
  if (_pdVista === 'eliminada') { w.innerHTML = _pdElimProgramadaHTML(); return; }
  if (_pdVista === 'edad') { w.innerHTML = _pdEdadHTML(); return; }
  if (_pdVista === 'cookies') { w.innerHTML = _pdCookiesHTML(); return; }
  var flows = {
    export:         ['Descargar mis datos', 'B2'],
    consentimientos:['Productoras con acceso a tus datos', 'B3'],
    edad:           ['Verificación de edad', 'B5'],
    cookies:        ['Cookies y analítica', 'B6'],
    eliminar:       ['Eliminar mi cuenta', 'B4']
  };
  var f = flows[_pdVista] || ['', ''];
  w.innerHTML = '<button class="pd-back" data-accion="cfg.fn" data-args="[&quot;_pdIr&quot;,&quot;hub&quot;]" style="margin-bottom:18px;">← Privacidad y datos</button>'
    + '<div class="pd-flow"><h3>' + f[0] + '</h3><p class="pd-ph">Esta sección se construye próximamente (' + f[1] + ').</p></div>';
}
function _pdHubHTML() {
  var u = _pdUserInfo();
  function card(extra, ico, titulo, desc, tag, tagcls, vista) {
    return '<button class="pd-card' + extra + '" ' + accionHTML('cfg.fn', '_pdIr', vista) + '>'
      + '<div class="pd-ico">' + ico + '</div>'
      + '<div class="pd-rt">' + titulo + '</div>'
      + '<div class="pd-rd">' + desc + '</div>'
      + '<span class="pd-tag' + tagcls + '">' + tag + '</span></button>';
  }
  return ''
    + '<div class="pd-acct"><div class="pd-av">' + escapeHtml(u.iniciales) + '</div><div class="who"><b>' + escapeHtml(u.nombre) + '</b><span>' + escapeHtml(u.email) + '</span></div></div>'
    + '<h1 class="pd-title">Privacidad y datos</h1>'
    + '<p class="pd-sub">Tus derechos sobre tus datos personales, según la Ley 21.719 de protección de datos.</p>'
    + '<div class="pd-legal">Los textos legales de esta sección son provisionales y solo demuestran el flujo. El área legal define la versión definitiva antes de salir en vivo.</div>'
    + '<div class="pd-rights">'
    +   card('', '⬇️', 'Descargar mis datos', 'Pide una copia de todos tus datos personales en un formato portable.', 'Acceso · Portabilidad', '', 'export')
    +   card('', '🏢', 'Productoras con acceso a tus datos', 'Revisa quién tiene tus datos y revoca tu consentimiento cuando quieras.', 'Revocación', '', 'consentimientos')
    +   card('', '🪪', 'Verificación de edad', 'Declara tu mayoría de edad, por si algún flujo lo requiere.', 'Si aplica', ' warn', 'edad')
    +   card('', '🍪', 'Cookies y analítica', 'Decide qué datos de navegación permites recolectar.', 'Consentimiento', '', 'cookies')
    +   card(' full', '🗑️', 'Eliminar mi cuenta', 'Elimina tu cuenta de TakeOS y suprime tus datos personales. Esta acción es irreversible.', 'Supresión', ' danger', 'eliminar')
    + '</div>';
}
function _pdIr(v) { _pdVista = v; _pdRender(); var o = document.getElementById('privacidadDatos'); if (o && o.scrollTo) { try { o.scrollTo(0, 0); } catch (e) {} } }
/* Cierra el centro de privacidad y vuelve al Panel Personal (queda debajo). */
function _pdCerrar() { var o = document.getElementById('privacidadDatos'); if (o) o.remove(); }

/* ── B2 · Descargar mis datos (export / portabilidad) ───────────────────────
   Derecho de acceso + portabilidad (Ley 21.719). La generación del archivo es
   SERVER-SIDE (no se arma en el cliente): el backend reúne los datos del titular,
   entrega un archivo firmado (JSON/CSV) y registra la solicitud en audit_log.
   El endpoint aún NO existe → handoff al BD Expert. Acá queda la UI y el punto
   de integración marcado (_pdExportSolicitar). */
function _pdExportHTML() {
  if (_pdExportEstado === 'descargada') {
    return '<button class="pd-back" data-accion="cfg.fn" data-args="[&quot;_pdIr&quot;,&quot;hub&quot;]" style="margin-bottom:18px;">← Privacidad y datos</button>'
      + '<div class="pd-flow">'
      +   '<h3>Tu copia se descargó</h3>'
      +   '<p class="pd-sub">Generamos tu archivo en el servidor y se descargó en tu dispositivo, en formato JSON. Revísalo en tu carpeta de descargas.</p>'
      +   '<p style="font-size:12px;color:var(--ink-muted);">El archivo trae una huella de integridad (md5) para verificar que no fue alterado. Cada solicitud queda registrada en el historial.</p>'
      +   '<div class="pd-acts"><button class="btn" data-accion="cfg.fn" data-args="[&quot;_pdExportReset&quot;]">Solicitar otra copia</button></div>'
      + '</div>';
  }
  return '<button class="pd-back" data-accion="cfg.fn" data-args="[&quot;_pdIr&quot;,&quot;hub&quot;]" style="margin-bottom:18px;">← Privacidad y datos</button>'
    + '<div class="pd-flow">'
    +   '<h3>Descargar mis datos</h3>'
    +   '<p class="pd-sub">Pide una copia completa de tus datos personales. Es tu derecho de acceso y portabilidad.</p>'
    +   '<div class="pd-eyebrow2">Tu copia incluye</div>'
    +   '<ul class="pd-list">'
    +     '<li>Tu perfil personal y datos de contacto</li>'
    +     '<li>Tus datos bancarios registrados</li>'
    +     '<li>Las productoras donde participas y tu rol en cada una</li>'
    +     '<li>Los consentimientos que has otorgado, con su fecha</li>'
    +     '<li>Un resumen de tu actividad en el sistema</li>'
    +   '</ul>'
    +   '<p style="font-size:12px;color:var(--ink-muted);">Se entrega en un formato legible y portable (JSON y CSV).</p>'
    +   '<div class="pd-acts"><button class="btn btn-primary" id="pdExportBtn" data-accion="cfg.fn" data-args="[&quot;_pdExportSolicitar&quot;]">Solicitar mi copia</button></div>'
    + '</div>';
}
async function _pdExportSolicitar() {
  /* Plan G (1.1): el archivo lo genera el SERVIDOR (RPC exportar_mis_datos) y la
     solicitud queda en audit_log; el cliente solo recibe el jsonb y lo ofrece
     como descarga. NO se arma el export en el cliente (doctrina server-side). */
  var btn = document.getElementById('pdExportBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Preparando…'; }
  try {
    var r = await sb.rpc('exportar_mis_datos');
    if (r.error) throw r.error;
    var nombre = 'takeos-mis-datos-' + (new Date().toISOString().slice(0, 10)) + '.json';
    var blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 2000);
    _pdExportEstado = 'descargada';
    _pdRender();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Solicitar mi copia'; }
    try { showToast({ kind: 'error', title: 'No se pudo generar tu copia', body: ((e && e.message) || 'Reintenta.'), duration: 8000 }); } catch (x) {}
  }
}
function _pdExportReset() { _pdExportEstado = 'idle'; _pdRender(); }

/* ── B3 · Productoras con acceso a tus datos + revocar consentimiento ───────
   Lista los consentimientos del titular desde data_consents (RLS: el usuario lee
   los suyos). Revocar es SERVER-SIDE y el RPC aún NO existe (espeja
   consentir_invitacion) → handoff BD Expert. ADR-020: data_consents es
   append-only; revocar marca revoked_at, NO borra. La UI dice la consecuencia. */
function _pdFecha(ts) { if (!ts) return '—'; try { return new Date(ts).toLocaleDateString('es-CL'); } catch (e) { return '—'; } }
function _pdConsentShell() {
  return '<button class="pd-back" data-accion="cfg.fn" data-args="[&quot;_pdIr&quot;,&quot;hub&quot;]" style="margin-bottom:18px;">← Privacidad y datos</button>'
    + '<div class="pd-flow">'
    +   '<h3>Productoras con acceso a tus datos</h3>'
    +   '<p class="pd-sub">Estas productoras tienen una copia de tus datos porque diste tu consentimiento al incorporarte. Puedes revocarlo cuando quieras.</p>'
    +   '<div id="pdConsentList"><div class="pd-ph">Cargando…</div></div>'
    + '</div>';
}
async function _pdConsentCargar() {
  var box = document.getElementById('pdConsentList'); if (!box) return;
  var vacio = '<div class="pd-empty">No hay productoras con tus datos.</div>';
  try {
    if (typeof sb === 'undefined' || !sb) { box.innerHTML = vacio; return; }
    var ures = await sb.auth.getUser();
    var uid = (ures && ures.data && ures.data.user) ? ures.data.user.id : null;
    if (!uid) { box.innerHTML = vacio; return; }
    /* Sin embed de organizations: data_consents tiene FK a organizations Y a
       memberships (que también apunta a organizations), así que el embed de
       PostgREST es ambiguo y falla. Traemos los nombres aparte. */
    var r = await sb.from('data_consents').select('id, organization_id, accepted_at, revoked_at').eq('user_id', uid).order('accepted_at', { ascending: false });
    if (r.error) throw r.error;
    var consents = r.data || [];
    box = document.getElementById('pdConsentList'); if (!box) return;
    if (!consents.length) { box.innerHTML = vacio; return; }
    var nombres = {};
    try {
      var ids = consents.map(function (c) { return c.organization_id; });
      var ro = await sb.from('organizations').select('id, nombre').in('id', ids);
      if (!ro.error && ro.data) ro.data.forEach(function (o) { nombres[o.id] = o.nombre; });
    } catch (e) {}
    _pdConsents = consents.map(function (c) { return { id: c.id, accepted_at: c.accepted_at, revoked_at: c.revoked_at, nombre: nombres[c.organization_id] || 'Una productora' }; });
    box = document.getElementById('pdConsentList'); if (!box) return;
    box.innerHTML = _pdConsents.map(_pdConsentRow).join('');
  } catch (e) { console.warn('[privacidad] consentimientos no cargados', e); try { var b2 = document.getElementById('pdConsentList'); if (b2) b2.innerHTML = '<div class="pd-empty">No pudimos cargar esto ahora. Vuelve a entrar en un momento.</div>'; } catch (x) {} }
}
function _pdConsentRow(c) {
  var nom = c.nombre || 'Una productora';
  if (c.revoked_at) {
    return '<div class="pd-consent rev"><div class="pd-c-ico">🏢</div>'
      + '<div class="pd-c-meta"><b>' + escapeHtml(nom) + '</b><span>Consentimiento revocado el ' + _pdFecha(c.revoked_at) + '</span></div>'
      + '<span class="pd-badge rev">Revocado</span></div>';
  }
  return '<div class="pd-consent"><div class="pd-c-ico">🏢</div>'
    + '<div class="pd-c-meta"><b>' + escapeHtml(nom) + '</b><span>Tiene una copia de tus datos · desde el ' + _pdFecha(c.accepted_at) + '</span></div>'
    + '<button class="btn" ' + accionHTML('cfg.fn', '_pdRevocarConfirm', c.id) + '>Revocar</button></div>';
}
function _pdRevocarConfirm(id) { _pdRevocarId = id; _pdIr('revocar'); }
function _pdRevocarHTML() {
  var c = _pdConsents.filter(function (x) { return x.id === _pdRevocarId; })[0];
  var nom = (c && c.nombre) || 'esta productora';
  return '<button class="pd-back" data-accion="cfg.fn" data-args="[&quot;_pdIr&quot;,&quot;consentimientos&quot;]" style="margin-bottom:18px;">← Volver</button>'
    + '<div class="pd-flow">'
    +   '<h3>Revocar consentimiento en ' + escapeHtml(nom) + '</h3>'
    +   '<p class="pd-sub">Antes de continuar, ten en cuenta lo que pasa:</p>'
    +   '<ul class="pd-list">'
    +     '<li>' + escapeHtml(nom) + ' dejará de tener acceso a tus datos.</li>'
    +     '<li>Si participas en un proyecto activo con ellos, perderás ese acceso.</li>'
    +     '<li>Queda registrado como revocado, con la fecha. La copia que ya tienen se conserva de forma datada como evidencia legal hasta que la productora la suprima.</li>'
    +   '</ul>'
    +   '<div class="pd-acts"><button class="btn" data-accion="cfg.fn" data-args="[&quot;_pdIr&quot;,&quot;consentimientos&quot;]">Cancelar</button><button class="btn btn-danger" data-accion="cfg.fn" data-args="[&quot;_pdRevocarConfirmar&quot;]">Revocar consentimiento</button></div>'
    + '</div>';
}
async function _pdRevocarConfirmar() {
  /* Plan G (1.2): revocar_consentimiento marca revoked_at (append-only, no
     borra), inactiva la membresía y corta el acceso; queda en audit_log.
     Si el usuario es ÚNICO admin de esa productora, la base lo bloquea
     (TAKEOS_UNICO_ADMIN) y lo mandamos a transferir administración primero. */
  if (!_pdRevocarId) { _pdIr('consentimientos'); return; }
  try {
    var r = await sb.rpc('revocar_consentimiento', { p_consent_id: _pdRevocarId });
    if (r.error) throw r.error;
    _pdIr('revocado');
  } catch (e) {
    var msg = (e && e.message) ? String(e.message) : '';
    if (msg.indexOf('TAKEOS_UNICO_ADMIN') >= 0) {
      try { showToast({ kind: 'warning', title: 'Eres el único administrador', body: 'No puedes revocar mientras seas la única persona con rol Administrador de esa productora. Primero transfiere la administración a otro miembro interno (en esa productora: Configuración → Perfil de la empresa → Equipo).', duration: 10000 }); } catch (x) {}
      return;
    }
    try { showToast({ kind: 'error', title: 'No se pudo revocar', body: msg.replace(/^[a-z_]+:\s*/i, '') || 'Reintenta.', duration: 8000 }); } catch (x) {}
  }
}
function _pdRevocadoHTML() {
  return '<button class="pd-back" data-accion="cfg.fn" data-args="[&quot;_pdIr&quot;,&quot;consentimientos&quot;]" style="margin-bottom:18px;">← Privacidad y datos</button>'
    + '<div class="pd-flow">'
    +   '<h3>Consentimiento revocado</h3>'
    +   '<p class="pd-sub">Esa productora dejó de tener acceso a tus datos y tu membresía con ella quedó inactiva.</p>'
    +   '<div class="pd-legal">Tu registro de consentimiento se conserva datado como evidencia (Ley 21.719); no se borra. La copia que la productora ya tenía la suprime según sus propios plazos.</div>'
    +   '<div class="pd-acts"><button class="btn" data-accion="cfg.fn" data-args="[&quot;_pdIr&quot;,&quot;consentimientos&quot;]">Volver</button></div>'
    + '</div>';
}

/* ── B4 · Eliminar mi cuenta (anonimizar + gracia 30 días) ───────────────────
   Decisión de Agustín: al eliminar se ANONIMIZA (no hard delete) y hay período
   de gracia recuperable de 30 días. El borrado real es SERVER-SIDE (RPC pendiente
   → BD Expert): anonimiza los datos personales, conserva consentimientos/auditoría
   datados, programa la eliminación a 30 días y permite cancelar. Invariante: una
   productora nunca queda sin administrador → guard de único admin (UX; el servidor
   reimpone la regla). */
function _pdElimShell() {
  return '<button class="pd-back" data-accion="cfg.fn" data-args="[&quot;_pdIr&quot;,&quot;hub&quot;]" style="margin-bottom:18px;">← Privacidad y datos</button>'
    + '<div id="pdElimBody"><div class="pd-flow"><p class="pd-ph">Revisando tu cuenta…</p></div></div>';
}
async function _pdElimCargar() {
  /* Plan G (1.5): pre-chequeo server-side de "único admin" antes de ofrecer el
     borrado. mis_organizaciones_como_unico_admin() devuelve las productoras
     donde el usuario es el único Administrador; si hay, mostramos el bloqueador
     con la lista en vez de dejar que el borrado choque con el error. */
  try {
    _pdElimSole = [];
    if (typeof sb !== 'undefined' && sb) {
      var r = await sb.rpc('mis_organizaciones_como_unico_admin');
      if (!r.error && Array.isArray(r.data)) {
        _pdElimSole = r.data.map(function (o) { return { id: o.organization_id, nombre: o.nombre }; });
      }
    }
  } catch (e) { _pdElimSole = []; }   // best-effort: ante error no bloqueamos (el servidor reimpone)
  var box = document.getElementById('pdElimBody'); if (!box) return;
  box.innerHTML = _pdElimSole.length ? _pdElimBlockerHTML() : _pdElimFormHTML();
  if (!_pdElimSole.length) _pdElimEval();
}
function _pdElimBlockerHTML() {
  var lista = _pdElimSole.map(function (o) { return '<li>' + escapeHtml(o.nombre) + '</li>'; }).join('');
  return '<div class="pd-flow">'
    + '<h3>Antes de eliminar tu cuenta</h3>'
    + '<div class="pd-legal">Eres el único administrador de ' + (_pdElimSole.length === 1 ? 'una productora' : 'estas productoras') + '. Una productora no puede quedar sin administrador: primero transfiere la administración a otra persona (desde el Panel de Empresa de la productora) o elimina la productora.</div>'
    + '<ul class="pd-list">' + lista + '</ul>'
    + '<div class="pd-acts"><button class="btn" data-accion="cfg.fn" data-args="[&quot;_pdIr&quot;,&quot;hub&quot;]">Entendido</button></div>'
    + '</div>';
}
function _pdElimFormHTML() {
  return '<div class="pd-flow">'
    + '<h3>Eliminar mi cuenta</h3>'
    + '<p class="pd-sub">Esta acción es irreversible una vez que pasa el período de recuperación. Léela con calma.</p>'
    + '<div class="pd-danger">'
    +   '<div class="pd-eyebrow2">Qué pasa cuando eliminas tu cuenta</div>'
    +   '<ul class="pd-list">'
    +     '<li>Se anonimizan tus datos personales: perfil, contacto y datos bancarios dejan de ser identificables.</li>'
    +     '<li>Pierdes acceso a todas las productoras y proyectos donde participas.</li>'
    +     '<li>Por la Ley 21.719, los registros de consentimiento y auditoría se conservan datados y anonimizados como evidencia. No contienen tus datos en texto plano.</li>'
    +     '<li>Tu cuenta queda programada para eliminación y puedes recuperarla durante 30 días.</li>'
    +   '</ul>'
    +   '<label class="pd-check"><input type="checkbox" id="pdElimChk" data-accion="cfg.fn" data-args="[&quot;_pdElimEval&quot;]" data-on="change"> <span>Entiendo que esta acción es irreversible una vez pasados los 30 días.</span></label>'
    +   '<div style="margin-top:14px;"><label style="display:block;font-size:12px;color:var(--ink-secondary);margin-bottom:6px;">Para confirmar, escribe <b>ELIMINAR</b></label>'
    +     '<input class="input" id="pdElimTxt" placeholder="ELIMINAR" data-accion="cfg.fn" data-args="[&quot;_pdElimEval&quot;]" data-on="input"></div>'
    + '</div>'
    + '<div class="pd-acts"><button class="btn" data-accion="cfg.fn" data-args="[&quot;_pdIr&quot;,&quot;hub&quot;]">Cancelar</button><button class="btn btn-danger" id="pdElimBtn" disabled data-accion="cfg.fn" data-args="[&quot;_pdElimConfirmar&quot;]">Eliminar mi cuenta</button></div>'
    + '</div>';
}
function _pdElimEval() {
  var chk = document.getElementById('pdElimChk'), txt = document.getElementById('pdElimTxt'), btn = document.getElementById('pdElimBtn');
  if (!btn) return;
  btn.disabled = !((chk && chk.checked) && (txt && txt.value.trim().toUpperCase() === 'ELIMINAR'));
}
async function _pdElimConfirmar() {
  /* Plan G (1.3): solicitar_eliminacion_cuenta programa la anonimización a 30
     días (automática); la cuenta sigue activa durante la gracia. El servidor
     devuelve la fecha real de ejecución. */
  try {
    var r = await sb.rpc('solicitar_eliminacion_cuenta');
    if (r.error) throw r.error;
    _pdElimFecha = (r.data && r.data.ejecuta_despues_de) ? r.data.ejecuta_despues_de : null;
    _pdIr('eliminada');
  } catch (e) {
    var msg = (e && e.message) ? String(e.message) : '';
    if (msg.indexOf('TAKEOS_UNICO_ADMIN') >= 0) {
      /* eres único admin de una o más productoras: la base manda la lista en json */
      try {
        var js = msg.slice(msg.indexOf('TAKEOS_UNICO_ADMIN') + 'TAKEOS_UNICO_ADMIN'.length).replace(/^:/, '');
        var arr = JSON.parse(js);
        _pdElimSole = (arr || []).map(function (o) { return { id: o.organization_id, nombre: o.nombre }; });
      } catch (x) { _pdElimSole = []; }
      var box = document.getElementById('pdElimBody');
      if (box && _pdElimSole.length) { box.innerHTML = _pdElimBlockerHTML(); return; }
      try { showToast({ kind: 'warning', title: 'Eres el único administrador', body: 'Primero transfiere la administración de tus productoras a otra persona.', duration: 9000 }); } catch (z) {}
      return;
    }
    try { showToast({ kind: 'error', title: 'No se pudo programar la eliminación', body: msg.replace(/^[a-z_]+:\s*/i, '') || 'Reintenta.', duration: 8000 }); } catch (x) {}
  }
}
function _pdElimFechaGracia() {
  try { return new Date(Date.now() + 30 * 86400000).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }); } catch (e) { return 'en 30 días'; }
}
function _pdElimFechaFmt(iso) {
  try { return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }); } catch (e) { return null; }
}
function _pdElimProgramadaHTML() {
  var fecha = (_pdElimFecha && _pdElimFechaFmt(_pdElimFecha)) || _pdElimFechaGracia();
  return '<button class="pd-back" data-accion="cfg.fn" data-args="[&quot;_pdIr&quot;,&quot;hub&quot;]" style="margin-bottom:18px;">← Privacidad y datos</button>'
    + '<div class="pd-flow">'
    +   '<h3>Tu cuenta quedó programada para eliminación</h3>'
    +   '<p class="pd-sub">Se eliminará el ' + fecha + '. Hasta esa fecha tu cuenta sigue funcionando y puedes cancelar para recuperarla.</p>'
    +   '<div class="pd-legal">Al vencer el plazo, tus datos personales se anonimizan (no es un borrado físico): los registros de consentimiento y auditoría se conservan datados y anonimizados como evidencia (Ley 21.719).</div>'
    +   '<div class="pd-acts"><button class="btn" data-accion="cfg.fn" data-args="[&quot;_pdElimCancelar&quot;]">Cancelar eliminación</button></div>'
    + '</div>';
}
async function _pdElimCancelar() {
  /* Plan G (1.4): cancelar_eliminacion_cuenta solo opera dentro de los 30 días. */
  try {
    var r = await sb.rpc('cancelar_eliminacion_cuenta');
    if (r.error) throw r.error;
    try { showToast({ kind: 'success', title: 'Eliminación cancelada', body: 'Tu cuenta sigue activa. Cancelaste la eliminación programada.' }); } catch (x) {}
    _pdIr('hub');
  } catch (e) {
    try { showToast({ kind: 'error', title: 'No se pudo cancelar', body: ((e && e.message) || '').replace(/^[a-z_]+:\s*/i, '') || 'Reintenta.', duration: 8000 }); } catch (x) {}
  }
}
/* ── B6 · Cookies y analítica ────────────────────────────────────────────────
   Panel de preferencias (esenciales fijas; analítica y marketing opcionales) +
   banner de aviso. El consentimiento se registra VERSIONADO en el servidor
   (no en localStorage) → SEAM BD Expert. Esenciales siempre activas. */
function _pdCookiesHTML() {
  var back = '<button class="pd-back" data-accion="cfg.fn" data-args="[&quot;_pdIr&quot;,&quot;hub&quot;]" style="margin-bottom:18px;">← Privacidad y datos</button>';
  var c = _pdCookies;
  function sw(id, on, locked) {
    var oc = locked ? '' : ' ' + accionHTML('cfg.fn', '_pdCkTouch', { on: 'change' });
    return '<label class="pd-switch' + (locked ? ' locked' : '') + '"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + (locked ? ' disabled' : '') + oc + '><span class="track"></span><span class="knob"></span></label>';
  }
  return back + '<div class="pd-flow">'
    + '<h3>Cookies y analítica</h3>'
    + '<p class="pd-sub">Decide qué datos de navegación permites. Puedes cambiarlo cuando quieras.</p>'
    + '<div class="pd-sw-row"><div class="pd-sw-info"><b>Esenciales</b><span>Necesarias para que el sitio funcione. Siempre activas.</span></div>' + sw('pdCkEsen', true, true) + '</div>'
    + '<div class="pd-sw-row"><div class="pd-sw-info"><b>Analítica</b><span>Nos ayuda a entender cómo se usa el sistema para mejorarlo.</span></div>' + sw('pdCkAna', c.analitica, false) + '</div>'
    + '<div class="pd-sw-row" style="border-bottom:none;"><div class="pd-sw-info"><b>Marketing</b><span>Para mostrarte comunicaciones relevantes sobre el producto.</span></div>' + sw('pdCkMkt', c.marketing, false) + '</div>'
    + '<div class="pd-legal" style="margin-top:16px;">Tu preferencia se registra versionada en el servidor (no en el navegador), con la fecha. Si la política de cookies cambia, te volveremos a preguntar.</div>'
    + '<div class="pd-acts"><button class="btn" data-accion="cfg.fn" data-args="[&quot;_pdCookiesGuardar&quot;,&quot;rechazar&quot;]">Rechazar opcionales</button><button class="btn" data-accion="cfg.fn" data-args="[&quot;_pdCookiesGuardar&quot;,&quot;aceptar&quot;]">Aceptar todas</button><button class="btn btn-primary" data-accion="cfg.fn" data-args="[&quot;_pdCookiesGuardar&quot;,&quot;guardar&quot;]">Guardar preferencias</button></div>'
    + '<div class="pd-ok' + (_pdCkGuardado ? ' on' : '') + '" id="pdCkOk">✓ Preferencias guardadas</div>'
    + '<div style="margin-top:14px;"><button class="btn" data-accion="cfg.fn" data-args="[&quot;_pdCookieBannerShow&quot;]">Ver el aviso de cookies</button></div>'
    + '</div>';
}
function _pdCookiesGuardar(modo) {
  var c = _pdCookies;
  if (modo === 'aceptar') { c.analitica = true; c.marketing = true; }
  else if (modo === 'rechazar') { c.analitica = false; c.marketing = false; }
  else {
    var a = document.getElementById('pdCkAna'), m = document.getElementById('pdCkMkt');
    c.analitica = a ? a.checked : c.analitica;
    c.marketing = m ? m.checked : c.marketing;
  }
  c.decidido = true;
  /* Plan G §2.1: registrar el consentimiento VERSIONADO en el servidor (append-only). */
  _pdCookiesPersistir(c.analitica, c.marketing);
  var b = document.getElementById('pdCookieBanner'); if (b) b.remove();
  _pdCkGuardado = true;
  try { showToast({ kind: 'success', title: 'Preferencias guardadas', body: 'Puedes cambiarlas cuando quieras.' }); } catch (e) {}
  _pdRender();
}
/* Oculta el "Preferencias guardadas" cuando el usuario vuelve a tocar un switch. */
function _pdCkTouch() { _pdCkGuardado = false; var o = document.getElementById('pdCkOk'); if (o) o.classList.remove('on'); }
/* Banner de aviso (primera visita). La condición de "primera visita" es
   server-side (consentimiento versionado, pendiente); por ahora se muestra a
   pedido y se oculta tras decidir en la sesión. */
function _pdCookieBannerShow() {
  if (document.getElementById('pdCookieBanner')) return;
  var b = document.createElement('div'); b.id = 'pdCookieBanner';
  b.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);width:min(680px,calc(100vw - 28px));z-index:100050;background:var(--bg-elevated);border:1px solid var(--rule-strong);border-radius:10px;box-shadow:var(--shadow-lg);padding:16px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-family:var(--font-sans),system-ui,sans-serif;color:var(--ink-primary);';
  b.innerHTML = '<div style="flex:1;min-width:220px;font-size:13px;color:var(--ink-secondary);"><b style="color:var(--ink-primary);">Usamos cookies.</b> Las esenciales hacen funcionar el sitio. Las de analítica y marketing son opcionales y dependen de tu consentimiento.</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
    +   '<button class="btn" data-accion="cfg.fn" data-args="[&quot;_pdCookieBannerDecidir&quot;,&quot;solo&quot;]">Solo esenciales</button>'
    +   '<button class="btn" data-accion="cfg.fn" data-args="[&quot;_pdCookieBannerConfig&quot;]">Configurar</button>'
    +   '<button class="btn btn-primary" data-accion="cfg.fn" data-args="[&quot;_pdCookieBannerDecidir&quot;,&quot;todas&quot;]">Aceptar todas</button>'
    + '</div>';
  document.body.appendChild(b);
}
function _pdCookieBannerDecidir(modo) {
  _pdCookies.analitica = (modo === 'todas');
  _pdCookies.marketing = (modo === 'todas');
  _pdCookies.decidido = true;
  /* Plan G §2.1: registrar consentimiento versionado server-side. */
  _pdCookiesPersistir(_pdCookies.analitica, _pdCookies.marketing);
  var b = document.getElementById('pdCookieBanner'); if (b) b.remove();
  try { showToast({ kind: 'success', title: modo === 'todas' ? 'Cookies aceptadas' : 'Solo cookies esenciales', body: '' }); } catch (e) {}
  if (document.getElementById('privacidadDatos') && _pdVista === 'cookies') _pdRender();
}
function _pdCookieBannerConfig() {
  var b = document.getElementById('pdCookieBanner'); if (b) b.remove();
  if (!document.getElementById('privacidadDatos')) abrirPrivacidadDatos();
  _pdIr('cookies');
}
/* V11.15.0 · Plan G §2 · persistencia y derivación de "ya decidió" (server-side).
   guardar_consentimiento_cookies(p_analitica, p_marketing, p_version) es append-only:
   cada decisión es una fila nueva (historial versionado). Optimista: la UI ya
   actualizó; si la red falla, el banner reaparecerá la próxima vez. */
async function _pdCookiesPersistir(analitica, marketing) {
  try {
    if (typeof sb === 'undefined' || !sb) return;
    var r = await sb.rpc('guardar_consentimiento_cookies', { p_analitica: !!analitica, p_marketing: !!marketing, p_version: COOKIES_VERSION });
    if (r.error) throw r.error;
  } catch (e) { console.warn('[cookies] no se pudo guardar la preferencia', e); }
}
/* Lee la última decisión del usuario desde cookie_consents (RLS: solo las suyas).
   "Ya decidió" = la fila más reciente tiene la versión vigente. */
async function _pdCookiesCargar() {
  try {
    if (typeof sb === 'undefined' || !sb) return false;
    var ures = await sb.auth.getUser();
    var uid = (ures && ures.data && ures.data.user) ? ures.data.user.id : null;
    if (!uid) return false;
    var r = await sb.from('cookie_consents').select('analitica, marketing, version, accepted_at').eq('user_id', uid).order('accepted_at', { ascending: false }).limit(1);
    if (r.error) throw r.error;
    var row = (r.data && r.data[0]) ? r.data[0] : null;
    if (row) {
      _pdCookies.analitica = !!row.analitica;
      _pdCookies.marketing = !!row.marketing;
      _pdCookies.decidido = (row.version === COOKIES_VERSION);
    } else {
      _pdCookies.decidido = false;
    }
    return true;   // estado determinado de verdad (con fila o confirmando que no hay)
  } catch (e) { console.warn('[cookies] no se pudo leer la preferencia', e); return false; }
}
/* Primera visita: tras iniciar sesión y aterrizar en una "casa" (Panel Personal o
   Control Room), si el usuario aún no decidió con la versión vigente, muestra el
   banner. Corre una sola vez por sesión y no se encima sobre flujos de pantalla
   completa (onboarding, invitación, crear productora, login). */
export async function _pdCookiesBootCheck() {
  if (_pdCookiesBootHecho) return;
  try {
    if (document.getElementById('perfilUsuario') || document.getElementById('invitacionRecibida') || document.getElementById('crearProductora') || document.getElementById('cloudGate') || document.getElementById('espOnb')) return;
    var leido = await _pdCookiesCargar();
    if (!leido) return;   // no se pudo determinar el estado: reintenta en otra carga, sin marcar hecho
    _pdCookiesBootHecho = true;
    if (!_pdCookies.decidido) _pdCookieBannerShow();
  } catch (e) { /* silencioso: el banner reaparecerá en otra carga */ }
}

/* ── B5 · Verificación de edad (CONDICIONAL · "si aplica") ───────────────────
   Decisión pendiente (Agustín/legal): si aplica al titular y en qué momento. Por
   eso es UI OPCIONAL, NO un gate: declarar la edad no bloquea usar el software.
   Si se decide que aplica, acá se persiste/convierte en gate (SEAM). */
function _pdEdadHTML() {
  var back = '<button class="pd-back" data-accion="cfg.fn" data-args="[&quot;_pdIr&quot;,&quot;hub&quot;]" style="margin-bottom:18px;">← Privacidad y datos</button>';
  if (_pdEdadVerif) {
    return back + '<div class="pd-flow"><div class="pd-exito-mini">✓</div><h3>Edad verificada</h3><p class="pd-sub">Confirmaste que eres mayor de 18 años.</p><div class="pd-acts"><button class="btn" data-accion="cfg.fn" data-args="[&quot;_pdIr&quot;,&quot;hub&quot;]">Volver</button></div></div>';
  }
  return back + '<div class="pd-flow">'
    + '<h3>Verificación de edad</h3>'
    + '<div class="pd-legal"><b>Si aplica.</b> Los titulares de cuenta de TakeOS son profesionales adultos, así que este paso podría no aplicar o reducirse a una declaración. Es una decisión de producto y legal, todavía abierta — por ahora es opcional y no bloquea nada.</div>'
    + '<div class="pd-field"><label class="pd-flabel" for="pdEdadFecha">Fecha de nacimiento</label><input class="input" type="date" id="pdEdadFecha"><div class="pd-ferr" id="pdEdadErr">Ingresa tu fecha de nacimiento; debes ser mayor de 18 años.</div></div>'
    + '<label class="pd-check"><input type="checkbox" id="pdEdadChk"> <span>Declaro que soy mayor de 18 años.</span></label>'
    + '<div class="pd-acts"><button class="btn" data-accion="cfg.fn" data-args="[&quot;_pdIr&quot;,&quot;hub&quot;]">Cancelar</button><button class="btn btn-primary" data-accion="cfg.fn" data-args="[&quot;_pdEdadConfirmar&quot;]">Confirmar</button></div>'
    + '</div>';
}
function _pdEdadConfirmar() {
  var fecha = document.getElementById('pdEdadFecha'), chk = document.getElementById('pdEdadChk'), err = document.getElementById('pdEdadErr');
  var v = fecha ? fecha.value : '';
  var mayor = !!v && _pdEsMayorDe(v, 18);
  if (err) err.style.display = mayor ? 'none' : 'block';
  if (!mayor) return;
  if (!(chk && chk.checked)) { try { showToast({ kind: 'warning', title: 'Falta la declaración', body: 'Marca la casilla para confirmar.' }); } catch (e) {} return; }
  /* SEAM · decisión + BD Expert: si se decide que aplica, acá se persiste la
     verificación (server-side) y/o se convierte en gate. Por ahora, in-session. */
  _pdEdadVerif = true;
  _pdRender();
}
function _pdEsMayorDe(fechaISO, n) {
  try {
    var f = new Date(fechaISO); if (isNaN(f.getTime())) return false;
    var h = new Date(); var e = h.getFullYear() - f.getFullYear();
    var m = h.getMonth() - f.getMonth();
    if (m < 0 || (m === 0 && h.getDate() < f.getDate())) e--;
    return e >= n;
  } catch (x) { return false; }
}

// ── Window bridges Configuración ───────────────────────────────────
// Lista generada cruzando definiciones con consumidores (index, módulos,
// handlers inline en HTML generado). Incluye helpers internos por seguridad.

window._cpCerrar = _cpCerrar;
window._cpSiguiente = _cpSiguiente;

window._cpTourNext = _cpTourNext;

window._orgLogos = _orgLogos;

// D2 · acciones delegadas — cfg.fn despacha por nombre a un mapa LOCAL.
var _CFG_FN = {
  closeConfigPanel: function () { closeConfigPanel(); }, irAlPanelPersonal: function () { irAlPanelPersonal(); },
  openEmpresaPerfil: function () { openEmpresaPerfil(); }, toggleTheme: function () { toggleTheme(); },
  toggleAdminMode: function () { gancho('toggleAdminMode')(); }, exportSupabaseBackup: function () { gancho('exportSupabaseBackup')(); },
  openSnapshotsModal: function () { gancho('openSnapshotsModal')(); },
  _empShowSub: _empShowSub, _empDatosConClave: _empDatosConClave, _empAbrirTransferir: _empAbrirTransferir,
  _empAbrirInvitar: _empAbrirInvitar, _empColorAgregar: _empColorAgregar, _empTipoAgregar: _empTipoAgregar,
  _invEnviarDatos: _invEnviarDatos, _empEnviarInvitacion: _empEnviarInvitacion, _empConfirmarTransferir: _empConfirmarTransferir,
  _empCambiarTipo: _empCambiarTipo, _empEcharMiembro: _empEcharMiembro, _empCopiarInv: _empCopiarInv,
  _empCancelarInvitacion: _empCancelarInvitacion, _empLogoDescargar: _empLogoDescargar, _empLogoPrincipal: _empLogoPrincipal,
  _empLogoQuitar: _empLogoQuitar, _empColorCopiar: _empColorCopiar, _empColorQuitar: _empColorQuitar,
  _empTipoQuitar: _empTipoQuitar, saveEmpresaPerfil: saveEmpresaPerfil,
  _empServicioAgregar: _empServicioAgregar,
  _cpCerrar: _cpCerrar, _cpAtras: _cpAtras, _cpSiguiente: _cpSiguiente, _cpGuardarDatos: _cpGuardarDatos,
  _cpAceptarTerminos: _cpAceptarTerminos, _cpCrearProductora: _cpCrearProductora, _cpEntrarProductora: _cpEntrarProductora,
  _cpTourCerrar: _cpTourCerrar, _cpTourPrev: _cpTourPrev, _cpTourNext: _cpTourNext,
  _pdCerrar: _pdCerrar, _pdIr: _pdIr, _pdExportReset: _pdExportReset, _pdExportSolicitar: _pdExportSolicitar,
  _pdRevocarConfirm: _pdRevocarConfirm, _pdRevocarConfirmar: _pdRevocarConfirmar, _pdElimEval: _pdElimEval,
  _pdElimConfirmar: _pdElimConfirmar, _pdElimCancelar: _pdElimCancelar, _pdCkTouch: _pdCkTouch,
  _pdCookiesGuardar: _pdCookiesGuardar, _pdCookieBannerShow: _pdCookieBannerShow, _pdCookieBannerConfig: _pdCookieBannerConfig,
  _pdCookieBannerDecidir: _pdCookieBannerDecidir, _pdEdadConfirmar: _pdEdadConfirmar,
};
registrarAcciones('cfg', {
  fn: function (a) { var f = _CFG_FN[a[0]]; if (f) f.apply(null, a.slice(1)); else console.error('[cfg] fn sin mapear:', a[0]); },
  volver: function () { openConfigPanel(); },
  servicioEdit: function (a, el) { _empServicioEditToggle(a[0], el); },
  servicioGuardar: function (a) { _empServicioGuardarNombre(a[0]); },
  servicioDel: function (a) { _empServicioBorrar(a[0], a[1]); },
  guardarOS: function () { closeConfigPanel(); gancho('exportSave')(); },
  cargarOS: function () { closeConfigPanel(); document.getElementById('loadFileInput').click(); },
  bd: function () { closeConfigPanel(); openGlobalBDPersonas(); },
  miPerfil: function () { closeConfigPanel(); abrirPerfilUsuario(false); },
  chipax: function (a, el) { cfgSetUsaChipax(el.checked); },
  logoPick: function (a, el) { _empLogoPick(el); },
  subirLogo: function () { document.getElementById('empLogoInput').click(); },
  colorSync: function (a, el) { document.getElementById('empColorHex').value = el.value.toUpperCase(); },
  enter: function (a, el, ev) { if (ev.key === 'Enter') { var f = _CFG_FN[a[0]]; if (f) f(); } },
  perfilSel: function (a, el) { _empCambiarPerfil(a[0], el.value, a[1]); },
  logoNombre: function (a, el) { _empLogoNombre(a[0], el.value); },
  tyc: function (a, el) { _cpToggleTyc(el); },
});

// D4b · ganchos definidos por este módulo (consumidos por módulos más tempranos)
define('_configPanelOpen', function () { return _configPanelOpen; });
define('_cpTourInicialQuizas', _cpTourInicialQuizas);
define('_invAbrirDatos', _invAbrirDatos);
define('_pdCookiesBootCheck', _pdCookiesBootCheck);
define('abrirFlujoCrearProductora', abrirFlujoCrearProductora);
define('closeConfigPanel', closeConfigPanel);
define('irAlPanelPersonal', irAlPanelPersonal);
define('openConfigPanel', openConfigPanel);
define('orgLogo', orgLogo);

define('_orgLogos', _orgLogos);
