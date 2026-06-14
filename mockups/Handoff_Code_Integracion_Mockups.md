# Handoff — Dev Mockups Flujos → **Claude Code**
## Integración de tres mockups de flujo al TakeOS real

**De:** chat **Dev Mockups Flujos**
**Para:** **Claude Code** (repo TakeOS)
**Producto / decisiones / árbitro:** Agustín Muñoz Rocha
**Fecha:** 13 de junio de 2026
**Reemplaza:** el handoff anterior de integración (versión previa al cambio a Claude Code).

> Este handoff está escrito para tu forma de trabajar (CLAUDE.md): cada unidad de trabajo te dice **dónde** tocar, **qué** cambiar, **qué límites** tiene y **cómo se mide el éxito**. No es una orden de "haz las 16 cosas ahora": es la feature ya descompuesta para que la lleves a **Plan Mode**.

---

## 0 · Qué es esto

Tres **mockups autónomos** (un HTML cada uno, JS vanilla, tokens reales de TakeOS) que prototipan tres flujos de punta a punta. **Son mockups: fijan el flujo y la UX, no son código de producción.** Ninguno llama a backend; todo se simula en memoria. Tu trabajo es **integrarlos al monolito real**, cableando cada paso a su pieza real y respetando las doctrinas del repo.

**Archivos que Agustín te adjunta junto a este handoff:**
1. `TakeOS_Mockup_Creacion_Productora.html`
2. `TakeOS_Mockup_Derechos_Titular.html`
3. `TakeOS_Mockup_Panel_Personal.html`

Cada mockup trae un panel **"ⓘ Notas de integración"** (botón arriba a la derecha) con las costuras, y comentarios en su código. Este handoff las consolida.

---

## 1 · Cómo abordar esto (tu método, CLAUDE.md §6)

- **Es una feature grande → Plan Mode + rama dedicada.** No la ejecutes en un bloque. Crea una **rama** (`feat/integracion-flujos` o similar), propón un **Plan Mode** que la descomponga (puedes partir de las unidades de §6), espera aprobación de Agustín y ejecútala **paso a paso, commiteando cada uno**.
- **Explora antes de editar.** Para cada unidad, primero ubica y explica la función/zona exacta (anclajes en §5), recién después modifica.
- **Ediciones quirúrgicas.** Cambia solo lo de la unidad. **No toques lo que funciona. Nunca reescribas el HTML completo.** Reemplazos puntuales por búsqueda de string, no por número de línea (el archivo se desplaza).
- **Diff + explicación con peras y manzanas (obligatorio).** Agustín no es programador. Junto al diff, en cada paso, explica en lenguaje simple: **(a) qué se hizo** en términos de comportamiento, **(b) dónde** y **qué pantalla/flujo del usuario afecta**, **(c) por qué**. Define cada término técnico la primera vez.
- **No decides arquitectura ni producto.** Si una unidad te empuja a eso, **detente y pregunta** (ver §4). No improvises.
- **Idioma:** español chileno en todo — comentarios, mensajes de UI, mensajes de commit.

---

## 2 · Estética y consistencia (nota de Agustín)

- Son mockups: tómalos como **forma del flujo y referencia de UX**, no como diseño cerrado.
- **El flujo de crear productora quedó con una estética muy buena. Agustín la aprueba y sirve de referencia del conjunto.**
- **El panel personal y los derechos del titular pueden variar un poco la estética si tú lo determinas.** Están bien, pero Agustín nota que esos dos se ven **ligeramente distintos** entre sí y respecto del primero. No es reproche; es una nota para que la tengas presente.
- **Innegociable: que los tres se vean como un solo producto.**
- **Aclaración técnica:** los tres mockups ya usan los **tokens reales del build** (V11.12.0/V11.13.0). La diferencia que Agustín percibe está a nivel de **componentes/layout**, no de paleta. Al integrar, **engancha todo a los componentes reales del monolito** (los `.pf-sec`, botones, inputs y overlays que ya existen). Cuando un layout difiera entre mockups, el de creación manda.
- **Ojo:** las tipografías y colores de **CLAUDE.md §7 (`#A71E26`, Playfair/Oswald/Montserrat) son para PDFs/entregables visuales, no para esta UI**. Para las pantallas del flujo, la referencia es el tema vivo de la app (tokens oscuros del build). No "corrijas" la UI hacia la paleta de PDF.

