# supabase/catalogos_globales

Contiene **`seed.sql`**: el *seed global* de TakeOS — los **catálogos de referencia**
que deben existir en **todo entorno**: `bank_institutions`, `tax_rates`,
`plan_catalog`, `plan_features`, `dte_types`, `consent_terms` y `app_config`.

## Quién lo aplica
**El Supabase CLI, automáticamente**, durante `supabase db reset` y la creación de
una branch. La ruta está declarada en `config.toml` → `[db.seed] sql_paths`
(`./catalogos_globales/seed.sql`). Por eso vive en una carpeta dedicada y no suelto
en `supabase/`: para que se entienda qué es y no se confunda con el seed de restauración.

## ⚠️ No confundir con el seed de Staging
- **Este** (`catalogos_globales/seed.sql`) = catálogos globales · lo aplica el **CLI** · va en todo entorno.
- **`queries/Seeds/seed_staging.sql`** (vive en el repo de **staging**) = fixture de datos de negocio de Staging · se corre **a mano** · con barrera anti-producción · **jamás** por el CLI ni hacia producción.
