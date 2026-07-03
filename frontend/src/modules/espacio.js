// Espacio de usuario (multi-org): switcher topbar, inyecciones, construcción y render — extraído de index.html (Etapa C4)
// arrancarTakeOS y resolverEspacioYArrancar viven en lib/boot.js (C6); boot llama
// a las funciones de este módulo vía window en runtime post-login (ciclo espacio⇄boot:
// esta mitad ya es import; la mitad de boot se convierte en la tranche de boot).

// D1a · imports reales. NO convertir _TIENE_EMPRESA (este módulo lo ESCRIBE y
// un import es read-only → TypeError; coherente solo vía window — línea roja #1).
// El import de boot.js hoistea su eval de última (36) a ~34 — auditado seguro:
// su top-level solo necesita state (pos 4) y DOM estático.
import { escapeHtml, showToast } from '../lib/helpers.js';
import { sb } from '../lib/supabase.js';
import { STATES } from './kanban.js';
import { irAlPanelPersonal, _pdCookiesBootCheck, abrirPrivacidadDatos } from './config.js';
import { abrirPerfilUsuario } from './perfil-onboarding.js';
import { TAKEOS_MARCA, _ctaProdEvento, _ctaProdDescartado, ctaProdCerrar, ctaProdSaberMas } from './plan-limites.js';
import { _setOrgActiva, _bootCoverShow, _bootCoverHide, arrancarTakeOS } from '../lib/boot.js';

import { registrarAcciones, accionHTML } from '../lib/delegacion.js';
import { setTieneEmpresa, USER_NOMBRE, USER_APELLIDO } from '../lib/state.js';
import { abrirInvitacionRecibida } from './invitaciones.js';
import { define } from '../lib/ganchos.js';
let _espOnbNext;   // D4c: estado propio del módulo (antes window._espOnbNext, era de los handlers inline)
/* ── FRENTE C · C3 · Selector "Cambiar de espacio" (topbar) ──────────────────
   Cambia el contexto de organización activa desde la barra superior. Lista:
   Panel personal · tus productoras (Control Room, interno) · proyectos externos
   (solo el proyecto, NUNCA un Control Room ajeno). La regla real vive en RLS
   (server-side); el selector solo refleja y no puede construir una ruta a un
   Control Room ajeno. Motor de organización activa: _setOrgActiva (V10.9.0). */
var _swData = null;
export function _swToggle(ev) {
  if (ev) ev.stopPropagation();
  var menu = document.getElementById('eswMenu'); if (!menu) return;
  if (menu.hidden) { menu.hidden = false; _swRender(); if (!_swData) _swCargar(); }
  else menu.hidden = true;
}
function _swCerrar() { var m = document.getElementById('eswMenu'); if (m && !m.hidden) m.hidden = true; }
async function _swCargar() {
  try {
    var client = (typeof sb !== 'undefined' && sb) ? sb : null;
    if (!client) { _swData = { internas: [], externas: [] }; _swRender(); return; }
    var ures = await client.auth.getUser();
    var uid = (ures && ures.data && ures.data.user) ? ures.data.user.id : null;
    if (!uid) { _swData = { internas: [], externas: [] }; _swRender(); return; }
    var rm = await client.from('memberships').select('organization_id, tipo, estado, organizations(nombre)').eq('user_id', uid).eq('estado', 'activo');
    var rows = (rm && rm.data ? rm.data : []).filter(function (r) { return r.organizations; });
    var internas = rows.filter(function (r) { return r.tipo !== 'externo'; }).map(function (r) { return { orgId: r.organization_id, nombre: r.organizations.nombre }; });
    var extOrg = rows.filter(function (r) { return r.tipo === 'externo'; });
    var extIds = extOrg.map(function (r) { return r.organization_id; });
    var proys = [];
    if (extIds.length) {
      var rp = await client.from('projects').select('id, nombre_proyecto, organization_id').in('organization_id', extIds).is('deleted_at', null);
      if (rp && !rp.error && rp.data) proys = rp.data;
    }
    var externas = extOrg.map(function (r) {
      return { orgId: r.organization_id, nombre: r.organizations.nombre, proyectos: proys.filter(function (p) { return p.organization_id === r.organization_id; }) };
    });
    _swData = { internas: internas, externas: externas };
  } catch (e) { _swData = { internas: [], externas: [] }; }
  _swRender();
}
function _swRender() {
  var menu = document.getElementById('eswMenu'); if (!menu) return;
  if (!_swData) { menu.innerHTML = '<div class="esw-empty">Cargando tus espacios…</div>'; return; }
  var html = '<div class="esw-item" data-accion="esp.panel"><span class="esw-i">🏠</span><span class="esw-x"><b>Panel personal</b><em>Todos tus espacios</em></span></div>';
  if (_swData.internas.length) {
    html += '<div class="esw-group">Tus productoras · acceso completo</div>'
      + _swData.internas.map(function (o) {
        return '<div class="esw-item" ' + accionHTML('esp.cr', o.orgId) + '><span class="esw-i">🎬</span><span class="esw-x"><b>' + escapeHtml(o.nombre) + '</b><em>Control Room (interno)</em></span></div>';
      }).join('');
  }
  _swData.externas.forEach(function (o) {
    html += '<div class="esw-group">' + escapeHtml(o.nombre) + ' · externo (solo proyectos)</div>';
    html += o.proyectos.length
      ? o.proyectos.map(function (p) { return '<div class="esw-item" ' + accionHTML('esp.proy', o.orgId, p.id) + '><span class="esw-i">📁</span><span class="esw-x"><b>' + escapeHtml(p.nombre_proyecto || 'Proyecto') + '</b><em>Proyecto</em></span></div>'; }).join('')
      : '<div class="esw-empty">Sin proyectos visibles.</div>';
  });
  menu.innerHTML = html;
}
function _swPanel() { _swCerrar(); try { irAlPanelPersonal(); } catch (e) {} }
function _swControlRoom(orgId) {
  _swCerrar();
  try { if (orgId && typeof _setOrgActiva === 'function') _setOrgActiva(orgId); } catch (e) {}
  try { setTieneEmpresa(true); } catch (e) {}
  try { if (typeof _bootCoverShow === 'function') _bootCoverShow('Cambiando de espacio…'); } catch (e) {}
  try { arrancarTakeOS(); } catch (e) {}
}
function _swProyecto(orgId, projId) {
  _swCerrar();
  try { if (typeof _espAbrirProyecto === 'function') _espAbrirProyecto(orgId, projId); } catch (e) {}
}
try { document.addEventListener('click', function (e) { var w = document.getElementById('eswWrap'); var m = document.getElementById('eswMenu'); if (m && !m.hidden && w && !w.contains(e.target)) m.hidden = true; }); } catch (e) {}

