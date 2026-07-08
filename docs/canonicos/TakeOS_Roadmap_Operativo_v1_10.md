# TakeOS — Roadmap Operativo y Modelo de Trabajo entre Chats

**Versión:** 1.10
**Fecha:** 8 de julio de 2026
**Autor:** Agustín Ignacio Muñoz Rocha · La Hectárea SpA / Primate Films
**Asesoría:** arquitectura de backend
**Estado:** Borrador para revisión.

> **Documento canónico.** Versiónalo y consolídalo como el PRD y el ADR (ver §4). Esta es la v1.10.

---

## Changelog — v1.9 → v1.10

Consolida el **Informe Técnico de Arquitectura (6-jul, `staging/main` @ `4c8067b`, + addenda 6–8-jul)** y el cierre del handoff de Code de `service_role`. **Quedan puntos abiertos** marcados con ⚠.

- **⚠ Producción ≠ staging — nuevo riesgo #1 (§2 Prioridad #3, §6).** Los dos remotos del repo divergieron **189 commits**: `origin/main` = **monolito** (producción real), `staging/main` = **arquitectura modular completa**. El **corte a producción** deja de ser "pasar a la build de Vite" y pasa a ser **cortar toda la reescritura modular** — es el pendiente grande, y una rama que la operación no usa acumulando todo el trabajo nuevo es un riesgo por sí mismo.
- **Prioridad #3 — modularización esencialmente completa en staging (no "88% pendiente").** El Informe corrige el estado: el monolito ya quedó reemplazado por **40 archivos / 25.327 líneas** (14 `lib/` + 25 módulos), con delegación de eventos, ganchos y época (ADR-026). **Lo que queda no es modularizar, es el corte a producción.** Las cifras "12 de ~1.290 / <1% / 88%" quedan superseded.
- **Cifras vivas duales (§2, pie).** Producción (último censo): 77 tablas / 147 policies / **8→9 migraciones** (con la revocación de `service_role` de Code). Staging (censo del informe): **72 tablas · 157 policies · 76 funciones `SECURITY DEFINER` · 14 migraciones**. ⚠ Tablas bajan (77→72, a verificar); **~5 migraciones sin handoff** entre la 9.ª y la 14.ª, no enumeradas.
- **Gate C / Track de Seguridad — dos huecos nuevos de A01 + cadena de suministro.** Al bloqueante de A01 (multi-tenant) se le suman dos aristas concretas: el **borrado blando elude el permiso `eliminar_proyecto`** y el **externo lee `contacts`** completo (+ snapshots sin segregar por org). Y entra **cadena de suministro** (A03): SRI, pin de `supabase-js`, doble `xlsx`. Detalle en el hub OWASP v1.5.
- **`npm run gate` — control de integridad de build.** Nace CI versionado (cero `on*=`, cero identificadores libres); cruza A03/A08. Correr a mano todavía.
- **CSP endurecido en staging.** `script-src` sin `'unsafe-inline'` (premio del refactor, OWASP A05); llega a producción con el corte.
- **⚠ Abierto — bug de departamentos por productora (ADR-F).** Los departamentos de servicios se pierden al recargar (guardan por nombre → NULL); fix técnico acordado con el BD Expert, **la decisión de diseño la arbitra Agustín**. Y **CLAUDE.md** desactualizado/fuera de lugar, **no tocado**.

---

## Changelog — v1.8 → v1.9

- **Cifras — 8 migraciones** (eran 7). Entra `20260621120000_revoke_anon_funciones_sensibles` (handoff de Code, 21-jun), ya en producción (no-op de grants).
- **Endurecimiento de `anon` completo.** Reconstruyendo staging fiel a prod se detectó que la migración de endurecimiento previa solo cubría 7 RPC de escritura; quedaban 19 funciones sensibles anon-ejecutables tras un reset limpio (42 vs. 23 en prod). La nueva migración las cierra → 26 funciones sensibles revocadas. El patrón canónico (`REVOKE … FROM PUBLIC, anon`) y la causa (default-priv de Supabase) quedan en ADR-024 y en el hub OWASP A02. Es un agregado; no cambia ninguna decisión previa.
- **Aprendizaje de flujo:** "reset reconstruye fiel" asume CLI **y** que las migraciones capturen los grants; el dump no capturaba los REVOKE de `anon`, por eso hubo que cerrarlo con migración (ADR-023). La branch `staging` sigue sin ligar a Git (mejora de horizonte).

---

## Changelog — v1.7 → v1.8

- **Prioridad #3 (modularización del frontend) — avance real, corte por corte.** Con la bitácora de Juan + Code verificada contra el código vivo en staging: **Etapa 0 hecha** (Vite + deploy + CSS extraído), **Etapa 1 hecha y verificada en staging** (el *cimiento*: 12 funciones a `frontend/src/lib/` —helpers, supabase, rates, state, auth— más el "puente" `main.js`), **Etapa 2 pendiente**. **La magnitud, sin maquillaje:** el cimiento es **<1% de las funciones** (12 de ~1.290); el monolito sigue con ~1.278 funciones / 23.369 líneas. **El ~88% del trabajo es la Etapa 2** (módulos de negocio + pegamento de UI), y es lo que ahora se reparte entre Juan (estructural) y Agustín (dominio) tras el **SYNC**. El detalle vive en **Arquitectura §3.4 y §7**; el despliegue con Vite en **ADR-015**.
- **Esto vive en staging; producción sigue siendo el monolito.** El **corte de producción** a la build de Vite está **pendiente** (junto con el diagnóstico del "404 real"), registrado en `PENDIENTES_Migracion_Vite.md`. No cambia ninguna decisión previa; es un agregado.
- **Objetivo de seguridad ligado a la modularización:** quitar `'unsafe-inline'` del CSP recién será posible al terminar la Etapa 2 (cruza con el hub OWASP A05).

---

## Changelog — v1.6 → v1.7

