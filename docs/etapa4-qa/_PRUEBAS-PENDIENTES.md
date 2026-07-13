# Pruebas pendientes — Etapa 4 (todo lo que tienes que probar)

Este es el **runbook maestro** de las dos tandas de depuración. Junta lo que hay que
probar de los módulos de identidad/equipo (tanda 1) y de producción/finanzas (tanda 2).

**Cómo probar (para todas):**
1. Levanta el software en local (yo te paso el link cuando me des el OK de mergear, o
   corre el server tú: `cd ~/Software/frontend && npm run dev` → `http://localhost:5173/`).
2. Ve módulo por módulo. **Empieza por la Parte 1 (los arreglos)** — son pocas y son
   las que confirman que lo que arreglé quedó bien.
3. Después, si quieres cobertura completa, sigue con la Parte 2 (batería por módulo).
4. Anota cuáles pasan (✅) y cuáles fallan (❌). Los ✅ los marco yo en el catálogo.

> **Nada de esto está mergeado ni pusheado todavía.** Cada arreglo vive en su branch,
> esperando tu OK (ver `_HANDOFF-*.md`).

---

## PARTE 1 · Los arreglos (pruébalos primero)

7 bugs arreglados entre las dos tandas. Para cada uno: qué hacer y **✅ qué tienes que ver**.

### 🔴 Bloqueantes

**GAS-3/4/5 · Editar y eliminar un presupuesto (caja) en Gastos**
- En Gastos, sobre una tarjeta de presupuesto del strip, aparecen ahora un lápiz ✎ y una ×.
- Click en ✎ → edita nombre/línea/responsable/monto → Guardar cambios.
- Click en × en una caja **sin** gastos cargados → confirma.
- Intenta borrar una caja **con** gastos cargados.
- ✅ El ✎ abre el modal con los datos cargados y guarda los cambios. La × borra la caja sin gastos. La caja **con** gastos NO se borra (avisa "Tiene gastos cargados").

**LOC-22/23 · El Plan de Scouting ahora se guarda en la nube**
- En Locaciones → Plan de Scouting, arma un plan (paradas, gente), guarda y **recarga** la página.
- Luego edita cualquier cosa del proyecto que dispare un guardado y recarga de nuevo.
- ✅ El plan **reaparece** tras recargar (antes se perdía). Y no se borra solo.

### 🟡 Molestos

**BD-11 · Observaciones de empresa no se revierten** (tanda 1)
- Base de Datos → editar una empresa → escribe en "Observaciones" → agrega un dueño → cierra y reabre la ficha.
- ✅ El texto de Observaciones **se queda** (antes, en empresas viejas, se revertía).

**C-16/C-17 · Resumen de las versiones de Cotización** (tanda 1)
- Cotización → con una cotización que tenga ≥1 versión, mira los "chips" de versión y el comparador.
- ✅ Muestran el **valor y margen reales** (antes salía **$0 · 0,0%**).

**C-13 · Presupuesto alternativo con nombre raro** (tanda 1)
- Renombra una sub-sección a algo con apóstrofo (ej. `D'Arte`) → en una oferta alternativa, agrega/edita/borra una fila en ese bloque.
- ✅ Te deja (antes fallaba sin avisar).

**LOC-20/21 · Tiempo de visita por parada (Plan de Scouting)**
- En una parada del Plan de Scouting, busca el input **"⏱ visita"** y fija p. ej. `030`.
- Mira la hora de las paradas siguientes, el "término aprox." y exporta el PDF de Scouting.
- ✅ El input **existe**, empuja las horas, y la columna "Dur." del PDF muestra la visita (antes no existía y salía vacía).

**HL-18 · Overrides de crew con nombres especiales (Hoja de Llamado)**
- Ten un confirmado con `&` o apóstrofo en el nombre (ej. "O'Higgins"). Edita su Rol/Número/Call en la Hoja de Llamado, sal del campo, mira tras el re-dibujo y recarga.
- ✅ El cambio **se mantiene** y sale en el PDF (antes desaparecía).

---

## PARTE 2 · Batería completa por módulo

La lista completa de cada módulo está en su catálogo `docs/etapa4-qa/<módulo>.md`. Ahí cada
prueba tiene ID, pasos y resultado esperado. Las ⭐ son las prioritarias.

| Módulo | Catálogo | Pruebas | Bugs arreglados | Tanda |
|--------|----------|---------|-----------------|-------|
| Base de Datos | `bd.md` | 35 | BUG-BD-1 (BD11) | 1 |
| Cotización (ofertas) | `cotizacion.md` | 25 | BUG-COT-1 (C16/C17), BUG-COT-2 (C13) | 1 |
| Crew | `crew.md` | 18 | limpio | 1 |
| Cargos | `cargos.md` | 17 | limpio | 1 |
| Documentos | `documentos.md` | 20 | limpio | 1 |
| Rodajes | `rodajes.md` | 22 | limpio | 2 |
| Locaciones | `locaciones.md` | 25 | BUG-LOC-1 (LOC22/23), BUG-LOC-2 (LOC20/21) | 2 |
| Hoja de Llamado | `hoja-llamado.md` | 33 | BUG-HL-1 (HL18) | 2 |
| Plan de Rodaje | `plan-rodaje.md` | 50 | limpio | 2 |
| Gastos | `gastos.md` | 42 | BUG-GAS-1 (GAS3/4/5) | 2 |

**Ya aprobados — NO re-probar** (fuera de alcance): Presupuesto (`presupuesto.md`, 36 ✅)
e Info Proyecto (`info-proyecto.md`, 19 ✅).

**Resumen:** 5 de los 10 módulos revisados salieron **limpios** (Crew, Cargos,
Documentos, Rodajes, Plan de Rodaje). Los otros 5 tenían 7 bugs en total, todos
arreglados y esperando tu prueba + aprobación.