// openConfigPanel, closeConfigPanel, _configPanelOpen → movido a src/modules/config.js (Etapa A6)

/* V10.6.0 · Reconciliación con la nube anterior eliminada (obsoleta; Supabase es la única fuente). */


const PERFIL_NOMBRES = {1:'Administrador',2:'Ejecutivo',3:'Producción',4:'Asistencia de Producción',5:'Coordinación',6:'Creativo',7:'Invitado',8:'Finanzas'};

function _espIniciales(txt){
  txt = String(txt||'').trim();
  if (!txt) return 'U';
  const base = txt.indexOf('@')>=0 ? txt.split('@')[0].replace(/[._-]+/g,' ') : txt;
  const parts = base.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]||'')[0]||'' + (parts[1]?parts[1][0]:'')).toUpperCase().slice(0,2) || base.slice(0,2).toUpperCase();
}
function _espSello(nombre){
  const parts = String(nombre||'').trim().split(/\s+/).filter(Boolean);
  if (parts.length>=2) return (parts[0][0]+parts[1][0]).toUpperCase();
  return String(nombre||'··').slice(0,2).toUpperCase();
}

export const ESPACIO_DEMO = {
  _demo: true,
  usuario: { nombre:'Tyrion Lannister', email:'tyrion@casterlyrock.cl', iniciales:'TL' },
  internas: [
    { nombre:'Casterly Rock Films', perfil:'Ejecutivo', sello:'CR', total:4, proyectos:['Spot Oro de Lannister','Doc · Las Lluvias de Castamere'] }
  ],
  externas: [
    { nombre:'Winterfell Studios', sello:'WS', proyectos:[
      { nombre:'The Long Night', tipo:'Largometraje', rol:'Coordinación', estado:'En rodaje', clase:'prod' } ] },
    { nombre:'Dragonstone Pictures', sello:'DP', proyectos:[
      { nombre:'Dracarys — Campaña Targaryen', tipo:'Comercial', rol:'Productor de Campo', estado:'Preproducción', clase:'prep' },
      { nombre:'Fuego y Sangre', tipo:'Documental', rol:'Jefe de Producción', estado:'Postproducción', clase:'post' } ] },
    { nombre:"King's Landing Media", sello:'KL', proyectos:[
      { nombre:'Spot Trono de Hierro', tipo:'Comercial', rol:'Asistencia de Producción', estado:'Cotización', clase:'sale' } ] }
  ]
};

