# QA · Plan de Rodaje (`frontend/src/modules/plan-rodaje.js`, `renderPlanRodaje`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
Módulos de apoyo: `rodajes.js` (días), `hoja-llamado` (llamado general = inicio),
`locaciones.js` (locaciones), `dal.js` (persistencia blob JSON). `lib/delegacion.js`.
Cobertura: 0/50 ✅ (catálogo nuevo).

> **Resultado del cruce:** la migración de Plan de Rodaje es **limpia** (0 bugs),
> incluido el **motor de tiempo** (cascada, anclas, paralelos), que se comparó
> cálculo por cálculo contra el monolito. Este catálogo cubre solo Plan de Rodaje
> (comparte archivo con Hoja de Llamado). Todas las pruebas parten de un proyecto
> con ≥1 día de rodaje activo. Las ⭐ son las sensibles: pruébalas primero.

---

### A. Motor de tiempo (cascada / anclas / paralelos)
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| PR-1 | Cascada de duraciones | 3 planos con dur 0:30, 1:00, 0:45; Llamado General 07:00 | Inicios 07:00 / 07:30 / 08:30; términos 07:30 / 08:30 / 09:15 | ⬜ |
| PR-2 | La duración manda | Cambiar la dur del 1er plano a 1:00 | Todo lo posterior corre +30 min en cascada | ⬜ |
| PR-3 | Inicio heredado del Llamado General | Sin hora propia, cambiar Llamado General a 08:00 | El 1er inicio pasa a 08:00 y arrastra la cascada | ⬜ |
| PR-4 | Inicio propio (override) | Tipear una hora en la celda roja de Inicio | Manda sobre el Llamado General; vaciarla vuelve a heredar | ⬜ |
| PR-5 | Ancla a mitad de día | Anclar (⚓) un plano a una hora mayor que el cursor | Ese bloque arranca en la hora clavada; lo previo no se reescribe | ⬜ |
| PR-6 ⭐ | Choque (rojo) | Anclar una fila a una hora ANTERIOR a donde llega el cursor | Celda en rojo + banner "CHOQUE DE TIEMPOS" listando la fila | ⬜ |
| PR-7 ⭐ | Hueco (ámbar) | Anclar una fila a una hora POSTERIOR (queda tiempo libre) | Celda en ámbar + banner "HUECO DE TIEMPOS" con "+Xh:MM" | ⬜ |
| PR-8 ⭐ | Paralelo no mueve el reloj | Marcar (paralelo) un plano | Arranca en el inicio del anfitrión; NO desplaza los siguientes ni suma al total | ⬜ |
| PR-9 | Paralelo limpia el ancla | Anclar un bloque y luego marcarlo paralelo | El ancla se borra al activar paralelo | ⬜ |
| PR-10 | Marcador con hora fija | Agregar Marcador, anclarlo a 13:00 | Muestra su reloj; empuja el cursor solo si 13:00 > cursor | ⬜ |
| PR-11 | Sección no aporta tiempo | Agregar una Sección entre bloques | Banda de título; no altera inicios/términos | ⬜ |
| PR-12 | Total del día | Planos + un paralelo + un banco | "Total rodaje" = del 1er inicio al último término del carril principal; ignora paralelos y banco | ⬜ |
| PR-13 | Auto-formato duración | Tipear "130" en dur | Queda "1:30" | ⬜ |
| PR-14 | Auto-formato reloj | Tipear "0730" en un ancla | Queda "07:30"; "25:00" → "01:00" | ⬜ |
| PR-15 | Fallback sin llamado ni ancla | Plan con planos, sin Llamado General ni anclas | La cascada arranca en 08:00 | ⬜ |

### B. Unidades y Planes (A/B contingencia)
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| PR-16 | Agregar Unidad | Botón "+ Unidad" | Nueva unidad con Plan A en blanco; queda activa | ⬜ |
| PR-17 | Agregar Plan (copia) | Botón "+ Plan" | Crea "Plan B" como copia del activo (IDs nuevos, versión 1) | ⬜ |
| PR-18 | Renombrar unidad/plan | Botón editar | Prompt; nombre vacío conserva el anterior | ⬜ |
| PR-19 | Eliminar unidad | Botón eliminar (con >1) | Confirm; no permite borrar la última | ⬜ |
| PR-20 | Eliminar plan | Botón eliminar (con >1) | Confirm; no permite borrar el último | ⬜ |
| PR-21 ⭐ | "Traer de…" | "Traer de…" y elegir otro plan | Reemplaza filas y banco con copia (IDs nuevos); confirma si había contenido | ⬜ |
| PR-22 | Cambiar día/unidad/plan | Chips | Cambia la selección; la unidad recuerda su plan activo | ⬜ |