- **§5.1 y D-11 — flujo "BD en código" cerrado y operativamente explícito.** Tras el incidente del 17-jun (una migración aplicada a prod antes que al repo, reconciliada a mano) y la ratificación de Flujo de Trabajo y Metodología, queda **una sola secuencia canónica**: **Orden A** (repo primero, producción después), con la integración de **Branching de Supabase** que aplica la migración a producción **al mergear a `main`** (merge = deploy). El **Orden B (prod-first) se descarta de forma definitiva.** Se prescribe la configuración limpia (los 3 settings de la integración GitHub→Supabase en "encendido": deploy-on-merge, preview branches por PR, required check). Se agregan tres reglas: **R1** (el merge es el deploy; la revisión de la PR es la última compuerta humana), **R2** (la excepción "solo/rápido" relaja la revisión, nunca el orden, y solo para migraciones aditivas/no bloqueantes/reversibles que no toquen RLS, policies, auth, aislamiento de tenant ni drops/renames/cambios de tipo/backfills) y **R3** (no se canoniza excepción de "saltar staging": si la prueba es gratis por preview branches, se corre siempre). El detalle del flujo y su diagrama viven en **Arquitectura y Flujo de Trabajo v1.4 §2.2/§7**; el porqué técnico en **ADR-023**.
- **§2 Fase B/C — corrección de estado del frontend (verificado contra el build vivo V11.16.0).** Varios frentes que figuraban abiertos **ya están en producción**: el *auth gate* del cliente valida con `getUser()` (cierra el fail-open) y `authNivelModulo` **falla cerrado** (devuelve `'none'` para módulos no mapeados) —cerrados V11.15.0—; el **bug de refresco** (vuelve a proyecto + pestaña) cerrado V11.15.0; los **límites de plan como momento de venta** (handler central `manejarErrorPlan`), el **acceso restringido a externos** (lente `personas_de_mis_proyectos`) y **transferir administración**, cerrados V11.16.0; y el **Centro de Privacidad** con los **cinco flujos de derechos** (exportar, consentimientos/revocar, eliminar, edad, cookies) **con UI construida y en producción**. *Importante: el detalle de seguridad (auth gate, fail-closed) vive en el hub OWASP con punteros, no duplicado aquí.*
- **§2 Gate C — qué falta NO es más UI.** Con los cinco flujos ya construidos, lo pendiente del Gate C es la **aprobación legal de los textos** (hoy provisionales), el **backlog de endurecimiento** y el header **`frame-ancestors`**. No canonizar el Gate C como "listo".
- **§2 — backlog de endurecimiento (ADR-024) cerrado salvo `frame-ancestors`.** El 17-jun entró la migración de endurecimiento: REVOKE de `anon` en las RPC de escritura, `search_path` en ~11 utilitarias y la decisión de `app_config`. Quedan **7 migraciones** (eran 5) calzando local↔remoto.
- **§2 — cupo de colaboradores: por proyecto.** El límite es **por proyecto** (en `guardar_cargos`); `invitar_a_organizacion` ya no mide cupo; `rpc_assert_cupo_colaborador` quedó deprecada. Regla: **cargos = colaboradores**, y los internos no consumen cupo (detalle en PRD §22).
- **Pendientes — normalización de teléfono.** En `_perfilGuardar`, el teléfono se guarda en crudo: falta aplicar el formateador `+56`. La validación de RUT sí se agregó (V11.15.0). Menor y despriorizado, pero registrado.
- **Prioridad #3 — modularización activa.** Vite incremental (vanilla JS se mantiene), `frontend/src/lib` + `frontend/src/modules`, con cada módulo auto-registrando sus funciones en `window`; Etapa 0 (andamiaje + **deploy automático por GitHub Action**, que reemplaza el deploy manual frágil) → Etapa 1 (`src/lib`) → Etapa 2+ (módulos en paralelo). Es refactor que preserva comportamiento.

---

## Changelog — v1.5 → v1.6

- **§2 Fase B — Prioridad #1 y #2 cerradas.** La base quedó **"en código"** (5 migraciones, reproducible) y el **entorno de prueba** está levantado como **branch de Supabase** (`staging`); la **seguridad basal del beta** se cerró. Correcciones de estado: el **motor de organización activa ya está construido** (V10.9.0, no era bloqueador pendiente), el **XSS ya estaba cerrado** (no requería parche) y el **toggle de registro está cerrado**. Lo que queda para Gate B es el **RLS real por organización y rol** + validación multi-org (QA).
- **§2 Fase C — Backlog de endurecimiento + `frame-ancestors`** sumados como requisito antes del beta externo (ADR-024); pen-test externo ya desbloqueado del todo.
- **§2 Fase D — Beta sin fecha fija; duración aprox. ~4 meses** (antes 6). Las fechas quedan **en definición**; el **One-Pager de Planes** (fuente viva) reconcilia precio y duración. Early Bird ~3 meses (sin cambio).
- **§5.1 Conector de Supabase — protocolo reescrito.** Ya no se escriben cambios por el SQL Editor con checkpoints: **todo cambio de BD va por migración** (flujo en código, ADR-023); **nunca** un cambio directo a producción por el conector MCP (solo lectura/inspección y pruebas en transacción revertida).
- **§4 — Juan de la Cuadra entra como CTO** y cambia el flujo de trabajo del frontend: **ya no se reescribe el `index.html` entero en un chat**, se trabaja en **Code** (Git + ramas + PR). Awareness del nuevo chat **Flujo de Trabajo y Metodología** (Juan + Agustín).
- **§4.6 — Mundo de ejemplo: corregido a *ambos*** (El Señor de los Anillos **y** Game of Thrones); la base de prueba usa nombres de ambos mundos.
- **§7 — Nota de horizonte técnico:** posible **MCP server de solo lectura** para un Reporte de Cierre analítico (sin compromiso de fecha ni de pricing).

---

## Changelog — v1.4 → v1.5

- **§4.6 — Comunicación con Agustín: foco en lo que falla.** Nueva regla de **enfatizar los problemas**: lo que ya funciona se menciona breve; lo que falla o hay que arreglar se expande (qué, por qué, qué bloquea, para cuándo). Refuerza que Agustín no es técnico y necesita su atención puesta en los problemas, no en celebrar lo resuelto.
- **§4.6 — Mundo de ejemplo.** Cuando se use un mundo de ejemplo recurrente para explicar el sistema, el acordado pasa a ser **El Señor de los Anillos** (antes Game of Thrones).
- **§4.3 — Nombre estándar de los handoffs:** `Handoff {{Chat remitente}} a {{Chat destinatario}} {{Motivo}}`.
- **§2 — Hallazgos de testing (pulido de MVP).** Registrados dos arreglos detectados probando el software: (1) la página siempre vuelve al panel personal al refrescar —debería dejarte donde estabas—, y (2) la cuenta bancaria acepta cualquier número —faltan estándares/validación de cuentas bancarias—.
- *(Las ideas de producto de horizonte —módulos de Post-producción y Home/Vista de pájaro, herramienta gratuita viral, etc.— se registran en el PRD §24 Horizonte, no aquí.)*

---

## Changelog — v1.3 → v1.4

