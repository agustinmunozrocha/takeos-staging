# QA · Gastos (`frontend/src/modules/gastos.js`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
Módulos de apoyo: `dal.js` (persistencia, RPC 4b/CFO), `presupuesto-cotizacion.js`
(sync Costo Real, ver P36 ya aprobado), `lib/ui.js` (showModal), `lib/delegacion.js`.
Cobertura: **CERRADO** — 41/42 ✅ + 1 🔁 (GAS-22 saltada por obsoleta) · 0 bugs. 36 por QA
automatizado —Chrome MCP— + GAS-3/4/5, GAS-21 y GAS-6 con Agustín (14-jul). Cero regresiones
de la Etapa 4. Único hueco de infra hallado y resuelto: buckets de Storage de staging
(migración `20260714120000`, pendiente de prod en el merge final).

**Reparto 🤖/👁 (14-jul):** de las 39 pendientes, **37 las corre Claude** (🤖 — verificables
por modelo `goData`/`STATE`, DOM y consola) y **2 necesitan la vista de Agustín** (👁):
**GAS-21** (ver comprobante: previsualización de imagen / descarga PDF) y **GAS-22**
(comprobante legado roto → re-adjuntar archivo). Compañía visual opcional para Agustín en
algunas 🤖: GAS-7 (color rojo / barra >100 %) y los archivos que se descargan en GAS-33
(Santander) y GAS-37 (Chipax .xlsx) — la lógica la verifica Claude, el archivo abierto lo
mira Agustín si quiere.

> **Bug encontrado y arreglado en esta tanda** (branch
> `fix/gastos-editar-borrar-presupuesto`): BUG-GAS-1 — se había perdido editar y
> eliminar un presupuesto (caja/sobre). Verifícalo en **GAS-3, GAS-4, GAS-5**. Las
> ⭐ son las prioritarias. El juez final eres tú en `localhost:5173`.

---

### A. Presupuestos (cajas / sobres) — zona del bug arreglado
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| GAS-1 | Crear presupuesto (línea existente) | Gastos → + Crear presupuesto → elegir línea → monto → Crear | Nueva tarjeta con nombre/línea/resp/asignado; el monto se autollena con el cotizado de la línea | ✅ 🤖 |
| GAS-2 | Crear con línea nueva | + Crear presupuesto → "+ Crear nueva línea" → nombre → Crear | Se crea la caja **y** una fila EXTRA ($0) en Gastos del Presupuesto | ✅ 🤖 |
| GAS-3 ⭐ | **EDITAR un presupuesto (BUG-GAS-1)** | Click en el lápiz ✎ de una tarjeta del strip | Abre el modal en modo edición con los datos precargados y "Guardar cambios" (antes **no existía** el ✎). Arreglado | ✅ |
| GAS-4 ⭐ | **ELIMINAR un presupuesto sin gastos (BUG-GAS-1)** | Click en la × de una tarjeta sin movimientos → confirmar | Pide confirmación y elimina la caja (antes **no existía** la ×). Arreglado | ✅ |
| GAS-5 ⭐ | **Eliminar presupuesto CON gastos ligados** | Intentar borrar una caja que tiene movimientos | Se niega con "Tiene gastos cargados" y NO borra (no orfana movimientos de plata) | ✅ |
| GAS-6 | Permiso de crear/editar/borrar | Con perfil ≠ Admin/Ejecutivo/Producción | Toast "Sin permiso"; con perfil nulo, permite (fail-open) | ✅ (gate verificado por código = `main`; Agustín aceptó sin re-login live) |
| GAS-7 | Barra y "disponible" de la tarjeta | Cargar gastos hasta pasar el asignado | "disponible" se vuelve negativo (rojo), barra >100% | ✅ 🤖 |

### B. Registro de gastos (tabla)
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| GAS-8 | Agregar gasto completo | + Agregar gasto → monto, presupuesto, concepto, proveedor, comprobante → Guardar | Queda "Por revisar"; agrupado bajo su presupuesto | ✅ 🤖 (tras crear los buckets de staging: con comprobante subido queda "por revisar") |
| GAS-9 | Agregar gasto incompleto | Guardar sin comprobante/concepto | Queda "Pendiente"; no entra a la cola del CFO | ✅ 🤖 |
| GAS-10 | Editar gasto existente | "editar" en una fila → cambiar → Guardar | Actualiza en su lugar (mismo id) | ✅ 🤖 |
| GAS-11 | Eliminar gasto | editar → Eliminar gasto → confirmar | Se quita y se borra el comprobante de Storage | ✅ 🤖 (baja de Storage se ve con GAS-20) |
| GAS-12 | Buscador | Escribir en el buscador | Filtra el tbody manteniendo el foco | ✅ 🤖 |
| GAS-13 | Orden por fecha/monto | Click en la cabecera Fecha o Monto | Ordena asc/desc con flecha | ✅ 🤖 |
| GAS-14 | Marcar listo / revertir | "marcar listo" / "revertir a pendiente" | Transición pendiente↔por revisar; entra/sale de la cola de Finanzas | ✅ 🤖 |

