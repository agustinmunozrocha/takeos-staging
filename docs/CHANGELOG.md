# Changelog — TakeOS

## V11.21.0 — 27 de junio de 2026
### Presupuesto: columnas de ancho ajustable (como Excel) · Equipo: internos/externos por proyecto

Rama `chore/pasada-2y3-presupuesto-equipo` (Pasadas 2 y 3 del plan de cambios
acumulados). Solo **frontend**, sobre tablas/RLS/RPC ya existentes.

**Presupuesto · ancho de columnas redimensionable a mano**
- La tabla pasa a `table-layout: fixed`: cada columna tiene un ancho exacto y el
  ancho total es la suma, así que al ensanchar una columna la tabla **crece**,
  empuja a las de la derecha y aparece **scroll horizontal** (antes Nombre y Rol
  se peleaban un ancho fijo y el resto no se movía).
- **Todas** las columnas se ajustan arrastrando el borde derecho de su encabezado,
  **1:1** con el cursor. Cada columna tiene su **mínimo y máximo propios** (p. ej.
  Nombre 120–300, DTE y DTE real 100–180, Cantidad 60–100, Costo cotizado/real/Valor
  110–150). **Doble clic** restablece al ancho por defecto.
- El ancho se guarda por (sección, columna) en `localStorage`: sobrevive a recargas,
  cambios de sección y al colapso del detalle cotizado.
- Se **preserva la posición de scroll horizontal** de cada sección al ordenar,
  restablecer o editar una fila (antes la vista saltaba a la izquierda).

**Equipo · internos y externos separados, externos agrupados por proyecto**
- La lista del equipo se divide en **Internos** (ven todos los proyectos) y
  **Externos** (solo los asignados), en secciones separadas.
- Los **externos se agrupan por proyecto** (subsecciones): solo aparecen proyectos
  **activos** con al menos un externo; los que no tienen proyecto activo van a un
  grupo aparte para no desaparecer. El vínculo externo↔proyecto se **lee** de
  `project_cargos`. Sin cambios de base.
- Se quita la columna **"Tipo"** (redundante con la sección): la conversión
  interno↔externo pasa a un botón **"Hacer interno / Hacer externo"** por fila, con
  las mismas guardas (Admin y Finanzas solo internos; candado del último Administrador).

## V11.20.0 — 27 de junio de 2026
### Finanzas y Plan de Scouting: renombres, fix de "Observar" y contacto con combobox

Rama `chore/renombres-finanzas-scouting` (Pasada 1 del plan de cambios acumulados).

- **Finanzas (CFO):** la columna "Facturará" pasa a **"Ingreso"** (también en el modal de registrar pago).
- **Fix · "Observar" no hacía nada:** usaba `window.prompt`, que el navegador suprime tras varios diálogos. Ahora abre el **modal propio del software** con un campo de comentario; el gasto queda "En observación".
- **Plan de Scouting · renombre:** columna "Qué revisar" → **"Notas"** (texto libre).
- **Plan de Scouting · contacto unificado:** se elimina la columna duplicada; queda **un solo "Contacto"** con el combobox de la BD (filtra al tipear; ofrece "+ Agregar a la BD"). Dos campos, **nombre + celular**, con el celular autocompletado desde la ficha si el nombre está en la BD, o desde el contacto de la locación por defecto. Pelota ámbar **clickeable** si el contacto no está en la BD (abre su alta). Tooltip explicativo. Orden de columnas Contacto → Notas. Export PDF alineado.

## V11.19.0 — 26 de junio de 2026
### Gastos: los comprobantes se suben de verdad a Storage (fin del bug de la `blob:` URL)

Rama `fix/gastos-comprobante-storage`. Bug de pérdida de datos silenciosa: al
adjuntar un comprobante a un gasto, el cliente guardaba una `blob:` URL efímera
del navegador (moría al cerrar la pestaña) en vez de subir el archivo. El bucket
`adjuntos-gastos` y su RLS ya existían; faltaba cablear la subida. **Sin cambios
de BD.**

