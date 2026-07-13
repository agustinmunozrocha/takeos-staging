# QA · Cotización — Ofertas al cliente (`frontend/src/modules/presupuesto-cotizacion.js`, `renderCotizacion`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
**Alcance:** la feature de **ofertas/packs al cliente** (`renderCotizacion` ~línea
2808 y funciones asociadas): crear/editar ofertas, valor, "qué incluye / qué NO",
entregables, presupuesto alternativo costeable, versiones/comparador y la Carta de
Cotización en PDF. **NO** cubre el grid de Presupuesto (`renderPresupuesto`), que
ya está aprobado en [presupuesto.md](presupuesto.md) (P1–P36).
Cobertura: 0/25 ✅ (catálogo nuevo).

> **Cómo leer este catálogo.** Las pruebas **⭐** son donde el cruce
> monolito↔modular levantó bug; **pruébalas primero**. El juez final eres tú en
> `localhost:5173`.
>
> **Bugs encontrados y arreglados en esta tanda** (branch `fix/cotizacion-resumen-snapshot`):
> BUG-COT-1 (afecta C16, C17) y BUG-COT-2 (afecta C13). Ver Notas.

---

## A. Crear / editar / borrar oferta
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| C1 | Crear nueva oferta | Cotización → "+ Nueva oferta" | Aparece "Opción 0X", copia de la base (incluye/no incluye/entregables) con presupuesto alternativo propio; toast de éxito | ⬜ |
| C2 | Editar nombre de oferta | Cambiar el input de nombre y salir del campo | Persiste tras recargar | ⬜ |
| C3 | Borrar oferta alternativa | "Eliminar oferta" → confirmar | Se elimina; deshacible con Cmd+Z | ⬜ |
| C4 | No se puede borrar la base | "Eliminar oferta" en la base | No existe el botón / toast "no se puede eliminar" | ⬜ |

## B. Valor
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| C5 | Valor de oferta base | Editar Presupuesto del proyecto y volver a Cotización | El valor de la base = presupuesto real (solo lectura) | ⬜ |
| C6 | Valor de oferta alternativa | Escribir monto en "Valor al cliente" | Formatea CLP; recalcula el costeo (ganancia/%) al instante | ⬜ |

## C. Incluye / No incluye
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| C7 | Agregar/editar/borrar bullet "Incluye" | +Agregar, escribir, × | Persisten; el orden por drag&drop se guarda | ⬜ |
| C8 | "↻ Traer de Presupuesto" | Click en el botón del "Incluye" | Reemplaza con roles/ítems de cantidad ≥ 1; toast | ⬜ |
| C9 | "No incluye" es manual | Revisar sección "No incluye" | No se autogenera; editable a mano | ⬜ |

## D. Entregables
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| C10 | Videos con variables | +Agregar video, +Variable | Video y sus variables (4K, HD…) persisten y reordenan | ⬜ |
| C11 | Fotografía / Otros | +Agregar en cada lista | Persisten y reordenan | ⬜ |

## E. Presupuesto alternativo / rentabilidad
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| C12 ⭐ | Agregar rol al snapshot (sub-sección normal) | En oferta alt → "+ Agregar rol a Dirección" | Fila nueva aparece y el costeo recalcula | ⬜ |
| C13 ⭐ | **Sub-sección con apóstrofo** (BUG-COT-2) | Renombrar una sub-sección a p. ej. `D'Arte`, ir a la oferta alternativa, agregar/editar/borrar una fila en ese bloque | Debe agregar/editar/borrar (antes **fallaba en silencio**). Arreglado en esta tanda | ⬜ |
| C14 | Editar valor/cant/DTE/unidad del snapshot | Cambiar celdas | Costo por fila y costeo de la oferta se actualizan | ⬜ |
| C15 | Ganancia y % | Verificar la fila "Ganancia" del costeo | = valor − costo − comisiones; % = ganancia/valor | ⬜ |

## F. Versiones / Comparador
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| C16 ⭐ | **Subtítulo de los chips de versión** (BUG-COT-1) | Abrir Cotización con ≥1 versión | Cada chip debe mostrar `<valor real> · <margen real>` (antes salía **`$0 · 0,0%`**). Arreglado | ⬜ |
| C17 ⭐ | **Comparador con versión histórica** (BUG-COT-1) | Crear v2, comparar la oferta base v1 vs v2 | Valor/Margen de la base histórica deben ser reales (antes **$0 / 0** y el Δ salía falso). Arreglado | ⬜ |
| C18 | Crear/activar versión | "+ Nueva versión", cambiar de chip | Copia la anterior; la previa queda como histórica de solo lectura | ⬜ |

## G. PDF Carta
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| C19 | Previsualizar PDF (3 plantillas) | "Previsualizar PDF" → Editorial/Carta/Manifiesto | Render fiel; geometría 1:1 con el PDF | ⬜ |
| C20 | Carta formal muestra domicilio legal | Elegir plantilla "Carta" | El membrete incluye domicilio · web · teléfono · email de la productora | ⬜ |
| C21 | Logo / color / tipografía / margen | Cambiar los controles del panel | Se reflejan en vivo y persisten como default de la productora | ⬜ |
| C22 | Exportar PDF + bloqueo de versión | "Exportar PDF" | Abre el diálogo de imprimir; fija V.n; reeditar pide confirmación | ⬜ |
| C23 | Export del presupuesto de la oferta (CSV) | "⬇ Presupuesto (Excel)" | Descarga CSV con BOM; base = real, alt = snapshot | ⬜ |

## H. Persistencia / condiciones
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| C24 | Autosave de campos de oferta | Editar cualquier campo, esperar, recargar | Todo persiste (nombre, valor, incluye, entregables, snapshot) | ⬜ |
| C25 | Condiciones del servicio + variables `{{X}}` | Editar plantilla y montos | La vista previa reemplaza las variables en vivo; se guarda a nivel productora | ⬜ |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó (no re-probar) · ❌ falló (bug abierto) · 🔁 cambió a propósito.

## Notas

### Bug encontrado y arreglado — BUG-COT-1 (chips y comparador en $0)
La lectura del resumen financiero de una versión leía `fin.presupuestoCliente`,
pero `calcSummaryFin` devuelve la clave `presupCliente` (un find-replace de la
migración renombró de más 3 lecturas del *resultado*). Efecto: los chips del
switcher de versiones y el comparador de versiones históricas mostraban
`$0 · 0,0%` y el "Δ valor cotizado" salía falso. Fix: 3 sitios vuelven a
`presupCliente` (los que leen el *campo de entrada* `finanzas.presupuestoCliente`
quedaron intactos). **Verificar en C16 y C17.**

### Bug encontrado y arreglado — BUG-COT-2 (presupuesto alternativo con apóstrofo)
En el editor del presupuesto alternativo, el nombre de la sub-sección se pasaba
con `jsq(dept)` (escape para string JS del monolito) bajo la delegación por JSON,
que ya maneja las comillas → doble escape. Efecto: agregar/editar/borrar una fila
en una sub-sección cuyo nombre tuviera `'` o `\` fallaba en silencio (la clave de
lookup no calzaba). Fix: se pasa `dept` crudo, igual que el grid de Presupuesto ya
hace. **Verificar en C13** (caso borde: solo sub-secciones con esos caracteres).

### Sin pendientes de BD
El round-trip de persistencia de la cotización (ofertas, incluye/no incluye,
entregables, presupuesto alternativo, meta) es idéntico al monolito; nada que
señalar en la base de datos.