function _titleCaseNombre(s) {
  return String(s || '').trim().split(/\s+/).map(function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''; }).join(' ');
}
export function _espConstruir(rows, email){
  const internas=[], externas=[];
  (rows||[]).forEach(function(r){
    const nombre = (r.organizations && r.organizations.nombre) || 'Organización';
    if (r.tipo === 'externo') externas.push({ nombre:nombre, orgId:r.organization_id, sello:_espSello(nombre), proyectos:[] });
    else internas.push({ nombre:nombre, orgId:r.organization_id, perfil:(PERFIL_NOMBRES[r.profile_id]||'—'), sello:_espSello(nombre), total:null, proyectos:[] });
  });
  var _nm = ((typeof USER_NOMBRE !== 'undefined' ? USER_NOMBRE : '') + ' ' + (typeof USER_APELLIDO !== 'undefined' ? USER_APELLIDO : '')).trim();
  if (!_nm) _nm = email ? email.split('@')[0].replace(/[._-]+/g,' ') : 'tu cuenta';
  return { _demo:false, usuario:{ nombre:_titleCaseNombre(_nm), email:(email||''), iniciales:_espIniciales(_nm||email||'U') }, internas:internas, externas:externas };
}

/* Conteo de proyectos por productora interna (Punto 2 BD: b_projects_sel deja
   al interno listar los proyectos de su organización). Async y defensivo:
   actualiza el pill cuando llega; si falla, lo oculta sin romper nada. */
async function _espCargarConteos(internas){
  try{
    var client = (typeof sb !== 'undefined' && sb) ? sb : null;
    if (!client) return;
    (internas||[]).forEach(function(o){
      if (!o || !o.orgId) return;
      client.from('projects').select('id', { count:'exact', head:true }).eq('organization_id', o.orgId)
        .then(function(r){
          var el = document.getElementById('espc_' + o.orgId); if (!el) return;
          if (r && r.error) { el.style.display = 'none'; return; }
          var n = (r && typeof r.count === 'number') ? r.count : 0;
          el.textContent = (n === 0) ? 'Sin proyectos aún' : (n + ' ' + (n === 1 ? 'proyecto' : 'proyectos'));
        })
        .catch(function(){ var el = document.getElementById('espc_' + o.orgId); if (el) el.style.display = 'none'; });
    });
  }catch(e){}
}

