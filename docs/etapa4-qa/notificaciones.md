# QA · Notificaciones / Correos (`frontend/src/modules/notificaciones.js`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
Módulos de apoyo: `dal.js`, `persistencia-local.js` (markDirty), `lib/delegacion.js`.
Nav del módulo: `data-module="correos"`. Bell (avisos) en la barra: `app.bell`.
Cobertura: 5/10 ✅ + 5 👁 (QA automatizado 2026-07-20, 0 bugs de migración).

> **Resultado del cruce:** port **fiel** (`bellToggle`, `notifMarcarTodas`,
> `ntfToggleRegla`, `ntfEnsureSched` idénticos). Es un módulo mayormente **visual**
> (plantillas rich-text, previews de email/WhatsApp) y con **envío real vía backend**
> (stub en el cliente). El juez final eres tú en `localhost:5173`.
>
> ⚠ **Hallazgo (NO es bug de Etapa 4 — pre-existente, igual en `main`):** las
> **reglas de envío programado** (`notificaciones.reglas`) **no se guardan en la base**:
> `ntfToggleRegla` solo hace `markDirty` y **ninguna** versión (ni monolito ni modular)
> escribe la columna `projects.notificaciones_reglas` (la columna existe pero quedó sin
> cablear). Se pierden al recargar. Persistirlas es una **decisión de producto/BD**,
> no un arreglo de la modularización.

---

## 🤖 Verificadas (Claude)
| ID | Qué probar | Pasos | Esperado | Estado |
|----|-----------|-------|----------|--------|
| NTF1 | Reglas por defecto | Módulo Notificaciones → tab "Programados" | confirm24 ✓ · dteNext ✓ · dte2 ✓ · dte3 ✗ · satisf ✓ | ✅ |
| NTF2 | Toggle de regla (en sesión) | Cambia una regla (p. ej. dte3 off→on) | El modelo `notificaciones.reglas` refleja el cambio al instante | ✅ |
| NTF3 | Reglas NO persisten al recargar | Cambia reglas → hard refresh | Vuelven a los valores por defecto — **igual que `main`** (columna sin cablear; ver ⚠ arriba) | 🔁 (comportamiento = main, pre-existente) |
| NTF4 | Bell (avisos) abre | Click en la campana | Abre el panel de avisos; sin avisos muestra "No tienes avisos" | ✅ |
| NTF5 | Seleccionar destinatarios | Tab "Enviar" → casilla "seleccionar todos" | Marca/desmarca todas las filas de destinatarios | ✅ |

## 👁 Necesitan tu vista
| ID | Qué probar | Pasos | Esperado | Estado |
|----|-----------|-------|----------|--------|
| NTF6 | Contador "Enviar a N" | Selecciona destinatarios; mira el botón | "Enviar a N por email"; N cuenta solo los que tienen mail + datos completos; los bloqueados salen listados ("sin mail" / "faltan datos") | 👁 |
| NTF7 | Editor de plantillas | Tab "Plantillas" → editar asunto/cuerpo, B/I/U, variables | El editor rich-text y las "pills" de variables se ven y funcionan bien | 👁 |
| NTF8 | Preview email / WhatsApp | Cambia canal email↔WhatsApp; mira el preview | El preview se ve correcto en ambos canales | 👁 |
| NTF9 | Copiar plantilla / override | "⧉ Copiar plantilla"; "Editar solo para esta persona" | Copia al portapapeles; el override por persona se ve y guarda en sesión | 👁 |
| NTF10 | Envío real | "Enviar a N" | El envío real llega por el backend (hoy es stub en el cliente) — validar cuando esté el backend | 👁 |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó · ❌ falló · 🔁 cambió a propósito / = main.

## Notas
- **0 bugs de migración.** El único punto es el ⚠ de arriba (reglas no persisten),
  que es **pre-existente** (idéntico en el monolito) — decisión de producto/BD si se
  quiere que las reglas sobrevivan a la recarga (la columna `notificaciones_reglas` ya
  existe, solo falta cablear su escritura/lectura, en ambas versiones).
