// Import/Export XLSX de la Base de Datos — extraído de index.html (Etapa A3)
// src/modules/bd-excel.js
// Incluye normalizadores (_normKey, _norm*BD), tablas SBIF de bancos y los
// flujos de exportar/importar/plantilla de la BD. La UI de la BD vive en bd.js.

// D1d · imports reales. DIFERIDA la arista a bd (renderBDPersonas queda vía
// window): bd importará bd-excel — no cerrar el ciclo ESM.
import { escapeHtml, showToast } from '../lib/helpers.js';
import { BD_CONTACTOS, BD_EMPRESAS, BD_EMPRESAS_BYID, BD_PERSONAS, BD_TALENTOS, STATE } from '../lib/state.js';
import { _buildPerfilPago, _buildPerfilTalento, _clearStore, _dedupKeys, _genId, ingestLegacyIntoContactos, syncLegacyFromContactos } from '../lib/modelo.js';
import { comboboxAddEmpresaToBD, showModal } from '../lib/ui.js';
import { getBDPresupuesto } from './presupuesto-cotizacion.js';
import { dalFinishBulkImport } from './dal.js';
import { autosaveNow, markDirty, pushSnapshot } from './persistencia-local.js';

import { renderBDPersonas } from './bd.js';
import { define } from '../lib/ganchos.js';
let _bdReplaceAll;   // D4c: estado propio del módulo (antes window._bdReplaceAll, era de los handlers inline)
/* Helper para datalists: lista de nombres para autocompletar */
/* ════════════════════════════════════════════════════════════════════
   V5.7 (Nota 4) · IMPORTACIÓN DE LA BD DESDE EXCEL (.xlsx)
   ════════════════════════════════════════════════════════════════════
   Cliente-side, sin backend. SheetJS se carga bajo demanda desde cdnjs
   (solo al descargar la plantilla o importar). Decisiones de Agustín:
   - Columnas: sin Razón Social; con Dirección, línea 2 (opc.) y Comuna.
   - Duplicados se detectan por RUT.
   - En conflicto se FUSIONA (rellena vacíos, no pisa lo existente).
   - Único campo obligatorio: Nombre.
   - Importación parcial + resumen de lo omitido.
   ════════════════════════════════════════════════════════════════════ */

export function _normKey(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[°º]/g, '').replace(/\s+/g, ' ').trim();
}
function _normRut(r) {
  return String(r == null ? '' : r).replace(/[.\-\s]/g, '').toLowerCase();
}
// Mapa de encabezado normalizado → campo interno
const BD_HEADER_MAP = (() => {
  const m = {};
  const add = (field, ...aliases) => aliases.forEach(a => { m[_normKey(a)] = field; });
  add('nombre', 'Nombre', 'nombre completo');
  add('mail', 'Email', 'mail', 'correo', 'e-mail');
  add('telefono', 'Teléfono', 'telefono', 'fono', 'celular');
  add('rolHabitual', 'Rol habitual', 'rol');
  add('dteHabitual', 'Tipo DTE', 'dte', 'tipo de dte');
  add('rut', 'RUT', 'rut');
  add('banco', 'Banco');
  add('tipoCuenta', 'Tipo de cuenta', 'tipo cuenta');
  add('numeroCuenta', 'N° de cuenta', 'numero de cuenta', 'n de cuenta', 'cuenta', 'nro cuenta');
  add('restriccion', 'Restricciones alimenticias', 'restriccion', 'restricciones');
  add('direccion', 'Dirección', 'direccion');
  add('direccion2', 'Dirección (línea 2)', 'direccion linea 2', 'direccion 2', 'linea 2');
  add('comuna', 'Comuna');
  return m;
})();

// Carga SheetJS bajo demanda (cdnjs). Resuelve con window.XLSX.
function ensureXLSX() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('No se pudo inicializar la librería de Excel.'));
    s.onerror = () => reject(new Error('No se pudo cargar la librería de Excel. Revisa tu conexión a internet e inténtalo de nuevo.'));
    document.head.appendChild(s);
  });
}

/* V9.6.13: ExcelJS bajo demanda. SheetJS (arriba) no soporta estilos de celda
   (colores/negritas/bordes) en su edición libre; ExcelJS sí, y además formato
   de número y fórmulas. Se usa SOLO para los exports con estilo (Presupuesto).
   El import de la BD sigue en SheetJS. Resuelve con window.ExcelJS. */
