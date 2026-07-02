// Sistema de invitaciones (frontend) — extraído de index.html (Etapa C3)
// Incluye dalInvitar (excepción B1 que ahora se muda con su dominio).

/* ════════════════════════════════════════════════════════════════════
   V11.3.0 · SISTEMA DE INVITACIONES (frontend)
   ════════════════════════════════════════════════════════════════════
   El backend completo ya existe y está operativo con el texto provisional
   v0.1 (consent_terms aprobado/vigente, marcado SOLO PRUEBAS):
   · invitar_a_organizacion(org,email,tipo,perfil,cargo?,proyecto?) → {token,…}
   · mis_invitaciones() → bandeja del usuario logueado
   · reclamar_invitacion(token) → valida y devuelve términos + contexto
   · consentir_invitacion(org) → copia datos + consentimiento + activa todo
   · cerrar_invitacion(token,'aceptada'|'rechazada') / cancelar_invitacion(token)
   El canal de CORREO aún no existe (dominio/Resend pendiente): la entrega es
   por LINK copiable y, para cuentas ya registradas, por la bandeja interna. */
const PERFIL_CODIGO_POR_NOMBRE = { 'Administrador': 1, 'Ejecutivo': 2, 'Producción': 3, 'Asistencia de Producción': 4, 'Asistencia': 4, 'Coordinación': 5, 'Creativo': 6, 'Invitado': 7, 'Finanzas / CFO': 8, 'Finanzas': 8 };
const PERFIL_NOMBRE_POR_CODIGO = { 1: 'Administrador', 2: 'Ejecutivo', 3: 'Producción', 4: 'Asistencia de Producción', 5: 'Coordinación', 6: 'Creativo', 7: 'Invitado', 8: 'Finanzas / CFO' };
function invitacionLink(token) { return window.location.origin + window.location.pathname + '?invitacion=' + encodeURIComponent(token); }
async function dalInvitar(email, tipo, perfilCodigo, cargoId, projectId) {
  if (!sb) throw new Error('Sin conexión a la base.');
  const { data, error } = await sb.rpc('invitar_a_organizacion', {
    p_org_id: ORG_ID, p_email: email, p_tipo: tipo, p_perfil_codigo: perfilCodigo,
    p_cargo_id: cargoId || null, p_project_id: projectId || null
  });
  if (error) throw error;
  return data || {};
}
function _invMostrarResultado(res) {
  const link = invitacionLink(res.token || '');
  const registrado = !!res.registrado;
  document.getElementById('modalRoot').innerHTML = '<div class="modal-backdrop" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()" style="max-width:560px;">'
    + '<div class="modal-header"><div class="modal-title">Invitación creada</div></div>'
    + '<div class="modal-body">'
    +   '<p style="margin:0 0 10px;font-size:13px;color:var(--ink-secondary);line-height:1.55;">Invitación para <strong>' + escapeHtml(res.email || '') + '</strong>'
    +   (registrado ? ' — esa cuenta ya existe en TakeOS, así que además le aparecerá en su bandeja al entrar.' : ' — esa persona aún no tiene cuenta: al abrir el link creará su cuenta y verá la invitación.')
    +   '</p>'
    +   '<div style="display:flex;gap:8px;align-items:center;">'
    +     '<input class="input" id="invLinkOut" readonly value="' + escapeHtml(link) + '" style="flex:1;font-size:12px;">'
    +     '<button class="btn btn-primary btn-sm" onclick="invCopiarLink()">Copiar</button>'
    +   '</div>'
    +   '<p style="margin:10px 0 0;font-size:11.5px;color:var(--ink-faint);line-height:1.5;">El envío automático por correo se activa cuando esté listo el canal de email (dominio en resolución). Por ahora, comparte este link por el medio que prefieras. Vence en 14 días.</p>'
    + '</div>'
    + '<div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Listo</button></div>'
    + '</div></div>';
}
function invCopiarLink() {
  const el = document.getElementById('invLinkOut'); if (!el) return;
  el.select();
  try { navigator.clipboard.writeText(el.value); } catch (e) { try { document.execCommand('copy'); } catch (x) {} }
  showToast({ kind: 'success', title: 'Link copiado', body: 'Pégalo donde quieras compartirlo.' });
}
/* Pantalla "Invitación recibida" (momento E del flujo). */
async function abrirInvitacionRecibida(token) {
  try { sessionStorage.removeItem('takeos_inv_pendiente'); } catch (e) {}
  let info = null;
  try {
    const { data, error } = await sb.rpc('reclamar_invitacion', { p_token: token });
    if (error) throw error;
    info = data || {};
  } catch (e) {
    const msg = (e && e.message) ? String(e.message) : 'No se pudo abrir la invitación.';
    showToast({ kind: 'error', title: 'Invitación no disponible', body: msg.replace(/^invitacion:\s*/i, ''), duration: 9000 });
    resolverEspacioYArrancar();
    return;
  }
  if (info.ya_miembro) {
    showToast({ kind: 'info', title: 'Ya eres parte', body: 'Tu cuenta ya pertenece a esta productora.' });
    _TIENE_EMPRESA = true; _bootCoverShow('Entrando…'); _setOrgActiva(info.org_id); arrancarTakeOS(); return;
  }
  /* V11.12.0 · regla única del servidor (handoff BD §5): `requisitos_faltantes`
     manda. Si falta algo, vamos DIRECTO a completar SOLO esas secciones, sin
     pasar antes por el consentimiento. Al volver, reabrimos la invitación
     (reclamar ya no consume). Esto elimina el ida-y-vuelta T&C → datos → T&C. */
  const reqs = Array.isArray(info.requisitos_faltantes) ? info.requisitos_faltantes : [];
  if (reqs.length) {
    invCompletarPerfil(token, reqs.indexOf('banca') >= 0, reqs, {
      proyecto: info.proyecto || '', cargo: info.cargo || '', persona: info.persona_nombre || ''
    });
    return;
  }
  /* correo del usuario actual: para el aviso de aprobación si no calza */
  let _miEmail = '';
  try { const u = await sb.auth.getUser(); _miEmail = (u && u.data && u.data.user && u.data.user.email) || ''; } catch (e) {}

  try { const esp = document.getElementById('espacioUsuario'); if (esp) esp.remove(); } catch (e) {}
  try { const prev = document.getElementById('invitacionRecibida'); if (prev) prev.remove(); } catch (e) {}

  const tituloRol = info.persona_nombre
    ? ('Te invitan como <strong>' + escapeHtml(info.persona_nombre) + '</strong>' + (info.cargo ? ', ' + escapeHtml(info.cargo) : ''))
    : (info.cargo ? ('Te invitan como <span class="irole">' + escapeHtml(info.cargo) + '</span>') : 'Te invitan a colaborar');

  const ov = document.createElement('div');
  ov.id = 'invitacionRecibida';
  ov.innerHTML = '<style>'
    + '#invitacionRecibida{position:fixed;inset:0;z-index:99998;overflow-y:auto;background:var(--bg-page);color:var(--ink-primary);font-family:var(--font-sans),system-ui,sans-serif;}'
    + '#invitacionRecibida .iw{max-width:560px;margin:0 auto;padding:46px 24px 80px;}'
    + '#invitacionRecibida .ibrand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;margin-bottom:26px;}'
    + '#invitacionRecibida .imk{width:30px;height:30px;border-radius:7px;background:var(--accent);color:var(--ink-onAccent);display:grid;place-items:center;font-weight:700;}'
    + '#invitacionRecibida .icard{background:var(--bg-card);border:1px solid var(--rule);border-radius:14px;padding:26px;box-shadow:var(--shadow-sm);}'
    + '#invitacionRecibida .ifrom{font-size:12px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.12em;font-weight:600;}'
    + '#invitacionRecibida h2{font-size:24px;margin:8px 0 4px;}'
    + '#invitacionRecibida .irole{color:var(--accent);font-weight:700;}'
    + '#invitacionRecibida .iterms{max-height:180px;overflow-y:auto;border:1px solid var(--rule);border-radius:8px;padding:12px 14px;font-size:12.5px;line-height:1.6;color:var(--ink-secondary);background:var(--bg-surface);margin:14px 0 10px;white-space:pre-wrap;}'
    + '#invitacionRecibida .iconsent{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:var(--ink-secondary);line-height:1.5;cursor:pointer;}'
    + '#invitacionRecibida .iacts{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;}'
    + '#invitacionRecibida .btn[disabled]{opacity:.45;cursor:not-allowed;filter:saturate(.3);}'
    + '#invitacionRecibida .btn[disabled]:hover{transform:none;box-shadow:none;filter:saturate(.3);}'
    + '#invitacionRecibida .iwarn{border:1px solid var(--warning);border-radius:8px;padding:11px 13px;margin:14px 0 0;background:rgba(234,179,8,.08);font-size:12.5px;color:var(--ink-secondary);line-height:1.55;}'
    + '</style>'
    + '<div class="iw">'
    +   '<div class="ibrand"><div class="imk">T</div><b>TakeOS</b></div>'
    +   '<div class="icard">'
    +     '<div class="ifrom">' + escapeHtml(info.org_nombre || 'Una productora') + ' te invitó a colaborar</div>'
    +     (info.proyecto ? '<h2>' + escapeHtml(info.proyecto) + '</h2>' : '<h2>Únete al equipo</h2>')
    +     '<div style="font-size:14px;color:var(--ink-secondary);margin-top:6px;">' + tituloRol + (info.proyecto ? ' en <strong>' + escapeHtml(info.proyecto) + '</strong>' : '') + '.</div>'
    +     '<div style="font-size:13px;color:var(--ink-secondary);margin-top:8px;">Tipo: <strong style="text-transform:capitalize;">' + escapeHtml(info.tipo || '') + '</strong> · Perfil de acceso: <strong>' + escapeHtml(info.perfil_nombre || '') + '</strong></div>'
    +     (info.requiere_aprobacion_correo ? ('<div class="iwarn">⚠ Esta invitación se envió a <strong>' + escapeHtml(info.email_invitado || 'otro correo') + '</strong> y tú iniciaste sesión como <strong>' + escapeHtml(_miEmail || 'tu correo actual') + '</strong>. Si continúas, <strong>' + escapeHtml(info.org_nombre || 'la productora') + '</strong> deberá <strong>aprobar el cambio de correo</strong> antes de darte acceso al proyecto.</div>') : '')
    +     '<div style="margin-top:16px;font-size:12px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.08em;font-weight:600;">Antes de aceptar — uso de tus datos (Ley 21.719)</div>'
    +     '<div class="iterms">' + escapeHtml(info.terms_texto || '') + '</div>'
    +     '<label class="iconsent"><input type="checkbox" id="invConsentCk" onchange="document.getElementById(\'invBtnAceptar\').disabled = !this.checked"> He leído y autorizo el uso de mis datos personales descrito arriba, en los términos de la Ley 21.719.</label>'
    +     '<div class="iacts">'
    +       '<button class="btn btn-secondary" onclick="invRechazar(\'' + escapeHtml(token) + '\')">Rechazar</button>'
    +       '<button class="btn btn-primary" id="invBtnAceptar" disabled onclick="invAceptar(\'' + escapeHtml(token) + '\', \'' + escapeHtml(String(info.org_id || '')) + '\')">' + (info.requiere_aprobacion_correo ? 'Solicitar acceso' : 'Aceptar y colaborar') + '</button>'
    +     '</div>'
    +   '</div>'
    +   '<p style="font-size:11.5px;color:var(--ink-faint);margin-top:14px;line-height:1.5;">Versión de términos: ' + escapeHtml(info.terms_version || '') + '. Tu aceptación queda registrada con esta versión, fecha y un respaldo del texto.</p>'
    + '</div>';
  document.body.appendChild(ov);
}
function _invCerrarOverlay() { const ov = document.getElementById('invitacionRecibida'); if (ov) ov.remove(); }
/* V11.12.0 · llevar a completar SOLO las secciones faltantes (reqs ⊆ ['perfil','banca'])
   con un banner de contexto. Al cerrar el perfil: si GUARDÓ, reabrimos la invitación
   (que ya reevaluará requisitos); si se arrepintió (omitió/cerró), vuelve a su Panel
   Personal y la invitación queda pendiente para reintentar (no se pierde). */