function _espOnboarding(hayInternas, hayExternas){
  /* V11.9.7 · primera vez en el Panel Personal: 1-2 pop-ups breves en lugar de
     texto fijo en pantalla. Se muestran una sola vez por navegador. */
  try { if (localStorage.getItem('takeos_esp_onb') === '1') return; } catch (e) { return; }
  const pasos = [];
  if (hayInternas) pasos.push({ t: 'Tus productoras', b: 'Arriba están las productoras donde eres parte del equipo. Entras y la ves completa.' });
  if (hayExternas) pasos.push({ t: 'Proyectos donde colaboras', b: 'Abajo, los proyectos a los que te invitaron. Haz click en uno y entras directo.' });
  if (!pasos.length) return;
  let i = 0;
  const pop = document.createElement('div');
  pop.id = 'espOnb';
  pop.style.cssText = 'position:fixed;inset:0;z-index:100001;display:grid;place-items:center;background:rgba(0,0,0,.45);';
  function paint(){
    const p = pasos[i];
    pop.innerHTML = '<div style="background:var(--bg-card,#1b1c20);border:1px solid var(--rule,#2a2a28);border-radius:14px;max-width:340px;padding:22px 24px;text-align:center;">'
      + '<div style="font-weight:700;font-size:15px;color:var(--ink-primary);margin-bottom:8px;">' + p.t + '</div>'
      + '<div style="font-size:13px;color:var(--ink-secondary);line-height:1.55;margin-bottom:16px;">' + p.b + '</div>'
      + '<button class="btn btn-primary btn-sm" data-accion="esp.onbNext">' + (i < pasos.length - 1 ? 'Siguiente' : 'Entendido') + '</button>'
      + (pasos.length > 1 ? '<div style="margin-top:10px;font-size:11px;color:var(--ink-faint);">' + (i + 1) + ' de ' + pasos.length + '</div>' : '')
      + '</div>';
  }
  _espOnbNext = function(){ i++; if (i >= pasos.length) { try { localStorage.setItem('takeos_esp_onb', '1'); } catch (e) {} pop.remove(); } else paint(); };
  paint();
  document.body.appendChild(pop);
}
function _espEntrarInterna(demo, orgId){
  if (demo){ try{ showToast({kind:'info',title:'Vista de demostración',body:'En la app real entrarías a esta productora con tu rol. Esta es una vista de ejemplo.'}); }catch(e){} return; }
  if (orgId) _setOrgActiva(orgId);
  setTieneEmpresa(true);
  _bootCoverShow('Entrando a tu productora…');
  const ov=document.getElementById('espacioUsuario'); if(ov) ov.remove();
  /* V11.15.0 · B2: limpiar ?espacio=1 de la URL para que F5 restaure la vista
     en lugar de volver al Panel Personal. */
  try { history.replaceState(null, '', window.location.pathname); } catch(e) {}
  arrancarTakeOS();
}
function _espAbrirProyecto(orgId, projId){
  /* V11.9.7 · entra DIRECTO al proyecto, sin pasar por el Control Room: fija la
     org, deja anotado el destino y arranca; al terminar de cargar los
     proyectos, la app navega sola al proyecto (ver dalBootProyectos). */
  if (!orgId || !projId) return;
  _setOrgActiva(orgId);
  try { sessionStorage.setItem('takeos_ir_proyecto', projId); } catch (e) {}
  _bootCoverShow('Abriendo proyecto…');
  const ov = document.getElementById('espacioUsuario'); if (ov) ov.remove();
  try { history.replaceState(null, '', window.location.pathname); } catch(e) {}   // V11.15.0 · B2
  arrancarTakeOS();
}
async function _espCargarProyectosExternos(externas){
  /* Llena las cards de proyectos del externo en su Panel Personal. La RLS de
     projects (auth_ve_proyecto) devuelve SOLO los proyectos donde tiene cargo
     activo, así que la consulta ya viene filtrada por la base. */
  try{
    var client = (typeof sb !== 'undefined' && sb) ? sb : null;
    if (!client) return;
    (externas||[]).forEach(function(o){
      if (!o || !o.orgId) return;
      client.from('projects').select('id, nombre_proyecto, estado').eq('organization_id', o.orgId).is('deleted_at', null)
        .then(function(r){
          var box = document.getElementById('espp_' + o.orgId); if (!box) return;
          if (r.error || !r.data || !r.data.length) { box.innerHTML = '<div class="esp-empty">Verás aquí los proyectos a los que te inviten.</div>'; return; }
          box.innerHTML = r.data.map(function(p){
            var est = (typeof STATES !== 'undefined' && STATES[p.estado] && STATES[p.estado].name) ? STATES[p.estado].name : (p.estado || '');
            return '<div class="esp-proj" ' + accionHTML('esp.abrirProy', o.orgId, p.id) + '>'
              + '<div class="esp-f1"><div class="pnm">' + escapeHtml(p.nombre_proyecto || p.id) + '</div><div class="psub">invitado por ' + escapeHtml(o.nombre || '') + '</div></div>'
              + '<span class="esp-chip sale">' + escapeHtml(est) + '</span>'
              + '<span class="esp-go"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>'
              + '</div>';
          }).join('');
        })
        .catch(function(){});
    });
  }catch(e){}
}
function _espPerfil(){ try{ abrirPerfilUsuario(false); }catch(e){} }