### C. Caja de producción
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| GAS-15 | Registrar ingreso | Caja → + Registrar ingreso → monto/fecha/nota | Sube "Entregado" y el saldo a devolver | ✅ 🤖 |
| GAS-16 | Registrar devolución | ↩ Registrar devolución → monto | Baja el saldo a devolver | ✅ 🤖 |
| GAS-17 | Saldo | Verificar el KPI de saldo | = entregado − gastado(caja) − devuelto | ✅ 🤖 |
| GAS-18 ⭐ | Persistencia caja al recargar | Ingreso + devolución → recargar | Todo persiste. **OJO:** el texto de ayuda inline dice "no persiste", pero **sí** persiste (copy obsoleto, ver Notas) | ✅ 🤖 (persiste tras recargar; el copy "no persiste" es obsoleto) |
| GAS-19 | Historial de caja | Botón Historial | Lista ingresos(+)/devoluciones(−)/gastos-caja(−) por fecha desc | ✅ 🤖 |

### D. Comprobantes (Storage)
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| GAS-20 | Subir comprobante | Adjuntar foto/PDF en el gasto | Sube al bucket; persiste el path | ✅ 🤖 (tras crear los buckets: sube a `adjuntos-gastos`, path `ORG_ID/proyecto/…`, persiste el filePath; borrar el gasto también borra el archivo de Storage) |
| GAS-21 | Ver comprobante | "✓ ver" en la fila | Link firmado; imagen se previsualiza, PDF/HEIC ofrece descarga | ✅ (Agustín, 14-jul) |
| GAS-22 | Comprobante legado roto | Gasto con comp pero sin path | "⚠ re-subir" y modal para re-adjuntar | 🔁 saltada (Agustín): estado legado viejo/obsoleto, no se prueba |

### E. CFO / Finanzas (global)
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| GAS-23 | Bird View | Abrir Finanzas | Tabla de proyectos con Ingreso/Cobrado/Por cobrar/% y totales | ✅ 🤖 |
| GAS-24 | Registrar pago de cliente | + Registrar pago → monto/nota | Optimista + RPC; revierte si falla | ✅ 🤖 (revert verificado forzando fallo de la RPC) |
| GAS-25 | Cola de validación | Tab Validación | Solo gastos por revisar / en observación de todos los proyectos | ✅ 🤖 |
| GAS-26 | Validar / Observar | Validar / Observar (abre hilo) | Observar guarda comentario en el hilo y persiste ese proyecto | ✅ 🤖 |
| GAS-27 | Resumen por proyecto | Tab Por proyecto → Ver validados | Cotizado/Real/Disponible/# por proyecto | ✅ 🤖 |

### F. Reembolsos
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| GAS-28 | Lista pendientes | Tab Reembolsos | Movimientos "Reembolso a colaborador" sin fecha de pago; badge vencido/hoy | ✅ 🤖 |
| GAS-29 | Marcar pagado / deshacer | Marcar pagado; deshacer | fecha de pago se setea/limpia; persiste | ✅ 🤖 (usa la fecha editable, por defecto el objetivo) |
| GAS-30 | Marcar todos pagados | "Marcar todos pagados (hoy)" | Todos los pendientes reciben fecha de hoy | ✅ 🤖 (respeta los ya pagados) |

### G. Prontos pagos + export Santander (dinero crítico)
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| GAS-31 ⭐ | Monto neto de PP | Fila confirmada + PP con costo real y DTE real | monto neto: boleta retiene (factor), factura no; sin costo real → "Proforma" | ✅ 🤖 (boleta $84.750 · factura $100.000 · Proforma) |
| GAS-32 | Datos de transferencia | Ver estado de datos en un PP | "falta cuenta" sin nº; "falta RUT" si banco ≠ Santander y sin RUT | ✅ 🤖 |
| GAS-33 ⭐ | Export Santander reembolsos | ⬇ Exportar transferencias | 13 columnas exactas; cuenta origen desde el perfil de empresa; aborta si falta RUT; omite cuentas extranjeras y sin cuenta destino | ✅ 🤖 (13 cols exactas · aborta · omite extranjera/sin-cuenta · saneo OK) |
| GAS-34 | Export PP / consolidado / por proyecto | Botones de export | Solo PP con costo real y no pagados; consolidado = reembolsos + PP | ✅ 🤖 |
| GAS-35 | Alerta pago antes de rodaje | PP pagado con fecha < primera fecha de rodaje | Badge "⚠ antes del rodaje" | ✅ 🤖 |

### H. Export Chipax
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| GAS-36 | Solo si usa Chipax | Perfil con usaChipax=false | No aparece el botón ni el tab | ✅ 🤖 |
| GAS-37 | Preview + xlsx | Exportar → Descargar .xlsx | Solo gastos "validado"; cuenta según mapeo; lotes de 100 | ✅ 🤖 (11 cols, solo validados, mapeo cuenta/tipo-doc; batching Math.ceil/100 confirmado por código) |
| GAS-38 | Editar mapeo | ⚙ Editar mapeo → cambiar cuenta → Guardar | Persiste en el perfil de empresa | ✅ 🤖 |

