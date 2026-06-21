# Handoff · Code → BD Expert — Drift de la branch `staging` + falta un Tier B

**De:** Code (Claude Code, sesión con Agustín)
**Para:** BD Expert
**Fecha:** 2026-06-21
**Documentos leídos (con versión):** PRD V3.6 · ADR de Backend v1.9 · Roadmap v1.8 · Arquitectura v1.5 · OWASP v1.3
**Contexto:** Agustín quiso aplicar a la branch `staging` la migración que le faltaba y "entrenar el flujo". Al inspeccionar (solo lectura) apareció un **drift** real. Esto resume lo encontrado y lo que hace falta para dejar staging confiable.

---

## 1. Lo que hice (y su resultado)

- Sincronicé en el **repo** `takeos-staging` la migración `20260617160000_fix_cupo_colaboradores_por_proyecto.sql` que le faltaba (ahora ambos repos tienen las 7).
- Ejecuté un **`rebase` de la branch `staging`** sobre producción (vía MCP). **Veredicto: el rebase NO dejó staging como espejo fiel de producción.** El `rebase` *apila* las migraciones del padre sobre el estado de la branch; como la branch venía torcida, quedó torcida.

## 2. El drift, en datos

**Historial de migraciones** (branch `staging` = `jovroabtwysliryppthh`):
- Le faltaba `20260617144834_endurecimiento_anon_y_search_path` (el `rebase` lo agregó).
- Tiene el cupo como **`20260617161042`** (timestamp propio) **además** del `20260617160000` de producción → hay un **orphan** `161042` que prod no tiene. Mismo nombre, posible cuerpo distinto.

**Permisos de ejecución (lo grave):** **19 funciones quedan ejecutables por `anon` en staging pero están revocadas en producción.** Producción: 23 funciones anon-ejecutables; staging: 42. Las 19 de más:

```
asignar_cargo_a_miembro, cancelar_eliminacion_cuenta, exportar_herramienta,
exportar_mis_datos, guardar_cargos, guardar_consentimiento_cookies,
guardar_pagos_cliente, invitaciones_de_organizacion, marcar_notificaciones_leidas,
mis_organizaciones_como_unico_admin, personas_de_mis_proyectos,
procesar_eliminaciones_vencidas, resolver_rebind, revocar_consentimiento,
rpc_assert_cupo_colaborador, rpc_assert_cupo_proyecto, rpc_assert_plan,
solicitar_eliminacion_cuenta, transferir_administracion
```

*(Defensa en profundidad: cada una valida `auth.uid()` por dentro, así que no es un hueco directamente explotable; pero significa que **staging ≠ producción** y no sirve para validar la postura de seguridad / aislamiento del Gate B/C.)*

## 3. La causa (y por qué un reset SÍ arregla)

- El esquema base (`20260616150834_remote_schema.sql`) **sí contiene** los `REVOKE ALL … FROM PUBLIC` de esas 19 funciones (líneas ~6511+). O sea, **producción es reproducible desde sus migraciones**: el estado bloqueado está en el código.
- El drift de staging viene de la **aplicación fuera de orden**: el cupo `161042` se aplicó antes, recreó funciones (p. ej. `guardar_cargos`, `rpc_assert_cupo_*`) y se comió los `REVOKE`; el `rebase` apiló encima sin reordenar.
- **Conclusión:** un **`reset` de la branch** (reconstruir desde las 7 migraciones, en orden) **reproduce producción fielmente** (grants y cuerpos), y de paso elimina el orphan `161042`. `rebase` no; `reset` sí.

## 4. El bloqueante real: no hay Tier B

Un `reset` **borra el backbone** de la branch, y **no existe un Tier B** en el repo (busqué en ambos repos y en la home: no está; el `seed_staging.sql` es **Tier A** y *aborta* si no encuentra las 3 orgs — su línea 114). El backbone hoy en la branch:

| Pieza | Estado actual en `staging` |
|---|---|
| **Orgs (3)** | Gondor Studios (`free`), Highgarden Producciones (`rodaje`), Rivendell Films (`produccion`) |
| **Usuarios auth (3)** | `agustinmr21@gmail.com`, `jidelacuadra@gmail.com`, `denethor@gondor.test` |
| **Memberships** | 3 (los dueños) |
| **Fixture (Tier A)** | 19 proyectos · 300 contactos · + sub-datos |

Lo **no reproducible** sin Tier B son sobre todo los **3 usuarios de `auth.users`** (no hay artefacto en código; recordar identity-linking por email, ADR-003). Las **orgs** sí se pueden recrear con `provisionar_organizacion` (autocontenida, ADR-022) y el fixture con el Tier A.

## 5. Pedido al BD Expert

1. **Crear un Tier B** = seed reproducible del **backbone** (las 3 orgs con su plan, los 3 usuarios de auth con su estrategia de creación, y las 3 memberships de dueño). Idealmente con la misma disciplina del Tier A (idempotente + barrera anti-producción). Vivir en `supabase/queries/Seeds/` del repo **takeos-staging** (donde ya quedó `seed_staging.sql`).
2. Con Tier B listo, la receta de realineamiento limpio es: **`reset` de la branch** (migraciones reconstruyen esquema + grants fieles a prod, sin orphan) → correr **Tier B** (backbone) → correr **Tier A** (`seed_staging.sql`, el fixture). Resultado: staging == producción + datos de prueba.
3. Mientras tanto: **staging NO es espejo de seguridad de producción** (19 funciones divergentes). No usarlo para validar aislamiento/permisos hasta el reset.

> *Code no edita los canónicos ni toca producción. No apliqué band-aids a la BD de staging a propósito: sumar cambios fuera-de-migración es lo que causó el drift. El arbitraje, si hace falta, es de Agustín.*
