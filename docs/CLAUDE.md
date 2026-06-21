# CLAUDE.md — TakeOS

> Este archivo son las **instrucciones permanentes** para Claude Code en este repositorio. Vive en la raíz del proyecto; Claude Code lo lee solo al iniciar cada sesión. Es la "biblia de producción" del agente. Mantenerlo corto y de alta señal.
>
> **Versión:** borrador 0.2 · **Mantiene:** Agustín (arbitra) / Redactor (consolida). Cuando suban de versión los canónicos, actualizar las referencias de abajo.
>
> **v0.2 (jun 2026):** alineado a los canónicos vigentes (PRD V3.6 · ADR v1.9 · Roadmap v1.8 · Arquitectura v1.5 · + hub de Seguridad OWASP v1.3). Cambios de fondo: nuevo flujo «BD en código» (Orden A, *merge = deploy* por Branching de Supabase; se retira el `supabase db push` manual a producción), equipo de dos con Juan de la Cuadra (CTO) y trabajo en ramas + PR, modularización del frontend con Vite (en curso, hoy en el repo de staging) y estado de deuda actualizado.

---

## 1. Qué es TakeOS

TakeOS es un **sistema operativo de producción audiovisual**, modelo **proyecto-céntrico**: cada proyecto es la unidad mínima y autónoma (nace, se desarrolla, se cierra y queda bloqueado como fuente histórica). Reemplaza el caos de planillas, mails y WhatsApp con una sola fuente de verdad por proyecto.

Lo construye **Agustín Muñoz Rocha** (Primate Films / La Hectárea SpA), fundador-operador **no-técnico** y **árbitro final** de toda decisión de producto y arquitectura. El software migrará a una sociedad separada como Proveedor SaaS.

## 2. Stack técnico

- **Frontend:** **JavaScript puro** (sin framework), hoy un monolito de ~23.000 líneas. **En producción corre el monolito**: `index.html` vive en la **raíz** del repo y GitHub Pages publica desde ahí (la carpeta `frontend/` de producción solo tiene un `.gitkeep`). **La modularización con Vite está EN CURSO, y vive en el repo de staging**: Etapas 0 y 1 hechas (CSS extraído + un «cimiento» de 12 funciones en `frontend/src/lib/`); el grueso —la **Etapa 2**, los módulos de negocio, ~88% del trabajo— sigue pendiente, y el **corte de producción** a la build de Vite también. Patrón de migración: cada función movida a un módulo se **puentea a `window`** para no romper los `onclick` inline. *No reescribir el monolito de golpe: se extrae un módulo a la vez. Detalle en Arquitectura §3.4 y §7.*
- **Backend:** **Supabase** — PostgreSQL (base), Supabase Auth (identidad), Supabase Storage (archivos), RLS + GRANT (acceso) y **RPCs / Edge Functions para la lógica crítica**.
- **Multi-tenant:** `organization_id` en toda tabla de negocio.

## 3. Documentos canónicos (la autoridad)

La verdad del proyecto vive en tres documentos. **Léelos antes de proponer cambios de fondo.** Si un cambio contradice uno de ellos, **levanta la contradicción, no la resuelvas en silencio.**

- **PRD** (`TakeOS_PRD_V3_6.md`) — qué es TakeOS y por qué. **Manda en producto y dominio.**
- **ADR** (`TakeOS_ADR_Backend_v1_9.md`) — cómo se construye técnicamente y por qué. **Manda en lo técnico.**
- **Roadmap** (`TakeOS_Roadmap_Operativo_v1_8.md`) — en qué orden, cuándo y quién. **Manda en ejecución.**

Ante choque: PRD en producto → ADR en técnica → **Agustín arbitra.**

> **Documentos relacionados (no son del trío de autoridad):**
> - `TakeOS_Arquitectura_y_Flujo_de_Trabajo_v1_5.md` — la **infraestructura** (BD en código, entornos producción/staging, despliegue, modularización del frontend con Vite) y el **flujo de equipo** (Git, ramas, Pull Requests, quién hace qué). Consúltalo para *cómo* se construye y se publica.
> - `TakeOS_Seguridad_OWASP_Top_10_2025_v1_3.md` — **hub de seguridad**: mapea las 10 categorías OWASP 2025 al stack de TakeOS y deja veredicto. Subordinado al PRD (producto) y al ADR (técnica); alimenta el Gate C y el pentest.
>
> Ninguno de estos manda sobre producto/técnica/ejecución (eso sigue siendo PRD/ADR/Roadmap).