function ensureExcelJS() {
  return new Promise((resolve, reject) => {
    if (window.ExcelJS) return resolve(window.ExcelJS);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
    s.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('No se pudo inicializar la librería de Excel (ExcelJS).'));
    s.onerror = () => reject(new Error('No se pudo cargar la librería de Excel. Revisa tu conexión a internet e inténtalo de nuevo.'));
    document.head.appendChild(s);
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   IMPORT / EXPORT .XLSX V7.1 — 3 PESTAÑAS BIDIRECCIONALES
   ─────────────────────────────────────────────────────────────────────
   El export simétrico es la clave: si exportas → editas afuera → reimportas,
   no se pierde nada. Las claves de dedup son: RUT (PERSONAS, EMPRESAS) y
   Nombre+Email (TALENTOS, que rara vez tienen RUT).
   ═══════════════════════════════════════════════════════════════════════ */
const HEADERS_PERSONAS_V71 = [
  'RUT','Nombre','Email','Teléfono','Roles','Rol habitual',
  'Empresa asociada','Relación con empresa','Tipo DTE','Banco','Código banco',
  'Tipo de cuenta','N° de cuenta','Restricción alimentaria',
  'Dirección','Dirección (línea 2)','Comuna','Ciudad','Fecha de nacimiento','Notas'
];
const HEADERS_EMPRESAS_V71 = [
  'RUT empresa','Nombre de fantasía','Razón social','Tipo','Giro SII',
  'Giro informal','Contacto principal','Email contacto','Teléfono contacto',
  'Web','Notas'
];
const HEADERS_TALENTOS_V71 = [
  'Nombre','Email','Teléfono','Género','Edad','Altura',
  'Apariencia étnica','Ciudad','Áreas de interés',
  'Talla polera','Talla pantalón','Talla calzado',
  'Fotos (link)','Reel (link)','Notas'
];

// Normalizadores espejo del build_bd.py
export function _normRutBD(rut) {
  if (rut == null) return '';
  const clean = String(rut).replace(/[^\dkK]/g, '').toUpperCase();
  if (clean.length < 7) return '';
  const body = clean.slice(0, -1), dv = clean.slice(-1);
  const rev = body.split('').reverse().join('');
  const chunks = [];
  for (let i = 0; i < rev.length; i += 3) chunks.push(rev.slice(i, i+3));
  const bodyFmt = chunks.map(c => c.split('').reverse().join('')).reverse().join('.');
  return `${bodyFmt}-${dv}`;
}
export function _normPhoneBD(p) {
  if (p == null) return '';
  let digits = String(p).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('56')) digits = digits.slice(2);
  if (digits.length === 9 && digits[0] === '9') return `+56 9 ${digits.slice(1,5)} ${digits.slice(5)}`;
  if (digits.length === 8) return `+56 2 ${digits.slice(0,4)} ${digits.slice(4)}`;
  return digits ? `+${digits}` : '';
}
export function _normEmailBD(e) {
  if (e == null) return '';
  const s = String(e).toLowerCase().trim();
  return s.indexOf('@') === -1 ? '' : s;
}
export function _normNameBD(n) {
  if (n == null) return '';
  const low = ['de','del','la','las','el','los','y','da','do'];
  return String(n).trim().split(/\s+/).map((w, i) => {
    const wl = w.toLowerCase();
    if (i > 0 && low.indexOf(wl) !== -1) return wl;
    if (w.length <= 2 && i > 0) return wl;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

/* ─── BANCOS CHILENOS · códigos SBIF oficiales (V7.2) ──────────────────
   Fuente: nómina CMF/SBIF. Estos son los códigos de 3 dígitos que usa
   Office Banking de Santander (y todos los bancos) para nóminas de
   transferencias masivas. El nombre oficial va en MAYÚSCULAS. */
const BANCOS_SBIF = [
  { codigo: '001', nombre: 'BANCO DE CHILE' },
  { codigo: '009', nombre: 'BANCO INTERNACIONAL' },
  { codigo: '012', nombre: 'BANCOESTADO' },
  { codigo: '014', nombre: 'SCOTIABANK' },
  { codigo: '016', nombre: 'BANCO BCI' },
  { codigo: '028', nombre: 'BANCO BICE' },
  { codigo: '031', nombre: 'BANCO HSBC' },
  { codigo: '037', nombre: 'BANCO SANTANDER' },
  { codigo: '039', nombre: 'BANCO ITAÚ' },
  { codigo: '049', nombre: 'BANCO SECURITY' },
  { codigo: '051', nombre: 'BANCO FALABELLA' },
  { codigo: '053', nombre: 'BANCO RIPLEY' },
  { codigo: '055', nombre: 'BANCO CONSORCIO' },
  { codigo: '504', nombre: 'SCOTIABANK AZUL (EX BBVA)' },
  { codigo: '672', nombre: 'COOPEUCH' },
  { codigo: '729', nombre: 'PREPAGO LOS HÉROES' },
  { codigo: '730', nombre: 'TENPO' },
  { codigo: '732', nombre: 'TAPP (CAJA LOS ANDES)' },
  { codigo: '738', nombre: 'GLOBAL66' },
  { codigo: '875', nombre: 'MERCADO PAGO' }
];
/* Mapa nombre-normalizado → código (acepta variantes comunes de escritura). */
const _BANCO_ALIAS = {
  'banco de chile': '001', 'banco chile': '001', 'bancochile': '001', 'edwards': '001', 'banco edwards': '001',
  'banco internacional': '009',
  'bancoestado': '012', 'banco estado': '012', 'banco del estado': '012', 'banco del estado de chile': '012', 'estado': '012',
  'scotiabank': '014', 'scotia': '014', 'bancodesarrollo': '014',
  'banco bci': '016', 'bci': '016', 'mach': '016', 'tbanc': '016',
  'banco bice': '028', 'bice': '028',
  'banco hsbc': '031', 'hsbc': '031',
  'banco santander': '037', 'santander': '037', 'banefe': '037',
  'banco itaú': '039', 'banco itau': '039', 'itau': '039', 'itaú': '039', 'corpbanca': '039', 'itaú corpbanca': '039',
  'banco security': '049', 'security': '049',
  'banco falabella': '051', 'falabella': '051',
  'banco ripley': '053', 'ripley': '053',
  'banco consorcio': '055', 'consorcio': '055',
  'scotiabank azul': '504', 'bbva': '504', 'scotiabank azul (ex bbva)': '504',
  'coopeuch': '672',
  'prepago los héroes': '729', 'los héroes': '729', 'los heroes': '729',
  'tenpo': '730',
  'tapp': '732', 'tapp (caja los andes)': '732', 'caja los andes': '732',
  'global66': '738', 'global 66': '738',
  'mercado pago': '875', 'mercadopago': '875'
};
/* Devuelve el código SBIF a partir de un nombre de banco (cualquier variante). '' si no matchea. */
export function _codigoBancoSBIF(banco) {
  if (!banco) return '';
  const key = String(banco).trim().toLowerCase();
  if (_BANCO_ALIAS[key]) return _BANCO_ALIAS[key];
  // Búsqueda parcial: si el nombre contiene un alias conocido
  for (const alias of Object.keys(_BANCO_ALIAS)) {
    if (key.indexOf(alias) !== -1) return _BANCO_ALIAS[alias];
  }
  return '';
}
/* Devuelve el nombre oficial en MAYÚSCULAS a partir de cualquier variante. Si no matchea, devuelve el original. */
function _nombreBancoOficial(banco) {
  const codigo = _codigoBancoSBIF(banco);
  if (!codigo) return banco || '';
  const found = BANCOS_SBIF.find(b => b.codigo === codigo);
  return found ? found.nombre : (banco || '');
}

/* Lee una hoja de SheetJS como array-of-objects, con header en la fila indicada (0-based). */
function _readSheet(XLSX, ws, headerRowIdx) {
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  if (rows.length <= headerRowIdx) return [];
  const headers = rows[headerRowIdx].map(h => String(h || '').trim());
  const out = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c === '' || c == null)) continue;
    const obj = {};
    headers.forEach((h, j) => { obj[h] = row[j] != null ? String(row[j]).trim() : ''; });
    out.push(obj);
  }
  return out;
}

/* Detecta la fila del header en una hoja (busca la primera fila que contenga
   alguno de los headers esperados). Devuelve -1 si no encuentra. */
function _detectHeaderRow(XLSX, ws, expectedHeaders) {
  if (!ws) return -1;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  const expectedSet = new Set(expectedHeaders.map(h => h.toLowerCase()));
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i] || [];
    let hits = 0;
    for (const c of r) {
      if (typeof c === 'string' && expectedSet.has(c.trim().toLowerCase())) hits++;
    }
    if (hits >= 3) return i;  // 3 matches → es la fila de headers
  }
  return -1;
}