function invCompletarPerfil(token, faltaBanca, reqs, invCtx) {
  _invCerrarOverlay();
  abrirPerfilUsuario(true, function (guardado) {
    if (guardado) { abrirInvitacionRecibida(token); }
    else { resolverEspacioYArrancar(); }
  }, !!faltaBanca, Array.isArray(reqs) ? reqs : null, invCtx || null);
}
async function invAceptar(token, orgId) {
  const btn = document.getElementById('invBtnAceptar'); if (btn) { btn.disabled = true; btn.textContent = 'Procesando…'; }
  try {
    const r1 = await sb.rpc('consentir_invitacion', { p_org_id: orgId });
    if (r1.error) throw r1.error;
    /* V11.12.0 · consentir_invitacion ahora devuelve jsonb (handoff BD §4). */
    const res = (r1.data && typeof r1.data === 'object') ? r1.data : { estado: 'activo' };
    if (res.estado === 'pendiente_aprobacion') {
      _invCerrarOverlay();
      showToast({ kind: 'info', title: 'Solicitud enviada al responsable', body: 'Como iniciaste sesión con un correo distinto al invitado, tu acceso queda a la espera de que el responsable lo apruebe. Te avisaremos.', duration: 10000 });
      resolverEspacioYArrancar();
      return;
    }
    /* estado 'activo' → quedó dentro */
    try { await sb.rpc('cerrar_invitacion', { p_token: token, p_resultado: 'aceptada' }); } catch (e) { console.warn('[inv] cerrar_invitacion', e); }
    _invCerrarOverlay();
    showToast({ kind: 'success', title: 'Bienvenida/o', body: 'Tu autorización quedó registrada y ya eres parte de la productora.' });
    resolverEspacioYArrancar();
  } catch (e) {
    const raw = (e && e.message) ? String(e.message) : '';
    /* Excepción de requisitos: TAKEOS_REQUISITOS:perfil,banca (no silenciosa). */
    const m = raw.match(/TAKEOS_REQUISITOS:\s*([a-z,\s]+)/i);
    if (m) {
      const faltan = m[1].split(',').map(x => x.trim()).filter(Boolean);
      /* V11.15.0 · cuerpo del aviso por tokens: datos personales / fecha de nacimiento / datos bancarios. */
      const _txt = [
        faltan.indexOf('perfil') >= 0 ? 'tus datos personales' : (faltan.indexOf('edad') >= 0 ? 'tu fecha de nacimiento' : null),
        faltan.indexOf('banca') >= 0 ? 'tus datos bancarios' : null
      ].filter(Boolean).join(' y ');
      _invCerrarOverlay();
      showToast({ kind: 'warning', title: 'Completa tu perfil para aceptar', body: 'Para colaborar, completa ' + (_txt || 'algunos datos obligatorios') + '.', duration: 8000 });
      invCompletarPerfil(token, faltan.indexOf('banca') >= 0, faltan, null);
      return;
    }
    showToast({ kind: 'error', title: 'No se pudo aceptar', body: (raw.replace(/^consentir_invitacion:\s*/i, '') || 'No se pudo completar.'), duration: 9000 });
    if (btn) { btn.disabled = false; btn.textContent = 'Aceptar y colaborar'; }
  }
}
async function invRechazar(token) {
  try {
    const { error } = await sb.rpc('cerrar_invitacion', { p_token: token, p_resultado: 'rechazada' });
    if (error) throw error;
    showToast({ kind: 'info', title: 'Invitación rechazada', body: 'La productora verá que no aceptaste.' });
  } catch (e) {
    console.warn('[inv] rechazar', e);
  }
  _invCerrarOverlay();
  resolverEspacioYArrancar();
}

// ── Window bridges (3 barridos func+const) ──
window.PERFIL_CODIGO_POR_NOMBRE = PERFIL_CODIGO_POR_NOMBRE;
window.PERFIL_NOMBRE_POR_CODIGO = PERFIL_NOMBRE_POR_CODIGO;
window._invMostrarResultado = _invMostrarResultado;
window.abrirInvitacionRecibida = abrirInvitacionRecibida;
window.dalInvitar = dalInvitar;
window.invAceptar = invAceptar;
window.invCopiarLink = invCopiarLink;
window.invRechazar = invRechazar;
window.invitacionLink = invitacionLink;