### C. Filas (agregar / mover / borrar)
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| PR-23 | Agregar bajo la seleccionada | Seleccionar una fila → "+ Plano" | Se inserta debajo de la seleccionada | ⬜ |
| PR-24 | Agregar sin selección | Sin fila seleccionada → "+ Situación" | Se agrega al final | ⬜ |
| PR-25 | Tipos de fila | + Plano / Situación / Marcador / Sección | Plano y Situación nacen con dur 0:30; marcador/sección sin dur | ⬜ |
| PR-26 | Subir / Bajar | Botones de mover | Intercambia con la vecina; deshabilitado en los extremos | ⬜ |
| PR-27 ⭐ | Reordenar por arrastre | Arrastrar y soltar sobre otra fila o "soltar al final" | Mueve la fila a la posición de destino | ⬜ |
| PR-28 | Eliminar fila | Botón eliminar | La quita; si estaba seleccionada, limpia la selección | ⬜ |
| PR-29 | Editar contenido | Escribir en los textos (acción, esc/plano, extras) | Persiste en el campo correcto | ⬜ |

### D. Columnas configurables
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| PR-30 | Toggle Término / Esc-Plano | Modal Columnas, checkboxes | Muestra/oculta esas columnas; Inicio/Duración/Acción siempre fijas | ⬜ |
| PR-31 | Nueva columna | "+ Agregar columna" | Aparece "Nueva columna" tipo texto, visible | ⬜ |
| PR-32 | Tipo de columna | Texto / Imagen / Texto+Imagen / Casilla | Render acorde; las de casilla van al final | ⬜ |
| PR-33 | Reordenar/renombrar/ocultar/eliminar columna | Botones del modal | Se refleja en la tabla; reabre el modal | ⬜ |
| PR-34 | Reset preset | "Volver al preset por defecto" | Restaura las columnas por defecto | ⬜ |

### E. Banco de planos e imágenes
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| PR-35 | Agregar/eliminar plano de banco | "+ Plano al banco" / eliminar | Fila con Cód./Acción/Ref/Nota; NO entra en la línea de tiempo ni suma al total | ⬜ |
| PR-36 | Imágenes por celda (tope 6) | "+" en celda imagen, elegir varias | Comprime y agrega hasta 6; no excede el tope | ⬜ |
| PR-37 | Drop de imágenes | Arrastrar archivos a la celda | Solo acepta imágenes; respeta el tope | ⬜ |
| PR-38 | Quitar imagen | Eliminar en la miniatura | Elimina esa imagen | ⬜ |

### F. Cabecera y sincronización
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| PR-39 | Locación (select vs input) | Con locaciones confirmadas vs sin ellas | Con confirmadas: desplegable de locaciones; sin ellas: texto libre | ⬜ |
| PR-40 ⭐ | Responsable (combobox BD) | Escribir/seleccionar persona | Filtra la BD; al elegir, autocompleta teléfono/mail | ⬜ |
| PR-41 | Sol útil | Escribir salida/puesta de sol | Guarda; la hora real la muestra desde Hoja de Llamado (solo lectura) | ⬜ |
| PR-42 | Llamado general (enlace) | Click en la tarjeta "Llamado general" | Navega a Hoja de Llamado (fuente única) | ⬜ |

### G. Exportación PDF
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| PR-43 | Aviso por datos faltantes | Exportar sin fecha/locación/responsable/hora | Modal "Faltan datos del plan" con "Corregir" / "Exportar de todas formas" | ⬜ |
| PR-44 | Exportar igual | "Exportar de todas formas" | Cierra y exporta; avanza versión y sella | ⬜ |
| PR-45 ⭐ | Versión y sello | Exportar dos veces | La versión sube en 1 por export; muestra fecha/hora de sellado | ⬜ |
| PR-46 | Orientación | Selector Horizontal/Vertical | Landscape (4 col) vs portrait (3 col) | ⬜ |
| PR-47 | Contenido del PDF | Exportar un plan completo | Cabecera solo con campos con valor; tabla con colores de choque/hueco/marcador/sección/paralelo; banco aparte | ⬜ |
| PR-48 | Nombre de archivo | Revisar el nombre | "Plan de Rodaje - {proyecto} - {día} - {Unidad} {Plan} - V{n}" | ⬜ |

### H. Persistencia
| ID | Qué probar | Pasos | Esperado (según main) | Estado |
|----|-----------|-------|-----------------------|--------|
| PR-49 | Round-trip completo | Editar filas/dur/anclas/paralelos/columnas/banco/imágenes, recargar | Todo se conserva | ⬜ |
| PR-50 | Deshacer (Cmd+Z) | Eliminar unidad/plan y deshacer | Restaura | ⬜ |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó (no re-probar) · ❌ falló (bug abierto) · 🔁 cambió a propósito.

## Notas
- **0 bugs.** El motor de tiempo (cascada de duraciones, anclas con choque/hueco,
  paralelos que no mueven el reloj), las unidades/planes, las columnas modulares,
  el banco de planos y el export PDF se compararon contra el monolito y coinciden;
  la delegación (`pr.d`, `pr.fila`, `pr.filaDrag`, `pr.imgDnD`) mapea completo y el
  estado se persiste como blob JSON íntegro.
- **Diferencias intencionales** (no bugs): pie del PDF con rebrand "TakeOS"; la celda
  de hora de inicio ya no lleva `stopPropagation` (efecto nulo: seleccionar la fila
  solo cambia una clase CSS).