export function renderEspacioUsuario(data){
  try{
    _bootCoverHide();
    const demo = !!data._demo, u = data.usuario||{};
    const internas = data.internas||[], externas = data.externas||[];
    const intHTML = internas.map(function(o){ return `
      <div class="esp-org">
        <div class="esp-seal i">${o.sello||'··'}</div>
        <div class="esp-f1">
          <div class="nm">${o.nombre}</div>
          <div class="esp-meta"><span class="esp-badge i">Interno</span><span class="esp-role">${o.perfil||'—'} · acceso completo</span></div>
          ${(o.orgId||(o.proyectos&&o.proyectos.length))?`<div class="esp-prev">${o.orgId?`<span class="esp-pill faint" id="espc_${o.orgId}">Cargando proyectos…</span>`:(o.total?`<span class="esp-pill faint">${o.total} proyectos activos</span>`:'')}${(o.proyectos||[]).map(function(p){return `<span class="esp-pill">${p}</span>`;}).join('')}</div>`:''}
        </div>
        <button class="esp-enter" ${accionHTML('esp.entrar', demo, o.orgId || '')}>Entrar <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg></button>
      </div>`; }).join('');
    const extHTML = externas.map(function(o){ return `
      <div class="esp-grp">
        <div class="esp-grp-h"><div class="esp-seal e sm">${o.sello||'··'}</div><div class="nm">${o.nombre}</div><span class="esp-badge e">Externo</span></div>
        <div id="espp_${o.orgId||''}"><div class="esp-empty">Cargando tus proyectos…</div></div>
      </div>`; }).join('');
    const ov = document.createElement('div'); ov.id='espacioUsuario';
    ov.innerHTML = `<style>
      #espacioUsuario{position:fixed;inset:0;z-index:99998;overflow-y:auto;background:var(--bg-page);color:var(--ink-primary);font-family:var(--font-sans),system-ui,sans-serif;}
      #espacioUsuario *{box-sizing:border-box;}
      #espacioUsuario .esp-top{position:sticky;top:0;background:var(--bg-surface);border-bottom:1px solid var(--rule);}
      #espacioUsuario .esp-top-in{max-width:920px;margin:0 auto;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px;}
      #espacioUsuario .esp-brand{display:flex;align-items:center;gap:10px;}
      #espacioUsuario .esp-mark{width:30px;height:30px;border-radius:7px;background:var(--accent);color:var(--ink-onAccent);display:grid;place-items:center;font-weight:700;font-size:16px;}
      #espacioUsuario .esp-bname{font-weight:700;font-size:18px;letter-spacing:.01em;}
      #espacioUsuario .esp-ver{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--ink-faint);border:1px solid var(--rule);border-radius:5px;padding:2px 7px;}
      #espacioUsuario .esp-acct{display:flex;align-items:center;gap:10px;cursor:pointer;}
      #espacioUsuario .esp-acct .who{text-align:right;line-height:1.25;}
      #espacioUsuario .esp-acct .who b{font-weight:600;font-size:14px;}
      #espacioUsuario .esp-acct .who span{display:block;font-size:12px;color:var(--ink-faint);}
      #espacioUsuario .esp-right{display:flex;align-items:center;gap:12px;}
      #espacioUsuario .esp-logout{display:inline-flex;align-items:center;gap:7px;background:transparent;border:1px solid var(--rule);border-radius:var(--radius-sm);padding:8px 12px;font-size:12px;color:var(--ink-secondary);cursor:pointer;font-family:inherit;}
      #espacioUsuario .esp-logout:hover{background:var(--bg-card);border-color:var(--ink-faint);color:var(--ink-primary);}
      #espacioUsuario .esp-av{width:36px;height:36px;border-radius:50%;background:var(--bg-elevated);color:var(--ink-primary);display:grid;place-items:center;font-weight:600;font-size:14px;border:1px solid var(--rule-strong);text-transform:uppercase;}
      #espacioUsuario .esp-wrap{max-width:920px;margin:0 auto;padding:34px 28px 70px;}
      #espacioUsuario .esp-eyebrow{text-transform:uppercase;letter-spacing:.18em;font-size:12px;color:var(--ink-faint);font-weight:600;display:flex;align-items:center;gap:8px;}
      #espacioUsuario .esp-dot{width:7px;height:7px;border-radius:50%;}
      #espacioUsuario .esp-dot.i{background:var(--accent);} #espacioUsuario .esp-dot.e{background:var(--info);}
      #espacioUsuario .esp-h1{font-size:34px;font-weight:700;letter-spacing:.005em;margin:8px 0 6px;}
      #espacioUsuario .esp-lede{color:var(--ink-secondary);margin:0 0 32px;max-width:60ch;}
      #espacioUsuario .esp-sec{margin-bottom:30px;}
      #espacioUsuario .esp-sec-h{margin-bottom:14px;}
      #espacioUsuario .esp-hint{margin:5px 0 0;font-size:13px;color:var(--ink-faint);}
      #espacioUsuario .esp-f1{flex:1;min-width:0;}
      #espacioUsuario .esp-seal{flex:none;width:46px;height:46px;border-radius:11px;font-weight:700;font-size:18px;display:grid;place-items:center;}
      #espacioUsuario .esp-seal.sm{width:34px;height:34px;border-radius:9px;font-size:14px;}
      #espacioUsuario .esp-seal.i{background:var(--accent);color:var(--ink-onAccent);}
      #espacioUsuario .esp-seal.e{background:transparent;color:var(--info);border:1.5px solid var(--info);}
      #espacioUsuario .esp-org{display:flex;align-items:center;gap:18px;padding:18px 20px;background:var(--bg-card);border:1px solid var(--rule);border-top:3px solid var(--accent);border-radius:var(--radius-md);box-shadow:var(--shadow-sm);transition:transform .15s,box-shadow .15s;}
      #espacioUsuario .esp-org:hover{transform:translateY(-2px);box-shadow:var(--shadow-md);}
      #espacioUsuario .esp-org .nm{font-weight:700;font-size:20px;}
      #espacioUsuario .esp-meta{display:flex;align-items:center;gap:10px;margin-top:3px;flex-wrap:wrap;}
      #espacioUsuario .esp-badge{text-transform:uppercase;letter-spacing:.1em;font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:5px;}
      #espacioUsuario .esp-badge.i{background:var(--accent-bg);color:var(--accent-deep);}
      #espacioUsuario .esp-badge.e{background:var(--info-bg);color:var(--info);}
      #espacioUsuario .esp-role{font-size:13px;color:var(--ink-secondary);}
      #espacioUsuario .esp-prev{display:flex;gap:7px;margin-top:12px;flex-wrap:wrap;}
      #espacioUsuario .esp-pill{font-size:12px;color:var(--ink-secondary);background:var(--bg-elevated);border:1px solid var(--rule);border-radius:999px;padding:4px 11px;}
      #espacioUsuario .esp-pill.faint{color:var(--ink-faint);}
      #espacioUsuario .esp-enter{flex:none;display:flex;align-items:center;gap:8px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;font-size:13px;color:var(--accent-deep);border:none;background:transparent;cursor:pointer;padding-left:16px;border-left:1px solid var(--rule);align-self:stretch;}
      #espacioUsuario .esp-enter svg{transition:transform .15s;} #espacioUsuario .esp-org:hover .esp-enter svg{transform:translateX(3px);}
      #espacioUsuario .esp-grp{background:var(--bg-card);border:1px solid var(--rule);border-radius:var(--radius-md);box-shadow:var(--shadow-sm);overflow:hidden;margin-bottom:13px;}
      #espacioUsuario .esp-grp-h{display:flex;align-items:center;gap:12px;padding:13px 18px;border-bottom:1px solid var(--rule-soft);}
      #espacioUsuario .esp-grp-h .nm{font-weight:700;font-size:16px;}
      #espacioUsuario .esp-proj{display:flex;align-items:center;gap:14px;padding:13px 18px;border-bottom:1px solid var(--rule-soft);cursor:pointer;transition:background .12s;}
      #espacioUsuario .esp-proj:last-child{border-bottom:none;}
      #espacioUsuario .esp-proj:hover{background:var(--bg-elevated);}
      #espacioUsuario .esp-proj .pnm{font-weight:600;font-size:15px;}
      #espacioUsuario .esp-proj .psub{font-size:12.5px;color:var(--ink-faint);margin-top:1px;}
      #espacioUsuario .esp-proj .prole{flex:none;font-size:12.5px;color:var(--ink-secondary);text-align:right;min-width:140px;}
      #espacioUsuario .esp-proj .prole .l{display:block;text-transform:uppercase;letter-spacing:.12em;font-size:9.5px;color:var(--ink-faint);}
      #espacioUsuario .esp-chip{flex:none;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;padding:4px 10px;border-radius:6px;color:#1a1a19;min-width:104px;text-align:center;}
      #espacioUsuario .esp-chip.sale{background:var(--state-sale);} #espacioUsuario .esp-chip.prep{background:var(--state-prep);}
      #espacioUsuario .esp-chip.prod{background:var(--state-prod);} #espacioUsuario .esp-chip.post{background:var(--state-post);}
      #espacioUsuario .esp-go{flex:none;color:var(--ink-faint);} #espacioUsuario .esp-proj:hover .esp-go{color:var(--info);}
      #espacioUsuario .esp-empty{padding:16px 18px;font-size:13px;color:var(--ink-faint);}
      #espacioUsuario .esp-foot{margin-top:26px;font-size:12.5px;color:var(--ink-faint);border-top:1px dashed var(--rule);padding-top:15px;line-height:1.6;}
      @media (max-width:680px){
        #espacioUsuario .esp-top-in,#espacioUsuario .esp-wrap{padding-left:16px;padding-right:16px;}
        #espacioUsuario .esp-h1{font-size:27px;}
        #espacioUsuario .esp-org{flex-wrap:wrap;} #espacioUsuario .esp-enter{border-left:none;padding-left:0;margin-top:6px;}
        #espacioUsuario .esp-proj{flex-wrap:wrap;} #espacioUsuario .esp-proj .prole{min-width:0;text-align:left;width:100%;} #espacioUsuario .esp-chip{min-width:0;}
        #espacioUsuario .esp-acct .who{display:none;}
      }
    </style>
      <div class="esp-top"><div class="esp-top-in">
        <div class="esp-brand"><div class="esp-mark">T</div><span class="esp-bname">TakeOS</span><span class="esp-ver">${demo?'Demo':'Tu espacio'}</span></div>
        <div class="esp-right">
          <div class="esp-acct" data-accion="esp.perfil"><div class="who"><b>${u.nombre||'tu cuenta'}</b><span>${u.email||''}</span></div><div class="esp-av">${u.iniciales||'U'}</div></div>
          <button class="esp-logout" data-accion="app.logout" title="Cerrar sesión en TakeOS"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Salir</button>
        </div>
      </div></div>
      <div class="esp-wrap">
        <div class="esp-eyebrow">Tu espacio</div>
        <h1 class="esp-h1">Hola, ${String(u.nombre||'').split(' ')[0]||'de nuevo'}</h1>
        ${internas.length?`<div class="esp-sec"><div class="esp-sec-h"><div class="esp-eyebrow"><span class="esp-dot i"></span>Tus productoras</div></div>${intHTML}</div>`:''}
        ${externas.length?`<div class="esp-sec"><div class="esp-sec-h"><div class="esp-eyebrow"><span class="esp-dot e"></span>Proyectos donde colaboras</div></div>${extHTML}</div>`:''}
        ${(!internas.length && !externas.length)?`<div class="esp-grp"><div class="esp-empty" style="padding:30px 20px;text-align:center;line-height:1.7;">Aún no perteneces a ninguna productora.<br><span style="color:var(--ink-faint);font-size:12.5px;">Cuando una productora te invite a colaborar, sus proyectos van a aparecer aquí.</span></div></div>`:''}
        <div class="esp-foot"><a data-accion="esp.privacidad" style="color:var(--accent-deep);cursor:pointer;font-weight:600;text-decoration:none;">Privacidad y datos</a> · tus derechos sobre tus datos personales (Ley 21.719).</div>
      </div>`;
    document.body.appendChild(ov);
    try{ if(!demo){ _espCargarConteos(internas); _espCargarProyectosExternos(externas); _espOnboarding(internas.length>0, externas.length>0); } }catch(e){}
    try{ if(!demo) setTimeout(_pdCookiesBootCheck, 1200); }catch(e){}   // V11.15.0 · Plan G §2: banner de cookies en primera visita
  }catch(e){ console.error('[espacio] render falló', e); try{ const o=document.getElementById('espacioUsuario'); if(o)o.remove(); }catch(_){ } _bootCoverHide(); }
}

