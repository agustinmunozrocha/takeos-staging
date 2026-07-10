# Rizora · PRD V3.0

**Product Requirements Document**

> *Take control of your production. Take control of your time. Take control of your life.*

| | |
|---|---|
| **Versión** | V3.7 |
| **Fecha** | 10 de julio de 2026 |
| **Estado** | Borrador para aprobación · **V3.7 renombra el producto a Rizora** (orden de Agustín, 10-jul) sin cambios de producto: Rizora es el **SaaS**; **La Hectárea SpA** es la sociedad sobre la que opera **Primate Films** (la productora); ⚠ queda pendiente definir la sociedad sobre la cual operará Rizora. Rige la política "cargos, no nombres" (ADR-027). Las menciones "V3.6" en el cuerpo son registro histórico de esa versión · V3.6 corrigió el **cupo de colaboradores a "por proyecto"** (§22), actualiza el estado real del frontend verificado contra el build vivo (Centro de Privacidad y cinco flujos de derechos **ya construidos en UI**, refresco resuelto, acceso de externos y transferencia de administración en producción) y registra el cierre del flujo "BD en código" (detalle técnico en ADR v1.8 / Arquitectura v1.4) · reemplaza V2.0 |
| **Autor** | Agustín Ignacio Muñoz Rocha |
| **Razón social** | La Hectárea SpA |
| **Marca comercial** | Primate Films |
| **Idioma** | Español (Chile) |

Documento fundacional del sistema operativo de producción audiovisual desarrollado por Primate Films. Define qué es, para qué existe, cómo funciona, para quién es y hacia dónde apunta. Esta versión sincera el estado real del software y traza el salto a backend.

---

## 00.A — Aviso legal · Propiedad intelectual y confidencialidad

> **PROPIEDAD INTELECTUAL — DOCUMENTO PROTEGIDO**
>
> Este documento, el software **Rizora**, su arquitectura conceptual, lógica operativa, workflows, módulos, plantillas, documentación, denominación, identidad visual asociada y contenido estratégico constituyen obra original de **Agustín Ignacio Muñoz Rocha** (RUT 20.287.686-2), titular de los derechos de autor, en el contexto de las operaciones de **La Hectárea SpA** (RUT 77.398.011-K), operando comercialmente bajo la marca **Primate Films**.

Toda la información aquí contenida se encuentra protegida bajo las leyes de propiedad intelectual vigentes en Chile y en los tratados internacionales aplicables.

Queda expresamente prohibida la reproducción total o parcial, distribución, difusión, comunicación pública, transformación, adaptación, uso comercial, apropiación, ingeniería inversa o explotación —por cualquier medio y bajo cualquier formato— de este documento o del software descrito en él, sin autorización previa, expresa y por escrito de Agustín Ignacio Muñoz Rocha o de La Hectárea SpA.

El uso indebido, no autorizado o fraudulento de este material podrá ser objeto de acciones legales civiles y penales, incluyendo —pero no limitado a— demandas por infracción de derechos de autor, competencia desleal y apropiación indebida de propiedad intelectual.

Este documento es estrictamente confidencial. Su acceso está restringido al equipo interno de Primate Films, a colaboradores autorizados y a desarrolladores formalmente contratados bajo acuerdo de confidencialidad. Si usted ha recibido este documento por error, debe notificarlo inmediatamente y eliminarlo de sus registros.

© 2026 Agustín Ignacio Muñoz Rocha — La Hectárea SpA — Primate Films. Todos los derechos reservados.

> **Nota sobre nomenclatura legada:** A partir de esta versión, la marca **AMR Films** se elimina por completo de la documentación activa de Rizora. La razón social sigue siendo La Hectárea SpA; la marca comercial es **Primate Films**. Cualquier referencia a «AMR» en documentos anteriores debe considerarse histórica y obsoleta.

---

## 00.B — Changelog · V2.0 → V3.0

> **Actualización V3.6 · junio 2026.** Tres cosas. **(1) Cupo de colaboradores por proyecto (§22):** el límite que da cada plan (ej. 12 en Producción) se mide **por proyecto**, no por organización; se canoniza la regla **cargos = colaboradores** y que los **internos no consumen cupo**. **(2) Estado real del frontend** (verificado contra el build vivo): el **Centro de Privacidad y los cinco flujos de derechos** ya están **construidos en UI y en producción** (con textos legales aún provisionales → lo que falta del cumplimiento es **legal**, no UI); el **bug de refresco** está resuelto; el **acceso restringido a externos** (con la lente "personas de mis proyectos") y la **transferencia de administración** están en producción. Toca §16, §21 y §07. **(3) Flujo "BD en código" cerrado:** queda registrado que el detalle técnico (Orden A, despliegue por Branching al mergear) vive en ADR v1.8 y Arquitectura v1.4. No cambian el modelo de negocio ni los planes. El resto se mantiene igual al V3.5.

