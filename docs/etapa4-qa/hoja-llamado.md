# QA · Hoja de Llamado (`frontend/src/modules/plan-rodaje.js`, `renderHojaLlamado`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
Módulos de apoyo: `crew.js` (getCrewForExport), `rodajes.js` (días/fechas),
`locaciones.js` (confirmadas), `dal.js` (persistencia blob JSONB), `lib/delegacion.js`.
Cobertura: 32/33 ✅ (🤖) · 1 pendiente 👁 (HL-27, preview visual, falta tu vista).

> **QA automatizado 2026-07-20 (Chrome MCP, localhost:5173 / etapa4-integracion):**
> las 31 pruebas 🤖 restantes (selección de día/versionado, horarios y aislamiento
> por día, locaciones read-only, citaciones de crew con overrides/revertir/drag,
> citaciones externas, lógica de export/firma-por-hash/nombre de archivo) se
> ejecutaron y **pasaron — 0 bugs, consola limpia** (ningún `[pr] fn sin mapear`).
> HL-18 ya estaba ✅ (Agustín). Solo **HL-27** (preview con márgenes/zoom) queda 👁
> **pendiente de la vista de Agustín**. El contenido del PDF (HL-32) se verificó
> leyendo el HTML generado: info general, horarios solo-con-valor, locaciones, crew
> citado (solo presentes, tel desde BD, loc "ID · nombre") y externas (solo con
> nombre/rol).

> **Nota:** Hoja de Llamado y Plan de Rodaje comparten el archivo `plan-rodaje.js`.
> Este catálogo cubre solo Hoja de Llamado. **Bug encontrado y arreglado en esta
> tanda** (branch `fix/hoja-llamado-crew-override-escape`): BUG-HL-1 — verifícalo
> en la prueba **HL-18**. Las ⭐ son las sospechosas: pruébalas primero.

---

### A. Selección de día y versionado
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| HL-1 | Sin días activos | En Rodajes desmarca todos los días → abre Hoja de Llamado | Alerta con botón "Ir a Rodajes" que navega a Rodajes | ✅ |
| HL-2 | Selector de día | Con ≥2 días activos, cambia el desplegable de día | Re-renderiza la hoja del día elegido; las opciones muestran día + fecha larga | ✅ |
| HL-3 | Día seleccionado inválido | Selecciona un día, luego en Rodajes desactívalo, vuelve a la hoja | Cae al primer día activo sin romper | ✅ |
| HL-4 | Badge de versión | Día nunca exportado | Badge "Borrador" + "Sin exportar aún" | ✅ |
| HL-5 | Versión tras export | Exporta PDF | Badge pasa a "V.1" + "Exportada V.1 · <fecha/hora>" | ✅ |

### B. Info del día (round-trip horarios/campos)
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| HL-6 | Normalización de hora | En "Llamado general" escribe `700`, sal del campo | Se formatea a `07:00` y persiste al recargar | ✅ |
| HL-7 | Horas 1300/1845 | Escribe `1300` y `1845` en distintos campos | `13:00` y `18:45` | ✅ |
| HL-8 | Campos texto (Hospital/Clima) | Escribe texto libre, cambia de día y vuelve | Se conserva por día | ✅ |
| HL-9 | Aislamiento por día | Pon horarios distintos en Día 1 y Día 2 | Cada día mantiene lo suyo; no se pisan | ✅ |

### C. Locaciones (solo lectura)
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| HL-10 | Sin confirmadas | Proyecto sin locaciones confirmadas | Mensaje "Sin locaciones confirmadas" | ✅ |
| HL-11 | Tabla confirmadas | Confirma locaciones en el módulo Locaciones | Aparecen ID/Nombre/Dirección/Comuna solo lectura; botón "Gestionar en Locaciones" navega | ✅ |

