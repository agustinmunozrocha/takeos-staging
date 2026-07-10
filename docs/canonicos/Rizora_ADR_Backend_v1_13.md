# Rizora — ADR de Backend (Architecture Decision Record)

**Versión:** 1.13
**Fecha:** 10 de julio de 2026
**Autor de las decisiones:** Agustín Ignacio Muñoz Rocha · Primate Films / La Hectárea SpA
**Asesoría técnica:** sesión de arquitectura de backend
**Estado del documento:** Borrador alineado al **PRD V3.7** (autoritativo), al **Roadmap Operativo v1.11**, al **Arquitectura y Flujo de Trabajo v1.9** y al hub **Seguridad OWASP Top 10:2025 v1.6**. Consolida el **Informe Técnico de Arquitectura (6-jul, rama `staging/main` @ `4c8067b`, con addenda del 6 al 8-jul)** y el cierre del **handoff de Code (21-jun) — grants de `service_role`**, además de los **handoffs de Flujo de Trabajo y Metodología (flujo BD en código), Dev (deltas de frontend), Code (modularización Vite, endurecimiento de grants `anon`)**.

> **Eje transversal desde v1.12 — estado dual producción ↔ staging.** Los dos remotos del repo ya **no son el mismo software** y divergieron **189 commits**: `origin/main` sirve el **monolito** (producción real: `index.html` de 28.649 líneas, 549 handlers inline, CSP con `unsafe-inline`); `staging/main` sirve la **arquitectura modular** que describe el Informe Técnico. Desde esta versión, **toda cifra viva y todo estado de frontend se leen etiquetados por rama**. El "corte a producción" deja de ser "pasar a la build de Vite" y pasa a ser **cortar toda la reescritura modular** — ver ADR-015 y el nuevo riesgo abierto.

> **Autoridad documental.** Donde el PRD y este ADR hablen del mismo tema, **el PRD manda en lo conceptual y de producto; el ADR manda en lo técnico**. El PRD V3.6 es la fuente de verdad de las decisiones; este documento detalla el *cómo* y el *porqué* técnico. El **Roadmap Operativo v1.10** define la secuencia de ejecución y el modelo de trabajo entre chats; el **Arquitectura y Flujo de Trabajo v1.8** documenta la infraestructura (BD en código, entornos, flujo de despliegue, modularización del frontend) y el flujo de equipo.

---

## Changelog — v1.12 → v1.13

Dos cambios estructurales ordenados por Agustín (10-jul):
- **Renombre del producto: Rizora.** Todo el nombre en prosa pasa de "TakeOS" a **Rizora**. Se distinguen tres cosas que NO se mezclan: **Rizora** (el SaaS), **La Hectárea SpA** (la sociedad sobre la que opera Primate Films) y **Primate Films** (la productora que opera de La Hectárea SpA). ⚠ Queda **pendiente el nombre de la sociedad sobre la cual operará Rizora**. Los identificadores técnicos reales conservan su nombre hasta renombrarse en el sistema (ver nota de deuda bajo este changelog).
- **ADR-027 (nuevo) — Modo solo-dev + política de "cargos, no nombres".** El cargo de CTO queda **vacante**; el proyecto opera con Agustín solo, manteniendo todos los protocolos (PRs, staging, Orden A, gates) con la revisión adaptada a auto-revisión disciplinada. Y desde ahora los canónicos **no asignan roles a personas con nombre**: describen cargos; los nombres solo sobreviven en changelogs/registro de decisiones como trazabilidad histórica marcada. Los documentos completos fueron despersonalizados según esta política.

> **⚠ Deuda de renombre técnico (Rizora).** El producto se llama **Rizora**, pero varios artefactos **reales** conservan el nombre anterior y los canónicos los citan tal cual hasta que se renombren de verdad (documentar un nombre que no existe rompería la fidelidad): los repos `agustinmunozrocha/Take-OS` (producción) y `agustinmunozrocha/takeos-staging`, la URL `https://agustinmunozrocha.github.io/takeos-staging/`, la propiedad `window.__TAKEOS_USER`, la clave de autosave `takeos_autosave_v1`, las policies de Storage `takeos_storage_*` y el paquete `takeos-frontend`. Cuando se renombren en el sistema, se actualizan aquí.

## Changelog — v1.11 → v1.12

Consolida el **Informe Técnico de Arquitectura (6-jul, `staging/main` @ `4c8067b`, + addenda 6–8-jul)** y cierra el **handoff de Code (21-jun) — grants de `service_role`**. Es la consolidación más grande desde que la base entró en código: el estado real saltó muy por delante de lo que registraban los canónicos. **Quedan cuatro puntos abiertos** a resolver con Agustín, marcados abajo con ⚠.