---

## 4. Doctrinas de arquitectura que NUNCA se violan

Estas no se negocian. Si una tarea te empuja a romper una, **detente y avisa**.

1. **Nunca confiar en el cliente** (ADR-001/002/017). El frontend es público y manipulable. La lógica crítica corre **server-side**, tratando todo dato entrante como potencialmente falso.
2. **Regla de oro de dónde va la lógica:** si la operación **mueve plata**, **decide permisos sensibles**, o **debe ser atómica** → **server-side (RPC)**. Si es una lectura o un CRUD simple sobre datos del propio tenant → directo con **RLS**.
3. **Autorización en el servidor, por perfil vía membresía** (ADR-004). Los permisos cuelgan del usuario (membresía interno/externo × perfil), **no del rol por proyecto**. Toda escritura sensible se verifica **dentro del RPC** + RLS. El frontend solo refleja; nunca es la autoridad.
4. **Lógica y tasas tributarias SOLO en la tabla `tax_rates`** (ADR-018), nunca hardcodeadas en el cliente. El cliente las **lee** al iniciar sesión. Cambiar una tasa = **insertar fila nueva** con su `vigente_desde`. **Cualquier hardcodeo tributario en el HTML es un error de severidad alta.**
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

- **Ediciones quirúrgicas.** Cambia **solo** lo pedido. **No toques lo que funciona.** El frontend es un HTML de ~25k líneas: **edita la zona exacta con reemplazos puntuales; NUNCA reescribas el archivo entero.**
- **Features grandes, pasos chicos.** Una tarea grande (integrar un flujo o módulo nuevo, por ejemplo) es un objetivo **válido y bienvenido**. Lo que nunca se hace es ejecutarla en un **solo bloque imposible de revisar**. Ante una tarea grande: primero propón un **plan** que la descomponga en pasos chicos y revisables (Plan Mode), espera la aprobación del plan, y ejecútala **paso a paso**, commiteando cada uno. Lo que debe ser chico es **cada cambio que se revisa**, no la feature.
- **Equipo de dos · ramas + Pull Request.** Desde junio 2026 el equipo es Agustín (producto/dominio) y **Juan de la Cuadra (CTO, responde por todo el código)**. El flujo formal es **rama de feature → PR → revisión** (Juan revisa infra/integración; Agustín, producto/dominio) → merge a `main`. **Features grandes o arriesgadas van siempre en rama dedicada**, nunca directo en `main`; se prueban completas (en staging) y se fusionan solo cuando funcionan. *Matiz de Agustín: para cambios menores y de bajo riesgo, `main` directo es aceptable — el flujo de PR no es sagrado para lo trivial.*
- **Cambios de base de datos: «en código», repo primero (Orden A).** Todo cambio de BD es un **archivo de migración** en `supabase/migrations/`. Secuencia canónica única: **migración en una rama → PR + prueba (preview branch; el *required check* impide mergear si la migración falla) → revisión de Juan → merge a `main` → la integración de Branching de Supabase aplica la migración a producción AL MERGEAR** (*merge = deploy*). **No** se corre `supabase db push` manual a producción (lo aplica el merge; hacerlo a mano la duplica). **Nunca** se toca producción directo por el conector MCP ni por el editor SQL: eso desincroniza la base respecto del código (fue la causa del incidente del 17-jun; el «Orden B», prod-primero, quedó descartado). El conector MCP de Supabase es solo para **inspección de lectura** y pruebas en transacción revertida (`BEGIN … ROLLBACK`). *(Detalle: ADR-023 · Arquitectura §2.2 · Roadmap §5.1. Reglas: **R1** merge = deploy; **R2** la excepción «solo/rápido» relaja la revisión, nunca el orden, y solo para migraciones aditivas/reversibles que no toquen RLS, policies, auth, aislamiento de tenant, ni drops/renames/cambios de tipo/backfills; **R3** no se salta la prueba en staging.)*
- **Explora antes de editar.** Primero encuentra y explica la zona/función relevante; recién después modifica. Usa **Plan Mode** para cualquier cambio no trivial: propón el plan, espera aprobación, luego ejecuta.
- **Muestra el diff (técnico) + explícalo con peras y manzanas (obligatorio).** El diff es el registro técnico exacto, y está bien que sea técnico. Pero **Agustín no es programador** — es amateur, no domina la nomenclatura. Por eso, junto al diff, SIEMPRE incluye una explicación en lenguaje simple, sin jerga, que cubra: **(a) qué se hizo**, en términos de comportamiento y no de código; **(b) dónde se hizo**, qué función o parte de la app, y sobre todo **qué pantalla o flujo del usuario afecta**; y **(c) por qué**. Si tienes que usar un término técnico, **defínelo la primera vez**, como a un principiante. La explicación clara no es un extra: sin ella, Agustín no puede revisar ni aprobar.
- **No tomas decisiones de arquitectura ni de producto.** Esas son de los chats expertos (BD, permisos, legal…) y de Agustín. Si una tarea requiere esa decisión, **detente y pregunta** en vez de improvisar.
- **Commits frecuentes.** Antes de una tanda de cambios, commit. Si quedó bien, commit. Mensajes claros (son el changelog del código).
- **Idioma:** todo en **español chileno** — código comentado, mensajes de UI, mensajes de commit.

