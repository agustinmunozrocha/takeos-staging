# QA · Invitaciones (`frontend/src/modules/invitaciones.js`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
RPCs: `invitar_a_organizacion`, `mis_invitaciones`, `reclamar_invitacion`,
`consentir_invitacion`, `cerrar_invitacion`, `cancelar_invitacion`. La creación de
invitaciones se dispara desde **Cargos** (cargo externo con correo → invitación).
Cobertura: 4/9 ✅ + 5 👁 (QA automatizado 2026-07-20, 0 bugs).

> **Resultado del cruce:** port **fiel**. El **aceptar/rechazar** una invitación es
> inherentemente **👁 + destructivo**: exige entrar como la persona invitada (cuenta
> nueva vía el link, en sesión sin loguear) y muta membresías — no se puede ejercer
> como administrador. El juez final eres tú.

---

## 🤖 Verificadas (Claude)
| ID | Qué probar | Pasos | Esperado | Estado |
|----|-----------|-------|----------|--------|
| INV1 | Formato del link | Crear una invitación (cargo externo con correo) | Link `…/?invitacion=inv_XXXX` | ✅ |
| INV2 | Crear invitación | Cargos → externo + correo → Asignar | "Invitación creada"; el cargo queda "Invitación pendiente" (ver Cargos CG8) | ✅ |
| INV3 | Copiar el link | Pastilla ⧉ / botón "Copiar" | "Link copiado" con la URL de invitación (ver Cargos CG9) | ✅ |
| INV4 | Abrir invitación ajena estando logueado | Abrir `?invitacion=<token>` de otro correo, ya logueado | No-op seguro: no abre la pantalla de aceptar, sin error de consola | ✅ |

## 👁 Necesitan tu vista (flujo del invitado — requiere el link en sesión sin loguear)
| ID | Qué probar | Pasos | Esperado | Estado |
|----|-----------|-------|----------|--------|
| INV5 | Pantalla de invitación recibida | Abrir el link como la persona invitada | Se ve "de <productora>", el rol, los términos (Ley 21.719) y el consentimiento | 👁 |
| INV6 | Gate de consentimiento | Sin marcar el consentimiento | "Aceptar" queda deshabilitado hasta marcar la casilla | 👁 |
| INV7 | Aceptar (consentir) | Marcar consentimiento → "Aceptar" | `consentir_invitacion`: copia datos + activa la membresía; entra al proyecto | 👁 (destructivo — muta membresías) |
| INV8 | Rechazar | "Rechazar" | `cerrar_invitacion('rechazada')`; la invitación se cierra | 👁 |
| INV9 | Bandeja en el panel personal | Panel "Tu espacio" con invitaciones pendientes | Lista "Tienes N invitación(es) pendiente(s)" con "Ver invitación" | 👁 (visto: el panel lista la pendiente; **revisar** si debe aparecer en el panel de quien la envió) |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó · ❌ falló · 🔁 cambió a propósito.

## Notas
- **0 bugs.** Creación y link verificados; abrir una invitación ajena estando logueado
  es un no-op limpio (sin pantalla, sin error). El flujo del invitado (INV5–INV8) es
  visual y destructivo — se prueba entrando con el link como la persona invitada, en
  una sesión sin loguear (o incógnito). **Observación 👁 (INV9):** al crear una
  invitación, el panel personal del **administrador** mostró "1 invitación pendiente"
  para ese cargo, pero "Ver invitación" no abre la pantalla (el correo no coincide con
  el suyo). Vale revisar si las invitaciones enviadas deben figurar en el panel del
  emisor — es UX, no bloqueante.