> **Actualización V3.5 · junio 2026.** Sincroniza el PRD con la **infraestructura ya en código** (cierre de Prioridad #1 y #2; ver Arquitectura y Flujo de Trabajo v1.3 y ADR v1.7): la **provisión de una organización nueva es autocontenida** (lee de catálogos globales, ya no clona desde Primate — ADR-022), se aclara en §19 la distinción entre el **modelo de dominio (≈24 tablas)** y el **conteo vivo de la base (77 tablas)**, y se suma a **§24 Horizonte** una idea no comprometida: un **MCP server de solo lectura** para un Reporte de Cierre analítico. No cambian el modelo de negocio ni los planes. El resto se mantiene igual al V3.4.

> **Actualización V3.4 · 10 de junio de 2026.** Abre **§24 — Horizonte de producto** (sección nueva; el changelog permanente pasa a §25 y el glosario a §26) y recoge una tanda grande de ideas y hallazgos: dos **módulos nuevos de horizonte** —**Post-producción** (coordinación de los departamentos de post: montaje, sonido, color, VFX, con validación del post-productor) y **Home / Vista de pájaro** del proyecto (nodos + dashboard)—, el refinamiento de **Entregables** (entregas en proceso por enlace externo; entregable final nativo en Supabase), la **herramienta gratuita viral** y el **plan persona natural**, el **servicio de generadores de documentos a pedido**, las **fotos de perfil** y la **app móvil con notificaciones configurables**. Además, dos arreglos detectados en testing (el refresco devuelve siempre al panel personal; la cuenta bancaria acepta cualquier número → validación) y notas de comunicación de los chats (foco en lo que falla; mundo de ejemplo pasa a *El Señor de los Anillos*). Todo lo de §24 está marcado como **idea, no compromiso**. El resto se mantiene igual al V3.3.

> **Actualización V3.3 · 10 de junio de 2026.** Consolida los handoffs de **Marketing/GTM** (arquitectura de planes, faseo comercial, estado del nombre comercial), **Legal** (instrumentos en borrador, corrección del plazo de brechas, separación societaria) y **BD Expert** (identidad global del usuario, consentimiento, notificaciones, aprovisionamiento). Toca §01/§22 (naming), §16 (cumplimiento), §17 (separación societaria), §22 (negocio y planes) y §23 (faseo comercial); además, se retiran las versiones de build específicas del cuerpo del documento (quedan solo en este changelog histórico). El resto se mantiene igual al V3.2.

> **Actualización V3.2 · 8 de junio de 2026.** Consolida el cierre del **Gate A** (migración a Supabase terminada; Firebase clausurado en `deny-all` y su SDK retirado en la V10): toca **§23** (Fase 2 · hito de migración cumplido), **§19** (nuevo principio de fuente única de verdad tributaria → ADR-018) y **§15** (Supabase Pro activo con backups validados; objetos de Storage aún sin cobertura de backup — deuda conocida). El resto del documento se mantiene igual al V3.1.

> **Actualización V3.1 · 6 de junio de 2026.** Esta versión actualiza únicamente la **§07 — Sistema de roles y permisos**, reescrita a partir del Handoff de Permisos (aprobado): reemplaza el modelo Submitter/Approver como capa de acceso por el modelo de perfiles (dos dimensiones: membresía interno/externo × perfil 1–7 + Finanzas). El resto del documento se mantiene igual al V3.0. Detalle técnico en ADR-003/004/013.

El PRD V3.0 no es un parche del V2.0: es una **sinceración**. El V2 era un cimiento filosófico sólido —sus diez principios sobrevivieron intactos a toda la serie V8 del software—, pero envejeció en cuatro frentes: negaba un backend que ya existe, describía como «futuros» módulos que ya están construidos, prometía un modelo de permisos que el código solo simula, y omitía la mitad de la capa financiera real. Esta versión consolida el trabajo de cuatro frentes de asesoría independientes —frontend, backend, datos y marketing— y resuelve sus contradicciones con decisiones explícitas.

> **El cambio raíz:** El V2 afirmaba «sin backend · no guarda datos» (§17, §19). **Eso dejó de ser cierto hace varias versiones.** El software sincroniza contra Firestore, espeja en localStorage y opera con datos reales —tanto que el límite de 1 MiB por documento de Firestore obligó a mover binarios fuera. El V3 reconoce que la Fase 1 ya cruzó a «prototipo operativo con backend liviano» y encuadra el salto a la Fase 2 (Supabase / PostgreSQL).

### Cambios mayores

- **Eliminación total de «AMR Films».** La marca histórica sale de toda la documentación activa. Primate Films es la única marca; La Hectárea SpA, la razón social.
- **Sinceración del backend (§17, §19).** Se jubila el concepto «core virtualmente operativo» como meta —ya se superó— y se documenta la capa de persistencia real (Firestore + localStorage hoy → Supabase/PostgreSQL mañana).
- **Nueva sección de Arquitectura técnica y backend (§19).** Reescrita por completo, separa lo *decidido* (con remisión al ADR de Backend v1) de lo *aún abierto*. Incorpora las decisiones de arquitectura de tres capas, autenticación Google, autorización por rol y estado, modelo relacional, concurrencia, atomicidad y migraciones.
- **Reclasificación de módulos (§06).** Locaciones, Legal, Cotización, Plan de Rodaje, Documentos y la capa de Tareas/Colaboración pasan de «futuro» a **construidos**, reflejando la realidad de la serie V8.
- **Nuevo módulo Tareas y Colaboración.** No existía en el V2; se construyó en V8.6.0 (tareas, comentarios, @menciones, señales de atención). Se formaliza.
- **Capa financiera ampliada (§12).** Se documentan Pronto Pago, Pagos Pendientes (Reembolsos + Prontos Pagos), exportación Office Banking y la lógica tributaria central (boleta retiene 15,25% / factura no).
- **Decisión RECI (§10).** Se abandona el RECI rígido de cuatro roles por tarea. Se adopta el modelo construido y probado: Responsable por sección + un asignado por tarea + @menciones para consultar/informar.
- **Nuevas secciones estratégicas y de cumplimiento.** Seguridad y datos sensibles; cumplimiento Ley 21.719 (hito 1-dic-2026); usuario cross-tenant; confianza del cliente y conflicto de interés del fundador.
- **Reposicionamiento de negocio (§22).** Se incorpora la dirección de marketing: muerte del tier freelancer, modelo premium, ICP de productoras de publicidad, el Reporte de Cierre agregado como *moat*, y Wrapbook como competidor real.
- **Manual de Marca como autoridad real (§21).** El Manual de Magdalena Ríos pasa de promesa a documento existente (v0, en corrección). El diseño actual se reconoce como sistema de tokens CSS provisional a alinear con él.

### Los choques que este PRD resolvió

Cada frente de asesoría trabajó aislado de los demás, a propósito, para no contaminar su criterio. El costo de eso son choques de opinión. Esto deja registrado cómo se resolvió cada uno y con qué autoridad, para que ninguna versión futura los reabra sin saber que ya se decidieron.

**1 · Plataforma de backend**
- *El choque:* Frontend propone Supabase y «cambiar solo la capa de datos, no el front». Backend/ADR exige tres capas con un servidor propio que valida, bajo el principio «nunca confiar en el cliente» —lo que contradice el modelo donde el navegador habla casi directo a la base.
- *Decisión (fundador):* Adoptar **Supabase como plataforma PostgreSQL administrada, pero con la lógica financiera y de autorización del lado servidor** (no en RLS sola). «Cambiar solo la capa de datos» es un ideal de transición, no un absoluto: la lógica crítica corre en backend / Edge Functions.

**2 · RECI rígido vs. modelo simple**
- *El choque:* La Biblia y el V2 elevan RECI a columna vertebral intransable. Frontend lo declara *over-engineering* para el tamaño de Primate y señala que satura la UI.
- *Decisión (fundador):* RECI se conserva como **marco conceptual**, no como cuatro campos rígidos por tarea. Responsable y Ejecutor viven y son obligatorios; Consultado e Informado se capturan informalmente vía @menciones. «Si cada campo tuviese responsable, la UI sería inavegable y nadie usaría el software —y entonces menos RECI aún.»

**3 · Gastos: ¿convive o reemplaza Rinde Gastos?**
- *El choque:* El V2 dice ambas cosas. Frontend confirma que Gastos+CFO se construyó para reemplazar. Marketing habla de «Rinde Gastos absorbido como funcionalidad nativa».
- *Decisión (fundador):* **Reemplazo/absorción.** Rinde Gastos sale del horizonte de integración y queda como herramienta legada en transición. La disciplina financiera es nativa.

**4 · Naming comercial**
- *Decisión (actualizada V3.3):* **ningún nombre comercial es oficial todavía** —ni «Rizora», que es solo el **nombre de trabajo/proyecto** y será reemplazado—. La búsqueda sigue abierta (§22): se abandona el sufijo «-OS»; *Keel* y otros quedaron descartados; el candidato principal es **Cinelium** (en clearance legal), con **Savia** de respaldo. Se espera fijar el nombre oficial en la próxima consolidación y reemplazar «Rizora» en todos los documentos.

**5 · Alcance y GTM**
- *Decisión:* La dirección de marketing se incorpora a §22 como decisiones tomadas (premium, ICP publicidad, moat del Reporte agregado), porque vive en una capa que no choca con backend ni frontend.

> **Principio de autoridad documental:** Para el detalle técnico de las decisiones del choque 1, este PRD **remite al ADR de Backend v1** y se mantiene narrativo y de dominio. Donde el PRD y el ADR hablen del mismo tema, el ADR manda en lo técnico; el PRD manda en lo conceptual y de producto.

### Correcciones específicas

- **Versionado (§20).** El V2 decía «toda modificación genera una nueva versión». La regla real de Primate es otra: se versiona **con cada exportación acompañada de una modificación** —no por modificar a secas, no por exportar a secas— con excepción en cotización/venta, donde el PE versiona manualmente y el sistema solo advierte. (Detalle en ADR-008.)
- **Alcance de «no se elimina» (§20).** La no-eliminación aplica a **documentos versionables** (cotización, legal, hoja de llamado), no a todo. Gastos, tareas y filas de presupuesto tienen su propio ciclo y sí se pueden borrar.
- **«Base de Datos de Personas» → «Base de Datos».** El módulo real abarca Personas, Empresas, Talentos y Locaciones, más stores transversales.
- **«Correos y Notificaciones» → «Notificaciones».** Nombre de módulo unificado.
- **Confirmación de asistencia y recordatorios (§08).** Están **diseñados, no construidos**: hoy se redactan y previsualizan, pero no hay infra que reciba respuestas ni dispare envíos. Se marca como pendiente de Fase 2.

### Qué se quitó o degradó

- **«Core virtualmente operativo» como meta (§17):** jubilado. Reescrito como hito cumplido y como definición histórica en el glosario.
- **«Sin backend / no guarda datos» (§17, §19):** eliminado, era falso.
- **«LocalStorage solo para demos» (§19):** eliminado. Hoy es capa de persistencia real y puente para binarios.
- **Uber API y horizonte muy lejano:** se mantienen como *nota* de horizonte, no como módulos numerados, para no inflar el roadmap y desviar el foco de la Fase 2.
- **Tier freelancer USD 29 (§22):** eliminado. El freelancer solo es el peor fit del producto (poco caos, poco valor percibido).

### Pendientes conocidos

- Bug del Presupuesto: al ingresar monto y presionar Enter se despliegan todas las secciones. Ordinario, no crítico.
- Manual de Marca en v0 (no oficial, en corrección). El diseño se alinea cuando se finalice.
- Nombre comercial definitivo, cifra exacta de pricing y línea final de copy de posicionamiento: pendientes, todos posteriores a las entrevistas de validación.

> **Estado de aprobación:** **V3.0 — Borrador para aprobación.** Una vez aprobado, este documento reemplaza completamente la V2.0 en todos los procesos del ecosistema Rizora. Cualquier referencia a la V2.0 debe considerarse obsoleta. **Breaking changes documentales:** la reclasificación de módulos y la decisión RECI alteran cómo se leía el V2; ningún cambio rompe datos del software.

---

## 00.C — Prefacio · Por qué existe este documento

Este PRD nace de una necesidad concreta: no depender de un solo chat ni de la memoria de una sola persona. Rizora se construye paso a paso, con criterio incremental, y debe poder ser retomado por cualquiera en cualquier momento sin perder coherencia con la visión original.

Es el cimiento. No describe cómo se ven los botones ni qué tipografía usa cada pantalla —eso vive en el Manual de Marca. Describe qué problema resuelve el software, cómo está pensado para escalar, qué decisiones ya están tomadas, qué decisiones se difieren intencionalmente y, ahora, **qué está realmente construido**.

Está escrito para dos lectores. El equipo interno de Primate Films, que lo usa como guía estratégica para evaluar cada nueva funcionalidad. Y el desarrollador profesional que tomará el software para construirle un backend real. Para ese segundo lector, este documento —junto al ADR de Backend v1— es la diferencia entre construir lo correcto y rehacer todo más adelante.

> **Principio de lectura:** Este documento debe leerse completo al menos una vez antes de tomar decisiones estructurales sobre Rizora. Las decisiones tomadas aquí tienen prioridad sobre interpretaciones individuales. Si algo se contradice con la práctica, debe levantarse formalmente para discusión, no resolverse en silencio.

**Documentos hermanos:**
- **Biblia Primate** — Filosofía y procesos. Framework, sistema operativo conceptual y Manual. Rizora hereda sus principios.
- **ADR Backend v1** — Detalle técnico de arquitectura. El PRD remite a él; se mantiene narrativo.
- **Manual de Marca** — Autoridad visual (Magdalena Ríos). v0 en corrección. Rige todo lo estético.

---

## Índice

1. Identidad del software
2. Filosofía y principios fundamentales
3. Usuarios y roles
4. Arquitectura general del sistema
5. El Control Room
6. Módulos del software
7. Sistema de roles y permisos
8. Notificaciones y comunicación
9. Plantillas de correo
10. Trazabilidad y responsabilidades (RECI)
11. Entregables y exportación
12. Manejo financiero
13. Portal de clientes
14. Reportes inteligentes de cierre
15. Seguridad y datos sensibles
16. Cumplimiento legal · Ley 21.719
17. Confianza y conflicto de interés
18. Integraciones futuras
19. Arquitectura técnica y backend
20. Versionado y estados
21. Principios de UX y diseño
22. Modelo de negocio y mercado
23. Roadmap por fases
24. Plantilla permanente de changelog
25. Glosario · Cierre

> **Cómo cambió la numeración respecto al V2:** El V3 reordena para que el cuerpo siga el flujo lógico: producto → módulos → operación → **seguridad y cumplimiento (nuevo bloque §15–§17)** → técnica → negocio → roadmap. Las secciones nuevas son Seguridad, Cumplimiento Ley 21.719 y Confianza/Conflicto de interés. «Decisiones técnicas» se expande a «Arquitectura técnica y backend» (§19).

---

## 01 — Identidad del software · Qué es Rizora

Rizora es el sistema operativo de producción audiovisual desarrollado por Primate Films. No es un gestor de tareas. No es una hoja de cálculo. No es un CRM. Es el entorno único donde vive cada proyecto audiovisual desde el primer contacto con el cliente hasta el cierre contable final.

**Definición operativa.** Rizora centraliza la información, organiza los proyectos, automatiza tareas repetitivas, hace visible la responsabilidad y reduce el caos operativo propio de la producción audiovisual. Funciona bajo un modelo **proyecto-céntrico**: cada proyecto es una unidad autónoma que nace, se desarrolla, se cierra y queda bloqueada como fuente histórica.

**Propuesta de valor.** Reemplazar el caos de hojas de cálculo, mails sueltos, mensajes de WhatsApp y documentos duplicados con un sistema que tiene una sola fuente de verdad por proyecto, automatiza lo repetitivo, deja trazables todas las decisiones y permite que una sola persona sea tan productiva como dos con métodos anticuados. El norte emocional es concreto: que la producción deje de correr con cortisol. Que el caos no cueste el producto, ni el margen, ni la paz.

**Visión a largo plazo.** Convertirse en un software vendible por suscripción a productoras audiovisuales del mundo. Modular en su funcionalidad, adaptable en su UX según el tamaño de la productora, y extensible mediante integraciones con servicios externos.

> **El nombre:** **Rizora** tiene un doble sentido intencional: *take* es la unidad mínima de una grabación —la toma— y, en inglés, también significa *tomar el control*. El sufijo *OS* comunica que no es una herramienta puntual sino un sistema operativo completo. **Tagline:** *Take control of your production. Take control of your time. Take control of your life.*

> **Nota sobre el nombre comercial:** «Rizora» se usa como nombre interno y de proyecto. La marca comercial definitiva está en evaluación (ver §22): marketing recomienda abandonar el sufijo «-OS» por su pronunciación en español. El concepto de «sistema operativo» se conservará como descriptor, no necesariamente en el nombre.

---

## 02 — Filosofía y principios fundamentales · Los diez principios

Rizora hereda y formaliza los principios definidos en la Biblia Primate. Estos diez principios deben sobrevivir a cualquier cambio tecnológico, rediseño visual o iteración de producto. **Sobrevivieron intactos a toda la serie V8 del software** —ese es el mejor argumento de su solidez. Si una decisión técnica futura entra en conflicto con uno de ellos, lo correcto es cuestionar la decisión, no el principio.

1. **Proyecto-céntrico.** Cada proyecto es la unidad mínima. Toda la información vive en función de un proyecto concreto. No existe información huérfana.
2. **Fuente única de verdad.** Cada dato tiene un único lugar donde se ingresa. Desde ahí alimenta al resto. La misma información nunca se escribe a mano en dos lugares.
3. **Automatización con control humano.** Se automatiza lo repetitivo. Las decisiones críticas permanecen manuales. La automatización nunca elimina el criterio humano en momentos clave.
4. **Claridad sobre comodidad.** El sistema protege el flujo colectivo. Si alguien quiere trabajar fuera del sistema por comodidad, el sistema fuerza el regreso al canal común.
5. **Visibilidad de errores.** Los errores se muestran con mensajes claros y accionables. Un error oculto es más peligroso que uno evidente.
6. **Responsabilidad explícita.** Toda tarea tiene un Responsable final visible. Una tarea sin Responsable no puede existir. (Modelo RECI, ver §10.)
7. **Flexibilidad en zonas controladas.** Las excepciones existen, pero solo en zonas diseñadas para eso. No se permiten modificaciones improvisadas a la estructura.
8. **Bajo mantenimiento técnico.** Lo que cambia seguido vive en lugares editables por usuarios no técnicos. El código maneja estructura, no contenido.
9. **Versionado en vez de eliminación.** Los documentos versionables se versionan numéricamente; las versiones anteriores no se eliminan. La última manda. (Alcance acotado, ver §20.)
10. **Independencia de la herramienta.** La lógica del sistema es independiente de la tecnología que la implementa. Hoy HTML+Firestore; mañana, Supabase. Los principios no cambian.

> **Un principio operativo nuevo, heredado de la práctica — Norte anti-cortisol.** De cada feature se pregunta: «¿esto reduce un momento de ansiedad del fundador que opera?». Las guardas de validación —el sistema que impide cometer el error— son ese norte hecho función. Es el filtro de diseño que ordena las prioridades del roadmap.

---

## 03 — Usuarios y roles · Para quién es Rizora

Rizora escala progresivamente en tipos de usuario. La arquitectura debe permitir agregar nuevos tipos sin rediseñar el sistema completo. Cada tipo tiene una vista filtrada, accesos diferenciados y permisos específicos.

| Nivel | Quiénes | Implementación |
|---|---|---|
| **A · Internos** | Productor, PE, director, AD, AP, directora de arte, director creativo, CEO, CFO. Acceso amplio según rol. Son los primeros usuarios reales y validan el modelo. | En uso (simulado); auth real en Fase 2 |
| **B · Freelancers** | Vestuaristas, asistentes de arte, técnicos, gaffers, eléctricos, talentos. Acceso limitado a su proyecto y tareas. Suben información, no necesariamente aprueban. | Fase 2+ (post-auth) |
| **C · Clientes** | Marcas, agencias, responsables externos. Acceso al Portal de Clientes: solo lo que Primate decide compartir. Trazabilidad filtrada. | Fase 4 |
| **D · Externos masivos** | Extras, visitas, asistentes ocasionales en producciones grandes (50+). Solo lectura de información mínima: hoja de llamado, dirección, horario, emergencias. | Futuro lejano |

> **Principio de acceso por vista:** Cada usuario ve solo lo que necesita para hacer su trabajo. Las vistas se determinan por tipo de usuario y por asignación al proyecto. El sistema filtra contenido en tiempo real según quién inició sesión, sin requerir múltiples instalaciones ni versiones. **En la etapa SaaS, este principio se implementa como política de autorización en el backend**, no como lógica de frontend (ver §17 y §19).

**El usuario que trabaja en varias productoras.** Un JP, DoP, director o AD trabaja para muchas productoras. A nivel SaaS, esto significa que **la UI es por usuario, no por empresa**: identidad global (un solo login), membresía y permisos por productora, y un **Control Room personal cross-tenant** donde la persona ve todos sus proyectos a través de empresas, filtrado por lo que cada una le permite. Es una decisión de dominio, no solo técnica, y condiciona la arquitectura multi-tenant desde el diseño. (Detalle en ADR-013.)

> **Identidad global y flujo de alta (V3.3).** Los datos personales del usuario viven en una **entidad global** propia (no en los contactos de cada productora): se registran una vez y se comparten con una productora **solo por consentimiento explícito**, copiándose como contacto de esa organización. El estado de la membresía recorre **pendiente → activo → inactivo**: una invitación queda *pendiente* y no concede ningún acceso hasta que la persona consiente, momento en que pasa a *activo*. Implicancia de negocio: **cualquier persona puede crear su cuenta gratis**; quien paga el plan es la **productora**, no el colaborador. (Detalle en ADR-019 y ADR-020.)

> **Foto de perfil (idea de horizonte — §24).** Que los usuarios tengan **foto de perfil** humaniza los equipos y aporta al norte del "LinkedIn de audiovisuales". Idea, no compromiso; detalle en §24.

---

## 04 — Arquitectura general del sistema · Cómo está estructurado

Rizora tiene tres capas conceptuales que conviven en cada proyecto. No son etapas cronológicas ni secciones visuales: son dimensiones funcionales. *(Esta es la arquitectura de dominio. La arquitectura técnica de tres capas —cliente, backend, base de datos— es otra cosa y vive en §19.)*

1. **Identidad del proyecto.** Qué es el proyecto y quién responde. Cliente, agencia, nombre, PE, fechas, servicio. Un proyecto no existe sin esta capa completa.
2. **Estados e hitos.** Dónde está parado en su ciclo. Los estados son globales (uno activo a la vez). Los hitos son eventos que gatillan el avance.
3. **Tareas, docs y herramientas.** Todo lo que se hace: tareas (con responsable), documentos (versionados), herramientas e información financiera.

**Estados del proyecto** (orden ideal, con posibilidad de retroceder o pausar en casos excepcionales):

| Estado | Descripción |
|---|---|
| **Venta** | Desde el primer contacto hasta la aprobación o rechazo. |
| **Preproducción** | Aprobado: contratación, casting, scouting, PPMs, plan de rodaje. |
| **Producción** | Días de rodaje activos. |
| **Postproducción** | Edición, color, sonido, revisiones, entregas. |
| **Cierre** | Cierre contable, factura, subida a redes, pago final. |
| **Cerrado** | Bloqueado como fuente histórica. No editable. Se genera el Reporte de Cierre. |
| **Rechazado** | Estado terminal alternativo. El proyecto no avanzó a preproducción. |

> **Housekeeping — pausa y muerte:** El V2 mencionaba en prosa que un proyecto puede «pausar» o «morir». El V3 define que **los siete estados de arriba son los estados reales del sistema.** «Pausa» y «muerte» se tratan como condiciones excepcionales —no como estados de primera clase— hasta que la operación demuestre que necesitan serlo. Decisión a confirmar en el build.

---

## 05 — El Control Room · El corazón visible del sistema

El Control Room es la pantalla principal de Rizora, lo primero que ve un usuario interno al iniciar sesión. Comunica el estado global de la operación en una sola vista: qué proyectos hay, en qué estado están, qué requiere atención, qué va bien.

**Qué muestra:**
- Vista de tarjetas o columnas por estado (Venta → Cerrado, Rechazado).
- Identificación visual rápida del cliente, monto y PE de cada proyecto.
- Indicadores de alerta cuando algo requiere atención (hito vencido, falta de DTE, aprobación pendiente).
- Filtros por PE, cliente, rango de fechas o tipo de proyecto.
- Acceso rápido a la última actividad de cada proyecto.
- Métricas globales agregadas: proyectos activos, monto total en producción, cerrados en el mes.
- Búsqueda transversal por nombre de cliente, proyecto o persona.

**Por qué importa tanto.** El Control Room es la diferencia entre operar a ciegas y operar con visión panorámica. Sin él, Rizora sería una colección de pestañas. Con él, es un sistema operativo real. En la etapa SaaS, el Control Room se vuelve **cross-tenant** para el freelancer que trabaja en varias productoras (ver §03 y ADR-013).

> **Regla crítica del Control Room:** El Control Room **no debe contener información que no exista en otro lugar.** Es una vista derivada, no una fuente de verdad. Si un dato aparece aquí, debe poder rastrearse hasta su origen con un clic. Esto preserva el principio de fuente única de verdad y evita inconsistencias entre el dashboard y los módulos.

---

## 06 — Módulos del software · Lo que Rizora hace

El cambio más concreto del V3 vive aquí. El V2 subrepresentaba lo construido: clasificaba como «futuro cercano» módulos que la serie V8 ya entregó. Esta tabla reconcilia el PRD con la realidad del código, módulo por módulo.

| Módulo | PRD V2 decía | Realidad en V8 | Acción V3 |
|---|---|---|---|
| **Locaciones** | Futuro cercano (#13) | Construido: módulo + Plan de Scouting + categoría de BD | A Core |
| **Legal** | «Contratos y Cesiones», futuro cercano (#11) | Construido y más amplio: cesiones, servicios, NDA, arriendo, personalizadas; editor de plantillas; versionado | Renombrar + Core |
| **Cotización** | Solo un PDF exportable (§11) | Módulo completo: versiones, comparador por oferta, snapshots por versión | Elevar a módulo |
| **Plan de Rodaje** | Solo un PDF exportable (§11) | Módulo completo: guion técnico, cronograma, motor de tiempos en cascada | Agregar módulo |
| **Documentos** | No figura | Pestaña real: links + adjuntos base64 | Agregar |
| **Base de Datos** | «BD de Personas» (#03) | Personas + Empresas + Talentos + Locaciones + stores transversales | Renombrar + ampliar |
| **Tareas / Colaboración** | No existe | Construido: tareas, comentarios, @menciones, señales, «requieren atención» | Nuevo módulo |
| **Finanzas · CFO** | Dentro de Gastos | Módulo global: Pagos Pendientes (Reembolsos + Prontos Pagos) + exports | Módulo global |
| **Responsable por sección** | No existe | Construido: un responsable por sección, defaults por rol | Formalizar (§10) |

> **Conclusión:** El «Core» real hoy es bastante más grande que el del V2. Incluye, además de lo que ya listaba (Control Room, Info Proyecto, BD, Presupuesto, Crew, Gastos, Rodajes, Hoja de Llamado, Notificaciones): **Cotización, Plan de Rodaje, Locaciones, Legal, Documentos y la capa de Tareas.**

### Catálogo Core (construidos)

**01 · Control Room** — Dashboard con vista global. Vista por estados, tarjetas por proyecto, filtros (PE, cliente, fechas, tipo), indicadores de alerta, búsqueda transversal, métricas agregadas. Es una vista derivada (ver §05).

**02 · Info Proyecto** — Datos globales: cliente, agencia, nombre, PE, fechas, estado, servicio, condiciones de pago, resumen financiero. Es la cara del proyecto y la fuente de verdad de sus datos generales.

**03 · Base de Datos** *(antes «BD de Personas»)* — Repositorio único de contactos, dividido en **Personas** (crew/internos), **Empresas** (clientes/proveedores), **Talentos** (casting) y **Locaciones**, más stores transversales (plantillas legales, etc.). Datos básicos, tributarios (tipo de DTE, RUT, razón social), bancarios, restricciones alimenticias e historial de proyectos. Ingreso vía formulario para evitar duplicados. Import/export real en `.xlsx` (SheetJS), con reemplazo total de registros (Excel como fuente de verdad).
> *Decisión estructural pendiente de Fase 2:* La arquitectura de tablas separadas (Personas/Empresas/Talentos) es práctica pero inferior a una entidad **Contacto** unificada con filtrado por rol, porque una persona puede ser simultáneamente crew, talento y cliente. La migración a PostgreSQL es el momento natural para resolverlo. (Cruza con ADR-005.)

**04 · Presupuesto** — Construcción del equipo desde una lógica económica: roles, personas, valores, DTEs, cantidades, confirmaciones. Cálculo automático de costos y márgenes, diferenciación cotizado/confirmado, marca de **Pronto Pago** por fila, snapshots por versión, exportación a Excel. *Bug conocido: monto + Enter despliega todas las secciones (ordinario, no crítico).*

**05 · Crew** — Lista oficial de personas confirmadas. Se alimenta automáticamente del Presupuesto, filtrando solo a los confirmados. Información operativa por persona, selección de plantilla de correo (con subversión por destinatario), estado de envío.

**06 · Gastos** — Registro de todos los gastos del proyecto, espejo de la cuenta bancaria de producción más detalle de cada movimiento. Categorización, vinculación con proveedores de la BD, estado de DTE recibido, reconciliación con presupuesto cotizado. **Reemplaza a Rinde Gastos** (ver decisión de arbitraje 3 y §12).

**07 · Rodajes** — Gestión de días activos de rodaje. Cada día tiene fecha, estado, descripción e ID único (DIA-01…). Soporta múltiples días, activación/desactivación sin eliminar, vinculación con Hoja de Llamado.

**08 · Hoja de Llamado** — Documento operativo del día. Combina datos automáticos (crew, contactos, fechas desde Info Proyecto) con input manual (call times, locaciones con dropdown, notas). Citaciones del crew automáticas, citaciones externas manuales. Exportación a PDF y versionado cuando hay cambios.

**09 · Cotización** *(elevado de «PDF exportable» a módulo)* — Módulo completo de venta: **versiones**, **comparador por oferta**, **snapshots por versión**. Cada oferta tiene su presupuesto interno liviano (copia recortada, no un presupuesto paralelo completo), condiciones de servicio editables con variables y lista agrupada de entregables. El versionado en cotización es manual (el PE crea la versión; el sistema solo advierte) por la razón de negocio de no mandarle «Versión 3» a un cliente que ve el presupuesto por primera vez (ver §20 y ADR-008).

**10 · Plan de Rodaje** *(elevado a módulo)* — Guion técnico, cronograma y **motor de tiempos en cascada** (recalcula horarios por escena y bloque). Exportable a PDF con detalle por escena y bloque del día.

**11 · Legal** *(antes «Contratos y Cesiones»)* — Generación de documentos legales: cesiones de derechos, contratos de servicio, NDA, arriendo de locación y personalizadas. Editor de plantillas en Modo Administrador, variables dinámicas (persona, monto, fechas, derechos) alimentadas del Presupuesto y la BD, y versionado. *El contenido de las plantillas legales lo valida un asesor legal —fuera del alcance de este PRD.*

**12 · Documentos** *(nuevo)* — Pestaña de repositorio del proyecto: links + adjuntos. Hoy los adjuntos usan base64 (solo archivos chicos, por el límite de Firestore). La Fase 2 (Supabase Storage) habilita adjuntos nativos sin ese límite, sin quitar la opción de links.

**13 · Notificaciones** *(antes «Correos y Notificaciones»)* — Sistema de comunicación basado en plantillas editables con variables dinámicas y **subversiones por destinatario** (ver §09). *Estado real:* hoy se redacta y previsualiza; el envío automatizado y la confirmación de asistencia están diseñados pero dependen de infra de correo/WhatsApp diferida a Fase 2 (ver §08).

### Capas transversales (globales)

**14 · Tareas y Colaboración** *(Construido · nuevo en el PRD)* — No existía en el V2. Es la capa de coordinación humana del sistema:
- Tareas con **un solo asignado** + comentarios.
- **@menciones** para involucrar a otras personas (mecanismo de Consultar/Informar, ver §10).
- **Señales / «Requieren atención»**: bandeja de lo que necesita acción del usuario.
- Mega-repositorio de tareas transversal al proyecto.

Diseñado bajo una restricción explícita del fundador: **no saturar la UI con botones de responsable por todos lados.** Esta restricción es la que motivó la decisión RECI del §10.

**15 · Finanzas · CFO** *(módulo global)* — Vista financiera transversal a todos los proyectos, no atada a uno solo:
- **Pagos Pendientes** = Reembolsos + Prontos Pagos, con su KPI.
- **Exportación Office Banking** (Santander, 13 columnas) para transferencias masivas.
- Exportación a Chipax.

Detalle financiero completo en §12.

> **Por qué estas dos son «globales» y no «por proyecto»:** El modelo es proyecto-céntrico, pero hay dos vistas que solo tienen sentido *cruzando* proyectos: la coordinación de tareas de una persona y la cola de pagos del CFO. El sistema las trata como capas transversales sin romper el principio: los datos siguen viviendo en cada proyecto; estas vistas los agregan.

### Futuro cercano

| Módulo | Descripción |
|---|---|
| **Entregables (integral)** | Constructor de piezas y variaciones (desarrollo previo de Agustín), repositorio versionado, feedback de video al timecode tipo Frame.io, aprobaciones del cliente. README automático y mapa exportable (JSON + Excel). Ligado al Portal de Clientes. |
| **Casting** | Perfiles propuestos (propuesto/aprobado/descartado), foto/datos/reel, comparación lado a lado, registro de aprobación del cliente. |
| **Calendario** | Rodajes, hitos, PPMs y entregas en vista calendario. Detección de cruces de disponibilidad entre proyectos. Sincronización con Google Calendar (eventual). |
| **Bodega** | Vestuario, arte y elementos comprados/arrendados. Decisión post-rodaje: almacenar, vender, regalar o descartar. Subastas internas. |

### Futuro lejano

| Módulo | Descripción |
|---|---|
| **Equipo de Arte** | Pestaña de arte (inspirada en el Excel de Javiera Lamasa): utilería, categoría, estado (comprar/arrendar/conseguir), responsable. Ligada a Bodega y Presupuesto. |
| **Equipo Técnico / Gear Check** | Para el Productor Técnico: equipos, rentals, tarifas, ubicación, check de salida/entrada, estado de devolución. |
| **Plan de Locomoción** | Rutas, vehículos, designación de pick-ups, alimentado por direcciones de la BD. |
| **Formularios y Satisfacción** | Envío de formularios post-proyecto, recopilación de feedback, análisis agregado. Horizonte: formulario de intake nativo (hoy es Google Forms externo). |

### Horizonte

Visión a años de distancia: integración Chipax/SII, App móvil nativa, plataformas de pago internacional. **Nota:** elementos muy lejanos (p. ej. integración con Uber API, estimada hacia 2030) se mantienen como *nota de horizonte*, no como módulos numerados, para no inflar el roadmap ni distraer del foco real, que es la Fase 2. (Integraciones, en detalle, en §18.)

---

## 07 — Sistema de roles y permisos · Quién puede hacer qué

> **Actualizado: 6 de junio de 2026.** Esta sección fue reescrita a partir del **Handoff de Permisos** (aprobado, junio 2026) y **reemplaza el modelo Submitter / Approver del V3.0** como capa de control de acceso. El detalle técnico (esquema y RLS) vive en el Handoff de Permisos y en el **ADR de Backend** (ADR-003, ADR-004, ADR-013).

El V3.0 definía tres niveles —Submitter, Approver, Administrator— con cadenas de aprobación. Ese modelo **mezclaba dos cosas distintas**: el *control de acceso* (quién ve y edita qué) y el *flujo de aprobación* (quién aprueba lo que otro subió). El sistema real de Rizora las separa: los permisos los define el **modelo de perfiles** descrito aquí. El flujo Submitter/Approver podría regresar más adelante como un *workflow de aprobación* aparte (horizonte), pero no es lo que define el acceso.

### Las dos dimensiones del acceso

El acceso de una persona se define por dos cosas **independientes**:

1. **Tipo de membresía — `interno` o `externo`** → define *qué proyectos ve*. Interno: ve el Control Room completo de la productora (todos los proyectos). Externo: solo los proyectos a los que está explícitamente asignado.
2. **Perfil (1–7 + Finanzas)** → define *qué módulos puede tocar* dentro de lo que ve.

Ejemplo: un JP freelance es `externo` + perfil `Producción`: ve solo sus proyectos asignados, pero dentro de ellos opera como Producción.

> **Decisión estructural:** los permisos cuelgan del **usuario** (vía su membresía en la productora), **no del rol que cumple en cada proyecto.** Una persona puede tener varios roles según el proyecto, o ninguno aún; si los permisos colgaran del rol, el acceso se volvería ambiguo. El rol por proyecto es una **etiqueta descriptiva** (RECI, responsabilidades, mostrar quién es quién), desacoplada del acceso.

> **Estado en producción (V3.6).** Este modelo ya está **cableado y verificado**: el **acceso restringido de externos** (un externo solo ve y direcciona a sus proyectos asignados, vía la lente `personas_de_mis_proyectos`) y la **transferencia de administración** (el Administrador puede traspasar ese perfil a otra persona) están **en el build vivo** (V11.16.0). *(El detalle de cómo se hace cumplir —portero del cliente y RPC— vive en el hub OWASP / ADR-004, no se duplica acá.)*

### Los ocho perfiles

| Perfil | Roles típicos | Para qué |
|---|---|---|
| **1 · Administrador** | Dueño / CEO / socio fundador | Control total del negocio, incluido quién accede a qué y la salud financiera global. |
| **2 · Ejecutivo** | Productor Ejecutivo, Productor General | Corre el proyecto de punta a punta, incluida la cotización; sin administrar la cuenta ni borrar proyectos. |
| **3 · Producción** | Jefe de Producción | Arma y ejecuta presupuesto y operación; sin definir el setup comercial ni emitir la cotización. |
| **4 · Asistencia** | Asistente de Producción, coordinador junior | Ejecuta operación y gastos; ve el presupuesto como referencia, sin modificarlo. |
| **5 · Coordinación** | Coordinador de locaciones/casting, productor de campo | Maneja contratos y gastos operativos; sin ver el margen comercial. |
| **6 · Creativo** | Director, DoP, Director de Arte, AD | Trabaja en lo creativo/operativo; sin ver ni tocar dinero ni legal. |
| **7 · Invitado** | Practicante, talento, técnico freelance puntual | Solo consulta información operativa de su trabajo; sin modificar nada. |
| **Finanzas (CFO)** | CFO, contador interno o externo | Visibilidad total para pagar y reportar; su escritura vive en Finanzas consolidada, no en los proyectos. |

### La matriz de acceso

Leyenda: **E** = escribe · **L** = solo lee · **—** = sin acceso.

**Nivel productora (Control Room)**

| Capacidad | 1 Adm | 2 Ejec | 3 Prod | 4 Asist | 5 Coord | 6 Creat | 7 Invit | Fin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Base de Datos (transversal) | E | E | E | E | E | L | — | L |
| Finanzas consolidada (pagos / Office Banking) | E | — | — | — | — | — | — | E |
| Datos de empresa | E | — | — | — | — | — | — | — |
| Otorgar / quitar permisos | E | — | — | — | — | — | — | — |
| Eliminar proyecto | E | — | — | — | — | — | — | — |

Crear proyecto: **Administrador y Ejecutivo** (provisional; el resto no crea).

**Nivel proyecto**

| Módulo(s) | 1 Adm | 2 Ejec | 3 Prod | 4 Asist | 5 Coord | 6 Creat | 7 Invit | Fin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Info Proyecto | E | E | L | L | — | — | — | L |
| Cotización | E | E | L | L | — | — | — | L |
| Presupuesto | E | E | E | L | — | — | — | L |
| Reporte de Cierre | E | E | E | E | — | — | — | L |
| Gastos · Legal · Notificaciones | E | E | E | E | E | — | — | L |
| Operación y creatividad¹ | E | E | E | E | E | E | L | L |

¹ Operación y creatividad = Crew, Documentos, Rodajes, Locaciones, Hoja de Llamado, Plan de Rodaje, Guion Técnico, Entregables.

Dos reglas que vale subrayar: el perfil **Finanzas** *lee* todo dentro del proyecto (incluido lo creativo) pero **no escribe nada a nivel proyecto** —para no estorbar el orden del JP—; su escritura vive solo en Finanzas consolidada. Y el **Administrador** mantiene escritura total, incluida la financiera de proyecto: es la red de seguridad cuando el responsable operativo no está disponible.

### Dónde se aplica (no es decoración del frontend)

La autorización real vive en **RLS de PostgreSQL (Supabase)**, no en el cliente. El frontend oculta pestañas y botones por comodidad (UX), pero **eso no es seguridad**: toda lectura y escritura pasa por políticas que validan membresía, alcance de proyecto y nivel de perfil. (Principio del ADR-004: el front refleja, el backend autoriza en cada request.)

### Estado actual y horizonte

**MVP (ahora).** Los ocho perfiles son **fijos**: los siembra el software; el administrador **no los edita**, solo asigna usuarios a ellos. Un solo tenant (Primate Films); el modelo de datos ya está diseñado multi-tenant (`organization_id` en todo).

**Horizonte (el diseño del MVP no debe cerrarles la puerta).** Matriz editable por el administrador desde una pestaña *Roles y Permisos* (es destrabar la matriz sembrada; cero migración); permisos sub-módulo (más finos que módulo); overrides puntuales tipo Google Drive como excepción, no uso diario; perfiles separados para talento vs. practicante; y el workflow de aprobación (Submitter/Approver), si regresa, como sistema aparte.

> **Limitación conocida del MVP:** la Base de Datos es hoy todo-o-nada e incluye **datos bancarios**; un perfil que la lee (ej. Creativo) ve también las cuentas bancarias. Aceptable para el equipo interno de Primate, pero **debe cerrarse con permisos sub-módulo antes de habilitar multi-tenant** (mínimo privilegio + Ley 21.719, §16). Ver Roadmap Operativo · Gate C.

> **Validación de cuentas bancarias (hallazgo de testing, V3.4).** Hoy la cuenta bancaria acepta cualquier número (en una prueba se guardaron dígitos al azar y el sistema lo dejó). Falta **validar el formato/estándar** de las cuentas en el servidor, para que no se pueda guardar cualquier cosa. Es un arreglo de pulido (Roadmap §2; decisión técnica en ADR-002).

### Relación con el Portal de Clientes

El perfil **7 (Invitado) no sirve para clientes ni agencias**: les daría acceso a crew y citaciones. Cuando llegue el Portal de Clientes (Fase 4, §13) será un mecanismo aparte, con su propia capa de acceso. No usar Invitado para externos-cliente.

---

## 08 — Notificaciones y comunicación · Cómo Rizora habla con las personas

Uno de los módulos más estratégicos. Reemplaza el caos de mails sueltos, mensajes de WhatsApp y olvidos por una infraestructura ordenada de comunicación.

> **Distinción crítica: diseñado vs. construido.** Hoy las notificaciones se **redactan y previsualizan**. El **envío automatizado, la confirmación de asistencia y los recordatorios programados están diseñados pero NO construidos**: no hay backend que reciba respuestas ni dispare envíos. Todo esto se vuelve real en la Fase 2, con infra de correo y WhatsApp Business API. El V3 lo marca como pendiente, no como vigente.

> **Actualización V3.3 — el modelo de datos de Notificaciones ya está desplegado.** El **backend del módulo** (plantillas con subversiones, envíos inmediatos y **programados**, y un registro por destinatario con el HTML resuelto) está **construido y desplegado** en la base (ADR-021): el esquema para redactar, versionar y registrar envíos existe. Lo que **todavía falta para enviar de verdad** es la **infraestructura de correo** (dominio propio + proveedor de envío), que es la prioridad de integración en curso (Roadmap §2). El remitente visible será el **usuario real** que envía (su nombre + responder-a su correo), no un correo genérico del sistema.

**Canales:**
- **Email** — canal estándar, soporta plantillas HTML.
- **WhatsApp Business** — vía API, para confirmaciones rápidas y urgencias.
- **In-app** — cuando el destinatario es usuario del sistema (futuro).

**Confirmación de asistencia** *(Diseñado).* Inspirado en el sistema de citas médicas chileno: el día anterior al rodaje, los convocados reciben un mensaje automático preguntando si confirman. Un botón registra la confirmación; quien no responde queda marcado para seguimiento manual.

**Recordatorios automáticos — cronograma** *(Diseñado).* Calibrados para la exigencia real de Primate: cerrar proyectos en 2 a 5 días tras el rodaje.
- **24 h antes del rodaje** — confirmación de asistencia.
- **Día siguiente al rodaje** — solicitud de DTE (90% del equipo). Para postproducción (colorista, sonido, músico), tras la entrega satisfactoria de su trabajo. Para internos de Primate, el DTE se pide igual al día siguiente del rodaje aunque tengan trabajo posterior.
- **Dos días después** — primer recordatorio si no llegó el DTE.
- **Tres días después** — segunda advertencia, más enérgica.
- **Día siguiente a la entrega final satisfactoria** — formulario de satisfacción al cliente. No depende de cierre administrativo, pago ni documentos.

> **Por qué estos timings importan:** Primate opera bajo cierre rápido. Un proyecto que tarda más de 5 días en cerrarse genera fricción financiera, contable y operativa. Los recordatorios sirven a esa exigencia, no a comodidades administrativas que dilaten el cierre.

---

## 09 — Plantillas de correo · Las comunicaciones que se automatizan

Todas las plantillas son editables desde el software, sin tocar código. El editor permite insertar variables dinámicas (nombre, monto, fecha, dirección…) que el sistema completa al enviar.

> **Modelo de subversiones (nuevo en el PRD):** Una plantilla puede tener **varios cuerpos (subversiones)**, y el sistema **elige por destinatario**: hoy Estándar / Pronto Pago; mañana crew / cliente / agencia. La variable automática `{{CONDICIÓN DE PAGO}}` fue absorbida por este modelo. El `{{LINK FORMULARIO}}` vive en la BD y apunta al formulario de intake (hoy Google Forms externo; horizonte: nativo).

**Plantillas mínimas requeridas:**

| Plantilla | Uso |
|---|---|
| **Producción estándar** | Al crew confirmado: detalles del rodaje, monto, fecha, locación, contactos y agendamiento en Google Calendar. |
| **Producción con Pronto Pago** | Variante que indica el pronto pago negociado (gestionado vía subversión). |
| **Invitados a Rodaje** | Visitas, universitarios o personas sin contrato. Agradece, entrega info operativa, deja claras las expectativas. |
| **Envío de Hoja de Llamado** | Adjunta la hoja del día, por mail o WhatsApp. |
| **Solicitud de DTE (1.ª)** | Día siguiente al rodaje. Tono cordial y profesional. |
| **Solicitud de DTE (2.ª)** | Dos días después, más enérgico. |
| **Solicitud de DTE (3.ª advertencia)** | Tres días después. Tono firme; advierte sobre consecuencias para la reputación del proveedor. |
| **Cliente y Agencia** | Comunicaciones formales: hojas de llamado, actualizaciones, entregas, cierres. |
| **Formulario de Satisfacción** | Día siguiente a la entrega final satisfactoria. Feedback estructurado. |
| **Seguimiento Post-Proyecto** *(opcional)* | Reconecta con el cliente tiempo después del cierre. Timing caso a caso. |

> **Principio de editabilidad:** Las plantillas se editan sin tocar código. El equipo operativo ajusta tono, redacción y estructura por sí mismo. La automatización maneja el envío y los datos variables; el texto pertenece al equipo.

---

## 10 — Trazabilidad y responsabilidades · Quién hizo qué, cuándo, y quién aprobó

Cada acción significativa debe quedar registrada en un **audit log** consultable: creaciones, modificaciones, aprobaciones, envíos, cierres. Se registra quién, cuándo (timestamp exacto), qué (creación/modificación/eliminación lógica/aprobación/envío), sobre qué objeto, estado anterior y nuevo, y quién aprobó. *El audit log se vuelve construible en la Fase 2 y, además, es requisito de cumplimiento legal (ver §16 y ADR-012).*

Se accede de tres formas: historial global del proyecto, historial por objeto (este documento, este presupuesto) e historial por usuario (qué hizo esta persona en los últimos 7 días).

> **Decisión de arbitraje 2 · RECI realista.** El V2 prometía RECI rígido de cuatro roles por tarea como regla intransable. El software construyó otra cosa, más simple y ya probada. **El V3 cierra la inconsistencia: RECI se conserva como marco conceptual de responsabilidades, no como cuatro campos obligatorios por tarea.**
>
> Razón del fundador: «Si cada campo tuviese responsable, la UI sería inavegable, el software terrible de usar, y nadie lo usaría —y entonces menos RECI aún.»

**El modelo oficial:**

| Rol RECI | Cómo se captura | Obligatorio |
|---|---|---|
| **R · Responsable** | **Responsable por sección**: uno por módulo, con defaults por rol (PE/JP/AD). | Sí, vivo |
| **E · Ejecutor** | **Asignado de la tarea**: un solo asignado por tarea. | Sí, vivo |
| **C · Consultado** | **@menciones** en comentarios de la tarea. Informal, sin campo rígido. | Informal |
| **I · Informado** | **@menciones** y señales de «requieren atención». | Informal |

RECI es una adaptación al español de RACI, para uso interno de Primate. Equivalencia formal: Responsable = Accountable, Ejecutor = Responsible, Consultado = Consulted, Informado = Informed. La adaptación elimina la trampa donde «Responsible» se siente como responsable final pero significa ejecutor.

> **Regla que sobrevive:** Lo que **no** cambia: una tarea no puede existir sin un **Responsable** (R) y un **Ejecutor/asignado** (E). Esa claridad mínima está por encima de la comodidad. Lo que se relaja es la exigencia de capturar C e I como campos formales en cada tarea.

---

## 11 — Entregables y exportación · Cómo Rizora produce documentos

Rizora genera documentos exportables que combinan información del sistema con plantillas predefinidas, reemplazando el copiar-y-pegar en Word o Pages.

**Documentos exportables a PDF:** Hoja de Llamado, Cotización (versionado), Contratos y Cesiones (módulo Legal), Crewlist, Plan de Rodaje, Reportes financieros, Reporte Inteligente de Cierre (ver §14), Mapa de Entregables, README para Cliente (automático).

**Exportación a Excel, JSON y bancos.** El Presupuesto exporta todo el cálculo a Excel. Entregables exporta su mapa en JSON técnico y Excel. **Office Banking (Santander, 13 columnas)** exporta transferencias masivas. **Chipax** recibe la información financiera. Todo vía SheetJS (xlsx) para archivos reales.

> **Principio de formato:** Los documentos exportados deben tener identidad visual consistente con el **Manual de Marca de Primate Films**: tipografías (Playfair, Gotham, Montserrat), colores, layout y espaciado. Ver §21 sobre la autoridad del Manual.

> **Principio nuevo · binarios:** **«base64 como puente, object storage como destino».** Todo binario (fotos, comprobantes, PDFs, adjuntos de tareas) usa base64 mientras es chico y cabe en Firestore; el destino real es object storage (Supabase Storage) en la Fase 2. Esto aplica de forma transversal, no por módulo.

> **Evolución del módulo (idea de horizonte — §24).** Conectado con el futuro módulo de **Post-producción**, Entregables pasará a organizar las entregas **por bloques con ID** (entrega 1, 2, 3…), llevar la cuenta de **rondas de corrección**, marcar entregas como históricas al ejecutarlas (con advertencia si ya se mostró al cliente) y guardar **nativo en Supabase** solo el entregable **final aprobado** (las entregas en proceso viven como enlaces externos). Detalle en §24.

---

## 12 — Manejo financiero · El dinero, en orden

El rol financiero de Rizora es operativo: registrar, calcular, conciliar internamente y preparar la información. La disciplina financiera es **nativa y global** —es la cuña que viaja a cualquier país— mientras la cañería tributaria local se mantiene desacoplada.

**Qué hace Rizora:**
- Construye presupuestos con cálculo de costos, márgenes y totales.
- Registra gastos reales, en espejo con la cuenta bancaria de producción.
- Compara **cotizado vs. real** al cierre, con margen efectivo.
- Gestiona pagos con sus condiciones (pronto pago, 30 días, contado).
- Rastrea DTEs recibidos y pendientes, por persona y proyecto.
- Calcula comisiones por proyecto cuando aplica.

**Qué NO hace (intencional):**
- No reemplaza a Chipax en conciliación bancaria global.
- No emite facturas formales (eso será vía integración SII).
- No es contador ni asesor tributario.
- No mantiene la contabilidad legal de la empresa.

*Cambio respecto al V2: Rinde Gastos ya **no** figura aquí. Rizora lo absorbe.*

**Capacidades financieras construidas (nuevas en el PRD):**

| Capacidad | Detalle |
|---|---|
| **Pronto Pago** | Concepto entero, inexistente en el V2. Marca por fila en el Presupuesto → condición de pago en los correos (subversión) → sub-pestaña Prontos Pagos en el CFO → export. |
| **Pagos Pendientes** | Reembolsos + Prontos Pagos, con KPI, en el módulo global CFO. |
| **Office Banking** | Export Santander de 13 columnas para transferencias masivas. Salida real construida, no integración bidireccional. |
| **Lógica tributaria central** | Boleta de honorarios **retiene 15,25%**; factura no. Es un principio del sistema —la comparten Legal, Presupuesto y Prontos Pagos—, no de un solo módulo. |

> **Postura unificada sobre Rinde Gastos (decisión de arbitraje 3):** El V2 se contradecía. El V3 cierra: el módulo **Gastos + CFO reemplaza a Rinde Gastos**. Es un rastreador operativo proyecto-céntrico con validación, reembolsos y export. Rinde Gastos queda como herramienta legada en transición y sale del horizonte de integración (§18).

---

## 13 — Portal de clientes · Trazabilidad para quien paga

El Portal de Clientes es la cara externa de Rizora: lo que ve un cliente al iniciar sesión. Genera confianza operativa al permitirle ver el avance del proyecto sin estar preguntando por mail.

> **Principio rector:** El cliente **solo ve lo que Primate Films decide compartir.** El Portal es una vista filtrada, no acceso al sistema. Preserva la confidencialidad de la operación interna (costos reales, márgenes, comunicaciones) y entrega la transparencia operativa que el cliente necesita.

**Qué ve el cliente:** avance por etapa; hitos completados y pendientes; entregables para revisión (ligado a Entregables); feedback de video al timecode (tipo Frame.io); aprobaciones requeridas; calendario de fechas clave; documentos compartidos (tratamientos, hojas); estado de pagos (sin detalle de costos internos); Reporte Inteligente de Cierre tras el cierre.

**Qué NO ve:** costos reales de proveedores; márgenes de Primate Films; comunicaciones internas; información de otros clientes o proyectos; borradores no aprobados internamente.

> **Precisión de backend · la separación la garantiza el servidor:** «El cliente solo ve lo que se decide compartir» depende de **autorización real en el backend**, que hoy no existe. Filtrar en la interfaz **no basta**: un cliente podría saltarse la UI. La separación interno/cliente se garantiza en el backend (políticas RLS + autorización por estado), nunca en el frontend. (Ver ADR-004 y §19.)

---

## 14 — Reportes inteligentes de cierre · El Spotify Wrapped del proyecto

Al cerrar un proyecto, Rizora genera un PDF de business intelligence que convierte el cierre operativo en aprendizaje organizacional. Es donde Rizora deja de ser un gestor de tareas y se vuelve inteligencia operacional.

**Qué contiene:**
- Diseño alineado al Manual de Marca.
- Resumen ejecutivo generado por IA, en lenguaje humano.
- Métricas clave: duración, días de rodaje, personas involucradas.
- Gráficos financieros: gastos por categoría, ingresos, márgenes, desviaciones contra presupuesto.
- Análisis de tiempos: cumplimiento de hitos, retrasos por etapa.
- Detección de anomalías: gastos inusuales, demoras inesperadas.
- Aprendizajes y conclusiones automáticas en lenguaje natural.

> **Dónde está el verdadero moat:** El reporte *por proyecto* es un *delighter*. El **agregado** —cuatrimestral, anual, multi-año— es el moat real y el lock-in: la data propia compone valor con el tiempo y eleva el costo de cambio. **Implicación de arquitectura no negociable:** el modelo de datos debe soportar agregación cross-proyecto desde el día uno, aunque la UI del reporte llegue después. (Cruza con ADR-005.)

**Reglas de marketing que el producto debe respetar:**
- **Sale sobre data firme o se vuelve en contra.** Una marca premium no puede mostrar un reporte equivocado. Por eso el reporte va *último* en la secuencia del core: primero se blinda la cadena financiera que lo alimenta.
- **Diseñar para presumir.** El reporte debe ser presumible y compartible: el asado entre fundadores es el canal de adquisición; el reporte es la munición.
- **Desempeño individual: memoria, no vigilancia.** Si se mide a personas, se permisa fuerte y se enmarca como «memoria de equipo», nunca ranking. Riesgo legal y de marca.
- **Claridad de costos, no la conclusión.** Se entrega la claridad (sueldos/equipos/freelance) en el producto; jamás se marketea la conclusión (despidos/optimización de planilla). El cliente concluye en privado.

> **Por qué puede ser el feature que vende el SaaS:** Muchas productoras gestionan proyectos; pocas extraen aprendizaje estructurado de cada uno. El Reporte de Cierre convierte a Rizora en **memoria operativa organizada**: un diferenciador que ningún competidor ofrece hoy.

---

## 15 — Seguridad y datos sensibles · Un blanco de alto valor

*(Sección nueva.)* Rizora guarda RUTs, datos bancarios, direcciones, teléfonos y mails —y a nivel SaaS, de miles de personas. Es un blanco de alto valor, y el daño escala con la cantidad. El V2 no tenía una sección que lo tratara como lo que es. El V3 sí.

**Controles base · no negociables:**

| Control | Detalle |
|---|---|
| **Cifrado en tránsito y reposo** | HTTPS/TLS y cifrado en reposo, con **llaves gestionadas por la plataforma** (no por el cliente; ver §17 sobre por qué). |
| **Mínimo privilegio** | Cada persona y cada componente accede solo a lo necesario. |
| **Minimización** | No se guarda lo que no se usa. |
| **No loguear secretos** | El audit log no contiene datos bancarios ni credenciales en texto plano. |

> **Qué significa «a prueba de balas»:** No significa invulnerabilidad absoluta —eso no existe. Significa **defensa en capas + servicios administrados serios bien configurados + guardar lo mínimo.** Gran parte de esto viene de fábrica con un Postgres administrado bien configurado. (Detalle en ADR-011.)

**Backups y recuperación.** Hoy el único «respaldo» es localStorage y exportación manual de JSON: eso no es un backup —vive en un dispositivo, depende de acción manual y nunca se probó restaurar. El versionado (§20) tampoco sustituye al backup: las versiones viven dentro de la base; si la base muere, mueren con ella. La Fase 2 exige backups **automáticos, off-site, encriptados, con múltiples puntos en el tiempo y restauración probada al menos una vez.** (Un backup nunca restaurado es una esperanza, no un backup. Ver ADR-010; la tolerancia RPO/RTO es decisión de negocio abierta, ADR-D.)

> **Actualización V3.2 · 8 de junio de 2026.** Implementado: **Supabase Pro activo**, con backups físicos diarios (retención 7 días) y **restauración validada** a un proyecto aislado el 8 de junio de 2026 (datos relacionales íntegros). Deuda conocida: los **objetos de Storage** (PDFs, fotos, adjuntos) **no** están cubiertos por el backup automático de la base de datos; requieren una estrategia de respaldo separada (pendiente). Detalle en ADR-010.

---

## 16 — Cumplimiento legal · Ley 21.719 · Un deadline real, no abstracto

*(Sección nueva.)*

> **Hito de negocio:** La **Ley 21.719** de protección de datos personales entra en plena vigencia el **1 de diciembre de 2026.** Está inspirada en el GDPR: Agencia fiscalizadora, deber de notificar brechas **sin dilaciones indebidas** y multas significativas. **Aplica a Rizora.** Fiscaliza evidencia operativa —logs, registros datados—, no buenas intenciones.

Esto convierte al audit log (§10) y a la observabilidad (logs, métricas, alertas) en **requisito de cumplimiento, no en lujo de ingeniería.** El diseño debe contemplar los derechos del titular y la capacidad de notificar brechas.

**Derechos del titular que el sistema debe soportar:** Acceso (ver qué datos suyos hay), Rectificación (corregirlos), Cancelación (eliminarlos), Oposición (negarse a ciertos tratamientos), Portabilidad (llevárselos).

> **Corrección de precisión (V3.3) — plazo de notificación de brechas.** La Ley 21.719 **no fija "72 horas"**: exige notificar a la Agencia "por los medios más expeditos y **sin dilaciones indebidas**", y avisar a los titulares cuando la brecha afecte datos sensibles, de menores de 14 años o de carácter económico/bancario. Las **72 horas** son de **otros marcos** (el RGPD europeo y la **Ley 21.663** / Ley Marco de Ciberseguridad, en su reporte a la ANCI). El estándar a usar para la Ley 21.719 es "sin dilaciones indebidas". (Detalle en ADR-012.)

> **Estado de los instrumentos legales (actualizado V3.6).** Existen **dos instrumentos en borrador, NO aptos para producción ni venta** hasta que un abogado habilitado los apruebe: (1) **Términos + Privacidad de cuenta** y (2) **Consentimiento de incorporación** a una productora. La infraestructura técnica de cumplimiento ya está lista (consentimiento versionado con copia exacta del texto; auditoría inmutable; aislamiento por organización — ADR-020, ADR-012). Y los **cinco flujos de derechos del titular** —borrado/supresión de cuenta, exportación/portabilidad, revocación del consentimiento, verificación de edad (si aplica) y aviso de cookies/analytics— ya están **construidos en UI y en producción** (Centro de Privacidad). Por lo tanto, lo que **falta NO es construir interfaz**, sino la **aprobación legal de los textos** (hoy provisionales) y el endurecimiento del aislamiento. *Prometer en los términos un derecho que la interfaz no entrega es, en sí mismo, un riesgo legal; aquí la interfaz ya está, falta que el texto lo respalde.* (Roadmap · Gate C.)

> **Qué requiere validación legal antes de lanzar:** Los detalles legales —delegado de protección de datos, evaluaciones de impacto, contratos de tratamiento— deben revisarse con un **abogado especializado** antes de lanzar. Las implicancias de ingeniería —cifrar, minimizar, registrar, aislar— son estables y ya están cubiertas (§15, §17, §19). (Detalle en ADR-012.)

> **Por qué entra al PRD y no solo al ADR:** No es solo técnico: es un hito con fecha que condiciona contratación, plazos y la fecha de lanzamiento comercial. Un PRD que no lo reconozca subestima el trabajo real de la Fase 2.

---

## 17 — Confianza del cliente y conflicto de interés · El problema del dueño que mira

*(Sección nueva.)* Rizora es propiedad del dueño de una productora y se venderá a otras productoras —su competencia. Estas confiarán datos extremadamente sensibles: presupuestos, márgenes, tarifas, clientes. Es razonable que desconfíen de que el fundador pueda verlos. No es solo privacidad: es **conflicto de interés competitivo**, y mal resuelto, frena la venta. Es un riesgo de adopción, no un detalle.

**Dirección recomendada — modelo de no-abuso de cuatro patas:**
1. **Estructural.** Mínimo privilegio + acceso **break-glass**: nadie tiene acceso permanente a datos de clientes; mirarlos exige una acción explícita, justificada y registrada.
2. **Auditoría.** Todo acceso queda logueado. La confianza se compra con control auditable.
3. **Reputacional.** El modelo de negocio mismo desincentiva el abuso: la marca de software vale más que cualquier dato robado a un cliente.
4. **Legal.** Ley 21.719 (§16) como respaldo. Acceso indebido es infracción con consecuencias.

> **Por qué las llaves las gestiona la plataforma, no el cliente:** Cegar técnicamente a la plataforma frente a los datos (llaves del cliente) **mataría el Reporte Inteligente y el Control Room cross-tenant** —el valor central del producto. La confianza se compra con **control auditable**, no con imposibilidad técnica. (Ver ADR-A y ADR-013.)

**Decisiones estratégicas asociadas:**
- **Separación societaria — confirmada como dirección (V3.3).** **La Hectárea SpA no será la Encargada del tratamiento de datos.** El software vivirá en una **sociedad nueva y separada**, que actuará como Proveedor/Encargado frente a las productoras; La Hectárea sigue siendo la productora audiovisual. Esto reduce la percepción de conflicto y reordena el moat: deja de ser «operación secreta» y pasa a «ser la empresa de software», con lo que la tensión Primate-confidencialidad queda obsoleta al vender SaaS. La **identidad del Proveedor** (razón social, RUT, domicilio) es **dato configurable** del sistema, no un valor fijo; mientras se constituye la sociedad, los textos legales usan «La Hectárea» como *placeholder*. (Ver ADR-A y ADR-012.)
- **Certificaciones (SOC 2 / ISO 27001).** Las más pedidas para vender confianza a otras productoras. No certifican imposibilidad técnica, sino que la organización cumple controles auditados. Si/cuándo perseguirlas es decisión abierta (ADR-E).
- **Política de uso de datos.** Datos agregados y anonimizados → defendibles, incluso una feature vendible. Datos crudos identificables → solo con consentimiento explícito (ADR-B).

> **Estado · decisión abierta crítica:** Esta es la decisión abierta **más crítica para la adopción** del SaaS. El PRD la reconoce como tema estratégico de primer orden; el modelo concreto (¿basta break-glass + audit para el mercado objetivo?) se cierra con el desarrollador y, eventualmente, con asesoría legal y de seguridad.

---

## 18 — Integraciones futuras · Conexiones con el mundo exterior

Rizora es un sistema operativo central, pero no debe convertirse en una isla. Principio rector heredado de marketing: **«lo nativo viaja, las integraciones anclan».** La disciplina financiera se mantiene nativa (cuña global); la cañería tributaria local va en cuarentena, por país, nunca cableada al core.

| Integración | Qué aporta | Prioridad |
|---|---|---|
| **SII** | La más valiosa estratégicamente: órdenes de compra por proveedor confirmado (previene fraude de facturas), emisión de facturas al cerrar, boletas a terceros, validación cruzada de DTEs. Local, en cuarentena por país. | Horizonte |
| **Chipax** | Conciliación bancaria global y nota de venta automática al aprobar. Export ya existe; integración bidireccional es horizonte. «Exportación, no obsesión». | Horizonte |
| **Office Banking** | Santander, 13 columnas. **Ya es export real construido** (no integración bidireccional). Figura como salida vigente. | Construido |
| **Google Calendar / Outlook** | Sincronización bidireccional de eventos del proyecto. | Futuro cercano |
| **Object storage / CDN** | Almacenamiento de archivos pesados (RAW, masters). Supabase Storage en Fase 2. | Fase 2 |
| **WhatsApp Business API** | Comunicaciones por el canal preferido del crew. | Fase 2 |
| **Stripe / Wise** | Pagos internacionales para clientes extranjeros. | Horizonte |
| **Uber API** | Agendamiento desde Plan de Locomoción. Nota de horizonte (≈2030), no módulo numerado. | Nota |

> **Cambio respecto al V2:** **Rinde Gastos sale de esta tabla.** Dejó de ser integración futura: Rizora lo absorbe como funcionalidad nativa (ver §12). Mantenerlo como «integración» contradecía la decisión de reemplazo.

---

## 19 — Arquitectura técnica y backend

*Reemplaza «Decisiones técnicas» del V2. Detalle completo en el ADR de Backend v1.*

El V2 difería casi todo al desarrollador. Eso cambió: la asesoría de backend cerró varias decisiones. Esta sección separa lo **decidido** (que el dev implementa, salvo argumento sólido en contra, levantado formalmente) de lo **aún abierto**. El PRD se mantiene narrativo; cada decisión remite al ADR para el porqué y las alternativas descartadas.

**Stack actual (sincerado).** HTML + CSS + JavaScript puro, sin frameworks. Dependencias reales y justificadas: **Firestore SDK** (sync en la nube), **SheetJS/xlsx** (exports Chipax / Office Banking / BD), **Google Fonts**. Persistencia hoy: Firestore + localStorage (este último como capa real y puente para binarios, con tope de ~5–10 MB). Deploy en **GitHub Pages** (migrado desde Netlify). El principio de «independencia del host» se mantiene como principio.

**Destino · Fase 2.** **Supabase / PostgreSQL** + Supabase Storage + Supabase Auth, **con backend / Edge Functions para la lógica crítica** (financiera y de autorización). No es «el navegador habla directo a la base con RLS sola»: la lógica sensible corre del lado servidor (decisión de arbitraje 1).

### Lo que ya está resuelto · decisiones aceptadas

| Decisión | Síntesis | ADR |
|---|---|---|
| **Arquitectura de tres capas** | Cliente → Backend (cerebro/guardián) → Base de datos. El cliente **nunca** accede a la base directo. | 001 |
| **Lógica y validación en backend** | «Nunca confiar en el cliente». Valores derivados se recalculan en servidor; entradas inválidas se rechazan. La validación de front es solo UX. | 002 |
| **Auth vía Google (OAuth)** | Estándar del rubro. Token verificado en cada request (stateless). Google dice quién eres, no qué puedes. | 003 |
| **Autorización por rol y estado** | RBAC (rol fijo) + ABAC (depende del estado del recurso). En backend, en cada request. El front solo refleja. | 004 |
| **Modelo relacional en PostgreSQL** | ≈24 tablas de **dominio** (la base viva suma **77 en total** con infraestructura, permisos, catálogos y auditoría — ver ADR-005). Relaciones por referencia, no por copia (fuente única de verdad). Soft delete y campos de auditoría. | 005 |
| **Concurrencia optimista** | Sello de versión por registro. Si dos guardan, el segundo se rechaza y rehace. Nunca pérdida silenciosa. | 006 |
| **Atomicidad** | Operaciones multi-paso son transacciones (todo o nada). Invariante: **no existe proyecto Cerrado sin Reporte de Cierre.** | 007 |
| **Versionado** | Con cada exportación acompañada de modificación. Excepción en cotización (manual). Corrige §16/§20. | 008 |
| **Migraciones de primera clase** | Probar en copia → respaldar → aplicar → verificar. Reversibles e idempotentes. Capturar datos temprano, construir tarde. | 009 |
| **Multi-tenant** | Base compartida con `tenant_id` + identidad global + Control Room cross-tenant. El backend filtra siempre por tenant. | 013 |
| **Archivos pesados** | Object storage + CDN; en la base solo la referencia. Acceso vía URL temporal firmada, con autorización. | 014 |
| **Prototipo = spec ejecutable** | El HTML es blueprint de comportamiento validado, no base de código de producción. El backend se construye nuevo. | 016 |
| **Lógica tributaria en la base, no en el cliente** | Toda tasa o regla tributaria (IVA, exenciones, honorarios/BHE, retención BTE) vive en la tabla `tax_rates`; el cliente la lee al iniciar sesión y nunca la hardcodea. Cambiar una tasa = una fila nueva en la base, no un deploy del cliente. | 018 |

### Lo que aún se decide · decisiones abiertas

| Decisión abierta | Qué falta resolver | ADR |
|---|---|---|
| **Acceso del fundador / conflicto de interés** *(Crítica)* | ¿Basta break-glass + audit para el mercado objetivo? Modelo de cifrado, separación societaria. (Ver §17.) | A |
| **Política de uso de datos** | Mecanismo de consentimiento, separación técnica identificable/agregado, alcance de cualquier uso para entrenamiento. | B |
| **Edición colaborativa en vivo** | Diferida (horizonte lejano) por costo. ¿Versión liviana de «presencia» que dé el 80% del valor? | C |
| **Tolerancia de pérdida/caída (RPO/RTO)** | Decisión de negocio: ¿cuántas horas de datos es aceptable perder? ¿cuánto downtime tolera la operación? | D |
| **Certificaciones SOC 2 / ISO 27001** | Si/cuándo perseguirlas, según mercado y etapa. | E |

**Lo que sigue abierto al desarrollador (sin ADR aún).** Framework de frontend, hosting específico de producción, dominio, infraestructura de envío de correo, y la integración concreta de WhatsApp Business API. Requieren expertise técnico que no tiene sentido resolver ahora.

> **Principio de migración · blindaje pedido por frontend.** El salto de JSON-en-HTML a SQL puede tentar a **reescribir el frontend.** No se hace. La recomendación, adoptada como principio: **Mantener el front igual al principio y cambiar solo la capa de datos.** Se introduce un *data layer* que hoy lee/escribe el objeto JSON global y mañana habla con Supabase, con la misma interfaz. Hoy todo cuelga de `currentUser()` y `STATE.adminMode`, centralizados a propósito: cuando exista login real, basta que el backend entregue un objeto de sesión con usuario + rol. Esto evita rehacer meses de front y conecta con el principio 10 de §02 («independencia de la herramienta»).

> **El «80% invisible» de la Fase 2.** La Fase 2 no es «backend + base + hosting» en una línea. Incluye: autenticación, autorización por rol y estado, validación en servidor, concurrencia, integridad transaccional, migraciones, backups, seguridad de datos sensibles, cumplimiento legal, multi-tenancy y observabilidad. Reconocerlo calibra contratación y plazos. El prototipo ya validó la *lógica de dominio* (lo difícil de adivinar); falta construir todo lo que lo sostiene.

---

## 20 — Versionado y estados · Nada se pierde, la última manda

El principio 9 (§02) dice «versionar en vez de eliminar». El V2 lo enunció con una regla demasiado amplia. El V3 lo precisa con la regla real de Primate y con su alcance correcto.

> **La regla de versionado corregida (ADR-008):** El V2 decía «toda modificación genera una versión». Es impreciso: llenaría el sistema de versiones por cada tecleo. La regla real: **Se versiona con cada exportación acompañada de una modificación** —no por modificar a secas, no por exportar lo mismo dos veces. Si exportas algo idéntico a lo ya exportado, no nace versión nueva. **Excepción: cotización/venta**, donde el versionado es *manual* (el PE crea la versión) y el sistema solo advierte si detecta cambios sin versionar.

> **Por qué la cotización es excepción:** Razón de negocio, no técnica: no tiene sentido mandarle «Versión 3» a un cliente que ve el presupuesto por primera vez. El PE decide cuándo una cotización merece un número nuevo. El sistema acompaña; no impone.

**Alcance de «no se elimina».** La no-eliminación **aplica a documentos versionables**, no a todo el sistema:
- **Versionables · no se eliminan:** Cotización, documentos legales, hoja de llamado, plan de rodaje. Se versiona; las versiones anteriores quedan accesibles. La última es la vigente.
- **Con ciclo propio · sí se borran:** Filas de presupuesto, gastos, tareas, contactos. Tienen su propia lógica de edición/eliminación (con soft delete y auditoría en Fase 2). Forzar versionado aquí sería absurdo.

> **Versionado ≠ backup:** Recordatorio de §15: el versionado vive **dentro** de la base de datos. Protege contra el error humano («volvamos a la versión anterior»), no contra la pérdida de la base. El backup es otra cosa, y es obligatorio (§15, ADR-010).

---

## 21 — Principios de UX y diseño · Cómo se ve y se siente

Rizora debe sentirse premium, claro y cinematográfico. La estética no es decoración: es parte del valor percibido y del posicionamiento de marca. Una herramienta que se ve seria, inspira confianza seria.

> **Autoridad de diseño · el Manual de Marca manda:** La autoridad visual de Rizora es el **Manual de Marca de Primate Films**, elaborado por Magdalena Ríos. **Existe en versión v0 (no oficial, en corrección).** Hasta que se finalice, el diseño actual opera con un sistema de **tokens CSS provisionales** que deben alinearse al Manual cuando esté listo —incluida la sustitución de cualquier fuente provisional por la tipografía oficial.

**Tokens de marca vigentes (del Manual v0):**

| Color | HEX |
|---|---|
| Negro principal | `#121214` |
| Gris oscuro | `#343436` |
| Rojo institucional | `#A71E26` |
| Base neutra | `#EAE8E1` |

| Tipografía | Rol |
|---|---|
| **Playfair Display** | Títulos y encabezados. Editorial, cinematográfica. |
| **Gotham** | Destacados y frases breves. *(Propietaria.)* |
| **Montserrat** | Cuerpo, datos técnicos, pies. |

> **Nota técnica:** **Gotham es una tipografía propietaria (de pago).** Cuando un documento de marca se componga sin licencia de Gotham, se usa **Oswald** como sustituto provisional para los destacados, por su carácter geométrico y condensado afín. Al licenciar Gotham (o definir su reemplazo oficial), Magdalena debe actualizar este token. La sustitución está acotada a los destacados; Playfair y Montserrat son las reales.

**El gesto de marca.** «La boina roja»: una base seria y sobria —negros, grises, neutro— con **un gesto cálido y distintivo**, el rojo institucional, usado con intención y sin saturar. La interfaz hereda ese principio: limpia y profesional, con el acento rojo reservado para lo que importa (alertas, acciones primarias, estados).

> **Persistencia al refrescar — RESUELTO (V3.6).** Antes, al recargar la página el usuario volvía siempre a su panel personal (o al Control Room, si era interno), sin importar dónde estaba. Ya se corrigió (V11.15.0): el refresco **te deja donde estabas** —si estabas dentro de un proyecto, en una pestaña, vuelves ahí—.

**UX adaptativa por tamaño** *(Horizonte).* La visión de adaptar la UX según el tamaño de la productora (de un freelancer a una casa grande) es **horizonte de producto, no algo construido**. Se documenta como norte, no como funcionalidad vigente. Hoy la UX está calibrada para el operador real: el equipo de Primate.

---

## 22 — Modelo de negocio y mercado · A quién se le vende, y por qué pagaría

*Dirección de marketing incorporada como decisión.* El V2 apenas esbozaba el negocio. El V3 incorpora la dirección de marketing como decisiones tomadas, no como exploración.

**Cliente ideal (ICP) y quién NO:**
- **ICP · productoras de publicidad.** Productoras audiovisuales **de publicidad**: alto volumen de proyectos simultáneos, mucho dinero en movimiento, mucho crew freelance, mucho caos por proyecto. Máximo dolor → máxima disposición a pagar.
- **El peor fit · freelancer suelto.** Poco caos que ordenar, poco valor percibido. Por eso **no hay un tier de pago barato pensado para el freelancer**: distraería del cliente que de verdad paga. El freelancer cabe en el plan **Gratis** (1 proyecto), que funciona como puerta de entrada, no como producto principal.

**Arquitectura de planes (estructura; las cifras viven en el One-Pager de Planes v3).**
El modelo es **premium**: no se compite por precio sino por valor percibido, diseño y profundidad operativa; el precio comunica categoría. La estructura tiene **cinco planes**:

| Plan | Rol | Para quién |
|---|---|---|
| **Gratis** | Puerta de entrada | Prueba por uso / productora muy chica. 1 proyecto activo, hasta 4 colaboradores. |
| **Rodaje** | Entrada de pago | Productora chica con varios proyectos. Proyectos ilimitados, hasta 4 colaboradores. |
| **Producción** | **Héroe** | Productora mediana, más carga. Hasta 12 colaboradores. Suma Notificaciones, Finanzas·CFO y Reporte de Cierre. |
| **Estudio** | Horizonte | Productoras grandes. Colaboradores ilimitados. Suma Portal de Clientes. No se muestra hasta el lanzamiento oficial. |
| **A medida** | Horizonte lejano | Gigantes / proyectos enormes. Cotización personalizada. |

> **Cupo de colaboradores: por proyecto (reconciliación V3.6).** Las cifras de colaboradores de la tabla (4, 12, ilimitado) son **por proyecto**, no por organización. Regla canónica: **cargos = colaboradores** —cada persona que ocupa un cargo en un proyecto cuenta una vez en ese proyecto— y los **internos de la organización no consumen cupo**. Ejemplo: una productora en Producción con 10 internos y un proyecto recién creado con 0 cargos tiene los **12 cupos del proyecto libres**. Esto **corrige** la definición previa (que entendía "colaborador" como el equipo de oficina y el cupo como por organización), que chocaba con cómo se construyó el enforcement. *(Implementación: el límite se aplica en `guardar_cargos`; `invitar_a_organizacion` ya no mide este cupo; ver ADR-004 v1.8.)*

**Las tres puertas de valor (gating por capacidad, no solo por plan):**
1. **Cantidad de proyectos** — separa Gratis (1) del resto (ilimitados).
2. **Notificaciones + Finanzas·CFO** (y con ellas el **Reporte de Cierre**) — separan Rodaje de **Producción**. Aquí está el salto de valor: es la línea premium.
3. **Portal de Clientes** — separa Producción de **Estudio**.

> **Reconciliación con el V3 anterior.** El V3 decía "sin tier barato de entrada" para no abaratar la marca; eso **se mantiene en el espíritu**: Gratis y Rodaje **no abaratan** el producto, son **embudo y ancla**. La marca y el margen se anclan en **Producción**, donde viven las capacidades que de verdad cuestan (Notificaciones, Finanzas·CFO, Reporte de Cierre). Gratis y Rodaje comparten exactamente las mismas features; su única diferencia es la **cantidad de proyectos**.

**Lógica de precios (cifras en el One-Pager v3, fuente viva):**
- **Mensual vs anual.** Hay precio **mensual** (mes a mes) y **anual** (se paga adelantado y trae **2 meses de regalo**: pagas 10, llevas 12). El mensual estándar es el **doble** del valor anual-por-mes.
- **Early Bird.** Tarifa de lanzamiento de **−50%**, **aplicable tanto al pago mensual como al anual**, durante los primeros 3 meses; es una **capa promocional conmutable**, no planes separados.
- **Definición de "colaborador" (para efectos de cupo) — corregida en V3.6.** Un colaborador que **consume cupo** es una persona que **ocupa un cargo en un proyecto** (regla **cargos = colaboradores**). Los **miembros internos de la organización** (el equipo de oficina/internos) **no consumen cupo**. El cupo se cuenta **por proyecto**, no por organización: el número del plan (ej. 12 en Producción) es el máximo de cargos por cada proyecto. *(Esto reemplaza la definición anterior, que contaba al "equipo de oficina"; ver nota de reconciliación abajo.)*

> **El moat:** El **Reporte de Cierre agregado** (cuatrimestral/anual/multi-año) es el moat: la data propia compone valor con el tiempo y eleva el costo de cambio (ver §14). No es una feature suelta; es la razón por la que un cliente se queda años.

**Competencia real:**

| Competidor | Lectura |
|---|---|
| **Wrapbook** | Competidor **real**, no aspiracional. Fuerte en nómina/pagos de crew y compliance. Referencia obligada de lo que el mercado ya espera resuelto. |
| **StudioBinder** | Fuerte en preproducción (guion, storyboard, hojas de llamado). Débil en la cadena financiera y de cierre donde Rizora apuesta. |
| **Movie Magic** | Estándar histórico de presupuesto/scheduling. Pesado, caro, anticuado en UX. El contraste de experiencia juega a favor de Rizora. |

**Secuencia de mercado y naming.** **Chile → Latinoamérica → EE.UU.**, en ese orden: validar y endurecer en casa, expandir a un mercado culturalmente cercano, después atacar el premium global.

**Naming comercial (abierto — ningún nombre es oficial todavía).** «Rizora» es **solo el nombre de trabajo/proyecto** y se reemplazará; **no es un nombre oficial en ningún lado**. La búsqueda: se **abandona el sufijo «-OS»** (difícil en español); *Keel* y otras opciones quedaron descartadas; el candidato principal es **Cinelium** (en clearance legal), con **Savia** de respaldo. *(El nombre «Mycelium» quedó bloqueado legalmente; el micelio se conserva como **territorio de posicionamiento**, no como nombre.)* Se espera fijar el nombre oficial en la próxima consolidación y cambiarlo en todos los documentos.

> **Independencia de marca (Marketing/GTM).** El producto se presenta como **marca independiente de Primate**: no comparte logo, tipografía ni paleta con la productora. La única conexión visible es el respaldo «**by Primate Films**». Es coherente con la separación societaria (§17): el software es su propia empresa, no una extensión de Primate. *(La narrativa de marca —incluida la metáfora del micelio como territorio— vive en los documentos de marca de marketing, no en este PRD.)*

> **Ideas de negocio en horizonte (§24).** Hay movimientos comerciales adicionales en exploración, registrados como ideas en §24: una **herramienta gratuita viral** (el Plan de Rodaje suelto para personas naturales, como muestra que jala a la venta de empresa), un **plan de pago para personas naturales**, y un **servicio de generadores de documentos a pedido** (la productora envía su plantilla y se adapta a su previsualizador). Ninguno desvía el foco actual: empresas (Beta + Early Bird).

---

## 23 — Roadmap por fases · El camino, por etapas

El V2 ponía a Primate en una Fase 1 que aún apuntaba a «core virtualmente operativo». Esa meta ya se superó. El V3 reescribe el roadmap para reflejarlo y para enmarcar el verdadero salto: la Fase 2.

**Fase 1 · Prototipo funcional** *(sustancialmente cumplida).* HTML+JS+Firestore. La lógica de dominio —lo difícil de adivinar— está validada y en uso real. Core hoy: Control Room, Info Proyecto, Base de Datos, Presupuesto, Crew, Gastos, Rodajes, Hoja de Llamado, Notificaciones, **Cotización, Plan de Rodaje, Locaciones, Legal, Documentos, Tareas/Colaboración, Finanzas·CFO y Responsable por sección.**
*Pendiente de Fase 1: correr **un proyecto real de principio a fin** por el prototipo. Ese es el gate para comprometer la Fase 2.*

**Fase 2 · Backend real** *(en curso).* Migración de JSON-en-HTML a **Supabase / PostgreSQL**, con backend/Edge Functions para lógica crítica. Manteniendo el front y cambiando solo la capa de datos (§19).
*Hito cumplido (8 junio 2026): la migración de la capa de datos a Supabase está terminada y Firebase fue clausurado (`deny-all`, SDK retirado en la V10). Esto corresponde al **Gate A del Roadmap, cerrado**. Continúa el resto del «80% invisible».*
*Incluye el «80% invisible»: auth, autorización por rol/estado, validación en servidor, concurrencia, transacciones, migraciones, backups probados, seguridad de datos sensibles, cumplimiento Ley 21.719, multi-tenancy y observabilidad. Aquí entra el **desarrollador profesional**; este PRD + el ADR son su brief.*

**Fase 3 · Producto multi-usuario** *(posterior).* Usuarios reales concurrentes (internos y freelancers), notificaciones vivas (correo + WhatsApp), confirmaciones de asistencia operativas, colaboración en tiempo (según ADR-C).

**Fase 4 · SaaS comercial** *(visión).* Portal de Clientes, onboarding self-service, facturación por suscripción, primeras productoras externas. Aquí se materializan las decisiones de §17 (confianza) y §22 (negocio). Secuencia Chile → Latam → EE.UU.

> **Faseo comercial (Marketing/GTM).** Dentro de la Fase 4, el lanzamiento va por etapas: **(1) Beta de feedback** —productoras amigas, **$1.000/mes × 6 meses** (no gratuito), a cambio de reuniones periódicas y un testimonio—; **(2) Early Bird** —lanzamiento público con −50% sobre mensual o anual, ventana de 3 meses, sin mostrar aún Estudio—; **(3) Lanzamiento oficial / GA** —aparecen Estudio y A medida, a precios estándar—. Se evita el término "alpha" para no invertir el orden. Detalle de planes y cifras en el One-Pager v3; secuencia operativa en el Roadmap §2 (Fases D–E).

> **Principio de secuenciación (de marketing):** El orden interno del core sigue la **cadena de confianza del dato**: primero se blinda la cadena financiera (presupuesto → gasto → conciliación → cierre); el **Reporte de Cierre va último**, porque solo puede presumirse si la data que lo alimenta es firme. Una marca premium no muestra un reporte equivocado.

---

## 24 — Horizonte de producto · Ideas no comprometidas

> **Cómo leer esta sección.** **Todo lo que sigue es IDEA, no decisión.** Es material de horizonte que se registra para no perderlo; no toca el roadmap canónico (§23) ni el pricing canónico (§22 / One-Pager de Planes v3) ni los planes vigentes. Varias de estas ideas Agustín las dejó **explícitamente abiertas a conversación y a darles una buena vuelta antes de escribir una línea de código.** Cuando algo madure, sale de aquí y se incorpora al cuerpo del PRD con su decisión.

### 24.1 — Módulo Post-producción *(idea de horizonte; ya bastante pensada)*

**El dolor.** La coordinación de post-producción hoy ocurre en un grupo de WhatsApp, y es un caos: el de VFX, el de sonido, el de color, el montajista y el director, todos mandando links de sus entregas, perdiéndose entre mensajes, con entregas a las que les falta algo. Ejemplo real: a un colorista le mandan un link con tres montajes para colorear cuando en verdad eran cuatro; no tiene cómo saberlo, colorea los tres, y al final aparece el cuarto sin color. Caos.

**La idea de módulo.** Una pestaña de **Post-producción** que ordena esa coordinación, con un funcionamiento parecido al del módulo de **Finanzas**: hay un responsable que va validando.
- **Responsable del módulo: el post-productor.** Es quien valida, igual que el jefe de finanzas con su módulo. Por encima, en lectura, el productor ejecutivo (ver más abajo).
- **Departamentos como fichas o columnas.** Los cuatro grandes: **montaje, sonido, color, VFX** (abierto a que falte alguno). Dentro de cada uno puede haber **sub-departamentos** (sonido → música, diseño sonoro, voz en off; VFX → motion graphics —quizá motion graphics merezca su propio departamento, a conversar—).
- **Nombres.** Los **departamentos macro tienen nombres fijos y un orden prefijado** (no se pueden modificar). Los **sub-departamentos tienen nombres personalizables con sugerencias** —como funciona la asignación de cargos: el sistema sugiere varios, pero quien quiera agregar uno específico puede hacerlo—.
- **Responsabilidades modulares.** Cada departamento tiene un responsable; el responsable del departamento macro puede **asignar sub-responsabilidades** a los sub-departamentos (p. ej. el de sonido asigna a alguien a música, a otro a diseño sonoro).

**Interconexión y cascada (el corazón del módulo).** Los departamentos están interconectados por sus dependencias. Cada cambio dispara notificaciones según a quién afecte:
- Un cambio que obliga a **revisar** a otro departamento → notificación **sutil**.
- Una acción que obliga a **actuar** a otro departamento → notificación **más fuerte**.
- Efecto cascada: un cambio de **montaje** obliga al colorista a recolorear ese momento, a VFX a revisar que no falte ningún efecto en el montaje nuevo, y al sonidista a revisar que el cambio no haya roto el sonido. Es un **sistema de requisitos y dependencias**, con alarmas automáticas.

**Validación (rol del post-productor y del director).**
- Cada cambio que requiera validación le llega al **módulo del post-productor** —que el resto no ve, igual que Finanzas—, como filas de cambios que él **valida o rechaza con comentario**. Validar un cambio (p. ej. un corte nuevo del montajista) **gatilla la secuencia** de acciones del resto de los departamentos. (Algunos cambios podrían no requerir validación; la mayoría sí.)
- **Director y productor ejecutivo (y quizá otros) tienen un módulo de solo lectura:** no pueden tocar, subir ni modificar, pero sí revisar todo y **dejar comentarios**.
- **Validación configurable por múltiples personas.** Se puede exigir que un cambio (o los de cierto departamento) lo validen no solo el post-productor sino también el director —o cuantas personas se definan—; el cambio no se considera válido hasta que todas validen. *(Idea suelta de UX: que el momento en que varios validadores coinciden conectados sea entretenido a nivel de experiencia.)*

**Cómo se suben las entregas (propuesta, a discutir con el chat de Cloud/BD).** En primera instancia, las entregas en proceso **no se alojan nativamente** —llenarían el storage de la productora demasiado rápido—. Propuesta: que cada responsable suba su contenido por el medio que la productora prefiera (Drive, WeTransfer, lo que sea) y el sistema **guarde solo el link**. Se podría **sugerir** un medio donde revisar sea rápido y ameno, e incluso explorar **previsualizar dentro del software sin descargar** (un reproductor embebido tipo Vimeo ilustra la idea, aunque Vimeo no sirve porque impediría descargar). El desafío técnico queda planteado: previsualizar sin que el binario viva en los buckets. *(Ver ADR-014.)*

> **Notificaciones móviles "gritonas" (idea de horizonte, ver §24.7).** En días de entrega final (online) no hay tiempo que perder, y si una persona de la cadena no actúa, frena a muchas. La idea de notificaciones de urgencia configurables nace aquí.

### 24.2 — Home / Vista de pájaro del proyecto *(idea de horizonte)*

**El problema.** Hoy, al entrar a un proyecto, el software lleva directo a **Info Proyecto**, que no es un lugar muy ameno para aterrizar. Falta un **"home" del proyecto**, una vista de pájaro.

**Dos vistas conviviendo en una misma pestaña (dos sub-pestañas):**
- **Modo nodos.** Un sistema de **nodos** (en la línea de la interfaz de **Milanote** que Agustín creó —el chat que desarrolle esto debería pedirle que se la muestre—). El productor ejecutivo ve la producción **desde una torre alta**, todo lo que pasa en simultáneo, con colores y alarmas, **muy estético** e **interactivo**: hacer clic en un nodo lleva a la pestaña respectiva, o notifica, o envía un mensaje. Lo más importante de este tab es que sea **visualmente muy fácil de entender**.
- **Modo dashboard.** En la línea del **home de Chipax**: le dice al usuario todo lo importante que requiere su atención y lo que falta por **consolidar y validar**, con una **barra de progreso por mes** que se llena y se pone verde cuando ese mes está completo (todo ordenado, tributado, nombrado, clasificado). Sumado a un **resumen financiero** del proyecto (cuentas por pagar, por cobrar, plata disponible, flujo de caja al pasado y proyectado). *(El chat que lo desarrolle puede pedir screenshots de Milanote y Chipax como referencia.)*

**Vistas por perfil.** Como todo en el sistema, tendrá **vistas distintas según el perfil de acceso** —probablemente ejecutivo, administrador y producción—; el resto quizá lo vea con limitaciones de lectura.

> **La sensación que se busca.** Que entrar a un proyecto se sienta como **Tony Stark entrando a su garage** ("*Daddy's home*" / "*Welcome back, sir*"): el productor ejecutivo sentado en su trono, viendo su reino y a todos reportando. La estética importa tanto como la información real, y la ambición es que la persona sienta que **sin el software está ciega**. *(Mundo de ejemplo acordado: El Señor de los Anillos.)*

### 24.3 — Entregables: nativos vs. externos *(refinamiento de §11, conectado con §24.1)*

Una vez que una pieza está cerrada, aprobada y final, **se mueve automáticamente** desde Post-producción al módulo de **Entregables**. Reglas que se imaginan:
- Las entregas aparecen **por bloques con ID** (entrega 1, 2, 3…), no como piezas sueltas desordenadas, para llevar un registro claro y la **cuenta de rondas de corrección** (muchas productoras ponen límite de rondas).
- Cuando una entrega se ejecuta, se marca como **entregada** y pasa a **histórica**; la siguiente pasa a ser la versión vigente.
- No tan restrictivo: se puede **modificar una entrega anterior**, pero con **advertencia** (igual que con otros documentos): si ya se mostró al cliente, no se debería tocar.
- Cuando el cliente, la agencia y todos aprueban el proyecto final (el publicable), esa última entrega se marca como **oficial** y se guarda **nativa en Supabase Storage**. Así, dos años después, el entregable está en el software y no perdido en un link de WeTransfer o un disco duro. El software se mantiene como **lugar único de verdad**.

### 24.4 — Herramienta gratuita viral + plan persona natural *(Marketing/GTM)*

> Foco actual = empresas (Beta + Early Bird). Esto **no** lo desvía. Pricing y alcance tentativos.

**Idea A — la herramienta gratis como canal viral** *(la más inmediata; evaluable incluso en Early Bird).* Regalar **una** herramienta del software a personas naturales —**probablemente solo el Plan de Rodaje** (la mejor que hay hoy)—, gratis, posiblemente **gratis para siempre** (hipótesis a evaluar). Triple propósito: **viralizar** (valor gratuito que se difunde solo), **recibir feedback** y funcionar como **muestra que jala a la venta**. Analogía: es **el queso que da a probar la promotora en el supermercado para que compres la caja**.

**Idea B — plan de pago para personas naturales** *(horizonte más lejano).* Un plan barato (referencia lanzada al aire: **~$25.000/mes, no es pricing**) con el **toolkit creativo** (Plan de Rodaje, hoja de llamado, etc.), **sin** la capa financiera/CFO ni multiusuario. Es la versión monetizada del mismo movimiento.

**Por qué tiene sentido (land-and-expand / PLG).** Cuando mucha gente use el software dentro de muchas productoras, descubre que las herramientas son **notablemente mejores** que lo que usa hoy. Ejemplo: el **Plan de Rodaje** en Excel es un calvario (cargar imágenes, reformatear, fórmulas que se corren, archivo pesado); en Rizora es intuitivo, **comprime las imágenes** (archivo liviano para enviar), formatea solo y **evita errores de tiempos** porque los calcula. Ese freelancer es **canal de distribución gratis**: se lleva la herramienta a su próximo proyecto, la recomienda, y cuando entra o arma una productora, **trae el producto de empresa con él**.

**Cuidados (explícitos).**
- **Limitar lo gratis a solo el Plan de Rodaje** —no la suite creativa, no lo financiero, no multiusuario—. Se da a probar el mejor pedazo, no la caja entera.
- **No es contradicción con el tier de USD 29 descartado.** Aquel era un tier barato *del OS de productoras*; esto es **otro producto** (una herramienta suelta para individuos) y otro motion.
- **No confundir con el plan Gratis de productoras.** El Gratis de productoras es 1 proyecto del core, para una empresa; esto es una **herramienta suelta para un individuo**. Hay que reconciliar la frontera cuando se active.
- **Cuidar la marca premium y la canibalización:** que ninguna productora chica pueda operar con lo gratuito en vez de pagar Rodaje/Producción.
- **Foco:** evaluarlo con cabeza fría para no dispersar el lanzamiento de empresa.

**Timing y métrica.** Idea A: evaluable tan pronto como Early Bird. Idea B: post-tracción, cuando haya volumen de individuos que ya aman las herramientas. La métrica que importará es la **conversión individuo → productora** (y gratis → pago): el retorno no es el plan barato, es el negocio de empresa que arrastra.

### 24.5 — Servicio de generadores de documentos a pedido *(idea importante)*

Un servicio que cuesta **$100.000 por documento**: la productora envía una plantilla hecha en Word, PDF o lo que sea, y se **adapta a su previsualizador y generador** dentro del software. Requiere que los **previsualizadores y plantillas estén aislados por productora** —una plantilla de cotización de la productora A **no** debe aparecerle a la B—, distinción que es tanto de frontend como de backend (ver ADR-021). En esa línea, **algunas plantillas son privadas**: Primate se guía por su plantilla **"Manifiesto"** (la que más le gusta), que **deja de ser pública** por ser la suya.

### 24.6 — Fotos de perfil de usuario / "LinkedIn de audiovisuales"

Que los usuarios tengan **foto de perfil**. Humaniza los equipos y aporta al norte del **"LinkedIn de audiovisuales"**. Técnicamente, un avatar asociado a la identidad global del usuario (`user_profiles`) guardado en Storage.

### 24.7 — App móvil con notificaciones configurables *(idea de horizonte)*

Cuando exista la **app de teléfono**, el usuario podrá **personalizar la urgencia** de ciertas notificaciones. Porque estas personas, además del proyecto, tienen otros proyectos y una vida (se van a almorzar, a un café); pero en días de **online / entrega final** no hay tiempo que perder, y una persona que no actúa frena a muchas otras de la cadena. Para esos casos, notificaciones **"gritonas"** (sonidos y vibraciones fuertes y constantes, tipo emergencia), **configurables por el usuario** —nadie puede imponerle a otro una notificación fuerte—. También por **mail** y, cuando esté conectada la **API de WhatsApp**, por WhatsApp.

### 24.8 — MCP server de solo lectura para reportería analítica *(idea de horizonte, sin compromiso)*

Una posibilidad para más adelante: exponer un **MCP server de solo lectura** —una Edge Function acotada— que permita consultar de forma analítica el **Reporte de Cierre** (y quizá otros agregados) desde herramientas externas, sin acceso de escritura a nada. Sería, en la práctica, una "ventana" segura para analizar datos del cierre con asistentes o herramientas de BI.

**Marco explícito:** es **idea de horizonte, no un compromiso**. No se promete como feature ni entra en ningún plan o pricing, y **no se documenta en el ADR** hasta que madure. Es **distinto del conector MCP de Supabase** que usan los chats internos (ese es una herramienta de trabajo del equipo; esto sería una capacidad de producto). Habilitaría análisis sin exponer la base; cualquier diseño concreto se conversa antes de escribir código.

---

## 25 — Plantilla permanente de changelog · Cómo se documenta cada versión

Todo cambio relevante en Rizora —software o documentación— debe registrarse con esta estructura. Es requisito permanente: ninguna entrega se considera completa sin su changelog. Garantiza que cualquiera pueda retomar el proyecto sin perder contexto.

| Campo | Contenido |
|---|---|
| **Versión** | Número (ej. V7.3.0). Mayor.menor.parche. |
| **Fecha** | De la entrega. |
| **Autor** | Quién la hizo. |
| **Cambios mayores** | Funcionalidad nueva o cambios estructurales. |
| **Cambios menores** | Mejoras, ajustes, refinamientos. |
| **Bugs corregidos** | Errores resueltos. |
| **Módulos afectados** | Qué partes del sistema cambiaron. |
| **Decisiones estructurales** | Decisiones de arquitectura o producto tomadas. |
| **Breaking changes** | Lo que rompe compatibilidad con la versión anterior. |
| **Pendientes conocidos** | Lo que queda sin resolver y se sabe. |
| **Estado de aprobación** | Borrador / En revisión / Aprobado. |

> **Por qué es innegociable:** Rizora se construye de forma incremental, muchas veces a partir de notas de voz consolidadas. Sin changelog formal, el conocimiento se fragmenta y el proyecto se vuelve dependiente de la memoria de una persona. El changelog es lo que permite que el cimiento —este PRD— y el software evolucionen sin perderse a sí mismos.

> **Recordatorio de despliegue (para versiones de software):** Aplica a entregas del archivo `index.html`, no a este PRD: renombrar el archivo nuevo a `index.html` → en el repo, «Add file» → «Upload files» → arrastrar `index.html` (el mismo nombre reemplaza al existente) → «Commit changes». GitHub Pages se actualiza solo en ~1–2 min. La URL no cambia; Firestore no se ve afectado.

---

## 26 — Glosario · Vocabulario común

- **PE** — Productor Ejecutivo. Responsable comercial y de cierre.
- **JP** — Jefe de Producción.
- **AD / AP** — Asistente de Dirección / Asistente de Producción.
- **DTE** — Documento Tributario Electrónico (boleta, factura).
- **Pronto Pago** — Condición de pago anticipado a un proveedor, negociada y marcada por fila en el Presupuesto.
- **Office Banking** — Export bancario (Santander, 13 columnas) para transferencias masivas.
- **Subversión de plantilla** — Cuerpo alternativo de una misma plantilla que el sistema elige por destinatario.
- **Señal / Requieren atención** — Bandeja de lo que necesita acción del usuario en Tareas.
- **Responsable por sección** — Un responsable por módulo del proyecto, con defaults por rol.
- **RECI** — Adaptación al español de RACI: Responsable, Ejecutor, Consultado, Informado.
- **Sesión simulada / currentUser()** — Puente que finge usuario+rol mientras no hay autenticación real.
- **Break-glass** — Acceso excepcional, justificado y registrado, a datos normalmente vedados.
- **tenant_id** — Identificador de la productora en el modelo multi-tenant.
- **base64 como puente** — Guardar binarios chicos embebidos hasta migrar a object storage.
- **Data layer** — Capa que aísla el acceso a datos: hoy lee JSON, mañana Supabase, con la misma interfaz.
- **RLS** — Row Level Security: reglas de acceso por fila en PostgreSQL.
- **RBAC / ABAC** — Autorización por rol / por atributo (incluye el estado del recurso).
- **RPO / RTO** — Tolerancia de pérdida de datos / de tiempo de recuperación ante una caída.
- **Moat** — Ventaja competitiva defendible; aquí, el Reporte de Cierre agregado.
- **AMR / AMROS / «core virtualmente operativo»** — *Términos históricos, obsoletos. No usar.*

---

### Cierre

Rizora nació de una incomodidad concreta: la producción audiovisual corre con demasiado caos, y ese caos se paga en dinero, en calidad y en salud. Este documento es el cimiento de la respuesta. No describe una herramienta: describe una forma de trabajar con control, claridad y trazabilidad.

La V3.0 hace algo que la V2.0 no podía: **decir la verdad sobre lo que Rizora ya es.** Dejó de ser un prototipo que promete. Es un sistema que opera, con un camino claro hacia convertirse en producto. Lo que sigue —el backend real, la confianza del cliente, la salida al mercado— está mapeado. El trabajo ahora es ejecutarlo sin perder los principios que lo hicieron valer.

> *«Take control of your production.*
> *Take control of your time.*
> *Take control of your life.»*

**Take control. Rizora.**

---

*© 2026 Agustín Ignacio Muñoz Rocha — La Hectárea SpA — Primate Films. Documento confidencial. Propiedad intelectual protegida.*