- **Subida real a Storage al adjuntar.** El archivo se sube al bucket privado
  `adjuntos-gastos` (path `{org_id}/{project_id}/…`, exigido por la RLS) y en el
  movimiento se persiste el `filePath`, no la `blob:` URL. Mismo patrón que
  documentos-proyecto / adjuntos-tareas. Aplica a "Agregar gasto", edición y
  captura rápida.
- **Ver/descargar por URL firmada temporal** (bucket privado): imágenes con
  preview inline; HEIC y PDF se descargan/abren (sin preview en el navegador).
- **Adjuntos legados rotos** (las `blob:` muertas de Fair Trade y similares): se
  muestran como "⚠ re-subir" con aviso de que el archivo no quedó guardado y hay
  que re-adjuntarlo desde el origen; no se intenta abrir una URL muerta.
- **Reemplazo limpio:** al cambiar el comprobante de un gasto se borra el objeto
  viejo del bucket. Si la subida falla, no se persiste una referencia muerta.

## V11.18.0 — 22 de junio de 2026
### Gastos: editar un gasto ya registrado

Rama `fix/gastos-editar-gasto`. El módulo de Gastos no permitía **modificar** un
gasto ya hecho (solo crear, ver comprobante y cambiar estado), y equivocarse al
rendir es habitual. Cambio acotado al **frontend** (monolito); los gastos viven
en el JSON del proyecto (`project.data.gastosOp.movimientos`), no en la base.

- **Botón "editar" por fila** (nueva columna "Acciones" en el Registro de gastos):
  reabre el mismo modal **precargado** con todos los datos del gasto.
- **`goSaveGasto()` actualiza el gasto en su lugar** (mismo id) en vez de crear
  uno nuevo. "+ Agregar gasto" sigue creando como siempre.
- **El comprobante actual se conserva** si no se adjunta otro; adjuntar uno lo
  reemplaza. Los datos de pago de persona nueva se conservan si no se reingresan.
- **Re-validación al editar.** Un gasto editado vuelve a "Por revisar" (si está
  completo) o "Pendiente": una validación previa del CFO queda obsoleta cuando
  cambian los datos. Se conservan fecha de pago y fecha objetivo.

## V11.17.0 — 22 de junio de 2026
### Panel de Equipo: cambiar interno/externo y quitar del equipo

Rama `feat/personal-cambiar-tipo-echar`. En **Configuración → Equipo**, el
Administrador ahora puede gestionar la relación de cada persona con la productora,
no solo invitarla. Cambio acotado al **frontend** (monolito), sin tocar la base.

- **Cambiar tipo de relación (interno ↔ externo).** La columna "Tipo" pasa de
  texto a desplegable. El tipo define qué proyectos ve la persona (ADR-004):
  interno → todos; externo → solo los asignados. Pide confirmación antes de aplicar.
- **Quitar del equipo.** Botón "Quitar" por fila: pasa la membresía a
  `estado='inactivo'` (el estado "revocada" del ADR-004; **no** es borrado físico),
  corta el acceso de inmediato y la oculta de la lista; queda registro en la
  auditoría. Para reincorporarla hay que volver a invitarla.
- **Guarda de coherencia tipo×perfil.** No permite dejar a alguien como externo
  con perfil Administrador o Finanzas (misma regla que el RPC de invitación), en
  ambos sentidos (al cambiar tipo y al cambiar perfil).
- **Seguros (reutiliza el patrón del cambio de perfil ya existente):** UPDATE
  directo a `memberships` protegido por la RLS (solo Administrador) y el trigger
  del último Administrador (no se puede quitar ni degradar al único admin). Los
  diálogos usan el modal del software (`showModal`), no el popup del navegador.

## Seguridad basal del beta (§6) — 16 de junio de 2026
### CSP acotada vía `<meta>` (ítem 5) + cierre confirmado del XSS de `<img src>` (ítem 3)

Cierre de los dos ítems de seguridad del frontend de la lista corta del beta
(rama `seguridad-csp`). No cambia comportamiento de la app; es endurecimiento.

