# supabase/queries

Queries SQL **reutilizables** del proyecto. Esta carpeta es independiente de
`supabase/migrations/` y **el Supabase CLI no la toca**: nada de acá se aplica con
`db push` ni `db reset`. Se corren **a mano**.

## ¿Por qué está separada de `migrations/`?

| `migrations/`                          | `queries/`                          |
|----------------------------------------|-------------------------------------|
| Historial del esquema de la BD         | Consultas que se ejecutan a mano    |
| Inmutables y secuenciales (timestamp)  | Editables y reutilizables           |
| Las aplica el CLI, en orden            | El CLI las ignora                   |

## Estructura

- `reportes/` — informes y métricas de negocio.
- `analisis/` — exploración y análisis (ej. `monitor_reversiones.sql`: solo-lectura, se corre a mano contra producción).
- `mantenimiento/` — limpieza, backfills, verificaciones, tareas operativas.
- `Seeds/` — fixtures de datos **por entorno**, manuales (ej. `seed_staging.sql`, que vive en el **repo de staging**).

## ⚠️ No confundir los tres "datos iniciales"

| Archivo | Qué es | Quién lo aplica |
|---------|--------|-----------------|
| `supabase/catalogos_globales/seed.sql` | Catálogos **globales** de referencia (bancos, `tax_rates`, planes, tipos DTE, consentimientos, `app_config`) | **El CLI**, automático (`db reset` / creación de branch) |
| `supabase/queries/Seeds/seed_staging.sql` *(repo de staging)* | Fixture de datos de **negocio de Staging** (mundos GoT/LOTR + membresías de los dueños) | **A mano**, en el SQL Editor de la branch de Staging |
| `supabase/migrations/*_seed_permisos_autocontenido.sql` | Backbone canónico (catálogos `default_*` de permisos) que debe existir en todo entorno | **El CLI**, como migración |

El seed de Staging trae **barrera anti-producción** (aborta si detecta la organización real) y **jamás** debe aplicarse a producción ni por el CLI.

## Convención de nombres

Nombres descriptivos en `snake_case`, sin timestamp. Encabeza cada archivo con un
comentario que explique qué hace y cómo usarlo.
