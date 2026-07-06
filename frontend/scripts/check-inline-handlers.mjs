// Gate HF · cero handlers on*= ejecutables. La CSP sin unsafe-inline los mata en
// silencio (bug 2). Ignora comentarios enmascarándolos; captura la forma comilla-simple
// (onclick='...') que evadió los greps de comilla doble durante todo el proyecto.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
function walk(d){let o=[];for(const e of readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())o=o.concat(walk(p));else if(e.name.endsWith('.js'))o.push(p);}return o;}
// enmascara // y /* */ (deja strings intactos a grandes rasgos: suficiente para on*=)
function stripComments(s){return s.replace(/\/\*[\s\S]*?\*\//g,m=>m.replace(/[^\n]/g,' ')).replace(/(^|[^:])\/\/[^\n]*/g,(m,p)=>p+m.slice(p.length).replace(/[^\n]/g,' '));}
const RE = /\son(click|change|input|focus|blur|mouse[a-z]+|key[a-z]+|drag[a-z]*|drop|submit|load|paste|dbl[a-z]+)=["']/gi;
let total = 0;
for (const f of walk('src')) {
  const code = stripComments(readFileSync(f, 'utf8'));
  let m; while ((m = RE.exec(code))) { const line = code.slice(0, m.index).split('\n').length; console.log(`✗ ${f}:${line}  handler inline: on${m[1]}=`); total++; }
}
if (total) { console.log(`\n${total} handler(es) inline on*= — bloqueados por la CSP (script-src sin unsafe-inline)`); process.exit(1); }
console.log('GATE handlers-inline: OK (0 on*= ejecutables)');