/* ─── EXPORTAR BD COMPLETA A .XLSX ─────────────────────────────────── */
/* ─── HEADERS del .xlsx unificado V7.3 ─────────────────────────────── */
const HDR_CONTACTOS_V73 = ['ID','Nombre','RUT','Email','Teléfono','Roles','Rol habitual',
  'Empresa','Relación con empresa','Dirección','Dirección (línea 2)','Comuna','Ciudad',
  'Restricción alimentaria','Fecha de nacimiento','Notas',
  'Banco','Código banco','Tipo de cuenta','N° de cuenta','Tipo DTE',
  'Género','Edad','Altura','Apariencia étnica','Áreas de interés',
  'Talla polera','Talla pantalón','Talla calzado','Fotos (link)','Reel (link)'];
const HDR_EMPRESAS_V73 = ['ID','RUT empresa','Nombre de fantasía','Razón social','Tipo','Giro SII',
  'Giro informal','Contacto principal','Email contacto','Teléfono contacto','Web','Notas'];

/* ─── EXPORTAR BD a .xlsx (CONTACTOS + EMPRESAS) ───────────────────── */
async function exportBDExcelV71() {   // nombre conservado por compat con el botón
  let XLSX;
  try { XLSX = await ensureXLSX(); }
  catch (e) { showToast({ kind: 'error', title: 'No se pudo exportar', body: e.message }); return; }
  const wb = XLSX.utils.book_new();

  const empresaNombre = (eid) => (BD_EMPRESAS_BYID[eid] ? BD_EMPRESAS_BYID[eid].nombreFantasia : '');
  const contRows = [HDR_CONTACTOS_V73].concat(
    Object.keys(BD_CONTACTOS)
      .map(id => BD_CONTACTOS[id])
      .sort((a, b) => (a.nombre || '').toLowerCase().localeCompare((b.nombre || '').toLowerCase()))
      .map(c => {
        const pago = c.perfilPago || {}, tal = c.perfilTalento || {};
        return [
          c.id, c.nombre || '', c.rut || '', c.email || '', c.telefono || '',
          Array.isArray(c.roles) ? c.roles.join(', ') : 'Crew', c.rolHabitual || '',
          empresaNombre(c.empresaId), c.relacionEmpresa || '',
          c.direccion || '', c.direccionLinea2 || '', c.comuna || '', c.ciudad || '',
          c.restriccion || '', c.fechaNacimiento || '', c.notas || '',
          pago.banco || '', pago.codigoBanco || '', pago.tipoCuenta || '', pago.nCuenta || '', pago.tipoDTE || '',
          tal.genero || '', tal.edad || '', tal.altura || '', tal.apariencia || '', tal.areas || '',
          tal.tallaPolera || '', tal.tallaPantalon || '', tal.tallaCalzado || '', tal.fotosLink || '', tal.reelLink || ''
        ];
      })
  );
  const wsC = XLSX.utils.aoa_to_sheet(contRows);
  wsC['!cols'] = HDR_CONTACTOS_V73.map(h => ({ wch: Math.max(14, h.length + 3) }));
  XLSX.utils.book_append_sheet(wb, wsC, 'CONTACTOS');

  const empRows = [HDR_EMPRESAS_V73].concat(
    Object.keys(BD_EMPRESAS_BYID)
      .map(id => BD_EMPRESAS_BYID[id])
      .sort((a, b) => (a.nombreFantasia || '').toLowerCase().localeCompare((b.nombreFantasia || '').toLowerCase()))
      .map(e => [
        e.id, e.rutEmpresa || '', e.nombreFantasia || '', e.razonSocial || '', e.tipo || '',
        e.giroSII || '', e.giroInformal || '', e.contactoPrincipal || '', e.emailContacto || '',
        e.telefonoContacto || '', e.web || '', e.notas || ''
      ])
  );
  const wsE = XLSX.utils.aoa_to_sheet(empRows);
  wsE['!cols'] = HDR_EMPRESAS_V73.map(h => ({ wch: Math.max(14, h.length + 3) }));
  XLSX.utils.book_append_sheet(wb, wsE, 'EMPRESAS');

  const now = new Date(), pad = n => String(n).padStart(2, '0');
  const fname = `TakeOS_BD_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}.xlsx`;
  XLSX.writeFile(wb, fname);
  showToast({ kind: 'success', title: 'BD exportada',
    body: `${Object.keys(BD_CONTACTOS).length} contactos · ${Object.keys(BD_EMPRESAS_BYID).length} empresas en <strong>${escapeHtml(fname)}</strong>.` });
}