---

## 3 · LÍMITES globales — doctrinas que acotan TODA unidad (CLAUDE.md §4)

Estas valen para cada unidad de §6. Si una te empuja a romperlas, **detente y avisa**:

1. **Nunca confiar en el cliente.** La lógica crítica corre server-side. Toda validación que pongas en el frontend es **solo UX**; el servidor revalida y manda.
2. **Regla de oro de dónde va la lógica:** si mueve plata, decide permisos sensibles o debe ser atómica → **RPC server-side**. Si es lectura o CRUD simple del propio tenant → directo con **RLS**.
3. **Autorización en el servidor, por perfil vía membresía** (interno/externo × perfil), no por rol de proyecto. El frontend solo **refleja** permisos; nunca es la autoridad.
4. **Tasas tributarias SOLO desde `tax_rates`** (ADR-018). El cliente las **lee** al iniciar sesión. **Cualquier hardcodeo tributario es error de severidad alta.** (Aplica directo a la pantalla de pago — ver Unidad A5.)
5. **Modelo relacional, fuente única de verdad.** Relaciones por referencia, no por copia. **Soft delete** + auditoría. Si el trabajo crea tablas nuevas (es del BD Expert, no tuyo): **GRANT al rol `authenticated` después de cada tabla**, o da 403.
6. **Versionar en vez de eliminar; la última manda.**
7. **El backend recalcula los valores derivados** (totales, retenciones, IVA). El frontend no "arregla" datos: los muestra y deja que el servidor recalcule y rechace lo inválido.

---

## 4 · Decisiones que NO son tuyas → detente y pregunta

No improvises ninguna de estas. Pertenecen a Agustín / chats expertos:

- **Borrado de cuenta: anonimizar vs. hard delete**, y duración (o existencia) del período de gracia. (Unidad B4.)
- **Verificación de edad: si aplica al titular y en qué momento.** (Unidad B5.)
- **Modelo server-side de los flujos de derechos** (RPC de revocación, de borrado, de exportación; registro versionado del consentimiento de cookies). Eso es del **BD Expert**; tú construyes la UI contra un contrato y lo dejas marcado. (Unidades B2/B3/B4/B6.)
- **Texto legal definitivo** de T&C y consentimiento (instrumentos en borrador, sin aprobar). Placeholder por ahora.
- **Proveedor/método de pago.** Pendiente. Placeholder tras feature flag.

---

## 5 · Anclajes reales en el HTML (para el "dónde")

Confirmados por búsqueda en el build. **Las líneas son aproximadas: ubica por nombre, no por número** (el archivo se desplaza al editar).

| Ancla (función / símbolo) | Aprox. | Para qué la usas |
|---|---|---|
| `renderEspacioUsuario` | ~20772 | Panel personal (home cross-tenant). Frente C. |
| `_espInyectarCtaProductora` | ~22619 | Cartel "¿Tienes una productora?" dentro del panel. Unidad A6. |
| `_TIENE_EMPRESA` | ~6501 | Bandera: con empresa → Control Room. Unidad A5/C2. |
| `navigateToControlRoom` | ~6498 | Navegación al Control Room. Unidades A5, C2, C3. |
| `authNivel` | ~9189 | Permisos en cliente. **Deuda: retorna `'E'` sin acceso; debe retornar `'none'` (fail-closed)** — CLAUDE.md §8. Relevante a C2. |
| `currentUser` | ~58 | Sesión real. |
| `consentir_invitacion` | ~14340 | **Ya existe en el cliente.** RPC de consentimiento de invitación. Unidad C4. |
| `requisitos_faltantes` | ~22479 | Patrón de datos faltantes (`'perfil'`/`'banca'`). Unidad A2, notificaciones. |
| `tax_rates` / `let IVA = 0.19` | ~5779 / ~5784 | Tabla de tasas + el IVA. **Usa el IVA cargado, NO re-hardcodees.** Unidad A5. |
| `provisionar_organizacion` · `seed_permisos_organizacion` | — | **Existen en la BD, pero NO hay llamada en el cliente todavía.** El binding `supabase.rpc(...)` lo creas tú. Unidad A4-creación. |