- **§2 — Fases actualizadas al estado real (handoffs de BD Expert y Legal).** Fase B (permisos / multi-tenant) con su avance: arquitectura multi-tenant **100% lista en BD**; el bloqueador real es el **motor de organización activa en el cliente** (dev, V10.7.0+). **Pen-test interno cerrado desde BD** (pendiente del dev: parche XSS en V10.7.1; pendiente de Agustín: cerrar el toggle de registro en Auth). Fase C suma los **cinco flujos de derechos del titular** (Ley 21.719) y la aprobación legal de los dos instrumentos en borrador; el pen-test externo se desbloquea sin esperar multi-tenant. Deadline Ley 21.719: **1 dic 2026**.
- **§2 — Fase D corregida: el beta NO es gratuito.** Pasa a **$1.000/mes × 6 meses** (programa de feedback con condiciones formales), según Marketing/GTM.
- **§2 — Faseo comercial (Fase E).** Early Bird (lanzamiento público, −50% sobre mensual o anual, ventana de 3 meses) → Lanzamiento oficial / GA (aparecen Estudio y A medida). Las cifras y la matriz de planes viven en el **One-Pager de Planes v3** (fuente viva); el Roadmap solo referencia la secuencia. Se evita el término "alpha".
- **§4.1 — Por qué chats aislados.** Se registran los tres beneficios de la arquitectura: especialización, ausencia de sesgo (mirada fresca) y paralelismo sin cola.
- **§4.2 — Nuevo chat: Pentester.** Chat ofensivo dedicado (ataca el frontend y lo que haga falta para hallar debilidades). Distinto del Test Master, que gestiona el entorno de prueba.
- **§5 (nueva) — Conectores.** Sección dedicada a los conectores que usan los chats/agentes (Supabase y Drive), con el **protocolo de seguridad del conector de Supabase** (checkpoints + prohibición de eliminar o tocar datos fundamentales).
- **Prioridades de integración de APIs del producto** registradas (correo → Google → WhatsApp).

---

## Changelog — v1.2 → v1.3

- **§2 — Gate A CERRADO.** Fase A marcada como **COMPLETADA (8 junio 2026)**: migración a Supabase terminada, Firebase clausurado (`deny-all`) y su SDK retirado en la V10. Todos los ítems del Gate A en ✅. Se corrige la descripción de estado, que decía que faltaban módulos (proyectos, finanzas, operaciones, legal) ya migrados desde las tandas 4a–4e.
- **§2 — Fase B EN CURSO.** Pasa de "SIGUIENTE" a **EN CURSO**.
- **§4.3 — Esquema de BD como contexto obligatorio.** Al activar cualquier chat que toque la base de datos, se adjunta también el export del esquema de Supabase, para que no decida sobre tablas o columnas de memoria ni de documentos desactualizados.
- **§4.7 (nueva) — Instrucciones operativas del Coworker.** Se consolidan dentro del Roadmap (decisión de Agustín: una sola fuente en lugar de instrucciones sueltas por chat). El documento operativo suelto del Coworker queda absorbido aquí.

---

## Changelog — v1.1 → v1.2

- **§4.2 — Mapa de chats ampliado.** Se incorporan tres roles que antes no estaban registrados: **Test Master** (entorno de prueba: vulneración controlada + espejo del software para perfeccionar herramientas antes de integrarlas), **Coworker** (acceso operativo al ordenador de Agustín) y **Redactor** (consolidación y versionado de los documentos canónicos —este chat—).
- **§4.4 — Reparto de la consolidación.** Se separa la consolidación *mecánica* (fusionar handoffs, redactar versiones, versionar, changelog → ahora la hace el **Redactor**) del *arbitraje* (decidir ante contradicciones → sigue siendo de **Agustín**). Ver "contradicción levantada" en la nota de consolidación de esta sesión.
- **§4.5 — Regla de versión madre.** Se registra la regla de gobierno de versiones: el PRD manda; cuando el PRD sube de versión madre, todos los documentos la siguen.
- **§4.6 — Cómo comunicarse con Agustín.** La antigua *Guía de Comunicación* deja de ser un documento suelto y se integra como subsección del Roadmap, que es donde vive el modelo de trabajo entre chats.

---

## 0. Qué es este documento (y qué no)

Tienes tres documentos canónicos, y cada uno responde una pregunta distinta:

| Documento | Pregunta que responde | Manda en |
|---|---|---|
| **PRD** | ¿Qué es TakeOS y por qué? | Producto y dominio |
| **ADR** | ¿Cómo se construye técnicamente y por qué así? | Decisiones técnicas |
| **Roadmap** (este) | ¿En qué orden, cuándo, y **quién** hace qué? | Ejecución y proceso |

El roadmap no repite las decisiones del PRD/ADR. Define la **secuencia de pasos**, los **gates** (puertas que no se cruzan sin cumplir requisitos), el **ciclo de evolución** del software, y —lo central— el **modelo de trabajo entre los chats de Claude** que construyen TakeOS.

---

## 1. Principios del roadmap

1. **Los documentos son el bus de integración.** Los chats no se hablan entre sí; son ciegos unos a otros. La única memoria compartida son los documentos canónicos. La calidad de TakeOS depende de la calidad y vigencia de esos documentos.
2. **Gates antes que velocidad.** Hay puertas (sobre todo antes de que entren datos de terceros) que no se cruzan por entusiasmo. Cumplir el gate es barato; saltárselo es caro.
3. **Nada es real hasta que se consolida.** El output de un chat experto es una *propuesta* hasta que se fusiona en el documento canónico correspondiente. Mientras tanto, no existe para los demás chats.
4. **Anti-cortisol también para el fundador.** El proceso debe proteger a Agustín de convertirse en un cuello de botella que se quema. Ligero, claro, versionado.
5. **Autoridad explícita.** Ante un choque: el PRD manda en producto, el ADR en lo técnico, y Agustín arbitra. Se deja registrado (como las decisiones de arbitraje del PRD v3).

---

## 2. Las fases (con sus gates)

Las fases siguen el roadmap del PRD §23, pero el roadmap operativo agrega **gates explícitos** entre ellas. Un gate es una lista de requisitos; no se pasa a la fase siguiente sin cumplirlos.

### Fase A — Terminar la migración a Supabase · *COMPLETADA — 8 junio 2026*
Recablear módulo por módulo de Firebase a Supabase (lectura → escritura), hasta apagar Firebase. Estado: **terminada.** Todos los módulos (contactos/empresas, proyectos+presupuesto, finanzas, operaciones, legal) migrados en las tandas 4a–4e. Firebase clausurado (`deny-all`) y su SDK retirado en la V10.

**🚪 Gate A — "Firebase apagado, datos seguros" · CERRADO:**
- [x] Todos los módulos leen y escriben contra Supabase; Firebase apagado.
- [x] El JSON-en-código eliminado (SDK de Firebase retirado en la V10; fuente única de verdad, sin exposición del universo completo en el cliente — ver ADR-010).
- [x] **Supabase Pro activo + backup restaurado de prueba** (restore validado el 8 junio 2026).
- [x] `currentUser()` conectado a la identidad real de la sesión (no al selector simulado).

### Fase B — Permisos operativos para el MVP (un solo tenant) · *EN CURSO*
Implementar el sistema de perfiles del handoff de permisos: `memberships`, `permission_profiles` (8, sembrados), `profile_permissions` (la matriz), `project_members`. Reemplazar las políticas `mvp_` por **RLS por perfil** (aislamiento por productora + alcance interno/externo + nivel por perfil).

