# CLAUDE.md — TakeOS

> Este archivo son las **instrucciones permanentes** para Claude Code en este repositorio. Es la "biblia de producción" del agente. Mantenerlo corto y de alta señal. *(Nota: hoy vive en `docs/CLAUDE.md`. Para que Claude Code lo auto-cargue cada sesión debe estar en la raíz del repo o del workspace — mientras siga solo en `docs/`, hay que apuntárselo a mano.)*
>
> **Versión:** borrador 0.5 · **Mantiene:** Agustín (arbitra y consolida). Cuando suban de versión los canónicos, actualizar las referencias de abajo.
>
> **v0.5 (jul 2026):** §6 — **regla R4: staging y producción JAMÁS divergen.** Toda migración aplicada a la base de staging debe existir como archivo y quedar encaminada a `main` (= prod); una migración en staging que no llega a `main` es un incidente de desincronización. Cada migración a staging es una «pendiente de prod» hasta el merge, y un cambio de BD no se cierra hasta que ambos entornos tienen el mismo set de migraciones.
> **v0.4 (jul 2026):** **operación en solitario** — el proyecto pasa a manos de Agustín solo (producto, dominio y técnica). Se elimina la capa de revisión externa: **Agustín aprueba y arbitra todo**, sin gate de revisión de un tercero. El flujo técnico se mantiene tal cual (migraciones en código, ramas, pruebas en staging). Actualizados §2 y §6.
> **v0.3 (jul 2026):** el frontend modular está **DESACOPLADO Y COMPLETO en staging** (Desacople D0-D4 + FASE HF: delegación de eventos, ganchos, estado con dueños, CSP estricta sin `unsafe-inline`, cero `on*=` inline). Producción sigue en el monolito hasta el corte (Lote 4). Actualizado §2 (stack real modular), §6 (se edita `frontend/src/`, no el HTML; compuerta `npm run gate`), §8 (14 migraciones, deuda del informe de arquitectura). Referencias canónicas a ADR v1.12 y Arquitectura v1.8. Informe técnico completo: [ARQUITECTURA.md](ARQUITECTURA.md).
> **v0.3.1 (jul 2026):** los cinco canónicos se movieron a `docs/canonicos/` y subieron de versión (ADR v1.12, Arquitectura y Flujo v1.8, Roadmap v1.10, Seguridad v1.5; PRD v3.6 sin cambio de versión). Actualizadas las referencias de §3.
> **v0.2 (jun 2026):** flujo «BD en código» (Orden A, *merge = deploy* por Branching de Supabase) y trabajo en ramas + PR.

---

## 1. Qué es TakeOS

TakeOS es un **sistema operativo de producción audiovisual**, modelo **proyecto-céntrico**: cada proyecto es la unidad mínima y autónoma (nace, se desarrolla, se cierra y queda bloqueado como fuente histórica). Reemplaza el caos de planillas, mails y WhatsApp con una sola fuente de verdad por proyecto.

Lo construye **Agustín Muñoz Rocha** (Primate Films / La Hectárea SpA), fundador-operador **no-técnico** y **árbitro final** de toda decisión de producto y arquitectura. El software migrará a una sociedad separada como Proveedor SaaS.

## 2. Stack técnico

- **Frontend:** **JavaScript puro con ES Modules, sin framework**, bundleado con **Vite** (Rollup). **Dos realidades conviven, y es crítico saber en cuál trabajas:**
  - **Producción (`origin/main` → GitHub Pages) TODAVÍA corre el monolito** — un `index.html` de ~28.600 líneas en la raíz del repo. El corte a la build de Vite (**Lote 4**) está pendiente; hasta entonces, cualquier hotfix directo a producción se hace sobre ese monolito.
  - **Staging (`etapa4-integracion`) corre la arquitectura modular, ya DESACOPLADA Y COMPLETA** — 40 archivos en `frontend/src/` (14 `lib/` + 25 `modules/`, ~25.300 líneas). **Es donde se trabaja hoy.**
