// Documentos del proyecto (Creative Hub) — extraído de index.html (Etapa C1)

// D1a · imports reales (los bridges window de los productores se conservan
// mientras otros consumidores window existan; ver Plan de Desacople v1.1)
import { escapeHtml, safeUrl, showToast } from '../lib/helpers.js';
import { sb } from '../lib/supabase.js';
import { STATE } from '../lib/state.js';
import { showModal } from '../lib/ui.js';
import { dalTouchProyecto } from './dal.js';
import { markDirty, autosaveNow } from './persistencia-local.js';

/* ════════════════════════════════════════════════════════════════════
   V6.7 — MÓDULO DOCUMENTOS / CREATIVE HUB (V1)
   Centro documental del proyecto: reemplaza el rol de Milanote/Excel para
   brief, tratamientos, referencias y contexto. Diseñado como sistema final.
   V1: registro por link (persiste). El hosting de archivos (subir el archivo
   mismo) se conecta con el backend (Fase 2).
   ════════════════════════════════════════════════════════════════════ */
/* V11.3.0 · DOC_CATEGORIES ya NO estructura la pestaña: Documentos es un
   repositorio modular (el usuario crea, nombra y describe cada documento).
   La lista se conserva solo para etiquetar datos creados antes de V11.3. */
function ensureDocs(project) {
  if (!project.data.documentos) project.data.documentos = { items: [] };
  if (!Array.isArray(project.data.documentos.items)) project.data.documentos.items = [];
  return project.data.documentos;
}
function docNewId() { return 'doc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function renderDocumentos() {
  const project = STATE.currentProject; if (!project) return;
  const docs = ensureDocs(project);
  const content = document.getElementById('moduleContent');
  /* V11.3.0 · repositorio MODULAR: nada viene predefinido. El usuario agrega
     el documento que necesita, le pone nombre libre, lo describe y decide si
     adjunta un archivo, un link, o deja solo el registro (documento pendiente). */
  const items = (docs.items || []).slice().sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  content.innerHTML = `
    <div id="docDropZone" ondragover="docDragOver(event)" ondragleave="docDragLeave(event)" ondrop="docDrop(event)" style="border-radius:12px;transition:outline .15s;outline:2px dashed transparent;outline-offset:6px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:var(--space-4);flex-wrap:wrap;">
      <p style="margin:0;font-size:13px;color:var(--ink-secondary);line-height:1.5;max-width:62ch;">Repositorio de documentación del proyecto: producción, creativo, legal, cliente, referencias o gestión interna. Cada documento lleva nombre libre, descripción y, si corresponde, un archivo adjunto (PDF, imágenes, Office, hasta 15 MB) o un link. <strong>También puedes arrastrar archivos aquí</strong>: cada uno crea su documento.</p>
      <button class="btn btn-primary" onclick="docAdd()">+ Agregar documento</button>
    </div>
    ${items.length
      ? `<div style="display:flex;flex-direction:column;gap:10px;">${items.map(d => docRowHTML(d)).join('')}</div>`
      : `<div style="border:1px dashed var(--rule);border-radius:12px;padding:36px;text-align:center;color:var(--ink-faint);font-size:13px;">Aún no hay documentos en este proyecto. Arrastra archivos aquí o usa «+ Agregar documento».<br><span style="font-size:12px;">Ejemplos: Brief cliente · Tratamiento de dirección · Referencias visuales · Guion aprobado · Moodboard · Minuta reunión inicial.</span></div>`}
    </div>
  `;
  document.getElementById('moduleHeaderActions').innerHTML = '';
}
function docRowHTML(d) {
  const tieneArchivo = !!d.archivo;
  const tieneLink = !!(d.url || '').trim();
  const estado = tieneArchivo ? '' : (tieneLink ? '' : '<span style="font-size:10.5px;font-weight:600;color:var(--warning);border:1px solid var(--warning);border-radius:999px;padding:1px 8px;">pendiente de adjunto</span>');
  return `<div style="border:1px solid var(--rule);border-radius:10px;padding:14px;background:var(--bg-surface);">
    <div style="display:flex;gap:8px;align-items:center;">
      <input class="input" style="flex:1;font-weight:600;" value="${escapeHtml(d.titulo || '')}" placeholder="Nombre del documento (ej. Brief cliente, Moodboard, Guion aprobado…)" onchange="docSet('${d.id}','titulo',this.value)">
      ${estado}
      <button class="btn btn-danger btn-sm" onclick="docDelete('${d.id}')">Eliminar</button>
    </div>
    <textarea class="cot-input" style="margin-top:8px;min-height:48px;" placeholder="Descripción / contexto / instrucciones…" onchange="docSet('${d.id}','notas',this.value)">${escapeHtml(d.notas || '')}</textarea>
    <div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap;">
      ${tieneArchivo ? `<span style="font-size:12.5px;color:var(--ink-secondary);">📎 ${escapeHtml(d.archivo.nombre || 'documento')} <span style="color:var(--ink-faint);">(${docFmtSize(d.archivo.size)})</span></span>
        <button class="btn btn-secondary btn-sm" onclick="docOpenArchivo('${d.id}')">Abrir ↗</button>
        <button class="btn btn-secondary btn-sm" style="color:#d08;border-color:rgba(210,0,80,.4);" onclick="docRemoveArchivo('${d.id}')">Quitar archivo</button>`
      : `<label class="btn btn-secondary btn-sm" style="cursor:pointer;">📎 Adjuntar archivo<input type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" style="display:none" onchange="docAttachPDF('${d.id}', this)"></label>
         <span style="font-size:11px;color:var(--ink-faint);">PDF, imágenes, Office, texto o ZIP · hasta 15 MB.</span>`}
    </div>
    <details style="margin-top:8px;font-size:12px;color:var(--ink-secondary);" ${tieneLink ? 'open' : ''}>
      <summary style="cursor:pointer;color:var(--ink-faint);font-size:11.5px;">Link externo (opcional)</summary>
      <div style="display:flex;gap:8px;margin-top:6px;">
        <input class="input" style="flex:1;" value="${escapeHtml(d.url || '')}" placeholder="https://… (Drive, Dropbox, Milanote…)" onchange="docSet('${d.id}','url',this.value)">
        ${tieneLink ? `<a class="btn btn-secondary btn-sm" href="${safeUrl(d.url)}" target="_blank" rel="noopener">Abrir ↗</a>` : ''}
      </div>
    </details>
  </div>`;
}
function docAdd(cat) {
  const project = STATE.currentProject; const docs = ensureDocs(project);
  docs.items.push({ id: docNewId(), categoria: cat || 'general', titulo: '', url: '', notas: '', ts: new Date().toISOString() });
  markDirty(); renderDocumentos();
}
function docDragOver(ev) { ev.preventDefault(); const z = document.getElementById('docDropZone'); if (z) z.style.outline = '2px dashed var(--accent)'; }
function docDragLeave(ev) { const z = document.getElementById('docDropZone'); if (z) z.style.outline = '2px dashed transparent'; }
function docDrop(ev) {
  ev.preventDefault();
  const z = document.getElementById('docDropZone'); if (z) z.style.outline = '2px dashed transparent';
  const files = (ev.dataTransfer && ev.dataTransfer.files) ? Array.from(ev.dataTransfer.files) : [];
  if (!files.length) return;
  const docs = ensureDocs(STATE.currentProject);
  files.forEach(function (file) {
    const titulo = String(file.name || 'Documento').replace(/\.[^.]+$/, '');
    const d = { id: docNewId(), categoria: 'general', titulo: titulo, url: '', notas: '', ts: new Date().toISOString() };
    docs.items.push(d);
    _docAdjuntarFile(d.id, file);
  });
  markDirty(); renderDocumentos();
}
function docSet(id, field, val) {
  const docs = ensureDocs(STATE.currentProject); const d = docs.items.find(x => x.id === id);
  if (d) { d[field] = val; markDirty(); }
}
function docDelete(id) {
  showModal({
    title: 'Eliminar documento', body: '¿Quitar este documento del registro? No borra el archivo original (vive en su link), solo la referencia en TakeOS.',
    confirmLabel: 'Eliminar', cancelLabel: 'Cancelar', danger: true,
    onConfirm: () => { const docs = ensureDocs(STATE.currentProject); const i = docs.items.findIndex(x => x.id === id); if (i >= 0) { docs.items.splice(i, 1); markDirty(); renderDocumentos(); } }
  });
}
function docFmtSize(bytes) { const b = Number(bytes) || 0; if (b < 1024) return b + ' B'; if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB'; return (b / 1024 / 1024).toFixed(1) + ' MB'; }
/* ── V9.6.1 · PDFs de Documentos en Supabase Storage (bucket privado) ─────────
   Antes el PDF se guardaba como base64 en el estado local (tope ~600 KB
   por el límite de tamaño de documento). Ahora el binario sube al bucket
   privado 'documentos-proyecto' y la BD guarda solo la RUTA (project_documents
   .archivo_path), sincronizada vía la RPC guardar_operaciones_4e. El nombre abre
   el archivo con URL firmada (1 h). Sin ese límite de documento, el tope sube a
   15 MB (cubre briefs/tratamientos/decks reales). FAIL-SAFE: si Storage no está
   disponible, cae a base64 local (comportamiento previo). Soporta documentos
   mixtos {dataUrl} (legado) y {path} (Storage). */
const STORAGE_BUCKET_DOCS = 'documentos-proyecto';
const DOC_PDF_MAX = 15 * 1024 * 1024;   // 15 MB (en Storage no hay límite de documento)
function _docStoragePath(projId, name) {
  const safe = String(name || 'documento.pdf').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  return ORG_ID + '/' + (projId || 'proyecto') + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safe;
}
async function _uploadDocPDF(projId, file) {
  if (!sb || PROJECTS_SOURCE !== 'supabase' || !sb.storage || !file) return null;
  try {
    const path = _docStoragePath(projId, file.name);
    const { error } = await sb.storage.from(STORAGE_BUCKET_DOCS).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (error) throw error;
    return { path: path };
  } catch (e) { console.warn('[storage] PDF de documento no disponible; se guarda local (base64)', e); return null; }
}
const DOC_EXT_PERMITIDAS = /\.(pdf|jpe?g|png|gif|webp|docx?|xlsx?|pptx?|txt|csv|zip)$/i;
function docAttachPDF(id, input) {
  const file = input && input.files && input.files[0]; if (!file) return;
  _docAdjuntarFile(id, file);
  try { input.value = ''; } catch (e) {}
}
/* V11.3.1 · adjunto reutilizable: lo usan el botón «Adjuntar archivo» y el
   arrastre de archivos al módulo (cada drop crea documento + adjunta). */
function _docAdjuntarFile(id, file) {
  if (!file) return;
  if (!DOC_EXT_PERMITIDAS.test(file.name || '')) { showToast({ kind: 'warning', title: 'Formato no permitido', body: 'Acepta PDF, imágenes, Word/Excel/PowerPoint, TXT, CSV o ZIP. Para otros formatos, usa el link.' }); return; }
  if (file.size > DOC_PDF_MAX) { showToast({ kind: 'warning', title: 'Archivo muy grande', body: 'El archivo supera los 15 MB. Súbelo a Drive/Dropbox y pega el link, o comprímelo.' }); return; }
  const project = STATE.currentProject;
  // 1) intenta subir a Storage; 2) si no, cae a base64 local (fail-safe).
  _uploadDocPDF(project ? project.id : '', file).then(function (up) {
    const docs = ensureDocs(STATE.currentProject); const d = docs.items.find(x => x.id === id); if (!d) return;
    if (up && up.path) {
      d.archivo = { nombre: file.name || 'documento', path: up.path, size: file.size };
      markDirty(); autosaveNow();
      try { if (project) dalTouchProyecto(project); } catch (e) {}   // sincroniza la RUTA (no el binario)
      renderDocumentos();
      showToast({ kind: 'success', title: 'Archivo subido', body: (file.name || 'Archivo') + ' quedó en la nube.' });
      return;
    }
    // Fallback: base64 local (como antes). Acá sí aplica el tope chico del modo local.
    if (file.size > 600 * 1024) { showToast({ kind: 'warning', title: 'Sin nube disponible', body: 'Storage no está disponible y el archivo supera ~600 KB para guardarlo local. Usa el link, o reintenta más tarde.' }); return; }
    const reader = new FileReader();
    reader.onload = function () {
      const d2 = ensureDocs(STATE.currentProject).items.find(x => x.id === id);
      if (d2) { d2.archivo = { nombre: file.name || 'documento', dataUrl: reader.result, size: file.size }; markDirty(); autosaveNow(); renderDocumentos(); showToast({ kind: 'info', title: 'Archivo adjuntado (local)', body: (file.name || 'Archivo') + ' quedó en este navegador; sube a la nube al activar Storage.' }); }
    };
    reader.onerror = function () { showToast({ kind: 'error', title: 'No se pudo leer', body: 'Hubo un problema leyendo el archivo.' }); };
    reader.readAsDataURL(file);
  });
}
async function docOpenArchivo(id) {
  const docs = ensureDocs(STATE.currentProject); const d = docs.items.find(x => x.id === id);
  if (!d || !d.archivo) return;
  // Storage: abrir con URL firmada.
  if (d.archivo.path) {
    if (!sb || !sb.storage) { try { showToast({ kind: 'info', title: 'Documento en la nube', body: 'No hay conexión con Storage para abrirlo ahora.' }); } catch (e) {} return; }
    try {
      const { data, error } = await sb.storage.from(STORAGE_BUCKET_DOCS).createSignedUrl(d.archivo.path, 3600);
      if (error) throw error; if (data && data.signedUrl) window.open(data.signedUrl, '_blank');
    } catch (e) { try { showToast({ kind: 'warning', title: 'No disponible', body: 'No se pudo abrir el PDF.' }); } catch (x) {} }
    return;
  }
  // Legado: base64 local.
  if (!d.archivo.dataUrl) return;
  try {
    const parts = String(d.archivo.dataUrl).split(','); const bstr = atob(parts[1] || ''); const n = bstr.length; const u8 = new Uint8Array(n);
    for (let i = 0; i < n; i++) u8[i] = bstr.charCodeAt(i);
    const blob = new Blob([u8], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob); window.open(url, '_blank');
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  } catch (e) { try { window.open(d.archivo.dataUrl, '_blank'); } catch (e2) {} }
}
function docRemoveArchivo(id) {
  showModal({
    title: 'Quitar PDF adjunto', body: '¿Quitar el PDF adjunto de este documento? El registro (título, link, notas) se conserva.',
    confirmLabel: 'Quitar PDF', cancelLabel: 'Cancelar', danger: true,
    onConfirm: () => {
      const project = STATE.currentProject; const docs = ensureDocs(project); const d = docs.items.find(x => x.id === id);
      if (d) {
        if (d.archivo && d.archivo.path && sb && sb.storage) { try { sb.storage.from(STORAGE_BUCKET_DOCS).remove([d.archivo.path]); } catch (e) {} }
        const teniaPath = !!(d.archivo && d.archivo.path);
        delete d.archivo; markDirty(); autosaveNow();
        if (teniaPath) { try { if (project) dalTouchProyecto(project); } catch (e) {} }
        renderDocumentos();
      }
    }
  });
}


// ── Window bridges (3 barridos: externos, auto-consumo, nombre-string) ──
window.docAdd = docAdd;
window.docAttachPDF = docAttachPDF;
window.docDelete = docDelete;
window.docDragLeave = docDragLeave;
window.docDragOver = docDragOver;
window.docDrop = docDrop;
window.docOpenArchivo = docOpenArchivo;
window.docRemoveArchivo = docRemoveArchivo;
window.docSet = docSet;
window.renderDocumentos = renderDocumentos;