---

## 6 · Frentes y unidades de trabajo

**Orden sugerido:** primero los frentes cuyo backend ya existe (**A** y **C**); el frente **B** construye UI contra contrato y alimenta el handoff al BD Expert. Cada unidad trae **dependencia de backend**: `EXISTE` (puedes cerrarla), `PENDIENTE` (UI + contrato, no funciona end-to-end aún), `DECISIÓN` (detente y pregunta).

---

### FRENTE A — Crear productora (estética aprobada; úsala de referencia)

**Pantallas, en orden:** landing/planes → cuenta mínima → facturación → términos → pago → productora creada → Control Room + tour. Dos entradas: landing (persona nueva) y panel personal (persona ya existe → salta cuenta).

**Unidad A1 — Pantallas de captura + estado del flujo**
- **DÓNDE:** componente nuevo del flujo de creación (overlay full-screen al estilo de los demás del monolito). Se invoca desde el click en un plan y desde A6.
- **QUÉ:** llevar las pantallas planes → cuenta → facturación → términos a la app, con el objeto de estado que acumula los datos. **Rama Gratis: solo pide nombre visible, sin facturación y sin pago.** Planes de pago: nombre visible, razón social, RUT, giro, dirección.
- **LÍMITES:** UI y estado; sin backend nuevo en esta unidad. No tocar el flujo de login existente más allá de engancharte a `currentUser`.
- **ÉXITO:** se recorre el flujo completo en la app hasta antes de "crear"; Gratis salta facturación y pago; el plan elegido se arrastra y se ve en cada pantalla; copy en español chileno.
- **Dependencia:** EXISTE (no requiere backend nuevo).

**Unidad A2 — Validaciones de UX + cuenta mínima**
- **DÓNDE:** los inputs de A1; la pantalla de cuenta engancha con el onboarding de perfil y `requisitos_faltantes` (~22479).
- **QUÉ:** validar RUT de empresa (**módulo 11 + formateo automático**), mail (regex) y obligatorios. Las funciones `rutValido`/`dvRut`/`formatearRut`/`mailValido` del mockup están probadas y son portables 1:1. "Continuar con Google" = OAuth existente.
- **LÍMITES:** **estas validaciones son solo UX** (doctrina 1/7): el servidor revalida el RUT y los datos al crear. No bloquees por algo que el servidor no vaya a revalidar.
- **ÉXITO:** RUT inválido marca error y no avanza; RUT válido se formatea; mail inválido marca error; campos vacíos marcan error; con Google se prefila y avanza.
- **Dependencia:** EXISTE (OAuth y onboarding ya existen).

**Unidad A3 — Términos y condiciones**
- **DÓNDE:** pantalla de términos del flujo A1.
- **QUÉ:** mostrar el texto (placeholder provisional) en caja scrolleable + checkbox obligatorio. En planes de pago, es el último paso antes del pago; en Gratis, el último antes de crear.
- **LÍMITES:** **texto legal v0/provisional, NO definitivo.** No redactes cláusulas reales; usa el placeholder. Legal define el definitivo.
- **ÉXITO:** no se avanza sin marcar el checkbox; el botón cambia ("Continuar al pago" vs "Activar plan gratis") según el plan.
- **Dependencia:** PENDIENTE (texto legal en borrador).