- **Arquitectura del cliente modular** (lo que Claude edita): tres mecanismos de intercomunicación con roles disjuntos — **imports ESM** (dependencias hacia abajo) · **delegación de eventos** (`lib/delegacion.js`: un listener por tipo a nivel `document`, la UI se cablea con `data-accion`/`data-args`; **CERO handlers `on*=` inline**) · **ganchos** (`lib/ganchos.js`: `define`/`gancho`/`valor` para aristas hacia arriba, sin ciclos ESM ni `window`). Estado con dueños en `lib/state.js`/`lib/rates.js` (**los setters son la única vía de escritura**). **CSP estricta: `script-src` sin `unsafe-inline`** — el navegador rehúsa ejecutar cualquier JS inline (nuestro o inyectado). *El patrón viejo de "puentear a `window` para no romper los `onclick`" quedó extinto: window bajó de 962 a 73 residuales. No reintroducir bridges ni `on*=`.*
- **Backend:** **Supabase** — PostgreSQL (base), Supabase Auth (identidad), Supabase Storage (archivos), RLS + GRANT (acceso) y **RPCs / Edge Functions para la lógica crítica**.
- **Multi-tenant:** `organization_id` en toda tabla de negocio; en el cliente, cambiar de organización resetea modelo **y** vista, con una "época" (`_ORG_EPOCA`) que cancela el trabajo async obsoleto para no cruzar datos entre tenants.

## 3. Documentos canónicos (la autoridad)

La verdad del proyecto vive en tres documentos. **Léelos antes de proponer cambios de fondo.** Si un cambio contradice uno de ellos, **levanta la contradicción, no la resuelvas en silencio.**

- **PRD** ([`canonicos/TakeOS_PRD_V3_6.md`](canonicos/TakeOS_PRD_V3_6.md)) — qué es TakeOS y por qué. **Manda en producto y dominio.**
- **ADR** ([`canonicos/TakeOS_ADR_Backend_v1_12.md`](canonicos/TakeOS_ADR_Backend_v1_12.md)) — cómo se construye técnicamente y por qué. **Manda en lo técnico.**
- **Roadmap** ([`canonicos/TakeOS_Roadmap_Operativo_v1_10.md`](canonicos/TakeOS_Roadmap_Operativo_v1_10.md)) — en qué orden, cuándo y quién. **Manda en ejecución.**

Ante choque: PRD en producto → ADR en técnica → **Agustín arbitra.**

> **Documentos relacionados (no son del trío de autoridad):**
> - [`canonicos/TakeOS_Arquitectura_y_Flujo_de_Trabajo_v1_8.md`](canonicos/TakeOS_Arquitectura_y_Flujo_de_Trabajo_v1_8.md) — la **infraestructura** (BD en código, entornos producción/staging, despliegue, modularización del frontend con Vite) y el **flujo de equipo** (Git, ramas, Pull Requests, quién hace qué). Consúltalo para *cómo* se construye y se publica.
> - `ARQUITECTURA.md` (+ carpeta `arquitectura/`) — **informe técnico del cliente modular** (topología, arranque, intercomunicación, estado, persistencia, grafo de dependencias, seguridad/CSP, censo, y el registro de los 4 bugs de regresión ya reparados). Es la foto de *cómo está construido* hoy `frontend/src/`.
> - [`canonicos/TakeOS_Seguridad_OWASP_Top_10_2025_v1_5.md`](canonicos/TakeOS_Seguridad_OWASP_Top_10_2025_v1_5.md) — **hub de seguridad**: mapea las 10 categorías OWASP 2025 al stack de TakeOS y deja veredicto. Subordinado al PRD (producto) y al ADR (técnica); alimenta el Gate C y el pentest.
>
> Ninguno de estos manda sobre producto/técnica/ejecución (eso sigue siendo PRD/ADR/Roadmap).

---

## 4. Doctrinas de arquitectura que NUNCA se violan

Estas no se negocian. Si una tarea te empuja a romper una, **detente y avisa**.