/* ─── V9.6.4 · DESCARGAR PLANILLA (vacía) para migrar contactos ─────────────
   Genera un .xlsx vacío en el MISMO formato que lee "Importar BD": pestañas
   CONTACTOS y EMPRESAS con los encabezados exactos (HDR_*_V73) + una fila de
   ejemplo + una hoja de Instrucciones. El usuario llena su base aquí y luego
   la importa (fusión, que sincroniza a Supabase). La columna ID se deja vacía:
   el sistema asigna el id al importar (no hay que tocarla). */
async function downloadBDPlantilla() {
  let XLSX;
  try { XLSX = await ensureXLSX(); }
  catch (e) { showToast({ kind: 'error', title: 'No se pudo generar la planilla', body: e.message }); return; }
  const wb = XLSX.utils.book_new();

  // Hoja CONTACTOS: encabezados + 1 fila de ejemplo (ID vacío a propósito)
  const ejemploC = ['', 'Juan Pérez Soto', '12.345.678-9', 'juan.perez@gmail.com', '+56 9 1234 5678',
    'Crew', 'Gaffer', '', '', 'Av. Siempreviva 742', 'Depto 502', 'Providencia', 'Santiago',
    'Sin gluten', '', '', 'Banco de Chile', '', 'Cuenta Corriente', '00012345678', 'boleta',
    '', '', '', '', '', '', '', '', '', ''];
  const wsC = XLSX.utils.aoa_to_sheet([HDR_CONTACTOS_V73, ejemploC]);
  wsC['!cols'] = HDR_CONTACTOS_V73.map(h => ({ wch: Math.max(14, h.length + 3) }));
  XLSX.utils.book_append_sheet(wb, wsC, 'CONTACTOS');

  // Hoja EMPRESAS: encabezados + 1 fila de ejemplo
  const ejemploE = ['', '76.543.210-K', 'Marca X', 'Marca X SpA', 'Cliente', '', '', 'Juan Pérez Soto', 'contacto@marcax.cl', '+56 2 2345 6789', 'https://marcax.cl', ''];
  const wsE = XLSX.utils.aoa_to_sheet([HDR_EMPRESAS_V73, ejemploE]);
  wsE['!cols'] = HDR_EMPRESAS_V73.map(h => ({ wch: Math.max(14, h.length + 3) }));
  XLSX.utils.book_append_sheet(wb, wsE, 'EMPRESAS');

  // Hoja Instrucciones
  const instr = [
    ['Planilla de migración — Base de Datos · TakeOS'],
    [''],
    ['Cómo usarla:'],
    ['1. Llena la pestaña CONTACTOS (una fila por persona) y, si corresponde, EMPRESAS.'],
    ['2. Borra la fila de ejemplo antes de importar (o reemplázala con datos reales).'],
    ['3. Guarda como .xlsx y súbela con el botón "Importar BD (.xlsx)".'],
    [''],
    ['Reglas:'],
    ['• Deja la columna "ID" VACÍA: el sistema asigna el identificador al importar.'],
    ['• Único campo obligatorio en CONTACTOS: Nombre. Las filas sin nombre se omiten.'],
    ['• La importación FUSIONA: actualiza por RUT/ID lo existente y agrega lo nuevo. Nunca borra.'],
    ['• Roles: separa varios con coma (ej. "Crew, Talento"). Si lo dejas vacío, queda "Crew".'],
    ['• Tipo DTE: usa "boleta" o "factura".'],
    ['• N° de cuenta: déjalo como texto para no perder los ceros a la izquierda.'],
    ['• Para vincular una persona a una empresa, escribe el nombre de la empresa en la columna'],
    ['  "Empresa" del CONTACTO y asegúrate de que esa empresa exista en la pestaña EMPRESAS.'],
    [''],
    ['Tipos de empresa válidos: Cliente, Proveedor, Agencia.'],
  ];
  const wi = XLSX.utils.aoa_to_sheet(instr);
  wi['!cols'] = [{ wch: 92 }];
  XLSX.utils.book_append_sheet(wb, wi, 'Instrucciones');

  XLSX.writeFile(wb, 'TakeOS_Planilla_BD.xlsx');
  showToast({ kind: 'success', title: 'Planilla descargada', body: 'Llénala (pestañas CONTACTOS y EMPRESAS) y vuelve a "Importar BD".' });
}

/* Carga las 3 hojas viejas (PERSONAS/EMPRESAS/TALENTOS) en las proyecciones
   legacy como área de paso; luego ingestLegacyIntoContactos() las unifica. */