**Unidad A4 — Crear la productora (cableado a RPC)**
- **DÓNDE:** acción "crear" al final del flujo; **agregar la llamada `supabase.rpc('provisionar_organizacion', …)` y `seed_permisos_organizacion`** (hoy no existe ninguna llamada cliente).
- **QUÉ:** al confirmar, llamar al RPC que crea la organización; el creador queda **Administrador interno**; sembrar los 8 perfiles + matriz de permisos.
- **LÍMITES:** la creación **es server-side y atómica** (doctrina 2). El cliente solo envía datos y refleja el resultado; no derives IDs ni permisos en el cliente. (Ojo deuda §8: mover generación de IDs a server-side aplica aquí.) **Confirma la firma vigente del RPC con el BD Expert antes de cablear.**
- **ÉXITO:** una creación exitosa devuelve la organización y deja al creador como Administrador interno; un error muestra mensaje claro y accionable (doctrina de visibilidad de errores), sin dejar estado a medias.
- **Dependencia:** EXISTE en BD; falta el binding cliente (lo creas tú). **Confirmar firma.**

**Unidad A5 — Pago (placeholder tras feature flag)**
- **DÓNDE:** pantalla de pago del flujo (solo planes de pago).
- **QUÉ:** mostrar el resumen (plan, Early Bird −50%, IVA, total) y un placeholder de pago **detrás de un feature flag apagado**, ya que el sistema de pago no existe. **El IVA se lee del valor cargado desde `tax_rates`** (~5779/5784), **no se hardcodea** (el mockup lo hardcodea solo para la demo).
- **LÍMITES:** doctrina 4 (tributario solo desde `tax_rates`) y 7 (el total lo recalcula el servidor cuando exista pago). No captures datos de tarjeta. No actives el flag hasta que exista proveedor.
- **ÉXITO:** con el flag apagado, Gratis crea sin pasar por pago y los planes de pago muestran el placeholder sin procesar nada; el IVA mostrado proviene de `tax_rates`, no de una constante en el HTML.
- **Dependencia:** PENDIENTE (sistema de pago).

**Unidad A6 — Entrar a la productora + tour, y la segunda entrada**
- **DÓNDE:** tras crear, encender `_TIENE_EMPRESA` (~6501) y entrar vía `navigateToControlRoom` (~6498). Segunda entrada del flujo: `_espInyectarCtaProductora` (~22619) dentro de `renderEspacioUsuario` (~20772).
- **QUÉ:** al crear, la persona pasa a tener empresa y entra al Control Room de SU productora; mostrar el tour inicial (~5 pasos, mundo de ejemplo **El Señor de los Anillos**). El cartel "¿Tienes una productora?" lanza el mismo flujo desde la app (saltando la pantalla de cuenta).
- **LÍMITES:** invariante **sin empresa, jamás Control Room**. El tour del mockup es una representación; aquí va sobre las pantallas reales.
- **ÉXITO:** crear lleva al Control Room real con `_TIENE_EMPRESA` encendida; el tour corre; el cartel del panel lanza el flujo desde la pantalla correcta.
- **Dependencia:** EXISTE (las funciones de navegación y el cartel ya existen).

---

### FRENTE C — Panel personal y navegación multi-org (backend mayormente existe)

**Estructura del panel:** (1) tus productoras (interno) → Control Room; (2) invitaciones pendientes; (3) proyectos donde participas (externo) → solo el proyecto; (4) CTA crear productora. Toggle en el mockup para ver el estado "con productora" y "solo externo / nuevo".

**Unidad C1 — Estructura del panel personal**
- **DÓNDE:** `renderEspacioUsuario` (~20772).
- **QUÉ:** estructurar el home en las tres secciones (internas arriba, invitaciones, externos abajo agrupados por productora) + CTA. Manejar el estado "sin productora propia" (el CTA pasa a primer plano).
- **LÍMITES:** la lista sale de las **membresías reales del usuario** (no inventes datos). Internas arriba, externas abajo: estructura de dos niveles (decisión de Agustín; ver nota más abajo).
- **ÉXITO:** el panel muestra las productoras internas con botón a Control Room, las externas con sus proyectos, y el CTA; sin productora propia, no aparece la sección "tus productoras" y el CTA domina.
- **Dependencia:** EXISTE (membresías + `renderEspacioUsuario`).

