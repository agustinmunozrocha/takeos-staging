# QA · Espacio / Panel personal (`frontend/src/modules/espacio.js`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
Panel personal del usuario ("Tu espacio") + cambiador de espacio (barra superior) +
tarjetas de onboarding + acceso a Privacidad/derechos. Acciones `esp.*` / `app.swToggle`.
Cobertura: 7/8 ✅ (QA automatizado 2026-07-20, 0 bugs).

> **Resultado del cruce:** port **fiel**, módulo de **navegación/panel** (poca lógica).
> Los **flujos legales de derechos** (descargar datos, revocar, eliminar cuenta) están
> construidos en UI con **textos provisionales** (Gate C — el definitivo lo fija Legal),
> así que su contenido es 👁. El juez final eres tú en `localhost:5173`.

---

| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| ESP1 | Cambiador de espacio | Click "Cambiar de espacio" | Menú con "🏠 Panel personal" + las productoras (🎬 Rivendell Films · Control Room) | ✅ |
| ESP2 | Entrar a una productora | "Entrar" en una productora | Entra a su Control Room y restaura el último proyecto/módulo | ✅ |
| ESP3 | Panel personal | "Panel personal" | "TUS PRODUCTORAS" con la membresía (Administrador · acceso completo), N proyectos, "Entrar" | ✅ |
| ESP4 | Abrir proyecto desde el panel | Click en un proyecto del panel | Abre ese proyecto (entra a la org + módulo) | ✅ (vía `esp.abrirProy` / restauración al entrar) |
| ESP5 | Mis datos personales | "Mis datos personales" / avatar | Abre el editor de perfil (mismo `abrirPerfilUsuario`, ver Perfil) | ✅ (cubierto en perfil-onboarding) |
| ESP6 | Privacidad y datos | "Privacidad y datos" | Abre el panel con los 5 derechos (Ley 21.719): acceso/portabilidad, revocación, verificación de edad, cookies, eliminar cuenta | ✅ (panel abre con los 5 flujos) |
| ESP7 | Onboarding "Entendido" | Descartar la tarjeta de onboarding | La tarjeta se cierra (`esp.onbNext`) | ✅ |
| ESP8 | Contenido legal de los derechos | Abrir cada flujo (descargar/revocar/eliminar) | Textos definitivos y comportamiento de cada derecho | 👁 (Gate C — textos provisionales hoy; descargar/revocar/eliminar son destructivos/legales) |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó · ❌ falló · 🔁 cambió a propósito.

## Notas
- **0 bugs.** Navegación del espacio y panel personal port fiel. El panel de Privacidad
  muestra los 5 derechos de la Ley 21.719 con **textos provisionales** ("El área legal
  define la versión definitiva antes de salir en vivo") — el contenido y los flujos
  destructivos (eliminar cuenta, revocar) quedan 👁 / Gate C.