1. **Nunca confiar en el cliente** (ADR-001/002/017). El frontend es público y manipulable. La lógica crítica corre **server-side**, tratando todo dato entrante como potencialmente falso.
2. **Regla de oro de dónde va la lógica:** si la operación **mueve plata**, **decide permisos sensibles**, o **debe ser atómica** → **server-side (RPC)**. Si es una lectura o un CRUD simple sobre datos del propio tenant → directo con **RLS**.
3. **Autorización en el servidor, por perfil vía membresía** (ADR-004). Los permisos cuelgan del usuario (membresía interno/externo × perfil), **no del rol por proyecto**. Toda escritura sensible se verifica **dentro del RPC** + RLS. El frontend solo refleja; nunca es la autoridad.
4. **Lógica y tasas tributarias SOLO en la tabla `tax_rates`** (ADR-018), nunca hardcodeadas en el cliente. El cliente las **lee** al iniciar sesión (viven en `frontend/src/lib/rates.js`, pobladas por `dalBootTaxRates`). Cambiar una tasa = **insertar fila nueva** con su `vigente_desde`. **Cualquier hardcodeo tributario en el cliente es un error de severidad alta.**
5. **Modelo relacional, fuente única de verdad** (ADR-005). Relaciones por referencia, **no por copia**. **Soft delete** + campos de auditoría (`created_at`/`updated_at`/`deleted_at`). **GRANT al rol `authenticated` después de CADA tabla nueva** (Supabase no la expone sola; olvidarlo = 403).
6. **Versionar en vez de eliminar; la última manda** (principio 9 / §20). Documentos versionables (cotización, legal, hoja de llamado, plan de rodaje) no se borran. Filas de presupuesto/gastos/tareas/contactos tienen su ciclo propio con soft delete.
7. **El backend recalcula los valores derivados** (ADR-002). Retenciones, totales, etc.: el servidor los recalcula desde los insumos y **rechaza** entradas inválidas (no las "arregla"). La validación en el frontend es **solo UX**.

## 5. Principios de producto que el código debe respetar

(Los diez del PRD §02 — los más operativos para Code.)

- **Proyecto-céntrico:** no existe información huérfana; todo cuelga de un proyecto.
- **Fuente única de verdad:** cada dato se ingresa en un solo lugar y alimenta al resto.
- **Visibilidad de errores:** errores con mensajes claros y accionables; un error oculto es peor que uno evidente.
- **Responsabilidad explícita:** toda tarea tiene un Responsable visible (modelo RECI).
- **Norte anti-cortisol:** las guardas que impiden cometer el error son el norte hecho función. Si un cambio agrega fricción sin reducir un momento de ansiedad del operador, cuestiónalo.

---

## 6. Cómo trabajar en este repo (reglas para Claude Code)