### I. Sync Costo Real Gastos↔Presupuesto
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| GAS-39 | Costo Real derivado | Proyecto con costo real activo + línea con caja + movimientos | El costo real de la fila = suma de movimientos de esa línea; sin caja, conserva el valor manual | ✅ 🤖 (probado en "Spot Erebor", preproducción; el sync corre al ver el Presupuesto) |
| GAS-40 ⭐ | Aviso de choque de Costo Real | Línea con costo real manual > 0, con caja, sin gastos aún → asignar el 1er gasto | Sale el modal "El Costo Real cargado a mano se reemplazará" (la modular lo arregló; `main` nunca lo mostraba — mejora ligada a P36 ya aprobado). Confirmar que dispara y solo la 1ª vez | ✅ 🤖 (dispara la 1ª vez, "Sí, reemplazar"; el 2º gasto ya no) |

### J. Delegación / cableado
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| GAS-41 | Botones go.* responden | Recorrer botones/inputs del render y modales | Cada control dispara su handler; sin errores | ✅ 🤖 (56 handlers registrados, 54 referenciados, 0 sin registrar; consola sin "fn sin mapear" en toda la corrida) |
| GAS-42 | Combobox proveedor/persona | Escribir en Proveedor y en Quién/Registra | Dropdown abre/filtra/cierra; "Quién gastó" desconocido muestra el bloque de datos de pago | ✅ 🤖 |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó (no re-probar) · ❌ falló (bug abierto) · 🔁 cambió a propósito.

## Notas

### Hueco de configuración de staging — Storage vacío → RESUELTO 2026-07-14
El Supabase de **staging** (`jovroabtwysliryppthh`) no tenía **ningún bucket de Storage**
(prod tenía 10, staging cero), aunque las políticas RLS y las funciones `auth_*` sí estaban.
Por eso subir un comprobante fallaba con `StorageApiError: Bucket not found` y bloqueaba
**GAS-8/GAS-20** (y cualquier feature de archivos). NO era regresión de la Etapa 4: el código
es idéntico a `main` y la app manejaba el fallo bien (toast, sin corromper estado).
**Resuelto** con la migración `20260714120000_storage_buckets_paridad_staging.sql` (crea los
10 buckets idempotente, config 1:1 de prod). Aplicada a staging; **pendiente de ir a prod**
en el merge final (allá es no-op, ya los tiene). GAS-8/GAS-20 reprobados ✅ tras crearlos.
Nota: las **políticas** de storage.objects también estaban fuera de migraciones (creadas a
mano en su momento) pero ya existen en ambos entornos; capturarlas en migración es un
pendiente aparte para reproducibilidad total.

### Bug encontrado y arreglado — BUG-GAS-1 (🔴 bloqueante): no se podía editar ni borrar un presupuesto
La migración reimplantó una versión **antigua, solo-crear** de los presupuestos
(cajas/sobres) de Gastos: la tarjeta del strip no tenía los botones ✎/×,
`goOpenPresup` no aceptaba editar, `goSavePresup` solo creaba y `goDeletePresup`
no existía. Resultado: un presupuesto con nombre, línea, responsable o monto
equivocado **no se podía corregir ni borrar** desde la app, y el monto asignado
alimenta el "disponible" y las barras. Fix: se repuso el botón ✎ (editar) y × (borrar)
en cada tarjeta, la rama de edición en el modal (con "Guardar cambios") y la función
de borrado (que se niega si el presupuesto tiene gastos cargados, para no orfanar
movimientos). Todo con delegación de eventos (no `onclick`), respetando la CSP.
**Verificar en GAS-3, GAS-4 y GAS-5.**

### Diferencias intencionales (NO son bugs)
- **GAS-40 · Aviso de choque de Costo Real:** la modular corrige un aviso que en
  `main` estaba muerto (comparaba mal el id de la caja) y usa el modal propio del
  software. Es coherente con P36 (ya aprobado en Presupuesto).
- **Modal "Crear presupuesto" rediseñado:** la línea va primero y el nombre se
  autollena con la línea. Decisión de UI (se conserva en el fix de edición).

### Puntos de BD a confirmar (solo señalados — NO son regresiones, `main` hace igual)
- **`ppPagos`** (fecha de pago de prontos pagos): no viaja en ningún guardado a la
  nube; el estado "pronto pago pagado" se pierde al recargar salvo que el proyecto
  se guarde como blob por otra vía. Idéntico a `main`.
- **`gasto_comments`** (hilo de "Observar"): el guardado omite la clave si no está
  en memoria, para que la RPC preserve el hilo. Conviene confirmar en la BD que la
  RPC efectivamente lo preserva cuando la clave viene ausente.
- **Copy obsoleto de la caja de producción:** los textos de ayuda dicen "aún no
  persiste al recargar", pero la caja **sí** persiste (migración PR8). El copy es
  igual en `main` (no es de esta migración); conviene alinearlo con la realidad.
