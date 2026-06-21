# Handoff · Code → Code (lo maneja Agustín) — Rebuild limpio de la branch `staging`

**De:** Code (sesión con Agustín, 2026-06-21)
**Para:** otro Code que operará Agustín (Juan no está unos días)
**Motivo:** la branch de Supabase `staging` quedó driftada y vacía; hay que reconstruirla **fiel a producción** desde las migraciones canónicas y repoblarla.
**Lee primero:** CLAUDE.md · ADR-023 (flujo BD en código) · Arquitectura §2.2/§5.

---

## ⛔ Reglas de seguridad (innegociables — léelas antes de tocar nada)

- **Producción = `zplcgetquwxybkrpmcvl`** (proyecto "TakeOS", base REAL). **NUNCA** se resetea, se vacía, ni se le aplica nada destructivo fuera del flujo normal (merge a `main`). Si una operación destructiva pudiera apuntar ahí, **no se corre.**
- **Staging = branch `staging`**, **ref `jovroabtwysliryppthh`**, id de branch `d1bf448c-639d-4bff-8975-6ecc8bbdeb8e`. Es la ÚNICA base que se reconstruye/vacía aquí.
- **Antes de cualquier comando destructivo (CLI), verificar el target explícitamente** (que el ref sea `jovroabtwysliryppthh`, no `zplcgetquwxybkrpmcvl`). En el CLI, `--linked` apunta a la base linkeada: confirmar a cuál antes de correr.
- El **conector MCP de Supabase es solo lectura/inspección** (ADR-023). Sirve para verificar (las consultas de abajo), no para forzar el esquema.

---

## 1. Qué pasó (estado actual)

Entrenando el flujo de migraciones, la branch `staging` resultó **driftada** respecto a producción:
- Tenía un **orphan** de migración `20260617161042` (`fix_cupo_colaboradores_por_proyecto` con timestamp propio) que **no existe en el repo**; el canónico es `20260617160000`.
- Por aplicación **fuera de orden**, quedaron **19 funciones sensibles ejecutables por `anon`** que en producción están revocadas (p. ej. `guardar_cargos`, `asignar_cargo_a_miembro`, `transferir_administracion`, `rpc_assert_cupo_*`, `exportar_mis_datos`, `solicitar_eliminacion_cuenta`…). Medición: **producción 23 funciones anon-ejecutables, staging 42.**

Se intentó arreglar por MCP y **no alcanzó**:
- `rebase_branch` → *apila* las migraciones del padre encima; el drift sobrevive.
- `reset_branch` → **borró los datos pero re-corrió el historial YA REGISTRADO de la branch** (las 8, con orphan); **no** trajo las 7 canónicas del repo ni corrió el seed.
- **Causa raíz:** la branch `staging` **no está ligada a Git** (no tiene `git_branch` en sus metadatos, a diferencia de `main`). Por eso el reset por MCP no la reconstruye desde el código. Eso lo hace el **CLI / la integración de Branching**, no el MCP.

**Estado ahora:** staging está **vacía** (0 orgs / 0 contactos / 0 auth / 0 `tax_rates`) y con los grants aún divergentes (42) + el orphan presente.

## 2. Objetivo

Dejar la branch `staging` **fiel a producción**: esquema + grants reconstruidos desde las **7 migraciones canónicas** (sin el orphan, con los REVOKE → anon vuelve a 23), y repoblada con datos de prueba.

## 3. Cómo hacerlo (rebuild limpio)

El nudo es que la branch no se reconstruye desde Git por MCP. Caminos (elegir con criterio, confirmando contra el estado real del dashboard de Supabase):

- **Opción recomendada — dejar la branch ligada a Git y reconstruir.** Si la integración GitHub→Supabase está según ADR-023 (deploy on merge / preview branches / required check **ON**), una branch ligada a `main` se reconstruye desde las 7 migraciones. Si la `staging` actual no se puede ligar, **recrearla ligada a Git** (delete + create branch). *(Ojo: recrear cambia el ref/URL → hay que actualizar las credenciales de staging del frontend: `frontend/.env.staging` y/o las dos líneas `SUPABASE_URL`/`SUPABASE_KEY` del `index.html` de `takeos-staging`. `create_branch` tiene costo → confirmar.)*
- **Opción CLI — `supabase db` contra la branch.** Linkear el CLI **a la branch `jovroabtwysliryppthh`** (NUNCA a producción) y reconstruir desde las migraciones del repo. Antes de cualquier comando destructivo, **verificar el ref linkeado**. No la corras si no estás 100% seguro del target.

Sea cual sea: al terminar, la branch debe tener **7 migraciones (sin `…161042`)** y **anon-ejecutables = 23**.

## 4. Repoblar (receta — orden OBLIGATORIO)

Una vez la branch tenga el esquema canónico:

1. **Catálogos globales** — si el rebuild no corrió el seed, aplicar `supabase/catalogos_globales/seed.sql` (bancos, `tax_rates`, planes, `dte_types`, etc.). Verificar `tax_rates = 12`.
2. **Tier B (backbone)** — `takeos-staging:supabase/queries/Seeds/seed_staging_tierB.sql`. Crea 3 usuarios auth + 3 orgs (vía `provisionar_organizacion`) + memberships de dueño. **Password de staging: `12345678`** (la variable `v_pwd`; *ojo: el comentario del encabezado quedó con la clave vieja, pero lo que corre es `v_pwd = '12345678'`*).
3. **Tier A (fixture)** — `takeos-staging:supabase/queries/Seeds/seed_staging.sql`. Datos de negocio (proyectos, contactos, etc.). **Aborta si no existen las 3 orgs** → por eso Tier B va antes.

Ambos seeds son idempotentes y traen barrera anti-producción (abortan si detectan la org real de Primate).

## 5. Verificación (confirmar que el drift se fue)

```sql
-- (a) Grants: debe dar 23 (no 42). Si da 23, el esquema quedó fiel a prod.
SELECT count(*) AS anon_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE');

-- (b) Datos tras la receta: tax_rates=12, orgs=3, contacts≈300, auth_users=3
SELECT
  (SELECT count(*) FROM public.tax_rates)     AS tax_rates,
  (SELECT count(*) FROM public.organizations) AS orgs,
  (SELECT count(*) FROM public.contacts)      AS contacts,
  (SELECT count(*) FROM auth.users)           AS auth_users;
```

Además, confirmar que `list_migrations` de la branch da **7** y NO aparece `20260617161042`.

## 6. Aprendizaje para el flujo (consolidar luego)

`rebase` apila · `reset_branch` (MCP) re-corre el historial registrado de la branch · **ninguno reconstruye desde el Git canónico si la branch no está ligada a Git.** El rebuild fiel es CLI/Branching. Vale la pena: (1) dejar la branch `staging` **ligada a Git** para que esto no se repita, y (2) que el BD Expert sepa que su receta ("reset reconstruye fiel") **asume CLI**, no el `reset_branch` del MCP.

---

*Handoff Code → Code. Producción intacta (solo se inspeccionó en lectura). El arbitraje, si hace falta, es de Agustín.*
