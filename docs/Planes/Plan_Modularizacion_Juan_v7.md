# Plan de Modularización — Juan (v7)

**Tu rol:** Jefe de Tecnología — dueño del cimiento (Etapas 0 y 1, **cerradas**) y de
**toda** la Etapa 2, incluyendo la revisión técnica de su propio código.
**Rol de Agustín:** dueño de producto — valida que las implementaciones funcionen
como espera desde la experiencia de uso, no revisa código.
**v1:** 17 jun 2026 · **v2:** 30 jun 2026 · **v3:** 30 jun 2026 · **v4:** 30 jun 2026
· **v5:** 30 jun 2026 · **v6:** 30 jun 2026 · **v7:** 30 jun 2026
**De:** Dev (asesor) · **Para:** Juan (Jefe de Tecnología), con Code

> **Nota de versión — qué cambió en v7 respecto a v6.** Sin cambios estructurales.
> Lo que agrega v7: (1) estado de los dos módulos extraídos actualizado a "revisión
> estática OK, pendiente validación interactiva de Agustín"; (2) checklist de
> validación corregido — se eliminan drag & drop y filtros de Kanban, que no son
> regresiones sino features nunca implementados; (3) se documentan esos dos hallazgos
> formalmente para que no se confundan con bugs de la modularización. v1-v6 quedan
> como registro histórico.

---

## Contexto en una línea

Seguimos partiendo el `index.html` monolítico en módulos chicos con **Vite**, sin
reescribir lógica y sin romper producción. Etapas 0 y 1 (el cimiento) están cerradas
— ver v2 para el detalle completo. La Etapa 2 la ejecuta Juan solo (desde v3); v5
precisa cómo se revisa el trabajo, dado que Juan es quien lidera la parte técnica y
Agustín la parte de producto.

> **Regla de oro (sigue vigente, sin cambios):** esto es un **refactor, no
> features**. Mismo comportamiento; solo cambia *dónde vive* el código. Cada paso se
> prueba en **staging antes que producción**. Si aparece un bug mientras extraes, se
> anota y se arregla aparte, nunca mezclado en el mismo PR.

---

## ⚠ Divergencia con un canónico vigente (heredado de v3, sin cambios)

