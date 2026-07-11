# QA · Crew (`frontend/src/modules/crew.js`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
Módulos de apoyo: `plan-rodaje.js` (getConfirmedCrew, printViaIframe), `dal.js`
(persistencia crew externos / medio de transporte), `bd.js` (auto-lookup), `lib/delegacion.js`.
Cobertura: 0/18 ✅ (catálogo nuevo).

> **Resultado del cruce:** la migración de Crew es un **port fiel** del monolito.
> No se encontraron regresiones (0 bugs). Las pruebas **⭐** son los caminos que
> pasaron por delegación/ganchos/RPC en la migración: se verificaron leyendo
> código, conviene una pasada manual de confirmación. El juez final eres tú en
> `localhost:5173`.

---

## A. Espejo del Presupuesto
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| CR1 | Solo confirmados con nombre | En Presupuesto marca "Conf." a una persona con nombre; abre Crew | Aparece en la tabla; KPI "Personas confirmadas" +1 | ⬜ |
| CR2 | Filtro "no va a rodaje" excluye | Marca una fila confirmada como "no va a rodaje"; abre Crew | NO aparece en Crew | ⬜ |
| CR3 | Deduplicación por nombre | Misma persona confirmada en 2 roles/secciones | Aparece 1 sola vez (primer rol encontrado) | ⬜ |
| CR4 | Estado vacío | Proyecto sin confirmados | Alert "Aún no hay crew confirmado…"; Externos + exports igual disponibles | ⬜ |

## B. Auto-lookup desde la BD
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| CR5 ⭐ | Persona en BD muestra datos | Crea persona en BD; confírmala en Presupuesto; abre Crew | Muestra teléfono/mail/restricción/dirección/comuna; KPI "En base de datos" +1 | ⬜ |
| CR6 ⭐ | Persona sin BD | Confirma un nombre que no está en la BD | Muestra "⚠ Sin BD"; KPI "Faltan en BD" +1 | ⬜ |
| CR7 ⭐ | Link "Agregar a la BD" | Click en "⚠ Sin BD" / "+ Agregar persona a la BD" | Abre el alta de Persona con el nombre precargado | ⬜ |

## C. Crew externos
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| CR8 ⭐ | Medio de transporte persiste | Elige un medio en el select; navega a otro módulo y vuelve; recarga | El valor elegido se mantiene | ⬜ |
| CR9 ⭐ | Agregar externo | Click "+ Agregar externo" | Nueva fila, tipo "cliente" por defecto, campos vacíos | ⬜ |
| CR10 ⭐ | Editar campos del externo | Cambia tipo/nombre/rol/teléfono/restricción/dirección/comuna | Cada cambio se guarda al salir del campo | ⬜ |
| CR11 ⭐ | Quitar externo | Click en "×" | La fila se elimina y se re-dibuja | ⬜ |
| CR12 ⭐ | Persistencia de externos | Agrega 2 externos con datos; recarga la página | Ambos reaparecen con todos sus campos, en orden | ⬜ |

## D. Exportar PDF
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| CR13 ⭐ | Crew List (PDF) | Con crew + externos, "Crew List (PDF)" | PDF "CREW LIST", columnas Rol/Nombre/Teléfono/Mail/Restricción; externos con tag de tipo; subtítulo proyecto·cliente·N | ⬜ |
| CR14 ⭐ | Catering (PDF) | Click "Catering (PDF)" | PDF "CATERING", columnas Rol/Nombre/Restricción; restricción ≠ "Ninguna" resaltada en rojo | ⬜ |
| CR15 ⭐ | Transporte — selección | Click "Transporte (PDF)" | Modal con todas las personas pre-marcadas; muestra dirección/comuna | ⬜ |
| CR16 ⭐ | Transporte — modal | Desmarca a alguien; click dentro del modal | El check se respeta; click dentro NO cierra; solo cierra en el fondo o Cancelar | ⬜ |
| CR17 ⭐ | Transporte — PDF final | "Exportar seleccionados" | PDF "TRANSPORTE": Nombre/Rol/Teléfono/Dirección(link Maps)/Comuna, solo los marcados; si nadie, toast de aviso | ⬜ |
| CR18 | Export sin personas | Sin crew ni externos, click cualquier export | Toast "Sin personas"; no genera PDF | ⬜ |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó (no re-probar) · ❌ falló (bug abierto) · 🔁 cambió a propósito.

## Notas
- **0 bugs.** Migración fiel: las 12 acciones (`crew.pdfCrew`, `crew.addBD`,
  `crew.ext`, `crew.selTrans`, `crew.transExport`, etc.) tienen handler
  registrado; cero `on*=` inline; el round-trip de crew externos y medio de
  transporte es idéntico al monolito; los ganchos (`renderCrew`,
  `getCrewForExport`) están definidos y consumidos.
- **No-regresiones verificadas** (main hace igual): el select de transporte no
  llama `markDirty` propio, pero el listener global de `change` sí lo marca
  (paridad); el modal de transporte no cierra al click interno (equivalente al
  `stopPropagation` del monolito). `crewExternos` no persiste `mail` — igual en
  ambas versiones (no es de esta migración).