**Unidad C2 — Regla de navegación interno → Control Room / externo → solo proyecto**
- **DÓNDE:** los handlers de las secciones del panel; `navigateToControlRoom` (~6498) para internas; vista de proyecto para externas.
- **QUÉ:** interno entra al Control Room; **externo entra SOLO al proyecto** (sin Panel de Empresa, sin finanzas, sin los demás proyectos de esa productora). Mostrar el banner de acceso restringido en la vista externa.
- **LÍMITES (clave):** la UI **refleja** la regla, pero **la barrera real es server-side (RLS + perfil)** — doctrina 1/3. No confíes en que ocultar en el frontend basta. Relacionado: la deuda de `authNivel` fail-open (`'E'`→`'none'`, §8) debe coordinarse para que el servidor imponga la regla. Esa regla en la base es parte del handoff al BD Expert.
- **ÉXITO:** desde el panel, click en interna abre el Control Room; click en proyecto externo abre solo ese proyecto; no existe ninguna ruta de UI que lleve a un externo al Control Room ajeno.
- **Dependencia:** EXISTE en UI; **la imposición real depende de RLS** (coordinar con BD).

**Unidad C3 — Selector de espacios**
- **DÓNDE:** barra superior de las vistas de destino (Control Room y proyecto).
- **QUÉ:** selector "cambiar de espacio" que cambia el contexto de organización activa. **Para productoras donde eres externo, ofrece solo proyectos, nunca un "Control Room".**
- **LÍMITES:** mismo límite que C2: la regla vive en el servidor; el selector no debe poder construir una ruta a un Control Room ajeno.
- **ÉXITO:** el selector lista panel personal + tu productora (Control Room) + proyectos externos; jamás un Control Room ajeno; cambiar de espacio cambia el `organization_id` activo del contexto.
- **Dependencia:** EXISTE (motor de organización activa, V10.9.0).

**Unidad C4 — Invitaciones pendientes → aceptar = consentir**
- **DÓNDE:** sección de invitaciones del panel; engancha con `consentir_invitacion` (~14340, ya en el cliente).
- **QUÉ:** aceptar una invitación llama a `consentir_invitacion` (registra consentimiento, snapshot de perfil → contacto, membresía pasa a `activo`); rechazar la descarta. Al aceptar, el proyecto aparece en "proyectos donde participas".
- **LÍMITES:** el consentimiento y la transición de estado son **server-side** (doctrina 2/3). El RPC existe pero su finalización depende del texto legal del instrumento de consentimiento (en borrador) — confírmalo.
- **ÉXITO:** aceptar mueve la invitación de "pendiente" a un proyecto externo listado; rechazar la elimina; el cambio se refleja sin recargar.
- **Dependencia:** EXISTE el RPC; PENDIENTE el texto legal del consentimiento.

---

### FRENTE B — Derechos del titular (UI + contrato; backend es del BD Expert)

**Estructura:** un **Centro de privacidad y datos** dentro del panel personal, con cinco flujos + banner de cookies. *(Estética puede variar a tu criterio; mantén consistencia.)* **Todo este frente toca datos sensibles y operaciones que deben ser server-side (doctrina 2): tú construyes la UI contra un contrato claro y lo dejas marcado para el BD Expert.**

**Unidad B1 — Hub del centro de privacidad + ruteo**
- **DÓNDE:** sección nueva dentro del panel personal (`renderEspacioUsuario`).
- **QUÉ:** hub con las cinco tarjetas (descargar datos, productoras con acceso, eliminar cuenta, verificación de edad, cookies) y el ruteo a cada flujo.
- **LÍMITES:** estos derechos **viven en el panel personal** (identidad global por usuario), no dentro de una productora.
- **ÉXITO:** el hub aparece en el panel y cada tarjeta abre su flujo.
- **Dependencia:** EXISTE (solo UI/ruteo).