- **Ediciones quirúrgicas.** Cambia **solo** lo pedido. **No toques lo que funciona.** El frontend son ~40 módulos en `frontend/src/` (más el monolito `index.html` que aún vive en producción): **edita la zona exacta con reemplazos puntuales; NUNCA reescribas un archivo entero.**
- **Respeta los tres mecanismos de intercomunicación, y córrelos por su compuerta.** Un evento de UI se cablea con `data-accion` + `registrarAcciones` — **jamás `on*=` inline** (la CSP lo mata en silencio). Una dependencia hacia arriba (módulo temprano → tardío) va por `gancho`/`define`, **no** por `window`. Un símbolo cross-módulo se **importa**. **Antes de commitear cambios de frontend, corre `npm run gate`** (cero `on*=` ejecutables · cero identificadores libres): es la red que caza la clase de bug que ni `node --check` ni el build ven porque solo detona en runtime. Contexto en [ARQUITECTURA.md §2](ARQUITECTURA.md).
- **Features grandes, pasos chicos.** Una tarea grande (integrar un flujo o módulo nuevo, por ejemplo) es un objetivo **válido y bienvenido**. Lo que nunca se hace es ejecutarla en un **solo bloque imposible de revisar**. Ante una tarea grande: primero propón un **plan** que la descomponga en pasos chicos y revisables (Plan Mode), espera la aprobación del plan, y ejecútala **paso a paso**, commiteando cada uno. Lo que debe ser chico es **cada cambio que se revisa**, no la feature.
- **Operación en solitario · ramas + prueba en staging.** El proyecto lo lleva Agustín solo (producto, dominio y técnica). No hay capa de revisión externa: **Agustín aprueba y arbitra todo**. Se mantiene la disciplina: **features grandes o arriesgadas van siempre en rama dedicada**, nunca directo en `main`; se prueban completas (en staging) y se fusionan solo cuando funcionan. *Para cambios menores y de bajo riesgo, `main` directo es aceptable — el rigor de la rama no es sagrado para lo trivial.*
- **Cambios de base de datos: «en código», repo primero (Orden A).** Todo cambio de BD es un **archivo de migración** en `supabase/migrations/`. Secuencia canónica única: **migración en una rama → prueba (preview branch; el *required check* impide mergear si la migración falla) → merge a `main` → la integración de Branching de Supabase aplica la migración a producción AL MERGEAR** (*merge = deploy*). **No** se corre `supabase db push` manual a producción (lo aplica el merge; hacerlo a mano la duplica). **Nunca** se toca producción directo por el conector MCP ni por el editor SQL: eso desincroniza la base respecto del código (fue la causa del incidente del 17-jun; el «Orden B», prod-primero, quedó descartado). El conector MCP de Supabase es solo para **inspección de lectura** y pruebas en transacción revertida (`BEGIN … ROLLBACK`) — la excepción es aplicar migraciones a **staging** (proyecto `jovroab…`, datos desechables) por `apply_migration`, que es la forma prevista de probar el cambio antes de prod. *(Detalle: ADR-023 · Arquitectura §2.2 · Roadmap §5.1. Reglas: **R1** merge = deploy; **R2** la excepción «solo/rápido» relaja la revisión, nunca el orden, y solo para migraciones aditivas/reversibles que no toquen RLS, policies, auth, aislamiento de tenant, ni drops/renames/cambios de tipo/backfills; **R3** no se salta la prueba en staging.)*
  - **R4 · staging y producción JAMÁS divergen (crítico).** `main` = **producción** (`zplcget…`); la base de **staging** (`jovroab…`) es solo el banco de pruebas. Toda migración que se aplique a staging DEBE existir como **archivo en `supabase/migrations/`** y quedar **encaminada a `main`**. Aplicar una migración a staging y **no** llevarla a `main` desincroniza los dos esquemas — y eso ES un incidente (ya pasó: durante la depuración se mergeaba a staging por ser la base en uso, y prod se fue quedando atrás). Regla operativa: **cada migración aplicada a staging es una «pendiente de prod» hasta que se mergea a `main`**; se mantiene esa lista (ver `docs/etapa4-qa/_VUELTA-EN-CURSO.md` y las notas de memoria) y un cambio de BD **no se da por cerrado** hasta que staging y prod tienen el **mismo set de migraciones**. Antes de terminar cualquier trabajo de BD, verificar que ambos entornos queden alineados. Si por el flujo (p. ej. Etapa 4) el merge a `main` va después, la pendiente queda **anotada y visible**, nunca implícita.
- **Explora antes de editar.** Primero encuentra y explica la zona/función relevante; recién después modifica. Usa **Plan Mode** para cualquier cambio no trivial: propón el plan, espera aprobación, luego ejecuta.
- **Muestra el diff (técnico) + explícalo con peras y manzanas (obligatorio).** El diff es el registro técnico exacto, y está bien que sea técnico. Pero **Agustín no es programador** — es amateur, no domina la nomenclatura. Por eso, junto al diff, SIEMPRE incluye una explicación en lenguaje simple, sin jerga, que cubra: **(a) qué se hizo**, en términos de comportamiento y no de código; **(b) dónde se hizo**, qué función o parte de la app, y sobre todo **qué pantalla o flujo del usuario afecta**; y **(c) por qué**. Si tienes que usar un término técnico, **defínelo la primera vez**, como a un principiante. La explicación clara no es un extra: sin ella, Agustín no puede revisar ni aprobar.
- **No tomas decisiones de arquitectura ni de producto.** Esas son de los chats expertos (BD, permisos, legal…) y de Agustín. Si una tarea requiere esa decisión, **detente y pregunta** en vez de improvisar.
- **Commits frecuentes.** Antes de una tanda de cambios, commit. Si quedó bien, commit. Mensajes claros (son el changelog del código).
- **Idioma:** todo en **español chileno** — código comentado, mensajes de UI, mensajes de commit.