function _loadLegacyDictsFrom3Tabs(XLSX, wsP, wsE, wsT) {
  if (wsP) {
    const hRow = _detectHeaderRow(XLSX, wsP, HEADERS_PERSONAS_V71);
    if (hRow !== -1) _readSheet(XLSX, wsP, hRow).forEach(r => {
      const nombre = _normNameBD(r['Nombre']); if (!nombre) return;
      const bancoRaw = String(r['Banco'] || '').trim();
      BD_PERSONAS[nombre] = {
        nombre, rut: _normRutBD(r['RUT']), email: _normEmailBD(r['Email']), mail: _normEmailBD(r['Email']),
        telefono: _normPhoneBD(r['Teléfono']),
        roles: String(r['Roles'] || 'Crew').split(',').map(s => s.trim()).filter(Boolean),
        rolHabitual: String(r['Rol habitual'] || '').trim(),
        empresaAsociada: String(r['Empresa asociada'] || '').trim(),
        relacionEmpresa: String(r['Relación con empresa'] || '').trim(),
        tipoDTE: String(r['Tipo DTE'] || '').trim(),
        banco: bancoRaw ? _nombreBancoOficial(bancoRaw) : '',
        codigoBanco: String(r['Código banco'] || '').trim() || _codigoBancoSBIF(bancoRaw),
        tipoCuenta: String(r['Tipo de cuenta'] || '').trim(), nCuenta: String(r['N° de cuenta'] || '').trim(),
        restriccion: String(r['Restricción alimentaria'] || '').trim(),
        direccion: String(r['Dirección'] || '').trim(), direccionLinea2: String(r['Dirección (línea 2)'] || '').trim(),
        comuna: String(r['Comuna'] || '').trim(), ciudad: String(r['Ciudad'] || '').trim(),
        fechaNacimiento: String(r['Fecha de nacimiento'] || r['Cumpleaños'] || '').trim(), notas: String(r['Notas'] || '').trim()
      };
    });
  }
  if (wsE) {
    const hRow = _detectHeaderRow(XLSX, wsE, HEADERS_EMPRESAS_V71);
    if (hRow !== -1) _readSheet(XLSX, wsE, hRow).forEach(r => {
      const nf = _normNameBD(r['Nombre de fantasía']); if (!nf) return;
      BD_EMPRESAS[nf] = {
        rutEmpresa: _normRutBD(r['RUT empresa']), nombreFantasia: nf,
        razonSocial: String(r['Razón social'] || '').trim(), tipo: String(r['Tipo'] || '').trim(),
        giroSII: String(r['Giro SII'] || '').trim(), giroInformal: String(r['Giro informal'] || '').trim(),
        contactoPrincipal: _normNameBD(r['Contacto principal']), emailContacto: _normEmailBD(r['Email contacto']),
        telefonoContacto: _normPhoneBD(r['Teléfono contacto']), web: String(r['Web'] || '').trim(), notas: String(r['Notas'] || '').trim()
      };
    });
  }
  if (wsT) {
    const hRow = _detectHeaderRow(XLSX, wsT, HEADERS_TALENTOS_V71);
    if (hRow !== -1) _readSheet(XLSX, wsT, hRow).forEach(r => {
      const nombre = _normNameBD(r['Nombre']); if (!nombre) return;
      BD_TALENTOS[nombre] = {
        nombre, email: _normEmailBD(r['Email']), telefono: _normPhoneBD(r['Teléfono']),
        genero: String(r['Género'] || '').trim(), edad: String(r['Edad'] || '').trim(), altura: String(r['Altura'] || '').trim(),
        apariencia: String(r['Apariencia étnica'] || '').trim(), ciudad: _normNameBD(r['Ciudad']),
        areas: String(r['Áreas de interés'] || '').trim(), tallaPolera: String(r['Talla polera'] || '').trim(),
        tallaPantalon: String(r['Talla pantalón'] || '').trim(), tallaCalzado: String(r['Talla calzado'] || '').trim(),
        fotosLink: String(r['Fotos (link)'] || '').trim(), reelLink: String(r['Reel (link)'] || '').trim(),
        notas: String(r['Notas'] || '').trim()
      };
    });
  }
}

/* Resuelve los vínculos contacto⇄empresa por nombre (ambas direcciones). */
function _resolveLinksV73() {
  const byName = {}, byEmail = {};
  Object.keys(BD_CONTACTOS).forEach(id => {
    const c = BD_CONTACTOS[id];
    if (c.nombre) byName[c.nombre.toLowerCase()] = id;
    if (c.email) byEmail[c.email.toLowerCase()] = id;
  });
  const empByName = {};
  Object.keys(BD_EMPRESAS_BYID).forEach(id => { const e = BD_EMPRESAS_BYID[id]; if (e.nombreFantasia) empByName[e.nombreFantasia.toLowerCase()] = id; });
  // contacto.empresaNombre (campo temporal del import) → empresaId
  Object.keys(BD_CONTACTOS).forEach(id => {
    const c = BD_CONTACTOS[id];
    if (c._empresaNombre && !c.empresaId) c.empresaId = empByName[c._empresaNombre.toLowerCase()] || '';
    delete c._empresaNombre;
  });
  // empresa.contactoPrincipal (nombre) → contactoPrincipalId
  Object.keys(BD_EMPRESAS_BYID).forEach(id => {
    const e = BD_EMPRESAS_BYID[id];
    if (!e.contactoPrincipal || e.contactoPrincipalId) return;
    const m = (e.emailContacto && byEmail[e.emailContacto.toLowerCase()]) || byName[e.contactoPrincipal.toLowerCase()];
    if (m) {
      e.contactoPrincipalId = m;
      const c = BD_CONTACTOS[m];
      if (!c.empresaId) { c.empresaId = id; if (!c.relacionEmpresa) c.relacionEmpresa = 'Contacto'; }
    }
  });
}

/* ─── IMPORTAR BD desde .xlsx ──────────────────────────────────────────
   Detecta el formato: CONTACTOS (V7.3) · PERSONAS/EMPRESAS/TALENTOS (V7.1,
   vía ingest) · Personas sola (V6, fallback). ──────────────────────────*/