export function _espInyectarCtaProductora() {
  /* Solo en "Tu espacio" de una cuenta SIN productora. La condición de
     targeting (cero membresías activas) la decide el llamador. */
  if (_ctaProdDescartado()) return;
  try {
    const host = document.getElementById('espacioUsuario'); if (!host) return;
    if (host.querySelector('#espCtaProd')) return;
    const cont = host.querySelector('.esp-wrap') || host.firstElementChild || host;
    const sec = document.createElement('div');
    sec.id = 'espCtaProd';
    sec.style.cssText = 'max-width:680px;margin:18px auto 0;';
    sec.innerHTML = '<div style="position:relative;border:1px solid var(--rule);border-radius:14px;padding:20px 22px;background:linear-gradient(135deg, var(--bg-card), var(--bg-surface));overflow:hidden;">'
      + '<button data-accion="esp.ctaCerrar" title="Cerrar" aria-label="Cerrar" style="position:absolute;top:10px;right:12px;background:none;border:none;color:var(--ink-faint);font-size:18px;cursor:pointer;line-height:1;padding:2px 6px;">×</button>'
      + '<div style="font-weight:700;font-size:17px;color:var(--ink-primary);margin-bottom:6px;">¿Tienes una productora?</div>'
      + '<div style="font-size:13px;color:var(--ink-secondary);line-height:1.55;max-width:52ch;margin-bottom:14px;">Esta es la punta del iceberg. ' + TAKEOS_MARCA + ' ordena tu productora entera: la plata, el equipo y tu paz.</div>'
      + '<button class="btn btn-primary btn-sm" data-accion="esp.ctaSaberMas">Saber más →</button>'
      + '</div>';
    cont.appendChild(sec);
    _ctaProdEvento('cta_productora_impression', { slot: 'dashboard' });
  } catch (e) {}
}
/* V11.4.0 · Herramientas personales en Tu espacio (preparación de frontend;
   el almacenamiento personal de estas herramientas viene en el handoff a BD). */