`TakeOS_Arquitectura_y_Flujo_de_Trabajo_v1_6.md` documenta explícitamente el reparto
Juan/Agustín como la decisión tomada (sección del SYNC: "Juan toma lo estructural...
Agustín entra en la Etapa 2 con los módulos de dominio"). Este plan (desde v3) es la
ejecución práctica de un cambio que, en algún momento, **debe reflejarse también en
el Arquitectura** — eso le corresponde a Agustín como árbitro del canónico. Mientras
tanto, este plan es la fuente de verdad operativa para el trabajo del día a día.

---

## Roles, sin ambigüedad (introducido en v5)

| | Juan — Jefe de Tecnología | Agustín — dueño de producto |
|---|---|---|
| Qué revisa | El código: correctitud, seguridad, que respete la regla rol-vs-dificultad, RLS/permisos si aplica | La implementación interactiva: que la funcionalidad se comporte como el producto necesita |
| Cuándo | Antes del merge (su propio código) | Generalmente después del deploy a staging, probando la funcionalidad en vivo |
| Quién aprueba el merge a `main` | Juan | — (Agustín no es parte del gate de merge) |
| Excepciones | Se esperan, y son normales — ver abajo | |

**Sobre las excepciones:** no es una regla rígida. Si un módulo toca algo
particularmente sensible (RLS, permisos, datos financieros) o si Juan quiere una
segunda opinión sobre una decisión de producto antes de construir, nada impide subir
el nivel de involucramiento de Agustín para ese caso puntual — la tabla de arriba es
el patrón general, no una camisa de fuerza.

---

## Cómo se sostiene la calidad sin un segundo humano en el código (introducido en v5)

Esto es lo que hay que nombrar con honestidad: al no haber un segundo par de ojos
técnico antes del merge, el plan incorpora tres prácticas para que la revisión de
Juan sobre su propio código sea real y no solo un trámite. Ninguna depende de
Agustín ni de un tercero:

1. **Revisión con distancia (cooldown).** Evitar mergear el mismo PR recién
   terminado, en caliente. Dejarlo reposar —aunque sea unas horas— antes de
   revisarlo y aprobarlo. Mirar el propio código con la cabeza fría detecta más que
   mirarlo inmediatamente después de escribirlo.
2. **Segunda pasada de Code dedicada a riesgo, no a funcionalidad.** Como paso
   explícito y separado de la construcción del módulo: pedirle a Claude Code una
   revisión enfocada en "¿qué podría salir mal acá, específicamente en RLS, permisos
   o datos sensibles?" — no la misma pasada que ya hizo para que el código funcione.
3. **Umbral más alto para cambios de alto riesgo.** Si un módulo toca RLS, permisos,
   o datos financieros directamente, ese PR amerita el cooldown más largo y,
   opcionalmente, una mirada de Agustín aunque sea a nivel de qué hace el cambio
   (no el código línea por línea) — esto es la "excepción esperada" de la tabla de
   roles, no un caso aparte sin cubrir.

---

## Lo que NO cambia respecto a v2

- Etapas 0 y 1: cerradas, tal como quedan documentadas en v2. No se tocan.
- La regla **rol-vs-dificultad** para decidir qué se extrae y cuándo.
- La regla de **divergencia producción — Vite** (handoffs manuales, nunca merge
  directo del monolito).
- El **objetivo final de seguridad** (CSP sin `'unsafe-inline'` al cerrar Etapa 2).
- La estructura general del **ciclo por módulo** (rama corta → extraer → puente →
  build → Playwright → PR → merge → deploy) — solo cambia quién y cómo revisa, no
  el resto de los pasos.

## Lo que cambió en v3/v4, y lo que v5 corrige

| | v1/v2 | v3/v4 | v5 (corrección de roles) |
|---|---|---|---|
| Quién extrae los módulos | Juan + Agustín en paralelo | Juan solo | Sin cambios |
| Quién revisa el código antes del merge | Cruzado (cada uno al otro) | "Agustín revisa" *(impreciso — ver nota de versión)* | **Juan revisa su propio código**, con las prácticas de la sección anterior |
| Qué valida Agustín | — | "Revisa PRs" *(ambiguo)* | **Funcionalidad/implementación interactiva**, no código |
| Quién aprueba el merge | Cruzado | Agustín | **Juan** |
| El SYNC | Reunión para repartir 50/50 | Briefing | Briefing (sin cambios desde v3/v4) |

---

## El SYNC, redefinido

Ya no es una negociación de reparto. Es un **briefing corto** donde Juan le muestra
a Agustín:

1. La estructura de `src/lib` ya cerrada y cómo funciona el puente a `window`.
2. La regla rol-vs-dificultad, para que Agustín la reconozca cuando vea avances y
   entienda por qué ciertas piezas quedan diferidas.
3. **El orden en que Juan va a abordar los módulos de Etapa 2** (propuesta abajo),
   para que Agustín lo valide o lo reordene según prioridad de producto — sigue
   siendo su llamada como dueño del producto.
4. **(Corregido en v5)** El acuerdo explícito de roles: Agustín valida
   funcionalidad/implementación una vez desplegado en staging; no es parte del gate
   de merge salvo en los casos de excepción ya descritos.
5. El hallazgo de hosting/GitHub Pages (sección de Horizonte al final), como punto
   de decisión para Agustín.

---

## Orden de módulos para Etapa 2 (solo Juan) — estado actualizado

| # | Módulo | Rama | Estado |
|---|---|---|---|
| 1 | Proyectos / Kanban | `mod-kanban` | ✅ Extraído · ✅ Revisión estática OK · ⏳ Pendiente validación interactiva Agustín |
| 2 | Notificaciones | `mod-notificaciones` | ✅ Extraído · ✅ Revisión estática OK · ⏳ Pendiente validación interactiva Agustín |
| 3 | Cotización / Presupuesto | `mod-cotizacion` | ⬜ Pendiente — análisis de dependencias inicia después de que Agustín valide módulos 1 y 2 |
| 4 | Legal | `mod-legal` | ⬜ Pendiente — depende del avance del abogado |
| 5 | Finanzas / CFO | `mod-finanzas` | ⬜ Pendiente — depende de que Cotización esté cerrado |
| 6 | Plan de Rodaje / Hoja de Llamado | `mod-plan-rodaje` | ⬜ Pendiente — acoplado a UI, dejarlo para cuando el patrón esté rodado |
| 7 | Remanente de auth (`cloudGate`, cargadores, sesión) | `mod-auth` | ⬜ Pendiente — diferido desde Etapa 1 |

**Contenido de los módulos ya extraídos:**

`kanban.js` — Control Room y Kanban: `STATES`, `renderMetrics`, `renderKanban`,
`renderProjectCard`, `navigateToControlRoom`, `navigateToProject`,
`projectClientNet`, `newProject`, `deleteProjectFlow`, `confirmDeleteProject`,
`_lastViewSave`, `_lastViewLeer`, `projectAttentionCount`,
`projectsNeedingAttention`.

`notificaciones.js` — tres sistemas:
- **A (Bell/panel):** `NOTIF`, `notifInit`, `notifCargar`, `bellToggle`,
  `notifMarcarTodas`, `notifAbrir`, `notifAbrirRebind`, rebind flow completo.
- **B (Motor de correos):** `notifDefaultTemplates`, `getNotifConfig`,
  `notifSaveConfig`, `ensureNotif`, `notifFill`, `notifRecipients`,
  `notifVarsFor`, `notifGmailDraft`, y helpers.
- **C (Módulo ntf* V7.13):** `renderNotificaciones` y todas las funciones `ntf*`
  — tabs Enviar, Programados, Historial, Plantillas.

> El orden a partir del módulo 3 sigue siendo propuesta de partida, no camisa de
> fuerza. Si aparece una razón de negocio para reordenar, se reordena.

---

## Checklist de validación interactiva para Agustín (corregido en v7)

Este checklist lo ejecuta Agustín en staging una vez que Juan le avisa que los
módulos están listos para revisión funcional. **No es un gate de merge** — es la
validación post-deploy del dueño de producto.

**mod-kanban:**
- [ ] Kanban carga y renderiza proyectos correctamente
- [ ] Click en tarjeta navega al proyecto
- [ ] Breadcrumb "Control Room" desde dentro de un proyecto navega correctamente
- [ ] Crear nuevo proyecto desde Control Room funciona

**mod-notificaciones:**
- [ ] Bell icon abre/cierra panel (Sistema A)
- [ ] Badge de notificaciones se actualiza
- [ ] Marcar notificaciones como vistas
- [ ] Tab Notificaciones carga (Sistema B — motor de correos)
- [ ] Vista Enviar / Plantillas / Historial / Programados funciona
- [ ] Aprobar / Resolver notificaciones desde el panel

**Ambos módulos:**
- [ ] Sin errores en consola al navegar entre módulos
- [ ] Reload de página no rompe nada

> **Nota (v7):** dos ítems del checklist original se eliminaron porque los features
> nunca fueron implementados — ver sección de hallazgos abajo. Su ausencia en staging
> **no es una regresión** de la modularización.

---

## Hallazgos de la revisión estática (nuevo en v7)

Durante la revisión estática completa de ambos módulos (build ✅, puentes ✅, cero
duplicados ✅) se encontraron dos features que el checklist original asumía
implementados pero que **nunca existieron en el monolito**:

**1. Drag & drop entre columnas del Kanban**
No hay handlers `ondragstart`/`ondrop` en las tarjetas del Kanban, ni en
`index.html` ni en `kanban.js`. No es una regresión — el feature nunca fue
implementado. Eliminado del checklist de validación. Queda registrado como feature
pendiente de producto, fuera del scope de la modularización.

**2. Filtros y búsqueda en Kanban**
El código tiene un `// TODO V5.2: aplicar filtro real al kanban` (index.html ~línea
16602). La UI del filtro puede existir visualmente pero sin lógica real. Mismo caso:
no es regresión, es un TODO preexistente. Eliminado del checklist de validación.

> Ambos hallazgos son deuda de producto, no deuda técnica de la modularización.
> Le corresponde a Agustín decidir si y cuándo se implementan, independientemente
> del avance de la Etapa 2.

---

## Deuda técnica conocida — Señales (diferido de Notificaciones)

Las siguientes funciones permanecen en `index.html` sin extraer, con justificación
explícita y condición de desbloqueo conocida. No es un olvido — es una decisión
documentada tanto en el header de `notificaciones.js` como acá.

**Funciones diferidas:**
`ensureSenales`, `marcarSenal`, `senalAplica`, `userSenales`, `marcarSenalVista`,
`crtGoSenal`, `renderMisTareas`.

**Por qué se difirió:** `marcarSenalVista` necesita llamar a `renderMetrics` y
`renderKanban`, que ya viven en `kanban.js`. Extraer Señales ahora requeriría que
`notificaciones.js` importe o llame funciones de `kanban.js` — y todavía no hay un
patrón establecido para comunicación directa entre módulos ES en este proyecto. Forzar
ese patrón aquí, siendo el primer caso, tiene riesgo innecesario.

**Condición de desbloqueo:** cuando se encuentre un tercer módulo que también necesite
coordinarse con `kanban.js`, ahí se define el patrón de comunicación entre módulos
(probablemente `import` directo de `kanban.js` desde el módulo que lo necesite) y se
extrae Señales como sub-módulo de Notificaciones, **no como módulo nuevo independiente**.

**Regla que aplica:** rol-vs-dificultad — Señales tiene rol de sub-módulo de
Notificaciones conceptualmente, pero extraerlo ahora arrastraría un patrón de
comunicación entre módulos sin establecer. Se difiere, no se descarta.

---

## El ciclo por módulo (paso 5 corregido en v5, sin cambios en v6/v7)

0. **Análisis de dependencias (caso por caso, antes de tocar código).** Para cada
   módulo: ¿de qué depende? (estado, otras funciones, datos, render/UI). Decidir,
   aplicando **rol-vs-dificultad**, si se saca junto o se deja con un puente
   temporal. Esta decisión se documenta en el commit o PR — no queda implícita.
1. Rama corta, una por módulo (ej. `mod-kanban`).
2. Extrae el módulo (y lo decidido en el paso 0) a `frontend/src/modules/`.
3. **Re-publica en `window`** las funciones que usan `onclick` inline.
4. `vite build` — prueba de humo con Playwright.
5. **(Corregido en v5)** Revisión y merge:
   - **Juan** revisa su propio código (con cooldown + segunda pasada de Code
     enfocada en riesgo, ver sección de calidad arriba) y aprueba el merge.
   - **Agustín**, una vez desplegado en staging, valida que la implementación
     interactiva se comporte como espera — esto puede ocurrir después del merge,
     no necesariamente como gate previo.
   - **Excepción:** si el módulo toca RLS/permisos/datos financieros, se aplica el
     umbral más alto de la sección de calidad antes de mergear.
6. Las hojas de estilo viajan con su módulo a medida que se extrae.

---

## Una honestidad que vale la pena dejar escrita (heredado de v3/v4)

El ~88% de trabajo que quedaba (Etapa 2 completa) estaba pensado para repartirse
entre dos. Ahora cae sobre una persona. Eso estira el calendario real; no hay forma
de evitarlo. Vale la pena, en el SYNC, poner sobre la mesa con Agustín una
estimación honesta de tiempos bajo este escenario, para que la expectativa esté
calibrada con la realidad de una sola persona trabajando.

---

## Horizonte — hosting y edge middleware (heredado de v4, sin cambios)

### 1. Edge middleware — largo plazo, sin urgencia

Técnica real (Vercel Edge Middleware, Cloudflare Workers, Netlify Edge Functions)
para verificar el rol de un usuario antes de entregarle un archivo. No es la
protección real (eso es el RLS, ya construido y verificado) y **no se puede
implementar mientras sigan en GitHub Pages** — la plataforma no tiene capacidad de
cómputo para correrlo. Queda en el horizonte, condicionado a una eventual migración
de hosting.

### 2. GitHub Pages y uso comercial — decisión consciente pendiente, no urgente en acción pero sí en decisión

Los términos de uso de GitHub Pages excluyen explícitamente el uso como SaaS
comercial y transacciones sensibles — exactamente lo que es TakeOS. Riesgo de
cumplimiento, no de seguridad técnica. La migración técnica sería acotada, pero
**la decisión de cuándo resolverlo es de Agustín**, idealmente con el chat de
Asesor Legal, y antes de cobrar a clientes reales.

> **Acción concreta sugerida:** llevarlo a Agustín como punto de decisión explícito.

---

## Pendiente de actualizar en los canónicos (no en este documento)

1. **Desde v3:** que la Etapa 2 ya no es un trabajo en paralelo Juan/Agustín —
   contradice `TakeOS_Arquitectura_y_Flujo_de_Trabajo_v1_6.md`.
2. **Desde v4:** la decisión sobre GitHub Pages y uso comercial, una vez tomada,
   debería quedar registrada en el Arquitectura o el ADR de seguridad.
3. **Desde v5:** la corrección de roles (Juan = revisión técnica; Agustín =
   validación funcional) también vale la pena reflejarla en el Arquitectura, que
   hoy no distingue estos dos tipos de revisión con esa claridad.

---

## Estado consolidado

- **Etapa 0:** ✅ cerrada (cutover de producción aún pendiente).
- **Etapa 1:** ✅ cerrada (remanente de auth diferido).
- **SYNC:** ✅ completado.
- **Etapa 2:** 🔄 en curso — 2 de 7 módulos extraídos, revisión estática OK en ambos, pendiente validación interactiva de Agustín antes de arrancar módulo 3.
- **Deuda técnica:** Señales diferidas de Notificaciones — condición de desbloqueo documentada.
- **Deuda de producto (nuevo en v7):** drag & drop Kanban y filtros de búsqueda — features nunca implementados, fuera del scope de la modularización.
- **Horizonte:** edge middleware diferido sin urgencia; decisión sobre hosting pendiente de que Agustín la tome conscientemente.

**Cierre de la modularización (la meta no cambia):** el monolito partido en módulos
chicos, producción corriendo desde el build de Vite, despliegue automático, y el CSP
endurecido al final.
