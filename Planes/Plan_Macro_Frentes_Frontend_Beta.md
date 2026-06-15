# Plan macro — Frentes de frontend para llegar al beta

**De:** Dev (chat asesor / frontend)
**Para:** Claude Code, vía Agustín
**Fecha:** 15 de junio de 2026
**Base:** V11.14.0 (Frentes A/B/C de creación + privacidad + navegación ya integrados). Este plan es **lo que falta en frontend**, no lo ya hecho.

---

## Instrucción global para Code (confirmación)

Para **cada frente (letra)**, antes de tocar código: propón en **Plan Mode** la descomposición en **pasos chicos y revisables**, espera la aprobación del plan, y ejecútalo **paso a paso, commiteando cada uno**. Junto a cada diff, explica en simple **qué cambia, en qué función, y qué pantalla o flujo del usuario afecta**. Ya lo sabes; lo confirmo para que no quede duda: **ningún frente se hace de un viaje.**

Dos salvedades de proceso:
- El frente **D** (límites de plan) **no va directo a ti**: primero se diseña el copy/CTA en el chat Dev y lo aprueba Agustín; recién ahí se implementa.
- Partes de **A** y **C** están **esperando funciones de la base de datos** (BD Expert). Esas se cablean cuando la base las entregue, no antes. Lo que sí se puede adelantar va marcado.

---

## A) Los cinco flujos de Derechos del Titular — cablear la UI a la base
> *Cubre exportar, revocar, eliminar/anonimizar y verificación de edad. Las cookies van aparte, en el frente C.*

**Objetivo:** que estos derechos **funcionen de verdad**, no solo se vean.
**Estado:** la UI ya está construida (Centro de privacidad, V11.14.0), con sus puntos de conexión marcados en el código (`SEAM · BD Expert`). Falta el backend.
**Qué falta en frontend:**
- Cablear cada costura a su función de base cuando el BD Expert la entregue: exportar (`_pdExportSolicitar`), revocar (`_pdRevocarConfirmar`), eliminar y cancelar (`_pdElimConfirmar` / `_pdElimCancelar`) + el guard de único administrador en `_pdElimCargar`.
- **Construir la pantalla de "transferir administración"** (listar miembros internos y reasignar el rol Administrador). Es UI **nueva** y resuelve el bloqueo "no puedes borrarte si eres el único admin". **Se puede adelantar** (la pantalla no espera a la base).
- Verificar cada flujo de punta a punta cuando la base esté.
- Verificación de edad: hoy es opcional y no bloquea; queda a la espera de la decisión de producto (si aplica al titular y cuándo). Mínimo trabajo de frontend.
**Dependencia:** BLOQUEADO por la base, **salvo** "transferir administración" (adelantable).
**Criterio de éxito:** cada derecho ejecuta su acción real contra la base y queda registrado; borrarte exige transferir la administración si eres el único admin.

## B) El bug de refresco — dejar al usuario donde estaba
**Objetivo:** que recargar la página te devuelva a donde estabas (proyecto + pestaña), no siempre al Panel Personal o al Control Room.
**Estado:** sin resolver. No existe nada que guarde la última vista (hallazgo de Gate B).
**Qué falta en frontend:** persistir la vista actual (proyecto, módulo/pestaña) y restaurarla al arrancar, respetando la invariante (un externo nunca debe caer al Control Room).
**Dependencia:** NINGUNA. Puro frontend, listo para arrancar.
**Criterio de éxito:** estando en Documentos de un proyecto, F5 te devuelve ahí; un externo vuelve a su proyecto, nunca al Control Room.

## C) El banner de cookies — mostrarlo bien y recordar la decisión
**Objetivo:** que el aviso de cookies aparezca en la primera visita y no vuelva a molestar una vez que el usuario decide.
**Estado:** el banner y las preferencias ya están (V11.14.0); falta la memoria del lado del servidor.
**Qué falta en frontend:** cablear `_pdCookieBannerDecidir` / `_pdCookiesGuardar` al registro versionado de la base cuando exista, para derivar "primera visita / ya decidió".
**Dependencia:** BLOQUEADO por la tabla + función de cookies del BD Expert. La parte visual ya está.
**Criterio de éxito:** la primera visita muestra el banner; tras decidir no reaparece; la preferencia queda guardada en la base, no en el navegador.