### D. Citaciones de crew (auto desde Presupuesto)
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| HL-12 | Crew confirmado aparece | Marca personas confirmadas en Presupuesto | Salen en la tabla; contador "X/Y citados" | ✅ |
| HL-13 | Toggle Citar | Desmarca "Citar" de una persona | Fila queda no-citada, inputs deshabilitados, contador baja, no sale en PDF | ✅ |
| HL-14 | Override Rol/Número/Nombre | Edita rol/número/nombre de una persona | Aparece botón ↺ (revertir); el valor efectivo = override; ↺ restaura el de Presupuesto/BD | ✅ |
| HL-15 | Call por persona | Escribe `800` en Call de una persona | Se normaliza a `08:00`; call vacío usa el llamado general | ✅ |
| HL-16 | Locación por persona | Elige locación en el desplegable de una fila | Persiste; en PDF muestra "ID · nombre" | ✅ |
| HL-17 | Reordenar crew (drag) | Arrastra la manija ⠿ de una fila a otra posición | Reordena y persiste el orden por día | ✅ |
| HL-18 ⭐ | **Nombre con `&` / apóstrofo (BUG-HL-1)** | Ten un confirmado cuyo nombre tenga `&` o `'` (ej. "Juan & Media" u "O'Higgins"). Edita su Rol/Número/Call, sal del campo, mira tras el re-render; luego recarga | El override debe **mantenerse** visible y salir en el PDF (antes desaparecía al re-render). Arreglado en esta tanda | ✅ |
| HL-19 ⭐ | Persistencia override tras recarga | Edita varios overrides (nombres normales), guarda, recarga | Todos los overrides vuelven | ✅ |

### E. Citaciones externas (manual)
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| HL-20 | Agregar externa | "+ Agregar persona externa" | Fila nueva editable (rol/nombre/número/call/loc/notas) | ✅ |
| HL-21 | Round-trip externa | Llena campos, cambia de día y vuelve / recarga | Se conservan | ✅ |
| HL-22 | Call externa | Escribe `930` en Call | Normaliza a `09:30` | ✅ |
| HL-23 | Eliminar / reordenar | Borra una y arrastra otra | Borrado correcto; el drag reordena | ✅ |
| HL-24 | Filtro PDF externas | Deja una externa con nombre y rol vacíos | NO aparece en el PDF (solo las que tienen nombre o rol) | ✅ |

### F. Export PDF y firma de versión
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| HL-25 | Aviso de datos faltantes | Exporta sin PE/Director/JefeProd/Cliente/Productora/Llamado/Hospital | Modal "Faltan datos" NO bloqueante; "Corregir" cierra, "Exportar de todas formas" sigue | ✅ |
| HL-26 | Backdrop del modal | Click en el fondo del modal de faltantes | Cierra solo si el click cae en el fondo | ✅ |
| HL-27 👁 | Preview + márgenes | Abre "Exportar PDF" (preview) → mueve el slider de márgenes | El preview recarga con el nuevo margen; zoom +/- y Ajustar/Ancho funcionan | ⬜ 👁 |
| HL-28 | Versión no sube sin cambios | Exporta (V.1) → sin cambiar nada re-exporta | NO sube versión (toast "Sin cambios"); sigue V.1 | ✅ |
| HL-29 | Versión sube tras editar | Exporta (V.1) → cambia un horario/override/locación → exporta | Sube a V.2 | ✅ |
| HL-30 | La firma capta crew | Exporta → confirma otra persona en Presupuesto → exporta | Sube versión (el crew entra en la firma) | ✅ |
| HL-31 | Nombre de archivo | Exporta | "Call Sheet - <proyecto> - <día> - V<n>" | ✅ |
| HL-32 | Contenido del PDF | Exporta con crew citado + externas + locaciones + horarios | Trae Info general, Horarios (solo campos con valor), Locaciones, Crew citado (solo presentes), Externas (con nombre/rol) | ✅ |
| HL-33 | Exportar y Enviar | Botón "Exportar y Enviar" | Abre Notificaciones con plantilla y destinatarios | ✅ |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó (no re-probar) · ❌ falló (bug abierto) · 🔁 cambió a propósito.

## Notas

### Bug encontrado y arreglado — BUG-HL-1 (branch `fix/hoja-llamado-crew-override-escape`)
Al editar la citación de una persona del crew (rol, número, call, locación, notas o
el check "Citar"), el nombre de la persona viajaba **escapado** como argumento del
handler bajo la delegación por JSON, que ya escapa por su cuenta → doble escape. El
cambio se guardaba bajo una clave equivocada (fantasma) y **desaparecía** al
re-dibujar la tabla y no salía en el PDF. Solo afectaba a nombres con `&`, `<`, `>`,
`"` o apóstrofo (`'`), p. ej. "O'Higgins" o "Juan & Media". Fix: pasar el nombre
crudo (1 línea). **Verificar en HL-18.**

### Sin pendientes de BD
La Hoja de Llamado se persiste como un blob JSONB 1:1 (todo `hojaLlamado` completo),
así que no hay riesgo de round-trip parcial. Con el fix, las claves de override
vuelven a coincidir; nada que tocar en la base de datos.