## 7. Convenciones de marca (para PDFs / entregables visuales)

- Tipografías: **Playfair Display** (títulos), **Oswald** (destacados/labels), **Montserrat** (cuerpo).
- Colores: `#121214` (negro), `#343436` (gris oscuro), `#A71E26` (rojo institucional), `#EAE8E1` (base neutra).

## 8. Estado actual y deuda técnica conocida

(Lista móvil — confirmar contra el estado real antes de actuar. **Producción:** monolito en `origin/main`. **Staging (`etapa4-integracion`):** cliente modular V11.14.0, **Desacople D0-D4 + FASE HF cerrados**. Base: **14 migraciones**, 72 tablas, todas con RLS.)

- **Desacople del frontend — COMPLETO en staging, NO reabrir:** D0 (fixes multi-org: reset de vista, época `_ORG_EPOCA`, rescate de guardado) · D1 (imports ESM reales) · D2 (delegación de eventos, cero `on*=`) · D3 (estado con dueños + **CSP `script-src` sin `unsafe-inline`**) · D4 (`window` 962→73) · **FASE HF** (4 bugs de regresión del propio desacople reparados + 2 compuertas `npm run gate`). Registro completo: [ARQUITECTURA.md](ARQUITECTURA.md). **Pendiente: el corte a producción (Lote 4).**
- **Deuda priorizada del informe de arquitectura (aún abierta):** **P1 seguridad** — (a) el soft-delete de proyectos desde el cliente (`kanban.js`, UPDATE de `deleted_at`) **elude el permiso `eliminar_proyecto`** en RLS; debe pasar por la RPC `eliminar_proyecto`/`restaurar_proyecto`. (b) El aislamiento de `contacts` frente a usuarios **externos** es convención, no policy (ninguna política mira `memberships.tipo`). **P2** — sin tests/lint/CI reales (solo `npm run gate` a mano); promesas async sin `.catch` global; changelog de ~1.230 líneas viajando dentro de `index.html`; 11 guardas `typeof X` que dependen de bridges `window` residuales.
- **Gate A — CERRADO:** Firebase apagado y retirado (V10), Supabase Pro con backups validados, `currentUser()` conectado a la sesión real.
- **Gate B — casi cerrado:** motor de organización activa construido (`_setOrgActiva`). Falta el **RLS real por organización y rol** (reemplazar las políticas `mvp_`) y su **validación con varias organizaciones** (tests de cruce de tenant que deben fallar).
- **Gate C — por delante (crítico antes del beta):** hoy es sobre todo **legal** —los cinco flujos de derechos del titular ya están **construidos en UI**; faltan los **textos aprobados** por abogado (Ley 21.719, deadline 1-dic-2026)— más el header `frame-ancestors` del hosting y el endurecimiento del aislamiento multi-tenant. *(Mapa de seguridad: hub OWASP.)*
- **Ya resuelto — NO reabrir:** refresco vuelve a donde estabas (V11.15.0); `authNivelModulo` **falla cerrado** (V11.15.0); validación de RUT; lectura de IVA/tasas desde `tax_rates` (en `frontend/src/lib/rates.js`); backlog de endurecimiento (REVOKE `anon`, `search_path`, policy `app_config`) entró por migración. *(Excepción deliberada, NO “arreglar”: los guardas de **escritura** del cliente siguen fail-open a propósito — la cerradura real es el RPC `SECURITY DEFINER`.)*
- **Deuda puntual abierta:** normalización de teléfono `+56` en `_perfilGuardar` (hoy guarda en crudo); validación server-side de cuentas bancarias por tipo; mover la generación de IDs (`ctk_`, `emp_`) a server-side; deuda de reportería (RPC `cerrar_proyecto` que congele totales server-side; `reporte_cierre` recalcula desde las líneas, **nunca** confía en `frozen` ni en snapshots).

---

*Borrador 0.3 · No es canónico — es el manual de operación del agente. Se versiona y consolida como el resto. Primate Films / La Hectárea SpA.*