**Unidad B2 — Exportación / portabilidad**
- **DÓNDE:** flujo "descargar mis datos".
- **QUÉ:** UI que solicita la copia y descarga el archivo portable (JSON/CSV) que entregue el backend; la solicitud queda en `audit_log`.
- **LÍMITES:** la generación del export es **server-side** (no lo armes en el cliente). Define el contrato (qué incluye, formato, firma) y déjalo para el BD Expert.
- **ÉXITO:** la UI dispara la solicitud y, cuando exista el endpoint, descarga el archivo; sin endpoint, queda el punto de integración marcado.
- **Dependencia:** PENDIENTE (endpoint de export → BD Expert).

**Unidad B3 — Revocación de consentimiento**
- **DÓNDE:** flujo "productoras con acceso a mis datos".
- **QUÉ:** listar las productoras que tienen copia por consentimiento; revocar marca `revoked_at` en `data_consents` (ADR-020, append-only, **no se borra**), la membresía pasa a `inactivo`, la productora pierde acceso. **La UI debe decir la consecuencia** (la productora conserva su copia como evidencia; si participas en un proyecto activo, pierdes acceso).
- **LÍMITES:** la revocación es **server-side**; **el RPC de revocación no existe aún** (espeja `consentir_invitacion`). Construye la UI contra ese contrato y déjalo para el BD Expert. No borres el registro de consentimiento.
- **ÉXITO:** la UI lista los consentimientos activos y, cuando exista el RPC, revocar mueve la fila a "revocado" y corta el acceso; sin RPC, queda el punto marcado.
- **Dependencia:** PENDIENTE (RPC de revocación → BD Expert).

**Unidad B4 — Borrado / supresión de cuenta**
- **DÓNDE:** flujo "eliminar mi cuenta".
- **QUÉ:** **guard de único administrador** (si la persona es único admin de una productora, bloquear hasta transferir la administración o eliminar la productora); luego confirmación con fricción proporcional (checkbox + escribir "ELIMINAR"). La UI explica que se conserva evidencia legal datada/anonimizada.
- **LÍMITES:** **DECISIÓN pendiente: anonimizar vs. hard delete, y período de gracia → detente y pregunta** (§4). Respeta la invariante "productora nunca sin administrador". La operación es server-side.
- **ÉXITO:** sin resolver el guard, no se puede eliminar; resuelto, la confirmación exige los dos pasos; el resultado refleja la política que Agustín/legal definan (no la inventes).
- **Dependencia:** DECISIÓN (anonimizar vs hard delete) + PENDIENTE (RPC de borrado → BD Expert).

**Unidad B5 — Verificación de edad (si aplica)**
- **DÓNDE:** flujo "verificación de edad".
- **QUÉ:** UI mínima (fecha de nacimiento + declaración de mayoría de edad), con bandera visible de "si aplica".
- **LÍMITES:** **DECISIÓN pendiente: si aplica al titular y en qué momento → detente y pregunta** (§4). No lo conviertas en gate obligatorio sin esa decisión.
- **ÉXITO:** la UI existe y queda explícitamente marcada como condicional; no bloquea nada hasta que se decida que aplica.
- **Dependencia:** DECISIÓN.

**Unidad B6 — Cookies y analítica**
- **DÓNDE:** banner de primera visita + flujo de preferencias.
- **QUÉ:** banner (aceptar todas / solo esenciales / configurar) + panel de preferencias (esenciales fijas, analítica y marketing opcionales).
- **LÍMITES:** el consentimiento de cookies se **registra versionado en el servidor** (no en localStorage; los artifacts de TakeOS no usan storage del navegador). Define el contrato y déjalo para el BD Expert.
- **ÉXITO:** el banner aparece en primera visita y deja de aparecer tras decidir; las preferencias se guardan (contra el endpoint cuando exista).
- **Dependencia:** PENDIENTE (registro de consentimiento de cookies → BD Expert).