async function importBDExcelV71(input) {   // nombre conservado por compat
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  let XLSX;
  try { XLSX = await ensureXLSX(); }
  catch (e) { showToast({ kind: 'error', title: 'No se pudo importar', body: e.message }); return; }

  const reader = new FileReader();
  reader.onload = (ev) => {
    let wb;
    try { wb = XLSX.read(ev.target.result, { type: 'array' }); }
    catch (e) { showToast({ kind: 'error', title: 'Archivo inválido', body: 'No pude leer el Excel. ¿Es un .xlsx válido?' }); return; }

    const sheetByName = (target) => {
      const t = target.toLowerCase();
      const name = wb.SheetNames.find(n => n.toLowerCase() === t);
      return name ? wb.Sheets[name] : null;
    };
    const wsC = sheetByName('CONTACTOS');
    const wsP = sheetByName('PERSONAS'), wsE = sheetByName('EMPRESAS'), wsT = sheetByName('TALENTOS');
    const wsLegacy = (!wsC && !wsP && !wsE && !wsT) ? (sheetByName('Personas') || wb.Sheets[wb.SheetNames[0]]) : null;

    if (wsLegacy) {
      showModal({
        title: 'Archivo en formato antiguo',
        body: 'Este .xlsx parece estar en el formato más viejo (una sola hoja de Personas). Lo importo con el sistema anterior y lo unifico al modelo de Contactos. Para el formato nuevo, exporta primero tu BD.',
        confirmLabel: 'OK, importar', cancelLabel: 'Cancelar',
        onConfirm: () => {
          pushSnapshot('Antes de importar BD (formato viejo) desde ' + file.name);
          const rows = XLSX.utils.sheet_to_json(wsLegacy, { header: 1, blankrows: false, defval: '' });
          processBDRows(rows);            // puebla BD_PERSONAS (proyección, como scratch)
          ingestLegacyIntoContactos();    // unifica a canónico
          syncLegacyFromContactos();
          autosaveNow();
          if (STATE.currentModule === 'bd-personas') renderBDPersonas();
          showToast({ kind: 'success', title: 'BD importada', body: `${Object.keys(BD_CONTACTOS).length} contactos en el modelo unificado.` });
          dalFinishBulkImport(Object.keys(BD_CONTACTOS), Object.keys(BD_EMPRESAS_BYID));   // V9.6.3: esta ruta sí llega a canónico; sincroniza a Supabase (upsert idempotente)
        },
        onCancel: () => {}
      });
      return;
    }

    pushSnapshot('Antes de importar BD desde ' + file.name);
    const replaceAll = _bdReplaceAll === true;
    _bdReplaceAll = false;
    const _touchedC = new Set(), _touchedE = new Set();   // V9.6.3: ids tocados para sync a Supabase (fusión)

    if (wsC) {
      // ── FORMATO NUEVO V7.3: CONTACTOS (+ EMPRESAS) ──
      if (replaceAll) { _clearStore(BD_CONTACTOS); _clearStore(BD_EMPRESAS_BYID); }
      let addC = 0, mrgC = 0, addE = 0, mrgE = 0;

      // EMPRESAS primero
      if (wsE) {
        const hRow = _detectHeaderRow(XLSX, wsE, HDR_EMPRESAS_V73);
        if (hRow !== -1) _readSheet(XLSX, wsE, hRow).forEach(r => {
          const nf = _normNameBD(r['Nombre de fantasía']); if (!nf) return;
          let id = String(r['ID'] || '').trim();
          const existed = id && BD_EMPRESAS_BYID[id];
          if (!id) id = _genId('emp', BD_EMPRESAS_BYID);
          BD_EMPRESAS_BYID[id] = {
            id, rutEmpresa: _normRutBD(r['RUT empresa']), nombreFantasia: nf,
            razonSocial: String(r['Razón social'] || '').trim(), tipo: String(r['Tipo'] || '').trim(),
            giroSII: String(r['Giro SII'] || '').trim(), giroInformal: String(r['Giro informal'] || '').trim(),
            contactoPrincipal: _normNameBD(r['Contacto principal']), contactoPrincipalId: '',
            emailContacto: _normEmailBD(r['Email contacto']), telefonoContacto: _normPhoneBD(r['Teléfono contacto']),
            web: String(r['Web'] || '').trim(), notas: String(r['Notas'] || '').trim()
          };
          existed ? mrgE++ : addE++;
          _touchedE.add(id);
        });
      }
      // CONTACTOS
      const hRow = _detectHeaderRow(XLSX, wsC, HDR_CONTACTOS_V73);
      if (hRow !== -1) {
        // índice de dedup para filas sin ID (agregadas a mano)
        const idx = {};
        Object.keys(BD_CONTACTOS).forEach(cid => {
          const c = BD_CONTACTOS[cid];
          _dedupKeys(c.rut, c.email, c.nombre).forEach(k => { if (!(k in idx)) idx[k] = cid; });
        });
        _readSheet(XLSX, wsC, hRow).forEach(r => {
          const nombre = _normNameBD(r['Nombre']); if (!nombre) return;
          const rut = _normRutBD(r['RUT']), email = _normEmailBD(r['Email']);
          let id = String(r['ID'] || '').trim();
          let existed = id && BD_CONTACTOS[id];
          if (!id) {
            for (const k of _dedupKeys(rut, email, nombre)) if (k in idx) { id = idx[k]; existed = true; break; }
          }
          if (!id) id = _genId('ctk', BD_CONTACTOS);
          const flat = { banco: r['Banco'], codigoBanco: r['Código banco'], tipoCuenta: r['Tipo de cuenta'], nCuenta: r['N° de cuenta'], tipoDTE: r['Tipo DTE'] };
          const talo = { genero: r['Género'], edad: r['Edad'], altura: r['Altura'], apariencia: r['Apariencia étnica'], areas: r['Áreas de interés'], tallaPolera: r['Talla polera'], tallaPantalon: r['Talla pantalón'], tallaCalzado: r['Talla calzado'], fotosLink: r['Fotos (link)'], reelLink: r['Reel (link)'] };
          BD_CONTACTOS[id] = {
            id, nombre, rut, email, telefono: _normPhoneBD(r['Teléfono']),
            roles: String(r['Roles'] || 'Crew').split(',').map(s => s.trim()).filter(Boolean),
            rolHabitual: String(r['Rol habitual'] || '').trim(),
            empresaId: '', _empresaNombre: _normNameBD(r['Empresa']),
            relacionEmpresa: String(r['Relación con empresa'] || '').trim(),
            direccion: String(r['Dirección'] || '').trim(), direccionLinea2: String(r['Dirección (línea 2)'] || '').trim(),
            comuna: String(r['Comuna'] || '').trim(), ciudad: String(r['Ciudad'] || '').trim(),
            restriccion: String(r['Restricción alimentaria'] || '').trim(),
            fechaNacimiento: String(r['Fecha de nacimiento'] || r['Cumpleaños'] || '').trim(), notas: String(r['Notas'] || '').trim(),
            perfilPago: _buildPerfilPago(flat), perfilTalento: _buildPerfilTalento(talo)
          };
          existed ? mrgC++ : addC++;
          _touchedC.add(id);
        });
      }
      _resolveLinksV73();
      syncLegacyFromContactos();
      autosaveNow();
      if (STATE.currentModule === 'bd-personas') renderBDPersonas();
      showToast({ kind: 'success', title: 'BD importada',
        body: `Contactos: ${addC} nuevos + ${mrgC} actualizados. Empresas: ${addE} + ${mrgE}.` });
      if (!replaceAll) dalFinishBulkImport([..._touchedC], [..._touchedE]);   // V9.6.3: sincroniza la fusión a Supabase
      return;
    }

    // ── FORMATO V7.1: 3 hojas PERSONAS/EMPRESAS/TALENTOS → ingest ──
    if (replaceAll) { _clearStore(BD_CONTACTOS); _clearStore(BD_EMPRESAS_BYID); }
    _clearStore(BD_PERSONAS); _clearStore(BD_TALENTOS); _clearStore(BD_EMPRESAS);
    if (!replaceAll) {
      // preservar lo ya cargado: re-proyectar el canónico actual antes de mezclar
      syncLegacyFromContactos();
    }
    _loadLegacyDictsFrom3Tabs(XLSX, wsP, wsE, wsT);
    ingestLegacyIntoContactos();
    syncLegacyFromContactos();
    autosaveNow();
    if (STATE.currentModule === 'bd-personas') renderBDPersonas();
    showToast({ kind: 'success', title: 'BD importada (formato 3 hojas)',
      body: `Unificado a ${Object.keys(BD_CONTACTOS).length} contactos · ${Object.keys(BD_EMPRESAS_BYID).length} empresas.` });
    if (!replaceAll) dalFinishBulkImport(Object.keys(BD_CONTACTOS), Object.keys(BD_EMPRESAS_BYID));   // V9.6.3: ingest 3-hojas no rastrea ids; sincroniza el canónico (upsert idempotente)
  };
  reader.onerror = () => showToast({ kind: 'error', title: 'Error de lectura', body: 'No se pudo leer el archivo.' });
  reader.readAsArrayBuffer(file);
}