## 7. Convenciones de marca (para PDFs / entregables visuales)

- Tipografías: **Playfair Display** (títulos), **Oswald** (destacados/labels), **Montserrat** (cuerpo).
- Colores: `#121214` (negro), `#343436` (gris oscuro), `#A71E26` (rojo institucional), `#EAE8E1` (base neutra).

## 8. Estado actual y deuda técnica conocida

(Lista móvil — confirmar contra el estado real antes de actuar. Build de producción: **V11.16.0** (monolito). Base: **7 migraciones**, 77 tablas, todas con RLS.)

- **Gate A — CERRADO:** Firebase apagado y retirado (V10), Supabase Pro con backups validados, `currentUser()` conectado a la sesión real.
- **Gate B — casi cerrado:** motor de organización activa construido (`_setOrgActiva`). Falta el **RLS real por organización y rol** (reemplazar las políticas `mvp_`) y su **validación con varias organizaciones** (tests de cruce de tenant que deben fallar).
- **Gate C — por delante (crítico antes del beta):** hoy es sobre todo **legal** —los cinco flujos de derechos del titular ya están **construidos en UI**; faltan los **textos aprobados** por abogado (Ley 21.719, deadline 1-dic-2026)— más el header `frame-ancestors` del hosting y el endurecimiento del aislamiento multi-tenant. *(Mapa de seguridad: hub OWASP.)*
- **Ya resuelto — NO reabrir:** refresco vuelve a donde estabas (V11.15.0); `authNivelModulo` **falla cerrado** (V11.15.0); validación de RUT; lectura de IVA/tasas desde `tax_rates` (en `frontend/src/lib/rates.js`); backlog de endurecimiento (REVOKE `anon`, `search_path`, policy `app_config`) entró por migración. *(Excepción deliberada, NO “arreglar”: los guardas de **escritura** del cliente siguen fail-open a propósito — la cerradura real es el RPC `SECURITY DEFINER`.)*
- **Deuda puntual abierta:** normalización de teléfono `+56` en `_perfilGuardar` (hoy guarda en crudo); validación server-side de cuentas bancarias por tipo; mover la generación de IDs (`ctk_`, `emp_`) a server-side; deuda de reportería (RPC `cerrar_proyecto` que congele totales server-side; `reporte_cierre` recalcula desde las líneas, **nunca** confía en `frozen` ni en snapshots).

---

*Borrador 0.1 · No es canónico — es el manual de operación del agente. Se versiona y consolida como el resto. Primate Films / La Hectárea SpA.*