**🚪 Gate B — "Permisos reales para Primate":**
- [ ] RLS por perfil reemplaza las políticas `mvp_`, probada con usuarios reales de cada perfil.
- [ ] El front oculta lo que el perfil no puede ver (UX), pero el backend lo niega (seguridad) — probado intentando saltarse la UI.
- [ ] Cada tabla nueva con su GRANT (gotcha del handoff).

> **Estado a junio 2026 (handoffs BD Expert + Code).** El **motor de organización activa en el cliente ya está construido** (`_setOrgActiva`, desde la V10.9.0): deriva la organización de la membresía activa del usuario y reemplaza el `ORG_ID` fijo, con una bandera que impide mostrar el Control Room a un usuario sin empresa. Lo que **queda para cerrar el Gate B** es el **RLS real por organización y por rol** (reemplazar las `mvp_`) y la **validación del aislamiento con varias organizaciones** (QA). En la base ya están las funciones de aprovisionamiento (ahora **autocontenidas**, ADR-022) y queda pendiente `consentir_invitacion`, que espera la aprobación legal del Instrumento 2 (ver Fase C). Detalle técnico en el ADR.
> **Infraestructura endurecida (Prioridad #1 y #2, cerradas).** La base quedó **"en código"** (5 migraciones, reproducible) y el **entorno de prueba** está levantado como **branch de Supabase** (`staging`); la **seguridad basal del beta** se cerró (contraseñas filtradas, toggle de registro, OAuth External, CSP, revocación de funciones internas, auditoría dirigida). El detalle vive en el documento de **Arquitectura y Flujo de Trabajo v1.3**.
> **Pen-test interno: cerrado.** Todos los hallazgos de BD remediados y verificados. El **XSS ya estaba cerrado** (la función `safeUrl` es robusta; no requería parche) y el **toggle de registro está cerrado** (hecho por Agustín).
> **Hallazgos de testing (estado actualizado contra el build vivo V11.16.0).** De los dos que aparecieron probando el software:
> 1. **Refresco — RESUELTO (V11.15.0).** El refresco ahora **te deja donde estabas** (vuelve al proyecto + la pestaña). Ya no manda siempre al panel personal.
> 2. **Validación de campos — parcial.** Se agregó **validación de RUT** (V11.15.0). Queda pendiente la **normalización de teléfono** en `_perfilGuardar` (guarda en crudo; falta el formateador `+56`) y, en general, la validación de cuentas bancarias / contenido a nivel de campo en el servidor (ítem transversal; ver ADR-002). Menor y despriorizado, pero registrado para que no se pierda.

### Fase C — Endurecer para multi-tenant + cumplimiento · *GATE CRÍTICO (recomendado, antes del beta)*
**Esta fase es la intervención principal de este roadmap.** Es lo que hay que construir *antes* de que entre la primera productora externa, porque ahí los datos confidenciales de terceros (tu competencia) entran al sistema.

- [ ] **Aislamiento multi-tenant endurecido y probado**: RLS filtrando por `organization_id` en serio, con tests que intenten cruzar tenants y fallen. (Hoy el aislamiento "depende de que un solo tenant use el sistema".) **⚠ Suman aquí dos huecos concretos hallados el 6-jul (hub OWASP A01):** el **borrado blando elude el permiso `eliminar_proyecto`** (el frontend hace `UPDATE deleted_at` directo en vez de la RPC endurecida) y el **externo lee la tabla `contacts` completa** (ninguna policy mira `memberships.tipo`); más **snapshots que no segregan por org**. Cerrar los tres es parte de sellar A01.
- [ ] **Audit log construido** (quién hizo/intentó qué, especialmente sobre datos bancarios). Es requisito legal (Ley 21.719) además de operativo.
- [ ] **Protección de datos bancarios** (cerrar la limitación "Base de Datos todo-o-nada" del handoff): mínimo, que datos bancarios no sean visibles para perfiles que no los necesitan. Mínimo privilegio + ley.
- [ ] **Decisión de acceso del fundador (ADR-A)** tomada: modelo de no-abuso (break-glass + audit + reputación + legal) y, idealmente, **separación societaria** de TakeOS + términos de servicio y consentimiento claros para las productoras beta.
- [ ] **Aprobación legal de los dos instrumentos.** Existen en borrador (`terminos-cuenta-2026-06-09-v0.1-borrador` y `consentimiento-incorporacion-2026-06-09-v0.1-borrador`) y **no son aptos para producción ni venta** hasta que un abogado habilitado los apruebe.
- [ ] **Cinco flujos de derechos del titular construidos** (Ley 21.719): (1) borrado/supresión de cuenta, (2) exportación/portabilidad, (3) revocar el consentimiento de incorporación a una productora, (4) verificación de edad (si aplica) y (5) aviso de cookies/analytics. *Prometer un derecho que la UI no entrega es, en sí mismo, un riesgo legal.*
- [~] **Backlog de endurecimiento — cerrado salvo un ítem.** El 17-jun entró la migración de endurecimiento: ✅ revocado a `anon` el `EXECUTE` en las RPC de escritura (capa externa; cada función ya valida `auth.uid()` por dentro y los flujos de invitación quedaron anon-ejecutables), ✅ `search_path` fijado en ~11 funciones utilitarias, ✅ decidida la policy de `app_config`. **Queda solo** el header **`frame-ancestors`** (anti-clickjacking) del hosting. Sin hallazgos críticos. Detalle en ADR-024 y Arquitectura §6.

**🚪 Gate C — "Listo para datos de terceros":** los siete puntos de arriba, cumplidos y probados. Sin este gate, el beta pone en riesgo lo más caro de todo el plan: la confianza y el cumplimiento legal.

> **Estado a junio 2026 (verificado contra el build vivo V11.16.0).** El audit log ya es inmutable desde el cliente y el aislamiento por organización está construido en la base (ver ADR); falta endurecerlo con tests de cruce de tenant que deban fallar. La **infraestructura técnica de cumplimiento** (consentimiento versionado + copia exacta del texto, auditoría inmutable) está lista, y el **Centro de Privacidad con los cinco flujos de derechos** (exportar, consentimientos/revocar, eliminar, edad, cookies) **ya está construido y en producción** (UI). Por lo tanto, lo que falta del Gate C **NO es más UI**: es la **aprobación legal de los textos** (hoy provisionales), el **backlog de endurecimiento** (cerrado salvo `frame-ancestors`) y el header **`frame-ancestors`**. **Deadline Ley 21.719: 1 de diciembre de 2026 (inamovible).**
> **Pen-test externo: desbloqueado** (el XSS ya estaba cerrado y el registro está cerrado en Auth). Puede arrancar sin esperar a que multi-tenant esté completo.

### Fase D — Beta de feedback con productoras (~4 meses, en definición)
Onboarding de un grupo acotado de **productoras amigas**, para feedback y enganche. Inicia el ciclo de evolución circular (§3). **Solo después del Gate C.**

**No es gratuito (corrección desde Marketing/GTM):** el beta cuesta **$1.000/mes** durante **~4 meses** (duración aproximada, **aún en definición**) —precio simbólico aplicado a mano por admin, sin UI pública—. A cambio, condiciones formales: (1) una **reunión cada ~2 meses** (online o presencial, ~30 min) con personas que **efectivamente usan** el software, no solo el dueño; y (2) si se quedan tras el período, un **testimonio** en formato entrevista por videollamada sobre los usos y el cambio operativo. Empieza ~1–2 semanas antes del lanzamiento público y sirve para endurecer el servicio y el sistema de pago. **Las fechas y la duración exacta están en definición; el One-Pager de Planes (fuente viva) reconcilia el número final.**

> **Alternativa para empezar antes:** si quieres arrancar el beta sin esperar todo el Gate C, hazlo con **alcance reducido** (productoras no competidoras directas, o sin cargar aún los módulos financieros sensibles) hasta cerrar el gate completo. La regla innegociable: no entran datos bancarios ni márgenes de terceros sin aislamiento probado + audit log.

### Fase E — Comercialización
Suscripción premium, Portal de Clientes, secuencia Chile → Latam → EE.UU. (PRD §22, §23). El faseo comercial, desde Marketing/GTM:
1. **Early Bird (lanzamiento público):** tarifa de lanzamiento de **−50%**, aplicable tanto al pago **mensual como anual**, durante los primeros **3 meses**. Etiqueta de cara al cliente: "Early Bird" (nunca "beta" en público). Visibles: Gratis, Rodaje, Producción. Estudio **no se muestra** todavía.
2. **Lanzamiento oficial / GA:** aparecen **Estudio** y **A medida**; precios estándar; Early Bird cerrado. *(Se evita el término "alpha": en la convención de software es la etapa más temprana e invertiría el orden.)*

> **Las cifras y la matriz de planes viven en el One-Pager de Planes (v3), que es la fuente viva de precios.** El Roadmap (y el PRD) solo referencian la estructura y la secuencia, para no quedar obsoletos en cada ajuste de precio.

> **Prioridades de integración de APIs del producto** (constatado por Agustín, junio 2026):
> 1. **Correo electrónico** *(en curso, prioridad máxima)* — con el Supabase Auth Expert; bloqueado por el registro del dominio.
> 2. **Google** *(siguiente)* — principalmente Google Calendar, además de Gmail; opcional por usuario (requiere que autorice el acceso).
> 3. **WhatsApp Business** *(horizonte, etapa SaaS)* — la más burocrática y compleja (Meta Business verificado + aprobación de plantillas); la UI ya está construida, el backend es trabajo futuro.

---

## 3. El ciclo de evolución circular (detallado)

Tu intuición del ciclo es correcta. Le agrego los tres pasos que la simplificación se saltaba —**triage, QA/deploy y consolidación de documentos**— porque son justo donde un fundador solo pierde el control.

```
        ┌──────────────────────────────────────────────┐
        │                                              │
        ▼                                              │
  1. USO  ──►  2. CAPTURA  ──►  3. TRIAGE  ──►  4. DISEÑO  ──►  5. SPEC/HANDOFF
 (productoras    de feedback     y prioridad    (chat experto    (documento para
  o Primate)                                     del dominio)      el dev)
        ▲                                                              │
        │                                                              ▼
  8. CONSOLIDACIÓN  ◄──  7. QA + DEPLOY  ◄──────────────────  6. INTEGRACIÓN
   (actualizar docs       (staging → prod,                      (chat dev integra
    canónicos +            rollback listo)                       al OS)
    changelog)
```

**Paso a paso, con responsable:**

1. **Uso.** Productoras y Primate usan TakeOS en producción real.
2. **Captura de feedback.** Recoger bugs, fricciones y pedidos en un solo lugar (no en mails sueltos — el mismo pecado que TakeOS combate). *Responsable: Agustín / equipo.*
3. **Triage y priorización.** No todo se construye. Filtrar contra los principios del PRD —sobre todo **anti-cortisol** y el **moat** (Reporte de Cierre)—. Decidir: bug / mejora / feature nueva / descartar. *Responsable: Agustín, con el asesor si hay duda técnica.*
4. **Diseño.** El ítem priorizado va al **chat experto del dominio** que corresponda (BD, auth, herramientas, legal, marketing). El experto diseña, leyendo primero los documentos canónicos vigentes. *Responsable: chat experto + Agustín.*
5. **Spec / Handoff.** El experto entrega un **documento de handoff** (como el de permisos): claro, con alcance MVP/horizonte, sin ambigüedad. *Responsable: chat experto.*
6. **Integración.** El **chat dev** toma el handoff y lo integra al OS. El patrón "desarrollador de herramientas construye aislado → entrega al dev para integrar" se mantiene. *Responsable: chat dev.*
7. **QA + Deploy.** Probar en **staging** (copia de producción), no en producción. Deploy con **rollback** listo (ADR-015). *Responsable: chat dev + Agustín.*
8. **Consolidación.** Actualizar los documentos canónicos (PRD/ADR/handoffs) y el **changelog**, para que el próximo ciclo arranque sobre la verdad vigente. *Responsable: Agustín (orquestador).*

Y vuelve a empezar.

---

## 4. El modelo de trabajo entre chats (lo central)

### 4.1 La idea clave
**Los chats de Claude no se comunican entre sí. Son ciegos unos a otros y no recuerdan los otros.** Lo único que comparten son los **documentos canónicos**. Por eso el modelo no es "coordinar chats", es **mantener un bus de documentos impecable** que cada chat lee al entrar y al que cada chat aporta al salir.

**Por qué conviene tener chats aislados (no uno solo que lo haga todo):**
1. **Especialización.** Cada chat se concentra y se vuelve experto en un solo dominio, en vez de dispersarse en todo.
2. **Ausencia de sesgo.** Como algunos chats no ven la información de otros, pueden mirar un problema con ojos frescos en lugar de arrastrar el sesgo de una conversación previa.
3. **Paralelismo.** Se avanza en varias tareas a la vez sin cola: el trabajo de un módulo avanza en Code mientras el Experto de BD ajusta Supabase y otro chat trabaja en lo suyo. Con un solo chat haciendo todo, habría cuello de botella.

### 4.2 Los roles (chats)
Cada chat es un rol con un alcance definido. No todos están activos siempre; se levanta uno cuando hay trabajo sostenido para él (levantar un chat tiene costo de coordinación).

| Chat / rol | Alcance | Documento que alimenta |
|---|---|---|
| **Asesor / arquitecto** | Decisiones de arquitectura, calibración, supervisión, formación | ADR + Roadmap |
| **Dev (integración)** | Construir e integrar al OS; recablear datos. **Hoy se trabaja en Code** (no reescribiendo el HTML entero en un chat). | Changelog de software + handoffs de vuelta |
| **Experto de BD** | Esquema, tablas, relaciones, migraciones | Handoff de BD + ADR-005 |
| **Experto de auth / permisos** | Autenticación, RLS, perfiles | Handoff de permisos + ADR-003/004 |
| **Asesor legal** | Ley 21.719, contratos, términos, consentimiento | Sección de cumplimiento del PRD + ADR-012/A |
| **Desarrollador de herramientas** | Construir features aisladas, afinarlas, entregar al dev | Handoff de herramienta |
| **Jefe de marketing** | GTM, pricing, ICP, posicionamiento, moat | PRD §22 |
| **Test Master** | Dirigir, gestionar y ayudar a ejecutar el **entorno de prueba** (staging). Dos usos: (a) **intentar vulnerarlo**, para descubrir aperturas de seguridad antes de que lo haga un atacante real; (b) **actualizar y probar** software en un espejo del sistema, sin tocar el real, hasta que las herramientas estén sólidas y se integren al software de producción. | Hallazgos de seguridad + reportes de QA (alimentan el Gate C y el paso 7 del ciclo, §3) |
| **Pentester** | Chat **ofensivo dedicado**: ataca el frontend y cualquier otra superficie del sistema para encontrar debilidades de seguridad. Se diferencia del Test Master en que este *gestiona* el entorno de prueba, mientras el Pentester *ataca* para romperlo. | Reporte de hallazgos de seguridad (al ADR y al Gate C, vía Agustín) |
| **Coworker** | Operar dentro del ordenador de Agustín para tareas concretas. Funciona de dos formas: (1) ejecuta **handoffs** que le entregan otros chats con instrucciones claras de cómo operar; (2) ejecuta lo que **Agustín** le pide en sus propias palabras. | Resultados de ejecución de vuelta a Agustín (no edita documentos canónicos) |
| **Redactor** | Consolidar los documentos canónicos: cruzar handoffs contra lo vigente, redactar **solo lo que cambia**, versionar y registrar el changelog. No decide producto ni arquitectura; las contradicciones las sube a Agustín. | PRD + ADR + Roadmap (los **versiona**; no los arbitra) |
| **Orquestador (Agustín)** | Routear, **arbitrar** (decidir ante contradicciones) y dirigir. La consolidación mecánica la delega en el Redactor. | Todos (es quien los gobierna) |
| **CTO (Juan de la Cuadra)** | Responde por **todo el código**: arquitectura, frontend, backend, BD, integración, entorno de prueba y seguridad (incluye las funciones de **Test Master** y **Pentester**, que dirige). Trabaja en Code con Git + PR. | Estructura de código, staging, PRs revisados (ver Arquitectura y Flujo de Trabajo) |
| **Flujo de Trabajo y Metodología** | Chat de Juan + Agustín para evaluar el **método de trabajo** del equipo (prácticas DevSecOps, historias de usuario sin ceremonia). | Ajustes al modelo de trabajo (este Roadmap + Arquitectura) |

> **Cambio de método (junio 2026).** Con la entrada de **Juan como CTO** y el trabajo en Git + Code, **el frontend ya no se construye reescribiendo el `index.html` entero en un chat**: se trabaja en **Code**, en ramas cortas con Pull Request revisado, sobre el repositorio. El detalle del flujo de equipo (quién hace qué, ciclo de PR, entornos) vive en **Arquitectura y Flujo de Trabajo v1.3**.

### 4.3 El protocolo de handoff (cómo entra y sale el trabajo de un chat)
Cada vez que se activa un chat experto:

**Al entrar (contexto):**
1. Se le entregan los **documentos canónicos vigentes** relevantes (PRD, ADR, handoffs del dominio), **con su número de versión**.
2. El chat **lee primero**, antes de proponer nada.

> **Esquema de BD como contexto obligatorio.** Si el chat toca la base de datos (BD, auth/permisos, dev, Test Master), se le adjunta además el **export del esquema de Supabase** (el SQL de "Copy as SQL" del Schema Visualizer), junto a los documentos canónicos. Así no decide sobre tablas o columnas de memoria ni de documentos desactualizados.

**Al salir (entrega):**
3. El chat entrega un **handoff** con su propuesta: claro, con alcance MVP/horizonte, y **declarando explícitamente las contradicciones** que detecte con los documentos canónicos (como hemos venido haciendo).
4. El chat **nunca edita los documentos canónicos directamente.** Propone; la edición ocurre en la consolidación.

> **Nombre estándar de un handoff:** `Handoff {{Chat remitente}} a {{Chat destinatario}} {{Motivo}}`. Ej.: *Handoff BD Expert a Redactor — identidad global del usuario*. Mantenerlo consistente ayuda a archivar y a saber de un vistazo de dónde viene y a dónde va cada entrega.

### 4.4 La consolidación (el paso que sostiene todo)
- **El arbitraje es de Agustín; la redacción es del Redactor.** Cuando un handoff contradice lo vigente, **Agustín decide** (decisión de arbitraje). Quien después **fusiona los handoffs en los documentos canónicos, redacta solo lo que cambia, sube la versión y escribe el changelog** es el **Redactor**. El Redactor nunca decide producto ni arquitectura: si encuentra una contradicción, la levanta y espera la decisión de Agustín antes de redactarla.
- Cadencia sugerida: **una consolidación por ciclo** (paso 8 del §3), o cuando se acumulen 2–3 handoffs. No dejar handoffs sin consolidar: un handoff sin consolidar es una contradicción esperando a pasar.
- Si la consolidación se vuelve pesada, es señal de que hay demasiados chats activos a la vez. Reducir.

### 4.5 Reglas anti-deriva (innegociables)
- **Versiona todo documento canónico** (PRD v3.1, ADR v1.2, etc.) y registra el changelog.
- **Regla de versión madre (el PRD manda).** La versión tiene dos números: el primero es la **versión madre** y el segundo la **subversión** (ej.: en `v3.2`, el `3` es madre y el `2` es subversión). Si el **PRD sube de versión madre** (ej. v3.x → v4.0), **todos los documentos canónicos lo siguen** y saltan a esa misma versión madre. Si solo cambia una subversión (como esta consolidación del Roadmap, v1.0 → v1.2), **cada documento avanza en su propia línea** y no se mueve la versión madre de los demás.
- **Cada chat declara qué versión leyó.** Si leyó una vieja, su output puede estar contaminado.
- **Las contradicciones se levantan, no se resuelven en silencio** (principio del PRD §00.C).
- **Ningún output es "real" hasta consolidarse.**

### 4.6 Cómo se comunican los chats con Agustín

Esta subsección reemplaza a la antigua *Guía de Comunicación con Agustín*, que dejó de ser un documento suelto: vive aquí, dentro del modelo de trabajo entre chats, porque es parte de cómo opera el bus. **Todos los chats** (frontend, backend, BD, marketing, legal, Test Master, Coworker, Redactor, etc.) se rigen por estas reglas.

**Quién es Agustín.** Es el director y orquestador de TakeOS: toma todas las decisiones de producto y coordina entre los chats. **No es programador.** Aprendió lo básico de backend para dirigir, pero no conoce el detalle técnico. Donde sí tiene criterio sólido y autoridad es en el **frontend y la experiencia de usuario**, porque eso se conecta directamente con la producción audiovisual, que es su oficio.

**1. Habla claro, siempre.** Agustín no maneja la jerga técnica. Cuando uses un término especializado, explícalo de inmediato en la misma oración. No asumas que lo conoce.
- ❌ `Vamos a crear un RPC con security definer que bypasea el RLS.`
- ✅ `Vamos a crear una función especial en la base de datos, con privilegios de administrador, para poder escribir datos de forma segura.`

**2. Explica con analogías.** Cuando algo sea abstracto, aterrízalo con una analogía concreta. Importa que la idea llegue, no de qué mundo venga la comparación. *(Si se usa un mundo de ejemplo recurrente para explicar el sistema, los acordados son **ambos: El Señor de los Anillos y Game of Thrones**; la base de datos de prueba usa nombres de los dos mundos.)*

**3. En lo técnico (backend / BD): decide tú, no lo pongas a elegir.** Agustín se declara ignorante en backend y base de datos; darle opciones técnicas lo desorienta porque no tiene base para comparar. El patrón es: (1) **decide** la mejor ruta con tu criterio técnico, (2) **explícale** qué vas a hacer y por qué importa, en simple, (3) **espera su luz verde** antes de proceder.
- ❌ `¿Prefieres un RPC de verificación o un script de comparación lado cliente?`
- ✅ `Voy a crear una consulta de solo lectura en Supabase que te muestra los datos sensibles para que tú los revises. Es la forma más directa para alguien sin acceso a Firebase. ¿Te parece?`

**4. En frontend y producto: sí dale opciones y pide su criterio.** Aquí es al revés: el frontend toca cómo funciona la producción audiovisual, así que Agustín tiene criterio fuerte y quiere participar en las decisiones de diseño, flujo y experiencia. Preséntale alternativas, muéstrale ejemplos y espera su input antes de implementar.

**5. Al terminar una tarea, di el siguiente paso.** Nunca cierres una entrega en el vacío. Indica el paso natural que sigue, dejando espacio para que Agustín quiera hacer otra cosa.
- ❌ `Listo, el SQL está generado.`
- ✅ `El SQL está listo. El paso siguiente es correrlo en Supabase y avisarme el resultado para continuar con X. Si prefieres hacer otra cosa primero, dímelo.`

**6. Escríbele a él, no al otro chat.** Agustín es el bus entre todos los chats: él transporta los handoffs de uno a otro. Cuando un chat necesita que algo llegue a otro chat, **se lo dice a Agustín**, no le habla al chat de destino (que es ciego a esta conversación). Ej.: `Esto es algo que tiene que hacer el chat dev. Cuando le pases el próximo handoff, dile que...`

**7. Pon el foco en lo que falla, no en lo que ya está bien.** Al reportar estado, lo que funciona o ya se solucionó se menciona y se explica **brevemente**; lo que **falla o hay que arreglar se expande**: qué está mal, por qué, qué bloquea y para cuándo se necesita. Agustín necesita su atención puesta en los problemas, no en celebrar lo resuelto.
- ❌ Tres párrafos elogiando lo que quedó perfecto y una línea al final sobre el error.
- ✅ `Lo demás quedó funcionando bien. El punto que importa: el envío de correos todavía no funciona —no hay servidor de correo conectado—, y está frenado porque aún no registramos el dominio. Es lo que hay que destrabar para avanzar.`

**Resumen en una línea:** habla claro, usa analogías, decide en lo técnico, pídele criterio en el producto, **pon el foco en lo que falla**, y siempre dile qué viene después.

### 4.7 Instrucciones operativas del Coworker

El **Coworker** es el chat con acceso operativo al ordenador de Agustín. **Ejecuta tareas concretas; no diseña ni decide.** Opera en dos modos: (1) **handoff** — recibe instrucciones estructuradas de otro chat (Dev, BD, etc.), las ejecuta y reporta; (2) **directo** — ejecuta lo que Agustín le pide en sus propias palabras. No edita los documentos canónicos (los lee para contexto, no los modifica).

**Principio fundamental — el costo real de automatizar.** Antes de automatizar algo, la pregunta es: *¿esto tarda menos que si Agustín lo hace a mano?* El Coworker existe para ahorrar tiempo real, no para demostrar que técnicamente puede. Una automatización más lenta que el camino manual es tiempo perdido disfrazado.

**La regla de los dos caminos.** Ante cualquier tarea, evaluar dos rutas y elegir la que deja menos tiempo muerto para Agustín:
- **Camino A — el Coworker lo hace todo:** incluye pasos que dependen de APIs externas, autenticación o nube. Fricción técnica alta; Agustín espera.
- **Camino B — el Coworker hace la parte local, Agustín cierra:** solo opera el sistema de archivos local o herramientas ya conectadas. Fricción baja; Agustín recibe el trabajo listo para terminar en segundos.

Si el Camino B existe y es más rápido, se toma y se dice explícitamente: *"Hago la parte local ahora; mueve la carpeta a Drive cuando quieras."*

**Aprendizaje registrado (junio 2026).** Subir archivos locales a Google Drive vía API tomó varios minutos para lo que Agustín hace en 10 segundos arrastrando una carpeta en el Finder. Regla derivada: si la tarea termina en la nube (Drive u otro servicio), hacer la parte local perfecta y dejar el traspaso al usuario. *(Los aprendizajes operativos nuevos del Coworker se consolidan aquí en cada ciclo.)*

**Patrones de tarea recurrentes:**
- *Organización por versión:* identificar archivos y su versión (ej. `TakeOS_V9_6_15.html` → `9.6.15`), crear una carpeta por versión en el directorio local indicado, mover el HTML y su CHANGELOG adentro, reportar cuántas y cuáles. No tocar Drive.
- *Renombrar carpeta madre de un ciclo:* al cerrar una serie (ej. toda la V9.x), renombrar la carpeta madre con el rango real (`TakeOS v9.0.0 - v9.6.18`). Si está solo en Drive, proponerle a Agustín el nombre exacto para que lo haga en el Finder.

**Lo que el Coworker NO hace:** editar documentos canónicos; tomar decisiones de producto; ejecutar tareas de seguridad (permisos, credenciales, accesos) sin instrucción explícita y confirmación de Agustín; ni asumir que "técnicamente posible" equivale a "la mejor ruta".

**Cómo comunica** (además de §4.6): claro y corto, una línea de estado, no un ensayo; dice qué hizo y qué sigue; si hay fricción técnica que va a tardar más de lo esperado, avisa de inmediato y propone el camino alternativo, sin seguir por inercia.

---

## 5. Conectores

Los chats y agentes que construyen TakeOS operan sobre **conectores**: puentes hacia servicios externos. Hoy hay dos —**Supabase** (la base de datos) y **Google Drive** (archivos)— y es probable que aparezcan más. Esta sección fija las reglas de uso. (No confundir con las **integraciones del producto** —correo, Google Calendar, WhatsApp—, que son features para el usuario final y se priorizan en §2.)

### 5.1 Conector de Supabase — protocolo (innegociable)

Mensaje para **todos los chats y agentes que usan Supabase directamente**. Con la base ya **"en código"** (ADR-023), el protocolo cambió de raíz:

- **Leer / inspeccionar:** sin restricción. Se puede consultar con normalidad.
- **Cambios de esquema o datos a producción por el conector MCP: jamás.** Ningún agente aplica un cambio directo a la base de producción por el conector. Eso desincronizaría la base respecto del código versionado. **Todo cambio de base de datos va por migración, en el Orden A (repo primero, producción después).** Secuencia canónica única: **(1)** migración en una rama de feature → **(2)** PR + prueba sobre datos de prueba (con *required check* activo: una migración que falla no se puede mergear) → **(3)** revisión de Juan → **(4)** merge a `main` → **(5)** la integración de **Branching de Supabase** aplica la migración **a producción al mergear** (merge = deploy; sin `db push` manual). El **Orden B (aplicar a prod antes de mergear) se descarta de forma definitiva**: fue el atajo que causó la desincronización del 17-jun y contradice cómo opera la integración. Detalle completo y diagrama en **Arquitectura y Flujo de Trabajo §2.2/§7**.
- **Pruebas:** lo que un agente necesite probar contra datos, lo hace en la **branch `staging`** (o en el preview branch de la PR) o en una **transacción que se revierte** (`BEGIN … ROLLBACK`), nunca con escritura persistente a producción.
- **Eliminar o modificar algo grave: jamás.** Bajo ninguna circunstancia un agente borra o altera datos fundamentales —**organizaciones**, estructuras core, configuración crítica—.

**Por qué cambió.** El protocolo anterior permitía escribir en el SQL Editor bajo checkpoints. Eso servía cuando la base vivía solo en el servidor; ahora que la base es código reproducible **y producción se actualiza por el merge a `main`**, cualquier escritura fuera de una migración rompe la única fuente de verdad. La regla nueva es más simple y más segura: **el conector es para mirar, no para tocar producción.**

La idea de fondo se mantiene: Agustín como árbitro y guardián, y los agentes como ejecutores **con guardarriel**, no autónomos. *(Coherente con ADR-023 y con la inmutabilidad del audit log descrita en el ADR.)*

### 5.2 Conector de Google Drive

Usado para mover y organizar archivos (ver el patrón del Coworker en §4.7). Regla práctica heredada: si una tarea termina en Drive, conviene hacer la parte local y dejar el traspaso final al usuario (el Finder es más rápido que la API para mover carpetas completas).

---

## 6. Riesgos y mitigaciones

| Riesgo | Gravedad | Mitigación |
|---|---|---|
| **Divergencia producción ↔ staging (189 commits): la operación corre el monolito y todo el trabajo nuevo vive en una rama sin cortar** | **Alta** | Planificar y ejecutar el **corte a producción** de la rama modular como frente de primera clase (con verificación + diagnóstico del "404 real"); mientras no se corte, cada commit amplía la brecha. Ver Arquitectura §5 y ADR-015. |
| Beta con datos de terceros antes del aislamiento/audit/acceso-fundador | **Alta** | Gate C antes de Fase D; o beta de alcance reducido. |
| **Huecos concretos de A01 hallados el 6-jul (borrado blando elude permiso; externo lee `contacts`; snapshots sin segregar org)** | **Alta** | Usar RPC `eliminar_proyecto`; policy `contacts` para externos; segregar snapshots por org. Parte del Gate C / Track de Seguridad (hub OWASP A01). |
| Datos bancarios visibles a perfiles que no los necesitan en multi-tenant | **Alta** | Cerrar "BD todo-o-nada" en Gate C (mínimo privilegio + ley). |
| **Cadena de suministro (A03): CDN sin SRI, `supabase-js` con major flotante, `xlsx` doble** | Media | Pin exacto + SRI + quitar la doble carga; atar `npm run gate` a CI. |
| Deriva entre documentos (contradicciones que se acumulan) | Media | Consolidación por ciclo + versionado + autoridad clara. |
| Agustín como cuello de botella / burnout | Media | Proceso ligero; levantar chats solo con trabajo sostenido; no acumular handoffs. |
| Bug de RLS multi-tenant (una productora ve a otra) | **Alta** | Tests de cruce de tenant que deben fallar; parte del Gate C. |
| Feedback del beta que infla el roadmap (construir todo lo que piden) | Media | Triage contra principios del PRD (anti-cortisol + moat) en el paso 3 del ciclo. |

---

## 7. El norte, en una frase

Terminar la migración con red (Gate A) → permisos reales para Primate (Gate B) → endurecer para que entren terceros con seguridad y dentro de la ley (Gate C) → beta de pago simbólico que alimenta un ciclo de mejora disciplinado → comercialización. Todo sostenido por un bus de documentos canónicos que los chats leen y alimentan, y que Agustín consolida y versiona.

> **Nota de horizonte técnico (sin compromiso).** Se evalúa, para más adelante, exponer un **MCP server de solo lectura** (una Edge Function acotada) que permita consultar un **Reporte de Cierre analítico** desde herramientas externas. Es solo una posibilidad de horizonte: **no se promete como feature ni entra en pricing**, y es distinto del conector MCP de Supabase (§5.1). Nada de esto se documenta aún en el ADR.

---

*Documento canónico · v1.10 · 8 de julio de 2026 · Primate Films / La Hectárea SpA. Versiónalo y consolídalo como el PRD y el ADR. **Cifras vivas duales** (producción monolito vs. staging modular, ver changelog y hub OWASP v1.5): producción 77 tablas / 147 policies / 8→9 migraciones; staging 72 tablas / 157 policies / 76 funciones `SECURITY DEFINER` / 14 migraciones / 40 archivos frontend. **Pendiente grande: el corte a producción** (las ramas divergieron 189 commits).*