## D) Límites de plan como momento de venta (no como muro) — DISEÑO PRIMERO
**Objetivo:** cuando alguien choca con un tope de su plan, que vea una **invitación a subir de plan**, no un portazo.
**Estado:** la base ya impone los límites y devuelve códigos de error (`TAKEOS_PLAN_LIMITE:proyectos:<máx>`, `:colaboradores:<máx>`, `TAKEOS_PLAN:finanzas`; reservados para después: `reporte_cierre`, `notificaciones`). El frontend todavía no los atrapa.
**Qué falta en frontend:**
- Una capa central que detecte esos prefijos y muestre la pieza marketera (copy + CTA "Ver planes" + a dónde lleva), usando el tope que viene **dentro del código de error** (sin escribir los números a mano).
- Avisos preventivos antes de chocar (ej. "te queda 1 proyecto en tu plan").
- Dejar preparado el manejo de los dos códigos reservados.
**Flujo (importante):** este frente **no va directo a Code**. Primero **se diseña en el chat Dev** (copy chileno, tono Primate, formato, CTA, momento), Agustín lo aprueba, y recién ahí pasa a Code. (Así lo pidió el BD Expert.)
**Dependencia:** backend listo; falta el diseño (Dev + Agustín) y luego la implementación.
**Criterio de éxito:** chocar un tope abre un momento de venta con CTA, nunca un mensaje de "no puedes".

## E) Cerrar el "permiso abierto por defecto" en la capa de interfaz
**Objetivo:** que la interfaz esconda de verdad lo que un perfil no puede ver (requisito del Gate B).
**Estado:** la maquinaria de permisos ya lee la matriz, pero `authNivelModulo` **da acceso total cuando no encuentra el módulo** (debería negarlo). El BD Expert lo marcó: hay que volverlo "fail-closed" (cerrado por defecto).
**Qué falta en frontend:** cambiar el valor por defecto de `authNivelModulo` de "acceso total" a "sin acceso", y verificar que cada módulo sensible efectivamente se oculte.
**Dependencia:** NINGUNA. Es pequeño pero de seguridad; conviene hacerlo temprano.
**Criterio de éxito:** si la app no sabe si un perfil puede ver un módulo, lo esconde por defecto; probado intentando saltarse la interfaz.

## F) Cartel de "acceso restringido" para externos dentro de un proyecto
**Objetivo:** que un externo, dentro de un proyecto, vea claro que solo está ahí por ese proyecto.
**Estado:** la invariante ya le impide ver el Control Room y ya existe el selector de espacios; falta el cartel explícito dentro del proyecto.
**Qué falta en frontend:** un aviso discreto ("colaboras como externo · solo ves este proyecto").
**Dependencia:** NINGUNA. Pulido de UX, bajo riesgo.
**Criterio de éxito:** un externo entiende su contexto sin confundirse con un interno.

## Menores (no son frentes, pero anótalos)
- **Validación de cuenta bancaria en el formulario:** hoy acepta cualquier número; agregar chequeo de formato cuando el BD Expert defina el estándar (hallazgo de Gate B; el bloqueo duro lo pone la base).
- **Limpieza de data demo:** el mundo de ejemplo acordado es **El Señor de los Anillos**; quedó data de Game of Thrones (Winterfell) mezclada.

---

## Orden de ataque recomendado (frontend)

Primero lo que no depende de nadie y rinde:

1. **E** (permiso fail-closed) — rápido y de seguridad (Gate B).
2. **B** (bug de refresco) — muy visible, Gate B, sin bloqueos.
3. **D** (límites de plan) — alto valor comercial; arranca con el **diseño en el chat Dev**, no en Code.
4. **F** (cartel de externo) — pulido corto.
5. **A** y **C** — cablear **a medida que el BD Expert entregue** cada función. La pantalla de **transferir administración** (parte de A) se puede **adelantar** porque es UI nueva que no espera a la base.

---

*Cada letra es un frente; Code la disecciona en pasos chicos y revisables (Plan Mode) antes de ejecutar. El bloqueo duro de permisos y planes lo garantiza la base; el frontend refleja y vende.*

*— Dev (chat asesor / frontend)*
