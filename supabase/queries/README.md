# supabase/queries

Queries SQL **reutilizables** del proyecto. Esta carpeta es independiente de
`supabase/migrations/` y **el Supabase CLI no la toca**: no se aplican con
`supabase db push` ni con `supabase db reset`.

## ¿Por qué está separada de `migrations/`?

| `migrations/`                          | `queries/`                          |
|----------------------------------------|-------------------------------------|
| Historial del esquema de la BD         | Consultas que se ejecutan a mano    |
| Inmutables y secuenciales (timestamp)  | Editables y reutilizables           |
| Las aplica el CLI, en orden            | El CLI las ignora                   |

## Estructura

- `reportes/` — consultas para informes y métricas de negocio.
- `analisis/` — consultas ad-hoc de exploración y análisis de datos.
- `mantenimiento/` — limpieza, backfills, verificaciones y tareas operativas.

## Convención de nombres

Usa nombres descriptivos en `snake_case`, sin timestamp:

```
reportes/colaboradores_por_proyecto.sql
mantenimiento/verificar_permisos_huerfanos.sql
```

Encabeza cada archivo con un comentario que explique qué hace y cómo usarlo:

```sql
-- Colaboradores activos agrupados por proyecto.
-- Uso: ejecutar en el SQL Editor o con `supabase db query`.
```
