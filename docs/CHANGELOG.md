# Changelog — TakeOS

## V11.30.0 — 29 de junio de 2026
### Base de Datos: archivar / restaurar (Administrador) + logo Chipax

Rama `feat/bd-archivar-frontend-chipax`. **Frontend** que cablea los RPC admin-only ya
desplegados en producción (migración de archivar, PR #9). Fase B del borrado de BD.

**Archivar / restaurar (solo Administrador)**
- En la ficha de edición de **personas, empresas, talentos y locaciones** aparece un botón
  **"Archivar"** (con Modo administrador activo). Archivar = soft-delete: el registro
  desaparece de la BD pero **no se elimina** y **no rompe gastos ni proyectos históricos**.
- Nuevo botón **"🗄 Archivados"** en la barra de la BD: lista lo archivado y permite
  **restaurar** cada item. Todo vía los RPC `archivar_*` / `restaurar_*` (admin-only,
  verificados en el servidor).
- La carga de **locaciones** ahora filtra `deleted_at` (contactos/empresas ya lo hacían),
  así lo archivado deja de aparecer en la BD.

**Chipax**
- Se monta el **logo de Chipax** en el recuadro "Usamos Chipax" del perfil de la productora.
- Se elimina el campo **"Link a tu Chipax"** (sobraba) y su código asociado.

## V11.29.0 — 29 de junio de 2026
### Presupuesto "no va a rodaje", ficha de proveedor y remitente movido a Notificaciones

Rama `feat/rodaje-ficha-proveedor-remitente`. Solo **frontend**. Tandas 3 y 4 de la nota de voz, en una pasada.

**Presupuesto · "No va a rodaje"**
- En la columna Confirmado, al confirmar a alguien aparece un toggle **"no rodaje"**. Marcado,
  la persona queda **fuera del Crew, la Hoja de Llamado y el correo de Producción**, pero
  **sigue contando para los pagos** (reembolsos / prontos pagos). Resuelve el caso de gente
  confirmada que no asiste al rodaje.

**Empresas · ficha de proveedor**
- La ficha de una empresa ahora distingue **cliente vs proveedor**. Para proveedores muestra
  **Total a este proveedor** (gastos en todos los proyectos), **# proyectos**, **# gastos** y
  **último gasto**; los KPIs de cliente (margen, ticket, días de pago) dejan de aparecer en
  empresas que son solo proveedor. Las que son cliente y proveedor muestran ambos bloques.
  (El total cruza el nombre del proveedor escrito en cada gasto, texto libre.)

**Perfil productora · remitente**
- Se eliminan los **3 campos de Remitente** del perfil de la productora: el remitente ahora se
  edita solo en el módulo **Notificaciones**. Los correos lo leen desde ahí, con respaldo al
  valor antiguo para no perder lo ya configurado.

## V11.28.0 — 29 de junio de 2026
### Finanzas: prontos pagos por proyecto, marcar pagados y gastos validados accesibles

Rama `feat/finanzas-prontos-validados`. Solo **frontend**. Tanda 2 de la nota de voz.

**Prontos pagos**
- Nuevo botón **"Marcar pagado"** por fila (con fecha, por defecto hoy): el pronto pago baja
  a un bloque **"Pagados"** con fecha editable y **"deshacer"**, igual que los reembolsos.
- Los pendientes ahora se **agrupan por proyecto** en subsecciones, cada una con su botón
  **"Exportar Santander de este proyecto"**. Se mantienen los export globales (todos /
  consolidado con reembolsos). Ya no hay que entrar al proyecto a desactivar prontos pagos
  para exportar uno solo.
- Los prontos pagos ya pagados **se excluyen** de las nóminas Santander (antes se exportaban
  todos).

**Por proyecto**
- Cada proyecto tiene un botón **"Ver validados (N)"** que despliega ahí mismo los gastos ya
  validados (fecha, presupuesto, concepto, quién gastó, monto y comprobante descargable),
  para revisarlos y bajar comprobantes **sin entrar al proyecto**.

## V11.27.0 — 28 de junio de 2026
### Quick wins: saneo del perfil, Finanzas (ex-CFO), tareas legibles y aviso de choque en Gastos

Rama `chore/quick-wins-takeos`. Solo **frontend**. Tanda de arreglos chicos pedidos por nota de voz.

**Perfil de la productora · tab Diseño**
- Se elimina el botón "Agregar isotipo provisional (AMR)" (rastro hardcodeado de marca ajena).
- **Bug del color HEX corregido:** el campo rechazaba códigos válidos. Ahora sanea la
  entrada (tolera el `#`, espacios y caracteres invisibles del copy-paste) y acepta el
  atajo de 3 dígitos (`#fff` → `#FFFFFF`). Antes solo funcionaba por el selector RGB.

**Renombre CFO → Finanzas**
- El módulo deja de llamarse "Finanzas · CFO": en el botón, el buscador, el breadcrumb, los
  títulos y los avisos pasa a ser solo **"Finanzas"**. (Sin tocar identificadores internos,
  el changelog histórico ni el nombre del perfil de permisos "Finanzas / CFO".)

**Tareas más legibles**
- Los **saltos de párrafo** de una tarea (y de sus comentarios) ahora **se conservan** al
  mostrarla, para poder dejar tareas en formato tipo correo.
- El botón para comentar mostraba un emoji roto ("U0001F4AC"): ahora dice **"Comentar"**
  (con el conteo del hilo). Se arreglan también los íconos 📎 de adjuntos, que mostraban
  "U0001F4CE".

**Gastos · aviso de choque de Costo Real**
- Al asignar un gasto a una línea de Presupuesto que ya tenía un **Costo Real cargado a
  mano**, el sistema ahora **avisa antes de sobrescribirlo** ("¿quieres continuar?") en vez
  de reemplazarlo en silencio.

## V11.26.0 — 28 de junio de 2026
### Gastos: la devolución de caja persiste y "Observar" pasa a ser un hilo de comentarios

Rama `feat/gastos-caja-devolucion-hilo-observar`. **Frontend** que cablea el backend
del PR8 (migraciones ya desplegadas): no cambia el esquema, solo lo usa.

**Caja de producción**
- La **devolución** de caja y la **libreta de movimientos** (ingresos/devoluciones)
  ahora **se guardan** (antes vivían solo en pantalla y se perdían al recargar). El
  ingreso ya persistía; ahora persiste toda la caja, vía `guardar_operaciones_4b`
  (columnas `caja_devuelto` / `caja_movimientos`).

**"Observar" un gasto**
- El comentario de "Observar" deja de ser un campo único que se sobreescribía: pasa a
  ser un **hilo de conversación** (mensajes en secuencia, con autor y fecha), de modo
  que el aprobador (CFO) y el rendidor **ya no se pisan** el comentario.
- La **nota del registro** del gasto se conserva aparte y se muestra como primer globo.
- El CFO comenta desde **Observar**; el rendidor responde desde el botón **💬 responder**
  en el registro de Gastos del proyecto. El hilo vive en la tabla `gasto_comments`.

## V11.25.0 — 28 de junio de 2026
### Hoja de Llamado: override de campos, filas movibles, previsualizador y columnas redimensionables

Rama `feat/hoja-llamado-filas-movibles-override` (Pasada 7 del plan). Solo **frontend**.

**Citaciones del crew**
- **Override de campos**: Rol, Número y Nombre del crew pasan a ser editables para
  ese día (la identidad interna no cambia). Cada campo editado muestra un **↺** para
  restablecer al valor de origen (Presupuesto/BD), con tooltip.
- **Filas movibles**: reordenar con drag & drop (agarre ⠿, patrón del Plan de Rodaje)
  en las tablas de Crew y Externas; el orden del crew se guarda por día.
- **Columnas redimensionables**: el ancho de cada columna se ajusta a mano (arrastrar
  el borde, doble clic restablece, se persiste), reutilizando el sistema del Presupuesto.

**Exportar PDF**
- "Exportar PDF" abre un **previsualizador** (motor `CotPreview` + shell de la
  cotización) alimentado por el mismo HTML de siempre — **el PDF no cambia**.
- Panel lateral con control de **márgenes** (se refleja en el preview y en el PDF, vía
  `padding` en pantalla y `@page` en impresión); el resto (color, tipografía, logo)
  queda como placeholder para ir poblándolo.
- El documento se muestra con **paspartú** (margen visible) en el preview.

## V11.24.0 — 28 de junio de 2026
### Plan de Scouting: rediseño completo (línea de tiempo, alternancia, Maps y previsualizador)

Rama `feat/scouting-alternancia-paradas-libres` (Pasadas 5 y 6 del plan + tres
correcciones). Solo **frontend**.

**Estructura y alternancia**
- Las **paradas ya no tienen duración**; la duración vive solo en los **traslados**
  (tiempo de viaje). La cascada de horas y el «término aprox.» se recalculan con los
  traslados (ignora la duración aunque venga en datos antiguos).
- **Traslados automáticos**: agregar una parada después de otra inserta el traslado
  conector solo; borrar una parada se lleva su traslado. Nunca quedan dos paradas ni
  dos traslados seguidos; el plan siempre empieza en parada.
- El traslado pierde el texto «de … a …» (redundante con la alternancia).

**Línea de tiempo (rediseño, mockup del Dev como referencia)**
- La tabla pasa a una **línea de tiempo**: cada parada es una tarjeta con badge
  **Locación** / **Parada libre**, su hora a la izquierda, dot y conector.
- **Fecha/hora** quedan en una tarjeta separada de **«Quiénes van»** (chips): agregar
  personas ya no mueve la fecha/hora.
- La **hora de inicio** se edita en su campo **y** en la hora de la primera parada.
- **Reordenar paradas con drag & drop** (agarre ⠿, patrón del Plan de Rodaje); los
  traslados se mantienen y la alternancia se conserva.

**Locaciones y Google Maps**
- El campo de locación es un **combobox igual al de personas** (typeahead sobre la BD
  de locaciones) con **bola naranja** para crear la locación en la BD y sumarla al
  proyecto. Se admiten **paradas de texto libre**.
- Por parada: **«Buscar en Maps»** (abre Maps con el texto para verificar la ubicación)
  y campo para pegar el link → **«Ver en Maps»**.
- **«Crear ruta en Maps»**: abre Google Maps con todas las paradas en orden.

**Exportar PDF**
- El export se rehace con el **previsualizador** (motor `CotPreview` + shell de
  `cotPreviewPDF`), alimentado por un builder propio del Scouting, y exporta con
  `printViaIframe`. El rediseño estético del PDF queda para otra pasada.

## V11.23.0 — 28 de junio de 2026
### Empresas en los comboboxes: filtro por tipo + alta exprés con solo el nombre

Rama `feat/empresas-combobox-tipo-alta-expres` (Pasada 4.1 del plan de cambios
acumulados). Solo **frontend**: el campo Tipo de la empresa y su persistencia a
Supabase ya existían.

- Los **proveedores y clientes** se eligen como las personas: el desplegable
  **filtra por el Tipo** de la empresa y permite **crearla al vuelo** escribiendo
  solo el nombre.
- En **Gastos**, el campo **Proveedor** muestra solo empresas marcadas como
  Proveedor (incluye «Cliente, Proveedor») y ofrece **«+ Agregar empresa
  proveedora a la BD»** cuando no hay coincidencias.
- En **Identidad del proyecto**, el campo **Empresa cliente (BD)** filtra a
  Clientes y permite el alta exprés (crea **y** vincula); el campo **Cliente**
  (texto) sugiere Clientes.
- Si la empresa **ya existe** con otro tipo, **no se duplica**: se le suma el rol
  que falta (un Cliente pasa a «Cliente, Proveedor»).
- Sin cambios en **Empresa asociada** (personas) ni **Agencia**: siguen mostrando
  todas las empresas.

## V11.22.0 — 28 de junio de 2026
### Gastos ↔ Presupuesto: Costo Real alimentado por los gastos + revamp de la pestaña Gastos

Rama `feat/pasada-4-gastos-presupuesto` (Pasada 4 del plan de cambios acumulados).
Solo **frontend**, sobre tablas/RLS ya existentes.

**Presupuesto · sección "Gastos" (antes "Gastos de producción")**
- La sección se renombra a **"Gastos"** con la nota *«vinculado con la pestaña Gastos»*.
- El **Costo Real** de cada línea de Gastos pasa a **derivarse de los gastos
  registrados** (suma de los movimientos asociados a la línea vía su caja). Queda de
  **solo lectura** y, al hacerle clic, lleva a la pestaña **Gastos**.
- **Editable** cuando la línea **no** tiene una caja vinculada, o cuando la tiene
  pero el real gastado es **$0** (un gasto puntual con un único proveedor no
  necesita un presupuesto; si el real cae a $0, vuelve a ser editable).
- El resumen financiero y los KPIs reflejan el real efectivo sin tipeo manual.

**Gastos · crear caja "igualando" una línea**
- Al asociar una caja a una línea del Presupuesto, el **Monto asignado** se
  prellena con el **cotizado de esa línea** (editable). Evita retipear el número.

**Gastos · Registro de gastos**
- **Columnas redimensionables** a mano (misma maquinaria que el Presupuesto:
  arrastrar el borde, doble clic restablece, se persiste).
- **Buscador** por concepto, proveedor, quién gastó, medio, tipo, comentario y monto.
- **Agrupado por presupuesto** (una subsección por caja, con su total) en vez de una
  lista plana.
- **Ordenar por Fecha y Monto** (asc/desc, con la flecha activa en rojo, igual que
  Presupuesto).
- Columna **"Medio de pago"** muestra el valor exacto del desplegable.
- **Eliminar gasto** desde el modal de edición (con confirmación) y **"revertir a
  pendiente"** para gastos "Por revisar".
- **Quién gastó / Quién registra** usan el combobox de personas de la BD;
  **Proveedor** usa el combobox de empresas de la BD.
- **Tipos de documento**: Factura, Factura Exenta, Boleta, Invoice, Otro.

**Gastos · Caja de producción**
- La tarjeta del proyecto pasa a comparar el **gasto real contra el presupuesto de
  Gastos** (no el total del proyecto).
- Se reemplaza el ambiguo "editar" por **"Registrar ingreso"** y **"Registrar
  devolución"** (con fecha, por defecto hoy) y un **"Historial"** de ingresos/egresos.
- **Pendiente de BD (handoff):** persistencia de ingresos/devoluciones de caja (hoy
  el ingreso usa la columna `caja_prod`; la devolución vive en memoria). El "marcar
  empresa como Proveedor" + alta exprés de empresa por nombre va como **pasada 4.1**.

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