**Ítem 5 · Content-Security-Policy (camino 1)**
- Se agregó una **CSP acotada** en el `<head>` de `frontend/index.html`, vía
  `<meta http-equiv="Content-Security-Policy">`.
- Conserva `'unsafe-inline'` en script/style (el monolito usa manejadores
  inline, un `<script>` inline gigante y `style="..."` por todos lados; una
  CSP estricta sin `'unsafe-inline'` rompería la app), pero cierra el resto de
  vectores: `object-src 'none'`, `base-uri 'self'` y orígenes restringidos.
- Orígenes permitidos según el uso **real** del código: scripts de
  `cdn.jsdelivr.net` (supabase-js + xlsx) y `cdnjs.cloudflare.com`
  (xlsx/exceljs bajo demanda); estilos de Google Fonts; datos a `*.supabase.co`
  (REST + realtime `wss`); imágenes `data:`/`blob:`/`https:` (URLs firmadas de
  Storage); `frame-src 'self' blob:` para el preview de cotización (`srcdoc`),
  la impresión (`about:blank`) y los PDF/descargas.
- `frame-ancestors` (anti-clickjacking) **no aplica vía `<meta>`**: queda
  documentado en el código para ir como header de hosting
  (`Content-Security-Policy: frame-ancestors 'self'` o `X-Frame-Options: SAMEORIGIN`).

**Ítem 3 · XSS en `<img src>`**
- Verificado **ya cerrado**: `safeUrl()` valida el esquema (solo `http`/`https`/
  `blob`/`data:image`; bloquea `javascript:` y `data:text/html`) y escapa el
  resultado; se usa en todos los `<img src>` construidos por template. Sin
  cambios de código.

**Pendiente (post-beta):** CSP estricta con nonce/hash (retirar `'unsafe-inline'`)
durante/después de la modularización; `frame-ancestors` por header de hosting.

## V11.14.0 — 15 de junio de 2026
### Flujo de creación de productora + Centro de privacidad y datos

Integración de los tres flujos de los mockups al monolito (rama `flujo-productora`).
Las operaciones sensibles (crear organización, exportar, revocar, borrar/anonimizar,
registrar cookies) son **server-side**: la UI quedó cableada o contra contrato, con
los puntos pendientes documentados para el BD Expert (`Handoff_BD_Expert.md`).

**Frente A · Crear productora (flujo nuevo)**
- Flujo completo disparado por `?plan=<gratis|rodaje|produccion>` desde la landing:
  datos de la productora (con **RUT validado**, módulo 11) → términos y condiciones
  (texto provisional) → pago (resumen con **IVA leído de `tax_rates`**, tras un
  *feature flag* apagado) → **creación real** (`provisionar_organizacion`) → entrada
  al Control Room.
- **Tour inicial** de 6 pasos sobre el Control Room real, con proyectos de ejemplo.
- Plan **Gratis** sin fricción (solo el nombre); la organización nace `free`.

**Frente B · Centro de privacidad y datos (Ley 21.719)**
- Hub **«Privacidad y datos»** en el Panel Personal, con los cinco derechos del titular.
- **Descargar mis datos** (export / portabilidad).
- **Productoras con acceso** + **revocar consentimiento** (lista real desde `data_consents`).
- **Eliminar mi cuenta**: **anonimizar** (no borrado físico) + período de gracia de
  **30 días**, con **guard de único administrador**.
- **Verificación de edad** (condicional, "si aplica" — no bloquea).
- **Cookies y analítica** (preferencias + banner).

**Frente C · Navegación multi-organización**
- Selector **«Cambiar de espacio»** en la barra superior: Panel personal · tus
  productoras (Control Room) · proyectos externos (solo el proyecto, nunca un
  Control Room ajeno).

**Otros**
- Botón **«Salir»** en el Panel Personal.

**Pendiente de backend (BD Expert)** — ver `Handoff_BD_Expert.md`: RPCs de
exportación, revocación, borrado/anonimización (+ transferir administración) y
registro versionado del consentimiento de cookies; RLS interno/externo (C2/C3);
y que `provisionar_organizacion` rechace a usuarios menores de edad.