> **Nota (no bloqueante) sobre C1:** el panel sigue la estructura de **dos niveles** del consolidado (internas arriba, externas abajo). El PRD lo llama "Control Room personal cross-tenant", que también podría leerse como lista plana. Agustín eligió los dos niveles; si más adelante quiere la vista plana, es un cambio chico. No lo decidas tú.

---

## 7 · Disciplina de validación del monolito (CLAUDE.md §6)

- **Edición por búsqueda de string (reemplazos puntuales), nunca por número de línea.** Nunca reescribir el archivo completo.
- **Antes de cada entrega:** extraer el JS inline → `node --check` cada script → contar llaves del CSS **solo del primer bloque `<style>`** (el segundo `<style>` vive dentro de strings JS para los builders de PDF) → pruebas funcionales / round-trip.
- **No uses `eval` / `new Function` dinámico** (la CSP lo bloquea; fue el origen del bug de onboarding que se saltaba el formulario). Si un render falla, que muestre formulario vacío, no que se salte.
- **Commits frecuentes** con mensajes claros (son el changelog del código).

---

## 8 · Lo que TÚ (Code) entregas después

1. **Un handoff claro y separado para el BD Expert**, una vez mapeado el cableado a base de datos. **No lo consolides con nada del frontend.** Debe dejar explícito, como mínimo:
   - RPCs faltantes o a ajustar: **revocación de consentimiento** (escribe `revoked_at` en `data_consents`), **borrado/supresión de cuenta** (según decisión anonimizar vs hard delete), **exportación** de datos, **registro versionado del consentimiento de cookies**.
   - Transiciones de la **máquina de estados de membresía** (`pendiente`→`activo`→`inactivo`) que tocan estos flujos y desde dónde se disparan.
   - Qué necesita el **contexto de organización activa** y el filtrado por `organization_id` en **RLS** para que la regla interno/externo (Unidades C2/C3) se imponga en la base, no solo en UI. Coordinar con el fix de `authNivel` fail-open (§8 de CLAUDE.md).
   - La decisión de **anonimizar vs. hard delete** para que el BD Expert modele en consecuencia.
   - Si el trabajo crea tablas nuevas: recordar **GRANT al rol `authenticated`** (doctrina 5).
   - Confirmar firmas vigentes de `provisionar_organizacion` y `seed_permisos_organizacion`.
2. **Al sacar la versión integrada**, sigue el checklist de siempre: **CHANGELOG.md** formal como archivo descargable (plantilla PRD V3 §24) + **recordatorio de despliegue** a GitHub Pages (renombrar a `index.html`, subir reemplazando, commit). No lo omitas.

---

## 9 · Dependencias y decisiones abiertas

- **Sistema de pago:** pendiente. Prerrequisito para que el flujo de creación salga en vivo (Unidad A5).
- **Textos legales:** dos instrumentos en borrador (`terminos-cuenta-…-v0.1-borrador`, `consentimiento-incorporacion-…-v0.1-borrador`), NO aptos para producción hasta aprobación de un abogado. Deadline Ley 21.719: **1 dic 2026**.
- **Borrado:** anonimizar vs hard delete; período de gracia (B4).
- **Verificación de edad:** si aplica y cuándo (B5).
- **Google OAuth:** cambiar la app de Internal a External (Google Cloud Console) para multi-tenant. Acción de Agustín.

---

*Los tres mockups están desacoplados a propósito, para iterar la UX barato. El viaje de vuelta es barato porque pantallas, campos con validación y costuras ya están derivados y anotados. Tu trabajo no es re-derivar el flujo: es cablear cada paso ya diseñado, en pasos chicos y revisables, y dejar el conjunto consistente.*

*— chat Dev Mockups Flujos*
