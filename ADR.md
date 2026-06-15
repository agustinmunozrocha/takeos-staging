# TakeOS — ADR de Backend (Architecture Decision Record)

**Versión:** 1.6
**Fecha:** Junio 2026
**Autor de las decisiones:** Agustín Ignacio Muñoz Rocha · Primate Films / La Hectárea SpA
**Asesoría técnica:** sesión de arquitectura de backend
**Estado del documento:** Borrador alineado al **PRD V3.4** (autoritativo), al **Roadmap Operativo v1.5** y a los **handoffs de BD Expert (V10.7.0–V10.8.0) y Legal**.

> **Autoridad documental.** Donde el PRD y este ADR hablen del mismo tema, **el PRD manda en lo conceptual y de producto; el ADR manda en lo técnico**. El PRD V3.4 es la fuente de verdad de las decisiones; este documento detalla el *cómo* y el *porqué* técnico. El **Roadmap Operativo v1.5** es el tercer documento canónico: define la secuencia de ejecución y el modelo de trabajo entre chats.

---

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

---

## ADR-003 — Autenticación
**Estado:** Aceptada · **Etapa:** MVP

**Contexto.** El prototipo no tenía auth (clave compartida cosmética). El PRD §19 fija **Google (OAuth)** como estándar del rubro. La **V9 implementó email + contraseña** (Supabase Auth) como primer paso.

**Decisión (resuelta).** Autenticación vía **Supabase Auth**, con **Google OAuth como destino confirmado** (Agustín, junio 2026). El email+contraseña actual es **provisional**: se agrega **Google como proveedor** en Supabase Auth (soporta ambos a la vez; es configuración, no rearquitectura). El backend mapea la identidad a un usuario de TakeOS con su rol y membresías. El **token viaja y se verifica en cada request** (stateless). Google dice *quién eres*, no *qué puedes* (eso es ADR-004).

**Vinculación de identidad (identity linking).** El **email es el único criterio** para enlazar una identidad de Supabase con un usuario de TakeOS —no se usa RUT ni teléfono—. Es confiable para el contexto de TakeOS y evita ambigüedades de *matching*.

**Actualización v1.5.** El **puente de `currentUser()` a la sesión real quedó cerrado** junto con el Gate A (Firebase eliminado del cliente desde la V10.0.0): ya no hay selector de "sesión simulada". El trabajo de cliente que queda **no es de autenticación sino de organización activa**: derivar la organización en uso desde la membresía activa del usuario (motor de org activa — ver ADR-013).

**Consecuencias.** Migrar de email+contraseña a Google no rompe nada construido. Con la sesión real conectada, el sistema de tareas/@menciones/responsables ya sabe quién es el usuario.

---

## ADR-004 — Autorización: por perfil y por estado, en el servidor
**Estado:** Aceptada · **Etapa:** MVP (modelo base, Fase B) / SaaS (endurecer y escalar)

**Contexto.** El PRD §07 define el modelo de acceso de TakeOS. Este ADR recoge las implicaciones técnicas de ese modelo. El Handoff de Permisos (aprobado, junio 2026) y el PRD V3.1 §07 son la referencia de producto; este ADR es la referencia técnica.

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

**Corrección de precisión (v1.5) — plazo de notificación de brechas.** La versión anterior decía "72 horas". **La Ley 21.719 NO fija ese plazo:** exige notificar a la Agencia "por los medios más expeditos y **sin dilaciones indebidas**" ante riesgo razonable, y comunicar a los titulares cuando la brecha involucre datos sensibles, de menores de 14 años o de carácter económico/financiero/bancario. Las **72 horas** pertenecen a **otros marcos**: el RGPD europeo y la **Ley 21.663** (Ley Marco de Ciberseguridad), en su reporte a la **ANCI**. No conviene confundirlos. El estándar a usar en TakeOS para la Ley 21.719 es **"sin dilaciones indebidas"**.

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
**Estado:** Aceptada · **Etapa:** Ambas

**Contexto.** El backend corre 24/7 en la nube (Supabase + host del frontend, región cercana). "Producción" no es un evento único: es el acto recurrente y riesgoso de publicar versiones.

**Decisión.** Deployment seguro: **entorno de staging** (copia de producción) para probar antes de publicar, y **rollback** si una versión sale mala. **Observabilidad** (logs, métricas, alertas) para enterarse de fallas antes que el cliente.

**Pendiente (handoff):** definir la **estrategia de entorno de pruebas en Supabase** (¿un proyecto Supabase aparte?) **antes** de que pruebas escriba sobre producción. Servir el HTML desde un dominio real (no `file://`) para no romper auth/persistencia.

**Consecuencias.** Misma lógica que probar migraciones en copia (ADR-009): nunca se prueba sobre producción.

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