function triggerBDExcelImport() {
  // V9.6.3: descongelado — la fusión escribe a Supabase vía dalFinishBulkImport.
  _bdReplaceAll = false;
  const inp = document.getElementById('bdExcelImportInputV71');
  if (inp) { inp.value = ''; inp.click(); }
}

/* V9.6.4: "Reemplazar BD" eliminado. Era un patrón de la era JSON (reemplazo total
   del blob); en Supabase es innecesario y demasiado destructivo (borraría contactos
   y datos bancarios que no estén en el Excel). El camino vigente es "Importar BD"
   (fusión: agrega y actualiza, nunca borra). La limpieza puntual se hace por ficha. */

// Descarga una plantilla .xlsx generada en el navegador (mismas columnas).

// Dispara el selector de archivo de importación.

// Lee y procesa el archivo elegido.

// Convierte filas crudas → personas, deduplica por RUT, fusiona y resume.
function processBDRows(rows) {
  if (!rows || rows.length < 2) {
    showToast({ kind: 'warning', title: 'Sin datos', body: 'El archivo no tiene filas de personas bajo el encabezado.' });
    return;
  }
  const headerRow = rows[0].map(_normKey);
  const fieldByCol = headerRow.map(h => BD_HEADER_MAP[h] || null);
  if (!fieldByCol.includes('nombre')) {
    showToast({ kind: 'error', title: 'Falta la columna Nombre', body: 'El encabezado debe incluir una columna "Nombre". Usa la plantilla.' });
    return;
  }
  // Índice de RUT → nombre-clave existente
  const rutIndex = {};
  Object.keys(BD_PERSONAS).forEach(n => { const r = _normRut(BD_PERSONAS[n].rut); if (r) rutIndex[r] = n; });

  let added = 0, merged = 0;
  const skipped = [];

  for (let i = 1; i < rows.length; i++) {
    const raw = rows[i];
    if (!raw || raw.every(c => String(c).trim() === '')) continue; // fila vacía
    const rec = {};
    fieldByCol.forEach((field, col) => {
      if (!field) return;
      let val = raw[col];
      val = (val == null ? '' : String(val)).trim();
      if (val !== '') rec[field] = val;
    });
    const nombre = (rec.nombre || '').trim();
    if (!nombre) { skipped.push({ fila: i + 1, motivo: 'sin nombre' }); continue; }
    delete rec.nombre;

    // Normalizar DTE
    if (rec.dteHabitual) {
      const d = _normKey(rec.dteHabitual);
      rec.dteHabitual = d.startsWith('bol') ? 'boleta' : (d.startsWith('fac') ? 'factura' : null);
      if (!rec.dteHabitual) delete rec.dteHabitual;
    }

    const rutNorm = _normRut(rec.rut);
    let targetKey = null;
    if (rutNorm && rutIndex[rutNorm]) targetKey = rutIndex[rutNorm];
    else if (BD_PERSONAS[nombre]) targetKey = nombre;

    if (targetKey) {
      // FUSIÓN: rellenar solo campos vacíos del existente
      const ex = BD_PERSONAS[targetKey];
      Object.keys(rec).forEach(f => {
        const cur = ex[f];
        if (cur === undefined || cur === null || String(cur).trim() === '' || cur === 'Ninguna') {
          ex[f] = rec[f];
        }
      });
      if (rutNorm) rutIndex[rutNorm] = targetKey;
      merged++;
    } else {
      // NUEVA persona
      BD_PERSONAS[nombre] = {
        nombre,                                   // V7.1: alias explícito
        mail: rec.mail || '',
        email: rec.mail || '',                    // V7.1: alias para schema nuevo
        telefono: rec.telefono || '',
        rolHabitual: rec.rolHabitual || '',
        restriccion: rec.restriccion || 'Ninguna',
        direccion: rec.direccion || '',
        direccion2: rec.direccion2 || '',
        direccionLinea2: rec.direccion2 || '',    // V7.1: alias
        comuna: rec.comuna || '',
        banco: rec.banco || '',
        tipoCuenta: rec.tipoCuenta || '',
        numeroCuenta: rec.numeroCuenta || '',
        nCuenta: rec.numeroCuenta || '',          // V7.1: alias
        dteHabitual: rec.dteHabitual || null,
        tipoDTE: rec.dteHabitual || '',           // V7.1: alias
        rut: rec.rut || '',
        // V7.1: schema extension
        roles: ['Crew'],
        empresaAsociada: '',
        relacionEmpresa: '',
        ciudad: '',
        fechaNacimiento: '',
        notas: ''
      };
      if (rutNorm) rutIndex[rutNorm] = nombre;
      added++;
    }
  }

  markDirty();
  if (STATE.currentModule === 'bd-personas' || STATE.currentView === 'bd-global') renderBDPersonas();
  showBDImportResult(added, merged, skipped);
}