export function _espInyectarHerramientas() {
  try {
    const host = document.getElementById('espacioUsuario'); if (!host) return;
    if (host.querySelector('#espHerr')) return;
    const cont = host.querySelector('.esp-wrap') || host.firstElementChild || host;
    const sec = document.createElement('div');
    sec.id = 'espHerr';
    sec.style.cssText = 'max-width:680px;margin:18px auto 30px;';
    const card = function (nombre, sub) {
      return '<div style="flex:1;min-width:170px;border:1px solid var(--rule);border-radius:10px;padding:14px;background:var(--bg-card);opacity:.75;" title="Disponible próximamente: tus herramientas se guardarán en tu cuenta personal.">'
        + '<div style="font-weight:700;font-size:13.5px;margin-bottom:4px;">' + nombre + '</div>'
        + '<div style="font-size:11.5px;color:var(--ink-faint);">' + sub + '</div></div>';
    };
    sec.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'
      + '<div style="font-weight:700;font-size:14px;">Herramientas</div>'
      + '<span style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:var(--positive,#2e7d32);color:#fff;border-radius:999px;padding:2px 9px;">Gratis en Early Bird</span>'
      + '</div>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
      + card('Plan de Rodaje', 'Próximamente en tu cuenta personal')
      + card('Guion Técnico', 'En construcción')
      + card('Hoja de Llamado', 'Próximamente en tu cuenta personal')
      + '</div>'
      + '<p style="font-size:11px;color:var(--ink-faint);margin:8px 0 0;">Las herramientas creativas y de producción de TakeOS, disponibles con tu cuenta personal aunque no pertenezcas a una productora. Gratis durante Early Bird; después serán parte del plan personal.</p>';
    cont.appendChild(sec);
  } catch (e) {}
}
/* Bandeja: inyecta las invitaciones pendientes en la pantalla "Tu espacio". */
export function _espInyectarInvitaciones(invs) {
  if (!Array.isArray(invs) || !invs.length) return;
  try {
    const host = document.getElementById('espacioUsuario'); if (!host) return;
    const cont = host.querySelector('.esp-wrap') || host.firstElementChild || host;
    const sec = document.createElement('div');
    sec.style.cssText = 'max-width:680px;margin:0 auto 22px;';
    sec.innerHTML = '<div style="border:1px solid var(--accent);border-radius:12px;padding:16px 18px;background:var(--bg-card);">'
      + '<div style="font-weight:700;font-size:14px;margin-bottom:10px;">Tienes ' + invs.length + (invs.length === 1 ? ' invitación pendiente' : ' invitaciones pendientes') + '</div>'
      + invs.map(function (i) {
          return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--rule);font-size:13px;">'
            + '<div><strong>' + escapeHtml(i.org_nombre || 'Productora') + '</strong>'
            + (i.proyecto ? ' · ' + escapeHtml(i.proyecto) : '')
            + (i.cargo ? ' · como ' + escapeHtml(i.cargo) : '')
            + ' <span style="color:var(--ink-faint);">(' + escapeHtml(i.perfil || '') + ', ' + escapeHtml(i.tipo || '') + ')</span></div>'
            + '<button class="btn btn-primary btn-sm" ' + accionHTML('esp.verInv', i.token) + '>Ver invitación</button>'
            + '</div>';
        }).join('')
      + '</div>';
    cont.insertBefore(sec, cont.firstChild);
  } catch (e) { console.warn('[inv] inyectar bandeja', e); }
}

