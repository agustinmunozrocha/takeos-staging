# QA · Cargos (`frontend/src/modules/cargos.js`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
Módulos de apoyo: `dal.js` (dalCargarCargos/dalGuardarCargos, RPC `guardar_cargos`),
`invitaciones.js`, `info-proyecto.js` (re-render RECI), `lib/delegacion.js`.
Cobertura: 0/17 ✅ (catálogo nuevo).

> **Resultado del cruce:** la migración de Cargos es **limpia** (0 bugs). Ojo:
> commits recientes (I11b) ya arreglaron varias cosas de Cargos — no se re-reportan
> aquí. Las pruebas **⭐** son los caminos sensibles a la migración
> (combobox→change, invitaciones, RECI en vivo, persistencia): verificados por
> código, conviene confirmarlos a mano. El juez final eres tú en `localhost:5173`.

---

| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| CG1 | Abrir modal "Asignar un cargo" | Proyecto → Cargos → "+ Asignar un cargo" | Modal con Tipo=Interno por defecto, perfil=Producción, checklist de permisos cargando | ⬜ |
| CG2 | Guardar cargo interno con persona | Tipo Interno, elegir Cargo, escribir persona del equipo, perfil, Asignar | Fila: Tipo "Interno", Estado "Activo", perfil correcto; toast "Cargo guardado" | ⬜ |
| CG3 | Guardar cargo sin persona (slot) | Elegir Cargo, dejar Persona vacía, Asignar | Fila "— Sin asignar —", Estado "—", acción "Asignar" | ⬜ |
| CG4 ⭐ | Cambiar Tipo interno↔externo en el modal | Abrir modal, cambiar el select Tipo a Externo | Aparece "Correo del externo"; perfiles cambian a la lista EXTERNO (sin Administrador); perfil por defecto "Creativo" | ⬜ |
| CG5 | Perfiles por tipo | Abrir el select Perfil en Interno / en Externo | Interno incluye Administrador; Externo es igual pero SIN Administrador | ⬜ |
| CG6 ⭐ | Resolver persona por nombre (combobox) | Tipo Interno, tipear en Persona; elegir del dropdown | El input toma el nombre; internos = solo equipo interno; externo = toda la BD | ⬜ |
| CG7 ⭐ | Prefill de correo al elegir externo | Tipo Externo, elegir persona de la BD con mail | El campo Correo se autocompleta con el mail de la ficha (editable) | ⬜ |
| CG8 ⭐ | Guardar externo con correo → invitación | Tipo Externo, persona, correo válido, Asignar | Estado "Invitación pendiente"; se genera invitación; toast; si ya es miembro → "Sumado al proyecto" | ⬜ |
| CG9 | Copiar link de invitación | En fila "Invitación pendiente", click en la pastilla "⧉" | Copia el link; toast "Link copiado"; si no hay invitación vigente → "Sin invitación activa" | ⬜ |
| CG10 | Rol secundario | Nuevo cargo, "+ Agregar rol secundario", rol2 ≠ cargo, Asignar | Se crean DOS filas (misma persona/tipo/perfil): rol principal y secundario | ⬜ |
| CG11 ⭐ | Derivar RECI a Info Proyecto | Asignar persona a "Productor/a Ejecutivo/a", "Director/a" o "Jefe/a de Producción" | Los campos PE/Director/JP de Info Proyecto se actualizan (fuente única = Cargos) | ⬜ |
| CG12 ⭐ | Re-render de Info Proyecto en vivo | Estar en Info Proyecto, en otra pestaña asignar PE, volver | Info Proyecto muestra el nuevo PE sin recargar | ⬜ |
| CG13 ⭐ | Persistencia (round-trip) | Asignar varios cargos, recargar la app, reabrir el proyecto → Cargos | Reaparecen con cargo/persona/tipo/perfil/estado intactos | ⬜ |
| CG14 | "Agregar a la BD" / ocultar "Cambiar" | Cargo con persona que NO está en la BD con correo | Estado muestra "Agregar a la BD"; no aparece "Cambiar" (solo "Quitar") | ⬜ |
| CG15 | Quitar cargo | Click "Quitar" → confirmar | Desaparece la fila; se guarda y se re-deriva RECI | ⬜ |
| CG16 | Tope de colaboradores | Con la org en su tope, "+ Asignar un cargo" | Modal de venta "Tope de colaboradores"; contador N/Max en rojo | ⬜ |
| CG17 | Permiso de asignar | Entrar con perfil ≠ Administrador/Ejecutivo | No aparece "+ Asignar un cargo"; texto explicativo | ⬜ |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó (no re-probar) · ❌ falló (bug abierto) · 🔁 cambió a propósito.

## Notas
- **0 bugs.** Migración limpia: mapeo 1:1 de las 14 acciones (`abrir`, `editar`,
  `quitar`, `copiarInv`, `agregarBD`, `tipo`, `sel`, `rol2`, `persona`, `perfil`,
  `guardar`, `invitar`…) con handler registrado; `dalCargarCargos`/`dalGuardarCargos`
  idénticos al monolito (mismas columnas, mismo RPC, round-trip completo);
  `_cargoContactIdPorNombre`, `_cargosDerivarRECI` y los perfiles por tipo
  idénticos; ganchos definidos y consumidos.
- El combobox se adaptó a un `change` que burbujea (para que lo tome el listener
  delegado) — verificado, correcto.
- **No-regresiones** (main igual): el caché de internos no se invalida al cambiar
  de org; `_cargoContactIdPorNombre` exige nombre exacto (case/acento) — heredado.
- **Diferencia intencional** (no bug): el catálogo de cargos quitó "Productor/a"
  (decisión de producto, commit previo).
