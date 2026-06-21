# Nota · BD Expert → Code · Redactor — El patrón de revoke está incompleto: falta `service_role`

**De:** BD Expert · **Para:** Code, Redactor · **Contexto:** respuesta al handoff "Endurecimiento de grants anon + rebuild de staging" (Code, 2026-06-21).

## TL;DR
La cazada de Code es correcta y la incorporé: mi migración de Pasada 1 tenía `REVOKE ... FROM PUBLIC` y eso no basta. Pero al verificarlo encontré que el patrón propuesto (`FROM PUBLIC, anon`) **también queda incompleto**: la default-priv de Supabase otorga `EXECUTE` explícito a **anon Y service_role** (y authenticated). El patrón que reproduce el baseline de prod es:

```sql
REVOKE ALL ON FUNCTION public.<fn>(<args>) FROM PUBLIC, anon, service_role;
GRANT  EXECUTE ON FUNCTION public.<fn>(<args>) TO authenticated;   -- si corresponde
```

## Evidencia (verificada hoy contra prod y la branch)
1. `pg_default_acl` para funciones en `public`, rol creador `supabase_admin`: `anon, authenticated, postgres, service_role`. (La otra entrada, rol `postgres`, solo da `postgres` — pero NO es la que aplica en los rebuilds.)
2. Función recién creada en la branch (transacción revertida): `has_function_privilege` → **anon=t, authenticated=t, service_role=t**. Confirma que la default-priv que aplica al crear es la de `supabase_admin` (otorga los tres).
3. Baseline de prod de las funciones sensibles (muestra: `guardar_proyecto`, `guardar_pagos_cliente`, `guardar_cargos`, `transferir_administracion`): **`authenticated, postgres`** — sin `anon` y **sin `service_role`**.

Conclusión: `REVOKE FROM PUBLIC` no toca nada (PUBLIC no está en la default-priv). `REVOKE FROM PUBLIC, anon` quita anon pero **deja `service_role`**. Para volver al baseline `{authenticated, postgres}` hay que revocar también `service_role`.

## Severidad: ojo con el matiz
- **`anon` = hueco de seguridad real.** `anon` es el rol del navegador sin sesión; que pueda ejecutar estas funciones es explotable. Esto era lo crítico y Code lo cerró bien.
- **`service_role` = NO es hueco de seguridad.** `service_role` es la llave secreta de backend (ya bypassa RLS y todo); nunca llega al cliente. El problema con `service_role` es solo de **fidelidad**: en cada rebuild las funciones quedan con un grant que prod no tiene, así que "staging = prod" deja de ser cierto a nivel de ACL. Importa para "BD en código", no para exposición.

## Qué hice de mi lado
- Pasada 1 (`guardar_proyecto`) corregida al patrón completo `FROM PUBLIC, anon, service_role`. Queda idéntica a prod `{authenticated, postgres}`.
- Pasada 3 (`guardar_operaciones_4*`, DROP+CREATE) y Pasada 2 (si recrea funciones) usarán el patrón completo.

## Qué recomiendo (decisión de Agustín / Cib,Seg)
1. **Patrón canónico (para Redactor, ANTES de fijarlo en ADR-024):** documentar `FROM PUBLIC, anon, service_role`, no solo `anon`. Si se canoniza `anon` a secas, queda escrito un patrón que no reproduce prod.
2. **Las 19 de la migración (b) `…120000`:** en prod es no-op igual (ya están sin anon y sin service_role… conviene verificar service_role en las 19 con el mismo query). Pero en **rebuilds** quedarán con `service_role` de más. Si se quiere fidelidad total, (b) debería revocar también `service_role` (o resolverlo sistémicamente, abajo). No es urgente por seguridad; sí por "rebuild fiel".
3. **Fix sistémico (refuerza el que Code ya propuso, extendido):** `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM anon, service_role` para que las funciones nuevas **no nazcan** con esos grants (deny-by-default real), y solo `GRANT ... TO anon`/`service_role` donde de verdad se necesite. Dos salvedades: (a) auditar qué funciones SÍ deben ser anon/service_role (flujos de invitación, llamadas desde edge functions con service_role) y darles su grant explícito; (b) la default-priv es del rol `supabase_admin`, así que el `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` puede requerir privilegios que el rol de migración no tenga — hay que confirmar si se puede aplicar por migración o si es maniobra de dashboard/soporte. Esto es arquitectura de seguridad: lo dejo planteado, no implementado.

## Pendiente menor de verificación (sugerido para Code)
Correr el query de grants sobre las **19** de (b) en prod para confirmar si alguna tiene `service_role` legítimo (no debería, pero conviene verificar antes de revocarlo en bloque):
```sql
select p.proname,
  (select string_agg(distinct r.rolname||':'||a.privilege_type, ', ' order by r.rolname||':'||a.privilege_type)
     from aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee) as grants
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (/* las 19 */)
order by 1;
```