**Consecuencias.** El cliente lee y cachea las tasas vigentes al arrancar. Cualquier hardcodeo tributario en el HTML es un **error arquitectónico de severidad alta**. Fix puntual pendiente para el dev: reemplazar `const IVA = 0.19` por la lectura de `tax_rates`.

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

**Consecuencias.** El remitente visible al destinatario es el usuario real de TakeOS que envía (nombre + Reply-To a su correo personal), no un correo genérico del sistema. El contenido de las plantillas (copy) es trabajo de redacción aparte, no de este ADR.

**Aislamiento de plantillas por organización (V3.4) — más allá de notificaciones.** El mismo principio per-organización aplica a **todas las plantillas de generadores y previsualizadores** (cotización, documentos, etc.), en frontend y backend: una plantilla creada por la productora A **no** debe aparecerle a la B. Además, algunas plantillas son **privadas** de una productora y no se ofrecen como ejemplo público (p. ej. la plantilla "Manifiesto", que Primate reserva para sí). Esto habilita el servicio de **generadores de documentos a pedido** descrito en el PRD §24 (la productora envía su plantilla y se adapta a su previsualizador, de forma aislada del resto).

---

## ADR-022 — Aprovisionamiento de organización *(NUEVO)*
**Estado:** Aceptada · `seed_permisos_organizacion` y `provisionar_organizacion` **completos** (junio 2026) · **Etapa:** MVP / multi-tenant

**Contexto.** Crear una productora nueva exige sembrarle los perfiles de permiso y los datos operativos base de forma consistente y repetible.

**Decisión.**
- `seed_permisos_organizacion(p_org_id, p_template_org)`: RPC **SECURITY DEFINER e idempotente**. Copia los **8 perfiles fijos** + la **matriz de 104 permisos** desde una organización template. Probado en rollback: 8 perfiles, 104 filas de matriz, sin residuos.
- `provisionar_organizacion`: RPC **completo** que ensambla el aprovisionamiento de una organización nueva.

**Decisiones de producto (resueltas en la construcción).** El handoff dejó dos preguntas abiertas, hoy zanjadas al completar el RPC: (1) con qué datos operativos arranca una organización nueva (departamentos, funciones, motivos de cancelación), y (2) el gate de plan para crear una productora (`organizations.plan`, default `'free'`). *El detalle exacto de lo decidido debe confirmarlo Agustín para registrarlo aquí con precisión.*

**Consecuencias.** El alta de una organización es un proceso de primera clase (coherente con ADR-009), no una secuencia manual de inserts. Junto con el **motor de organización activa en el cliente** (ADR-013, en desarrollo), habilita operar con múltiples organizaciones.

---

# Parte 2 — Decisiones abiertas (se espera la opinión del desarrollador)

## ADR-A — Acceso del fundador / conflicto de interés competitivo
**Estado:** Abierta · **Crítica para la adopción** · **Etapa:** SaaS *(reflejado en PRD §17)*

**Contexto.** TakeOS es del dueño de una productora y se venderá a la competencia. Para el **MVP no aplica** (Primate usa sus propios datos); es una decisión de **etapa SaaS**.

**Dirección recomendada (a validar).** No-abuso de **cuatro patas**: estructural (mínimo privilegio + break-glass), auditoría (`audit_log`), reputacional, legal (Ley 21.719). Llaves gestionadas por la plataforma (no del cliente: cegar la plataforma mataría el Reporte y el cross-tenant). Evaluar **separación societaria** de TakeOS.

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

- **Backend / frontend / cliente / servidor** — frontend corre en el navegador; backend, en un servidor que controla TakeOS; cliente = navegador; servidor = máquina siempre encendida.
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
- **RBAC / ABAC** — permisos por rol fijo vs. por atributo/estado del recurso. En TakeOS: el "rol fijo" son perfiles asignados via membresía; ABAC aplica al estado del proyecto (ej. Cerrado bloquea edición independientemente del perfil).
- **Optimistic concurrency / sello de versión** — evita que un guardado pise otro comparando una marca de versión.
- **Transacción / atomicidad / rollback** — pasos que ocurren todos o ninguno; rollback deshace si algo falla a mitad.
- **Migración / idempotente** — cambiar la forma de los datos; idempotente = re-ejecutable sin daño.
- **Multi-tenant / `organization_id`** — varios clientes en un sistema; etiqueta que marca a qué productora pertenece cada fila.
- **Object storage / URL firmada** — almacenamiento barato para archivos pesados; enlace temporal y autorizado a un archivo.
- **Staging / deployment / rollback** — copia de producción para probar; acto de publicar una versión; volver a la anterior.
- **Observabilidad / `audit_log`** — ver qué hace el sistema en producción; registro de quién hizo/cambió qué.
- **RPO / RTO** — cuánto dato te resignas a perder / cuánto tiempo puedes estar caído.
- **publishable / secret key** — llave pública (va al frontend, segura solo con RLS) vs. llave secreta (jamás al frontend).
