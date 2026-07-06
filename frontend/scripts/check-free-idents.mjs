// Gate HF · identificadores libres — el bug que ni node --check ni rollup ven.
// Un nombre REFERENCIADO en un archivo pero no declarado en él, no importado y no
// global = ReferenceError garantizado en runtime (bugs 1 y 3 del informe de arqui).
// Sin dependencias: usa el parser de rollup que vite ya trae.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseAst } from 'rollup/dist/parseAst.js';

const GLOBALS = new Set([
  // JS
  'Object','Array','String','Number','Boolean','Math','JSON','Date','RegExp','Error','TypeError','RangeError',
  'Promise','Map','Set','WeakMap','WeakSet','Symbol','Proxy','Reflect','BigInt','ArrayBuffer','Uint8Array','Int8Array','Float64Array','DataView',
  'parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','encodeURI','decodeURI',
  'NaN','Infinity','undefined','globalThis','console','setTimeout','clearTimeout','setInterval','clearInterval',
  'queueMicrotask','structuredClone','atob','btoa','escape','unescape',
  // DOM/browser
  'window','document','navigator','location','history','localStorage','sessionStorage','fetch','XMLHttpRequest',
  'FormData','Blob','File','FileReader','URL','URLSearchParams','Image','Audio','Event','CustomEvent','MouseEvent',
  'KeyboardEvent','DragEvent','DataTransfer','Node','Element','HTMLElement','HTMLInputElement','HTMLCanvasElement','Text',
  'DOMParser','XMLSerializer','MutationObserver','IntersectionObserver','ResizeObserver','AbortController',
  'requestAnimationFrame','cancelAnimationFrame','alert','confirm','prompt','getComputedStyle','matchMedia',
  'crypto','performance','screen','devicePixelRatio','CSS','getSelection','ClipboardItem',
  // globales por diseño de TakeOS (documentados): CDN + centinela de supabase
  'XLSX','ExcelJS','sb','supabase','arguments',
]);

const SKIP = (parent, key, computed, shorthand) => (
  (parent.type === 'MemberExpression' && key === 'property' && !parent.computed) ||
  (parent.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand) ||
  ((parent.type === 'PropertyDefinition' || parent.type === 'MethodDefinition') && key === 'key' && !parent.computed) ||
  (parent.type === 'LabeledStatement' && key === 'label') ||
  ((parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') && key === 'label') ||
  (parent.type === 'ImportSpecifier' && key === 'imported') ||
  (parent.type === 'ExportSpecifier') ||
  (parent.type === 'MetaProperty') ||
  (parent.type === 'UnaryExpression' && parent.operator === 'typeof')
);

function analizar(code, WGLOBALS) {
  const ast = parseAst(code);
  const lineOf = (off) => { let l = 1; for (let i = 0; i < off && i < code.length; i++) if (code[i] === '\n') l++; return l; };
  const bound = new Set();     // todo nombre que se declara/liga en el archivo
  const refs = [];             // {name, line} en posición de referencia

  // Paso 1: bindings — extrae nombres de todo patrón de declaración
  function pat(n) {
    if (!n) return;
    if (n.type === 'Identifier') bound.add(n.name);
    else if (n.type === 'ObjectPattern') n.properties.forEach(p => pat(p.value || p.argument));
    else if (n.type === 'ArrayPattern') n.elements.forEach(pat);
    else if (n.type === 'AssignmentPattern') pat(n.left);
    else if (n.type === 'RestElement') pat(n.argument);
  }
  function bindWalk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(bindWalk);
    switch (n.type) {
      case 'ImportDeclaration': n.specifiers.forEach(s => bound.add(s.local.name)); break;
      case 'FunctionDeclaration': case 'FunctionExpression':
        if (n.id) bound.add(n.id.name); n.params.forEach(pat); break;
      case 'ArrowFunctionExpression': n.params.forEach(pat); break;
      case 'ClassDeclaration': case 'ClassExpression': if (n.id) bound.add(n.id.name); break;
      case 'VariableDeclarator': pat(n.id); break;
      case 'CatchClause': if (n.param) pat(n.param); break;
    }
    for (const k in n) if (k !== 'type') bindWalk(n[k]);
  }
  bindWalk(ast);

  // Paso 2: referencias
  function refWalk(n, parent, key) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(c => refWalk(c, parent, key));
    if (n.type === 'Identifier') {
      if (!parent || !SKIP(parent, key)) refs.push({ name: n.name, line: lineOf(n.start) });
      return;
    }
    for (const k in n) if (k !== 'type' && k !== 'loc' && k !== 'start' && k !== 'end') {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(c => refWalk(c, n, k));
      else if (v && typeof v === 'object') refWalk(v, n, k);
    }
  }
  refWalk(ast, null, null);

  const libres = new Map();
  for (const r of refs) if (!bound.has(r.name) && !GLOBALS.has(r.name) && !WGLOBALS.has(r.name)) {
    if (!libres.has(r.name)) libres.set(r.name, r.line);
  }
  return libres;
}

const dir = 'src';
// Pasada 0: todo `window.NAME =` (en cualquier archivo) es un global que las
// referencias bare resuelven en runtime — el patrón bridge de este código.
const WGLOBALS = new Set();
function walk(d) { let out = []; for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) out = out.concat(walk(p)); else if (e.name.endsWith('.js')) out.push(p); } return out; }
let total = 0;
const RE_WIN = /window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;
for (const f of walk(dir)) { let m; const s = readFileSync(f, 'utf8'); while ((m = RE_WIN.exec(s))) WGLOBALS.add(m[1]); }
for (const f of walk(dir)) {
  let libres;
  try { libres = analizar(readFileSync(f, 'utf8'), WGLOBALS); }
  catch (e) { console.error('✗ parse', f, e.message); process.exit(2); }
  if (libres.size) { total += libres.size; for (const [name, line] of libres) console.log(`✗ ${f}:${line}  identificador libre: ${name}`); }
}
if (total) { console.log(`\n${total} identificador(es) libre(s) — posible ReferenceError en runtime`); process.exit(1); }
console.log('GATE identificadores-libres: OK (0 en', walk(dir).length, 'archivos)');
