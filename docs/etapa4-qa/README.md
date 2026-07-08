# Registro QA — Etapa 4 (modularización)

Fuente de verdad de **qué se ha probado** de la app modularizada (`frontend/src/`)
contra el comportamiento del monolito de `main`. Lo maneja la skill
`depurar-modularizacion-etapa4`. Existe para **no repetir pruebas ya aprobadas**
entre sesiones.

## Archivos

- **`_INDICE.md`** — tablero: cada módulo con su cobertura (pendiente / probando /
  ✅) y enlace a su catálogo. Lo primero que se mira.
- **`_VUELTA-EN-CURSO.md`** — marcador de la vuelta de fix abierta (branch,
  módulo, paso). "Ninguna" cuando no hay nada a medias. Ancla de la regla
  "nunca dejar una vuelta a medias".
- **`_PLANTILLA-modulo.md`** — molde para el catálogo de cada módulo.
- **`<modulo>.md`** — catálogo de pruebas de un módulo (se crea en Modo QA).

## Estados de una prueba

| Estado | Significado |
|--------|-------------|
| ⬜ pendiente | Falta probar. |
| 🔄 probando | En la vuelta actual. |
| ✅ pasó | Aprobada por Agustín. **No re-probar.** |
| ❌ falló | Hay un bug abierto. |
| 🔁 cambió a propósito | El comportamiento difiere de `main` por decisión, no es bug (anotar el porqué). |

## Ciclo de vida

Todo esto se **commitea a `etapa4-integracion`** y viaja con la rama. Cuando la
Etapa 4 cierre (merge final a `main`), esta carpeta se **borra** — es andamiaje
efímero de la etapa, no documentación permanente.