// ── Window bridges (3 barridos func+const) ──
// ── Bridges de reparación C4 (llamadas reales de las islas bootstrap, verificadas por cuerpo) ──

// D2 · acciones delegadas (cta*/abrirInvitacionRecibida/abrirPrivacidadDatos vía window)
registrarAcciones('esp', {
  panel: function () { _swPanel(); },
  cr: function (a) { _swControlRoom(a[0]); },
  proy: function (a) { _swProyecto(a[0], a[1]); },
  onbNext: function () { _espOnbNext(); },
  abrirProy: function (a) { _espAbrirProyecto(a[0], a[1]); },
  entrar: function (a) { _espEntrarInterna(a[0], a[1]); },
  perfil: function () { _espPerfil(); },
  privacidad: function () { abrirPrivacidadDatos(); },
  ctaCerrar: function () { ctaProdCerrar(); },
  ctaSaberMas: function () { ctaProdSaberMas(); },
  verInv: function (a) { abrirInvitacionRecibida(a[0]); },
});

// D4b · ganchos definidos por este módulo (consumidos por módulos más tempranos)
define('ESPACIO_DEMO', ESPACIO_DEMO);
define('_espConstruir', _espConstruir);
define('_espInyectarCtaProductora', _espInyectarCtaProductora);
define('_espInyectarHerramientas', _espInyectarHerramientas);
define('_espInyectarInvitaciones', _espInyectarInvitaciones);
define('_swToggle', _swToggle);
define('renderEspacioUsuario', renderEspacioUsuario);