- **Estado dual producción ↔ staging (nuevo eje).** Ver la nota del encabezado. Los dos remotos divergieron 189 commits; producción = monolito, staging = modular. El corte a producción pasa a ser cortar la reescritura completa.
- **ADR-005 (cifras vivas) — ahora dual.** Producción (último censo conocido, 16–21 jun, DB `zplcgetquwxybkrpmcvl`): 77 tablas / 147 policies / ~71 funciones / **8 migraciones** (→ **9** con el cierre de `service_role` de Code). Staging (censo del informe, contado con comando citado @ `4c8067b`): **72 tablas · 157 policies RLS · 76 funciones `SECURITY DEFINER` · 14 migraciones · 9.349 líneas SQL**. ⚠ Dos diferencias señaladas para verificar: las tablas **bajan** (77→72, atípico) y el conteo de funciones cambia de marco (totales vs. `SECURITY DEFINER`); falta confirmar si el censo de staging refleja la DB de producción o una branch.
- **ADR-023 (tabla de migraciones) — conteo actualizado, filas pendientes.** El informe cuenta **14 migraciones** en staging; los canónicos tenían 8, y Code sumaba la 9.ª (`…140000_revoke_service_role_funciones_sensibles`, PR #4). La 9.ª de Code se agrega a la tabla. ⚠ Entre la 9.ª y la 14.ª hay **~5 migraciones sin handoff**: se sube el conteo pero **no se enumeran esas filas** hasta tener sus nombres (no se inventan).
- **ADR-024 (endurecimiento) — patrón completo + dos cierres.** (a) El patrón canónico pasa a `REVOKE … FROM PUBLIC, anon, service_role` (antes solo `anon`); revocar `service_role` es **fidelidad de build** (paridad de ACL con prod), **no** seguridad (`service_role` es llave de backend que ignora RLS por diseño). (b) Hallazgo de Code: el fix sistémico (`ALTER DEFAULT PRIVILEGES … REVOKE … FROM anon, service_role`) **no se puede por migración** —`postgres` no es superusuario ni miembro de `supabase_admin` (*permission denied*)—; el deny-by-default real va por dashboard/soporte de Supabase. (c) El objetivo de quitar `'unsafe-inline'` del CSP **ya se cumplió en staging** para `script-src` (queda `style-src`, deuda "proyecto S"). Detalle en el hub OWASP A02/A05.
- **ADR-026 (nuevo) — Arquitectura de frontend modular: delegación, ganchos y época.** La reescritura modular (en staging) resuelve toda intercomunicación por tres canales —imports ESM, **ganchos** (inversión de control) y **delegación de eventos** (`data-accion`, que reemplaza los `onclick` inline y **habilita el CSP sin `unsafe-inline`**)—, con estado de dueños (setters como única escritura) y aislamiento multi-org por **época** (`_ORG_EPOCA`).
- **`npm run gate` — compuertas de integridad de build.** Nace `npm run gate` versionado (cero `on*=`, cero identificadores libres). Cruza OWASP A03/A08. Pendiente: atarlo a pre-push/CI real y sumar checkers de biyección y de despacho de 2.º nivel (ver ADR-023/ADR-024).
- **Seguridad — dos huecos nuevos de control de acceso (A01), detalle en el hub OWASP.** (i) El **borrado blando** de proyectos (`UPDATE deleted_at` directo por PostgREST) **elude el permiso `eliminar_proyecto`**: las RPC endurecidas existen y el frontend no las llama. (ii) "El externo no lee `contacts`" es **convención, no invariante**: ninguna policy mira `memberships.tipo`. Ambos son bloqueantes de A01 (beta). Se registran aquí por referencia.
- **⚠ ADR-F (abierto) — Departamentos de servicios por productora.** Las filas de servicios guardan el departamento **por nombre**; `guardar_proyecto` lo mapea a `department_id` y da NULL si no está en `departments` → los departamentos personalizados se pierden al recargar. Fix de fondo **acordado con el BD Expert** (mandar `department_id`, crear el departamento explícito, ajustar la RPC). **La decisión de diseño —departamentos por-productora— la arbitra Agustín; queda abierta.**
- **⚠ CLAUDE.md** (fuera de estos cinco canónicos): el informe confirma que está desactualizado ("~88% pendiente") y fuera de su ubicación declarada. **No se toca aquí**; pendiente derivarlo a Code o autorizarlo explícitamente.

## Changelog — v1.10 → v1.11

Consolida el **handoff de Code (21-jun) — endurecimiento de grants `anon` + rebuild de staging**. Cambio resuelto y desplegado a producción (PR #3; no-op de grants en prod).
- **ADR-023 (actualizado) — 8.ª migración.** Se agrega `20260621120000_revoke_anon_funciones_sensibles` a la tabla de migraciones (ahora **8**, eran 7). Cierra un **hueco de "BD en código"**: el dump base no capturaba los REVOKE de `anon`, así que un reset limpio de staging dejaba **42** funciones anon-ejecutables vs. **23** en producción. Se registra el aprendizaje de flujo: "reset reconstruye fiel" asume CLI **y** que las migraciones capturen los grants.
- **ADR-024 (actualizado) — endurecimiento de `anon` completo.** `…144834` cubrió 7 RPC de escritura; `…120000` cubre las **19 funciones sensibles restantes** → **26 en total**. Se documenta el **patrón canónico** (`REVOKE … FROM PUBLIC, anon`) y la **causa** (Supabase otorga `EXECUTE` a `anon` por *default privileges*, con grant **explícito**; por eso `FROM PUBLIC` solo no basta). Se registra una recomendación sistémica de horizonte (`ALTER DEFAULT PRIVILEGES … REVOKE … FROM anon`).
- **ADR-005 (actualizado):** cifras vivas → **8 migraciones**.
- *Detalle de seguridad (el patrón y la causa) también en el hub OWASP A02; aquí queda el porqué técnico.*

## Changelog — v1.9 → v1.10

Consolida el **handoff de Code (20-jun)**. Corrección menor + alineación con el código vivo.
- **ADR-018 (corregido) — el fix del IVA ya está hecho.** Lo que figuraba como "fix puntual pendiente para el dev" (reemplazar `const IVA = 0.19` por la lectura de `tax_rates`) **ya se ejecutó** (V11.14.0; la tasa se lee de `tax_rates`, y con la modularización vive en `frontend/src/lib/rates.js`). Verificado contra el build vivo: ya **no** queda `const IVA = 0.19` en el monolito (queda solo un `0.19` como *default de respaldo* en `rates.js`, que `dalBootTaxRates` sobrescribe desde la tabla — eso cumple la doctrina). Se ajusta *Consecuencias* de ADR-018 a "resuelto" y se reconcilia con CLAUDE.md v0.2 §8.
- *(La estructura `supabase/queries/` —hermana de `supabase/migrations/`— se documenta en Arquitectura §3.4; no requiere cambios en este ADR, ya que ADR-023 habla de migraciones sin detallar el árbol de carpetas.)*

## Changelog — v1.8 → v1.9

Consolida la **bitácora de modularización del frontend** (CTO de entonces + Code — registro histórico), verificada contra el código vivo en la rama de staging. No cambia ninguna decisión previa; es un agregado técnico. Alineado a **PRD V3.6**, **Roadmap Operativo v1.8** y **Arquitectura y Flujo de Trabajo v1.5** (donde vive el detalle de la modularización).
- **ADR-015 (actualizado) — despliegue del frontend con Vite.** La build pasa a `vite build` → carpeta `dist/`, con **`base: './'`** (rutas relativas: la misma build sirve en producción y staging, arreglo de fondo del 404) y **credenciales por entorno vía `import.meta.env`** (`VITE_SUPABASE_URL`/`VITE_SUPABASE_KEY`), no por edición manual. **Esto vive en staging; el corte de producción a la build de Vite está pendiente** (junto con el diagnóstico del "404 real"), registrado en `PENDIENTES_Migracion_Vite.md`. Producción aún corre el monolito servido directo.
- **Modularización — estado y patrones (detalle en Arquitectura §7).** Etapa 0 hecha (Vite + deploy + CSS a `src/styles.css`), Etapa 1 hecha y verificada en staging (el **cimiento**: 12 funciones a `src/lib/` + el "puente" `main.js`), Etapa 2 pendiente (el ~88% del trabajo: módulos de negocio + pegamento de UI). Patrón técnico clave: **puente a `window`** para no romper los `onclick` inline, estado compartido por referencia, y escritura de globales desde módulos vía `window.X` (modo estricto). El **objetivo final de seguridad** es quitar `'unsafe-inline'` del CSP al terminar la Etapa 2 (cruza con el hub OWASP A05).
- **Nota de magnitud (anti-sobreventa):** lo modularizado es **<1% de las funciones** (el cimiento), no "casi toda la app". El grueso es la Etapa 2.

## Changelog — v1.7 → v1.8

Consolida el cierre del **flujo "BD en código"** (handoff de Flujo de Trabajo y Metodología, ratificando a Code), los **deltas de frontend** del handoff de Dev (verificados contra el build vivo **V11.16.0**) y el cierre del backlog de endurecimiento. Alineado a **PRD V3.6**, **Roadmap Operativo v1.7** y **Arquitectura y Flujo de Trabajo v1.4**.
- **ADR-023 (reescrito) — flujo BD en código cerrado.** Secuencia canónica única en **Orden A** (repo primero, prod después), con la integración de **Branching de Supabase** que aplica la migración a producción **al mergear a `main`** (merge = deploy; sin `db push` manual). Se descarta el Orden B (prod-first). Tabla de migraciones actualizada a **7** (entran `…144834_endurecimiento_anon_y_search_path` y `…160000_fix_cupo_colaboradores_por_proyecto`). Reglas nuevas: R1 (merge = deploy), R2 (excepción solo/rápido acotada por radio de impacto y reversibilidad), R3 (no se canoniza "saltar staging").
- **ADR-024 (actualizado) — backlog de endurecimiento cerrado salvo `frame-ancestors`.** La migración `…144834` ejecutó: REVOKE de `anon` en las RPC de escritura (flujos de invitación quedaron anon-ejecutables), `search_path` en ~11 utilitarias y la policy de `app_config`. Pendiente: solo el header `frame-ancestors` (hosting).
- **ADR-004 (actualizado) — cupo de colaboradores por proyecto.** `invitar_a_organizacion` ya **no mide cupo**; el límite se aplica **por proyecto** en `guardar_cargos`; `rpc_assert_cupo_colaborador` quedó **deprecada**. Regla de producto: **cargos = colaboradores**, internos no consumen cupo (PRD §22). El *auth gate* del cliente quedó fail-closed (ver punteros al hub OWASP).
- **ADR-015 (actualizado) — despliegue automatizado.** Producción de BD se aplica por **Branching al mergear**; el frontend pasa a **deploy automático por GitHub Action** (Etapa 0 de la modularización), reemplazando el deploy manual frágil. El `index.html` canónico vive en la **raíz** del repo (no en `frontend/`).
- **ADR-002 (validación):** se agregó **validación de RUT** (V11.15.0); queda pendiente la **normalización de teléfono** (`+56`) en `_perfilGuardar`.
- **ADR-005 (actualizado):** cifras vivas — **7 migraciones** registradas; `rpc_assert_cupo_colaborador` deprecada por el cambio de cupo.
- **Nota de disciplina:** el detalle de seguridad (auth gate, fail-closed, fail-open deliberado de los guardas de escritura) vive en el **hub OWASP** con punteros, no duplicado en este ADR.

## Changelog — v1.6 → v1.7

Consolida el cierre de **Prioridad #1 y #2** (handoffs de BD Expert y Code): la base quedó "en código", el entorno de prueba levantado y la seguridad basal del beta cerrada. Alineado a **PRD V3.5**, **Roadmap Operativo v1.6** y **Arquitectura y Flujo de Trabajo v1.3**.
- **ADR-023 (nuevo) — Base de datos en código.** 5 migraciones versionadas; flujo permanente migración → reset → merge → push; **nunca** cambio directo a producción por el conector MCP.
- **ADR-024 (nuevo) — Endurecimiento de permisos de ejecución.** Las funciones internas nacen con `REVOKE` (20 revocadas); backlog de advisors (anon EXECUTE en RPC de escritura, `search_path` en ~11 utilitarias, policy de `app_config`) a cerrar antes del beta externo.
- **ADR-025 (nuevo) — Inmutabilidad financiera al cierre y reporte de cierre.** `frozen` no es inmutable (deuda → futura RPC `cerrar_proyecto`); el `reporte_cierre` debe recalcular desde las líneas y leer el IVA de `tax_rates`, nunca confiar en `frozen` ni en los snapshots.
- **ADR-022 (reescrito) — Provisión autocontenida.** Las funciones de provisión leen de **5 catálogos globales `default_*`** (144 filas semilla), no de Primate como plantilla; `p_template_org` quedó opcional e ignorado. Un entorno limpio puede crear su primera productora sin depender de Primate.
- **ADR-015 (actualizado):** staging = **branch de Supabase** (efímera, paga por horas), no un proyecto aparte.
- **ADR-005 (actualizado):** cifras vivas del esquema (77 tablas / 77 con RLS / 147 políticas / 71 funciones / 31 triggers / 6 extensiones), distinguidas del modelo de dominio conceptual (≈24 tablas).
- **ADR-004 (actualizado):** enforcement de planes cableado (helper `auth_plan_permite` + guardas en `guardar_proyecto`, `invitar_a_organizacion`, `guardar_pagos_cliente`; `reporte_cierre`/`notificaciones` pendientes).

## Changelog — v1.5 → v1.6

Consolida la tanda de notas de producto V3.4 (PDF "Notas Software" + notas de horizonte). La mayor parte es producto/horizonte y vive en el **PRD §24**; aquí se registran solo los toques técnicos.
- **ADR-002 (validación):** se concreta el principio con un caso real — la **cuenta bancaria debe validarse en el servidor** (formato/estándar), tras detectarse en una prueba que aceptaba números al azar.
- **ADR-014 (storage):** **estrategia de dos niveles para entregables** de post-producción — las entregas en proceso viven **fuera** (enlaces externos: Drive, WeTransfer, etc.) para no llenar el storage; solo el **entregable final aprobado** se guarda nativo en Supabase. Se anota el desafío de **previsualizar sin descargar** sin alojar el binario.
- **ADR-021 (plantillas):** el aislamiento por organización se extiende a **todas las plantillas de generadores/previsualizadores** (cotización, documentos, etc.), no solo a las de notificación: una plantilla de la productora A no debe aparecerle a la B, y algunas son **privadas** de una productora (p. ej. la plantilla "Manifiesto" de Primate, que deja de ser pública).

## Changelog — v1.4 → v1.5

Consolida los handoffs de **BD Expert** (sesiones V10.7.0–V10.8.0) y **Legal**, más decisiones de Marketing que tocan lo técnico. Alineado a **PRD V3.3** y **Roadmap Operativo v1.4**.
- **ADR-019 (nuevo) — Identidad global del usuario.** Los datos personales viven en `user_profiles` / `user_bank_accounts` (globales, ligados a `auth.uid()`, RLS fila-propia), **no** en `contacts` (per-organización). Al aceptar una invitación se copia un *snapshot* a `contacts`; desde ahí cada productora lo administra aparte.
- **ADR-020 (nuevo) — Registro de consentimiento inmutable.** Tabla `data_consents`, append-only, escrita solo por el RPC `consentir_invitacion`, con copia exacta del texto aceptado. Evidencia datada para la Ley 21.719.
- **ADR-021 (nuevo) — Modelo de datos de Notificaciones.** `notification_templates` (editables por productora, con subversiones), `notification_sends` (envíos inmediatos y programados) y `notification_send_recipients` (HTML resuelto por destinatario). RLS gateada por el módulo `gastos_legal_notificaciones`.
- **ADR-022 (nuevo) — Aprovisionamiento de organización.** `seed_permisos_organizacion` (idempotente; copia 8 perfiles + 104 permisos) y `provisionar_organizacion` (**completo**). Quedan registradas dos decisiones de producto, resueltas en la construcción.
- **ADR-003 (auth):** el **email es el único criterio de identity linking** (no RUT ni teléfono). El puente de `currentUser()` a la sesión real quedó cerrado con el Gate A.
- **ADR-004 (autorización):** se documenta la **máquina de estados de membresía** (`pendiente` → `activo` → `inactivo`; el estado `'invitado'` fue evaluado y descartado).
- **ADR-005 (esquema):** hallazgos del build (columnas `organizations.slug`/`plan`, CHECK de `organizations.nombre`, `memberships.id` es `bigint`) y crecimiento del esquema con las tablas de identidad, consentimiento y notificaciones.
- **ADR-012 (cumplimiento):** **corrección legal** — la notificación de brechas de la Ley 21.719 es **"sin dilaciones indebidas"**, no "72 horas" (las 72 h son del RGPD y de la Ley 21.663/ANCI). El `audit_log` pasó a **inmutable desde el cliente** (trigger SECURITY DEFINER; se eliminaron las policies abiertas). Se registran los dos instrumentos legales en borrador (no aptos para producción) y los cinco flujos de derechos del titular pendientes.
- **ADR-014 (storage):** políticas `takeos_storage_*` sobre 9 buckets, **invariante de path `{organization_id}/`** (fail-closed), límite de 50 MB, MIME restringido y helpers nuevos.

## Changelog — v1.3 → v1.4

Consolida el **cierre del Gate A** (handoff del Experto en BD, 8 junio 2026) y la nueva práctica de fuente única de verdad tributaria:
- **ADR-010 → IMPLEMENTADA.** Supabase Pro activo con backups diarios (retención 7 días) y **restore validado**; PITR no contratado (sobredimensionado para un solo tenant); **JSON-en-código eliminado y SDK de Firebase retirado en la V10** (Firebase inerte, `deny-all`); archivo frío = export de Supabase. Deuda conocida: backup de objetos de Storage, pendiente.
- **ADR-018 (nuevo) — Lógica tributaria en base de datos, nunca en el cliente.** Toda tasa tributaria vive en `tax_rates`; el cliente la lee, no la hardcodea. *(El handoff lo propuso como "ADR-016", número ya ocupado por "el prototipo es spec ejecutable"; el Redactor lo reasigna al siguiente número libre, ADR-018.)*
- **Header:** alineado a **PRD V3.2** y **Roadmap Operativo v1.3**.

## Changelog — v1.2 → v1.3

Alineación con **PRD V3.1** (§07 Roles y Permisos reescrita) y **Roadmap Operativo v1.0** (nuevo documento canónico):
- **ADR-004 reescrito:** el modelo de autorización se describe ahora con el detalle concreto del Handoff de Permisos: dos dimensiones ortogonales (tipo de membresía × perfil), permisos via membresía y no via rol por proyecto, 8 perfiles fijos sembrados en MVP, 4 tablas del modelo de permisos, HORIZONTE de `permission_grants`. Se elimina la confusión entre "rol" (etiqueta descriptiva RECI) y "perfil" (control de acceso).
- **ADR-005 ampliado:** se agregan las 4 tablas de permisos al esquema de 24.
- **Header y glosario:** Roadmap Operativo v1.0 incorporado como tercer documento canónico; términos nuevos en glosario.

## Changelog — v1.1 → v1.2

Cierre de las decisiones que quedaban abiertas de la revisión anterior:
- **Auth resuelta (ADR-003):** Agustín confirmó que **Google OAuth es el destino**. El email+contraseña actual queda como provisional; se agregará Google como proveedor en Supabase Auth. Deja de ser discrepancia.
- **Backups confirmados (ADR-010):** se mantiene el JSON-en-código como *failsafe de transición* durante la migración híbrida; al independizarse del JSON, se elimina (reduce exposición y respeta fuente única de verdad) y se activa Supabase Pro para backups reales.
- Contacto unificado (contradicción #4): anotado para el **PRD v3.1**.

## Changelog — v1.0 → v1.1

Esta versión sincera el ADR contra dos realidades que no existían en la v1.0: el **PRD V3** (que ya incorporó las notas de backend) y el **handoff de la V9**, que muestra lo que el chat dev **ya construyó** sobre Supabase. Cambios mayores:

- **Plataforma decidida: Supabase / PostgreSQL** (antes "Postgres administrado" genérico). Nuevo **ADR-017**.
- **Distinción MVP ↔ SaaS** marcada en cada decisión (campo **Etapa**), porque varias cosas se diseñan distinto según la etapa.
- **Estado real de la V9** documentado (qué está construido, qué falta).
- **Contradicciones detectadas** en esta revisión, listadas abajo.
- **ADR-001** ajustado al modelo híbrido de Supabase (ya no "el cliente nunca toca la base", sino "el cliente nunca hace operaciones críticas directo").
- **ADR-003** marca la discrepancia auth: la V9 implementó email+contraseña; el destino sigue siendo Google OAuth.
- **ADR-004, 005, 010, 013, 015** refinados contra lo que el dev construyó.

---

## Qué es este documento

Un **ADR** registra *decisiones* de arquitectura y su **porqué**: contexto, alternativas descartadas y consecuencias. Complementa al PRD (narrativo y de dominio) enfocándose en el backend.

**Cómo leerlo:** cada decisión tiene dos etiquetas.
- **Estado** — *Aceptada* (decidida y vigente) o *Abierta* (aún no cerrada; se espera opinión del dev).
- **Etapa** — cuándo aplica y cómo cambia entre MVP y SaaS (ver sección siguiente).

---

## MVP vs SaaS — cómo leer la etapa de cada decisión

Agustín pidió que esta distinción quede explícita, y es la lente correcta. **No todo se construye igual hoy que mañana.** Hay tres patrones, y cada ADR está etiquetado con el que le toca:

1. **Diseñar para SaaS desde ahora, construir simple hoy.** Decisiones del **modelo de datos** que cuesta casi nada incluir hoy y muchísimo agregar después. Ejemplo real ya hecho por la V9: **`organization_id` en toda tabla de negocio** aunque hoy solo exista una productora (Primate). El dato está; la maquinaria multi-tenant se enciende después. *(Principio: capturar datos/estructura temprano, construir funcionalidades tarde.)*

2. **Construir simple para MVP, endurecer para SaaS.** Cosas que en MVP pueden ser permisivas porque el usuario es el equipo interno conocido, y que se endurecen cuando entran terceros. Ejemplo real: las políticas RLS hoy son `mvp_` (permiten todo a cualquier usuario autenticado); en SaaS pasan a filtrar por `organization_id` y por rol.

3. **MVP-relevante ya, sin importar el SaaS.** Cosas que importan desde el primer usuario real, no solo cuando se venda: validación en backend, atomicidad, backups, concurrencia, cifrado. Aquí no hay "versión liviana".

> **Regla de oro de esta lente:** *barato de diseñar ahora + caro de cambiar después* → hazlo ahora aunque sea para el SaaS. *Caro de construir ahora + solo necesario con terceros* → difiérelo, pero deja la puerta en el modelo de datos.

---

## Contradicciones detectadas en esta revisión (para resolver con Agustín)

| # | Contradicción | Estado / resolución |
|---|---|---|
| 1 | **Auth: Google OAuth (PRD §19, ADR-003) vs. email+contraseña (lo que construyó la V9).** | **RESUELTA.** Agustín confirmó Google OAuth como destino. Email+contraseña queda provisional; se agrega Google como proveedor en Supabase Auth. Ver ADR-003. |
| 2 | **"El cliente nunca toca la base directo" (ADR-001 v1.0) vs. modelo Supabase (cliente ↔ base vía RLS).** | **RESUELTA** por arbitraje 1 del PRD (híbrido: RLS para acceso simple, lógica crítica server-side). ADR-001 ajustado. |
| 3 | **Backups exigidos (PRD §15, ADR-010) vs. plan Free de Supabase sin backups.** | **PLAN CONFIRMADO.** JSON como failsafe de transición → al matar el JSON, pasar a Supabase Pro (~US$25/mes) para backups reales. Ver ADR-010. |
| 4 | **PRD §06 marca la unificación de contactos como "pendiente" vs. la V9 ya la construyó (tabla `contacts` unificada).** | **RESUELTA por el build.** Actualizar en **PRD v3.1**. Ver ADR-005. |

---

## Estado actual del proyecto (V9 · referencia para el dev)

Lo que **ya está construido** sobre Supabase (no rehacer; construir encima):
- Proyecto Supabase operativo (plan **Free** — ver ADR-010), PostgreSQL.
- **9 de 24 tablas** construidas y pobladas con datos reales limpios (Tanda 1: personas y empresas).
- Frontend conectado a Supabase; **login real** (email+contraseña) reemplazó la clave compartida.
- Migración **híbrida y módulo por módulo**: Firebase sirve lo no migrado, Supabase lo migrado, hasta apagar Firebase.

Lo que **falta** (resumen): 15 tablas (proyectos+presupuesto, finanzas, operaciones, legal); conectar la identidad real de sesión a `currentUser()`; RLS reales (org + rol); GRANTs por tabla nueva; mover generación de IDs a server-side; estrategia de entorno de pruebas en Supabase; backups.

---

# Parte 1 — Decisiones aceptadas

## ADR-001 — Arquitectura híbrida: cliente, RLS y lógica crítica en el servidor
**Estado:** Aceptada · **Etapa:** Ambas (la frontera se endurece en SaaS)

**Contexto.** El prototipo corría todo en el navegador hablándole directo a Firestore, sin capa que validara. Con Supabase, el modelo por defecto deja que el frontend lea/escriba la base vía la librería cliente, con RLS (Row Level Security) y GRANT como guardianes. La decisión de arbitraje 1 del PRD adoptó Supabase **pero** con la lógica crítica del lado servidor.

**Decisión.** Modelo **híbrido**, no de tres capas puras:
- El cliente **puede** leer y hacer escrituras simples directo contra Supabase, guardadas por **GRANT** (¿este rol toca la tabla?) + **RLS** (¿qué filas?).
- La **lógica crítica** —cálculo financiero, autorización sensible, generación de IDs, operaciones multi-paso— corre **server-side** (Edge Functions / backend), **nunca confiando en el cliente**. No se delega lógica financiera ni de seguridad a RLS sola.

**Alternativas descartadas.** Tres capas puras (cliente → backend → base, sin acceso directo): más seguro en teoría, pero tira a la basura la velocidad de desarrollo que da Supabase y no la necesita el MVP. Cliente ↔ base con RLS sola para todo (modelo "Supabase puro"): rechazado por arbitraje 1 — deja lógica financiera y de autorización en un lugar frágil.

**Consecuencias.** Hay que decidir, módulo por módulo, qué va directo (con RLS) y qué pasa por server-side. **Regla práctica:** si la operación mueve plata, decide permisos sensibles, o debe ser atómica → server-side. Si es una lectura o un CRUD simple sobre datos del propio tenant → directo con RLS.

---

## ADR-002 — La lógica de negocio y la validación viven en el servidor
**Estado:** Aceptada · **Etapa:** MVP-relevante ya (sin versión liviana)

**Contexto.** Hoy las reglas (cálculo tributario, validaciones) viven en el navegador: una sugerencia, no una protección.

**Decisión.** Principio rector: **nunca confiar en el cliente.** Las reglas críticas se aplican server-side (Edge Functions), tratando todo dato entrante como potencialmente falso.
- **Valores derivados** (ej. retención 15,25%): el backend los **recalcula** desde los insumos; el cliente no debería ni enviarlos.
- **Entradas inválidas**: el backend **rechaza** y devuelve error; no adivina ni "arregla".
- La validación en el frontend se mantiene **solo para UX**.
- **Generación de IDs:** hoy es client-side (`ctk_`, `emp_`) — deuda técnica reconocida en el handoff; debe **moverse a server-side** para no confiar en el navegador la unicidad.

**Consecuencias.** Reglas duplicadas (cliente=UX, servidor=autoridad). Las reglas de negocio deben especificarse **exhaustivas** (lo no listado como permitido se asume prohibido).

> **Caso concreto (V3.4) — cuentas bancarias.** En una prueba, un usuario guardó números al azar como cuenta bancaria y el sistema lo aceptó. Las cuentas bancarias (`user_bank_accounts` y `contact_bank_accounts`) deben **validarse en el servidor** con estándares de formato (largo y estructura según tipo de cuenta), no solo en el frontend. Es una instancia del ítem transversal "validación de contenido a nivel de campo".
>
> **Progreso (v1.8).** Se agregó **validación de RUT** (V11.15.0). Queda pendiente la **normalización de teléfono** en `_perfilGuardar`: hoy guarda en crudo, falta aplicar el formateador `+56`. Menor y despriorizado, pero registrado (ver Roadmap, pendientes).

---

## ADR-003 — Autenticación
**Estado:** Aceptada · **Etapa:** MVP

**Contexto.** El prototipo no tenía auth (clave compartida cosmética). El PRD §19 fija **Google (OAuth)** como estándar del rubro. La **V9 implementó email + contraseña** (Supabase Auth) como primer paso.

**Decisión (resuelta).** Autenticación vía **Supabase Auth**, con **Google OAuth como destino confirmado** (Agustín, junio 2026). El email+contraseña actual es **provisional**: se agrega **Google como proveedor** en Supabase Auth (soporta ambos a la vez; es configuración, no rearquitectura). El backend mapea la identidad a un usuario de Rizora con su rol y membresías. El **token viaja y se verifica en cada request** (stateless). Google dice *quién eres*, no *qué puedes* (eso es ADR-004).

**Vinculación de identidad (identity linking).** El **email es el único criterio** para enlazar una identidad de Supabase con un usuario de Rizora —no se usa RUT ni teléfono—. Es confiable para el contexto de Rizora y evita ambigüedades de *matching*.

**Actualización v1.5.** El **puente de `currentUser()` a la sesión real quedó cerrado** junto con el Gate A (Firebase eliminado del cliente desde la V10.0.0): ya no hay selector de "sesión simulada". El trabajo de cliente que queda **no es de autenticación sino de organización activa**: derivar la organización en uso desde la membresía activa del usuario (motor de org activa — ver ADR-013).

**Consecuencias.** Migrar de email+contraseña a Google no rompe nada construido. Con la sesión real conectada, el sistema de tareas/@menciones/responsables ya sabe quién es el usuario.

---

## ADR-004 — Autorización: por perfil y por estado, en el servidor
**Estado:** Aceptada · **Etapa:** MVP (modelo base, Fase B) / SaaS (endurecer y escalar)

**Contexto.** El PRD §07 define el modelo de acceso de Rizora. Este ADR recoge las implicaciones técnicas de ese modelo. El Handoff de Permisos (aprobado, junio 2026) y el PRD V3.1 §07 son la referencia de producto; este ADR es la referencia técnica.

**Decisión.** La autorización combina **dos dimensiones ortogonales**:

1. **Tipo de membresía** (`interno` / `externo`): determina *qué proyectos* ve el usuario. Interno → todos los proyectos de la productora. Externo → solo los asignados en `project_members`.
2. **Perfil** (1–7 + Finanzas, asignado via `memberships`): determina *qué módulos puede tocar* dentro de lo que ve. Los 8 perfiles son **fijos y sembrados** en el MVP; el administrador no los edita, solo asigna usuarios a ellos.

**Decisión estructural central (del PRD §07):** los permisos cuelgan del usuario **vía su membresía en la productora**, **no del rol que cumple en cada proyecto**. El campo `project_members.rol` (PE, JP, DoP…) es una **etiqueta descriptiva** para RECI y responsabilidades, desacoplada del control de acceso.

Adicionalmente, el **estado del recurso** puede condicionar el acceso (ABAC): ej. un proyecto Cerrado bloquea modificaciones independientemente del perfil. Esta dimensión de estado coexiste con el modelo de perfiles.

La autorización se aplica **server-side y vía RLS, en cada request**. El frontend **solo refleja**, nunca protege.

**Las 4 tablas del modelo de permisos** (detalle en ADR-005):
- `memberships` — usuario × productora × tipo (`interno`/`externo`) × perfil × estado.
- `permission_profiles` — los 8 perfiles (sembrados; read-only en MVP; editables en **[HORIZONTE]**).
- `profile_permissions` — la matriz módulo × nivel (E/L/—); sembrada en MVP.
- `project_members` — rol descriptivo por proyecto (no de acceso); para externos, define alcance.
- `permission_grants` — overrides puntuales tipo Google Drive **[HORIZONTE]**; no MVP; el esquema le deja lugar.

**Máquina de estados de la membresía (`memberships.estado`).** El CHECK admite `'activo'`, `'inactivo'`, `'pendiente'`:
- `'pendiente'` → la persona fue invitada pero **aún no consiente**. No concede ningún acceso (todos los helpers de autorización filtran por `estado='activo'`).
- `'activo'` → consentimiento registrado (ver ADR-020); acceso habilitado.
- `'inactivo'` → membresía suspendida o revocada.
- Se evaluó un estado `'invitado'` y se **descartó**: se reutiliza `'pendiente'`, que ya existía.

**MVP vs SaaS (secuencia concreta):**
- **Hoy (mvp_):** políticas permisivas (todo a cualquier autenticado). Un solo tenant. Aceptable porque el usuario es el equipo interno de Primate.
- **Fase B:** reemplazar `mvp_` con RLS que implemente las dos dimensiones. Es el trabajo central del Handoff de Permisos. El Roadmap §2 Gate B lo formaliza como gate de cierre.
- **SaaS (Fase C+):** añadir multi-org memberships, `permission_grants`, y permisos sub-módulo (cierra la limitación de datos bancarios — ver Roadmap Gate C + PRD §07 limitación conocida).

**Gotcha operativo:** cada tabla nueva necesita su GRANT manual al rol `authenticated`; olvidarlo produce un 403 aunque el login funcione (gotcha del Handoff de V9).

**Alternativas descartadas.** Solo en frontend (no es seguridad). Permisos por rol por proyecto (ambiguo cuando una persona tiene varios roles o ninguno). RLS sola para toda la lógica (rechazado por ADR-001/002: lógica sensible va server-side).

**Consecuencias.** Ver PRD §07 para la matriz completa de módulo × perfil. La limitación "BD todo-o-nada" expone datos bancarios a perfiles que no los necesitan — aceptado para MVP de un tenant, debe cerrarse antes del multi-tenant.

**Actualización v1.7 — enforcement de planes cableado.** Además del control de acceso por perfil, el sistema ahora aplica el **plan** de la organización (`organizations.plan`). Existe el helper **`auth_plan_permite`** y guardas en las RPC de escritura: hoy el plan se exige en `guardar_proyecto`, `invitar_a_organizacion` y `guardar_pagos_cliente`. **Pendiente:** cablearlo en `reporte_cierre` y `notificaciones` cuando esas funciones existan. El mapeo "qué capacidad entra en qué plan" es decisión de Marketing + producto (PRD §22).

**Actualización v1.8 — cupo de colaboradores por proyecto + auth gate del cliente.**
- **Cupo por proyecto.** El cupo de colaboradores que da cada plan (ej. 12 en Producción) se mide **por proyecto**, en `guardar_cargos`. `invitar_a_organizacion` **dejó de medir cupo** de colaboradores y `rpc_assert_cupo_colaborador` quedó **deprecada** (migración `…160000`). Regla de producto canonizada en PRD §22: **cargos = colaboradores**, y los **internos no consumen cupo** (una organización con internos y un proyecto con cero cargos tiene todo el cupo del plan libre para repartir en ese proyecto). El enforcement de plan en `invitar_a_organizacion` que queda es el de **membresía/asiento**, no el de cupo de cargos.
- **Auth gate del cliente (fail-closed).** El portero de autorización del frontend valida la identidad con `getUser()` y `authNivelModulo` **falla cerrado** (devuelve `'none'` para módulos no mapeados) — cerrados V11.15.0. **Excepción deliberada:** los guardas de **escritura** del cliente siguen **fail-open a propósito**, porque la seguridad real de escritura es el RPC `SECURITY DEFINER` (Gate C); no es un hueco. *(Detalle de seguridad en el hub OWASP, A01/A07/A10 — no se duplica aquí.)*

---

## ADR-005 — Modelo de datos relacional en PostgreSQL (esquema de 24 tablas)
**Estado:** Aceptada · **Etapa:** Diseñar para SaaS desde ahora

**Contexto.** El prototipo guardaba todo como un JSON gigante en un documento. El esquema relacional (24 tablas, 9 ya construidas) lo reemplaza.

**Decisión.** Datos como **entidades con relaciones**, **por referencia, no por copia** (fuente única de verdad). Decisiones de diseño confirmadas por el build:
- **Contacto unificado:** una tabla `contacts` + `contact_roles` + `contact_companies` + `contact_bank_accounts` + `contact_talent_profiles`. Una persona puede ser crew, talento y cliente vía roles/perfiles. **Esto resuelve la "decisión pendiente" del PRD §06** — el build eligió la unificación, que el propio PRD reconocía como superior.
- **`budget_line_items`** unifica servicios/gastos/equipos/talentos con una columna `section`.
- **Auditoría y soft delete** (`created_at`/`updated_at`/`deleted_at`, `created_by`/`updated_by`) en toda tabla.
- **`organization_id` (NOT NULL) en toda tabla de negocio** — listo para multi-tenant desde el día uno (ver ADR-013).
- **Tablas del modelo de permisos** (Handoff de Permisos + ADR-004): `memberships` (usuario × productora × tipo × perfil × estado), `permission_profiles` (8 perfiles, sembrados), `profile_permissions` (matriz módulo × nivel E/L/—, sembrada), `project_members` (rol descriptivo por proyecto, alcance para externos). Horizonte: `permission_grants` (overrides puntuales — el schema le deja lugar sin rediseño).
- **ENUMs como `TEXT + CHECK`**, no enums nativos (más fáciles de evolucionar).
- **IDs:** TEXT con prefijo (`ctk_`, `emp_`, `LOC-NN`), UUID para infraestructura (`organizations`). *Deuda:* generación de IDs a server-side (ver ADR-002).

**Actualización v1.5 — el esquema creció más allá de las 24 tablas.** Se incorporaron las tablas de **identidad global** (`user_profiles`, `user_bank_accounts` — ADR-019), **consentimiento** (`data_consents` — ADR-020) y **notificaciones** (`notification_templates`, `notification_sends`, `notification_send_recipients` — ADR-021).

**Actualización v1.11 — cifras vivas del esquema.** Conviene distinguir dos cosas: el **modelo de dominio conceptual** (las ≈24 tablas de negocio que estructuran este ADR) y el **conteo vivo de la base**, que incluye además las tablas de infraestructura, permisos, catálogos globales, auditoría y soporte. Verificado contra producción el 21 jun 2026: **77 tablas / 77 con RLS / 147 políticas / ~71 funciones / 31 triggers / 6 extensiones**. A junio 2026 hay **8 migraciones** registradas (ADR-023; la última, `…120000` del 21-jun: revoca `anon` en las 19 funciones sensibles que el dump no capturaba). El cambio de cupo **deprecó `rpc_assert_cupo_colaborador`** y movió el límite a `guardar_cargos` (ver ADR-004). El número grande de tablas no contradice el modelo de ≈24: son las mismas entidades de negocio más todo lo que las rodea.

**Actualización v1.12 — cifras vivas DUALES (producción ↔ staging).** Con los dos remotos divergidos 189 commits (ver encabezado), las cifras se leen **etiquetadas por rama**:

| | **Producción** (`origin/main` · monolito) | **Staging** (`staging/main` @ `4c8067b` · modular) |
|---|---|---|
| Tablas | 77 (77 con RLS) | **72** |
| Policies RLS | 147 | **157** |
| Funciones | ~71 (totales) | **76 `SECURITY DEFINER`** |
| Migraciones | **8 → 9** (con el cierre de `service_role` de Code) | **14** (9.349 líneas SQL) |
| Triggers / extensiones | 31 / 6 | — |

> **Base de cada columna.** Producción: último censo conocido contra la DB `zplcgetquwxybkrpmcvl` (16–21 jun). Staging: censo del **Informe Técnico**, contado con comando citado @ `4c8067b`. ⚠ **Dos diferencias abiertas:** (1) las tablas **bajan** (77→72), atípico en un esquema que crece —¿consolidación de tablas o diferencia de método de conteo?—; (2) el conteo de funciones cambia de marco (totales vs. `SECURITY DEFINER`), no comparable directo. Falta confirmar **si el censo de staging refleja la DB de producción o una branch de Supabase con migraciones no mergeadas** — hasta entonces no se colapsan las dos columnas en una sola cifra viva.

**Hallazgos del build a registrar:**
- `organizations` tiene `slug` (NOT NULL) y `plan` (default `'free'`), previendo la distinción de plan desde el esquema (ver PRD §22 y ADR-022).
- `organizations.nombre` tiene un CHECK (`organizations_nombre_no_vacio`) que rechaza cadenas vacías o de solo espacios.
- `memberships.id` es **`bigint`**, no `uuid` — relevante para las claves foráneas que apunten a esa tabla.

**Consecuencias.** Habilita concurrencia segura, consultas finas, integridad referencial y **agregación cross-proyecto** para el Reporte de Cierre (requisito no negociable del PRD §14). La fuente de verdad del esquema son los `.sql`, no el diagrama viejo.

---

## ADR-006 — Concurrencia: control optimista a nivel de registro
**Estado:** Aceptada · **Etapa:** MVP-relevante ya

**Contexto.** Con datos por registro, dos personas en proyectos distintos no chocan. Falta el caso del mismo registro: el riesgo es el *lost update* (un guardado pisa otro en silencio) — exactamente la herida que el modelo JSON-único de Firebase tiene tapada con curitas.

**Decisión.** **Optimistic concurrency control** con **sello de versión** por registro: al guardar, el backend compara el sello del cliente con el actual; si no coinciden, **rechaza** y pide rehacer. Granularidad **a nivel de registro**.

**Alternativas descartadas.** Bloqueo pesimista; edición colaborativa en vivo (cara, ver ADR-C); granularidad fina/merge (innecesaria hoy).

**Consecuencias.** Se aceptan **falsos conflictos** conscientemente. El peor caso es "rehaz tu cambio" (molestia), nunca pérdida de dato (desastre). **Gatillo de reevaluación:** más concurrencia en SaaS.

---

## ADR-007 — Integridad: operaciones multi-paso son transacciones (atomicidad)
**Estado:** Aceptada · **Etapa:** MVP-relevante ya

**Contexto.** El cierre de proyecto = bloquear datos + generar Reporte + cambiar estado. Si un paso falla a mitad, queda un estado roto.

**Decisión.** Operaciones multi-paso como **transacciones** (todo o nada); si algo falla, **rollback**. Corre server-side (ADR-001). **Invariante:** no existe proyecto "Cerrado" sin Reporte de Cierre. (Nota: la migración de datos de la Tanda 1 ya se cargó en una transacción única — el equipo ya practica esto.)

**Consecuencias.** El dev identifica qué operaciones requieren atomicidad (cierre, confirmaciones financieras).

---

## ADR-008 — Versionado de documentos
**Estado:** Aceptada · **Etapa:** MVP-relevante ya · *(ya reflejado en PRD §20)*

**Decisión.** Se versiona **con cada exportación acompañada de una modificación** — no por modificar a secas, no por exportar lo mismo. Excepción en cotización (manual; el sistema solo advierte). Aplica a documentos versionables (cotización, legal, hoja de llamado, plan de rodaje); gastos/tareas/filas tienen ciclo propio y sí se borran (soft delete).

**Consecuencias.** Coherente con PRD §20. Versionado ≠ backup (ver ADR-010).

---

## ADR-009 — Las migraciones de datos son un proceso de primera clase
**Estado:** Aceptada · **Etapa:** MVP-relevante ya (y crítica durante la V9)

**Contexto.** La V9 **es** una migración grande (Firebase → Supabase), módulo por módulo, en modo híbrido. Cambiar la forma de los datos sobre datos reales es peligroso.

**Decisión.** Toda migración: **probar en copia → respaldar producción → aplicar → verificar.** Diseñada **reversible** e **idempotente**. La regla de oro del handoff: **no reemplazar "bloque JSON en Firebase" por "bloque JSON en Supabase"** — cada módulo se recablea a lecturas/escrituras granulares. Editar un proyecto Cerrado solo vía **excepción auditada**.

**Consecuencias.** **Principio:** capturar datos temprano (barato), construir funcionalidades tarde (caro). No se busca un PRD tan perfecto que evite toda migración; se busca que migrar sea seguro y barato.

---

## ADR-010 — Backups y recuperación
**Estado:** Implementada (8 junio 2026) · **Etapa:** MVP-relevante ya

**Contexto.** El único "respaldo" del prototipo era localStorage + export manual: no es backup. El versionado **no** sustituye al backup. **Y el handoff revela un hueco real: el plan Free de Supabase no tiene backups automáticos y se pausa por inactividad.**

**Decisión.** Backups **automáticos, off-site, encriptados, con múltiples puntos en el tiempo y restauración probada al menos una vez** (un backup nunca restaurado es una esperanza). Sobre Supabase, esto exige el **plan Pro** (point-in-time recovery).

**Plan de transición confirmado (Agustín, junio 2026).** Durante la migración híbrida, el JSON-en-código se mantiene como **failsafe de transición** —pero es un *puente*, no una red real: vive en el cliente, no es backup—. Al independizarse por completo del JSON, este se **elimina** por dos razones: (1) **fuente única de verdad** —dos copias (JSON + Supabase) divergen—, y (2) **exposición** —el JSON carga el universo completo de la empresa en cada navegador; al matarlo, cada usuario solo carga su tajada autorizada—. En ese momento se activa **Supabase Pro** para backups reales.

> **Secuencia:** JSON como failsafe (hoy, sin red real) → migrar módulo por módulo → matar el JSON + activar Supabase Pro (backups de verdad). Mientras dure el puente, hay ventana sin red; acortarla es prioridad.

**Consecuencias.** La tolerancia exacta (RPO/RTO) es decisión de negocio abierta (ADR-D).

> **Actualización v1.4 · 8 de junio de 2026 — IMPLEMENTADA (Gate A cerrado).**
> - **Supabase Pro activo**, con backups físicos diarios y **retención de 7 días**. **Restauración validada** a un proyecto de prueba aislado (luego eliminado); datos relacionales íntegros.
> - **PITR (point-in-time recovery) no contratado:** se evaluó sobredimensionado para un solo tenant; basta el backup diario de Pro. Cuando entren terceros, reevaluar junto con RPO/RTO (ADR-D).
> - **JSON-en-código eliminado y SDK de Firebase retirado en la V10.** Firebase quedó clausurado (`deny-all`, inerte) y luego se le retiró el SDK del cliente; la doble escritura fue cortada (toggle "Supabase única fuente"). Cierra la secuencia de transición descrita arriba.
> - **Archivo frío:** el respaldo de referencia pasa a ser el export `.json` de **Supabase** (más completo que el de Firebase), guardado fuera de la app.
> - **Deuda conocida — backup de Storage:** los backups automáticos de Pro cubren la base relacional, **no** los objetos de Storage (PDFs, fotos, adjuntos); requieren estrategia separada (Edge Function/cron o herramienta externa). Pendiente.

---

## ADR-011 — Seguridad de datos sensibles
**Estado:** Aceptada · **Etapa:** MVP-relevante ya · *(reflejado en PRD §15)*

**Decisión.** Cifrado en tránsito (TLS) y en reposo (llaves gestionadas por la plataforma, ver ADR-A); mínimo privilegio; minimización; no loguear secretos (el `audit_log` no guarda datos bancarios ni credenciales en texto plano). **Manejo de llaves (handoff):** la *secret key* / *service_role* de Supabase **nunca** va al frontend ni a chats; solo la *publishable key* es pública —y es segura **solo porque hay RLS activo**—.

**Consecuencias.** "A prueba de balas" = defensa en capas + servicios administrados bien configurados + guardar lo mínimo. No invulnerabilidad absoluta.

---

## ADR-012 — Cumplimiento Ley 21.719 y observabilidad como evidencia
**Estado:** Aceptada · **Requiere validación legal** · **Etapa:** Ambas (intensifica en SaaS) · *(reflejado en PRD §16)*

**Decisión.** El **`audit_log`** y la **observabilidad** (logs, métricas, alertas) son **requisito de cumplimiento**, no lujo. La ley (vigencia 1-dic-2026) fiscaliza evidencia operativa. El sistema debe soportar los derechos del titular y la notificación de brechas.

**Corrección de precisión (v1.5) — plazo de notificación de brechas.** La versión anterior decía "72 horas". **La Ley 21.719 NO fija ese plazo:** exige notificar a la Agencia "por los medios más expeditos y **sin dilaciones indebidas**" ante riesgo razonable, y comunicar a los titulares cuando la brecha involucre datos sensibles, de menores de 14 años o de carácter económico/financiero/bancario. Las **72 horas** pertenecen a **otros marcos**: el RGPD europeo y la **Ley 21.663** (Ley Marco de Ciberseguridad), en su reporte a la **ANCI**. No conviene confundirlos. El estándar a usar en Rizora para la Ley 21.719 es **"sin dilaciones indebidas"**.

**`audit_log` — implementado e inmutable desde el cliente (v1.5).** El `audit_log` ya está construido. El trigger `audit_trigger` es **SECURITY DEFINER + SET search_path**: escribe como *owner* sin depender de una policy de INSERT. Se **eliminaron** las policies abiertas `audit_lectura` (SELECT=true) y `b_audit_log_ins` (INSERT=true); solo permanece `b_audit_log_sel` (SELECT para el administrador de la organización). Así el registro no es manipulable desde el cliente.

**Instrumentos legales y derechos del titular (estado).** Existen **dos instrumentos en borrador, NO aprobados para producción ni venta** (ver PRD §16): Términos+Privacidad de cuenta y Consentimiento de incorporación a una productora. La base ya soporta el cumplimiento técnico (consentimiento versionado con copia exacta del texto — ADR-020; auditoría inmutable; aislamiento por organización). Quedan **cinco flujos de derechos del titular por construir** (Gate C): borrado/supresión, exportación/portabilidad, revocación de consentimiento, verificación de edad (si aplica) y aviso de cookies/analytics.

**Consecuencias.** El `audit_log` —especialmente sobre datos bancarios— es evidencia legalmente exigible. Los detalles legales (DPO, evaluaciones de impacto, aprobación de textos) los cierra un abogado habilitado antes de lanzar.

---

## ADR-013 — Multi-tenant: base compartida con `organization_id`, identidad global
**Estado:** Aceptada · **Etapa:** Diseñar ahora (hecho), construir maquinaria en SaaS

**Contexto.** A futuro, varias productoras en el mismo sistema (PRD Fase 4). Un freelancer (JP, DoP, director) trabaja para varias → la UI es **por usuario, no por empresa**.

**Decisión.**
- **Identidad global** (un login), **membresía y permisos por tenant**, **Control Room personal cross-tenant**.
- **Aislamiento por `organization_id`**: base compartida, cada fila etiquetada; el backend/RLS filtra **siempre** por el tenant de quien pregunta.

**MVP vs SaaS (ejemplo perfecto de la lente):**
- **Ya hecho (diseño):** toda tabla de negocio cuelga de `organization_id` NOT NULL, con el UUID de Primate. El modelo está listo para multi-tenant.
- **Falta (maquinaria, SaaS):** RLS que efectivamente filtre por `organization_id`, el modelo de membresías multi-org, y el Control Room cross-tenant. Hoy hay un solo tenant, así que no se construye todavía —pero el dato ya está, que era lo caro de agregar después—.

**Alternativas descartadas.** Database-per-tenant (cara, pelea con el cross-tenant). Llaves de cifrado del cliente (mataría Reporte y cross-tenant, ver ADR-A).

**Consecuencias.** El aislamiento depende de que el filtrado por `organization_id` sea correcto siempre: un bug es una fuga entre productoras; testear con rigor antes del SaaS.

**Actualización v1.7 — el motor de organización activa (cliente) ya está construido.** En el frontend existe `_setOrgActiva` (desde la V10.9.0): al entrar, deriva la organización desde la **membresía activa** del usuario y reemplaza el `ORG_ID` que antes era fijo, con una bandera `_TIENE_EMPRESA` que impide mostrar el Control Room a un usuario sin empresa confirmada. **Lo que aún falta (Gate B):** el **RLS real por organización y por rol** (hoy el filtrado se apoya sobre todo en las RPC; el endurecimiento por RLS efectivo es trabajo de Gate B) y la **validación del aislamiento con varias organizaciones** (QA). El dato ya estaba etiquetado por `organization_id`; lo que se completó es la **selección de tenant en el cliente**.

---

## ADR-014 — Archivos pesados: object storage, referencia en la BD
**Estado:** Aceptada · **Etapa:** MVP (Fase 2) · *(reflejado en PRD §11, §18)*

**Decisión.** Archivos pesados (fotos de locación, entregables, contratos) van a **Supabase Storage**; en la base se guarda solo la **ruta/referencia**. Resuelve el parche de localStorage (fotos sacadas por el límite de 1 MiB de Firestore). El acceso a archivos **también requiere autorización** (URL temporal/firmada); contenido confidencial nunca queda abierto. Un **CDN** delante para servir rápido (horizonte). Principio: **base64 como puente, object storage como destino.**

**Seguridad de Storage (v1.5 — implementada).** Cuatro policies `takeos_storage_*` cubren los **9 buckets** y exigen **membresía activa** en la organización, que se deriva del **primer segmento del path**: `{organization_id}/ruta/archivo`.
- **INVARIANTE de path:** toda ruta en los 9 buckets **debe** abrir con `{organization_id}/`. Sin ese prefijo, el archivo queda inaccesible (**fail-closed**).
- `documentos-legales` exige además **nivel E/L** en el módulo `gastos_legal_notificaciones`.
- Helpers nuevos: `auth_es_miembro_org_txt(text)` y `auth_nivel_org_txt(modulo, text)` (SECURITY DEFINER; comparan como texto para evitar un cast inválido con paths malformados).
- **Límite de tamaño:** 50 MB en los 9 buckets. **MIME restringido** en los 4 buckets activos: `fotos-locaciones` → `image/jpeg`; `adjuntos-tareas` → `image/jpeg`, `application/pdf`; `documentos-legales` → `application/pdf`; `documentos-proyecto` → `application/pdf`, `image/jpeg`. Los 5 buckets futuros quedan pendientes por feature.

**Consecuencias.** La tabla `location_photos` (y similares) guarda rutas, no binarios. Distinción clave: datos consultables (BD) vs. archivos opacos (storage).

**Entregables: estrategia de dos niveles (V3.4 · horizonte — módulos de Post-producción y Entregables, PRD §24).** Durante la post-producción, las entregas en proceso (montaje, color, sonido, VFX) **no se alojan nativamente** —llenarían el storage de la productora demasiado rápido—: se referencian con **enlaces externos** (Drive, WeTransfer, Vimeo, lo que la productora prefiera) y el sistema guarda solo el link. Únicamente el **entregable final aprobado** (el publicable, validado por el cliente) se guarda **nativo** en Supabase Storage, para que la productora conserve su archivo definitivo en un solo lugar de verdad. Desafío abierto para el chat de Cloud/BD: permitir **previsualizar el contenido sin descargarlo** aunque el binario no viva en los buckets.

---

## ADR-015 — Deployment, entornos y observabilidad
**Estado:** Aceptada · entorno de prueba **resuelto** (branch de Supabase) · **Etapa:** Ambas

**Contexto.** El backend corre 24/7 en la nube (Supabase + host del frontend, región cercana). "Producción" no es un evento único: es el acto recurrente y riesgoso de publicar versiones.

**Decisión.** Deployment seguro: **entorno de staging para probar antes de publicar** y **rollback** si una versión sale mala. **Observabilidad** (logs, métricas, alertas) para enterarse de fallas antes que el cliente.

**Entorno de prueba y despliegue — actualizado (v1.8).** El staging es una **branch de Supabase** llamada `staging` (ref `jovroabtwysliryppthh`), **no un proyecto aparte**: un entorno efímero que se paga por horas activas y nace de las mismas migraciones que producción (ADR-023). El frontend se sirve desde un dominio real (GitHub Pages), no `file://`, para no romper auth/persistencia. Detalle de repos, carpetas, URLs y claves publicables en **Arquitectura y Flujo de Trabajo §5**.
- **Despliegue de BD (resuelto):** producción se actualiza por la integración de **Branching de Supabase al mergear a `main`** (merge = deploy; ver ADR-023). No hay `db push` manual a producción.
- **Despliegue de frontend (con Vite, v1.9):** en staging, el frontend se **construye con Vite** (`vite build` → `dist/`) con **`base: './'`** (rutas relativas → la misma build sirve en producción y staging sin tocar nada; arreglo de fondo del 404) y **credenciales por entorno vía `import.meta.env`** (`VITE_SUPABASE_URL`/`VITE_SUPABASE_KEY`), no por edición manual de dos líneas. **Pendiente:** el **corte de producción** a esta build (hoy producción aún corre el monolito servido directo) y el **diagnóstico del "404 real"** de ese corte, ambos en `PENDIENTES_Migracion_Vite.md`. El detalle de la estructura (`frontend/src/`, el "puente" `main.js`, el cimiento en `src/lib/`) vive en **Arquitectura §3.4 y §7**.
- *Deuda:* la observabilidad (logs/métricas/alertas) sigue pendiente (ver hub OWASP A09).

**Actualización v1.12 — los dos remotos divergieron; el "corte a producción" cambió de tamaño.** El Informe Técnico halló que los **dos remotos del repo ya no son el mismo software**: `origin/main` (`fa008d5`) sirve el **monolito** (producción real), `staging/main` (`4c8067b`) sirve la **arquitectura modular**, y entre ellos hay **189 commits de deriva**. Consecuencia: el "corte de producción" que la v1.9 anotaba como "pasar a la build de Vite" es en realidad **cortar a producción toda la reescritura modular** (delegación de eventos, CSP endurecida, purga de `window`, 25 módulos). Es un cambio de magnitud, no un ajuste de build, y hoy es el **riesgo abierto principal del proyecto** (una rama que la operación no usa y que acumula todo el trabajo nuevo). El plan de corte, su verificación y el diagnóstico del "404 real" pasan a ser un frente de primera clase (ver Arquitectura §5 y Roadmap §2).

**Consecuencias.** Misma lógica que probar migraciones en copia (ADR-009): nunca se prueba sobre producción. La branch, al nacer de las migraciones, es fiel al esquema real.

---

## ADR-016 — El prototipo es especificación ejecutable, no base de producción
**Estado:** Aceptada · **Etapa:** Transversal · *(reflejado en PRD §17 narrativo, §23)*

**Decisión.** El prototipo (HTML/JS) es **blueprint operativo ejecutable** (referencia de lógica y UX validadas), no base de código de producción. **Matiz V9:** el frontend **sí se conserva** (la migración cambia solo la capa de datos, no reescribe el front — ver ADR-017); lo que no se conserva es el modelo de persistencia (JSON único → relacional).

**Consecuencias.** El dev usa el prototipo como spec de comportamiento; recablea datos, no rehace UI.

---

## ADR-017 — Plataforma: Supabase / PostgreSQL con lógica crítica server-side *(NUEVO)*
**Estado:** Aceptada · **Etapa:** Transversal (decisión fundacional)

**Contexto.** El V2 difería la plataforma al dev. La asesoría de datos y el arbitraje 1 del PRD la cerraron. La V9 ya la montó.

**Decisión.** **Supabase** como plataforma PostgreSQL administrada, usando: PostgreSQL (base), Supabase Auth (identidad), Supabase Storage (archivos), RLS + GRANT (acceso), y **Edge Functions / lógica server-side para lo crítico** (financiero, autorización sensible, atomicidad, generación de IDs). **No** se delega la lógica crítica a RLS sola.

**Alternativas descartadas.** Firestore como base principal (el modelo actual; rechazado por límite de 1 MiB, falta de consultas/concurrencia/integridad). "Supabase puro" con RLS para todo (rechazado por arbitraje 1). Construir backend a mano desde cero (innecesario para el MVP; Supabase da auth, storage, base y API administrados, lo que cabe en el presupuesto y el equipo chico).

**Consecuencias.** Migración **híbrida, módulo por módulo**: Firebase y Supabase coexisten hasta apagar Firebase. Riesgo a vigilar: que la comodidad de Supabase tiente a dejar lógica crítica en el cliente o en RLS — el principio de ADR-001/002 lo prohíbe.

---

## ADR-018 — Lógica tributaria en base de datos, nunca en el cliente *(NUEVO)*
**Estado:** Aceptada (8 junio 2026) · **Etapa:** MVP-relevante ya · *(reflejado en PRD §19)*

**Contexto.** Se detectó `const IVA = 0.19` hardcodeado en el cliente (V9.6.15, línea ~5671). Las tasas tributarias cambian por ley, y una actualización no debería exigir un deploy del cliente. Hardcodear una tasa en el HTML viola la fuente única de verdad (ADR-005).

**Decisión.** Toda tasa o lógica tributaria (IVA, retenciones, exenciones, honorarios) vive en la tabla `tax_rates` de Supabase. El cliente la **lee al iniciar sesión** y la usa en todos los cálculos. Cambiar una tasa = **insertar una fila nueva** con su `vigente_desde`; nunca editar el cliente.

**Convención de `concepto`:** `IVA` (factura), `iva_exento` (factura exenta), `honorarios` (boleta / BHE), `retencion_bte` (boleta de terceros / BTE). `tax_rates` ya contiene IVA 19%, iva_exento 0% y la escala 2024–2028 de honorarios y retención BTE.

**Lectura de la tasa vigente** (por concepto y fecha de vigencia):

```sql
SELECT tasa FROM tax_rates
WHERE concepto = '<concepto>'
  AND vigente_desde <= CURRENT_DATE
  AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)
ORDER BY vigente_desde DESC
LIMIT 1;
```

**Consecuencias.** El cliente lee y cachea las tasas vigentes al arrancar. Cualquier hardcodeo tributario en el HTML es un **error arquitectónico de severidad alta**. **Fix del IVA: resuelto (V11.14.0).** Se reemplazó `const IVA = 0.19` por la lectura de `tax_rates`; con la modularización, esa lógica vive en `frontend/src/lib/rates.js` (`dalBootTaxRates` carga las tasas al iniciar sesión). Verificado contra el build vivo: ya no queda `const IVA = 0.19` en el monolito. Persiste un `0.19` como **default de respaldo** en `rates.js` —fallback si `tax_rates` no estuviera disponible—, que se sobrescribe con el valor de la tabla; esto **cumple** la doctrina (la fuente de verdad es `tax_rates`), no la contradice. *(Reflejado también como resuelto en CLAUDE.md v0.2 §8.)*

---

## ADR-019 — Identidad global del usuario, separada de los contactos *(NUEVO)*
**Estado:** Aceptada y ejecutada (junio 2026) · **Etapa:** MVP / SaaS · *(reflejado en PRD §07, §17)*

**Contexto.** La misma persona puede pertenecer a varias productoras a la vez. Si sus datos personales vivieran en `contacts` (que es per-organización), se duplicarían y divergirían.

**Decisión.** Los datos personales del usuario viven en una **entidad global** ligada a `auth.uid()`, **no** en `contacts`:
- `user_profiles`: nombre, apellido, RUT, email, teléfono, dirección. Normalización server-side (los mismos triggers que `contacts`). **RLS fila-propia.**
- `user_bank_accounts`: datos bancarios personales; espeja `contact_bank_accounts`. **RLS fila-propia.**

**Patrón de copia por consentimiento.** Al aceptar una invitación, se genera una **copia** (snapshot) de `user_profiles` → `contacts` de esa organización. Desde ese momento, la productora administra esa copia de forma independiente. Así los datos personales **existen una sola vez** y se comparten **solo por consentimiento explícito** (ver ADR-020).

**Consecuencias.** La cuenta y los datos personales son del usuario; cada productora tiene su propia copia administrable. Habilita el espacio multi-organización (una persona interna en una productora y externa en otra, simultáneamente).

---

## ADR-020 — Registro de consentimiento inmutable (`data_consents`) *(NUEVO)*
**Estado:** Aceptada (junio 2026) · **Etapa:** MVP-relevante (Ley 21.719) · *(reflejado en PRD §16)*

**Contexto.** La Ley 21.719 exige evidencia datada de que el titular consintió el tratamiento de sus datos, con el texto exacto que aceptó.

**Decisión.** Tabla **`data_consents`**, **append-only e inmutable desde el cliente** (sin policies de INSERT/UPDATE/DELETE): la escribe **solo** el RPC `consentir_invitacion`. Columnas clave: `user_id`, `organization_id`, `membership_id`, `terms_version`, `terms_text_snapshot` (copia exacta del texto mostrado), `accepted_at`, `revoked_at`.

**Consecuencias.** Queda evidencia datada e inmanipulable para la Agencia de Protección de Datos. El `terms_text_snapshot` congela *qué* se aceptó, no solo *que* se aceptó. La revocación se registra con `revoked_at` (no se borra el registro). El RPC `consentir_invitacion` está **pendiente** de la aprobación legal del Instrumento 2 y de la versión definitiva del texto.

---

## ADR-021 — Modelo de datos de Notificaciones *(NUEVO)*
**Estado:** Aceptada y desplegada (junio 2026) · **Etapa:** MVP (módulo Notificaciones) · *(reflejado en PRD §08)*

**Contexto.** El módulo de Notificaciones envía correos desde dentro de la app (hoja de llamado al crew, petición/insistencia de DTE a proveedores, confirmación de asistencia). Necesita plantillas editables por productora y trazabilidad de envíos.

**Decisión.** Esquema en tres tablas, gateado por el módulo `gastos_legal_notificaciones` vía RLS:
- `notification_templates`: plantillas editables por productora, con **subversiones** (`subver_by`, `subvers`, `cuerpos`). Cuatro sembradas para Primate: `prod`, `dte1`, `dte2`, `confirmacion`.
- `notification_sends`: el "sobre" de campaña; soporta envíos inmediatos y **programados** (`sched_at`), con índice parcial para un cron futuro.
- `notification_send_recipients`: un registro por destinatario, con el **HTML ya resuelto** y el estado de entrega.
- Helper `get_send_org(send_id)` (SECURITY DEFINER) para aislar los recipients vía su `send`.

**Columnas agregadas.** A `organization_profile`: `link_formulario_pago`, `remitente_nombre`, `remitente_numero`, `remitente_rol`. A `projects`: `notificaciones_reglas jsonb NOT NULL DEFAULT '{}'` (reglas de automatización por proyecto, para futuros envíos por cron).

**Consecuencias.** El remitente visible al destinatario es el usuario real de Rizora que envía (nombre + Reply-To a su correo personal), no un correo genérico del sistema. El contenido de las plantillas (copy) es trabajo de redacción aparte, no de este ADR.

**Aislamiento de plantillas por organización (V3.4) — más allá de notificaciones.** El mismo principio per-organización aplica a **todas las plantillas de generadores y previsualizadores** (cotización, documentos, etc.), en frontend y backend: una plantilla creada por la productora A **no** debe aparecerle a la B. Además, algunas plantillas son **privadas** de una productora y no se ofrecen como ejemplo público (p. ej. la plantilla "Manifiesto", que Primate reserva para sí). Esto habilita el servicio de **generadores de documentos a pedido** descrito en el PRD §24 (la productora envía su plantilla y se adapta a su previsualizador, de forma aislada del resto).

---

## ADR-022 — Provisión autocontenida de organización *(REESCRITO en v1.7)*
**Estado:** Aceptada · provisión **autocontenida** vía catálogos globales (junio 2026) · **Etapa:** MVP / multi-tenant

**Contexto.** Crear una productora nueva exige sembrarle los perfiles de permiso y los datos operativos base de forma consistente y repetible. La versión anterior de este ADR copiaba esos datos **desde una organización template** (en la práctica, Primate). Eso tenía un problema de fondo para un SaaS multi-tenant: **un entorno limpio, sin Primate, no podía crear su primera productora** —no había de dónde copiar— y la provisión quedaba acoplada a que existiera y estuviera bien poblada una organización específica.

**Decisión.** La provisión pasa a ser **autocontenida**: los valores canónicos de arranque viven en **cinco catálogos globales** (no pertenecen a ninguna organización), y las funciones de provisión leen de ahí.

- **Catálogos globales (`default_*`), 144 filas semilla:** `default_permission_profiles` (8 perfiles), `default_permissions` (104 permisos / la matriz), `default_departments` (8 departamentos), `default_functions` (16 funciones/cargos) y `default_cancellation_reasons` (8 motivos). Se cargan por migración (`seed_permisos_autocontenido`), una sola vez, globalmente.
- **Las funciones de provisión (`seed_permisos_organizacion`, `provisionar_organizacion`) leen de los catálogos globales**, no de otra organización. El parámetro `p_template_org` quedó **opcional y se ignora** (se conserva en la firma solo por compatibilidad). Siguen siendo **SECURITY DEFINER e idempotentes**, probadas en rollback (8 perfiles, 104 filas de matriz, sin residuos).

**Esto resuelve las dos preguntas de producto** que el ADR dejaba abiertas: (1) con qué datos operativos arranca una organización nueva → con los catálogos globales `default_*`; (2) el gate de plan para crear una productora → `organizations.plan` (ver ADR-004 / enforcement de planes).

**Consecuencias.** El alta de una organización es un proceso de primera clase (coherente con ADR-009) y **no depende de Primate ni de ninguna organización existente**: un entorno recién levantado puede crear su primera productora. Para cambiar los valores de arranque (agregar un perfil, un departamento) se edita el catálogo global por migración, en un solo lugar. Junto con el **motor de organización activa en el cliente** (ADR-013, ya construido), habilita operar con múltiples organizaciones.

---

## ADR-023 — Base de datos en código: migraciones versionadas *(NUEVO en v1.7)*
**Estado:** Aceptada · base capturada y reproducible (junio 2026) · **Etapa:** Ambas

**Contexto.** Hasta junio 2026, toda la base (las 77 tablas, RLS, RPCs, triggers) existía **solo en el servidor vivo de Supabase**, construida a mano en el editor web, con **cero migraciones**. No había forma de recrearla si se corrompía, ni historia de cambios, ni revisión previa, ni un entorno de prueba que se mantuviera fiel en el tiempo. Era el mayor riesgo silencioso del proyecto (ver Arquitectura y Flujo de Trabajo §2.2).

**Decisión.** La base pasa a estar **"en código"**: el esquema se captura como migración base y, de ahí en adelante, **cada cambio de base de datos es un archivo de migración versionado** en el repositorio, aplicado con la Supabase CLI. **Conteo dual (v1.12):** la rama de producción tiene **9 migraciones** registradas (las 8 de abajo + la de `service_role` de Code); el **Informe Técnico cuenta 14 en `staging/main`** (9.349 líneas SQL). ⚠ Entre la 9.ª y la 14.ª hay **~5 migraciones sin handoff**: no se enumeran aquí hasta tener sus nombres. Las **9 conocidas** son:

| Migración | Qué hace |
|---|---|
| `…150834_remote_schema` | Esquema completo capturado de producción (tablas, RLS, RPCs, vistas). |
| `…150835_triggers` | Los 31 triggers (auditoría, mantenimiento). |
| `…150836_cron_eliminaciones` | El job de cron de eliminaciones programadas. |
| `…160154_revoke_funciones_internas` | `REVOKE EXECUTE` sobre 20 funciones internas (ver ADR-024). |
| `…170000_seed_permisos_autocontenido` | Los 5 catálogos globales `default_*`, 144 filas (ver ADR-022). |
| `20260617144834_endurecimiento_anon_y_search_path` | Cierre del backlog de endurecimiento: REVOKE de `anon` en las RPC de escritura, `search_path` en ~11 utilitarias, policy/COMMENT de `app_config` (ver ADR-024). |
| `20260617160000_fix_cupo_colaboradores_por_proyecto` | El límite de colaboradores pasa a ser **por proyecto** en `guardar_cargos`; `invitar_a_organizacion` deja de medir cupo; `rpc_assert_cupo_colaborador` deprecada (ver ADR-004 y PRD §22). |
| `20260621120000_revoke_anon_funciones_sensibles` | Revoca `anon` (y `PUBLIC`) en las **19 funciones sensibles** que el dump base no capturaba; cierra el hueco que dejaba 42 anon-ejecutables tras un reset limpio vs. 23 en prod. **No-op en producción** (ya estaban revocadas; solo sincroniza el código con la base). Ver ADR-024. |
| `20260621140000_revoke_service_role_funciones_sensibles` | Revoca `service_role` en las ~48 funciones sensibles (PR #4, handoff de Code). **No es seguridad, es fidelidad de build:** deja el reset de staging idéntico a prod a nivel de ACL (`anon`/`service_role` == baseline {authenticated, postgres} = 23). **No-op en producción.** Ver ADR-024. |
| *(~5 migraciones ⚠ pendientes de enumerar)* | El Informe Técnico cuenta 14 en `staging/main`; faltan los nombres de las que van entre la 9.ª y la 14.ª. No se inventan filas. |

> **Lección de reproducibilidad (21-jun).** "Reset reconstruye una base fiel a producción" es cierto **solo si las migraciones capturan todo el estado** — incluidos los grants. El dump base capturaba `REVOKE … FROM PUBLIC` pero **no** la ausencia del grant explícito de `anon` (que Supabase otorga por *default privileges*). Resultado: un reset limpio de staging (o un preview branch, o una recuperación ante desastre) reproducía un estado **menos seguro** que prod. Por eso el cierre fue **una migración** (no un ajuste manual en prod): lo que no está en una migración, no es reproducible. *(El patrón correcto y la causa, en ADR-024.)*

**Flujo permanente (regla, no excepción) — Orden A, ratificado.** Todo cambio de BD entra **al repo antes que a producción**. Secuencia canónica única:

1. **Migración en una rama de feature** (nunca en `main`, nunca por el editor SQL).
2. **PR + prueba sobre datos de prueba** (preview branch del PR, o la branch `staging`), con **required check** activo: una migración que falla **no se puede mergear**.
3. **Revisión de la PR** (última compuerta humana — ver R1; con equipo la hace el rol técnico, en modo solo-dev es la auto-revisión disciplinada de Agustín + `npm run gate` — ADR-027).
4. **Merge a `main`** (punto de no retorno).
5. **Aplicación a producción por la integración de Branching de Supabase**: producción se actualiza **al mergear** (merge = deploy). Con "deploy to production" activo, el `db push` manual queda **prohibido** (riesgo de doble aplicación).

**Configuración prescrita** (Project Settings → Integrations → GitHub): "deploy to production" **ON**, preview branches por PR **ON**, required check **ON**. Con eso el Orden A deja de ser solo doctrina y queda **forzado por la herramienta**: tocar producción fuera de un merge se vuelve imposible. *(Versión en lenguaje simple y diagrama del flujo: Arquitectura y Flujo de Trabajo §2.2/§7.)*

**Reglas asociadas:**
- **R1 — Merge = deploy.** No hay un paso manual de aplicación que revisar al final; la revisión de la PR (paso 3) es la última compuerta humana, y el botón de merge es el punto de no retorno.
- **R2 — Excepción "solo/rápido" acotada.** El auto-aprobado de Agustín relaja la **revisión**, nunca el **orden**, y solo aplica a migraciones **aditivas, no bloqueantes, reversibles** que **no** toquen RLS, policies, auth, aislamiento de tenant, ni drops/renames/cambios de tipo/backfills. El criterio es **radio de impacto y reversibilidad**, no "tamaño". Todo lo demás espera la revisión de PR, sin excepción, incluso con deadline (con equipo: el rol técnico; en modo solo-dev: auto-revisión disciplinada + `npm run gate` — ADR-027).
- **R3 — No se canoniza "saltar staging".** Idempotente ≠ seguro (un `CREATE INDEX` sin `CONCURRENTLY` es idempotente y bloquea una tabla grande). Con preview branches activos, probar es gratis: se prueba **siempre**.

**Lección registrada (incidente 17-jun).** El **Orden B** (aplicar a prod antes de mergear) fue el atajo que causó la **desincronización repo↔prod** del 17-jun, reconciliada a mano. **Se descarta de forma definitiva**: además de dejar una ventana de desincronización, contradice cómo opera la integración. **Nunca** se aplica un cambio directo a producción por el conector MCP de Supabase ni por el editor SQL; el conector MCP queda para **inspección de solo lectura** y pruebas **en transacción revertida**.

**Consecuencias.** La base es **reproducible** (se reconstruye desde cero), tiene **historia** y **revisión**, y el entorno de prueba (branch `staging`, ADR-015) nace de las mismas migraciones. El costo es disciplina: ningún atajo por el editor web ni por el MCP. Es la fundación sobre la que se apoyan el staging, la seguridad basal y la modularización (Arquitectura §7, Prioridad #1).

---

## ADR-024 — Endurecimiento de permisos de ejecución de funciones *(NUEVO en v1.7)*
**Estado:** revocación de funciones internas **hecha**; backlog de advisors **cerrado** (`…144834`, 17-jun); **endurecimiento de `anon` completo** (`…120000`, 21-jun); **`service_role` revocado por fidelidad** (`…140000`, 21-jun — Code); CSP **sin `unsafe-inline` en `script-src`** logrado en staging; pendiente el header `frame-ancestors` del hosting · **Etapa:** Seguridad basal

**Contexto.** En PostgreSQL/Supabase una función puede ser ejecutable por `anon` (público) o `authenticated`. Varias funciones **internas** (de trigger y utilitarias con prefijo `_`) quedaban invocables desde internet sin necesidad, y el linter de seguridad de Supabase levantó un conjunto de avisos (ninguno crítico, pero a cerrar antes de exponer el producto a terceros).

**Decisión.**
- **Funciones internas sin acceso público (hecho).** La migración `revoke_funciones_internas` revoca `EXECUTE` a `public`/`anon`/`authenticated` sobre **20 funciones internas** (14 de trigger + 6 con prefijo `_`). **Convención hacia adelante:** toda función interna nace ya revocada (la migración la crea sin GRANT público).
- **Backlog de endurecimiento — ejecutado (migración `…144834`, 17-jun).** ✅ (a) Revocado a `anon` el `EXECUTE` en las RPC de **escritura** como capa externa —cada función ya valida `auth.uid()` por dentro; **los flujos de invitación quedaron anon-ejecutables**—; ✅ (b) `search_path` explícito fijado en ~11 funciones utilitarias; ✅ (c) decidida la **policy de `app_config`** (se documentó vía COMMENT). Se aplicó **como migración**, por el flujo del ADR-023. **Pendiente (no es migración):** el header **`frame-ancestors`** (anti-clickjacking) del hosting, antes del beta externo.
- **Endurecimiento de `anon` completo (migración `…120000`, 21-jun).** Reconstruyendo staging fiel a prod se detectó que `…144834` solo cubría **7** RPC de escritura; quedaban **19 funciones sensibles** anon-ejecutables tras un reset limpio (42 vs. 23 en prod). `…120000` las revoca → **26 funciones sensibles** revocadas en total. Las 19: `asignar_cargo_a_miembro`, `cancelar_eliminacion_cuenta`, `exportar_herramienta`, `exportar_mis_datos`, `guardar_cargos`, `guardar_consentimiento_cookies`, `guardar_pagos_cliente`, `invitaciones_de_organizacion`, `marcar_notificaciones_leidas`, `mis_organizaciones_como_unico_admin`, `personas_de_mis_proyectos`, `procesar_eliminaciones_vencidas`, `resolver_rebind`, `revocar_consentimiento`, `rpc_assert_cupo_colaborador`, `rpc_assert_cupo_proyecto`, `rpc_assert_plan`, `solicitar_eliminacion_cuenta`, `transferir_administracion`.
- **Revocación de `service_role` — fidelidad de build, NO seguridad (migración `…140000`, 21-jun — handoff de Code, PR #4).** El mismo rebuild mostró que a `service_role` también le quedaba `EXECUTE` sobre las ~48 sensibles en un reset limpio, mientras que en prod ya estaba revocado. `…140000` lo revoca → el reset queda **idéntico a prod a nivel de ACL** (`anon`/`service_role` == baseline {authenticated, postgres} = 23 ejecutables). **Distinción clave que NO se debe borrar al leer esto:** revocar `anon` cerró un **hueco de seguridad real** (un anónimo podía ejecutar funciones sensibles en un build fresco); revocar `service_role` es solo **fidelidad/paridad de build** — `service_role` es la llave de backend que **ignora RLS por diseño y nunca sale del servidor**, así que quitarle acceso no cierra ninguna puerta que un atacante pueda usar. Por eso en el hub OWASP el `service_role` **no** figura como "otro hueco cerrado" sino como integridad de build (A08).
- **CSP sin `unsafe-inline` en `script-src` — logrado en staging.** La reescritura modular reemplazó los `onclick` inline por **delegación de eventos** (ver ADR-026), lo que permitió endurecer la CSP de staging a `script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com` — **el navegador ya rechaza todo JS inline, propio o inyectado**. Era el "premio de seguridad" del refactor (cruza OWASP A05). Queda `style-src` con `unsafe-inline` (deuda dimensionada, "proyecto S"). **Producción, en cambio, sigue con el monolito y `unsafe-inline` en `script-src`** hasta el corte.

> **Patrón canónico (v1.12 — a respetar en toda migración que crea o recrea una función sensible en `public`, incluido cualquier `DROP+CREATE`):**
> ```sql
> REVOKE ALL ON FUNCTION public.<fn>(<args>) FROM PUBLIC, anon, service_role;
> GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO authenticated;  -- si corresponde
> ```
> Se agrega `service_role` al patrón (antes solo `anon`): por **fidelidad de build**, para que un reset limpio deje la ACL idéntica a prod. La razón de **seguridad** sigue siendo `anon`.
> **Causa (por qué `FROM PUBLIC` solo no basta):** Supabase otorga `EXECUTE` a `anon` (y `authenticated`, `service_role`) a cada función nueva en `public` mediante **DEFAULT PRIVILEGES**, como grant **explícito** (no heredado de `PUBLIC`). `REVOKE … FROM PUBLIC` no toca ese grant explícito; hay que nombrar a cada rol. Probado en transacción revertida: tras `REVOKE FROM PUBLIC` `anon` aún puede; tras `REVOKE FROM PUBLIC, anon`, no.
> **Recomendación sistémica — por qué NO se puede por migración (hallazgo de Code, 21-jun).** El fix de fondo sería un `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM anon, service_role` para el rol que crea funciones, para que **nazcan** sin acceso (deny-by-default real). **Pero no se puede aplicar por migración:** el rol `postgres` (con el que corre el CLI) **no es superusuario ni miembro de `supabase_admin`** → *permission denied* al intentar el `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`. Si se quiere deny-by-default real, va por **dashboard/soporte de Supabase**, no por código; requiere además auditar que las funciones que SÍ deben ser anon (flujos de invitación) tengan su `GRANT … TO anon` explícito. Por ahora se cierra **por función** (disciplina por migración, con el patrón de arriba).

**Consecuencias.** La superficie de ataque de las funciones se reduce a lo necesario. El control de acceso de datos ya estaba cubierto por RLS + RPC; esto es endurecimiento de la capa de ejecución, no un hueco abierto. Se cierra antes de abrir el beta a productoras externas.

---

## ADR-025 — Inmutabilidad financiera al cierre y reporte de cierre *(NUEVO en v1.7)*
**Estado:** Decisión registrada · deuda de la fase de reportería (no bloquea hoy) · **Etapa:** Reportería / cierre

**Contexto.** La auditoría dirigida de lógica financiera (Arquitectura §6) confirmó que **hoy el backend no produce números financieros autoritativos**: es una capa de persistencia fiel que guarda verbatim lo que el usuario declara (lo correcto para una herramienta de gestión). Pero detectó dos puntos a resolver cuando se construya la reportería de cierre.

**Decisión.**
- **`project_financials.frozen` no es inmutable.** Hoy se reescribe en cada `guardar_proyecto`, y la regla "congelar al cerrar el proyecto" vive solo en el frontend. **Decisión:** crear una RPC **`cerrar_proyecto`** que marque el cierre, **congele los totales del lado servidor** y **bloquee escrituras** posteriores sobre el proyecto cerrado (coherente con ADR-002 / no confiar en el cliente, y con la inmutabilidad de proyecto al cierre del Roadmap).
- **El futuro `reporte_cierre` recalcula, no confía.** Debe **recalcular desde las líneas** (presupuesto, comisiones, riesgos, extras, costo real) y leer el **IVA desde `tax_rates`** (ADR-018: el impuesto nunca se hardcodea). **Nunca** debe confiar en `frozen` ni en los snapshots de cotización como fuente del número final.

**Consecuencias.** El número de cierre será auditable y reproducible desde los datos base, no un valor que pudo quedar obsoleto. Es deuda registrada: no bloquea el beta inicial, pero es requisito de la fase de reportería. El enforcement de plan para `reporte_cierre` queda pendiente junto con la función (ADR-004).

---

## ADR-026 — Arquitectura de frontend modular: delegación, ganchos y época multi-org *(NUEVO en v1.12)*
**Estado:** Aceptada · **implementada en `staging/main`**, pendiente el corte a producción (ADR-015) · **Etapa:** Ambas *(detalle vivo en Arquitectura §3 y §7)*

**Contexto.** El monolito (`index.html` de ~28.000 líneas con cientos de `onclick` inline) hacía imposible endurecer la CSP y trabajar en paralelo. La reescritura modular (rama `staging/main`) lo reemplazó por 40 archivos ES Modules (25.327 líneas en `frontend/src/`: 14 en `lib/` + 25 en `modules/`), y con eso hubo que fijar **cómo se comunican los módulos** sin recrear un monolito ni caer en ciclos de import.

**Decisión.** Toda intercomunicación se resuelve por **exactamente tres canales**, elegidos por dirección de la arista y momento de uso:
- **Imports ESM** — dependencias *hacia abajo*, en tiempo de evaluación (364 aristas únicas). Se usan cuando el destino evalúa antes y no hay ciclo.
- **Ganchos** (`lib/ganchos.js`: `define`/`gancho`/`valor`) — **inversión de control** para aristas *hacia arriba* (de un módulo temprano a uno tardío) que un import volvería un ciclo. Un nombre sin `define` **grita en consola**, nunca falla en silencio.
- **Delegación de eventos** (`lib/delegacion.js`) — la UI llama al código vía **un solo listener por tipo de evento** a nivel `document`, que despacha por `data-accion="ns.nombre"`. **Esto reemplaza los `onclick` inline y es lo que habilita el CSP sin `unsafe-inline`** (ADR-024). Firma universal `(args, el, ev)`.

**Invariantes (verificados con comando, no estimados):**
- **Biyección de acciones:** 364 acciones registradas ≡ 364 referenciadas, 0 huérfanas en ninguna dirección.
- **Estado con dueños:** `state.js` posee el estado global; **los setters exportados son la única vía de escritura** (cero asignaciones directas fuera del dueño). `rates.js` posee las 6 tasas tributarias; `catalogos.js`, las constantes sin ciclo.
- **Residuo `window` acotado:** 73 asignaciones sobre 68 propiedades, **65 solo-escritura** (API de consola/legado); solo 3 con lectura interna real (`_ORG_EPOCA`, `__TAKEOS_USER`, `_persisResetOrg`).
- **Aislamiento multi-org por época** (`_ORG_EPOCA`): al cambiar de organización se hace un reset total; todo trabajo async **compara época tras cada `await` y aborta si la organización cambió**. La RPC resuelve la organización en servidor → **cruzar datos entre organizaciones es imposible** aunque un async quede colgando.

**Deuda registrada (ver hub OWASP y §4-§5 del Informe):** 11 guardas `typeof X === 'function'` sobre identificadores que solo existen como espejos `window` — si la purga de `window` sigue, degradan a **no-op silencioso** (el mismo mecanismo que produjo bugs de identificador libre); deben consultar el registro de ganchos. Y las compuertas `npm run gate` (cero `on*=`, cero identificadores libres) hoy **se corren a mano**: falta atarlas a un pre-push/CI real y sumar un checker de despacho de 2.º nivel (los mapas `_*_FN` no tienen compuerta).

**Consecuencias.** El refactor destraba el trabajo en paralelo y **entrega el CSP endurecido**, pero **vive en staging**: hasta el corte (ADR-015), producción sigue siendo el monolito. La disciplina de los tres canales y las compuertas es lo que impide que la arquitectura se degrade.

---

## ADR-027 — Modo solo-dev y política de "cargos, no nombres" *(NUEVO en v1.13)*
**Estado:** Aceptada · vigente desde julio 2026 · **Etapa:** Ambas

**Contexto.** En julio 2026 el cargo de CTO quedó **vacante** (quien lo ejercía dejó el proyecto, sin malos términos y con posible retorno; sus accesos se mantienen por decisión de Agustín). El proyecto pasa a operar con **una persona: Agustín**, apoyado en su ecosistema de IAs (chats especializados, Code) y en las compuertas automatizadas. A la vez, es esperable que en unos meses entren más personas, con posible rotación.

**Decisión (dos partes).**

**1. Modo solo-dev: los protocolos se mantienen, cambia quién los ejecuta.** El sistema debe soportar operar con una sola persona **sin desmontar los flujos** que permiten escalar después:
- **Se mantienen:** ramas de feature (nunca commit directo a `main`), PRs, staging-primero, migraciones-como-código, el Orden A completo, las compuertas `npm run gate`.
- **Se adapta la revisión de PR:** con equipo, la revisa el rol técnico; en modo solo-dev es **auto-revisión disciplinada** — el PR se abre igual, pasan las compuertas automatizadas, y Agustín lo lee con ojos de revisor antes de mezclar. La compuerta es **del proceso, no de una persona**.
- **Queda en pausa (registrado como riesgo, no borrado):** el **pentest dirigido** (rol Pentester sin titular) y la **revisión por segunda persona** (separación de funciones real). Ambos se reactivan cuando el cargo se ocupe — o se contratan puntualmente. El hub OWASP (A03, §"separación de funciones") registra la degradación temporal.

**2. Política de nombres: los canónicos describen cargos, no personas.** Desde esta versión, **ningún rol, protocolo o tarea de los canónicos se asigna a una persona con nombre propio**. Se describen **cargos** (CTO, revisor, Test Master, Pentester, Cib,Seg…) y quien los ocupe en cada momento los ejerce. Razones: (a) la rotación de personas no debe obligar a reescribir los documentos; (b) evita que las IAs que consumen estos documentos infieran que un proceso está limitado a una persona específica. **Excepciones acotadas:** (i) **Agustín Muñoz Rocha**, dueño y creador del producto — su nombre es estructural; (ii) nombres en **changelogs y registro de decisiones**, que son trazabilidad histórica (quién decidió/hizo qué y cuándo) y se marcan como tal ("registro histórico"), nunca como asignación vigente.

**Consecuencias.** Una incorporación futura es "alguien toma tal cargo", no una reescritura documental. El costo real del modo solo-dev es la pérdida temporal del segundo par de ojos; se compensa parcialmente con las compuertas automatizadas y se registra como riesgo abierto (Roadmap §6). Esta ADR es también la referencia para redactar futuros documentos: **cargos, no nombres**.

---

# Parte 2 — Decisiones abiertas (se espera la opinión del desarrollador)

## ADR-F — Departamentos de servicios: por-productora vs. catálogo global *(NUEVO en v1.12 · ⚠ ABIERTA · arbitraje de Agustín)*
**Estado:** Abierta · **bug activo en el módulo de presupuesto** · **Etapa:** MVP-relevante ya

**Contexto.** Reportado por Agustín (7–8 jul) y adjudicado con el BD Expert: **las filas de servicios pierden su departamento al recargar.** Causa raíz: las filas guardan el departamento **por nombre**; el RPC `guardar_proyecto` lo mapea a `department_id` contra la tabla `departments` y da **NULL** si el nombre no está ahí. Además `_dalBudgetRow` descarta el `department_id` en memoria — el departamento vive **solo como la clave del grupo `d.servicios`**. Los departamentos personalizados o renombrados nunca se insertan en `departments` → sus filas caen a NULL. La primera hipótesis (upsert por nombre) fue **refutada**: ensuciaría el catálogo.

**Fix de fondo acordado (técnico).** Mandar **`department_id` (entero), no el nombre**, + creación explícita del departamento + ajuste del RPC para aceptar id. Coordinación frontend+backend pendiente.

**Lo que decide Agustín (diseño de producto).** El fix técnico presupone un modelo: **¿los departamentos son por-productora (cada organización define/renombra los suyos) o un catálogo global compartido?** Esa decisión de diseño la arbitra Agustín y condiciona la implementación (y, si resulta una regla de producto, tocaría PRD §22). **Hasta que se decida, queda como ítem abierto, no resuelto.**

---

## ADR-A — Acceso del fundador / conflicto de interés competitivo
**Estado:** Abierta · **Crítica para la adopción** · **Etapa:** SaaS *(reflejado en PRD §17)*

**Contexto.** Rizora es del dueño de una productora y se venderá a la competencia. Para el **MVP no aplica** (Primate usa sus propios datos); es una decisión de **etapa SaaS**.

**Dirección recomendada (a validar).** No-abuso de **cuatro patas**: estructural (mínimo privilegio + break-glass), auditoría (`audit_log`), reputacional, legal (Ley 21.719). Llaves gestionadas por la plataforma (no del cliente: cegar la plataforma mataría el Reporte y el cross-tenant). Evaluar **separación societaria** de Rizora.

**Actualización v1.5 — separación societaria confirmada como dirección (Legal + BD).** La parte de **separación societaria** deja de ser solo "a evaluar": **La Hectárea SpA no será la Encargada del tratamiento de datos**. El software vivirá en una **sociedad nueva y separada**, que actuará como Proveedor/Encargado; La Hectárea sigue siendo la productora audiovisual. La **identidad del Proveedor** (razón social, RUT, domicilio) debe ser **dato configurable**, nunca hardcodeado (el dev y el BD Expert ya están instruidos). Los textos legales y el futuro contrato de encargo (DPA) usan hoy "La Hectárea" como **placeholder**, a actualizar cuando se constituya la sociedad. El resto de ADR-A (modelo de no-abuso del acceso del fundador) sigue abierto.

**Preguntas para el dev.** ¿Basta break-glass + audit para el mercado objetivo? ¿SOC 2 / ISO 27001 (ADR-E), cuándo? ¿Modelo de cifrado que dé más garantía sin matar el Reporte?

---

## ADR-B — Política de uso de datos para mejora del producto
**Estado:** Abierta · **Etapa:** SaaS *(reflejado en PRD §17)*

**Dirección recomendada.** **Agregado y anonimizado** → defendible, incluso feature (benchmarks). **Crudo identificable** → solo con consentimiento explícito. El delay (ej. 6 meses) es palanca para lo agregado, **no** reemplaza el consentimiento en lo identificable.

**Preguntas para el dev.** Mecanismo de consentimiento; separación técnica identificable/agregado; alcance de cualquier uso para entrenamiento.

---

## ADR-C — Edición colaborativa en vivo
**Estado:** Abierta · **Diferida (horizonte lejano)** · **Etapa:** SaaS / Fase 3+

**Decisión preliminar.** **Diferida** por costo. La integridad ya está resuelta por ADR-006 sin esto. Se evalúa cuando haya evidencia de necesidad.

**Preguntas para el dev.** Costo realista cuando llegue; ¿versión liviana de "presencia" (quién está en el documento) que dé el 80% del valor?

---

## ADR-D — Tolerancia de pérdida y de caída (RPO / RTO)
**Estado:** Abierta · **Decisión de negocio** · **Etapa:** MVP (relevante apenas haya datos reales)

**Pendiente.** ¿Cuántas horas de datos es aceptable perder (RPO)? ¿Cuánto downtime tolera la operación (RTO)? El point-in-time recovery de Supabase Pro acerca el RPO a casi cero; falta fijar el objetivo. **Conecta con la acción urgente de ADR-010.**

---

## ADR-E — Certificaciones de seguridad (SOC 2 / ISO 27001)
**Estado:** Abierta · **Etapa:** SaaS *(reflejado en PRD §17)*

**Pendiente.** Si/cuándo perseguir certificación (costo y esfuerzo de auditoría no triviales), según mercado y etapa. No certifican imposibilidad técnica de acceso, sino controles auditados.

---

# Apéndice — Glosario rápido

- **Backend / frontend / cliente / servidor** — frontend corre en el navegador; backend, en un servidor que controla Rizora; cliente = navegador; servidor = máquina siempre encendida.
- **Supabase** — plataforma que entrega PostgreSQL administrado, autenticación, storage y API listos para usar.
- **Edge Functions** — código server-side de Supabase donde corre la lógica crítica (no en el cliente).
- **RLS (Row Level Security)** — reglas de PostgreSQL que deciden qué *filas* puede ver/tocar cada usuario.
- **GRANT** — permiso de acceso a una *tabla* completa. Cada tabla nueva necesita el suyo (gotcha del handoff).
- **Endpoint / API** — catálogo de lo que el cliente puede pedirle al servidor; un endpoint es una dirección puntual.
- **Token** — comprobante de identidad que viaja en cada request.
- **Autenticación vs. autorización** — quién eres vs. qué puedes hacer.
- **Perfil (de permiso)** — uno de los 8 perfiles fijos (Administrador, Ejecutivo, Producción, Asistencia, Coordinación, Creativo, Invitado, Finanzas) que determina qué módulos puede tocar un usuario. Se asigna via membresía, nunca por el rol descriptivo de proyecto.
- **Membresía (`memberships`)** — la fila que vincula un usuario con una productora: tipo (`interno`/`externo`) + perfil. Una persona tiene una membresía por cada productora donde participa.
- **`permission_profiles` / `profile_permissions`** — tablas que guardan los 8 perfiles y la matriz módulo × nivel (E/L/—). Sembradas y read-only en MVP; editables por el admin en HORIZONTE.
- **`project_members`** — rol descriptivo por proyecto (PE, JP, DoP…). No controla acceso; define quién es quién para RECI y, para externos, qué proyectos puede ver.
- **`permission_grants`** — overrides puntuales tipo Google Drive (ampliar/restringir acceso en un proyecto/módulo específico); HORIZONTE, no MVP.
- **Roadmap Operativo** — tercer documento canónico (junto al PRD y este ADR). Define la secuencia de ejecución, los gates entre fases, el ciclo de evolución circular y el modelo de trabajo entre chats. Referencia: Roadmap Operativo v1.0.
- **RBAC / ABAC** — permisos por rol fijo vs. por atributo/estado del recurso. En Rizora: el "rol fijo" son perfiles asignados via membresía; ABAC aplica al estado del proyecto (ej. Cerrado bloquea edición independientemente del perfil).
- **Optimistic concurrency / sello de versión** — evita que un guardado pise otro comparando una marca de versión.
- **Transacción / atomicidad / rollback** — pasos que ocurren todos o ninguno; rollback deshace si algo falla a mitad.
- **Migración / idempotente** — cambiar la forma de los datos; idempotente = re-ejecutable sin daño.
- **Multi-tenant / `organization_id`** — varios clientes en un sistema; etiqueta que marca a qué productora pertenece cada fila.
- **Object storage / URL firmada** — almacenamiento barato para archivos pesados; enlace temporal y autorizado a un archivo.
- **Staging / deployment / rollback** — copia de producción para probar; acto de publicar una versión; volver a la anterior.
- **Observabilidad / `audit_log`** — ver qué hace el sistema en producción; registro de quién hizo/cambió qué.
- **RPO / RTO** — cuánto dato te resignas a perder / cuánto tiempo puedes estar caído.
- **publishable / secret key** — llave pública (va al frontend, segura solo con RLS) vs. llave secreta (jamás al frontend).