function showBDImportResult(added, merged, skipped) {
  const total = added + merged;
  const skippedList = skipped.length
    ? `<div style="margin-top:12px;"><strong>${skipped.length} fila(s) omitida(s):</strong>
        <ul style="padding-left:18px; margin:6px 0; max-height:160px; overflow:auto;">
          ${skipped.slice(0, 50).map(s => `<li>Fila ${s.fila}: ${escapeHtml(s.motivo)}</li>`).join('')}
          ${skipped.length > 50 ? `<li>… y ${skipped.length - 50} más</li>` : ''}
        </ul></div>`
    : '<div style="margin-top:12px; color:var(--positive, #2e7d32);">No se omitió ninguna fila.</div>';
  showModal({
    title: total > 0 ? 'Importación completada' : 'No se importó nada',
    body: `
      <div style="display:flex; gap:18px; margin-bottom:4px;">
        <div><div style="font-size:24px; font-weight:800;">${added}</div><div style="font-size:12px; color:var(--ink-muted);">nuevas</div></div>
        <div><div style="font-size:24px; font-weight:800;">${merged}</div><div style="font-size:12px; color:var(--ink-muted);">fusionadas</div></div>
        <div><div style="font-size:24px; font-weight:800;">${skipped.length}</div><div style="font-size:12px; color:var(--ink-muted);">omitidas</div></div>
      </div>
      ${skippedList}`,
    confirmLabel: 'Entendido',
    cancelLabel: 'Cerrar',
    onConfirm: () => {},
    onCancel: () => {}
  });
}

export function buildPersonasDatalist() {
  // V7.1: filtrar a Crew + Interno. Los talentos viven en BD_TALENTOS, no
  // contaminan el autocompletado del Presupuesto ni los campos PE/Dir/JP
  // de Info Proyecto.
  const subset = getBDPresupuesto();
  return Object.keys(subset).sort()
    .map(n => `<option value="${escapeHtml(n)}"></option>`)
    .join('');
}

// ── Window bridges XLSX BD ─────────────────────────────────────────

window._codigoBancoSBIF     = _codigoBancoSBIF;
window._nombreBancoOficial  = _nombreBancoOficial;

// D4b · ganchos definidos por este módulo (consumidos por módulos más tempranos)
define('_codigoBancoSBIF', _codigoBancoSBIF);
define('_nombreBancoOficial', _nombreBancoOficial);
define('_normKey', _normKey);
define('_normNameBD', _normNameBD);
define('downloadBDPlantilla', downloadBDPlantilla);
define('ensureExcelJS', ensureExcelJS);
define('exportBDExcelV71', exportBDExcelV71);
define('importBDExcelV71', importBDExcelV71);
define('triggerBDExcelImport', triggerBDExcelImport);

define('buildPersonasDatalist', buildPersonasDatalist);
